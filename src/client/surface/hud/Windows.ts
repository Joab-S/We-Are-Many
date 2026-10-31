import { Boundary, BOUNDARY_NAMES } from '../../../procgen/surface';
import { BOUNDARY_COLORS, GEO_VIEWS, type GeoView } from '../../../procgen/debugViews';
import { Ecosystem, ERAS, type ChronicleKind } from '../../../sim/ecosystem';
import { VOCATION_COLORS, VOCATION_ICONS, VOCATION_NAMES } from '../../../sim/needs';
import { STOCK_NAMES, WONDER_NAMES } from '../../../sim/economy';
import { QUIET_YEARS } from '../../../sim/events';
import { CATEGORIES, ITEMS, MATERIALS } from '../../../sim/items';
import { EARTH_ID, type Species } from '../../../sim/species';
import { ecologyOf, guildName } from '../../../sim/fauna';
import { CURRENCY_NAMES } from '../../../sim/trade';
import { compareHtml, type CompareKey } from '../settlementWindow';
import { bodyOf, KIND_ICONS, plain, spriteOf, WINDOWS, type Win } from '../tools';
import { keyLabel } from '../keys';
import { SPEEDS } from '../SimDriver';
import { HtmlSlot, HudComponent } from './component';
import type { IconCache } from './icons';

/** Opções de exibição da superfície (janela Mundo e atalhos). */
export interface SurfaceSettings {
  showMinor: boolean;
  showLabels: boolean;
  showTerritory: boolean;
  /** Camada das áreas coloridas: reinos, vocação ou economia (RF-VIDA-287). */
  layer: 'kingdoms' | 'vocation' | 'economy';
  /** Visão de depuração do gerador no lugar do mapa normal. */
  geoView: GeoView;
}

/**
 * Janelas de leitura (crônica, reinos, assentamentos, espécies, itens e
 * mundo): uma aberta por vez, refeita a cada 600 ms.
 */
export class Windows extends HudComponent {
  win: Win | null = null;
  filter = '';
  /** Ordem da tabela de assentamentos (RF-VIDA-349a). */
  compareKey: CompareKey = 'population';
  compareDesc = true;
  private readonly body: HtmlSlot;

  constructor(
    private readonly root: HTMLElement,
    private readonly icons: IconCache,
    private readonly settings: SurfaceSettings,
    private readonly known: Map<string, Species>,
    private readonly planetId: string,
  ) {
    super(600);
    this.body = new HtmlSlot(root.querySelector<HTMLElement>('[data-win-body]')!);
  }

