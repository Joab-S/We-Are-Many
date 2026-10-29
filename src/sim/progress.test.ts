import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem } from './ecosystem';
import { nativeSpecies } from './species';
import {
  ERA_POINTS,
  PILLARS,
  TECHS,
  TECH_LOSS_STABILITY,
  TECH_RESCUE_KEEP,
  TECH_SAMPLE_YEARS,
  VOCATION_PILLAR,
  aptitudeOf,
  bestCraft,
  curiosityOf,
  devSpeed,
  emptyPoints,
  forgettable,
  latentResources,
  learnable,
  organicTech,
  pillarLevels,
  pointsFor,
  pointsMet,
  pointsText,
  sampleTechs,
  type PillarContext,
} from './progress';
import { VOCATIONS } from './needs';
import { ROLES } from './roles';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };

const idle: PillarContext = {
  welfare: 0, foodFill: 0, farming: false, herd: false, mines: false, smithy: false, techs: 0, completeness: 0, port: false, market: false,
  agreements: 0, fair: false, temple: false, monument: false, luxuryJoy: false, leader: false, tier: 0, stability: 0, linked: false, kingdom: false,
};
const thriving: PillarContext = {
  welfare: 1, foodFill: 1, farming: true, herd: true, mines: true, smithy: true, techs: TECHS.length, completeness: 1, port: true, market: true,
  agreements: 2, fair: true, temple: true, monument: true, luxuryJoy: true, leader: true, tier: 3, stability: 1, linked: true, kingdom: true,
};

describe('pilares e pontos (RF-VIDA-270)', () => {
  it('cada pilar vai de 0 a 1 e um povo parado não rende nada', () => {
    expect(pillarLevels(idle)).toEqual(emptyPoints());
    for (const l of pillarLevels(thriving)) expect(l).toBeCloseTo(1, 5);
  });

  it('quem se desenvolve bem avança mais depressa', () => {
    expect(devSpeed(pillarLevels(thriving))).toBeGreaterThan(1.15);
    expect(devSpeed(pillarLevels(idle))).toBeLessThanOrEqual(0.8);
  });

  it('a vocação rende o dobro de pontos no pilar dela (RF-VIDA-273)', () => {
    const levels = pillarLevels(thriving);
    const plain = pointsFor(levels, 10);
    const miner = pointsFor(levels, 10, 'mineira');
    const i = PILLARS.indexOf(VOCATION_PILLAR.mineira);
    expect(miner[i]).toBeCloseTo(plain[i] * 2, 5);
    expect(miner.filter((p, k) => k !== i && p !== plain[k])).toHaveLength(0);
    for (const v of VOCATIONS) expect(PILLARS).toContain(VOCATION_PILLAR[v]);
  });

  it('a era pede pontos no total e em pelo menos 3 pilares', () => {
    const need = ERA_POINTS[0];
    expect(pointsMet(emptyPoints(), 0)).toBe(false);
    // Tudo num pilar só: pontos de sobra, mas só um pilar.
    expect(pointsMet([need * 2, 0, 0, 0, 0, 0], 0)).toBe(false);
    expect(pointsText([need * 2, 0, 0, 0, 0, 0], 0)).toContain('mínimo em 3 pilares');
    // Espalhado em três pilares.
    expect(pointsMet([need / 3, need / 3, need / 3, 0, 0, 0], 0)).toBe(true);
    expect(pointsMet(emptyPoints(), ERA_POINTS.length)).toBe(true);
    expect(pointsText(emptyPoints(), 0)).toContain(`de ${need} pontos`);
  });
});

