import { BIOME_NAMES, Boundary, BOUNDARY_NAMES, temperatureAt } from '../../../procgen/surface';
import { BUILDING_NAMES, HERD_NAMES, type Ecosystem, type Village } from '../../../sim/ecosystem';
import { NEED_NAMES, NEEDS, SEASONS, VOCATION_ICONS, VOCATION_NAMES, welfare } from '../../../sim/needs';
import { ORE_NAMES, STOCK_NAMES, WONDER_NAMES } from '../../../sim/economy';
import { CHILD } from '../../../sim/roles';
import { bestCraft, TECH_BY_ID } from '../../../sim/progress';
import { notable } from '../../../ai/traits';
import { dietText, ecologyOf } from '../../../sim/fauna';
import { animalStage, DEATH_TEXT, familyName, personName } from '../../../sim/people';
import { ROLE_NAMES, ROLES } from '../art';
import { bar, economicState, fullName, ROLE_ICONS, stateIcons, sumLedger } from '../settlementWindow';
import { DEBUG } from '../tools';
import type { Selection } from '../selection';
import type { Viewport } from '../Viewport';
import type { WeatherView } from '../weatherView';
import { HtmlSlot, HudComponent } from './component';

/**
 * Ficha do que está sob o mouse ou fixado (RF-VIDA-330 a 336): tile,
 * assentamento, criatura ou grupo. Refeita a cada 150 ms.
 */
export class InfoCard extends HudComponent {
  private readonly slot: HtmlSlot;

  constructor(
    private readonly el: HTMLElement,
    private readonly view: Viewport,
    private readonly sel: Selection,
    private readonly weather: WeatherView,
    private readonly host: { say(text: string): void; redraw(): void },
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
    // Ficha fixada: segue a criatura (enquanto viver) ou fica no lugar clicado.
    let atX = this.view.hover.x;
    let atY = this.view.hover.y;
    let picked = -1;
    const pin = sel.pinned;
    if (pin && 'creature' in pin) {
      if (eco.alive[pin.creature] && eco.uid[pin.creature] === pin.uid) {
        picked = pin.creature;
        atX = eco.x[picked];
        atY = map.height - eco.y[picked];
      } else {
        // Morreu: avisa e solta (RF-VIDA-333).
        const d = eco.deaths.find((x) => x.uid === pin.uid);
        if (d) {
          const cause = DEATH_TEXT[d.cause];
          this.host.say(`${sel.lastName ?? 'Quem você seguia'} morreu${cause ? ` ${cause}` : ''} aos ${Math.floor(d.age)} anos`);
        }
        sel.unpin();
        return;
      }
    } else if (pin && 'x' in pin) {
      atX = pin.x;
      atY = pin.y;
    }
    let html: string;
    if (pin && 'group' in pin) {
      html = this.groupCard(eco, pin.set);
    } else {
      const i = this.view.tileIndex(atX, atY);
      if (i < 0) {
        el.hidden = true;
        return;
      }
      if (!pin) picked = sel.hoverPick;
      if (picked >= 0) {
        html = this.creatureCard(eco, picked);
        if (sel.pinned && 'creature' in sel.pinned) sel.lastName = sel.shortName(picked).split(',')[0];
      } else {
        const t = temperatureAt(map, i);
        const place = this.placeAt(eco, i);
        const v = eco.villageAt(atX, this.view.toRow(atY));
        html = `
          ${v ? (pin ? this.settlementInfo(eco, v) : this.settlementHover(eco, v)) : ''}
          <b>${place ?? BIOME_NAMES[map.biome[i] as keyof typeof BIOME_NAMES]}</b>
          <span>Altitude ${(map.elevation[i] * 100).toFixed(0)}</span>
          <span>Temperatura ${(t - 273.15).toFixed(0)} °C</span>
          <span>Umidade ${(map.moisture[i] * 100).toFixed(0)}%</span>
          <span>Vegetação ${(map.vegetation[i] * 100).toFixed(0)}%</span>${this.floraInfo(eco, i)}${this.weather.info(i)}${this.plateInfo(eco, i)}`;
      }
    }
    el.hidden = false;
    el.classList.toggle('pinned', !!sel.pinned);
    if (sel.pinned) html = `<div class="wb-pin">📌 Fixado · Esc ou clique no vazio solta</div>${html}`;
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
    const season = SEASONS[eco.season()];
    return `${needs}
      ${made || used ? `<span>Últimos 10 anos: fez ${made || 'nada'} · gastou ${used || 'nada'}${full.length ? ` · sobra ${full.map(([k]) => names.get(k)).join(', ')}` : ''}</span>` : ''}
      <span>Agora é ${season}</span>`;
  }

