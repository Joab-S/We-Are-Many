import { describe, expect, it } from 'vitest';
import { snapshotEcosystem } from '../../save/snapshot';
import { seedWorld } from '../calibrate';
import { YEAR_SECONDS } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { createEngine, ecosystemOf, type Engine } from './engine';

const SEED = 9;
const DT = 0.25;

function engineFor(): Engine {
  const { eco, map } = seedWorld(SEED, 0.3);
  return createEngine(map, { seed: SEED, eco });
}

describe('consultas da tela não mudam o mundo', () => {
  it('pick e pickAll entre os passos (o mouse sobre o mapa) deixam o mundo igual ao de quem não consulta', () => {
    const years = 6;
    const quiet = engineFor();
    const busy = engineFor();
    for (let y = 0; y < years; y++) {
      for (let t = 0; t < YEAR_SECONDS; t += DT) {
        quiet.step(DT);
        busy.step(DT);
        // A seleção pergunta a cada quadro pela criatura sob o mouse; aqui, sobre algumas criaturas vivas.
        const v = busy.view;
        for (let i = 0; i < v.count; i += 97) {
          if (!v.alive[i]) continue;
          v.pick(v.x[i] + 0.5, v.y[i], 3);
          v.pickAll(v.x[i], v.y[i] + 0.5, 6);
        }
      }
    }
    const a = ecosystemOf(quiet);
    const b = ecosystemOf(busy);
    expect(worldFingerprint(b)).toBe(worldFingerprint(a));
    expect(snapshotEcosystem(b, SEED)).toEqual(snapshotEcosystem(a, SEED));
  });
});
