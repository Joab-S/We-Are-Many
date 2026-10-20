import { mulberry32, seedFor } from '../core/rng';
import type { PlanetParams } from '../procgen/surface';

/**
 * Espécies de um planeta (RF-SUP-08). O jogador gerencia e transporta
 * espécies existentes, mas nunca cria uma do zero.
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
  if (planet.id === EARTH_ID) {
    return [
      make('fish', 'Peixe', [120, 190, 255]),
      make('herbivore', 'Cervo', [170, 110, 60]),
      make('predator', 'Lobo', [130, 130, 140]),
      make('sapient', 'Humano', [230, 70, 60]),
      make('shark', 'Tubarão', [112, 126, 142]),
    ];
  }
  const tier = nativeLifeTier(planet.id, planet.life);
  if (tier === 'none' || tier === 'plants') return [];
  const rnd = mulberry32(seedFor(`${planet.id}:species`));
  const color = (): [number, number, number] => [60 + rnd() * 190, 60 + rnd() * 190, 60 + rnd() * 190].map(Math.round) as [number, number, number];
  const list = [make('fish', alienName(rnd), color()), make('herbivore', alienName(rnd), color())];
  if (planet.life > 0.4) list.push(make('predator', alienName(rnd), color()));
  if (tier === 'sapient') list.push(make('sapient', alienName(rnd), color()));
  if (planet.life > 0.4) list.push(make('shark', alienName(rnd), color()));
  return list;
}
