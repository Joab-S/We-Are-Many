import { generateSurface, type PlanetParams, type SurfaceMap } from '../../procgen/surface';

/** Gera a superfície num Web Worker; se o worker falhar, gera na thread principal. */
export function generateSurfaceAsync(params: PlanetParams, scale = 1): Promise<SurfaceMap> {
  return new Promise((resolve) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../../procgen/surface.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      resolve(generateSurface(params, scale));
      return;
    }
    worker.onmessage = (e: MessageEvent<SurfaceMap>) => {
      worker.terminate();
      resolve(e.data);
    };
    worker.onerror = () => {
      worker.terminate();
      resolve(generateSurface(params, scale));
    };
    worker.postMessage({ params, scale });
  });
}
