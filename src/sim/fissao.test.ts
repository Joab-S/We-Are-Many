import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import * as B from './balance';
import { Ecosystem, isLand, type Village } from './ecosystem';
import { nativeSpecies } from './species';
import { BOND } from '../ai/relations';
import { CHILD } from './roles';
import { PILLARS } from './progress';

/**
 * Quando sair e fissão (agente 3B): pressão social, instituições, circunscrição e grupo mínimo. Mundo
 * pequeno, só com o povo (sem fauna), e lugares montados à mão: nada depende da história de uma semente.
 */
const small: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.15, temperatureK: 288, water: 0.6, life: 0.85 };

function world(seed = 5): { eco: Ecosystem; s: number; spot: () => { x: number; y: number } } {
  const map = generateSurface(small);
  const eco = new Ecosystem(map, seed);
  for (const sp of nativeSpecies(small)) eco.addSpecies(sp);
  const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
  // Pontos de terra boa, em ordem fixa, longe dos lugares que já existem.
  let at = 0;
  const spot = () => {
    for (; at < map.width * map.height; at += 37) {
      const x = at % map.width;
      const y = Math.floor(at / map.width);
      if (y < map.height * 0.25 || y > map.height * 0.75) continue;
      if (!isLand(map, at) || map.vegetation[at] < 0.3 || !eco.canFound(x, y)) continue;
      if (eco.villages.some((v) => !v.abandoned && eco.distance(v, x, y) < 30)) continue;
      at += 37;
      return { x, y };
    }
    throw new Error('sem lugar');
  };
  return { eco, s, spot };
}

/** Um lugar com `n` moradores (só os números: a pressão olha a população, não quem mora). */
function place(eco: Ecosystem, s: number, at: { x: number; y: number }, n: number): Village {
  const v = eco.foundVillage(s, at.x, at.y, 2);
  v.population = n;
  return v;
}

describe('pressão social: (pop/DUNBAR)² / (1 + instituições)', () => {
  it('o tamanho pesa ao quadrado', () => {
    const { eco, s, spot } = world();
    const v = place(eco, s, spot(), 150);
    const p150 = eco.socialPressure(v);
    expect(eco.socialPressure(v, 300)).toBeCloseTo(p150 * 4, 6);
    expect(eco.socialPressure(v, 30)).toBeLessThan(0.1);
  });

  it('instituições (degrau, templo, escrita, moeda, reino) seguram mais gente junta', () => {
    const { eco, s, spot } = world();
    const v = place(eco, s, spot(), 300);
    const bare = eco.socialPressure(v);
    v.tier = 2;
    const town = eco.socialPressure(v);
    expect(town).toBeLessThan(bare);
    v.houses.push({ x: Math.floor(v.x) + 3, y: Math.floor(v.y), kind: 'temple', variant: 0, era: 0 });
    v.techs = ['escrita', 'moeda'];
    v.polity = 'reino';
    expect(eco.institutions(v)).toBeCloseTo(B.INST_TIER * 2 + B.INST_TEMPLE + B.INST_WRITING + B.INST_COIN + B.INST_POLITY.reino, 6);
    expect(eco.socialPressure(v)).toBeLessThan(town);
    // A circunscrição também organiza: anos sem para onde ir sobem as instituições, até o teto.
    v.circumscribed = B.CIRCUM_FULL * 3;
    expect(eco.institutions(v)).toBeCloseTo(B.INST_TIER * 2 + B.INST_TEMPLE + B.INST_WRITING + B.INST_COIN + B.INST_POLITY.reino + B.INST_CIRCUM, 6);
  });

  it('pressão alta tira estabilidade', () => {
    const { eco, s, spot } = world();
    const calm = place(eco, s, spot(), 40);
    const full = place(eco, s, spot(), 400);
    for (const v of [calm, full]) {
      v.stability = 0.7;
      eco.updateStability(v);
    }
    expect(full.pressure).toBeGreaterThan(B.PRESSURE_CALM);
    expect(calm.pressure).toBeLessThan(B.PRESSURE_CALM);
    expect(full.stability).toBeLessThan(calm.stability!);
  });

  it('a nota do lugar cai quando ele lota: a cidade atrai até encher, não sem fim', () => {
    const { eco, s, spot } = world();
    const v = place(eco, s, spot(), 60);
    const mid = eco.placeScore(v);
    v.population = 600;
    expect(eco.placeScore(v)).toBeLessThan(mid);
  });
});