describe('técnicas e sequência lógica (RF-VIDA-271, 272 e 275)', () => {
  it('respeita a cadeia lógica de pré-requisitos (cerâmica → fundição → siderurgia → aço → vapor)', () => {
    const initial = learnable(new Set()).map((t) => t.id);
    expect(initial).toEqual(['ceramica', 'domesticacao', 'tecelagem', 'roda']);
    // Sem cerâmica não se aprende fundição; sem fundição não se aprende siderurgia; sem siderurgia não se aprende aço.
    expect(initial).not.toContain('fundicao');
    expect(initial).not.toContain('siderurgia');
    expect(learnable(new Set(['ceramica'])).map((t) => t.id)).toContain('fundicao');
    expect(learnable(new Set(['ceramica'])).map((t) => t.id)).not.toContain('siderurgia');
    expect(learnable(new Set(['ceramica', 'fundicao'])).map((t) => t.id)).toContain('siderurgia');
    expect(learnable(new Set(['ceramica', 'fundicao', 'siderurgia'])).map((t) => t.id)).toContain('aco');
    expect(learnable(new Set(['ceramica', 'fundicao', 'siderurgia', 'aco', 'roda', 'moinho'])).map((t) => t.id)).toContain('vapor');
    expect(learnable(new Set(['domesticacao'])).map((t) => t.id)).toContain('arado');
    expect(learnable(new Set()).map((t) => t.id)).not.toContain('arado');
    expect(learnable(new Set(['ceramica', 'escrita', 'fundicao'])).map((t) => t.id)).toContain('moeda');
  });

  it('o que outra técnica exige não se esquece antes dela', () => {
    expect(forgettable(new Set(['domesticacao', 'arado'])).map((t) => t.id)).toEqual(['arado']);
    expect(forgettable(new Set(['ceramica', 'fundicao', 'siderurgia'])).map((t) => t.id)).toEqual(['siderurgia']);
    expect(forgettable(new Set())).toEqual([]);
  });

  it('recursos latentes dependem da técnica dominada na sequência lógica (RF-VIDA-272)', () => {
    const base = { wet: true, ores: ['copper', 'iron', 'coal'], era: 0, techs: new Set<string>(), herbivores: true };
    const open = latentResources(base);
    expect(open.some((r) => r.includes('barro'))).toBe(true);
    expect(open.some((r) => r.includes('cobre'))).toBe(true);
    expect(open.some((r) => r.includes('ferro'))).toBe(true);
    expect(open.some((r) => r.includes('carvão'))).toBe(true);
    expect(open.some((r) => r.includes('animais'))).toBe(true);
    expect(
      latentResources({
        ...base,
        era: 3,
        techs: new Set(['ceramica', 'domesticacao', 'fundicao', 'siderurgia', 'aco']),
      }),
    ).toEqual([]);
  });

  it('curiosidade individual varia por pessoa e evolução orgânica acompanha o que o povo domina', () => {
    const curiosities = Array.from({ length: 50 }, (_, i) => curiosityOf(i + 1));
    expect(Math.max(...curiosities)).toBeGreaterThan(1.4);
    expect(Math.min(...curiosities)).toBeLessThan(0.6);
    const base = {
      techs: new Set<string>(),
      tier: 0,
      fields: 0,
      herd: false,
      port: false,
      smithy: false,
      market: false,
      madeBronze: 0,
      madeIron: 0,
      madeSteel: 0,
      madeStone: 0,
      madeCoal: 0,
      tools: 0,
    };
    expect(organicTech(base)).toBe(0);
    expect(organicTech({ ...base, techs: new Set(['ceramica', 'fundicao']), madeBronze: 2 })).toBeGreaterThanOrEqual(1);
    expect(organicTech({ ...base, techs: new Set(['ceramica', 'fundicao', 'siderurgia']), madeBronze: 2, madeIron: 2 })).toBeGreaterThanOrEqual(2);
    expect(organicTech({ ...base, techs: new Set(['ceramica', 'fundicao', 'siderurgia', 'aco']), madeIron: 4, madeSteel: 1 })).toBeGreaterThanOrEqual(3);
    expect(organicTech({ ...base, techs: new Set(['ceramica', 'fundicao', 'siderurgia', 'aco', 'roda', 'moinho', 'vapor']), madeSteel: 2, madeCoal: 10 })).toBeGreaterThanOrEqual(4);
  });
});

