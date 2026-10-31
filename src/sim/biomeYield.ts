/**
 * Bioma e sociedade (REQUISITOS-VIDA.md, seção "Bioma e sociedade"): o que cada bioma rende para quem
 * vive dele (roça, pasto, pesca, lenha), quão marcadas são as estações, quanto a comida guardada estraga
 * e o cultivo típico. É uma tabela estática compartilhada (Type Object e Flyweight, Game Programming
 * Patterns, como `buildingTypes.ts`): o mapa guarda o bioma de cada tile num `Uint8Array`, e o tipo
 * de cada um mora aqui uma vez só.
 *
 * O assentamento lê a média da tabela sobre a área em volta (`areaYield`), refeita uma vez por ano: a
 * roça, o rebanho e a pesca multiplicam pela média; a colheita, a coleta e a lenha do inverno seguem a
 * amplitude da estação, que cresce com a latitude; a comida guardada estraga pela média do perecimento.
 * Do bioma, da técnica e da densidade sai o modo de vida (`lifewayFor`): nômade, sedentário ou intensivo.
 *
 * Sem estado e sem dependência do Ecosystem: só o mapa, os tipos e `balance.ts`.
 */

import * as B from './balance';
import { Biome } from '../procgen/biomes';
import { temperatureAt, vegetationCap, type SurfaceMap } from '../procgen/surface';

export interface BiomeYield {
  /** Roça sem irrigação (1 = a planície temperada, a melhor terra de plantar). */
  readonly farm: number;
  /** Roça com canais e poços (técnica `irrigacao`): o deserto vira oásis, o pântano vira arrozal. */
  readonly irrigated: number;
  /** Pasto para o rebanho (1 = a pradaria). */
  readonly graze: number;
  /** Pesca na beira: mangue, delta e mar frio dão mais peixe. */
  readonly fish: number;
  /** Quanto o bioma marca as estações, sobre a amplitude da latitude (a mata tropical tem estação mais branda, só a das chuvas). */
  readonly seasonAmp: number;
  /** Perecimento da comida guardada (1 = o temperado; o calor úmido estraga mais, o frio e o seco conservam). */
  readonly spoil: number;
  /** Madeira por árvore derrubada (1 = a mata temperada). */
  readonly wood: number;
  /** Cultivo típico, para a crônica e a ficha. */
  readonly crop: string;
}

const row = (farm: number, irrigated: number, graze: number, fish: number, seasonAmp: number, spoil: number, wood: number, crop: string): BiomeYield => ({
  farm,
  irrigated,
  graze,
  fish,
  seasonAmp,
  spoil,
  wood,
  crop,
});

/** Nada se planta nem se cria (mar, gelo, lava). */
const NONE = row(0, 0, 0, 1, 1, 1, 0, 'nada');

/**
 * A tabela, bioma a bioma. A escala é a da terra comum, onde vive a maior parte dos povos (mata e campo
 * do clima quente ou temperado): 1 é o rendimento de antes da tabela, então o bioma redistribui a comida
 * em vez de cortá-la. A planície (pradaria) tem a melhor roça e o melhor pasto; a mata temperada dá lenha
 * farta e roça média até ser desmatada (o tile cortado vira planície e passa a render como ela); o
 * deserto só planta no oásis, com irrigação, e vive do pasto ralo; a tundra e a taiga quase não plantam
 * (a estação curta ainda corta a roça pela temperatura, em `growingSeason`) e conservam bem o que guardam;
 * costa, mangue e pântano pescam mais, e o pântano irrigado vira arrozal; a montanha pouco planta e pasta
 * cabras. Nenhum bioma estraga mais que o de base: o frio e o seco conservam (motivo para armazenar).
 */
export const BIOME_YIELD: Readonly<Record<Biome, BiomeYield>> = {
  //                          roça  irrig. pasto pesca estação perece lenha  cultivo
  [Biome.DeepOcean]: NONE,
  [Biome.Ocean]: NONE,
  [Biome.Ice]: row(0, 0, 0, 1.15, 1.2, 0.4, 0, 'nada'),
  [Biome.Beach]: row(0.7, 0.85, 0.75, 1.25, 0.8, 1, 0.6, 'coco e mandioca'),
  [Biome.Grass]: row(1.45, 1.6, 1.35, 1, 1, 1, 0.7, 'trigo'),
  [Biome.Forest]: row(1.05, 1.15, 1, 1, 1, 1, 1.25, 'cevada'),
  [Biome.Jungle]: row(1, 1.1, 0.95, 1.1, 0.8, 1, 1.1, 'mandioca'),
  [Biome.Savanna]: row(1.15, 1.3, 1.25, 0.9, 1, 1, 0.8, 'sorgo e milhete'),
  [Biome.Desert]: row(0.15, 1, 0.55, 0.85, 0.8, 0.75, 0.4, 'tâmara'),
  [Biome.Tundra]: row(0.2, 0.2, 0.75, 1.25, 1.25, 0.55, 0.5, 'nada'),
  [Biome.Snow]: row(0, 0, 0.1, 1.2, 1.25, 0.4, 0, 'nada'),
  [Biome.Rock]: row(0.4, 0.45, 0.7, 0.9, 1.1, 0.85, 0.7, 'centeio'),
  [Biome.Mountain]: row(0.25, 0.35, 0.6, 0.85, 1.15, 0.7, 0.9, 'batata nos terraços'),
  [Biome.Lava]: row(0, 0, 0, 0.5, 1, 1, 0, 'nada'),
  [Biome.Barren]: row(0.05, 0.5, 0.25, 0.75, 0.9, 0.85, 0.4, 'nada'),
  [Biome.Taiga]: row(0.6, 0.65, 0.7, 1.15, 1.15, 0.75, 1.15, 'centeio'),
  [Biome.Swamp]: row(0.95, 1.4, 0.85, 1.25, 0.8, 1, 0.9, 'arroz'),
  [Biome.Mangrove]: row(0.45, 0.65, 0.4, 1.45, 0.8, 1, 0.8, 'arroz'),
  [Biome.Cliff]: row(0.2, 0.25, 0.45, 0.9, 1, 0.85, 0.6, 'nada'),
};

