import { mulberry32, seedFor } from '../core/rng';
import type { PlanetParams } from '../procgen/surface';
import type { Ecology } from './fauna';

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
  /** Predador que também come frutos, raízes e insetos (urso, raposa): passa melhor quando a caça some. */
  omnivore?: boolean;
  /** Ecologia própria (dieta, massa, bando, nicho): os alienígenas recebem a do gerador; a Terra usa a tabela de fauna.ts. */
  eco?: Partial<Ecology>;
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
  ['Urso', 'predator', 'bear', [110, 76, 50], 240, 305, { speed: 1.6, maxAge: 22, maturity: 4, size: 1.1, omnivore: true }],
  ['Raposa', 'predator', 'fox', [214, 110, 50], 245, 312, { speed: 2.2, size: 0.7, omnivore: true }],
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
  ['Rena', 'herbivore', 'reindeer', [150, 120, 90], 220, 290, { maxAge: 15, maturity: 2, size: 1 }],
  ['Cabra-montesa', 'herbivore', 'ibex', [168, 140, 104], 235, 305, { maxAge: 14, maturity: 2, size: 0.85 }],
  ['Leão', 'predator', 'lion', [212, 168, 96], 285, 325, { maxAge: 14, maturity: 3, size: 1.05 }],
  ['Urubu', 'predator', 'vulture', [52, 46, 50], 265, 320, { maxAge: 15, maturity: 3, size: 0.6 }],
  ['Zebra', 'herbivore', 'zebra', [236, 236, 230], 283, 325, { maxAge: 20, maturity: 3, size: 1 }],
];

/**
 * Espécies que já vivem na Terra no começo (as outras ficam no banco): uma ou duas por guilda
 * em cada bioma (docs/REFATORACAO-ECOSSISTEMA.md). Domésticas (ovelha, galinha, lhama), a cobra
 * e o mamute ficam só no banco genético.
 */
const EARTH_NATIVE = new Set([
  'Peixe', 'Cervo', 'Lobo', 'Humano', 'Tubarão', 'Coelho', 'Bisão', 'Raposa', 'Urso', 'Caranguejo', 'Tartaruga', 'Pinguim', 'Baleia', 'Camelo',
  'Elefante', 'Macaco', 'Javali', 'Onça', 'Hiena', 'Crocodilo', 'Sapo',
  'Rena', 'Cabra-montesa', 'Leão', 'Urubu', 'Zebra',
]);

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

/**
 * Papéis de um ecossistema alienígena (docs/REFATORACAO-ECOSSISTEMA.md): cada um vira uma
 * espécie com ecologia própria, desenho emprestado de um bicho da Terra do mesmo papel e
 * cor do planeta. `min` é a vida mínima do planeta para o papel aparecer.
 */
const ALIEN_GUILDS: { kind: SpeciesKind; sprites: string[]; min: number; eco: Partial<Ecology> & Pick<Ecology, 'guild' | 'mass'> }[] = [
  { kind: 'herbivore', sprites: ['bison', 'zebra', 'camel'], min: 0, eco: { guild: 'pastador', mass: 300, herd: 10, range: 18, roam: 70, litter: 0.5, fear: 0.6 } },
  { kind: 'herbivore', sprites: ['rabbit', 'frog'], min: 0, eco: { guild: 'pastador', mass: 3, herd: 6, range: 6, roam: 30, litter: 3, fear: 0.9 } },
  { kind: 'herbivore', sprites: ['deer', 'ibex'], min: 0.3, eco: { guild: 'ramoneador', mass: 70, herd: 8, range: 10, roam: 50, litter: 0.9, fear: 0.8 } },
  { kind: 'herbivore', sprites: ['monkey', 'boar'], min: 0.5, eco: { guild: 'onívoro', mass: 25, herd: 8, range: 10, roam: 45, litter: 1.5, fear: 0.6, forage: 0.7, insects: 0.5, carrion: 0.2 } },
  { kind: 'predator', sprites: ['fox', 'jaguar'], min: 0.4, eco: { guild: 'predador', mass: 20, herd: 1, range: 12, roam: 70, litter: 1.5, fear: 0.4, forage: 0.2, meat: 1, insects: 0.3, maxPrey: 40 } },
  { kind: 'predator', sprites: ['wolf', 'lion'], min: 0.6, eco: { guild: 'predador', mass: 80, herd: 5, range: 20, roam: 100, litter: 1.5, fear: 0.2, forage: 0, meat: 1, carrion: 0.5, maxPrey: 150, pack: true } },
  { kind: 'predator', sprites: ['vulture', 'hyena'], min: 0.7, eco: { guild: 'necrófago', mass: 10, herd: 6, range: 30, roam: 200, litter: 0.8, fear: 0.5, forage: 0, carrion: 1 } },
];

