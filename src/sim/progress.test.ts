import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem } from './ecosystem';
import { nativeSpecies } from './species';
import {
  ERA_POINTS,
  PILLARS,
  TECHS,
  VOCATION_PILLAR,
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
  type PillarContext,
} from './progress';
import { VOCATIONS } from './needs';

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
});
