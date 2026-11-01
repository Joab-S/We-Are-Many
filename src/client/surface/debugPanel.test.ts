import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../procgen/surface';
import { earthParams } from '../../sim/calibrate';
import { viewCommand, type EngineCommand } from '../../sim/api/commands';
import { DEBUG_DECISION_LIMIT, EMPTY_DEBUG, type DebugOption, type DebugView, type FamilyDecision, type PlaceDebug, type ProfileDebug } from '../../sim/api/debug';
import { createEngine, type EngineView } from '../../sim/api/engine';
import type { EngineEvent, EngineEventKind } from '../../sim/api/events';
import { CHILD } from '../../sim/roles';
import { nativeSpecies } from '../../sim/species';
import {
  caseJson,
  debugCase,
  decisionTableHtml,
  DEBUG_EVENT_LIMIT,
  DEBUG_EVENT_ROWS,
  eventEntry,
  eventsHtml,
  eventSummary,
  EVENT_KIND_NAMES,
  familyTabHtml,
  filterEvents,
  fpsOf,
  livePlaces,
  num,
  perfHtml,
  personInfo,
  placeHtml,
  placeTabHtml,
  pressureHtml,
  rangeText,
  Ring,
  sparkSvg,
  targetTone,
  timeHtml,
  worldHtml,
  type DebugCase,
  type EventEntry,
  type FrameSample,
  type PeopleView,
  type SurfaceStats,
} from './debugPanel';
import { LOG_LIMIT, SimDriver } from './SimDriver';

// Mundo de mentira ---------------------------------------------------------------

/** Quatro lugares (um abandonado) e duas espécies: o bastante para os nomes, a lista e os avisos. */
const villages = [
  { id: 0, name: 'Arana', population: 180, abandoned: false, x: 10, y: 20, kingdom: 0, culture: { id: 0 }, circumscribed: 0 },
  { id: 1, name: 'Beru', population: 45, abandoned: false, x: 40, y: 22, kingdom: 0, culture: { id: 0 }, circumscribed: 2 },
  { id: 2, name: 'Cota', population: 0, abandoned: true, x: 70, y: 30, kingdom: 2, culture: { id: 1 }, circumscribed: 0 },
  { id: 3, name: 'Duna', population: 320, abandoned: false, x: 90, y: 12, kingdom: 3, culture: { id: 1 }, circumscribed: 0 },
];
const view = {
  villages,
  species: [
    { name: 'Humano', kind: 'sapient' },
    { name: 'Lobo', kind: 'predator' },
  ],
  year: 120.4,
  tierName: (v: { population: number }) => (v.population >= 300 ? 'Cidade' : 'Aldeia'),
} as unknown as EngineView;

const opt = (label: string, score: number, factors: [string, number][]): DebugOption => ({ label, score, factors: factors.map(([name, value]) => ({ name, value })) });

const DECISIONS: FamilyDecision[] = [
  {
    year: 119.8,
    village: 1,
    family: 77,
    adults: 3,
    exodus: false,
    picked: opt('Migrar para Arana', 0.62, [
      ['distância', 0.71],
      ['comida lá', 0.88],
      ['costume', 0.95],
    ]),
    others: [
      opt('Ficar em Beru', 0.41, [
        ['pressão', 0.52],
        ['comida', 0.6],
        ['costume', 1],
      ]),
      opt('Fundar perto', 0.18, [
        ['sítio', 0.3],
        ['distância', 0.8],
      ]),
      opt('Migrar para Duna', 0.1, [['distância', 0.2]]),
    ],
    why: 'Beru está apertado (pressão 1,1) e Arana tem comida sobrando',
  },
  {
    year: 117.2,
    village: 0,
    family: 12,
    adults: 2,
    exodus: true,
    picked: opt('Fundar a leste', 0.5, [
      ['sítio', 0.7],
      ['falta', 0.9],
    ]),
    others: [opt('Ficar em Arana', 0.2, [['falta', 0.25]])],
    why: 'Êxodo: dois anos de falta de comida em Arana',
  },
  {
    year: 110,
    village: 1,
    family: 77,
    adults: 4,
    exodus: false,
    picked: opt('Ficar em Beru', 0.7, [['costume', 1]]),
    others: [],
    why: 'Bem onde está',
  },
];

