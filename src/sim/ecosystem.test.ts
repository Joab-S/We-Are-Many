import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand, isWater } from './ecosystem';
import { nativeSpecies } from './species';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };
const mars: PlanetParams = { id: 'sol-4', name: 'Marte', radiusEarth: 0.4, temperatureK: 210, water: 0.04, life: 0 };

function world(params = earth) {
  const map = generateSurface(params);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(params)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

const run = (eco: Ecosystem, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) eco.step(0.1);
};

describe('espécies', () => {
  it('a Terra tem peixes, cervos, lobos e humanos; Marte não tem vida', () => {
    expect(nativeSpecies(earth).map((s) => s.name)).toEqual(['Peixe', 'Cervo', 'Lobo', 'Humano']);
    expect(nativeSpecies(mars)).toEqual([]);
  });
  it('planetas com vida geram espécies próprias de forma determinística', () => {
    const p = { ...earth, id: 'kepler-x' };
    expect(nativeSpecies(p)).toEqual(nativeSpecies(p));
    expect(nativeSpecies(p)[0].name).not.toBe('Peixe');
  });
});

describe('ecossistema', () => {
  it('começa com população e aldeias', () => {
    const { eco } = world();
    expect(eco.population[0]).toBeGreaterThan(20);
    expect(eco.population[1]).toBeGreaterThan(10);
    expect(eco.villages.length).toBeGreaterThanOrEqual(2);
  });

  it('cada criatura fica no seu habitat', () => {
    const { map, eco } = world();
    run(eco, 30);
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i]) continue;
      const t = Math.floor(eco.y[i]) * map.width + Math.floor(eco.x[i]);
      if (eco.species[eco.kind[i]].kind === 'fish') expect(isWater(map, t)).toBe(true);
      else expect(isLand(map, t)).toBe(true);
    }
  });

  it('a vida continua depois de vários anos', () => {
    const { eco } = world();
    run(eco, 120);
    expect(eco.year).toBeCloseTo(20, 0);
    expect(eco.population[0]).toBeGreaterThan(0);
    expect(eco.population[1]).toBeGreaterThan(0);
    expect(eco.population[3]).toBeGreaterThan(0);
  });

  it('peixes morrem quando o mar vira terra', () => {
    const { map, eco } = world();
    for (let i = 0; i < map.elevation.length; i++) map.elevation[i] = Math.abs(map.elevation[i]) + 0.05;
    run(eco, 10);
    expect(eco.population[0]).toBe(0);
  });

  it('o jogador pode introduzir uma espécie conhecida num planeta sem vida', () => {
    const { map } = world(mars);
    const eco = new Ecosystem(map, 1);
    const cervo = eco.addSpecies({ ...nativeSpecies(earth)[1], tempMin: 150 });
    let x = 0;
    let y = 0;
    for (let i = 0; i < map.elevation.length; i++) {
      if (isLand(map, i)) {
        x = i % map.width;
        y = Math.floor(i / map.width);
        break;
      }
    }
    expect(eco.introduce(cervo, x, y, 6, 10)).toBeGreaterThan(0);
  });

  it('ensinar avança a era da aldeia', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const before = v.tech;
    eco.teach(v.x, v.y, 3, 1);
    expect(v.tech).toBeGreaterThan(before);
  });
});
