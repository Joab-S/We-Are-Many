import { Biome, type SurfaceMap } from '../procgen/surface';

/**
 * Economia dos povos inteligentes (REQUISITOS-VIDA.md, seções 11 e 11.1):
 * minérios limitados em cavernas e veios, estoques do reino, o que os
 * ferreiros produzem com o que foi minerado e as condições para mudar de era.
 * Funções e dados puros; o Ecosystem aplica.
 */

export const ORES = ['copper', 'tin', 'iron', 'gold', 'coal'] as const;
export type Ore = (typeof ORES)[number];

export const ORE_NAMES: Record<Ore, string> = {
  copper: 'cobre',
  tin: 'estanho',
  iron: 'ferro',
  gold: 'ouro',
  coal: 'carvão',
};

/** Cor dos pontos de minério nos sprites de caverna, veio e mina. */
export const ORE_COLORS: Record<Ore, [number, number, number]> = {
  copper: [222, 124, 62],
  tin: [206, 214, 226],
  iron: [176, 82, 56],
  gold: [246, 206, 64],
  coal: [44, 44, 52],
};

/** Chance de cada minério numa jazida e a faixa de quantidade (unidades). */
const ORE_TABLE: { ore: Ore; weight: number; min: number; max: number }[] = [
  { ore: 'copper', weight: 0.3, min: 80, max: 200 },
  { ore: 'tin', weight: 0.2, min: 40, max: 120 },
  { ore: 'iron', weight: 0.28, min: 90, max: 220 },
  { ore: 'gold', weight: 0.1, min: 30, max: 80 },
  { ore: 'coal', weight: 0.2, min: 100, max: 260 },
];

export interface Deposit {
  id: number;
  x: number;
  y: number;
  ore: Ore;
  /** Unidades que ainda restam; acabam com a mineração. */
  amount: number;
  initial: number;
  /** Caverna (entrada na rocha) ou veio na superfície. */
  cave: boolean;
  /** Assentamento que explora a mina, ou -1. */
  mine: number;
  /** Reinos (id da capital) que já conhecem a jazida. */
  known: Set<number>;
}

/** Bom lugar para uma jazida: rocha, montanha ou colina. */
function rocky(map: SurfaceMap, i: number): number {
  const b = map.biome[i] as Biome;
  if (b === Biome.Mountain || b === Biome.Rock) return 1;
  if (map.elevation[i] > 0.3 && b !== Biome.Snow && b !== Biome.Ice && b !== Biome.Lava) return 0.5;
  return 0;
}

/** Sorteia o minério de uma jazida. */
export function pickOre(r: number): (typeof ORE_TABLE)[number] {
  let x = r * ORE_TABLE.reduce((n, o) => n + o.weight, 0);
  for (const o of ORE_TABLE) {
    x -= o.weight;
    if (x <= 0) return o;
  }
  return ORE_TABLE[0];
}

/** Espalha jazidas pelo planeta, em rocha e colinas, de forma determinística. */
export function generateDeposits(map: SurfaceMap, rnd: () => number): Deposit[] {
  const n = map.width * map.height;
  let land = 0;
  for (let i = 0; i < n; i += 16) if (map.elevation[i] >= 0) land += 16;
  const target = Math.round(land / 2200);
  const out: Deposit[] = [];
  for (let t = 0; t < target * 40 && out.length < target; t++) {
    const i = Math.floor(rnd() * n);
    const r = rocky(map, i);
    if (!r || rnd() > r) continue;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    if (out.some((d) => Math.abs(d.x - x) + Math.abs(d.y - y) < 6)) continue;
    const kind = pickOre(rnd());
    const amount = Math.round(kind.min + rnd() * (kind.max - kind.min));
    out.push({ id: out.length, x, y, ore: kind.ore, amount, initial: amount, cave: rnd() < 0.6, mine: -1, known: new Set() });
  }
  return out;
}

/** Estoque de um reino (guardado na capital). */
export interface Stock {
  wood: number;
  stone: number;
  copper: number;
  tin: number;
  iron: number;
  gold: number;
  coal: number;
  /** Ferramentas e armas prontas, feitas pelos ferreiros. */
  tools: number;
  weapons: number;
  /** Melhor metal das armas: 0 pedra, 1 bronze, 2 ferro, 3 aço. */
  weaponTier: number;
  /** Armaduras (escudos, elmos, cotas) e o melhor metal delas. */
  armor: number;
  armorTier: number;
  /** Joias de ouro (anéis, amuletos, coroas). */
  jewels: number;
  /** Quantos de cada item do catálogo (items.ts) o reino tem. */
  items: Record<string, number>;
}

/** O que o reino já produziu ao longo da história (condições de era). */
export interface Made {
  bronze: number;
  iron: number;
  steel: number;
  stone: number;
  coal: number;
}

