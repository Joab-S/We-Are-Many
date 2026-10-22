import { describe, expect, it } from 'vitest';
import { maxFieldsOf, maxPensOf } from './settlement';

describe('limites de currais e roças', () => {
  it('nunca passam de 5 e crescem com o nível', () => {
    expect(maxPensOf(0)).toBe(1);
    expect(maxPensOf(3, 'gado')).toBe(5);
    expect(maxFieldsOf(0)).toBe(2);
    expect(maxFieldsOf(3)).toBe(5);
    for (let t = 0; t < 6; t++) expect(Math.max(maxPensOf(t, 'ovelhas'), maxFieldsOf(t))).toBeLessThanOrEqual(5);
  });

  it('o contorno do assentamento envolve todas as casas, plantações e currais sem deixar nenhum de fora', async () => {
    const { runWorld } = await import('./calibrate');
    const { eco } = runWorld(42, 120);
    const mw = eco.map.width;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      for (const h of v.houses) {
        const s = h.kind === 'port' ? 1 : 2;
        expect(eco.villageAt(h.x + s * 0.5, h.y + s * 0.5)).toBe(v);
      }
      for (const p of v.pens ?? []) {
        expect(eco.villageAt(p.x + 1, p.y + 1)).toBe(v);
      }
      const cx = Math.floor(v.x);
      const cy = Math.floor(v.y);
      const scanR = Math.ceil(eco.radius(v)) + 3;
      for (let dy = -scanR; dy <= scanR; dy++) {
        for (let dx = -scanR; dx <= scanR; dx++) {
          const y = cy + dy;
          if (y < 0 || y >= eco.map.height) continue;
          const x = (((cx + dx) % mw) + mw) % mw;
          if (eco.road[y * mw + x] !== 4) continue;
          expect(eco.villageAt(cx + dx + 0.5, cy + dy + 0.5)).toBeTruthy();
        }
      }
    }
  }, 60000);
});
