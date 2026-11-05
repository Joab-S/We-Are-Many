// math.ts — utilitários numéricos e RNG determinístico.

export const clamp01 = (v: number): number =>
  Number.isFinite(v) ? (v < 0 ? 0 : v > 1 ? 1 : v) : 0;

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/** Normaliza um valor bruto para 0..1 dados os "bookends" min e max. */
export function normalize(raw: number, min: number, max: number): number {
  if (max === min) return raw >= max ? 1 : 0;
  return clamp01((raw - min) / (max - min));
}

export interface Vec2 {
  x: number;
  y: number;
}

export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Fonte de aleatoriedade injetável (para testes reproduzíveis). */
export interface Rng {
  /** Número em [0, 1). */
  next(): number;
}

/** Mulberry32: RNG simples, rápido e com semente. */
export class SeededRng implements Rng {
  private state: number;
  constructor(seed = 1) {
    this.state = seed >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}

/** Para quem cria um `Brain` sem `rng`: com semente, como todo sorteio do motor (`npc/mind.ts` passa o próprio). */
export const defaultRng: Rng = new SeededRng(1);
