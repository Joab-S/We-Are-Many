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
  makePlan(att: Village, def: Village, plan: { motive: WarMotive; target: Village; good?: LootGood }): void;
  updatePlans(members: Map<number, Village[]>, soldiers: Map<number, number>, force: (k: number) => number): void;
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

describe('preparo para a guerra (RF-VIDA-241)', () => {
  it('não há teto de guerras: dois pares de reinos podem lutar ao mesmo tempo', () => {
    const { eco, a, b } = world();
    const m = members(eco);
    expect(inside(eco).declareWar(a, b, b, m)).toBe(true);
    const free = eco.villages.filter((v) => !v.abandoned && v.kingdom === v.id && v !== a && v !== b);
    let second = false;
    for (const x of free) for (const y of free) if (!second && x !== y && inside(eco).landPath(x.x, x.y, y.x, y.y)) second = inside(eco).declareWar(x, y, y, m);
    if (free.length >= 2) expect(second).toBe(true);
    expect(eco.wars.length).toBeGreaterThanOrEqual(free.length >= 2 ? 2 : 1);
  });

  it('a prontidão cresce com comida, armas, armaduras e ouro', () => {
    const { eco, a } = world();
    const m = [a];
    a.tech = 2;
    a.food = 0;
    a.stock.weapons = 0;
    a.stock.armor = 0;
    a.stock.gold = 0;
    expect(eco.readiness(m, 5)).toBe(0);
    a.food = 5 * B.ARMY_FOOD * B.PREP_FOOD_YEARS;
    const food = eco.readiness(m, 5);
    a.stock.weapons = 5;
    const arms = eco.readiness(m, 5);
    a.stock.armor = 5;
    a.stock.gold = 100;
    expect(food).toBeGreaterThan(0);
    expect(arms).toBeGreaterThan(food);
    expect(eco.readiness(m, 5)).toBe(1);
  });

  it('quem tem motivo se prepara e só declara quando está pronto e em vantagem', () => {
    const { eco, a, b } = world();
    const k = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
    eco.relations.set(k, -60);
    a.tech = 2;
    // Sem nada guardado: o plano existe, mas não vira guerra.
    a.food = 0;
    a.stock.weapons = 0;
    inside(eco).makePlan(a, b, { motive: 'land', target: b });
    expect(eco.preparing(a.id)).not.toBeNull();
    const soldiers = new Map<number, number>([[a.id, 20]]);
    const force = (id: number) => (id === a.id ? 20 : 4);
    inside(eco).updatePlans(members(eco), soldiers, force);
    expect(eco.wars.length).toBe(0);
    // Com a despensa e o arsenal cheios e força de sobra, declara, sem nenhum teto nem trégua longa.
    a.food = 200;
    a.stock.weapons = 25;
    a.stock.armor = 20;
    a.stock.gold = 50;
    inside(eco).updatePlans(members(eco), soldiers, force);
    expect(eco.wars.length).toBe(1);
    expect(eco.wars[0].motive).toBe('land');
    expect(eco.preparing(a.id)).toBeNull();
  });

  it('sem vantagem sobre o alvo ele continua se preparando; com o alvo mais fraco, declara', () => {
    const { eco, a, b } = world();
    eco.relations.set(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`, -60);
    a.food = 200;
    a.stock.weapons = 25;
    a.stock.armor = 20;
    a.stock.gold = 50;
    inside(eco).makePlan(a, b, { motive: 'land', target: b });
    const soldiers = new Map<number, number>([[a.id, 20]]);
    inside(eco).updatePlans(members(eco), soldiers, (id) => (id === a.id ? 20 : 30));
    expect(eco.wars.length).toBe(0);
    expect(eco.preparing(a.id)).not.toBeNull();
    inside(eco).updatePlans(members(eco), soldiers, (id) => (id === a.id ? 20 : 8));
    expect(eco.wars.length).toBe(1);
  });

  it('desiste quando a tensão passa ou depois de PREP_MAX_YEARS', () => {
    const { eco, a, b } = world();
    const k = `${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`;
    eco.relations.set(k, -60);
    inside(eco).makePlan(a, b, { motive: 'land', target: b });
    eco.relations.set(k, 50);
    inside(eco).updatePlans(members(eco), new Map(), () => 0);
    expect(eco.preparing(a.id)).toBeNull();
    eco.relations.set(k, -60);
    inside(eco).makePlan(a, b, { motive: 'land', target: b });
    eco.year += B.PREP_MAX_YEARS + 1;
    inside(eco).updatePlans(members(eco), new Map(), () => 0);
    expect(eco.preparing(a.id)).toBeNull();
    expect(eco.chronicle[0].text).toContain('nunca se sentiu pronto');
  });

  it('a trégua é só o mínimo (TRUCE_MIN): depois dela o que segura a guerra é o preparo', () => {
    const { eco, a, b } = world();
    inside(eco).declareWar(a, b, b, members(eco));
    inside(eco).endWar(0);
    expect(eco.truces.get(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`)).toBe(eco.year + B.TRUCE_MIN);
  });

  it('o cansaço de guerra sobe a chance de paz a cada ano e a cada morte', () => {
    const peace = (years: number, dead: number) => B.PEACE_BASE + B.PEACE_PER_YEAR * years + B.PEACE_PER_DEATH * dead;
    expect(peace(10, 0)).toBeGreaterThan(peace(1, 0));
    expect(peace(1, 30)).toBeGreaterThan(peace(1, 0));
  });
});

