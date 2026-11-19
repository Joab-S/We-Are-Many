import { describe, expect, it } from 'vitest';
import { generateSurface, Biome, type PlanetParams } from '../procgen/surface';
import * as B from './balance';
import { CHILD, ROLE } from './roles';
import { Ecosystem, type Village } from './ecosystem';
import { nativeSpecies } from './species';

// Ações com presença (REQUISITOS-VIDA.md, seção 19.21): o mundo só muda quando alguém vai lá fazer.

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

function world() {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, 42);
  for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
  eco.populate();
  return { map, eco };
}

/** Mata fechada a leste do assentamento, longe das ruas; devolve as árvores de pé. */
function grove(eco: Ecosystem, v: Village): number[] {
  const map = eco.map;
  const cx = Math.floor(v.x);
  const cy = Math.floor(v.y);
  for (let dy = -30; dy <= 30; dy++) {
    for (let dx = -30; dx <= 30; dx++) {
      const t = (cy + dy) * map.width + cx + dx;
      if (!eco.standingTree(t)) continue;
      map.biome[t] = Biome.Grass;
      map.vegetation[t] = 0.3;
    }
  }
  const trees: number[] = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = 9; dx <= 13; dx++) {
      const t = (cy + dy) * map.width + cx + dx;
      if (eco.road[t] || eco.built[t]) continue;
      map.elevation[t] = 0.1;
      map.moisture[t] = 0.7;
      map.vegetation[t] = 0.8;
      map.biome[t] = Biome.Forest;
      if (eco.standingTree(t)) trees.push(t);
    }
  }
  (v as { treeList?: number[] }).treeList = undefined;
  return trees;
}

/** Moradores adultos do assentamento. */
function adults(eco: Ecosystem, v: Village): number[] {
  const out: number[] = [];
  for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === v.id && eco.role[i] !== CHILD) out.push(i);
  return out;
}

function run(eco: Ecosystem, seconds: number) {
  for (let t = 0; t < seconds; t += 0.2) eco.step(0.2);
}

describe('árvore só cai com lenhador no lugar (seção 19.21)', () => {
  it('toda árvore que cai tem um lenhador no lugar, em décadas de jogo', () => {
    const { eco } = world();
    const v = eco.villages[0];
    grove(eco, v);
    const inside = eco as unknown as { fellTree(t: number, replant: boolean): void };
    const real = inside.fellTree.bind(eco);
    const w = eco.map.width;
    let falls = 0;
    const alone: number[] = [];
    inside.fellTree = (t, replant) => {
      falls++;
      const near = [...Array(eco.count).keys()].some((i) => {
        if (!eco.alive[i] || eco.role[i] !== ROLE.woodcutter) return false;
        const dx = Math.min(Math.abs(eco.x[i] - ((t % w) + 0.5)), w - Math.abs(eco.x[i] - ((t % w) + 0.5)));
        return Math.hypot(dx, eco.y[i] - (Math.floor(t / w) + 0.5)) <= B.JOB_REACH + 0.01;
      });
      if (!near) alone.push(t);
      real(t, replant);
    };
    run(eco, 30 * 6);
    expect(falls).toBeGreaterThan(0);
    expect(alone).toEqual([]);
  }, 30000);

  it('com um lenhador, ele anda até a árvore e a derruba só depois do tempo do gesto', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const trees = grove(eco, v);
    const crew = adults(eco, v);
    for (const i of crew) eco.role[i] = ROLE.gatherer;
    const cutter = crew[0];
    eco.role[cutter] = ROLE.woodcutter;
    v.stock.wood = 0;
    // Sem ferramenta e com a mata na porta o gesto leva FELL_SECONDS; antes disso nenhuma árvore cai.
    const before = eco.treesCut;
    run(eco, 2);
    expect(eco.treesCut).toBe(before);
    run(eco, 60);
    expect(eco.treesCut).toBeGreaterThan(before);
    expect(trees.some((t) => !eco.standingTree(t))).toBe(true);
  });

  it('duas pessoas não reservam a mesma árvore', () => {
    const { eco } = world();
    const v = eco.villages[0];
    grove(eco, v);
    const crew = adults(eco, v);
    for (const i of crew) eco.role[i] = ROLE.gatherer;
    const [a, b] = crew;
    eco.role[a] = ROLE.woodcutter;
    eco.role[b] = ROLE.woodcutter;
    v.stock.wood = 0;
    // A divisão dos ofícios é revista a cada segundo; logo depois de pegar as ordens os dois ainda são lenhadores.
    run(eco, 0.8);
    expect(eco.jobKind[a]).toBeGreaterThan(0);
    expect(eco.jobKind[b]).toBeGreaterThan(0);
    expect(eco.job[a]).not.toBe(eco.job[b]);
  });

  it('armazém cheio: o lenhador espera e a árvore fica de pé', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const trees = grove(eco, v);
    const crew = adults(eco, v);
    for (const i of crew) eco.role[i] = ROLE.gatherer;
    eco.role[crew[0]] = ROLE.woodcutter;
    // O consumo da casa esvazia o armazém aos poucos; aqui ele é enchido a cada passo.
    for (let t = 0; t < 60; t += 0.2) {
      v.stock.wood = eco.capOf(v, 'wood');
      eco.step(0.2);
    }
    expect(trees.every((t) => eco.standingTree(t))).toBe(true);
  });

  it('com manejo, o lenhador também planta mudas nos tocos antigos', () => {
    const { map, eco } = world();
    const v = eco.villages[0];
    const trees = grove(eco, v);
    // Os tocos ficam ao alcance e a mata de pé acaba: o lenhador só tem o que plantar.
    for (const t of trees) {
      map.felled![t] = 1;
      (eco as unknown as { stumps: Set<number> }).stumps.add(t);
    }
    const crew = adults(eco, v);
    for (const i of crew) eco.role[i] = ROLE.gatherer;
    eco.role[crew[0]] = ROLE.woodcutter;
    v.forestry = true;
    const before = eco.treesPlanted;
    run(eco, 60);
    expect(eco.treesPlanted).toBeGreaterThan(before);
    expect(B.PLANT_SECONDS).toBeGreaterThan(0);
  });
});

