import { describe, expect, it } from 'vitest';
import { completeness, missingText, planItems, type PlanContext } from './plan';
import { lotsFor, radiusFor, streetPlan, TIER_RADIUS } from './settlement';

const base: PlanContext = { tier: 0, tech: 0, population: 10, housing: 12, homes: 3, fields: 0, food: 0, port: false, coastal: false, built: new Set(), buildable: [] };

describe('estrutura de referência (RF-VIDA-200 a 207)', () => {
  it('aldeia precisa de casas e comida', () => {
    expect(completeness(planItems(base))).toBe(0.5);
    expect(missingText(planItems(base))).toBe('comida garantida');
    expect(completeness(planItems({ ...base, fields: 1 }))).toBe(1);
  });

  it('a vila só pede o que já dá para fazer na era', () => {
    const vila = { ...base, tier: 1, tech: 1.2, homes: 8, fields: 1, buildable: ['granary', 'market', 'windmill'] };
    const items = planItems(vila);
    expect(items.map((i) => i.id)).toEqual(['housing', 'food', 'fields', 'granary', 'market']);
    expect(missingText(items)).toBe('roças para as casas, celeiro e mercado');
  });

  it('a área cresce aos poucos e as ruas crescem rumo ao nível seguinte', () => {
    expect(radiusFor(1, 0)).toBe(TIER_RADIUS[1]);
    expect(radiusFor(1, 1)).toBe((TIER_RADIUS[1] + TIER_RADIUS[2]) / 2);
    const tiles = (g: number) => new Set(streetPlan(1, 99, g).flatMap((st) => st.pts.map((p) => `${p.x},${p.y}`)));
    const now = tiles(0);
    const grown = tiles(1);
    expect(grown.size).toBeGreaterThan(now.size);
    for (const k of now) expect(grown.has(k)).toBe(true);
    expect(lotsFor(1, 99, 1).length).toBeGreaterThan(lotsFor(1, 99, 0).length);
  });
});
