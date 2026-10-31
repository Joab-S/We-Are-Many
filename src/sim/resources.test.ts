import { describe, expect, it } from 'vitest';
import { generateSurface, Biome, Decor, decorAt, isTree, type PlanetParams } from '../procgen/surface';
import * as B from './balance';
import { Ecosystem, YEAR_SECONDS, type Village } from './ecosystem';
import { nativeSpecies } from './species';

// Recursos com peso (REQUISITOS-VIDA.md, seção 19.19).

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

function world() {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

/** Os métodos internos que os testes chamam direto. */
interface Inside {
  cutWood(v: Village, work: number, yieldK: number): void;
  growForests(): void;
  quarry(v: Village, work: number): number;
  upkeep(v: Village): void;
  clampStock(v: Village): void;
  abandon(v: Village): void;
  raze(v: Village, k: number): void;
}
const inside = (eco: Ecosystem) => eco as unknown as Inside;

/** Planta uma mata fechada em volta do assentamento, tirando a que já havia ao alcance. */
function forest(eco: Ecosystem, v: Village, r: number) {
  const map = eco.map;
  const cx = Math.floor(v.x);
  const cy = Math.floor(v.y);
  const tiles: number[] = [];
  for (let dy = -30; dy <= 30; dy++) {
    for (let dx = -30; dx <= 30; dx++) {
      const t = (cy + dy) * map.width + cx + dx;
      if (!eco.standingTree(t)) continue;
      map.biome[t] = Biome.Grass;
      map.vegetation[t] = 0.3;
    }
  }
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = 8; dx <= 8 + r; dx++) {
      const t = (cy + dy) * map.width + cx + dx;
      if (eco.road[t] || eco.built[t]) continue;
      map.elevation[t] = 0.1;
      map.moisture[t] = 0.7;
      map.vegetation[t] = 0.8;
      map.biome[t] = Biome.Forest;
      if (eco.standingTree(t)) tiles.push(t);
    }
  }
  v.treeList = undefined;
  return tiles;
}

describe('madeira só vem de árvore (seção 19.19)', () => {
  it('cada árvore cortada deixa um toco e dá WOOD_PER_TREE de madeira', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    const trees = forest(eco, v, 3);
    expect(trees.length).toBeGreaterThan(4);
    v.stock.wood = 0;
    inside(eco).cutWood(v, 3, 1);
    const stumps = trees.filter((t) => decorAt(map, t) === Decor.Stump).length;
    expect(stumps).toBeGreaterThan(0);
    expect(v.stock.wood).toBeCloseTo(stumps * B.WOOD_PER_TREE, 5);
    for (const t of trees) if (decorAt(map, t) === Decor.Stump) expect(eco.standingTree(t)).toBe(false);
  });

  it('sem árvore ao alcance não há madeira, por mais lenhadores que haja', () => {
    const { eco } = world();
    const v = eco.villages[0];
    forest(eco, v, -1);
    v.stock.wood = 0;
    inside(eco).cutWood(v, 50, 1);
    expect(v.stock.wood).toBe(0);
  });

  it('não corta além do que cabe no armazém', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const trees = forest(eco, v, 4);
    const cap = eco.capOf(v, 'wood');
    v.stock.wood = cap - B.WOOD_PER_TREE * 1.5;
    inside(eco).cutWood(v, 20, 1);
    expect(v.stock.wood).toBeLessThanOrEqual(cap);
    expect(trees.filter((t) => !eco.standingTree(t)).length).toBe(1);
  });
});

describe('a mata cresce devagar e o replantio a traz de volta', () => {
  it('a muda plantada vira árvore em cerca de REPLANT_YEARS anos; o toco largado demora mais', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    const trees = forest(eco, v, 4);
    v.stock.wood = 0;
    v.forestry = true;
    inside(eco).cutWood(v, 4, 1);
    const planted = trees.filter((t) => decorAt(map, t) === Decor.Sapling);
    expect(planted.length).toBeGreaterThan(0);
    v.forestry = false;
    for (let y = 0; y < B.REPLANT_YEARS / 2; y++) inside(eco).growForests();
    expect(planted.every((t) => decorAt(map, t) === Decor.Sapling)).toBe(true);
    for (let y = 0; y < B.REPLANT_YEARS * 2; y++) inside(eco).growForests();
    expect(planted.filter((t) => isTree(decorAt(map, t))).length).toBe(planted.length);
  });

  it('cortar sem replantar acaba com a mata ao alcance', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const trees = forest(eco, v, 2);
    for (let k = 0; k < 40; k++) {
      v.stock.wood = 0;
      inside(eco).cutWood(v, 5, 1);
    }
    expect(trees.every((t) => !eco.standingTree(t))).toBe(true);
  });
});

describe('pedra se esgota', () => {
  it('cada tile tem pedra contada e a pedreira esvazia o que está perto', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    // Tira a pedra de tudo em volta menos um tile de rocha.
    for (let dy = -40; dy <= 40; dy++) for (let dx = -40; dx <= 40; dx++) eco.stoneTaken[(cy + dy) * map.width + cx + dx] = 1e6;
    const t = cy * map.width + cx + 6;
    map.elevation[t] = 0.2;
    map.biome[t] = Biome.Rock;
    eco.stoneTaken[t] = 0;
    v.stoneList = undefined;
    expect(eco.stoneOf(t)).toBe(B.STONE_ROCK);
    v.stock.stone = 0;
    let got = 0;
    for (let k = 0; k < 20; k++) {
      eco.year += 1;
      v.stock.stone = 0;
      got += inside(eco).quarry(v, 10);
    }
    expect(got).toBeCloseTo(B.STONE_ROCK, 3);
    expect(eco.stoneOf(t)).toBe(0);
    eco.year += 1;
    expect(inside(eco).quarry(v, 10)).toBe(0);
  });
});

