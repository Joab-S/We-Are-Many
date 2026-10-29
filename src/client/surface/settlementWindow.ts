/**
 * Janela do assentamento (REQUISITOS-VIDA.md, 19.17, RF-VIDA-341 a 349b):
 * abas Resumo, Economia, Pessoas, Construções, Relações e História, e a
 * tabela que compara todos os assentamentos. Só monta HTML; quem chama
 * cuida de abrir, fechar e atualizar (só a aba visível, 4 vezes por segundo).
 */

import { BUILDING_NAMES, ERAS, HERD_NAMES, type Ecosystem, type Ledger, type Village } from '../../sim/ecosystem';
import { GOODS, ORE_NAMES, STOCK_NAMES, WONDER_NAMES, type Good } from '../../sim/economy';
import { NEED_NAMES, NEEDS, SEASONS, VOCATION_ICONS, VOCATION_NAMES, welfare } from '../../sim/needs';
import { DEATH_CAUSES, emptyVital, familyName, personName, type DeathCause, type Vital } from '../../sim/people';
import { CHILD, ROLE_NAMES, ROLES, type Role } from '../../sim/roles';
import { TIER_NAMES } from '../../sim/settlement';
import { MATERIAL_NAMES } from '../../sim/architecture';
import { CURRENCY_NAMES, LUXURY_NAMES } from '../../sim/trade';
import { elderAge } from '../../sim/ecosystem';
import { PILLARS, PILLAR_NAMES, TECHS, VOCATION_PILLAR } from '../../sim/progress';

export type SettlementTab = 'summary' | 'economy' | 'people' | 'buildings' | 'relations' | 'history';

/** Agrupamento temporal dos registros do assentamento (10, 50, 100 anos ou 0 = total). */
export type PeriodSpan = 10 | 50 | 100 | 0;

export const PERIOD_SPANS: [PeriodSpan, string][] = [
  [10, '10 anos'],
  [50, '50 anos'],
  [100, '100 anos'],
  [0, 'Total'],
];

function periodButtons(span: PeriodSpan): string {
  return `<div class="wb-filters">${PERIOD_SPANS.map(([s, label]) => `<button data-span="${s}" class="${span === s ? 'on' : ''}">${label}</button>`).join('')}</div>`;
}

/** Soma o balanço de recursos nos últimos `span` anos (ou total quando `span === 0`). */
export function sumLedger(v: Village, span: PeriodSpan): { ledger: Ledger; years: number } {
  if (span === 0 && v.ledgerTotal) {
    return { ledger: v.ledgerTotal, years: Math.max(1, v.history?.length ?? v.ledgers?.length ?? 1) };
  }
  const list = v.ledgers?.length ? (span === 0 ? v.ledgers : v.ledgers.slice(-span)) : v.ledger ? [v.ledger] : [];
  const out: Ledger = {};
  for (const l of list) {
    for (const [k, [m, u]] of Object.entries(l)) {
      const cur = out[k] ?? (out[k] = [0, 0]);
      cur[0] += m;
      cur[1] += u;
    }
  }
  return { ledger: out, years: Math.max(1, list.length) };
}

/** Soma o movimento demográfico nos últimos `span` anos (ou total quando `span === 0`). */
export function sumVital(v: Village, span: PeriodSpan): Vital | null {
  if (span === 0 && v.vitalTotal) return v.vitalTotal;
  const list = v.vitals?.length ? (span === 0 ? v.vitals : v.vitals.slice(-span)) : v.vital ? [v.vital] : [];
  if (!list.length) return null;
  const out = emptyVital();
  for (const x of list) {
    out.births += x.births;
    out.arrived += x.arrived;
    out.left += x.left;
    for (const [c, n] of Object.entries(x.deaths)) {
      if (n) out.deaths[c as DeathCause] = (out.deaths[c as DeathCause] ?? 0) + n;
    }
  }
  return out;
}

export const SETTLEMENT_TABS: [SettlementTab, string][] = [
  ['summary', 'Resumo'],
  ['economy', 'Economia'],
  ['people', 'Pessoas'],
  ['buildings', 'Construções'],
  ['relations', 'Relações'],
  ['history', 'História'],
];

