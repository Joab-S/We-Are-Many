/**
 * Comércio vivo (REQUISITOS-VIDA.md, 19.6, RF-VIDA-230 a 236, e as ideias
 * 282, 286, 289, 291 e 293): preço pela escassez, bens de luxo da região,
 * moeda por era, caravanas, acordos e transumância. Funções e dados puros;
 * o Ecosystem aplica.
 */

import * as B from './balance';
import type { Good } from './economy';
import type { Need, Needs } from './needs';

// Bens de luxo (RF-VIDA-282) ---------------------------------------------------

export const LUXURIES = ['salt', 'wine', 'spice', 'dye', 'silk'] as const;
export type Luxury = (typeof LUXURIES)[number];

export const LUXURY_NAMES: Record<Luxury, string> = {
  salt: 'sal',
  wine: 'vinho',
  spice: 'especiarias',
  dye: 'tinta',
  silk: 'seda',
};

/** Era mínima para produzir cada luxo (o vinho pede ânforas, a seda pede tear e criação). */
export const LUXURY_ERA: Record<Luxury, number> = { salt: 0, wine: 1, spice: 0, dye: 1, silk: 2 };

/** Contagem do entorno, de 0 a 1 cada (fração dos tiles de terra). */
export interface LuxurySite {
  jungle: number;
  savanna: number;
  forest: number;
  fertile: number;
  dry: number;
  /** Temperatura média em kelvin. */
  temp: number;
  coast: boolean;
}

/**
 * O luxo que a região dá, se der algum: especiarias na selva (o bioma raro),
 * sal na costa seca, tinta na savana, vinho no clima temperado e fértil,
 * seda na mata quente; sal em qualquer costa. Nada é sorteado.
 */
export function pickLuxury(s: LuxurySite): Luxury | null {
  if (s.jungle >= 0.25) return 'spice';
  if (s.coast && s.dry >= 0.1) return 'salt';
  if (s.savanna >= 0.25) return 'dye';
  if (s.temp >= 281 && s.temp <= 298 && s.fertile >= 0.35 && s.forest < 0.6) return 'wine';
  if (s.temp > 293 && s.forest >= 0.5) return 'silk';
  if (s.coast) return 'salt';
  return null;
}

// Preço pela escassez (RF-VIDA-231) --------------------------------------------

/** Valor de referência de cada bem, em unidades de troca (um ouro vale GOLD_VALUE). */
export const BASE_VALUE: Record<Good | 'food', number> = {
  food: 1,
  wood: 1,
  stone: 1,
  clay: 1,
  brick: 2,
  copper: 3,
  tin: 3,
  iron: 3,
  coal: 2,
  gold: B.GOLD_VALUE,
  tools: 4,
  weapons: 6,
  armor: 6,
  jewels: 12,
  wool: 2,
  cloth: 3,
  hides: 2,
  salt: 4,
  wine: 8,
  spice: 14,
  dye: 10,
  silk: 16,
};

/** Necessidade que cada bem atende, para o preço subir quando ela falta. */
export const GOOD_NEED: Partial<Record<Good | 'food', Need>> = {
  food: 'food',
  wood: 'fuel',
  stone: 'material',
  brick: 'material',
  clay: 'material',
  cloth: 'cloth',
  hides: 'cloth',
  wool: 'cloth',
  tools: 'tools',
};

export function isLuxury(g: string): g is Luxury {
  return (LUXURIES as readonly string[]).includes(g);
}

/**
 * Quanto um assentamento paga por uma unidade: o valor do bem vezes a falta
 * que ele sente (estoque vazio vale 2 vezes o normal, cheio vale 0,4), mais
 * caro quando a necessidade ligada está mal atendida e, para o luxo, quando
 * o assentamento é rico.
 */
export function price(good: Good | 'food', have: number, cap: number, needs?: Needs, rich = false): number {
  const fill = cap > 0 ? Math.min(1, Math.max(0, have / cap)) : 1;
  let want = 0;
  const need = GOOD_NEED[good];
  if (need && needs) want = Math.max(0, 0.8 - needs[need]);
  if (rich && isLuxury(good)) want += 0.5;
  return BASE_VALUE[good] * (0.4 + 1.6 * (1 - fill) ** 1.5) * (1 + want);
}

