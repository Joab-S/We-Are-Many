/**
 * Biomas e a matriz de Whittaker (etapa 4 do gerador). O clima de cada tile
 * (temperatura T e umidade H, ambos em 0..1) cai numa tabela pequena que dá o
 * bioma "clímax" do lugar; a vegetação de verdade (que o povo corta e o
 * jogador semeia) decide depois se a mata está de pé ou aberta. A tabela é
 * pré-calculada numa grade de 32x32, então a busca é um acesso a array.
 */

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
  // Acrescentados no fim para não mudar o número dos antigos (saves guardam o número).
  Taiga,
  Swamp,
  Mangrove,
  Cliff,
}

export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.DeepOcean]: 'Oceano profundo',
  [Biome.Ocean]: 'Oceano',
  [Biome.Ice]: 'Gelo marinho',
  [Biome.Beach]: 'Praia',
  [Biome.Grass]: 'Planície',
  [Biome.Forest]: 'Floresta temperada',
  [Biome.Jungle]: 'Floresta tropical',
  [Biome.Savanna]: 'Savana',
  [Biome.Desert]: 'Deserto',
  [Biome.Tundra]: 'Tundra',
  [Biome.Snow]: 'Geleira',
  [Biome.Rock]: 'Rocha',
  [Biome.Mountain]: 'Montanha',
  [Biome.Lava]: 'Lava',
  [Biome.Barren]: 'Solo estéril',
  [Biome.Taiga]: 'Taiga',
  [Biome.Swamp]: 'Pântano',
  [Biome.Mangrove]: 'Manguezal',
  [Biome.Cliff]: 'Penhasco',
};

/** Paleta plana e saturada, inspirada no WorldBox. */
export const PALETTE: Record<Biome, [number, number, number]> = {
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
  [Biome.Taiga]: [48, 98, 78],
  [Biome.Swamp]: [70, 104, 66],
  [Biome.Mangrove]: [38, 112, 86],
  [Biome.Cliff]: [146, 128, 106],
};

/** Mata fechada: dá madeira e conta como floresta para povos e animais. */
export function isForestBiome(b: Biome): boolean {
  return b === Biome.Forest || b === Biome.Jungle || b === Biome.Taiga || b === Biome.Swamp || b === Biome.Mangrove;
}

/** Chão de pedra exposta: pedreira boa e pouca planta. */
export function isRockyBiome(b: Biome): boolean {
  return b === Biome.Rock || b === Biome.Mountain || b === Biome.Cliff;
}

/** Faixa de temperatura da matriz: -20 °C (0) a 40 °C (1). */
const T_MIN = 253;
const T_SPAN = 60;

/** Temperatura em Kelvin normalizada para a matriz de Whittaker (0 frio, 1 quente). */
export function temperatureNorm(tK: number): number {
  const t = (tK - T_MIN) / T_SPAN;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Bioma clímax pela matriz de Whittaker (T e H em 0..1). Faixas de T:
 * < -5 °C tundra; -5 a 5 °C taiga (ou tundra seca); 5 a 18 °C clima
 * temperado; acima de 18 °C tropical. Em cada faixa a umidade vai do
 * deserto à mata e, no extremo encharcado, ao pântano.
 */
function whittakerRule(t: number, h: number): Biome {
  const c = -20 + t * T_SPAN;
  if (c < -5) return Biome.Tundra;
  if (c < 5) return h < 0.3 ? Biome.Tundra : h < 0.42 ? Biome.Grass : Biome.Taiga;
  if (c < 18) return h < 0.22 ? Biome.Desert : h < 0.42 ? Biome.Grass : h < 0.84 ? Biome.Forest : Biome.Swamp;
  return h < 0.28 ? Biome.Desert : h < 0.5 ? Biome.Savanna : h < 0.86 ? Biome.Jungle : Biome.Swamp;
}

const LUT_SIZE = 32;
const LUT = new Uint8Array(LUT_SIZE * LUT_SIZE);
for (let ti = 0; ti < LUT_SIZE; ti++) {
  for (let hi = 0; hi < LUT_SIZE; hi++) LUT[ti * LUT_SIZE + hi] = whittakerRule((ti + 0.5) / LUT_SIZE, (hi + 0.5) / LUT_SIZE);
}

/** Busca O(1) na tabela de biomas. */
export function whittaker(t: number, h: number): Biome {
  const ti = Math.min(LUT_SIZE - 1, Math.max(0, Math.floor(t * LUT_SIZE)));
  const hi = Math.min(LUT_SIZE - 1, Math.max(0, Math.floor(h * LUT_SIZE)));
  return LUT[ti * LUT_SIZE + hi] as Biome;
}