/** Ícone de cada profissão (aba Pessoas e ficha da criatura). */
export const ROLE_ICONS: Record<Role, string> = {
  gatherer: '🧺',
  hunter: '🏹',
  farmer: '🌾',
  woodcutter: '🪓',
  builder: '🔨',
  miner: '⛏️',
  blacksmith: '⚒️',
  fisher: '🎣',
  shepherd: '🐑',
  horsekeeper: '🐎',
  weaver: '🧵',
  potter: '🏺',
  miller: '🌀',
  merchant: '⚖️',
  priest: '🕯️',
  soldier: '⚔️',
  guard: '🛡️',
  leader: '👑',
  king: '♛',
};

const GOOD_NAMES = new Map<string, string>([...STOCK_NAMES.map(([k, n]) => [k, n] as [string, string]), ['food', 'Comida']]);

const pct = (x: number) => `${Math.round(Math.max(0, Math.min(1, x)) * 100)}%`;

/** Barra com o número escrito ao lado (nunca só a cor, RF-VIDA-349b). */
export function bar(frac: number, text: string, tone: 'good' | 'warn' | 'bad' | '' = ''): string {
  const f = Math.max(0, Math.min(1, frac));
  const t = tone || (f >= 0.7 ? 'good' : f >= 0.4 ? 'warn' : 'bad');
  return `<span class="wb-meter ${t}"><i style="width:${(f * 100).toFixed(0)}%"></i></span><span class="wb-meter-text">${text}</span>`;
}

/** Nome completo de uma pessoa do assentamento. */
export function fullName(eco: Ecosystem, i: number): string {
  const v = eco.village[i] >= 0 ? eco.villages[eco.village[i]] : null;
  const culture = v ? v.culture.id : eco.kind[i];
  return `${personName(eco.uid[i], culture)} ${familyName(eco.family[i], culture)}`;
}

/** Situação da economia (RF-VIDA-342): próspero, estável, em crise ou falido. */
export function economicState(v: Village): { label: string; tone: 'good' | 'warn' | 'bad' } {
  const w = v.needs ? welfare(v.needs) : 1;
  if (w >= 0.88 && (v.stability ?? 1) >= 0.6) return { label: 'Próspero', tone: 'good' };
  if (w >= 0.7) return { label: 'Estável', tone: 'good' };
  if (w >= 0.5) return { label: 'Em crise', tone: 'warn' };
  return { label: 'Falido', tone: 'bad' };
}

/** Ícones de estado do rótulo e do balão (RF-VIDA-349): guerra, crise, fome. */
export function stateIcons(eco: Ecosystem, v: Village): string {
  const out: string[] = [];
  if (eco.warOf(v.kingdom)) out.push('⚔');
  const n = v.needs;
  if (n && n.food < 0.6) out.push('🍞');
  const s = economicState(v);
  if (s.tone === 'bad' || (s.tone === 'warn' && (v.stability ?? 1) < 0.4)) out.push('⚠');
  return out.join('');
}

/** Tendência da população nos últimos 10 anos. */
function trend(v: Village): string {
  const h = v.history ?? [];
  if (h.length < 2) return '';
  const old = h[Math.max(0, h.length - 11)].population;
  const now = v.population;
  if (now > old * 1.05 + 1) return ' <span class="good">▲</span>';
  if (now < old * 0.95 - 1) return ' <span class="bad">▼</span>';
  return ' <span class="wb-dim">►</span>';
}

/** Quem mora no assentamento (índices vivos). */
function residents(eco: Ecosystem, v: Village): number[] {
  const out: number[] = [];
  for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === v.id) out.push(i);
  return out;
}

