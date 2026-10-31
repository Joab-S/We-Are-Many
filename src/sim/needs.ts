import * as B from './balance';
import { GOOD_GROUP, type Good } from './economy';
import type { Role } from './roles';
import type { HerdKind } from './eco/types';

/**
 * Economia local de cada assentamento (REQUISITOS-VIDA.md, seções 19.4 e
 * 19.5): necessidades essenciais, tetos de estoque, retorno decrescente,
 * vocação e o setor de cada profissão. Funções e dados puros; o Ecosystem
 * aplica.
 */

// Necessidades (RF-VIDA-210) ---------------------------------------------------

export const NEEDS = ['food', 'water', 'fuel', 'material', 'cloth', 'tools'] as const;
export type Need = (typeof NEEDS)[number];
export type Needs = Record<Need, number>;

export const NEED_NAMES: Record<Need, string> = {
  food: 'comida',
  water: 'água',
  fuel: 'lenha e madeira',
  material: 'moradia',
  cloth: 'roupa',
  tools: 'ferramentas',
};

export function fullNeeds(): Needs {
  return { food: 1, water: 1, fuel: 1, material: 1, cloth: 1, tools: 1 };
}

/** Atendimento médio das necessidades, de 0 a 1. */
export function welfare(n: Needs): number {
  let s = 0;
  for (const k of NEEDS) s += n[k];
  return s / NEEDS.length;
}

/** Necessidade mais mal atendida (a vocação pesa um pouco, para puxar o trabalho para ela). */
export function worstNeed(n: Needs, favour?: Need): Need {
  let best: Need = 'food';
  let low = Infinity;
  for (const k of NEEDS) {
    if (k === 'water') continue;
    const v = n[k] * (k === favour ? 0.85 : 1);
    if (v < low) {
      low = v;
      best = k;
    }
  }
  return best;
}

// Tetos de estoque (RF-VIDA-218) -----------------------------------------------

/** O que muda o teto de um assentamento. */
export interface CapContext {
  tier: number;
  granary: boolean;
  warehouse: boolean;
  /** Mercado guarda o ouro (tesouro). */
  treasury: boolean;
  mines: number;
}

/** Teto da comida. */
export function foodCap(c: CapContext): number {
  return B.STORE_BASE.food[c.tier] + (c.granary ? B.GRANARY_CAP : 0);
}

/** Teto de um recurso guardado. */
export function goodCap(good: Good, c: CapContext): number {
  const group = GOOD_GROUP[good];
  let cap = B.STORE_BASE[group][c.tier];
  if (group === 'material' && c.warehouse) cap += B.WAREHOUSE_CAP;
  if (group === 'ore') cap += c.mines * B.MINE_STORE_CAP;
  if (group === 'gold' && c.treasury) cap += B.TREASURY_CAP;
  return cap;
}

/**
 * Retorno decrescente (RF-VIDA-219b): a produção cai à medida que o estoque
 * se aproxima do teto, como a natalidade logística, e para no teto.
 */
export function room(amount: number, cap: number): number {
  if (cap <= 0) return 0;
  const fill = Math.min(1, Math.max(0, amount / cap));
  return 1 - fill ** B.DIMINISHING;
}

// Vocação (RF-VIDA-220 a 224) ----------------------------------------------------

export const VOCATIONS = ['agricola', 'gado', 'ovelhas', 'cavalos', 'pesqueira', 'mercantil', 'mineira', 'madeireira'] as const;
export type Vocation = (typeof VOCATIONS)[number];

export const VOCATION_NAMES: Record<Vocation, string> = {
  agricola: 'Agrícola',
  gado: 'Gado',
  ovelhas: 'Ovelhas',
  cavalos: 'Cavalos',
  pesqueira: 'Pesqueira',
  mercantil: 'Mercantil',
  mineira: 'Mineira',
  madeireira: 'Madeireira',
};

/** Ícone simples do rótulo e do painel (RF-VIDA-224). */
export const VOCATION_ICONS: Record<Vocation, string> = {
  agricola: '🌾',
  gado: '🐄',
  ovelhas: '🐑',
  cavalos: '🐎',
  pesqueira: '🐟',
  mercantil: '⚖️',
  mineira: '⛏️',
  madeireira: '🪓',
};

