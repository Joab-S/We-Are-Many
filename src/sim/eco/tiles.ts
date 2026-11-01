/** Testes de tile do mapa da superfície (água e terra). */

import * as surfaceModule from '../../procgen/surface';
import type { SurfaceMap } from '../../procgen/surface';

// Cópias locais dos valores importados (o porquê está em ecosystem.ts).
const { Biome } = surfaceModule;

export function isWater(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] < 0 && map.biome[i] !== Biome.Ice && map.biome[i] !== Biome.Lava;
}

export function isLand(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] >= 0 && map.biome[i] !== Biome.Lava;
}

/**
 * Os quatro vizinhos de um tile (leste, oeste, sul, norte), nesta ordem. Constante do módulo: as buscas
 * chamadas a cada decisão não montam a lista de novo a cada volta.
 */
export const NEIGHBORS4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
