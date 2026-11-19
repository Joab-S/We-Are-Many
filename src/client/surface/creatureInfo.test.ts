import { describe, expect, it } from 'vitest';
import { runWorld } from '../../sim/calibrate';
import { YEAR_SECONDS } from '../../sim/ecosystem';
import { CHILD, ROLE_NAMES, ROLES } from '../../sim/roles';
import { animalOf, equipmentOf, historyOf, homeOf, isPerson, lifeOf, personFullName, statusMarks, tiesWithValues, vitalsOf } from './creatureInfo';

/**
 * Ficha das criaturas (RF-VIDA-335): qualquer criatura tem ficha desde que aparece no mundo, com ou sem
 * assentamento, e nada é inventado (o que não se aplica volta vazio).
 */
describe('dados da ficha da criatura', () => {
  const { eco } = runWorld(7, 25);
  const big = eco.villages.filter((v) => !v.abandoned && v.population > 0).sort((a, b) => b.population - a.population)[0];
  const sapient = big.species;

  it('pessoa sem assentamento: nome, fase pela idade, sem profissão, sem equipamento e chegou de fora', () => {
    // Longe de todo lugar do povo, para não se juntar a ninguém.
    let i = -1;
    for (let t = 0; t < 4000 && i < 0; t++) {
      const x = (t * 37) % eco.map.width;
      const y = Math.floor(eco.map.height * (0.2 + 0.6 * ((t * 0.618) % 1)));
      if (eco.villages.every((v) => v.abandoned || eco.distance(v, x, y) > 60)) i = eco.introduceOne(sapient, x + 0.5, y + 0.5);
    }
    expect(i).toBeGreaterThanOrEqual(0);
    expect(homeOf(eco, i)).toBeNull();
    expect(isPerson(eco, i)).toBe(true);
    const n = personFullName(eco, i);
    expect(n.first.length).toBeGreaterThan(0);
    expect(n.family.length).toBeGreaterThan(0);
    const life = lifeOf(eco, i);
    expect(life.role).toBeNull();
    expect(life.stage).toBe('adult');
    expect(equipmentOf(eco, i)).toEqual([]);
    expect(historyOf(eco, i)[0].text).toMatch(/^Chegou de fora/);
    expect(eco.dayOf(i).task).toBe('sem lugar');
    expect(eco.wanderGoal(i).village).toBe(-1);
    const v = vitalsOf(eco, i);
    expect(v.energy).toBeGreaterThan(0);
    expect(v.health).toBeGreaterThan(0);
    expect(v.health).toBeLessThanOrEqual(1);
    const ties = tiesWithValues(eco, i);
    expect(ties.partner).toBeNull();
  });

  it('morador: ofício com nome do jogo, criança sem equipamento e quem trabalha leva algo do ofício', () => {
    let child = -1;
    let worker = -1;
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i] || eco.village[i] !== big.id) continue;
      if (eco.role[i] === CHILD && child < 0) child = i;
      if (['farmer', 'woodcutter', 'hunter', 'builder', 'miner', 'gatherer'].includes(ROLES[eco.role[i]]) && worker < 0 && lifeOf(eco, i).stage === 'adult') worker = i;
    }
    expect(worker).toBeGreaterThanOrEqual(0);
    expect(lifeOf(eco, worker).label).toBe(ROLE_NAMES[ROLES[eco.role[worker]]]);
    const gear = equipmentOf(eco, worker);
    expect(gear.length).toBeGreaterThan(0);
    for (const g of gear) expect(['estoque', 'improviso']).toContain(g.source);
    if (child >= 0) {
      expect(lifeOf(eco, child).stage).toBe('child');
      expect(equipmentOf(eco, child)).toEqual([]);
    }
  });

  it('a nota da IAUS guarda a nota da escolha, as considerações e o que derrubou as alternativas', () => {
    for (let t = 0; t < YEAR_SECONDS / 2; t += 0.25) {
      eco.watch([big.id]);
      eco.step(0.25);
    }
    let found = 0;
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i] || eco.village[i] !== big.id) continue;
      const d = eco.dayOf(i);
      if (!d.note?.factors) continue;
      found++;
      expect(d.note.score).toBeGreaterThan(0);
      expect(d.note.factors.length).toBeGreaterThan(0);
      for (const o of d.note.others) expect(o.score).toBeLessThanOrEqual(d.note.score! + 0.2);
    }
    expect(found).toBeGreaterThan(0);
  });

  it('animal: fase, dieta e bando, sem dados de pessoa', () => {
    let a = -1;
    for (let i = 0; i < eco.count && a < 0; i++) if (eco.alive[i] && !isPerson(eco, i) && eco.wild(eco.kind[i])) a = i;
    expect(a).toBeGreaterThanOrEqual(0);
    const info = animalOf(eco, a);
    expect(info.diet.length).toBeGreaterThan(0);
    expect(info.group.size).toBeGreaterThanOrEqual(1);
    expect(info.maxAge).toBeGreaterThan(0);
    expect(equipmentOf(eco, a)).toEqual([]);
    expect(statusMarks(eco, a).every((m) => m.icon !== '👑')).toBe(true);
  });
});