/** Tipo do bioma (um número fora da tabela, de um save antigo, vale o da planície). */
export function biomeYield(b: number): BiomeYield {
  return (BIOME_YIELD as Record<number, BiomeYield | undefined>)[b] ?? BIOME_YIELD[Biome.Grass];
}

/**
 * Estação de crescimento pela temperatura média do tile (0 a 1): abaixo de `GROW_COLD_K` a roça quase
 * não amadurece, acima de `GROW_WARM_K` o ano inteiro serve.
 */
export function growingSeason(tempK: number): number {
  const g = (tempK - B.GROW_COLD_K) / (B.GROW_WARM_K - B.GROW_COLD_K);
  return Math.max(B.GROW_MIN, Math.min(1, g));
}

/** Amplitude das estações pela latitude (0 no equador, 1 no polo): o trópico quase não tem inverno. */
export function latitudeAmp(lat: number): number {
  return B.SEASON_AMP_EQUATOR + (B.SEASON_AMP_POLE - B.SEASON_AMP_EQUATOR) * Math.max(0, Math.min(1, lat));
}

/**
 * Peso de uma estação com a amplitude `amp`: 1 + amp × (base − 1). Com amp 1 é o vetor de base
 * (`SEASON_HARVEST` e afins); com 0, o ano todo igual. A média do ano continua 1 (a amplitude é limitada
 * a `SEASON_AMP_MAX`, para nenhuma estação ficar negativa), então a safra do ano não muda: só a época.
 */
export function seasonWeight(base: readonly number[], season: number, amp: number): number {
  return Math.max(0, 1 + amp * (base[season] - 1));
}

/** Média do bioma na área de um assentamento (`Village.area`). */
export interface AreaYield {
  /** Roça sem e com irrigação (já com a estação de crescimento), pasto, pesca, perecimento e lenha (só na mata). */
  farm: number;
  irrigated: number;
  graze: number;
  fish: number;
  spoil: number;
  wood: number;
  /** Amplitude das estações no lugar (latitude × bioma), de 0 a SEASON_AMP_MAX. */
  amp: number;
  /** Mato para coletar: a vegetação de agora sobre a que o lugar aguenta (1 intacto, perto de 0 esgotado). */
  forage: number;
  /** Altitude e relevo para a defesa: 0 plano e baixo, 1 alto e acidentado. */
  relief: number;
  /** Bioma que mais aparece na área (o cultivo típico vem dele). */
  main: number;
}

/** Área neutra (sem amostra): rende como a planície temperada, com as estações de base. */
export function neutralArea(): AreaYield {
  return { farm: 1, irrigated: 1, graze: 1, fish: 1, spoil: 1, wood: 1, amp: 1, forage: 1, relief: 0, main: Biome.Grass };
}

/**
 * Média da tabela sobre a área de raio `r` em volta de (x, y), num tile a cada dois em cada eixo (sem
 * sorteio: a mesma área dá sempre o mesmo número). Só a terra entra na média; a roça leva também a
 * estação de crescimento de cada tile. O relevo junta a altura do centro e o quanto o chão sobe e desce.
 */