/**
 * Bichos de um planeta vivo, pelos papéis: o clima desloca a faixa de temperatura
 * (todos vivem perto da média do planeta) e a gravidade muda o porte (gravidade
 * baixa, bichos maiores e mais lentos de crescer; alta, menores e mais ninhadas).
 */
function alienFauna(planet: PlanetParams, rnd: () => number, color: () => [number, number, number]): Species[] {
  // Gravidade aproximada pelo raio (densidade parecida com a da Terra).
  const g = Math.max(0.3, Math.min(2.5, planet.radiusEarth));
  const scale = Math.pow(g, -1.5);
  const cold = planet.temperatureK < 260 ? 1.4 : 1;
  const out: Species[] = [];
  for (const row of ALIEN_GUILDS) {
    if (planet.life < row.min) continue;
    const kind = row.kind;
    const mass = Math.max(0.5, row.eco.mass * scale * cold * (0.6 + rnd() * 0.8));
    const big = Math.log10(mass / row.eco.mass + 1);
    const sprite = row.sprites[Math.floor(rnd() * row.sprites.length)];
    const eco: Partial<Ecology> = {
      forage: 1,
      meat: 0,
      carrion: 0,
      insects: 0,
      fish: 0,
      plankton: 0,
      pack: false,
      engineer: false,
      hibernate: rnd() < 0.5 && planet.temperatureK < 265,
      seasonal: rnd() < 0.7,
      biomes: {},
      open: 0.8,
      moist: [0, 1],
      alt: [0, 0.75],
      ...row.eco,
      mass,
      maxPrey: (row.eco.maxPrey ?? 0) * scale,
      // Gravidade alta: mais crias; baixa: menos.
      litter: (row.eco.litter ?? 1) * Math.min(1.6, Math.max(0.6, g)),
      parasite: 'vermes',
    };
    const spread = 45 + rnd() * 15;
    const mid = planet.temperatureK + (rnd() - 0.5) * 10;
    out.push({
      ...TEMPLATES[kind],
      id: `${planet.id}:${eco.guild}-${out.length}`,
      name: alienName(rnd),
      origin: planet.id,
      color: color(),
      sprite,
      tempMin: Math.round(mid - spread * 0.55),
      tempMax: Math.round(mid + spread * 0.45),
      maxAge: Math.round(TEMPLATES[kind].maxAge * (0.8 + big)),
      speed: TEMPLATES[kind].speed / Math.sqrt(g),
      size: Math.max(0.5, Math.min(1.5, 0.6 + Math.log10(mass + 1) * 0.25)),
      eco,
    });
  }
  return out;
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
  const list = [make('fish', alienName(rnd), color()), ...alienFauna(planet, rnd, color)];
  if (tier === 'sapient') list.push({ ...make('sapient', alienName(rnd), color()), body: ALIEN_BODIES[Math.floor(rnd() * ALIEN_BODIES.length)] });
  if (planet.life > 0.4) list.push(make('shark', alienName(rnd), color()));
  return list;
}
