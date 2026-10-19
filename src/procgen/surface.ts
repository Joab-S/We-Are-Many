import { seedFor } from '../core/rng';
import { ValueNoise3 } from './noise';

/**
 * Superfície 2D de um planeta, no estilo WorldBox: um pixel do mapa por
 * elemento. O mapa é cilíndrico (dá a volta na horizontal) e é gerado de
 * forma determinística a partir do id e dos parâmetros físicos do planeta.
 */

export interface PlanetParams {
  id: string;
  name: string;
  /** Raio em raios terrestres. */
  radiusEarth: number;
  /** Temperatura média da superfície, em Kelvin. */
  temperatureK: number;
  /** Fração da superfície coberta por água (0..1). */
  water: number;
  /** Quantidade de vida vegetal inicial (0..1). */
  life: number;
}

export enum Biome {
  DeepOcean,
  Ocean,
  Ice,
  Beach,
  Grass,
  Forest,
  Jungle,
  Savanna,
  Desert,
  Tundra,
  Snow,
  Rock,
  Mountain,
  Lava,
  Barren,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.DeepOcean]: 'Oceano profundo',
  [Biome.Ocean]: 'Oceano',
  [Biome.Ice]: 'Gelo marinho',
  [Biome.Beach]: 'Praia',
  [Biome.Grass]: 'Planície',
  [Biome.Forest]: 'Floresta',
  [Biome.Jungle]: 'Selva',
  [Biome.Savanna]: 'Savana',
  [Biome.Desert]: 'Deserto',
  [Biome.Tundra]: 'Tundra',
  [Biome.Snow]: 'Neve',
  [Biome.Rock]: 'Rocha',
  [Biome.Mountain]: 'Montanha',
  [Biome.Lava]: 'Lava',
  [Biome.Barren]: 'Solo estéril',
};

/** Paleta plana e saturada, inspirada no WorldBox. */
const PALETTE: Record<Biome, [number, number, number]> = {
  [Biome.DeepOcean]: [28, 64, 140],
  [Biome.Ocean]: [44, 102, 190],
  [Biome.Ice]: [190, 220, 240],
  [Biome.Beach]: [232, 214, 140],
  [Biome.Grass]: [104, 178, 64],
  [Biome.Forest]: [44, 128, 48],
  [Biome.Jungle]: [24, 102, 40],
  [Biome.Savanna]: [176, 176, 76],
  [Biome.Desert]: [222, 190, 110],
  [Biome.Tundra]: [128, 150, 120],
  [Biome.Snow]: [240, 244, 250],
  [Biome.Rock]: [128, 118, 108],
  [Biome.Mountain]: [96, 88, 84],
  [Biome.Lava]: [230, 90, 30],
  [Biome.Barren]: [168, 112, 76],
};

export interface SurfaceMap {
  params: PlanetParams;
  width: number;
  height: number;
  /** Altitude relativa ao nível do mar (-1..1). */
  elevation: Float32Array;
  /** Umidade (0..1). */
  moisture: Float32Array;
  /** Ajuste de temperatura aplicado pelo jogador (K). */
  heat: Float32Array;
  /** Cobertura de vida vegetal (0..1). */
  vegetation: Float32Array;
  biome: Uint8Array;
}

/** Tamanho do mapa proporcional ao planeta (RF-SUP-13): Terra = 512x256. */
export function mapSizeFor(radiusEarth: number): { width: number; height: number } {
  const raw = 512 * radiusEarth;
  const width = Math.min(1024, Math.max(128, Math.round(raw / 16) * 16));
  return { width, height: width / 2 };
}

