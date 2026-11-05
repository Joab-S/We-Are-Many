import { BIOME_NAMES, Boundary, BOUNDARY_NAMES, temperatureAt } from '../../../procgen/surface';
import { BUILDING_NAMES, HERD_NAMES, type Ecosystem, type Village } from '../../../sim/ecosystem';
import { NEED_NAMES, NEEDS, VOCATION_ICONS, VOCATION_NAMES, welfare } from '../../../sim/needs';
import { ORE_NAMES, STOCK_NAMES, WONDER_NAMES } from '../../../sim/economy';
import { NO_SEASONS, seasonLabel } from '../calendar';
import { economicState, stateIcons, sumLedger } from '../settlementWindow';
import { previewHtml, type CreatureSheet } from './CreatureSheet';
import { DEBUG } from '../tools';
import type { Selection } from '../selection';
import type { Viewport } from '../Viewport';
import type { SiteView } from '../siteView';
import type { WeatherView } from '../weatherView';
import { HtmlSlot, HudComponent } from './component';

/**
 * Balão do que está sob o mouse ou do lugar fixado (RF-VIDA-330 a 336): tile, assentamento ou a prévia da
 * criatura. A ficha completa da criatura e a do grupo ficam no meio da tela (CreatureSheet). Refeito a cada 150 ms.
 */
export class InfoCard extends HudComponent {
  private readonly slot: HtmlSlot;

  constructor(
    private readonly el: HTMLElement,
    private readonly view: Viewport,
    private readonly sel: Selection,
    private readonly weather: WeatherView,
    private readonly sites: SiteView,
    private readonly sheet: CreatureSheet,
  ) {
    super(150);
    this.slot = new HtmlSlot(el);
  }

  /** Refaz já, mesmo que o HTML pareça igual (troca de seleção). */
  refresh(eco: Ecosystem): void {
    this.slot.reset();
    this.tick(eco, performance.now(), true);
  }

  protected update(eco: Ecosystem): void {
    const el = this.el;
    const sel = this.sel;
    const map = eco.map;
    const pin = sel.pinned;
    // Criatura ou grupo fixados ficam na ficha do meio da tela (CreatureSheet); aqui só a prévia de outra
    // criatura sob o mouse (RF-VIDA-330), sem o botão de seguir.
    if (pin && ('creature' in pin || 'group' in pin)) {
      const hover = sel.hoverPick;
      if (hover >= 0 && !('creature' in pin && pin.uid === eco.uid[hover])) {
        el.hidden = false;
        el.classList.remove('pinned');
        this.slot.set(previewHtml(eco, hover, this.sheet));
      } else el.hidden = true;
      return;
    }
    let atX = this.view.hover.x;
    let atY = this.view.hover.y;
    if (pin && 'x' in pin) {
      atX = pin.x;
      atY = pin.y;
    }
    const i = this.view.tileIndex(atX, atY);
    if (i < 0) {
      el.hidden = true;
      return;
    }
    let html: string;
    const picked = pin ? -1 : sel.hoverPick;
    if (picked >= 0) html = previewHtml(eco, picked, this.sheet);
    else {
      const t = temperatureAt(map, i);
      const place = this.placeAt(eco, i);
      const v = eco.villageAt(atX, this.view.toRow(atY));
      html = `
          ${v ? (pin ? this.settlementInfo(eco, v) : this.settlementHover(eco, v)) : ''}
          <b>${place ?? BIOME_NAMES[map.biome[i] as keyof typeof BIOME_NAMES]}</b>
          <span>Altitude ${(map.elevation[i] * 100).toFixed(0)}</span>
          <span>Temperatura ${(t - 273.15).toFixed(0)} °C</span>
          <span>Umidade ${(map.moisture[i] * 100).toFixed(0)}%</span>
          <span>Vegetação ${(map.vegetation[i] * 100).toFixed(0)}%</span>${this.floraInfo(eco, i)}${this.weather.info(i)}${this.plateInfo(eco, i)}${this.sites.info(atX, this.view.toRow(atY))}`;
    }
    el.hidden = false;
    el.classList.toggle('pinned', !!pin);
    if (pin) html = `<div class="wb-pin">📌 Fixado · Esc ou clique no vazio solta</div>${html}`;
    this.slot.set(html);
  }

