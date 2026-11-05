import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SOL_PLANETS } from '../../nav/planets';
import { Biome, generateSurface, paintSurface, type SurfaceMap } from '../../procgen/surface';
import { WALL } from '../../sim/architecture';
import { Ecosystem, isLand } from '../../sim/ecosystem';
import { createPlanetBody, planetParams } from '../space/bodies';
import { MapRaster } from './MapRaster';
import type { Viewport } from './Viewport';

vi.mock('./generateAsync', () => ({ generateSurfaceAsync: vi.fn() }));

const mars = SOL_PLANETS[3];
const newMap = (): SurfaceMap => generateSurface(planetParams(mars), 0.25);

/** Os canvas dos enfeites e da textura de faixas: o suficiente para rodar sem navegador. */
const stubDocument = () => ({
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect() {} }) }),
});

/** Os pixels que a esfera do planeta visitado usa quando ainda não há retrato do mapa. */
function spherePixels(map: SurfaceMap): Uint8Array {
  const world = { surfaces: new Map([[mars.id, map]]), surfaceArt: new Map<string, Uint8Array>() };
  createPlanetBody(mars, world);
  return world.surfaceArt.get(mars.id)!;
}

/** Os tiles em que duas pinturas do mapa diferem em qualquer canal. */
function differingTiles(a: Uint8Array, b: Uint8Array): number[] {
  expect(a.length).toBe(b.length);
  const tiles: number[] = [];
  for (let o = 0; o < a.length; o += 4) {
    if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2] || a[o + 3] !== b[o + 3]) tiles.push(o / 4);
  }
  return tiles;
}

beforeAll(() => vi.stubGlobal('document', stubDocument()));
afterAll(() => vi.unstubAllGlobals());

describe('a cor do tile é uma só no mapa 2D e na esfera', () => {
  it('sem construções, as duas pinturas são iguais pixel a pixel', () => {
    const map = newMap();
    const raster = new MapRaster(map, new Ecosystem(map, 1));
    expect(differingTiles(raster.pixels, spherePixels(map))).toEqual([]);
  });

  it('com construções, só os tiles de rua, muralha e casa diferem', () => {
    const map = newMap();
    const eco = new Ecosystem(map, 1);
    const land: number[] = [];
    for (let i = 0; i < map.biome.length && land.length < 3; i++) if (isLand(map, i)) land.push(i);
    expect(land.length).toBe(3);
    const [road, wall, house] = land;
    eco.road[road] = 1;
    eco.wall[wall] = WALL.stone;
    eco.built[house] = 1;
    const raster = new MapRaster(map, eco);
    expect(differingTiles(raster.pixels, spherePixels(map))).toEqual([road, wall, house].sort((a, b) => a - b));
  });

  it('repintar um tile que mudou dá o mesmo que pintar o mapa inteiro', () => {
    const map = newMap();
    const raster = new MapRaster(map, new Ecosystem(map, 1));
    const i = map.biome.findIndex((b, k) => b !== Biome.Desert && isLand(map, k));
    expect(i).toBeGreaterThanOrEqual(0);
    map.biome[i] = Biome.Desert;
    raster.markDirty(i);
    // Sem o canvas da tela (nada desenhado ainda), o `flush` só repinta os pixels e não usa a vista.
    raster.flush({} as Viewport);
    const whole = new Uint8Array(raster.pixels.length);
    paintSurface(map, whole);
    expect(differingTiles(raster.pixels, whole)).toEqual([]);
  });
});
