/**
 * Planta dos assentamentos (REQUISITOS-VIDA.md, seção de assentamentos):
 * níveis, área de cada um e ruas em cruz que crescem com o nível. Funções
 * puras; o Ecosystem aplica o resultado ao mapa.
 */

export const TIER_NAMES = ['Aldeia', 'Vila', 'Cidade'];
/** Raio da área de cada nível, em tiles. */
export const TIER_RADIUS = [8, 12, 18];
/** População mínima de cada nível. */
export const TIER_POPULATION = [0, 25, 60];

export function tierFor(population: number): number {
  let t = 0;
  while (t + 1 < TIER_POPULATION.length && population >= TIER_POPULATION[t + 1]) t++;
  return t;
}

/** Trecho de rua: começa em (x, y) relativo ao centro e anda `len` tiles na direção (dx, dy). */
export interface Street {
  x: number;
  y: number;
  dx: number;
  dy: number;
  len: number;
}

/**
 * Ruas do nível: uma cruz saindo da praça e, em vilas e cidades, ruas
 * paralelas formando uma grade. Cada trecho sai de um cruzamento para fora,
 * para poder parar na água sem deixar pedaços soltos.
 */
export function streetPlan(tier: number): Street[] {
  const arm = [5, 9, 15][tier];
  const streets: Street[] = [];
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) streets.push({ x: dx * 2, y: dy * 2, dx, dy, len: arm - 1 });
  const lines = tier === 0 ? [] : tier === 1 ? [6, -6] : [6, -6, 12, -12];
  const span = tier === 1 ? 7 : 13;
  for (const o of lines) {
    for (const d of [1, -1]) {
      streets.push({ x: 0, y: o, dx: d, dy: 0, len: span });
      streets.push({ x: o, y: 0, dx: 0, dy: d, len: span });
    }
  }
  return streets;
}

/**
 * Lotes de casa (canto superior esquerdo de 2x2 tiles) ao longo das ruas,
 * dos dois lados, a cada 3 tiles, ordenados do centro para fora.
 */
export function lotsFor(tier: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k) || x * x + y * y > TIER_RADIUS[tier] ** 2) return;
    seen.add(k);
    out.push({ x, y });
  };
  for (const s of streetPlan(tier)) {
    for (let step = 1; step <= s.len; step += 3) {
      const x = s.x + s.dx * step;
      const y = s.y + s.dy * step;
      if (s.dy === 0) {
        add(x, y - 2);
        add(x, y + 1);
      } else {
        add(x - 2, y);
        add(x + 1, y);
      }
    }
  }
  return out.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
}

/** Diferença horizontal mais curta num mapa que dá a volta. */
export function wrapDx(dx: number, width: number): number {
  return dx - Math.round(dx / width) * width;
}
