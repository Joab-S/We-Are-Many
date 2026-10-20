import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { BOATS, Ecosystem, isLand, isWater, YEAR_SECONDS } from './ecosystem';
import { CHILD } from './roles';
import { lotsFor, streetPlan, TIER_RADIUS } from './settlement';
import { habitatOf, nativeLifeLevel, nativeLifeTier, nativeSpecies } from './species';

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
  it('a Terra tem a sua fauna nativa; Marte não tem vida', () => {
    expect(nativeSpecies(earth).map((s) => s.name)).toEqual(['Peixe', 'Cervo', 'Lobo', 'Humano', 'Tubarão', 'Coelho', 'Bisão', 'Camelo', 'Urso', 'Raposa', 'Tartaruga', 'Caranguejo', 'Pinguim', 'Baleia']);
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
      const habitat = habitatOf(eco.species[eco.kind[i]]);
      if (habitat === 1) expect(isWater(map, t)).toBe(true);
      else if (habitat === 0) expect(isLand(map, t)).toBe(true);
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
    let tiles = 0;
    for (const v of live) {
      for (const h of v.houses) {
        const cells = h.kind === 'port' ? [[0, 0]] : [[0, 0], [1, 0], [0, 1], [1, 1]];
        tiles += cells.length;
        for (const [dx, dy] of cells) {
          const t = (h.y + dy) * map.width + ((h.x + dx) % map.width);
          expect(eco.road[t]).toBe(0);
          expect(eco.built[t]).toBe(1);
        }
      }
    }
    expect(eco.built.reduce((n, b) => n + b, 0)).toBe(tiles);
    expect(eco.road.some((r) => r > 0)).toBe(true);
   }, 20000); // mapa inteiro por 40 anos: passa dos 5 s padrão em máquinas lentas

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

describe('tempo, idade e mar', () => {
  it('as eras avançam devagar: séculos por era', () => {
    const { eco } = world();
    const v = eco.villages[0];
    run(eco, 50 * YEAR_SECONDS);
    expect(v.tech).toBeLessThan(0.5);
    expect(v.tech).toBeGreaterThan(0);
  });

  it('crianças nascem sem profissão e ganham uma ao crescer; os mais velhos morrem', () => {
    const { eco } = world();
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    const v = eco.villages[0];
    const child = eco.spawn(s, v.x, v.y, v.id, 0);
    expect(eco.role[child]).toBe(CHILD);
    eco.age[child] = eco.species[s].maturity + 0.1;
    run(eco, 1);
    if (eco.alive[child]) expect(eco.role[child]).not.toBe(CHILD);
    const old = eco.spawn(s, v.x, v.y, v.id, 200);
    run(eco, 1);
    // O índice pode ter sido reaproveitado por um recém-nascido.
    expect(!eco.alive[old] || eco.age[old] < 100).toBe(true);
  });

  it('um assentamento preso numa ilha constrói porto e manda colonos de barco', () => {
    const { map, eco } = world({ ...earth, radiusEarth: 1 });
    const v = eco.villages[0];
    v.tech = 2.2;
    // Vira uma ilha pequena: só a área da aldeia fica de pé, e há outra ilha a leste.
    const w = map.width;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const dx = Math.abs(((x - Math.floor(v.x) + w * 1.5) % w) - w / 2);
        const dy = Math.abs(y - Math.floor(v.y));
        const island = dx <= 8 && dy <= 8;
        const other = Math.abs(dx - 40) <= 10 && dy <= 10 && x > v.x;
        map.elevation[i] = island || other ? 0.1 : -0.3;
        if (island || other) map.vegetation[i] = 0.8;
      }
    }
    // Força um porto e uma viagem.
    const anyEco = eco as unknown as { buildPort(v: unknown): boolean; colonizeBySea(v: unknown): boolean };
    expect(anyEco.buildPort(v)).toBe(true);
    expect(v.port).toBeGreaterThanOrEqual(0);
    while (v.population < 12) eco.spawn(eco.species.findIndex((sp) => sp.kind === 'sapient'), v.x, v.y, v.id, 20);
    expect(anyEco.colonizeBySea(v)).toBe(true);
    const boat = eco.boats.find((b) => b.purpose === 'colonize')!;
    expect(BOATS[boat.kind].name).toBe('Veleiro');
    expect(boat.passengers.length).toBeGreaterThanOrEqual(3);
  });
});
