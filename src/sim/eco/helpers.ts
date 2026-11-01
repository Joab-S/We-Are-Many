/** Funções puras pequenas do ecossistema: regras de construção, expectativa de vida, cores e cargas. */

import type { Good } from '../economy';
import type { Species } from '../species';
import type { BuildContext } from './types';
import { type BUILDINGS, CARRIED } from './constants';
import { BUILDING_TYPES } from '../buildingTypes';

export const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Cor em HSL (0–1) para RGB, para reinos além da paleta. */
export function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/**
 * Se o assentamento já pode erguer a construção: era, nível e condições (a regra de cada tipo está na
 * tabela `BUILDING_TYPES`, em buildingTypes.ts).
 */
export function canBuild(kind: (typeof BUILDINGS)[number], c: BuildContext): boolean {
  return BUILDING_TYPES[kind].canBuild(c);
}

/** Expectativa de vida: inteligentes vivem mais conforme a era avança. */
export function lifespan(sp: Species, era: number): number {
  return sp.kind === 'sapient' ? sp.maxAge * (1 + 0.12 * era) : sp.maxAge;
}

/** Idade a partir da qual um inteligente é idoso (não trabalha nem tem filhos). */
export function elderAge(sp: Species, era: number): number {
  return lifespan(sp, era) * 0.75;
}
export const carryCode = (g: string) => CARRIED.indexOf(g as (typeof CARRIED)[number]) + 1;
export const CARGO_GOOD = (c: number): Good | 'food' | 'water' | null => (c > 0 ? CARRIED[c - 1] : null);