describe('desenvolvimento e descoberta individual no mundo', () => {
  function world() {
    const map = generateSurface(earth);
    const eco = new Ecosystem(map, 42);
    for (const sp of nativeSpecies(earth)) eco.addSpecies(sp);
    eco.populate();
    return eco;
  }

  it('ensinar ensina uma técnica que o povo pode aprender', () => {
    const eco = world();
    const s = eco.species.findIndex((sp) => sp.kind === 'sapient');
    let v = null;
    for (let t = 0; t < 4000 && !v; t++) {
      const x = (t * 37) % eco.map.width;
      const y = Math.floor(eco.map.height * (0.3 + 0.4 * (((t * 53) % 100) / 100)));
      if (eco.canFound(x, y) && eco.introduceOne(s, x + 0.5, y + 0.5) >= 0) v = eco.foundVillage(s, x, y, 8);
    }
    expect(v).not.toBeNull();
    const village = v!;
    village.tech = 0.5;
    expect(eco.knows(village).size).toBe(0);
    eco.teachVillage(village, 0);
    expect(eco.knows(village).size).toBe(1);
    expect(eco.chronicle.some((e) => e.text.includes('aprendeu com você'))).toBe(true);
  });

  it('se o descobridor morrer antes de ensinar a aldeia, a descoberta se perde', () => {
    const eco = world();
    const v = eco.villages[0];
    let who = -1;
    for (let i = 0; i < eco.count; i++) {
      if (eco.alive[i] && eco.village[i] === v.id && eco.role[i] !== 255) {
        who = i;
        break;
      }
    }
    expect(who).toBeGreaterThanOrEqual(0);
    v.pendingTech = { id: 'ceramica', uid: eco.uid[who], name: 'Sábio Local', progress: 0.4 };
    eco.kill(who, false, 'predador');
    expect(v.pendingTech).toBeUndefined();
    expect(eco.knows(v).has('ceramica')).toBe(false);
    expect(eco.chronicle.some((e) => e.text.includes('morreu antes de ensinar Cerâmica'))).toBe(true);
  });

  /** Adultos de uma aldeia, na ordem do array. */
  const adultsOf = (eco: Ecosystem, id: number) => {
    const out: number[] = [];
    for (let i = 0; i < eco.count; i++) if (eco.alive[i] && eco.village[i] === id && eco.role[i] !== 255) out.push(i);
    return out;
  };

  it('com o ensino adiantado, o aprendiz mais curioso guarda parte e a aldeia sente a perda (RF-VIDA-419)', () => {
    const eco = world();
    const v = eco.villages[0];
    const [who, ...rest] = adultsOf(eco, v.id);
    expect(rest.length).toBeGreaterThan(0);
    v.stability = 0.8;
    v.pendingTech = { id: 'ceramica', uid: eco.uid[who], name: 'Sábio Local', progress: 0.8 };
    eco.kill(who, false, 'predador');
    expect(v.pendingTech).toBeDefined();
    expect(v.pendingTech!.uid).not.toBe(eco.uid[who]);
    expect(rest.map((i) => eco.uid[i])).toContain(v.pendingTech!.uid);
    expect(v.pendingTech!.progress).toBeCloseTo(TECH_RESCUE_KEEP, 5);
    expect(v.stability).toBeCloseTo(0.8 - TECH_LOSS_STABILITY, 5);
    expect(eco.chronicle.some((e) => e.text.includes('aprendiz, guardou parte'))).toBe(true);
  });

  it('o professor que some da aldeia também passa a técnica a um aprendiz', () => {
    const eco = world();
    const v = eco.villages[0];
    const adults = adultsOf(eco, v.id);
    v.pendingTech = { id: 'ceramica', uid: 999999, name: 'Viajante', progress: 0.9 };
    (eco as unknown as { develop(v: unknown, dt: number, adults: number[]): void }).develop(v, 0.01, adults);
    expect(v.pendingTech).toBeDefined();
    expect(adults.map((i) => eco.uid[i])).toContain(v.pendingTech!.uid);
    expect(eco.chronicle.some((e) => e.text.includes('Viajante partiu antes de ensinar'))).toBe(true);
  });

  it('caravana com amostra deixa os artesãos curiosos só do que já podem aprender (RF-VIDA-421)', () => {
    expect(sampleTechs(['tools'], new Set(['ceramica', 'fundicao', 'siderurgia']))).toEqual(['siderurgia']);
    expect(sampleTechs(['brick', 'wood'], new Set(['ceramica']))).toEqual(['ceramica']);
    expect(sampleTechs(['iron'], new Set(['ceramica']))).toEqual([]);
    const eco = world();
    const v = eco.villages[0];
    const maker = { ...v, techs: ['ceramica', 'fundicao', 'siderurgia'] };
    const inspire = (eco as unknown as { inspire(o: unknown, goods: string[], maker: unknown): void }).inspire.bind(eco);
    v.techs = [];
    inspire(v, ['tools', 'brick'], maker);
    // Sem cerâmica, o ferro ainda não diz nada; o tijolo sim.
    expect(Object.keys(v.samples ?? {})).toEqual(['ceramica']);
    expect(v.samples!.ceramica).toBeCloseTo(eco.year + TECH_SAMPLE_YEARS, 5);
  });
});

describe('jeito para o ofício (RF-VIDA-420)', () => {
  it('é determinístico, fica entre 0 e 1 e varia de pessoa para pessoa e de ofício para ofício', () => {
    expect(aptitudeOf(17, 3)).toBe(aptitudeOf(17, 3));
    const all = Array.from({ length: 400 }, (_, k) => aptitudeOf(k, k % 9));
    for (const a of all) expect(a >= 0 && a < 1).toBe(true);
    const high = all.filter((a) => a >= 0.9).length;
    expect(high).toBeGreaterThan(15);
    expect(high).toBeLessThan(80);
    expect(new Set(Array.from({ length: 9 }, (_, r) => aptitudeOf(5, r))).size).toBeGreaterThan(5);
  });

  it('o ofício de mais jeito é um ofício comum e muda de pessoa para pessoa', () => {
    const best = Array.from({ length: 200 }, (_, uid) => bestCraft(uid));
    for (const r of best) expect(r).toBeLessThan(ROLES.indexOf('soldier'));
    expect(new Set(best).size).toBeGreaterThan(8);
  });
});