  /** Abre a janela (ou fecha, se já é ela ou com null). */
  toggle(eco: Ecosystem, win: Win | null): void {
    this.win = this.win === win ? null : win;
    this.filter = '';
    this.body.reset();
    this.root.querySelector<HTMLElement>('[data-win]')!.hidden = !this.win;
    this.root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.classList.toggle('on', b.dataset.w === this.win));
    this.tick(eco, performance.now(), true);
  }

  /** Refaz já (troca de filtro, ordem ou opção). */
  refresh(eco: Ecosystem): void {
    this.body.reset();
    this.tick(eco, performance.now(), true);
  }

  setFilter(eco: Ecosystem, filter: string): void {
    this.filter = filter;
    this.refresh(eco);
  }

  sortBy(eco: Ecosystem, key: CompareKey): void {
    this.compareDesc = key === this.compareKey ? !this.compareDesc : key !== 'name' && key !== 'vocation';
    this.compareKey = key;
    this.refresh(eco);
  }

  protected update(eco: Ecosystem): void {
    if (!this.win) return;
    const title = WINDOWS.find(([id]) => id === this.win)![1];
    const body =
      this.win === 'chronicle'
        ? this.chronicleHtml(eco)
        : this.win === 'kingdoms'
          ? this.kingdomsHtml(eco)
          : this.win === 'settlements'
            ? compareHtml(eco, this.compareKey, this.compareDesc)
            : this.win === 'species'
              ? this.speciesHtml(eco)
              : this.win === 'items'
                ? this.itemsHtml(eco)
                : this.worldHtml(eco);
    if (this.body.set(body)) this.root.querySelector<HTMLElement>('[data-win-title]')!.textContent = plain(title);
  }

  private filters(list: [string, string][]): string {
    return `<div class="wb-filters">${list.map(([id, label]) => `<button data-filter="${id}" class="${this.filter === id ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  private chronicleHtml(eco: Ecosystem): string {
    const f = this.filter;
    const kinds: Record<string, ChronicleKind[]> = { povos: ['povo', 'era'], guerra: ['guerra'], natureza: ['natureza'], mar: ['mar'], economia: ['economia'], voce: ['jogador'] };
    const list = eco.chronicle.filter((e) => (f === '' ? true : f === 'major' ? e.major : kinds[f]?.includes(e.kind)));
    const rows = list
      .slice(0, 150)
      .map((e) => {
        const where = e.x >= 0 ? ` data-go="${e.x.toFixed(1)},${e.y.toFixed(1)}"` : '';
        return `<button class="wb-row ${e.major ? 'major' : ''}"${where}><i>${KIND_ICONS[e.kind]}</i><span class="wb-yr">${Math.floor(e.year)}</span>${Ecosystem.describe(e)}${e.x >= 0 ? '<em>📍</em>' : ''}</button>`;
      })
      .join('');
    return `
      ${this.filters([
        ['', 'Tudo'],
        ['major', 'Importantes'],
        ['povos', 'Povos'],
        ['guerra', 'Guerras'],
        ['natureza', 'Natureza'],
        ['mar', 'Mar'],
        ['economia', 'Economia'],
        ['voce', 'Você'],
      ])}
      <div class="wb-list">${rows || '<div class="wb-empty">Nada registrado ainda.</div>'}</div>
      <div class="wb-note">Clique numa linha com 📍 para ir ao lugar. A crônica guarda os ${eco.chronicle.length} acontecimentos mais recentes.</div>`;
  }

  private kingdomsHtml(eco: Ecosystem): string {
    const capitals = eco.villages.filter((v) => !v.abandoned && v.kingdom === v.id);
    if (!capitals.length) return '<div class="wb-empty">Nenhum povo neste planeta ainda. Leve um pela aba Civilização.</div>';
    const cards = capitals
      .map((k) => {
        const members = eco.villages.filter((v) => !v.abandoned && v.kingdom === k.id);
        const pop = members.reduce((n, v) => n + v.population, 0);
        // Cada assentamento tem o próprio estoque; aqui aparece a soma do reino.
        const st = eco.kingdomStock(k.id);
        const stock = STOCK_NAMES.filter(([key]) => st[key] >= 1)
          .map(([key, name]) => `${name} ${Math.floor(st[key])}`)
          .join(' · ');
        const c = k.culture;
        const rels = capitals
          .filter((o) => o !== k && eco.relations.has(`${Math.min(o.id, k.id)}:${Math.max(o.id, k.id)}`))
          .map((o) => {
            const r = eco.relation(o.id, k.id);
            const at = eco.warOf(k.id) && eco.wars.some((w) => (w.a === k.id && w.b === o.id) || (w.b === k.id && w.a === o.id));
            const [mark, cls] = at ? ['⚔ guerra', 'bad'] : eco.allied(o.id, k.id) ? ['❤ aliado', 'good'] : r < -35 ? ['hostil', 'bad'] : r < 0 ? ['tensão', 'warn'] : r > 40 ? ['amigo', 'good'] : ['paz', ''];
            return `<span class="wb-rel ${cls}"><i style="background:rgb(${o.color.join(',')})"></i>${o.name}: ${mark}</span>`;
          })
          .join('');
        const wonder = k.houses.some((h) => h.kind === 'wonder') ? ` · 🏛 ${WONDER_NAMES[c.value]}` : '';
        // Acordos comerciais com os assentamentos do reino (RF-VIDA-232) e a moeda (RF-VIDA-291).
        const ids = new Set(members.map((v) => v.id));
        const deals = eco.agreements
          .filter((g) => ids.has(g.a) || ids.has(g.b))
          .map((g) => `${eco.villages[g.a].name} ↔ ${eco.villages[g.b].name}: ${eco.goodName(g.goods[0])} por ${eco.goodName(g.goods[1])}`)
          .join(' · ');
        const tolls = [...eco.tolls.values()].filter((o) => ids.has(o)).length;
        return `
          <div class="wb-card">
            <button class="wb-card-head" data-village="${k.id}">${this.icons.crest(k)}<b>${members.length > 1 ? eco.polityName(k) : k.name}</b><em>📍</em></button>
            <div>Povo ${c.name} · ${eco.species[k.species].name} · valoriza ${c.value} · crê em ${c.belief}${wonder}</div>
            <div>${members.length} assentamento${members.length > 1 ? 's' : ''} · ${pop} habitantes · ${ERAS[Math.floor(Math.max(...members.map((v) => v.tech)))]}</div>
            ${stock ? `<div class="wb-dim">${stock}</div>` : ''}
            <div class="wb-dim">Moeda: ${CURRENCY_NAMES[eco.currencyName(k)]}${tolls ? ` · ${tolls} posto${tolls > 1 ? 's' : ''} de pedágio` : ''}</div>
            ${deals ? `<div class="wb-dim">🤝 Acordos: ${deals}</div>` : ''}
            ${rels ? `<div class="wb-rels">${rels}</div>` : ''}
          </div>`;
      })
      .join('');
    return `<div class="wb-grid">${cards}</div>`;
  }

  private speciesHtml(eco: Ecosystem): string {
    const f = this.filter;
    const known = [...this.known.values()].filter((sp) =>
      f === '' ? true : f === 'here' ? eco.species.some((o, s) => o.id === sp.id && eco.population[s] > 0) : f === 'sapient' ? sp.kind === 'sapient' : sp.kind !== 'sapient',
    );
    const kindName = (sp: Species) => (sp.kind === 'sapient' ? 'Inteligente' : guildName(ecologyOf(sp))) + (sp.amphibious ? ' · anfíbio' : '');
    const cards = known
      .map((sp) => {
        const s = eco.species.findIndex((o) => o.id === sp.id);
        const pop = s >= 0 ? eco.population[s] : 0;
        const status = s < 0 ? 'Não vive aqui' : eco.extinct.has(s) ? '<span class="bad">Extinta aqui</span>' : `${pop} aqui`;
        const origin = sp.parent ? `variante de ${this.known.get(sp.parent)?.name ?? '?'}` : sp.origin === EARTH_ID ? 'Terra' : sp.origin === this.planetId ? 'nativa' : sp.origin;
        const img = sp.kind === 'sapient' ? this.icons.icon(`${bodyOf(sp)}:gatherer`, [200, 160, 90], sp.color) : this.icons.icon(spriteOf(sp), sp.color);
        return `
          <div class="wb-sp">
            <div class="wb-sp-img">${img}</div>
            <div><b>${sp.name}</b><div class="wb-dim">${kindName(sp)} · ${origin}</div><div class="wb-dim">${(sp.tempMin - 273).toFixed(0)} a ${(sp.tempMax - 273).toFixed(0)} °C · vive ${Math.round(sp.maxAge)} anos</div><div>${status}</div></div>
            <button class="wb-mini" data-pick="spawn:${sp.id}">Soltar</button>
          </div>`;
      })
      .join('');
    return `${this.filters([
      ['', 'Todas'],
      ['here', 'Neste planeta'],
      ['animal', 'Animais'],
      ['sapient', 'Inteligentes'],
    ])}<div class="wb-grid sp">${cards}</div>
      <div class="wb-note">O banco genético da Terra viaja com você. Espécies novas que surgem por evolução entram aqui sozinhas.</div>`;
  }

  private itemsHtml(eco: Ecosystem): string {
    const sections = CATEGORIES.map((cat) => {
      const items = ITEMS.filter((it) => it.category === cat)
        .map((it) => {
          const n = eco.crafted.get(it.id) ?? 0;
          const mat = MATERIALS[it.material];
          return `<div class="wb-item ${n ? '' : 'locked'}" title="${it.name}: ${mat.name}, desde a ${ERAS[it.era]}">${this.icons.icon(`item:${it.icon}`, mat.color)}<b>${it.name}</b><span>${n ? `${n} feitos` : 'ainda não'}</span></div>`;
        })
        .join('');
      return `<div class="wb-section">${cat[0].toUpperCase() + cat.slice(1)}s</div><div class="wb-items">${items}</div>`;
    }).join('');
    return `${sections}<div class="wb-note">Os ferreiros fazem o que o minério permite: bronze (cobre + estanho), ferro e aço (ferro + carvão). Ouro vira joia. Na Idade da Pedra, pedra e madeira.</div>`;
  }

  private worldHtml(eco: Ecosystem): string {
    const s = this.settings;
    const quiet = Math.floor(eco.year - eco.lastMajor);
    const on = (b: boolean) => (b ? 'on' : '');
    return `
      <div class="wb-section">Eventos do mundo</div>
      <div class="wb-filters"><button data-opt="events" class="${on(eco.autoEvents)}">${eco.autoEvents ? 'Eventos aleatórios: ligados' : 'Eventos aleatórios: desligados'}</button></div>
      <div class="wb-filters">${(
        [
          [0.5, 'Raros'],
          [1, 'Normais'],
          [2, 'Frequentes'],
        ] as const
      )
        .map(([r, l]) => `<button data-opt="rate:${r}" class="${on(eco.eventRate === r)}">${l}</button>`)
        .join('')}</div>
      <div class="wb-note">Cometas, terremotos, vulcões, incêndios, secas, pestes, povos nômades, espécies novas e reaparecimentos acontecem de vez em quando. Se ${QUIET_YEARS} anos passam sem nada importante, um deles sacode o mundo. Agora: ${quiet} anos desde o último acontecimento importante.</div>
      <div class="wb-filters"><button data-opt="now">🎲 Provocar um evento agora</button></div>
      <div class="wb-section">Exibição</div>
      <div class="wb-filters"><button data-opt="labels" class="${on(s.showLabels)}">Nomes no mapa</button><button data-opt="territory" class="${on(s.showTerritory)}">Territórios coloridos (T)</button><button data-opt="minor" class="${on(s.showMinor)}">Acontecimentos menores no painel</button></div>
      <div class="wb-section">Camada do mapa</div>
      <div class="wb-filters">${[
        ['kingdoms', 'Reinos'],
        ['vocation', 'Vocação'],
        ['economy', 'Economia'],
      ]
        .map(([k, l]) => `<button data-opt="layer:${k}" class="${on(s.layer === k)}">${l}</button>`)
        .join('')}</div>
      <div class="wb-note">${
        s.layer === 'vocation'
          ? Object.entries(VOCATION_NAMES)
              .map(([k, n]) => `<span style="color:rgb(${VOCATION_COLORS[k as keyof typeof VOCATION_COLORS].join(',')})">■</span> ${VOCATION_ICONS[k as keyof typeof VOCATION_ICONS]} ${n}`)
              .join(' · ')
          : s.layer === 'economy'
            ? 'Verde: necessidades atendidas e estoque cheio · amarelo: apertado · vermelho: em crise.'
            : 'Cada reino com a sua cor; capitais com linha cheia.'
      }</div>
      <div class="wb-section">Geologia e clima (depuração do gerador)</div>
      <div class="wb-filters">${GEO_VIEWS.map(([k, l]) => `<button data-opt="geo:${k}" class="${on(s.geoView === k)}">${l}</button>`).join('')}</div>
      <div class="wb-note">${this.geoNote(eco)}</div>
      <div class="wb-section">Atalhos</div>
      <div class="wb-note">${keyLabel('pause')} pausa · 1 a ${SPEEDS.length} mudam a velocidade · ${keyLabel('chronicle')} crônica · ${keyLabel('kingdoms')} reinos · ${keyLabel('species')} espécies · ${keyLabel('items')} itens · Ctrl+Z desfaz o último traço do pincel de terreno ou clima · Esc fecha a janela ou volta à órbita.</div>`;
  }

  /** Legenda da visão de depuração aberta. */
  private geoNote(eco: Ecosystem): string {
    const swatch = (c: readonly number[]) => `<span style="color:rgb(${c.join(',')})">■</span>`;
    switch (this.settings.geoView) {
      case 'plates': {
        const plates = eco.map.plates ?? [];
        const cont = plates.filter((p) => p.continental).length;
        const kinds = [Boundary.Convergent, Boundary.Subduction, Boundary.Divergent, Boundary.Transform].map((b) => `${swatch(BOUNDARY_COLORS[b])} ${BOUNDARY_NAMES[b]}`).join(' · ');
        return plates.length
          ? `${plates.length} placas (${cont} continentais, claras; ${plates.length - cont} oceânicas, escuras). Setas: direção e velocidade. Vermelho por cima: tensão sísmica. Bordas: ${kinds}.`
          : 'Este mundo foi salvo antes das placas tectônicas: não há placas para mostrar.';
      }
      case 'elevation':
        return 'Altitude: azul escuro nas fossas, azul claro na plataforma, verde nas planícies, marrom nas serras e branco nos picos.';
      case 'temperature':
        return 'Temperatura normalizada (T) da matriz de Whittaker: azul a -20 °C, branco perto de 10 °C, vermelho a 40 °C. Latitude, altitude e frentes climáticas.';
      case 'humidity':
        return 'Umidade (H) na terra: marrom seco, verde médio, azul encharcado. Costas úmidas, interior seco e sombra de chuva atrás das cordilheiras.';
      case 'biomes':
        return 'Bioma final de cada tile em cor chapada, sem relevo, enfeites nem construções.';
      default:
        return 'Mostra cada etapa do gerador: placas → altitude → temperatura e umidade → bioma.';
    }
  }
}
