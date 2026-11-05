import { describe, expect, it } from 'vitest';
import { ecologyOf, moistFit, preysOn, refreshEcology, tempFit } from './fauna';
import { earthCatalog, relationOf, type Species } from './species';

const earth = (name: string) => earthCatalog().find((sp) => sp.name === name)!;

describe('tabela de relações por espécie', () => {
  it('na Terra, é a regra de sempre: quem não caça é presa, se couber', () => {
    const wolf = earth('Lobo');
    const deer = earth('Cervo');
    expect(relationOf(wolf, deer)).toBe('presa');
    expect(relationOf(deer, wolf)).toBe('predador');
    expect(relationOf(wolf, wolf)).toBe('neutro');
    expect(relationOf(deer, earth('Coelho'))).toBe('neutro');
    // Grande demais: a mesma conta da capacidade (em bando, o dobro).
    expect(relationOf(earth('Raposa'), earth('Elefante'))).toBe('neutro');
  });

  it('a domesticação entra pela mesma tabela', () => {
    const human = earth('Humano');
    expect(relationOf(human, earth('Ovelha'))).toBe('domestica');
    expect(relationOf(human, earth('Lobo'))).toBe('neutro');
  });

  it('um caçador que evita uma guilda deixa de contá-la como comida', () => {
    const wolf: Species = { ...earth('Lobo'), id: 'lobo-do-teste' };
    const deer = earth('Cervo');
    const guild = ecologyOf(deer).guild;
    expect(preysOn(ecologyOf(wolf), ecologyOf(deer))).toBe(true);
    wolf.eco = { relations: { [guild]: 'evita' } };
    refreshEcology(wolf);
    expect(preysOn(ecologyOf(wolf), ecologyOf(deer))).toBe(false);
    expect(relationOf(wolf, deer)).toBe('evita');
    expect(relationOf(deer, wolf)).toBe('neutro');
  });
});

describe('faixas como dados', () => {
  const base = earth('Cervo');

  it('sem faixa ideal, a conta é a de hoje', () => {
    for (const margin of [0, 1, 5, 6, 20]) {
      expect(tempFit(base, base.tempMin + margin)).toBe(Math.min(1, 0.35 + margin / 8));
    }
  });

  it('com faixa ideal, sobe até ela, nos dois lados', () => {
    const sp: Species = { ...base, tempMin: 260, tempMax: 300, tempIdeal: [275, 285] };
    expect(tempFit(sp, 260)).toBeCloseTo(0.35);
    expect(tempFit(sp, 300)).toBeCloseTo(0.35);
    expect(tempFit(sp, 275)).toBe(1);
    expect(tempFit(sp, 280)).toBe(1);
    expect(tempFit(sp, 285)).toBe(1);
    expect(tempFit(sp, 267.5)).toBeGreaterThan(0.35);
    expect(tempFit(sp, 267.5)).toBeLessThan(1);
  });

  it('a umidade: boa, ruim e, com a faixa extrema, impossível', () => {
    const e = { ...ecologyOf(base), moist: [0.3, 0.6] as [number, number] };
    expect(moistFit(e, 0.5)).toBe(1);
    expect(moistFit(e, 0.1)).toBe(0.35);
    expect(moistFit({ ...e, moistExtreme: [0.2, 0.8] }, 0.1)).toBe(0);
    expect(moistFit({ ...e, moistExtreme: [0.2, 0.8] }, 0.7)).toBe(0.35);
  });
});