/** Cor da camada "Vocação" do mapa. */
export const VOCATION_COLORS: Record<Vocation, [number, number, number]> = {
  agricola: [232, 200, 70],
  gado: [170, 110, 60],
  ovelhas: [235, 235, 225],
  cavalos: [200, 120, 50],
  pesqueira: [70, 150, 230],
  mercantil: [190, 90, 210],
  mineira: [140, 140, 150],
  madeireira: [60, 150, 70],
};

/** Profissão que a vocação puxa, a necessidade que ela atende e o prédio característico. */
export const VOCATION_ROLE: Record<Vocation, Role> = {
  agricola: 'farmer',
  gado: 'shepherd',
  ovelhas: 'shepherd',
  cavalos: 'horsekeeper',
  pesqueira: 'fisher',
  mercantil: 'merchant',
  mineira: 'miner',
  madeireira: 'woodcutter',
};

export const VOCATION_NEED: Record<Vocation, Need | undefined> = {
  agricola: 'food',
  gado: 'food',
  ovelhas: 'cloth',
  cavalos: undefined,
  pesqueira: 'food',
  mercantil: undefined,
  mineira: 'tools',
  madeireira: 'fuel',
};

export const VOCATION_BUILDING: Record<Vocation, string> = {
  agricola: 'windmill',
  gado: 'corral',
  ovelhas: 'loom',
  cavalos: 'stable',
  pesqueira: 'port',
  mercantil: 'warehouse',
  mineira: 'smithy',
  madeireira: 'sawmill',
};

/** O que o lugar oferece para cada vocação, medido numa amostra de tiles em volta. */
export interface SiteSample {
  /** Médias de 0 a 1. */
  fertile: number;
  open: number;
  hills: number;
  cold: number;
  dry: number;
  forest: number;
  /** Tem costa, jazida conhecida por perto, estradas ou vizinhos (cruzamento). */
  coast: boolean;
  deposits: number;
  roads: number;
  /** Valor do povo. */
  value: string;
}

/** Peso de cada vocação pelo lugar e pelo povo (RF-VIDA-220). */
export function vocationWeights(s: SiteSample): Record<Vocation, number> {
  return {
    agricola: 0.3 + 1.6 * s.fertile * (1 - s.dry),
    gado: 0.15 + 1.3 * s.open * (1 - s.dry) * (1 - s.cold * 0.5),
    ovelhas: 0.15 + 1.0 * s.hills + 0.8 * s.cold * s.open,
    cavalos: (0.1 + 1.4 * s.open * s.dry) * (s.value === 'guerra' ? 1.8 : 1),
    pesqueira: s.coast ? 1.1 : 0,
    mercantil: (0.1 + 0.25 * Math.min(4, s.roads) + (s.coast ? 0.2 : 0)) * (s.value === 'comércio' ? 2 : 1),
    mineira: 0.05 + 0.9 * s.hills * 0.5 + 0.5 * Math.min(2, s.deposits),
    madeireira: 0.1 + 1.6 * s.forest,
  };
}

/** Sorteia a vocação pelos pesos; `except` fica de fora (troca de vocação). */
export function pickVocation(weights: Record<Vocation, number>, r: number, except?: Vocation): Vocation {
  let total = 0;
  for (const v of VOCATIONS) if (v !== except) total += Math.max(0, weights[v]);
  let x = r * total;
  for (const v of VOCATIONS) {
    if (v === except) continue;
    x -= Math.max(0, weights[v]);
    if (x <= 0) return v;
  }
  return VOCATIONS.find((v) => v !== except)!;
}

// Setores do trabalho (RF-VIDA-214) -----------------------------------------------

/** Necessidade que cada profissão atende (as que não aparecem não mudam de setor). */
export const ROLE_NEED: Partial<Record<Role, Need>> = {
  gatherer: 'food',
  hunter: 'food',
  farmer: 'food',
  fisher: 'food',
  miller: 'food',
  shepherd: 'food',
  woodcutter: 'fuel',
  builder: 'material',
  potter: 'material',
  weaver: 'cloth',
  miner: 'tools',
  blacksmith: 'tools',
};

