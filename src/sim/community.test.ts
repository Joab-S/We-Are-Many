import { describe, expect, it } from 'vitest';
import * as B from './balance';
import { belowTier, lensArea, loyaltyScore, missingFunctions, polityOf, siteValue, spacingFor, tierAllowed, waterGrade, type LoyaltyLook, type SiteLook, type TierCheck } from './community';
import type { BuildingKind } from './ecosystem';
import { chooseDay, DAY, type BoardTask, type DayContext } from '../ai/decisions/day';
import { TRAIT_COUNT } from '../ai/traits';

/** Regras puras do plano novo dos assentamentos (REQUISITOS-VIDA.md, seção 20, RF-AS). */
describe('nascimento e degraus (RF-AS fases 1 e 2)', () => {
  const site = (over: Partial<SiteLook>): SiteLook => ({ water: 0.5, fertile: 0.5, forest: 0.5, rock: 0.5, flat: 0.5, coast: 0, ruin: 0, defense: 0.5, route: 0.5, motive: 0.5, dist: B.SITE_IDEAL_DIST, ...over });

  it('o batedor prefere água e terra boa, na distância ideal da origem', () => {
    expect(siteValue(site({ water: 1, fertile: 1 }))).toBeGreaterThan(siteValue(site({})));
    expect(siteValue(site({ dist: B.SITE_IDEAL_DIST }))).toBeGreaterThan(siteValue(site({ dist: B.SITE_IDEAL_DIST + 40 })));
    expect(siteValue(site({ motive: 1 }))).toBeGreaterThan(siteValue(site({ motive: 0 })));
  });

  it('penalidades graduais: quem já explora a captação, a sobreposição e a capital longe descontam (onda 3)', () => {
    // Campos novos ausentes não mudam a nota.
    expect(siteValue(site({ overlap: 0, crowd: 0, capital: 0 }))).toBeCloseTo(siteValue(site({})));
    // Distribuição livre ideal: com tanta gente quanto a que o lugar novo terá, a captação rende a metade.
    const full = siteValue(site({ fertile: 1, forest: 0, rock: 0, crowd: 0 }));
    const half = siteValue(site({ fertile: 1, forest: 0, rock: 0, crowd: B.SITE_CATCH_POP }));
    const none = siteValue(site({ fertile: 0, forest: 0, rock: 0, crowd: 0 }));
    expect(full - half).toBeCloseTo((full - none) / 2);
    expect(siteValue(site({ overlap: 0.5 }))).toBeLessThan(siteValue(site({ overlap: 0 })));
    expect(siteValue(site({ capital: B.SITE_CAPITAL_FREE }))).toBeCloseTo(siteValue(site({ capital: 0 })));
    expect(siteValue(site({ capital: B.SITE_CAPITAL_FREE + 50 }))).toBeLessThan(siteValue(site({ capital: 0 })));
  });

  it('a técnica muda o peso da pedra e do minério (onda 3)', () => {
    const gain = (era: number, k: 'rock' | 'ore') => siteValue(site({ era, rock: 0, ore: 0, [k]: 1 })) - siteValue(site({ era, rock: 0, ore: 0 }));
    expect(gain(2, 'rock')).toBeGreaterThan(gain(0, 'rock'));
    expect(gain(1, 'ore')).toBeGreaterThan(gain(0, 'ore'));
    expect(gain(0, 'ore')).toBeGreaterThan(0);
  });

  it('lente: interseção de dois discos', () => {
    expect(lensArea(5, 5, 10)).toBe(0);
    expect(lensArea(5, 3, 1)).toBeCloseTo(Math.PI * 9);
    // Dois discos iguais com os centros na borda um do outro: 2π/3 − √3/2, vezes r².
    expect(lensArea(2, 2, 2)).toBeCloseTo(4 * ((2 * Math.PI) / 3 - Math.sqrt(3) / 2));
    expect(lensArea(5, 5, 4)).toBeGreaterThan(lensArea(5, 5, 6));
  });

  it('água graduada: lago perto vale mais que longe, o mar não mata a sede, o poço pede água no subsolo (onda 3)', () => {
    const dry = B.SITE_WELL_MOISTURE - 0.1;
    expect(waterGrade(2, dry, false)).toBe(B.SITE_WATER_LAKE_NEAR);
    expect(waterGrade(B.SITE_WATER_RANGE, dry, false)).toBeCloseTo(B.SITE_WATER_LAKE_FAR);
    expect(waterGrade(B.SITE_WATER_RANGE + 1, dry, false)).toBe(0);
    // Sem lago e com o solo seco não há água doce, nem com poço; com água no subsolo o poço resolve.
    expect(waterGrade(Infinity, dry, true)).toBe(0);
    expect(waterGrade(Infinity, B.SITE_WELL_MOISTURE, false)).toBe(0);
    expect(waterGrade(Infinity, B.SITE_WELL_MOISTURE, true)).toBe(B.SITE_WATER_WELL);
    // Solo encharcado: nascentes e córregos, melhores quanto mais úmido.
    expect(waterGrade(Infinity, B.SITE_SPRING_MOISTURE, false)).toBeCloseTo(B.SITE_WATER_SPRING[0]);
    expect(waterGrade(Infinity, 1, false)).toBeCloseTo(B.SITE_WATER_SPRING[1]);
  });

  it('lugares maiores pedem mais espaço em volta', () => {
    for (let t = 1; t < 4; t++) expect(spacingFor(t)).toBeGreaterThanOrEqual(spacingFor(t - 1));
  });

  it('o degrau pede gente e funções; sem as funções o lugar não sobe e pode cair', () => {
    const check = (population: number, built: BuildingKind[], extra: Partial<TierCheck> = {}): TierCheck => ({ population, built: new Set(built), capital: false, market: 0, water: true, ...extra });
    expect(tierAllowed(check(500, []))).toBe(0);
    expect(missingFunctions(1, check(50, []))).toContain('celeiro');
    expect(tierAllowed(check(50, ['granary', 'smithy']))).toBe(1);
    expect(tierAllowed(check(200, ['granary', 'smithy', 'market', 'temple']))).toBe(2);
    expect(tierAllowed(check(500, ['granary', 'smithy', 'market', 'temple']))).toBe(2);
    expect(tierAllowed(check(500, ['granary', 'smithy', 'market', 'temple'], { capital: true }))).toBe(3);
    expect(belowTier(2, check(200, ['granary', 'smithy']))).toBe(true);
    expect(belowTier(1, check(B.TIER_POPULATION_NEW[1] * B.TIER_DOWN_SHARE - 1, ['granary', 'smithy']))).toBe(true);
    expect(belowTier(1, check(B.TIER_POPULATION_NEW[1], ['granary', 'smithy']))).toBe(false);
  });

  it('reino só com cidade como capital e 3 lugares leais; aldeia isolada é livre (RF-AS-48)', () => {
    expect(polityOf(0, 1, 0)).toBe('livre');
    expect(polityOf(1, 3, 0)).toBe('chefia');
    expect(polityOf(2, 3, 0)).toBe('reino');
    expect(polityOf(2, 2, 0)).toBe('chefia');
    expect(polityOf(3, 12, 1)).toBe('império');
  });

  it('lealdade sobe com afinidade, comércio e proteção e cai com distância e carga (RF-AS-49)', () => {
    const base: LoyaltyLook = { affinity: 0, trade: 0, protection: 0.5, burden: 0, dist: 30, sameCulture: true, charisma: 0 };
    const l = loyaltyScore(base);
    expect(loyaltyScore({ ...base, affinity: 60 })).toBeGreaterThan(l);
    expect(loyaltyScore({ ...base, trade: 1 })).toBeGreaterThan(l);
    expect(loyaltyScore({ ...base, dist: 90 })).toBeLessThan(l);
    expect(loyaltyScore({ ...base, burden: 1 })).toBeLessThan(l);
    expect(loyaltyScore({ ...base, sameCulture: false })).toBeLessThan(l);
  });
});

