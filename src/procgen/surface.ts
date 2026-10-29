import { seedFor } from '../core/rng';
import { Biome, PALETTE, temperatureNorm, whittaker } from './biomes';
import { climateStage } from './climate';
import { PerlinNoise3 } from './noise';
import { makePlates, tectonicStage, type Plate } from './tectonics';

/**
 * Superfície 2D de um planeta, no estilo WorldBox: um pixel do mapa por
 * elemento. O mapa é cilíndrico (dá a volta na horizontal) e é gerado de
 * forma determinística a partir do id e dos parâmetros físicos do planeta.
 *
 * O gerador roda em quatro etapas, cada uma num módulo:
 * 1. Voronoi/placas (tectonics.ts): placas tectônicas com vetor de movimento.
 * 2. Elevação e bordas (tectonics.ts): cordilheiras, subducção, dorsais, rifts e ilhas.
 * 3. Temperatura e umidade (climate.ts): frentes climáticas, costa, interior e sombra de chuva.
 * 4. Atribuição de bioma (biomes.ts + `classify`): matriz de Whittaker e transições de costa.
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

export { Biome, BIOME_NAMES, isForestBiome, isRockyBiome } from './biomes';
export { Boundary, BOUNDARY_NAMES, type Plate } from './tectonics';

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
  /** Tiles limpos pelo jogador (pedra, cacto): sem enfeite até o terreno mudar. Criado quando preciso. */
  bare?: Uint8Array;
  /**
   * Árvores cortadas pelo povo (seção 19.19): 1 toco, 2 muda que brotou
   * sozinha, 3 muda plantada. Criado quando preciso; o Ecosystem faz crescer.
   */
  felled?: Uint8Array;
  /** Desvio de temperatura das frentes climáticas (K); ausente em saves antigos. */
  climate?: Float32Array;
  /** Placas tectônicas, a placa de cada tile, o tipo de limite próximo e a tensão sísmica (0..255). */
  plates?: Plate[];
  plate?: Uint8Array;
  boundary?: Uint8Array;
  stress?: Uint8Array;
}

const FEATURE_SCALE = 80;

/** Tamanho do mapa proporcional ao planeta (RF-SUP-13): Terra = 1024x512. */
export function mapSizeFor(radiusEarth: number): { width: number; height: number } {
  const raw = 1024 * radiusEarth;
  const width = Math.min(2048, Math.max(192, Math.round(raw / 16) * 16));
  return { width, height: width / 2 };
}

/**
 * Gera a superfície. `scale` < 1 produz uma versão de resolução menor que
 * amostra a mesma função de ruído (usada como textura do planeta no 3D, que
 * não precisa do mapa completo).
 */
export function generateSurface(params: PlanetParams, scale = 1): SurfaceMap {
  const full = mapSizeFor(params.radiusEarth);
  const width = Math.max(16, Math.round(full.width * scale));
  const height = width / 2;
  const step = full.width / width;
  const n = width * height;
  const elevation = new Float32Array(n);
  const vegetation = new Float32Array(n);
  const terrain = new PerlinNoise3(seedFor(`${params.id}:terrain`));
  const wet = new PerlinNoise3(seedFor(`${params.id}:moisture`));
  const warp = new PerlinNoise3(seedFor(`${params.id}:plates-warp`));

  // Amostrar o ruído num cilindro garante que a borda esquerda encaixa na direita.
  // As coordenadas são as do mapa completo, para qualquer resolução mostrar o mesmo planeta.
  // Tamanho dos continentes, em pixels do mapa completo.
  const radius = full.width / (2 * Math.PI) / FEATURE_SCALE;
  const cosA = new Float32Array(width);
  const sinA = new Float32Array(width);
  for (let x = 0; x < width; x++) {
    const a = (x / width) * Math.PI * 2;
    cosA[x] = Math.cos(a) * radius;
    sinA[x] = Math.sin(a) * radius;
  }

  // Etapas 1 e 2: placas e elevação bruta.
  const plates = makePlates(seedFor(`${params.id}:plates`), full.width, full.height, params.water);
  const tect = tectonicStage({ plates, fullWidth: full.width, fullHeight: full.height, width, height, step, cosA, sinA, featureScale: FEATURE_SCALE, terrain, warp });
  const raw = tect.raw;

  // O nível do mar é o quantil de `water` das altitudes brutas.
  const sorted = Float32Array.from(raw).sort();
  const seaLevel = sorted[Math.min(n - 1, Math.floor(params.water * n))];
  const lo = sorted[0];
  // O teto é um quantil alto, não o pico isolado: as cordilheiras ocupam a faixa de cima inteira.
  const hi = sorted[Math.floor((n - 1) * 0.998)];
  for (let i = 0; i < n; i++) {
    const v = raw[i];
    if (v < seaLevel) {
      // Submarino: plataforma continental na margem, caindo gradualmente para bacias profundas
      const depth = (seaLevel - v) / (seaLevel - lo || 1);
      elevation[i] = -Math.pow(depth, 0.9);
    } else {
      // Emerso: planícies suaves perto da costa e elevação rápida para picos montanhosos
      const alt = (v - seaLevel) / (hi - seaLevel || 1);
      elevation[i] = Math.min(1, Math.pow(alt, 1.25));
    }
  }

  // Etapa 3: temperatura (frentes) e umidade (costa, interior e sombra de chuva).
  const { climate, moisture } = climateStage({ elevation, width, height, fullWidth: full.width, step, cosA, sinA, featureScale: FEATURE_SCALE, wet });
  for (let i = 0; i < n; i++) vegetation[i] = params.life * Math.min(1, Math.max(0, moisture[i] * 1.4 - 0.2));

  const map: SurfaceMap = {
    params,
    width,
    height,
    elevation,
    moisture,
    heat: new Float32Array(n),
    vegetation,
    biome: new Uint8Array(n),
    climate,
    plates,
    plate: tect.plate,
    boundary: tect.boundary,
    stress: tect.stress,
  };
  // Etapa 4: bioma pela matriz de Whittaker e pelas regras de costa.
  for (let i = 0; i < n; i++) map.biome[i] = classify(map, i);
  return map;
}

