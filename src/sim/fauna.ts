import { Biome } from '../procgen/biomes';
import type { Species, SpeciesKind } from './species';

/**
 * Molde comum da fauna (docs/REFATORACAO-ECOSSISTEMA.md): toda espécie, da Terra ou
 * alienígena, é descrita pelos mesmos campos de ecologia, todos medidos por ano. A Terra
 * escreve os seus à mão (por sprite); os alienígenas recebem os do gerador em `Species.eco`;
 * quem não tem nenhum dos dois usa os padrões do tipo.
 */

/** Papel no ecossistema. */
export type Guild =
  | 'pastador'
  | 'ramoneador'
  | 'frugívoro'
  | 'onívoro'
  | 'predador'
  | 'necrófago'
  | 'insetívoro'
  | 'piscívoro'
  | 'detritívoro'
  | 'cardume'
  | 'filtrador'
  | 'sapiente';

export interface Ecology {
  guild: Guild;
  /** Massa do adulto (kg): define densidade, ração e quem pode caçá-lo. */
  mass: number;
  /** Pesos de cada comida (0 a 1). */
  forage: number;
  meat: number;
  carrion: number;
  fish: number;
  insects: number;
  plankton: number;
  /** Maior presa que caça sozinho (kg); em bando, `pack` vezes isso. */
  maxPrey: number;
  /** Caça em grupo (matilha, bando de leões). */
  pack: boolean;
  /** Tamanho típico máximo do bando. */
  herd: number;
  /** Raio da área de vida (tiles). */
  range: number;
  /** Tiles por ano andando com destino (velocidade de viagem). */
  roam: number;
  /** Crias por adulto por ano, na estação de reprodução. */
  litter: number;
  /** Reproduz só na primavera (a maioria dos bichos de terra). */
  seasonal: boolean;
  /** Faixas de umidade e de altitude (0 a 1) onde vive bem. */
  moist: [number, number];
  alt: [number, number];
  /** Afinidade por bioma (0 a 1); bioma ausente vale `open`. */
  biomes: Partial<Record<Biome, number>>;
  open: number;
  /** Quão cedo foge de um predador (0 corajoso, 1 assustadiço). */
  fear: number;
  /** Derruba árvores ao comer e abre clareiras (elefante). */
  engineer: boolean;
  /** Dorme no inverno: gasta pouco e não procura comida. */
  hibernate: boolean;
  /** Parasita típico, mostrado na ficha. */
  parasite: string;
}

const B = Biome;
const FOREST = { [B.Forest]: 1, [B.Taiga]: 0.9, [B.Jungle]: 0.8, [B.Swamp]: 0.6, [B.Grass]: 0.5, [B.Savanna]: 0.3 };
const OPEN = { [B.Grass]: 1, [B.Savanna]: 0.9, [B.Tundra]: 0.5, [B.Forest]: 0.4, [B.Desert]: 0.3 };
const COLD = { [B.Tundra]: 1, [B.Taiga]: 0.8, [B.Snow]: 0.3, [B.Grass]: 0.4, [B.Rock]: 0.4 };
const DRY = { [B.Desert]: 1, [B.Savanna]: 0.8, [B.Barren]: 0.5, [B.Grass]: 0.3 };
const HOT_WET = { [B.Jungle]: 1, [B.Mangrove]: 0.8, [B.Swamp]: 0.7, [B.Forest]: 0.4, [B.Savanna]: 0.3 };
const SAVANNA = { [B.Savanna]: 1, [B.Grass]: 0.7, [B.Jungle]: 0.4, [B.Desert]: 0.3 };
const HIGH = { [B.Rock]: 1, [B.Mountain]: 0.9, [B.Cliff]: 0.8, [B.Tundra]: 0.6, [B.Grass]: 0.3, [B.Taiga]: 0.4 };
const WET = { [B.Swamp]: 1, [B.Mangrove]: 1, [B.Beach]: 0.8, [B.Jungle]: 0.5, [B.Forest]: 0.4, [B.Grass]: 0.4 };
const ANY = { [B.Grass]: 1, [B.Forest]: 0.9, [B.Savanna]: 0.8, [B.Taiga]: 0.7, [B.Jungle]: 0.6, [B.Swamp]: 0.5, [B.Tundra]: 0.5, [B.Desert]: 0.4, [B.Rock]: 0.4 };
const COAST = { [B.Beach]: 1, [B.Mangrove]: 1, [B.Swamp]: 0.8, [B.Cliff]: 0.6, [B.Ice]: 0.6, [B.Snow]: 0.4 };