function summaryHtml(eco: Ecosystem, v: Village): string {
  const capital = eco.capitalOf(v);
  const c = v.culture;
  const era = Math.floor(v.tech);
  const need = eco.eraNeed(v);
  const leader = v.leader >= 0 && eco.alive[v.leader] ? v.leader : -1;
  const st = economicState(v);
  const w = v.needs ? welfare(v.needs) : 1;
  const next = era < ERAS.length - 1 ? `rumo à ${ERAS[era + 1]}` : 'última era';
  return `
    <div class="wb-kv"><span>Nível</span><b>${TIER_NAMES[v.tier]}${v.vocation ? ` · ${VOCATION_ICONS[v.vocation]} ${VOCATION_NAMES[v.vocation]}` : ''}</b></div>
    <div class="wb-kv"><span>Era</span><b>${ERAS[era]}</b></div>
    <div class="wb-kv"><span>Progresso</span>${bar(v.tech - era, `${Math.floor((v.tech - era) * 100)}% ${next}`, '')}</div>
    ${need ? `<div class="wb-kv"><span>Próximo passo</span><b>${need}</b></div>` : ''}
    <div class="wb-kv"><span>População</span><b>${v.population} moradores${trend(v)}</b></div>
    <div class="wb-kv"><span>Líder</span><b>${leader >= 0 ? `${fullName(eco, leader)}, ${Math.floor(eco.age[leader])} anos` : 'nenhum'}</b></div>
    <div class="wb-kv"><span>Reino</span><b>${capital === v ? (eco.kingdomSize(v) > 1 ? 'capital do reino' : 'independente') : `Reino de ${capital.name}`}</b></div>
    <div class="wb-kv"><span>Povo</span><b>${c.name} · valoriza ${c.value} · crê em ${c.belief}</b></div>
    <div class="wb-kv"><span>Estabilidade</span>${bar(v.stability ?? 1, pct(v.stability ?? 1))}</div>
    <div class="wb-kv"><span>Economia</span><b class="${st.tone}">${st.label}</b><span class="wb-dim">necessidades ${pct(w)}</span></div>
    ${v.completeness !== undefined ? `<div class="wb-kv"><span>Planta</span>${bar(v.completeness, `${pct(v.completeness)}${v.missing ? ` · falta ${v.missing}` : ' · completa'}`)}</div>` : ''}
    ${pillarsHtml(eco, v)}`;
}

/** Pilares de desenvolvimento, técnicas, descobertas individuais e recursos ainda sem uso (RF-VIDA-270 a 273). */
function pillarsHtml(eco: Ecosystem, v: Village): string {
  const special = v.vocation ? VOCATION_PILLAR[v.vocation] : null;
  const rows = PILLARS.map((p, i) => {
    const pts = Math.floor(v.pts?.[i] ?? 0);
    return `<div class="wb-kv"><span>${PILLAR_NAMES[p]}${p === special ? ' ×2' : ''}</span>${bar(v.levels?.[i] ?? 0, `${pts} pts`, '')}</div>`;
  }).join('');
  const known = eco.knows(v);
  const techs = TECHS.filter((t) => known.has(t.id)).map((t) => t.name);
  const latent = eco.latent(v);
  const samples = Object.entries(v.samples ?? {}).filter(([id, until]) => until > eco.year && !known.has(id)).map(([id]) => TECHS.find((t) => t.id === id)?.name ?? id);
  const pending = v.pendingTech ? TECHS.find((t) => t.id === v.pendingTech!.id)?.name ?? v.pendingTech.id : null;
  return `
    <div class="wb-sub">Desenvolvimento · ${Math.floor(v.pts?.reduce((a, b) => a + b, 0) ?? 0)} pontos acumulados</div>
    ${rows}
    ${v.pendingTech && pending ? `<div class="wb-kv"><span>Aprendendo</span>${bar(v.pendingTech.progress, `${v.pendingTech.name} ensina ${pending} (${pct(v.pendingTech.progress)})`, 'good')}</div>` : ''}
    ${samples.length ? `<div class="wb-kv"><span>Amostras</span><b>${samples.join(', ')}</b><span class="wb-dim">trazidas por caravanas</span></div>` : ''}
    <div class="wb-kv"><span>Técnicas</span><b>${techs.length ? techs.join(', ') : 'nenhuma ainda'}</b><span class="wb-dim">${techs.length} de ${TECHS.length}</span></div>
    ${latent.length ? `<div class="wb-kv"><span>Sem uso ainda</span><b>${latent.join('; ')}</b></div>` : ''}`;
}

