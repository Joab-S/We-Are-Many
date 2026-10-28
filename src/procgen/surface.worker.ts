import { generateSurface, type PlanetParams } from './surface';

/** Gera a superfície fora da thread principal, para a tela não travar. */
self.onmessage = (e: MessageEvent<{ params: PlanetParams; scale?: number }>) => {
  const map = generateSurface(e.data.params, e.data.scale);
  const arrays = [map.elevation, map.moisture, map.heat, map.vegetation, map.biome, map.climate, map.plate, map.boundary, map.stress];
  const buffers = arrays.filter((a) => a !== undefined).map((a) => a.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage(map, buffers);
};