type Row = Partial<Ecology> & Pick<Ecology, 'guild' | 'mass'>;

/** Ecologia das espécies da Terra, pelo desenho (o sprite identifica a espécie). */
const EARTH: Record<string, Row> = {
  rabbit: { guild: 'pastador', mass: 2, herd: 6, range: 6, roam: 30, litter: 3, fear: 0.9, biomes: { ...OPEN, [B.Forest]: 0.6 }, parasite: 'pulgas' },
  deer: { guild: 'ramoneador', mass: 80, herd: 8, range: 10, roam: 55, litter: 0.9, fear: 0.8, biomes: FOREST, parasite: 'carrapatos' },
  bison: { guild: 'pastador', mass: 700, herd: 12, range: 18, roam: 70, litter: 0.45, fear: 0.3, biomes: OPEN, moist: [0.2, 0.8], parasite: 'vermes' },
  camel: { guild: 'pastador', mass: 500, herd: 6, range: 18, roam: 60, litter: 0.35, fear: 0.4, biomes: DRY, moist: [0, 0.5], parasite: 'carrapatos' },
  zebra: { guild: 'pastador', mass: 250, herd: 10, range: 20, roam: 80, litter: 0.5, fear: 0.7, biomes: SAVANNA, parasite: 'carrapatos' },
  elephant: { guild: 'pastador', mass: 4000, herd: 6, range: 22, roam: 70, litter: 0.2, fear: 0.1, biomes: SAVANNA, engineer: true, parasite: 'vermes' },
  mammoth: { guild: 'pastador', mass: 5000, herd: 6, range: 22, roam: 60, litter: 0.2, fear: 0.1, biomes: COLD, engineer: true, parasite: 'vermes' },
  reindeer: { guild: 'pastador', mass: 100, herd: 10, range: 22, roam: 90, litter: 0.8, fear: 0.7, biomes: COLD, parasite: 'moscas-do-berne' },
  ibex: { guild: 'pastador', mass: 70, herd: 8, range: 10, roam: 45, litter: 0.8, fear: 0.6, biomes: HIGH, alt: [0.3, 0.75], parasite: 'carrapatos' },
  goat: { guild: 'pastador', mass: 50, herd: 8, range: 10, roam: 45, litter: 1, fear: 0.6, biomes: HIGH, alt: [0.15, 0.75], parasite: 'carrapatos' },
  sheep: { guild: 'pastador', mass: 60, herd: 10, range: 10, roam: 40, litter: 1, fear: 0.8, biomes: OPEN, parasite: 'vermes' },
  llama: { guild: 'pastador', mass: 120, herd: 8, range: 12, roam: 45, litter: 0.6, fear: 0.5, biomes: HIGH, parasite: 'carrapatos' },
  chicken: { guild: 'onívoro', mass: 2, herd: 8, range: 4, roam: 20, litter: 4, fear: 0.9, insects: 0.6, biomes: OPEN, parasite: 'piolhos' },
  monkey: { guild: 'frugívoro', mass: 10, herd: 8, range: 8, roam: 40, litter: 0.5, fear: 0.7, biomes: HOT_WET, parasite: 'vermes' },
  boar: { guild: 'onívoro', mass: 80, herd: 8, range: 10, roam: 45, litter: 2.5, fear: 0.4, insects: 0.4, carrion: 0.3, biomes: { ...FOREST, [B.Swamp]: 0.9 }, parasite: 'triquina' },
  turtle: { guild: 'pastador', mass: 20, herd: 4, range: 4, roam: 12, litter: 2, fear: 0.5, plankton: 0.6, biomes: COAST, parasite: 'sanguessugas' },
  frog: { guild: 'insetívoro', mass: 0.2, herd: 8, range: 3, roam: 15, litter: 6, fear: 0.9, forage: 0, insects: 1, biomes: WET, moist: [0.45, 1], parasite: 'fungo quitrídio' },
  crab: { guild: 'detritívoro', mass: 0.5, herd: 8, range: 3, roam: 12, litter: 6, fear: 0.8, forage: 0.3, carrion: 1, plankton: 0.6, biomes: COAST, parasite: 'cracas' },
  penguin: { guild: 'piscívoro', mass: 20, herd: 10, range: 6, roam: 25, litter: 1, fear: 0.6, forage: 0, fish: 1, plankton: 0.4, biomes: COAST, parasite: 'piolhos' },
  fox: { guild: 'predador', mass: 6, herd: 2, range: 10, roam: 60, litter: 3, fear: 0.6, forage: 0.25, meat: 1, carrion: 0.7, insects: 0.4, maxPrey: 6, biomes: ANY, parasite: 'sarna' },
  wolf: { guild: 'predador', mass: 40, herd: 5, range: 20, roam: 110, litter: 3, fear: 0.2, forage: 0, meat: 1, carrion: 0.5, maxPrey: 90, pack: true, biomes: { ...FOREST, [B.Tundra]: 0.8, [B.Grass]: 0.7 }, parasite: 'sarna' },
  bear: { guild: 'onívoro', mass: 300, herd: 2, range: 18, roam: 70, litter: 0.8, fear: 0.1, forage: 0.8, meat: 0.3, carrion: 0.6, fish: 0.8, maxPrey: 80, hibernate: true, biomes: { ...FOREST, [B.Tundra]: 0.6 }, parasite: 'vermes' },
  jaguar: { guild: 'predador', mass: 90, herd: 1, range: 16, roam: 90, litter: 1.3, seasonal: false, fear: 0.2, forage: 0, meat: 1, fish: 0.4, maxPrey: 150, biomes: HOT_WET, parasite: 'carrapatos' },
  lion: { guild: 'predador', mass: 180, herd: 4, range: 22, roam: 100, litter: 2, seasonal: false, fear: 0.1, forage: 0, meat: 1, carrion: 0.6, maxPrey: 300, pack: true, biomes: SAVANNA, parasite: 'carrapatos' },
  hyena: { guild: 'necrófago', mass: 55, herd: 5, range: 18, roam: 90, litter: 1.4, seasonal: false, fear: 0.4, forage: 0, meat: 0.6, carrion: 1, maxPrey: 60, pack: true, biomes: SAVANNA, parasite: 'sarna' },
  vulture: { guild: 'necrófago', mass: 8, herd: 6, range: 30, roam: 220, litter: 1, fear: 0.5, forage: 0, carrion: 1, biomes: { ...SAVANNA, ...OPEN, [B.Rock]: 0.7 }, parasite: 'piolhos' },
  snake: { guild: 'predador', mass: 5, herd: 1, range: 5, roam: 25, litter: 4, fear: 0.5, forage: 0, meat: 1, insects: 0.3, maxPrey: 3, biomes: { ...HOT_WET, ...DRY }, parasite: 'ácaros' },
  crocodile: { guild: 'predador', mass: 400, herd: 4, range: 8, roam: 30, litter: 4, fear: 0.1, forage: 0, meat: 1, fish: 1, carrion: 0.6, maxPrey: 250, biomes: WET, parasite: 'sanguessugas' },
};

