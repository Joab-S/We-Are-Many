import { mulberry32, seedFor } from '../core/rng';

/**
 * Sondas de prospecção e extração (RF-RES). A nave carrega algumas sondas;
 * cada uma vai até um planeta rochoso, um anel ou um cometa, descobre o que
 * há ali, extrai uma carga e volta. Os depósitos de cada corpo são finitos
 * e gerados pelo id; o jogo guarda só o quanto já foi extraído (RNF-10).
 * Sem three.js: a simulação roda em Node.
 */

export type Resource = 'metais' | 'silicatos' | 'gelo' | 'volateis' | 'raros';
export const RESOURCES: Resource[] = ['metais', 'silicatos', 'gelo', 'volateis', 'raros'];

export const RESOURCE_LABEL: Record<Resource, string> = {
  metais: 'Metais',
  silicatos: 'Silicatos',
  gelo: 'Gelo (água)',
  volateis: 'Voláteis',
  raros: 'Elementos raros',
};

/** De onde se pode extrair. */
export type SourceKind = 'rocky' | 'ring' | 'comet' | 'rogue' | 'derelict';

export const SOURCE_LABEL: Record<SourceKind, string> = {
  rocky: 'planeta rochoso',
  ring: 'anéis',
  comet: 'cometa',
  rogue: 'planeta errante',
  derelict: 'destroços',
};

export type Amounts = Record<Resource, number>;

const zero = (): Amounts => ({ metais: 0, silicatos: 0, gelo: 0, volateis: 0, raros: 0 });

/** Faixas [mín, máx] de cada recurso por tipo de fonte, em toneladas acessíveis às sondas. */
const PROFILES: Record<SourceKind, Partial<Record<Resource, [number, number]>>> = {
  rocky: { metais: [300, 1100], silicatos: [700, 2000], gelo: [0, 300], raros: [10, 80] },
  ring: { gelo: [300, 900], silicatos: [100, 320], metais: [40, 200], raros: [0, 25] },
  comet: { gelo: [80, 220], volateis: [40, 130], silicatos: [10, 40] },
  rogue: { metais: [400, 1400], silicatos: [500, 1500], gelo: [100, 600], raros: [30, 140] },
  derelict: { metais: [30, 90], raros: [8, 35] },
};

/** Depósitos totais de um corpo, sempre os mesmos para o mesmo id. `water` (0..1) aumenta o gelo dos rochosos. */
export function deposits(sourceId: string, kind: SourceKind, water = 0): Amounts {
  const rnd = mulberry32(seedFor(`deposits:${sourceId}`));
  const out = zero();
  for (const r of RESOURCES) {
    const range = PROFILES[kind][r];
    const roll = rnd();
    if (!range) continue;
    let v = range[0] + (range[1] - range[0]) * roll;
    if (kind === 'rocky' && r === 'gelo') v += water * 600;
    out[r] = Math.round(v);
  }
  return out;
}

export function remaining(total: Amounts, mined: Partial<Amounts> | undefined): Amounts {
  const out = zero();
  for (const r of RESOURCES) out[r] = Math.max(0, total[r] - (mined?.[r] ?? 0));
  return out;
}

export const sum = (a: Partial<Amounts>): number => RESOURCES.reduce((s, r) => s + (a[r] ?? 0), 0);

export type MissionPhase = 'travel' | 'survey' | 'extract' | 'return' | 'done';

export interface Mission {
  id: number;
  sourceId: string;
  sourceName: string;
  kind: SourceKind;
  phase: MissionPhase;
  /** Segundos de jogo já passados na fase atual. */
  elapsed: number;
  /** Carga extraída nesta missão. */
  cargo: Amounts;
  /** Recursos que a prospecção encontrou ao chegar. */
  found?: Amounts;
  /** Fração de água do planeta (só rochosos), que define o gelo disponível. */
  water: number;
}

export interface ProbeTuning {
  /** Duração de cada fase, em segundos de jogo. */
  travel: number;
  survey: number;
  extract: number;
  ret: number;
  /** Carga máxima por sonda, em toneladas. */
  capacity: number;
}

export const PROBES: ProbeTuning = { travel: 6, survey: 6, extract: 30, ret: 6, capacity: 60 };

export const PHASE_LABEL: Record<MissionPhase, string> = {
  travel: 'a caminho',
  survey: 'prospectando',
  extract: 'extraindo',
  return: 'voltando',
  done: 'concluída',
};

