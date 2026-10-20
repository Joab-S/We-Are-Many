import { describe, expect, it } from 'vitest';
import { Biome, generateSurface, mapSizeFor, type PlanetParams } from './surface';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 1, temperatureK: 288, water: 0.7, life: 0.8 };

describe('superfície', () => {
  it('tamanho proporcional ao planeta', () => {
    expect(mapSizeFor(1)).toEqual({ width: 1024, height: 512 });
    expect(mapSizeFor(0.53).width).toBe(544);
    expect(mapSizeFor(5).width).toBe(2048);
  });
  it('é determinística', () => {
    const a = generateSurface(earth);
    const b = generateSurface(earth);
    // Comparação byte a byte: o toEqual em arrays grandes é lento demais.
    const same = (x: ArrayBufferView, y: ArrayBufferView) => {
      const p = new Uint8Array(x.buffer);
      const q = new Uint8Array(y.buffer);
      return p.length === q.length && p.every((v, i) => v === q[i]);
    };
    expect(same(a.elevation, b.elevation)).toBe(true);
    expect(same(a.biome, b.biome)).toBe(true);
  });
  it('respeita a fração de água', () => {
    const map = generateSurface(earth);
    const ocean = map.elevation.filter((e) => e < 0).length / map.elevation.length;
    expect(ocean).toBeGreaterThan(0.65);
    expect(ocean).toBeLessThan(0.75);
  });
  it('um planeta quente e seco não tem oceanos nem florestas', () => {
    const map = generateSurface({ ...earth, id: 'venus', temperatureK: 737, water: 0, life: 0 });
    expect(map.biome.every((b) => b === Biome.Lava)).toBe(true);
  });
});

describe('textura de baixa resolução', () => {
  it('mostra o mesmo planeta que o mapa completo', () => {
    const full = generateSurface(earth);
    const low = generateSurface(earth, 0.5);
    expect(low.width).toBe(512);
    let same = 0;
    for (let y = 0; y < low.height; y++) {
      for (let x = 0; x < low.width; x++) {
        const a = low.elevation[y * low.width + x] >= 0;
        const b = full.elevation[y * 2 * full.width + x * 2] >= 0;
        if (a === b) same++;
      }
    }
    expect(same / (low.width * low.height)).toBeGreaterThan(0.95);
  });
});
