/**
 * Catálogo de itens que os povos inteligentes fazem e usam (REQUISITOS-VIDA.md,
 * seção 11.2): ferramentas, armas, armaduras e joias, por material. O que sai
 * da ferraria depende do metal que o reino minerou; a Idade da Pedra faz
 * ferramentas de pedra e madeira sem ferraria.
 */

export const MATERIALS = {
  wood: { name: 'madeira', color: [176, 124, 72] },
  stone: { name: 'pedra', color: [150, 150, 158] },
  bronze: { name: 'bronze', color: [214, 150, 70] },
  iron: { name: 'ferro', color: [170, 176, 186] },
  steel: { name: 'aço', color: [206, 222, 240] },
  gold: { name: 'ouro', color: [246, 206, 64] },
} as const;
export type Material = keyof typeof MATERIALS;

export const CATEGORIES = ['ferramenta', 'arma', 'armadura', 'joia'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface ItemDef {
  id: string;
  name: string;
  category: Category;
  /** Ícone 8x8 (art-extra.ts), pintado na cor do material. */
  icon: string;
  material: Material;
  /** Era mínima em que o povo sabe fazer. */
  era: number;
}

/** [nome, categoria, ícone, material, era]. */
const LIST: [string, Category, string, Material, number][] = [
  ['Machado de pedra', 'ferramenta', 'axe', 'stone', 0],
  ['Faca de pedra', 'ferramenta', 'knife', 'stone', 0],
  ['Martelo de pedra', 'ferramenta', 'hammer', 'stone', 0],
  ['Vara de pesca', 'ferramenta', 'fishingRod', 'wood', 0],
  ['Enxada de madeira', 'ferramenta', 'hoe', 'wood', 0],
  ['Lança de pedra', 'arma', 'spear', 'stone', 0],
  ['Arco', 'arma', 'bow', 'wood', 0],
  ['Escudo de madeira', 'armadura', 'shield', 'wood', 0],
  ['Machado de bronze', 'ferramenta', 'axe', 'bronze', 0],
  ['Picareta de bronze', 'ferramenta', 'pickaxe', 'bronze', 0],
  ['Espada de bronze', 'arma', 'sword', 'bronze', 0],
  ['Lança de bronze', 'arma', 'spear', 'bronze', 0],
  ['Escudo de bronze', 'armadura', 'shield', 'bronze', 0],
  ['Elmo de bronze', 'armadura', 'helmet', 'bronze', 1],
  ['Machado de ferro', 'ferramenta', 'axe', 'iron', 1],
  ['Picareta de ferro', 'ferramenta', 'pickaxe', 'iron', 1],
  ['Enxada de ferro', 'ferramenta', 'hoe', 'iron', 1],
  ['Serra de ferro', 'ferramenta', 'saw', 'iron', 2],
  ['Espada de ferro', 'arma', 'sword', 'iron', 1],
  ['Lança de ferro', 'arma', 'spear', 'iron', 1],
  ['Besta', 'arma', 'crossbow', 'iron', 3],
  ['Elmo de ferro', 'armadura', 'helmet', 'iron', 1],
  ['Cota de malha', 'armadura', 'armor', 'iron', 2],
  ['Picareta de aço', 'ferramenta', 'pickaxe', 'steel', 3],
  ['Serra de aço', 'ferramenta', 'saw', 'steel', 3],
  ['Martelo de aço', 'ferramenta', 'hammer', 'steel', 3],
  ['Espada de aço', 'arma', 'sword', 'steel', 3],
  ['Machado de guerra', 'arma', 'axe', 'steel', 3],
  ['Mosquete', 'arma', 'musket', 'steel', 4],
  ['Armadura de placas', 'armadura', 'armor', 'steel', 3],
  ['Elmo de aço', 'armadura', 'helmet', 'steel', 3],
  ['Anel de ouro', 'joia', 'ring', 'gold', 1],
  ['Amuleto', 'joia', 'amulet', 'gold', 1],
  ['Coroa', 'joia', 'crown', 'gold', 2],
];

const id = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ /g, '-');

export const ITEMS: ItemDef[] = LIST.map(([name, category, icon, material, era]) => ({ id: id(name), name, category, icon, material, era }));

export const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/** Material da peça que a ferraria fez (tier de `forge`). */
export const TIER_MATERIAL: Material[] = ['stone', 'bronze', 'iron', 'steel'];

/**
 * Escolhe o item que sai de uma peça de `material` na `category`, entre os
 * que a era já permite (sorteio; o mais avançado tem mais peso).
 */
export function pickItem(material: Material, category: Category, era: number, r: number): ItemDef | null {
  const options = ITEMS.filter((it) => it.material === material && it.category === category && it.era <= era);
  if (!options.length) return null;
  return options[Math.min(options.length - 1, Math.floor(r * options.length))];
}

/** Itens de pedra e madeira da Idade da Pedra (sem ferraria). */
export function pickPrimitive(category: Category, r: number): ItemDef | null {
  const options = ITEMS.filter((it) => (it.material === 'stone' || it.material === 'wood') && it.category === category);
  return options.length ? options[Math.floor(r * options.length)] : null;
}
