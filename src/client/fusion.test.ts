import { describe, expect, it } from 'vitest';
import { LAND_ALTITUDE, wantsLanding, zoomAtAltitude } from './fusion';

describe('a altitude e o zoom da fusão', () => {
  it('a 0,05 raio da Terra, numa tela de 800 pixels, um tile tem 70 pixels', () => {
    expect(zoomAtAltitude(0.05, 800, 512)).toBeCloseTo(70.1, 1);
  });

  it('metade da altitude, o dobro do zoom', () => {
    expect(zoomAtAltitude(0.1, 800, 512)).toBeCloseTo(zoomAtAltitude(0.2, 800, 512) * 2, 9);
  });
});

describe('o pouso sozinho', () => {
  const prumo = 1;
  it('precisa estar baixo e a menos de 20° do prumo', () => {
    expect(wantsLanding(LAND_ALTITUDE - 0.001, prumo)).toBe(true);
    expect(wantsLanding(LAND_ALTITUDE + 0.001, prumo)).toBe(false);
    expect(wantsLanding(0.01, Math.cos((19 * Math.PI) / 180))).toBe(true);
    expect(wantsLanding(0.01, Math.cos((21 * Math.PI) / 180))).toBe(false);
  });
});