const PLACE: PlaceDebug = {
  id: 0,
  name: 'Arana',
  population: 180,
  founded: 12.5,
  age: 107.9,
  lifeway: 'sedentario',
  pressure: { social: 0.82, land: 0.31, total: 1.13, scout: 0.8, fission: 1.2 },
  circumscribed: 3,
  era: { tech: 1.42, name: 'Idade do Bronze', blocked: 'falta estanho na captação' },
  catchment: 9,
  area: [
    { name: 'roça', value: 1.4 },
    { name: 'pasto', value: 0.6 },
    { name: 'pesca', value: 0.2 },
    { name: 'lenha', value: 0.9 },
  ],
  needs: [
    { name: 'Comida', value: 0.93 },
    { name: 'Lenha', value: 0.55 },
    { name: 'Abrigo', value: 0.3 },
  ],
  stability: 0.74,
  lack: { what: 'Lenha', years: 2 },
  rates: [
    { name: 'nascimentos', value: 6.2 },
    { name: 'mortes', value: 4.1 },
    { name: 'chegadas', value: 1.5 },
  ],
  site: 27.4,
};

const PROFILE: ProfileDebug = {
  steps: 480,
  msPerStep: 4.2,
  parts: [
    { name: 'pessoas', value: 2.1 },
    { name: 'bichos', value: 1.3 },
    { name: 'vegetação', value: 0.8 },
  ],
};

/** A vista de depuração falsa: metas da calibração longa, uma série de 30 anos, um lugar, decisões e a medição. */
function fakeDebug(): DebugView {
  const targets = [
    { key: 'settlements', label: 'Assentamentos vivos', min: 40, max: 90 },
    { key: 'medianPop', label: 'Mediana de moradores por assentamento', min: 50, max: Infinity },
    { key: 'smallShare', label: 'Parte dos lugares com menos de 15 moradores', min: 0, max: 0.2 },
    { key: 'housesOffStreet', label: 'Casas longe de rua ou trilha', min: 0, max: 0 },
  ];
  const series = Array.from({ length: 30 }, (_, k) => ({
    year: 91 + k,
    values: { settlements: 20 + k, medianPop: 30 + k * 0.8, smallShare: 0.35 - k * 0.005, housesOffStreet: k % 3, people: 900 + 15 * k },
  }));
  // settlements e medianPop dentro; smallShare e housesOffStreet fora; people sem meta.
  const now = { year: 120, values: { settlements: 49, medianPop: 53.2, smallShare: 0.205, housesOffStreet: 1, people: 1335 } };
  let on = false;
  return {
    setRecording(v) {
      on = v;
    },
    get recording() {
      return on;
    },
    world: () => ({ seed: 42, year: 120.4, since: 0, now, targets, series }),
    place: (id) => (id === 0 ? PLACE : null),
    decisions: (f = {}) => DECISIONS.filter((d) => (f.village === undefined || d.village === f.village) && (f.family === undefined || d.family === f.family)).slice(0, f.limit ?? DEBUG_DECISION_LIMIT),
    profile: () => (on ? PROFILE : null),
  };
}

const LIVE = { seed: 42, year: 120.4 };
const clean = (html: string) => {
  expect(html).not.toContain('undefined');
  expect(html).not.toContain('NaN');
  expect(html).not.toContain('[object');
};
const count = (html: string, needle: string) => html.split(needle).length - 1;

// Formatação ------------------------------------------------------------------

