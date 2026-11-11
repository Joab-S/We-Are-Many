import { B } from '../live';
import type { SurfaceMap } from '../../procgen/surface';
import { indicatorsOf, scaledTargets, type IndicatorBase, type Indicators, type RunSamples } from '../calibrate';
import { ERAS, type Ecosystem, type Village } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { fullNeeds, NEEDS, NEED_NAMES } from '../needs';
import { wrapDx } from '../settlement';
import { STEP_PARTS, type EcoProbe, type ProbeSite } from '../eco/core/probe';
import type { MoveAction } from '../../IAUS/npc/mundo/mudanca';
import type { Choice, Scored } from '../../IAUS/npc/mundo/decisor';
import { liveConstants, type LiveConstant } from '../live';
import { DEBUG_DECISION_LIMIT, DEBUG_SERIES_LIMIT, type DebugFactor, type DebugOption, type DebugTarget, type DebugView, type FamilyDecision, type IndicatorSample, type PlaceDebug, type ProfileDebug, type WorldDebug } from './debug';
import type { EngineView } from './engine';

/**
 * Vista de depuração do motor (`engine.debug`, contrato em debug.ts): indicadores dos assentamentos no mundo vivo,
 * o estado de um lugar, as decisões de mudança das famílias e o tempo do passo por parte.
 *
 * O estado da depuração fica aqui, fora do Ecosystem: o mundo só carrega o gancho `probe` (eco/core/probe.ts), não
 * enumerável e null com a gravação desligada. Desligada, a fachada chama `eco.step` direto e cada ponto do gancho
 * custa um teste; ligada, o passo passa por `step` daqui, que amostra os indicadores quando o ano inteiro muda.
 * Nada daqui sorteia nem muda o mundo: as leituras que preenchem caches preguiçosos (a pegada `v.foot`, a área
 * `v.area`, os lotes de `lotCache`) passam por `untouched`, que devolve tudo como estava, e a nota do sítio usa a
 * `siteAt` da vista, que já guarda os rótulos da água. O tempo medido nunca entra numa conta da simulação.
 */

/** Indicadores que só a rodada da calibração amostra ano a ano (ou do começo dela): a vista não os mede. */
const RUN_ONLY = new Set<keyof Indicators>(['seed', 'years', 'wars', 'cavalry', 'caravans', 'caravansMax', 'worldTrees']);
/** O que a vista não tem da rodada (`RunSamples`): NaN, e os indicadores que dependem disso saem. */
const NO_RUN: RunSamples = { wars: NaN, cavalry: NaN, caravans: NaN, caravansMax: NaN, mid: 0, trees0: NaN, trees: NaN };
/** Metas da calibração longa a partir deste teto valem como sem teto (99999 e 9999 na tabela). */
const NO_CEILING = 9999;

/** As metas da calibração longa que têm indicador no mundo vivo, com o "sem teto" como Infinity. */
export function liveTargets(map: SurfaceMap): DebugTarget[] {
  return scaledTargets(map).filter((t) => !RUN_ONLY.has(t.key)).map((t) => ({ key: t.key, label: t.label, min: t.min, max: t.max >= NO_CEILING ? Infinity : t.max }));
}

/** Nome das partes da área (`AreaYield`) na ficha, na ordem em que aparecem. */
const AREA_PARTS: [keyof NonNullable<Village['area']>, string][] = [
  ['farm', 'roça'],
  ['irrigated', 'roça irrigada'],
  ['graze', 'pasto'],
  ['fish', 'pesca'],
  ['wood', 'lenha'],
  ['forage', 'coleta'],
  ['spoil', 'perecimento'],
  ['amp', 'estação'],
  ['relief', 'relevo'],
];

/** Parte da medição que não é do Ecosystem: a amostra dos indicadores, feita aqui a cada ano com a gravação ligada. */
const DEBUG_PART = STEP_PARTS.length;
const PART_NAMES: readonly string[] = [...STEP_PARTS, 'depuração (amostra dos indicadores)'];

/** Rumo de (dx, dy) em palavras (y cresce para o sul). */
function heading(dx: number, dy: number): string {
  const names = ['a leste', 'a sudeste', 'ao sul', 'a sudoeste', 'a oeste', 'a noroeste', 'ao norte', 'a nordeste'];
  return names[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8];
}