  /** Barras de energia e saúde (saúde: energia e o peso da idade). */
  private vitals(eco: Ecosystem, i: number): string {
    const sp = eco.species[eco.kind[i]];
    const v = eco.village[i] >= 0 ? eco.villages[eco.village[i]] : null;
    const life = sp.kind === 'sapient' ? sp.maxAge * (1 + 0.12 * Math.floor(v?.tech ?? 0)) : sp.maxAge;
    const old = Math.max(0, (eco.age[i] - life * 0.6) / (life * 0.4));
    const health = Math.max(0, Math.min(1, 0.4 + eco.energy[i] * 0.6) * (1 - 0.7 * Math.min(1, old)));
    return `<span class="wb-line">Energia ${bar(eco.energy[i], `${Math.round(eco.energy[i] * 100)}%`)}</span>
      <span class="wb-line">Saúde ${bar(health, `${Math.round(health * 100)}%`)}</span>`;
  }

  /** O que a pessoa leva: a ferramenta da profissão, armas se o assentamento tem. */
  private carries(eco: Ecosystem, i: number): string {
    const v = eco.villages[eco.village[i]];
    const era = Math.floor(v.tech);
    const role = ROLES[eco.role[i]];
    const metal = era >= 1 && v.stock.tools > 0;
    const tools: Partial<Record<typeof role, string>> = {
      hunter: era >= 1 ? 'arco e flechas' : 'lança de pedra',
      farmer: metal ? 'enxada de metal' : 'enxada de madeira',
      woodcutter: metal ? 'machado de metal' : 'machado de pedra',
      miner: metal ? 'picareta' : 'cunha de pedra',
      builder: 'martelo',
      blacksmith: 'martelo e tenaz',
      fisher: 'rede',
      shepherd: 'cajado',
      merchant: 'mercadoria',
      soldier: v.stock.weapons > 0 ? 'arma do arsenal' : 'lança de madeira',
      guard: v.stock.weapons > 0 ? 'arma do arsenal' : 'porrete',
      gatherer: 'cesto',
    };
    return tools[role] ?? '';
  }