  /** Planta dominante do tile e se está dando fruto, para a ficha do lugar. */
  private floraInfo(eco: Ecosystem, i: number): string {
    const f = eco.floraAt(i);
    if (!f) return '';
    const browse = eco.browseAt(i);
    return `<span>${f.name}${f.fruiting ? ' · com frutos 🍒' : ''}${browse > 0.05 ? ` · ramagem ${(browse * 100).toFixed(0)}%` : ''}</span>`;
  }

  /** Placa, limite e tensão sísmica de um tile, para a ficha do lugar. */
  private plateInfo(eco: Ecosystem, i: number): string {
    const map = eco.map;
    if (!map.plates || !map.plate) return '';
    const k = map.plate[i];
    const p = map.plates[k];
    const b = (map.boundary?.[i] ?? Boundary.None) as Boundary;
    const stress = Math.round(((map.stress?.[i] ?? 0) / 255) * 100);
    return `<span>Placa ${k + 1} (${p.continental ? 'continental' : 'oceânica'}) · ${BOUNDARY_NAMES[b]}${stress ? ` · tensão ${stress}%` : ''}</span>`;
  }

  /** Nome da construção, rua ou plantação no tile, se houver. */
  private placeAt(eco: Ecosystem, i: number): string | null {
    const w = eco.map.width;
    const dep = eco.depositAt[i];
    if (dep >= 0 && eco.deposits[dep].amount > 0) {
      const d = eco.deposits[dep];
      const what = d.mine >= 0 ? `Mina de ${ORE_NAMES[d.ore]} · ${eco.villages[d.mine].name}` : `${d.cave ? 'Caverna com' : 'Veio de'} ${ORE_NAMES[d.ore]}`;
      return `${what} · restam ${Math.ceil(d.amount)} de ${d.initial}`;
    }
    const road = eco.road[i];
    if (road === 4) return 'Plantação';
    if (road === 5) {
      const v = eco.settlementAt((i % w) + 0.5, Math.floor(i / w) + 0.5) ?? eco.villages.find((o) => o.pens?.some((p) => (p.x === i % w || p.x + 1 === i % w) && (p.y === Math.floor(i / w) || p.y + 1 === Math.floor(i / w))));
      return v?.herd ? `Pasto · ${v.herd.head} ${HERD_NAMES[v.herd.kind]} de ${v.name}` : 'Pasto cercado';
    }
    if (road === 3) return 'Praça';
    if (road) return 'Rua';
    if (!eco.built[i]) return null;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const v of eco.villages) {
      for (const h of v.houses) {
        const size = h.kind === 'port' ? 0 : 1;
        if (y >= h.y && y <= h.y + size && (x - h.x + w) % w <= size) return `${h.kind === 'wonder' ? WONDER_NAMES[v.culture.value] : BUILDING_NAMES[h.kind]} · ${v.name}`;
      }
    }
    return null;
  }

  /** Resumo do assentamento sob o mouse: reino, povo, estoque, o que falta para a próxima era e guerra. */
  private settlementInfo(eco: Ecosystem, v: Village): string {
    const capital = eco.capitalOf(v);
    const st = eco.store(v);
    const stock = STOCK_NAMES.filter(([k]) => st[k] >= 1).map(([k, name]) => `${name} ${Math.floor(st[k])}`).join(' · ');
    const need = eco.eraNeed(v);
    const war = eco.warOf(v.kingdom);
    const enemy = war ? eco.villages[war.a === v.kingdom ? war.b : war.a].name : '';
    const c = v.culture;
    const allies = eco.villages.filter((o) => !o.abandoned && o.kingdom === o.id && o.id !== v.kingdom && eco.allied(o.id, v.kingdom)).map((o) => o.name);
    return `
      <b>${eco.tierName(v)} ${v.name}${capital !== v ? ` · ${eco.polityName(v)}` : ''}</b>
      <span>Povo ${c.name} · valoriza ${c.value} · crê n${c.belief.startsWith('a') ? 'a' : 'o'}${c.belief.startsWith('os') || c.belief.startsWith('as') ? 's' : ''} ${c.belief.split(' ').slice(1).join(' ')}</span>
      ${v.vocation ? `<span>${VOCATION_ICONS[v.vocation]} Vocação ${VOCATION_NAMES[v.vocation].toLowerCase()}${v.herd ? ` · rebanho de ${v.herd.head} ${HERD_NAMES[v.herd.kind]}` : ''}</span>` : ''}
      ${v.completeness !== undefined ? `<span>Planta ${Math.round(v.completeness * 100)}%${v.missing ? ` · falta ${v.missing}` : ' · completa'}</span>` : ''}
      ${this.economyLines(eco, v)}
      ${stock ? `<span>${stock}</span>` : ''}
      ${need ? `<span>Para a próxima era: ${need}</span>` : ''}
      ${war ? `<span>⚔ Em guerra com ${enemy}</span>` : ''}
      ${allies.length ? `<span>❤ Aliado de ${allies.join(', ')}</span>` : ''}
      ${DEBUG ? `<span class="wb-debug">${eco.rates(v).map((r) => `${r.name} ${r.perYear.toFixed(2).replace('.', ',')}`).join(' · ')}</span>` : ''}
      <hr>`;
  }

  /**
   * Necessidades, estabilidade e a balança do ano passado (painel de
   * economia, RF-VIDA-217): o que mais se produziu, o que mais se gastou e
   * o que está faltando.
   */
  private economyLines(eco: Ecosystem, v: Village): string {
    if (!v.needs) return '';
    const n = v.needs;
    const low = NEEDS.filter((k) => n[k] < 0.7);
    const needs = `<span>Necessidades ${Math.round(welfare(n) * 100)}%${low.length ? ` · falta ${low.map((k) => NEED_NAMES[k]).join(', ')}` : ' · tudo atendido'} · estabilidade ${Math.round((v.stability ?? 1) * 100)}%</span>`;
    const names = new Map<string, string>([...STOCK_NAMES.map(([k, l]) => [k, l.toLowerCase()] as [string, string]), ['food', 'comida']]);
    const { ledger } = sumLedger(v, 10);
    const rows = Object.entries(ledger).filter(([k]) => names.has(k));
    const top = (i: 0 | 1) =>
      rows
        .filter(([, e]) => e[i] >= 1)
        .sort((a, b) => b[1][i] - a[1][i])
        .slice(0, 3)
        .map(([k, e]) => `${names.get(k)} ${Math.round(e[i])}`)
        .join(', ');
    const made = top(0);
    const used = top(1);
    const full = rows.filter(([k]) => {
      const have = k === 'food' ? v.food : v.stock[k as keyof typeof v.stock];
      return typeof have === 'number' && have >= eco.capOf(v, k as never) * 0.95;
    });
    const season = seasonLabel(eco.season(), eco.map.params);
    return `${needs}
      ${made || used ? `<span>Últimos 10 anos: fez ${made || 'nada'} · gastou ${used || 'nada'}${full.length ? ` · sobra ${full.map(([k]) => names.get(k)).join(', ')}` : ''}</span>` : ''}
      <span>${season === NO_SEASONS ? 'Este planeta não tem estações' : `Agora é ${season}`}</span>`;
  }

  /** Balão leve do assentamento sob o mouse (RF-VIDA-349); o detalhe fica na janela. */
  private settlementHover(eco: Ecosystem, v: Village): string {
    const st = economicState(v);
    const marks = stateIcons(eco, v);
    return `
      <b>${eco.tierName(v)} ${v.name}${marks ? ` ${marks}` : ''}</b>
      <span>${v.population} moradores${v.vocation ? ` · ${VOCATION_ICONS[v.vocation]} ${VOCATION_NAMES[v.vocation]}` : ''} · <span class="${st.tone}">${st.label.toLowerCase()}</span></span>
      <span class="wb-dim">Clique no nome, na praça ou num prédio para abrir a janela</span>
      <hr>`;
  }
}
