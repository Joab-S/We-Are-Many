import { BEHIND_RELIEF, DEFAULT_TUNING } from '../core/flight';
import type { PoiKind } from './poi';
import type { SystemSummary } from './systemGen';

/**
 * Lógica do GUIA (Gerenciador Unificado de Inteligência e Astronavegação),
 * o assistente de bordo: alvos, estimativa de chegada, sugestões do que
 * visitar e escala do radar. Sem three.js, para poder testar em Node.
 */

export type TargetKind = 'star' | 'planet' | 'comet' | 'poi' | 'mark' | 'home';

export interface NavTarget {
  kind: TargetKind;
  id: string;
  name: string;
  /** Última posição conhecida no mundo, em UA. Corpos que orbitam são atualizados ao vivo. */
  pos: [number, number, number];
  /** Estrela do sistema do alvo (planetas e cometas), para a rota em duas etapas. */
  starId?: number;
  /** Distância de chegada (UA): o piloto automático para aqui. Para planetas e cometas, a do sistema. */
  arrive: number;
  /** Descrição curta mostrada no cartão do alvo. */
  info: string;
}

export interface Bookmark {
  id: string;
  name: string;
  pos: [number, number, number];
}

export interface LogEntry {
  /** Tempo de jogo, em s. */
  time: number;
  text: string;
}

/** Estado de navegação que sobrevive às trocas de modo. */
export interface NavState {
  target: NavTarget | null;
  autopilot: boolean;
  cruise: boolean;
  visitedStars: Set<number>;
  scannedStars: Set<number>;
  visitedBodies: Set<string>;
  discoveredPois: Set<string>;
  visitedPois: Set<string>;
  bookmarks: Bookmark[];
  log: LogEntry[];
  /** O GUIA já se apresentou. */
  greeted: boolean;
}

export function createNavState(): NavState {
  return {
    target: null,
    autopilot: false,
    cruise: false,
    visitedStars: new Set([0]),
    scannedStars: new Set([0]),
    visitedBodies: new Set(['sol-3']),
    discoveredPois: new Set(),
    visitedPois: new Set(),
    bookmarks: [],
    log: [],
    greeted: false,
  };
}

/**
 * Tempo estimado (s) para percorrer `distAu` até parar a `arriveAu` do alvo,
 * com a velocidade adaptativa: a distância cai de forma exponencial, então o
 * tempo cresce com o logaritmo da distância. `departAu` é a distância ao
 * corpo de onde a nave está saindo: até se afastar dele, a velocidade cresce
 * aos poucos (mais depressa, porque ele fica para trás).
 */
export function etaSeconds(distAu: number, arriveAu: number, departAu = Infinity, gain = DEFAULT_TUNING.gain, accel = 3): number {
  const remaining = distAu - arriveAu;
  if (remaining <= 0) return 0;
  // Na reta final o piloto automático anda a pelo menos meia distância de chegada por 1/gain segundos.
  const floor = Math.max(arriveAu * 0.5, 1e-6);
  const approach = Math.log(Math.max(remaining / floor, 1)) / gain;
  const depart = Math.max(0, Math.log(remaining / ((BEHIND_RELIEF + 1) * Math.max(departAu, 1e-9)))) / (BEHIND_RELIEF * gain);
  return approach + depart + accel;
}

export function formatEta(s: number): string {
  if (!Number.isFinite(s)) return '—';
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s - m * 60).toString().padStart(2, '0')} s`;
}

/** Algo que o GUIA pode sugerir. */
export interface Candidate {
  target: NavTarget;
  distAu: number;
  arriveAu: number;
  /** Quanto vale a visita, de 0 a ~6. */
  interest: number;
  reason: string;
}

export interface Suggestion extends Candidate {
  eta: number;
  score: number;
}

/** Ordena as candidatas: mais interessante e mais perto (em tempo de viagem) primeiro. */
export function rankSuggestions(cands: Candidate[], limit = 5, departAu = Infinity): Suggestion[] {
  return cands
    .filter((c) => c.interest > 0 && c.distAu > c.arriveAu * 1.2)
    .map((c) => {
      const eta = etaSeconds(c.distAu, c.arriveAu, departAu);
      return { ...c, eta, score: c.interest / (1 + eta / 25) };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Interesse de um sistema estelar, conforme o que já se sabe dele. */
export function starInterest(visited: boolean, scanned: boolean, summary: SystemSummary | null): { interest: number; reason: string } {
  if (visited) return { interest: 0.3, reason: 'Sistema já visitado' };
  if (!scanned || !summary) return { interest: 1.6, reason: 'Sistema desconhecido: faça uma varredura' };
  if (summary.life === 'sapient') return { interest: 6, reason: 'Sinais de vida inteligente!' };
  if (summary.life === 'animals') return { interest: 5, reason: 'Sinais de vida animal' };
  if (summary.life === 'plants') return { interest: 4.2, reason: 'Sinais de vegetação' };
  if (summary.habitable > 0) return { interest: 3.6, reason: `${summary.habitable} planeta(s) na zona habitável` };
  if (summary.planets > 0) return { interest: 2.2, reason: `${summary.planets} planeta(s), nenhum habitável` };
  if (summary.comets > 0) return { interest: 0.9, reason: 'Só cometas' };
  return { interest: 0.2, reason: 'Sem planetas' };
}

export const POI_INTEREST: Record<PoiKind, number> = {
  signal: 4.5,
  derelict: 4,
  nebula: 3,
  'brown-dwarf': 2.4,
  comet: 2.2,
  rogue: 2.4,
};

/**
 * Escala logarítmica do radar: 0 no centro, 1 na borda. Cada anel é uma
 * década de distância, de 0,01 UA até ~50 parsecs, para que planetas e
 * estrelas caibam no mesmo disco.
 */
export const RADAR_MIN_AU = 0.01;
export const RADAR_MAX_AU = 1e7;

export function radarRadius(distAu: number): number {
  const lo = Math.log10(RADAR_MIN_AU);
  const hi = Math.log10(RADAR_MAX_AU);
  return Math.min(1, Math.max(0, (Math.log10(Math.max(distAu, RADAR_MIN_AU)) - lo) / (hi - lo)));
}
