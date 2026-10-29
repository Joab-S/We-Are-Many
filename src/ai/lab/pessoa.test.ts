import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/rng';
import type { Role } from '../../sim/roles';
import { chooseProfession, needDemand, professionReason, roleFit, type ProfessionContext } from '../decisions/work';
import { compatibility, inheritTraits, notable, randomTraits, TRAIT, TRAIT_COUNT } from '../traits';
import { explain } from '../utility';

/**
 * Laboratório da IA local, passo 1: "se fosse a pessoa sozinha?". Uma pessoa por vez, num lugar
 * de mentira, para ver se as escolhas fazem sentido antes de soltar a IA num povo inteiro.
 */

const ROLES_STONE: Role[] = ['gatherer', 'hunter', 'woodcutter', 'builder', 'miner', 'farmer'];

/** Uma pessoa com traços dados (o resto em 0). */
function person(set: Partial<Record<keyof typeof TRAIT, number>> = {}): Int8Array {
  const t = new Int8Array(TRAIT_COUNT);
  for (const [k, v] of Object.entries(set)) t[TRAIT[k as keyof typeof TRAIT]] = v;
  return t;
}

function place(traits: Int8Array, lack: Partial<Record<Role, number>> = {}, extra: Partial<ProfessionContext> = {}): ProfessionContext {
  return {
    traits,
    i: 0,
    roles: ROLES_STONE,
    demand: (r) => lack[r] ?? 0,
    share: () => 0.15,
    aptitude: () => 0.5,
    common: () => 1,
    ...extra,
  };
}

/** Quantas vezes cada ofício sai em `n` escolhas. */
function tally(ctx: ProfessionContext, n = 2000, seed = 1): Record<string, number> {
  const rnd = mulberry32(seed);
  const out: Record<string, number> = {};
  for (let k = 0; k < n; k++) {
    const c = chooseProfession(ctx, rnd)!;
    out[c.pick.action] = (out[c.pick.action] ?? 0) + 1;
  }
  return out;
}

describe('IA local: uma pessoa sozinha', () => {
  it('traços em sino: a maioria perto do meio, poucos extremos, e o mesmo sorteio dá a mesma pessoa', () => {
    const n = 2000;
    const a = new Int8Array(n * TRAIT_COUNT);
    const b = new Int8Array(n * TRAIT_COUNT);
    const ra = mulberry32(7);
    const rb = mulberry32(7);
    for (let i = 0; i < n; i++) {
      randomTraits(a, i, ra);
      randomTraits(b, i, rb);
    }
    expect([...a]).toEqual([...b]);
    let extreme = 0;
    let mid = 0;
    for (const v of a) {
      if (Math.abs(v) >= 8) extreme++;
      if (Math.abs(v) <= 3) mid++;
    }
    expect(mid / a.length).toBeGreaterThan(0.5);
    expect(extreme / a.length).toBeLessThan(0.08);
    // Quase todo mundo tem pelo menos um traço marcante: cada pessoa é única.
    let someone = 0;
    for (let i = 0; i < n; i++) if (notable(a, i).length) someone++;
    expect(someone / n).toBeGreaterThan(0.8);
  });

  it('filhos lembram os pais: filhos de pais corajosos são mais corajosos que a média', () => {
    const rnd = mulberry32(3);
    const t = new Int8Array(3 * TRAIT_COUNT);
    let sum = 0;
    for (let k = 0; k < 500; k++) {
      t[TRAIT.courage] = 9;
      t[TRAIT_COUNT + TRAIT.courage] = 7;
      inheritTraits(t, 2, 0, 1, rnd);
      sum += t[2 * TRAIT_COUNT + TRAIT.courage];
    }
    expect(sum / 500).toBeGreaterThan(4);
    expect(sum / 500).toBeLessThan(8);
  });

  it('a cultura puxa os traços: povo da fé tem mais fé', () => {
    const rnd = mulberry32(5);
    const t = new Int8Array(400 * TRAIT_COUNT);
    let faith = 0;
    for (let i = 0; i < 400; i++) {
      randomTraits(t, i, rnd, 'fé');
      faith += t[i * TRAIT_COUNT + TRAIT.faith];
    }
    expect(faith / 400).toBeGreaterThan(2);
  });

  it('gente parecida e gentil combina; agressivos brigam', () => {
    const t = new Int8Array(4 * TRAIT_COUNT);
    t.set(person({ kindness: 8, sociability: 6, faith: 5 }), 0);
    t.set(person({ kindness: 7, sociability: 5, faith: 6 }), TRAIT_COUNT);
    t.set(person({ aggression: 9, kindness: -8, sociability: -6, faith: -7 }), 2 * TRAIT_COUNT);
    expect(compatibility(t, 0, 1)).toBeGreaterThan(0.4);
    expect(compatibility(t, 0, 2)).toBeLessThan(0);
  });

  it('sem falta nenhuma, cada um segue o próprio jeito: o corajoso e forte caça, o paciente planta', () => {
    const brave = tally(place(person({ courage: 9, strength: 8, patience: -5 })));
    const calm = tally(place(person({ patience: 9, diligence: 6, attachment: 6 })));
    expect(brave.hunter).toBeGreaterThan(brave.farmer ?? 0);
    expect(calm.farmer).toBeGreaterThan(calm.hunter ?? 0);
    expect(roleFit(person({ courage: 9, strength: 8 }), 0, 'hunter')).toBeGreaterThan(0.5);
  });

  it('a falta fala mais alto que o gosto: sem lenha, até o corajoso vai cortar madeira', () => {
    const traits = person({ courage: 9, strength: 8 });
    const calm = tally(place(traits));
    const cold = tally(place(traits, { woodcutter: 1 }));
    expect(cold.woodcutter).toBeGreaterThan(calm.woodcutter ?? 0);
    expect(cold.woodcutter / 2000).toBeGreaterThan(0.4);
  });

  it('ofício cheio perde gente; o da família e a vocação do lugar puxam', () => {
    const traits = person();
    const full = tally(place(traits, {}, { share: (r) => (r === 'hunter' ? 0.5 : 0.1) }));
    const free = tally(place(traits));
    expect(full.hunter ?? 0).toBeLessThan(free.hunter);
    const family = tally(place(person({ familism: 8 }), {}, { parent: 'miner' }));
    expect(family.miner).toBeGreaterThan(free.miner);
  });

  it('o paciente decide quase sempre a mesma coisa; o impulsivo varia', () => {
    const lack = { gatherer: 0.3 };
    const spread = (t: Record<string, number>) => Object.keys(t).length;
    const patient = tally(place(person({ patience: 10 }), lack));
    const rash = tally(place(person({ patience: -10 }), lack));
    expect(spread(rash)).toBeGreaterThanOrEqual(spread(patient));
    expect(rash.gatherer).toBeLessThan(patient.gatherer);
  });

  it('cada escolha tem um porquê em português simples', () => {
    const ctx = place(person({ courage: 9, strength: 7 }), { hunter: 1 });
    const c = chooseProfession(ctx, mulberry32(9))!;
    expect(explain(c)).toContain('falta');
    expect(professionReason(ctx, 'hunter', 'comida')).toBe('o lugar precisava de comida e é corajoso');
    expect(needDemand(1)).toBe(0);
    expect(needDemand(0.6)).toBe(1);
  });
});
