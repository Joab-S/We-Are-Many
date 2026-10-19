import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand, isWater } from './ecosystem';
import { lotsFor, streetPlan, TIER_RADIUS } from './settlement';
import { nativeLifeLevel, nativeLifeTier, nativeSpecies } from './species';

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
  it('vida nativa fora da Terra vem em três níveis raros', () => {
    const count = { none: 0, plants: 0, animals: 0, sapient: 0 };
    for (let k = 0; k < 20000; k++) count[nativeLifeTier(`exo-${k}`, 0.8)]++;
    expect(count.plants / 20000).toBeCloseTo(0.25, 1);
    expect((count.animals + count.sapient) / 20000).toBeCloseTo(0.08, 1);
    expect(count.sapient).toBeGreaterThan(80);
    expect(count.sapient).toBeLessThan(250);
    expect(nativeLifeLevel('sol-3', 0.85)).toBe(0.85);
  });
  it('planetas com vida geram espécies próprias de forma determinística', () => {
    let k = 0;
    while (nativeLifeTier(`kepler-${k}`, 0.85) !== 'animals') k++;
    const p = { ...earth, id: `kepler-${k}` };
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

describe('assentamentos', () => {
  it('aldeias e vilas nunca contêm outro assentamento, e as casas ficam fora das ruas', () => {
    const { map, eco } = world({ ...earth, radiusEarth: 1 });
    // Força o crescimento para ter vilas, cidades e colônias.
    for (const v of eco.villages) v.tech = 2.5;
    run(eco, 240);
    const live = eco.villages.filter((v) => !v.abandoned);
    expect(live.length).toBeGreaterThan(1);
    for (const a of live) {
      if (a.tier >= 2) continue;
      for (const b of live) {
        if (a === b) continue;
        let dx = Math.abs(a.x - b.x);
        if (dx > map.width / 2) dx = map.width - dx;
        expect(Math.hypot(dx, a.y - b.y)).toBeGreaterThanOrEqual(TIER_RADIUS[a.tier]);
      }
    }
    let houses = 0;
    for (const v of live) {
      houses += v.houses.length;
      for (const h of v.houses) {
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
          const t = (h.y + dy) * map.width + ((h.x + dx) % map.width);
          expect(eco.road[t]).toBe(0);
          expect(eco.built[t]).toBe(1);
        }
      }
    }
    expect(eco.built.reduce((n, b) => n + b, 0)).toBe(houses * 4);
    expect(eco.road.some((r) => r > 0)).toBe(true);
  });

  it('não deixa fundar dentro da área de outro assentamento', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    const before = eco.villages.length;
    expect(eco.introduce(s, v.x + 3, v.y, 2, 6)).toBe(0);
    expect(eco.villages.length).toBe(before);
  });

  it('a planta cresce com o nível', () => {
    expect(lotsFor(0).length).toBeLessThan(lotsFor(1).length);
    expect(lotsFor(1).length).toBeLessThan(lotsFor(2).length);
    expect(streetPlan(2).length).toBeGreaterThan(streetPlan(0).length);
  });
});
