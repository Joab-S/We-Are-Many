import { describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import * as B from './balance';
import { Ecosystem, isLand, type Village } from './ecosystem';
import { nativeSpecies } from './species';

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