function economyHtml(eco: Ecosystem, v: Village, span: PeriodSpan): string {
  const { ledger, years } = sumLedger(v, span);
  const spanLabel = span === 0 ? 'total acumulado' : `últimos ${span} anos`;
  const rows = ([...GOODS, 'food'] as (Good | 'food')[])
    .map((g) => {
      const have = g === 'food' ? v.food : v.stock[g];
      const cap = eco.capOf(v, g);
      const [made, used] = ledger[g] ?? [0, 0];
      return { g, have, cap, made, used, price: eco.priceAt(v, g) };
    })
    .filter((r) => r.have >= 0.5 || r.made >= 0.5 || r.used >= 0.5);
  const table = rows
    .map((r) => {
      const fill = r.cap > 0 ? r.have / r.cap : 0;
      const net = r.made - r.used;
      const n0 = Math.round(net);
      const tag = net < -0.5 && fill < 0.2 ? '<span class="bad">falta</span>' : fill >= 0.95 ? '<span class="good">sobra</span>' : '';
      return `<tr><td>${GOOD_NAMES.get(r.g) ?? r.g}</td><td class="wb-wide">${bar(fill, `${Math.floor(r.have)} de ${Math.round(r.cap)}`, fill >= 0.95 ? 'good' : fill < 0.15 ? 'bad' : 'warn')}</td><td>${Math.round(r.made) ? `+${Math.round(r.made)}` : '0'}</td><td>${Math.round(r.used) ? `−${Math.round(r.used)}` : '0'}</td><td class="${n0 > 0 ? 'good' : n0 < 0 ? 'bad' : ''}">${n0 > 0 ? '+' : n0 < 0 ? '−' : ''}${Math.abs(n0)}</td><td>${r.g === 'gold' ? '' : r.price.toFixed(1)}</td><td>${tag}</td></tr>`;
    })
    .join('');
  const n = v.needs;
  const needs = n
    ? NEEDS.map((k) => `<div class="wb-kv"><span>${NEED_NAMES[k]}</span>${bar(n[k], pct(n[k]))}</div>`).join('')
    : '<div class="wb-empty">Ainda sem um ano completo de contas.</div>';
  return `
    <div class="wb-section">Período dos registros</div>
    ${periodButtons(span)}
    <div class="wb-section">Necessidades</div>
    ${needs}
    ${resourcesHtml(v, ledger, years, span)}
    <div class="wb-section">Estoque e balança (${spanLabel})</div>
    ${table ? `<table class="wb-table"><tr><th>Recurso</th><th>Estoque e teto</th><th>Fez</th><th>Gastou</th><th>Saldo</th><th title="Quanto vale aqui, pela falta que faz (RF-VIDA-231)">Preço</th><th></th></tr>${table}</table>` : '<div class="wb-empty">Nada guardado.</div>'}
    <div class="wb-kv"><span>Caixa</span><b>${Math.floor(v.stock.gold)} de ouro</b></div>
    ${v.herd ? `<div class="wb-kv"><span>Rebanho</span><b>${v.herd.head} ${HERD_NAMES[v.herd.kind]}${(v.herd.plague ?? 0) > eco.year ? ' · <span class="bad">com praga</span>' : ''}</b></div>` : ''}
    ${v.soil !== undefined ? `<div class="wb-kv"><span>Solo</span>${bar(v.soil, `fertilidade ${pct(v.soil)}`)}</div>` : ''}
    <div class="wb-kv"><span>Estação</span><b>${SEASONS[eco.season()]}</b></div>
    ${tradeHtml(eco, v)}
    <div class="wb-note">Tudo sai do mapa: a madeira de árvores cortadas, que demoram a crescer de novo; a pedra da rocha e das pedras soltas, que acabam; a comida da coleta, da caça, das roças, do rebanho e da pesca. O que não cabe no estoque se perde. O preço sobe com a falta que o bem faz; as caravanas levam o que vale mais lá do que aqui.</div>`;
}

/** Recursos do mapa ao alcance (seção 19.19): a mata, a pedra, de onde veio a comida e as casas sem conserto. */
function resourcesHtml(v: Village, l: Ledger, spanYears: number, span: PeriodSpan): string {
  const made = (k: string) => Math.round(l[k]?.[0] ?? 0);
  const trees = v.trees ?? 0;
  const cut = made('_trees');
  const cutPerYear = cut / Math.max(1, spanYears);
  const years = cutPerYear > 0 ? Math.floor(trees / cutPerYear) : 0;
  const start = v.treesStart ?? trees;
  const periodText = span === 0 ? 'no total' : `nos últimos ${span} anos`;
  const forest = `${trees} árvores${start > 0 ? ` (${pct(Math.min(1, trees / start))} da mata do começo)` : ''}${cut ? ` · ${cut} cortadas ${periodText}${years < 60 ? `, <span class="${years < 20 ? 'bad' : 'warn'}">dá para ${years} anos</span>` : ''}` : ''}${v.forestry ? ' · <span class="good">replanta</span>' : ''}`;
  const food = [
    ['coleta', made('_gather')],
    ['caça', made('_hunt')],
    ['roças', made('_fields')],
    ['rebanho', made('_herd')],
    ['pesca', made('_fish')],
  ]
    .filter(([, n]) => n)
    .map(([k, n]) => `${k} ${n}`)
    .join(' · ');
  const worn = v.houses.filter((h) => (h.wear ?? 0) > 0).length;
  return `
    <div class="wb-section">Recursos por perto</div>
    <div class="wb-kv"><span>Mata ao alcance</span><b>${trees ? forest : '<span class="bad">acabou</span>'}</b></div>
    ${v.stoneLeft !== undefined ? `<div class="wb-kv"><span>Pedra ao alcance</span><b>${v.stoneLeft >= 1 ? `${Math.floor(v.stoneLeft)}` : '<span class="bad">acabou</span>'}</b></div>` : ''}
    <div class="wb-kv"><span>Comida (${span === 0 ? 'total' : `${span} anos`})</span><b>${food || 'nenhuma'}</b></div>
    ${worn ? `<div class="wb-kv"><span>Sem conserto</span><b class="bad">${worn} ${worn > 1 ? 'construções' : 'construção'} sem madeira para os consertos</b></div>` : ''}`;
}

