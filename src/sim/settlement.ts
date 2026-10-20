/**
 * Planta dos assentamentos (REQUISITOS-VIDA.md, seção de assentamentos):
 * níveis, área de cada um e ruas tortas que crescem com o nível. Funções
 * puras; o Ecosystem aplica o resultado ao mapa.
 */

export const TIER_NAMES = ['Aldeia', 'Vila', 'Cidade', 'Metrópole'];
/** Raio da área de cada nível, em tiles. */
export const TIER_RADIUS = [8, 12, 18, 25];
/** População mínima de cada nível. */
export const TIER_POPULATION = [0, 25, 60, 140];

export function tierFor(population: number): number {
  let t = 0;
  while (t + 1 < TIER_POPULATION.length && population >= TIER_POPULATION[t + 1]) t++;
  return t;
}

/** Rua: tiles em sequência (relativos ao centro), da praça para fora, sem diagonais soltas. */
export interface Street {
  pts: { x: number; y: number }[];
}

/** Comprimento das ruas principais por nível. */
const ARM = [5, 9, 15, 22];

/** Gerador pseudoaleatório simples e determinístico. */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente estável de um assentamento a partir do lugar da praça. */
export function plotSeed(x: number, y: number): number {
  return (Math.imul(Math.floor(x), 73856093) ^ Math.imul(Math.floor(y), 19349663)) >>> 0;
}

/**
 * Anda `len` tiles a partir de (x, y) na direção `angle`, virando um pouco a
 * cada passo (sem se afastar muito da direção inicial). Quando o passo é
 * diagonal, põe um tile no meio para a rua não ficar furada.
 */
function walk(x: number, y: number, angle: number, len: number, r: () => number, wiggle: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let fx = x;
  let fy = y;
  let a = angle;
  let px = Math.round(fx);
  let py = Math.round(fy);
  while (pts.length < len) {
    a += (r() - 0.5) * wiggle + (angle - a) * 0.1;
    fx += Math.cos(a);
    fy += Math.sin(a);
    const nx = Math.round(fx);
    const ny = Math.round(fy);
    if (nx === px && ny === py) continue;
    if (nx !== px && ny !== py) pts.push({ x: nx, y: py });
    pts.push({ x: nx, y: ny });
    px = nx;
    py = ny;
  }
  return pts.slice(0, len);
}

/**
 * Ruas do nível, com traçado orgânico: de 3 a 5 ruas principais saem da praça
 * em direções sorteadas e vão serpenteando; em vilas e cidades nascem ruas
 * laterais delas. A mesma semente dá sempre a mesma planta, e cada nível
 * apenas estende a do nível anterior (as casas já construídas continuam
 * na beira da rua).
 */
export function streetPlan(tier: number, seed = 0): Street[] {
  const r = rng(seed);
  const streets: Street[] = [];
  const arms = 3 + Math.floor(r() * 3);
  const turn = r() * Math.PI * 2;
  for (let k = 0; k < arms; k++) {
    const angle = turn + (k / arms) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const full = walk(Math.cos(angle) * 2, Math.sin(angle) * 2, angle, ARM[3], r, 0.45);
    streets.push({ pts: full.slice(0, ARM[tier]) });
    // Ruas laterais: saem da principal a cada 4–6 tiles, alternando o lado.
    let side = r() < 0.5 ? 1 : -1;
    for (let at = 3 + Math.floor(r() * 2); at < ARM[3] - 2; at += 4 + Math.floor(r() * 3)) {
      side = -side;
      const p = full[at];
      const q = full[Math.min(at + 1, full.length - 1)];
      const dir = Math.atan2(q.y - p.y, q.x - p.x) + side * (1.1 + r() * 0.8);
      const len = 4 + Math.floor(r() * 4) + Math.floor(at / 5);
      const branch = walk(p.x, p.y, dir, len, r, 0.6);
      const minTier = at < ARM[1] - 1 ? 1 : at < ARM[2] - 1 ? 2 : 3;
      if (tier >= minTier) streets.push({ pts: branch.slice(0, Math.ceil(len * Math.min(1, (tier - minTier + 1) / 2))) });
    }
  }
  return streets;
}

/**
 * Lotes de casa (canto superior esquerdo de 2x2 tiles) dos dois lados das
 * ruas, a cada 3 tiles e com um pouco de folga, ordenados do centro para
 * fora. Lotes que caem em cima de rua ou de outra casa são pulados na hora
 * de construir.
 */
export function lotsFor(tier: number, seed = 0): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  const r = rng(seed ^ 0x9e3779b9);
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k) || (x + 1) ** 2 + (y + 1) ** 2 > TIER_RADIUS[tier] ** 2) return;
    seen.add(k);
    out.push({ x, y });
  };
  for (const { pts } of streetPlan(tier, seed)) {
    for (let i = 1; i < pts.length; i += 3) {
      const a = pts[i - 1];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (const side of [1, -1]) {
        const d = 2 + r() * 0.8;
        add(Math.round(pts[i].x - 0.5 + side * nx * d + (r() - 0.5) * 0.6), Math.round(pts[i].y - 0.5 + side * ny * d + (r() - 0.5) * 0.6));
      }
    }
  }
  return out.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
}

/** Diferença horizontal mais curta num mapa que dá a volta. */
export function wrapDx(dx: number, width: number): number {
  return dx - Math.round(dx / width) * width;
}
