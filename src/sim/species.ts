import { mulberry32, seedFor } from '../core/rng';
import type { PlanetParams } from '../procgen/surface';

/**
 * Espécies de um planeta (RF-SUP-08). O jogador gerencia e transporta
 * espécies existentes, mas nunca cria uma do zero.
 */

export type SpeciesKind = 'fish' | 'herbivore' | 'predator' | 'sapient';

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
  sapient: { kind: 'sapient', tempMin: 255, tempMax: 318, speed: 1.1, maxAge: 60, maturity: 15 },
};

export const EARTH_ID = 'sol-3';

/**
 * Vida nativa fora da Terra é muito rara: só uma pequena fração dos planetas
 * com clima favorável chega a ter vida, e menos ainda uma espécie inteligente.
 * A regra normal é o jogador levar espécies da Terra e terraformar.
 */
export const NATIVE_LIFE_CHANCE = 0.01;
export const SAPIENT_CHANCE = 0.1;

/** Nível de vida que o planeta realmente tem, dado o quanto ele seria favorável (`potential`). */
export function nativeLifeLevel(planetId: string, potential: number): number {
  if (planetId === EARTH_ID) return potential;
  if (potential <= 0) return 0;
  return mulberry32(seedFor(`${planetId}:native-life`))() < NATIVE_LIFE_CHANCE ? potential : 0;
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
    ];
  }
  const rnd = mulberry32(seedFor(`${planet.id}:species`));
  const color = (): [number, number, number] => [60 + rnd() * 190, 60 + rnd() * 190, 60 + rnd() * 190].map(Math.round) as [number, number, number];
  const list = [make('fish', alienName(rnd), color()), make('herbivore', alienName(rnd), color())];
  if (planet.life > 0.4) list.push(make('predator', alienName(rnd), color()));
  if (planet.life > 0.7 && rnd() < SAPIENT_CHANCE) list.push(make('sapient', alienName(rnd), color()));
  return list;
}
