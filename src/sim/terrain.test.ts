import { describe, expect, it } from 'vitest';
import { generateSurface, Biome, Decor, decorAt, temperatureAt, type PlanetParams } from '../procgen/surface';
import { Ecosystem, isLand, isWater, YEAR_SECONDS } from './ecosystem';
import { runEvent } from './events';
import { nativeSpecies } from './species';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

function world() {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

const sapient = (eco: Ecosystem) => eco.species.findIndex((s) => s.kind === 'sapient');
const run = (eco: Ecosystem, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) eco.step(0.1);
};

describe('lugar para fundar', () => {
  it('recusa lava por perto, penhasco e lugar sem água', () => {
    const { map, eco } = world();
    const s = sapient(eco);
    const v = eco.villages[0];
    const x = Math.floor(v.x);
    const y = Math.floor(v.y);
    // Terreno plano e verde com água perto: cria o cenário limpo.
    for (let dy = -12; dy <= 12; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        const i = (y + dy) * map.width + x + dx;
        map.elevation[i] = dx > 9 ? -0.2 : 0.1;
        map.vegetation[i] = 0.6;
        map.moisture[i] = 0.7;
        map.heat[i] = 0;
        map.biome[i] = Biome.Grass;
      }
    }
    expect(eco.siteProblem(s, x, y)).toBeNull();
    const lava = (y + 3) * map.width + x + 3;
    map.biome[lava] = Biome.Lava;
    expect(eco.siteProblem(s, x, y)).toContain('lava');
    map.biome[lava] = Biome.Grass;
    for (let dy = -12; dy <= 12; dy++) for (let dx = -12; dx <= 12; dx++) if (dx > 0) map.elevation[(y + dy) * map.width + x + dx] += 0.5;
    expect(eco.siteProblem(s, x, y)).toBeTruthy();
  });

  it('o jogador solta um povo num lugar ruim: ele não funda e procura outro', () => {
    const { map, eco } = world();
    const s = sapient(eco);
    let i = 0;
    while (!(map.elevation[i] > 0.7)) i++;
    const before = eco.villages.length;
    eco.introduce(s, (i % map.width) + 0.5, Math.floor(i / map.width) + 0.5, 3, 6);
    expect(eco.villages.length).toBe(before);
  });
});

describe('relevo e movimento', () => {
  it('não sobe um penhasco, mas contorna', () => {
    const { map, eco } = world();
    const s = eco.species.findIndex((sp) => sp.kind === 'herbivore');
    const x = 100;
    const y = 100;
    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -20; dx <= 20; dx++) {
        map.elevation[(y + dy) * map.width + x + dx] = dx === 5 && Math.abs(dy) < 6 ? 0.9 : 0.1;
        map.vegetation[(y + dy) * map.width + x + dx] = 0.6;
        map.biome[(y + dy) * map.width + x + dx] = Biome.Grass;
      }
    }
    const from = y * map.width + x + 4;
    const to = y * map.width + x + 5;
    expect(eco.canStep(s, from, to)).toBe(false);
    expect(eco.canStep(s, from, from - 1)).toBe(true);
  });

  it('um inteligente travado na água corta árvores e atravessa de jangada', () => {
    const { map, eco } = world();
    const s = sapient(eco);
    const x = 150;
    const y = 120;
    for (let dy = -8; dy <= 8; dy++) {
      for (let dx = -20; dx <= 20; dx++) {
        const i = (y + dy) * map.width + x + dx;
        map.elevation[i] = dx >= -1 && dx <= 3 ? -0.2 : 0.1;
        map.vegetation[i] = 0.7;
        map.moisture[i] = 0.7;
        map.heat[i] = 0;
        map.biome[i] = Biome.Grass;
        if (dx >= -1 && dx <= 3) map.biome[i] = Biome.Ocean;
      }
    }
    const i = eco.introduceOne(s, x - 2 + 0.5, y + 0.5);
    expect(i).toBeGreaterThanOrEqual(0);
    eco.aimX[i] = 14;
    eco.aimY[i] = 0;
    const uid = eco.uid[i];
    const before = Array.from(map.vegetation).reduce((n, v) => n + (v >= 0.45 ? 1 : 0), 0);
    expect((eco as unknown as { tryRaft(i: number): boolean }).tryRaft(i)).toBe(true);
    expect(eco.rafts.length).toBe(1);
    const after = Array.from(map.vegetation).reduce((n, v) => n + (v >= 0.45 ? 1 : 0), 0);
    expect(after).toBeLessThan(before);
    run(eco, 12);
    const j = eco.findUid(uid);
    expect(j).toBeGreaterThanOrEqual(0);
    expect(eco.rafts.length).toBe(0);
    expect(eco.x[j]).toBeGreaterThan(x + 2);
  });
});

