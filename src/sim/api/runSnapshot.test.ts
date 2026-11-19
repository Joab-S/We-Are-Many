import { describe, expect, it } from 'vitest';
import { seedWorld } from '../calibrate';
import { YEAR_SECONDS } from '../ecosystem';
import { worldFingerprint } from '../fingerprint';
import { createEngine, ecosystemOf } from './engine';
import { buffersOf, RUN_STEP, runSnapshot } from './runSnapshot';

const SEED = 77;

function world() {
  const { eco, map } = seedWorld(SEED);
  return createEngine(map, { seed: SEED, eco });
}

function runLive(engine: ReturnType<typeof world>, years: number) {
  for (let s = 0; s < (years * YEAR_SECONDS) / RUN_STEP; s++) engine.step(RUN_STEP);
}

describe('o motor roda sem tela a partir de um retrato', () => {
  it('30 anos a partir de um retrato dão o mesmo mundo que 30 anos rodados direto', () => {
    const live = world();
    const start = live.snapshot();
    runLive(live, 30);
    // O clone é o que o `postMessage` faz com o pedido.
    const result = runSnapshot(structuredClone({ snapshot: start, years: 30, budgetMs: Infinity }), () => 0);
    expect(result.cut).toBe(false);
    expect(result.yearsRun).toBe(30);
    expect(result.fingerprint).toBe(worldFingerprint(ecosystemOf(live)));
    // E o retrato devolvido continua o mesmo mundo, ao ser adotado do outro lado.
    const back = world();
    back.restore(structuredClone(result.snapshot));
    expect(worldFingerprint(ecosystemOf(back))).toBe(result.fingerprint);
  }, 60000);

  it('o tempo de máquina corta no fim de um ano, e não muda o que rodou', () => {
    const start = world().snapshot();
    let now = 0;
    const years: number[] = [];
    // Cada leitura do relógio avança 40 ms: a segunda volta já passa do orçamento de 50 ms.
    const cut = runSnapshot({ snapshot: structuredClone(start), years: 10, budgetMs: 50 }, () => (now += 40), (y) => years.push(y));
    expect(cut.cut).toBe(true);
    expect(cut.yearsRun).toBe(2);
    expect(years).toEqual([1, 2]);
    const whole = runSnapshot({ snapshot: structuredClone(start), years: 2, budgetMs: Infinity }, () => 0);
    expect(cut.fingerprint).toBe(whole.fingerprint);
  }, 30000);

  it('a lista de transferência tem cada buffer uma vez', () => {
    const a = new Float32Array(4);
    const buffers = buffersOf({ a, also: a, nested: [new Uint8Array(a.buffer)], map: new Map([['k', new Int16Array(2)]]), n: 1, s: 'x' });
    expect(buffers.length).toBe(2);
    expect(buffers).toContain(a.buffer);
  });

  it('transfere os arrays do mundo inteiro', () => {
    const snap = world().snapshot();
    const buffers = buffersOf(snap);
    expect(buffers).toContain(snap.map.elevation.buffer);
    expect(buffers.length).toBeGreaterThan(10);
  });
});
