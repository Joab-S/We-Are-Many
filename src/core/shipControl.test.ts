import { describe, expect, it } from 'vitest';
import { stepSpeedFactor, Turbo } from './shipControl';

const run = (fn: () => void, seconds: number, dt = 1 / 60) => {
  for (let t = 0; t < seconds; t += dt) fn();
};

describe('acelerador', () => {
  it('chega ao máximo segurando W e desliza até parar sem nada', () => {
    let s = 0;
    run(() => (s = stepSpeedFactor(s, 1, 1 / 60)), 3);
    expect(s).toBe(1);
    run(() => (s = stepSpeedFactor(s, 0, 1 / 60)), 2);
    expect(s).toBeGreaterThan(0.4);
    run(() => (s = stepSpeedFactor(s, 0, 1 / 60)), 3);
    expect(s).toBe(0);
  });
  it('S freia mais rápido do que a nave desliza e limita a ré', () => {
    let s = 1;
    run(() => (s = stepSpeedFactor(s, -1, 1 / 60)), 1);
    expect(s).toBeLessThan(0.1);
    run(() => (s = stepSpeedFactor(s, -1, 1 / 60)), 2);
    expect(s).toBe(-0.3);
  });
});

describe('turbo', () => {
  it('dura cerca de 4 segundos e depois esgota', () => {
    const t = new Turbo();
    run(() => t.step(true, 1 / 60), 3.5);
    expect(t.active).toBe(true);
    run(() => t.step(true, 1 / 60), 1);
    expect(t.active).toBe(false);
    expect(t.exhausted).toBe(true);
  });
  it('recarrega depois de uma pausa e só religa com energia mínima', () => {
    const t = new Turbo();
    run(() => t.step(true, 1 / 60), 5);
    run(() => t.step(true, 1 / 60), 2);
    expect(t.active).toBe(false);
    run(() => t.step(false, 1 / 60), 4);
    expect(t.energy).toBeGreaterThan(0.3);
    t.step(true, 1 / 60);
    expect(t.active).toBe(true);
    expect(t.multiplier).toBe(4);
  });
});