describe('painel de depuração: formatação e gráficos', () => {
  it('números curtos em português', () => {
    expect(num(42)).toBe('42');
    expect(num(0.205)).toBe('0,20');
    expect(num(53.24)).toBe('53,2');
    expect(num(1234.6)).toBe('1235');
    expect(num(Infinity)).toBe('∞');
    expect(num(NaN)).toBe('—');
  });

  it('a meta: dentro, fora ou sem valor, e o texto da faixa', () => {
    expect(targetTone(49, { min: 40, max: 90 })).toBe('good');
    expect(targetTone(0.205, { min: 0, max: 0.2 })).toBe('bad');
    expect(targetTone(undefined, { min: 0, max: 1 })).toBe('none');
    expect(rangeText({ min: 40, max: 90 })).toBe('40 a 90');
    expect(rangeText({ min: 50, max: Infinity })).toBe('pelo menos 50');
    expect(rangeText({ min: 0, max: 0.2 })).toBe('no máximo 0,20');
    expect(rangeText({ min: 0, max: 0 })).toBe('exatamente 0');
  });

  it('o gráfico pequeno pula os buracos da série e desenha a faixa da meta', () => {
    const svg = sparkSvg([1, NaN, 3, 2, 5], [2, 4], 'good');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('class="band"');
    expect(count(svg.split('points="')[1].split('"')[0], ',')).toBe(4);
    expect(sparkSvg([3])).toContain('série curta');
    clean(sparkSvg([0, 0, 0], [0, Infinity]));
  });

  it('o anel guarda os últimos e conta todos', () => {
    const r = new Ring<number>(DEBUG_EVENT_LIMIT);
    for (let k = 1; k <= 1200; k++) r.push(k);
    expect(r.size).toBe(DEBUG_EVENT_LIMIT);
    expect(r.total).toBe(1200);
    expect(r.toArray()[0]).toBe(701);
    expect(r.toArray().at(-1)).toBe(1200);
    expect(r.newest()[0]).toBe(1200);
    r.clear();
    expect(r.size).toBe(0);
  });
});

// Mundo ---------------------------------------------------------------------