export function emptyStock(): Stock {
  return { wood: 30, stone: 0, copper: 0, tin: 0, iron: 0, gold: 0, coal: 0, tools: 0, weapons: 0, weaponTier: 0, armor: 0, armorTier: 0, jewels: 0, items: {} };
}

export function emptyMade(): Made {
  return { bronze: 0, iron: 0, steel: 0, stone: 0, coal: 0 };
}

export const STOCK_NAMES: [Exclude<keyof Stock, 'items'>, string][] = [
  ['wood', 'Madeira'],
  ['stone', 'Pedra'],
  ['copper', 'Cobre'],
  ['tin', 'Estanho'],
  ['iron', 'Ferro'],
  ['coal', 'Carvão'],
  ['gold', 'Ouro'],
  ['tools', 'Ferramentas'],
  ['weapons', 'Armas'],
  ['armor', 'Armaduras'],
  ['jewels', 'Joias'],
];

/**
 * Condição para sair de cada era, além do conhecimento acumulado: não basta
 * o tempo passar, o povo precisa ter achado e trabalhado os minérios.
 */
export const ERA_NEEDS: { text: string; met: (m: Made) => boolean }[] = [
  { text: 'fazer 5 peças de bronze (cobre + estanho e uma ferraria)', met: (m) => m.bronze >= 5 },
  { text: 'fazer 8 peças de ferro', met: (m) => m.iron >= 8 },
  { text: 'extrair 120 de pedra e fazer 30 peças de ferro', met: (m) => m.stone >= 120 && m.iron >= 30 },
  { text: 'extrair 60 de carvão e fazer 10 peças de aço', met: (m) => m.coal >= 60 && m.steel >= 10 },
];

/** Resultado de um ferreiro trabalhar um ano: o metal que gasta e a peça que faz. */
export function forge(stock: Stock, era: number): { tier: number; kind: 'bronze' | 'iron' | 'steel' } | null {
  if (era >= 3 && stock.iron >= 2 && stock.coal >= 1) {
    stock.iron -= 2;
    stock.coal -= 1;
    return { tier: 3, kind: 'steel' };
  }
  if (era >= 1 && stock.iron >= 2) {
    stock.iron -= 2;
    return { tier: 2, kind: 'iron' };
  }
  if (stock.copper >= 2 && stock.tin >= 1) {
    stock.copper -= 2;
    stock.tin -= 1;
    return { tier: 1, kind: 'bronze' };
  }
  return null;
}

/** Custo de cada construção em madeira, pedra e ouro. */
export function buildCost(kind: string, era: number): { wood: number; stone: number; gold: number } {
  if (kind === 'house') return era >= 3 ? { wood: 1, stone: 4, gold: 0 } : { wood: 4, stone: 0, gold: 0 };
  if (kind === 'reform') return era >= 3 ? { wood: 1, stone: 3, gold: 0 } : { wood: 3, stone: era >= 2 ? 1 : 0, gold: 0 };
  if (kind === 'aqueduct') return { wood: 6, stone: 30, gold: 2 };
  if (kind === 'port') return { wood: 12, stone: 0, gold: 0 };
  if (kind === 'mine') return { wood: 6, stone: 0, gold: 0 };
  if (kind === 'wonder') return { wood: 40, stone: 120, gold: 8 };
  if (kind === 'statue') return { wood: 0, stone: 30, gold: 3 };
  return { wood: 10, stone: era >= 2 ? 8 : 2, gold: 0 };
}

/** Nome da grande obra de cada povo, pelo valor da cultura. */
export const WONDER_NAMES: Record<Value, string> = {
  guerra: 'Grande Arena',
  comércio: 'Grande Bazar',
  fé: 'Catedral',
  conhecimento: 'Grande Biblioteca',
};

// Culturas ------------------------------------------------------------------

export const VALUES = ['guerra', 'comércio', 'fé', 'conhecimento'] as const;
export type Value = (typeof VALUES)[number];

const BELIEFS = ['o Sol', 'a Lua', 'o Mar', 'a Montanha', 'os Ancestrais', 'a Luz no Céu', 'a Floresta', 'as Estrelas'];
const SUFFIXES = ['anos', 'enses', 'itas', 'eses', 'inos'];

/** Povo: nome, valor principal, tolerância a outros povos e crença. */
export interface Culture {
  id: number;
  name: string;
  value: Value;
  /** 0 desconfiado, 1 acolhedor. */
  tolerance: number;
  belief: string;
}

export function makeCulture(id: number, founder: string, rnd: () => number): Culture {
  const base = founder.replace(/[aeiou]$/, '');
  return {
    id,
    name: base + SUFFIXES[Math.floor(rnd() * SUFFIXES.length)],
    value: VALUES[Math.floor(rnd() * VALUES.length)],
    tolerance: Math.round(rnd() * 100) / 100,
    belief: BELIEFS[Math.floor(rnd() * BELIEFS.length)],
  };
}