export function areaYield(map: SurfaceMap, x: number, y: number, r: number): AreaYield {
  const w = map.width;
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  const R = Math.max(2, Math.ceil(r));
  let n = 0;
  let farm = 0;
  let irrigated = 0;
  let graze = 0;
  let fish = 0;
  let spoil = 0;
  let wood = 0;
  let woods = 0;
  let season = 0;
  let veg = 0;
  let cap = 0;
  let elev = 0;
  let elev2 = 0;
  const count = new Uint16Array(32);
  for (let dy = -R; dy <= R; dy += 2) {
    const yy = cy + dy;
    if (yy < 0 || yy >= map.height) continue;
    for (let dx = -R; dx <= R; dx += 2) {
      if (dx * dx + dy * dy > R * R) continue;
      const t = yy * w + (((cx + dx) % w) + w) % w;
      const e = map.elevation[t];
      if (e < 0) continue;
      const b = map.biome[t];
      const k = biomeYield(b);
      const grow = growingSeason(temperatureAt(map, t));
      n++;
      farm += k.farm * grow;
      irrigated += k.irrigated * grow;
      graze += k.graze;
      fish += k.fish;
      spoil += k.spoil;
      // Lenha: só onde há mata, pesada pela parte lenhosa (o capim com uma árvore solta quase não conta).
      const wv = Math.max(0, Math.min(1, (map.vegetation[t] - 0.25) / 0.5));
      wood += k.wood * wv;
      woods += wv;
      season += k.seasonAmp;
      veg += map.vegetation[t];
      cap += vegetationCap(map, t);
      elev += e;
      elev2 += e * e;
      if (b < count.length) count[b]++;
    }
  }
  if (!n) return neutralArea();
  let main = Biome.Grass as number;
  for (let b = 0; b < count.length; b++) if (count[b] > count[main]) main = b;
  const lat = Math.abs((cy + 0.5) / map.height - 0.5) * 2;
  const mean = elev / n;
  const rugged = Math.sqrt(Math.max(0, elev2 / n - mean * mean));
  const t0 = Math.min(map.height - 1, Math.max(0, cy)) * w + ((cx % w) + w) % w;
  const high = Math.max(0, map.elevation[t0] - B.RELIEF_LOW) / B.RELIEF_HIGH_SPAN;
  return {
    farm: farm / n,
    irrigated: irrigated / n,
    graze: graze / n,
    fish: fish / n,
    spoil: spoil / n,
    wood: woods > 0 ? wood / woods : 1,
    amp: Math.min(B.SEASON_AMP_MAX, latitudeAmp(lat) * (season / n)),
    forage: cap > 0 ? Math.min(1, veg / cap) : 0,
    relief: Math.min(1, 0.5 * Math.min(1, high) + 0.5 * Math.min(1, rugged / B.RELIEF_RUGGED)),
    main,
  };
}

// Modo de vida ---------------------------------------------------------------------------------------

/**
 * Modo de vida do assentamento: o nômade não planta e muda o acampamento quando a coleta se esgota; o
 * sedentário vive das roças, do rebanho e da pesca; o intensivo, com arado, irrigação ou moinho e gente
 * apertada na terra, cultiva cada roça com mais braços e tira mais dela (Boserup).
 */
export type Lifeway = 'nomade' | 'sedentario' | 'intensivo';
export const LIFEWAYS: readonly Lifeway[] = ['nomade', 'sedentario', 'intensivo'];
export const LIFEWAY_NAMES: Record<Lifeway, string> = { nomade: 'Nômade', sedentario: 'Sedentário', intensivo: 'Intensivo' };

/** O que decide o modo de vida: o bioma (a roça que a área dá), a técnica e a densidade. */
export interface LifewayContext {
  /** Roça média da área, com irrigação quando o lugar a conhece (`AreaYield.farm` ou `irrigated`). */
  farm: number;
  /** Moradores por 100 tiles do território. */
  density: number;
  techs: ReadonlySet<string>;
  /** O modo de agora: mudar de modo pede passar a margem (histerese), para o lugar não oscilar a cada ano. */
  now: Lifeway;
}

/** Técnicas que intensificam a lavoura (Boserup): com uma delas, gente apertada na terra boa vira intensiva. */
export const INTENSIFYING: readonly string[] = ['arado', 'irrigacao', 'moinho'];

/** Modo de vida pelo bioma, pela técnica e pela densidade. */
export function lifewayFor(c: LifewayContext): Lifeway {
  const was = (l: Lifeway) => (c.now === l ? 1 : 0);
  // Terra que não dá roça (deserto sem irrigação, tundra, montanha) e pouca gente: coleta, caça e rebanho, mudando o acampamento.
  if (c.farm < B.NOMAD_FARM + was('nomade') * B.LIFEWAY_MARGIN && c.density < B.NOMAD_DENSITY + was('nomade') * B.LIFEWAY_DENSITY_MARGIN) return 'nomade';
  const intensify = INTENSIFYING.some((t) => c.techs.has(t));
  const farm = B.INTENSIVE_FARM - was('intensivo') * B.LIFEWAY_MARGIN;
  if (intensify && c.farm >= farm && c.density >= B.INTENSIVE_DENSITY - was('intensivo') * B.LIFEWAY_DENSITY_MARGIN) return 'intensivo';
  return 'sedentario';
}

/** Alcance relativo da captação (coleta, caça, pasto) pelo modo de vida: o nômade anda mais, o intensivo trabalha perto. */
export function lifewayReach(l: Lifeway): number {
  return l === 'nomade' ? B.NOMAD_REACH : l === 'intensivo' ? B.INTENSIVE_REACH : 1;
}

/** Moradores por 100 tiles de um território de raio `r`. */
export function densityOf(population: number, r: number): number {
  return (100 * population) / (Math.PI * Math.max(1, r) * Math.max(1, r));
}
