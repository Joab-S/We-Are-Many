import { describe, expect, it } from 'vitest';
import { seedWorld } from './calibrate';
import { BUILDING_NAMES, BUILDINGS, canBuild, Ecosystem, YEAR_SECONDS, type BuildContext, type BuildingKind } from './ecosystem';
import { BUILDING_TYPES, buildingType } from './buildingTypes';
import { buildCost } from './economy';
import { LEVEL_HOUSING } from './balance';

/** Padrões do motor (Game Programming Patterns): índices, handles e tipos. */

const run = (eco: Ecosystem, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.25) eco.step(0.25);
};

/** "Quem mora em v" pela varredura antiga, para comparar com o índice. */
function scan(eco: Ecosystem, v: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === v) out.push(i);
  return out;
}

describe('índice de moradores (Spatial Partition com Dirty Flag)', () => {
  it('cada lista é igual à varredura, em ordem crescente, depois de nascer, morrer e mudar de lugar', () => {
    const { eco } = seedWorld(7);
    run(eco, YEAR_SECONDS * 8);
    const check = () => {
      for (let v = 0; v < eco.villages.length; v++) expect([...eco.residents(v)], `lugar ${v}`).toEqual(scan(eco, v));
    };
    check();
    const live = eco.villages.filter((v) => !v.abandoned && v.population >= 2);
    expect(live.length).toBeGreaterThan(1);
    const [a, b] = live;
    // Mudança de lugar, morte e nascimento sujam o índice; a próxima pergunta o refaz.
    const moved = eco.residents(a.id)[0];
    eco.setVillage(moved, b.id);
    check();
    eco.kill(eco.residents(b.id)[0], true);
    check();
    const born = eco.spawn(a.species, a.x, a.y, a.id, 0);
    expect(born).toBeGreaterThanOrEqual(0);
    check();
    // Bicho nascendo ou morrendo não suja o índice (não mora em lugar nenhum).
    eco.residents(a.id);
    const wild = eco.species.findIndex((sp) => sp.kind === 'herbivore');
    const j = eco.spawn(wild, a.x + 3, a.y, -1, 1);
    if (j >= 0) {
      expect(eco.residentIndex.dirty).toBe(false);
      eco.kill(j, true);
      expect(eco.residentIndex.dirty).toBe(false);
    }
    run(eco, YEAR_SECONDS * 2);
    check();
  }, 60000);

  it('uma lista já entregue não muda quando o índice é refeito no meio do laço', () => {
    const { eco } = seedWorld(7);
    run(eco, YEAR_SECONDS * 2);
    const v = eco.villages.find((o) => !o.abandoned && o.population >= 3)!;
    const list = eco.residents(v.id);
    const copy = [...list];
    eco.kill(list[0], true);
    eco.residents(v.id);
    expect([...list]).toEqual(copy);
    expect([...eco.residents(v.id)]).toEqual(copy.slice(1));
  }, 60000);
});

describe('relógios (Game Loop)', () => {
  it('com o ano do jogo cabem dois anos de ação em cada ano exibido, e as compensações seguem a razão', () => {
    const { eco } = seedWorld(7);
    expect(eco.actionScale()).toBe(1);
    expect(eco.eraPace()).toBe(1);
    eco.yearSpan = 12;
    let yearly = 0;
    const original = eco.yearly;
    eco.yearly = function (this: Ecosystem) {
      yearly++;
      original.call(this);
    };
    run(eco, 24);
    expect(eco.year).toBeCloseTo(2, 6);
    expect(yearly).toBe(4);
    expect(eco.actionScale()).toBe(0.5);
    expect(eco.eraPace()).toBe(1.5);
    expect(eco.actionPhase()).toBeGreaterThanOrEqual(0);
    expect(eco.actionPhase()).toBeLessThan(1);
  }, 60000);
});

