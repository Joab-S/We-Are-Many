/**
 * Tipos de construção num lugar só (padrão Type Object, Game Programming Patterns): cada tipo diz o
 * nome, se é uma construção especial (e em que ordem o assentamento costuma erguê-la), a regra para
 * poder construir, o custo em cada era e quanta gente abriga. Antes isso estava espalhado em cinco
 * lugares (a lista `BUILDINGS`, a tabela de nomes, o `switch` de `canBuild`, `buildCost` em
 * economy.ts e a moradia em `housing`); as funções antigas continuam e agora leem daqui.
 *
 * Sem estado e sem dependência do Ecosystem: só tipos e `balance.ts`.
 */

import * as B from './balance';
import type { BuildContext } from './eco/types';

/** Construções especiais, na ordem em que um assentamento costuma erguê-las (a ordem de `nextBuilding` e da planta). */
export const BUILDINGS = [
  'granary',
  'smithy',
  'market',
  'warehouse',
  'pottery',
  'windmill',
  'loom',
  'corral',
  'stable',
  'sawmill',
  'temple',
  'barracks',
  'factory',
  'aqueduct',
  'statue',
  'wonder',
] as const;

export type SpecialBuilding = (typeof BUILDINGS)[number];
export type BuildingKind = 'house' | 'port' | SpecialBuilding;

export interface BuildCost {
  wood: number;
  stone: number;
  gold: number;
}

export interface BuildingType {
  /** Nome na interface e na crônica. */
  readonly name: string;
  /** Se o assentamento já pode erguer (era, nível, técnicas, cultura e vocação). Casa e porto têm regra própria e respondem sempre que não. */
  readonly canBuild: (c: BuildContext) => boolean;
  /** Custo em madeira, pedra e ouro na era (`Math.floor(v.tech)`); um objeto novo a cada chamada. */
  readonly cost: (era: number) => BuildCost;
  /** Gente que a construção abriga, pela era, pelos andares a mais e se a casa está vazia (sem dono). */
  readonly housing: (era: number, level: number, empty: boolean) => number;
}

const never = (): boolean => false;
/** O custo comum das construções especiais: madeira e um pouco de pedra (mais pedra da Idade do Ferro em diante). */
const special = (era: number): BuildCost => ({ wood: 10, stone: era >= 2 ? 8 : 2, gold: 0 });
/** Quem trabalha numa construção especial também dorme nela (dois). */
const two = (): number => 2;

/**
 * A tabela. As regras de `canBuild` são as do antigo `switch` de helpers.ts: a ferraria só faz sentido
 * com metal no estoque, a cultura adianta templos e mercados, a vocação adianta o prédio característico
 * (RF-VIDA-221).
 */
export const BUILDING_TYPES: Readonly<Record<BuildingKind, BuildingType>> = {
  house: {
    name: 'Casa',
    canBuild: never,
    cost: (era) => (era >= 3 ? { wood: 1, stone: 4, gold: 0 } : { wood: 4, stone: 0, gold: 0 }),
    housing: (era, level, empty) => (empty ? 0 : 4 + era + level * B.LEVEL_HOUSING),
  },
  // O porto traz cais, armazéns e casas de pescadores: a costa com porto é mais densa (bioma e sociedade).
  port: { name: 'Porto', canBuild: never, cost: () => ({ wood: 12, stone: 0, gold: 0 }), housing: (era) => B.PORT_HOUSING + era },
  granary: { name: 'Celeiro', canBuild: (c) => c.era >= 1 || c.techs.has('ceramica') || c.tier >= 1, cost: special, housing: two },
  smithy: { name: 'Ferraria', canBuild: (c) => c.metal && (c.techs.has('fundicao') || c.era >= 1), cost: special, housing: two },
  market: { name: 'Mercado', canBuild: (c) => c.tier >= 1 || c.culture.value === 'comércio', cost: special, housing: two },
  // Economia local (RF-VIDA-211 e 216).
  warehouse: { name: 'Armazém', canBuild: (c) => c.tier >= 2 || (c.tier >= 1 && c.vocation === 'mercantil'), cost: special, housing: two },
  pottery: { name: 'Olaria', canBuild: (c) => c.clay && c.techs.has('ceramica'), cost: special, housing: two },
  windmill: { name: 'Moinho', canBuild: (c) => c.techs.has('moinho') && (c.tier >= 1 || c.vocation === 'agricola'), cost: special, housing: two },
  loom: { name: 'Tear', canBuild: (c) => c.techs.has('tecelagem') && (c.herd === 'sheep' || c.herd === 'goat' || c.vocation === 'ovelhas'), cost: special, housing: two },
  corral: { name: 'Curral', canBuild: (c) => c.herd === 'cattle' || c.herd === 'goat', cost: special, housing: two },
  stable: { name: 'Haras', canBuild: (c) => c.techs.has('montaria') && (c.herd === 'horse' || c.herd === 'camel'), cost: special, housing: two },
  sawmill: { name: 'Serraria', canBuild: (c) => (c.era >= 1 || c.techs.has('fundicao')) && (c.vocation === 'madeireira' || (c.tier >= 2 && c.forest > 0.55)), cost: special, housing: two },
  temple: { name: 'Templo', canBuild: (c) => (c.culture.value === 'fé' ? c.era >= 1 || c.tier >= 1 : c.era >= 2 && c.tier >= 1), cost: special, housing: two },
  barracks: { name: 'Quartel', canBuild: (c) => (c.era >= 2 || c.techs.has('siderurgia')) && c.tier >= 2, cost: special, housing: two },
  factory: { name: 'Fábrica', canBuild: (c) => c.tier >= 2 && c.techs.has('vapor'), cost: special, housing: two },
  // Saneamento da metrópole (RF-VIDA-284).
  aqueduct: { name: 'Aqueduto', canBuild: (c) => (c.era >= 2 || c.techs.has('irrigacao')) && c.tier >= 3, cost: () => ({ wood: 6, stone: 30, gold: 2 }), housing: two },
  // Capitais ricas erguem monumentos: estátua do líder e a grande obra do povo.
  statue: { name: 'Estátua', canBuild: (c) => c.capital && c.era >= 2 && c.tier >= 2, cost: () => ({ wood: 0, stone: 30, gold: 3 }), housing: two },
  wonder: { name: 'Grande obra', canBuild: (c) => c.capital && c.era >= 3 && c.tier >= 2, cost: () => ({ wood: 40, stone: 120, gold: 8 }), housing: two },
};

/** Tipo genérico para um nome fora da tabela (save antigo): custo e moradia de construção especial, nunca construível. */
const UNKNOWN: BuildingType = { name: 'Obra', canBuild: never, cost: special, housing: two };

/** O tipo de uma construção pelo nome (`Building.kind`); um nome desconhecido cai no tipo genérico. */
export function buildingType(kind: string): BuildingType {
  return (BUILDING_TYPES as Record<string, BuildingType | undefined>)[kind] ?? UNKNOWN;
}