/** Comércio do assentamento (19.6): moeda, luxo, caravanas, acordos, feira e pedidos da capital. */
function tradeHtml(eco: Ecosystem, v: Village): string {
  const name = (id: number) => eco.villages[id]?.name ?? '?';
  const out = eco.caravans.filter((c) => c.home === v.id);
  const inbound = eco.caravans.filter((c) => c.target === v.id && c.home !== v.id);
  const trips = out
    .map((c) => (c.kind === 'flock' ? `rebanho ${c.back ? 'voltando do pasto alto' : 'subindo para o pasto alto'}` : `${c.kind === 'tribute' ? 'tributo' : 'caravana'} ${c.back ? `voltando de ${name(c.target)}` : `indo para ${name(c.target)}`} com ${c.cargo.map((g) => `${Math.round(g.amount)} de ${eco.goodName(g.good)}`).join(' e ') || 'pouca carga'}`))
    .concat(eco.boats.filter((b) => b.village === v.id && b.trade && b.sunk < 0).map((b) => `barco mercante ${b.trade!.back ? 'voltando de' : 'indo para'} ${name(b.trade!.target)}`));
  const deals = eco.agreements
    .filter((g) => g.a === v.id || g.b === v.id)
    .map((g) => {
      const mine = g.a === v.id;
      const other = name(mine ? g.b : g.a);
      const give = eco.goodName(g.goods[mine ? 0 : 1]);
      const take = eco.goodName(g.goods[mine ? 1 : 0]);
      return `<div class="wb-kv"><span>Acordo com ${other}</span><b>${give} por ${take}, ${g.every === 1 ? 'todo ano' : `a cada ${g.every} anos`}, até o ano ${Math.floor(g.until)}</b></div>`;
    })
    .join('');
  const capital = eco.villages[v.kingdom];
  return `
    <div class="wb-section">Comércio</div>
    <div class="wb-kv"><span>Moeda</span><b>${CURRENCY_NAMES[eco.currencyName(v)]}${capital.mint ? ` do reino de ${capital.name}` : ''}</b></div>
    ${v.luxury ? `<div class="wb-kv"><span>Luxo da região</span><b>${LUXURY_NAMES[v.luxury]}</b></div>` : ''}
    ${v.fair === Math.floor(eco.year) ? `<div class="wb-kv"><span>Feira anual</span><b>${eco.season() === 1 ? 'acontecendo agora' : 'neste verão'}</b></div>` : ''}
    <div class="wb-kv"><span>Na estrada</span><b>${trips.length ? trips.join(' · ') : 'nenhuma caravana'}</b></div>
    ${inbound.length ? `<div class="wb-kv"><span>Chegando</span><b>${inbound.map((c) => `de ${name(c.home)}`).join(', ')}</b></div>` : ''}
    ${deals}
    ${v.request ? `<div class="wb-kv"><span>Pedido da capital</span><b class="warn">${Math.round(v.request.amount)} de ${eco.goodName(v.request.good)} até o ano ${v.request.until}</b></div>` : ''}
    ${v.refused ? `<div class="wb-kv"><span>Pedidos recusados</span><b class="bad">${v.refused}</b></div>` : ''}`;
}