/** Bens que andam nas caravanas: tudo menos o ouro (que é o pagamento) e os cavalos (que puxam). */
export function tradable(g: Good | 'food'): boolean {
  return g !== 'gold';
}

// Moeda por era (RF-VIDA-291) ----------------------------------------------------

export const CURRENCY_NAMES = ['escambo', 'lingotes e anéis de bronze', 'moeda de prata', 'moeda cunhada', 'papel-moeda'] as const;

/**
 * Moeda de uma troca pela era: na Pedra é escambo (bem por bem, sem ouro);
 * no Bronze, lingotes; no Ferro, moeda de prata; na Medieval, moeda cunhada
 * pelo reino que tem casa da moeda; na Industrial, papel. Retorna o índice
 * em CURRENCY_NAMES.
 */
export function currencyOf(era: number, minted: boolean): number {
  if (era <= 0) return 0;
  if (era >= 4) return 4;
  if (era === 3) return minted ? 3 : 2;
  return era;
}

/** Parte do valor que chega como pagamento em cada moeda (o escambo não paga em ouro). */
export const CURRENCY_EFFICIENCY = [0, 0.8, 0.9, 1, 1.1];

// Caravanas (RF-VIDA-230, 236 e 223) ---------------------------------------------

export type PackAnimal = 'donkey' | 'horse' | 'camel';

export interface Cargo {
  good: Good | 'food';
  amount: number;
}

/** Quem viaja com a caravana, guardado como os passageiros dos barcos. */
export interface Crew {
  age: number;
  role: number;
  who?: { uid: number; parent: number; family: number; bornAt: number; bornYear: number; movedAt: number };
}

export interface Caravan {
  id: number;
  /** Comércio, tributo pedido pela capital (RF-VIDA-289) ou rebanho rumo ao pasto alto (RF-VIDA-293). */
  kind: 'trade' | 'tribute' | 'flock';
  home: number;
  /** Assentamento de destino; -1 no pasto. */
  target: number;
  /** Tiles do caminho, da casa ao destino (ao contrário na volta). */
  path: number[];
  step: number;
  x: number;
  y: number;
  facing: number;
  back: boolean;
  /** Animal de carga, ou o bicho do rebanho na transumância. */
  animal: PackAnimal | 'sheep' | 'cattle' | 'goat' | 'horse' | 'camel';
  /** Animais de carga (ou cabeças do rebanho que sobem). */
  animals: number;
  /** 0 só no lombo, 1 carroça, 2 carroção coberto (pela era). */
  cart: number;
  cargo: Cargo[];
  /** Ouro que o comerciante leva para pagar e o que traz de volta. */
  purse: number;
  crew: Crew;
  /** Tiles por segundo. */
  speed: number;
  /** Segundos parado (neve, pasto, feira). */
  wait: number;
  /** Reinos a quem já pagou pedágio nesta viagem. */
  tolls: number[];
  /** Era de quem mandou (calçamento por uso, RF-VIDA-233). */
  era: number;
}

/** Caravanas que um assentamento pode ter na estrada ao mesmo tempo (RF-VIDA-236). */
export function caravanCap(tier: number, mercantile: boolean): number {
  return B.CARAVANS_PER_TIER * (tier >= 2 ? 2 : 1) + (mercantile ? 1 : 0);
}

/** Animal de carga: camelo no deserto, cavalo se houver no estoque, senão burro. */
export function packAnimal(desert: boolean, horses: number): PackAnimal {
  if (desert) return 'camel';
  return horses >= 1 ? 'horse' : 'donkey';
}

/** Veículo pela era: lombo na Pedra, carroça do Bronze ao Ferro, carroção depois. */
export function cartOf(era: number): number {
  return era <= 0 ? 0 : era <= 2 ? 1 : 2;
}

// Acordos (RF-VIDA-232) -------------------------------------------------------------

export interface Agreement {
  /** Ids dos dois assentamentos. */
  a: number;
  b: number;
  /** O que `a` manda e o que `b` manda. */
  goods: [Good | 'food', Good | 'food'];
  since: number;
  until: number;
  /** Uma viagem a cada tantos anos. */
  every: number;
  /** Ano da última viagem entre os dois. */
  last: number;
  kept: number;
}

/** Nome curto de um bem para frases ("madeira por sal"). */
export function goodWord(g: Good | 'food', names: Record<string, string>): string {
  return (names[g] ?? g).toLowerCase();
}