/** O que o assentamento tem, para escolher quem atende uma necessidade. */
export interface WorkContext {
  era: number;
  fields: boolean;
  port: boolean;
  herd: boolean;
  loom: boolean;
  pottery: boolean;
  smithy: boolean;
  vocation?: Vocation;
}

/** Profissão que passa a atender a necessidade que está faltando. */
export function roleFor(need: Need, c: WorkContext): Role {
  const voc = c.vocation ? VOCATION_ROLE[c.vocation] : undefined;
  switch (need) {
    case 'food':
      if (voc === 'fisher' && c.port) return 'fisher';
      if (voc === 'shepherd' && c.herd) return 'shepherd';
      // Roça plantada pede agricultor desde a Idade da Pedra (seção 19.19; antes só do Bronze em diante).
      if (c.fields) return 'farmer';
      if (c.port) return 'fisher';
      return c.era === 0 ? 'gatherer' : 'hunter';
    case 'fuel':
      return 'woodcutter';
    case 'material':
      return c.pottery && voc !== 'woodcutter' ? 'potter' : 'builder';
    case 'cloth':
      if (c.loom) return 'weaver';
      if (c.herd) return 'shepherd';
      return c.era === 0 ? 'gatherer' : 'hunter';
    case 'tools':
      return c.smithy ? 'blacksmith' : 'miner';
    case 'water':
      return 'builder';
  }
}

// Estações (RF-VIDA-290) ------------------------------------------------------------

export const SEASONS = ['primavera', 'verão', 'outono', 'inverno'] as const;

/** Estação pela fração do ano (0 a 1). */
export function seasonOf(phase: number): number {
  return Math.min(3, Math.max(0, Math.floor(phase * 4)));
}

/** Frases da crônica quando a vocação muda (RF-VIDA-222): "deixou as minas e passou a criar ovelhas". */
export const VOCATION_LEAVE: Record<Vocation, string> = {
  agricola: 'as roças',
  gado: 'o gado',
  ovelhas: 'as ovelhas',
  cavalos: 'os cavalos',
  pesqueira: 'a pesca',
  mercantil: 'o comércio',
  mineira: 'as minas',
  madeireira: 'o corte de madeira',
};
export const VOCATION_TAKE: Record<Vocation, string> = {
  agricola: 'plantar',
  gado: 'criar gado',
  ovelhas: 'criar ovelhas',
  cavalos: 'criar cavalos',
  pesqueira: 'pescar',
  mercantil: 'comerciar',
  mineira: 'minerar',
  madeireira: 'cortar madeira',
};

/**
 * Animal que um assentamento domestica (RF-VIDA-215), entre os que a fauna selvagem da região pode dar (`wild`,
 * as formas de curral dos bichos domesticáveis por perto, Diamond): primeiro o da vocação, depois o que o lugar
 * pede (camelo no deserto seco, carneiro no frio e no morro, cavalo no campo seco, gado no campo aberto, cabra no
 * resto) e, faltando esse, o primeiro que houver. Sem nenhum domesticável na região, nada (null).
 */
export function herdFor(vocation: Vocation | undefined, s: Pick<SiteSample, 'cold' | 'dry' | 'hills' | 'open'>, desert: boolean, wild: readonly HerdKind[]): HerdKind | null {
  if (!wild.length) return null;
  const want: HerdKind[] = [];
  if (vocation === 'ovelhas') want.push('sheep');
  if (vocation === 'gado') want.push('cattle');
  if (vocation === 'cavalos') want.push(desert ? 'camel' : 'horse', desert ? 'horse' : 'camel');
  if (desert) want.push(s.dry > 0.6 ? 'camel' : 'goat');
  else if (s.cold > 0.5 || s.hills > 0.5) want.push('sheep');
  else if (s.dry > 0.5) want.push(s.open > 0.5 ? 'horse' : 'goat');
  else want.push(s.open > 0.4 ? 'cattle' : 'goat');
  return want.find((k) => wild.includes(k)) ?? wild[0];
}
