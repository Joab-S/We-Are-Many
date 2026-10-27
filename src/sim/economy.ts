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

/**
 * Estoque de um assentamento (RF-VIDA-212): cada um guarda só o que é seu, e
 * um bem só muda de lugar carregado (carroça, colonos, saque, comércio).
 * A comida fica em `Village.food`.
 */
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
  /** Barro e tijolo da olaria, lã das ovelhas, roupa do tear, peles e couro, cavalos do haras (seção 19.4). */
  clay: number;
  brick: number;
  wool: number;
  cloth: number;
  hides: number;
  horses: number;
  /** Bens de luxo da região (RF-VIDA-282): sal, vinho, especiarias, tinta e seda. */
  salt: number;
  wine: number;
  spice: number;
  dye: number;
  silk: number;
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
  return { wood: 30, stone: 0, copper: 0, tin: 0, iron: 0, gold: 0, coal: 0, tools: 0, weapons: 0, weaponTier: 0, armor: 0, armorTier: 0, jewels: 0, clay: 0, brick: 0, wool: 0, cloth: 0, hides: 0, horses: 0, salt: 0, wine: 0, spice: 0, dye: 0, silk: 0, items: {} };
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
  ['clay', 'Barro'],
  ['brick', 'Tijolo'],
  ['wool', 'Lã'],
  ['cloth', 'Roupa'],
  ['hides', 'Peles'],
  ['horses', 'Cavalos'],
  ['salt', 'Sal'],
  ['wine', 'Vinho'],
  ['spice', 'Especiarias'],
  ['dye', 'Tinta'],
  ['silk', 'Seda'],
];

/** Recursos guardados (fora a comida), cada um com o grupo do seu teto (STORE_BASE em balance.ts). */
export const GOODS = ['wood', 'stone', 'clay', 'brick', 'copper', 'tin', 'iron', 'coal', 'gold', 'tools', 'weapons', 'armor', 'jewels', 'wool', 'cloth', 'hides', 'salt', 'wine', 'spice', 'dye', 'silk'] as const;
export type Good = (typeof GOODS)[number];
export const GOOD_GROUP: Record<Good, 'material' | 'ore' | 'goods' | 'gold' | 'luxury'> = {
  wood: 'material',
  stone: 'material',
  clay: 'material',
  brick: 'material',
  copper: 'ore',
  tin: 'ore',
  iron: 'ore',
  coal: 'ore',
  gold: 'gold',
  tools: 'goods',
  weapons: 'goods',
  armor: 'goods',
  jewels: 'goods',
  wool: 'goods',
  cloth: 'goods',
  hides: 'goods',
  salt: 'luxury',
  wine: 'luxury',
  spice: 'luxury',
  dye: 'luxury',
  silk: 'luxury',
};

/**
 * Condições de referência por etapa material (mantido para consulta e testes;
 * na evolução orgânica, cobre sozinho também conta como trabalho em bronze/cobre).
 */
export const ERA_NEEDS: { text: string; met: (m: Made) => boolean }[] = [
  { text: 'trabalhar cobre ou bronze numa ferraria', met: (m) => m.bronze >= 2 },
  { text: 'forjar peças de ferro', met: (m) => m.iron >= 4 },
  { text: 'extrair pedra e dominar forja de ferro', met: (m) => m.stone >= 40 && m.iron >= 12 },
  { text: 'extrair carvão e forjar aço', met: (m) => m.coal >= 20 && m.steel >= 4 },
];

/**
 * Resultado de um ferreiro trabalhar um ano: o metal que gasta e a peça que faz.
 * Respeita a sequência física: aço pede ferro + carvão; ferro pede domínio da
 * siderurgia (`era >= 1` ou técnica de fundição de ferro); cobre/bronze pode ser
 * forjado com cobre + estanho (liga de bronze, gasta 2 cobre + 1 estanho) ou só
 * com cobre (cobre batido, gasta 2 cobre) ou estanho, sem travar a civilização
 * quando falta um dos dois minérios na região.
 */
export function forge(stock: Stock, era: number, techs?: ReadonlySet<string>): { tier: number; kind: 'bronze' | 'iron' | 'steel' } | null {
  const canSteel = techs ? techs.has('aco') : era >= 3;
  const canIron = techs ? techs.has('siderurgia') : era >= 1;
  const canBronze = techs ? techs.has('fundicao') || era >= 1 : true;
  if (canSteel && stock.iron >= 2 && stock.coal >= 1) {
    stock.iron -= 2;
    stock.coal -= 1;
    return { tier: 3, kind: 'steel' };
  }
  if (canIron && stock.iron >= 2) {
    stock.iron -= 2;
    return { tier: 2, kind: 'iron' };
  }
  if (canBronze && stock.copper >= 2 && stock.tin >= 1) {
    stock.copper -= 2;
    stock.tin -= 1;
    return { tier: 1, kind: 'bronze' };
  }
  if (techs && canBronze && stock.copper >= 2) {
    stock.copper -= 2;
    return { tier: 1, kind: 'bronze' };
  }
  if (techs && canBronze && stock.tin >= 2) {
    stock.tin -= 2;
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
