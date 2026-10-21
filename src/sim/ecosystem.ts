import { mulberry32 } from '../core/rng';
import * as B from './balance';
import { binomial, happens, ouStep, streams } from './stochastic';
import { Biome, classify, Decor, decorAt, isTree, temperatureAt, vegetationCap, type SurfaceMap } from '../procgen/surface';
import {
  WONDER_NAMES,
  buildCost,
  emptyMade,
  emptyStock,
  ERA_NEEDS,
  forge,
  generateDeposits,
  makeCulture,
  GOODS,
  ORE_NAMES,
  STOCK_NAMES,
  type Culture,
  type Deposit,
  type Good,
  type Made,
  type Ore,
  type Stock,
} from './economy';
import { yearlyEvents } from './events';
import { pickItem, pickPrimitive, TIER_MATERIAL, type Category, type Material } from './items';
import { CHILD, pickRole, ROLE, ROLES, type RoleContext } from './roles';
import { completeness, missingText, planItems, type PlanItem } from './plan';
import { AVENUE, GRAVEL, isStreet, mainStreets, pickMaterial, type BuildMaterial } from './architecture';
import {
  CURRENCY_EFFICIENCY,
  LUXURIES,
  LUXURY_ERA,
  caravanCap,
  cartOf,
  currencyOf,
  packAnimal,
  pickLuxury,
  price,
  tradable,
  type Agreement,
  type Caravan,
  type Cargo,
  type Crew,
  type Luxury,
} from './trade';
import { emptyVital, HISTORY_YEARS, type DeathCause, type Exit, type Sample, type Vital } from './people';
import {
  foodCap,
  fullNeeds,
  goodCap,
  NEED_NAMES,
  herdFor,
  pickVocation,
  ROLE_NEED,
  roleFor,
  room,
  seasonOf,
  VOCATION_BUILDING,
  VOCATION_LEAVE,
  VOCATION_TAKE,
  VOCATION_NEED,
  VOCATION_ROLE,
  vocationWeights,
  welfare,
  worstNeed,
  type CapContext,
  type Needs,
  type SiteSample,
  type Vocation,
} from './needs';
import { lotsFor, maxFieldsOf, maxPensOf, plotSeed, pruneBlocks, radiusFor, streetOrder, tierFor, TIER_NAMES, TIER_RADIUS, wrapDx } from './settlement';
import { alienName, habitatOf, type Species, type SpeciesKind } from './species';

/**
 * Ecossistema da superfície (RF-SUP-08, RF-SUP-09): criaturas individuais
 * que andam pelo mapa, comem, se reproduzem e morrem, e espécies
 * inteligentes primitivas que formam aldeias e avançam de era.
 * Não depende do three.js; a renderização só lê os arrays.
 */

/** Segundos de jogo (velocidade 1x) que formam um ano. */
export const YEAR_SECONDS = 6;

export const ERAS = ['Idade da Pedra', 'Idade do Bronze', 'Idade do Ferro', 'Era Medieval', 'Era Industrial'];

/**
 * Anos para passar de cada era à seguinte num assentamento de 30 habitantes.
 * Lento de propósito: mesmo acelerando o tempo dá para acompanhar a história.
 */
export const ERA_YEARS = [300, 350, 450, 550];

/** Chance por ano de um assentamento cheio mandar colonos. */

/**
 * Embarcações por era: mais rápidas, maiores, com mais alcance e mais seguras
 * com o avanço. `risk` é a chance de naufragar numa tempestade a cada tile
 * navegado; `range` é o alcance em tiles de mar.
 */
export const BOATS = [
  { name: 'Canoa', the: 'a canoa', on: 'na canoa', sprite: 'canoe', speed: 1.1, range: 35, risk: 0.004, capacity: 4 },
  { name: 'Barco a remo', the: 'o barco a remo', on: 'no barco a remo', sprite: 'rowboat', speed: 1.4, range: 70, risk: 0.0022, capacity: 6 },
  { name: 'Veleiro', the: 'o veleiro', on: 'no veleiro', sprite: 'sailboat', speed: 2, range: 140, risk: 0.0011, capacity: 8 },
  { name: 'Caravela', the: 'a caravela', on: 'na caravela', sprite: 'caravel', speed: 2.4, range: 320, risk: 0.0005, capacity: 12 },
  { name: 'Navio a vapor', the: 'o navio a vapor', on: 'no navio a vapor', sprite: 'steamship', speed: 3.2, range: 700, risk: 0.0001, capacity: 20 },
];

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Tipo de acontecimento, para filtrar a crônica. */
export type ChronicleKind = 'povo' | 'era' | 'guerra' | 'natureza' | 'mar' | 'economia' | 'jogador';

export interface ChronicleEntry {
  year: number;
  text: string;
  kind: ChronicleKind;
  /** Onde aconteceu (tile), para a câmera ir até lá; -1 sem lugar. */
  x: number;
  y: number;
  /** Importante: aparece no painel e conta contra o marasmo. */
  major: boolean;
  /** Acontecimentos repetidos com a mesma chave se juntam numa linha só. */
  key: string;
  count: number;
  /** Lugares envolvidos nas repetições (ex.: assentamentos). */
  places: string[];
}

/** Anos de trégua depois de uma paz. */
const TRUCE_YEARS = 25;

/** Tamanho máximo da crônica guardada. */
const CHRONICLE_MAX = 400;

/** Anos em que repetições com a mesma chave se juntam na mesma linha. */
const MERGE_YEARS = 30;

/** Efeito visual na superfície; `age` e `life` em segundos de jogo. */
export interface Effect {
  kind: 'comet' | 'boom' | 'smoke' | 'flame' | 'quake' | 'skull' | 'tent' | 'heart' | 'swords';
  x: number;
  y: number;
  age: number;
  life: number;
  /** Tamanho em tiles. */
  size: number;
}

/** Guerra entre dois reinos (ids das capitais): `a` ataca o assentamento `target` de `b`. */
export interface War {
  a: number;
  b: number;
  target: number;
  /** Mortos de cada lado em combate. */
  losses: [number, number];
  years: number;
  /** Sem caminho por terra: o atacante manda soldados de barco. */
  naval: boolean;
}

export interface Boat {
  village: number;
  /** Índice em BOATS (a era de quem construiu). */
  kind: number;
  /** Pesca, colonos, soldados de uma invasão, exploradores ou carga de um barco mercante (RF-VIDA-235). */
  purpose: 'fish' | 'colonize' | 'invade' | 'explore' | 'trade';
  x: number;
  y: number;
  /** Direção para onde a proa aponta: 1 leste, -1 oeste. */
  facing: number;
  heading: number;
  /** Rota de colonização: tiles de água do porto até a costa de destino. */
  path: number[];
  step: number;
  /** Tile de terra onde os colonos vão desembarcar. */
  landing: number;
  passengers: { age: number; role: number; who?: Identity }[];
  /** Segundos de pesca restantes (barcos de pesca). */
  timer: number;
  /** Segundos à deriva, perdido no mar. */
  adrift: number;
  /** Segundos desde o naufrágio; -1 enquanto navega. */
  sunk: number;
  /** Barco mercante: porto de destino, carga, ouro a bordo e se já está voltando. */
  trade?: { target: number; cargo: Cargo[]; purse: number; back: boolean };
  /** Segundos sem conseguir avançar (a costa mudou no caminho); passou de REROUTE_SECONDS, refaz a rota. */
  blocked?: number;
}

/**
 * Jangada (seção 19.18): um inteligente travado na beira da água, com o
 * destino do outro lado, corta árvores por perto (ou usa a madeira do
 * estoque) e atravessa sozinho.
 */
export interface Raft {
  x: number;
  y: number;
  facing: number;
  /** Tiles de água até a outra margem. */
  path: number[];
  step: number;
  /** Tile de terra onde desembarca. */
  landing: number;
  species: number;
  /** Assentamento de quem rema (-1 sem assentamento). */
  village: number;
  age: number;
  role: number;
  energy: number;
  who: Identity;
  blocked: number;
}

/** Cores vivas dos reinos (telhados e roupas), como nos jogos de deus em pixel art. */
const KINGDOM_COLORS: [number, number, number][] = [
  [52, 110, 220],
  [214, 64, 52],
  [232, 140, 40],
  [64, 168, 80],
  [148, 72, 200],
  [36, 170, 176],
  [226, 196, 56],
  [210, 84, 150],
  [240, 240, 240],
  [120, 60, 30],
  [150, 210, 60],
  [30, 60, 140],
  [250, 150, 170],
  [100, 100, 110],
  [170, 30, 90],
  [90, 220, 200],
];

/** Cor em HSL (0–1) para RGB, para reinos além da paleta. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/** Construções especiais, na ordem em que um assentamento costuma erguê-las. */
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
export type BuildingKind = 'house' | 'port' | (typeof BUILDINGS)[number];

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  house: 'Casa',
  port: 'Porto',
  granary: 'Celeiro',
  smithy: 'Ferraria',
  market: 'Mercado',
  warehouse: 'Armazém',
  pottery: 'Olaria',
  windmill: 'Moinho',
  loom: 'Tear',
  corral: 'Curral',
  stable: 'Haras',
  sawmill: 'Serraria',
  temple: 'Templo',
  barracks: 'Quartel',
  factory: 'Fábrica',
  aqueduct: 'Aqueduto',
  statue: 'Estátua',
  wonder: 'Grande obra',
};

/** O que decide se um assentamento pode erguer uma construção. */
interface BuildContext {
  era: number;
  tier: number;
  /** Tem metal no estoque. */
  metal: boolean;
  culture: Culture;
  capital: boolean;
  vocation?: Vocation;
  herd?: HerdKind;
  /** Tem água por perto (barro para a olaria). */
  clay: boolean;
  forest: number;
}

/**
 * Se o assentamento já pode erguer a construção: era, nível e condições
 * (a ferraria só faz sentido com metal no estoque; a cultura adianta templos e mercados;
 * a vocação adianta o prédio característico, RF-VIDA-221).
 */
function canBuild(kind: (typeof BUILDINGS)[number], c: BuildContext): boolean {
  const { era, tier, metal, culture, capital } = c;
  switch (kind) {
    case 'granary':
      return era >= 1;
    case 'smithy':
      return metal;
    case 'market':
      return tier >= 1 || culture.value === 'comércio';
    case 'temple':
      return culture.value === 'fé' ? era >= 1 : era >= 2 && tier >= 1;
    case 'windmill':
      return tier >= 1 && (era >= 2 || (era >= 1 && c.vocation === 'agricola'));
    // Economia local (RF-VIDA-211 e 216).
    case 'warehouse':
      return tier >= 2 || (tier >= 1 && c.vocation === 'mercantil');
    case 'pottery':
      return era >= 1 && c.clay;
    case 'loom':
      return era >= 1 && (c.herd === 'sheep' || c.vocation === 'ovelhas');
    case 'corral':
      return c.herd === 'cattle' || c.herd === 'goat';
    case 'stable':
      return era >= 1 && (c.herd === 'horse' || c.herd === 'camel');
    case 'sawmill':
      return era >= 2 && (c.vocation === 'madeireira' || (tier >= 2 && c.forest > 0.55));
    case 'barracks':
      return era >= 2 && tier >= 2;
    case 'factory':
      return era >= 4 && tier >= 2;
    // Saneamento da metrópole (RF-VIDA-284).
    case 'aqueduct':
      return era >= 2 && tier >= 3;
    // Capitais ricas erguem monumentos: estátua do líder e a grande obra do povo.
    case 'statue':
      return capital && era >= 2 && tier >= 2;
    case 'wonder':
      return capital && era >= 3 && tier >= 2;
  }
}

export interface Building {
  /** Canto superior esquerdo de 2x2 tiles (o porto ocupa 1 tile). */
  x: number;
  y: number;
  kind: BuildingKind;
  /** Variação de aparência (casas). */
  variant: number;
  /** Andares a mais (casas reformadas e adensadas, RF-VIDA-203). */
  level?: number;
  /** Ano até o qual a obra continua, com andaime. */
  workUntil?: number;
  /** Era do estilo da casa: a da construção ou da última reforma (transição gradual, RF-VIDA-251). */
  era?: number;
  /** Casa vazia num assentamento em crise (RF-VIDA-254). */
  empty?: boolean;
  /** Anos seguidos sem conserto por falta de madeira ou pedra (seção 19.19). */
  wear?: number;
}

export interface Village {
  id: number;
  name: string;
  species: number;
  x: number;
  y: number;
  /** Casas e construções especiais. */
  houses: Building[];
  /** Plantações (2x2 tiles cada). */
  fields: number;
  /** Índice da criatura que lidera o assentamento, ou -1. */
  leader: number;
  /** Nível: 0 aldeia, 1 vila, 2 cidade (TIER_NAMES). */
  tier: number;
  /** Id do assentamento capital do reino a que pertence (o próprio, se independente). */
  kingdom: number;
  /** Lotes livres ou não, relativos ao centro, do nível atual. */
  lots: { x: number; y: number }[];
  tech: number;
  population: number;
  /** Tile de água ao lado do porto, onde os barcos atracam; -1 sem porto. */
  port: number;
  /** Peixe trazido pelos barcos de pesca, ainda não comido. */
  food: number;
  /** Estoque e produção histórica; valem os da capital do reino (ver `store`). */
  stock: Stock;
  made: Made;
  /** Povo do assentamento (colônias herdam; conquistados mantêm o seu). */
  culture: Culture;
  /** Jazidas que o assentamento explora (ids em `deposits`). */
  mines: number[];
  /** Trabalho de ferraria acumulado, em peças. */
  forgeWork: number;
  /** Floresta e rocha por perto (lenha e pedra). */
  forest: number;
  rock: boolean;
  /** Cor das roupas dos moradores. */
  color: [number, number, number];
  abandoned: boolean;
  /** Ano em que foi abandonado. */
  abandonedAt?: number;
  /** Quanto das ruínas já sumiu: 0 tudo de pé, 3 limpo (ou reocupado por outro assentamento). */
  decay?: number;
  /** Como morreu o último morador, para a crônica ("de fome", "de velhice"). */
  lastCause?: string;
  /** Id das ruínas que este assentamento reocupou, se for o caso. */
  ruinOf?: number;
  /** Ruas e área rumo ao nível seguinte, de 0 a 1 (ruas sob demanda, RF-VIDA-207). */
  growth?: number;
  /** Já tem estrada para um vizinho do mesmo reino. */
  linked?: boolean;
  /** Tiles da planta de ruas já abertos e o total da planta (ruas bloco a bloco). */
  streetLen?: number;
  streetPlan?: number;
  /** Completude da estrutura de referência, de 0 a 1, e o que falta (RF-VIDA-201). */
  completeness?: number;
  missing?: string;
  /** Vocação (RF-VIDA-220) e anos ruins seguidos dela (RF-VIDA-222). */
  vocation?: Vocation;
  badYears?: number;
  /** Atendimento das necessidades, de 0 a 1 (RF-VIDA-210), e estabilidade (RF-VIDA-280). */
  needs?: Needs;
  stability?: number;
  /** Rebanho domesticado e os cercados de pasto (canto 2x2 de cada um, RF-VIDA-215). */
  herd?: Herd;
  pens?: { x: number; y: number }[];
  /** Fertilidade do solo das roças, de 0 a 1 (RF-VIDA-294). */
  soil?: number;
  /** Produção e consumo do ano passado e do ano corrente, por recurso (painel de economia, RF-VIDA-217). */
  ledger?: Ledger;
  ledgerNow?: Ledger;
  /** Ano até o qual dura a corrida do ouro (RF-VIDA-285). */
  goldRush?: number;
  /** Tem água por perto (barro e poço). */
  wet?: boolean;
  /** Material das casas, pelo que há em volta (RF-VIDA-252). */
  material?: BuildMaterial;
  /** Era do último calçamento das ruas. */
  paveEra?: number;
  /** Nascimentos, mortes, chegadas e partidas do ano passado e do ano corrente (RF-VIDA-343). */
  vital?: Vital;
  vitalNow?: Vital;
  /** Uma amostra por ano de população e estoque, para os gráficos (RF-VIDA-347). */
  history?: Sample[];
  /** Bem de luxo da região (RF-VIDA-282); null quando a região não dá nenhum. */
  luxury?: Luxury | null;
  /** Os ricos consumiram luxo no ano passado (estabilidade a mais). */
  luxuryJoy?: boolean;
  /** Ano da última feira anual (RF-VIDA-234). */
  fair?: number;
  /** Pedido da capital ainda aberto e quantos pedidos a colônia já recusou (RF-VIDA-289). */
  request?: { good: Good | 'food'; amount: number; until: number };
  refused?: number;
  /** A capital cunha moeda própria (RF-VIDA-291). */
  mint?: boolean;
  /**
   * Recursos do mapa (seção 19.19): árvores de pé ao alcance, a lista delas da mais perto
   * para a mais longe, a próxima a cair (onde os lenhadores trabalham) e o trabalho de corte
   * acumulado; o povo replanta a mata (manejo).
   */
  trees?: number;
  treesStart?: number;
  treeList?: number[];
  treeNext?: number;
  treeScan?: number;
  fellAt?: number;
  chop?: number;
  forestry?: boolean;
  /** Pedreira: tiles com pedra ao alcance, do melhor para o pior, e a pedra que ainda dão. */
  stoneList?: number[];
  stoneNext?: number;
  stoneScan?: number;
  stoneLeft?: number;
  /** Coleta acumulada (porções) e a parte do inverno frio que passou sem lenha. */
  gatherWork?: number;
  chill?: number;
  /** Anos seguidos de falta de comida ou madeira (cobiça e êxodo). */
  want?: number;
}

/** Quem a pessoa é, guardado quando ela embarca e devolvido quando desembarca. */
export interface Identity {
  uid: number;
  parent: number;
  family: number;
  bornAt: number;
  bornYear: number;
  movedAt: number;
}

/** Uma morte recente, para o aviso de quem estava sendo seguido (RF-VIDA-333). */
export interface Death {
  uid: number;
  cause: DeathCause;
  age: number;
  x: number;
  y: number;
}

/** Produção e consumo por recurso num ano. */
export type Ledger = Record<string, [number, number]>;

/** Animais que um povo cria (RF-VIDA-215). */
export const HERDS = ['sheep', 'cattle', 'goat', 'horse', 'camel'] as const;
export type HerdKind = (typeof HERDS)[number];
export const HERD_NAMES: Record<HerdKind, string> = { sheep: 'ovelhas', cattle: 'gado', goat: 'cabras', horse: 'cavalos', camel: 'camelos' };

export interface Herd {
  kind: HerdKind;
  head: number;
  /** Ano até o qual o rebanho está com praga. */
  plague?: number;
  /** Parte do rebanho está no pasto alto com os pastores (RF-VIDA-293). */
  away?: number;
}

/** Anos entre cada etapa do sumiço das ruínas (plantações, depois ruas, depois a praça). */
const RUIN_YEARS = 12;

interface Behaviour {
  /** Energia gasta por segundo. */
  metabolism: number;
  /** Chance de reprodução por segundo, com energia sobrando. */
  birthRate: number;
  /** Teto da espécie no planeta. */
  cap: number;
  /** Máximo de indivíduos da mesma espécie numa célula de 8x8 tiles. */
  crowd: number;
}

const BEHAVIOUR: Record<SpeciesKind, Behaviour> = {
  fish: { metabolism: 0.03, birthRate: 0.12, cap: 1400, crowd: 6 },
  herbivore: { metabolism: 0.09, birthRate: 0.14, cap: 1600, crowd: 8 },
  predator: { metabolism: 0.026, birthRate: 0.1, cap: 500, crowd: 4 },
  shark: { metabolism: 0.012, birthRate: 0.1, cap: 220, crowd: 3 },
  // Inteligentes crescem devagar: poucos filhos por ano, para a história durar.
  sapient: { metabolism: 0.045, birthRate: 0.022, cap: 6000, crowd: 40 },
};

/** Expectativa de vida: inteligentes vivem mais conforme a era avança. */
export function lifespan(sp: Species, era: number): number {
  return sp.kind === 'sapient' ? sp.maxAge * (1 + 0.12 * era) : sp.maxAge;
}

/** Idade a partir da qual um inteligente é idoso (não trabalha nem tem filhos). */
export function elderAge(sp: Species, era: number): number {
  return lifespan(sp, era) * 0.75;
}

const CELL = 8;
const THINK_INTERVAL = 0.4;
/** Teto mínimo de qualquer espécie: abaixo disso, um azar qualquer acaba com ela. */
const MIN_CAP = 30;
/** Até onde um adulto procura parceiro (tiles); bem mais longe quando a espécie está rara. */
const MATE_RANGE = 24;

export function isWater(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] < 0 && map.biome[i] !== Biome.Ice && map.biome[i] !== Biome.Lava;
}

export function isLand(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] >= 0 && map.biome[i] !== Biome.Lava;
}

export class Ecosystem {
  readonly species: Species[] = [];
  capacity = 0;
  /** Maior índice já usado + 1. */
  count = 0;
  x = new Float32Array(0);
  y = new Float32Array(0);
  vx = new Float32Array(0);
  vy = new Float32Array(0);
  age = new Float32Array(0);
  energy = new Float32Array(0);
  think = new Float32Array(0);
  kind = new Uint8Array(0);
  alive = new Uint8Array(0);
  village = new Int16Array(0);
  /** Profissão de cada indivíduo inteligente (índice em ROLES). */
  role = new Uint8Array(0);
  /** Número único de cada indivíduo (o índice é reaproveitado depois da morte), para nome e seleção. */
  uid = new Uint32Array(0);
  /** `uid` de quem gerou (0 sem registro) e família (sobrenome) de cada um (RF-VIDA-334). */
  parent = new Uint32Array(0);
  family = new Uint32Array(0);
  /** Assentamento onde nasceu (-1 no mato), ano do nascimento e ano da última mudança (-1 nunca). */
  bornAt = new Int16Array(0);
  bornYear = new Float32Array(0);
  movedAt = new Float32Array(0);
  /**
   * Contorno de obstáculos (seção 19.18): segundos que ainda segue de lado
   * contornando, lado escolhido (+1 ou -1), segundos travado na beira da água
   * e o último destino (deslocamento em tiles) para onde estava indo.
   */
  detour = new Float32Array(0);
  side = new Int8Array(0);
  stuck = new Float32Array(0);
  aimX = new Float32Array(0);
  aimY = new Float32Array(0);
  /** Jangadas atravessando a água agora. */
  readonly rafts: Raft[] = [];
  private nextUid = 0;
  private nextFamily = 0;
  /** Últimas mortes, da mais nova para a mais antiga. */
  readonly deaths: Death[] = [];
  readonly villages: Village[] = [];
  readonly boats: Boat[] = [];
  /** Caravanas, tributos e rebanhos na estrada (RF-VIDA-230 e 293). */
  readonly caravans: Caravan[] = [];
  private nextCaravan = 0;
  /** Acordos comerciais em vigor (RF-VIDA-232). */
  readonly agreements: Agreement[] = [];
  /** Viagens de ida e volta entre cada par de assentamentos (chave "a:b"), para firmar acordos. */
  private readonly trips = new Map<string, number>();
  /** Pares de reinos que trocaram por caravana neste ano: a troca invisível fica só como reserva. */
  private readonly caravanPairs = new Set<string>();
  /** Uso das estradas por tile e a maior era de quem passou (RF-VIDA-233). */
  readonly traffic: Uint16Array;
  private readonly trafficEra: Uint8Array;
  private readonly trafficTiles = new Set<number>();
  /** Tiles de estrada que nasceram do uso. */
  routeTiles = 0;
  /** Postos de pedágio: tile do passo e o assentamento que cobra (RF-VIDA-286). */
  readonly tolls = new Map<number, number>();
  /** Jazidas de minério do planeta, e o índice delas por tile. */
  readonly deposits: Deposit[];
  readonly depositAt: Int32Array;
  /** Relação entre reinos (chave "a:b", a < b), de -100 a 100. */
  readonly relations = new Map<string, number>();
  readonly wars: War[] = [];
  private cultures = 0;
  private yearClock = 0;
  /**
   * Clima do ano por região (RF-VIDA-304 e 305): 0 é um ano normal, negativo
   * é seca ou frio fora de hora, positivo é ano bom. Parte é comum ao planeta
   * inteiro e parte é de cada região; tudo volta ao normal com o tempo.
   */
  readonly climate = new Float32Array(B.CLIMATE_REGIONS[0] * B.CLIMATE_REGIONS[1]);
  private climateShared = 0;
  private readonly climateLocal = new Float32Array(B.CLIMATE_REGIONS[0] * B.CLIMATE_REGIONS[1]);
  private readonly droughtNoted = new Float32Array(B.CLIMATE_REGIONS[0] * B.CLIMATE_REGIONS[1]).fill(-1e9);
  /** Soldados que desembarcaram numa invasão por mar: marcham até o alvo de qualquer distância. */
  readonly expedition = new Set<number>();
  /** Espécies extintas neste planeta (podem reaparecer). */
  readonly extinct = new Set<number>();
  /** Trégua depois de uma paz: até esse ano o par não volta à guerra. */
  readonly truces = new Map<string, number>();
  /** Reinos cujo rei morreu e que podem se dividir numa guerra civil. */
  private readonly crises = new Set<number>();
  /** Alianças entre reinos (chave "a:b") e o ano em que começaram. */
  readonly alliances = new Map<string, number>();
  /** Reinos que já se conhecem por mar (chave "a:b"), além dos vizinhos por terra. */
  readonly contacts = new Set<string>();
  /** Quantos de cada item do catálogo já foram feitos no planeta (catálogo de itens). */
  readonly crafted = new Map<string, number>();
  /** Efeitos visuais de acontecimentos (cometa, explosão, fumaça, fogo...). */
  readonly effects: Effect[] = [];
  /** Ruínas de construções destruídas; somem com o tempo. */
  readonly ruins: { x: number; y: number; age: number }[] = [];
  /** Tremor de terra em andamento (segundos), para a câmera tremer. */
  shake = 0;
  /** Eventos aleatórios do mundo ligados e o ritmo deles (0,5 raro, 1 normal, 2 frequente). */
  autoEvents = true;
  eventRate = 1;
  /** Lava que esfria aos poucos: tile e calor que ainda vai perder. */
  private readonly cooling: { i: number; heat: number }[] = [];
  /** Ruas por tile: 0 nenhuma, 1 terra, 2 pedra, 3 praça. */
  readonly road: Uint8Array;
  /** Rua principal (1) ou viela (0), refeito a cada traçado das ruas (RF-VIDA-253). */
  readonly mainStreet: Uint8Array;
  /** Tiles ocupados por casas. */
  readonly built: Uint8Array;
  /** Crescimento da muda (0 a 1), vegetação da árvore antes do corte e tiles com toco ou muda (seção 19.19). */
  private readonly treeGrow: Float32Array;
  private readonly treeVeg: Float32Array;
  private readonly stumps = new Set<number>();
  /** Pedra já tirada de cada tile (seção 19.19). */
  readonly stoneTaken: Float32Array;
  /** Árvores cortadas e plantadas no mundo (calibração). */
  treesCut = 0;
  treesPlanted = 0;
  /** Contas da falta no mundo inteiro (calibração, seção 19.19): mortes de fome e frio, casas desabadas, guerras por cobiça, êxodos e migrantes. */
  readonly tally = { hunger: 0, cold: 0, collapsed: 0, greedWars: 0, exodus: 0, migrants: 0 };
  readonly population: number[] = [];
  /** Teto de cada espécie neste planeta, proporcional ao habitat. */
  private readonly caps: number[] = [];
  /** Onde cada espécie vive (habitatOf) e se já teve indivíduos aqui (extinção). */
  private readonly habitat: (0 | 1 | 2)[] = [];
  private readonly everLived: boolean[] = [];
  /** Chamado quando uma espécie entra no planeta (variantes novas vão para o catálogo). */
  onSpecies: (sp: Species) => void = () => {};
  /** Anos de jogo desde a chegada. */
  year = 0;
  /** Crônica do planeta, do mais novo para o mais antigo (RF-VIDA-156). */
  readonly chronicle: ChronicleEntry[] = [];
  /** Ano do último acontecimento importante (para detectar marasmo). */
  lastMajor = 0;
  /** Aviso curto para o jogador (ex.: lugar inválido), lido e limpo pela interface. */
  hint = '';
  private free: number[] = [];
  /** Sorteios da vida animal e da vegetação (cada subsistema tem o seu fluxo, RF-VIDA-306). */
  private readonly rnd: () => number;
  /** Sorteios dos povos: casas, colonos, barcos, produção. */
  private readonly civRnd: () => number;
  /** Sorteios da política: relações, incidentes, guerras. */
  private readonly polRnd: () => number;
  /** Sorteios dos eventos do mundo. */
  private readonly worldRnd: () => number;
  /** Sorteios do clima do ano. */
  private readonly climateRnd: () => number;
  private gridHead = new Int32Array(0);
  private gridNext = new Int32Array(0);
  private cols: number;
  private rows: number;
  private villageClock = 0;

  /** Chamado quando uma criatura altera um tile (ex.: come a vegetação). */
  onTileChanged: (i: number) => void = () => {};

  constructor(
    readonly map: SurfaceMap,
    seed: number,
  ) {
    const rng = streams(seed);
    this.rnd = rng.vida;
    this.civRnd = rng.povos;
    this.polRnd = rng.politica;
    this.worldRnd = rng.mundo;
    this.climateRnd = rng.clima;
    this.road = new Uint8Array(map.width * map.height);
    this.traffic = new Uint16Array(map.width * map.height);
    this.trafficEra = new Uint8Array(map.width * map.height);
    this.mainStreet = new Uint8Array(map.width * map.height);
    this.built = new Uint8Array(map.width * map.height);
    this.treeGrow = new Float32Array(map.width * map.height);
    this.treeVeg = new Float32Array(map.width * map.height);
    this.stoneTaken = new Float32Array(map.width * map.height);
    map.felled = new Uint8Array(map.width * map.height);
    this.cols = Math.ceil(map.width / CELL);
    this.rows = Math.ceil(map.height / CELL);
    this.gridHead = new Int32Array(this.cols * this.rows);
    this.grow(512);
    this.deposits = generateDeposits(map, streams(seed).terreno);
    this.depositAt = new Int32Array(map.width * map.height).fill(-1);
    for (const d of this.deposits) this.depositAt[d.y * map.width + d.x] = d.id;
  }

  /**
   * Registra um acontecimento na crônica. Com `key`, repetições recentes
   * (ex.: tempestades que afundam barcos de pesca) viram uma linha só, com a
   * contagem e os lugares, para não encher o painel do mesmo assunto.
   */
  note(text: string, kind: ChronicleKind, at?: { x: number; y: number } | null, opts: { major?: boolean; key?: string; place?: string } = {}): void {
    const major = opts.major ?? false;
    if (major && kind !== 'jogador') this.lastMajor = this.year;
    if (opts.key) {
      const old = this.chronicle.find((e) => e.key === opts.key && this.year - e.year < MERGE_YEARS);
      if (old) {
        old.count++;
        old.year = this.year;
        if (opts.place && !old.places.includes(opts.place)) old.places.push(opts.place);
        if (at) {
          old.x = at.x;
          old.y = at.y;
        }
        // Volta para o topo.
        this.chronicle.splice(this.chronicle.indexOf(old), 1);
        this.chronicle.unshift(old);
        return;
      }
    }
    this.chronicle.unshift({
      year: this.year,
      text,
      kind,
      x: at ? at.x : -1,
      y: at ? at.y : -1,
      major,
      key: opts.key ?? '',
      count: 1,
      places: opts.place ? [opts.place] : [],
    });
    if (this.chronicle.length > CHRONICLE_MAX) this.chronicle.length = CHRONICLE_MAX;
  }

  /** Texto de uma linha da crônica, com repetições e lugares. */
  static describe(e: ChronicleEntry): string {
    const places = e.places.length > 1 ? ` (${e.places.slice(0, 4).join(', ')}${e.places.length > 4 ? '…' : ''})` : '';
    return `${e.text}${places}${e.count > 1 ? ` ×${e.count}` : ''}`;
  }

  get total(): number {
    return this.count - this.free.length;
  }

  addSpecies(sp: Species): number {
    const existing = this.species.findIndex((s) => s.id === sp.id);
    if (existing >= 0) return existing;
    this.species.push(sp);
    this.population.push(0);
    this.habitat.push(habitatOf(sp));
    this.everLived.push(false);
    this.caps.push(0);
    // Espécies do mesmo tipo dividem o habitat: o teto de cada uma cai.
    this.species.forEach((o, s) => {
      if (o.kind === sp.kind) this.caps[s] = this.habitatCap(o);
    });
    this.onSpecies(sp);
    return this.species.length - 1;
  }

  private habitatCap(sp: Species): number {
    const map = this.map;
    const mode = habitatOf(sp);
    let area = 0;
    for (let i = 0; i < map.elevation.length; i += 4) {
      const water = isWater(map, i);
      if (mode === 2 ? water || isLand(map, i) : mode === 1 ? water : isLand(map, i)) area += 4;
    }
    // Inteligentes: o teto é largo; quem limita cada assentamento são as casas.
    // Tiles por indivíduo: o peixe precisa de bem mais mar do que antes (o mar não é infinito),
    // e bichos de terra e predadores ganham mais espaço, para nenhuma espécie ficar com meia dúzia.
    const per = { fish: 260, herbivore: 90, predator: 600, shark: 2600, sapient: 80 }[sp.kind];
    const sameKind = this.species.filter((o) => o.kind === sp.kind).length;
    // O pasto (ou a caça) é o mesmo: a soma das espécies do tipo fica um pouco acima do teto de uma só.
    const share = sp.kind === 'sapient' ? 1 : 2 / (sameKind + 1);
    // Anfíbios ficam na costa: uma fração da área.
    const coast = mode === 2 ? 0.3 : 1;
    return Math.max(MIN_CAP, Math.min(BEHAVIOUR[sp.kind].cap * share, Math.round((area / per) * share * coast)));
  }

  /** Se a espécie `s` pode estar no tile (terra, água ou, para anfíbios, a costa). */
  canStand(s: number, i: number): boolean {
    const mode = this.habitat[s];
    if (mode === 0) return isLand(this.map, i);
    if (mode === 1) return isWater(this.map, i);
    // Anfíbios: terra perto da água ou água rasa.
    return isLand(this.map, i) ? this.map.elevation[i] < 0.25 : isWater(this.map, i) && this.map.elevation[i] > -0.2;
  }

  /**
   * Se a espécie `s` consegue ir do tile `from` ao vizinho `to` (seção 19.18):
   * o destino precisa ser do habitat e, em terra, o desnível não pode ser um
   * penhasco. Descer aguenta o dobro de subir (escorrega, pula); quem está
   * num tile que deixou de ser do habitat pode sair por qualquer lado.
   */
  canStep(s: number, from: number, to: number): boolean {
    if (!this.canStand(s, to)) return false;
    if (from === to || this.habitat[s] === 1 || !this.canStand(s, from)) return true;
    const a = this.map.elevation[from];
    const b = this.map.elevation[to];
    if (a < 0 || b < 0) return true;
    return b - a <= B.MAX_CLIMB && a - b <= B.MAX_CLIMB * 2;
  }

  /**
   * Bateu num obstáculo (água, penhasco, borda do habitat): em vez de voltar
   * para trás e tentar de novo o mesmo caminho, vira 45°, 90° ou 135° para o
   * lado que já vinha contornando e segue por ali por DETOUR_SECONDS. Assim a
   * criatura costeia o obstáculo até achar a passagem. Retorna se achou saída.
   */
  private steer(i: number, here: number, dt: number): boolean {
    const s = this.kind[i];
    const speed = Math.hypot(this.vx[i], this.vy[i]);
    if (speed < 0.01) return false;
    const a0 = Math.atan2(this.vy[i], this.vx[i]);
    const side = this.side[i] || (this.rnd() < 0.5 ? 1 : -1);
    const look = Math.max(0.8, speed * dt * 2);
    const w = this.map.width;
    for (let k = 1; k <= 4; k++) {
      for (const sign of k === 4 ? [side] : [side, -side]) {
        const a = a0 + sign * k * (Math.PI / 4);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const t = this.tileAt(this.x[i] + dx * look, Math.floor(this.y[i] + dy * look));
        if (t < 0 || t === here || !this.canStep(s, here, t)) continue;
        this.vx[i] = dx * speed;
        this.vy[i] = dy * speed;
        this.side[i] = sign;
        this.detour[i] = B.DETOUR_SECONDS;
        const nx = this.x[i] + this.vx[i] * dt;
        const ny = this.y[i] + this.vy[i] * dt;
        const nt = this.tileAt(nx, Math.floor(ny));
        if (nt >= 0 && (nt === here || this.canStep(s, here, nt))) {
          this.x[i] = ((nx % w) + w) % w;
          this.y[i] = ny;
        }
        return true;
      }
    }
    return false;
  }

  /** População inicial, proporcional ao habitat disponível. */
  populate(): void {
    const map = this.map;
    const n = map.width * map.height;
    let water = 0;
    let green = 0;
    for (let i = 0; i < n; i += 4) {
      if (isWater(map, i)) water++;
      else if (map.vegetation[i] > 0.3) green++;
    }
    water *= 4;
    green *= 4;
    this.species.forEach((sp, s) => {
      const target = { fish: water / 220, herbivore: green / 260, predator: green / 2200, shark: water / 9000, sapient: 0 }[sp.kind];
      const amount = sp.kind === 'sapient' ? 0 : Math.min(this.caps[s] * 0.6, Math.max(Math.round(target), Math.min(12, this.caps[s] * 0.4)));
      // Em bandos, cardumes e matilhas: sozinhos espalhados, os bichos nunca se achavam para ter filhotes.
      const group = { fish: 6, herbivore: 5, predator: 3, shark: 2, sapient: 1 }[sp.kind];
      for (let k = 0; k < amount; k += group) {
        const tile = this.findTile(s, Math.floor(this.rnd() * n), 40);
        if (tile < 0) continue;
        for (let g = 0; g < group && k + g < amount; g++) {
          const near = this.tileAt((tile % map.width) + Math.floor((this.rnd() - 0.5) * 5), Math.floor(tile / map.width) + Math.floor((this.rnd() - 0.5) * 5));
          this.spawnAtTile(s, near >= 0 && this.habitable(s, near) ? near : tile, -1, this.rnd() * sp.maxAge * 0.6);
        }
      }
      if (sp.kind === 'sapient') {
        const villages = Math.max(2, Math.min(6, Math.round(green / 60000)));
        for (let v = 0; v < villages; v++) {
          for (let t = 0; t < 20; t++) {
            const tile = this.findTile(s, Math.floor(this.rnd() * n), 400, true);
            const tx = tile % map.width;
            const ty = Math.floor(tile / map.width);
            if (tile < 0 || !this.canSettle(s, tx, ty)) continue;
            this.foundVillage(s, tx, ty, 8);
            break;
          }
        }
      }
    });
  }

  /** Procura um tile habitável perto de `start` (tentativas aleatórias). */
  private findTile(s: number, start: number, tries: number, fertile = false): number {
    const map = this.map;
    const w = map.width;
    for (let t = 0; t < tries; t++) {
      const i = t === 0 ? start : Math.floor(this.rnd() * w * map.height);
      if (this.habitable(s, i) && (!fertile || map.vegetation[i] > 0.3)) return i;
    }
    return -1;
  }

  habitable(s: number, i: number): boolean {
    const sp = this.species[s];
    if (!this.canStand(s, i)) return false;
    const t = temperatureAt(this.map, i);
    return t >= sp.tempMin - 5 && t <= sp.tempMax + 5;
  }

  private grow(capacity: number): void {
    const copy = <T extends Float32Array | Uint8Array | Int8Array | Int16Array | Uint32Array>(a: T, make: (n: number) => T): T => {
      const b = make(capacity);
      b.set(a);
      return b;
    };
    this.x = copy(this.x, (n) => new Float32Array(n));
    this.y = copy(this.y, (n) => new Float32Array(n));
    this.vx = copy(this.vx, (n) => new Float32Array(n));
    this.vy = copy(this.vy, (n) => new Float32Array(n));
    this.age = copy(this.age, (n) => new Float32Array(n));
    this.energy = copy(this.energy, (n) => new Float32Array(n));
    this.think = copy(this.think, (n) => new Float32Array(n));
    this.kind = copy(this.kind, (n) => new Uint8Array(n));
    this.alive = copy(this.alive, (n) => new Uint8Array(n));
    this.village = copy(this.village, (n) => new Int16Array(n));
    this.role = copy(this.role, (n) => new Uint8Array(n));
    this.uid = copy(this.uid, (n) => new Uint32Array(n));
    this.parent = copy(this.parent, (n) => new Uint32Array(n));
    this.family = copy(this.family, (n) => new Uint32Array(n));
    this.bornAt = copy(this.bornAt, (n) => new Int16Array(n));
    this.bornYear = copy(this.bornYear, (n) => new Float32Array(n));
    this.movedAt = copy(this.movedAt, (n) => new Float32Array(n));
    this.detour = copy(this.detour, (n) => new Float32Array(n));
    this.side = copy(this.side, (n) => new Int8Array(n));
    this.stuck = copy(this.stuck, (n) => new Float32Array(n));
    this.aimX = copy(this.aimX, (n) => new Float32Array(n));
    this.aimY = copy(this.aimY, (n) => new Float32Array(n));
    // A grade pode estar em uso no meio de um passo: copiar, nunca zerar (zeros criariam um laço infinito).
    const next = new Int32Array(capacity).fill(-1);
    next.set(this.gridNext);
    this.gridNext = next;
    this.capacity = capacity;
  }

  spawn(s: number, x: number, y: number, village = -1, age = 0): number {
    // Cada era (agricultura, cidades, indústria) sustenta mais gente.
    const era = village >= 0 ? Math.floor(this.villages[village].tech) : 0;
    if (this.population[s] >= this.caps[s] * (1 + 0.3 * era)) return -1;
    let i = this.free.pop();
    if (i === undefined) {
      if (this.count >= this.capacity) this.grow(this.capacity * 2);
      i = this.count++;
    }
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = 0;
    this.vy[i] = 0;
    this.age[i] = age;
    this.energy[i] = 0.6 + this.rnd() * 0.3;
    this.think[i] = this.rnd() * THINK_INTERVAL;
    this.kind[i] = s;
    this.alive[i] = 1;
    this.village[i] = village;
    this.uid[i] = ++this.nextUid;
    this.parent[i] = 0;
    this.family[i] = ++this.nextFamily;
    this.bornAt[i] = age === 0 ? village : -1;
    this.bornYear[i] = this.year - age;
    this.movedAt[i] = -1;
    this.detour[i] = 0;
    this.side[i] = 0;
    this.stuck[i] = 0;
    this.aimX[i] = 0;
    this.aimY[i] = 0;
    this.population[s]++;
    this.everLived[s] = true;
    if (village >= 0) {
      const v = this.villages[village];
      v.population++;
      const vital = (v.vitalNow ??= emptyVital());
      if (age === 0) vital.births++;
      else vital.arrived++;
      this.role[i] = age < this.species[s].maturity ? CHILD : pickRole(Math.floor(v.tech), v.tier, this.rnd(), this.roleContext(v));
    }
    return i;
  }

  private spawnAtTile(s: number, tile: number, village = -1, age = 0): number {
    const w = this.map.width;
    return this.spawn(s, (tile % w) + this.rnd(), Math.floor(tile / w) + this.rnd(), village, age);
  }

  /**
   * Remove a criatura. `quiet` não registra a morte na crônica; `cause` diz
   * como saiu (`partiu` é quem embarcou ou virou colono, não morreu).
   */
  kill(i: number, quiet = false, cause: Exit = 'outra'): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    const s = this.kind[i];
    if (cause !== 'partiu') {
      this.deaths.unshift({ uid: this.uid[i], cause, age: this.age[i], x: this.x[i], y: this.y[i] });
      if (this.deaths.length > 64) this.deaths.pop();
    }
    if (this.village[i] >= 0) {
      const vital = (this.villages[this.village[i]].vitalNow ??= emptyVital());
      if (cause === 'partiu') vital.left++;
      else vital.deaths[cause] = (vital.deaths[cause] ?? 0) + 1;
      if (cause === 'fome') this.tally.hunger++;
      else if (cause === 'frio') this.tally.cold++;
    }
    this.population[s]--;
    this.expedition.delete(i);
    if (this.population[s] === 0 && this.species[s].kind !== 'sapient') {
      this.extinct.add(s);
      this.note(`${this.species[s].name}: a espécie foi extinta neste planeta`, 'natureza', { x: this.x[i], y: this.y[i] }, { major: true });
    }
    const v = this.village[i];
    if (v >= 0) {
      const village = this.villages[v];
      village.population--;
      // Só a morte de reis e de líderes de reinos entra nos acontecimentos.
      if (!quiet && village.leader === i && village.kingdom === village.id && (village.tier >= 2 || this.kingdomSize(village) > 1)) {
        const title = this.role[i] === ROLE.king ? 'O rei' : 'O líder';
        if (this.kingdomSize(village) >= 4) this.crises.add(village.id);
        this.note(`${title} de ${village.name} morreu aos ${Math.floor(this.age[i])} anos`, 'povo', village);
      }
    }
    this.free.push(i);
  }

  private tileOf(i: number): number {
    const w = this.map.width;
    const tx = Math.floor(this.x[i]);
    const ty = Math.min(this.map.height - 1, Math.max(0, Math.floor(this.y[i])));
    return ty * w + (((tx % w) + w) % w);
  }

  private buildGrid(): void {
    this.gridHead.fill(-1);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const c = this.cellOf(this.x[i], this.y[i]);
      this.gridNext[i] = this.gridHead[c];
      this.gridHead[c] = i;
    }
  }

  private cellOf(x: number, y: number): number {
    const w = this.map.width;
    const cx = Math.floor((((x % w) + w) % w) / CELL);
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / CELL)));
    return cy * this.cols + cx;
  }

  /** Visita criaturas num raio (em tiles), considerando a volta horizontal do mapa. */
  forEachNear(x: number, y: number, radius: number, fn: (i: number, dx: number, dy: number) => void): void {
    const w = this.map.width;
    const r = Math.ceil(radius / CELL);
    const cx = Math.floor((((x % w) + w) % w) / CELL);
    const cy = Math.floor(y / CELL);
    for (let oy = -r; oy <= r; oy++) {
      const gy = cy + oy;
      if (gy < 0 || gy >= this.rows) continue;
      for (let ox = -r; ox <= r; ox++) {
        const gx = (((cx + ox) % this.cols) + this.cols) % this.cols;
        for (let i = this.gridHead[gy * this.cols + gx]; i >= 0; i = this.gridNext[i]) {
          if (!this.alive[i]) continue;
          let dx = this.x[i] - x;
          if (dx > w / 2) dx -= w;
          else if (dx < -w / 2) dx += w;
          const dy = this.y[i] - y;
          if (dx * dx + dy * dy <= radius * radius) fn(i, dx, dy);
        }
      }
    }
  }

  /** Avança a simulação `dt` segundos de jogo (já multiplicados pela velocidade escolhida). */
  step(dt: number): void {
    if (dt <= 0) return;
    this.year += dt / YEAR_SECONDS;
    this.buildGrid();
    const map = this.map;
    const w = map.width;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      // Movimento contínuo; nunca entra num tile fora do habitat nem sobe um penhasco (seção 19.18).
      const nx = this.x[i] + this.vx[i] * dt;
      const ny = this.y[i] + this.vy[i] * dt;
      const tile = Math.min(map.height - 1, Math.max(0, Math.floor(ny))) * w + (((Math.floor(nx) % w) + w) % w);
      const here = this.tileOf(i);
      if (this.detour[i] > 0) this.detour[i] -= dt;
      if (ny >= 0 && ny < map.height && this.canStep(this.kind[i], here, tile)) {
        this.x[i] = ((nx % w) + w) % w;
        this.y[i] = ny;
        if (this.stuck[i] > 0) this.stuck[i] = Math.max(0, this.stuck[i] - dt * 0.5);
      } else {
        // Travado na beira da água com o destino do outro lado: conta o tempo (jangada, em `decide`).
        if (ny >= 0 && ny < map.height && isWater(map, tile) && this.species[this.kind[i]].kind === 'sapient') this.stuck[i] += dt;
        if (!this.steer(i, here, dt)) {
          this.vx[i] = -this.vx[i] + (this.rnd() - 0.5) * 0.5;
          this.vy[i] = -this.vy[i] + (this.rnd() - 0.5) * 0.5;
        }
      }
      this.age[i] += dt / YEAR_SECONDS;
      this.think[i] -= dt;
      if (this.think[i] <= 0) {
        this.think[i] += THINK_INTERVAL;
        this.decide(i, THINK_INTERVAL);
      }
    }
    this.updateBoats(dt);
    this.updateRafts(dt);
    this.updateCaravans(dt);
    this.growVegetation(dt);
    for (let k = this.effects.length - 1; k >= 0; k--) {
      const fx = this.effects[k];
      fx.age += dt;
      if (fx.age >= fx.life) this.effects.splice(k, 1);
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this.villageClock += dt;
    if (this.villageClock >= 1) {
      this.updateVillages(this.villageClock);
      this.villageClock = 0;
    }
  }

  /**
   * Clima e vegetação (RF-SUP-07): a vegetação se espalha para vizinhos com
   * clima favorável e morre onde o clima ficou hostil.
   */
  /**
   * Taxas do momento num assentamento, por ano (RF-VIDA-310): para depurar e
   * calibrar, mostradas no painel com `?debug` no endereço.
   */
  rates(v: Village): { name: string; perYear: number }[] {
    const homes = v.houses.filter((h) => h.kind === 'house').length;
    const crowded = v.population >= 8 && v.population >= v.houses.length * 4 && !this.freeLot(v);
    const curious = v.culture.value === 'comércio' || v.culture.value === 'conhecimento' ? 2 : 1;
    return [
      { name: 'casa nova', perYear: v.population > homes * 3 ? B.HOUSE_RATE : 0 },
      { name: 'andarilho', perYear: B.WANDERER_RATE[v.population <= 3 ? 0 : v.population < 10 ? 1 : v.population < 30 ? 2 : 3] },
      { name: 'colonos', perYear: crowded && v.tier >= B.COLONY_MIN_TIER ? B.COLONY_RATE * (1 + 0.25 * Math.floor(v.tech)) * B.COLONY_PRESSURE_CROWDED : 0 },
      { name: 'porto', perYear: v.port < 0 && v.tech >= 0.5 ? B.PORT_RATE : 0 },
      { name: 'exploração', perYear: v.port >= 0 && v.tech >= 1 ? B.EXPLORE_RATE * curious : 0 },
      { name: 'colheita (× ano normal)', perYear: this.harvest(v) },
    ];
  }

  /**
   * Migração interna (RF-VIDA-281): de um assentamento apertado, com fome ou sem lenha, gente
   * muda para um vizinho do mesmo povo e espécie com lugar e comida sobrando, a até 60 tiles e
   * alcançável a pé. Na falta (seção 19.19) saem até SCARCITY_MOVERS por ano; sem vizinho, depois
   * de alguns anos de falta, parte do povo sai para fundar outro lugar (êxodo).
   */
  private migrate(): void {
    for (const v of this.villages) {
      if (v.abandoned || v.population < 6) continue;
      const tight = v.population > this.housing(v) - 1;
      const lack = this.scarcity(v);
      if (!(tight || lack > 0) || !happens(this.civRnd, B.MIGRATION_RATE * (1 + 2 * lack), 1)) continue;
      let best: Village | null = null;
      let bd = 60;
      for (const o of this.villages) {
        if (o === v || o.abandoned || o.species !== v.species || o.culture !== v.culture) continue;
        if (this.housing(o) - o.population < 3 || this.scarcity(o) > 0) continue;
        const d = this.distance(o, v.x, v.y);
        if (d < bd && this.landPath(v.x, v.y, o.x, o.y)) {
          bd = d;
          best = o;
        }
      }
      const why = lack > 0 ? ((v.needs?.food ?? 1) <= (v.needs?.fuel ?? 1) ? 'comida' : 'lenha') : 'lugar';
      if (!best) {
        // Êxodo: anos de falta sem vizinho para onde ir; parte do povo sai para fundar outro lugar.
        if (lack > 0 && (v.want ?? 0) >= 3 && v.population >= 10 && v.tier >= 0 && this.colonizeByLand(v)) {
          this.note(`Sem ${why}, parte do povo de ${v.name} partiu para longe`, 'povo', v, { key: `exodus-${v.id}` });
          v.want = 0;
          this.tally.exodus++;
        }
        continue;
      }
      const movers = lack > 0 ? Math.max(1, Math.round(B.SCARCITY_MOVERS * lack)) : 1;
      let moved = 0;
      for (let i = 0; i < this.count && moved < movers; i++) {
        if (!this.alive[i] || this.village[i] !== v.id || i === v.leader || this.role[i] === CHILD) continue;
        v.population--;
        this.village[i] = -1;
        (v.vitalNow ??= emptyVital()).left++;
        this.join(i, best);
        moved++;
        this.tally.migrants++;
      }
      if (moved) this.note(`Gente de ${v.name} se mudou para ${best.name} em busca de ${why}`, 'povo', best, { key: `migra-${v.id}-${best.id}` });
    }
  }

  /**
   * Epidemias (RF-VIDA-284): cidades grandes sem saneamento adoecem com mais
   * facilidade; o aqueduto da metrópole corta o risco.
   */
  private epidemics(): void {
    for (const v of this.villages) {
      if (v.abandoned || v.tier < 2) continue;
      const clean = v.houses.some((h) => h.kind === 'aqueduct') ? 0.25 : Math.floor(v.tech) >= 1 ? 0.6 : 1;
      if (!happens(this.civRnd, B.EPIDEMIC_RATE * (v.population / 100) * clean, 1)) continue;
      let toll = binomial(this.civRnd, v.population, B.EPIDEMIC_SHARE);
      if (toll <= 0) continue;
      const dead = toll;
      for (let i = 0; i < this.count && toll > 0; i++) {
        if (!this.alive[i] || this.village[i] !== v.id || i === v.leader) continue;
        if (this.civRnd() < 0.5) continue;
        this.kill(i, true, 'doença');
        toll--;
      }
      this.note(`Uma epidemia matou ${dead - toll} pessoas em ${v.name}${clean < 1 && clean > 0.3 ? '' : clean <= 0.3 ? ', mesmo com o aqueduto' : ': faltam poços e esgoto'}`, 'natureza', v);
    }
  }

  // Economia local por ano (seções 19.4 e 19.5) ------------------------------

  /**
   * Uma vez por ano: atendimento das necessidades, estabilidade, divisão do
   * trabalho, vocação, rebanhos, solo, tetos e carroças entre assentamentos
   * do mesmo reino.
   */
  private economyYear(): void {
    const people: number[][] = this.villages.map(() => []);
    for (let i = 0; i < this.count; i++) {
      const v = this.village[i];
      if (v >= 0 && this.alive[i] && this.role[i] !== CHILD) people[v].push(i);
    }
    for (const v of this.villages) {
      if (v.abandoned) continue;
      this.updateNeeds(v, people[v.id]?.length ?? 0);
      this.updateStability(v);
      this.shiftLabor(v, people[v.id] ?? []);
      this.updateVocation(v);
      this.updateHerd(v);
      this.updateSoil(v);
      this.upkeep(v);
      this.neglect(v);
      this.woodland(v);
      this.luxuryYear(v);
      this.clampStock(v);
      this.hardship(v);
      v.ledger = v.ledgerNow ?? {};
      v.ledgerNow = {};
      v.vital = v.vitalNow ?? emptyVital();
      v.vitalNow = emptyVital();
      const history = (v.history ??= []);
      history.push({ year: Math.floor(this.year), population: v.population, stock: Math.round(v.food + GOODS.reduce((n, g) => n + v.stock[g], 0)) });
      if (history.length > HISTORY_YEARS) history.shift();
    }
    this.haul();
    this.tradeYear();
    this.revolts();
  }

  /** Atendimento de cada necessidade no ano que passou, de 0 a 1 (RF-VIDA-210). */
  private updateNeeds(v: Village, adults: number): void {
    const l = v.ledgerNow ?? {};
    const ratio = (key: string) => {
      const e = l[key];
      return e && e[1] > 0 ? Math.min(1, e[0] / e[1]) : 1;
    };
    const pop = Math.max(1, v.population);
    const era = Math.floor(v.tech);
    if (v.wet === undefined) v.wet = this.nearWater(this.tileAt(v.x, Math.floor(v.y))) || this.coastal(v);
    const n = v.needs ?? fullNeeds();
    n.food = 0.6 * ratio('_fed') + 0.4 * Math.min(1, v.food / (pop * B.CONSUME_FOOD));
    n.water = v.wet ? 1 : this.has(v, 'aqueduct') ? 1 : v.tier >= 3 ? 0.5 : era >= 1 ? 0.85 : 0.75;
    // Lenha para o fogo e madeira para consertar as casas (seção 19.19).
    const fuel = l['_fuel'] ?? [0, 0];
    const fix = l['_upkeep'] ?? [0, 0];
    n.fuel = fuel[1] + fix[1] > 0 ? Math.min(1, (fuel[0] + fix[0]) / (fuel[1] + fix[1])) : 1;
    n.material = Math.min(1, this.housing(v) / pop);
    n.cloth = ratio('_cloth');
    n.tools = Math.min(1, v.stock.tools / Math.max(1, adults * 0.15));
    v.needs = n;
  }

  /**
   * Estabilidade (RF-VIDA-280 e RF-VIDA-136): sobe com as necessidades
   * atendidas, o templo e o sacerdote; cai com guerra, distância da capital e
   * cultura diferente da capital.
   */
  private updateStability(v: Village): void {
    const capital = this.villages[v.kingdom];
    const war = this.warOf(v.kingdom);
    let target = 0.3 + 0.6 * welfare(v.needs ?? fullNeeds());
    if (this.has(v, 'temple')) target += 0.08;
    if (v.luxuryJoy) target += B.LUXURY_STABILITY;
    if (war) target -= war.years > 10 ? 0.25 : 0.12;
    if (capital !== v) {
      target -= Math.min(0.2, this.distance(capital, v.x, v.y) / 300);
      if (capital.culture !== v.culture) target -= 0.1;
    }
    target = Math.max(0, Math.min(1, target));
    const s = v.stability ?? target;
    v.stability = s + (target - s) * B.STABILITY_PULL;
  }

  /**
   * Divisão do trabalho pela falta (RF-VIDA-214): uma parte dos adultos dos
   * setores mais folgados muda para o setor da necessidade mais mal
   * atendida, com peso extra para a vocação.
   */
  private shiftLabor(v: Village, adults: number[]): void {
    const n = v.needs;
    if (!n || adults.length < 2) return;
    const favour = v.vocation ? VOCATION_NEED[v.vocation] : undefined;
    const need = worstNeed(n, favour);
    const ctx = {
      era: Math.floor(v.tech),
      fields: v.fields > 0,
      port: v.port >= 0,
      herd: !!v.herd && v.herd.head > 0,
      loom: this.has(v, 'loom'),
      pottery: this.has(v, 'pottery') && !!v.wet,
      smithy: this.has(v, 'smithy'),
      vocation: v.vocation,
    };
    // Tudo atendido: só um pouco de gente vai para a profissão da vocação.
    const calm = n[need] >= 0.95;
    const role = calm ? (v.vocation ? VOCATION_ROLE[v.vocation] : null) : roleFor(need, ctx);
    if (!role || !this.roleContext(v)) return;
    if (role === 'fisher' && v.port < 0) return;
    if (role === 'shepherd' && !ctx.herd) return;
    if (role === 'miner' && calm && !v.mines.length) return;
    const target = ROLE[role];
    // Sobrevivência (seção 19.19): com fome ou sem lenha, muita gente larga o que faz (até soldados e mineradores).
    const crisis = !calm && (need === 'food' || need === 'fuel') && n[need] < B.CRISIS_NEED;
    let already = 0;
    for (const i of adults) if (this.role[i] === target) already++;
    const space = Math.max(1, Math.floor(adults.length * (crisis ? B.LABOR_CRISIS_MAX : B.LABOR_ROLE_MAX))) - already;
    if (space <= 0) return;
    let movers = Math.min(space, binomial(this.civRnd, adults.length, (crisis ? B.LABOR_CRISIS_SHIFT : B.LABOR_SHIFT) * (calm ? 0.15 : 1 - n[need])));
    for (const i of adults) {
      if (movers <= 0) break;
      // Idosos não mudam de trabalho: já não trabalham.
      if (this.age[i] >= elderAge(this.species[this.kind[i]], Math.floor(v.tech))) continue;
      const from = ROLES[this.role[i]];
      const sector = ROLE_NEED[from];
      if (this.role[i] === target || i === v.leader || from === 'leader' || from === 'king') continue;
      // Fora da crise, ferreiros e mineradores ficam (o trabalho deles também leva à próxima era), e só muda quem tem setor.
      if (!crisis && (!sector || from === 'blacksmith' || from === 'miner')) continue;
      // Soldados e guardas só largam as armas na fome brava.
      if ((from === 'soldier' || from === 'guard') && n[need] >= B.SEVERE_NEED) continue;
      if (!calm && sector && n[sector] < n[need] + 0.15) continue;
      if (calm && sector === need) continue;
      this.role[i] = target;
      movers--;
    }
  }

  /** Profissão de quem vira adulto: o que mais falta no assentamento, ou o sorteio pela era (seção 19.19). */
  private firstRole(v: Village, era: number): number {
    const n = v.needs;
    const drawn = pickRole(era, v.tier, this.rnd(), this.roleContext(v));
    // Quem foi chamado para as armas vai, com ou sem falta: o exército é escolha do líder.
    if (drawn === ROLE.soldier || drawn === ROLE.guard) return drawn;
    if (n) {
      const need = worstNeed(n, v.vocation ? VOCATION_NEED[v.vocation] : undefined);
      if (n[need] < B.CHILD_NEED && this.rnd() < 1 - n[need]) {
        const role = roleFor(need, {
          era,
          fields: v.fields > 0,
          port: v.port >= 0,
          herd: !!v.herd && v.herd.head > 0,
          loom: this.has(v, 'loom'),
          pottery: this.has(v, 'pottery') && !!v.wet,
          smithy: this.has(v, 'smithy'),
          vocation: v.vocation,
        });
        if (!(role === 'fisher' && v.port < 0) && !(role === 'shepherd' && !(v.herd && v.herd.head > 0))) return ROLE[role];
      }
    }
    return drawn;
  }

  /** Vocação que muda devagar quando a base acaba (RF-VIDA-222). */
  private updateVocation(v: Village): void {
    const voc = v.vocation;
    if (!voc) return;
    let bad = false;
    switch (voc) {
      case 'agricola':
        bad = v.tech >= 0.5 && (this.harvest(v) < 0.75 || (v.soil ?? 1) < B.SOIL_FALLOW);
        break;
      case 'gado':
      case 'ovelhas':
      case 'cavalos':
        bad = v.tech >= 1.2 && (!v.herd || v.herd.head < 2);
        break;
      case 'pesqueira':
        bad = v.tech >= 0.8 && v.port < 0;
        break;
      case 'mercantil':
        bad = !this.villages.some((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < B.HAUL_RANGE);
        break;
      case 'mineira':
        bad = v.tech >= 0.6 && !v.mines.length;
        break;
      case 'madeireira':
        bad = v.forest < 0.15;
        break;
    }
    v.badYears = bad ? (v.badYears ?? 0) + 1 : Math.max(0, (v.badYears ?? 0) - 2);
    if ((v.badYears ?? 0) < B.VOCATION_CHANGE_YEARS) return;
    const next = pickVocation(vocationWeights(this.siteSample(v)), this.civRnd(), voc);
    v.vocation = next;
    v.badYears = 0;
    this.note(`${v.name} deixou ${VOCATION_LEAVE[voc]} e passou a ${VOCATION_TAKE[next]}`, 'economia', v);
  }

  /** Amostra do lugar em volta do assentamento para a vocação (RF-VIDA-220). */
  private siteSample(v: Village): SiteSample {
    const r = this.radius(v) + 6;
    let fertile = 0;
    let open = 0;
    let hills = 0;
    let cold = 0;
    let dry = 0;
    let forest = 0;
    let n = 0;
    for (let k = 0; k < 40; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = Math.sqrt(this.civRnd()) * r;
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0 || !isLand(this.map, t)) continue;
      n++;
      const b = this.map.biome[t] as Biome;
      const veg = this.map.vegetation[t];
      const m = this.map.moisture[t];
      fertile += Math.min(1, veg * 1.4) * Math.min(1, m * 1.6);
      if (b === Biome.Grass || b === Biome.Savanna || b === Biome.Tundra) open++;
      if (this.map.elevation[t] > 0.3 || b === Biome.Rock || b === Biome.Mountain) hills++;
      if (temperatureAt(this.map, t) < B.COLD_K) cold++;
      if (m < 0.35) dry++;
      if (b === Biome.Forest || b === Biome.Jungle || veg > 0.6) forest++;
    }
    n = Math.max(1, n);
    let deposits = 0;
    for (const d of this.deposits) if (d.amount > 0 && this.distance(v, d.x + 0.5, d.y + 0.5) < r + 12) deposits++;
    let roads = 0;
    for (const o of this.villages) if (o !== v && !o.abandoned && this.distance(o, v.x, v.y) < 40) roads++;
    return { fertile: fertile / n, open: open / n, hills: hills / n, cold: cold / n, dry: dry / n, forest: forest / n, coast: this.coastal(v), deposits, roads, value: v.culture.value };
  }

  /** Sorteia a vocação de um assentamento novo; colônias tendem a herdar a da origem. */
  private chooseVocation(v: Village, from?: Village): void {
    if (from?.vocation && this.civRnd() < B.VOCATION_INHERIT) v.vocation = from.vocation;
    else v.vocation = pickVocation(vocationWeights(this.siteSample(v)), this.civRnd());
  }

  /**
   * Rebanho (RF-VIDA-215 e 285): domesticação a partir do fim da Idade da
   * Pedra, crescimento até o teto do pasto, cercados novos, predadores, praga
   * que pula para os rebanhos vizinhos (RF-VIDA-305) e sobrepastoreio (RF-VIDA-294).
   */
  private updateHerd(v: Village): void {
    if (!v.herd || v.herd.head <= 0) {
      // Curral vazio não fica de pé para sempre: as cercas vão sendo desmontadas.
      if (v.pens?.length && happens(this.civRnd, B.PEN_RATE, 1)) this.removePen(v);
      if (v.tech >= 0.9 && happens(this.civRnd, B.DOMESTICATE_RATE, 1)) this.domesticate(v);
      return;
    }
    const h = v.herd;
    const pens = v.pens?.length ?? 0;
    const cap = Math.max(2, (pens * B.PEN_AREA) / B.PASTURE_PER_HEAD);
    const w = this.workersOf(v);
    const tend = Math.min(1, 0.5 + (w[ROLE.shepherd] * 6) / h.head);
    const horses = h.kind === 'horse' || h.kind === 'camel';
    const keeper = horses && this.has(v, 'stable') ? 1 + 0.5 * Math.min(1, w[ROLE.horsekeeper]) : 1;
    const sick = (h.plague ?? 0) > this.year ? 0.3 : 1;
    h.head += binomial(this.civRnd, h.head, Math.max(0, B.HERD_GROWTH * (1 - h.head / cap) * tend * keeper * sick));
    h.head = Math.min(h.head, Math.ceil(cap));
    // Predadores rondam o pasto.
    let predators = 0;
    this.forEachNear(v.x, v.y, this.radius(v) + 8, (j) => {
      if (this.species[this.kind[j]].kind === 'predator') predators++;
    });
    if (predators) {
      const lost = Math.min(h.head, binomial(this.civRnd, predators, 1 - Math.exp(-B.HERD_PREDATION)));
      h.head -= lost;
      if (lost >= 3) this.note(`Predadores atacaram o rebanho de ${v.name}`, 'natureza', v, { key: `pred-${v.id}` });
    }
    if ((h.plague ?? 0) <= this.year && happens(this.civRnd, B.HERD_PLAGUE_RATE * (1 + h.head / 40), 1)) this.herdPlague(v, null);
    if (horses) v.stock.horses = h.head;
    // Pasto cheio: mais um cercado, até o limite do nível.
    const maxPens = maxPensOf(v.tier, v.vocation);
    if (h.head > cap * 0.8 && pens < maxPens && happens(this.civRnd, B.PEN_RATE, 1)) this.addPen(v);
    // Cercados demais para o rebanho que sobrou (ou acima do limite): o mais longe é desmontado.
    const needed = Math.max(1, Math.ceil((h.head * B.PASTURE_PER_HEAD) / (B.PEN_AREA * 0.8)));
    if ((pens > needed + 1 || pens > maxPens) && happens(this.civRnd, B.PEN_RATE, 1)) this.removePen(v);
    // Sobrepastoreio: o verde em volta dos cercados cheios diminui.
    if (h.head > cap * 0.7 && !h.away) {
      for (const p of v.pens ?? []) {
        const t = this.tileAt(p.x + Math.floor(this.civRnd() * 4) - 1, p.y + Math.floor(this.civRnd() * 4) - 1);
        if (t >= 0 && this.map.vegetation[t] > 0.1 && !this.road[t] && !this.built[t]) {
          this.map.vegetation[t] = Math.max(0, this.map.vegetation[t] - 0.04);
          this.onTileChanged(t);
        }
      }
    }
    if (h.head <= 0) {
      v.herd = undefined;
      if (horses) v.stock.horses = 0;
    }
  }

  /** Profissões dos moradores de um assentamento agora. */
  private workersOf(v: Village): number[] {
    const w = new Array<number>(ROLES.length).fill(0);
    for (let i = 0; i < this.count; i++) if (this.alive[i] && this.village[i] === v.id && this.role[i] !== CHILD) w[this.role[i]]++;
    return w;
  }

  /** Domestica herbívoros da região: um bicho por perto é capturado e começa o rebanho. */
  private domesticate(v: Village): void {
    let wild = -1;
    this.forEachNear(v.x, v.y, this.radius(v) + 20, (j) => {
      const k = this.kind[j];
      if (wild < 0 && this.species[k].kind === 'herbivore' && this.population[k] > this.caps[k] * 0.2) wild = j;
    });
    if (wild < 0) return;
    const s = this.siteSample(v);
    const b = this.map.biome[this.tileAt(v.x, Math.floor(v.y))] as Biome;
    const kind = herdFor(v.vocation, s, b === Biome.Desert || b === Biome.Savanna);
    if (!v.pens?.length && !this.addPen(v)) return;
    this.kill(wild, true);
    v.herd = { kind, head: 3 };
    this.note(`${v.name} domesticou ${HERD_NAMES[kind]}`, 'economia', v);
  }

  /** Cercado de pasto na borda da área ou logo fora dela (tiles de pasto, 2x2). */
  private addPen(v: Village): boolean {
    const tiles = this.freeLot(v, true) ?? this.outerLot(v);
    if (!tiles) return false;
    for (const t of tiles) {
      this.road[t] = 5;
      this.onTileChanged(t);
    }
    const w = this.map.width;
    (v.pens ??= []).push({ x: tiles[0] % w, y: Math.floor(tiles[0] / w) });
    return true;
  }

  /**
   * Lote 2x2 de terra livre logo fora da área, colado na borda (pasto e roças
   * que não cabem dentro). Não vai para o lado de um vizinho: o lote fica
   * longe da área dos outros e mais perto deste centro que de qualquer outro.
   */
  private outerLot(v: Village): number[] | null {
    const r = Math.ceil(this.radius(v));
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < r + this.radius(o) + 8);
    for (let k = 0; k < 40; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = r + 1 + this.civRnd() * 2;
      const x = Math.floor(v.x + Math.cos(a) * d);
      const y = Math.floor(v.y + Math.sin(a) * d);
      const cx = x + 1;
      const cy = y + 1;
      if (near.some((o) => this.distance(o, cx, cy) < this.radius(o) + 3 || this.distance(o, cx, cy) < d)) continue;
      const tiles = [this.tileAt(x, y), this.tileAt(x + 1, y), this.tileAt(x, y + 1), this.tileAt(x + 1, y + 1)];
      if (tiles.every((t) => t >= 0 && isLand(this.map, t) && !this.road[t] && !this.built[t] && this.depositAt[t] < 0 && this.flat(t))) return tiles;
    }
    return null;
  }

  /** Desmonta o cercado mais longe do centro: o chão volta a ser campo. */
  private removePen(v: Village): void {
    const pens = v.pens;
    if (!pens?.length) return;
    let k = 0;
    for (let j = 1; j < pens.length; j++) if (this.distance(v, pens[j].x + 1, pens[j].y + 1) > this.distance(v, pens[k].x + 1, pens[k].y + 1)) k = j;
    const p = pens.splice(k, 1)[0];
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = this.tileAt(p.x + dx, p.y + dy);
        if (t < 0 || this.road[t] !== 5) continue;
        this.road[t] = 0;
        this.onTileChanged(t);
      }
    }
  }

  /** Praga no rebanho: mata parte dos animais e pode pular para os rebanhos vizinhos. */
  private herdPlague(v: Village, from: Village | null): void {
    const h = v.herd;
    if (!h || h.head <= 0) return;
    const dead = binomial(this.civRnd, h.head, 0.35 + this.civRnd() * 0.25);
    h.head -= dead;
    h.plague = this.year + 3;
    this.note(
      from ? `A praga do rebanho chegou de ${from.name} a ${v.name}: morreram ${dead} ${HERD_NAMES[h.kind]}` : `Uma praga atingiu o rebanho de ${v.name}: morreram ${dead} ${HERD_NAMES[h.kind]}`,
      'natureza',
      v,
    );
    if (from) return;
    for (const o of this.villages) {
      if (o === v || o.abandoned || !o.herd || o.herd.head <= 0 || (o.herd.plague ?? 0) > this.year) continue;
      const d = this.distance(o, v.x, v.y);
      if (d < B.HERD_PLAGUE_RANGE && this.civRnd() < B.HERD_PLAGUE_SPREAD * (1 - d / B.HERD_PLAGUE_RANGE)) this.herdPlague(o, v);
    }
  }

  /**
   * Solo das roças (RF-VIDA-294): roça no mesmo lugar cansa a terra (menos
   * com rotação, a partir da Era Medieval) e o desmatamento causa erosão;
   * com o solo fraco, parte das roças fica em pousio até ele se recuperar.
   * Quebra de safra vira notícia (RF-VIDA-285).
   */
  private updateSoil(v: Village): void {
    const soil = v.soil ?? 1;
    const fallow = soil < B.SOIL_FALLOW;
    let next = soil + (1 - soil) * B.SOIL_RECOVER * (fallow ? 1 : 0.3);
    if (v.fields > 0 && !fallow) next -= B.SOIL_WEAR * (Math.floor(v.tech) >= 3 ? 0.5 : 1) * Math.min(2, v.fields / 4);
    if (v.forest < 0.1) next -= 0.004;
    v.soil = Math.max(0.2, Math.min(1, next));
    if (!fallow && v.soil < B.SOIL_FALLOW) this.note(`A terra de ${v.name} cansou: parte das roças ficou em pousio`, 'economia', v, { key: `pousio-${v.id}` });
    if (v.fields > 0 && this.harvest(v) < B.CROP_FAILURE) this.note(`Quebra de safra em ${v.name}`, 'natureza', v, { key: `safra-${v.id}` });
  }

  /**
   * Fome, frio e falta (seção 19.19): mortes de fome e de frio vão para a crônica, e os anos
   * seguidos de falta de comida, lenha ou casa contam para a migração, o êxodo e a cobiça.
   */
  private hardship(v: Village): void {
    const dead = v.vitalNow?.deaths ?? {};
    const hunger = dead.fome ?? 0;
    const cold = dead.frio ?? 0;
    if (hunger >= B.FAMINE_DEATHS) this.note(`Fome em ${v.name}: ${hunger} morreram este ano`, 'natureza', v, { key: `famine-${v.id}`, major: hunger >= 6 });
    if (cold >= B.FAMINE_DEATHS) this.note(`Frio em ${v.name}: sem lenha, ${cold} morreram no inverno`, 'natureza', v, { key: `freeze-${v.id}` });
    v.want = this.scarcity(v) > 0 ? (v.want ?? 0) + 1 : 0;
  }

  /** Quanto falta de comida e de lenha no assentamento, de 0 (nada) a 1 (tudo). */
  scarcity(v: Village): number {
    const n = v.needs;
    if (!n) return 0;
    return Math.max(0, B.SCARCITY_LEVEL - Math.min(n.food, n.fuel)) / B.SCARCITY_LEVEL;
  }

  /** O que passou do teto se perde (sobra que não cabe no armazém). */
  private clampStock(v: Village): void {
    const c = this.capContext(v);
    const cap = foodCap(c);
    // Não vira ouro nem vai para outro lugar: o que não cabe estraga ou se perde (pedido do Joab, seção 19.19).
    if (v.food > cap) this.spend(v, 'food', v.food - cap);
    for (const g of GOODS) {
      const max = goodCap(g, c);
      if (v.stock[g] > max) this.spend(v, g, v.stock[g] - max);
    }
  }

  /**
   * Carroças (RF-VIDA-212): o que sobra num assentamento vai, carregado, para
   * um vizinho do mesmo reino onde falta, a pé e a até HAUL_RANGE tiles.
   * Entre reinos, as trocas continuam no comércio (`trade`).
   */
  private haul(): void {
    const kingdoms = new Map<number, Village[]>();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const list = kingdoms.get(v.kingdom) ?? [];
      list.push(v);
      kingdoms.set(v.kingdom, list);
    }
    for (const list of kingdoms.values()) {
      if (list.length < 2) continue;
      for (const a of list) {
        for (const b of list) {
          if (a === b || this.distance(a, b.x, b.y) > B.HAUL_RANGE) continue;
          let moved = false;
          for (const g of [...GOODS, 'food'] as (Good | 'food')[]) {
            const capA = this.capOf(a, g);
            const capB = this.capOf(b, g);
            const have = g === 'food' ? a.food : a.stock[g];
            const want = g === 'food' ? b.food : b.stock[g];
            // Minério vai para quem tem ferraria; o resto, de onde sobra para onde falta.
            const ore = g === 'copper' || g === 'tin' || g === 'iron' || g === 'coal';
            const forge = ore && this.has(b, 'smithy') && !this.has(a, 'smithy');
            if (!forge && (have < capA * B.HAUL_HIGH || want > capB * B.HAUL_LOW)) continue;
            // Reino que cunha moeda troca mais dentro de si (RF-VIDA-291).
            const most = B.HAUL_LOAD * (this.villages[a.kingdom].mint ? B.MINT_HAUL : 1);
            const load = forge ? Math.min(most, have, capB - want) : Math.min(most, have - capA * B.HAUL_HIGH, capB * B.HAUL_LOW - want);
            if (load < 1) continue;
            if (!moved && !this.landPath(a.x, a.y, b.x, b.y)) break;
            moved = true;
            if (g === 'food') {
              a.food -= load;
              b.food += load;
            } else {
              a.stock[g] -= load;
              b.stock[g] += load;
            }
            this.book(a, 'saiu', 0, load);
            this.book(b, 'chegou', load, 0);
          }
        }
      }
    }
  }

  /** Revolta (RF-VIDA-280): assentamento muito instável longe da capital se separa do reino. */
  private revolts(): void {
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom === v.id || (v.stability ?? 1) >= B.REVOLT_STABILITY || v.population < 10) continue;
      if (!happens(this.polRnd, B.REVOLT_RATE, 1)) continue;
      const capital = this.villages[v.kingdom];
      const why = v.needs ? NEED_NAMES[worstNeed(v.needs)] : 'tudo';
      this.newKingdom(v, capital);
      this.relations.set(this.key(capital.id, v.id), -40);
      this.note(`${v.name} se revoltou contra ${capital.name}: faltava ${why}`, 'povo', v, { major: true });
    }
  }

  /** Região do clima do ano que contém o tile (x, y). */
  private region(x: number, y: number): number {
    const [cols, rows] = B.CLIMATE_REGIONS;
    const rx = Math.min(cols - 1, Math.floor((x * cols) / this.map.width));
    const ry = Math.min(rows - 1, Math.max(0, Math.floor((y * rows) / this.map.height)));
    return ry * cols + rx;
  }

  /** Clima do ano no ponto (0 = normal). */
  climateAt(x: number, y: number): number {
    return this.climate[this.region(((Math.floor(x) % this.map.width) + this.map.width) % this.map.width, Math.floor(y))];
  }

  /** Quanto a colheita rende neste ano no assentamento (1 = ano normal). */
  harvest(v: Village): number {
    return Math.max(0.15, 1 + B.HARVEST_SENSITIVITY * this.climateAt(v.x, v.y));
  }

  /** Um ano de clima: ruído com retorno à média, comum e regional; secas fortes vão para a crônica. */
  private updateClimate(): void {
    const shared = Math.sqrt(B.CLIMATE_SHARED);
    const local = Math.sqrt(1 - B.CLIMATE_SHARED);
    this.climateShared = ouStep(this.climateRnd, this.climateShared, 1, B.CLIMATE_THETA, B.CLIMATE_SIGMA);
    for (let r = 0; r < this.climate.length; r++) {
      this.climateLocal[r] = ouStep(this.climateRnd, this.climateLocal[r], 1, B.CLIMATE_THETA, B.CLIMATE_SIGMA);
      this.climate[r] = shared * this.climateShared + local * this.climateLocal[r];
    }
    for (let r = 0; r < this.climate.length; r++) {
      if (this.climate[r] >= B.DROUGHT_LEVEL || this.year - this.droughtNoted[r] < B.DROUGHT_COOLDOWN) continue;
      const hit = this.villages.filter((v) => !v.abandoned && this.region(Math.floor(v.x), Math.floor(v.y)) === r);
      if (!hit.length) continue;
      this.droughtNoted[r] = this.year;
      const names = hit.slice(0, 3).map((v) => v.name);
      this.note(`Uma seca castiga a região de ${names.join(', ')}${hit.length > 3 ? ' e arredores' : ''}: as colheitas minguam`, 'natureza', hit[0], { key: `drought-${r}` });
    }
  }

  private growVegetation(dt: number): void {
    const m = this.map;
    const n = m.width * m.height;
    const samples = Math.min(40000, Math.round(n * 0.04 * dt));
    for (let k = 0; k < samples; k++) {
      const i = Math.floor(this.rnd() * n);
      if (m.elevation[i] < 0) continue;
      const cap = vegetationCap(m, i);
      const ok = cap > 0;
      const x = i % m.width;
      const y = (i - x) / m.width;
      const nx = (x + Math.floor(this.rnd() * 3) - 1 + m.width) % m.width;
      const ny = y + Math.floor(this.rnd() * 3) - 1;
      const neighbour = ny >= 0 && ny < m.height ? m.vegetation[ny * m.width + nx] : 0;
      const before = m.vegetation[i];
      // Espalha a partir dos vizinhos; um tile pastado ainda rebrota devagar pelas raízes.
      const season = ok ? Math.max(0.2, 1 + B.HARVEST_SENSITIVITY * this.climate[this.region(x, y)]) : 1;
      // Nada passa do que o lugar aguenta; mato baixo rebrota rápido e mata fechada (acima de TREE_BAND) cresce devagar (seção 19.19).
      if (before > cap) m.vegetation[i] = Math.max(cap, before - 0.05);
      else if (ok && neighbour > 0.3) m.vegetation[i] = Math.min(cap, before + 0.05 * season * (before >= B.TREE_BAND ? B.TREE_SPREAD : 1));
      else if (ok && before > 0.02 && before < 0.35) m.vegetation[i] = Math.min(cap, before + 0.02 * season);
      // Toco e muda: o capim cresce em volta, mas a árvore só volta no tempo dela (growForests).
      if (m.felled?.[i] && m.vegetation[i] > B.FELLED_VEG_MAX) m.vegetation[i] = Math.max(Math.min(before, m.vegetation[i]), B.FELLED_VEG_MAX);
      if (m.vegetation[i] !== before) {
        m.biome[i] = classify(m, i);
        this.onTileChanged(i);
      }
    }
  }

  private wander(i: number, speed: number, bias?: { x: number; y: number }): void {
    this.aimX[i] = bias ? bias.x : 0;
    this.aimY[i] = bias ? bias.y : 0;
    const a = this.rnd() * Math.PI * 2;
    let dx = Math.cos(a);
    let dy = Math.sin(a);
    const v = Math.hypot(this.vx[i], this.vy[i]);
    // Contornando um obstáculo: segue rente a ele mais um pouco antes de voltar a mirar o destino (seção 19.18).
    if (this.detour[i] > 0 && v > 0.05) {
      const go = Math.max(v, speed * 0.6);
      this.vx[i] = (this.vx[i] / v) * go;
      this.vy[i] = (this.vy[i] / v) * go;
      return;
    }
    // Sem destino, segue mais ou menos na mesma direção: explora o mapa em vez de rodar no lugar.
    if (!bias && v > 0.05) {
      dx = dx * 0.45 + (this.vx[i] / v) * 0.55;
      dy = dy * 0.45 + (this.vy[i] / v) * 0.55;
    }
    if (bias) {
      dx = dx * 0.4 + bias.x * 0.6;
      dy = dy * 0.4 + bias.y * 0.6;
    }
    const len = Math.hypot(dx, dy) || 1;
    const go = this.rnd() < 0.15 ? 0 : speed * (0.5 + this.rnd() * 0.5);
    this.vx[i] = (dx / len) * go;
    this.vy[i] = (dy / len) * go;
  }

  private decide(i: number, dt: number): void {
    const map = this.map;
    const s = this.kind[i];
    const sp = this.species[s];
    const b = BEHAVIOUR[sp.kind];
    const tile = this.tileOf(i);
    const temp = temperatureAt(map, tile);
    let e = this.energy[i] - b.metabolism * dt;
    if (temp < sp.tempMin || temp > sp.tempMax) e -= 0.2 * dt;
    // O habitat pode ter mudado por baixo da criatura (terraformação).
    if (!this.canStand(s, tile)) e -= 0.6 * dt;

    // Fora do clima da espécie (ou na beirada dele), todo bicho procura um lugar melhor.
    const outside = temp < sp.tempMin || temp > sp.tempMax;
    const comfort = temp < sp.tempMin + 2 || temp > sp.tempMax - 2 ? this.comfortBias(i, temp) : undefined;
    // Adulto bem alimentado e sem parceiro por perto vai atrás de um (às vezes, para poupar tempo).
    const mate = sp.kind !== 'sapient' && e > 0.55 && this.age[i] >= sp.maturity && this.rnd() < 0.35 ? this.seekMate(i) : undefined;

    switch (sp.kind) {
      case 'fish': {
        // Plâncton: o mar alimenta bem um peixe sozinho e mal um cardume apertado,
        // então a população fica abaixo do teto e oscila com tubarões, pesca e clima.
        if (isWater(map, tile)) {
          let school = 0;
          this.forEachNear(this.x[i], this.y[i], 3, (j) => {
            if (this.species[this.kind[j]].kind === 'fish') school++;
          });
          e += (0.075 * dt) / (1 + school / 5);
        }
        this.wander(i, sp.speed, comfort ?? mate);
        break;
      }
      case 'herbivore': {
        // Anfíbios (tartaruga, sapo, caranguejo, pinguim) também comem na água.
        // Na água comem algas e bichinhos; como no mar dos peixes, rende menos quando estão amontoados.
        if (this.habitat[s] === 2 && isWater(map, tile)) {
          let crowd = 0;
          this.forEachNear(this.x[i], this.y[i], 3, (j) => {
            if (this.kind[j] === s) crowd++;
          });
          e += (0.12 * dt) / (1 + crowd / 4);
        }
        const veg = map.vegetation[tile];
        if (veg > 0.12) {
          const bite = Math.min(veg - 0.1, 0.025);
          map.vegetation[tile] = veg - bite;
          e += bite * 9;
          this.onTileChanged(tile);
        }
        // Com fome, procura pasto: olha mais longe quanto mais fome tem. Foge de predadores.
        let best = { x: 0, y: 0 };
        let bestVeg = veg;
        const hungry = e < 0.75;
        const looks = hungry ? 10 : 3;
        for (let k = 0; k < looks; k++) {
          const a = this.rnd() * Math.PI * 2;
          const r = hungry ? 3 + this.rnd() * (e < 0.4 ? 14 : 7) : 4;
          const t = this.tileAt(this.x[i] + Math.cos(a) * r, Math.floor(this.y[i] + Math.sin(a) * r));
          if (t < 0 || !this.canStand(s, t)) continue;
          const tt = temperatureAt(map, t);
          if (tt < sp.tempMin || tt > sp.tempMax) continue;
          // Pasto um pouco melhor não compensa uma caminhada longa.
          const value = map.vegetation[t] - r * 0.01;
          if (value > bestVeg) {
            bestVeg = value;
            best = { x: Math.cos(a), y: Math.sin(a) };
          }
        }
        let flee: { x: number; y: number } | undefined;
        this.forEachNear(this.x[i], this.y[i], 5, (j, dx, dy) => {
          if (this.species[this.kind[j]].kind === 'predator') flee = { x: -dx, y: -dy };
        });
        const food = best.x || best.y ? best : undefined;
        this.wander(i, sp.speed, flee ?? comfort ?? (hungry ? food : (mate ?? food)));
        break;
      }
      case 'predator': {
        let prey = -1;
        let pd = Infinity;
        let pdx = 0;
        let pdy = 0;
        // Predadores anfíbios (crocodilo) também pegam peixes.
        const fishToo = this.habitat[s] === 2;
        // Com muita fome, procura presa bem mais longe.
        const reach = e < 0.35 ? 36 : 20;
        this.forEachNear(this.x[i], this.y[i], reach, (j, dx, dy) => {
          const k = this.species[this.kind[j]].kind;
          const d = dx * dx + dy * dy;
          // Qualquer predador pesca o peixe que passa na beira d'água (urso no rio); os anfíbios, em qualquer lugar.
          if (k !== 'herbivore' && !(k === 'fish' && (fishToo || d < 4))) return;
          // Presas raras se escondem melhor: a espécie não some de uma vez.
          if (this.population[this.kind[j]] < this.caps[this.kind[j]] * 0.15) return;
          if (d < pd) {
            pd = d;
            prey = j;
            pdx = dx;
            pdy = dy;
          }
        });
        // Bichos pequenos (roedores, insetos, carniça) cobrem parte da fome no mato; onívoros comem também frutos e raízes.
        if (map.vegetation[tile] > 0.2) e += (sp.omnivore ? 0.032 : 0.016) * dt;
        if (prey >= 0 && pd < 1.44 && e < 0.8) {
          this.kill(prey, false, 'predador');
          e += 0.6;
          this.wander(i, sp.speed * 0.3);
        } else if (prey >= 0 && e < 0.65 && !outside) {
          const len = Math.sqrt(pd) || 1;
          this.vx[i] = (pdx / len) * sp.speed;
          this.vy[i] = (pdy / len) * sp.speed;
        } else {
          // Sem presa à vista e com fome, anda mais rápido para onde é mais verde (onde a caça pasta); satisfeito, procura parceiro.
          this.wander(i, sp.speed * (e < 0.5 ? 0.9 : 0.6), comfort ?? (e < 0.5 ? this.greener(i, 12) : mate));
        }
        break;
      }
      case 'shark': {
        // Caça peixes e ataca barcos que passam perto; lulas e carniça cobrem parte da fome.
        if (isWater(map, tile)) e += 0.014 * dt;
        let prey = -1;
        let pd = Infinity;
        let pdx = 0;
        let pdy = 0;
        this.forEachNear(this.x[i], this.y[i], e < 0.4 ? 24 : 12, (j, dx, dy) => {
          if (this.species[this.kind[j]].kind !== 'fish') return;
          const d = dx * dx + dy * dy;
          if (d < pd) {
            pd = d;
            prey = j;
            pdx = dx;
            pdy = dy;
          }
        });
        const boat = e < 0.6 ? this.boatNear(this.x[i], this.y[i], 6) : null;
        if (boat) {
          const dx = wrapDx(boat.x - this.x[i], map.width);
          const dy = boat.y - this.y[i];
          const d = Math.hypot(dx, dy) || 1;
          if (d < 1.2) {
            this.sharkAttack(boat, sp.name);
            e += 0.4;
          }
          this.vx[i] = (dx / d) * sp.speed;
          this.vy[i] = (dy / d) * sp.speed;
        } else if (prey >= 0 && pd < 2.25) {
          // Dá o bote a até 1,5 tile.
          this.kill(prey, false, 'predador');
          e += 0.9;
          this.wander(i, sp.speed * 0.3);
        } else if (prey >= 0 && e < 0.85 && !outside) {
          const len = Math.sqrt(pd) || 1;
          this.vx[i] = (pdx / len) * sp.speed;
          this.vy[i] = (pdy / len) * sp.speed;
        } else {
          this.wander(i, sp.speed * (e < 0.5 ? 0.8 : 0.5), comfort ?? (e < 0.5 ? undefined : mate));
        }
        break;
      }
      case 'sapient': {
        // Sozinho (solto pelo jogador): procura um assentamento do seu povo ou funda um.
        const lone = this.village[i] < 0 ? this.loner(i) : undefined;
        const v = this.village[i] >= 0 ? this.villages[this.village[i]] : null;
        const era = Math.floor(v?.tech ?? 0);
        const veg = map.vegetation[tile];
        // Quem vive num assentamento belisca pouco no mato: o grosso da comida vem do estoque (seção 19.19).
        // Sozinho no mato, vive do que acha.
        if (v) {
          // Um bando pequeno ainda vive do mato; com mais gente em volta, cada um acha menos.
          if (veg > 0.25) e += Math.max(B.FORAGE, B.FORAGE_WILD / (1 + v.population / B.FORAGE_CROWD)) * dt;
          if (this.nearWater(tile)) e += B.SHORE_FORAGE * dt;
          // Inverno frio sem lenha.
          if (v.chill) e -= B.FREEZE * v.chill * dt;
        } else {
          if (veg > 0.1) e += 0.06 * dt;
          if (this.nearWater(tile)) e += 0.05 * dt;
        }
        // Quem tem fome come o peixe que os barcos trouxeram.
        if (v && v.food >= 1 && e < 0.6) {
          v.food -= 1;
          this.book(v, 'food', 0, 1);
          e += 0.35;
        }
        // Crianças ganham uma profissão ao virar adultas.
        if (v && this.role[i] === CHILD && this.age[i] >= sp.maturity) this.role[i] = this.firstRole(v, era);
        const elder = this.age[i] >= elderAge(sp, era);
        const working = this.role[i] !== CHILD && !elder;
        let bias: { x: number; y: number } | undefined = lone;
        if (v) {
          let dx = v.x - this.x[i];
          if (dx > map.width / 2) dx -= map.width;
          else if (dx < -map.width / 2) dx += map.width;
          let dy = v.y - this.y[i];
          const role = this.role[i];
          // Crianças, idosos, soldados, guardas e líderes ficam perto do centro; pescadores, perto do porto.
          let range = this.radius(v) * (role >= ROLE.soldier || !working ? 0.4 : 0.8);
          if (role === ROLE.fisher && v.port >= 0) {
            dx = wrapDx((v.port % map.width) + 0.5 - this.x[i], map.width);
            dy = Math.floor(v.port / map.width) + 0.5 - this.y[i];
            range = 4;
          } else if (role === ROLE.miner && working && v.mines.length) {
            // Mineradores trabalham na mina do assentamento.
            const d = this.deposits[v.mines[i % v.mines.length]];
            dx = wrapDx(d.x + 0.5 - this.x[i], map.width);
            dy = d.y + 0.5 - this.y[i];
            range = 2;
          } else if (role === ROLE.woodcutter && working && (v.fellAt ?? -1) >= 0) {
            // Lenhadores vão até a mata onde a próxima árvore vai cair (seção 19.19).
            const t = v.fellAt!;
            dx = wrapDx((t % map.width) + 0.5 - this.x[i], map.width);
            dy = Math.floor(t / map.width) + 0.5 - this.y[i];
            range = 2.5;
          } else if (role === ROLE.gatherer && working) {
            // Coletores andam até onde ainda há o que colher, além da borda.
            range = this.radius(v) + B.GATHER_REACH * 0.6;
          } else if (working && (role === ROLE.hunter || role === ROLE.miner)) {
            // Caçadores e mineradores sem mina exploram longe de casa, mais longe a cada era.
            range = this.radius(v) * (role === ROLE.miner ? 2.5 : 1.8) * (1 + 0.25 * era);
          }
          if (working && role <= ROLE.miner && this.rnd() < 0.3) this.discover(i, v);
          const march = this.soldier(i, v);
          if (!this.alive[i]) return;
          if (march) {
            dx = march.x;
            dy = march.y;
            range = 2;
          }
          if (dx * dx + dy * dy > range * range) bias = { x: dx, y: dy };
          // Caçadores abatem herbívoros por perto; com fome e sem comida no celeiro, qualquer adulto caça.
          if (((role === ROLE.hunter && working) || (this.role[i] !== CHILD && e < 0.4 && v.food < 1)) && e < 0.8) {
            let prey = -1;
            this.forEachNear(this.x[i], this.y[i], 3, (j) => {
              // Caça sustentável: poupa a espécie quando ela fica rara.
              const k = this.kind[j];
              if (prey < 0 && this.species[k].kind === 'herbivore' && this.population[k] > this.caps[k] * 0.25) prey = j;
            });
            if (prey >= 0) {
              this.kill(prey, false, 'predador');
              // A carne vai para o estoque e alimenta o assentamento (seção 19.19); a caça também dá peles.
              e += B.HUNT_EAT;
              this.book(v, '_hunt', this.put(v, 'food', B.HUNT_FOOD), 0);
              this.gain(v, 'hides', 1);
            }
          }
        }
        // Sozinho e com fome: procura onde há o que comer (verde ou água), como os outros bichos.
        if (!v && e < 0.5) bias = this.betterSite(i) ?? bias;
        // Fora do clima, mesmo com assentamento, primeiro se protege.
        if (comfort && (!v || e < 0.4)) bias = comfort;
        this.wander(i, sp.speed * (this.role[i] === CHILD ? 0.8 : elder ? 0.55 : 1), bias);
        // Muito tempo travado na beira da água com o destino do outro lado: corta árvores e faz uma jangada.
        if (this.stuck[i] >= B.RAFT_STUCK && this.role[i] !== CHILD && this.tryRaft(i)) return;
        break;
      }
    }

    this.energy[i] = Math.min(1, e);
    const v = this.village[i];
    const era = v >= 0 ? Math.floor(this.villages[v].tech) : 0;
    const life = lifespan(sp, era);
    const old = this.age[i] > life * (0.85 + 0.3 * ((i * 2654435761) % 1000) / 1000);
    if (this.energy[i] <= 0 || old) {
      const cold = v >= 0 && (this.villages[v].chill ?? 0) > 0.3 && (this.villages[v].food ?? 0) >= 1;
      const cause: DeathCause = this.energy[i] > 0 ? 'velhice' : cold ? 'frio' : 'fome';
      if (v >= 0 && this.villages[v].population === 1) this.villages[v].lastCause = cause === 'velhice' ? 'de velhice' : cause === 'frio' ? 'de frio' : 'de fome';
      this.kill(i, false, cause);
      return;
    }
    // Reprodução (idosos não têm filhos).
    const fertile = this.age[i] >= sp.maturity && (sp.kind !== 'sapient' || this.age[i] < elderAge(sp, era));
    // Necessidades mal atendidas freiam a natalidade dos inteligentes (RF-VIDA-210).
    const needs = v >= 0 ? this.villages[v].needs : undefined;
    const content = needs ? 0.5 + 0.5 * welfare(needs) : 1;
    if (fertile && this.energy[i] > 0.65 && happens(this.rnd, b.birthRate * this.fertility(s, era) * content, dt)) {
      // Precisa de um parceiro adulto por perto (do mesmo assentamento, para os inteligentes).
      // Bichos acham o parceiro num raio maior (o cheiro e o chamado vão longe).
      let crowd = 0;
      let mates = 0;
      const reach = sp.kind === 'sapient' ? CELL : CELL * 1.5;
      this.forEachNear(this.x[i], this.y[i], reach, (j, dx, dy) => {
        if (this.kind[j] !== s) return;
        if (dx * dx + dy * dy <= CELL * CELL) crowd++;
        if (j !== i && this.age[j] >= sp.maturity && (sp.kind !== 'sapient' || this.village[j] === v)) mates++;
      });
      if (!mates || (sp.kind === 'sapient' && v < 0)) return;
      // Casas de eras mais avançadas e com andares a mais abrigam mais gente (sobrados, prédios).
      const housed = v < 0 || this.villages[v].population < this.housing(this.villages[v]);
      if (crowd < b.crowd && housed) {
        const child = this.spawn(s, this.x[i] + (this.rnd() - 0.5), this.y[i] + (this.rnd() - 0.5), v);
        if (child >= 0) {
          this.energy[i] -= 0.3;
          this.parent[child] = this.uid[i];
          this.family[child] = this.family[i];
        }
      }
    }
  }

  /**
   * Controle da natalidade: perto do teto quase não nascem filhotes (o
   * pasto e o espaço ficam disputados); uma espécie rara tem mais filhotes,
   * para conseguir se recuperar. Inteligentes têm o teto da era.
   */
  fertility(s: number, era = 0): number {
    const cap = this.caps[s] * (this.species[s].kind === 'sapient' ? 1 + 0.3 * era : 1);
    const fill = this.population[s] / Math.max(1, cap);
    if (fill < 0.2) return 2.2;
    return Math.max(0.08, 1.15 * (1 - fill * fill));
  }

  /** Direção do adulto da mesma espécie mais perto, se não houver um já ao lado; mais longe quando a espécie está rara. */
  private seekMate(i: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const sp = this.species[s];
    const range = this.population[s] < this.caps[s] * 0.2 ? MATE_RANGE * 2 : MATE_RANGE;
    let bd = Infinity;
    let best: { x: number; y: number } | undefined;
    this.forEachNear(this.x[i], this.y[i], range, (j, dx, dy) => {
      if (j === i || this.kind[j] !== s || this.age[j] < sp.maturity) return;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = { x: dx, y: dy };
      }
    });
    return bd < 9 ? undefined : best;
  }

  /** Direção de um tile mais verde (e no clima da espécie) a até `range` tiles, se houver. */
  private greener(i: number, range: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const sp = this.species[s];
    let bestVeg = this.map.vegetation[this.tileOf(i)] + 0.05;
    let best: { x: number; y: number } | undefined;
    for (let k = 0; k < 8; k++) {
      const a = this.rnd() * Math.PI * 2;
      const r = 3 + this.rnd() * (range - 3);
      const t = this.tileAt(this.x[i] + Math.cos(a) * r, Math.floor(this.y[i] + Math.sin(a) * r));
      if (t < 0 || !this.canStand(s, t)) continue;
      const tt = temperatureAt(this.map, t);
      if (tt < sp.tempMin || tt > sp.tempMax || this.map.vegetation[t] <= bestVeg) continue;
      bestVeg = this.map.vegetation[t];
      best = { x: Math.cos(a), y: Math.sin(a) };
    }
    return best;
  }

  /** Direção de um lugar com temperatura melhor para a espécie, a até 10 tiles. */
  private comfortBias(i: number, temp: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const sp = this.species[s];
    const mid = (sp.tempMin + sp.tempMax) / 2;
    let bestGap = Math.abs(temp - mid);
    let best: { x: number; y: number } | undefined;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2 + this.rnd() * 0.6;
      const r = 4 + this.rnd() * 6;
      const t = this.tileAt(this.x[i] + Math.cos(a) * r, Math.floor(this.y[i] + Math.sin(a) * r));
      if (t < 0 || !this.canStand(s, t)) continue;
      const gap = Math.abs(temperatureAt(this.map, t) - mid);
      if (gap < bestGap) {
        bestGap = gap;
        best = { x: Math.cos(a), y: Math.sin(a) };
      }
    }
    return best;
  }

  /**
   * Um inteligente sem assentamento anda até o assentamento mais perto do
   * seu povo (até 40 tiles) e se junta a ele. Sem nenhum por perto, prefere
   * reocupar ruínas próximas; senão funda um novo, mas só num lugar onde dá
   * para viver sozinho (verde ou com água, e no clima da espécie), andando
   * até um lugar assim se onde está não serve. Devolve a direção para andar
   * enquanto não chega.
   */
  private loner(i: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const w = this.map.width;
    let best: Village | null = null;
    let bd = 40;
    for (const v of this.villages) {
      if (v.abandoned || v.species !== s) continue;
      const d = this.distance(v, this.x[i], this.y[i]);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    const name = this.species[s].name.toLowerCase();
    if (best && bd < this.radius(best)) {
      this.join(i, best);
      this.note(`Um ${name} solitário se juntou a ${best.name}`, 'povo', best, { key: `join:${best.id}` });
      return undefined;
    }
    if (best) return { x: wrapDx(best.x - this.x[i], w), y: best.y - this.y[i] };
    const found = (tx: number, ty: number) => {
      const v = this.foundVillage(s, tx, ty, 0);
      this.join(i, v);
      const ruin = v.ruinOf !== undefined ? this.villages[v.ruinOf] : null;
      this.note(ruin ? `Um ${name} solitário fundou ${v.name} sobre as ruínas de ${ruin.name}` : `Um ${name} solitário fundou ${v.name}`, 'povo', v, { major: true });
    };
    // Ruínas por perto: vai até a antiga praça e recomeça ali.
    const ruin = this.ruinNear(this.x[i], this.y[i], 30, s);
    if (ruin) {
      const dx = wrapDx(ruin.x - this.x[i], w);
      const dy = ruin.y - this.y[i];
      if (dx * dx + dy * dy > 4) return { x: dx, y: dy };
      found(Math.floor(ruin.x), Math.floor(ruin.y));
      return undefined;
    }
    const tx = ((Math.floor(this.x[i]) % w) + w) % w;
    const ty = Math.floor(this.y[i]);
    const tile = this.tileAt(tx, ty);
    if (tile >= 0 && this.goodSite(s, tile)) {
      if (this.civRnd() < 0.05 && this.canFound(tx, ty)) found(tx, ty);
      return undefined;
    }
    // Sem lugar bom à vista (no meio do deserto, por exemplo): anda para onde é mais verde.
    return this.betterSite(i) ?? this.greener(i, 25);
  }

  /**
   * Lugar onde um inteligente sozinho consegue viver: verde ou na beira da
   * água, no clima da espécie e, para fundar, um lugar que passa no exame da
   * área (água, comida, chão plano e longe de lava, seção 19.18).
   */
  private goodSite(s: number, tile: number): boolean {
    const sp = this.species[s];
    const temp = temperatureAt(this.map, tile);
    if (!this.habitable(s, tile) || temp < sp.tempMin + 2 || temp > sp.tempMax - 2) return false;
    if (!(this.map.vegetation[tile] >= 0.3 || (this.map.vegetation[tile] > 0.1 && this.nearWater(tile)))) return false;
    const w = this.map.width;
    return this.siteProblem(s, tile % w, Math.floor(tile / w)) === null;
  }

  /**
   * Direção do melhor lugar para fundar a até 25 tiles. A amostra só muda
   * quando a criatura troca de região, para ela não ficar indo e voltando.
   */
  private betterSite(i: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const r = mulberry32((plotSeed(Math.floor(this.x[i] / 6), Math.floor(this.y[i] / 6)) ^ (i * 2654435761)) >>> 0);
    let best: { x: number; y: number } | undefined;
    let bv = -1;
    for (let k = 0; k < 20; k++) {
      const a = r() * Math.PI * 2;
      const d = 3 + r() * 22;
      const x = this.x[i] + Math.cos(a) * d;
      const y = this.y[i] + Math.sin(a) * d;
      const t = this.tileAt(x, Math.floor(y));
      if (t < 0 || !this.goodSite(s, t)) continue;
      const value = this.map.vegetation[t] + (this.nearWater(t) ? 0.3 : 0);
      if (value > bv) {
        bv = value;
        best = { x: x - this.x[i], y: y - this.y[i] };
      }
    }
    return best;
  }

  /** Ruínas (assentamento abandonado ainda não limpo) mais perto, a até `range` tiles e onde dá para recomeçar. */
  ruinNear(x: number, y: number, range: number, s: number): Village | null {
    let best: Village | null = null;
    let bd = range;
    for (const v of this.villages) {
      if (!v.abandoned || (v.decay ?? 0) >= 3) continue;
      const d = this.distance(v, x, y);
      if (d >= bd) continue;
      const tile = this.tileAt(v.x, Math.floor(v.y));
      // Ruínas num lugar que deixou de servir (inundado, lava, penhasco) não são reocupadas.
      if (tile < 0 || !this.habitable(s, tile) || !this.canSettle(s, Math.floor(v.x), Math.floor(v.y), v.tech)) continue;
      bd = d;
      best = v;
    }
    return best;
  }

  /** Um adulto do povo de `v` chega andando de fora da área; ao entrar, se junta (ver `loner`). */
  private wanderer(v: Village): void {
    const sp = this.species[v.species];
    for (let t = 0; t < 12; t++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.radius(v) + 3 + this.civRnd() * 6;
      const x = v.x + Math.cos(a) * d;
      const y = v.y + Math.sin(a) * d;
      const tile = this.tileAt(x, Math.floor(y));
      if (tile < 0 || !this.habitable(v.species, tile) || !this.landPath(x, y, v.x, v.y)) continue;
      this.spawn(v.species, ((x % this.map.width) + this.map.width) % this.map.width, y, -1, sp.maturity + this.civRnd() * 10);
      return;
    }
  }

  /** Põe a criatura `i` (sem assentamento) no assentamento `v`, com uma profissão. */
  private join(i: number, v: Village): void {
    this.village[i] = v.id;
    this.movedAt[i] = this.year;
    (v.vitalNow ??= emptyVital()).arrived++;
    v.lastCause = undefined;
    v.population++;
    this.role[i] = this.age[i] < this.species[this.kind[i]].maturity ? CHILD : pickRole(Math.floor(v.tech), v.tier, this.civRnd(), this.roleContext(v));
  }

  /**
   * Solta uma única criatura (ferramenta do jogador). Inteligentes chegam
   * sozinhos e decidem depois onde viver (ver `loner`). Devolve o índice ou -1.
   */
  introduceOne(s: number, x: number, y: number): number {
    const tile = this.tileAt(x, Math.floor(y));
    if (tile < 0 || !this.habitable(s, tile)) return -1;
    return this.spawn(s, x, y, -1, this.species[s].maturity + this.rnd() * 5);
  }

  private nearWater(tile: number): boolean {
    const w = this.map.width;
    const x = tile % w;
    const y = (tile - x) / w;
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ty = y + oy;
      if (ty < 0 || ty >= this.map.height) continue;
      if (isWater(this.map, ty * w + ((x + ox + w) % w))) return true;
    }
    return false;
  }

  // Assentamentos ----------------------------------------------------------

  /** Tile de (x, linha), com volta horizontal; -1 fora do mapa. */
  private tileAt(x: number, y: number): number {
    const w = this.map.width;
    if (y < 0 || y >= this.map.height) return -1;
    return y * w + (((Math.floor(x) % w) + w) % w);
  }

  private distance(v: Village, x: number, y: number): number {
    return Math.hypot(wrapDx(v.x - x, this.map.width), v.y - y);
  }

  /** Raio da área, que cresce aos poucos com as ruas (RF-VIDA-206). */
  radius(v: Village): number {
    return radiusFor(v.tier, v.growth ?? 0);
  }

  /** Quantas pessoas as casas do assentamento abrigam. */
  housing(v: Village): number {
    const era = Math.floor(v.tech);
    // A gente do campo conta pelas roças que o lugar comporta (uma a cada duas casas, ou quatro na Pedra),
    // mesmo quando só se planta o que os agricultores dão conta.
    const homes = v.houses.filter((h) => h.kind === 'house').length;
    const farms = v.tech >= 0.12 ? Math.max(v.fields, Math.floor(homes / (era >= 1 ? 2 : 4))) : v.fields;
    let n = 4 + farms * 2;
    for (const h of v.houses) n += h.kind === 'house' ? (h.empty ? 0 : 4 + era + (h.level ?? 0) * B.LEVEL_HOUSING) : h.kind === 'port' ? 0 : 2;
    return n;
  }

  /** Andares a mais que uma casa pode ter na era (sobrado no Bronze, mais um na Era Medieval). */
  private maxLevel(v: Village): number {
    const era = Math.floor(v.tech);
    return era >= 3 ? 2 : era >= 1 ? 1 : 0;
  }

  /** Estrutura de referência do assentamento no nível e era atuais (RF-VIDA-200). */
  plan(v: Village): PlanItem[] {
    const era = Math.floor(v.tech);
    const built = new Set<string>(v.houses.map((h) => h.kind));
    const ctx = this.buildContext(v);
    return planItems({
      tier: v.tier,
      tech: v.tech,
      population: v.population,
      housing: this.housing(v),
      homes: v.houses.filter((h) => h.kind === 'house').length,
      fields: v.fields,
      food: v.food,
      port: v.port >= 0,
      coastal: v.port >= 0 || this.coastal(v),
      built,
      buildable: BUILDINGS.filter((b) => canBuild(b, ctx)),
      vocationBuilding: v.vocation ? VOCATION_BUILDING[v.vocation] : undefined,
      era,
    });
  }

  private buildContext(v: Village): BuildContext {
    const st = this.store(v);
    return {
      era: Math.floor(v.tech),
      tier: v.tier,
      metal: st.copper + st.tin + st.iron > 0,
      culture: v.culture,
      capital: v.kingdom === v.id,
      vocation: v.vocation,
      herd: v.herd && v.herd.head > 0 ? v.herd.kind : undefined,
      clay: v.wet ?? false,
      forest: v.forest,
    };
  }

  /** Tem mar (não lago) a até o raio da área: dá para ter porto. */
  private coastal(v: Village): boolean {
    const r = Math.ceil(this.radius(v));
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        const t = this.tileAt(v.x + dx, Math.floor(v.y) + dy);
        if (t >= 0 && isWater(this.map, t) && dx * dx + dy * dy <= r * r) return true;
      }
    }
    return false;
  }

  /** Assentamento cuja área contém o ponto, se houver. */
  settlementAt(x: number, y: number): Village | null {
    for (const v of this.villages) if (!v.abandoned && this.distance(v, x, y) < this.radius(v)) return v;
    return null;
  }

  /** Um assentamento novo não pode nascer dentro (nem encostado) da área de outro. */
  canFound(x: number, y: number): boolean {
    return this.villages.every((v) => v.abandoned || this.distance(v, x + 0.5, y + 0.5) >= this.radius(v) + TIER_RADIUS[0]);
  }

  /** Tile plano o bastante para uma casa: nenhum vizinho com desnível acima de SITE_MAX_SLOPE. */
  flat(t: number): boolean {
    const w = this.map.width;
    const x = t % w;
    const y = (t - x) / w;
    const e = this.map.elevation[t];
    for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.tileAt(x + ox, y + oy);
      if (n >= 0 && isLand(this.map, n) && Math.abs(this.map.elevation[n] - e) > B.SITE_MAX_SLOPE) return false;
    }
    return true;
  }

  /**
   * Por que o lugar (x, y) não serve para a espécie `s` fundar um
   * assentamento, ou null se serve (seção 19.18). Antes de se estabelecer, o
   * povo olha a área em volta (SITE_RADIUS): nada de lava ou chão em brasa
   * por perto (pegaria fogo nas redondezas), área plana e firme suficiente
   * para as casas, sem penhasco cortando a área, água a uma caminhada (rio,
   * lago ou mar; da Idade do Ferro em diante, um poço no solo úmido) e comida
   * (vegetação para coletar, caçar e plantar, ou o mar para pescar).
   */
  siteProblem(s: number, x: number, y: number, tech = 0): string | null {
    const map = this.map;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const center = this.tileAt(cx, cy);
    if (center < 0 || !isLand(map, center) || !this.habitable(s, center)) return 'o lugar não é habitável para eles';
    const sp = this.species[s];
    const R = B.SITE_RADIUS;
    let total = 0;
    let land = 0;
    let good = 0;
    let veg = 0;
    let lo = Infinity;
    let hi = -Infinity;
    let water = false;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0) continue;
        total++;
        if (map.biome[t] === Biome.Lava) return 'tem lava ali: o fogo pegaria nas casas e na mata em volta';
        if (isWater(map, t)) {
          water = true;
          continue;
        }
        land++;
        const e = map.elevation[t];
        lo = Math.min(lo, e);
        hi = Math.max(hi, e);
        veg += map.vegetation[t];
        const temp = temperatureAt(map, t);
        if (temp >= sp.tempMin - 5 && temp <= sp.tempMax + 5 && e < 0.62 && this.flat(t)) good++;
      }
    }
    if (hi - lo > B.SITE_MAX_RELIEF || !this.flat(center)) return 'o terreno é íngreme demais: um penhasco cortaria o assentamento';
    if (land < total * 0.3 || good < land * B.SITE_MIN_AREA) return 'falta área plana e firme para as casas';
    // Lava ou chão em brasa um pouco mais longe também espanta (o fogo chega).
    const L = B.SITE_LAVA_RANGE;
    const W = B.SITE_WATER_RANGE;
    for (let dy = -Math.max(L, W); dy <= Math.max(L, W); dy += 1) {
      for (let dx = -Math.max(L, W); dx <= Math.max(L, W); dx += 1) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= R * R) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0) continue;
        if (d2 <= L * L && (map.biome[t] === Biome.Lava || temperatureAt(map, t) > 500)) return 'tem lava por perto: o fogo pegaria nas redondezas';
        if (!water && d2 <= W * W && isWater(map, t)) water = true;
      }
    }
    if (!water && !(tech >= 2 && map.moisture[center] >= B.SITE_WELL_MOISTURE)) return 'não há água por perto';
    const food = veg / Math.max(1, land);
    if (food < B.SITE_MIN_FOOD * (water && (land < total || tech >= 2) ? 0.5 : 1)) return 'não há comida por perto: quase nada verde para coletar, caçar ou plantar';
    return null;
  }

  /** O lugar serve para fundar: longe de outros assentamentos e com o que é preciso para viver (seção 19.18). */
  canSettle(s: number, x: number, y: number, tech = 0): boolean {
    return this.canFound(x, y) && this.siteProblem(s, x, y, tech) === null;
  }

  /** Capital do reino do assentamento. */
  capitalOf(v: Village): Village {
    return this.villages[v.kingdom];
  }

  /** Quantos assentamentos ativos pertencem ao reino cuja capital é `v`. */
  kingdomSize(v: Village): number {
    let n = 0;
    for (const o of this.villages) if (!o.abandoned && o.kingdom === v.id) n++;
    return n;
  }

  private setRoad(i: number, kind: number): void {
    if (this.road[i] >= kind || this.built[i]) return;
    this.road[i] = kind;
    this.roadDirty.push(i);
    this.onTileChanged(i);
  }

  /** Ruas pintadas desde a última limpeza anual (RF-VIDA-195). */
  private roadDirty: number[] = [];

  /**
   * Praça e ruas do nível atual, com hierarquia (RF-VIDA-253): as ruas
   * principais ganham pedra na Era Medieval (antes, se o assentamento é
   * rico), as vielas só na Industrial; cidades têm uma avenida larga.
   */
  private layStreets(v: Village): void {
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const kind = v.tech >= 4 ? 2 : 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && isLand(this.map, t)) this.setRoad(t, 3);
      }
    }
    const seed = plotSeed(v.x, v.y);
    const laid: number[] = [];
    // Só o começo da planta, na ordem em que as ruas vão sendo abertas (bloco a bloco, RF-VIDA-207).
    const order = streetOrder(v.tier, seed, v.growth ?? 0);
    v.streetLen = Math.min(order.length, v.streetLen ?? B.STREET_START);
    v.streetPlan = order.length;
    for (let k = 0; k < v.streetLen; k++) {
      const p = order[k];
      const t = this.tileAt(cx + p.x, cy + p.y);
      if (t < 0 || !isLand(this.map, t) || this.road[t] === 3) continue;
      if (kind === 2 && this.road[t] === 1) this.road[t] = 0;
      this.setRoad(t, kind);
      laid.push(t);
    }
    this.pruneRoads(laid);
    this.rankStreets(v);
    v.lots = lotsFor(v.tier, seed, v.growth ?? 0);
  }

  /** Assentamento rico: calçamento uma era antes (RF-VIDA-253). */
  rich(v: Village): boolean {
    return v.stock.gold >= this.capOf(v, 'gold') * 0.5 && (v.needs ? welfare(v.needs) : 1) >= 0.85;
  }

  /**
   * Marca ruas principais e vielas, calça as principais pela era e pela
   * riqueza e, de cidade em diante, abre a avenida: o trecho reto mais longo
   * de rua principal saindo da praça, com 2 tiles de largura (a única rua
   * larga, marcada como tal, RF-VIDA-191 e 253).
   */
  private rankStreets(v: Village): void {
    const w = this.map.width;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    // Todas as ruas dentro da área, inclusive as de níveis e traçados anteriores.
    const streets = new Set<number>();
    const r = Math.ceil(this.radius(v));
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && (this.road[t] === 1 || this.road[t] === 2 || this.road[t] === AVENUE)) streets.add(t);
      }
    }
    const square: number[] = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) square.push(this.tileAt(cx + dx, cy + dy));
    const next = (t: number) => {
      const x = t % w;
      const y = (t - x) / w;
      return [this.tileAt(x + 1, y), this.tileAt(x - 1, y), this.tileAt(x, y + 1), this.tileAt(x, y - 1)];
    };
    const main = mainStreets(streets, square.filter((t) => t >= 0), next, B.MAIN_STREET_SHARE);
    const era = Math.floor(v.tech);
    const paveMain = era >= 3 || (era >= 2 && this.rich(v));
    // A cor da terra batida e do cascalho muda com a era: repinta tudo na troca.
    const repaint = v.paveEra !== era;
    v.paveEra = era;
    for (const t of streets) {
      this.mainStreet[t] = main.has(t) || this.road[t] === AVENUE ? 1 : 0;
      if (repaint) this.onTileChanged(t);
      if (this.road[t] === AVENUE) continue;
      // Rua muito usada pelas caravanas ganha pedra antes das outras (RF-VIDA-233).
      const want = era >= 4 || (paveMain && main.has(t)) || (era >= 2 && this.traffic[t] >= B.STONE_USE) ? 2 : 1;
      if (this.road[t] !== want) {
        this.road[t] = want;
        this.onTileChanged(t);
      }
    }
    if (v.tier < 2) return;
    // Avenida: o trecho reto mais longo de rua principal (ou da avenida que já existe).
    const isMain = (t: number) => t >= 0 && (main.has(t) || this.road[t] === AVENUE);
    let best: number[] = [];
    let side: [number, number] = [0, 0];
    for (const t of [...main, ...streets]) {
      if (!isMain(t)) continue;
      const x = t % w;
      const y = (t - x) / w;
      for (const [dx, dy] of [[1, 0], [0, 1]] as const) {
        if (isMain(this.tileAt(x - dx, y - dy))) continue;
        const run: number[] = [];
        for (let k = 0; k < 40; k++) {
          const u = this.tileAt(x + dx * k, y + dy * k);
          if (!isMain(u)) break;
          run.push(u);
        }
        if (run.length > best.length) {
          best = run;
          side = [dy, dx];
        }
      }
    }
    if (best.length < B.AVENUE_MIN) return;
    for (const t of best) {
      const x = t % w;
      const y = (t - x) / w;
      this.road[t] = AVENUE;
      this.mainStreet[t] = 1;
      this.onTileChanged(t);
      const n = this.tileAt(x + side[0], y + side[1]);
      if (n >= 0 && isLand(this.map, n) && !this.built[n] && this.depositAt[n] < 0 && (this.road[n] === 0 || this.road[n] === 1 || this.road[n] === 2)) {
        this.road[n] = AVENUE;
        this.mainStreet[n] = 1;
        this.onTileChanged(n);
      }
    }
  }

  /** Material das casas pelo entorno, sem sorteio (RF-VIDA-252); guardado no assentamento. */
  materialOf(v: Village): BuildMaterial {
    if (v.material) return v.material;
    const r = this.radius(v) + 4;
    let n = 0;
    let rock = 0;
    let forest = 0;
    let desert = 0;
    let cold = 0;
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(v.x + dx, Math.floor(v.y + dy));
        if (t < 0 || !isLand(this.map, t)) continue;
        n++;
        const b = this.map.biome[t] as Biome;
        if (b === Biome.Rock || b === Biome.Mountain || this.map.elevation[t] > 0.45) rock++;
        if (b === Biome.Forest || b === Biome.Jungle) forest++;
        if (b === Biome.Desert) desert++;
        if (b === Biome.Snow || b === Biome.Tundra || temperatureAt(this.map, t) < 268) cold++;
      }
    }
    n = Math.max(1, n);
    v.material = pickMaterial({ rock: rock / n, forest: forest / n, desert: desert / n, cold: cold / n, wet: this.nearWater(this.tileAt(v.x, Math.floor(v.y))) || this.coastal(v) });
    return v.material;
  }

  /** Casa ainda no estilo de uma era passada, a mais perto do centro (RF-VIDA-251). */
  private outdated(v: Village): Building | null {
    const era = Math.floor(v.tech);
    let best: Building | null = null;
    let bd = Infinity;
    for (const h of v.houses) {
      if (h.kind !== 'house' || (h.era ?? era) >= era || (h.workUntil ?? 0) > this.year) continue;
      const d = Math.hypot(wrapDx(h.x + 1 - v.x, this.map.width), h.y + 1 - v.y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  /**
   * Reforma para o estilo da era nova, uma casa por vez, do centro para fora
   * (RF-VIDA-251): por um tempo a cidade mistura estilos.
   */
  private restyle(v: Village): boolean {
    const h = this.outdated(v);
    if (!h || !this.pay(v, 'reform')) return false;
    h.era = Math.floor(v.tech);
    h.workUntil = this.year + B.WORK_YEARS;
    this.note(`${v.name} está trocando as casas pelo estilo da ${ERAS[h.era]}`, 'povo', v, { key: `restyle-${v.id}-${h.era}` });
    return true;
  }

  /** Madeira e pedra por ano para consertar as casas e os prédios (seção 19.19). */
  private repairs(v: Village): { wood: number; stone: number } {
    const era = Math.floor(v.tech);
    let wood = 0;
    let stone = 0;
    for (const h of v.houses) {
      if (h.kind === 'house') {
        const k = 1 + 0.5 * (h.level ?? 0);
        if (era >= 3) {
          wood += B.STONE_HOUSE_UPKEEP * k;
          stone += B.STONE_HOUSE_UPKEEP * k;
        } else wood += B.HOUSE_UPKEEP * k;
      } else if (h.kind !== 'port') wood += B.BUILDING_UPKEEP;
    }
    return { wood, stone };
  }

  /**
   * Conserto das casas (seção 19.19), uma vez por ano, pelo que foi pago ao longo do ano (em
   * `consume`): sem material, as casas mais longe do centro ficam sem conserto; com DECAY_YEARS
   * anos ficam vazias, caindo aos pedaços, e com COLLAPSE_YEARS desabam.
   */
  private upkeep(v: Village): void {
    const era = Math.floor(v.tech);
    const e = v.ledgerNow?.['_upkeep'];
    if (!e || e[1] <= 0) return;
    const share = Math.min(1, e[0] / e[1]);
    // As casas mais perto do centro são consertadas primeiro.
    const order = v.houses.filter((h) => h.kind !== 'port').sort((p, q) => this.distance(v, q.x + 1, q.y + 1) - this.distance(v, p.x + 1, p.y + 1));
    const unpaid = Math.round((1 - share) * order.length);
    let empty = 0;
    let fallen = 0;
    for (let k = 0; k < order.length; k++) {
      const h = order[k];
      if (k >= unpaid) {
        h.wear = Math.max(0, (h.wear ?? 0) - 1);
        continue;
      }
      h.wear = (h.wear ?? 0) + 1;
      if (h.kind === 'house' && h.wear >= B.DECAY_YEARS && !h.empty) {
        h.empty = true;
        empty++;
      }
      if (h.wear >= B.COLLAPSE_YEARS && h.kind !== 'port') {
        const at = v.houses.indexOf(h);
        if (at >= 0) {
          this.raze(v, at);
          fallen++;
          this.tally.collapsed++;
        }
      }
    }
    const what = era >= 3 ? 'madeira e pedra' : 'madeira';
    if (fallen) this.note(`${fallen > 1 ? `${fallen} casas desabaram` : 'Uma casa desabou'} em ${v.name}: faltou ${what} para os consertos`, 'economia', v, { key: `collapse-${v.id}` });
    else if (empty) this.note(`Casas de ${v.name} estão caindo aos pedaços: falta ${what} para os consertos`, 'economia', v, { key: `decay-${v.id}` });
  }

  /**
   * A mata ao alcance, uma vez por ano (seção 19.19): conta as árvores de pé e decide se o povo
   * passa a replantar. Sem manejo, quando a mata acaba os lenhadores ficam sem o que cortar.
   */
  private woodland(v: Village): void {
    const before = v.trees ?? -1;
    this.scanTrees(v);
    const trees = v.trees ?? 0;
    const used = (v.ledgerNow?.['wood']?.[1] ?? 0) / B.WOOD_PER_TREE;
    if (!v.forestry && used > 0.5 && trees < used * B.FORESTRY_YEARS) {
      const tech = v.culture.belief === 'a Floresta' ? 0 : B.FORESTRY_TECH;
      if (v.tech >= tech) {
        v.forestry = true;
        this.note(`${v.name} passou a replantar a mata: as árvores por perto estavam acabando`, 'economia', v, { key: `forestry-${v.id}` });
      }
    }
    if (before > 0 && trees === 0) this.note(`Acabou a mata em volta de ${v.name}: não há mais árvore para cortar ao alcance`, 'economia', v, { key: `deforest-${v.id}` });
  }

  /** Casas vazias na crise e ocupadas de novo na melhora (RF-VIDA-254). */
  private neglect(v: Village): void {
    const w = v.needs ? welfare(v.needs) : 1;
    const homes = v.houses.filter((h) => h.kind === 'house');
    if (w < 0.5 && homes.length > 3 && happens(this.civRnd, B.CRISIS_EMPTY_RATE, 1)) {
      // A casa mais longe do centro fica vazia primeiro.
      let far: Building | null = null;
      let fd = -1;
      for (const h of homes) {
        if (h.empty) continue;
        const d = Math.hypot(wrapDx(h.x + 1 - v.x, this.map.width), h.y + 1 - v.y);
        if (d > fd) {
          fd = d;
          far = h;
        }
      }
      if (far && homes.filter((h) => h.empty).length < homes.length / 3) {
        far.empty = true;
        this.note(`Casas ficaram vazias em ${v.name}`, 'economia', v, { key: `empty-${v.id}` });
      }
    } else if (w >= 0.7 && happens(this.civRnd, B.CRISIS_REFILL_RATE, 1)) {
      const h = homes.find((o) => o.empty && (o.wear ?? 0) < B.DECAY_YEARS);
      if (h) h.empty = false;
    }
  }

  /** Lote 2x2 com canto em (x, y) tem rua a até 2 tiles (casa sempre na beira da rua, RF-VIDA-102). */
  private besideStreet(x: number, y: number): boolean {
    for (let dy = -2; dy <= 3; dy++) {
      for (let dx = -2; dx <= 3; dx++) {
        const t = this.tileAt(x + dx, y + dy);
        if (t >= 0 && isStreet(this.road[t])) return true;
      }
    }
    return false;
  }

  /** Tiles do lote livre (casas: do centro para fora; plantações: de fora para dentro). */
  private freeLot(v: Village, fromEdge = false): number[] | null {
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const n = v.lots.length;
    for (let k = 0; k < n; k++) {
      const lot = v.lots[fromEdge ? n - 1 - k : k];
      const tiles: number[] = [];
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const t = this.tileAt(cx + lot.x + dx, cy + lot.y + dy);
          // Lote em chão plano: nada de casa pendurada num barranco (seção 19.18).
          if (t < 0 || !isLand(this.map, t) || this.road[t] || this.built[t] || this.depositAt[t] >= 0 || !this.flat(t)) break;
          tiles.push(t);
        }
      }
      if (tiles.length === 4 && (fromEdge || this.besideStreet(cx + lot.x, cy + lot.y))) return tiles;
    }
    return null;
  }

  /** Constrói uma casa (ou construção especial) no lote livre mais perto do centro. */
  private buildHouse(v: Village, kind: BuildingKind = 'house', free = false): boolean {
    const tiles = this.freeLot(v);
    if (!tiles || (!free && !this.pay(v, kind))) return false;
    const w = this.map.width;
    for (const t of tiles) {
      this.built[t] = 1;
      this.onTileChanged(t);
    }
    v.houses.push({ x: tiles[0] % w, y: Math.floor(tiles[0] / w), kind, variant: Math.floor(this.civRnd() * 4), workUntil: this.year + B.WORK_YEARS / 2, era: Math.floor(v.tech) });
    if (kind === 'wonder') this.note(`${v.name} ergueu a ${WONDER_NAMES[v.culture.value]}, orgulho do povo ${v.culture.name}`, 'povo', v, { major: true });
    else if (kind === 'statue') this.note(`${v.name} ergueu uma estátua do seu líder`, 'povo', v);
    else if (kind !== 'house') this.note(`${v.name} construiu ${kind === 'smithy' || kind === 'factory' ? 'uma' : 'um'} ${BUILDING_NAMES[kind].toLowerCase()}`, 'economia', v);
    return true;
  }

  /** Casa que ainda pode ganhar um andar nesta era, a mais perto do centro. */
  private reformable(v: Village): Building | null {
    const max = this.maxLevel(v);
    let best: Building | null = null;
    let bd = Infinity;
    for (const h of v.houses) {
      if (h.kind !== 'house' || (h.level ?? 0) >= max || (h.workUntil ?? 0) > this.year) continue;
      const d = Math.hypot(wrapDx(h.x + 1 - v.x, this.map.width), h.y + 1 - v.y);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    return best;
  }

  /** Reforma (RF-VIDA-203): a casa ganha um andar e fica com andaime por um tempo. */
  private reform(v: Village): boolean {
    const h = this.reformable(v);
    if (!h || !this.pay(v, 'reform')) return false;
    h.level = (h.level ?? 0) + 1;
    h.workUntil = this.year + B.WORK_YEARS;
    this.note(`${v.name} está reformando casas`, 'povo', v, { key: `reform-${v.id}` });
    return true;
  }

  /** Abre mais um trecho de rua da planta (um bloco), onde faltam lotes. */
  private openBlock(v: Village): void {
    v.streetLen = (v.streetLen ?? 0) + B.STREET_BLOCK;
    this.layStreets(v);
  }

  /** Ruas crescem rumo ao nível seguinte (e a área junto), sem engolir outro assentamento. */
  private growStreets(v: Village): void {
    const next = Math.min(1, (v.growth ?? 0) + B.STREET_GROW_RATE);
    const r = radiusFor(v.tier, next);
    if (v.tier < 2 && this.villages.some((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < r + TIER_RADIUS[0])) return;
    v.growth = next;
    this.layStreets(v);
  }

  /** Próxima construção especial que o assentamento pode erguer, se houver. */
  private nextBuilding(v: Village): BuildingKind | null {
    const ctx = this.buildContext(v);
    // O prédio característico da vocação vem primeiro (RF-VIDA-221).
    const own = v.vocation ? VOCATION_BUILDING[v.vocation] : '';
    if (own && own !== 'port' && canBuild(own as (typeof BUILDINGS)[number], ctx) && !this.has(v, own as BuildingKind)) return own as BuildingKind;
    for (const b of BUILDINGS) if (canBuild(b, ctx) && !this.has(v, b)) return b;
    return null;
  }

  /** Plantação na borda da área: tiles de lavoura com trigo. */
  private plantField(v: Village): boolean {
    const tiles = this.freeLot(v, true);
    if (!tiles) return false;
    for (const t of tiles) {
      this.road[t] = 4;
      this.onTileChanged(t);
    }
    v.fields++;
    return true;
  }

  /** Larga a roça mais longe do centro: os tiles de lavoura voltam a ser campo. */
  private dropField(v: Village): void {
    const r = Math.ceil(this.radius(v)) + 1;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    let best = -1;
    let bd = -1;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy;
        if (d > r * r || d <= bd) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.road[t] !== 4) continue;
        const o = this.settlementAt(cx + dx + 0.5, cy + dy + 0.5);
        if (o && o !== v) continue;
        best = t;
        bd = d;
      }
    }
    v.fields--;
    if (best < 0) return;
    // A roça é um lote 2x2: some o tile e os vizinhos de lavoura, até quatro.
    const w = this.map.width;
    const queue = [best];
    for (let n = 0; queue.length && n < 4; n++) {
      const t = queue.shift()!;
      if (this.road[t] !== 4) continue;
      this.road[t] = 0;
      this.onTileChanged(t);
      const x = t % w;
      const y = Math.floor(t / w);
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const u = this.tileAt(x + ox, y + oy);
        if (u >= 0 && this.road[u] === 4) queue.push(u);
      }
    }
  }

  /** Garante um líder vivo (rei, se for capital de um reino com cidade). */
  private updateLeader(v: Village, adults: number[]): void {
    const l = v.leader;
    const king = v.tier >= 2 && v.kingdom === v.id;
    if (l >= 0 && this.alive[l] && this.village[l] === v.id) {
      this.role[l] = king ? ROLE.king : ROLE.leader;
      return;
    }
    if (!adults.length) {
      v.leader = -1;
      return;
    }
    // De preferência alguém que ainda não é idoso.
    const sp = this.species[v.species];
    const young = adults.filter((i) => this.age[i] < elderAge(sp, Math.floor(v.tech)));
    const pool = young.length ? young : adults;
    const pick = pool[Math.floor(this.civRnd() * pool.length)];
    v.leader = pick;
    this.role[pick] = king ? ROLE.king : ROLE.leader;
  }

  /** Estrada de terra entre dois assentamentos (a mesma em qualquer ordem, RF-VIDA-194). */
  private connect(a: Village, b: Village): void {
    this.lineRoad(a.x, a.y, b.x, b.y);
    a.linked = b.linked = true;
  }

  /**
   * Estradas só onde há movimento: uma vez por ano, um assentamento que já
   * tem gente e ainda não tem estrada se liga ao vizinho mais perto do mesmo
   * reino, se estiver perto e der para ir a pé. Reinos diferentes não ganham
   * estrada entre si.
   */
  private linkRoads(): void {
    for (const v of this.villages) {
      if (v.abandoned || v.linked || v.population < B.ROAD_LINK_POP) continue;
      let best: Village | null = null;
      let bd: number = B.ROAD_LINK_RANGE;
      for (const o of this.villages) {
        if (o === v || o.abandoned || o.kingdom !== v.kingdom || o.population < B.ROAD_LINK_POP) continue;
        const d = this.distance(o, v.x, v.y);
        if (d < bd && this.landPath(v.x, v.y, o.x, o.y)) {
          bd = d;
          best = o;
        }
      }
      if (best) this.connect(v, best);
    }
  }

  /**
   * Estrada de terra entre dois pontos pela rede viária (RF-VIDA-190): busca
   * de caminho que anda barato sobre rua existente, paga caro para ficar ao
   * lado de uma rua sem estar nela, não passa por água nem por casa e segue
   * de perto uma curva suave entre os dois pontos. O resultado entra na rede
   * já existente em vez de correr paralelo a ela. Sem caminho por terra, a
   * estrada é desenhada em curva e para na água, como antes.
   */
  private lineRoad(ax: number, ay: number, bx: number, by: number): void {
    // Ordem fixa: ligar A a B ou B a A dá o mesmo traçado.
    if (ax > bx || (ax === bx && ay > by)) [ax, ay, bx, by] = [bx, by, ax, ay];
    const path = this.roadPath(ax, ay, bx, by);
    if (!path) {
      this.curveRoad(ax, ay, bx, by);
      return;
    }
    for (const t of path) if (!this.road[t] && !this.built[t]) this.setRoad(t, 1);
    this.pruneRoads(path);
  }

  /** Tiles da curva-guia de uma estrada (a curva suave de sempre). */
  private guideTiles(ax: number, ay: number, bx: number, by: number): { x: number; y: number }[] {
    const dx = wrapDx(bx - ax, this.map.width);
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (plotSeed(ax + bx, ay + by) / 4294967296 - 0.5) * 0.5 * len;
    const mx = ax + dx / 2 + (-dy / len) * bend;
    const my = ay + dy / 2 + (dx / len) * bend;
    const n = Math.max(2, Math.ceil(len * 2));
    const out: { x: number; y: number }[] = [];
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      out.push({
        x: Math.floor((1 - u) * (1 - u) * ax + 2 * u * (1 - u) * mx + u * u * (ax + dx)),
        y: Math.floor((1 - u) * (1 - u) * ay + 2 * u * (1 - u) * my + u * u * by),
      });
    }
    return out;
  }

  /** Busca A* da estrada numa janela em volta dos dois pontos; devolve os tiles ou null. */
  private roadPath(ax: number, ay: number, bx: number, by: number): number[] | null {
    const map = this.map;
    const w = map.width;
    const dx = wrapDx(bx - ax, w);
    const x0 = Math.floor(Math.min(ax, ax + dx)) - 16;
    const y0 = Math.max(0, Math.floor(Math.min(ay, by)) - 16);
    const gw = Math.ceil(Math.abs(dx)) + 33;
    const gh = Math.min(map.height, Math.floor(Math.max(ay, by)) + 17) - y0;
    const n = gw * gh;
    if (n <= 0 || n > B.ROAD_SEARCH_MAX * 4) return null;
    const tileOf = (k: number) => this.tileAt(x0 + (k % gw), y0 + Math.floor(k / gw));
    const local = (x: number, y: number) => {
      const lx = Math.floor(x) - x0;
      const ly = Math.floor(y) - y0;
      return lx < 0 || ly < 0 || lx >= gw || ly >= gh ? -1 : ly * gw + lx;
    };
    const start = local(ax, ay);
    const goal = local(ax + dx, by);
    if (start < 0 || goal < 0) return null;
    // Distância até a curva-guia (busca em largura a partir dela, até 8 tiles).
    const guide = new Uint8Array(n).fill(255);
    let queue: number[] = [];
    for (const p of this.guideTiles(ax, ay, bx, by)) {
      const k = local(p.x, p.y);
      if (k >= 0 && guide[k] !== 0) {
        guide[k] = 0;
        queue.push(k);
      }
    }
    for (let d = 1; d <= 8 && queue.length; d++) {
      const next: number[] = [];
      for (const k of queue) {
        const lx = k % gw;
        for (const m of [lx > 0 ? k - 1 : -1, lx < gw - 1 ? k + 1 : -1, k - gw, k + gw]) {
          if (m < 0 || m >= n || guide[m] !== 255) continue;
          guide[m] = d;
          next.push(m);
        }
      }
      queue = next;
    }
    const isRoad = (t: number) => t >= 0 && isStreet(this.road[t]);
    const cost = (k: number): number => {
      const t = tileOf(k);
      if (t < 0 || !isLand(map, t)) return Infinity;
      if (this.built[t] && k !== goal) return Infinity;
      if (isRoad(t)) return B.ROAD_COST_EXISTING;
      let c = B.ROAD_COST_GROUND + B.ROAD_COST_GUIDE * Math.min(guide[k], 12);
      if (this.road[t] === 4 || this.road[t] === 5) c += 5;
      const x = t % w;
      const y = (t - x) / w;
      if (isRoad(this.tileAt(x + 1, y)) || isRoad(this.tileAt(x - 1, y)) || isRoad(this.tileAt(x, y + 1)) || isRoad(this.tileAt(x, y - 1))) c += B.ROAD_COST_BESIDE;
      return c;
    };
    const g = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const heap: number[] = [];
    const f = new Float32Array(n);
    const gx = goal % gw;
    const gy = Math.floor(goal / gw);
    const h = (k: number) => (Math.abs((k % gw) - gx) + Math.abs(Math.floor(k / gw) - gy)) * B.ROAD_COST_EXISTING;
    const push = (k: number) => {
      heap.push(k);
      let c = heap.length - 1;
      while (c > 0) {
        const p = (c - 1) >> 1;
        if (f[heap[p]] <= f[heap[c]]) break;
        [heap[p], heap[c]] = [heap[c], heap[p]];
        c = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        let c = 0;
        for (;;) {
          const l = c * 2 + 1;
          const r = l + 1;
          let m = c;
          if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
          if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
          if (m === c) break;
          [heap[m], heap[c]] = [heap[c], heap[m]];
          c = m;
        }
      }
      return top;
    };
    g[start] = 0;
    f[start] = h(start);
    push(start);
    let visited = 0;
    while (heap.length) {
      const k = pop();
      if (k === goal) break;
      if (++visited > B.ROAD_SEARCH_MAX) return null;
      const lx = k % gw;
      const ek = map.elevation[tileOf(k)];
      for (const m of [lx > 0 ? k - 1 : -1, lx < gw - 1 ? k + 1 : -1, k - gw, k + gw]) {
        if (m < 0 || m >= n) continue;
        let c = cost(m);
        if (c === Infinity) continue;
        // Estrada não sobe penhasco e prefere a encosta suave (seção 19.18).
        const climb = Math.abs(map.elevation[tileOf(m)] - ek);
        if (climb > B.MAX_CLIMB) continue;
        c += climb * 20;
        const ng = g[k] + c;
        if (ng >= g[m]) continue;
        g[m] = ng;
        from[m] = k;
        f[m] = ng + h(m);
        push(m);
      }
    }
    if (g[goal] === Infinity) return null;
    const out: number[] = [];
    for (let k = goal; k >= 0; k = from[k]) out.push(tileOf(k));
    return out.reverse();
  }

  /** Estrada em curva que para na água (o traçado antigo, usado quando não há caminho por terra). */
  private curveRoad(ax: number, ay: number, bx: number, by: number): void {
    let px = Math.floor(ax);
    let py = Math.floor(ay);
    const put = (x: number, y: number) => {
      const t = this.tileAt(x, y);
      if (t >= 0 && isLand(this.map, t)) this.setRoad(t, 1);
    };
    put(px, py);
    for (const { x, y } of this.guideTiles(ax, ay, bx, by)) {
      if (x === px && y === py) continue;
      if (x !== px && y !== py) put(x, py);
      put(x, y);
      px = x;
      py = y;
    }
  }

  /**
   * Limpeza da rede (RF-VIDA-195): tira tiles de rua que formam bloco 2x2
   * quando a retirada não desliga nenhum vizinho. Olha os tiles dados e os
   * vizinhos deles.
   */
  private pruneRoads(tiles: Iterable<number>): void {
    const w = this.map.width;
    const at = (x: number, y: number) => this.tileAt(x, y);
    const near: [number, number][] = [];
    for (const t of tiles) {
      const x = t % w;
      const y = (t - x) / w;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push([x + dx, y + dy]);
    }
    pruneBlocks(
      near,
      (x, y) => {
        const t = at(x, y);
        return t >= 0 && (this.road[t] === 1 || this.road[t] === 2);
      },
      (x, y) => {
        const t = at(x, y);
        return t >= 0 && isStreet(this.road[t]);
      },
      (x, y) => {
        const t = at(x, y);
        this.road[t] = 0;
        this.onTileChanged(t);
      },
      // Fica o toco que é a única rua de uma casa ao lado (a até 2 tiles dela).
      (x, y, gone) => {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const bx = x + dx;
            const by = y + dy;
            const b = at(bx, by);
            if (b < 0 || !this.built[b]) continue;
            let other = false;
            for (let ey = -2; ey <= 2 && !other; ey++) {
              for (let ex = -2; ex <= 2 && !other; ex++) {
                const t = at(bx + ex, by + ey);
                if (t >= 0 && isStreet(this.road[t]) && !gone(bx + ex, by + ey)) other = true;
              }
            }
            if (!other) return true;
          }
        }
        return false;
      },
    );
  }


  private uniqueName(): string {
    let name = alienName(this.civRnd, 2);
    for (let t = 0; t < 20 && this.villages.some((v) => v.name === name); t++) name = alienName(this.civRnd, 2 + (t > 10 ? 1 : 0));
    return name;
  }

  foundVillage(s: number, x: number, y: number, settlers: number, from?: Village): Village {
    const sp = this.species[s];
    const rnd = this.civRnd;
    // Ruínas logo ali: o assentamento novo ocupa a antiga praça e aproveita as ruas e plantações que sobraram.
    const ruin = this.ruinNear(x + 0.5, y + 0.5, TIER_RADIUS[0] + 2, s);
    if (ruin) {
      x = Math.floor(ruin.x);
      y = Math.floor(ruin.y);
    }
    const id = this.villages.length;
    const village: Village = {
      id,
      name: this.uniqueName(),
      species: s,
      x: x + 0.5,
      y: y + 0.5,
      houses: [],
      fields: 0,
      leader: -1,
      tier: 0,
      kingdom: from ? from.kingdom : id,
      lots: [],
      tech: from ? from.tech * 0.8 : 0,
      population: 0,
      port: -1,
      food: 0,
      stock: emptyStock(),
      made: emptyMade(),
      culture: from ? from.culture : makeCulture(this.cultures++, '', rnd),
      mines: [],
      forgeWork: 0,
      forest: 0,
      rock: false,
      color: from ? from.color : this.freshColor(),
      abandoned: false,
    };
    if (!from) village.culture = makeCulture(village.culture.id, village.name, rnd);
    if (ruin) {
      village.ruinOf = ruin.id;
      if (!ruin.decay) village.fields = ruin.fields;
      ruin.decay = 3;
    }
    this.villages.push(village);
    this.layStreets(village);
    this.buildHouse(village, 'house', true);
    this.chooseVocation(village, from);
    this.materialOf(village);
    // Colonos levam o enxoval: parte da madeira e da comida da origem (RF-VIDA-212).
    if (from) {
      const wood = Math.min(30, from.stock.wood * 0.25);
      from.stock.wood -= wood;
      village.stock.wood = wood;
      const food = Math.min(20, from.food * 0.2);
      from.food -= food;
      village.food = food;
    }
    for (let k = 0; k < settlers; k++) {
      this.spawn(s, x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, village.id, sp.maturity + rnd() * 10);
    }
    return village;
  }

  /** Cor de reino que nenhum reino vivo usa (da paleta; acabando, uma cor gerada). */
  private freshColor(): [number, number, number] {
    const used = new Set(this.villages.filter((o) => !o.abandoned && o.kingdom === o.id).map((o) => o.color.join(',')));
    const free = KINGDOM_COLORS.filter((c) => !used.has(c.join(',')));
    if (free.length) return free[Math.floor(this.civRnd() * Math.min(3, free.length))];
    return hsl(this.civRnd(), 0.65 + this.civRnd() * 0.25, 0.4 + this.civRnd() * 0.25);
  }

  private abandon(v: Village): void {
    v.abandoned = true;
    v.abandonedAt = this.year;
    v.decay = 0;
    // As casas viram ruína e somem; as ruas e plantações ficam e vão sumindo com o tempo (clearRuins).
    for (const h of v.houses) {
      const size = h.kind === 'port' ? 1 : 2;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const t = this.tileAt(h.x + dx, h.y + dy);
          if (t >= 0) {
            this.built[t] = 0;
            this.onTileChanged(t);
          }
        }
      }
    }
    // O que sobrou no estoque se perde com o lugar: ninguém herda (pedido do Joab, seção 19.19). Só o saque leva bens embora.
    v.stock = emptyStock();
    v.stock.wood = 0;
    v.food = 0;
    v.houses.length = 0;
    v.port = -1;
    for (const id of v.mines) this.deposits[id].mine = -1;
    v.mines.length = 0;
    // Assentamentos do reino de uma capital abandonada ficam independentes.
    for (const o of this.villages) if (o.kingdom === v.id && o !== v) o.kingdom = o.id;
    const cause = v.lastCause ? `: o último morador morreu ${v.lastCause}` : '';
    this.note(`${v.name} foi abandonada${cause}`, 'povo', v, { major: v.tier >= 1 });
  }

  /**
   * Uma etapa do sumiço das ruínas: na 1ª somem as plantações e um terço das
   * ruas, na 2ª outro terço, na 3ª o resto, praça incluída. Não mexe no que
   * estiver dentro de um assentamento vivo.
   */
  private clearRuins(v: Village, stage: number): void {
    const r = Math.ceil(this.radius(v)) + 1;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || !this.road[t] || this.built[t]) continue;
        const gone = this.road[t] === 4 || this.road[t] === 5 || stage >= 3 || (Math.imul(t, 2654435761) >>> 0) % 3 < stage;
        if (!gone || this.settlementAt(cx + dx + 0.5, cy + dy + 0.5)) continue;
        this.road[t] = 0;
        this.onTileChanged(t);
      }
    }
    v.decay = stage;
    v.pens = undefined;
    if (stage >= 3) this.note(`As últimas ruínas de ${v.name} sumiram`, 'povo', v);
  }

  /** Sobe de nível quando a população permite. Aldeias e vilas não podem conter outro assentamento. */
  private growTier(v: Village): void {
    const target = tierFor(v.population);
    if (target <= v.tier) return;
    // Subir de nível exige a planta do nível atual quase completa (RF-VIDA-205); sem ela, o lugar adensa.
    if ((v.completeness ?? 1) < B.TIER_UP_COMPLETENESS) return;
    const r = TIER_RADIUS[target];
    const inside = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < r);
    if (target < 2 && inside.length) return;
    if (target >= 2) {
      for (const o of inside) {
        // Só aldeias e vilas independentes (ou do próprio reino) se juntam; as de outro reino ficam, e a fronteira esquenta.
        if (o.species !== v.species || o.tier >= 2) continue;
        if (o.kingdom !== v.kingdom && this.kingdomSize(this.capitalOf(o)) > 1) {
          const key = this.key(o.kingdom, v.kingdom);
          this.relations.set(key, (this.relations.get(key) ?? 0) - 10);
          continue;
        }
        if (o.kingdom === v.kingdom) continue;
        o.kingdom = v.kingdom;
        o.color = v.color;
        this.connect(v, o);
        this.note(`${o.name} passou a fazer parte do reino de ${this.capitalOf(v).name}`, 'povo', o);
      }
    }
    v.tier = target;
    v.growth = 0;
    this.layStreets(v);
    this.note(`${v.name} virou ${TIER_NAMES[target].toLowerCase()}`, 'povo', v, { major: target >= 2 });
  }

  private updateVillages(dt: number): void {
    // Adultos de cada assentamento, para escolher líderes.
    const adults: number[][] = this.villages.map(() => []);
    // Trabalhadores por profissão (adultos que ainda não são idosos).
    const workers = this.villages.map(() => new Array<number>(ROLES.length).fill(0));
    // Moradores e os que estão bem alimentados (atendimento de comida, RF-VIDA-210).
    const residents = new Array<number>(this.villages.length).fill(0);
    const fed = new Array<number>(this.villages.length).fill(0);
    for (let i = 0; i < this.count; i++) {
      const v = this.village[i];
      if (v < 0 || !this.alive[i]) continue;
      residents[v]++;
      if (this.energy[i] >= 0.3) fed[v]++;
      if (this.role[i] === CHILD) continue;
      adults[v].push(i);
      const village = this.villages[v];
      if (this.age[i] < elderAge(this.species[this.kind[i]], Math.floor(village.tech))) workers[v][this.role[i]]++;
    }
    const fishers = workers.map((w) => w[ROLE.fisher]);
    fishers.length = this.villages.length;
    let live = 0;
    for (const v of this.villages) if (!v.abandoned) live++;
    for (const v of this.villages) {
      if (v.abandoned) {
        const stage = v.decay ?? 3;
        if (stage < 3 && this.year - (v.abandonedAt ?? 0) >= (stage + 1) * RUIN_YEARS) this.clearRuins(v, stage + 1);
        continue;
      }
      if (v.population <= 0) {
        this.abandon(v);
        continue;
      }
      const before = Math.floor(v.tech);
      if (before < ERA_YEARS.length) {
        // Cresce com a população e com o tamanho do reino (troca de ideias).
        const people = Math.min(1.3, Math.max(0.4, Math.sqrt(v.population / 30)));
        const kingdom = Math.min(1.25, 1 + 0.05 * (this.kingdomSize(this.capitalOf(v)) - 1));
        const wise = v.culture.value === 'conhecimento' ? 1.2 : 1;
        this.advance(v, ((dt / YEAR_SECONDS) * people * kingdom * wise) / ERA_YEARS[before]);
      }
      if (Math.floor(v.tech) > before) {
        this.note(`${v.name} entrou na ${ERAS[Math.floor(v.tech)]}`, 'era', v, { major: true });
        // Cada era nova refaz o calçamento (RF-VIDA-253; antes só a Era Medieval, quando todas as ruas viravam pedra).
        if (Math.floor(v.tech) >= 2) this.layStreets(v);
      }
      this.growTier(v);
      this.updateLeader(v, adults[v.id] ?? []);
      // Assentamentos fundados neste passo ainda não têm contagem.
      if (workers[v.id]) this.produce(v, workers[v.id], adults[v.id].length, dt);
      // Crescimento para dentro (RF-VIDA-202): preencher os lotes, completar a planta e reformar, adensar e só então expandir.
      const homes = v.houses.filter((h) => h.kind === 'house').length;
      const yr = dt / YEAR_SECONDS;
      const items = this.plan(v);
      v.completeness = completeness(items);
      v.missing = missingText(items);
      const needRoom = v.population > this.housing(v) - 3;
      const lot = needRoom || v.completeness < 1 ? this.freeLot(v) : null;
      const pace = v.needs ? 0.6 + 0.4 * welfare(v.needs) : 1;
      if ((needRoom || v.population > homes * 3) && happens(this.civRnd, B.HOUSE_RATE * pace, yr)) {
        // A planta pede uma construção especial: ela vem antes da casa nova, quando há material.
        const special = homes >= 4 && (v.completeness < 1 || this.civRnd() < B.SPECIAL_BUILDING_SHARE) ? this.nextBuilding(v) : null;
        if (!(special && this.buildHouse(v, special)) && lot) this.buildHouse(v, 'house');
      }
      // Reformas: casa que ganha um andar (sobrado), mais depressa quando falta lote e sobra gente.
      const builders = workers[v.id]?.[ROLE.builder] ?? 0;
      const squeezed = needRoom && !lot;
      const rich = v.needs && welfare(v.needs) >= 0.88 ? B.RICH_REFORM : 1;
      if (happens(this.civRnd, B.REFORM_RATE * Math.max(1, builders) * (squeezed ? 3 : 1) * rich, yr)) this.reform(v);
      // Era nova: as casas antigas vão sendo trocadas pelo estilo novo, uma a uma.
      if (this.outdated(v) && happens(this.civRnd, B.RESTYLE_RATE * Math.max(1, builders), yr)) this.restyle(v);
      // Ruas sob demanda (RF-VIDA-207): sem lote, abre mais um trecho da planta; com a planta toda aberta e
      // sem casa para reformar, a planta cresce rumo ao nível seguinte.
      const planLeft = (v.streetLen ?? 0) < (v.streetPlan ?? 0);
      if ((needRoom || v.completeness < 1) && !lot && planLeft && happens(this.civRnd, B.STREET_BLOCK_RATE, yr)) this.openBlock(v);
      else if (squeezed && !planLeft && !this.reformable(v) && (v.growth ?? 0) < 1 && happens(this.civRnd, B.STREET_GROW_RATE * 4, yr)) this.growStreets(v);
      // Lavouras trabalhadas por agricultores enchem o celeiro (cada porção mata a fome de um morador).
      // A colheita vem quase toda no outono (RF-VIDA-290); boi ou cavalo no arado dobram a área de cada agricultor;
      // o moinho faz pão (RF-VIDA-211); o solo cansado rende menos (RF-VIDA-294).
      if (v.fields > 0 && workers[v.id]) {
        const w = workers[v.id];
        const plough = v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat' ? 1 : 0.5;
        // Cada roça no mapa é um lote grande, que até FIELD_HANDS agricultores trabalham (o mapa tem no máximo 5 roças).
        const worked = Math.min(v.fields * B.FIELD_HANDS, Math.ceil(w[ROLE.farmer] * plough) + 1);
        const mill = v.houses.some((h) => h.kind === 'windmill') ? 1 + 0.3 * Math.min(1, w[ROLE.miller]) : 1;
        const bonus = v.vocation === 'agricola' ? 1 + B.VOCATION_BONUS : 1;
        const fallow = (v.soil ?? 1) < B.SOIL_FALLOW ? 0.5 : 1;
        const season = B.SEASON_HARVEST[seasonOf(this.yearClock / YEAR_SECONDS)];
        this.book(v, '_fields', this.gain(v, 'food', worked * B.FIELD_YIELD * this.harvest(v) * (v.soil ?? 1) * fallow * mill * bonus * season * yr), 0);
      }
      if (workers[v.id]) this.consume(v, residents[v.id] ? fed[v.id] / residents[v.id] : 1, yr);
      // Roças no fim da Idade da Pedra (uma para cada quatro casas); da Idade do Bronze em diante, uma para cada duas.
      // Só planta o que os agricultores dão conta (mais uma); roça sem ninguém para trabalhar volta a ser campo.
      // No máximo maxFieldsOf(nível) roças no mapa (pedido do Joab: até 5 na metrópole).
      const hands = Math.ceil((workers[v.id]?.[ROLE.farmer] ?? 0) * (v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat' ? 1 : 0.5)) + 1;
      const room = Math.min(maxFieldsOf(v.tier), Math.ceil(hands / B.FIELD_HANDS) + 1);
      if (v.fields < Math.min(room, homes / (Math.floor(v.tech) >= 1 ? 2 : 4)) && v.tech >= 0.12 && happens(this.civRnd, B.FIELD_RATE, dt / YEAR_SECONDS)) this.plantField(v);
      else if (v.fields > room && happens(this.civRnd, B.FIELD_FALLOW_RATE, dt / YEAR_SECONDS)) this.dropField(v);
      // De vez em quando aparece um andarilho do mesmo povo, mais fácil quando o lugar tem pouca gente.
      const rush = (v.goldRush ?? 0) > this.year ? B.GOLD_RUSH_WANDERERS : 0;
      const wander = B.WANDERER_RATE[v.population <= 3 ? 0 : v.population < 10 ? 1 : v.population < 30 ? 2 : 3] + rush;
      if (happens(this.civRnd, wander, dt / YEAR_SECONDS)) this.wanderer(v);
      // Porto na costa a partir do fim da Idade da Pedra (canoas); barcos de pesca saem dele.
      if (v.port < 0 && v.tech >= 0.5 && happens(this.civRnd, B.PORT_RATE, dt / YEAR_SECONDS)) this.buildPort(v);
      if (v.port >= 0 && fishers[v.id] > 0 && happens(this.civRnd, B.FISH_TRIP_RATE, dt / YEAR_SECONDS)) {
        let out = 0;
        for (const b of this.boats) if (b.village === v.id && b.purpose === 'fish' && b.sunk < 0) out++;
        if (out < Math.min(3, 1 + Math.floor(fishers[v.id] / 3))) this.launch(v, 'fish');
      }
      // Exploradores por mar a partir do Bronze; povos comerciantes e sábios exploram mais.
      const curious = v.culture.value === 'comércio' || v.culture.value === 'conhecimento' ? 2 : 1;
      if (v.port >= 0 && v.tech >= 1 && happens(this.civRnd, B.EXPLORE_RATE * curious, dt / YEAR_SECONDS)) this.explore(v);
      // Caravanas, tributo pedido pela capital e rebanho rumo ao pasto alto (19.6).
      this.sendCaravan(v, yr);
      // Colonos (RF-VIDA-204): mais em eras avançadas, bem menos com a planta incompleta, e mais quando falta espaço de verdade.
      const crowded = v.population >= 8 && squeezed && !planLeft && !this.reformable(v) && (v.growth ?? 0) >= 1;
      const ready = B.COLONY_MIN_FACTOR + (1 - B.COLONY_MIN_FACTOR) * v.completeness ** 2;
      const pressure = crowded ? B.COLONY_PRESSURE_CROWDED : B.COLONY_PRESSURE_ROOM;
      // Primeiro o assentamento cresce o quanto pode; só manda colonos quando não há mais lote, reforma nem rua (pedido do Joab).
      if (crowded && v.tier >= B.COLONY_MIN_TIER && happens(this.civRnd, B.COLONY_RATE * (1 + 0.25 * Math.floor(v.tech)) * ready * pressure, yr) && live < 100) {
        if (!this.colonizeByLand(v)) this.colonizeBySea(v);
      }
    }
    this.updateWars(dt);
    this.yearClock += dt;
    if (this.yearClock >= YEAR_SECONDS) {
      this.yearClock = 0;
      this.yearly();
    }
  }

  // Economia ---------------------------------------------------------------

  /** Estação do ano econômico agora (0 primavera … 3 inverno, RF-VIDA-290). */
  season(): number {
    return seasonOf(this.yearClock / YEAR_SECONDS);
  }

  /** Estoque do próprio assentamento: nada é compartilhado com o reino (RF-VIDA-212). */
  store(v: Village): Stock {
    return v.stock;
  }

  /** Soma dos estoques dos assentamentos de um reino (só para mostrar na janela de reinos). */
  kingdomStock(k: number): Stock {
    const total = emptyStock();
    total.wood = 0;
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom !== k) continue;
      for (const g of GOODS) total[g] += v.stock[g];
      total.horses += v.stock.horses;
      total.weaponTier = Math.max(total.weaponTier, v.stock.weaponTier);
      total.armorTier = Math.max(total.armorTier, v.stock.armorTier);
    }
    return total;
  }

  private has(v: Village, kind: BuildingKind): boolean {
    return v.houses.some((h) => h.kind === kind);
  }

  private roleContext(v: Village): RoleContext {
    const herd = !!v.herd && v.herd.head > 0;
    return {
      port: v.port >= 0,
      smithy: this.has(v, 'smithy'),
      warlike: v.culture.value === 'guerra',
      herd,
      stable: this.has(v, 'stable'),
      loom: this.has(v, 'loom'),
      pottery: this.has(v, 'pottery'),
      windmill: this.has(v, 'windmill'),
      market: this.has(v, 'market'),
      temple: this.has(v, 'temple'),
      vocation: v.vocation ? VOCATION_ROLE[v.vocation] : undefined,
    };
  }

  /** O que entra no teto do estoque do assentamento (RF-VIDA-218). */
  capContext(v: Village): CapContext {
    return { tier: v.tier, granary: this.has(v, 'granary'), warehouse: this.has(v, 'warehouse'), treasury: this.has(v, 'market'), mines: v.mines.length };
  }

  /** Teto de um recurso no assentamento. */
  capOf(v: Village, good: Good | 'food'): number {
    const c = this.capContext(v);
    return good === 'food' ? foodCap(c) : goodCap(good, c);
  }

  /** Anota produção e consumo do ano corrente (painel de economia, RF-VIDA-217). */
  private book(v: Village, key: string, made: number, used: number): void {
    const l = (v.ledgerNow ??= {});
    const e = (l[key] ??= [0, 0]);
    e[0] += made;
    e[1] += used;
  }

  /**
   * Produção que entra no estoque com retorno decrescente perto do teto
   * (RF-VIDA-219b) e parada no teto (RF-VIDA-218). Retorna quanto entrou.
   */
  private gain(v: Village, good: Good | 'food', amount: number): number {
    if (amount <= 0) return 0;
    const cap = this.capOf(v, good);
    const have = good === 'food' ? v.food : v.stock[good];
    const got = Math.max(0, Math.min(cap - have, amount * room(have, cap)));
    if (good === 'food') v.food += got;
    else v.stock[good] += got;
    this.book(v, good, got, 0);
    return got;
  }

  /** Tira do estoque até `amount`; retorna quanto tirou. */
  private spend(v: Village, good: Good | 'food', amount: number): number {
    const have = good === 'food' ? v.food : v.stock[good];
    const take = Math.max(0, Math.min(have, amount));
    if (good === 'food') v.food -= take;
    else v.stock[good] -= take;
    if (take > 0) this.book(v, good, 0, take);
    return take;
  }

  /** Paga a construção com o estoque do próprio assentamento (tijolo serve no lugar da pedra); false se faltar material. */
  private pay(v: Village, kind: string): boolean {
    const st = this.store(v);
    const c = buildCost(kind, Math.floor(v.tech));
    if (st.wood < c.wood || st.stone + st.brick < c.stone || st.gold < c.gold) return false;
    this.spend(v, 'wood', c.wood);
    const brick = Math.min(st.brick, c.stone);
    this.spend(v, 'brick', brick);
    this.spend(v, 'stone', c.stone - brick);
    this.spend(v, 'gold', c.gold);
    return true;
  }

  /**
   * Consumo obrigatório e perecimento (RF-VIDA-219 e 219a), em fração de ano:
   * lenha (o dobro no frio, mais no inverno), roupa, comida e madeira que
   * estragam, ferramentas que enferrujam, ouro em excesso que perde valor.
   */
  private consume(v: Village, fedShare: number, yr: number): void {
    const st = v.stock;
    const season = seasonOf(this.yearClock / YEAR_SECONDS);
    const cold = temperatureAt(this.map, this.tileAt(v.x, Math.floor(v.y))) < B.COLD_K ? 2 : 1;
    const fuel = v.population * B.CONSUME_FUEL * cold * B.SEASON_FUEL[season] * yr;
    const burnt = this.spend(v, 'wood', fuel);
    this.book(v, '_fuel', burnt, fuel);
    // Consertos das casas ao longo do ano (seção 19.19); tijolo serve no lugar da pedra.
    const fix = this.repairs(v);
    if (fix.wood + fix.stone > 0) {
      const brick = Math.min(st.brick, fix.stone * yr);
      const paid = this.spend(v, 'wood', fix.wood * yr) + this.spend(v, 'brick', brick) + this.spend(v, 'stone', fix.stone * yr - brick);
      this.book(v, '_upkeep', paid, (fix.wood + fix.stone) * yr);
    }
    // Inverno frio sem lenha: a falta tira energia dos moradores (seção 19.19).
    v.chill = cold > 1 && season === 3 && fuel > 0 ? 1 - burnt / fuel : 0;
    const cloth = v.population * B.CONSUME_CLOTH * yr;
    const worn = this.spend(v, 'cloth', cloth);
    this.book(v, '_cloth', worn + this.spend(v, 'hides', cloth - worn), cloth);
    // Rebanho come grão no inverno.
    if (v.herd && season === 3) this.spend(v, 'food', v.herd.head * 0.1 * yr * 4);
    const granary = this.has(v, 'granary');
    // Sal conserva carne e peixe (RF-VIDA-282 e 219a).
    const salted = !granary && st.salt >= 0.1;
    if (salted) this.spend(v, 'salt', v.population * B.SALT_USE * yr);
    this.spend(v, 'food', v.food * (granary ? B.SPOIL_GRAIN : salted ? B.SPOIL_SALTED : B.SPOIL_MEAT) * yr);
    this.spend(v, 'wood', st.wood * B.SPOIL_WOOD * yr);
    this.spend(v, 'tools', st.tools * 0.02 * yr);
    const goldCap = this.capOf(v, 'gold');
    if (st.gold > goldCap * B.GOLD_INFLATION_FILL) this.spend(v, 'gold', (st.gold - goldCap * B.GOLD_INFLATION_FILL) * B.GOLD_INFLATION * yr);
    // Quem já comeu bem: parte da comida (o resto vem da coleta).
    this.book(v, '_fed', fedShare * yr, yr);
  }

  /**
   * Avança o conhecimento. Mudar de era exige condições (minérios achados e
   * trabalhados, ERA_NEEDS), não só tempo: sem elas o progresso para em 99%.
   */
  private advance(v: Village, amount: number): void {
    const era = Math.floor(v.tech);
    let next = Math.min(ERAS.length - 1, v.tech + amount);
    if (Math.floor(next) > era && !ERA_NEEDS[era].met(this.villages[v.kingdom].made)) next = Math.min(next, era + 0.999);
    v.tech = next;
  }

  /** O que falta para o assentamento mudar de era, ou null. */
  eraNeed(v: Village): string | null {
    const era = Math.floor(v.tech);
    if (era >= ERA_NEEDS.length || ERA_NEEDS[era].met(this.villages[v.kingdom].made)) return null;
    return ERA_NEEDS[era].text;
  }

  /** Floresta e rocha em volta do assentamento (amostra), para lenha e pedra. */
  private survey(v: Village): void {
    const r = this.radius(v) + 6;
    let veg = 0;
    let rock = false;
    for (let k = 0; k < 40; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = Math.sqrt(this.civRnd()) * r;
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0) continue;
      veg += this.map.vegetation[t];
      const b = this.map.biome[t] as Biome;
      if (b === Biome.Rock || b === Biome.Mountain || this.map.elevation[t] > 0.35) rock = true;
    }
    v.forest = veg / 40;
    v.rock = rock;
  }

  /**
   * Um ano (proporcional) de trabalho: lenha, pedra, barro e tijolo, minas,
   * ferraria, rebanho, lã e roupa, e o ganho dos comerciantes. Tudo entra no
   * estoque do próprio assentamento (RF-VIDA-212), com retorno decrescente
   * perto do teto; a vocação dá bônus no setor dela (RF-VIDA-221).
   */
  private produce(v: Village, w: number[], adults: number, dt: number): void {
    const yr = dt / YEAR_SECONDS;
    const st = v.stock;
    const made = this.villages[v.kingdom].made;
    if (happens(this.civRnd, B.SURVEY_RATE, yr) || v.forest === 0) this.survey(v);
    const tools = st.tools > 0 ? 1.4 : 1;
    const bonus = (voc: Vocation) => (v.vocation === voc ? 1 + B.VOCATION_BONUS : 1);
    const season = seasonOf(this.yearClock / YEAR_SECONDS);
    // Lenha (seção 19.19): os lenhadores derrubam árvores de verdade, da mais perto para a mais longe;
    // quanto mais longe a mata, menos madeira chega por ano. A serraria aproveita mais de cada tronco.
    const cutters = w[ROLE.woodcutter];
    if (cutters) this.cutWood(v, cutters * B.CUT_RATE * yr * tools * bonus('madeireira'), this.has(v, 'sawmill') ? 1.3 : 1);
    // Coletores trazem frutos, raízes e mel do mato, que se gasta e rebrota (seção 19.19).
    if (w[ROLE.gatherer]) this.gather(v, w[ROLE.gatherer] * B.GATHER_RATE * yr * this.harvest(v) * B.SEASON_HARVEST[season] ** 0.5);
    // Minas: o minério sai da jazida (limitada) para o estoque do assentamento que a explora.
    const mines = v.mines.map((id) => this.deposits[id]);
    if (mines.length && w[ROLE.miner]) {
      const each = (w[ROLE.miner] * 0.8 * yr * tools * bonus('mineira')) / mines.length;
      for (const d of mines) {
        const take = this.gain(v, d.ore, Math.min(d.amount, each));
        d.amount -= take;
        if (d.ore === 'coal') made.coal += take;
        if (d.amount <= 0) {
          d.mine = -1;
          v.mines.splice(v.mines.indexOf(d.id), 1);
          this.note(`A mina de ${ORE_NAMES[d.ore]} de ${v.name} se esgotou`, 'economia', d);
        }
      }
    }
    // Pedra (seção 19.19): mineradores sem mina e construtores tiram pedra da rocha por perto, ou
    // juntam pedras soltas do chão; cada tile tem um tanto e acaba.
    const quarry = (mines.length ? 0 : w[ROLE.miner]) + w[ROLE.builder] * 0.5;
    if (quarry) made.stone += this.quarry(v, quarry * B.QUARRY_RATE * yr * tools);
    // Barro e tijolo (RF-VIDA-211): o oleiro tira barro perto da água e queima tijolo e telha na olaria.
    if (w[ROLE.potter] && v.wet && this.has(v, 'pottery')) {
      this.gain(v, 'clay', w[ROLE.potter] * 2 * yr * tools);
      const fired = this.spend(v, 'clay', Math.min(st.clay, w[ROLE.potter] * 1.5 * yr));
      this.gain(v, 'brick', fired);
    }
    // Rebanho (RF-VIDA-215): leite, carne, couro e lã; a tosquia é na primavera (RF-VIDA-290).
    const herd = v.herd;
    if (herd && herd.head > 0) {
      const tend = Math.min(1, 0.4 + (w[ROLE.shepherd] * 6) / herd.head);
      const extra = herd.kind === 'sheep' ? bonus('ovelhas') : herd.kind === 'cattle' || herd.kind === 'goat' ? bonus('gado') : bonus('cavalos');
      const k = herd.head * tend * extra * yr;
      let meat = 0;
      if (herd.kind === 'sheep') {
        this.gain(v, 'wool', k * 0.35 * B.SEASON_WOOL[season]);
        meat = this.gain(v, 'food', k * 0.08);
      } else if (herd.kind === 'cattle') {
        meat = this.gain(v, 'food', k * 0.3);
        this.gain(v, 'hides', k * 0.06);
      } else if (herd.kind === 'goat') {
        meat = this.gain(v, 'food', k * 0.22);
        this.gain(v, 'hides', k * 0.04);
      } else meat = this.gain(v, 'food', k * 0.05);
      this.book(v, '_herd', meat, 0);
    }
    // Tear: a lã vira roupa.
    if (w[ROLE.weaver] && this.has(v, 'loom')) this.gain(v, 'cloth', this.spend(v, 'wool', Math.min(st.wool, w[ROLE.weaver] * 1.5 * yr)) * bonus('ovelhas'));
    // Coletores trançam fibra e casca em roupa simples.
    if (w[ROLE.gatherer]) this.gain(v, 'cloth', w[ROLE.gatherer] * 0.4 * yr);
    // Comerciantes no mercado ganham um pouco de ouro com as trocas.
    if (w[ROLE.merchant] && this.has(v, 'market')) this.gain(v, 'gold', w[ROLE.merchant] * 0.25 * yr * bonus('mercantil'));
    const era = Math.floor(v.tech);
    const soldiers = w[ROLE.soldier] + w[ROLE.guard];
    // Idade da Pedra: construtores e coletores lascam pedra e madeira (sem ferraria).
    if (st.stone >= 1 && st.wood >= 1 && this.civRnd() < (w[ROLE.builder] + w[ROLE.gatherer]) * 0.12 * yr) {
      this.spend(v, 'stone', 1);
      this.spend(v, 'wood', 1);
      this.craft(v, st, this.needed(st, adults, soldiers, v), 'stone', era);
    }
    // Ferraria: cada ferreiro faz uma peça a cada ano e pouco, se houver metal; a fábrica dobra o ritmo.
    if (w[ROLE.blacksmith] && this.has(v, 'smithy')) {
      const factory = this.has(v, 'factory') ? 2 : 1;
      v.forgeWork += w[ROLE.blacksmith] * 0.6 * yr * factory * bonus('mineira');
      while (v.forgeWork >= 1) {
        // Ouro vira joia de vez em quando (anéis, amuletos e a coroa do rei).
        if (era >= 1 && st.gold >= 2 && this.civRnd() < 0.2) {
          this.spend(v, 'gold', 2);
          v.forgeWork -= 1;
          this.craft(v, st, 'joia', 'gold', era);
          continue;
        }
        const before = st.copper + st.tin + st.iron + st.coal;
        const piece = forge(st, era);
        if (!piece) {
          v.forgeWork = 0;
          break;
        }
        this.book(v, 'metal', 0, before - (st.copper + st.tin + st.iron + st.coal));
        v.forgeWork -= 1;
        made[piece.kind]++;
        this.craft(v, st, this.needed(st, adults, soldiers, v), TIER_MATERIAL[piece.tier], era);
      }
    }
    // Abre uma mina numa jazida conhecida, de preferência do minério que falta para a próxima era.
    if (w[ROLE.miner] && v.mines.length < 1 + v.tier && happens(this.civRnd, B.MINE_RATE, dt / YEAR_SECONDS)) this.openMine(v);
  }

  // Recursos do mapa (seção 19.19) ----------------------------------------------

  /**
   * Põe no estoque o que alguém trouxe carregado (árvore, pedra, colheita, caça), sem o retorno
   * decrescente da produção: o que não cabe no teto se perde. Retorna quanto entrou.
   */
  private put(v: Village, good: Good | 'food', amount: number): number {
    if (amount <= 0) return 0;
    const have = good === 'food' ? v.food : v.stock[good];
    const got = Math.max(0, Math.min(this.capOf(v, good) - have, amount));
    if (good === 'food') v.food += got;
    else v.stock[good] += got;
    this.book(v, good, got, 0);
    return got;
  }

  /** Alcance do corte, da pedreira e da coleta além da borda: cresce com a era (estradas, carroças). */
  private reachOf(v: Village, base: number): number {
    return this.radius(v) + base * (1 + B.REACH_PER_ERA * Math.floor(v.tech));
  }

  /** Parte do trabalho que sobra depois de carregar de longe até o assentamento: metade a HAUL_TILES além da borda. */
  private haulFactor(v: Village, t: number): number {
    const w = this.map.width;
    const d = Math.max(0, this.distance(v, (t % w) + 0.5, Math.floor(t / w) + 0.5) - this.radius(v));
    const horses = v.stock.horses > 0 || (!!v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat');
    const carts = 1 + B.CART_PER_ERA * Math.floor(v.tech) + (horses ? B.HORSE_HAUL : 0);
    return 1 / (1 + d / (B.HAUL_TILES * carts));
  }

  /** Tile com uma árvore de pé que o povo pode cortar. */
  standingTree(t: number): boolean {
    return isLand(this.map, t) && !this.road[t] && !this.built[t] && isTree(decorAt(this.map, t));
  }

  /** Árvores de pé ao alcance, da mais perto para a mais longe (refeita quando acaba, no máximo uma vez por ano). */
  private scanTrees(v: Village): void {
    const r = this.reachOf(v, B.WOOD_REACH);
    const ri = Math.ceil(r);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const found: [number, number][] = [];
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = dx * dx + dy * dy;
        if (d > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && this.standingTree(t)) found.push([t, d]);
      }
    }
    found.sort((a, b) => a[1] - b[1]);
    v.treeList = found.map((f) => f[0]);
    v.treeNext = 0;
    v.trees = found.length;
    v.treesStart ??= found.length;
    v.treeScan = Math.floor(this.year);
  }

  /** Próxima árvore de pé a cortar (a mais perto), ou -1 quando a mata ao alcance acabou. */
  private nextTree(v: Village): number {
    for (;;) {
      if (!v.treeList || (v.treeNext ?? 0) >= v.treeList.length) {
        if (v.treeList && v.treeScan === Math.floor(this.year)) return -1;
        this.scanTrees(v);
        if (!v.treeList!.length) return -1;
      }
      const t = v.treeList![v.treeNext!];
      if (this.standingTree(t)) return t;
      v.treeNext!++;
    }
  }

  /** Derruba a árvore do tile: fica o toco (ou a muda, quando o povo replanta). */
  private fellTree(t: number, replant: boolean): void {
    const map = this.map;
    this.treeVeg[t] = Math.max(map.vegetation[t], B.FELLED_VEG_MAX + 0.1);
    this.treeGrow[t] = 0;
    map.felled![t] = replant ? 3 : 1;
    this.stumps.add(t);
    map.vegetation[t] = Math.min(map.vegetation[t], B.FELLED_VEG_MAX);
    map.biome[t] = classify(map, t);
    this.treesCut++;
    if (replant) this.treesPlanted++;
    this.onTileChanged(t);
  }

  /**
   * Corte de lenha (seção 19.19): `work` em árvores por ano com a mata na porta; mata longe rende
   * menos. Só corta o que cabe no estoque (nada se desperdiça) e, com manejo, planta uma muda no
   * lugar de cada árvore cortada.
   */
  private cutWood(v: Village, work: number, yieldK: number): void {
    const per = B.WOOD_PER_TREE * yieldK;
    const cost = 1 + (v.forestry ? B.REPLANT_WORK : 0);
    let t = this.nextTree(v);
    v.fellAt = t;
    if (t < 0 || v.stock.wood + per > this.capOf(v, 'wood')) return;
    v.chop = (v.chop ?? 0) + work * this.haulFactor(v, t);
    while (v.chop >= cost && t >= 0 && v.stock.wood + per <= this.capOf(v, 'wood')) {
      v.chop -= cost;
      this.fellTree(t, !!v.forestry);
      this.put(v, 'wood', per);
      this.book(v, '_trees', 1, 0);
      t = this.nextTree(v);
      v.fellAt = t;
    }
    if (t < 0) v.chop = 0;
  }

  /** Pedra que um tile ainda dá: muita na rocha e na montanha, menos na colina, pedras soltas no chão comum. */
  stoneOf(t: number): number {
    const map = this.map;
    if (!isLand(map, t)) return 0;
    const b = map.biome[t] as Biome;
    if (b === Biome.Snow || b === Biome.Ice || b === Biome.Lava) return 0;
    const total = b === Biome.Rock || b === Biome.Mountain ? B.STONE_ROCK : map.elevation[t] > 0.35 ? B.STONE_HILL : B.STONE_FIELD;
    return Math.max(0, total - this.stoneTaken[t]);
  }

  /** Quanto rende o trabalho num tile: rocha inteira, colina um pouco menos, pedra solta bem menos. */
  private stoneRate(t: number): number {
    const b = this.map.biome[t] as Biome;
    return b === Biome.Rock || b === Biome.Mountain ? 1 : this.map.elevation[t] > 0.35 ? 0.7 : B.FIELD_STONE_RATE;
  }

  /** Tiles com pedra ao alcance, do que mais rende (rocha perto) para o que menos rende. */
  private scanStone(v: Village): void {
    const r = this.reachOf(v, B.STONE_REACH);
    const ri = Math.ceil(r);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const found: [number, number][] = [];
    let left = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.built[t] || this.road[t]) continue;
        const n = this.stoneOf(t);
        if (n <= 0) continue;
        left += n;
        found.push([t, this.stoneRate(t) * this.haulFactor(v, t)]);
      }
    }
    found.sort((a, b) => b[1] - a[1]);
    v.stoneList = found.slice(0, 400).map((f) => f[0]);
    v.stoneNext = 0;
    v.stoneLeft = left;
    v.stoneScan = Math.floor(this.year);
  }

  /** Pedreira (seção 19.19): `work` em pedra por ano na rocha da porta; tira de cada tile até ele acabar. Retorna a pedra que entrou. */
  private quarry(v: Village, work: number): number {
    const cap = this.capOf(v, 'stone');
    let got = 0;
    let left = work;
    for (let guard = 0; left > 1e-6 && guard < 50 && v.stock.stone < cap; guard++) {
      if (!v.stoneList || (v.stoneNext ?? 0) >= v.stoneList.length) {
        if (v.stoneList && v.stoneScan === Math.floor(this.year)) break;
        this.scanStone(v);
        if (!v.stoneList!.length) break;
      }
      const t = v.stoneList![v.stoneNext!];
      const have = this.stoneOf(t);
      if (have <= 0 || this.built[t] || this.road[t]) {
        v.stoneNext!++;
        continue;
      }
      const rate = this.stoneRate(t) * this.haulFactor(v, t);
      const take = Math.min(have, left * rate, cap - v.stock.stone);
      if (take <= 0) break;
      this.stoneTaken[t] += take;
      v.stoneLeft = Math.max(0, (v.stoneLeft ?? 0) - take);
      got += this.put(v, 'stone', take);
      left -= take / rate;
      if (this.stoneOf(t) <= 0) {
        v.stoneNext!++;
        // Pedregulho que virou pedra de construção some do mapa.
        if (decorAt(this.map, t) === Decor.Boulder) {
          this.map.bare ??= new Uint8Array(this.map.width * this.map.height);
          this.map.bare[t] = 1;
          this.onTileChanged(t);
        }
      }
    }
    return got;
  }

  /**
   * Coleta (seção 19.19): cada porção vem de um tile com vegetação ao alcance e a desbasta um
   * pouco; o mato rebrota com o tempo. Em volta de um lugar cheio de gente a coleta rende cada
   * vez menos, e o povo precisa de roças, rebanho, caça e pesca.
   */
  private gather(v: Village, work: number): void {
    const map = this.map;
    const r = this.radius(v) + B.GATHER_REACH;
    v.gatherWork = (v.gatherWork ?? 0) + work;
    let fails = 0;
    while (v.gatherWork >= 1 && fails < 10) {
      const a = this.civRnd() * Math.PI * 2;
      const d = Math.sqrt(this.civRnd()) * r;
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0 || !isLand(map, t) || this.built[t] || this.road[t]) {
        fails++;
        continue;
      }
      const veg = map.vegetation[t];
      const floor = isTree(decorAt(map, t)) ? B.GATHER_TREE_FLOOR : B.GATHER_MIN;
      if (veg - B.GATHER_BITE < floor) {
        fails++;
        continue;
      }
      map.vegetation[t] = veg - B.GATHER_BITE;
      const biome = classify(map, t);
      if (biome !== map.biome[t]) {
        map.biome[t] = biome;
        this.onTileChanged(t);
      }
      v.gatherWork -= 1;
      this.book(v, '_gather', this.put(v, 'food', 1), 0);
    }
    // Nada mais para colher por perto neste momento: o trabalho do resto do passo se perde.
    if (fails >= 10) v.gatherWork = 0;
  }

  /** Alguma árvore adulta nos 8 vizinhos (as sementes caem perto). */
  private treeNear(t: number): boolean {
    const w = this.map.width;
    const x = t % w;
    const y = (t - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = this.tileAt(x + dx, y + dy);
        if (n >= 0 && !this.map.felled![n] && isTree(decorAt(this.map, n))) return true;
      }
    }
    return false;
  }

  /**
   * Uma vez por ano (seção 19.19): tocos brotam sozinhos perto da mata (clareira grande demora
   * muito), mudas crescem até virar árvore e o povo que maneja a mata planta nos tocos antigos.
   */
  private growForests(): void {
    const map = this.map;
    const felled = map.felled!;
    const w = map.width;
    // Plantio nos tocos antigos: cada lenhador de um povo que maneja a mata planta algumas mudas.
    const planters = new Map<number, number>();
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.role[i] !== ROLE.woodcutter || this.village[i] < 0) continue;
      const v = this.villages[this.village[i]];
      if (v.forestry) planters.set(v.id, (planters.get(v.id) ?? 0) + B.PLANT_RATE);
    }
    for (const t of this.stumps) {
      if (!isLand(map, t) || this.road[t] || this.built[t]) {
        felled[t] = 0;
        this.stumps.delete(t);
        this.onTileChanged(t);
        continue;
      }
      const temp = temperatureAt(map, t);
      if (temp <= 262 || temp >= 320 || map.moisture[t] <= 0.25) continue;
      let state = felled[t];
      if (state !== 3 && planters.size) {
        const v = this.settlementNear(t % w + 0.5, Math.floor(t / w) + 0.5, B.WOOD_REACH);
        const n = v ? (planters.get(v.id) ?? 0) : 0;
        if (v && n >= 1) {
          planters.set(v.id, n - 1);
          felled[t] = state = 3;
          this.treesPlanted++;
          this.onTileChanged(t);
        }
      }
      if (state === 1) {
        if (this.rnd() < B.SPROUT_RATE * (this.treeNear(t) ? 1 : B.SPROUT_FAR)) {
          felled[t] = 2;
          this.onTileChanged(t);
        }
        continue;
      }
      const x = t % w;
      const climate = Math.max(0.2, 1 + B.HARVEST_SENSITIVITY * this.climate[this.region(x, (t - x) / w)]);
      this.treeGrow[t] += climate / (state === 3 ? B.REPLANT_YEARS : B.TREE_YEARS);
      if (this.treeGrow[t] < 1) continue;
      felled[t] = 0;
      this.stumps.delete(t);
      map.vegetation[t] = Math.max(map.vegetation[t], this.treeVeg[t]);
      map.biome[t] = classify(map, t);
      this.onTileChanged(t);
    }
  }

  /** Assentamento vivo cuja área de corte (até `reach` além da borda) cobre o ponto, o mais perto. */
  private settlementNear(x: number, y: number, reach: number): Village | null {
    let best: Village | null = null;
    let bd = Infinity;
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const d = this.distance(v, x, y);
      if (d < this.radius(v) + reach && d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  /** O que falta mais: ferramentas para quem trabalha, armas e armaduras para quem luta (antes, na guerra). */
  private needed(st: Stock, adults: number, soldiers: number, v: Village): Category {
    const war = this.warOf(v.kingdom) !== null;
    if (!war && st.tools < adults * 0.3) return 'ferramenta';
    if (st.weapons < soldiers + 2 || (war && st.weapons <= st.armor)) return 'arma';
    if (st.armor < soldiers) return 'armadura';
    return st.tools <= st.weapons ? 'ferramenta' : 'arma';
  }

  /** Um item do catálogo entra no estoque do reino; a primeira vez que alguém no mundo o faz vira notícia. */
  private craft(v: Village, st: Stock, category: Category, material: Material, era: number): void {
    const item = material === 'stone' ? pickPrimitive(category, this.civRnd()) : pickItem(material, category, era, this.civRnd());
    if (!item) return;
    st.items[item.id] = (st.items[item.id] ?? 0) + 1;
    const tier = Math.max(0, TIER_MATERIAL.indexOf(material));
    this.book(v, item.category === 'ferramenta' ? 'tools' : item.category === 'arma' ? 'weapons' : item.category === 'armadura' ? 'armor' : 'jewels', 1, 0);
    if (item.category === 'ferramenta') st.tools++;
    else if (item.category === 'arma') {
      st.weapons++;
      st.weaponTier = Math.max(st.weaponTier, tier);
    } else if (item.category === 'armadura') {
      st.armor++;
      st.armorTier = Math.max(st.armorTier, tier);
    } else st.jewels++;
    this.crafted.set(item.id, (this.crafted.get(item.id) ?? 0) + 1);
    if (this.crafted.get(item.id) === 1 && material !== 'stone' && material !== 'wood') {
      this.note(`Pela primeira vez neste mundo, ${v.name} fez ${item.name.toLowerCase()}`, 'economia', v);
    }
  }

  /** Minérios que o povo precisa agora para a próxima era. */
  private wanted(v: Village): Ore[] {
    return [['copper', 'tin'], ['iron', 'tin'], ['iron'], ['coal', 'iron'], ['coal', 'iron']][Math.floor(v.tech)] as Ore[];
  }

  private openMine(v: Village): boolean {
    const w = this.map.width;
    const want = this.wanted(v);
    let best: Deposit | null = null;
    let score = Infinity;
    const reach = this.radius(v) + 25;
    for (const d of this.deposits) {
      if (d.amount <= 0 || d.mine >= 0 || !d.known.has(v.kingdom)) continue;
      const dist = this.distance(v, d.x + 0.5, d.y + 0.5);
      if (dist > reach) continue;
      const sc = dist - (want.includes(d.ore) ? 40 : 0);
      if (sc < score && this.landPath(v.x, v.y, d.x + 0.5, d.y + 0.5)) {
        score = sc;
        best = d;
      }
    }
    if (!best || !this.pay(v, 'mine')) return false;
    best.mine = v.id;
    v.mines.push(best.id);
    this.lineRoad(v.x, v.y, best.x + 0.5, best.y + 0.5);
    const tile = best.y * w + best.x;
    if (this.road[tile]) {
      this.road[tile] = 0;
      this.onTileChanged(tile);
    }
    this.note(`${v.name} abriu uma mina de ${ORE_NAMES[best.ore]}${best.cave ? ' numa caverna' : ''}`, 'economia', best);
    return true;
  }

  /** Exploradores que passam perto de uma jazida a descobrem para o reino. */
  private discover(i: number, v: Village): void {
    const tx = Math.floor(this.x[i]);
    const ty = Math.floor(this.y[i]);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const t = this.tileAt(tx + dx, ty + dy);
        if (t < 0) continue;
        const id = this.depositAt[t];
        if (id < 0) continue;
        const d = this.deposits[id];
        if (d.amount <= 0 || d.known.has(v.kingdom)) continue;
        d.known.add(v.kingdom);
        this.note(`${v.name} encontrou ${ORE_NAMES[d.ore]} ${d.cave ? 'numa caverna' : 'num veio'}`, 'economia', d);
        // Corrida do ouro (RF-VIDA-285): a notícia atrai gente por alguns anos.
        if (d.ore === 'gold' && (v.goldRush ?? 0) < this.year) {
          v.goldRush = this.year + B.GOLD_RUSH_YEARS;
          this.note(`Corrida do ouro em ${v.name}: gente de longe chega atrás do ouro`, 'economia', v, { key: `ouro-${v.id}` });
        }
      }
    }
  }

  /** O jogador coloca um veio de minério num tile de terra (ajuda leve). */
  placeOre(x: number, y: number, ore: Ore): boolean {
    const t = this.tileAt(x, Math.floor(y));
    if (t < 0 || this.road[t]) return false;
    const d = this.addDeposit(x, y, ore, 100, false);
    if (!d) return false;
    this.note(`Você colocou um veio de ${ORE_NAMES[ore]}`, 'jogador', d);
    return true;
  }

  // Relações, comércio e guerra ---------------------------------------------

  private key(a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  relation(a: number, b: number): number {
    return this.relations.get(this.key(a, b)) ?? 0;
  }

  /** Guerra em que o reino está, se houver. */
  warOf(k: number): War | null {
    for (const w of this.wars) if (w.a === k || w.b === k) return w;
    return null;
  }

  /** Guerra entre dois reinos, se houver. */
  private warBetween(a: number, b: number): War | null {
    for (const w of this.wars) if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) return w;
    return null;
  }

  /** Inimigos de cada reino; refeito a cada atualização das guerras. */
  private enemies = new Map<number, Set<number>>();

  private rebuildEnemies(): void {
    this.enemies.clear();
    for (const w of this.wars) {
      for (const [x, y] of [[w.a, w.b], [w.b, w.a]]) {
        const set = this.enemies.get(x) ?? new Set<number>();
        set.add(y);
        this.enemies.set(x, set);
      }
    }
  }

  allied(a: number, b: number): boolean {
    return this.alliances.has(this.key(a, b));
  }

  /** Força de combate de um indivíduo: profissão, era, armas e armaduras do reino. */
  private strength(i: number): number {
    const v = this.villages[this.village[i]];
    const st = this.store(v);
    const role = this.role[i];
    const base = role === ROLE.soldier ? 1.2 : role === ROLE.guard ? 1.1 : role === ROLE.king || role === ROLE.leader ? 0.8 : 0.4;
    const arms = 1 + 0.5 * st.weaponTier * Math.min(1, st.weapons / 10);
    const armor = 1 + 0.25 * st.armorTier * Math.min(1, st.armor / 10);
    const arena = this.villages[v.kingdom].houses.some((h) => h.kind === 'wonder') && this.villages[v.kingdom].culture.value === 'guerra' ? 1.15 : 1;
    return base * (1 + 0.15 * Math.floor(v.tech)) * arms * armor * arena;
  }

  /** Luta entre dois indivíduos de reinos em guerra: um deles morre. */
  private fight(i: number, j: number, war: War): void {
    const si = this.strength(i);
    const sj = this.strength(j);
    const loser = this.polRnd() < si / (si + sj) ? j : i;
    const k = this.villages[this.village[loser]].kingdom;
    war.losses[k === war.a ? 0 : 1]++;
    const st = this.villages[this.village[loser]].stock;
    if (this.role[loser] === ROLE.soldier) {
      if (st.weapons > 0) st.weapons--;
      if (st.armor > 0 && this.polRnd() < 0.5) st.armor--;
    }
    this.kill(loser, true, 'guerra');
  }

  /** Combate e marcha dos soldados; chamado no `decide` de cada inteligente. */
  private soldier(i: number, v: Village): { x: number; y: number } | null {
    const enemies = this.enemies.get(v.kingdom);
    if (!enemies) return null;
    const role = this.role[i];
    if (role === ROLE.soldier || role === ROLE.guard) {
      let foe = -1;
      this.forEachNear(this.x[i], this.y[i], 1.5, (j) => {
        if (foe >= 0 || this.village[j] < 0 || this.species[this.kind[j]].kind !== 'sapient') return;
        if (enemies.has(this.villages[this.village[j]].kingdom)) foe = j;
      });
      if (foe >= 0) {
        const war = this.warBetween(v.kingdom, this.villages[this.village[foe]].kingdom);
        if (war) this.fight(i, foe, war);
        return null;
      }
    }
    if (role !== ROLE.soldier) return null;
    // Soldados do atacante marcham até o alvo (por terra, até 90 tiles; os que desembarcaram, de qualquer distância).
    for (const war of this.wars) {
      if (war.a !== v.kingdom) continue;
      const target = this.villages[war.target];
      if (!this.expedition.has(i) && (war.naval || this.distance(target, v.x, v.y) > 90)) continue;
      return { x: wrapDx(target.x - this.x[i], this.map.width), y: target.y - this.y[i] };
    }
    return null;
  }

  /** Conquista (atacantes na praça e nenhum defensor armado por perto) e invasões por mar. */
  private updateWars(dt: number): void {
    for (let k = this.wars.length - 1; k >= 0; k--) {
      const war = this.wars[k];
      const a = this.villages[war.a];
      const b = this.villages[war.b];
      const target = this.villages[war.target];
      if (a.abandoned || b.abandoned || target.abandoned || a.kingdom !== war.a || b.kingdom !== war.b || target.kingdom !== war.b) {
        this.wars.splice(k, 1);
        continue;
      }
      let attackers = 0;
      let defenders = 0;
      this.forEachNear(target.x, target.y, this.radius(target) * 0.6, (j) => {
        const vj = this.village[j];
        if (vj < 0 || this.species[this.kind[j]].kind !== 'sapient') return;
        const r = this.role[j];
        const kj = this.villages[vj].kingdom;
        if (kj === war.a && r === ROLE.soldier) attackers++;
        else if (kj === war.b && (r === ROLE.soldier || r === ROLE.guard)) defenders++;
      });
      if (attackers >= 3 && defenders === 0) {
        this.conquer(war, target);
        this.wars.splice(k, 1);
        continue;
      }
      if (war.naval && happens(this.polRnd, B.NAVAL_LANDING_RATE, dt / YEAR_SECONDS)) this.invadeBySea(war);
    }
    this.rebuildEnemies();
  }

  /** Rota de barco do porto `from` até a costa perto do alvo, dentro do alcance; null se não houver. */
  private seaRoute(from: Village, target: Village): { path: number[]; landing: number } | null {
    if (from.port < 0) return null;
    const w = this.map.width;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(from.tech))];
    let found = -1;
    let landing = -1;
    const reach = this.radius(target) + 6;
    this.searchSea(from.port, 400000, type.range, (t) => {
      const x = t % w;
      const y = (t - x) / w;
      if (Math.hypot(wrapDx(x - target.x, w), y - target.y) > reach) return false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = this.tileAt(x + ox, y + oy);
        if (l >= 0 && isLand(this.map, l)) {
          found = t;
          landing = l;
          return true;
        }
      }
      return false;
    });
    if (found < 0) return null;
    const path: number[] = [];
    for (let t = found; t >= 0; t = this.searchParent[t]) path.push(t);
    return { path: path.reverse(), landing };
  }

  /** Porto do reino `k` com rota até o alvo, se houver. */
  private navalBase(k: number, target: Village): { from: Village; route: { path: number[]; landing: number } } | null {
    if (Math.floor(this.villages[k].tech) < 1) return null;
    const ports = this.villages.filter((v) => !v.abandoned && v.kingdom === k && v.port >= 0).sort((p, q) => this.distance(p, target.x, target.y) - this.distance(q, target.x, target.y));
    for (const from of ports.slice(0, 3)) {
      const route = this.seaRoute(from, target);
      if (route) return { from, route };
    }
    return null;
  }

  /** Invasão por mar: soldados embarcam no porto mais perto e desembarcam perto do alvo. */
  private invadeBySea(war: War): void {
    if (this.boats.filter((b) => b.purpose === 'invade' && b.sunk < 0 && this.villages[b.village].kingdom === war.a).length >= 2) return;
    const base = this.navalBase(war.a, this.villages[war.target]);
    if (!base) return;
    const { from, route } = base;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(from.tech))];
    const passengers: Boat['passengers'] = [];
    for (let i = 0; i < this.count && passengers.length < type.capacity; i++) {
      if (!this.alive[i] || this.role[i] !== ROLE.soldier || this.village[i] < 0 || this.villages[this.village[i]].kingdom !== war.a) continue;
      if (this.distance(from, this.x[i], this.y[i]) > this.radius(from) + 6) continue;
      passengers.push({ age: this.age[i], role: ROLE.soldier, who: this.identity(i) });
      this.kill(i, true, 'partiu');
    }
    if (passengers.length < 3) {
      for (const p of passengers) {
        const c = this.spawn(from.species, from.x + this.polRnd(), from.y + this.polRnd(), from.id, p.age);
        if (c >= 0) {
          this.role[c] = p.role;
          this.restore(c, p.who, true);
        }
      }
      return;
    }
    this.launch(from, 'invade', route.path, route.landing, passengers);
    this.note(`${passengers.length} soldados de ${from.name} zarparam ${type.on} para atacar ${this.villages[war.target].name}`, 'guerra', from);
  }

  private conquer(war: War, target: Village): void {
    const winner = this.villages[war.a];
    // Uma capital conquistada liberta os assentamentos do seu reino.
    if (target.kingdom === target.id) {
      for (const o of this.villages) if (o !== target && !o.abandoned && o.kingdom === target.id) o.kingdom = o.id;
    }
    // Saque: metade do estoque do assentamento tomado vai, carregada, para a capital vencedora (até o teto dela).
    const loot = target.stock;
    for (const key of GOODS) {
      const half = loot[key] / 2;
      loot[key] -= half;
      winner.stock[key] = Math.min(this.capOf(winner, key), winner.stock[key] + half);
    }
    target.kingdom = winner.id;
    target.color = winner.color;
    target.leader = -1;
    for (const id of target.mines) this.deposits[id].known.add(winner.id);
    this.relations.set(this.key(war.a, war.b), -20);
    this.note(`${winner.name} conquistou ${target.name}`, 'guerra', target, { major: true });
  }

  /** Uma vez por ano: diplomacia, lava esfriando, ruínas sumindo e eventos do mundo. */
  private yearly(): void {
    this.updateClimate();
    // Rede de ruas: o que escapou da limpeza na hora (ruas de dois assentamentos que se encostam) sai uma vez por ano.
    if (this.roadDirty.length) {
      this.pruneRoads(this.roadDirty);
      this.roadDirty = [];
    }
    this.migrate();
    this.epidemics();
    this.linkRoads();
    // Estradas novas mudam por onde passa mais gente: as cidades revêem ruas principais e avenida a cada 10 anos.
    for (const v of this.villages) if (!v.abandoned && v.tier >= 2 && (Math.floor(this.year) + v.id) % 10 === 0) this.rankStreets(v);
    this.economyYear();
    for (const k of this.crises) this.succession(this.villages[k]);
    this.crises.clear();
    this.diplomacy();
    this.coolLava();
    this.lavaFires();
    this.growForests();
    for (let k = this.ruins.length - 1; k >= 0; k--) if (++this.ruins[k].age > 40) this.ruins.splice(k, 1);
    yearlyEvents(this);
  }

  /**
   * Uma vez por ano: as relações entre reinos que se conhecem (vizinhos por
   * terra ou contatos por mar) mudam por fronteira, espécie, cultura,
   * comércio e incidentes; surgem alianças, uniões e guerras; guerras longas
   * ou sangrentas acabam em paz.
   */
  private diplomacy(): void {
    this.independence();
    const capitals = this.villages.filter((v) => !v.abandoned && v.kingdom === v.id);
    const members = new Map<number, Village[]>();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const list = members.get(v.kingdom) ?? [];
      list.push(v);
      members.set(v.kingdom, list);
    }
    // Soldados por reino, contados uma vez.
    const soldiers = new Map<number, number>();
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.role[i] !== ROLE.soldier || this.village[i] < 0) continue;
      const k = this.villages[this.village[i]].kingdom;
      soldiers.set(k, (soldiers.get(k) ?? 0) + 1);
    }
    const force = (k: number) => (soldiers.get(k) ?? 0) * (1 + this.villages[k].stock.weaponTier * 0.5);
    const has = (k: number, kind: BuildingKind) => (members.get(k) ?? []).some((v) => v.houses.some((h) => h.kind === kind));
    const port = (k: number) => (members.get(k) ?? []).some((v) => v.port >= 0);
    for (let x = 0; x < capitals.length; x++) {
      for (let y = x + 1; y < capitals.length; y++) {
        const a = capitals[x];
        const b = capitals[y];
        // Assentamentos mais próximos dos dois reinos.
        let best = Infinity;
        let pa = a;
        let pb = b;
        for (const va of members.get(a.id) ?? []) {
          for (const vb of members.get(b.id) ?? []) {
            const d = this.distance(va, vb.x, vb.y);
            if (d < best) {
              best = d;
              pa = va;
              pb = vb;
            }
          }
        }
        const key = this.key(a.id, b.id);
        const border = best <= 60;
        if (!border && !this.contacts.has(key)) continue;
        let rel = this.relations.get(key) ?? (a.species !== b.species ? -30 : 0);
        if (border) rel -= 1.5;
        if (a.species !== b.species) rel -= 1;
        if (a.culture.id !== b.culture.id) rel -= 0.5;
        for (const c of [a.culture, b.culture]) {
          if (c.value === 'guerra') rel -= 1.5;
          if (c.value === 'fé' || c.value === 'comércio') rel += 0.5;
        }
        rel += (a.culture.tolerance + b.culture.tolerance) * 1.2;
        if (this.allied(a.id, b.id)) rel += 2;
        // Cobiça (seção 19.19): um reino com falta de comida ou lenha olha torto para o vizinho que tem de sobra.
        const lackA = border ? this.kingdomLack(members.get(a.id) ?? [a]) : 0;
        const lackB = border ? this.kingdomLack(members.get(b.id) ?? [b]) : 0;
        const richA = this.kingdomPlenty(members.get(a.id) ?? [a]);
        const richB = this.kingdomPlenty(members.get(b.id) ?? [b]);
        const greed = Math.max(lackA * richB, lackB * richA);
        rel -= B.SCARCITY_TENSION * greed;
        const atWar = this.warBetween(a.id, b.id);
        const busy = this.warOf(a.id) || this.warOf(b.id);
        // Comércio: por terra entre vizinhos com mercado; por mar entre contatos com mercado e porto.
        // Sem mercado, vizinhos amigos ainda fazem escambo.
        const market = (has(a.id, 'market') && has(b.id, 'market') && (border || (port(a.id) && port(b.id)))) || (border && rel > 20);
        // Com caravanas entre os dois neste ano, a troca invisível não acontece (fica como reserva, 19.6).
        if (!atWar && market && !this.caravanPairs.has(key) && this.trade(a, b)) rel += 3 * (a.culture.value === 'comércio' || b.culture.value === 'comércio' ? 2 : 1);
        if (!atWar && this.polRnd() < 0.03) rel += this.incident(a, b, border);
        rel = Math.max(-100, Math.min(100, rel));
        this.relations.set(key, rel);
        if (atWar) continue;
        if (this.alliance(a, b, rel)) continue;
        if (busy) continue;
        // Guerra: relação muito ruim, ou ambição de um reino forte e avançado.
        const warlike = a.culture.value === 'guerra' || b.culture.value === 'guerra';
        const fa = force(a.id);
        const fb = force(b.id);
        const strong = Math.max(fa, fb) >= 2 * Math.max(1, Math.min(fa, fb)) && Math.floor(Math.max(a.tech, b.tech)) >= 2;
        const hostile = rel < (warlike ? -20 : -35);
        const ambition = strong && rel < 0 && this.polRnd() < 0.04;
        // Guerra pela comida ou pela mata: o reino em falta, mais forte, ataca o vizinho farto.
        const hungryA = lackA * richB > 0 && fa > fb;
        const hungryB = lackB * richA > 0 && fb > fa;
        const raid = (hungryA || hungryB) && rel < 20 && this.polRnd() < B.RESOURCE_WAR * greed * (warlike ? 2 : 1);
        if (!ambition && !raid && (!hostile || this.polRnd() > 0.15 * (warlike ? 2 : 1))) continue;
        // Um bando pequeno basta para saquear o vizinho farto; guerra de conquista pede exército.
        if (Math.max(fa, fb) < (raid ? B.RAID_FORCE : 4) || this.allied(a.id, b.id) || (this.truces.get(key) ?? 0) > this.year) continue;
        const [att, def, target] = raid ? (hungryA ? [a, b, pb] : [b, a, pa]) : fa >= fb ? [a, b, pb] : [b, a, pa];
        if (this.declareWar(att, def, target, members)) {
          if (raid) {
            this.tally.greedWars++;
            this.note(`Com ${this.kingdomLackName(members.get(att.id) ?? [att])} faltando, ${att.name} foi à guerra atrás da fartura de ${def.name}`, 'guerra', att, { key: `greed-${key}` });
          }
          this.callAllies(att, def, members);
        }
      }
    }
    for (let k = this.wars.length - 1; k >= 0; k--) {
      const war = this.wars[k];
      war.years++;
      const dead = war.losses[0] + war.losses[1];
      if (this.polRnd() < 0.03 + dead / 150 + (war.years > 30 ? 0.1 : 0)) {
        this.wars.splice(k, 1);
        this.relations.set(this.key(war.a, war.b), -10);
        this.truces.set(this.key(war.a, war.b), this.year + TRUCE_YEARS);
        this.note(`Paz entre ${this.villages[war.a].name} e ${this.villages[war.b].name}`, 'guerra', this.villages[war.b], { major: true });
      }
    }
    this.vassals(members);
    this.rebuildEnemies();
    this.caravanPairs.clear();
  }

  /** Falta de comida e madeira num reino, pelo assentamento que mais sofre (0 a 1, seção 19.19). */
  private kingdomLack(list: Village[]): number {
    let worst = 0;
    for (const v of list) {
      const n = v.needs;
      if (n) worst = Math.max(worst, Math.max(0, B.GREED_LEVEL - Math.min(n.food, n.fuel)) / B.GREED_LEVEL);
    }
    return worst;
  }

  /** O que mais falta num reino, para a crônica. */
  private kingdomLackName(list: Village[]): string {
    let food = 0;
    let fuel = 0;
    for (const v of list) {
      food += v.needs?.food ?? 1;
      fuel += v.needs?.fuel ?? 1;
    }
    return food <= fuel ? 'comida' : 'lenha';
  }

  /** Fartura de um reino: comida e madeira guardadas perto do teto (0 a 1). */
  private kingdomPlenty(list: Village[]): number {
    let n = 0;
    for (const v of list) n += Math.min(1, (v.food / this.capOf(v, 'food') + v.stock.wood / this.capOf(v, 'wood')) / 2);
    return list.length ? Math.max(0, n / list.length - 0.3) / 0.7 : 0;
  }

  /** Declara guerra se houver caminho por terra ou, sem ele, por mar. Retorna se começou. */
  private declareWar(att: Village, def: Village, target: Village, members: Map<number, Village[]>): boolean {
    let naval = false;
    const home = (members.get(att.id) ?? []).reduce((p, q) => (this.distance(q, target.x, target.y) < this.distance(p, target.x, target.y) ? q : p), att);
    if (!this.landPath(home.x, home.y, target.x, target.y)) {
      if (!this.navalBase(att.id, target)) return false;
      naval = true;
    }
    this.wars.push({ a: att.id, b: def.id, target: target.id, losses: [0, 0], years: 0, naval });
    this.breakAgreements(att.id, def.id);
    this.note(`Guerra! ${att.name} atacou ${def.name}${target !== def ? ` em ${target.name}` : ''}${naval ? ', pelo mar' : ''}`, 'guerra', target, { major: true });
    this.effect('swords', target.x, target.y - 3, 30, 1);
    return true;
  }

  /** Aliados do atacado entram na guerra (pacto de defesa) ou mandam armas. */
  private callAllies(att: Village, def: Village, members: Map<number, Village[]>): void {
    for (const ally of this.villages) {
      if (ally.abandoned || ally.kingdom !== ally.id || ally === def || ally === att || !this.allied(ally.id, def.id) || this.allied(ally.id, att.id)) continue;
      if (this.warOf(ally.id)) continue;
      // Alvo: o assentamento do atacante mais perto do aliado.
      const target = (members.get(att.id) ?? [att]).reduce((p, q) => (this.distance(q, ally.x, ally.y) < this.distance(p, ally.x, ally.y) ? q : p));
      if (this.declareWar(ally, att, target, members)) {
        this.note(`${ally.name} entrou na guerra ao lado de ${def.name}`, 'guerra', ally, { major: true });
      } else {
        const gift = Math.min(ally.stock.weapons, 5);
        ally.stock.weapons -= gift;
        def.stock.weapons += gift;
        if (gift) this.note(`${ally.name} mandou armas para ajudar ${def.name}`, 'guerra', ally);
      }
    }
  }

  /** Incidente entre dois reinos (presente, casamento, insulto, escaramuça, disputa); devolve a mudança na relação. */
  private incident(a: Village, b: Village, border: boolean): number {
    const warlike = (a.culture.value === 'guerra' ? 1 : 0) + (b.culture.value === 'guerra' ? 1 : 0);
    const kind = (a.culture.value === 'fé' || b.culture.value === 'fé' || a.culture.value === 'comércio') ? 0.55 : 0.4;
    const good = this.polRnd() < kind - warlike * 0.12;
    const [x, y] = this.polRnd() < 0.5 ? [a, b] : [b, a];
    if (good) {
      if (a.species === b.species && a.tier >= 1 && b.tier >= 1 && this.polRnd() < 0.35) {
        this.note(`Um casamento real uniu as famílias de ${a.name} e ${b.name}`, 'povo', a);
        return 12;
      }
      this.note(`${x.name} enviou presentes a ${y.name}`, 'povo', x);
      return 6;
    }
    const shared = this.deposits.find((d) => d.amount > 0 && d.known.has(a.id) && d.known.has(b.id) && this.distance(a, d.x, d.y) < 50 && this.distance(b, d.x, d.y) < 50);
    if (shared && this.polRnd() < 0.5) {
      this.note(`${a.name} e ${b.name} disputam a jazida de ${ORE_NAMES[shared.ore]}`, 'guerra', shared);
      return -7;
    }
    if (border && this.polRnd() < 0.5) {
      this.note(`Escaramuça na fronteira entre ${a.name} e ${b.name}`, 'guerra', y);
      return -9;
    }
    this.note(`O líder de ${x.name} insultou o povo de ${y.name}`, 'povo', x);
    return -6;
  }

  /**
   * Alianças: relação acima de 50 pode virar aliança; abaixo de 15 ela acaba.
   * Aliados antigos da mesma espécie podem se unir num reino só (federação).
   * Retorna true se o par mudou de situação neste ano.
   */
  private alliance(a: Village, b: Village, rel: number): boolean {
    const key = this.key(a.id, b.id);
    const since = this.alliances.get(key);
    if (since === undefined) {
      if (rel > 50 && !this.warOf(a.id) && !this.warOf(b.id) && this.polRnd() < 0.12) {
        this.alliances.set(key, this.year);
        this.note(`Aliança entre ${a.name} e ${b.name}`, 'povo', a, { major: true });
        this.effect('heart', a.x, a.y - 3, 20, 1);
        this.effect('heart', b.x, b.y - 3, 20, 1);
        return true;
      }
      return false;
    }
    if (rel < 15) {
      this.alliances.delete(key);
      this.note(`A aliança entre ${a.name} e ${b.name} acabou`, 'povo', a, { major: true });
      return true;
    }
    if (this.year - since > 50 && a.species === b.species && rel > 80 && this.polRnd() < 0.03) {
      const [big, small] = this.kingdomSize(a) >= this.kingdomSize(b) ? [a, b] : [b, a];
      for (const o of this.villages) {
        if (o.abandoned || o.kingdom !== small.id) continue;
        o.kingdom = big.id;
        o.color = big.color;
      }
      small.leader = -1;
      this.alliances.delete(key);
      this.note(`${small.name} e ${big.name} se uniram num só reino, com capital em ${big.name}`, 'povo', big, { major: true });
      return true;
    }
    return false;
  }

  /** Aldeias independentes pequenas perto de um reino amigo pedem proteção e viram vassalas. */
  private vassals(members: Map<number, Village[]>): void {
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom !== v.id || v.tier > 0 || (members.get(v.id)?.length ?? 0) > 1 || this.warOf(v.id)) continue;
      for (const c of this.villages) {
        if (c.abandoned || c === v || c.kingdom !== c.id || c.species !== v.species || (members.get(c.id)?.length ?? 0) < 2) continue;
        if (this.distance(c, v.x, v.y) > 45 || this.relation(c.id, v.id) < 20 || this.polRnd() > 0.03) continue;
        v.kingdom = c.id;
        v.color = c.color;
        this.note(`${v.name} pediu proteção e passou a fazer parte do reino de ${c.name}`, 'povo', v);
        break;
      }
    }
  }

  /**
   * Crise de sucessão (RF-VIDA-138): quando morre o rei de um reino grande,
   * um pretendente pode levar a metade mais distante do reino e começar uma
   * guerra civil.
   */
  private succession(capital: Village): void {
    if (capital.abandoned || capital.kingdom !== capital.id || this.civRnd() > 0.3) return;
    const others = this.villages.filter((o) => !o.abandoned && o.kingdom === capital.id && o !== capital);
    if (others.length < 3) return;
    others.sort((p, q) => this.distance(capital, q.x, q.y) - this.distance(capital, p.x, p.y));
    const rebels = others.slice(0, Math.ceil(others.length / 2));
    const seat = rebels.reduce((p, q) => (q.population > p.population ? q : p));
    for (const o of rebels) o.kingdom = seat.id;
    this.newKingdom(seat, capital);
    const key = this.key(capital.id, seat.id);
    this.relations.set(key, -60);
    this.note(`O rei de ${capital.name} morreu sem herdeiro aceito: ${seat.name} coroou outro rei e levou ${rebels.length} assentamentos`, 'povo', seat, { major: true });
    if (!this.warOf(capital.id) && !this.warOf(seat.id) && this.civRnd() < 0.6) {
      this.wars.push({ a: seat.id, b: capital.id, target: capital.id, losses: [0, 0], years: 0, naval: !this.landPath(seat.x, seat.y, capital.x, capital.y) });
      this.note(`Guerra civil entre ${seat.name} e ${capital.name}`, 'guerra', capital, { major: true });
      this.effect('swords', capital.x, capital.y - 3, 30, 1);
    }
  }

  /** Torna `v` capital de um reino novo saído de `old`: cultura, cor, estoque inicial. */
  private newKingdom(v: Village, old: Village): void {
    v.kingdom = v.id;
    v.culture = makeCulture(this.cultures++, v.name, this.polRnd);
    v.color = this.freshColor();
    for (const o of this.villages) if (o.kingdom === v.id) o.color = v.color;
    // Cada assentamento já tem o próprio estoque (RF-VIDA-212); o reino novo leva só o que o povo sabe fazer.
    v.made = { ...old.made };
  }

  /**
   * Assentamentos grandes e longe da capital podem declarar independência e
   * formar um povo novo (cisma), com cultura própria.
   */
  private independence(): void {
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom === v.id || v.population < 20) continue;
      const capital = this.villages[v.kingdom];
      const far = this.distance(capital, v.x, v.y);
      // Reinos grandes são difíceis de manter unidos.
      const size = Math.min(2, 1 + (this.kingdomSize(capital) - 4) * 0.1);
      // Colônia que recusa os pedidos da capital pensa mais em se separar (RF-VIDA-289).
      const refused = 1 + B.REFUSAL_INDEPENDENCE * (v.refused ?? 0);
      if (far < 40 || this.polRnd() > 0.005 * (far / 40) * size * refused * (capital.culture.tolerance < 0.3 ? 2 : 1)) continue;
      const old = v.kingdom;
      for (const o of this.villages) if (!o.abandoned && o.kingdom === old && this.distance(v, o.x, o.y) < 30) o.kingdom = v.id;
      this.newKingdom(v, capital);
      this.relations.set(this.key(old, v.id), -45);
      this.note(`${v.name} declarou independência de ${capital.name}: nasce o povo ${v.culture.name}`, 'povo', v, { major: true });
    }
  }

  /**
   * Troca de excedentes entre dois reinos com mercado; quem recebe paga em
   * ouro se tiver. Cada reino troca pelo assentamento que mais tem sobrando e
   * entrega no que mais precisa (minério vai para quem tem ferraria), já que
   * o estoque é de cada assentamento (RF-VIDA-212).
   */
  private trade(a: Village, b: Village): boolean {
    let traded: '' | 'tin' | 'copper' | 'iron' | 'coal' | 'stone' | 'wood' = '';
    const members = (k: Village) => this.villages.filter((o) => !o.abandoned && o.kingdom === k.id);
    const ma = members(a);
    const mb = members(b);
    for (const r of ['tin', 'copper', 'iron', 'coal', 'stone', 'wood'] as const) {
      const ore = r !== 'stone' && r !== 'wood';
      const richest = (list: Village[]) => list.reduce((p, q) => (q.stock[r] > p.stock[r] ? q : p), list[0] ?? a);
      const neediest = (list: Village[]) => {
        const pool = ore && list.some((o) => this.has(o, 'smithy')) ? list.filter((o) => this.has(o, 'smithy')) : list;
        return pool.reduce((p, q) => (q.stock[r] < p.stock[r] ? q : p), pool[0] ?? a);
      };
      for (const [from, to] of [
        [richest(ma), neediest(mb)],
        [richest(mb), neediest(ma)],
      ]) {
        const bulk = r === 'stone' || r === 'wood';
        const amount = bulk ? 5 : 4;
        if (from.stock[r] > (bulk ? 25 : 10) && to.stock[r] < (bulk ? 5 : 4)) {
          from.stock[r] -= amount;
          to.stock[r] += amount;
          if (to.stock.gold >= 1) {
            to.stock.gold -= 1;
            from.stock.gold += 1;
          }
          traded ||= r;
        }
      }
    }
    if (traded) this.note(`${a.name} e ${b.name} trocaram ${traded === 'wood' ? 'madeira' : traded === 'stone' ? 'pedra' : ORE_NAMES[traded]}`, 'economia', a, { key: `trade:${this.key(a.id, b.id)}` });
    return traded !== '';
  }

  /** Funda um assentamento por terra perto de `v`, sem atravessar água. Retorna se conseguiu. */
  private colonizeByLand(v: Village): boolean {
    const map = this.map;
    for (let t = 0; t < 12; t++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.radius(v) + TIER_RADIUS[0] + 2 + this.civRnd() * 22;
      const nx = Math.floor(v.x + Math.cos(a) * d);
      const ny = Math.floor(v.y + Math.sin(a) * d);
      if (ny < 2 || ny >= map.height - 2) continue;
      const tx = ((nx % map.width) + map.width) % map.width;
      const tile = ny * map.width + tx;
      if (!this.habitable(v.species, tile) || map.vegetation[tile] < this.minFertility(v) || !this.canSettle(v.species, tx, ny, v.tech)) continue;
      if (!this.landPath(v.x, v.y, tx + 0.5, ny + 0.5)) continue;
      const nv = this.foundVillage(v.species, tx, ny, 0, v);
      let moved = 0;
      for (let i = 0; i < this.count && moved < 6; i++) {
        if (this.alive[i] && this.village[i] === v.id && i !== v.leader && this.role[i] !== CHILD) {
          this.village[i] = nv.id;
          this.movedAt[i] = this.year;
          v.population--;
          nv.population++;
          (v.vitalNow ??= emptyVital()).left++;
          (nv.vitalNow ??= emptyVital()).arrived++;
          moved++;
        }
      }
      this.note(`Colonos de ${v.name} fundaram ${nv.name}`, 'povo', nv);
      return true;
    }
    return false;
  }

  /** Vegetação mínima para fundar: a partir da Idade do Ferro, poços e irrigação abrem o deserto. */
  private minFertility(v: Village): number {
    return v.tech >= 2 ? 0 : 0.2;
  }

  /** Se a linha reta entre dois pontos é toda de terra, sem penhasco no meio (dá para ir a pé). */
  private landPath(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = wrapDx(bx - ax, this.map.width);
    const dy = by - ay;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    let prev = -1;
    for (let k = 0; k <= n; k++) {
      const t = this.tileAt(Math.floor(ax + (dx * k) / n), Math.floor(ay + (dy * k) / n));
      if (t < 0 || !isLand(this.map, t)) return false;
      if (prev >= 0 && Math.abs(this.map.elevation[t] - this.map.elevation[prev]) > B.MAX_CLIMB * 1.5) return false;
      prev = t;
    }
    return true;
  }

  // Portos e barcos ----------------------------------------------------------

  /** Constrói o porto no tile de costa mais perto do centro, se ele dá para o mar (não para um lago). */
  private buildPort(v: Village): boolean {
    const map = this.map;
    const w = map.width;
    const r = Math.ceil(this.radius(v));
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    let best = -1;
    let bestWater = -1;
    let bd = Infinity;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = dx * dx + dy * dy;
        if (d >= bd || d > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || !isLand(map, t) || this.road[t] || this.built[t]) continue;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
          const wt = this.tileAt(cx + dx + ox, cy + dy + oy);
          if (wt >= 0 && isWater(map, wt)) {
            best = t;
            bestWater = wt;
            bd = d;
            break;
          }
        }
      }
    }
    if (best < 0 || this.seaSize(bestWater, 600) < 600 || !this.pay(v, 'port')) return false;
    this.built[best] = 1;
    this.onTileChanged(best);
    const bx = best % w;
    const by = Math.floor(best / w);
    const wx = bestWater % w;
    v.houses.push({ x: bx, y: by, kind: 'port', variant: wx === (bx + 1) % w ? 0 : wx === (bx - 1 + w) % w ? 1 : 2 });
    v.port = bestWater;
    this.lineRoad(v.x, v.y, bx + 0.5, by + 0.5);
    this.note(`${v.name} construiu um porto`, 'mar', v);
    return true;
  }

  private searchParent = new Int32Array(0);
  private searchDist = new Uint16Array(0);
  private searchMark = new Uint32Array(0);
  private searchQueue = new Int32Array(0);
  private searchGen = 0;

  /**
   * Busca em largura pelo mar a partir de `start`. `visit` é chamada para cada
   * tile de água com a distância navegada; devolver true encerra a busca.
   * Retorna quantos tiles de água visitou.
   */
  private searchSea(start: number, maxNodes: number, maxDist: number, visit?: (t: number, dist: number) => boolean): number {
    const map = this.map;
    const w = map.width;
    const n = w * map.height;
    if (this.searchMark.length !== n) {
      this.searchParent = new Int32Array(n);
      this.searchDist = new Uint16Array(n);
      this.searchMark = new Uint32Array(n);
      this.searchQueue = new Int32Array(n);
    }
    const gen = ++this.searchGen;
    const mark = this.searchMark;
    const queue = this.searchQueue;
    let head = 0;
    let tail = 0;
    mark[start] = gen;
    this.searchParent[start] = -1;
    this.searchDist[start] = 0;
    queue[tail++] = start;
    while (head < tail && tail < maxNodes) {
      const t = queue[head++];
      const d = this.searchDist[t];
      if (visit?.(t, d)) break;
      if (d >= maxDist) continue;
      const x = t % w;
      const y = (t - x) / w;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ny = y + oy;
        if (ny < 0 || ny >= map.height) continue;
        const nt = ny * w + ((x + ox + w) % w);
        if (mark[nt] === gen || !isWater(map, nt)) continue;
        mark[nt] = gen;
        this.searchParent[nt] = t;
        this.searchDist[nt] = d + 1;
        queue[tail++] = nt;
      }
    }
    return tail;
  }

  /** Quantos tiles de água são alcançáveis (até `limit`): distingue mar de lago. */
  private seaSize(start: number, limit: number): number {
    return this.searchSea(start, limit, 65535);
  }

  /** Sai um barco do porto da era do assentamento. */
  private launch(v: Village, purpose: Boat['purpose'], path: number[] = [], landing = -1, passengers: Boat['passengers'] = []): Boat {
    const w = this.map.width;
    const boat: Boat = {
      village: v.id,
      kind: Math.min(BOATS.length - 1, Math.floor(v.tech)),
      purpose,
      x: (v.port % w) + 0.5,
      y: Math.floor(v.port / w) + 0.5,
      facing: 1,
      heading: this.civRnd() * Math.PI * 2,
      path,
      step: 0,
      landing,
      passengers,
      timer: purpose === 'fish' ? 20 + this.civRnd() * 25 : 0,
      adrift: 0,
      sunk: -1,
    };
    this.boats.push(boat);
    return boat;
  }

  /** Procura pelo mar uma costa livre para fundar uma colônia e manda colonos de barco. */
  private colonizeBySea(v: Village): boolean {
    if (v.port < 0 || this.boats.some((b) => b.village === v.id && b.purpose === 'colonize' && b.sunk < 0)) return false;
    const map = this.map;
    const w = map.width;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(v.tech))];
    const candidates: { water: number; land: number }[] = [];
    const home = this.radius(v) + TIER_RADIUS[0];
    this.searchSea(v.port, 400000, type.range, (t, d) => {
      if (d < 6) return false;
      const x = t % w;
      const y = (t - x) / w;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = this.tileAt(x + ox, y + oy);
        if (l < 0 || isWater(map, l) || !this.habitable(v.species, l) || map.vegetation[l] < this.minFertility(v)) continue;
        const lx = l % w;
        const ly = Math.floor(l / w);
        if (this.distance(v, lx, ly) < home || !this.canFound(lx, ly)) continue;
        if (candidates.some((c) => Math.hypot(wrapDx((c.land % w) - lx, w), Math.floor(c.land / w) - ly) < 8)) continue;
        if (this.siteProblem(v.species, lx, ly, v.tech)) continue;
        candidates.push({ water: t, land: l });
        break;
      }
      return candidates.length >= 6;
    });
    if (!candidates.length) return false;
    const pick = candidates[Math.floor(this.civRnd() * candidates.length)];
    const path: number[] = [];
    for (let t = pick.water; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    // Embarcam adultos (nunca o líder), deixando gente em casa.
    const passengers: Boat['passengers'] = [];
    const max = Math.min(type.capacity, v.population - 3);
    for (let i = 0; i < this.count && passengers.length < max; i++) {
      if (!this.alive[i] || this.village[i] !== v.id || i === v.leader || this.role[i] === CHILD) continue;
      if (this.age[i] >= elderAge(this.species[v.species], Math.floor(v.tech))) continue;
      passengers.push({ age: this.age[i], role: this.role[i], who: this.identity(i) });
      this.kill(i, true, 'partiu');
    }
    if (passengers.length < 3) {
      // Gente de menos: desistem e voltam para casa.
      const w2 = map.width;
      for (const p of passengers) {
        const c = this.spawn(v.species, (v.port % w2) + this.civRnd(), Math.floor(v.port / w2) + this.civRnd(), v.id, p.age);
        if (c >= 0) {
          this.role[c] = p.role;
          this.restore(c, p.who, true);
        }
      }
      return false;
    }
    this.launch(v, 'colonize', path, pick.land, passengers);
    this.note(`${passengers.length} colonos de ${v.name} partiram de ${type.name.toLowerCase()}`, 'mar', v);
    return true;
  }

  /**
   * Jangada (seção 19.18): quem está travado na beira da água com o destino
   * do outro lado corta RAFT_TREES árvores por perto (ou, sem elas, gasta
   * RAFT_WOOD de madeira do estoque) e atravessa até a margem mais perto do
   * destino, a até RAFT_RANGE tiles de água. Sem árvore nem madeira, ou sem
   * margem melhor ao alcance, desiste e continua contornando.
   */
  private tryRaft(i: number): boolean {
    this.stuck[i] = 0;
    const map = this.map;
    const w = map.width;
    const s = this.kind[i];
    const aim = Math.hypot(this.aimX[i], this.aimY[i]);
    const vi = this.village[i];
    const v = vi >= 0 ? this.villages[vi] : null;
    // Um líder ou o último morador não deixa o assentamento para trás.
    if (aim < 6 || (v && (v.population <= 1 || v.leader === i))) return false;
    const gx = this.x[i] + this.aimX[i];
    const gy = this.y[i] + this.aimY[i];
    const here = this.tileOf(i);
    const hx = here % w;
    const hy = Math.floor(here / w);
    // A água logo à frente, na direção do destino.
    let start = -1;
    let best = -Infinity;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.tileAt(hx + dx, hy + dy);
        if (t < 0 || !isWater(map, t)) continue;
        const dot = (dx * this.aimX[i] + dy * this.aimY[i]) / aim;
        if (dot > best) {
          best = dot;
          start = t;
        }
      }
    }
    if (start < 0) return false;
    // Árvores por perto: as mais fechadas primeiro.
    const trees: number[] = [];
    const R = B.RAFT_TREE_RANGE;
    for (let dy = -R; dy <= R && trees.length < B.RAFT_TREES; dy++) {
      for (let dx = -R; dx <= R && trees.length < B.RAFT_TREES; dx++) {
        const t = this.tileAt(hx + dx, hy + dy);
        if (t >= 0 && isLand(map, t) && !this.road[t] && !this.built[t] && map.vegetation[t] >= B.RAFT_TREE_VEG) trees.push(t);
      }
    }
    const wood = !!v && v.stock.wood >= B.RAFT_WOOD;
    if (trees.length < B.RAFT_TREES && !wood) return false;
    // A margem do outro lado mais perto do destino (e mais perto que daqui).
    let goal = -1;
    let landing = -1;
    let bd = Math.hypot(wrapDx(gx - this.x[i], w), gy - this.y[i]) - 4;
    this.searchSea(start, 20000, B.RAFT_RANGE, (t) => {
      const x = t % w;
      const y = (t - x) / w;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = this.tileAt(x + ox, y + oy);
        if (l < 0 || !this.canStand(s, l) || !this.habitable(s, l)) continue;
        const d = Math.hypot(wrapDx(gx - ((l % w) + 0.5), w), gy - (Math.floor(l / w) + 0.5));
        if (d < bd) {
          bd = d;
          goal = t;
          landing = l;
        }
      }
      return false;
    });
    if (goal < 0) return false;
    const path: number[] = [];
    for (let t = goal; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    // A madeira: árvores cortadas (o mato fica ralo e rebrota) ou o estoque do assentamento.
    if (trees.length >= B.RAFT_TREES) {
      for (const t of trees) {
        map.vegetation[t] = Math.max(0.08, map.vegetation[t] - 0.4);
        map.biome[t] = classify(map, t);
        this.onTileChanged(t);
      }
    } else if (v) this.spend(v, 'wood', B.RAFT_WOOD);
    const who = this.identity(i);
    const raft: Raft = {
      x: (start % w) + 0.5,
      y: Math.floor(start / w) + 0.5,
      facing: this.aimX[i] >= 0 ? 1 : -1,
      path,
      step: 0,
      landing,
      species: s,
      village: vi,
      age: this.age[i],
      role: this.role[i],
      energy: this.energy[i],
      who,
      blocked: 0,
    };
    this.rafts.push(raft);
    this.kill(i, true, 'partiu');
    const name = this.species[s].name.toLowerCase();
    this.note(v ? `Gente de ${v.name} fez uma jangada para atravessar a água` : `Um ${name} sozinho fez uma jangada para atravessar a água`, 'mar', raft, { key: v ? `raft-${v.id}` : `raft-${s}` });
    return true;
  }

  /** Jangadas: remam pela rota e, na outra margem, quem remava volta a andar (com a mesma identidade). */
  private updateRafts(dt: number): void {
    const map = this.map;
    const w = map.width;
    for (let k = this.rafts.length - 1; k >= 0; k--) {
      const r = this.rafts[k];
      const here = this.tileAt(r.x, Math.floor(r.y));
      const t = r.path[Math.min(r.step, r.path.length - 1)];
      // A água sumiu por baixo (terraformação) ou a rota fechou: desembarca onde der.
      const ashore = here >= 0 && !isWater(map, here);
      if (ashore || !isWater(map, t)) r.blocked += dt;
      let done = r.step >= r.path.length || r.blocked > B.REROUTE_SECONDS || ashore;
      if (!done) {
        const tx = (t % w) + 0.5;
        const ty = Math.floor(t / w) + 0.5;
        const dx = wrapDx(tx - r.x, w);
        const dy = ty - r.y;
        const d = Math.hypot(dx, dy);
        const move = Math.min(d, B.RAFT_SPEED * dt);
        if (d > 0.01) {
          r.x = (((r.x + (dx / d) * move) % w) + w) % w;
          r.y += (dy / d) * move;
          if (Math.abs(dx) > 0.05) r.facing = dx > 0 ? 1 : -1;
        }
        if (d - move < 0.05 && ++r.step >= r.path.length) done = true;
      }
      if (!done) continue;
      this.rafts.splice(k, 1);
      // Desembarca na margem combinada ou, se ela mudou, na terra mais perto.
      let land = r.landing >= 0 && this.canStand(r.species, r.landing) ? r.landing : -1;
      if (land < 0) {
        const x = Math.floor(r.x);
        const y = Math.floor(r.y);
        for (let rad = 0; rad <= 3 && land < 0; rad++) {
          for (let oy = -rad; oy <= rad && land < 0; oy++) {
            for (let ox = -rad; ox <= rad && land < 0; ox++) {
              const l = this.tileAt(x + ox, y + oy);
              if (l >= 0 && this.canStand(r.species, l)) land = l;
            }
          }
        }
      }
      if (land < 0) {
        this.deaths.unshift({ uid: r.who.uid, cause: 'outra', age: r.age, x: r.x, y: r.y });
        continue;
      }
      const home = r.village >= 0 && !this.villages[r.village].abandoned ? r.village : -1;
      const c = this.spawn(r.species, (land % w) + 0.5, Math.floor(land / w) + 0.5, home, r.age);
      if (c < 0) continue;
      this.role[c] = home >= 0 ? r.role : this.role[c];
      this.energy[c] = r.energy;
      this.restore(c, r.who, true);
    }
  }

  /** Barco mais próximo de um ponto, dentro do raio. */
  private boatNear(x: number, y: number, radius: number): Boat | null {
    let best: Boat | null = null;
    let bd = radius * radius;
    for (const b of this.boats) {
      if (b.sunk >= 0) continue;
      const d = wrapDx(b.x - x, this.map.width) ** 2 + (b.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /** Um predador marinho ataca: barcos pequenos afundam, os grandes perdem alguém. */
  private sharkAttack(b: Boat, predator: string): void {
    if (this.civRnd() > 0.35 * (1 - b.kind * 0.2)) return;
    const v = this.villages[b.village];
    const type = BOATS[b.kind];
    const crew = { fish: '', colonize: ' de colonos', invade: ' de soldados', explore: ' de exploradores', trade: ' mercante' }[b.purpose];
    const what = b.purpose === 'fish' ? `um barco de pesca de ${v.name}` : `${type.the}${crew} de ${v.name}`;
    if (b.kind <= 1 && this.civRnd() < 0.5) {
      this.sink(b, `${predator}s afundaram ${b.purpose === 'fish' ? 'barcos de pesca' : what}`, b.purpose === 'fish' ? 'shark-fish' : undefined);
    } else if (b.passengers.length) {
      b.passengers.pop();
      this.note(`Um ${predator.toLowerCase()} atacou ${what}: um colono morreu`, 'mar', b);
      if (!b.passengers.length) this.sink(b, `Ninguém sobreviveu ${type.on} de ${v.name}`);
    } else if (b.purpose === 'fish') {
      this.sink(b, `${predator}s afundaram barcos de pesca`, 'shark-fish');
    }
  }

  /** Naufrágio: morrem os passageiros (ou um pescador, nos barcos de pesca). */
  private sink(b: Boat, message: string, key?: string): void {
    if (b.sunk >= 0) return;
    b.sunk = 0;
    const v = this.villages[b.village];
    if (b.purpose === 'fish') {
      for (let i = 0; i < this.count; i++) {
        if (this.alive[i] && this.village[i] === v.id && this.role[i] === ROLE.fisher) {
          this.kill(i, true, 'partiu');
          break;
        }
      }
    }
    b.passengers.length = 0;
    // Perder um barco de pesca é rotina: as repetições viram uma linha só.
    this.note(message, 'mar', b, { key, place: v.name, major: !key && b.purpose !== 'fish' });
  }

  /** Movimento dos barcos, pesca, chegada dos colonos e os perigos do mar. */
  private updateBoats(dt: number): void {
    const map = this.map;
    const w = map.width;
    for (let k = this.boats.length - 1; k >= 0; k--) {
      const b = this.boats[k];
      const v = this.villages[b.village];
      if (b.sunk >= 0) {
        b.sunk += dt;
        if (b.sunk > 6) this.boats.splice(k, 1);
        continue;
      }
      if (v.abandoned || v.port < 0) {
        if (b.purpose === 'fish') {
          this.boats.splice(k, 1);
          continue;
        }
      }
      const type = BOATS[b.kind];
      // À deriva: não avança, e a comida pode acabar.
      if (b.adrift > 0) {
        b.adrift -= dt;
        b.x = (b.x + Math.cos(b.heading) * 0.2 * dt + w) % w;
        if (b.passengers.length && happens(this.civRnd, B.ADRIFT_LOSS_RATE, dt / YEAR_SECONDS)) {
          b.passengers.pop();
          if (!b.passengers.length) this.sink(b, `${cap(type.the)} de ${v.name} se perdeu no mar e ninguém sobreviveu`);
        }
        continue;
      }
      let tx: number;
      let ty: number;
      if (b.purpose !== 'fish') {
        const t = b.path[Math.min(b.step, b.path.length - 1)];
        tx = (t % w) + 0.5;
        ty = Math.floor(t / w) + 0.5;
      } else {
        // Pesca em volta do porto e volta quando o tempo acaba.
        const px = (v.port % w) + 0.5;
        const py = Math.floor(v.port / w) + 0.5;
        b.timer -= dt;
        const far = Math.hypot(wrapDx(px - b.x, w), py - b.y);
        if (b.timer <= 0 && far < 1) {
          this.boats.splice(k, 1);
          continue;
        }
        if (b.timer <= 0 || far > 10) {
          tx = px;
          ty = py;
        } else {
          b.heading += (this.civRnd() - 0.5) * 2 * dt;
          tx = b.x + Math.cos(b.heading) * 3;
          ty = b.y + Math.sin(b.heading) * 3;
        }
        if (happens(this.civRnd, B.FISHING_CAST_RATE, dt / YEAR_SECONDS)) {
          this.forEachNear(b.x, b.y, 2, (j) => {
            if (this.species[this.kind[j]].kind === 'fish' && this.civRnd() < 0.5) {
              this.kill(j);
              this.book(v, '_fish', this.gain(v, 'food', v.vocation === 'pesqueira' ? 1 + B.VOCATION_BONUS : 1), 0);
            }
          });
        }
      }
      const dx = wrapDx(tx - b.x, w);
      const dy = ty - b.y;
      const d = Math.hypot(dx, dy);
      const move = Math.min(d, type.speed * dt);
      if (d > 0.01) {
        let nx = b.x + (dx / d) * move;
        let ny = b.y + (dy / d) * move;
        const t = this.tileAt(nx, Math.floor(ny));
        if (t < 0 || !isWater(map, t)) {
          // Barco de pesca bateu na costa: vira. Barco com rota conta o tempo parado (a costa mudou no caminho).
          b.heading += Math.PI * (0.5 + this.civRnd());
          nx = b.x;
          ny = b.y;
          b.blocked = (b.blocked ?? 0) + dt;
        } else b.blocked = 0;
        if (Math.abs(dx) > 0.05) b.facing = dx > 0 ? 1 : -1;
        b.x = (nx + w) % w;
        b.y = ny;
      }
      // Encalhado (o mar virou terra por baixo) ou parado tempo demais: refaz a rota ou desembarca onde está (seção 19.18).
      const under = this.tileAt(b.x, Math.floor(b.y));
      if (under < 0 || !isWater(map, under)) b.blocked = B.REROUTE_SECONDS + 1;
      if ((b.blocked ?? 0) > B.REROUTE_SECONDS) {
        if (b.purpose !== 'fish' && this.rerouteBoat(b)) b.blocked = 0;
        else {
          this.strand(b);
          this.boats.splice(k, 1);
          continue;
        }
      }
      if (b.purpose !== 'fish' && d < 0.35) {
        b.step++;
        if (b.step >= b.path.length) {
          if (b.purpose === 'trade') {
            if (!this.tradeBoatArrived(b)) continue;
            this.boats.splice(k, 1);
            continue;
          }
          if (b.purpose === 'invade') this.landSoldiers(b);
          else if (b.purpose === 'explore') this.explored(b);
          else this.landColonists(b);
          this.boats.splice(k, 1);
          continue;
        }
      }
      // Perigos: tempestades (mais comuns nos barcos antigos), ficar à deriva e doenças em viagens longas.
      // Barcos de pesca ficam perto da costa e voltam com tempo ruim: risco bem menor.
      if (this.civRnd() < type.risk * move * (b.purpose === 'fish' ? 0.25 : 1)) {
        if (b.purpose === 'fish') this.sink(b, 'Tempestades afundaram barcos de pesca', 'storm-fish');
        else this.sink(b, `Uma tempestade afundou ${type.the} de ${v.name}${b.passengers.length ? `: ${b.passengers.length} ${b.purpose === 'invade' ? 'soldados' : 'colonos'} morreram` : ''}`);
        continue;
      }
      if (b.purpose !== 'fish') {
        if (this.civRnd() < type.risk * 0.6 * move) {
          b.adrift = 6 + this.civRnd() * 10;
          b.heading = this.civRnd() * Math.PI * 2;
          this.note(`${cap(type.the)} de ${v.name} ficou à deriva`, 'mar', b);
        } else if (b.step > 40 && this.civRnd() < 0.0015 * move) {
          b.passengers.pop();
          this.note(`Uma doença a bordo matou um colono de ${v.name}`, 'mar', b, { key: `sick:${v.id}` });
          if (!b.passengers.length) this.sink(b, `Ninguém sobreviveu ${type.on} de ${v.name}`);
        }
      }
    }
  }

  /**
   * Nova rota pelo mar até o fim da rota antiga ou, se ele virou terra, até a
   * água mais perto dele (a até 3 tiles). Retorna se achou.
   */
  private rerouteBoat(b: Boat): boolean {
    const map = this.map;
    const w = map.width;
    const here = this.tileAt(b.x, Math.floor(b.y));
    if (here < 0 || !isWater(map, here) || !b.path.length) return false;
    const goal = b.path[b.path.length - 1];
    const gx = goal % w;
    const gy = Math.floor(goal / w);
    let found = -1;
    let bd = 3;
    this.searchSea(here, 200000, 65535, (t) => {
      if (t === goal) {
        found = t;
        return true;
      }
      const d = Math.hypot(wrapDx((t % w) - gx, w), Math.floor(t / w) - gy);
      if (d < bd) {
        bd = d;
        found = t;
      }
      return false;
    });
    if (found < 0) return false;
    const path: number[] = [];
    for (let t = found; t >= 0; t = this.searchParent[t]) path.push(t);
    b.path = path.reverse();
    b.step = 0;
    return true;
  }

  /**
   * Barco que não tem mais como seguir: o de pesca volta para casa; colonos,
   * soldados e exploradores desembarcam na terra mais perto; o mercante
   * devolve a carga em casa. Sem terra por perto, afunda.
   */
  private strand(b: Boat): void {
    const map = this.map;
    const w = map.width;
    const home = this.villages[b.village];
    if (b.purpose === 'fish') return;
    if (b.purpose === 'trade' && b.trade) {
      this.unload(home, b.trade.cargo, b.trade.purse);
      const px = home.port >= 0 ? (home.port % w) + 0.5 : home.x;
      const py = home.port >= 0 ? Math.floor(home.port / w) + 0.5 : home.y;
      for (const p of b.passengers) this.disembark(home, p, px, py);
      return;
    }
    let land = -1;
    const x = Math.floor(b.x);
    const y = Math.floor(b.y);
    for (let r = 0; r <= 3 && land < 0; r++) {
      for (let oy = -r; oy <= r && land < 0; oy++) {
        for (let ox = -r; ox <= r && land < 0; ox++) {
          const l = this.tileAt(x + ox, y + oy);
          if (l >= 0 && isLand(map, l)) land = l;
        }
      }
    }
    if (land < 0) {
      this.sink(b, `${cap(BOATS[b.kind].the)} de ${home.name} ficou sem rota e afundou`);
      return;
    }
    b.landing = land;
    if (b.purpose === 'invade') this.landSoldiers(b);
    else if (b.purpose === 'explore') this.explored(b);
    else this.landColonists(b);
  }

  /** Soldados desembarcam perto do alvo e marcham; se a guerra acabou no caminho, viram colonos. */
  private landSoldiers(b: Boat): void {
    const from = this.villages[b.village];
    const k = from.kingdom;
    if (!this.wars.some((w) => w.a === k)) {
      this.landColonists(b);
      return;
    }
    const w = this.map.width;
    const lx = b.landing % w;
    const ly = Math.floor(b.landing / w);
    for (const p of b.passengers) {
      const c = this.spawn(from.species, lx + this.polRnd(), ly + this.polRnd(), from.id, p.age);
      if (c < 0) continue;
      this.role[c] = ROLE.soldier;
      this.restore(c, p.who, true);
      this.expedition.add(c);
    }
    this.note(`Soldados de ${from.name} desembarcaram para a batalha`, 'guerra', { x: lx, y: ly });
  }

  /** Exploradores chegam a uma costa distante: podem achar outro povo (primeiro contato), minérios ou terras livres. */
  private explored(b: Boat): void {
    const from = this.villages[b.village];
    const w = this.map.width;
    const lx = b.landing % w;
    const ly = Math.floor(b.landing / w);
    const met = new Set<number>();
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom === from.kingdom || this.distance(v, lx, ly) > 35) continue;
      met.add(v.kingdom);
    }
    for (const k of met) {
      const key = this.key(k, from.kingdom);
      if (this.contacts.has(key) || this.relations.has(key)) continue;
      this.contacts.add(key);
      const other = this.villages[k];
      this.relations.set(key, (other.species !== from.species ? -30 : 0) + (other.culture.tolerance + from.culture.tolerance - 1) * 20);
      this.note(`Primeiro contato: exploradores de ${from.name} encontraram o povo ${other.culture.name}, de ${other.name}`, 'povo', { x: lx, y: ly }, { major: true });
    }
    for (const d of this.deposits) {
      if (d.amount > 0 && !d.known.has(from.kingdom) && Math.hypot(wrapDx(d.x - lx, w), d.y - ly) < 12) d.known.add(from.kingdom);
    }
    if (!met.size) this.note(`Exploradores de ${from.name} chegaram a terras desconhecidas`, 'mar', { x: lx, y: ly });
  }

  /** Manda exploradores pelo mar a uma costa distante, dentro do alcance do barco da era. */
  private explore(v: Village): boolean {
    if (v.port < 0 || this.boats.some((b) => b.village === v.id && b.purpose === 'explore' && b.sunk < 0)) return false;
    const map = this.map;
    const w = map.width;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(v.tech))];
    const coasts: { water: number; land: number }[] = [];
    this.searchSea(v.port, 400000, type.range, (t, d) => {
      if (d < type.range * 0.35 || this.civRnd() > 0.05) return false;
      const x = t % w;
      const y = (t - x) / w;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = this.tileAt(x + ox, y + oy);
        if (l >= 0 && isLand(map, l)) {
          coasts.push({ water: t, land: l });
          break;
        }
      }
      return coasts.length >= 12;
    });
    if (!coasts.length) return false;
    const pick = coasts[Math.floor(this.civRnd() * coasts.length)];
    const path: number[] = [];
    for (let t = pick.water; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    this.launch(v, 'explore', path, pick.land, []);
    return true;
  }

  /** Os colonos desembarcam e fundam um assentamento (ou se juntam a um da mesma espécie). */
  private landColonists(b: Boat): void {
    const w = this.map.width;
    const from = this.villages[b.village];
    const lx = b.landing % w;
    const ly = Math.floor(b.landing / w);
    let target: Village | null = null;
    if (this.canSettle(from.species, lx, ly, from.tech)) {
      target = this.foundVillage(from.species, lx, ly, 0, from);
      this.note(`Colonos de ${from.name} cruzaram o mar de ${BOATS[b.kind].name.toLowerCase()} e fundaram ${target.name}`, 'mar', target, { major: true });
    } else {
      const other = this.settlementAt(lx, ly);
      if (other && other.species === from.species) {
        target = other;
        this.note(`Colonos de ${from.name} chegaram de barco a ${other.name}`, 'mar', other);
      }
    }
    if (!target) {
      // A costa mudou (ou não serve mais): desembarcam sozinhos e procuram um lugar bom a pé (seção 19.18).
      let landed = 0;
      for (const p of b.passengers) {
        if (!isLand(this.map, b.landing)) break;
        const c = this.spawn(from.species, lx + this.civRnd(), ly + this.civRnd(), -1, p.age);
        if (c < 0) continue;
        this.restore(c, p.who);
        this.movedAt[c] = this.year;
        landed++;
      }
      this.note(
        landed ? `Os colonos de ${from.name} desembarcaram num lugar ruim e saíram a pé procurando onde morar` : `Os colonos de ${from.name} não acharam onde morar e se perderam`,
        'mar',
        b,
      );
      return;
    }
    for (const p of b.passengers) {
      const c = this.spawn(from.species, lx + this.civRnd(), ly + this.civRnd(), target.id, p.age);
      if (c >= 0) {
        this.role[c] = p.role;
        this.restore(c, p.who);
        this.movedAt[c] = this.year;
      }
    }
  }

  // Comércio vivo (seção 19.6) ------------------------------------------------

  /** Nome de um bem em minúsculas, para a crônica. */
  goodName(g: Good | 'food'): string {
    return g === 'food' ? 'comida' : (STOCK_NAMES.find(([k]) => k === g)?.[1] ?? g).toLowerCase();
  }

  private amountOf(v: Village, g: Good | 'food'): number {
    return g === 'food' ? v.food : v.stock[g];
  }

  private addTo(v: Village, g: Good | 'food', n: number): void {
    if (g === 'food') v.food += n;
    else v.stock[g] += n;
  }

  /** Preço local de um bem (RF-VIDA-231). */
  priceAt(v: Village, g: Good | 'food'): number {
    const rich = v.needs ? welfare(v.needs) >= 0.75 : false;
    return price(g, this.amountOf(v, g), this.capOf(v, g), v.needs, rich);
  }

  /** Caravanas e barcos mercantes de um assentamento na estrada ou no mar (rebanhos não contam). */
  caravansOf(v: Village): number {
    let n = 0;
    for (const c of this.caravans) if (c.home === v.id && c.kind !== 'flock') n++;
    for (const b of this.boats) if (b.village === v.id && b.purpose === 'trade' && b.sunk < 0) n++;
    return n;
  }

  /** Comércio no mundo todo (para o limite CARAVANS_MAX). */
  private tradeInMotion(): number {
    let n = 0;
    for (const c of this.caravans) if (c.kind !== 'flock') n++;
    for (const b of this.boats) if (b.purpose === 'trade' && b.sunk < 0) n++;
    return n;
  }

  /** Neve no caminho: no inverno, as caravanas param nas terras frias (RF-VIDA-290). */
  private snowed(x: number, y: number): boolean {
    return this.season() === 3 && temperatureAt(this.map, this.tileAt(x, Math.floor(y))) < B.COLD_K;
  }

  /** Acordo em vigor entre dois assentamentos, se houver. */
  agreementOf(a: number, b: number): Agreement | undefined {
    return this.agreements.find((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a));
  }

  /** Algum acordo entre assentamentos dos dois reinos. */
  private agreedKingdoms(ka: number, kb: number): boolean {
    return this.agreements.some((g) => {
      const x = this.villages[g.a].kingdom;
      const y = this.villages[g.b].kingdom;
      return (x === ka && y === kb) || (x === kb && y === ka);
    });
  }

  /** Dois assentamentos podem comerciar: mesmo reino, ou reinos que se conhecem, em paz e sem ódio. */
  private canTrade(v: Village, o: Village): boolean {
    if (v.kingdom === o.kingdom) return true;
    const key = this.key(v.kingdom, o.kingdom);
    if (!this.relations.has(key) && !this.contacts.has(key)) return false;
    return !this.warBetween(v.kingdom, o.kingdom) && this.relation(v.kingdom, o.kingdom) >= -20;
  }

  /** O que dá lucro levar de `v` para `o` (até `load` unidades, no máximo dois bens) e o lucro esperado. */
  private offer(v: Village, o: Village, load: number, skip: (Good | 'food')[] = []): { cargo: Cargo[]; profit: number } {
    const rows: { good: Good | 'food'; amount: number; per: number }[] = [];
    for (const g of [...GOODS, 'food'] as (Good | 'food')[]) {
      if (!tradable(g) || skip.includes(g)) continue;
      const have = this.amountOf(v, g);
      let spare = have - this.capOf(v, g) * B.CARAVAN_KEEP;
      if (g === 'food') spare = Math.min(spare, v.food - v.population * B.CONSUME_FOOD * 0.5);
      if (spare < 2) continue;
      const room = this.capOf(o, g) - this.amountOf(o, g);
      if (room < 2) continue;
      const per = this.priceAt(o, g) - this.priceAt(v, g);
      if (per <= 0.1) continue;
      rows.push({ good: g, amount: Math.min(spare, room), per });
    }
    rows.sort((p, q) => q.per - p.per);
    const cargo: Cargo[] = [];
    let profit = 0;
    let left = load;
    for (const r of rows.slice(0, 2)) {
      const amount = Math.floor(Math.min(r.amount, left));
      if (amount < 1) continue;
      cargo.push({ good: r.good, amount });
      profit += amount * r.per;
      left -= amount;
    }
    return { cargo, profit };
  }

  /** Um adulto para viajar: de preferência comerciante (ou pastor, no rebanho), nunca o líder. */
  private traveler(v: Village, role: number): number {
    let pick = -1;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.village[i] !== v.id || i === v.leader || this.role[i] === CHILD) continue;
      if (this.age[i] >= elderAge(this.species[v.species], Math.floor(v.tech))) continue;
      if (this.role[i] === role) return i;
      if (pick < 0) pick = i;
    }
    return pick;
  }

  /** Tira o viajante do mapa (ele vai junto com a caravana) e guarda quem ele é. */
  private embark(i: number): Crew {
    const crew: Crew = { age: this.age[i], role: this.role[i], who: this.identity(i) };
    this.kill(i, true, 'partiu');
    return crew;
  }

  /** O viajante volta para casa. */
  private disembark(v: Village, crew: Crew, x: number, y: number): void {
    if (v.abandoned) return;
    const c = this.spawn(v.species, x, y, v.id, crew.age);
    if (c < 0) return;
    this.role[c] = crew.role;
    this.restore(c, crew.who, true);
  }

  /** O viajante morreu no caminho: a saída vira morte, com a causa. */
  private lostCrew(v: Village, crew: Crew, cause: DeathCause, x: number, y: number): void {
    const vital = (v.vitalNow ??= emptyVital());
    vital.left = Math.max(0, vital.left - 1);
    vital.deaths[cause] = (vital.deaths[cause] ?? 0) + 1;
    if (crew.who) {
      this.deaths.unshift({ uid: crew.who.uid, cause, age: crew.age, x, y });
      if (this.deaths.length > 64) this.deaths.pop();
    }
  }

  /**
   * Saída de caravanas (RF-VIDA-230 e 236): o tributo pedido pela capital
   * vai primeiro; depois, de vez em quando, uma caravana de comércio para o
   * destino com mais lucro; no verão, o rebanho sobe para o pasto alto.
   */
  private sendCaravan(v: Village, yr: number): void {
    if (v.herd && !v.herd.away && v.herd.head >= B.TRANSHUMANCE_HEAD && this.season() === 1 && v.herd.kind !== 'horse' && v.herd.kind !== 'camel' && happens(this.civRnd, 3, yr)) this.sendFlock(v);
    if (v.tech < 0.5 || v.population < 8) return;
    const merc = v.vocation === 'mercantil';
    const market = this.has(v, 'market');
    if ((v.tier < 1 && !merc && !market && !v.request) || this.snowed(v.x, v.y)) return;
    if (this.tradeInMotion() >= B.CARAVANS_MAX || this.caravansOf(v) >= caravanCap(v.tier, merc)) return;
    if (v.request && happens(this.civRnd, 2, yr)) {
      this.sendTribute(v);
      return;
    }
    if (v.tier < 1 && !merc && !market) return;
    if (!happens(this.civRnd, B.CARAVAN_RATE * (merc ? 2 : 1) * (market ? 1.5 : 1), yr)) return;
    const era = Math.floor(v.tech);
    const load = B.CARAVAN_LOAD * (2 + Math.min(2, v.tier));
    const year = Math.floor(this.year);
    const boat = BOATS[Math.min(BOATS.length - 1, era)];
    let best: { o: Village; cargo: Cargo[]; d: number } | null = null;
    let top = 0;
    for (const o of this.villages) {
      if (o === v || o.abandoned || o.population < 3) continue;
      const fair = o.fair === year;
      const d = this.distance(o, v.x, v.y);
      const byLand = d <= B.CARAVAN_RANGE * (fair ? 1.5 : 1);
      const bySea = v.port >= 0 && o.port >= 0 && era >= 1 && d <= boat.range;
      if ((!byLand && !bySea) || !this.canTrade(v, o)) continue;
      const deal = this.offer(v, o, load);
      if (!deal.cargo.length) continue;
      let score = deal.profit - d * B.CARAVAN_TRIP_COST;
      if (this.agreementOf(v.id, o.id)) score *= B.AGREEMENT_PREFERENCE;
      if (fair) score *= B.FAIR_PREFERENCE;
      if (v.kingdom === o.kingdom && this.villages[v.kingdom].mint) score *= B.MINT_PREFERENCE;
      if (score > top) {
        top = score;
        best = { o, cargo: deal.cargo, d };
      }
    }
    if (!best) return;
    const { o, cargo, d } = best;
    const path = d <= B.CARAVAN_RANGE * 1.5 && this.landPath(v.x, v.y, o.x, o.y) ? this.roadPath(v.x, v.y, o.x, o.y) : null;
    if (path && path.length > 1) this.launchCaravan(v, o, 'trade', path, cargo);
    else if (v.port >= 0 && o.port >= 0 && era >= 1) this.launchTradeBoat(v, o, cargo);
  }

  /** Põe a caravana na estrada, com a carga tirada do estoque e um pouco de ouro para comprar na volta. */
  private launchCaravan(v: Village, o: Village, kind: 'trade' | 'tribute', path: number[], cargo: Cargo[]): boolean {
    const i = this.traveler(v, ROLE.merchant);
    if (i < 0) return false;
    for (const c of cargo) {
      c.amount = Math.min(c.amount, this.amountOf(v, c.good));
      this.addTo(v, c.good, -c.amount);
      this.book(v, 'saiu', 0, c.amount);
    }
    const purse = kind === 'trade' ? Math.min(v.stock.gold, 3 + v.tier * 2) : 0;
    v.stock.gold -= purse;
    const era = Math.floor(v.tech);
    const animal = packAnimal(v.material === 'adobe' || v.herd?.kind === 'camel', v.stock.horses);
    const w = this.map.width;
    this.caravans.push({
      id: this.nextCaravan++,
      kind,
      home: v.id,
      target: o.id,
      path,
      step: 0,
      x: (path[0] % w) + 0.5,
      y: Math.floor(path[0] / w) + 0.5,
      facing: 1,
      back: false,
      animal,
      animals: 1 + Math.min(2, v.tier),
      cart: cartOf(era),
      cargo: cargo.filter((c) => c.amount >= 1),
      purse,
      crew: this.embark(i),
      speed: B.CARAVAN_SPEED * (animal === 'horse' ? B.HORSE_SPEED : 1),
      wait: 0,
      tolls: [],
      era,
    });
    return true;
  }

  /** Barco mercante (RF-VIDA-235): de porto a porto, com os perigos do mar. */
  private launchTradeBoat(v: Village, o: Village, cargo: Cargo[]): boolean {
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(v.tech))];
    let found = false;
    this.searchSea(v.port, 400000, type.range, (t) => (found = t === o.port));
    if (!found) return false;
    const path: number[] = [];
    for (let t = o.port; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    const i = this.traveler(v, ROLE.merchant);
    if (i < 0) return false;
    let room = B.TRADE_BOAT_LOAD;
    for (const c of cargo) {
      c.amount = Math.min(c.amount, this.amountOf(v, c.good), room);
      room -= c.amount;
      this.addTo(v, c.good, -c.amount);
      this.book(v, 'saiu', 0, c.amount);
    }
    const purse = Math.min(v.stock.gold, 3 + v.tier * 2);
    v.stock.gold -= purse;
    const boat = this.launch(v, 'trade', path, -1, [this.embark(i)]);
    boat.trade = { target: o.id, cargo: cargo.filter((c) => c.amount >= 1), purse, back: false };
    return true;
  }

  /** O barco mercante chegou: vende e volta, ou entrega em casa. Retorna se acabou a viagem. */
  private tradeBoatArrived(b: Boat): boolean {
    const t = b.trade!;
    const home = this.villages[b.village];
    const o = this.villages[t.target];
    if (!t.back) {
      if (!o.abandoned) this.sell(home, o, t, 'trade', true);
      t.back = true;
      b.path.reverse();
      b.step = 0;
      return false;
    }
    this.unload(home, t.cargo, t.purse);
    const w = this.map.width;
    for (const p of b.passengers) this.disembark(home, p, (home.port % w) + this.civRnd(), Math.floor(home.port / w) + this.civRnd());
    return true;
  }

  /**
   * Chegada ao destino: entrega a carga (até o teto), recebe pelo valor na
   * moeda da era (no escambo, só em bens, RF-VIDA-291), compra a carga da
   * volta e soma relação, conhecimento e o acordo (RF-VIDA-231, 232 e 74).
   */
  private sell(v: Village, o: Village, t: { cargo: Cargo[]; purse: number }, kind: Caravan['kind'], sea = false): void {
    const era = Math.min(Math.floor(v.tech), Math.floor(o.tech));
    const minted = !!this.villages[o.kingdom].mint && v.kingdom === o.kingdom;
    const eff = CURRENCY_EFFICIENCY[currencyOf(era, minted || !!this.villages[o.kingdom].mint)];
    let value = 0;
    const sold = t.cargo[0]?.good;
    for (const c of t.cargo) {
      const put = Math.max(0, Math.min(c.amount, this.capOf(o, c.good) - this.amountOf(o, c.good)));
      value += put * this.priceAt(o, c.good);
      this.addTo(o, c.good, put);
      this.book(o, 'chegou', put, 0);
      c.amount -= put;
    }
    t.cargo = t.cargo.filter((c) => c.amount >= 1);
    if (kind === 'tribute') {
      v.stability = Math.min(1, (v.stability ?? 0.5) + B.REQUEST_STABILITY);
      v.refused = Math.max(0, (v.refused ?? 0) - 1);
      this.note(`${v.name} atendeu o pedido da capital ${o.name}`, 'economia', o, { key: `tribute-${v.id}` });
      return;
    }
    // Pagamento: ouro na moeda da era, ou bens de igual valor no escambo.
    let budget: number;
    if (eff <= 0) budget = value;
    else {
      const gold = Math.min(o.stock.gold, (value * eff) / B.GOLD_VALUE);
      o.stock.gold -= gold;
      t.purse += gold;
      budget = t.purse * B.GOLD_VALUE;
    }
    const load = (sea ? B.TRADE_BOAT_LOAD : B.CARAVAN_LOAD * (2 + Math.min(2, v.tier))) - t.cargo.reduce((n, c) => n + c.amount, 0);
    // A volta traz outro bem (ninguém leva ferramentas para trazer ferramentas).
    const back = this.offer(o, v, load, t.cargo.map((c) => c.good).concat(sold ? [sold] : []));
    let bought: Good | 'food' | undefined;
    for (const c of back.cargo) {
      const each = this.priceAt(o, c.good);
      const n = Math.floor(Math.min(c.amount, budget / Math.max(0.1, each)));
      if (n < 1) continue;
      budget -= n * each;
      if (eff > 0) {
        const pay = Math.min(t.purse, (n * each) / B.GOLD_VALUE);
        t.purse -= pay;
        o.stock.gold = Math.min(this.capOf(o, 'gold'), o.stock.gold + pay);
      }
      this.addTo(o, c.good, -n);
      this.book(o, 'saiu', 0, n);
      t.cargo.push({ good: c.good, amount: n });
      bought ??= c.good;
    }
    // Relação, conhecimento e acordo.
    const fair = o.fair === Math.floor(this.year);
    if (v.kingdom !== o.kingdom) {
      const key = this.key(v.kingdom, o.kingdom);
      const merchants = v.culture.value === 'comércio' || o.culture.value === 'comércio' ? 2 : 1;
      this.relations.set(key, Math.min(100, this.relation(v.kingdom, o.kingdom) + B.CARAVAN_RELATION * merchants + (fair ? B.FAIR_RELATION : 0)));
      this.contacts.add(key);
      this.caravanPairs.add(key);
      this.note(`Uma caravana de ${v.name} levou ${sold ? this.goodName(sold) : 'mercadorias'} até ${o.name}${sea ? ' pelo mar' : ''}`, 'economia', o, { key: `caravan:${key}` });
    }
    const teach = B.TRADE_TEACH * (fair ? 3 : 1);
    if (o.tech > v.tech) this.advance(v, (o.tech - v.tech) * teach);
    else if (v.tech > o.tech) this.advance(o, (v.tech - o.tech) * teach);
    const pair = this.key(v.id, o.id);
    const ag = this.agreementOf(v.id, o.id);
    if (ag) {
      ag.last = this.year;
      ag.kept++;
      if (v.kingdom !== o.kingdom) {
        const key = this.key(v.kingdom, o.kingdom);
        this.relations.set(key, Math.min(100, this.relation(v.kingdom, o.kingdom) + B.AGREEMENT_KEPT));
      }
    } else if (sold && bought) {
      const n = (this.trips.get(pair) ?? 0) + 1;
      this.trips.set(pair, n);
      if (n >= B.AGREEMENT_TRIPS && (v.kingdom === o.kingdom || this.relation(v.kingdom, o.kingdom) >= B.AGREEMENT_RELATION)) {
        const every = v.vocation === 'mercantil' || o.vocation === 'mercantil' ? 1 : 2;
        this.agreements.push({ a: v.id, b: o.id, goods: [sold, bought], since: this.year, until: this.year + B.AGREEMENT_YEARS, every, last: this.year, kept: 0 });
        this.trips.delete(pair);
        this.note(`${v.name} e ${o.name} firmaram um acordo: ${this.goodName(sold)} por ${this.goodName(bought)}, ${every === 1 ? 'todo ano' : `a cada ${every} anos`}`, 'economia', o, { major: v.kingdom !== o.kingdom });
      }
    }
  }

  /** Descarrega em casa a carga e o ouro que voltaram (o que não cabe se perde). */
  private unload(v: Village, cargo: Cargo[], purse: number): void {
    if (v.abandoned) return;
    for (const c of cargo) {
      const put = Math.max(0, Math.min(c.amount, this.capOf(v, c.good) - this.amountOf(v, c.good)));
      this.addTo(v, c.good, put);
      this.book(v, 'chegou', put, 0);
    }
    v.stock.gold = Math.min(this.capOf(v, 'gold'), v.stock.gold + purse);
  }

  /** Movimento das caravanas e rebanhos, pedágios, neve e os perigos do caminho. */
  private updateCaravans(dt: number): void {
    const w = this.map.width;
    for (let k = this.caravans.length - 1; k >= 0; k--) {
      const c = this.caravans[k];
      const home = this.villages[c.home];
      if (c.wait > 0) {
        c.wait -= dt;
        continue;
      }
      let t = c.path[Math.min(c.step, c.path.length - 1)];
      // A estrada virou água, lava ou penhasco (terraformação, cometa, terremoto): refaz o caminho por terra
      // até o fim da rota; sem caminho, a viagem acaba e quem ia volta para casa com a carga (seção 19.18).
      if (!isLand(this.map, t)) {
        const end = c.path[c.path.length - 1];
        const path = isLand(this.map, end) ? this.roadPath(c.x, c.y, (end % w) + 0.5, Math.floor(end / w) + 0.5) : null;
        if (!path || path.length < 2) {
          this.unload(home, c.cargo, c.purse);
          if (c.kind === 'flock' && home.herd) home.herd.away = undefined;
          this.disembark(home, c.crew, home.x, home.y);
          this.caravans.splice(k, 1);
          continue;
        }
        c.path = path;
        c.step = 0;
        t = path[0];
      }
      // Inverno nas terras frias: a caravana espera a neve passar (RF-VIDA-290).
      if (c.kind !== 'flock' && this.snowed(c.x, c.y)) continue;
      const tx = (t % w) + 0.5;
      const ty = Math.floor(t / w) + 0.5;
      const dx = wrapDx(tx - c.x, w);
      const dy = ty - c.y;
      const d = Math.hypot(dx, dy);
      const move = Math.min(d, c.speed * dt);
      if (d > 0.01) {
        c.x = (((c.x + (dx / d) * move) % w) + w) % w;
        c.y += (dy / d) * move;
        if (Math.abs(dx) > 0.05) c.facing = dx > 0 ? 1 : -1;
      }
      if (d - move < 0.05) {
        if (this.traffic[t] < 65535) this.traffic[t]++;
        if (this.trafficEra[t] < c.era) this.trafficEra[t] = c.era;
        this.trafficTiles.add(t);
        if (c.kind === 'trade') this.tollAt(c, t);
        if (this.raided(c, t)) {
          this.caravans.splice(k, 1);
          continue;
        }
        c.step++;
        if (c.step >= c.path.length && this.arrived(c)) {
          this.caravans.splice(k, 1);
          continue;
        }
      }
      // Predadores atacam animais de carga e rebanhos.
      let predators = 0;
      this.forEachNear(c.x, c.y, 3, (j) => {
        if (this.species[this.kind[j]].kind === 'predator') predators++;
      });
      if (predators && happens(this.civRnd, B.CARAVAN_PREDATOR * predators, dt / YEAR_SECONDS)) {
        if (c.kind === 'flock') {
          c.animals = Math.max(0, c.animals - 1);
          if (home.herd) home.herd.head = Math.max(0, home.herd.head - 1);
          this.note(`Predadores atacaram o rebanho de ${home.name} no caminho do pasto`, 'natureza', c, { key: `flock-pred-${home.id}` });
          continue;
        }
        c.animals--;
        for (const g of c.cargo) g.amount = Math.floor(g.amount * 0.6);
        if (c.animals <= 0 || this.civRnd() < 0.25) {
          this.lostCrew(home, c.crew, 'predador', c.x, c.y);
          this.note(`Predadores atacaram uma caravana de ${home.name}: o comerciante morreu`, 'natureza', c, { key: `caravan-pred-${home.id}` });
          this.caravans.splice(k, 1);
        }
      }
    }
  }

  /** Inimigos em guerra roubam a caravana que passa perto deles. Retorna se ela se perdeu. */
  private raided(c: Caravan, t: number): boolean {
    const home = this.villages[c.home];
    const foes = this.enemies.get(home.kingdom);
    if (!foes?.size || c.kind === 'flock') return false;
    const w = this.map.width;
    const x = (t % w) + 0.5;
    const y = Math.floor(t / w) + 0.5;
    for (const o of this.villages) {
      if (o.abandoned || !foes.has(o.kingdom) || this.distance(o, x, y) > this.radius(o) + 8) continue;
      if (this.civRnd() > B.CARAVAN_RAID) return false;
      for (const g of c.cargo) {
        const put = Math.max(0, Math.min(g.amount, this.capOf(o, g.good) - this.amountOf(o, g.good)));
        this.addTo(o, g.good, put);
      }
      o.stock.gold = Math.min(this.capOf(o, 'gold'), o.stock.gold + c.purse);
      this.lostCrew(home, c.crew, 'guerra', x, y);
      this.note(`Soldados de ${o.name} saquearam uma caravana de ${home.name}`, 'guerra', { x, y }, { key: `raid-${home.id}-${o.kingdom}` });
      return true;
    }
    return false;
  }

  /**
   * Pedágio (RF-VIDA-286): no passo de montanha perto de outro reino, a
   * caravana paga uma vez por viagem, a não ser que os reinos tenham acordo.
   */
  private tollAt(c: Caravan, t: number): void {
    const map = this.map;
    if (!(map.biome[t] === Biome.Mountain || map.elevation[t] > 0.45)) return;
    const home = this.villages[c.home];
    const w = map.width;
    const x = (t % w) + 0.5;
    const y = Math.floor(t / w) + 0.5;
    let owner: Village | null = null;
    let bd: number = B.TOLL_RANGE;
    for (const o of this.villages) {
      if (o.abandoned || o.kingdom === home.kingdom || o.tech < 1) continue;
      const d = this.distance(o, x, y);
      if (d < bd) {
        bd = d;
        owner = o;
      }
    }
    if (!owner || c.tolls.includes(owner.kingdom) || this.agreedKingdoms(home.kingdom, owner.kingdom)) return;
    c.tolls.push(owner.kingdom);
    const due = B.TOLL_GOLD * (1 + Math.floor(owner.tech) * 0.5);
    const paid = Math.min(c.purse, due);
    c.purse -= paid;
    if (paid < due && c.cargo.length) c.cargo[0].amount = Math.max(0, c.cargo[0].amount - 1);
    owner.stock.gold = Math.min(this.capOf(owner, 'gold'), owner.stock.gold + paid);
    const key = this.key(home.kingdom, owner.kingdom);
    this.relations.set(key, Math.max(-100, this.relation(home.kingdom, owner.kingdom) - B.TOLL_TENSION));
    let post = false;
    for (const [p, by] of this.tolls) {
      if (by === owner.id && Math.hypot(wrapDx((p % w) + 0.5 - x, w), Math.floor(p / w) + 0.5 - y) < 6) post = true;
    }
    if (!post) {
      this.tolls.set(t, owner.id);
      this.note(`${owner.name} passou a cobrar pedágio no passo da montanha`, 'economia', { x, y }, { key: `toll-${owner.id}` });
    }
  }

  /** A caravana chegou ao fim do caminho. Retorna se a viagem acabou. */
  private arrived(c: Caravan): boolean {
    const home = this.villages[c.home];
    if (c.kind === 'flock') {
      if (!c.back) {
        // No pasto alto até o outono.
        const phase = this.yearClock / YEAR_SECONDS;
        c.wait = Math.max(0.5, (0.5 - phase) * YEAR_SECONDS);
        c.back = true;
        c.path.reverse();
        c.step = 0;
        return false;
      }
      if (home.herd && !home.abandoned) {
        home.herd.head += binomial(this.civRnd, c.animals, B.TRANSHUMANCE_GROWTH);
        home.herd.away = undefined;
      }
      this.disembark(home, c.crew, c.x, c.y);
      return true;
    }
    if (!c.back) {
      const o = this.villages[c.target];
      if (!o.abandoned) this.sell(home, o, c, c.kind);
      c.back = true;
      c.path.reverse();
      c.step = 0;
      c.tolls = [];
      // Um tempo no mercado (mais na feira).
      c.wait = o.fair === Math.floor(this.year) ? 3 : 1;
      return false;
    }
    this.unload(home, c.cargo, c.purse);
    this.disembark(home, c.crew, c.x, c.y);
    return true;
  }

  /** A colônia manda à capital o que ela pediu (RF-VIDA-289). */
  private sendTribute(v: Village): void {
    const r = v.request!;
    const capital = this.villages[v.kingdom];
    const amount = Math.floor(Math.min(r.amount, this.amountOf(v, r.good) - this.capOf(v, r.good) * 0.2));
    if (capital === v || capital.abandoned || amount < 1) return;
    const path = this.roadPath(v.x, v.y, capital.x, capital.y);
    if (!path || path.length < 2) return;
    if (this.launchCaravan(v, capital, 'tribute', path, [{ good: r.good, amount }])) v.request = undefined;
  }

  /** Transumância (RF-VIDA-293): pastores levam parte do rebanho a um pasto alto no verão. */
  private sendFlock(v: Village): void {
    const h = v.herd!;
    const map = this.map;
    const home = map.elevation[this.tileAt(v.x, Math.floor(v.y))] ?? 0;
    let goal = -1;
    for (let k = 0; k < 30 && goal < 0; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.radius(v) + 8 + this.civRnd() * (B.TRANSHUMANCE_RANGE - 8);
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0 || !isLand(map, t) || this.built[t] || this.road[t]) continue;
      if (map.elevation[t] < Math.max(0.3, home + 0.12) || map.vegetation[t] < 0.3) continue;
      goal = t;
    }
    if (goal < 0) return;
    const w = map.width;
    const path = this.roadPath(v.x, v.y, (goal % w) + 0.5, Math.floor(goal / w) + 0.5);
    if (!path || path.length < 4) return;
    const i = this.traveler(v, ROLE.shepherd);
    if (i < 0) return;
    const animals = Math.max(2, Math.floor(h.head / 2));
    h.away = animals;
    // Cruzar terra de outro reino sem acordo gera briga.
    const crossed = new Set<number>();
    for (let s = 0; s < path.length; s += 4) {
      const px = (path[s] % w) + 0.5;
      const py = Math.floor(path[s] / w) + 0.5;
      for (const o of this.villages) {
        if (!o.abandoned && o.kingdom !== v.kingdom && this.distance(o, px, py) < this.radius(o) + 6) crossed.add(o.kingdom);
      }
    }
    for (const k of crossed) {
      if (this.agreedKingdoms(v.kingdom, k)) continue;
      const key = this.key(v.kingdom, k);
      this.relations.set(key, Math.max(-100, this.relation(v.kingdom, k) - B.TRANSHUMANCE_TENSION));
      this.note(`Pastores de ${v.name} levaram o rebanho pelas terras de ${this.villages[k].name}`, 'povo', v, { key: `cross-${v.id}-${k}` });
    }
    this.caravans.push({
      id: this.nextCaravan++,
      kind: 'flock',
      home: v.id,
      target: -1,
      path,
      step: 0,
      x: (path[0] % w) + 0.5,
      y: Math.floor(path[0] / w) + 0.5,
      facing: 1,
      back: false,
      animal: h.kind,
      animals,
      cart: 0,
      cargo: [],
      purse: 0,
      crew: this.embark(i),
      speed: B.FLOCK_SPEED,
      wait: 0,
      tolls: [],
      era: Math.floor(v.tech),
    });
  }

  /** Luxo da região: produção, o gosto dos ricos e o sal (RF-VIDA-282). */
  private luxuryYear(v: Village): void {
    if (v.luxury === undefined) v.luxury = this.luxuryOf(v);
    const era = Math.floor(v.tech);
    if (v.luxury && era >= LUXURY_ERA[v.luxury]) this.gain(v, v.luxury, B.LUXURY_MAKE * (1 + v.tier) * (v.vocation === 'mercantil' ? 1.4 : 1));
    v.luxuryJoy = false;
    if (!v.needs || welfare(v.needs) < 0.75) return;
    for (const l of LUXURIES) {
      if (l === 'salt' || v.stock[l] < 0.5) continue;
      this.spend(v, l, Math.min(v.stock[l], Math.max(0.5, v.population * B.LUXURY_USE)));
      v.luxuryJoy = true;
    }
  }

  /** Luxo que a região em volta dá, sem sorteio. */
  private luxuryOf(v: Village): Luxury | null {
    const r = this.radius(v) + 6;
    let n = 0;
    let jungle = 0;
    let savanna = 0;
    let forest = 0;
    let fertile = 0;
    let dry = 0;
    let temp = 0;
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(v.x + dx, Math.floor(v.y + dy));
        if (t < 0 || !isLand(this.map, t)) continue;
        n++;
        const b = this.map.biome[t] as Biome;
        if (b === Biome.Jungle) jungle++;
        if (b === Biome.Savanna) savanna++;
        if (b === Biome.Forest || b === Biome.Jungle) forest++;
        if (b === Biome.Desert || b === Biome.Beach || b === Biome.Barren) dry++;
        if (this.map.vegetation[t] > 0.45) fertile++;
        temp += temperatureAt(this.map, t);
      }
    }
    n = Math.max(1, n);
    return pickLuxury({ jungle: jungle / n, savanna: savanna / n, forest: forest / n, fertile: fertile / n, dry: dry / n, temp: temp / n, coast: this.coastal(v) });
  }

  /**
   * Uma vez por ano: feiras, pedidos da capital, moeda cunhada, acordos que
   * vencem ou caducam e as estradas que nascem e melhoram pelo uso.
   */
  private tradeYear(): void {
    const year = Math.floor(this.year + 0.01);
    for (const v of this.villages) {
      if (v.abandoned) continue;
      // Feira anual (RF-VIDA-234): no verão, nas vilas e cidades mercantis.
      if (v.vocation === 'mercantil' && v.tier >= 1 && v.population >= 20) {
        v.fair = year;
        this.note(`Feira anual em ${v.name}`, 'economia', v, { key: `fair-${v.id}` });
      }
      // Moeda cunhada pelo reino (RF-VIDA-291).
      if (v.kingdom === v.id && !v.mint && Math.floor(v.tech) >= 3 && this.has(v, 'market')) {
        v.mint = true;
        this.note(`O reino de ${v.name} passou a cunhar moeda própria`, 'economia', v, { major: true });
      }
      // Pedido que venceu sem resposta conta como recusa.
      if (v.request && year > v.request.until) {
        v.request = undefined;
        v.refused = (v.refused ?? 0) + 1;
        v.stability = Math.max(0, (v.stability ?? 0.5) - 0.05);
        this.note(`${v.name} não atendeu o pedido da capital ${this.villages[v.kingdom].name}`, 'povo', v, { key: `refuse-${v.id}` });
      }
    }
    this.capitalRequests(year);
    for (let k = this.agreements.length - 1; k >= 0; k--) {
      const g = this.agreements[k];
      const a = this.villages[g.a];
      const b = this.villages[g.b];
      if (a.abandoned || b.abandoned || this.year > g.until) {
        this.agreements.splice(k, 1);
        continue;
      }
      // Sem viagens no prazo, o acordo caduca e a relação piora um pouco.
      if (this.year - g.last > g.every * 2 + 1) {
        this.agreements.splice(k, 1);
        if (a.kingdom !== b.kingdom) {
          const key = this.key(a.kingdom, b.kingdom);
          this.relations.set(key, Math.max(-100, this.relation(a.kingdom, b.kingdom) - B.AGREEMENT_BROKEN / 2));
        }
        this.note(`O acordo entre ${a.name} e ${b.name} caducou`, 'economia', a, { key: `ag-end-${g.a}-${g.b}` });
      }
    }
    this.trafficYear();
  }

  /** A capital pede às colônias o que falta a ela (RF-VIDA-289). */
  private capitalRequests(year: number): void {
    for (const capital of this.villages) {
      if (capital.abandoned || capital.kingdom !== capital.id || !happens(this.polRnd, B.REQUEST_RATE, 1)) continue;
      let best: { c: Village; g: Good | 'food'; spare: number } | null = null;
      for (const g of ['food', 'wood', 'stone', 'cloth', 'tools', ...LUXURIES] as (Good | 'food')[]) {
        if (this.amountOf(capital, g) > this.capOf(capital, g) * 0.15) continue;
        if (LUXURIES.includes(g as Luxury) && (!capital.needs || welfare(capital.needs) < 0.75)) continue;
        for (const c of this.villages) {
          if (c === capital || c.abandoned || c.kingdom !== capital.id || c.request) continue;
          if (this.distance(c, capital.x, capital.y) > B.CARAVAN_RANGE * 1.5 || !this.landPath(c.x, c.y, capital.x, capital.y)) continue;
          const spare = this.amountOf(c, g) - this.capOf(c, g) * 0.5;
          if (spare >= 2 && (!best || spare > best.spare)) best = { c, g, spare };
        }
      }
      if (!best) continue;
      best.c.request = { good: best.g, amount: Math.min(B.REQUEST_LOAD, Math.floor(best.spare)), until: year + B.REQUEST_YEARS };
      this.note(`A capital ${capital.name} pediu ${this.goodName(best.g)} a ${best.c.name}`, 'povo', best.c, { key: `ask-${capital.id}` });
    }
  }

  /** Guerra entre dois reinos quebra os acordos entre eles (RF-VIDA-232). */
  private breakAgreements(ka: number, kb: number): void {
    for (let k = this.agreements.length - 1; k >= 0; k--) {
      const g = this.agreements[k];
      const x = this.villages[g.a].kingdom;
      const y = this.villages[g.b].kingdom;
      if (!((x === ka && y === kb) || (x === kb && y === ka))) continue;
      this.agreements.splice(k, 1);
      this.relations.set(this.key(ka, kb), Math.max(-100, this.relation(ka, kb) - B.AGREEMENT_BROKEN));
      this.note(`A guerra rompeu o acordo entre ${this.villages[g.a].name} e ${this.villages[g.b].name}`, 'economia', this.villages[g.a], { key: `ag-war-${g.a}-${g.b}` });
    }
  }

  /**
   * Estrada pelo uso (RF-VIDA-233): onde as caravanas passam muito nasce uma
   * estrada de terra; fora das cidades ela vira cascalho e, com uso e
   * técnica (Idade do Ferro), pedra. O uso cai aos poucos sem movimento.
   */
  private trafficYear(): void {
    const map = this.map;
    const w = map.width;
    const fresh: number[] = [];
    for (const t of this.trafficTiles) {
      const n = this.traffic[t];
      const x = (t % w) + 0.5;
      const y = Math.floor(t / w) + 0.5;
      if (n >= B.ROUTE_USE && this.road[t] === 0 && !this.built[t] && isLand(map, t) && this.depositAt[t] < 0) {
        this.setRoad(t, 1);
        fresh.push(t);
        this.routeTiles++;
      } else if (this.road[t] === 1 && n >= B.GRAVEL_USE && !this.settlementAt(x, y)) {
        this.road[t] = GRAVEL;
        this.onTileChanged(t);
      } else if (this.road[t] === GRAVEL && n >= B.STONE_USE && this.trafficEra[t] >= 2) {
        this.road[t] = 2;
        this.onTileChanged(t);
      }
      const next = Math.floor(n * (1 - B.TRAFFIC_DECAY));
      this.traffic[t] = next;
      if (!next) {
        this.trafficTiles.delete(t);
        this.trafficEra[t] = 0;
      }
    }
    if (fresh.length) this.pruneRoads(fresh);
  }

  /** Moeda de um assentamento hoje (RF-VIDA-291), pelo nome. */
  currencyName(v: Village): number {
    return currencyOf(Math.floor(v.tech), !!this.villages[v.kingdom].mint);
  }


  // Mudanças no mundo (eventos e ferramentas) -------------------------------

  /** Número aleatório da simulação (determinístico pela semente). */
  random(): number {
    return this.worldRnd();
  }

  effect(kind: Effect['kind'], x: number, y: number, life: number, size = 1): void {
    if (this.effects.length < 300) this.effects.push({ kind, x, y, age: 0, life, size });
  }

  /**
   * Altera o terreno num raio: `fn` recebe o tile e a distância ao centro.
   * Reclassifica o bioma e avisa a renderização.
   */
  reshape(x: number, y: number, r: number, fn: (i: number, d: number) => void): void {
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const t = this.tileAt(Math.floor(x) + dx, Math.floor(y) + dy);
        if (t < 0) continue;
        fn(t, d);
        if (this.map.bare) this.map.bare[t] = 0;
        this.map.biome[t] = classify(this.map, t);
        this.onTileChanged(t);
      }
    }
    this.sweep(x, y, r);
  }

  /** Lava num tile: o calor sobe e vai esfriando ao longo dos anos até virar rocha. */
  pourLava(i: number, heat: number): void {
    this.map.heat[i] += heat;
    this.cooling.push({ i, heat });
  }

  /** Esfria a lava um pouco a cada ano. */
  private coolLava(): void {
    for (let k = this.cooling.length - 1; k >= 0; k--) {
      const c = this.cooling[k];
      const drop = Math.max(8, c.heat * 0.12);
      const d = Math.min(drop, c.heat);
      c.heat -= d;
      this.map.heat[c.i] -= d;
      this.map.biome[c.i] = classify(this.map, c.i);
      this.onTileChanged(c.i);
      if (c.heat <= 0) this.cooling.splice(k, 1);
    }
  }

  /**
   * Destrói construções num raio (terremoto, cometa, vulcão): casas viram
   * ruína, assentamentos sem casa são abandonados. Retorna quantas caíram.
   */
  destroyAround(x: number, y: number, r: number, chance = 1): number {
    let n = 0;
    for (const v of this.villages) {
      if (v.abandoned || this.distance(v, x, y) > r + this.radius(v)) continue;
      for (let k = v.houses.length - 1; k >= 0; k--) {
        const h = v.houses[k];
        if (Math.hypot(wrapDx(h.x + 1 - x, this.map.width), h.y + 1 - y) > r || this.worldRnd() > chance) continue;
        this.raze(v, k);
        n++;
      }
    }
    if (this.ruins.length > 200) this.ruins.splice(0, this.ruins.length - 200);
    return n;
  }

  /**
   * Derruba a construção `k` do assentamento: libera o terreno, deixa uma
   * ruína (se o chão ainda é terra). O material se perde (seção 19.19).
   */
  private raze(v: Village, k: number): void {
    const h = v.houses[k];
    const size = h.kind === 'port' ? 1 : 2;
    let land = false;
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        const t = this.tileAt(h.x + dx, h.y + dy);
        if (t < 0) continue;
        if (isLand(this.map, t)) land = true;
        this.built[t] = 0;
        this.onTileChanged(t);
        // Sem a casa ao lado, um bloco de rua que ela segurava pode sair na limpeza do ano.
        this.roadDirty.push(t);
      }
    }
    if (h.kind === 'port') v.port = -1;
    v.houses.splice(k, 1);
    if (!land) return;
    this.ruins.push({ x: h.x + size / 2, y: h.y + size, age: 0 });
  }

  /**
   * Faz o que a construção do povo sobreviver à mudança do terreno (seção
   * 19.18): depois de cometa, terremoto, vulcão, ferramentas de terreno ou
   * clima, tudo que ficou sem chão para existir some. Estrada, praça, roça e
   * pasto na água, na lava ou no gelo; jazida submersa; casa, porto e prédio
   * com tile que não é terra, num barranco (desnível acima de
   * HOUSE_MAX_RELIEF) ou porto sem água ao lado. Assentamento cujo centro
   * afundou se afoga. Retorna quantas construções caíram.
   */
  sweep(cx: number, cy: number, r: number): number {
    const map = this.map;
    const ri = Math.ceil(r) + 2;
    const x0 = Math.floor(cx);
    const y0 = Math.floor(cy);
    let lost = 0;
    let roads = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const t = this.tileAt(x0 + dx, y0 + dy);
        if (t < 0 || isLand(map, t)) continue;
        if (this.road[t]) {
          this.road[t] = 0;
          this.mainStreet[t] = 0;
          this.traffic[t] = 0;
          this.tolls.delete(t);
          roads++;
          this.onTileChanged(t);
        }
        const id = this.depositAt[t];
        if (id >= 0 && this.deposits[id].amount > 0) {
          const d = this.deposits[id];
          d.amount = 0;
          if (d.mine >= 0) {
            const owner = this.villages[d.mine];
            const at = owner.mines.indexOf(id);
            if (at >= 0) owner.mines.splice(at, 1);
            d.mine = -1;
          }
        }
      }
    }
    for (const v of this.villages) {
      if (v.abandoned || this.distance(v, cx, cy) > ri + this.radius(v) + 6) continue;
      for (let k = v.houses.length - 1; k >= 0; k--) {
        const h = v.houses[k];
        const size = h.kind === 'port' ? 1 : 2;
        let bad = false;
        let lo = Infinity;
        let hi = -Infinity;
        for (let dy = 0; dy < size && !bad; dy++) {
          for (let dx = 0; dx < size; dx++) {
            const t = this.tileAt(h.x + dx, h.y + dy);
            if (t < 0 || !isLand(map, t)) {
              bad = true;
              break;
            }
            lo = Math.min(lo, map.elevation[t]);
            hi = Math.max(hi, map.elevation[t]);
          }
        }
        if (!bad && hi - lo > B.HOUSE_MAX_RELIEF) bad = true;
        if (!bad && h.kind === 'port' && (v.port < 0 || !isWater(map, v.port))) bad = true;
        if (!bad) continue;
        this.raze(v, k);
        lost++;
        roads++;
      }
      // O centro afundou, queimou ou virou gelo: o assentamento acabou (os moradores se afogam).
      const center = this.tileAt(v.x, Math.floor(v.y));
      if (center >= 0 && !isLand(map, center) && v.population > 0) {
        for (let i = 0; i < this.count; i++) if (this.alive[i] && this.village[i] === v.id) this.kill(i, true, 'desastre');
        this.note(`${v.name} foi tomada pelas águas, pelo fogo ou pelo gelo`, 'natureza', v, { major: v.tier >= 1 });
      }
    }
    for (let k = this.ruins.length - 1; k >= 0; k--) {
      const t = this.tileAt(this.ruins[k].x, Math.floor(this.ruins[k].y) - 1);
      if (t >= 0 && !isLand(map, t)) this.ruins.splice(k, 1);
    }
    if (roads) this.reconcile(cx, cy, ri);
    return lost;
  }

  /**
   * Acerta as contas dos assentamentos perto de um ponto depois que tiles de
   * rua, roça, pasto ou casa sumiram: roças contadas a mais, cercados
   * incompletos e estrada que precisa ser refeita (`linked`).
   */
  private reconcile(cx: number, cy: number, ri: number): void {
    const w = this.map.width;
    for (const v of this.villages) {
      if (v.abandoned || this.distance(v, cx, cy) > ri + this.radius(v) + 8) continue;
      v.linked = false;
      if (v.pens?.length) {
        v.pens = v.pens.filter((p) => {
          const tiles = [this.tileAt(p.x, p.y), this.tileAt(p.x + 1, p.y), this.tileAt(p.x, p.y + 1), this.tileAt(p.x + 1, p.y + 1)];
          if (tiles.every((t) => t >= 0 && this.road[t] === 5)) return true;
          for (const t of tiles) {
            if (t >= 0 && this.road[t] === 5) {
              this.road[t] = 0;
              this.onTileChanged(t);
            }
          }
          return false;
        });
      }
      if (v.fields > 0) {
        const r = Math.ceil(this.radius(v)) + 1;
        let tiles = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const t = this.tileAt(Math.floor(v.x) + dx, Math.floor(v.y) + dy);
            if (t >= 0 && this.road[t] === 4) tiles++;
          }
        }
        v.fields = Math.min(v.fields, Math.ceil(tiles / 4));
      }
    }
    void w;
  }

  /**
   * Lava e chão em brasa pegam fogo no que está em volta (seção 19.18): a
   * mata perto queima, animais morrem e casas dentro do alcance caem. Uma
   * vez por ano, com no máximo `limit` focos, para não pesar.
   */
  private lavaFires(limit = 60): void {
    const map = this.map;
    const w = map.width;
    const n = w * map.height;
    let started = 0;
    for (let t = 0; t < n && started < limit; t++) {
      if (map.biome[t] !== Biome.Lava || this.worldRnd() > B.LAVA_FIRE_RATE / 6) continue;
      const x = t % w;
      const y = (t - x) / w;
      let hit = false;
      this.reshape(x, y, B.LAVA_FIRE_RANGE, (i, d) => {
        if (map.vegetation[i] < 0.1 || this.worldRnd() > 0.8 - d * 0.2) return;
        map.vegetation[i] = 0.03;
        hit = true;
      });
      const fallen = this.destroyAround(x + 0.5, y + 0.5, B.LAVA_FIRE_RANGE, 0.5);
      if (!hit && !fallen) continue;
      started++;
      this.effect('flame', x + 0.5, y + 0.5, 8, 1.4);
      this.killAround(x + 0.5, y + 0.5, B.LAVA_FIRE_RANGE, 0.4);
      const near = this.settlementAt(x + 0.5, y + 0.5);
      if (fallen || near) this.note(`O fogo da lava queimou ${fallen ? `${fallen} construções` : 'a mata'} perto de ${near?.name ?? 'um assentamento'}`, 'natureza', { x, y }, { key: 'lava-fire' });
    }
  }

  /** Nova jazida de minério (cometa, terremoto, vulcão ou o jogador). */
  addDeposit(x: number, y: number, ore: Ore, amount: number, cave: boolean): Deposit | null {
    const t = this.tileAt(x, Math.floor(y));
    if (t < 0 || !isLand(this.map, t) || this.depositAt[t] >= 0 || this.built[t]) return null;
    const w = this.map.width;
    const d: Deposit = { id: this.deposits.length, x: t % w, y: Math.floor(t / w), ore, amount, initial: amount, cave, mine: -1, known: new Set() };
    this.deposits.push(d);
    this.depositAt[t] = d.id;
    return d;
  }

  /**
   * Ferramenta Limpar (seção 19.18): tira do mapa o que é da natureza num
   * raio: árvores (a mata fica rala e rebrota), pedregulhos e cactos, jazidas
   * de minério e ruínas. O material se perde: só o trabalho do povo põe
   * madeira, pedra e minério no estoque (seção 19.19). Retorna quantos itens.
   */
  clearNature(x: number, y: number, r: number): number {
    const map = this.map;
    map.bare ??= new Uint8Array(map.width * map.height);
    const ri = Math.ceil(r);
    let trees = 0;
    let rocks = 0;
    let ores = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(Math.floor(x) + dx, Math.floor(y) + dy);
        if (t < 0) continue;
        let changed = false;
        const decor = isLand(map, t) && !this.road[t] && !this.built[t] ? decorAt(map, t) : Decor.None;
        if (decor === Decor.Tree || decor === Decor.JungleTree || decor === Decor.Pine || decor === Decor.Acacia) {
          // Fica mato baixo: abaixo do limiar de árvore de cada bioma.
          map.vegetation[t] = Math.min(map.vegetation[t], 0.26);
          trees++;
          changed = true;
        } else if (decor === Decor.Stump || decor === Decor.Sapling) {
          map.felled![t] = 0;
          this.stumps.delete(t);
          trees++;
          changed = true;
        } else if (decor === Decor.Boulder || decor === Decor.Cactus) {
          map.bare[t] = 1;
          if (decor === Decor.Boulder) rocks++;
          changed = true;
        }
        const id = this.depositAt[t];
        if (id >= 0 && this.deposits[id].amount > 0) {
          const d = this.deposits[id];
          d.amount = 0;
          if (d.mine >= 0) {
            const owner = this.villages[d.mine];
            const at = owner.mines.indexOf(id);
            if (at >= 0) owner.mines.splice(at, 1);
            d.mine = -1;
          }
          ores++;
        }
        if (changed) {
          map.biome[t] = classify(map, t);
          this.onTileChanged(t);
        }
      }
    }
    for (let k = this.ruins.length - 1; k >= 0; k--) {
      const q = this.ruins[k];
      if (Math.hypot(wrapDx(q.x - x, map.width), q.y - 1 - y) <= r) {
        this.ruins.splice(k, 1);
        rocks++;
      }
    }
    const n = trees + rocks + ores;
    if (n) this.note('Você limpou o terreno', 'jogador', { x, y }, { key: 'limpar' });
    return n;
  }

  /**
   * Ferramenta Demolir (seção 19.18): derruba as construções do povo num
   * raio: casas e prédios que encostam no pincel, ruas, praça, roças e
   * pastos. O material se perde; o povo reconstrói depois, se precisar,
   * pagando de novo. Retorna quantas construções caíram.
   */
  demolish(x: number, y: number, r: number): number {
    const w = this.map.width;
    let n = 0;
    for (const v of this.villages) {
      if (v.abandoned || this.distance(v, x, y) > r + this.radius(v) + 3) continue;
      for (let k = v.houses.length - 1; k >= 0; k--) {
        const h = v.houses[k];
        const size = h.kind === 'port' ? 1 : 2;
        if (Math.hypot(wrapDx(h.x + size / 2 - x, w), h.y + size / 2 - y) > r + size / 2) continue;
        this.raze(v, k);
        n++;
      }
    }
    const ri = Math.ceil(r);
    let tiles = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(Math.floor(x) + dx, Math.floor(y) + dy);
        if (t < 0 || !this.road[t]) continue;
        this.road[t] = 0;
        this.mainStreet[t] = 0;
        this.traffic[t] = 0;
        this.tolls.delete(t);
        this.onTileChanged(t);
        tiles++;
      }
    }
    for (let k = this.ruins.length - 1; k >= 0; k--) {
      const q = this.ruins[k];
      if (Math.hypot(wrapDx(q.x - x, w), q.y - 1 - y) <= r) this.ruins.splice(k, 1);
    }
    if (n || tiles) {
      this.reconcile(x, y, ri);
      this.note(`Você demoliu ${n ? `${n} construções` : 'ruas e roças'}`, 'jogador', { x, y }, { key: 'demolir' });
    }
    return n;
  }

  /** Mata criaturas num raio sem registrar cada morte; retorna quantas. */
  killAround(x: number, y: number, r: number, chance = 1): number {
    this.buildGrid();
    let n = 0;
    this.forEachNear(x, y, r, (i) => {
      if (this.worldRnd() > chance) return;
      this.kill(i, true, 'desastre');
      n++;
    });
    return n;
  }

  // Ferramentas do jogador -------------------------------------------------

  /** Introduz indivíduos de uma espécie já conhecida numa área. Retorna quantos nasceram. */
  introduce(s: number, x: number, y: number, radius: number, amount: number): number {
    const w = this.map.width;
    let born = 0;
    if (this.species[s].kind === 'sapient') {
      const tile = Math.floor(y) * w + (((Math.floor(x) % w) + w) % w);
      if (!this.habitable(s, tile)) return 0;
      const other = this.settlementAt(x, y);
      if (other || !this.canFound(Math.floor(x), Math.floor(y))) {
        this.hint = `Muito perto de ${other?.name ?? 'outro assentamento'}: escolha um lugar fora da área`;
        return 0;
      }
      // Lugar ruim para morar (seção 19.18): eles chegam, olham em volta e saem procurando um lugar melhor.
      const why = this.siteProblem(s, x, y);
      if (why) {
        for (let k = 0; k < Math.max(4, amount); k++) {
          if (this.spawn(s, (((x + (this.rnd() - 0.5) * 3) % w) + w) % w, y + (this.rnd() - 0.5) * 3, -1, this.species[s].maturity + this.rnd() * 10) >= 0) born++;
        }
        this.hint = `Aqui não dá para fundar (${why}): eles vão procurar um lugar melhor`;
        this.note(`Você trouxe ${this.species[s].name.toLowerCase()}s, que saíram procurando onde morar`, 'jogador', { x, y });
        return born;
      }
      const v = this.foundVillage(s, ((Math.floor(x) % w) + w) % w, Math.floor(y), Math.max(4, amount));
      this.note(`Você trouxe ${this.species[s].name.toLowerCase()}s, que fundaram ${v.name}`, 'jogador', v);
      return v.population;
    }
    for (let k = 0; k < amount * 4 && born < amount; k++) {
      const a = this.rnd() * Math.PI * 2;
      const d = Math.sqrt(this.rnd()) * radius;
      const tx = Math.floor(x + Math.cos(a) * d);
      const ty = Math.floor(y + Math.sin(a) * d);
      if (ty < 0 || ty >= this.map.height) continue;
      const tile = ty * w + (((tx % w) + w) % w);
      if (!this.habitable(s, tile)) continue;
      if (this.spawnAtTile(s, tile, -1, this.species[s].maturity) >= 0) born++;
    }
    return born;
  }

  /** Reduz a população numa área (controle de população). */
  cull(x: number, y: number, radius: number): number {
    this.buildGrid();
    let n = 0;
    this.forEachNear(x, y, radius, (i) => {
      this.kill(i, false, 'jogador');
      n++;
    });
    return n;
  }

  /** Alimenta as criaturas numa área. */
  feed(x: number, y: number, radius: number): void {
    this.buildGrid();
    this.forEachNear(x, y, radius, (i) => {
      this.energy[i] = 1;
    });
  }

  /** Avança o conhecimento de um assentamento (sem pular a condição de era). */
  teachVillage(v: Village, amount: number): void {
    this.advance(v, amount);
  }

  /** Ensina as aldeias numa área: avança a tecnologia delas. */
  teach(x: number, y: number, radius: number, amount: number): Village[] {
    const w = this.map.width;
    const taught: Village[] = [];
    for (const v of this.villages) {
      if (v.abandoned) continue;
      let dx = Math.abs(v.x - x);
      if (dx > w / 2) dx = w - dx;
      if (dx * dx + (v.y - y) ** 2 <= (radius + 4) ** 2) {
        this.advance(v, amount);
        taught.push(v);
      }
    }
    return taught;
  }

  /** Quem a pessoa é, para levar num barco. */
  private identity(i: number): Identity {
    return { uid: this.uid[i], parent: this.parent[i], family: this.family[i], bornAt: this.bornAt[i], bornYear: this.bornYear[i], movedAt: this.movedAt[i] };
  }

  /**
   * Devolve a identidade a quem desembarcou. `back` é quem voltou ao mesmo
   * assentamento sem partir de fato: a saída e a chegada se anulam.
   */
  private restore(c: number, who: Identity | undefined, back = false): void {
    if (!who) return;
    this.uid[c] = who.uid;
    this.parent[c] = who.parent;
    this.family[c] = who.family;
    this.bornAt[c] = who.bornAt;
    this.bornYear[c] = who.bornYear;
    this.movedAt[c] = who.movedAt;
    const v = this.villages[this.village[c]];
    if (back && v?.vitalNow) {
      v.vitalNow.arrived = Math.max(0, v.vitalNow.arrived - 1);
      v.vitalNow.left = Math.max(0, v.vitalNow.left - 1);
    }
  }

  /** Índice da criatura viva com esse `uid`, ou -1. */
  findUid(uid: number): number {
    for (let i = 0; i < this.count; i++) if (this.alive[i] && this.uid[i] === uid) return i;
    return -1;
  }

  /** Todas as criaturas a até `radius` de um ponto, da mais perto para a mais longe (RF-VIDA-331). */
  pickAll(x: number, y: number, radius: number): number[] {
    this.buildGrid();
    const found: [number, number][] = [];
    this.forEachNear(x, y, radius, (i, dx, dy) => found.push([dx * dx + dy * dy, i]));
    return found.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
  }

  /** Criaturas dentro de um retângulo do mapa (seleção de grupo, RF-VIDA-336). */
  pickRect(x0: number, y0: number, x1: number, y1: number): number[] {
    const w = this.map.width;
    const out: number[] = [];
    const span = (((x1 - x0) % w) + w) % w || (x1 > x0 ? w : 0);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.y[i] < y0 || this.y[i] > y1) continue;
      if ((((this.x[i] - x0) % w) + w) % w <= span) out.push(i);
    }
    return out;
  }

  /** Pai ou mãe vivo e filhos vivos (ficha da criatura, RF-VIDA-335). */
  familyOf(i: number): { parent: number; children: number[] } {
    let parent = -1;
    const children: number[] = [];
    for (let j = 0; j < this.count; j++) {
      if (!this.alive[j]) continue;
      if (this.parent[i] && this.uid[j] === this.parent[i]) parent = j;
      if (this.parent[j] === this.uid[i]) children.push(j);
    }
    return { parent, children };
  }

  /** O que a criatura está fazendo agora, em poucas palavras (RF-VIDA-335). */
  activityOf(i: number): string {
    const sp = this.species[this.kind[i]];
    const moving = Math.hypot(this.vx[i], this.vy[i]) > 0.05;
    const vi = this.village[i];
    if (sp.kind !== 'sapient') {
      if (this.energy[i] < 0.3) return sp.kind === 'predator' || sp.kind === 'shark' ? 'caçando, com fome' : 'procurando comida';
      let threat = false;
      if (sp.kind === 'herbivore' || sp.kind === 'fish') {
        this.forEachNear(this.x[i], this.y[i], 4, (j) => {
          const k = this.species[this.kind[j]].kind;
          if (k === 'predator' || k === 'shark') threat = true;
        });
      }
      if (threat && moving) return sp.kind === 'fish' ? 'fugindo de um tubarão' : 'fugindo de um predador';
      return moving ? (sp.kind === 'fish' ? 'nadando' : 'andando') : sp.kind === 'herbivore' ? 'pastando' : 'descansando';
    }
    if (vi < 0) return moving ? 'andando sem rumo' : 'descansando no mato';
    const v = this.villages[vi];
    if (this.expedition.has(i)) return 'em campanha de guerra';
    const role = ROLES[this.role[i]];
    const d = this.distance(v, this.x[i], this.y[i]);
    const inside = d <= this.radius(v);
    const tile = this.tileOf(i);
    if (this.role[i] === CHILD) return moving ? 'brincando' : 'em casa';
    if (this.age[i] >= elderAge(sp, Math.floor(v.tech)) && this.role[i] < ROLE.leader) return 'descansando';
    if (this.energy[i] < 0.3) return 'procurando comida';
    const war = this.warOf(v.kingdom);
    switch (role) {
      case 'hunter':
        return inside ? (moving ? 'voltando da caça' : 'limpando a caça') : 'indo caçar';
      case 'gatherer':
        return inside ? 'separando o que colheu' : 'colhendo frutos e raízes';
      case 'farmer':
        return this.road[tile] === 4 ? 'trabalhando na roça' : moving ? 'indo para a roça' : 'guardando a colheita';
      case 'fisher':
        return inside ? 'voltando com peixe' : 'pescando na costa';
      case 'builder':
        return v.houses.some((h) => (h.workUntil ?? 0) > this.year) ? 'construindo uma casa' : 'consertando casas';
      case 'woodcutter':
        return inside ? 'trazendo lenha' : 'cortando lenha';
      case 'miner':
        return v.mines.length ? 'trabalhando na mina' : 'procurando minério';
      case 'blacksmith':
        return 'trabalhando na forja';
      case 'soldier':
      case 'guard':
        return war ? 'de guarda, em guerra' : 'de guarda';
      case 'shepherd':
        return 'cuidando do rebanho';
      case 'horsekeeper':
        return 'cuidando dos cavalos';
      case 'weaver':
        return 'tecendo';
      case 'potter':
        return 'fazendo tijolos';
      case 'miller':
        return 'moendo grão';
      case 'merchant':
        return inside ? 'negociando na praça' : 'levando mercadoria';
      case 'priest':
        return 'no templo';
      case 'leader':
      case 'king':
        return war ? 'comandando a guerra' : 'cuidando do governo';
      default:
        return moving ? `andando por ${v.name}` : 'descansando';
    }
  }

  /** Índice da criatura mais próxima de um ponto, ou -1. */
  pick(x: number, y: number, radius: number): number {
    this.buildGrid();
    let best = -1;
    let bd = Infinity;
    this.forEachNear(x, y, radius, (i, dx, dy) => {
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }
}