describe('construções e o terreno', () => {
  it('estradas, casas e jazidas somem quando o chão vira água', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    run(eco, YEAR_SECONDS * 15);
    const houses = v.houses.length;
    expect(houses).toBeGreaterThan(0);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    eco.reshape(cx, cy, 30, (i) => (map.elevation[i] = -0.3));
    expect(v.houses.length).toBe(0);
    let roads = 0;
    const at = (dx: number, dy: number) => Math.max(0, Math.min(map.height - 1, cy + dy)) * map.width + (((cx + dx) % map.width) + map.width) % map.width;
    for (let dy = -30; dy <= 30; dy++) for (let dx = -30; dx <= 30; dx++) if (eco.road[at(dx, dy)]) roads++;
    expect(roads).toBe(0);
    // Elevar de novo não traz nada de volta.
    eco.reshape(cx, cy, 30, (i) => (map.elevation[i] = 0.1));
    expect(v.houses.length).toBe(0);
    for (let dy = -30; dy <= 30; dy++) for (let dx = -30; dx <= 30; dx++) expect(eco.built[at(dx, dy)]).toBe(0);
  });

  it('um cometa num castelo leva o castelo junto: o centro afundado acaba o assentamento', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    run(eco, YEAR_SECONDS * 5);
    expect(runEvent(eco, 'comet', v.x, v.y)).toBe(true);
    const center = Math.floor(v.y) * map.width + Math.floor(v.x);
    expect(isLand(map, center)).toBe(false);
    run(eco, 3);
    expect(v.population).toBe(0);
  });

  it('Limpar tira árvores, pedras e minério e o material se perde', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    const x = Math.floor(v.x) + 14;
    const y = Math.floor(v.y);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) {
      const i = (y + dy) * map.width + x + dx;
      map.elevation[i] = 0.1;
      map.vegetation[i] = 0.8;
      map.biome[i] = Biome.Forest;
      // Mata de verdade: sem rua nem casa (o que é rua ou casa não é natureza, e o pincel não mexe). Sem isto o
      // teste dependia de onde o mundo da semente pôs as ruas do primeiro lugar.
      eco.road[i] = 0;
      eco.built[i] = 0;
      // Clima temperado e úmido no quadrado: cortada, a mata vira campo, e não deserto ou tundra (com cacto ou
      // pinheiro) conforme a latitude em que a semente pôs o primeiro lugar.
      map.moisture[i] = 0.6;
      map.heat[i] += 288 - temperatureAt(map, i);
    }
    const gold = eco.addDeposit(x + 0.5, y + 0.5, 'gold', 100, false);
    v.stock.wood = 0;
    const wood = v.stock.wood;
    const n = eco.clearNature(x, y, 4);
    expect(n).toBeGreaterThan(0);
    expect(v.stock.wood).toBe(wood);
    expect(gold === null || gold.amount === 0).toBe(true);
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (dx * dx + dy * dy <= 16) expect(decorAt(map, (y + dy) * map.width + x + dx)).toBe(Decor.None);
  });

  it('Demolir derruba casas e ruas do pincel', () => {
    const { eco } = world();
    const v = eco.villages[0];
    run(eco, YEAR_SECONDS * 15);
    const houses = v.houses.length;
    const n = eco.demolish(v.x, v.y, 30);
    expect(n).toBe(houses);
    expect(v.houses.length).toBe(0);
  });

  it('lava queima a mata e as casas em volta', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    run(eco, YEAR_SECONDS * 15);
    const x = Math.floor(v.x);
    const y = Math.floor(v.y);
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) map.vegetation[(y + dy) * map.width + x + dx] = 0.8;
    for (let k = -4; k <= 4; k++) map.biome[(y + k) * map.width + x + 6] = Biome.Lava;
    const green = () => {
      let n = 0;
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) if (map.vegetation[(y + dy) * map.width + x + dx] > 0.5) n++;
      return n;
    };
    const before = green();
    run(eco, YEAR_SECONDS * 25);
    expect(isWater(map, y * map.width + x)).toBe(false);
    expect(green()).toBeLessThan(before);
  }, 60000);
});
