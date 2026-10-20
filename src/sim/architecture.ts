/**
 * Arquitetura que acompanha a era (REQUISITOS-VIDA.md, 19.8, RF-VIDA-250 a
 * 254 e 288): estilo de cada casa pela era em que foi feita ou reformada,
 * material da região, ruas principais e vielas, e o brasão de cada reino.
 * Nada aqui sorteia: tudo sai do lugar e do estado do assentamento.
 */

import type { Value } from './economy';
import type { Vocation } from './needs';

/** Estilos de casa, um por era; o último é o sobrado (art.ts). */
export const HOUSE_STYLES = ['hut', 'cottage', 'house', 'stoneHouse', 'townhouse'] as const;
export type HouseStyle = (typeof HOUSE_STYLES)[number];

/**
 * Estilo de uma casa pela era em que foi feita (ou reformada pela última
 * vez), o nível do assentamento e os andares a mais. Cidades medievais já
 * têm sobrados; casa reformada sobe um estilo, sem passar do último.
 */
export function houseStyle(era: number, tier: number, level = 0): HouseStyle {
  const base = era >= 4 || (era >= 3 && tier >= 2) ? 4 : Math.max(0, Math.min(3, era));
  return HOUSE_STYLES[Math.min(HOUSE_STYLES.length - 1, base + level)];
}

/** Material das casas, pelo que há em volta (RF-VIDA-252). */
export const MATERIALS = ['plain', 'wood', 'stone', 'brick', 'adobe', 'snow'] as const;
export type BuildMaterial = (typeof MATERIALS)[number];

export const MATERIAL_NAMES: Record<BuildMaterial, string> = {
  plain: 'material comum',
  wood: 'madeira',
  stone: 'pedra',
  brick: 'tijolo',
  adobe: 'adobe',
  snow: 'telhado de neve',
};

/** Contagem do entorno, de 0 a 1 cada (fração dos tiles de terra). */
export interface Surroundings {
  rock: number;
  forest: number;
  desert: number;
  cold: number;
  /** Água doce ou costa por perto (barro para tijolo). */
  wet: boolean;
}

/**
 * O que mais aparece em volta decide o material: frio pesa mais (o telhado
 * de neve vale em qualquer parede), depois deserto, rocha, mata fechada e
 * barro de rio ou costa.
 */
export function pickMaterial(s: Surroundings): BuildMaterial {
  if (s.cold >= 0.5) return 'snow';
  if (s.desert >= 0.3) return 'adobe';
  if (s.rock >= 0.2) return 'stone';
  if (s.forest >= 0.6) return 'wood';
  if (s.wet) return 'brick';
  return 'plain';
}

/**
 * Ruas principais (RF-VIDA-253): na árvore das ruas a partir da praça, os
 * tiles por onde passa muita gente (o ramo que leva a pelo menos `share` das
 * ruas, e no mínimo `min` tiles) são principais; o resto são vielas.
 * `streets` e `square` são chaves de tile; `next` dá os vizinhos de um tile.
 */
export function mainStreets(streets: Set<number>, square: number[], next: (t: number) => number[], share = 0.12, min = 6): Set<number> {
  const parent = new Map<number, number>();
  const order: number[] = [];
  const queue: number[] = [];
  for (const s of square) {
    parent.set(s, -1);
    queue.push(s);
  }
  while (queue.length) {
    const t = queue.shift()!;
    for (const n of next(t)) {
      if (!streets.has(n) || parent.has(n)) continue;
      parent.set(n, t);
      order.push(n);
      queue.push(n);
    }
  }
  const below = new Map<number, number>();
  for (let k = order.length - 1; k >= 0; k--) {
    const t = order[k];
    const n = (below.get(t) ?? 0) + 1;
    below.set(t, n);
    const p = parent.get(t)!;
    if (p >= 0 && streets.has(p)) below.set(p, (below.get(p) ?? 0) + n);
  }
  const limit = Math.max(min, order.length * share);
  const out = new Set<number>();
  for (const t of order) if ((below.get(t) ?? 0) >= limit) out.add(t);
  return out;
}

/** Forma do escudo pelo valor do povo (RF-VIDA-288). */
export const CREST_SHAPES: Record<Value, 'round' | 'pointed' | 'square' | 'banner'> = {
  guerra: 'pointed',
  comércio: 'square',
  fé: 'round',
  conhecimento: 'banner',
};

/**
 * Emblema de cada vocação em 5x5 pixels (`#` aceso), desenhado no brasão,
 * na bandeira da fortaleza e no barco.
 */
export const CREST_EMBLEMS: Record<Vocation, string[]> = {
  agricola: ['..#..', '.###.', '..#..', '.###.', '..#..'],
  gado: ['#...#', '#####', '.###.', '.###.', '.#.#.'],
  ovelhas: ['.###.', '#####', '#####', '.###.', '.#.#.'],
  cavalos: ['...##', '..###', '####.', '.###.', '.#.#.'],
  pesqueira: ['.....', '.##.#', '#####', '.##.#', '.....'],
  mercantil: ['..#..', '#####', '#.#.#', '#.#.#', '.###.'],
  mineira: ['#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  madeireira: ['..#..', '.###.', '#####', '..#..', '..#..'],
};

/** Tipo de chão da avenida (em `Ecosystem.road`): rua larga e calçada, fora da regra dos blocos 2x2. */
export const AVENUE = 6;

/** Estrada de cascalho, fora das cidades, que nasce do uso das caravanas (RF-VIDA-233). */
export const GRAVEL = 7;

/** Rua de qualquer tipo: terra (1), pedra (2), praça (3), avenida (6) ou cascalho (7). */
export function isStreet(road: number): boolean {
  return (road >= 1 && road <= 3) || road === AVENUE || road === GRAVEL;
}

/**
 * Contorno da defesa (cerca, paliçada ou muralha): em vez de um círculo no
 * raio da área, que passava por campo vazio e entrava no espaço dos vizinhos,
 * a cerca abraça o que foi construído: é o contorno convexo das casas (em
 * relação ao centro, que fica sempre dentro), afastado `pad` tiles delas.
 * Retorna o raio do contorno em cada uma das `bins` direções, entre `min` e
 * `max`.
 */
export function wallProfile(points: { dx: number; dy: number }[], bins: number, max: number, min = 2.5, pad = 1.4): number[] {
  const pts: [number, number][] = [];
  const ring = 8;
  for (const p of [{ dx: 0, dy: 0 }, ...points]) {
    for (let k = 0; k < ring; k++) {
      const a = (k / ring) * Math.PI * 2;
      pts.push([p.dx + Math.cos(a) * pad, p.dy + Math.sin(a) * pad]);
    }
  }
  const hull = convexHull(pts);
  const out: number[] = [];
  for (let b = 0; b < bins; b++) {
    const a = (b / bins) * Math.PI * 2;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    // Onde o raio que sai do centro cruza a borda do contorno.
    let r = 0;
    for (let k = 0; k < hull.length; k++) {
      const [x1, y1] = hull[k];
      const [x2, y2] = hull[(k + 1) % hull.length];
      const ex = x2 - x1;
      const ey = y2 - y1;
      const den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = (x1 * ey - y1 * ex) / den;
      const s = (x1 * uy - y1 * ux) / den;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) r = Math.max(r, t);
    }
    out.push(Math.max(min, Math.min(max, r || min)));
  }
  return out;
}

/** Contorno convexo (cadeia monótona), no sentido anti-horário. */
function convexHull(pts: [number, number][]): [number, number][] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: [number, number][] = [];
  for (let k = p.length - 1; k >= 0; k--) {
    const q = p[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}
