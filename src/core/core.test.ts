import { describe, expect, it } from 'vitest';
import { adaptiveMaxSpeed, approachTime, DEFAULT_TUNING } from './flight';
import { bvToTemperature, temperatureToRgb } from './astro';
import { hashString, mulberry32, seedFor } from './rng';
import { AU_PER_PC } from './units';

describe('rng', () => {
  it('é determinístico', () => {
    const a = mulberry32(seedFor('HYG-71683'));
    const b = mulberry32(seedFor('HYG-71683'));
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });
  it('muda com o id e a versão', () => {
    expect(seedFor('x', 1)).not.toBe(seedFor('x', 2));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
});

describe('velocidade adaptativa', () => {
  it('é proporcional à distância, com piso e teto', () => {
    expect(adaptiveMaxSpeed(10)).toBeCloseTo(3);
    expect(adaptiveMaxSpeed(0)).toBe(DEFAULT_TUNING.minSpeed);
    expect(adaptiveMaxSpeed(1e12)).toBe(DEFAULT_TUNING.maxSpeed);
  });
  it('cumpre a meta de chegar a uma estrela vizinha em até 2 minutos', () => {
    // Sol -> Alfa Centauri (1,34 pc): sair da órbita da Terra até o meio do caminho e voltar a 1 UA.
    const half = (1.34 / 2) * AU_PER_PC;
    const total = approachTime(1, half) * 2;
    expect(total).toBeGreaterThan(30);
    expect(total).toBeLessThan(120);
  });
});

describe('astro', () => {
  it('estima temperatura do Sol pelo B-V', () => {
    expect(bvToTemperature(0.656)).toBeGreaterThan(5500);
    expect(bvToTemperature(0.656)).toBeLessThan(6000);
  });
  it('estrelas frias são avermelhadas e quentes azuladas', () => {
    const [r1, , b1] = temperatureToRgb(3000);
    const [r2, , b2] = temperatureToRgb(20000);
    expect(r1).toBeGreaterThan(b1);
    expect(b2).toBeGreaterThan(r2);
  });
});
