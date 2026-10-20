import { describe, expect, it } from 'vitest';
import { runWorld } from './calibrate';
import { foodCap, goodCap, pickVocation, roleFor, room, vocationWeights, welfare, worstNeed, type SiteSample } from './needs';

const site = (o: Partial<SiteSample>): SiteSample => ({ fertile: 0, open: 0, hills: 0, cold: 0, dry: 0, forest: 0, coast: false, deposits: 0, roads: 0, value: 'fé', ...o });

describe('economia local (seções 19.4 e 19.5)', () => {
  it('a produção cai perto do teto e para nele (RF-VIDA-219b)', () => {
    expect(room(0, 100)).toBe(1);
    expect(room(50, 100)).toBeCloseTo(0.75);
    expect(room(100, 100)).toBe(0);
    expect(room(150, 100)).toBe(0);
  });

  it('o teto cresce com o nível e com as construções (RF-VIDA-218)', () => {
    const base = { tier: 0, granary: false, warehouse: false, treasury: false, mines: 0 };
    expect(foodCap({ ...base, tier: 2 })).toBeGreaterThan(foodCap(base));
    expect(foodCap({ ...base, granary: true })).toBeGreaterThan(foodCap(base));
    expect(goodCap('stone', { ...base, warehouse: true })).toBeGreaterThan(goodCap('stone', base));
    expect(goodCap('copper', { ...base, mines: 2 })).toBeGreaterThan(goodCap('copper', base));
    expect(goodCap('gold', { ...base, treasury: true })).toBeGreaterThan(goodCap('gold', base));
  });

  it('a vocação segue o lugar (RF-VIDA-220)', () => {
    const count = (s: SiteSample) => {
      const w = vocationWeights(s);
      const n: Record<string, number> = {};
      for (let k = 0; k < 2000; k++) {
        const v = pickVocation(w, (k + 0.5) / 2000);
        n[v] = (n[v] ?? 0) + 1;
      }
      return n;
    };
    expect(count(site({ coast: true })).pesqueira).toBeGreaterThan(600);
    expect(count(site({ forest: 1 })).madeireira).toBeGreaterThan(600);
    expect(count(site({ fertile: 1 })).agricola).toBeGreaterThan(600);
    expect(count(site({ open: 1, dry: 1, value: 'guerra' })).cavalos).toBeGreaterThan(600);
    expect(pickVocation(vocationWeights(site({ forest: 1 })), 0.5, 'madeireira')).not.toBe('madeireira');
  });

  it('quem falta puxa a profissão certa (RF-VIDA-214)', () => {
    const ctx = { era: 1, fields: true, port: false, herd: false, loom: false, pottery: false, smithy: false };
    expect(roleFor('food', ctx)).toBe('farmer');
    expect(roleFor('fuel', ctx)).toBe('woodcutter');
    expect(roleFor('cloth', { ...ctx, loom: true })).toBe('weaver');
    expect(roleFor('tools', { ...ctx, smithy: true })).toBe('blacksmith');
    expect(roleFor('food', { ...ctx, port: true, vocation: 'pesqueira' })).toBe('fisher');
    const n = { food: 0.9, water: 0.2, fuel: 0.3, material: 1, cloth: 0.5, tools: 1 };
    expect(worstNeed(n)).toBe('fuel');
    expect(welfare(n)).toBeCloseTo(0.65);
  });

  it('em 250 anos: estoque próprio dentro do teto, vocações variadas e rebanhos (RF-VIDA-212, 218, 215, 220)', () => {
    const { eco, indicators } = runWorld(7, 250);
    const live = eco.villages.filter((v) => !v.abandoned);
    expect(new Set(live.map((v) => v.stock)).size).toBe(live.length);
    expect(indicators.overCap).toBe(0);
    expect(indicators.vocations).toBeGreaterThanOrEqual(4);
    expect(indicators.herds).toBeGreaterThan(0);
    expect(indicators.welfare).toBeGreaterThan(0.4);
  }, 120000);
});
