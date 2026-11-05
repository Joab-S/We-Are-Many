import { restoreEcosystem, snapshotEcosystem, type EcosystemSnapshot } from '../save/snapshot';
import { runWorld } from './calibrate';
import { YEAR_SECONDS, type Ecosystem } from './ecosystem';

type Shot = { map: Ecosystem['map']; eco: EcosystemSnapshot };

/**
 * Um mundo de teste rodado uma vez só e fotografado nos anos pedidos. Cada `at(ano)` devolve uma cópia nova e
 * independente do mundo naquele ano, igual à de `runWorld(seed, ano).eco`: o teste pode mexer nela e rodar mais anos
 * sem atrapalhar os outros. Os testes de mundo longo da mesma semente ficam no mesmo arquivo para dividir a rodada.
 */
export function sharedWorld(seed: number, years: number[]): { at(year: number): Ecosystem } {
  const shots = new Map<number, Shot>();
  const last = Math.max(...years);
  runWorld(seed, last, 0.4, YEAR_SECONDS, (y, eco) => {
    if (years.includes(y)) shots.set(y, structuredClone({ map: eco.map, eco: snapshotEcosystem(eco, seed) }));
  });
  return {
    at(year) {
      const shot = shots.get(year);
      if (!shot) throw new Error(`o mundo ${seed} não foi fotografado no ano ${year}`);
      const copy = structuredClone(shot);
      return restoreEcosystem(copy.eco, copy.map);
    },
  };
}
