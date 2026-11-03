import type { PlanetParams } from '../../procgen/surface';
import { LIFEWAY_NAMES } from '../../sim/biomeYield';
import { LABELS } from '../../sim/calibrate';
import { POLITY_NAMES, TIER_NAMES_NEW } from '../../sim/community';
import { ERAS, WAR_MOTIVES } from '../../sim/ecosystem';
import { familyName, personName } from '../../sim/people';
import { TECH_BY_ID } from '../../sim/progress';
import { CHILD } from '../../sim/roles';
import type { EngineCommand } from '../../sim/api/commands';
import type { DebugFactor, DebugOption, DebugTarget, FamilyDecision, IndicatorSample, PlaceDebug, ProfileDebug, WorldDebug } from '../../sim/api/debug';
import type { EngineView } from '../../sim/api/engine';
import { eventVillages, type DisasterKind, type EngineEvent, type EngineEventKind, type MigrateCause } from '../../sim/api/events';
import { noticeText } from './hud/notices';
import { SPEEDS, type LoggedCommand } from './SimDriver';

/**
 * Painel de depuração da superfície (`?debug`, F3): o que a simulação está fazendo, em seis abas (Mundo, Lugar,
 * Família, Eventos, Desempenho e Tempo). Só monta HTML a partir de dados puros: a vista de depuração do motor
 * (`engine.debug`, contrato em src/sim/api/debug.ts), a vista de leitura (`engine.view`), os eventos do
 * despachante e as medidas do relógio. Quem chama (hud/DebugPanel.ts) cuida de abrir, fechar, atualizar e tratar
 * os cliques, que vêm pelos atributos `data-d*` daqui.
 *
 * Enquanto o motor devolve a vista vazia (`EMPTY_DEBUG`), Mundo, Lugar e Família mostram estados vazios que
 * dizem o porquê; Eventos, Desempenho e Tempo não dependem dela.
 */

export type DebugTab = 'world' | 'place' | 'family' | 'events' | 'perf' | 'time';

export const DEBUG_TABS: [DebugTab, string][] = [
  ['world', 'Mundo'],
  ['place', 'Lugar'],
  ['family', 'Família'],
  ['events', 'Eventos'],
  ['perf', 'Desempenho'],
  ['time', 'Tempo'],
];

/** Eventos guardados no anel da aba Eventos e quantos dele a aba mostra de uma vez. */
export const DEBUG_EVENT_LIMIT = 500;
export const DEBUG_EVENT_ROWS = 200;
/** Quadros guardados para os gráficos da aba Desempenho. */
export const DEBUG_FRAME_LIMIT = 120;
/** Orçamento de um quadro a 60 por segundo (ms), a linha tracejada do gráfico do passo. */
const FRAME_BUDGET_MS = 1000 / 60;

// Formatação ---------------------------------------------------------------

/** Texto do motor ou do mundo dentro do HTML (nomes, rótulos, porquês). */
export function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Número curto em português: inteiro como está; o resto com 2 casas (1 a partir de 10, nenhuma a partir de 100). */
export function num(v: number): string {
  if (Number.isNaN(v)) return '—';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (Number.isInteger(v)) return String(v);
  const a = Math.abs(v);
  return (a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2)).replace('.', ',');
}

/** Ano com uma casa ("ano 120,4"). */
export const yearText = (y: number) => `ano ${y.toFixed(1).replace('.', ',')}`;

const ms = (v: number) => `${v.toFixed(v >= 10 ? 1 : 2).replace('.', ',')} ms`;

/** Barra com o número escrito ao lado (nunca só a cor). `info` é o tom neutro (tempo, rendimento). */
export function meter(frac: number, text: string, tone: 'good' | 'warn' | 'bad' | 'info' | '' = ''): string {
  const f = Number.isFinite(frac) ? Math.max(0, Math.min(1, frac)) : 0;
  const t = tone || (f >= 0.7 ? 'good' : f >= 0.4 ? 'warn' : 'bad');
  return `<span class="wb-meter wb-dmeter ${t}"><i style="width:${(f * 100).toFixed(0)}%"></i></span><span class="wb-meter-text">${text}</span>`;
}

/** Estado vazio com o porquê (a vista do motor vazia, a gravação desligada, nada selecionado). */
export function emptyState(title: string, why: string): string {
  return `<div class="wb-dempty"><b>${title}</b><span>${why}</span></div>`;
}

/** Linha de nome e valor. */
const kv = (label: string, value: string, extra = '') => `<div class="wb-kv"><span>${label}</span><b>${value}</b>${extra ? `<span class="wb-dim">${extra}</span>` : ''}</div>`;

/**
 * Gráfico de linha pequeno em SVG: a série (valores que não são número ficam de fora) e, se houver, a faixa da
 * meta (`band`, com ±∞ para "sem piso" e "sem teto") ao fundo.
 */