describe('obra só anda com construtor no lugar (seção 19.21)', () => {
  /** Anda no tempo refixando os ofícios a cada passo (a divisão do trabalho é revista todo segundo). */
  function runAs(eco: Ecosystem, v: Village, roles: (crew: number[]) => void, seconds: number) {
    for (let t = 0; t < seconds; t += 0.2) {
      roles(adults(eco, v));
      eco.step(0.2);
    }
  }

  /** Reabre a obra de uma casa dos fundadores, como se fosse nova. */
  function newSite(eco: Ecosystem, v: Village) {
    const house = v.houses.find((h) => h.kind === 'house')!;
    (eco as unknown as { startWork(h: unknown, years: number, site: boolean): void }).startWork(house, B.WORK_YEARS / 2, true);
    return house;
  }

  it('sem ninguém para construir, a casa nova fica em obra e não abriga ninguém', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const site = newSite(eco, v);
    expect(site.site).toBe(true);
    expect(eco.underWork(site)).toBe(true);
    expect(eco.housing(v, true)).toBeGreaterThan(eco.housing(v));
    runAs(eco, v, (crew) => crew.forEach((i) => (eco.role[i] = ROLE.farmer)), 30 * 6);
    expect(site.labor).toBe(site.laborMax);
    expect(site.site).toBe(true);
  }, 30000);

  it('com um construtor ao pé da casa, a obra termina e a casa passa a contar', () => {
    const { eco } = world();
    const v = eco.villages[0];
    const site = newSite(eco, v);
    const before = eco.housing(v);
    runAs(
      eco,
      v,
      (crew) => {
        crew.forEach((i) => (eco.role[i] = ROLE.farmer));
        eco.role[crew[0]] = ROLE.builder;
      },
      40,
    );
    expect(site.labor).toBe(0);
    expect(site.site).toBeFalsy();
    expect(eco.underWork(site)).toBe(false);
    expect(eco.housing(v)).toBeGreaterThan(before);
  });

  it('a casa dos fundadores sai pronta', () => {
    const { eco } = world();
    for (const v of eco.villages) for (const h of v.houses) if (h.kind === 'house') expect(h.site).toBeFalsy();
  });
});