/**
 * Roda uma leitura e devolve o mundo como estava: consultas do motor preenchem caches preguiçosos (a pegada dos
 * lugares, a área do bioma, os lotes livres), e preenchê-los fora de hora podia adiantar o que o passo faria.
 */
function untouched<T>(eco: Ecosystem, read: () => T): T {
  const villages = eco.villages;
  const foot = villages.map((v) => (Object.hasOwn(v, 'foot') ? { v: v.foot } : null));
  const area = villages.map((v) => (Object.hasOwn(v, 'area') ? { v: v.area } : null));
  const lots = [...eco.lotCache];
  try {
    return read();
  } finally {
    for (let k = 0; k < foot.length; k++) {
      const v = villages[k];
      const f = foot[k];
      const a = area[k];
      if (f) v.foot = f.v;
      else delete v.foot;
      if (a) v.area = a.v;
      else delete v.area;
    }
    const now = eco.lotCache;
    let same = now.size === lots.length;
    if (same) {
      let k = 0;
      for (const [key, value] of now) {
        if (lots[k][0] !== key || lots[k][1] !== value) {
          same = false;
          break;
        }
        k++;
      }
    }
    if (!same) {
      now.clear();
      for (const [key, value] of lots) now.set(key, value);
    }
  }
}

/** De onde contam as taxas: o ano, os assentamentos e as contas do mundo quando o motor adotou este mundo. */
interface Since {
  year: number;
  villages: number;
  tally: Ecosystem['tally'];
  treesCut: number;
  treesPlanted: number;
  dayStats: Ecosystem['dayStats'];
}

function sinceOf(eco: Ecosystem): Since {
  return { year: eco.year, villages: eco.villages.length, tally: { ...eco.tally }, treesCut: eco.treesCut, treesPlanted: eco.treesPlanted, dayStats: { ...eco.dayStats } };
}

/**
 * A vista de depuração de um motor. A fachada (engine.ts) chama `step` no lugar de `eco.step` quando a gravação
 * está ligada e `adopt` no `restore`; o resto é o contrato `DebugView`.
 */
export class EngineDebug implements DebugView {
  private eco: Ecosystem;
  private on = false;
  private since: Since;
  /** Metas deste mundo: a terra habitável custa uma varredura do mapa. Conta uma vez, sem acompanhar o que o jogador muda nela. */
  private targets: DebugTarget[] | null = null;
  /** Amostras dos indicadores, uma por ano de jogo, da mais velha para a mais nova (no máximo DEBUG_SERIES_LIMIT). */
  private series: IndicatorSample[] = [];
  /** Moradores a cada ano amostrado (sem limite: um número por ano), para a amostra do meio da janela de `peopleTrend`. */
  private trendYear: number[] = [];
  private trendPeople: number[] = [];
  /** Último ano inteiro visto pelo passo: a amostra sai quando ele muda. */
  private lastYear: number;
  /** Anel das decisões: `ring[(head - 1 - k) mod limite]` é a k-ésima mais nova, para k < `stored`. */
  private ring: FamilyDecision[] = [];
  private head = 0;
  private stored = 0;
  /** Medição do passo: ms acumulados por parte (as do Ecosystem e a amostra daqui), passos medidos e a marca do tempo. */
  private spent = new Float64Array(PART_NAMES.length);
  private steps = 0;
  private mark = 0;
  /** O gancho que o Ecosystem chama (eco/core/probe.ts), instalado em `eco.probe` só com a gravação ligada. */
  private readonly probe: EcoProbe;

  constructor(
    eco: Ecosystem,
    private readonly view: Pick<EngineView, 'siteAt'>,
    private readonly seed: number,
  ) {
    this.eco = eco;
    this.since = sinceOf(eco);
    this.lastYear = Math.floor(eco.year);
    this.probe = {
      begin: () => {
        this.steps++;
        this.mark = performance.now();
      },
      lap: (part) => {
        const t = performance.now();
        this.spent[part] += t - this.mark;
        this.mark = t;
      },
      decision: (v, members, adults, exodus, choice, sites, why) => this.record(v, members, adults, exodus, choice, sites, why),
    };
  }

  get recording(): boolean {
    return this.on;
  }