/** Temperatura local (K): base do planeta, latitude, altitude e ajuste do jogador. */
export function temperatureAt(map: SurfaceMap, i: number): number {
  const y = Math.floor(i / map.width);
  const lat = Math.abs(y / (map.height - 1) - 0.5) * 2;
  const alt = Math.max(0, map.elevation[i]);
  const fronts = map.climate ? map.climate[i] : 0;
  return map.params.temperatureK + 22 - lat * lat * 55 - alt * 30 + fronts + map.heat[i];
}

/** O terreno sobe rápido logo atrás do tile (2 tiles para dentro há uma encosta alta): costa de penhasco. */
function steepAround(map: SurfaceMap, i: number, e: number): boolean {
  const { width, height, elevation } = map;
  const x = i % width;
  const y = (i - x) / width;
  const limit = e + 0.12;
  return (
    elevation[y * width + ((x + 2) % width)] > limit ||
    elevation[y * width + ((x - 2 + width) % width)] > limit ||
    (y >= 2 && elevation[i - 2 * width] > limit) ||
    (y + 2 < height && elevation[i + 2 * width] > limit)
  );
}

/** Água (mar ou lago, sem lava) a até `r` tiles na cruz em volta: o tile é costa. */
function nearWater(map: SurfaceMap, i: number, r: number): boolean {
  const { width, height, elevation } = map;
  const x = i % width;
  const y = (i - x) / width;
  for (let k = 1; k <= r; k++) {
    if (elevation[y * width + ((x + k) % width)] < 0) return true;
    if (elevation[y * width + ((x - k + width) % width)] < 0) return true;
    if (y - k >= 0 && elevation[i - k * width] < 0) return true;
    if (y + k < height && elevation[i + k * width] < 0) return true;
  }
  return false;
}

/**
 * Bioma de um tile (etapa 4). O clima (T, H) dá o bioma clímax pela matriz
 * de Whittaker; a vegetação decide se a mata está de pé (cortada vira
 * campo, e sem planta nenhuma vira chão nu). Na beira do mar entram as
 * transições: praia, manguezal no litoral quente e úmido e penhasco onde a
 * terra sobe direto da água.
 */
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
  if (e < 0.2 && nearWater(map, i, e < 0.05 ? 2 : 1)) {
    // Costa: a terra que sobe direto do mar vira penhasco; a baixa, praia ou mangue.
    if (e > 0.04 && steepAround(map, i, e)) return Biome.Cliff;
    if (e < 0.05 && m > 0.2 && t >= 268) {
      if (t > 297 && m > 0.7 && veg > 0.5 && nearWater(map, i, 1)) return Biome.Mangrove;
      return Biome.Beach;
    }
  }
  if (t < 268) return Biome.Tundra;
  const climax = whittaker(temperatureNorm(t), m);
  if (climax === Biome.Tundra) return Biome.Tundra;
  if (veg < 0.12) return m < 0.35 ? Biome.Desert : t > 300 ? Biome.Barren : Biome.Rock;
  switch (climax) {
    case Biome.Desert:
      return Biome.Desert;
    case Biome.Savanna:
      return veg > 0.5 && m > 0.45 ? Biome.Forest : Biome.Savanna;
    case Biome.Jungle:
      return veg > 0.55 ? Biome.Jungle : veg > 0.5 ? Biome.Forest : t > 296 && m < 0.45 ? Biome.Savanna : Biome.Grass;
    case Biome.Taiga:
      return veg > 0.45 ? Biome.Taiga : Biome.Grass;
    case Biome.Swamp:
      // Pântano só na baixada; no morro a mesma umidade fecha em mata.
      if (veg > 0.5 && e < 0.12) return Biome.Swamp;
      return veg > 0.5 ? (t > 300 ? Biome.Jungle : Biome.Forest) : Biome.Grass;
    default:
      return veg > 0.5 ? Biome.Forest : Biome.Grass;
  }
}

/** Vegetação que um deserto aguenta (cactos e plantas secas): abaixo do limiar em que vira pasto. */
export const DESERT_VEGETATION = 0.1;