export function sparkSvg(values: number[], band?: [number, number], tone = ''): string {
  const pts = values.map((v, k) => [k, v] as const).filter(([, v]) => Number.isFinite(v));
  if (pts.length < 2) return '<span class="wb-dspark wb-dim">série curta</span>';
  const W = 120;
  const H = 26;
  let lo = Math.min(...pts.map(([, v]) => v));
  let hi = Math.max(...pts.map(([, v]) => v));
  if (band && Number.isFinite(band[0])) lo = Math.min(lo, band[0]);
  if (band && Number.isFinite(band[1])) hi = Math.max(hi, band[1]);
  if (hi - lo < 1e-9) hi = lo + 1;
  const y = (v: number) => H - 2 - ((v - lo) / (hi - lo)) * (H - 4);
  const last = values.length - 1;
  const line = pts.map(([k, v]) => `${((k / Math.max(1, last)) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  let rect = '';
  if (band) {
    const top = y(Math.min(band[1], hi));
    const bottom = y(Math.max(band[0], lo));
    rect = `<rect class="band" x="0" y="${top.toFixed(1)}" width="${W}" height="${Math.max(1, bottom - top).toFixed(1)}"/>`;
  }
  return `<svg class="wb-dspark ${tone}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${rect}<polyline points="${line}"/></svg>`;
}

/**
 * Barras verticais em SVG (uma por quadro, de 0 a `max`): `tone` dá a classe de cada barra, `line` uma linha de
 * referência e `over` uma série desenhada por cima como linha, na escala dela.
 */
export function barsSvg(values: number[], max: number, tone: (k: number) => string = () => '', line?: number, over?: number[]): string {
  const n = Math.max(values.length, 1);
  const H = 40;
  const top = Math.max(max, 1e-9);
  const rects = values
    .map((v, k) => {
      const h = Math.max(0, Math.min(1, v / top)) * H;
      return h > 0 ? `<rect class="${tone(k)}" x="${k}" y="${(H - h).toFixed(2)}" width="0.8" height="${h.toFixed(2)}"/>` : '';
    })
    .join('');
  const ref = line !== undefined && line <= top ? `<line x1="0" x2="${n}" y1="${(H - (line / top) * H).toFixed(2)}" y2="${(H - (line / top) * H).toFixed(2)}"/>` : '';
  let poly = '';
  if (over?.length) {
    const top2 = Math.max(1, ...over);
    poly = `<polyline class="over" points="${over.map((v, k) => `${k + 0.4},${(H - 1 - (Math.max(0, v) / top2) * (H - 2)).toFixed(2)}`).join(' ')}"/>`;
  }
  return `<svg class="wb-dbars" viewBox="0 0 ${n} ${H}" preserveAspectRatio="none">${rects}${ref}${poly}</svg>`;
}

// Anel ------------------------------------------------------------------

/** Anel de tamanho fixo (os mais velhos saem): os eventos e os quadros do painel. */
export class Ring<T> {
  private readonly items: T[] = [];
  private head = 0;
  /** Quantos já entraram desde o começo (inclusive os que já saíram). */
  total = 0;

  constructor(readonly capacity: number) {}

  push(x: T): void {
    this.total++;
    if (this.items.length < this.capacity) this.items.push(x);
    else {
      this.items[this.head] = x;
      this.head = (this.head + 1) % this.capacity;
    }
  }

  get size(): number {
    return this.items.length;
  }

  /** Do mais velho ao mais novo. */
  toArray(): T[] {
    return this.items.slice(this.head).concat(this.items.slice(0, this.head));
  }

  /** Do mais novo ao mais velho. */
  newest(): T[] {
    return this.toArray().reverse();
  }

  clear(): void {
    this.items.length = 0;
    this.head = 0;
  }
}

// Nomes -------------------------------------------------------------------

/** O pedaço da vista de que o painel tira nomes e pessoas. */
export type NamesView = Pick<EngineView, 'villages' | 'species'>;
export type PeopleView = NamesView & Pick<EngineView, 'count' | 'alive' | 'uid' | 'village' | 'family' | 'kind' | 'age' | 'role'>;

/** Nome do lugar pelo id (abandonado também tem nome; o que não existe vira "#id"). */
export const placeName = (view: NamesView, id: number): string => (id >= 0 && view.villages[id] ? view.villages[id].name : `#${id}`);

/** Sobrenome da família, pela cultura do lugar onde ela mora (-1 é a família sem ninguém identificado). */
export function familyLabel(view: NamesView, family: number, village: number): string {
  if (family < 0) return 'família sem nome';
  const v = village >= 0 ? view.villages[village] : undefined;
  return v ? familyName(family, v.culture.id) : `família ${family}`;
}

/** A pessoa fixada na ficha e a família dela, contada na vista (quem tem o mesmo `family`). */
export interface PersonInfo {
  i: number;
  name: string;
  age: number;
  family: number;
  familyName: string;
  village: number;
  members: number;
  adults: number;
  /** Lugares onde moram os da família, o da pessoa primeiro (pode haver mais de um depois de uma mudança). */
  places: number[];
}

/** A pessoa `i` e a família dela, ou null se não é gente de um lugar (bicho, sem assentamento, morta). */
export function personInfo(view: PeopleView, i: number): PersonInfo | null {
  if (i < 0 || i >= view.count || !view.alive[i]) return null;
  const sp = view.species[view.kind[i]];
  const village = view.village[i];
  if (!sp || sp.kind !== 'sapient' || village < 0 || !view.villages[village]) return null;
  const family = view.family[i];
  let members = 0;
  let adults = 0;
  // O lugar da pessoa primeiro; depois os outros onde a família mora.
  const places = new Set<number>([village]);
  for (let k = 0; k < view.count; k++) {
    if (!view.alive[k] || view.family[k] !== family || view.kind[k] !== view.kind[i]) continue;
    members++;
    if (view.role[k] !== CHILD) adults++;
    if (view.village[k] >= 0) places.add(view.village[k]);
  }
  const culture = view.villages[village].culture.id;
  return { i, name: personName(view.uid[i], culture), age: view.age[i], family, familyName: familyName(family, culture), village, members, adults, places: [...places] };
}

// Shell ----------------------------------------------------------------------

/** A moldura do painel: cabeçalho, abas, corpo (que o componente reescreve) e a caixa do caso copiado. */
export function debugShellHtml(): string {
  return `
    <div class="wb-win-head"><b>Depuração</b><span class="wb-dsum" data-dsum></span><button class="wb-x" data-dclose title="Fechar (F3 ou Esc)">✕</button></div>
    <div class="wb-vtabs wb-dtabs">${DEBUG_TABS.map(([id, label]) => `<button data-dtab="${id}">${label}</button>`).join('')}</div>
    <div class="wb-win-body" data-dbody></div>
    <div class="wb-dcase" data-dcase hidden>
      <div class="wb-dim">O navegador não deixou copiar sozinho: o caso está selecionado abaixo, copie com Ctrl+C.</div>
      <textarea readonly spellcheck="false"></textarea>
      <button class="wb-btn" data-dcase-close>Fechar</button>
    </div>`;
}

/** A linha do cabeçalho: semente, ano e passo. */
export const summaryText = (seed: number, year: number, tick: number) => `semente ${seed} · ${yearText(year)} · passo ${tick}`;

// Mundo -------------------------------------------------------------------

/** Dentro, fora ou sem valor, contra a meta. */
export function targetTone(v: number | undefined, t: Pick<DebugTarget, 'min' | 'max'>): 'good' | 'bad' | 'none' {
  if (v === undefined || !Number.isFinite(v)) return 'none';
  return v >= t.min && v <= t.max ? 'good' : 'bad';
}

/** "40 a 90", "pelo menos 50", "no máximo 0,2", "exatamente 0". */
export function rangeText(t: Pick<DebugTarget, 'min' | 'max'>): string {
  if (t.min === t.max) return `exatamente ${num(t.min)}`;
  if (!Number.isFinite(t.max)) return `pelo menos ${num(t.min)}`;
  if (!Number.isFinite(t.min) || (t.min === 0 && t.max <= 1)) return `no máximo ${num(t.max)}`;
  return `${num(t.min)} a ${num(t.max)}`;
}

const seriesOf = (series: IndicatorSample[], key: string) => series.map((s) => s.values[key] ?? NaN);

/** Nome legível de um indicador sem meta: o do relatório da calibração, ou a própria chave. */
export const indicatorLabel = (key: string): string => (LABELS as Record<string, string | undefined>)[key] ?? key;

/** Aba Mundo: semente, ano, desde quando as taxas contam, a gravação e os indicadores de agora contra as metas. */
export function worldHtml(w: WorldDebug, live: { seed: number; year: number }, recording: boolean): string {
  const keys = Object.keys(w.now.values);
  const empty = !w.targets.length && !keys.length && !w.series.length;
  // Sem a vista do motor, semente e ano vêm da fachada (engine.seed e view.year), que valem do mesmo jeito.
  const seed = empty ? live.seed : w.seed;
  const year = empty ? live.year : w.year;
  const head = `
    ${kv('Semente', String(seed))}
    ${kv('Ano', yearText(year).slice(4))}
    ${kv('Taxas desde', empty ? '—' : yearText(w.since), empty ? '' : `${num(Math.max(0, year - w.since))} anos medidos`)}
    <div class="wb-kv"><span>Gravação</span><b class="${recording ? 'good' : 'bad'}">${recording ? 'ligada' : 'desligada'}</b><button class="wb-btn" data-drec>${recording ? 'Desligar' : 'Ligar'}</button></div>`;
  if (empty) {
    return `${head}${emptyState('Sem indicadores do motor ainda', `A vista de depuração do motor (<code>engine.debug</code>) ainda não mede o mundo vivo${recording ? '' : ', e a gravação está desligada'}. Quando ela chegar, aqui aparecem os indicadores da calibração longa contra as metas, com a série de cada um.`)}`;
  }
  const row = (key: string, label: string, t?: DebugTarget) => {
    const v = w.now.values[key];
    const tone = t ? targetTone(v, t) : 'none';
    const mark = tone === 'good' ? '✓' : tone === 'bad' ? '✗' : '·';
    return `<div class="wb-dind ${tone}" title="${esc(key)}">
      <span class="wb-dlabel">${esc(label)}</span>
      <b>${mark} ${v === undefined ? '—' : num(v)}</b>
      <span class="wb-dim">${t ? `meta ${rangeText(t)}` : 'sem meta'}</span>
      ${sparkSvg(seriesOf(w.series, key), t ? [t.min, t.max] : undefined, tone)}
    </div>`;
  };
  // Os sem meta numa linha só: nome, valor e a série, sem a faixa.
  const mini = (key: string) => {
    const v = w.now.values[key];
    return `<div class="wb-dind mini" title="${esc(key)}"><span class="wb-dlabel">${esc(indicatorLabel(key))}</span><b>${v === undefined ? '—' : num(v)}</b>${sparkSvg(seriesOf(w.series, key))}</div>`;
  };
  const inside = w.targets.filter((t) => targetTone(w.now.values[t.key], t) === 'good').length;
  const others = keys.filter((k) => !w.targets.some((t) => t.key === k)).sort((a, b) => indicatorLabel(a).localeCompare(indicatorLabel(b), 'pt'));
  const span = w.series.length ? `${w.series.length} amostras, do ${yearText(w.series[0].year)} ao ${yearText(w.series[w.series.length - 1].year).slice(4)}` : 'sem série ainda';
  return `${head}
    <div class="wb-section">Indicadores contra as metas · ${inside} de ${w.targets.length} dentro</div>
    <div class="wb-dim wb-dnote">Medidos no ${yearText(w.now.year)}; a série tem ${span}. A faixa ao fundo do gráfico é a meta.</div>
    ${w.targets.map((t) => row(t.key, t.label, t)).join('') || '<div class="wb-empty">Nenhuma meta com indicador no mundo vivo.</div>'}
    ${others.length ? `<div class="wb-section">Outros indicadores · ${others.length}, sem meta</div>${others.map(mini).join('')}` : ''}`;
}

// Lugar -------------------------------------------------------------------

/** Uma linha da lista dos lugares vivos (para escolher sem seleção no mapa). */
export interface PlaceRow {
  id: number;
  name: string;
  population: number;
  tier: string;
}

/** Os lugares vivos da vista, do mais populoso ao menos. */
export function livePlaces(view: Pick<EngineView, 'villages' | 'tierName'>): PlaceRow[] {
  return view.villages
    .filter((v) => !v.abandoned && v.population > 0)
    .map((v) => ({ id: v.id, name: v.name, population: v.population, tier: view.tierName(v) }))
    .sort((a, b) => b.population - a.population || a.id - b.id);
}

/** Lista para escolher um lugar (o clique seleciona o lugar e leva a câmera até ele). */
export function placeListHtml(rows: PlaceRow[], limit = 40): string {
  if (!rows.length) return emptyState('Nenhum lugar vivo', 'Ainda não há assentamentos no mapa.');
  return `<div class="wb-section">Lugares vivos por população · ${rows.length}</div>
    <div class="wb-list">${rows
      .slice(0, limit)
      .map((r) => `<button class="wb-row" data-dplace="${r.id}"><i>#${r.id}</i>${esc(r.name)} <span class="wb-dim">${esc(r.tier)}</span><em>${r.population}</em></button>`)
      .join('')}</div>
    ${rows.length > limit ? `<div class="wb-note">e mais ${rows.length - limit}; selecione no mapa para ver um deles.</div>` : ''}`;
}

/** Barra da pressão: social e da terra somadas, com as marcas dos limiares dos batedores e da fissão. */
export function pressureHtml(p: PlaceDebug['pressure']): string {
  const max = Math.max(p.fission * 1.25, p.scout * 1.25, p.total * 1.05, 1e-6);
  const pct = (v: number) => `${((Math.max(0, v) / max) * 100).toFixed(1)}%`;
  const tone = p.total >= p.fission ? 'bad' : p.total >= p.scout ? 'warn' : 'good';
  const state = p.total >= p.fission ? 'acima da fissão' : p.total >= p.scout ? 'batedores procurando sítio' : 'abaixo dos batedores';
  return `<div class="wb-dpress" title="Pressão ${num(p.total)} de ${num(max)} na escala">
      <i class="soc" style="width:${pct(p.social)}"></i><i class="land" style="left:${pct(p.social)};width:${pct(p.land)}"></i>
      <u class="scout" style="left:${pct(p.scout)}"></u><u class="fission" style="left:${pct(p.fission)}"></u>
    </div>
    <div class="wb-dpress-legend"><span><i class="soc"></i>social ${num(p.social)}</span><span><i class="land"></i>terra ${num(p.land)}</span><b class="${tone}">= ${num(p.total)} · ${state}</b></div>
    <div class="wb-dpress-legend"><span><u class="scout"></u>batedores a partir de ${num(p.scout)}</span><span><u class="fission"></u>fissão a partir de ${num(p.fission)}</span></div>`;
}

/** Fatores como barras, na escala do maior (ou de 0 a 1, com `unit`). */
export function factorBars(list: DebugFactor[], opts: { unit?: boolean; tone?: 'info' | '' } = {}): string {
  if (!list.length) return '<div class="wb-empty">nada</div>';
  const top = opts.unit ? 1 : Math.max(1e-9, ...list.map((f) => Math.abs(f.value)));
  return list.map((f) => `<div class="wb-kv"><span>${esc(f.name)}</span>${meter(Math.abs(f.value) / top, num(f.value), f.value < 0 ? 'bad' : (opts.tone ?? ''))}</div>`).join('');
}

/** Aba Lugar com um lugar escolhido: tudo do `PlaceDebug` e as últimas decisões das famílias dali. */
export function placeHtml(p: PlaceDebug, decisions: FamilyDecision[], view: NamesView): string {
  const eraFrac = p.era.tech - Math.floor(p.era.tech);
  return `
    <div class="wb-dtitle"><b>${esc(p.name)}</b> <span class="wb-dim">#${p.id}</span><button class="wb-link" data-dlist>todos os lugares</button></div>
    ${kv('População', `${p.population} moradores`)}
    ${kv('Fundação', yearText(p.founded), `${num(p.age)} anos`)}
    ${kv('Modo de vida', LIFEWAY_NAMES[p.lifeway] ?? p.lifeway)}
    <div class="wb-section">Pressão</div>
    ${pressureHtml(p.pressure)}
    ${kv('Cercado', p.circumscribed > 0 ? `há ${p.circumscribed} ${p.circumscribed === 1 ? 'ano' : 'anos'}` : 'não', p.circumscribed > 0 ? 'pressão acima da fissão sem sítio livre' : '')}
    <div class="wb-section">Era</div>
    <div class="wb-kv"><span>${esc(p.era.name)}</span>${meter(eraFrac, `${Math.floor(eraFrac * 100 + 1e-6)}% rumo à próxima`, 'info')}</div>
    ${kv('Trava', p.era.blocked ? esc(p.era.blocked) : 'nada trava')}
    <div class="wb-section">Captação · raio de ${num(p.catchment)} tiles</div>
    ${factorBars(p.area, { tone: 'info' })}
    <div class="wb-section">Necessidades</div>
    ${factorBars(p.needs, { unit: true })}
    <div class="wb-kv"><span>Estabilidade</span>${meter(p.stability, num(p.stability))}</div>
    ${kv('Falta', p.lack ? `${esc(p.lack.what)} há ${p.lack.years} ${p.lack.years === 1 ? 'ano' : 'anos'}` : 'nada falta')}
    <div class="wb-section">Taxas por ano</div>
    ${p.rates.length ? p.rates.map((r) => kv(esc(r.name), num(r.value))).join('') : '<div class="wb-empty">nenhuma</div>'}
    ${kv('Nota do sítio', p.site === null ? 'sem campo' : num(p.site), 'pela regra de hoje, no centro')}
    <div class="wb-section">Últimas decisões das famílias daqui</div>
    ${decisionListHtml(decisions, view, { full: 0, empty: 'Nenhuma família daqui decidiu nada desde que a gravação ligou.' })}`;
}

/**
 * Aba Lugar inteira: o lugar `id` (do mapa ou da lista), ou a lista dos lugares vivos quando não há lugar (ou
 * quando o jogador pediu a lista). Sem a vista do motor para o lugar, o estado vazio diz o porquê.
 */
export function placeTabHtml(id: number, place: PlaceDebug | null, decisions: FamilyDecision[], rows: PlaceRow[], view: NamesView, recording: boolean): string {
  if (id < 0) return `<div class="wb-dim wb-dnote">Selecione um lugar no mapa (a praça, um prédio, ou uma pessoa dele) ou escolha abaixo.</div>${placeListHtml(rows)}`;
  if (place) return placeHtml(place, decisions, view);
  return `<div class="wb-dtitle"><b>${esc(placeName(view, id))}</b> <span class="wb-dim">#${id}</span><button class="wb-link" data-dlist>todos os lugares</button></div>
    ${emptyState('Sem a vista deste lugar', `A vista de depuração do motor ainda não descreve os lugares (pressão, cerco, modo de vida, captação, falta)${recording ? '' : ', e a gravação está desligada'}.`)}
    ${placeListHtml(rows, 12)}`;
}

// Família -------------------------------------------------------------------

/** Cabeçalho de uma decisão: quando, quem, onde, e o que escolheu. */
function decisionHead(d: FamilyDecision, view: NamesView): string {
  return `<span class="wb-yr">${yearText(d.year)}</span><b>${esc(familyLabel(view, d.family, d.village))}</b> em ${esc(placeName(view, d.village))} · ${d.adults} ${d.adults === 1 ? 'adulto' : 'adultos'}${d.exodus ? ' · <span class="bad">êxodo</span>' : ''}`;
}

const scoreTop = (opts: DebugOption[]) => Math.max(1, ...opts.map((o) => Math.abs(o.score)));

/** As opções numa decisão, a escolhida primeiro, como barras da nota. */
function optionBars(d: FamilyDecision, more = 3): string {
  const opts = [d.picked, ...d.others];
  const top = scoreTop(opts);
  const rows = opts.slice(0, more + 1).map((o, k) => `<div class="wb-kv wb-dopt${k ? '' : ' on'}"><span>${k ? '' : '✓ '}${esc(o.label)}</span>${meter(Math.abs(o.score) / top, num(o.score), k ? 'info' : 'good')}</div>`);
  return rows.join('') + (opts.length > more + 1 ? `<div class="wb-note">e mais ${opts.length - more - 1} opções</div>` : '');
}

/**
 * A escolhida contra as outras, fator por fator: uma coluna por opção (a escolhida e as melhores das outras),
 * uma linha por fator, na ordem dos fatores da escolhida (do que mais puxou para baixo ao que menos).
 */
export function decisionTableHtml(d: FamilyDecision, columns = 3): string {
  const opts = [d.picked, ...d.others.slice(0, columns - 1)];
  const names: string[] = [];
  for (const o of opts) for (const f of o.factors) if (!names.includes(f.name)) names.push(f.name);
  const top = Math.max(1, ...opts.flatMap((o) => o.factors.map((f) => Math.abs(f.value))));
  const st = scoreTop([d.picked, ...d.others]);
  const head = opts.map((o, k) => `<th class="${k ? '' : 'on'}">${k ? '' : '✓ '}${esc(o.label)}<br>${meter(Math.abs(o.score) / st, num(o.score), k ? 'info' : 'good')}</th>`).join('');
  const rows = names
    .map((n) => {
      const cells = opts.map((o) => {
        const f = o.factors.find((x) => x.name === n);
        return `<td>${f ? meter(Math.abs(f.value) / top, num(f.value), f.value < 0 ? 'bad' : '') : '<span class="wb-dim">—</span>'}</td>`;
      });
      return `<tr><td class="wb-dfac">${esc(n)}</td>${cells.join('')}</tr>`;
    })
    .join('');
  const hidden = d.others.length - (columns - 1);
  return `<table class="wb-table wb-dopts"><tr><th>Fator</th>${head}</tr>${rows || `<tr><td colspan="${opts.length + 1}" class="wb-dim">sem fatores</td></tr>`}</table>${hidden > 0 ? `<div class="wb-note">e mais ${hidden} ${hidden === 1 ? 'opção' : 'opções'}, abaixo da última coluna</div>` : ''}`;
}

/** Uma decisão: o cabeçalho (o clique seleciona o lugar e leva a câmera até ele), o porquê e as opções. */
export function decisionHtml(d: FamilyDecision, view: NamesView, full: boolean): string {
  return `<div class="wb-ddec">
    <button class="wb-row wb-ddec-head" data-dplace="${d.village}" data-dfam="${d.family}" title="Seleciona ${esc(placeName(view, d.village))} e leva a câmera até lá">${decisionHead(d, view)}<em>📍</em></button>
    <div class="wb-ddec-why">${esc(d.why)}</div>
    ${full ? decisionTableHtml(d) : optionBars(d)}
  </div>`;
}

/** Lista de decisões: as `full` primeiras com a tabela dos fatores, as outras com as notas das opções. */
export function decisionListHtml(list: FamilyDecision[], view: NamesView, opts: { full: number; empty: string }): string {
  if (!list.length) return `<div class="wb-empty">${opts.empty}</div>`;
  return list.map((d, k) => decisionHtml(d, view, k < opts.full)).join('');
}

/**
 * Aba Família: a pessoa fixada leva à família dela e às decisões dela; uma família escolhida numa decisão (sem
 * pessoa fixada) também; sem nenhuma, as últimas decisões do mundo.
 */
export function familyTabHtml(args: {
  person: PersonInfo | null;
  /** Família escolhida pelo clique numa decisão (sem pessoa fixada). */
  focus: { family: number; village: number } | null;
  decisions: FamilyDecision[];
  view: NamesView;
  recording: boolean;
}): string {
  const { person, focus, decisions, view, recording } = args;
  const why = recording
    ? 'A vista de depuração do motor ainda não grava as decisões de mudança (ficar, migrar ou fundar), ou nenhuma aconteceu desde que a gravação ligou.'
    : 'A gravação da vista de depuração está desligada (ligue na aba Mundo); sem ela o motor não guarda as decisões.';
  if (person) {
    const where = person.places.map((id) => esc(placeName(view, id))).join(', ');
    return `
      <div class="wb-dtitle"><b>${esc(person.name)} ${esc(person.familyName)}</b> <span class="wb-dim">${person.age.toFixed(0)} anos</span></div>
      ${kv('Família', `${esc(person.familyName)} <span class="wb-dim">#${person.family}</span>`)}
      ${kv('Gente', `${person.members} ${person.members === 1 ? 'pessoa' : 'pessoas'}, ${person.adults} ${person.adults === 1 ? 'adulta' : 'adultas'}`)}
      ${kv('Mora em', where || '—')}
      <div class="wb-section">Decisões da família</div>
      ${decisions.length ? decisionListHtml(decisions, view, { full: decisions.length, empty: '' }) : emptyState('Nenhuma decisão desta família', why)}`;
  }
  if (focus) {
    return `
      <div class="wb-dtitle"><b>Família ${esc(familyLabel(view, focus.family, focus.village))}</b> <span class="wb-dim">#${focus.family}</span><button class="wb-link" data-dall>todas as decisões</button></div>
      <div class="wb-dim wb-dnote">Escolhida numa decisão. Fixe uma pessoa no mapa para ver a família dela.</div>
      ${decisions.length ? decisionListHtml(decisions, view, { full: decisions.length, empty: '' }) : emptyState('Nenhuma decisão desta família', why)}`;
  }
  return `
    <div class="wb-dim wb-dnote">Sem pessoa fixada: as últimas decisões do mundo. Fixe uma pessoa no mapa (clique nela) para ver a família dela; clique numa decisão para ir ao lugar e ver a família.</div>
    <div class="wb-section">Últimas decisões do mundo</div>
    ${decisions.length ? decisionListHtml(decisions, view, { full: 1, empty: '' }) : emptyState('Nenhuma decisão gravada', why)}`;
}

// Eventos -------------------------------------------------------------------

/** Nome de cada tipo de evento, para os chips do filtro. */
export const EVENT_KIND_NAMES: Record<EngineEventKind, string> = {
  found: 'Fundação',
  colony: 'Colônia',
  farmstead: 'Sítio rural',
  migrate: 'Mudança',
  fission: 'Fissão',
  circumscribed: 'Cerco',
  exodus: 'Êxodo',
  abandon: 'Abandono',
  merge: 'Fusão',
  tierUp: 'Subiu de nível',
  tierDown: 'Desceu de nível',
  polity: 'Política',
  era: 'Era',
  tech: 'Técnica',
  warStart: 'Guerra',
  warEnd: 'Paz',
  conquest: 'Conquista',
  revolt: 'Revolta',
  independence: 'Independência',
  annex: 'Anexação',
  disaster: 'Desastre',
  extinction: 'Extinção',
};

const DISASTER_NAMES: Record<DisasterKind, string> = {
  comet: 'Cometa',
  quake: 'Terremoto',
  volcano: 'Vulcão',
  island: 'Ilha vulcânica',
  fire: 'Incêndio florestal',
  drought: 'Seca',
  plague: 'Peste',
  wildfire: 'Incêndio por raio',
  epidemic: 'Epidemia',
  engulfed: 'Lugar tragado',
};

const MIGRATE_CAUSES: Record<MigrateCause, string> = { move: 'busca de vida melhor', lastWave: 'última leva', refuge: 'refúgio na falta' };

/** Resumo de um evento quando ele não vira aviso (`noticeText`): todos os tipos, pelos ids e pela vista. */
export function eventSummary(e: EngineEvent, view: NamesView): string {
  const p = (id: number) => placeName(view, id);
  const people = (n: number) => `${n} ${n === 1 ? 'pessoa' : 'pessoas'}`;
  switch (e.kind) {
    case 'found':
      return `Fundação de ${p(e.village)}${e.from >= 0 ? ` por gente de ${p(e.from)}` : ''} (${e.how})`;
    case 'colony':
      if (e.phase === 'depart') return `Colonos de ${p(e.from)} partem ${e.by === 'sea' ? 'pelo mar' : `por terra para ${p(e.to)}`} (${people(e.people)})`;
      return e.to >= 0 ? `Colonos de ${p(e.from)} chegam a ${p(e.to)} (${people(e.people)})` : `Colonos de ${p(e.from)} se perderam (${people(e.people)})`;
    case 'farmstead':
      return `${p(e.village)} abriu um sítio rural`;
    case 'migrate':
      return `${e.family >= 0 ? `Família ${familyLabel(view, e.family, e.from)}` : 'O lugar inteiro'} (${people(e.people)}) de ${p(e.from)} para ${e.to >= 0 ? p(e.to) : 'lugar nenhum'} · ${MIGRATE_CAUSES[e.cause]}`;
    case 'fission':
      return `${p(e.from)} (${e.population} moradores, pressão ${num(e.pressure)}) se dividiu: ${people(e.people)} fundaram ${p(e.to)}`;
    case 'circumscribed':
      return `${p(e.village)} cercado há ${e.years} ${e.years === 1 ? 'ano' : 'anos'} (pressão ${num(e.pressure)})`;
    case 'exodus':
      return `Êxodo de ${p(e.village)} por falta de ${e.lack}`;
    case 'abandon':
      return `${p(e.village)} ficou vazio${e.to >= 0 ? `; os últimos foram para ${p(e.to)}` : ''}`;
    case 'merge':
      return `${p(e.village)} virou bairro de ${p(e.into)}`;
    case 'tierUp':
    case 'tierDown':
      return `${p(e.village)} ${e.kind === 'tierUp' ? 'subiu' : 'desceu'} para ${TIER_NAMES_NEW[e.tier] ?? `o nível ${e.tier}`}`;
    case 'polity':
      return `${p(e.village)}: ${POLITY_NAMES[e.was]} → ${POLITY_NAMES[e.polity]} (${e.places} ${e.places === 1 ? 'lugar' : 'lugares'})`;
    case 'era':
      return `${p(e.village)} entrou na ${ERAS[e.era] ?? `era ${e.era + 1}`}${e.first ? ', a primeira do mundo' : ''}`;
    case 'tech':
      return `${p(e.village)} ${e.lost ? 'esqueceu' : 'aprendeu'} ${TECH_BY_ID[e.tech]?.name ?? e.tech}${e.first && !e.lost ? ' (primeira vez no mundo)' : ''}`;
    case 'warStart':
      return `Guerra: ${p(e.a)} contra ${p(e.b)}, alvo ${p(e.target)} (${WAR_MOTIVES[e.motive] ?? e.motive}${e.naval ? ', pelo mar' : ''})`;
    case 'warEnd':
      return `Fim da guerra entre ${p(e.a)} e ${p(e.b)} depois de ${num(e.years)} anos`;
    case 'conquest':
      return e.razed ? `${p(e.winner)} arrasou ${p(e.village)}, de ${p(e.loser)}` : `${p(e.winner)} tomou ${p(e.village)} de ${p(e.loser)}`;
    case 'revolt':
      return `Revolta em ${p(e.village)} contra ${p(e.against)} (${e.cause === 'stability' ? 'instabilidade' : 'lealdade'})`;
    case 'independence':
      return `${p(e.village)} se separou de ${p(e.from)} e virou capital`;
    case 'annex':
      return `${p(e.village)} passou ${e.from >= 0 ? `de ${p(e.from)} ` : ''}para ${p(e.to)} em paz`;
    case 'disaster':
      return `${DISASTER_NAMES[e.what] ?? e.what} ${e.village >= 0 ? `em ${p(e.village)}` : `em (${Math.round(e.x)}, ${Math.round(e.y)})`}`;
    case 'extinction':
      return `Extinção: ${view.species[e.species]?.name ?? `espécie ${e.species}`}`;
  }
}

/** O lugar principal de um evento (para onde o clique leva), ou -1. */
export function eventPlace(e: EngineEvent): number {
  switch (e.kind) {
    case 'colony':
    case 'migrate':
      return e.to >= 0 ? e.to : e.from;
    case 'fission':
      return e.to;
    case 'warStart':
    case 'warEnd':
      return e.target;
    case 'extinction':
      return -1;
    default:
      return e.village;
  }
}

/** Um evento guardado no anel: o texto e os lugares saem na chegada (o nome e o cerco são os daquele instante). */
export interface EventEntry {
  /** Ordem de chegada desde que o painel nasceu. */
  n: number;
  e: EngineEvent;
  text: string;
  /** Lugares envolvidos (filtro do lugar selecionado). */
  places: number[];
  /** Para onde o clique leva: um lugar, um ponto (desastre fora de lugar) ou nada. */
  go: { place: number } | { x: number; y: number } | null;
}

export function eventEntry(e: EngineEvent, view: EngineView, n: number): EventEntry {
  const place = eventPlace(e);
  const go = place >= 0 && view.villages[place] ? { place } : e.kind === 'disaster' ? { x: e.x, y: e.y } : null;
  return { n, e, text: noticeText(e, view) ?? eventSummary(e, view), places: eventVillages(e), go };
}

/** Filtro da aba Eventos: os tipos ligados (nenhum = todos) e se só os do lugar selecionado. */
export interface EventFilter {
  kinds: ReadonlySet<EngineEventKind>;
  onlyPlace: boolean;
}

/** Os eventos que passam no filtro, dos mais novos aos mais velhos. */
export function filterEvents(list: EventEntry[], f: EventFilter, place: number): EventEntry[] {
  return list.filter((x) => (!f.kinds.size || f.kinds.has(x.e.kind)) && (!f.onlyPlace || place < 0 || x.places.includes(place)));
}

/** Aba Eventos: chips por tipo e do lugar selecionado, e os eventos (o clique leva ao lugar). */
export function eventsHtml(newest: EventEntry[], f: EventFilter, place: number, view: NamesView, total: number): string {
  const counts = new Map<EngineEventKind, number>();
  for (const x of newest) counts.set(x.e.kind, (counts.get(x.e.kind) ?? 0) + 1);
  const kinds = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b));
  const chip = (attr: string, on: boolean, label: string, n?: number, disabled = false) =>
    `<button class="wb-chip${on ? ' on' : ''}" ${attr}${disabled ? ' disabled' : ''}>${label}${n !== undefined ? ` <b>${n}</b>` : ''}</button>`;
  const chips = [
    chip('data-dkind=""', !f.kinds.size, 'Todos', newest.length),
    ...kinds.map((k) => chip(`data-dkind="${k}"`, f.kinds.has(k), EVENT_KIND_NAMES[k] ?? k, counts.get(k))),
  ].join('');
  const where = place >= 0 ? `Só ${esc(placeName(view, place))}` : 'Só o lugar selecionado';
  const shown = filterEvents(newest, f, place);
  const rows = shown
    .slice(0, DEBUG_EVENT_ROWS)
    .map((x) => {
      const attr = x.go ? ('place' in x.go ? `data-dplace="${x.go.place}"` : `data-dgo="${x.go.x.toFixed(1)},${x.go.y.toFixed(1)}"`) : '';
      return `<button class="wb-row wb-devent" ${attr}><span class="wb-yr">${yearText(x.e.year).slice(4)}</span><span class="wb-dkind">${EVENT_KIND_NAMES[x.e.kind] ?? x.e.kind}</span>${esc(x.text)}${x.go ? '<em>📍</em>' : ''}</button>`;
    })
    .join('');
  const empty = !newest.length ? 'Nenhum evento do motor ainda: eles chegam enquanto o tempo anda.' : 'Nenhum evento com esse filtro.';
  return `
    <div class="wb-chips">${chips}</div>
    <div class="wb-chips">${chip('data-donly', f.onlyPlace && place >= 0, where, undefined, place < 0)}</div>
    <div class="wb-list">${rows || `<div class="wb-empty">${empty}</div>`}</div>
    <div class="wb-note">${shown.length > DEBUG_EVENT_ROWS ? `Mostrando os ${DEBUG_EVENT_ROWS} mais novos de ${shown.length} no filtro. ` : ''}O anel guarda os últimos ${DEBUG_EVENT_LIMIT} (${newest.length} agora, ${total} desde que a superfície abriu).</div>`;
}

// Desempenho ----------------------------------------------------------------

/** Um quadro, para os gráficos: tempo do quadro e as medidas do relógio nele. */
export interface FrameSample {
  frameMs: number;
  steps: number;
  stepMs: number;
  /** Tempo de jogo (s) descartado pelo teto. */
  dropped: number;
  events: number;
}

/** As medidas de `surface.stats` (console do `?debug`): o relógio, a repintura do mapa, o passo e o log. */
export interface SurfaceStats {
  driver: { steps: number; stepMs: number; dropped: number; totalSteps: number; totalMs: number; events: number; totalEvents: number };
  raster: { tiles: number; changed: number; blocks: number; pixels: number; totalPixels: number };
  tick: number;
  log: number;
}

/** Quadros por segundo pela média do tempo dos quadros (0 sem amostra). */
export function fpsOf(frames: FrameSample[]): number {
  const ok = frames.filter((f) => f.frameMs > 0);
  if (!ok.length) return 0;
  return 1000 / (ok.reduce((s, f) => s + f.frameMs, 0) / ok.length);
}

/** Aba Desempenho: os últimos quadros em gráfico, FPS, as medidas da superfície e as partes do passo. */
export function perfHtml(frames: FrameSample[], stats: SurfaceStats, profile: ProfileDebug | null, recording: boolean): string {
  const fps = fpsOf(frames);
  const worst = frames.reduce((m, f) => Math.max(m, f.frameMs), 0);
  const last = frames[frames.length - 1];
  const stepMax = Math.max(FRAME_BUDGET_MS, ...frames.map((f) => f.stepMs));
  const stepsMax = Math.max(3, ...frames.map((f) => f.steps));
  const d = stats.driver;
  const r = stats.raster;
  const lost = frames.filter((f) => f.dropped > 0).length;
  const charts = frames.length
    ? `<div class="wb-dchart"><span>Tempo do passo por quadro · até ${ms(stepMax)} (tracejado: um quadro a 60 por segundo)</span>${barsSvg(
        frames.map((f) => f.stepMs),
        stepMax,
        (k) => (frames[k].dropped > 0 ? 'bad' : ''),
        FRAME_BUDGET_MS,
      )}</div>
      <div class="wb-dchart"><span>Passos por quadro (barras, vermelho com descarte) e eventos por quadro (linha)</span>${barsSvg(
        frames.map((f) => f.steps),
        stepsMax,
        (k) => (frames[k].dropped > 0 ? 'bad' : 'info'),
        undefined,
        frames.map((f) => f.events),
      )}</div>`
    : '<div class="wb-empty">Sem quadros medidos ainda.</div>';
  const step = profile?.msPerStep ?? 0;
  const prof = profile
    ? `${kv('Passos medidos', String(profile.steps), `${ms(profile.msPerStep)} por passo`)}${
        profile.parts.map((p) => `<div class="wb-kv"><span>${esc(p.name)}</span>${meter(step > 0 ? p.value / step : 0, `${ms(p.value)}${step > 0 ? ` · ${Math.round((p.value / step) * 100)}%` : ''}`, 'info')}</div>`).join('') ||
        '<div class="wb-empty">sem partes medidas</div>'
      }`
    : emptyState('Sem medição do passo', `A vista de depuração do motor ainda não mede as partes do passo${recording ? '' : ', e a gravação está desligada'}.`);
  return `
    <div class="wb-section">Quadros · últimos ${frames.length}</div>
    ${kv('FPS', fps ? num(Math.round(fps)) : '—', worst ? `pior quadro ${ms(worst)}` : '')}
    ${last ? kv('Último quadro', `${last.steps} ${last.steps === 1 ? 'passo' : 'passos'} em ${ms(last.stepMs)}`, `${last.events} eventos${last.dropped > 0 ? ` · ${num(last.dropped)} s de jogo descartados` : ''}`) : ''}
    ${kv('Descarte pelo teto', `${lost} de ${frames.length} quadros`, lost ? 'o computador não deu conta da velocidade' : '')}
    ${charts}
    <div class="wb-section">Superfície (surface.stats)</div>
    ${kv('Passos dados', String(d.totalSteps), `${ms(d.totalMs)} no total · ${d.totalSteps ? ms(d.totalMs / d.totalSteps) : '—'} por passo`)}
    ${kv('Eventos entregues', String(d.totalEvents))}
    ${kv('Passo (tick)', String(stats.tick), `log com ${stats.log} comandos`)}
    ${kv('Mapa repintado', `${r.tiles} tiles`, `${r.changed} mudaram de cor · ${r.blocks} blocos · ${r.pixels} pixels`)}
    ${kv('Pixels enviados', String(r.totalPixels), 'no total, ao canvas do mapa')}
    <div class="wb-section">Partes do passo (engine.debug.profile)</div>
    ${prof}`;
}

// Tempo -------------------------------------------------------------------

/** Aba Tempo: pausa e velocidades, avançar à mão, o relógio, o log e o caso copiado. */
export function timeHtml(args: {
  speed: number;
  seed: number;
  year: number;
  tick: number;
  log: number;
  logLimit: number;
  pending: number;
  stepsPerYear: number;
  fresh: boolean;
  last: { steps: number; ms: number } | null;
  copied: string;
}): string {
  const a = args;
  const speeds = SPEEDS.map((v, k) => `<button class="${k === a.speed ? 'on' : ''}" data-dspeed="${k}" title="${v === 0 ? 'Pausa (Espaço)' : `Velocidade ${v}x (${k + 1})`}">${v === 0 ? 'Pausa' : `${v}x`}</button>`).join('');
  return `
    <div class="wb-section">Velocidade</div>
    <div class="wb-speed wb-dspeed">${speeds}</div>
    <div class="wb-section">Avançar à mão</div>
    <div class="wb-dbtns">
      <button class="wb-btn" data-dstep="1">Avançar 1 passo</button>
      <button class="wb-btn" data-dstep="${a.stepsPerYear}">Avançar 1 ano (${a.stepsPerYear} passos)</button>
    </div>
    <div class="wb-dim wb-dnote">${a.last ? `Último avanço: ${a.last.steps} ${a.last.steps === 1 ? 'passo' : 'passos'} em ${ms(a.last.ms)}.` : 'Funciona também na pausa: a fila de comandos entra antes do primeiro passo, e os eventos saem no fim.'}</div>
    <div class="wb-section">Relógio</div>
    ${kv('Semente', String(a.seed))}
    ${kv('Ano', yearText(a.year).slice(4))}
    ${kv('Passo', String(a.tick), `${num(a.stepsPerYear)} por ano`)}
    ${kv('Log de comandos', String(a.log), `limite ${a.logLimit}${a.pending ? ` · ${a.pending} na fila` : ''}`)}
    <div class="wb-section">Caso para reproduzir</div>
    <div class="wb-dim wb-dnote">${
      a.fresh
        ? 'Semente, ano, passo, o planeta e o log de comandos: com eles o mundo é refeito do começo até aqui.'
        : 'Mundo que já existia (save ou visita anterior): a semente e o log só refazem o que aconteceu desde que a superfície abriu; para o resto, use o save.'
    }${a.log >= a.logLimit ? ' <span class="bad">O log chegou ao limite: os comandos mais antigos já saíram.</span>' : ''}</div>
    <div class="wb-dbtns"><button class="wb-btn" data-dcopy>Copiar caso</button>${a.copied ? `<span class="good">${esc(a.copied)}</span>` : ''}</div>`;
}

/** O caso que o botão Copiar caso leva: o bastante para refazer o mundo até este passo. */
export interface DebugCase {
  version: 1;
  seed: number;
  year: number;
  tick: number;
  /** Passo fixo (s de jogo) e segundos de jogo por ano. */
  step: number;
  yearSpan: number;
  /** O planeta (o mapa sai dele por `generateSurface`). */
  planet: PlanetParams;
  /** Mundo novo nesta visita (a semente e o log o refazem) ou adotado (save, visita anterior). */
  fresh: boolean;
  /** O log tem todos os comandos desde o passo 0 (não passou do limite). */
  complete: boolean;
  log: LoggedCommand<EngineCommand>[];
}

export function debugCase(a: Omit<DebugCase, 'version' | 'complete' | 'log'> & { log: readonly LoggedCommand<EngineCommand>[]; logLimit: number }): DebugCase {
  return {
    version: 1,
    seed: a.seed,
    year: a.year,
    tick: a.tick,
    step: a.step,
    yearSpan: a.yearSpan,
    planet: { ...a.planet },
    fresh: a.fresh,
    complete: a.log.length < a.logLimit,
    log: a.log.map((e) => ({ tick: e.tick, cmd: e.cmd })),
  };
}

/** O caso em JSON legível: os campos um por linha e cada comando do log numa linha só. */
export function caseJson(c: DebugCase): string {
  const { log, ...head } = c;
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  lines.push(`  "log": [${log.length ? `\n${log.map((e) => `    ${JSON.stringify(e)}`).join(',\n')}\n  ` : ''}]`);
  return `{\n${lines.join(',\n')}\n}`;
}
