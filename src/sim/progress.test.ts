import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { Ecosystem } from './ecosystem';
import { nativeSpecies } from './species';
import {
  ERA_POINTS,
  PILLARS,
  TECHS,
  VOCATION_PILLAR,
  devSpeed,
  emptyPoints,
  forgettable,
  latentResources,
  learnable,
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

describe('técnicas (RF-VIDA-271, 272 e 275)', () => {
  it('só se aprende na era certa e com o pré-requisito', () => {
    expect(learnable(new Set(), 0.5).map((t) => t.id)).toEqual(['ceramica', 'tecelagem'])
    expect(learnable(new Set(), 0.1)).toEqual([]);
    expect(learnable(new Set(), 1).map((t) => t.id)).toContain('domesticacao');
    expect(learnable(new Set(['domesticacao']), 1).map((t) => t.id)).toContain('arado');
    expect(learnable(new Set(), 1).map((t) => t.id)).not.toContain('arado');
    expect(learnable(new Set(['escrita']), 2).map((t) => t.id)).toContain('moeda');
  });

  it('o que outra técnica exige não se esquece antes dela', () => {
    expect(forgettable(new Set(['domesticacao', 'arado'])).map((t) => t.id)).toEqual(['arado']);
    expect(forgettable(new Set())).toEqual([]);
  });

  it('recursos latentes dependem da técnica e da era (RF-VIDA-272)', () => {
    const base = { wet: true, ores: ['iron', 'coal'], era: 0, techs: new Set<string>(), herbivores: true };
    const open = latentResources(base);
    expect(open.some((r) => r.includes('barro'))).toBe(true);
    expect(open.some((r) => r.includes('ferro'))).toBe(true);
    expect(open.some((r) => r.includes('carvão'))).toBe(true);
    expect(open.some((r) => r.includes('animais'))).toBe(true);
    expect(latentResources({ ...base, era: 3, techs: new Set(['ceramica', 'domesticacao']) })).toEqual([]);
  });
});

describe('desenvolvimento no mundo', () => {
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
});