  setRecording(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on) {
      // A medição do passo conta desde que a gravação ligou; a série e as decisões continuam onde estavam.
      this.spent.fill(0);
      this.steps = 0;
      this.lastYear = Math.floor(this.eco.year);
    }
    this.eco.probe = on ? this.probe : null;
  }

  /**
   * O motor passou a ser outro mundo (`restore`): as taxas voltam a contar dali, e a série, as amostras de moradores
   * e as decisões, que eram do mundo anterior, saem. A medição do passo continua.
   */
  adopt(eco: Ecosystem): void {
    if (this.eco !== eco) this.eco.probe = null;
    this.eco = eco;
    this.targets = null;
    this.since = sinceOf(eco);
    this.series = [];
    this.trendYear = [];
    this.trendPeople = [];
    this.ring = [];
    this.head = 0;
    this.stored = 0;
    this.lastYear = Math.floor(eco.year);
    eco.probe = this.on ? this.probe : null;
  }

  /** Um passo com a gravação ligada: o do Ecosystem (medido parte a parte pelo gancho) e, na virada do ano inteiro, a amostra. */
  step(dt: number): void {
    const eco = this.eco;
    eco.step(dt);
    const year = Math.floor(eco.year);
    if (year === this.lastYear) return;
    this.lastYear = year;
    const t0 = performance.now();
    const values = this.measure();
    this.series.push({ year: eco.year, values });
    if (this.series.length > DEBUG_SERIES_LIMIT) this.series.shift();
    this.trendYear.push(eco.year);
    this.trendPeople.push(values.people);
    this.spent[DEBUG_PART] += performance.now() - t0;
  }

  world(): WorldDebug {
    const eco = this.eco;
    return {
      seed: this.seed,
      year: eco.year,
      since: this.since.year,
      now: { year: eco.year, values: this.measure() },
      targets: (this.targets ??= liveTargets(eco.map)),
      series: this.series.map((s) => ({ year: s.year, values: { ...s.values } })),
    };
  }

  /**
   * Os indicadores de agora pelas definições da calibração (`indicatorsOf`), com as taxas por ano desde `since`. Saem
   * os que só a rodada amostra (`RUN_ONLY`), os do comportamento enquanto nenhum lugar rodou no modo completo na janela
   * (sem amostra, a conta daria 0) e `peopleTrend` sem a amostra do meio da janela (`midPeople`).
   */
  private measure(): Record<string, number> {
    const eco = this.eco;
    const s = this.since;
    const mid = this.midPeople();
    const base: IndicatorBase = { years: eco.year - s.year, villages: s.villages, tally: s.tally, treesCut: s.treesCut, treesPlanted: s.treesPlanted, dayStats: s.dayStats };
    const ind = untouched(eco, () => indicatorsOf(eco, this.seed, base, mid > 0 ? { ...NO_RUN, mid } : NO_RUN));
    const out: Record<string, number> = {};
    for (const [k, value] of Object.entries(ind) as [keyof Indicators, number][]) if (!RUN_ONLY.has(k)) out[k] = value;
    if (!(mid > 0)) delete out.peopleTrend;
    if (eco.dayStats.samples === s.dayStats.samples) {
      delete out.taskShare;
      delete out.idleShare;
    }
    if (eco.dayStats.steps === s.dayStats.steps) delete out.onStreet;
    return out;
  }

  /**
   * Moradores no meio da janela de `peopleTrend`: a calibração divide o fim pelos moradores aos 60% da rodada, e aqui
   * a rodada é a janela desde `since`. Vale a amostra anual (gravação ligada) mais perto de since + 0,6 × (ano − since),
   * se houver uma a até um ano desse ponto; senão 0 (sem amostra, o indicador fica de fora).
   */
  private midPeople(): number {
    const ys = this.trendYear;
    if (!ys.length) return 0;
    const target = this.since.year + 0.6 * (this.eco.year - this.since.year);
    // Busca binária pela primeira amostra a partir do alvo; a melhor é ela ou a anterior.
    let lo = 0;
    let hi = ys.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ys[m] < target) lo = m + 1;
      else hi = m;
    }
    let best = -1;
    for (const k of [lo - 1, lo]) if (k >= 0 && k < ys.length && (best < 0 || Math.abs(ys[k] - target) < Math.abs(ys[best] - target))) best = k;
    return best >= 0 && Math.abs(ys[best] - target) <= 1 ? this.trendPeople[best] : 0;
  }

  place(id: number): PlaceDebug | null {
    const eco = this.eco;
    const v = eco.villages[id];
    if (!v) return null;
    return untouched(eco, () => {
      const era = Math.floor(v.tech);
      const social = v.pressure ?? 0;
      const land = eco.landPressure(v);
      const founded = v.foundedAt ?? 0;
      const needs = v.needs ?? fullNeeds();
      const area = eco.areaOf(v);
      const scarce = eco.scarcity(v);
      // O que falta: comida ou lenha (`lackName`); o nômade sente falta também da coleta esgotada (`forageLack`).
      const lack = scarce > 0 ? { what: eco.forageLack(v) >= scarce ? 'coleta' : eco.lackName(v), years: v.want ?? 0 } : null;
      return {
        id: v.id,
        name: v.name,
        population: v.population,
        founded,
        age: (v.abandoned ? (v.abandonedAt ?? eco.year) : eco.year) - founded,
        lifeway: eco.lifewayOf(v),
        pressure: { social, land, total: social + land, scout: B.PRESSURE_SCOUT, fission: B.PRESSURE_FISSION },
        circumscribed: v.circumscribed ?? 0,
        era: { tech: v.tech, name: ERAS[Math.min(era, ERAS.length - 1)], blocked: eco.eraLock(v) },
        catchment: eco.catchRadius(v, 'food'),
        area: AREA_PARTS.map(([k, name]) => ({ name, value: area[k] })),
        needs: NEEDS.map((k) => ({ name: NEED_NAMES[k], value: needs[k] })),
        stability: v.stability ?? 1,
        lack,
        rates: eco.rates(v).map((r) => ({ name: r.name, value: r.perYear })),
        site: this.view.siteAt(v.x, v.y, v.id)?.value ?? null,
      };
    });
  }

  decisions(filter: { village?: number; family?: number; limit?: number } = {}): FamilyDecision[] {
    const out: FamilyDecision[] = [];
    const limit = filter.limit ?? Infinity;
    for (let k = 0; k < this.stored && out.length < limit; k++) {
      const d = this.ring[(this.head - 1 - k + DEBUG_DECISION_LIMIT) % DEBUG_DECISION_LIMIT];
      if (filter.village !== undefined && d.village !== filter.village) continue;
      if (filter.family !== undefined && d.family !== filter.family) continue;
      out.push(structuredClone(d));
    }
    return out;
  }

  fingerprint(): string {
    return worldFingerprint(this.eco);
  }

  constants(): LiveConstant[] {
    return liveConstants();
  }

  profile(): ProfileDebug | null {
    if (!this.on) return null;
    const n = this.steps;
    const per = (ms: number) => (n ? ms / n : 0);
    let total = 0;
    for (const ms of this.spent) total += ms;
    const parts: DebugFactor[] = PART_NAMES.map((name, k) => ({ name, value: per(this.spent[k]) })).sort((p, q) => q.value - p.value);
    return { steps: n, msPerStep: per(total), parts };
  }

  /** Grava uma decisão de mudança (o gancho `decision`): rótulos com o nome do lugar ou o rumo do sítio, já em dado puro. */
  private record(v: Village, members: readonly number[], adults: readonly number[], exodus: boolean, choice: Choice<MoveAction>, sites: readonly ProbeSite[], why: string): void {
    const eco = this.eco;
    const label = (a: MoveAction): string => {
      if (a.kind === 'stay') return `ficar em ${v.name}`;
      if (a.kind === 'migrate') return `ir para ${eco.villages[a.to]?.name ?? `lugar ${a.to}`}`;
      const s = sites[a.site];
      if (!s) return 'fundar um lugar novo';
      const dx = wrapDx(s.x + 0.5 - v.x, eco.map.width);
      const dy = s.y + 0.5 - v.y;
      return `fundar a ${Math.round(Math.hypot(dx, dy))} tiles ${heading(dx, dy)} (${s.x}, ${s.y})`;
    };
    const option = (o: Scored<MoveAction>): DebugOption => ({ label: label(o.action), score: o.score, factors: o.factors.map((f) => ({ name: f.name, value: f.value })) });
    const d: FamilyDecision = {
      year: eco.year,
      village: v.id,
      family: members.length ? eco.family[members[0]] : -1,
      adults: adults.length,
      exodus,
      picked: option(choice.pick),
      others: choice.others.map(option),
      why,
    };
    this.ring[this.head] = d;
    this.head = (this.head + 1) % DEBUG_DECISION_LIMIT;
    this.stored = Math.min(DEBUG_DECISION_LIMIT, this.stored + 1);
  }
}
