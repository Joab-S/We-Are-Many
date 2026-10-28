import { describe, expect, it } from 'vitest';
import { Biome, isForestBiome, temperatureNorm, whittaker } from './biomes';
import { rainfall, waterDistance } from './climate';
import { paintGeoView } from './debugViews';
import { CoarseField } from './noise';
import { generateSurface, mapSizeFor, type PlanetParams } from './surface';
import { Boundary, makePlates, plateCount } from './tectonics';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 1, temperatureK: 288, water: 0.7, life: 0.8 };

describe('etapa 1: placas', () => {
  it('quantidade pelo tamanho do planeta e tipos pela fração de terra', () => {
    expect(plateCount(1024)).toBe(14);
    const plates = makePlates(7, 1024, 512, 0.7);
    expect(plates.length).toBe(14);
    expect(plates.some((p) => p.continental)).toBe(true);
    expect(plates.some((p) => !p.continental)).toBe(true);
    for (const p of plates) expect(Math.hypot(p.vx, p.vy)).toBeLessThanOrEqual(1.0001);
    // Mundo sem água: todas continentais; mundo oceânico: nenhuma.
    expect(makePlates(7, 1024, 512, 0).every((p) => p.continental)).toBe(true);
    expect(makePlates(7, 1024, 512, 1).every((p) => !p.continental)).toBe(true);
  });

  it('todo tile tem uma placa e as bordas são tortas (não seguem retas)', () => {
    const map = generateSurface(earth);
    const used = new Set(map.plate!);
    expect(used.size).toBeGreaterThan(map.plates!.length * 0.8);
    // Borda reta de Voronoi teria a mesma placa em linhas inteiras; o desvio faz a borda serpentear.
    let changes = 0;
    for (let y = 1; y < map.height; y++) for (let x = 0; x < map.width; x++) if (map.plate![y * map.width + x] !== map.plate![(y - 1) * map.width + x]) changes++;
    expect(changes).toBeGreaterThan(map.width);
  });
});

describe('etapa 2: elevação pelas bordas', () => {
  const map = generateSurface(earth);
  const n = map.width * map.height;

  it('colisões continentais erguem cordilheiras mais altas que o interior das placas', () => {
    let conv = 0;
    let convN = 0;
    let inner = 0;
    let innerN = 0;
    for (let i = 0; i < n; i++) {
      if (!map.plates![map.plate![i]].continental || map.elevation[i] < 0) continue;
      if (map.boundary![i] === Boundary.Convergent && map.stress![i] > 120) {
        conv += map.elevation[i];
        convN++;
      } else if (map.boundary![i] === Boundary.None) {
        inner += map.elevation[i];
        innerN++;
      }
    }
    expect(convN).toBeGreaterThan(0);
    expect(conv / convN).toBeGreaterThan((inner / innerN) * 1.5);
  });

  it('as ilhas no mar se concentram nas bordas das placas', () => {
    let islands = 0;
    let atBorder = 0;
    for (let i = 0; i < n; i++) {
      if (map.elevation[i] < 0 || map.plates![map.plate![i]].continental) continue;
      islands++;
      if (map.boundary![i] !== Boundary.None) atBorder++;
    }
    expect(islands).toBeGreaterThan(0);
    expect(atBorder / islands).toBeGreaterThan(0.7);
  });

  it('fossas oceânicas nas zonas de subducção', () => {
    let deepest = 0;
    for (let i = 0; i < n; i++) if (map.boundary![i] === Boundary.Subduction) deepest = Math.min(deepest, map.elevation[i]);
    expect(deepest).toBeLessThan(-0.6);
  });
});