describe('influência do jogador (seção 19.20)', () => {
  it('Inflamar e Acalmar mudam a agressividade, e ela pesa no preparo exigido', () => {
    const { eco, a } = world();
    expect(eco.temperOf(a.kingdom)).toBe(0);
    eco.sway(a, 1);
    expect(eco.temperOf(a.kingdom)).toBeCloseTo(B.TEMPER_STEP * 1);
    eco.sway(a, 1);
    eco.sway(a, 1);
    expect(eco.temperOf(a.kingdom)).toBe(1);
    eco.sway(a, -1);
    eco.sway(a, -1);
    eco.sway(a, -1);
    eco.sway(a, -1);
    expect(eco.temperOf(a.kingdom)).toBe(-1);
    expect(eco.chronicle[0].kind).toBe('jogador');
  });

  it('o reino passivo quase nunca acha motivo e o agressivo acha mais', () => {
    const { eco, a, b } = world();
    const side = { att: a, def: b, target: b, fAtt: 20, fDef: 1, lack: 0, rich: 0, own: [a], other: [b] };
    const count = (temper: number) => {
      eco.temper.set(a.kingdom, temper);
      let n = 0;
      for (let i = 0; i < 4000; i++) if ((eco as unknown as { intent(...args: unknown[]): unknown }).intent(side, -50, true, false)) n++;
      return n;
    };
    const calm = count(-1);
    const wild = count(1);
    expect(calm).toBe(0);
    expect(wild).toBeGreaterThan(count(0));
  });

  it('Provocar baixa a relação, Amenizar sobe e desfaz o plano de guerra', () => {
    const { eco, a, b } = world();
    eco.relations.set(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`, 0);
    eco.provoke(a, b);
    expect(eco.relation(a.id, b.id)).toBe(-B.PLAYER_TENSION);
    inside(eco).makePlan(a, b, { motive: 'land', target: b });
    eco.soothe(a, b);
    expect(eco.relation(a.id, b.id)).toBe(0);
    expect(eco.preparing(a.id)).toBeNull();
    expect(eco.truces.get(`${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`)).toBe(eco.year + B.TRUCE_MIN);
  });

  it('Declarar guerra manda atacar na hora, sem preparo; não vale se um deles já luta', () => {
    const { eco, a, b } = world();
    expect(eco.incite(a, b)).toBe(true);
    expect(eco.wars[0].a).toBe(a.id);
    expect(eco.incite(a, b)).toBe(false);
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
    // Um mundo em que o vencido tem para onde fugir (outro assentamento do seu povo, por terra).
    let w = world();
    for (let seed = 43; seed < 60; seed++) {
      const { eco: e, a: x, b: y } = w;
      if (e.villages.some((o) => o !== x && o !== y && !o.abandoned && o.species === y.species && Math.hypot(o.x - y.x, o.y - y.y) < 80 && inside(e).landPath(y.x, y.y, o.x, o.y))) break;
      w = world(seed);
    }
    const { eco, a, b } = w;
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
  it('toda declaração tem motivo na crônica e toda guerra de preparo teve um plano', () => {
    const { eco, indicators } = runWorld(7, 250);
    expect(indicators.warsNoMotive).toBe(0);
    expect(eco.tally.plans).toBeGreaterThanOrEqual(eco.tally.wars - eco.tally.civilWars);
  }, 300000);
});