/**
 * Quanta vegetação o tile aguenta (0..1) pelo solo, temperatura e umidade:
 * nada na água, no gelo, no calor extremo ou no pico das montanhas; pouco
 * na encosta de rocha; só plantas de deserto (cactos) no solo seco ou arenoso; o resto pode fechar
 * em mata. Semear e o crescimento natural param nesse teto, então o que nasce
 * é sempre o que o bioma do lugar dá.
 */
export function vegetationCap(map: SurfaceMap, i: number): number {
  const e = map.elevation[i];
  if (e < 0 || e > 0.72) return 0;
  const t = temperatureAt(map, i);
  if (t <= 262 || t >= 320) return 0;
  // Encosta de rocha: só capim e arbusto entre as pedras.
  if (e > 0.55) return 0.35;
  const b = map.biome[i] as Biome;
  if (b === Biome.Cliff) return 0.25;
  const m = map.moisture[i];
  if (m < 0.25) return DESERT_VEGETATION;
  if (m < 0.35 && (b === Biome.Desert || b === Biome.Beach || b === Biome.Barren)) return DESERT_VEGETATION;
  // Clima quente e semiárido (savana): sem umedecer o solo, para na savana com acácias em vez de fechar em floresta.
  if (t > 296 && m < 0.45) return 0.5;
  return 1;
}

/**
 * Semeia até o teto do lugar, sem cortar o que já passa dele; o tile limpo
 * volta a ter enfeite e árvores cortadas (toco ou muda) voltam a crescer.
 */
export function sowVegetation(map: SurfaceMap, i: number, amount: number): void {
  const cap = vegetationCap(map, i);
  if (cap <= 0) return;
  if (map.vegetation[i] < cap) map.vegetation[i] = Math.min(cap, map.vegetation[i] + amount);
  if (map.bare) map.bare[i] = 0;
  if (map.felled?.[i]) {
    map.biome[i] = classify(map, i);
    map.felled[i] = 0;
    if (!isTree(decorAt(map, i)) && map.vegetation[i] <= 0.5) map.felled[i] = 2;
  }
}

/** Enfeite desenhado dentro do tile quando há zoom (guardado no canal alfa da textura). */
export enum Decor {
  None,
  Tree,
  JungleTree,
  Pine,
  Acacia,
  Cactus,
  Boulder,
  /** Toco de árvore cortada e muda crescendo (seção 19.19); 7 a 10 são roça e ruas, desenhadas à parte. */
  Stump = 11,
  Sapling = 12,
}

/** Hash estável de um tile, em [0, 1). */
export function tileHash(i: number): number {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Enfeite que é uma árvore de pé (dá madeira). */
export function isTree(d: Decor): boolean {
  return d === Decor.Tree || d === Decor.JungleTree || d === Decor.Pine || d === Decor.Acacia;
}

export function decorAt(map: SurfaceMap, i: number): Decor {
  if (map.bare?.[i]) return Decor.None;
  const cut = map.felled?.[i];
  if (cut) return cut === 1 ? Decor.Stump : Decor.Sapling;
  const h = tileHash(i);
  const veg = map.vegetation[i];
  switch (map.biome[i] as Biome) {
    case Biome.Forest:
      return h < 0.7 ? Decor.Tree : Decor.None;
    case Biome.Jungle:
      return h < 0.85 ? Decor.JungleTree : Decor.None;
    case Biome.Grass:
      return veg > 0.3 && h < (veg - 0.3) * 0.5 ? Decor.Tree : Decor.None;
    case Biome.Savanna:
      return h < 0.04 + veg * 0.1 ? Decor.Acacia : Decor.None;
    case Biome.Tundra:
      return veg > 0.15 && h < 0.3 ? Decor.Pine : Decor.None;
    case Biome.Taiga:
      return h < 0.75 ? Decor.Pine : Decor.None;
    case Biome.Swamp:
      return h < 0.3 ? Decor.Tree : Decor.None;
    case Biome.Mangrove:
      return h < 0.55 ? Decor.JungleTree : Decor.None;
    case Biome.Cliff:
      return h < 0.18 ? Decor.Boulder : Decor.None;
    case Biome.Desert:
      return h < 0.012 + veg * 0.5 ? Decor.Cactus : Decor.None;
    case Biome.Rock:
    case Biome.Mountain:
      return h < 0.1 ? Decor.Boulder : Decor.None;
    default:
      return Decor.None;
  }
}

/**
 * Pinta um tile em `out` (RGBA): cor do bioma com sombreamento de relevo e,
 * no alfa, o enfeite do tile (Decor * 16 + 15) para o shader desenhar no zoom.
 */
export function paintTile(map: SurfaceMap, out: Uint8Array, i: number): void {
  const { width, elevation } = map;
  const x = i % width;
  const y = (i - x) / width;
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
  out[o + 3] = decorAt(map, i) * 16 + 15;
}

/** Pinta o mapa inteiro. */
export function paintSurface(map: SurfaceMap, out: Uint8Array): void {
  const n = map.width * map.height;
  for (let i = 0; i < n; i++) paintTile(map, out, i);
}
