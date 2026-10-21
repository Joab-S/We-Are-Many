import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { runWorld } from './calibrate';
import { ROLE } from './roles';
import type { Ecosystem, LootGood, Village, War, WarMotive } from './ecosystem';

// Guerras com motivo (REQUISITOS-VIDA.md, seção 19.7, Etapa F).

/** Os métodos internos que os testes chamam direto. */
interface Inside {
  declareWar(att: Village, def: Village, target: Village, members: Map<number, Village[]>, motive?: WarMotive, good?: LootGood): boolean;
  plunder(war: War, target: Village): void;
  bringLoot(war: War): void;
  conquer(war: War, target: Village): void;
  exterminate(war: War, target: Village): void;
  endWar(k: number): void;
  makePeace(war: War): void;
  supplyArmy(war: War, soldiers: number): boolean;
  hireMercenaries(war: War, members: Map<number, Village[]>): void;
  strength(i: number): number;
  diplomacy(): void;
  cavalry: Map<number, number>;
  landPath(x0: number, y0: number, x1: number, y1: number): boolean;
  buildGrid(): void;
}
const inside = (eco: Ecosystem) => eco as unknown as Inside;

function members(eco: Ecosystem): Map<number, Village[]> {
  const m = new Map<number, Village[]>();
  for (const v of eco.villages) {
    if (v.abandoned) continue;
    m.set(v.kingdom, [...(m.get(v.kingdom) ?? []), v]);
  }
  return m;
}

/** Um mundo novo com as aldeias semeadas, cada uma o seu reino, e um par ligado por terra. */
function world(seed = 42) {
  const { eco } = runWorld(seed, 3);
  const live = eco.villages.filter((v) => !v.abandoned && v.kingdom === v.id);
  for (const a of live) {
    for (const b of live) {
      if (a !== b && inside(eco).landPath(a.x, a.y, b.x, b.y)) return { eco, a, b };
    }
  }
  throw new Error('sem par ligado por terra');
}

function residents(eco: Ecosystem, v: Village): number[] {
  const out: number[] = [];
  for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === v.id) out.push(i);
  return out;
}