/** Padrões por tipo, para espécies sem linha própria (alienígenas antigos, variantes). */
const BY_KIND: Record<SpeciesKind, Row> = {
  herbivore: { guild: 'pastador', mass: 80, herd: 8, range: 10, roam: 50, litter: 0.9, fear: 0.7, biomes: ANY, parasite: 'carrapatos' },
  predator: { guild: 'predador', mass: 40, herd: 4, range: 18, roam: 100, litter: 1.3, fear: 0.2, forage: 0, meat: 1, carrion: 0.5, maxPrey: 90, pack: true, biomes: ANY, parasite: 'sarna' },
  fish: { guild: 'cardume', mass: 1, herd: 12, range: 12, roam: 40, litter: 3, fear: 0.9, forage: 0, plankton: 1, seasonal: false, open: 1, biomes: {}, parasite: 'vermes' },
  shark: { guild: 'predador', mass: 500, herd: 2, range: 30, roam: 120, litter: 0.4, fear: 0, forage: 0, fish: 1, maxPrey: 200, seasonal: false, open: 1, biomes: {}, parasite: 'copépodes' },
  sapient: { guild: 'sapiente', mass: 65, herd: 40, range: 10, roam: 40, litter: 0.15, fear: 0.3, forage: 0.5, meat: 0.5, seasonal: false, biomes: ANY, parasite: 'piolhos' },
};