describe('tipos de construção (Type Object)', () => {
  it('a lista, os nomes e a ordem das especiais continuam os mesmos', () => {
    expect([...BUILDINGS]).toEqual(['granary', 'smithy', 'market', 'warehouse', 'pottery', 'windmill', 'loom', 'corral', 'stable', 'sawmill', 'temple', 'barracks', 'factory', 'aqueduct', 'statue', 'wonder']);
    expect(Object.keys(BUILDING_NAMES)).toEqual(['house', 'port', ...BUILDINGS]);
    expect(BUILDING_NAMES.house).toBe('Casa');
    expect(BUILDING_NAMES.wonder).toBe('Grande obra');
    for (const k of Object.keys(BUILDING_TYPES) as BuildingKind[]) expect(BUILDING_NAMES[k]).toBe(BUILDING_TYPES[k].name);
  });

  it('o custo por era é o da função antiga', () => {
    // A tabela que buildCost tinha antes do Type Object.
    const old = (kind: string, era: number) => {
      if (kind === 'house') return era >= 3 ? { wood: 1, stone: 4, gold: 0 } : { wood: 4, stone: 0, gold: 0 };
      if (kind === 'reform') return era >= 3 ? { wood: 1, stone: 3, gold: 0 } : { wood: 3, stone: era >= 2 ? 1 : 0, gold: 0 };
      if (kind === 'aqueduct') return { wood: 6, stone: 30, gold: 2 };
      if (kind === 'port') return { wood: 12, stone: 0, gold: 0 };
      if (kind === 'mine') return { wood: 6, stone: 0, gold: 0 };
      if (kind === 'wonder') return { wood: 40, stone: 120, gold: 8 };
      if (kind === 'statue') return { wood: 0, stone: 30, gold: 3 };
      return { wood: 10, stone: era >= 2 ? 8 : 2, gold: 0 };
    };
    for (const kind of [...Object.keys(BUILDING_TYPES), 'reform', 'mine', 'desconhecida']) {
      for (let era = 0; era <= 5; era++) expect(buildCost(kind, era), `${kind} na era ${era}`).toEqual(old(kind, era));
    }
    // Cada chamada devolve um objeto novo (quem paga pode mexer nele).
    expect(buildCost('house', 0)).not.toBe(buildCost('house', 0));
  });

  it('moradia: casa pela era e pelos andares, porto nada, as outras dois', () => {
    expect(buildingType('house').housing(2, 1, false)).toBe(4 + 2 + LEVEL_HOUSING);
    expect(buildingType('house').housing(2, 1, true)).toBe(0);
    expect(buildingType('port').housing(3, 0, false)).toBe(0);
    for (const k of BUILDINGS) expect(buildingType(k).housing(4, 2, false)).toBe(2);
    expect(buildingType('desconhecida').housing(0, 0, false)).toBe(2);
  });

  it('a regra de construção é a do antigo switch', () => {
    const culture = { id: 0, name: 'x', value: 'guerra' as const, tolerance: 0.5, belief: 'o Sol' };
    const base: BuildContext = { era: 0, tier: 0, metal: false, culture, capital: false, clay: false, forest: 0, techs: new Set() };
    const can = (c: Partial<BuildContext>) => BUILDINGS.filter((k) => canBuild(k, { ...base, ...c }));
    expect(can({})).toEqual([]);
    expect(can({ era: 1 })).toEqual(['granary']);
    expect(can({ era: 1, metal: true })).toEqual(['granary', 'smithy']);
    expect(can({ tier: 1, culture: { ...culture, value: 'fé' } })).toEqual(['granary', 'market', 'temple']);
    expect(can({ tier: 2, era: 2 })).toEqual(['granary', 'market', 'warehouse', 'temple', 'barracks']);
    expect(can({ tier: 2, era: 3, capital: true })).toEqual(['granary', 'market', 'warehouse', 'temple', 'barracks', 'statue', 'wonder']);
    expect(can({ tier: 3, era: 2, herd: 'cattle', techs: new Set(['vapor', 'moinho']) })).toEqual(['granary', 'market', 'warehouse', 'windmill', 'corral', 'temple', 'barracks', 'factory', 'aqueduct']);
    expect(can({ clay: true, techs: new Set(['ceramica', 'tecelagem', 'montaria']), herd: 'horse' })).toEqual(['granary', 'pottery', 'stable']);
    expect(can({ era: 1, vocation: 'madeireira', herd: 'goat', techs: new Set(['tecelagem']) })).toEqual(['granary', 'loom', 'corral', 'sawmill']);
    // Casa e porto têm regra própria (não entram na fila das especiais).
    expect(BUILDING_TYPES.house.canBuild({ ...base, era: 4, tier: 3 })).toBe(false);
    expect(BUILDING_TYPES.port.canBuild({ ...base, era: 4, tier: 3 })).toBe(false);
  });
});