/**
 * Um lugar de verdade: `n` adultos (cada um a sua família) e `couples` casais com um filho cada, pelos laços
 * de cônjuge e pelo pai da criança, como a vida social e o nascimento fazem.
 */
function town(eco: Ecosystem, s: number, at: { x: number; y: number }, n: number, couples = 0): Village {
  // O teto da espécie num planeta pequeno é baixo: aqui o que importa é o lugar, não o planeta.
  eco.caps[s] = 100000;
  const v = eco.foundVillage(s, at.x, at.y, n);
  const here = eco.residents(v.id).slice();
  for (let k = 0; k < couples && 2 * k + 1 < here.length; k++) {
    const a = here[2 * k];
    const b = here[2 * k + 1];
    eco.bonds.set(eco.uid[a], [{ uid: eco.uid[b], value: 90, kind: BOND.partner }]);
    eco.bonds.set(eco.uid[b], [{ uid: eco.uid[a], value: 90, kind: BOND.partner }]);
    const kid = eco.spawn(s, v.x, v.y, v.id, 1);
    if (kid >= 0) eco.parent[kid] = eco.uid[a];
  }
  return v;
}

describe('fissão por pressão: quem sai, quando e com quem', () => {
  it('lugar cheio demais para as instituições: famílias escolhem fundar e a colônia leva famílias inteiras', () => {
    const { eco, s, spot } = world();
    const v = town(eco, s, spot(), 200, 30);
    expect(eco.socialPressure(v)).toBeGreaterThan(B.PRESSURE_FISSION);
    for (let k = 0; k < 8 && !v.colony; k++) {
      eco.year += 1;
      eco.migrate();
    }
    expect(v.colony?.cause).toBe('pressão');
    expect(v.colony?.volunteers?.length).toBeGreaterThan(0);
    const families = eco.familyGroups().get(v.id)!;
    const before = v.population;
    const leader = eco.leaderOf(v);
    eco.departColony(v, families);
    expect(eco.tally.fissions).toBe(1);
    expect(eco.tally.fissionPop).toBe(before);
    const nv = eco.villages[eco.villages.length - 1];
    expect(nv.mother).toBe(v.id);
    expect(nv.population).toBeGreaterThanOrEqual(B.COLONY_GROUP_MIN);
    // Ninguém de uma família ficou para trás: o casal e o filho moram juntos, aqui ou lá.
    for (const members of families.values()) expect(new Set(members.map((i) => eco.village[i])).size).toBe(1);
    if (leader >= 0) expect(eco.village[leader]).toBe(v.id);
    // A origem fica com a maior parte do povo.
    expect(v.population).toBeGreaterThan(before * 0.55 - 1);
    expect(eco.drainEvents().some((e) => e.kind === 'fission' && e.from === v.id && e.to === nv.id)).toBe(true);
  });

  it('sem pressão ninguém funda, mesmo com sítio bom por perto', () => {
    const { eco, s, spot } = world();
    const v = town(eco, s, spot(), 50, 10);
    expect(eco.socialPressure(v)).toBeLessThan(B.PRESSURE_SCOUT);
    for (let k = 0; k < 8; k++) {
      eco.year += 1;
      eco.migrate();
    }
    expect(v.colony).toBeUndefined();
    expect(eco.tally.fissions).toBe(0);
  });

  it('a família de um lugar em falta só parte para longe com o grupo mínimo, e sempre inteira', () => {
    const { eco, s, spot } = world();
    const few = town(eco, s, spot(), 3);
    expect(eco.colonizeByLand(few, eco.familyGroups().get(few.id))).toBe(false);
    const v = town(eco, s, spot(), 30, 6);
    const families = eco.familyGroups().get(v.id)!;
    const villages = eco.villages.length;
    let ok = false;
    for (let k = 0; k < 5 && !ok; k++) ok = eco.colonizeByLand(v, families);
    expect(ok).toBe(true);
    const nv = eco.villages[villages];
    expect(nv.population).toBeGreaterThanOrEqual(B.LONE_GROUP_MIN);
    for (const members of families.values()) expect(new Set(members.map((i) => eco.village[i])).size).toBe(1);
  });
});

