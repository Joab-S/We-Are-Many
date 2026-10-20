import { generateSurface, type PlanetParams } from './surface';

/** Gera a superfície fora da thread principal, para a tela não travar. */
self.onmessage = (e: MessageEvent<{ params: PlanetParams; scale?: number }>) => {
  const map = generateSurface(e.data.params, e.data.scale);
  const buffers = [map.elevation, map.moisture, map.heat, map.vegetation, map.biome].map((a) => a.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage(map, buffers);
};