/** Ajustes por sprite aquático (a baleia filtra plâncton e é mansa). */
const AQUATIC: Record<string, Row> = {
  whale: { guild: 'filtrador', mass: 30000, herd: 4, range: 40, roam: 140, litter: 0.15, fear: 0.2, forage: 0, fish: 0, plankton: 1, maxPrey: 0, seasonal: false, open: 1, biomes: {}, parasite: 'cracas' },
  seaTurtle: { guild: 'pastador', mass: 100, herd: 2, range: 20, roam: 60, litter: 3, fear: 0.5, forage: 0, plankton: 1, seasonal: false, open: 1, biomes: {}, parasite: 'cracas' },
  squid: { guild: 'piscívoro', mass: 5, herd: 10, range: 12, roam: 50, litter: 4, fear: 0.7, forage: 0, plankton: 1, seasonal: false, open: 1, biomes: {}, parasite: 'vermes' },
  piranha: { guild: 'piscívoro', mass: 1, herd: 16, range: 8, roam: 40, litter: 4, fear: 0.6, forage: 0, plankton: 1, seasonal: false, open: 1, biomes: {}, parasite: 'vermes' },
};

const DEFAULTS: Ecology = {
  guild: 'pastador',
  mass: 50,
  forage: 1,
  meat: 0,
  carrion: 0,
  fish: 0,
  insects: 0,
  plankton: 0,
  maxPrey: 0,
  pack: false,
  herd: 8,
  range: 10,
  roam: 50,
  litter: 1,
  seasonal: true,
  moist: [0, 1],
  alt: [0, 0.72],
  biomes: ANY,
  open: 0.2,
  fear: 0.6,
  engineer: false,
  hibernate: false,
  parasite: 'carrapatos',
};

const cache = new WeakMap<Species, Ecology>();

/** Ecologia completa da espécie (com os padrões preenchidos). */
export function ecologyOf(sp: Species): Ecology {
  let e = cache.get(sp);
  if (e) return e;
  const sprite = sp.sprite ?? '';
  const row = (sp.kind !== 'sapient' && (EARTH[sprite] ?? AQUATIC[sprite])) || BY_KIND[sp.kind];
  e = { ...DEFAULTS, ...row, ...(sp.eco ?? {}) };
  // A tabela dá a área de vida em "passos"; o bicho anda ROAM_SCALE vezes isso por ano.
  e.roam *= ROAM_SCALE;
  cache.set(sp, e);
  return e;
}

/** Bicho de terra que entra na conta de capacidade por célula (não peixe, não inteligente). */
export function isLandAnimal(sp: Species): boolean {
  return sp.kind === 'herbivore' || sp.kind === 'predator';
}

/** Come carne viva (caça). */
export function hunts(e: Ecology): boolean {
  return e.meat > 0 && e.maxPrey > 0;
}

/** Peso metabólico (massa^0,75, regra de Kleiber): quantos kg de carne enchem o tanque do bicho. */
export function metabolic(e: Ecology): number {
  return Math.pow(Math.max(0.05, e.mass), 0.75);
}

/**
 * Fração da ração gasta por ano: carnívoros vivem de banquete e jejum e gastam menos entre uma caçada e outra.
 * O necrófago puro (urubu) também: plana sem gastar quase nada até achar a próxima carcaça.
 */
export function appetite(e: Ecology): number {
  const scavenger = e.carrion >= 0.8 && e.forage + e.insects + e.fish + e.plankton === 0;
  return hunts(e) || scavenger ? 0.22 : 1;
}

/**
 * Ração do bicho (quanto pasto come e quanto espaço ocupa), em massa^0,5: a regra
 * de Damuth (densidade ∝ massa^-0,75) comprimida para o mapa ficar legível, com
 * uns 3 coelhos para cada cervo em vez de 15 (docs/REFATORACAO-ECOSSISTEMA.md).
 */
export function ration(e: Ecology): number {
  return Math.sqrt(Math.max(0.05, e.mass));
}

// ---- Constantes da fauna (todas por ano, ou por decisão) ----

