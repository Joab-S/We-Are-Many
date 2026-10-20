import { describe, expect, it } from 'vitest';
import { runWorld } from './calibrate';
import { roadBlocks, streetPlan } from './settlement';

describe('ruas e estradas (RF-VIDA-190 a 196)', () => {
  it('a planta de qualquer assentamento não tem ruas coladas nem blocos 2x2', () => {
    for (let seed = 1; seed < 400; seed++) {
      const tiles = new Set<string>();
      for (const st of streetPlan(3, seed * 7919)) for (const p of st.pts) tiles.add(`${p.x},${p.y}`);
      for (const k of tiles) {
        const [x, y] = k.split(',').map(Number);
        if (Math.abs(x) <= 2 && Math.abs(y) <= 2) continue;
        const block = tiles.has(`${x + 1},${y}`) && tiles.has(`${x},${y + 1}`) && tiles.has(`${x + 1},${y + 1}`);
        expect(block, `semente ${seed} em ${k}`).toBe(false);
      }
    }
  });

  it('cada nível só estende a planta do nível anterior', () => {
    for (let seed = 1; seed < 50; seed++) {
      const low = new Set(streetPlan(1, seed).flatMap((st) => st.pts.map((p) => `${p.x},${p.y}`)));
      const high = new Set(streetPlan(3, seed).flatMap((st) => st.pts.map((p) => `${p.x},${p.y}`)));
      for (const k of low) expect(high.has(k)).toBe(true);
    }
  });

  it('conta blocos 2x2 de rua', () => {
    const road = new Uint8Array(16);
    road[0] = road[1] = road[4] = road[5] = 1;
    expect(roadBlocks(road, 4, 4)).toBe(1);
  });

  for (const seed of [42, 7]) {
    it(`em 200 anos (semente ${seed}) nenhuma rua dupla e toda casa na beira da rua`, () => {
      const { indicators } = runWorld(seed, 200);
      expect(indicators.settlements).toBeGreaterThan(5);
      expect(indicators.roadBlocks).toBe(0);
      expect(indicators.housesOffStreet).toBe(0);
    }, 120000);
  }
});
