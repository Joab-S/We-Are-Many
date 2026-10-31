/** Funções puras pequenas do ecossistema: regras de construção, expectativa de vida, cores e cargas. */

import type { Good } from '../economy';
import type { Species } from '../species';
import type { BuildContext } from './types';
import { type BUILDINGS, CARRIED } from './constants';

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
 * Se o assentamento já pode erguer a construção: era, nível e condições
 * (a ferraria só faz sentido com metal no estoque; a cultura adianta templos e mercados;
 * a vocação adianta o prédio característico, RF-VIDA-221).
 */
export function canBuild(kind: (typeof BUILDINGS)[number], c: BuildContext): boolean {
  const { era, tier, metal, culture, capital } = c;
  switch (kind) {
    case 'granary':
      return era >= 1 || c.techs.has('ceramica') || tier >= 1;
    case 'smithy':
      return metal && (c.techs.has('fundicao') || era >= 1);
    case 'market':
      return tier >= 1 || culture.value === 'comércio';
    case 'temple':
      return culture.value === 'fé' ? era >= 1 || tier >= 1 : era >= 2 && tier >= 1;
    case 'windmill':
      return c.techs.has('moinho') && (tier >= 1 || c.vocation === 'agricola');
    // Economia local (RF-VIDA-211 e 216).
    case 'warehouse':
      return tier >= 2 || (tier >= 1 && c.vocation === 'mercantil');
    case 'pottery':
      return c.clay && c.techs.has('ceramica');
    case 'loom':
      return c.techs.has('tecelagem') && (c.herd === 'sheep' || c.herd === 'goat' || c.vocation === 'ovelhas');
    case 'corral':
      return c.herd === 'cattle' || c.herd === 'goat';
    case 'stable':
      return c.techs.has('montaria') && (c.herd === 'horse' || c.herd === 'camel');
    case 'sawmill':
      return (era >= 1 || c.techs.has('fundicao')) && (c.vocation === 'madeireira' || (tier >= 2 && c.forest > 0.55));
    case 'barracks':
      return (era >= 2 || c.techs.has('siderurgia')) && tier >= 2;
    case 'factory':
      return tier >= 2 && c.techs.has('vapor');
    // Saneamento da metrópole (RF-VIDA-284).
    case 'aqueduct':
      return (era >= 2 || c.techs.has('irrigacao')) && tier >= 3;
    // Capitais ricas erguem monumentos: estátua do líder e a grande obra do povo.
    case 'statue':
      return capital && era >= 2 && tier >= 2;
    case 'wonder':
      return capital && era >= 3 && tier >= 2;
  }
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