describe('jornada: escolha da próxima tarefa (RF-AS-22 e 25)', () => {
  const traits = new Int8Array(TRAIT_COUNT);
  const task = (over: Partial<BoardTask>): BoardTask => ({ kind: DAY.work, tile: 1, prio: 0.5, slots: 3, taken: 0, role: 2, label: 'tarefa', ...over });
  const ctx = (over: Partial<DayContext>): DayContext => ({ traits, i: 0, role: 2, hunger: 0, rest: 0, social: 0, faith: 0, tasks: [], friends: () => 0, temple: false, ...over });
  const rnd = () => 0.5;

  it('com fome, a pessoa vai comer antes de trabalhar', () => {
    const c = chooseDay(ctx({ hunger: 0.95, tasks: [{ task: task({}), dist: 5 }] }), rnd)!;
    expect(c.pick.action.kind).toBe(DAY.eat);
  });

  it('cansada, vai descansar; sem nada a fazer, fica parada', () => {
    expect(chooseDay(ctx({ rest: 1 }), rnd)!.pick.action.kind).toBe(DAY.rest);
    expect(chooseDay(ctx({}), rnd)).toBeNull();
  });

  it('na colheita urgente todo mundo ajuda, mesmo de outro ofício', () => {
    const harvest = task({ kind: DAY.harvest, role: 2, urgent: true, prio: 1, label: 'colher a roça 1' });
    const own = task({ kind: DAY.work, role: 3, prio: 0.3, label: 'cortar lenha' });
    const c = chooseDay(ctx({ role: 3, tasks: [{ task: harvest, dist: 8 }, { task: own, dist: 8 }] }), rnd)!;
    expect(c.pick.action.kind).toBe(DAY.harvest);
    // Fora da urgência, o ofício pesa mais.
    const calm = chooseDay(ctx({ role: 3, tasks: [{ task: { ...harvest, urgent: false, prio: 0.5 }, dist: 8 }, { task: own, dist: 8 }] }), rnd)!;
    expect(calm.pick.action.kind).toBe(DAY.work);
  });

  it('tarefa cheia não é escolhida (reserva)', () => {
    const full = task({ slots: 1, taken: 1 });
    expect(chooseDay(ctx({ tasks: [{ task: full, dist: 1 }] }), rnd)).toBeNull();
  });
});
