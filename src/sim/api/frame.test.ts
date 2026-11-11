import { describe, expect, it } from 'vitest';
import { seedWorld } from '../calibrate';
import { YEAR_SECONDS } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { createEngine, ecosystemOf } from './engine';
import { creatureBytes, FrameMeter } from './frame';

const SEED = 1234;
const YEARS = 20;

function world() {
  const { eco, map } = seedWorld(SEED);
  return createEngine(map, { seed: SEED, eco });
}

function run(meter: FrameMeter | null, engine: ReturnType<typeof world>) {
  for (let y = 0; y < YEARS; y++) {
    for (let t = 0; t < YEAR_SECONDS; t += 0.25) {
      engine.step(0.25);
      meter?.sample();
    }
  }
}

describe('quanto a tela leria do motor por passo', () => {
  it('uma criatura ocupa 39 bytes nos 14 arrays da vista', () => {
    expect(creatureBytes(world().view)).toBe(39);
  });

  it('fica dentro do orçamento, e medir não muda o mundo', () => {
    const measured = world();
    const meter = new FrameMeter(measured);
    run(meter, measured);
    const r = meter.report();
    expect(r.steps).toBe(YEARS * (YEAR_SECONDS / 0.25));
    // A Terra do jogo, em 100 anos, deu 148 KB de média e 171 KB de pico (tabela de docs/SEPARACAO-MOTOR.md).
    // Este mundo tem um sexto dos tiles: se passar daqui, a tabela envelheceu e os custos do Worker também.
    expect(r.bytesPerStep.mean).toBeLessThan(100 * 1024);
    expect(r.bytesPerStep.max).toBeLessThan(130 * 1024);
    expect(r.tiles.mean).toBeLessThan(1500);
    // O mundo tem tudo que a conta soma.
    expect(r.count.mean).toBeGreaterThan(0);
    expect(r.tiles.mean).toBeGreaterThan(0);
    expect(r.villages.mean).toBeGreaterThan(0);

    const plain = world();
    run(null, plain);
    expect(worldFingerprint(ecosystemOf(measured))).toBe(worldFingerprint(ecosystemOf(plain)));
  }, 30000);
});
