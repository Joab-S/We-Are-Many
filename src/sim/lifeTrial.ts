import { seedFor } from '../core/rng';
import type { LifeChoice, SurfaceMap } from '../procgen/surface';
import { Ecosystem, YEAR_SECONDS } from './ecosystem';
import { EARTH_ID, nativeLifeTier, nativeSpecies, type Species } from './species';

/** Anos sem tela de cada teste do sorteio da vida (anos de ação, os da calibração). */
export const TRIAL_YEARS = 50;
/** Quantos sorteios novos um planeta tem depois do primeiro. */
export const TRIAL_RETRIES = 3;
const TRIAL_STEP = 0.25;

export interface TrialResult {
  /** Moradores logo depois de povoar e no fim do teste. */
  start: number;
  end: number;
}
/** Como testar um sorteio: os testes trocam por um planeta forçado a inviável. */
export type TrialRun = (map: SurfaceMap, species: Species[], seed: number) => TrialResult;

/** Roda o sorteio num mundo de rascunho: o mapa recebido não muda. */
export const trialRun: TrialRun = (map, species, seed) => {
  const eco = new Ecosystem(structuredClone(map), seed);
  for (const sp of species) eco.addSpecies(sp);
  eco.populate();
  const people = () => eco.villages.reduce((sum, v) => sum + (v.abandoned ? 0 : v.population), 0);
  const start = people();
  const steps = Math.round((TRIAL_YEARS * YEAR_SECONDS) / TRIAL_STEP);
  for (let i = 0; i < steps; i++) eco.step(TRIAL_STEP);
  return { start, end: people() };
};

/**
 * Rejeição de semente (Dwarf Fortress): um planeta sorteado com um povo inteligente só fica com um sorteio em que esse
 * povo não encolhe nos primeiros anos, e quem foi rejeitado vira uma linha na crônica. O nível de vida não muda: o que
 * anda é o sorteio das espécies. A Terra e os planetas sem povo não passam por isto. Se nenhum sorteio aguenta, fica o
 * que perdeu menos gente, e a crônica diz isso também.
 */
export function chooseLife(map: SurfaceMap, run: TrialRun = trialRun): LifeChoice {
  const params = map.params;
  if (params.id === EARTH_ID || nativeLifeTier(params.id, params.life) !== 'sapient') return { attempt: 0, notes: [] };
  const seed = seedFor(`${params.id}:life`);
  const notes: string[] = [];
  let best = 0;
  let bestShare = -1;
  for (let attempt = 0; attempt <= TRIAL_RETRIES; attempt++) {
    const { start, end } = run(map, nativeSpecies(params, attempt), seed);
    if (start > 0 && end >= start) return { attempt, notes };
    notes.push(
      start > 0
        ? `${params.name}: o sorteio ${attempt + 1} da vida foi rejeitado, com o povo caindo de ${start} para ${end} em ${TRIAL_YEARS} anos.`
        : `${params.name}: o sorteio ${attempt + 1} da vida foi rejeitado, porque o povo não achou onde fundar uma aldeia.`,
    );
    const share = start > 0 ? end / start : 0;
    if (share > bestShare) {
      bestShare = share;
      best = attempt;
    }
  }
  notes.push(`${params.name}: nenhum sorteio da vida aguentou ${TRIAL_YEARS} anos; ficou o ${best + 1}, o que perdeu menos gente.`);
  return { attempt: best, notes };
}
