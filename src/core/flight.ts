/**
 * Velocidade adaptativa (REQUISITOS.md, seção 3.5): a velocidade máxima é
 * proporcional à distância até a superfície do corpo mais próximo. No vazio
 * a nave atravessa parsecs em segundos e, perto de um planeta, anda devagar.
 */

export interface FlightTuning {
  /** Fração da distância ao corpo mais próximo percorrida por segundo. */
  gain: number;
  /** Velocidade mínima, em UA/s. */
  minSpeed: number;
  /** Teto de velocidade do motor atual, em UA/s (upgrades aumentam). */
  maxSpeed: number;
}

export const DEFAULT_TUNING: FlightTuning = {
  gain: 0.4,
  minSpeed: 2e-5,
  maxSpeed: 0.5 * 206264.806,
};

export function adaptiveMaxSpeed(distanceToSurfaceAu: number, tuning: FlightTuning = DEFAULT_TUNING): number {
  const d = Math.max(distanceToSurfaceAu, 0);
  return Math.min(Math.max(d * tuning.gain, tuning.minSpeed), tuning.maxSpeed);
}

/**
 * Distância "efetiva" de um obstáculo para o teto de velocidade: o que está
 * à frente conta inteiro e o que ficou para trás ou ao lado conta até
 * BEHIND_RELIEF vezes mais longe. Assim a nave sai depressa de um planeta
 * ou estrela e só desacelera para o que está no caminho.
 */
export const BEHIND_RELIEF = 4;

export function directionalDistance(distAu: number, cosAhead: number): number {
  return distAu * (1 + (BEHIND_RELIEF - 1) * (1 - Math.max(0, Math.min(1, cosAhead))));
}

/**
 * Tempo aproximado (s) para ir de uma distância a outra de um corpo com
 * aceleração total, enquanto a velocidade segue o regime adaptativo.
 */
export function approachTime(fromAu: number, toAu: number, tuning: FlightTuning = DEFAULT_TUNING): number {
  return Math.abs(Math.log(fromAu / toAu)) / tuning.gain;
}

/** Formata uma velocidade em UA/s para o HUD. */
export function formatSpeed(auPerS: number): string {
  const c = auPerS / (299792.458 / 149597870.7);
  if (c < 0.01) return `${(auPerS * 149597870.7).toFixed(0)} km/s`;
  if (c < 1000) return `${c.toFixed(c < 10 ? 2 : 0)} c`;
  return `${(c / 1000).toFixed(1)} mil c`;
}

/** Formata uma distância em UA para o HUD. */
export function formatDistance(au: number): string {
  if (au < 0.01) return `${(au * 149597870.7).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km`;
  if (au < 20000) return `${au.toFixed(au < 10 ? 2 : 0)} UA`;
  const ly = au / 63241.077;
  return `${ly.toFixed(ly < 10 ? 2 : 1)} anos-luz`;
}
