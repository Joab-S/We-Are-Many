import { describe, expect, it } from 'vitest';
import { Biome, classify, Decor, decorAt, generateSurface, mapSizeFor, sowVegetation, type PlanetParams } from './surface';

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

  it('semear dá a vegetação do bioma: cacto no deserto, nada no gelo, mata só onde é úmido', () => {
    const map = generateSurface(earth);
    const n = map.width * map.height;
    const before = Uint8Array.from(map.biome);
    for (let k = 0; k < 40; k++) {
      for (let i = 0; i < n; i++) {
        sowVegetation(map, i, 0.06);
        map.biome[i] = classify(map, i);
      }
    }
    const decor = new Map<Biome, Set<Decor>>();
    let deserts = 0;
    let cacti = 0;
    for (let i = 0; i < n; i++) {
      const was = before[i] as Biome;
      const now = map.biome[i] as Biome;
      if (was === Biome.Desert) {
        // O deserto segue deserto e ganha cactos, nunca árvores.
        expect(now).toBe(Biome.Desert);
        deserts++;
        if (decorAt(map, i) === Decor.Cactus) cacti++;
      }
      if (was === Biome.Ice || was === Biome.Snow || was === Biome.Ocean || was === Biome.DeepOcean) expect(now).toBe(was);
      if (!decor.has(now)) decor.set(now, new Set());
      decor.get(now)!.add(decorAt(map, i));
    }
    expect(deserts).toBeGreaterThan(0);
    expect(cacti / deserts).toBeGreaterThan(0.04);
    const trees = [Decor.Tree, Decor.JungleTree, Decor.Pine, Decor.Acacia];
    for (const b of [Biome.Desert, Biome.Snow, Biome.Ice, Biome.Barren]) for (const d of trees) expect(decor.get(b)?.has(d) ?? false).toBe(false);
  }, 15000);

  it('semear faz árvores cortadas (toco) e tiles limpos voltarem a ter árvores', () => {
    const map = generateSurface(earth);
    const n = map.width * map.height;
    map.felled = new Uint8Array(n);
    map.bare = new Uint8Array(n);
    let idx = -1;
    for (let i = 0; i < n; i++) {
      if (map.biome[i] === Biome.Forest && decorAt(map, i) === Decor.Tree) {
        idx = i;
        break;
      }
    }
    expect(idx).toBeGreaterThanOrEqual(0);
    // Toco de árvore cortada: primeiro vira muda e depois árvore adulta.
    map.felled[idx] = 1;
    map.vegetation[idx] = 0.28;
    map.biome[idx] = classify(map, idx);
    expect(decorAt(map, idx)).toBe(Decor.Stump);
    sowVegetation(map, idx, 0.06);
    expect(decorAt(map, idx)).toBe(Decor.Sapling);
    sowVegetation(map, idx, 0.3);
    expect(map.felled[idx]).toBe(0);
    expect(decorAt(map, idx)).toBe(Decor.Tree);
    // Tile limpo (bare = 1) mesmo já no teto de vegetação volta a ter árvore ao semear.
    map.bare[idx] = 1;
    expect(decorAt(map, idx)).toBe(Decor.None);
    sowVegetation(map, idx, 0.06);
    expect(map.bare[idx]).toBe(0);
    expect(decorAt(map, idx)).toBe(Decor.Tree);
  });
});