/** Decisões de um animal por ano: a agenda cabe em qualquer duração de ano. */
export const DECISIONS_PER_YEAR = 30;
/** Energia gasta por ano (0 a 1 é o tanque cheio). */
export const METABOLISM_YEAR = 1.5;
/** Energia perdida por ano fora da faixa de temperatura (morre de frio ou de calor, não de fome). */
export const THERMAL_YEAR = 3;
/** Começa a procurar comida abaixo disto e para de comer acima disto. */
export const HUNGRY = 0.7;
export const SATED = 0.95;
/** Fome crítica: comer passa por cima de tudo, menos de fugir. */
export const STARVING = 0.3;
/** Energia ganha numa refeição (uma decisão comendo). */
export const BITE = 0.22;
/** Comida mínima num tile para valer a pena comer ali. */
export const FOOD_MIN = 0.12;
/** O pastejo nunca passa disto: o resto é raiz e rebrota sozinho. */
export const GRAZE_MAX = 0.75;
/** Rebrota do pasto por ano (a fração pastada some na taxa exp(-r·t)). */
export const REGROW_YEAR = 3;
/** Quanto da rebrota a capacidade de suporte usa (o resto é margem para seca). */
export const FORAGE_USE = 0.5;
/** Unidades de pasto (fração de um tile cheio) que 1 tanque de energia custa, por unidade de ração (massa^0,5). */
export const GRAZE_COST = 0.6;
/** Tanques por ano que cada tile de inseto (vegetação × umidade) e de costa rasa sustentam. */
export const INSECT_YIELD = 0.05;
export const COAST_YIELD = 0.12;
/** Lado da célula ecológica, em tiles. */
export const ECO_CELL = 16;
/** Orçamento de bichos de terra num planeta do tamanho da Terra (1024×512): escala com a área. */
export const LAND_BUDGET = 2500;
/** Predadores por presa no equilíbrio, em ração: perto de 10% do número de presas. */
export const PREDATOR_RATIO = 0.4;
/** Parte da carne que sobra para necrófagos (carcaças de mortes naturais e restos de caça). */
export const CARRION_RATIO = 0.1;
/** Carne aproveitável por kg de presa, kg de carne por tanque (por massa^0,75) e duração da carcaça (anos). */
export const EDIBLE = 0.6;
export const TANK_KG = 0.75;
export const CARCASS_YEARS = 1.5;
/** Chance base de a caçada dar certo; refúgio (mata, pedra) corta para bichos pequenos. */
export const HUNT_SUCCESS = 0.65;
export const REFUGE = 0.4;
/** Paisagem do medo: quanto uma caçada assusta a célula e quanto decai por ano. */
export const FEAR_DECAY_YEAR = 4;
/** Parasitas: chance de pegar por ano com a célula no teto, cura por ano. */
export const PARASITE_RATE = 0.5;
export const PARASITE_RECOVERY = 0.6;
/** Começo da estação de reprodução (fração do ano, 0 = primavera) e duração. */
export const BREED_START = 0;
export const BREED_LENGTH = 0.35;
/** Passo do bicho na tela, em fração de `Species.speed` (tiles por segundo): andando, ele não passa disto. */
export const ANIMAL_PACE = 0.85;
/** Multiplica o `roam` das tabelas (calibrado para o cervo andar 30 a 60 tiles por ano em linha reta). */
export const ROAM_SCALE = 2;

const FOODS: [keyof Ecology, string][] = [
  ['forage', 'pasto e folhas'],
  ['meat', 'carne'],
  ['carrion', 'carniça'],
  ['fish', 'peixe'],
  ['insects', 'insetos'],
  ['plankton', 'plâncton'],
];

/** A dieta em palavras, da comida principal para a secundária (ficha da criatura). */
export function dietText(e: Ecology): string {
  const parts = FOODS.filter(([k]) => (e[k] as number) >= 0.25)
    .sort((a, b) => (e[b[0]] as number) - (e[a[0]] as number))
    .map(([, name]) => name);
  if (!parts.length) return 'um pouco de tudo';
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

/** Nome do papel no ecossistema, com maiúscula (janela de espécies). */
export function guildName(e: Ecology): string {
  return e.guild[0].toUpperCase() + e.guild.slice(1);
}
