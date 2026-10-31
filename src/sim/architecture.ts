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

/** Trilha pisada (RF-AS-13): nasce do uso dentro do assentamento e vira rua de terra com mais uso. */
export const TRAIL = 8;

/** Rua de qualquer tipo: terra (1), pedra (2), praça (3), avenida (6), cascalho (7) ou trilha (8). */
export function isStreet(road: number): boolean {
  return (road >= 1 && road <= 3) || road === AVENUE || road === GRAVEL || road === TRAIL;
}

/** Muralha (RF-AS-18, em `Ecosystem.wall`): paliçada, muralha de pedra e portão. */
export const WALL = { palisade: 1, stone: 2, gate: 3 } as const;