function peopleHtml(eco: Ecosystem, v: Village, span: PeriodSpan): string {
  const sp = eco.species[v.species];
  const era = Math.floor(v.tech);
  let kids = 0;
  let adults = 0;
  let elders = 0;
  const roles = new Map<number, number>();
  for (const i of residents(eco, v)) {
    if (eco.role[i] === CHILD) kids++;
    else if (eco.age[i] >= elderAge(sp, era)) elders++;
    else adults++;
    if (eco.role[i] !== CHILD) roles.set(eco.role[i], (roles.get(eco.role[i]) ?? 0) + 1);
  }
  const jobs = [...roles.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([r, n]) => `<button class="wb-chip" data-role="${r}" title="Destacar no mapa">${ROLE_ICONS[ROLES[r]]} ${ROLE_NAMES[ROLES[r]]} <b>${n}</b></button>`)
    .join('');
  const vital = sumVital(v, span);
  const spanLabel = span === 0 ? 'total acumulado' : `últimos ${span} anos`;
  const deaths = vital
    ? DEATH_CAUSES.filter((c) => vital.deaths[c])
        .map((c) => `${c} ${vital.deaths[c]}`)
        .join(' · ')
    : '';
  const dead = vital ? Object.values(vital.deaths).reduce((a, b) => a + (b ?? 0), 0) : 0;
  return `
    <div class="wb-kv"><span>Crianças</span><b>${kids}</b></div>
    <div class="wb-kv"><span>Adultos</span><b>${adults}</b></div>
    <div class="wb-kv"><span>Idosos</span><b>${elders}</b></div>
    <div class="wb-section">Profissões (clique para destacar no mapa)</div>
    <div class="wb-chips">${jobs || '<span class="wb-empty">Ninguém trabalhando.</span>'}</div>
    <div class="wb-section">Registro demográfico (${spanLabel})</div>
    ${periodButtons(span)}
    ${vital
      ? `<div class="wb-kv"><span>Nascimentos</span><b>${vital.births}</b></div>
         <div class="wb-kv"><span>Mortes</span><b>${dead}${deaths ? ` <span class="wb-dim">(${deaths})</span>` : ''}</b></div>
         <div class="wb-kv"><span>Chegaram</span><b>${vital.arrived}</b></div>
         <div class="wb-kv"><span>Partiram</span><b>${vital.left}</b></div>`
      : '<div class="wb-empty">Ainda sem um ano completo de registro.</div>'}`;
}

function buildingsHtml(eco: Ecosystem, v: Village): string {
  const houses = v.houses.filter((h) => h.kind === 'house');
  const tall = houses.filter((h) => (h.level ?? 0) > 0).length;
  // Estilos misturados na troca de era (RF-VIDA-251) e casas vazias na crise (RF-VIDA-254).
  const era = Math.floor(v.tech);
  const byEra = new Map<number, number>();
  for (const h of houses) byEra.set(h.era ?? era, (byEra.get(h.era ?? era) ?? 0) + 1);
  const styles = [...byEra.entries()].sort((a, b) => b[0] - a[0]).map(([e, n]) => `${n} da ${ERAS[e]}`).join(' · ');
  const empty = houses.filter((h) => h.empty).length;
  const special = v.houses.filter((h) => h.kind !== 'house');
  const go = (x: number, y: number) => `data-go="${(x + 1).toFixed(1)},${(y + 1).toFixed(1)}"`;
  const works = v.houses.filter((h) => eco.underWork(h));
  const progress = (h: (typeof works)[number]) => (h.laborMax ? `${Math.round((1 - (h.labor ?? 0) / h.laborMax) * 100)}% pronta${h.crew ? ` · ${h.crew} trabalhando` : ' · parada, sem ninguém na obra'}` : `faltam ${Math.max(1, Math.ceil((h.workUntil ?? 0) - eco.year))} anos`);
  const list = special
    .map((h) => {
      const name = h.kind === 'wonder' ? WONDER_NAMES[v.culture.value] : BUILDING_NAMES[h.kind];
      return `<button class="wb-row" ${go(h.x, h.y)}><i>🏛</i>${name}<em>📍</em></button>`;
    })
    .join('');
  const mines = v.mines
    .map((id) => eco.deposits[id])
    .filter((d) => d && d.amount > 0)
    .map((d) => `<button class="wb-row" data-go="${(d.x + 0.5).toFixed(1)},${(d.y + 0.5).toFixed(1)}"><i>⛏</i>Mina de ${ORE_NAMES[d.ore]} · restam ${Math.ceil(d.amount)} de ${d.initial}<em>📍</em></button>`)
    .join('');
  const pens = (v.pens ?? []).length;
  return `
    <div class="wb-kv"><span>Casas</span><b>${houses.length}${tall ? ` · ${tall} com andar a mais` : ''}${empty ? ` · <span class="bad">${empty} vazias</span>` : ''}</b></div>
    <div class="wb-kv"><span>Estilo</span><b>${styles || '—'}</b></div>
    <div class="wb-kv"><span>Material</span><b>${v.material ? MATERIAL_NAMES[v.material] : MATERIAL_NAMES.plain}</b></div>
    <div class="wb-kv"><span>Plantações</span><b>${v.fields}</b></div>
    ${pens ? `<div class="wb-kv"><span>Cercados</span><b>${pens}</b></div>` : ''}
    <div class="wb-kv"><span>Porto</span><b>${v.port >= 0 ? 'sim' : 'não'}</b></div>
    ${works.length ? `<div class="wb-section">Obras em andamento</div>${works.map((h) => `<button class="wb-row" ${go(h.x, h.y)}><i>🏗</i>${h.kind === 'house' ? 'Casa' : BUILDING_NAMES[h.kind]} · ${progress(h)}<em>📍</em></button>`).join('')}` : ''}
    <div class="wb-section">Prédios especiais</div>
    <div class="wb-list">${list || '<div class="wb-empty">Nenhum ainda.</div>'}</div>
    ${mines ? `<div class="wb-section">Minas</div><div class="wb-list">${mines}</div>` : ''}`;
}

