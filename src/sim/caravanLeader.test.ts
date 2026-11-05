import { describe, expect, it } from 'vitest';
import { seedWorld } from './calibrate';
import type { Ecosystem } from './ecosystem';

/** Uma visita a pé entre dois lugares do mundo das calibrações, com quem vai escolhido entre os moradores. */
function visit(): { eco: Ecosystem; who: number; uid: number } {
  const { eco } = seedWorld(9, 0.3);
  for (let t = 0; t < 4; t += 0.25) eco.step(0.25);
  for (const v of eco.villages) {
    for (const o of eco.villages) {
      if (v === o || v.abandoned || o.abandoned) continue;
      const path = eco.roadPath(v.x, v.y, o.x, o.y);
      if (!path || path.length < 6) continue;
      const who = eco.traveler(v, 0);
      if (who < 0) continue;
      const uid = eco.uid[who];
      if (eco.launchConvoy(v, o, 'visit', path, [], who)) return { eco, who, uid };
    }
  }
  throw new Error('sem par de lugares com caminho');
}

describe('caravana com quem lidera no mapa', () => {
  it('quem viaja continua vivo, anda com a caravana e volta a decidir na chegada', () => {
    const { eco, who, uid } = visit();
    const c = eco.caravans[eco.caravans.length - 1];
    expect(eco.alive[who]).toBe(1);
    expect(eco.trip[who]).toBe(1);
    for (let t = 0; t < 2; t += 0.25) eco.step(0.25);
    expect(eco.uid[who]).toBe(uid);
    expect(eco.x[who]).toBeCloseTo(c.x, 5);
    expect(eco.y[who]).toBeCloseTo(c.y, 5);
    let steps = 0;
    while (eco.caravans.includes(c) && steps++ < 20000) eco.step(0.25);
    expect(eco.caravans.includes(c)).toBe(false);
    if (eco.alive[who] && eco.uid[who] === uid) expect(eco.trip[who]).toBe(0);
  });

  it('se quem lidera morre no caminho, a caravana acaba', () => {
    const { eco, who } = visit();
    const c = eco.caravans[eco.caravans.length - 1];
    eco.step(0.25);
    eco.kill(who, false, 'fome');
    eco.step(0.25);
    expect(eco.caravans.includes(c)).toBe(false);
  });
});
