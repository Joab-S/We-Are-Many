import { mulberry32, seedFor } from '../core/rng';
import type { PlanetParams } from '../procgen/surface';

/**
 * Espécies de um planeta (RF-SUP-08). O jogador gerencia e transporta
 * espécies existentes (o banco genético da Terra vem a bordo), mas nunca
 * cria uma do zero.
 */

export type SpeciesKind = 'fish' | 'herbivore' | 'predator' | 'shark' | 'sapient';

/** Espécies que vivem na água. */
export function isAquatic(kind: SpeciesKind): boolean {
  return kind === 'fish' || kind === 'shark';
}

export interface Species {
  id: string;
  name: string;
  kind: SpeciesKind;
  /** Planeta de origem. */
  origin: string;
  /** Cor principal do sprite (RGB 0..255). */
  color: [number, number, number];
  /** Faixa de temperatura tolerada, em K. */
  tempMin: number;
  tempMax: number;
  /** Velocidade em tiles por segundo de jogo. */
  speed: number;
  /** Idade máxima em anos de jogo. */
  maxAge: number;
  /** Idade adulta, em anos. */
  maturity: number;
  /** Desenho (art.ts / art-extra.ts); sem ele, o do tipo. */
  sprite?: string;
  /** Altura do desenho em tiles (tamanho do animal). */
  size?: number;
  /** Anda na terra e nada na água rasa (crocodilo, tartaruga, pinguim). */
  amphibious?: boolean;
  /** Corpo dos inteligentes alienígenas (art-extra.ts). */
  body?: string;
  /** Espécie de que esta variante descende (evolução, RF-VIDA-51). */
  parent?: string;
}

/** Onde a espécie pode ficar: 0 terra, 1 água, 2 as duas. */
export function habitatOf(sp: Species): 0 | 1 | 2 {
  if (sp.amphibious) return 2;
  return isAquatic(sp.kind) ? 1 : 0;
}

const SYLLABLES = ['ka', 'lo', 'mi', 'ru', 'ze', 'ta', 'vo', 'ni', 'sha', 'qua', 'dre', 'xi', 'po', 'lu', 'en', 'or', 'ba', 'tek'];

export function alienName(rnd: () => number, syllables = 2 + Math.floor(rnd() * 2)): string {
  let s = '';
  for (let i = 0; i < syllables; i++) s += SYLLABLES[Math.floor(rnd() * SYLLABLES.length)];
  return s[0].toUpperCase() + s.slice(1);
}

const TEMPLATES: Record<SpeciesKind, Omit<Species, 'id' | 'name' | 'origin' | 'color'>> = {
  fish: { kind: 'fish', tempMin: 268, tempMax: 310, speed: 1.6, maxAge: 6, maturity: 1 },
  herbivore: { kind: 'herbivore', tempMin: 255, tempMax: 315, speed: 1.4, maxAge: 12, maturity: 2 },
  predator: { kind: 'predator', tempMin: 250, tempMax: 312, speed: 2.1, maxAge: 14, maturity: 3 },
  shark: { kind: 'shark', tempMin: 262, tempMax: 316, speed: 1.9, maxAge: 25, maturity: 5 },
  sapient: { kind: 'sapient', tempMin: 255, tempMax: 318, speed: 1.1, maxAge: 60, maturity: 15 },
};

export const EARTH_ID = 'sol-3';

type Entry = [name: string, kind: SpeciesKind, sprite: string, color: [number, number, number], tempMin: number, tempMax: number, extra?: Partial<Species>];

/**
 * Banco genético da Terra a bordo (RF-VIDA-04): espécies que o jogador pode
 * soltar em qualquer planeta. As marcadas em EARTH_NATIVE já vivem na Terra.
 */