function relationsHtml(eco: Ecosystem, v: Village): string {
  const k = v.kingdom;
  const me = eco.villages[k];
  const members = eco.villages.filter((o) => !o.abandoned && o.kingdom === k && o !== v);
  const w = eco.map.width;
  const dist = (o: Village) => Math.hypot(((o.x - me.x + w * 1.5) % w) - w / 2, o.y - me.y);
  const others = eco.villages
    .filter((o) => !o.abandoned && o.kingdom === o.id && o.id !== k)
    .sort((a, b) => dist(a) - dist(b))
    .slice(0, 8);
  const rows = others
    .map((o) => {
      const r = eco.relation(k, o.id);
      const war = eco.wars.some((x) => (x.a === k && x.b === o.id) || (x.b === k && x.a === o.id));
      const ally = eco.allied(k, o.id);
      const label = war ? '⚔ em guerra' : ally ? '❤ aliado' : r < -35 ? 'rancor' : r < 0 ? 'tensão' : r > 40 ? 'amigo' : 'paz';
      const tone = war || r < -35 ? 'bad' : r < 0 ? 'warn' : 'good';
      return `<div class="wb-kv"><button class="wb-goto" data-village="${o.id}"><i style="background:rgb(${o.color.join(',')})"></i>${o.name}</button>${bar((r + 100) / 200, `${r > 0 ? '+' : ''}${Math.round(r)} · ${label}`, tone)}</div>`;
    })
    .join('');
  return `
    <div class="wb-kv"><span>Reino</span><b>${eco.kingdomSize(v) > 1 || me.tier >= 2 ? `Reino de ${me.name}` : `${me.name} (independente)`}</b></div>
    ${members.length ? `<div class="wb-kv"><span>Do mesmo reino</span><b>${members.map((o) => o.name).join(', ')}</b></div>` : ''}
    <div class="wb-section">Vizinhos (relação de −100 a +100)</div>
    ${rows || '<div class="wb-empty">Nenhum outro reino por perto.</div>'}`;
}

/** Gráfico pequeno de linha em SVG, com o último valor escrito. */
function spark(values: number[], label: string, color: string): string {
  if (values.length < 2) return '';
  const max = Math.max(1, ...values);
  const pts = values.map((y, x) => `${((x / (values.length - 1)) * 200).toFixed(1)},${(38 - (y / max) * 34).toFixed(1)}`).join(' ');
  return `<div class="wb-spark"><span>${label}: ${values[values.length - 1]} (máximo ${max})</span><svg viewBox="0 0 200 40" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5"/></svg></div>`;
}