  /** Ficha completa da criatura (RF-VIDA-335). */
  private creatureCard(eco: Ecosystem, i: number): string {
    const sel = this.sel;
    const sp = eco.species[eco.kind[i]];
    const vi = eco.village[i];
    const v = vi >= 0 ? eco.villages[vi] : null;
    const following = sel.pinned && 'creature' in sel.pinned && sel.pinned.creature === i;
    const follow = following ? `<button class="wb-btn" data-act="follow">${sel.follow ? '⏹ Parar de seguir (F)' : '🎥 Seguir (F)'}</button>` : '';
    const doing = `<span>Agora: ${eco.activityOf(i)}</span>`;
    if (sp.kind !== 'sapient') {
      const ecol = ecologyOf(sp);
      const diet = sp.kind === 'fish' ? 'algas e plâncton' : sp.kind === 'shark' && ecol.guild !== 'filtrador' ? 'peixes' : dietText(ecol);
      // Carga de parasitas (sobe com a lotação): pesa no metabolismo, na velocidade e nas crias.
      const load = eco.parasite[i];
      const sick = load > 0.25 ? `<span class="${load > 0.6 ? 'bad' : 'wb-dim'}">Com ${ecol.parasite} (${load > 0.6 ? 'muitos' : 'alguns'})</span>` : '';
      let group = 0;
      let threat = '';
      let td = Infinity;
      for (const j of eco.pickAll(eco.x[i], eco.y[i], 8)) {
        const o = eco.species[eco.kind[j]];
        const d = Math.hypot(eco.x[j] - eco.x[i], eco.y[j] - eco.y[i]);
        if (eco.kind[j] === eco.kind[i] && d <= 6) group++;
        if (j !== i && (o.kind === 'predator' || o.kind === 'shark') && sp.kind !== 'predator' && sp.kind !== 'shark' && d < td) {
          td = d;
          threat = `${o.name} a ${Math.round(d)} tiles`;
        }
      }
      const gname = sp.kind === 'fish' || sp.kind === 'shark' ? 'cardume' : sp.kind === 'predator' ? 'matilha' : 'bando';
      return `
        <b>${sp.name} · ${animalStage(eco.age[i], sp.maturity, sp.maxAge)}</b>
        <span>Idade ${eco.age[i].toFixed(0)} de até ${Math.round(sp.maxAge)} anos</span>
        ${this.vitals(eco, i)}
        ${doing}
        <span>Come ${diet}</span>
        ${sick}
        <span>${group > 1 ? `Num ${gname} de ${group}` : 'Sozinho por aqui'}</span>
        ${threat ? `<span class="bad">Predador por perto: ${threat}</span>` : ''}
        ${follow}`;
    }
    const name = v ? fullName(eco, i) : sp.name;
    const role = eco.role[i];
    const job = v ? `${role === CHILD ? '🧒' : ROLE_ICONS[ROLES[role]]} ${sel.lifeStage(i)}` : 'Sem assentamento';
    const fam = eco.familyOf(i);
    const person = (j: number) => `<button class="wb-link" data-uid="${eco.uid[j]}">${personName(eco.uid[j], v?.culture.id ?? 0)}</button>`;
    const born = eco.bornAt[i] >= 0 ? eco.villages[eco.bornAt[i]] : null;
    const story = [
      born ? `nasceu em ${born.name} no ano ${Math.max(0, Math.floor(eco.bornYear[i]))}` : `chegou de fora${eco.bornYear[i] >= 0 ? `, nascido por volta do ano ${Math.floor(eco.bornYear[i])}` : ''}`,
      v && eco.movedAt[i] >= 0 && (!born || born.id !== v.id) ? `mudou para ${v.name} no ano ${Math.floor(eco.movedAt[i])}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    const carry = v && role !== CHILD ? this.carries(eco, i) : '';
    // Jornada (plano novo dos assentamentos, RF-AS-30): tarefa, motivo e as alternativas que perderam.
    const journey = v ? eco.dayOf(i) : null;
    // Quem descobriu uma técnica e ainda a ensina, a curiosidade e o ofício em que tem mais jeito (RF-VIDA-419 e 420).
    const teaching = v?.pendingTech?.uid === eco.uid[i] ? v.pendingTech : null;
    const teachName = teaching ? (TECH_BY_ID[teaching.id]?.name ?? teaching.id) : '';
    // Personalidade (IA local, src/ai/traits.ts): os traços marcantes, e o ofício em que tem mais jeito.
    const marks = notable(eco.traits, i).map((t) => `${t.icon} ${t.label}`);
    const traits = v ? [...marks, role !== CHILD ? `⭐ jeito para ${ROLE_NAMES[ROLES[bestCraft(eco.uid[i])]].toLowerCase()}` : ''].filter(Boolean).join(' · ') : '';
    // Laços (IA local, relações): cônjuge, amigos e rivais, clicáveis para seguir de uma pessoa a outra.
    const ties = v ? eco.tiesOf(i) : null;
    const some = (list: number[]) => `${list.slice(0, 3).map(person).join(', ')}${list.length > 3 ? ` e mais ${list.length - 3}` : ''}`;
    const tieLine = ties
      ? [ties.partner >= 0 ? `💞 casado(a) com ${person(ties.partner)}` : '', ties.friends.length ? `🤝 amigos: ${some(ties.friends)}` : '', ties.rivals.length ? `😠 rivais: ${some(ties.rivals)}` : ''].filter(Boolean).join(' · ')
      : '';
    // O que a pessoa decidiu e por quê, do mais novo para o mais antigo (src/ai/trace.ts).
    const diary = (eco.diary.get(eco.uid[i]) ?? []).slice(-4).reverse();
    const thoughts = diary.map((t) => `<span class="wb-dim">Ano ${t.year}: ${t.text}</span>`).join('');
    return `
      <b>${name}</b>
      <span>${sp.name} · ${job}</span>
      <span>Idade ${eco.age[i].toFixed(0)} anos</span>
      ${this.vitals(eco, i)}
      ${doing}
      ${v ? `<span>Mora em <button class="wb-link" data-village="${v.id}">${eco.tierName(v)} ${v.name}</button>${v.kingdom !== v.id ? ` · ${eco.polityName(v)}` : ''}</span>` : ''}
      ${v ? `<span>Família ${familyName(eco.family[i], v.culture.id)}${fam.parent >= 0 ? ` · filho(a) de ${person(fam.parent)}` : ''}${fam.children.length ? ` · filhos: ${fam.children.slice(0, 5).map(person).join(', ')}${fam.children.length > 5 ? ` e mais ${fam.children.length - 5}` : ''}` : ''}</span>` : ''}
      ${carry ? `<span>Leva ${carry}</span>` : ''}
      ${journey ? `<span class="wb-line">🧭 ${journey.task}${journey.carry ? ` · leva ${journey.carry}` : ''}</span><span class="wb-dim">Por quê: ${journey.why}${journey.others.length ? `; perdeu para ${journey.others.join(', ')}` : ''}</span>` : ''}
      ${teaching ? `<span class="wb-line">📜 Ensinando ${teachName} ${bar(teaching.progress, `${Math.round(teaching.progress * 100)}%`, 'good')}</span>` : ''}
      ${traits ? `<span>${traits}</span>` : ''}
      ${tieLine ? `<span>${tieLine}</span>` : ''}
      ${thoughts}
      ${story ? `<span class="wb-dim">${story[0].toUpperCase()}${story.slice(1)}.</span>` : ''}
      ${follow}`;
  }

  /** Resumo do grupo escolhido com Shift + arrastar (RF-VIDA-336). */
  private groupCard(eco: Ecosystem, set: Set<number>): string {
    const species = new Map<string, number>();
    const jobs = new Map<string, number>();
    let energy = 0;
    let n = 0;
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i] || !set.has(eco.uid[i])) continue;
      n++;
      energy += eco.energy[i];
      const sp = eco.species[eco.kind[i]];
      species.set(sp.name, (species.get(sp.name) ?? 0) + 1);
      if (sp.kind === 'sapient' && eco.village[i] >= 0) {
        const stage = this.sel.lifeStage(i);
        jobs.set(stage, (jobs.get(stage) ?? 0) + 1);
      }
    }
    if (!n) return '<b>Grupo</b><span>Ninguém do grupo está vivo.</span>';
    const list = (m: Map<string, number>) =>
      [...m.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([k, c]) => `${k} ${c}`)
        .join(' · ');
    return `
      <b>Grupo de ${n}</b>
      <span>${list(species)}</span>
      ${jobs.size ? `<span>${list(jobs)}</span>` : ''}
      <span class="wb-line">Energia média ${bar(energy / n, `${Math.round((energy / n) * 100)}%`)}</span>`;
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