const EARTH_BANK: Entry[] = [
  ['Peixe', 'fish', 'fish', [120, 190, 255], 268, 310],
  ['Cervo', 'herbivore', 'deer', [170, 110, 60], 255, 310],
  ['Lobo', 'predator', 'wolf', [130, 130, 140], 245, 305],
  ['Humano', 'sapient', 'human', [230, 70, 60], 255, 318],
  ['Tubarão', 'shark', 'shark', [112, 126, 142], 262, 316],
  ['Coelho', 'herbivore', 'rabbit', [200, 180, 160], 255, 312, { speed: 1.7, maxAge: 6, maturity: 1, size: 0.6 }],
  ['Bisão', 'herbivore', 'bison', [110, 72, 44], 250, 305, { speed: 1.2, maxAge: 18, maturity: 3, size: 1.1 }],
  ['Ovelha', 'herbivore', 'sheep', [236, 232, 220], 255, 305, { speed: 1.1, size: 0.8 }],
  ['Cabra', 'herbivore', 'goat', [200, 196, 186], 250, 305, { size: 0.8 }],
  ['Lhama', 'herbivore', 'llama', [222, 200, 160], 250, 300, { size: 1 }],
  ['Javali', 'herbivore', 'boar', [96, 70, 56], 258, 312, { size: 0.8 }],
  ['Galinha', 'herbivore', 'chicken', [240, 236, 228], 262, 312, { speed: 1, maxAge: 5, maturity: 1, size: 0.55 }],
  ['Camelo', 'herbivore', 'camel', [212, 168, 104], 280, 330, { speed: 1.2, maxAge: 20, maturity: 4, size: 1.1 }],
  ['Elefante', 'herbivore', 'elephant', [150, 150, 158], 285, 325, { speed: 0.9, maxAge: 40, maturity: 8, size: 1.4 }],
  ['Mamute', 'herbivore', 'mammoth', [120, 78, 50], 225, 280, { speed: 0.9, maxAge: 40, maturity: 8, size: 1.4 }],
  ['Macaco', 'herbivore', 'monkey', [130, 86, 52], 285, 322, { size: 0.7 }],
  ['Urso', 'predator', 'bear', [110, 76, 50], 240, 300, { speed: 1.6, maxAge: 22, maturity: 4, size: 1.1 }],
  ['Raposa', 'predator', 'fox', [214, 110, 50], 245, 312, { speed: 2.2, size: 0.7 }],
  ['Onça', 'predator', 'jaguar', [214, 170, 70], 285, 322, { speed: 2.4, size: 0.9 }],
  ['Hiena', 'predator', 'hyena', [180, 150, 100], 285, 325, { size: 0.85 }],
  ['Cobra', 'predator', 'snake', [90, 160, 60], 280, 325, { speed: 1.3, size: 0.5 }],
  ['Crocodilo', 'predator', 'crocodile', [84, 120, 64], 285, 320, { speed: 1.3, maxAge: 40, maturity: 6, size: 0.8, amphibious: true }],
  ['Tartaruga', 'herbivore', 'turtle', [96, 130, 70], 270, 318, { speed: 0.6, maxAge: 60, maturity: 8, size: 0.6, amphibious: true }],
  ['Sapo', 'herbivore', 'frog', [90, 180, 70], 275, 315, { speed: 1, maxAge: 5, maturity: 1, size: 0.5, amphibious: true }],
  ['Caranguejo', 'herbivore', 'crab', [220, 96, 70], 270, 318, { speed: 0.9, maxAge: 6, maturity: 1, size: 0.5, amphibious: true }],
  ['Pinguim', 'herbivore', 'penguin', [40, 44, 60], 220, 280, { speed: 0.9, maxAge: 18, maturity: 3, size: 0.7, amphibious: true }],
  ['Piranha', 'fish', 'piranha', [200, 80, 70], 285, 315, { size: 0.45 }],
  ['Lula', 'fish', 'squid', [220, 130, 170], 265, 305, { size: 0.5 }],
  ['Tartaruga-marinha', 'fish', 'seaTurtle', [70, 140, 110], 280, 315, { speed: 1, maxAge: 60, maturity: 8, size: 0.6 }],
  ['Baleia', 'shark', 'whale', [80, 100, 140], 255, 305, { speed: 1.3, maxAge: 70, maturity: 10, size: 1 }],
];

/** Espécies que já vivem na Terra no começo (as outras ficam no banco). */
const EARTH_NATIVE = new Set(['Peixe', 'Cervo', 'Lobo', 'Humano', 'Tubarão', 'Coelho', 'Bisão', 'Raposa', 'Urso', 'Caranguejo', 'Tartaruga', 'Pinguim', 'Baleia', 'Camelo']);

const slug = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function fromEntry([name, kind, sprite, color, tempMin, tempMax, extra]: Entry): Species {
  // A primeira leva mantém os ids antigos ("sol-3:fish" etc.), usados por saves e testes.
  const base = ['Peixe', 'Cervo', 'Lobo', 'Humano', 'Tubarão'].includes(name) ? kind : slug(name);
  return { ...TEMPLATES[kind], id: `${EARTH_ID}:${base}`, name, origin: EARTH_ID, color, sprite, tempMin, tempMax, ...extra };
}