export function generateSurface(params: PlanetParams): SurfaceMap {
  const { width, height } = mapSizeFor(params.radiusEarth);
  const n = width * height;
  const elevation = new Float32Array(n);
  const moisture = new Float32Array(n);
  const vegetation = new Float32Array(n);
  const terrain = new ValueNoise3(seedFor(`${params.id}:terrain`));
  const wet = new ValueNoise3(seedFor(`${params.id}:moisture`));

  // Amostrar o ruído num cilindro garante que a borda esquerda encaixa na direita.
  const radius = width / (2 * Math.PI) / 48;
  const raw = new Float32Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = (x / width) * Math.PI * 2;
      const cx = Math.cos(a) * radius;
      const cz = Math.sin(a) * radius;
      const cy = y / 48;
      const i = y * width + x;
      raw[i] = terrain.fbm(cx + 10, cy, cz, 6) + 0.35 * terrain.fbm(cx * 4, cy * 4, cz * 4 + 50, 3);
      moisture[i] = 0.5 + 0.8 * wet.fbm(cx * 1.5 + 3, cy * 1.5, cz * 1.5, 4);
    }
  }

  // O nível do mar é o quantil de `water` das altitudes brutas.
  const sorted = Float32Array.from(raw).sort();
  const seaLevel = sorted[Math.min(n - 1, Math.floor(params.water * n))];
  const lo = sorted[0];
  const hi = sorted[n - 1];
  for (let i = 0; i < n; i++) {
    const v = raw[i];
    elevation[i] = v < seaLevel ? -(seaLevel - v) / (seaLevel - lo || 1) : (v - seaLevel) / (hi - seaLevel || 1);
    moisture[i] = Math.min(1, Math.max(0, moisture[i]));
    vegetation[i] = params.life * Math.min(1, Math.max(0, moisture[i] * 1.4 - 0.2));
  }

  const map: SurfaceMap = {
    params,
    width,
    height,
    elevation,
    moisture,
    heat: new Float32Array(n),
    vegetation,
    biome: new Uint8Array(n),
  };
  for (let i = 0; i < n; i++) map.biome[i] = classify(map, i);
  return map;
}

/** Temperatura local (K): base do planeta, latitude, altitude e ajuste do jogador. */
export function temperatureAt(map: SurfaceMap, i: number): number {
  const y = Math.floor(i / map.width);
  const lat = Math.abs(y / (map.height - 1) - 0.5) * 2;
  const alt = Math.max(0, map.elevation[i]);
  return map.params.temperatureK + 22 - lat * lat * 55 - alt * 30 + map.heat[i];
}

export function classify(map: SurfaceMap, i: number): Biome {
  const e = map.elevation[i];
  const t = temperatureAt(map, i);
  const m = map.moisture[i];
  const veg = map.vegetation[i];
  if (t > 600) return Biome.Lava;
  if (e < 0) {
    if (t < 262) return Biome.Ice;
    return e < -0.35 ? Biome.DeepOcean : Biome.Ocean;
  }
  if (e > 0.72) return t < 265 ? Biome.Snow : Biome.Mountain;
  if (e > 0.55) return t < 260 ? Biome.Snow : Biome.Rock;
  if (t < 255) return Biome.Snow;
  if (t > 340) return Biome.Barren;
  if (e < 0.03 && m > 0.2) return Biome.Beach;
  if (t < 268) return Biome.Tundra;
  if (veg < 0.12) return m < 0.35 ? Biome.Desert : t > 300 ? Biome.Barren : Biome.Rock;
  if (t > 300 && m > 0.6 && veg > 0.55) return Biome.Jungle;
  if (veg > 0.5) return Biome.Forest;
  if (t > 296 && m < 0.45) return Biome.Savanna;
  return Biome.Grass;
}

/** Escreve a cor de cada pixel em `out` (RGBA), com sombreamento simples de relevo. */
export function paintSurface(map: SurfaceMap, out: Uint8Array): void {
  const { width, height, elevation } = map;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const [r, g, b] = PALETTE[map.biome[i] as Biome];
      const left = elevation[y * width + ((x + width - 1) % width)];
      const up = elevation[Math.max(0, y - 1) * width + x];
      const e = elevation[i];
      const slope = e >= 0 ? (e - left + (e - up)) * 6 : 0;
      const depth = e < 0 ? 1 + e * 0.35 : 1;
      const shade = Math.min(1.25, Math.max(0.7, 1 + slope)) * depth;
      const o = i * 4;
      out[o] = Math.min(255, r * shade);
      out[o + 1] = Math.min(255, g * shade);
      out[o + 2] = Math.min(255, b * shade);
      out[o + 3] = 255;
    }
  }
}
