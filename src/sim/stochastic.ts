/**
 * Base de simulação estocástica (REQUISITOS-VIDA.md, seção 19.15).
 *
 * Todo acontecimento da vida é um processo com taxa por ano (λ). A chance num
 * passo de tempo é 1 − e^(−λ·dt), o que deixa o resultado médio igual em
 * qualquer velocidade de jogo e tamanho de passo (processo de Poisson). As
 * quantidades são sorteadas com a distribuição que combina com elas, e o
 * que varia de ano em ano segue um ruído com retorno à média.
 */

import { hashString, statefulMulberry32 } from '../core/rng';

export type Rng = () => number;

/** Chance de pelo menos um evento num intervalo `dt`, para uma taxa `rate` na mesma unidade de tempo. */
export function chance(rate: number, dt: number): number {
  if (rate <= 0 || dt <= 0) return 0;
  return 1 - Math.exp(-rate * dt);
}

/** Sorteia se um evento de taxa `rate` aconteceu no intervalo `dt`. */
export function happens(rnd: Rng, rate: number, dt: number): boolean {
  return rnd() < chance(rate, dt);
}

/** Taxa equivalente a uma chance `p` por intervalo (inverso de `chance` com dt = 1). */
export function rateFor(p: number): number {
  return p >= 1 ? Infinity : -Math.log(1 - p);
}

/** Curva logística de 0 a 1: vale 0,5 em `mid` e sobe com inclinação `k`. */
export function logistic(x: number, mid: number, k: number): number {
  return 1 / (1 + Math.exp(-k * (x - mid)));
}

/** Normal padrão (Box-Muller). */
export function normal(rnd: Rng): number {
  const u = Math.max(1e-12, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** Contagem de eventos de Poisson com média `mean` (Knuth para médias pequenas, normal para grandes). */
export function poisson(rnd: Rng, mean: number): number {
  if (mean <= 0) return 0;
  if (mean > 30) return Math.max(0, Math.round(mean + Math.sqrt(mean) * normal(rnd)));
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rnd();
  while (p > limit) {
    k++;
    p *= rnd();
  }
  return k;
}

/** Quantos de `n` tentativas dão certo, cada uma com chance `p`. */
export function binomial(rnd: Rng, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n > 40) {
    const mean = n * p;
    return Math.min(n, Math.max(0, Math.round(mean + Math.sqrt(mean * (1 - p)) * normal(rnd))));
  }
  let k = 0;
  for (let i = 0; i < n; i++) if (rnd() < p) k++;
  return k;
}

/** Gama com forma `shape` e média `mean` (Marsaglia-Tsang). Bom para tempos de espera. */
export function gamma(rnd: Rng, shape: number, mean: number): number {
  if (shape < 1) return gamma(rnd, shape + 1, mean) * Math.pow(Math.max(1e-12, rnd()), 1 / shape) * ((shape + 1) / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = normal(rnd);
    const v = (1 + c * x) ** 3;
    if (v <= 0) continue;
    const u = rnd();
    if (Math.log(Math.max(1e-12, u)) < 0.5 * x * x + d - d * v + d * Math.log(v)) return ((d * v) / shape) * mean;
  }
}

/** Lognormal com média `mean` e espalhamento `sigma`: sempre positiva, com cauda (colheitas, cargas, jazidas). */
export function lognormal(rnd: Rng, mean: number, sigma: number): number {
  return mean * Math.exp(sigma * normal(rnd) - (sigma * sigma) / 2);
}

/** Índice sorteado com pesos (roleta); -1 se todos os pesos forem zero. */
export function weighted(rnd: Rng, weights: readonly number[]): number {
  let total = 0;
  for (const w of weights) total += Math.max(0, w);
  if (total <= 0) return -1;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= Math.max(0, weights[i]);
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/**
 * Ruído com retorno à média (Ornstein-Uhlenbeck): anos bons e ruins que
 * sempre voltam ao normal. `theta` é a força de volta por ano e `sigma` o
 * desvio no longo prazo; o valor fica em torno de 0.
 */
export function ouStep(rnd: Rng, value: number, dt: number, theta: number, sigma: number): number {
  const decay = Math.exp(-theta * dt);
  return value * decay + sigma * Math.sqrt(1 - decay * decay) * normal(rnd);
}

/** Subsistemas com fluxo de sorteio próprio (RF-VIDA-306). */
export const STREAMS = ['vida', 'povos', 'politica', 'mundo', 'terreno', 'clima', 'saber', 'mente'] as const;
export type Stream = (typeof STREAMS)[number];

/**
 * Um gerador por subsistema, todos derivados da semente do planeta: um
 * sistema novo não muda a sequência dos outros.
 */
export function streams(seed: number): Record<Stream, Rng> {
  const out = {} as Record<Stream, Rng>;
  for (const name of STREAMS) out[name] = statefulMulberry32((seed ^ hashString(name)) >>> 0);
  return out;
}
