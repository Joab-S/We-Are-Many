import { describe, expect, it } from 'vitest';
import { runWorld } from '../../sim/calibrate';
import { YEAR_SECONDS, type Village } from '../../sim/ecosystem';
import { CHILD, ROLE } from '../../sim/roles';
import { TRAIL } from '../../sim/architecture';
import { roadBlocks } from '../../sim/settlement';
import { DAY } from '../decisions/day';

/**
 * Laboratório do plano novo dos assentamentos (seção 7.3 e 7.4): um povo de verdade com o maior lugar
 * no modo completo. Quem tem fome come antes de trabalhar, a colheita junta ajudantes, o alarme leva
 * quem não luta para dentro, nada entra no estoque sem entrega e a ficha sempre diz o porquê.
 */
describe('jornadas num povo de verdade', () => {
  const { eco } = runWorld(7, 40);
  const live = () => eco.villages.filter((v) => !v.abandoned && v.population > 0);
  const big: Village = live().sort((a, b) => b.population - a.population)[0];
  const residents = () => {
    const out: number[] = [];
    for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === big.id) out.push(i);
    return out;
  };
  const step = (seconds: number, each?: () => void) => {
    for (let t = 0; t < seconds; t += 0.25) {
      eco.watch([big.id]);
      eco.step(0.25);
      each?.();
    }
  };

  it('no modo completo quase todo adulto que trabalha tem tarefa e pouca gente fica parada', () => {
    eco.dayStats = { samples: 0, tasked: 0, idle: 0, steps: 0, streetSteps: 0 };
    step(YEAR_SECONDS);
    const s = eco.dayStats;
    expect(s.samples).toBeGreaterThan(50);
    expect(s.tasked / s.samples).toBeGreaterThan(0.8);
    expect(s.idle / s.samples).toBeLessThan(0.1);
  });

  it('a colheita junta ajudantes de outros ofícios', () => {
    let helpers = 0;
    step(YEAR_SECONDS, () => {
      for (const i of residents()) if (eco.day[i] === DAY.harvest && eco.role[i] !== ROLE.farmer) helpers++;
    });
    expect(helpers).toBeGreaterThan(0);
  });

  it('quem tem fome vai comer antes de voltar ao trabalho', () => {
    const adults = residents().filter((i) => eco.role[i] !== CHILD && eco.role[i] < ROLE.soldier && !eco.carry[i] && !eco.jobKind[i]);
    expect(adults.length).toBeGreaterThan(3);
    const hungry = adults.slice(0, 4);
    big.food = Math.max(big.food, 20);
    for (const i of hungry) {
      eco.energy[i] = 0.3;
      eco.day[i] = DAY.none;
    }
    const ate = new Set<number>();
    step(2, () => {
      for (const i of hungry) if (eco.day[i] === DAY.eat) ate.add(i);
    });
    expect(ate.size).toBeGreaterThanOrEqual(3);
  });

  it('o alarme leva quem não luta para dentro e os corajosos pegam a lança', () => {
    big.alarmUntil = eco.year + 1;
    step(1);
    const people = residents();
    const reacted = people.filter((i) => eco.day[i] === DAY.shelter || eco.day[i] === DAY.militia || eco.role[i] === ROLE.soldier || eco.role[i] === ROLE.guard);
    expect(reacted.length / people.length).toBeGreaterThan(0.9);
    expect(people.some((i) => eco.role[i] === CHILD && eco.day[i] === DAY.shelter)).toBe(true);
    big.alarmUntil = undefined;
    step(1);
  });

  it('nada entra no estoque sem entrega: o pátio, as mãos e as entregas fecham com o que foi feito', () => {
    step(YEAR_SECONDS * 2);
    for (const g of Object.keys(eco.yardIn)) {
      let yard = 0;
      for (const v of eco.villages) yard += v.yard?.[g as 'food'] ?? 0;
      let hands = 0;
      for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.carry[i] && ['food', 'wood', 'stone', 'clay', 'copper', 'tin', 'iron', 'coal', 'gold'][eco.carry[i] - 1] === g) hands += eco.carryAmt[i];
      const made = eco.yardIn[g];
      expect(Math.abs(made - (eco.delivered[g] ?? 0) - yard - hands)).toBeLessThan(Math.max(1, made * 0.02));
    }
  });

  it('toda pessoa do lugar na tela mostra tarefa, alternativas e motivo', () => {
    for (const i of residents()) {
      const d = eco.dayOf(i);
      expect(d.task.length).toBeGreaterThan(0);
      expect(d.why.length).toBeGreaterThan(0);
    }
  });

  it('trilhas nascem do uso e nunca fecham blocos 2x2 de rua', () => {
    let trails = 0;
    for (let t = 0; t < eco.road.length; t++) if (eco.road[t] === TRAIL) trails++;
    expect(trails).toBeGreaterThan(0);
    expect(roadBlocks(eco.road, eco.map.width, eco.map.height)).toBe(0);
  });

  it('toda aldeia e vila tem uma cidade de referência, e lugares vizinhos têm afinidade', () => {
    for (const v of live()) expect(v.ref).toBeDefined();
    expect(eco.affinities.size).toBeGreaterThan(0);
  });
});

describe('nível de detalhe (RF-AS-31)', () => {
  it('modo completo e modo agregado produzem quase o mesmo por pessoa em 60 anos', () => {
    const made = (full: boolean) => {
      const { eco } = runWorld(5, 0);
      let food = 0;
      let people = 0;
      for (let y = 0; y < 60; y++) {
        for (let t = 0; t < YEAR_SECONDS; t += 0.25) {
          if (full) eco.watch(eco.villages.filter((v) => !v.abandoned).map((v) => v.id));
          else eco.watch([]);
          eco.step(0.25);
        }
        for (const v of eco.villages) {
          if (v.abandoned) continue;
          food += v.ledger?.food?.[0] ?? 0;
          people += v.population;
        }
      }
      return food / Math.max(1, people);
    };
    const full = made(true);
    const aggregated = made(false);
    expect(Math.abs(full - aggregated) / aggregated).toBeLessThan(0.05);
  }, 600000);
});