describe('migração por utilidade', () => {
  it('com fome em casa, famílias inteiras vão para o lugar com comida', () => {
    const { eco, s, spot } = world();
    const a = town(eco, s, spot(), 40, 8);
    // O lugar com comida fica perto, com caminho por terra.
    let b: Village | null = null;
    for (let d = 16; d <= 40 && !b; d += 4) {
      for (const [ox, oy] of [
        [d, 0],
        [-d, 0],
        [0, d],
        [0, -d],
      ]) {
        const x = Math.floor(a.x) + ox;
        const y = Math.floor(a.y) + oy;
        const t = eco.tileAt(x, y);
        if (t >= 0 && isLand(eco.map, t) && eco.canFound(x, y) && eco.landPath(a.x, a.y, x + 0.5, y + 0.5)) {
          b = town(eco, s, { x, y }, 12);
          break;
        }
      }
    }
    expect(b).not.toBeNull();
    a.fedShare = 0.2;
    a.needs = { food: 0.2, water: 1, fuel: 1, material: 1, cloth: 1, tools: 1 };
    b!.fedShare = 1;
    b!.food = 60;
    const families = eco.familyGroups().get(a.id)!;
    const before = b!.population;
    for (let k = 0; k < 6 && b!.population === before; k++) {
      eco.year += 1;
      eco.migrate();
    }
    expect(b!.population).toBeGreaterThan(before);
    for (const members of families.values()) expect(new Set(members.map((i) => eco.village[i])).size).toBe(1);
    // Quem chegou guarda o ano da mudança (a histerese da próxima decisão) e o porquê no diário.
    const moved = [...families.values()].flat().filter((i) => eco.village[i] === b!.id && eco.role[i] !== CHILD);
    expect(moved.length).toBeGreaterThan(0);
    for (const i of moved) {
      expect(eco.movedAt[i]).toBe(eco.year);
      expect(eco.diary.get(eco.uid[i])?.some((t) => t.kind === 'mudança')).toBe(true);
    }
  });
});

describe('circunscrição (Carneiro) e Reus', () => {
  const ORG = PILLARS.indexOf('organizacao');

  it('apertado e sem sítio livre, o lugar fica circunscrito, vira notícia e se organiza', () => {
    const { eco, s, spot } = world();
    const v = place(eco, s, spot(), 300);
    eco.drainEvents();
    const org = v.pts![ORG];
    for (let k = 0; k < B.CIRCUM_NOTE; k++) eco.circumscribe(v, 2, true, false);
    expect(v.circumscribed).toBe(B.CIRCUM_NOTE);
    expect(eco.tally.circumscribed).toBe(1);
    expect(eco.tally.circumYears).toBe(B.CIRCUM_NOTE);
    expect(v.pts![ORG]).toBeGreaterThan(org);
    expect(eco.drainEvents().filter((e) => e.kind === 'circumscribed' && e.village === v.id).length).toBe(1);
    // Sem poder mandar um grupo agora (colônia saindo, intervalo), nada muda; com sítio livre ou sem aperto, desce.
    eco.circumscribe(v, 2, false, false);
    expect(v.circumscribed).toBe(B.CIRCUM_NOTE);
    eco.circumscribe(v, 2, true, true);
    eco.circumscribe(v, 0.2, true, false);
    expect(v.circumscribed).toBe(B.CIRCUM_NOTE - 2);
  });

  it('o reino circunscrito planeja guerra por terra contra o vizinho; sem aperto, não por isso', () => {
    const { eco, s, spot } = world();
    const a = place(eco, s, spot(), 100);
    const b = place(eco, s, spot(), 100);
    const side = (cramped: number) => ({ att: a, def: b, target: b, fAtt: 10, fDef: 5, lack: 0, rich: 0, plenty: 0, cramped, own: [a], other: [b] });
    let land = 0;
    let calm = 0;
    for (let k = 0; k < 400; k++) {
      if (eco.intent(side(1), 0, true, false)?.cramped) land++;
      if (eco.intent(side(0), 0, true, false)?.cramped) calm++;
    }
    expect(land).toBeGreaterThan(20);
    expect(calm).toBe(0);
  });

  it('Reus: com fartura e força, o reino saqueia e domina mais que o forte sem fartura', () => {
    const { eco, s, spot } = world();
    const a = place(eco, s, spot(), 100);
    const b = place(eco, s, spot(), 100);
    a.tech = 2.5;
    const side = (plenty: number) => ({ att: a, def: b, target: b, fAtt: 30, fDef: 5, lack: 0, rich: 0.8, plenty, cramped: 0, own: [a], other: [b] });
    const raids = (plenty: number) => {
      let n = 0;
      for (let k = 0; k < 1000; k++) {
        const m = eco.intent(side(plenty), -5, true, false)?.motive;
        if (m === 'loot' || m === 'dominion') n++;
      }
      return n;
    };
    expect(raids(1)).toBeGreaterThan(raids(0) * 1.5);
  });
});