/** Todo o banco genético da Terra. */
export function earthCatalog(): Species[] {
  return EARTH_BANK.map(fromEntry);
}

const VARIANTS: [test: (t: number, e: number) => boolean, suffix: string, shift: number][] = [
  [(t) => t < 262, 'das-neves', -12],
  [(t) => t > 305, 'do-deserto', 10],
  [(_, e) => e > 0.45, 'da-montanha', -6],
  [() => true, 'pintado', 0],
];

/**
 * Variante de uma espécie que evoluiu isolada (RF-VIDA-51): nome derivado do
 * clima onde vive, cor ajustada e faixa de temperatura deslocada.
 */
export function makeVariant(sp: Species, temp: number, elevation: number, n: number, rnd: () => number): Species {
  const [, suffix, shift] = VARIANTS.find(([test]) => test(temp, elevation))!;
  const tone = 0.75 + rnd() * 0.5;
  return {
    ...sp,
    id: `${sp.id}~${n}`,
    name: `${sp.name.split('-')[0]}-${suffix}`,
    color: sp.color.map((c, k) => Math.round(Math.min(255, c * tone + (k === 2 && shift < 0 ? 30 : 0)))) as [number, number, number],
    tempMin: sp.tempMin + shift,
    tempMax: sp.tempMax + shift,
    size: (sp.size ?? 1) * (0.9 + rnd() * 0.25),
    parent: sp.id,
  };
}

/** Corpos possíveis de inteligentes alienígenas (art-extra.ts). */
export const ALIEN_BODIES = ['alien', 'reptile', 'feline', 'avian', 'insectoid', 'amphibian', 'ursine'];

/**
 * Vida nativa fora da Terra é rara, em três níveis, sempre entre os planetas
 * com clima favorável: só vegetação, animais próprios, e raramente uma
 * espécie inteligente. A regra normal é levar espécies da Terra e terraformar.
 */
export const PLANT_LIFE_CHANCE = 0.25;
export const ANIMAL_LIFE_CHANCE = 0.08;
export const SAPIENT_CHANCE = 0.1;

export type LifeTier = 'none' | 'plants' | 'animals' | 'sapient';

/** Nível de vida nativa do planeta, dado o quanto o clima é favorável (`potential`). */
export function nativeLifeTier(planetId: string, potential: number): LifeTier {
  if (planetId === EARTH_ID) return 'sapient';
  if (potential <= 0) return 'none';
  const rnd = mulberry32(seedFor(`${planetId}:native-life`));
  const r = rnd();
  if (r < ANIMAL_LIFE_CHANCE) return rnd() < SAPIENT_CHANCE ? 'sapient' : 'animals';
  return r < ANIMAL_LIFE_CHANCE + PLANT_LIFE_CHANCE ? 'plants' : 'none';
}

/** Quanto de vida (vegetação) o planeta realmente tem. */
export function nativeLifeLevel(planetId: string, potential: number): number {
  return nativeLifeTier(planetId, potential) === 'none' ? 0 : potential;
}

/** Espécies nativas. A Terra tem as conhecidas; os raros planetas com vida própria recebem espécies geradas. */
export function nativeSpecies(planet: PlanetParams): Species[] {
  if (planet.life <= 0) return [];
  const make = (kind: SpeciesKind, name: string, color: [number, number, number]): Species => ({
    ...TEMPLATES[kind],
    id: `${planet.id}:${kind}`,
    name,
    origin: planet.id,
    color,
  });
  if (planet.id === EARTH_ID) return earthCatalog().filter((sp) => EARTH_NATIVE.has(sp.name));
  const tier = nativeLifeTier(planet.id, planet.life);
  if (tier === 'none' || tier === 'plants') return [];
  const rnd = mulberry32(seedFor(`${planet.id}:species`));
  const color = (): [number, number, number] => [60 + rnd() * 190, 60 + rnd() * 190, 60 + rnd() * 190].map(Math.round) as [number, number, number];
  const list = [make('fish', alienName(rnd), color()), make('herbivore', alienName(rnd), color())];
  if (planet.life > 0.4) list.push(make('predator', alienName(rnd), color()));
  if (tier === 'sapient') list.push({ ...make('sapient', alienName(rnd), color()), body: ALIEN_BODIES[Math.floor(rnd() * ALIEN_BODIES.length)] });
  if (planet.life > 0.4) list.push(make('shark', alienName(rnd), color()));
  return list;
}