describe('aba Mundo', () => {
  it('indicadores de agora contra as metas: verde dentro, vermelho fora, com a série de cada um', () => {
    const d = fakeDebug();
    d.setRecording(true);
    const html = worldHtml(d.world(), LIVE, d.recording);
    clean(html);
    expect(html).toContain('42');
    expect(html).toContain('120,4');
    expect(html).toContain('2 de 4 dentro');
    expect(html).toMatch(/wb-dind good" title="settlements"/);
    expect(html).toMatch(/wb-dind good" title="medianPop"/);
    expect(html).toMatch(/wb-dind bad" title="smallShare"/);
    expect(html).toMatch(/wb-dind bad" title="housesOffStreet"/);
    expect(html).toContain('meta pelo menos 50');
    expect(html).toContain('meta exatamente 0');
    // Um gráfico por indicador, com a meta ao fundo nos que têm meta; o que não tem meta vai em Outros.
    expect(count(html, '<polyline')).toBe(5);
    expect(count(html, 'class="band"')).toBe(4);
    expect(html).toContain('Outros indicadores');
    expect(html).toContain('30 amostras');
    expect(html).toContain('ligada');
  });

  it('com a vista vazia: estado vazio, e semente e ano da fachada', () => {
    const html = worldHtml(EMPTY_DEBUG.world(), { seed: 7, year: 3.5 }, EMPTY_DEBUG.recording);
    clean(html);
    expect(html).toContain('Sem indicadores do motor ainda');
    expect(html).toContain('<b>7</b>');
    expect(html).toContain('3,5');
    expect(html).toContain('desligada');
    expect(html).not.toContain('<svg');
  });
});

// Lugar ---------------------------------------------------------------------

describe('aba Lugar', () => {
  it('mostra tudo do PlaceDebug e as decisões das famílias dali', () => {
    const d = fakeDebug();
    const html = placeHtml(d.place(0)!, d.decisions({ village: 0 }), view);
    clean(html);
    for (const s of ['Arana', '180 moradores', 'Sedentário', 'há 3 anos', 'Idade do Bronze', '42% rumo à próxima', 'falta estanho na captação', 'raio de 9 tiles', 'roça', 'pesca', 'Abrigo', '0,74', 'Lenha há 2 anos', 'nascimentos', '6,20', '27,4']) {
      expect(html).toContain(s);
    }
    // Só as decisões de Arana (a família 12), não as de Beru.
    expect(html).toContain('Fundar a leste');
    expect(html).not.toContain('Migrar para Arana');
    expect(html).toContain('data-dplace="0" data-dfam="12"');
  });

  it('a pressão é uma barra com as marcas dos batedores e da fissão', () => {
    const p = PLACE.pressure;
    const html = pressureHtml(p);
    const max = p.fission * 1.25;
    const left = (cls: string) => Number(html.split(`<u class="${cls}" style="left:`)[1].split('%')[0]);
    expect(left('scout')).toBeCloseTo((p.scout / max) * 100, 1);
    expect(left('fission')).toBeCloseTo((p.fission / max) * 100, 1);
    expect(left('scout')).toBeLessThan(left('fission'));
    // Social e terra somadas, e o estado pelo limiar (1,13 está entre os batedores e a fissão).
    expect(html).toContain('social 0,82');
    expect(html).toContain('terra 0,31');
    expect(html).toContain('class="warn">= 1,13 · batedores procurando sítio');
    expect(pressureHtml({ ...p, social: 1.3, total: 1.61 })).toContain('acima da fissão');
  });

  it('sem lugar: a lista dos vivos por população; lugar sem vista: o estado vazio', () => {
    const rows = livePlaces(view);
    expect(rows.map((r) => r.id)).toEqual([3, 0, 1]);
    const list = placeTabHtml(-1, null, [], rows, view, false);
    clean(list);
    expect(list.indexOf('data-dplace="3"')).toBeLessThan(list.indexOf('data-dplace="0"'));
    expect(list).not.toContain('data-dplace="2"');
    expect(list).toContain('Cidade');
    const none = placeTabHtml(1, EMPTY_DEBUG.place(1), EMPTY_DEBUG.decisions({ village: 1 }), rows, view, false);
    clean(none);
    expect(none).toContain('Beru');
    expect(none).toContain('Sem a vista deste lugar');
    expect(none).toContain('data-dlist');
  });
});

// Família ---------------------------------------------------------------------

/** Seis criaturas: a família 77 tem três pessoas em Beru (uma criança) e uma em Arana; um lobo e um morto. */
function people(): PeopleView {
  return {
    ...view,
    count: 6,
    alive: Uint8Array.from([1, 1, 1, 1, 1, 0]),
    uid: Uint32Array.from([11, 12, 13, 14, 15, 16]),
    village: Int16Array.from([1, 1, 1, 0, -1, 1]),
    family: Uint32Array.from([77, 77, 77, 77, 0, 77]),
    kind: Uint8Array.from([0, 0, 0, 0, 1, 0]),
    age: Float32Array.from([34, 31, 6, 19, 3, 50]),
    role: Uint8Array.from([1, 2, CHILD, 1, 0, 1]),
  } as PeopleView;
}

describe('aba Família', () => {
  it('a pessoa fixada leva à família dela, contada na vista', () => {
    const p = personInfo(people(), 0)!;
    expect(p.family).toBe(77);
    expect(p.members).toBe(4);
    expect(p.adults).toBe(3);
    expect(p.places).toEqual([1, 0]);
    expect(p.name.length).toBeGreaterThan(1);
    // Bicho, morto ou índice fora: não é gente de um lugar.
    expect(personInfo(people(), 4)).toBeNull();
    expect(personInfo(people(), 5)).toBeNull();
    expect(personInfo(people(), 99)).toBeNull();
  });

  it('as decisões da família: a escolhida contra as outras, fator por fator', () => {
    const d = fakeDebug();
    const person = personInfo(people(), 0);
    const html = familyTabHtml({ person, focus: null, decisions: d.decisions({ family: 77 }), view, recording: true });
    clean(html);
    expect(html).toContain('4 pessoas, 3 adultas');
    expect(html).toContain('Mora em</span><b>Beru, Arana');
    // As duas decisões da família, cada uma com a tabela dos fatores.
    expect(count(html, 'wb-dopts')).toBe(2);
    expect(html).not.toContain('Fundar a leste');
    expect(html).toContain('Beru está apertado');
  });

  it('a tabela tem a escolhida primeiro e os fatores de todas as colunas', () => {
    const html = decisionTableHtml(DECISIONS[0]);
    clean(html);
    const heads = html.split('<th').slice(2).map((h) => h.split('<br>')[0]);
    expect(heads[0]).toContain('✓ Migrar para Arana');
    expect(heads[1]).toContain('Ficar em Beru');
    expect(heads[2]).toContain('Fundar perto');
    // Os fatores da escolhida primeiro (na ordem dela), depois os novos das outras.
    const facs = html.split('class="wb-dfac">').slice(1).map((s) => s.split('<')[0]);
    expect(facs).toEqual(['distância', 'comida lá', 'costume', 'pressão', 'comida', 'sítio']);
    // A quarta opção não cabe nas colunas.
    expect(html).toContain('e mais 1 opção');
    expect(count(html, 'wb-meter ')).toBe(3 + 3 + 3 + 2);
  });

  it('sem pessoa: as últimas do mundo (a primeira aberta); família escolhida numa decisão; vazio com o porquê', () => {
    const d = fakeDebug();
    const world = familyTabHtml({ person: null, focus: null, decisions: d.decisions({ limit: 20 }), view, recording: true });
    clean(world);
    expect(world).toContain('Últimas decisões do mundo');
    expect(count(world, 'wb-ddec-head')).toBe(3);
    expect(count(world, 'wb-dopts')).toBe(1);
    expect(world).toContain('data-dplace="1" data-dfam="77"');
    const focus = familyTabHtml({ person: null, focus: { family: 12, village: 0 }, decisions: d.decisions({ family: 12 }), view, recording: true });
    expect(focus).toContain('data-dall');
    expect(count(focus, 'wb-dopts')).toBe(1);
    const empty = familyTabHtml({ person: null, focus: null, decisions: EMPTY_DEBUG.decisions(), view, recording: false });
    clean(empty);
    expect(empty).toContain('Nenhuma decisão gravada');
    expect(empty).toContain('gravação da vista de depuração está desligada');
  });
});

// Eventos -------------------------------------------------------------------

/** Um evento de cada tipo, para o resumo e o filtro. */
const EVENTS: EngineEvent[] = [
  { kind: 'found', year: 100.1, village: 0, from: -1, how: 'bando', x: 10, y: 20 },
  { kind: 'colony', year: 100.2, phase: 'depart', from: 0, to: 1, people: 8, by: 'land' },
  { kind: 'colony', year: 100.3, phase: 'arrive', from: 0, to: -1, people: 5, by: 'sea' },
  { kind: 'farmstead', year: 100.4, village: 0, x: 12, y: 21 },
  { kind: 'migrate', year: 101, family: 77, from: 1, to: 0, people: 4, cause: 'move' },
  { kind: 'fission', year: 101.5, from: 0, to: 1, people: 30, population: 210, pressure: 1.31 },
  { kind: 'circumscribed', year: 102, village: 1, pressure: 1.25, years: 2 },
  { kind: 'exodus', year: 102.5, village: 1, lack: 'comida' },
  { kind: 'abandon', year: 103, village: 2, to: 3 },
  { kind: 'merge', year: 103.5, village: 1, into: 0 },
  { kind: 'tierUp', year: 104, village: 0, tier: 1 },
  { kind: 'tierDown', year: 104.5, village: 3, tier: 1 },
  { kind: 'polity', year: 105, village: 0, polity: 'chefia', was: 'livre', places: 2 },
  { kind: 'era', year: 105.5, village: 3, era: 1, first: false },
  { kind: 'tech', year: 106, village: 0, tech: 'pottery', first: true, lost: false },
  { kind: 'warStart', year: 106.5, a: 0, b: 3, target: 3, motive: 'land', naval: false },
  { kind: 'warEnd', year: 107, a: 0, b: 3, target: 3, motive: 'land', years: 2 },
  { kind: 'conquest', year: 107.5, winner: 0, loser: 3, village: 3, razed: false },
  { kind: 'revolt', year: 108, village: 1, against: 0, cause: 'stability' },
  { kind: 'independence', year: 108.5, village: 1, from: 0 },
  { kind: 'annex', year: 109, village: 1, from: -1, to: 3 },
  { kind: 'disaster', year: 109.5, what: 'quake', x: 55.2, y: 33.8, village: -1 },
  { kind: 'disaster', year: 110, what: 'epidemic', x: 40, y: 22, village: 1 },
  { kind: 'extinction', year: 110.5, species: 1 },
];

const entries = (): EventEntry[] => EVENTS.map((e, k) => eventEntry(e, view, k + 1)).reverse();

describe('aba Eventos', () => {
  it('todo tipo de evento tem nome e resumo legível', () => {
    expect(new Set(EVENTS.map((e) => e.kind))).toEqual(new Set(Object.keys(EVENT_KIND_NAMES) as EngineEventKind[]));
    for (const e of EVENTS) {
      const s = eventSummary(e, view);
      expect(s.length).toBeGreaterThan(8);
      clean(s);
      expect(s).not.toContain('#');
    }
    expect(eventSummary(EVENTS[4], view)).toContain('de Beru para Arana');
    expect(eventSummary(EVENTS[21], view)).toContain('Terremoto em (55, 34)');
    expect(eventSummary(EVENTS[23], view)).toContain('Lobo');
  });

  it('o texto vem do aviso quando há, senão do resumo; o clique leva ao lugar ou ao ponto', () => {
    const list = entries();
    const found = list.find((x) => x.e.kind === 'found')!;
    expect(found.text).toBe('Nasceu Arana');
    const migrate = list.find((x) => x.e.kind === 'migrate')!;
    expect(migrate.text).toContain('busca de vida melhor');
    expect(migrate.go).toEqual({ place: 0 });
    expect(list.find((x) => x.e.kind === 'warStart')!.go).toEqual({ place: 3 });
    expect(list.find((x) => x.e.kind === 'disaster' && x.e.village < 0)!.go).toEqual({ x: 55.2, y: 33.8 });
    expect(list.find((x) => x.e.kind === 'extinction')!.go).toBeNull();
  });

  it('filtra por tipo (chips) e pelo lugar selecionado', () => {
    const list = entries();
    expect(filterEvents(list, { kinds: new Set(), onlyPlace: false }, -1).length).toBe(EVENTS.length);
    expect(filterEvents(list, { kinds: new Set(['colony', 'era']), onlyPlace: false }, -1).map((x) => x.e.kind)).toEqual(['era', 'colony', 'colony']);
    const beru = filterEvents(list, { kinds: new Set(), onlyPlace: true }, 1);
    expect(beru.length).toBeGreaterThan(5);
    for (const x of beru) expect(x.places).toContain(1);
    // Sem lugar selecionado, o filtro do lugar não esconde nada.
    expect(filterEvents(list, { kinds: new Set(), onlyPlace: true }, -1).length).toBe(EVENTS.length);
  });

  it('monta os chips com as contagens e as linhas clicáveis, do mais novo ao mais velho', () => {
    const html = eventsHtml(entries(), { kinds: new Set(['disaster']), onlyPlace: false }, 1, view, 1234);
    clean(html);
    expect(html).toContain('class="wb-chip on" data-dkind="disaster">Desastre <b>2</b>');
    expect(html).toContain('Todos <b>24</b>');
    expect(html).toContain('Só Beru');
    expect(count(html, 'wb-devent')).toBe(2);
    expect(html.indexOf('data-dplace="1"')).toBeLessThan(html.indexOf('data-dgo="55.2,33.8"'));
    expect(html).toContain('1234 desde que a superfície abriu');
    // Muitos eventos: mostra só os mais novos.
    const many = Array.from({ length: 450 }, (_, k) => eventEntry({ kind: 'era', year: k, village: 0, era: 0, first: false }, view, k)).reverse();
    expect(count(eventsHtml(many, { kinds: new Set(), onlyPlace: false }, -1, view, 450), 'wb-devent')).toBe(DEBUG_EVENT_ROWS);
    expect(eventsHtml([], { kinds: new Set(), onlyPlace: false }, -1, view, 0)).toContain('Nenhum evento do motor ainda');
  });
});

// Desempenho ----------------------------------------------------------------

const STATS: SurfaceStats = {
  driver: { steps: 3, stepMs: 9.3, dropped: 0.5, totalSteps: 5760, totalMs: 21400, events: 2, totalEvents: 812 },
  raster: { tiles: 1200, changed: 40, blocks: 3, pixels: 49152, totalPixels: 9437184 },
  tick: 5760,
  log: 37,
};

describe('aba Desempenho', () => {
  const frames: FrameSample[] = Array.from({ length: 60 }, (_, k) => ({ frameMs: 16, steps: k % 4 === 0 ? 3 : 1, stepMs: k % 4 === 0 ? 14 : 4, dropped: k % 20 === 0 ? 0.25 : 0, events: k % 5 }));

  it('quadros em gráfico, FPS, as medidas da superfície e as partes do passo', () => {
    expect(Math.round(fpsOf(frames))).toBe(63);
    const html = perfHtml(frames, STATS, PROFILE, true);
    clean(html);
    expect(count(html, '<svg class="wb-dbars"')).toBe(2);
    expect(html).toContain('<line');
    expect(html).toContain('class="over"');
    // Os quadros com descarte ficam vermelhos nos dois gráficos (3 de 60).
    expect(count(html, '<rect class="bad"')).toBe(6);
    expect(html).toContain('3 de 60 quadros');
    for (const s of ['5760', '812', '1200 tiles', '9437184', 'log com 37 comandos', '480', 'pessoas', '2,10 ms · 50%', 'vegetação']) expect(html).toContain(s);
  });

  it('sem quadros e sem medição do passo: estados vazios', () => {
    const html = perfHtml([], STATS, EMPTY_DEBUG.profile(), false);
    clean(html);
    expect(html).toContain('Sem quadros medidos ainda');
    expect(html).toContain('Sem medição do passo');
    expect(fpsOf([])).toBe(0);
  });
});

// Tempo e caso ----------------------------------------------------------------

describe('aba Tempo e o caso copiado', () => {
  const base = { speed: 0, seed: 42, year: 120.04, tick: 5762, log: 37, logLimit: LOG_LIMIT, pending: 1, stepsPerYear: 48, fresh: true, last: null, copied: '' };

  it('pausa e velocidades, avançar 1 passo e 1 ano, o relógio e o log', () => {
    const html = timeHtml(base);
    clean(html);
    expect(html).toContain('class="on" data-dspeed="0"');
    expect(count(html, 'data-dspeed=')).toBe(4);
    expect(html).toContain('data-dstep="1"');
    expect(html).toContain('data-dstep="48"');
    expect(html).toContain('5762');
    expect(html).toContain('120,0');
    expect(html).toContain('1 na fila');
    expect(html).toContain('data-dcopy');
    expect(html).toContain('refeito do começo');
    const after = timeHtml({ ...base, fresh: false, last: { steps: 48, ms: 210.4 }, copied: 'Caso copiado (37 comandos)', log: LOG_LIMIT });
    expect(after).toContain('48 passos em 210,4 ms');
    expect(after).toContain('use o save');
    expect(after).toContain('Caso copiado');
    expect(after).toContain('chegou ao limite');
  });

  it('o JSON do caso volta inteiro, e diz se o log está completo', () => {
    const log = [
      { tick: 0, cmd: viewCommand(100, 50, 30, -1) },
      { tick: 12, cmd: { kind: 'feed', x: 3, y: 4, r: 5 } as EngineCommand },
    ];
    const c = debugCase({ seed: 42, year: 120.04, tick: 5762, step: 0.25, yearSpan: 12, planet: earthParams(0.4), fresh: true, log, logLimit: LOG_LIMIT });
    const json = caseJson(c);
    expect(JSON.parse(json)).toEqual(c);
    expect(c.complete).toBe(true);
    // Um comando por linha.
    expect(json.split('\n').filter((l) => l.startsWith('    {"tick":')).length).toBe(2);
    expect(debugCase({ ...c, log, logLimit: 2 }).complete).toBe(false);
    expect(JSON.parse(caseJson({ ...c, log: [] })).log).toEqual([]);
  });

  it('o caso copiado refaz o mundo: semente, planeta e log dão o mesmo mundo no mesmo passo', () => {
    const planet = earthParams(0.2);
    const make = () => createEngine(generateSurface(planet), { seed: 7, species: nativeSpecies(planet), yearSpan: 12 });
    const engine = make();
    const d = new SimDriver<EngineCommand, EngineEvent>(engine, (cmd) => engine.apply(cmd), { wrapWidth: engine.view.map.width });
    const v = engine.view.villages[0];
    d.setSpeed(0);
    d.enqueue(viewCommand(v.x, v.y, 30, v.id));
    d.stepBy(20);
    d.enqueue({ kind: 'feed', x: v.x, y: v.y, r: 6 });
    d.update(0.1);
    d.setSpeed(3);
    for (let f = 0; f < 6; f++) d.update(1 / 30);
    d.enqueue({ kind: 'cull', x: v.x + 3, y: v.y, r: 4 });
    d.stepBy(12);
    const c: DebugCase = JSON.parse(caseJson(debugCase({ seed: engine.seed, year: engine.view.year, tick: d.tick, step: d.h, yearSpan: engine.view.yearSpan, planet: engine.view.map.params, fresh: true, log: d.log, logLimit: LOG_LIMIT })));
    expect(c.log.length).toBe(3);
    // Refaz: os comandos de cada passo entram antes dele (os do último passo, depois dele).
    const again = createEngine(generateSurface(c.planet), { seed: c.seed, species: nativeSpecies(c.planet), yearSpan: c.yearSpan });
    let k = 0;
    for (let t = 0; t <= c.tick; t++) {
      while (k < c.log.length && c.log[k].tick === t) again.apply(c.log[k++].cmd);
      if (t < c.tick) again.step(c.step);
    }
    const a = engine.view;
    const b = again.view;
    expect(b.year).toBe(a.year);
    expect(b.year).toBe(c.year);
    expect(b.count).toBe(a.count);
    expect([...b.population]).toEqual([...a.population]);
    expect(b.villages.map((it) => [it.name, it.population, it.x, it.y])).toEqual(a.villages.map((it) => [it.name, it.population, it.x, it.y]));
    expect(Array.from(b.x.subarray(0, b.count))).toEqual(Array.from(a.x.subarray(0, a.count)));
  });
});