/** Estado das sondas e do porão da nave; sobrevive às trocas de modo. */
export interface ProbeState {
  /** Total de sondas a bordo (livres + em missão). */
  probes: number;
  missions: Mission[];
  cargo: Amounts;
  /** Quanto já foi extraído de cada corpo. */
  mined: Record<string, Partial<Amounts>>;
  /** Corpos já prospectados, com o que foi encontrado no total. */
  surveyed: Record<string, Amounts>;
  nextId: number;
}

export function createProbeState(probes = 3): ProbeState {
  return { probes, missions: [], cargo: zero(), mined: {}, surveyed: {}, nextId: 1 };
}

export const freeProbes = (s: ProbeState): number => s.probes - s.missions.length;

export function launch(s: ProbeState, sourceId: string, sourceName: string, kind: SourceKind, water = 0): Mission | null {
  if (freeProbes(s) <= 0) return null;
  const m: Mission = { id: s.nextId++, sourceId, sourceName, kind, phase: 'travel', elapsed: 0, cargo: zero(), water };
  s.missions.push(m);
  return m;
}

/** Fração (0..1) da missão inteira já cumprida. */
export function progress(m: Mission, t: ProbeTuning = PROBES): number {
  const order: [MissionPhase, number][] = [['travel', t.travel], ['survey', t.survey], ['extract', t.extract], ['return', t.ret]];
  const total = order.reduce((a, [, d]) => a + d, 0);
  let done = 0;
  for (const [p, d] of order) {
    if (p === m.phase) return Math.min(1, (done + Math.min(m.elapsed, d)) / total);
    done += d;
  }
  return 1;
}

export interface ProbeEvent {
  mission: Mission;
  kind: 'surveyed' | 'returned' | 'depleted';
}

/**
 * Avança as missões. A extração tira dos depósitos restantes na proporção do
 * que existe, até a capacidade da sonda. Retorna os eventos para o GUIA avisar.
 */
export const missionTotals = (m: Mission): Amounts => deposits(m.sourceId, m.kind, m.water);

export function stepProbes(s: ProbeState, dt: number, t: ProbeTuning = PROBES, totalsOf: (m: Mission) => Amounts = missionTotals): ProbeEvent[] {
  const events: ProbeEvent[] = [];
  for (const m of s.missions) {
    m.elapsed += dt;
    if (m.phase === 'travel' && m.elapsed >= t.travel) {
      m.phase = 'survey';
      m.elapsed = 0;
    }
    if (m.phase === 'survey' && m.elapsed >= t.survey) {
      const total = totalsOf(m);
      s.surveyed[m.sourceId] = total;
      m.found = remaining(total, s.mined[m.sourceId]);
      m.phase = sum(m.found) > 0 ? 'extract' : 'return';
      m.elapsed = 0;
      events.push({ mission: m, kind: sum(m.found) > 0 ? 'surveyed' : 'depleted' });
    }
    if (m.phase === 'extract') {
      const left = remaining(totalsOf(m), s.mined[m.sourceId]);
      const avail = sum(left);
      const loaded = sum(m.cargo);
      const rate = t.capacity / t.extract;
      const take = Math.min(rate * Math.min(dt, t.extract), t.capacity - loaded, avail);
      if (take > 0 && avail > 0) {
        const mined = (s.mined[m.sourceId] ??= {});
        for (const r of RESOURCES) {
          const part = (take * left[r]) / avail;
          m.cargo[r] += part;
          mined[r] = (mined[r] ?? 0) + part;
        }
      }
      if (m.elapsed >= t.extract || sum(m.cargo) >= t.capacity - 1e-6 || avail - take <= 1e-6) {
        m.phase = 'return';
        m.elapsed = 0;
      }
    }
    if (m.phase === 'return' && m.elapsed >= t.ret) {
      for (const r of RESOURCES) s.cargo[r] += m.cargo[r];
      m.phase = 'done';
      events.push({ mission: m, kind: 'returned' });
    }
  }
  s.missions = s.missions.filter((m) => m.phase !== 'done');
  return events;
}

/** Texto curto de quantidades, como "120 t de gelo, 40 t de metais". */
export function describeAmounts(a: Partial<Amounts>, limit = 3): string {
  const list = RESOURCES.filter((r) => (a[r] ?? 0) >= 0.5)
    .sort((x, y) => (a[y] ?? 0) - (a[x] ?? 0))
    .slice(0, limit)
    .map((r) => `${Math.round(a[r]!)} t de ${RESOURCE_LABEL[r].toLowerCase()}`);
  return list.length ? list.join(', ') : 'nada';
}
