/** Testes de tile do mapa da superfície (água e terra). */

import { Biome, type SurfaceMap } from '../../procgen/surface';

export function isWater(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] < 0 && map.biome[i] !== Biome.Ice && map.biome[i] !== Biome.Lava;
}

export function isLand(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] >= 0 && map.biome[i] !== Biome.Lava;
}
