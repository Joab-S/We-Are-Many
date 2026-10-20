import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/rng';
import { binomial, chance, gamma, happens, lognormal, logistic, ouStep, poisson, rateFor, streams, weighted } from './stochastic';

const mean = (f: () => number, n = 20000) => {
  let s = 0;
  for (let i = 0; i < n; i++) s += f();
  return s / n;
};

describe('simulação estocástica (RF-VIDA-300 a 306)', () => {
  it('a chance de um evento não depende do tamanho do passo', () => {
    // Um passo de 1 ano ou dez de 0,1 ano dão a mesma chance de nada acontecer.
    const big = 1 - chance(0.7, 1);
    let small = 1;
    for (let k = 0; k < 10; k++) small *= 1 - chance(0.7, 0.1);
    expect(small).toBeCloseTo(big, 10);
    expect(chance(rateFor(0.4), 1)).toBeCloseTo(0.4, 10);
  });

  it('a frequência sorteada bate com a taxa, em qualquer velocidade', () => {
    const rnd = mulberry32(1);
    const count = (dt: number) => {
      let n = 0;
      for (let t = 0; t < 2000; t += dt) if (happens(rnd, 0.05, dt)) n++;
      return n / 2000;
    };
    expect(count(1)).toBeCloseTo(0.05, 1);
    expect(count(0.1)).toBeCloseTo(0.05, 1);
  });

  it('as distribuições têm a média certa', () => {
    const rnd = mulberry32(7);
    expect(mean(() => poisson(rnd, 3))).toBeCloseTo(3, 1);
    expect(mean(() => poisson(rnd, 80), 4000) / 80).toBeCloseTo(1, 1);
    expect(mean(() => binomial(rnd, 20, 0.3))).toBeCloseTo(6, 0);
    expect(mean(() => gamma(rnd, 2, 5))).toBeCloseTo(5, 0);
    expect(mean(() => gamma(rnd, 0.5, 2))).toBeCloseTo(2, 0);
    expect(mean(() => lognormal(rnd, 10, 0.5))).toBeCloseTo(10, 0);
    const picks = [0, 0, 0];
    for (let i = 0; i < 9000; i++) picks[weighted(rnd, [1, 2, 0])]++;
    expect(picks[2]).toBe(0);
    expect(picks[1] / picks[0]).toBeCloseTo(2, 0);
    expect(weighted(rnd, [0, 0])).toBe(-1);
    expect(logistic(5, 5, 1)).toBe(0.5);
  });

  it('o ruído com retorno à média varia mas não deriva', () => {
    const rnd = mulberry32(3);
    let v = 0;
    let sq = 0;
    let max = 0;
    for (let k = 0; k < 20000; k++) {
      v = ouStep(rnd, v, 1, 0.6, 0.35);
      sq += v * v;
      max = Math.max(max, Math.abs(v));
    }
    expect(Math.sqrt(sq / 20000)).toBeCloseTo(0.35, 1);
    expect(max).toBeLessThan(2);
  });

  it('cada subsistema tem o seu fluxo de sorteio', () => {
    const a = streams(42);
    const b = streams(42);
    expect(a.vida()).toBe(b.vida());
    // Gastar sorteios da política não muda a sequência da vida.
    for (let k = 0; k < 10; k++) a.politica();
    expect(a.vida()).toBe(b.vida());
    expect(a.povos()).not.toBe(a.mundo());
  });
});