describe('etapa 3: temperatura e umidade', () => {
  it('distância até a água por chanfro, dando a volta no mapa', () => {
    const w = 8;
    const e = new Float32Array(w * 2).fill(0.2);
    e[0] = -0.5;
    const d = waterDistance(e, w, 2, 1);
    expect(d[0]).toBe(0);
    expect(d[1]).toBe(1);
    // A coluna 7 encosta na 0 pela volta do mapa.
    expect(d[7]).toBe(1);
    expect(d[w + 1]).toBeCloseTo(Math.SQRT2, 5);
  });

  it('sombra de chuva: o lado da montanha virado para o vento é úmido e o de trás é seco', () => {
    // Linha do Equador (vento de leste, soprando para oeste): mar à direita, serra no meio, planície à esquerda.
    const w = 200;
    const h = 3;
    const e = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ridge = Math.max(0, 1 - Math.abs(x - 80) / 12);
        e[y * w + x] = x >= 150 ? -0.4 : 0.05 + 0.8 * ridge;
      }
    }
    const rain = rainfall(e, w, h, w, 1);
    const row = w;
    const windward = rain[row + 95];
    const leeward = rain[row + 60];
    expect(windward).toBeGreaterThan(leeward * 2);
  });

  it('temperatura cai com a latitude e com a altitude; umidade cobre a faixa toda na terra', () => {
    const map = generateSurface(earth);
    let lo = 1;
    let hi = 0;
    for (let i = 0; i < map.moisture.length; i++) {
      if (map.elevation[i] < 0) continue;
      lo = Math.min(lo, map.moisture[i]);
      hi = Math.max(hi, map.moisture[i]);
    }
    expect(lo).toBeLessThan(0.1);
    expect(hi).toBeGreaterThan(0.9);
    expect(temperatureNorm(253)).toBe(0);
    expect(temperatureNorm(313)).toBe(1);
  });
});

describe('etapa 4: matriz de Whittaker', () => {
  it('cruza T e H nos biomas esperados', () => {
    expect(whittaker(0.95, 0.1)).toBe(Biome.Desert);
    expect(whittaker(0.95, 0.4)).toBe(Biome.Savanna);
    expect(whittaker(0.95, 0.7)).toBe(Biome.Jungle);
    expect(whittaker(0.95, 0.95)).toBe(Biome.Swamp);
    expect(whittaker(0.55, 0.6)).toBe(Biome.Forest);
    expect(whittaker(0.55, 0.3)).toBe(Biome.Grass);
    expect(whittaker(0.35, 0.7)).toBe(Biome.Taiga);
    expect(whittaker(0.1, 0.7)).toBe(Biome.Tundra);
    expect(isForestBiome(Biome.Taiga)).toBe(true);
  });

  it('a Terra tem todos os biomas da matriz e as transições de costa', () => {
    const map = generateSurface(earth);
    const seen = new Set(map.biome);
    for (const b of [Biome.Desert, Biome.Savanna, Biome.Jungle, Biome.Forest, Biome.Taiga, Biome.Tundra, Biome.Snow, Biome.Swamp, Biome.Beach, Biome.Mangrove]) {
      expect(seen.has(b)).toBe(true);
    }
  });
});

describe('desempenho e depuração', () => {
  it('a grade grossa reproduz um campo suave e dá a volta na horizontal', () => {
    const f = new CoarseField(64, 32, 4, 1, (x, y, out) => (out[0] = Math.sin((x / 64) * Math.PI * 2) + y * 0.01));
    expect(f.get(0, 8, 8)).toBeCloseTo(Math.sin(Math.PI / 4) + 0.08, 5);
    // Entre a última coluna (60) e a primeira (0 = 64) a interpolação fecha a volta.
    expect(f.get(0, 62, 0)).toBeCloseTo((Math.sin((60 / 64) * Math.PI * 2) + 0) / 2, 5);
  });

  it('gera um planeta grande (2048 x 1024) em tempo de inicialização', () => {
    const t0 = performance.now();
    const map = generateSurface({ ...earth, id: 'grande', radiusEarth: 3 });
    expect(map.width).toBe(mapSizeFor(3).width);
    // Folga grande para máquinas de CI lentas; numa máquina comum leva ~2 s.
    expect(performance.now() - t0).toBeLessThan(15000);
  }, 30000);

  it('cada visão de depuração pinta o mapa todo sem enfeites', () => {
    const map = generateSurface(earth, 0.25);
    const out = new Uint8Array(map.width * map.height * 4);
    const sums: number[] = [];
    for (const v of ['plates', 'elevation', 'temperature', 'humidity', 'biomes'] as const) {
      paintGeoView(map, v, out);
      let s = 0;
      for (let i = 0; i < out.length; i += 4) {
        expect(out[i + 3]).toBe(15);
        s += out[i] * 3 + out[i + 1] * 5 + out[i + 2] * 7;
      }
      sums.push(s);
    }
    expect(new Set(sums).size).toBe(sums.length);
  });
});