function historyHtml(eco: Ecosystem, v: Village, describe: (e: Ecosystem['chronicle'][number]) => string): string {
  const w = eco.map.width;
  const r = eco.radius(v) + 2;
  const mine = eco.chronicle.filter((e) => e.text.includes(v.name) || (e.x >= 0 && Math.hypot(((e.x - v.x + w * 1.5) % w) - w / 2, e.y - v.y) <= r)).slice(0, 60);
  const h = v.history ?? [];
  const years = h.length ? `dos anos ${h[0].year} a ${h[h.length - 1].year}` : '';
  return `
    ${spark(h.map((s) => s.population), 'População', '#f0c860')}
    ${spark(h.map((s) => s.stock), 'Estoque guardado', '#8fd08f')}
    ${years ? `<div class="wb-note">Gráficos ${years}.</div>` : ''}
    <div class="wb-section">Crônica de ${v.name}</div>
    <div class="wb-list">${mine.map((e) => `<div class="wb-row ${e.major ? 'major' : ''}"><span class="wb-yr">${Math.floor(e.year)}</span>${describe(e)}</div>`).join('') || '<div class="wb-empty">Nada registrado aqui ainda.</div>'}</div>`;
}

/** Conteúdo da aba pedida da janela do assentamento. */
export function settlementTabHtml(
  eco: Ecosystem,
  v: Village,
  tab: SettlementTab,
  describe: (e: Ecosystem['chronicle'][number]) => string,
  span: PeriodSpan = 10,
): string {
  if (v.abandoned) return `<div class="wb-empty">${v.name} foi abandonada${v.abandonedAt !== undefined ? ` no ano ${Math.floor(v.abandonedAt)}` : ''}.</div>`;
  switch (tab) {
    case 'summary':
      return summaryHtml(eco, v);
    case 'economy':
      return economyHtml(eco, v, span);
    case 'people':
      return peopleHtml(eco, v, span);
    case 'buildings':
      return buildingsHtml(eco, v);
    case 'relations':
      return relationsHtml(eco, v);
    case 'history':
      return historyHtml(eco, v, describe);
  }
}

export type CompareKey = 'name' | 'population' | 'era' | 'vocation' | 'wealth' | 'stability' | 'completeness';

/** Riqueza: ouro mais bens guardados. */
function wealth(v: Village): number {
  return Math.round(v.stock.gold * 3 + GOODS.reduce((n, g) => n + (g === 'gold' ? 0 : v.stock[g]), 0) + v.food * 0.5);
}

/** Janela Assentamentos: tabela ordenável de todos (RF-VIDA-349a). */
export function compareHtml(eco: Ecosystem, key: CompareKey, desc: boolean): string {
  const live = eco.villages.filter((v) => !v.abandoned);
  if (!live.length) return '<div class="wb-empty">Nenhum assentamento ainda.</div>';
  const value = (v: Village): number | string =>
    key === 'name' ? v.name : key === 'population' ? v.population : key === 'era' ? v.tech : key === 'vocation' ? (v.vocation ? VOCATION_NAMES[v.vocation] : '') : key === 'wealth' ? wealth(v) : key === 'stability' ? (v.stability ?? 1) : (v.completeness ?? 1);
  const sorted = [...live].sort((a, b) => {
    const x = value(a);
    const y = value(b);
    const c = typeof x === 'string' ? x.localeCompare(String(y)) : x - (y as number);
    return desc ? -c : c;
  });
  const head = (k: CompareKey, label: string) => `<th><button data-sort="${k}" class="${key === k ? 'on' : ''}">${label}${key === k ? (desc ? ' ▼' : ' ▲') : ''}</button></th>`;
  const rows = sorted
    .map(
      (v) => `<tr data-village="${v.id}" class="wb-click">
        <td><i class="wb-swatch" style="background:rgb(${v.color.join(',')})"></i>${TIER_NAMES[v.tier]} ${v.name}</td>
        <td>${v.population}</td>
        <td>${ERAS[Math.floor(v.tech)]}</td>
        <td>${v.vocation ? `${VOCATION_ICONS[v.vocation]} ${VOCATION_NAMES[v.vocation]}` : '—'}</td>
        <td>${wealth(v)}</td>
        <td>${pct(v.stability ?? 1)}</td>
        <td>${pct(v.completeness ?? 1)}</td>
      </tr>`,
    )
    .join('');
  return `<table class="wb-table wb-compare"><tr>${head('name', 'Nome')}${head('population', 'Moradores')}${head('era', 'Era')}${head('vocation', 'Vocação')}${head('wealth', 'Riqueza')}${head('stability', 'Estabilidade')}${head('completeness', 'Planta')}</tr>${rows}</table>
    <div class="wb-note">Clique no título de uma coluna para ordenar e numa linha para ir até o lugar e abrir a janela dele. Riqueza é o ouro (vale 3) mais os bens e metade da comida guardados.</div>`;
}