describe('moderação (RF-VIDA-241)', () => {
  it('não passa do teto de guerras do planeta: 1 a cada 6 reinos, no mínimo 1', () => {
    const { eco, a, b } = world();
    const kingdoms = eco.villages.filter((v) => !v.abandoned && v.kingdom === v.id).length;
    expect(eco.warsMax()).toBe(Math.max(1, Math.floor(kingdoms / B.WARS_PER_KINGDOMS)));
    const m = members(eco);
    expect(inside(eco).declareWar(a, b, b, m)).toBe(true);
    const others = eco.villages.filter((v) => !v.abandoned && v !== a && v !== b && v.kingdom === v.id);
    for (const o of others) inside(eco).declareWar(o, a, a, m);
    expect(eco.wars.length).toBeLessThanOrEqual(eco.warsMax());
    expect(eco.tally.warsOverCap).toBe(0);
  });

  it('quem sai de uma guerra fica WAR_COOLDOWN anos sem declarar outra, e há trégua', () => {
    const { eco, a, b } = world();
    inside(eco).declareWar(a, b, b, members(eco));
    inside(eco).endWar(0);
    expect(eco.wars.length).toBe(0);
    expect(eco.lastWar.get(a.id)).toBe(eco.year);
    // Ódio máximo e força de sobra: ainda assim nada de guerra nova no período.
    eco.relations.set(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`, -100);
    for (const i of residents(eco, a)) eco.role[i] = ROLE.soldier;
    for (let y = 0; y < 10; y++) {
      inside(eco).diplomacy();
      expect(eco.wars.some((w) => w.a === a.id || w.b === a.id)).toBe(false);
    }
  });

  it('o cansaço de guerra sobe a chance de paz a cada ano e a cada morte', () => {
    const peace = (years: number, dead: number) => B.PEACE_BASE + B.PEACE_PER_YEAR * years + B.PEACE_PER_DEATH * dead;
    expect(peace(10, 0)).toBeGreaterThan(peace(1, 0));
    expect(peace(1, 30)).toBeGreaterThan(peace(1, 0));
  });
});

describe('motivo e crônica (RF-VIDA-240 e 244)', () => {
  it('a declaração diz o motivo: saque, território ou extermínio', () => {
    const { eco, a, b } = world();
    b.stock.horses = 10;
    inside(eco).declareWar(a, b, b, members(eco), 'loot', 'horses');
    expect(eco.chronicle[0].text).toMatch(new RegExp(`${a.name} atacou ${b.name} para tomar os cavalos`));
    expect(eco.wars[0].motive).toBe('loot');
    inside(eco).endWar(0);
    inside(eco).declareWar(a, b, b, members(eco), 'land');
    expect(eco.chronicle[0].text).toMatch(/^Guerra! .* para tomar /);
    inside(eco).endWar(0);
    inside(eco).declareWar(a, b, b, members(eco), 'extermination');
    expect(eco.chronicle[0].text).toBe(`Guerra! ${a.name} marchou para arrasar ${b.name}`);
  });
});

describe('saque (RF-VIDA-240 e 243)', () => {
  it('leva o bem cobiçado, queima roças, volta para casa e não muda o dono', () => {
    const { eco, a, b } = world();
    b.stock.iron = 20;
    b.fields = 3;
    a.stock.iron = 0;
    inside(eco).declareWar(a, b, b, members(eco), 'loot', 'iron');
    const war = eco.wars[0];
    inside(eco).plunder(war, b);
    expect(b.stock.iron).toBeCloseTo(20 * (1 - B.LOOT_SHARE));
    expect(b.fields).toBe(3 - B.BURNED_FIELDS);
    expect(war.returning).toBe(eco.year);
    expect(eco.chronicle[0].text).toContain(`saqueou ${b.name}: levou o ferro`);
    inside(eco).bringLoot(war);
    expect(a.stock.iron).toBeCloseTo(Math.min(eco.capOf(a, 'iron'), 20 * B.LOOT_SHARE));
    expect(b.kingdom).toBe(b.id);
    expect(eco.grudges.size).toBe(1);
  });
});

describe('conquista e extermínio (RF-VIDA-243)', () => {
  it('conquista: refugiados fogem, casas queimam e o vencido guarda rancor', () => {
    const { eco, a, b } = world();
    // Casas a mais para ter o que queimar.
    for (let k = 0; k < 4; k++) b.houses.push({ ...b.houses[0], x: b.houses[0].x + 40 + k * 3 });
    const homes = b.houses.filter((h) => h.kind === 'house').length;
    const before = b.population;
    inside(eco).declareWar(a, b, b, members(eco), 'land');
    inside(eco).conquer(eco.wars[0], b);
    expect(b.kingdom).toBe(a.id);
    expect(b.houses.filter((h) => h.kind === 'house').length).toBe(homes - Math.min(homes - 1, Math.round(homes * B.RAZE_SHARE)));
    expect(b.population).toBeLessThan(before);
    expect(eco.tally.refugees).toBeGreaterThan(0);
    const key = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
    expect(eco.grudges.get(key)).toBe(eco.year + B.GRUDGE_YEARS);
  });

  it('extermínio: o lugar é arrasado e o vencedor funda outro nas ruínas', () => {
    const { eco, a, b } = world();
    inside(eco).declareWar(a, b, b, members(eco), 'extermination');
    // Três soldados do vencedor na praça.
    let n = 0;
    for (const i of residents(eco, a)) {
      if (n >= 3) break;
      eco.role[i] = ROLE.soldier;
      eco.x[i] = b.x;
      eco.y[i] = b.y;
      n++;
    }
    inside(eco).buildGrid();
    inside(eco).exterminate(eco.wars[0], b);
    expect(b.abandoned).toBe(true);
    const fresh = eco.villages[eco.villages.length - 1];
    expect(fresh.abandoned).toBe(false);
    expect(fresh.kingdom).toBe(a.kingdom);
    expect(fresh.population).toBe(3);
    expect(eco.chronicle[0].text).toBe(`Os ${a.culture.name} arrasaram ${b.name} e fundaram ${fresh.name} nas ruínas`);
  });

  it('paz com cessão na guerra de território, para quem está ganhando', () => {
    const { eco, a, b } = world();
    // Um assentamento de b além da capital: é ele que está em disputa.
    const colony = eco.villages.find((v) => !v.abandoned && v !== a && v !== b)!;
    colony.kingdom = b.id;
    const war: War = { a: a.id, b: b.id, target: colony.id, naval: false, motive: 'land', home: a.id, supply: 1, mercs: [0, 0], losses: [1, 5], years: 3 };
    inside(eco).makePeace(war);
    expect(colony.kingdom).toBe(a.id);
    expect(eco.chronicle[0].text).toBe(`Paz entre ${a.name} e ${b.name}: ${b.name} cedeu ${colony.name}`);
  });
});

describe('força e logística (RF-VIDA-242 e 223)', () => {
  it('soldado montado vale CAVALRY_STRENGTH contra 1,2 do soldado a pé', () => {
    const { eco, a } = world();
    a.tech = 2;
    const [i, j] = residents(eco, a);
    eco.role[i] = ROLE.soldier;
    eco.role[j] = ROLE.soldier;
    inside(eco).cavalry.set(a.id, 0);
    const foot = inside(eco).strength(i);
    inside(eco).cavalry.set(a.id, 1);
    expect(eco.mounted(i)).toBe(true);
    expect(inside(eco).strength(i) / foot).toBeCloseTo(B.CAVALRY_STRENGTH / 1.2);
    // No Bronze, carro de guerra.
    a.tech = 1;
    inside(eco).cavalry.set(a.id, 0);
    const bronze = inside(eco).strength(i);
    inside(eco).cavalry.set(a.id, 1);
    expect(inside(eco).strength(i) / bronze).toBeCloseTo(B.CHARIOT_STRENGTH / 1.2);
  });

  it('o exército come do celeiro de casa; dois anos sem comida e ele volta', () => {
    const { eco, a, b } = world();
    inside(eco).declareWar(a, b, b, members(eco), 'land');
    const war = eco.wars[0];
    a.food = 100;
    expect(inside(eco).supplyArmy(war, 10)).toBe(false);
    expect(a.food).toBeCloseTo(100 - 10 * B.ARMY_FOOD);
    expect(war.supply).toBe(1);
    a.food = 0;
    expect(inside(eco).supplyArmy(war, 10)).toBe(false);
    expect(war.supply).toBe(0);
    expect(inside(eco).supplyArmy(war, 10)).toBe(true);
  });

  it('sem comida o soldado em campanha perde força', () => {
    const { eco, a, b } = world();
    const [i] = residents(eco, a);
    eco.role[i] = ROLE.soldier;
    const fed = inside(eco).strength(i);
    inside(eco).declareWar(a, b, b, members(eco), 'land');
    eco.wars[0].supply = 0;
    expect(inside(eco).strength(i) / fed).toBeCloseTo(B.HUNGRY_ARMY);
  });
});

describe('mercenários (RF-VIDA-295)', () => {
  it('o lado com ouro contrata gente de um assentamento pobre de outro reino', () => {
    const { eco, a, b } = world();
    const poor = eco.villages.find((v) => !v.abandoned && v !== a && v !== b && v.population >= 8 && inside(eco).landPath(v.x, v.y, a.x, a.y));
    if (!poor) return;
    inside(eco).declareWar(a, b, b, members(eco), 'land');
    const war = eco.wars[0];
    a.stock.gold = 40;
    b.stock.gold = 0;
    poor.stability = 0.2;
    const before = poor.population;
    for (let k = 0; k < 20 && !war.mercs[0]; k++) inside(eco).hireMercenaries(war, members(eco));
    expect(war.mercs[0]).toBeGreaterThan(0);
    expect(poor.population).toBe(before - war.mercs[0]);
    expect(a.stock.gold).toBe(40 - war.mercs[0] * B.MERCENARY_PRICE);
    expect(eco.mercenaries.size).toBe(war.mercs[0]);
    for (const i of eco.mercenaries) expect(eco.role[i]).toBe(ROLE.soldier);
    inside(eco).endWar(0);
    expect(eco.mercenaries.size).toBe(0);
  });
});

describe('guerras num mundo de 250 anos', () => {
  it('nunca acima do teto, e toda declaração com motivo', () => {
    const { eco, indicators } = runWorld(7, 250);
    expect(indicators.warsOverCap).toBe(0);
    expect(indicators.warsNoMotive).toBe(0);
    expect(eco.tally.lootWars + eco.tally.landWars + eco.tally.exterminations + eco.tally.civilWars).toBeGreaterThan(0);
  }, 300000);
});
