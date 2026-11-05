import { describe, expect, it } from 'vitest';
import { ecologyOf, hunts, moistFit, preyInReach, preysOn, refreshEcology, tempFit } from './fauna';
import { earthCatalog, nativeSpecies, relationOf, type Species } from './species';

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

describe('relações sorteadas nos alienígenas', () => {
  const planet = (k: number) => ({ id: `rel-${k}`, name: 'Rel', radiusEarth: 0.6, temperatureK: 280, water: 0.5, life: 0.9 });
  const worlds = Array.from({ length: 30 }, (_, k) => nativeSpecies(planet(k), 0, 'animals'));
  const hunters = worlds.flat().filter((sp) => sp.kind === 'predator' && hunts(ecologyOf(sp)));

  it('são da semente: o mesmo planeta sorteia a mesma tabela', () => {
    expect(nativeSpecies(planet(3), 0, 'animals').map((sp) => sp.eco?.relations)).toEqual(worlds[3].map((sp) => sp.eco?.relations));
  });

  it('variam entre planetas, e parte dos caçadores evita alguma guilda', () => {
    const avoid = hunters.filter((sp) => Object.values(sp.eco!.relations ?? {}).includes('evita'));
    expect(avoid.length).toBeGreaterThan(0);
    expect(avoid.length).toBeLessThan(hunters.length);
  });

  it('todo caçador fica com duas presas possíveis, mesmo evitando', () => {
    for (const list of worlds) {
      const prey = list.filter((sp) => sp.kind === 'herbivore');
      for (const sp of list) {
        if (sp.kind !== 'predator' || !hunts(ecologyOf(sp))) continue;
        const e = ecologyOf(sp);
        const fits = prey.filter((p) => preyInReach(e, ecologyOf(p)));
        if (fits.length < 2 || !Object.values(e.relations ?? {}).includes('evita')) continue;
        expect(fits.filter((p) => preysOn(e, ecologyOf(p))).length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('parte dos pastadores não se domestica, e o povo vê isso na tabela', () => {
    const grazers = worlds.flat().filter((sp) => sp.eco?.guild === 'pastador');
    expect(grazers.some((sp) => sp.eco!.untamed)).toBe(true);
    expect(grazers.some((sp) => !sp.eco!.untamed)).toBe(true);
    const people = nativeSpecies(planet(0), 0, 'sapient').find((sp) => sp.kind === 'sapient')!;
    const untamed = grazers.find((sp) => sp.eco!.untamed)!;
    expect(relationOf(people, untamed)).toBe('neutro');
  });

  it('a faixa ideal fica dentro da extrema, e a Terra não tem relação sorteada', () => {
    for (const sp of worlds.flat()) {
      if (!sp.tempIdeal) continue;
      expect(sp.tempIdeal[0]).toBeGreaterThan(sp.tempMin);
      expect(sp.tempIdeal[1]).toBeLessThan(sp.tempMax);
    }
    for (const sp of earthCatalog()) expect(ecologyOf(sp).relations).toBeUndefined();
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