describe('casas pedem conserto', () => {
  it('sem madeira para os consertos as casas esvaziam e depois desabam', () => {
    const { eco } = world();
    const v = eco.villages[0];
    for (let t = 0; t < YEAR_SECONDS * 15; t += 0.1) eco.step(0.1);
    const homes = v.houses.filter((h) => h.kind === 'house').length;
    expect(homes).toBeGreaterThan(0);
    for (let y = 0; y < B.DECAY_YEARS; y++) {
      v.ledgerNow = { _upkeep: [0, 10] };
      inside(eco).upkeep(v);
    }
    expect(v.houses.filter((h) => h.kind === 'house' && h.empty).length).toBe(homes);
    for (let y = B.DECAY_YEARS; y < B.COLLAPSE_YEARS; y++) {
      v.ledgerNow = { _upkeep: [0, 10] };
      inside(eco).upkeep(v);
    }
    expect(v.houses.filter((h) => h.kind === 'house').length).toBe(0);
  }, 60000);

  it('com o conserto pago as casas ficam de pé', () => {
    const { eco } = world();
    const v = eco.villages[0];
    for (let t = 0; t < YEAR_SECONDS * 15; t += 0.1) eco.step(0.1);
    const n = v.houses.length;
    for (let y = 0; y < B.COLLAPSE_YEARS + 2; y++) {
      v.ledgerNow = { _upkeep: [10, 10] };
      inside(eco).upkeep(v);
    }
    expect(v.houses.length).toBe(n);
    expect(v.houses.every((h) => !h.wear)).toBe(true);
  }, 60000);
});

describe('recursos não se transferem sozinhos', () => {
  it('o que passa do teto se perde e não vira ouro', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const gold = v.stock.gold;
    v.stock.wood = eco.capOf(v, 'wood') * 3;
    v.stock.stone = eco.capOf(v, 'stone') * 3;
    v.food = eco.capOf(v, 'food') * 3;
    inside(eco).clampStock(v);
    expect(v.stock.wood).toBeCloseTo(eco.capOf(v, 'wood'), 5);
    expect(v.stock.stone).toBeCloseTo(eco.capOf(v, 'stone'), 5);
    expect(v.stock.gold).toBe(gold);
  });

  it('o estoque de um assentamento abandonado se perde, ninguém herda', () => {
    const { eco } = world();
    for (let t = 0; t < YEAR_SECONDS * 20; t += 0.1) eco.step(0.1);
    const v = eco.villages[0];
    v.stock.wood = 50;
    v.stock.gold = 30;
    v.food = 40;
    const others = () => eco.villages.filter((o) => o !== v && !o.abandoned).map((o) => [o.stock.wood, o.stock.gold, o.food].join());
    const before = others();
    inside(eco).abandon(v);
    expect(others()).toEqual(before);
    expect(v.stock.wood).toBe(0);
    expect(v.stock.gold).toBe(0);
    expect(v.food).toBe(0);
  }, 60000);

  it('demolir uma casa não devolve material ao estoque', () => {
    const { eco } = world();
    const v = eco.villages[0];
    for (let t = 0; t < YEAR_SECONDS * 15; t += 0.1) eco.step(0.1);
    const k = v.houses.findIndex((h) => h.kind === 'house');
    expect(k).toBeGreaterThanOrEqual(0);
    const wood = v.stock.wood;
    const stone = v.stock.stone;
    const gold = v.stock.gold;
    inside(eco).raze(v, k);
    expect(v.stock.wood).toBe(wood);
    expect(v.stock.stone).toBe(stone);
    expect(v.stock.gold).toBe(gold);
  }, 60000);
});

describe('terreiro em volta das casas (mapa organizado)', () => {
  it('árvore colada numa casa sai e a madeira vai para o estoque', async () => {
    const { runWorld } = await import('./calibrate');
    const { eco } = runWorld(43, 3);
    const map = eco.map;
    const v = eco.villages.find((o) => !o.abandoned && o.houses.length)!;
    const h = v.houses[0];
    let t = -1;
    for (const [dx, dy] of [[-1, 0], [2, 0], [0, -1], [0, 2], [-1, -1], [2, 2], [-1, 2], [2, -1]]) {
      const c = (h.y + dy) * map.width + h.x + dx;
      if (eco.road[c] || eco.built[c]) continue;
      map.biome[c] = Biome.Forest;
      map.vegetation[c] = 0.8;
      if (map.bare) map.bare[c] = 0;
      if (eco.standingTree(c)) {
        t = c;
        break;
      }
    }
    expect(t).toBeGreaterThanOrEqual(0);
    v.stock.wood = 0;
    // Modo agregado (fora da tela): o que é colhido vai direto ao estoque, sem esperar a entrega no celeiro (RF-AS-23).
    eco.watch([]);
    (eco as unknown as { clearYards(v: Village): void }).clearYards(v);
    expect(eco.standingTree(t)).toBe(false);
    expect(decorAt(map, t)).toBe(Decor.None);
    expect(v.stock.wood).toBeGreaterThan(0);
  }, 60000);
});
