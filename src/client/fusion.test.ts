import { describe, expect, it } from 'vitest';
import { altitudeAtZoom, LAND_ALTITUDE, LIFT_CEILING, wantsLanding, zoomAtAltitude } from './fusion';
import { MIN_ZOOM, Viewport } from './surface/Viewport';

describe('a altitude e o zoom da fusão', () => {
  it('a 0,05 raio da Terra, numa tela de 800 pixels, um tile tem 70 pixels', () => {
    expect(zoomAtAltitude(0.05, 800, 512)).toBeCloseTo(70.1, 1);
  });

  it('metade da altitude, o dobro do zoom; e uma é o contrário da outra', () => {
    expect(zoomAtAltitude(0.1, 800, 512)).toBeCloseTo(zoomAtAltitude(0.2, 800, 512) * 2, 9);
    expect(altitudeAtZoom(zoomAtAltitude(0.3, 1080, 512), 1080, 512)).toBeCloseTo(0.3, 9);
  });

  it('subir pelo zoom mínimo não tira a nave da órbita', () => {
    expect(altitudeAtZoom(MIN_ZOOM, 800, 512)).toBe(LIFT_CEILING);
    expect(1 + LIFT_CEILING).toBeLessThan(4);
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

describe('afastar além do zoom mínimo', () => {
  const vista = () => {
    const v = new Viewport(1024, 512);
    v.setSize(1280, 800);
    return v;
  };

  it('com um giro novo da roda, no zoom mínimo', () => {
    const v = vista();
    v.zoom = MIN_ZOOM;
    expect(v.wantsOut(1, 10_000)).toBe(true);
  });

  it('o giro que chegou ao mínimo não sai sem querer: precisa parar antes', () => {
    const v = vista();
    v.zoom = 0.6;
    expect(v.wantsOut(1, 10_000)).toBe(false);
    v.zoom = MIN_ZOOM;
    expect(v.wantsOut(1, 10_100)).toBe(false);
    expect(v.wantsOut(1, 10_200)).toBe(false);
    expect(v.wantsOut(1, 10_800)).toBe(true);
  });

  it('aproximar não sai, nem fora do mínimo', () => {
    const v = vista();
    v.zoom = MIN_ZOOM;
    expect(v.wantsOut(-1, 10_000)).toBe(false);
    v.zoom = 3;
    expect(v.wantsOut(1, 20_000)).toBe(false);
  });
});
