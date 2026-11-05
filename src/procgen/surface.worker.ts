import { chooseLife } from '../sim/lifeTrial';
import { generateSurface, type PlanetParams } from './surface';

/** Gera a superfície fora da thread principal, para a tela não travar. */
self.onmessage = (e: MessageEvent<{ params: PlanetParams; scale?: number }>) => {
  const map = generateSurface(e.data.params, e.data.scale);
  // Só o mapa de pisar, não as prévias do espaço: é ele que vai ter gente.
  if ((e.data.scale ?? 1) === 1) map.life = chooseLife(map);
  const arrays = [map.elevation, map.moisture, map.heat, map.vegetation, map.biome, map.climate, map.plate, map.boundary, map.stress];
  const buffers = arrays.filter((a) => a !== undefined).map((a) => a.buffer as ArrayBuffer);
  (self as unknown as Worker).postMessage(map, buffers);
};
