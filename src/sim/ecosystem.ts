import { mulberry32 } from '../core/rng';
import * as B from './balance';
import { browseOf, floraOf, woody, type Flora } from './flora';
import { windAt } from './climate';
import { Weather } from './weather';
import { binomial, happens, ouStep, streams } from './stochastic';
import * as P from './progress';
import { Biome, classify, Decor, decorAt, isForestBiome, isRockyBiome, isTree, temperatureAt, vegetationCap, type SurfaceMap } from '../procgen/surface';
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
import { CHILD, pickRole, ROLE, ROLE_NAMES, ROLES, roleWeights, type Role, type RoleContext } from './roles';
import { inheritTraits, randomTraits, TRAIT, TRAIT_COUNT } from '../ai/traits';
import { chooseProfession, needDemand, professionReason, switchWill, type ProfessionContext } from '../ai/decisions/work';
import { remember, type Thought, type ThoughtKind } from '../ai/trace';
import { BOND, forget, partnerOf, type Bond } from '../ai/relations';
import { socialYear, type Resident } from '../ai/decisions/social';
import { LEADER, SOCIAL } from '../ai/tuning';
import { chooseLeader, leaderReason, rulerTemper, type Candidate } from '../ai/decisions/leader';
import { completeness, missingText, planItems, type PlanItem } from './plan';
import { belowTier, loyaltyScore, missingFunctions, MOTIVE_TEXT, pairKey, polityOf, POLITY_NAMES, siteValue, spacingFor, tierAllowed, type ColonyMotive, type Polity, type SiteLook, type TierCheck } from './community';
import { AVENUE, GRAVEL, isStreet, mainStreets, pickMaterial, TRAIL, WALL, type BuildMaterial } from './architecture';
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
import { emptyVital, familyName, HISTORY_YEARS, personName, type DeathCause, type Exit, type Sample, type Vital } from './people';
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
import { maxPensOf, plotSeed, pruneBlocks, TIER_NAMES, TIER_RADIUS, wrapDx } from './settlement';
import { alienName, EARTH_ID, habitatOf, type Species, type SpeciesKind } from './species';
import {
  BITE,
  BREED_LENGTH,
  BREED_START,
  CARCASS_YEARS,
  CARRION_RATIO,
  COAST_YIELD,
  DECISIONS_PER_YEAR,
  ECO_CELL,
  ecologyOf,
  refreshEcology,
  EDIBLE,
  FEAR_DECAY_YEAR,
  FOOD_MIN,
  FORAGE_USE,
  GRAZE_COST,
  GRAZE_MAX,
  HUNGRY,
  HUNT_SUCCESS,
  hunts,
  INSECT_YIELD,
  BROWSE_YIELD,
  isLandAnimal,
  LAND_BUDGET,
  ANIMAL_PACE,
  metabolic,
  METABOLISM_YEAR,
  ration,
  appetite,
  PARASITE_RATE,
  PARASITE_RECOVERY,
  PREDATOR_RATIO,
  REFUGE,
  REGROW_YEAR,
  SATED,
  STARVING,
  TANK_KG,
  THERMAL_YEAR,
  type Ecology,
} from './fauna';

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
  /** Motivo (seção 19.7): decide o objetivo e o fim. */
  motive: WarMotive;
  /** Saque: o bem cobiçado, o que o bando já leva e se está voltando para casa. */
  good?: LootGood;
  loot?: number;
  herd?: number;
  returning?: number;
  /** Assentamento de onde o exército saiu (leva comida dele) e a comida que tem (0 a 1). */
  home: number;
  supply: number;
  /** Anos seguidos com pouca comida. */
  hungry?: number;
  /** Mercenários contratados por cada lado. */
  mercs: [number, number];
}

/**
 * Motivo da guerra (RF-VIDA-240): saque de um bem (curta, acaba quando o saque volta),
 * território (conquista ou paz com cessão), extermínio (arrasa o assentamento e funda
 * outro nas ruínas) e guerra civil (RF-VIDA-138).
 */
export type WarMotive = 'loot' | 'land' | 'dominion' | 'revenge' | 'faith' | 'extermination' | 'civil';
export type LootGood = 'food' | 'wood' | 'horses' | 'iron' | 'gold';
export const WAR_MOTIVES: Record<WarMotive, string> = { loot: 'saque', land: 'território', dominion: 'domínio', revenge: 'vingança', faith: 'fé', extermination: 'extermínio', civil: 'guerra civil' };

/** Plano de guerra de um reino (seção 19.7): ele junta o que falta e só declara quando acha que está pronto e em vantagem. */
export interface WarPlan {
  enemy: number;
  target: number;
  motive: WarMotive;
  good?: LootGood;
  since: number;
  /** Quanto ele acha que o inimigo vale (1 = a força de verdade), fixo no plano. */
  belief: number;
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
  /** Técnicas conhecidas (seção 19.10). */
  techs: ReadonlySet<string>;
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

export interface Building {
  /** Canto superior esquerdo de 2x2 tiles (o porto ocupa 1 tile). */
  x: number;
  y: number;
  kind: BuildingKind;
  /** Variação de aparência (casas). */
  variant: number;
  /** Andares a mais (casas reformadas e adensadas, RF-VIDA-203). */
  level?: number;
  /** Ano até o qual a obra continua, com andaime (saves antigos; hoje a obra é por trabalho, `labor`). */
  workUntil?: number;
  /**
   * Obra presencial (seção 19.21): trabalho que falta, em segundos de construtor, e o total. Só os
   * construtores no lugar o reduzem. `site` marca a obra de um prédio novo, ainda sem uso; `crew`, quantos trabalham nela agora.
   */
  labor?: number;
  laborMax?: number;
  site?: boolean;
  crew?: number;
  /** Era do estilo da casa: a da construção ou da última reforma (transição gradual, RF-VIDA-251). */
  era?: number;
  /** Casa vazia num assentamento em crise (RF-VIDA-254). */
  empty?: boolean;
  /** Anos seguidos sem conserto por falta de madeira ou pedra (seção 19.19). */
  wear?: number;
  /** Casa de sítio rural, fora do núcleo (RF-AS-02). */
  farm?: boolean;
  /** Nome do bairro, quando veio de uma aldeia que a cidade engoliu (RF-AS-06). */
  quarter?: string;
  /** Família que mora nela (chave da família) e anos seguidos sem ninguém (RF-AS-17). */
  owner?: number;
  idle?: number;
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
  /** `uid` do líder atual, para achar o herdeiro quando ele morre (IA local). */
  leaderUid?: number;
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
  /** Parte dos moradores que comeu bem no ano que passou (sem contar o celeiro): a fome de verdade, para filhos e mudanças. */
  fedShare?: number;
  stability?: number;
  /** Rebanho domesticado e os cercados de pasto (canto 2x2 de cada um, RF-VIDA-215). */
  herd?: Herd;
  pens?: { x: number; y: number }[];
  /** Fertilidade do solo das roças, de 0 a 1 (RF-VIDA-294). */
  soil?: number;
  /** Produção e consumo do ano passado, do ano corrente e histórico acumulado, por recurso (painel de economia, RF-VIDA-217). */
  ledger?: Ledger;
  ledgerNow?: Ledger;
  ledgers?: Ledger[];
  ledgerTotal?: Ledger;
  /** Ano até o qual dura a corrida do ouro (RF-VIDA-285). */
  goldRush?: number;
  /** Tem água por perto (barro e poço). */
  wet?: boolean;
  /** Material das casas, pelo que há em volta (RF-VIDA-252). */
  material?: BuildMaterial;
  /** Era do último calçamento das ruas. */
  paveEra?: number;
  /** Nascimentos, mortes, chegadas e partidas do ano passado, do ano corrente e histórico acumulado (RF-VIDA-343). */
  vital?: Vital;
  vitalNow?: Vital;
  vitals?: Vital[];
  vitalTotal?: Vital;
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
  /** Mudas a plantar nos tocos antigos: cada árvore cortada soma `PLANT_PER_FELL` (seção 19.21). */
  plantDue?: number;
  /** Construtores do assentamento (adultos em idade de trabalhar): sem nenhum, coletores e o líder ajudam nas obras. */
  crew?: number;
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
  /** Eras por desenvolvimento (seção 19.10): nível de cada pilar agora, pontos na era atual e técnicas conhecidas. */
  levels?: P.Points;
  pts?: P.Points;
  techs?: string[];
  /** Técnica descoberta por um morador específico (`uid`), que ele está ensinando à aldeia. */
  pendingTech?: { id: string; uid: number; name: string; progress: number };
  /** Amostras trazidas por caravanas: técnica -> ano até quando ainda inspiram os trabalhadores. */
  samples?: Record<string, number>;
  /** Maior população já alcançada, para reconhecer o colapso (RF-VIDA-275). */
  peak?: number;
  /** Última vez que as técnicas foram sorteadas. */
  learnAt?: number;
  /** Plano novo dos assentamentos (seção 20): ano e jeito da fundação (RF-AS-01 a 08). */
  foundedAt?: number;
  foundedBy?: 'bando' | 'colônia' | 'sítio' | 'refúgio' | 'cisma' | 'família' | 'mar';
  /** Colônia em formação: motivo, sítios que os batedores visitam e quando o grupo parte (RF-AS-03). */
  colony?: { motive: ColonyMotive; sites: { x: number; y: number; value: number }[]; until: number; scouts: number[] };
  /** Ano em que a última colônia partiu daqui (COLONY_COOLDOWN). */
  colonyAt?: number;
  /** Bairros que vieram de aldeias engolidas pela cidade (RF-AS-06). */
  quarters?: { name: string; culture: number; foreign: boolean }[];
  /** Virou bairro deste assentamento (some do mapa como lugar à parte). */
  mergedInto?: number;
  /** Para onde foi a última leva de moradores (RF-AS-08). */
  leftTo?: number;
  /** Anos seguidos abaixo do que o degrau pede (descida de nível). */
  lowYears?: number;
  /** Degrau político do centro (RF-AS-48), cidade de referência e quantos a têm como referência (RF-AS-44). */
  polity?: Polity;
  ref?: number;
  market?: number;
  /** Lealdade ao centro (0 a 1), e o outro centro que atrai o lugar e há quantos anos (RF-AS-49 e 50). */
  loyalty?: number;
  lure?: { k: number; years: number };
  /** Deriva cultural acumulada (RF-AS-52) e a cidade que cresce mais que a capital (RF-AS-51). */
  drift?: number;
  rival?: { id: number; years: number };
  /** Ano da última revisão da muralha (RF-AS-18) e os tiles dela. */
  wallAt?: number;
  walls?: number[];
  /** Pegada (raio das casas do núcleo mais a folga, RF-AS-10), refeita quando as casas mudam. */
  foot?: number;
}

/** Quem a pessoa é, guardado quando ela embarca e devolvido quando desembarca. */
export interface Identity {
  uid: number;
  parent: number;
  family: number;
  bornAt: number;
  bornYear: number;
  movedAt: number;
  /** Traços de personalidade (IA local); saves antigos não têm. */
  traits?: Int8Array;
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

/** Tipos de ação presencial (seção 19.21); 0 é nenhuma. */
const JOB = { fell: 1, plant: 2, build: 3 } as const;
/** Teto mínimo de qualquer espécie: abaixo disso, um azar qualquer acaba com ela. */
const MIN_CAP = 30;
/** Teto mínimo de um bicho de terra (rede de segurança; quem regula é a capacidade de cada célula). */
const MIN_WILD = 12;
/** Abaixo disso a espécie vira relicta: gasta menos e se reproduz mais (piso contra a extinção). */
const RELICT = 10;
/** Energia extra por ano (fração do metabolismo) de quem está numa célula sem água. */
const THIRST_COST = 0.2;
/** Até onde um adulto procura parceiro (tiles); bem mais longe quando a espécie está rara. */
const MATE_RANGE = 24;

export function isWater(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] < 0 && map.biome[i] !== Biome.Ice && map.biome[i] !== Biome.Lava;
}

export function isLand(map: SurfaceMap, i: number): boolean {
  return map.elevation[i] >= 0 && map.biome[i] !== Biome.Lava;
}

/** O que um bicho de terra está fazendo (IA híbrida: portões fixos + IAUS, docs/REFATORACAO-ECOSSISTEMA.md). */
export const ACT = { rest: 0, eat: 1, hunt: 2, scavenge: 3, flee: 4, shelter: 5, mate: 6, disperse: 7, herd: 8, hibernate: 9, drink: 10 } as const;

/** Corpo de um bicho morto: alimenta quem matou, depois os necrófagos, depois aduba o chão. */
export interface Carcass {
  x: number;
  y: number;
  /** Carne que sobrou (kg). */
  kg: number;
  /** Ano da morte. */
  at: number;
  /** Espécie do morto. */
  sp: number;
}

/** Distância do bote (tiles) e decisões de perseguição antes de desistir. */
const STRIKE = 2.5;
const CHASE_TRIES = 10;
/** Teto do contador de esforço da caçada (a perseguição começa já descontando o caminho até a presa). */
const CHASE_LIMIT = 250;
const GOAL_TRIES = 10;

/** Carcaças ao mesmo tempo no mapa, no máximo (as mais velhas somem primeiro). */
const MAX_CARCASSES = 900;

/**
 * Células ecológicas (ECO_CELL×ECO_CELL tiles): comida, nicho de cada espécie,
 * contagem e capacidade de suporte. São contas derivadas do mapa e dos bichos,
 * refeitas aos poucos e nunca salvas (ficam num WeakMap fora do save).
 */
class EcoCells {
  readonly cols: number;
  readonly rows: number;
  readonly n: number;
  stride = 0;
  /** Tiles de terra, pasto disponível agora (média 0 a 1), insetos (média) e costa rasa (fração). */
  readonly land: Float32Array;
  readonly forage: Float32Array;
  readonly bugs: Float32Array;
  readonly shore: Float32Array;
  /** Ramagem e fruto da mata disponíveis agora (média 0 a 1 na terra) e a soma da parte lenhosa dos tiles. */
  readonly browse: Float32Array;
  readonly wood: Float32Array;
  /** Fração da ramagem já comida e quando (rebrota como o pasto), por célula. */
  readonly bused: Float32Array;
  readonly busedAt: Float32Array;
  /** Do clima vivo, refeitos com a célula: ramagem por tile lenhoso na estação, rebrota do pasto (por ano)
   * e quanto do pasto a neve deixa à vista. */
  readonly bseason: Float32Array;
  readonly regrow: Float32Array;
  readonly cover: Float32Array;
  /** Produção por ano, em tanques de energia: pasto, insetos e comida da costa. */
  readonly fprod: Float32Array;
  readonly bprod: Float32Array;
  readonly iprod: Float32Array;
  readonly wprod: Float32Array;
  /** Ração de todas as presas da célula (para a capacidade dos predadores). */
  readonly prey: Float32Array;
  /** Caçadores por célula (na última recontagem): a presa só procura ameaça onde há algum. */
  readonly hunters: Uint16Array;
  suit = new Float32Array(0);
  K = new Float32Array(0);
  N = new Uint16Array(0);
  /** Lotação da área de vida (N/K em volta), calculada sob demanda e esquecida a cada recontagem (-1 = por calcular). */
  dens = new Float32Array(0);
  /** Soma de K por espécie no planeta. */
  total: number[] = [];
  /** Centro de cada bando (família): x de referência, soma dos desvios em x, soma de y e quantos. */
  readonly herds = new Map<number, [number, number, number, number]>();
  /** Espécie de cada bando (para o território dos predadores). */
  readonly herdKind = new Map<number, number>();
  cursor = 0;
  /** Voltas completas do refresco (o nicho é refeito numa de cada quatro). */
  passes = 0;
  recounts = 0;
  ready = false;

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / ECO_CELL);
    this.rows = Math.ceil(height / ECO_CELL);
    this.n = this.cols * this.rows;
    this.land = new Float32Array(this.n);
    this.forage = new Float32Array(this.n);
    this.bugs = new Float32Array(this.n);
    this.shore = new Float32Array(this.n);
    this.browse = new Float32Array(this.n);
    this.wood = new Float32Array(this.n);
    this.bused = new Float32Array(this.n);
    this.busedAt = new Float32Array(this.n);
    this.bseason = new Float32Array(this.n).fill(0.5);
    this.regrow = new Float32Array(this.n).fill(REGROW_YEAR);
    this.cover = new Float32Array(this.n).fill(1);
    this.fprod = new Float32Array(this.n);
    this.bprod = new Float32Array(this.n);
    this.iprod = new Float32Array(this.n);
    this.wprod = new Float32Array(this.n);
    this.prey = new Float32Array(this.n);
    this.hunters = new Uint16Array(this.n);
  }

  resize(species: number): void {
    this.stride = species;
    this.suit = new Float32Array(this.n * species);
    this.K = new Float32Array(this.n * species);
    this.N = new Uint16Array(this.n * species);
    this.dens = new Float32Array(this.n * species).fill(-1);
    this.total = new Array(species).fill(0);
    this.ready = false;
  }

  /** Célula de uma posição (com a volta horizontal do mapa). */
  of(x: number, y: number, width: number): number {
    const cx = Math.floor((((x % width) + width) % width) / ECO_CELL);
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / ECO_CELL)));
    return cy * this.cols + cx;
  }
}


/** Biomas que escondem bichos pequenos do predador (refúgio). */
const REFUGES = new Set<number>([Biome.Forest, Biome.Jungle, Biome.Taiga, Biome.Swamp, Biome.Mangrove, Biome.Rock, Biome.Mountain, Biome.Cliff]);

/** Rascunhos da escolha de presa e do bando (sem alocar a cada decisão). */
const PREY_CAND = new Float32Array(48 * 3);
let PREY_SEEN = new Uint16Array(64);
const KIN = { n: 0, dx: 0, dy: 0, d: 0 };

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
  /**
   * Ação presencial em andamento (seção 19.21): o tipo (JOB, 0 nenhuma), o tile alvo e o trabalho
   * já feito em segundos. O alvo só vale com `jobKind` > 0 (o tile 0 é um alvo possível).
   */
  jobKind = new Uint8Array(0);
  job = new Int32Array(0);
  jobWork = new Float32Array(0);
  /** Segundos que o indivíduo anda sem chegar ao alvo da ordem. */
  jobWait = new Float32Array(0);
  /** Casa da família (tile do canto da casa, -1 sem casa), RF-AS-17 e 20. */
  home = new Int32Array(0);
  /**
   * IA local das pessoas (src/ai): TRAIT_COUNT traços de −10 a 10 por indivíduo (inteligentes; bichos ficam em 0)
   * e o diário curto das decisões de cada um, pelo `uid`.
   */
  traits = new Int8Array(0);
  /** Fauna de terra: ação atual (ACT), tile de destino (-1 nenhum), presa perseguida (-1 nenhuma) e carga de parasitas (0 a 1). */
  act = new Uint8Array(0);
  goal = new Int32Array(0);
  chase = new Int32Array(0);
  /** Decisões gastas no alvo atual (presa ou destino): desiste da presa depois de CHASE_TRIES e do destino depois de GOAL_TRIES. */
  effort = new Uint8Array(0);
  parasite = new Float32Array(0);
  /** Pasto comido de cada tile (fração da vegetação) e o ano em que foi comido: rebrota sozinho, sem mexer na floresta. */
  graze: Float32Array;
  grazeAt: Float32Array;
  /** Paisagem do medo: caçadas recentes em cada célula ecológica (decai em uma estação). */
  fear: Float32Array;
  /** Carcaças no mapa. */
  readonly carcasses: Carcass[] = [];
  /** Abundância (0 a 1) da espécie da última presa escolhida, para o bote (rascunho da caçada). */
  private preyAbundance = 1;
  /** Decisões normais que a decisão atual do bicho vale (detalhe menor longe da tela). */
  private lodStride = 1;
  /** Último ano em que o fogo natural foi sorteado. */
  private fireYear = -1;
  /** Quantas decisões normais cabem até a próxima deste bicho (3 fora da tela). */
  private stride = 1;
  /** O mapa tinha lava sem erupção (planeta quente)? -1 = ainda não olhou. */
  private bornLava = -1;
  /**
   * Onde o jogador está olhando (centro e meia largura, em tiles). Bichos de terra longe disso
   * decidem três vezes menos, cada decisão valendo por três: mesma biologia por ano, um terço do custo.
   */
  focus: { x: number; y: number; r: number } | null = null;
  /** Células ecológicas (comida, nicho, capacidade e contagem); vão no save para a simulação seguir idêntica. */
  private cells: EcoCells | null = null;
  /** Clima vivo: vento, umidade, chuva, neve e água no solo por célula de 16×16 (Plano 2). */
  weather: Weather | null = null;
  /** Tempo (anos) desde a última recontagem das células ecológicas. */
  private wildClock = 0;
  readonly diary = new Map<number, Thought[]>();
  /** Laços de cada pessoa com outras (amizade, casamento, rivalidade), pelo `uid` (src/ai/relations.ts). */
  readonly bonds = new Map<number, Bond[]>();
  /** Ofícios de cada assentamento no último ano (índice em ROLES), para a IA saber o que já está cheio. */
  private roleCount = new Map<number, number[]>();
  /** Cache de `uid` -> índice, refeito uma vez por ano (vai no save junto com o ano, então volta coerente). */
  private readonly uidIndex = new Map<number, number>();
  private uidYear = -1;
  /** Tiles que ninguém alcançou, e o ano até o qual saem do quadro de serviços. */
  private readonly jobBlocked = new Map<number, number>();
  /** Obra que cada construtor atende (cache; se faltar, é refeito pelo tile da ordem). */
  private readonly siteCache = new Map<number, Building>();
  /** Tile alvo -> quem reservou; a reserva só vale enquanto o indivíduo vive e ainda mira esse tile. */
  private readonly jobClaim = new Map<number, number>();
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
  /** Técnicas que já apareceram em algum assentamento (a primeira vai para a crônica). */
  private readonly techsSeen = new Set<string>();
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
  /** Afinidade entre assentamentos (chave "a:b", a < b), de -100 a 100 (RF-AS-43). */
  readonly affinities = new Map<string, number>();
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
  /** Espécies que já ganharam o alerta de ameaçadas (sai quando a população se recupera). */
  readonly threatened = new Set<number>();
  /** Trégua depois de uma paz: até esse ano o par não volta à guerra. */
  readonly truces = new Map<string, number>();
  /** Planos de guerra, por reino que se prepara (RF-VIDA-241). */
  readonly plans = new Map<number, WarPlan>();
  /** Vingança: "perdedor>vencedor" até esse ano (RF-VIDA-240). */
  readonly vengeance = new Map<string, number>();
  /** Agressividade de cada reino, de -1 (passivo) a 1 (agressivo), mexida pelo jogador e que some aos poucos. */
  readonly temper = new Map<number, number>();
  /** Rancor do vencido (chave "a:b") até esse ano (RF-VIDA-243). */
  readonly grudges = new Map<string, number>();
  /** Mercenários contratados numa guerra em andamento (RF-VIDA-295). */
  readonly mercenaries = new Set<number>();
  /** Parte dos soldados de cada assentamento que vai montada (um cavalo por soldado, RF-VIDA-223). */
  private readonly cavalry = new Map<number, number>();
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
  /** Paliçada, muralha e portões (RF-AS-18, `WALL`). */
  wall: Uint8Array;
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
  readonly tally = {
    hunger: 0,
    cold: 0,
    collapsed: 0,
    greedWars: 0,
    exodus: 0,
    migrants: 0,
    familyMoves: 0,
    supplied: 0,
    // IA local: casamentos e brigas no mundo.
    marriages: 0,
    fights: 0,
    exodusFuel: 0,
    // Etapa F: guerras por motivo, o máximo ao mesmo tempo, e o que elas deixaram.
    lootWars: 0,
    landWars: 0,
    exterminations: 0,
    civilWars: 0,
    warsPeak: 0,
    plans: 0,
    plansDropped: 0,
    prepYears: 0,
    wars: 0,
    looted: 0,
    burned: 0,
    wildfires: 0,
    refugees: 0,
    mercenaries: 0,
    retreats: 0,
    // Fauna de terra: mortes de fome e, delas, as que tinham comida a até 8 tiles (fome evitável).
    wildStarved: 0,
    wildStarvedNearFood: 0,
    // Plano novo dos assentamentos (seção 20): como nasceram os lugares, quem morreu cedo, fusões e política.
    soloFounds: 0,
    colonies: 0,
    farmsteads: 0,
    merged: 0,
    shortLived: 0,
    lastWaves: 0,
    tierDowns: 0,
    interMarriages: 0,
    annexations: 0,
    revolts: 0,
    capitalMoves: 0,
    newPeoples: 0,
    aid: 0,
    aidRefused: 0,
    rivalries: 0,
    visits: 0,
    festivals: 0,
  };
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
  /** Segundos de simulação que formam um ano no relógio (padrão YEAR_SECONDS; maior na tela para o ano durar mais sem desacelerar ações e eventos). */
  yearSpan = YEAR_SECONDS;
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
  /** Sorteios do saber: técnicas aprendidas e esquecidas. */
  private readonly lore: () => number;
  /** Sorteios da política: relações, incidentes, guerras. */
  private readonly polRnd: () => number;
  /** Sorteios dos eventos do mundo. */
  private readonly worldRnd: () => number;
  /** Sorteios do clima do ano. */
  private readonly climateRnd: () => number;
  /** Sorteios da IA das pessoas: traços, herança e escolhas (fluxo próprio, para não mexer nos outros). */
  private readonly mindRnd: () => number;
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
    this.lore = rng.saber;
    this.polRnd = rng.politica;
    this.worldRnd = rng.mundo;
    this.climateRnd = rng.clima;
    this.mindRnd = rng.mente;
    this.road = new Uint8Array(map.width * map.height);
    this.traffic = new Uint16Array(map.width * map.height);
    this.trafficEra = new Uint8Array(map.width * map.height);
    this.mainStreet = new Uint8Array(map.width * map.height);
    this.wall = new Uint8Array(map.width * map.height);
    this.built = new Uint8Array(map.width * map.height);
    this.treeGrow = new Float32Array(map.width * map.height);
    this.treeVeg = new Float32Array(map.width * map.height);
    this.stoneTaken = new Float32Array(map.width * map.height);
    this.graze = new Float32Array(map.width * map.height);
    this.grazeAt = new Float32Array(map.width * map.height);
    this.fear = new Float32Array(Math.ceil(map.width / ECO_CELL) * Math.ceil(map.height / ECO_CELL));
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
    this.populateWild();
    this.species.forEach((sp, s) => {
      if (this.wild(s)) return;
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
    const copy = <T extends Float32Array | Uint8Array | Int8Array | Int16Array | Int32Array | Uint32Array>(a: T, make: (n: number) => T): T => {
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
    this.jobKind = copy(this.jobKind, (n) => new Uint8Array(n));
    this.job = copy(this.job, (n) => new Int32Array(n));
    this.jobWork = copy(this.jobWork, (n) => new Float32Array(n));
    this.jobWait = copy(this.jobWait, (n) => new Float32Array(n));
    this.home = copy(this.home, (n) => new Int32Array(n));
    this.act = copy(this.act, (n) => new Uint8Array(n));
    this.goal = copy(this.goal, (n) => new Int32Array(n));
    this.chase = copy(this.chase, (n) => new Int32Array(n));
    this.effort = copy(this.effort, (n) => new Uint8Array(n));
    this.parasite = copy(this.parasite, (n) => new Float32Array(n));
    const traits = new Int8Array(capacity * TRAIT_COUNT);
    traits.set(this.traits);
    this.traits = traits;
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
    const w = this.map.width;
    x = ((x % w) + w) % w;
    y = Math.max(0.01, Math.min(this.map.height - 0.01, y));
    const t0 = this.tileAt(x, Math.floor(y));
    if (t0 < 0 || !this.canStand(s, t0)) {
      if (village >= 0 && this.canStand(s, this.tileAt(this.villages[village].x, Math.floor(this.villages[village].y)))) {
        x = this.villages[village].x;
        y = this.villages[village].y;
      } else {
        let fixed = false;
        const bx = Math.floor(x);
        const by = Math.floor(y);
        for (let r = 1; r <= 3 && !fixed; r++) {
          for (let oy = -r; oy <= r && !fixed; oy++) {
            for (let ox = -r; ox <= r && !fixed; ox++) {
              const nt = this.tileAt(bx + ox, by + oy);
              if (nt >= 0 && this.canStand(s, nt)) {
                x = (((bx + ox + 0.5) % w) + w) % w;
                y = by + oy + 0.5;
                fixed = true;
              }
            }
          }
        }
        if (!fixed) return -1;
      }
    }
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
    this.think[i] = this.rnd() * (this.wild(s) ? this.yearSpan / DECISIONS_PER_YEAR : THINK_INTERVAL);
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
    this.jobKind[i] = 0;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
    this.home[i] = -1;
    this.act[i] = 0;
    this.goal[i] = -1;
    this.chase[i] = -1;
    this.effort[i] = 0;
    this.parasite[i] = 0;
    this.population[s]++;
    if (this.population[s] > RELICT * 2) this.threatened.delete(s);
    this.everLived[s] = true;
    if (village >= 0) {
      const v = this.villages[village];
      v.population++;
      const vital = (v.vitalNow ??= emptyVital());
      if (age === 0) vital.births++;
      else vital.arrived++;
      this.role[i] = age < this.species[s].maturity ? CHILD : pickRole(Math.floor(v.tech), this.scale(v), this.rnd(), this.roleContext(v));
    }
    if (this.species[s].kind === 'sapient') randomTraits(this.traits, i, this.mindRnd, village >= 0 ? this.villages[village].culture.value : undefined);
    else this.traits.fill(0, i * TRAIT_COUNT, (i + 1) * TRAIT_COUNT);
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
      this.diary.delete(this.uid[i]);
      this.mourn(i);
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
    // Alerta (uma vez por queda): a espécie de terra ficou com tão poucos que pode sumir do planeta.
    if (this.population[s] === RELICT - 1 && this.wild(s) && !this.threatened.has(s)) {
      this.threatened.add(s);
      this.note(`${this.species[s].name}: restam poucos neste planeta; a espécie está ameaçada`, 'natureza', { x: this.x[i], y: this.y[i] }, { key: `threat-${s}` });
    }
    this.expedition.delete(i);
    this.mercenaries.delete(i);
    if (this.population[s] === 0 && this.species[s].kind !== 'sapient') {
      this.extinct.add(s);
      this.note(`${this.species[s].name}: a espécie foi extinta neste planeta`, 'natureza', { x: this.x[i], y: this.y[i] }, { major: true });
    }
    const v = this.village[i];
    if (v >= 0) {
      const village = this.villages[v];
      village.population--;
      if (village.pendingTech && village.pendingTech.uid === this.uid[i] && cause !== 'partiu') this.losePendingTech(village, 'morreu', quiet);
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
    const yr = dt / this.yearSpan;
    this.year += yr;
    // Clima vivo: uma fatia das células por passo, o mundo inteiro duas vezes por mês de jogo.
    this.weather ??= new Weather(this.map.width, this.map.height);
    this.weather.step(this.map, this.year, this.yearPhase(), yr, (x, y) => -this.climateAt(x, y));
    // Fogo natural: uma vez por ano, no auge do verão.
    if (this.yearPhase() >= 0.45 && Math.floor(this.year) !== this.fireYear) {
      this.fireYear = Math.floor(this.year);
      this.wildfires();
    }
    this.buildGrid();
    const map = this.map;
    const w = map.width;
    // Dois relógios: bichos de terra decidem DECISIONS_PER_YEAR vezes por ano; os aquáticos vivem no
    // tempo em que foram calibrados (ano de YEAR_SECONDS), então a biologia não muda com a duração do ano.
    const animalThink = this.yearSpan / DECISIONS_PER_YEAR;
    const legacy = YEAR_SECONDS / this.yearSpan;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      const sk = this.species[this.kind[i]].kind;
      const aquatic = sk === 'fish' || sk === 'shark';
      const mdt = aquatic ? dt * legacy : dt;
      // Movimento contínuo; nunca entra num tile fora do habitat nem sobe um penhasco (seção 19.18).
      const nx = this.x[i] + this.vx[i] * mdt;
      const ny = this.y[i] + this.vy[i] * mdt;
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
        if (!this.steer(i, here, mdt)) {
          this.vx[i] = -this.vx[i] + (this.rnd() - 0.5) * 0.5;
          this.vy[i] = -this.vy[i] + (this.rnd() - 0.5) * 0.5;
        }
      }
      if (this.jobKind[i]) this.workJob(i, dt);
      this.age[i] += dt / this.yearSpan;
      this.think[i] -= dt;
      if (this.think[i] <= 0) {
        if (sk === 'herbivore' || sk === 'predator') {
          // Perseguição e fuga correm no relógio de ação: decisões três vezes mais frequentes enquanto duram.
          const quick = this.act[i] === ACT.hunt || this.act[i] === ACT.flee ? 3 : 1;
          const far = quick === 1 && this.offscreen(i) ? 3 : 1;
          this.think[i] += (animalThink * far) / quick;
          this.stride = far;
          this.decideAnimal(i, far / (DECISIONS_PER_YEAR * quick));
          this.stride = 1;
        } else {
          this.think[i] += aquatic ? THINK_INTERVAL / legacy : THINK_INTERVAL;
          this.decide(i, THINK_INTERVAL);
        }
      }
    }
    this.updateWildlife(yr);
    this.updateBoats(dt);
    this.updateRafts(dt);
    this.updateCaravans(dt);
    this.growVegetation(dt * legacy);
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
   * Nota de um assentamento como lugar para morar (evolução dos povos, etapa 2): comida, casa sobrando,
   * o tamanho (mais ofícios, mercado e proteção: as luzes da cidade), a guerra e a estabilidade.
   * Quem decide compara a nota do próprio lugar com a dos outros que conhece (`migrate`).
   */
  placeScore(o: Village): number {
    const n = o.needs;
    // Comida: quem come bem lá, e um pouco o celeiro.
    const food = 0.75 * (o.fedShare ?? 1) + 0.25 * Math.min(1, o.food / Math.max(1, o.population * B.CONSUME_FOOD));
    const fuel = n?.fuel ?? 1;
    const free = this.housing(o) - o.population;
    const room = Math.max(-1, Math.min(1, free / (3 + o.population * 0.15)));
    const size = B.MOVE_CITY_PULL * Math.log2(1 + o.population / 20) + B.MOVE_TIER_PULL * this.scale(o);
    const war = this.warOf(o.kingdom) ? B.MOVE_WAR : 0;
    return B.MOVE_FOOD * food + B.MOVE_FUEL * Math.min(1, fuel / 0.8) + B.MOVE_ROOM * room + size + B.MOVE_STABLE * (o.stability ?? 1) - war;
  }

  /**
   * Migração por nota (evolução dos povos, etapa 2; antes RF-VIDA-281): uma vez por ano, cada família de
   * cada assentamento pensa em se mudar com chance MOVE_THINK (bem mais na falta) e compara a nota de onde
   * mora (com o apego ao lugar) com a dos lugares do seu povo que conhece, descontada a distância e a
   * diferença de povo e de reino. Escolhe entre as melhores com sorteio ponderado, então duas famílias no
   * mesmo aperto podem decidir diferente. Na falta, sem lugar melhor por perto, parte do povo sai para
   * fundar outro lugar (êxodo), como antes; agora isso só acontece quando nenhum lugar conhecido é melhor.
   */
  private migrate(): void {
    const live = this.villages.filter((o) => !o.abandoned && o.population > 0);
    const score = new Map<Village, number>();
    for (const o of live) score.set(o, this.placeScore(o));
    // Famílias de cada assentamento: cada adulto com os filhos ainda crianças que moram no mesmo lugar.
    const families = this.familyGroups();
    for (const v of live) {
      const fams = families.get(v.id);
      if (!fams || v.population < 1) continue;
      const lack = this.scarcity(v);
      const stay = (score.get(v) ?? 0) + B.MOVE_STAY;
      const reach = B.MOVE_RANGE + B.MOVE_RANGE_ERA * Math.floor(v.tech);
      // Lugares conhecidos: do mesmo povo e espécie, a pé, com nota de quem já mora lá menos a viagem e a diferença.
      const options: { o: Village; value: number }[] = [];
      for (const o of live) {
        if (o === v || o.species !== v.species) continue;
        const d = this.distance(o, v.x, v.y);
        if (d > reach) continue;
        const foreign = o.culture !== v.culture ? B.MOVE_FOREIGN : o.kingdom !== v.kingdom ? B.MOVE_OTHER_KINGDOM : 0;
        options.push({ o, value: (score.get(o) ?? 0) - d / B.MOVE_DIST - foreign });
      }
      options.sort((p, q) => q.value - p.value);
      // Última leva (RF-AS-08): um lugar minúsculo e em falta se muda inteiro para o melhor lugar ao alcance.
      if (v.population <= B.LAST_WAVE_POP && (lack > 0 || (v.want ?? 0) >= 2)) {
        const dest = options.find((c) => !c.o.abandoned && this.scarcity(c.o) === 0 && this.landPath(v.x, v.y, c.o.x, c.o.y))?.o;
        if (dest) {
          for (const members of fams.values()) for (const i of members) this.relocate(i, v, dest);
          v.leftTo = dest.id;
          this.tally.lastWaves++;
          this.note(`Os últimos moradores de ${v.name} se mudaram para ${dest.name}`, 'povo', dest, { key: `lastwave-${v.id}` });
          continue;
        }
      }
      if (v.population < 2) continue;
      // Anos de falta (êxodo): sem o apego, vale qualquer lugar conhecido melhor que este e que não esteja em falta;
      // sem nenhum, parte do povo vai fundar outro lugar (fronteira).
      const exodus = lack > 0 && (v.want ?? 0) >= 3 && v.population >= 10;
      const here = score.get(v) ?? 0;
      const better = options.filter((c) => (exodus ? c.value > here && this.scarcity(c.o) === 0 : c.value > stay)).slice(0, 4);
      const reachable = better.filter((c) => this.landPath(v.x, v.y, c.o.x, c.o.y));
      const think = exodus ? B.EXODUS_SHARE : Math.min(0.9, B.MOVE_THINK * (1 + B.MOVE_LACK * lack));
      const leader = v.leader;
      let movedAny = 0;
      let to: Village | null = null;
      if (reachable.length) {
        for (const members of fams.values()) {
          if (members.includes(leader) || !happens(this.civRnd, think, 1)) continue;
          // Sorteio ponderado entre ficar e as opções: quanto maior a vantagem, mais provável (no êxodo, ficar não conta).
          const base = exodus ? here : stay;
          let total = exodus ? 0 : 1;
          const weights = reachable.map((c) => {
            const w = Math.exp((c.value - base) / B.MOVE_TEMPER) - 1;
            total += w;
            return w;
          });
          let r = this.civRnd() * total - (exodus ? 0 : 1);
          if (r < 0) continue;
          let pick = reachable[0];
          for (let k = 0; k < reachable.length; k++) {
            r -= weights[k];
            if (r <= 0) {
              pick = reachable[k];
              break;
            }
          }
          const dest = pick.o;
          if (dest.abandoned) continue;
          for (const i of members) this.relocate(i, v, dest);
          movedAny += members.length;
          this.tally.familyMoves++;
          to = dest;
          if (v.population <= 0) break;
        }
      }
      if (movedAny && to) {
        const why = lack > 0 ? this.lackName(v) : to.tier > v.tier ? 'trabalho na cidade' : 'uma vida melhor';
        this.note(`Famílias de ${v.name} se mudaram para ${to.name} em busca de ${why}`, 'povo', to, { key: `migra-${v.id}-${to.id}` });
        if (exodus) v.want = 0;
        continue;
      }
      // Êxodo sem lugar conhecido melhor ao alcance: sítio, colônia, refúgio e, só longe de tudo, fundar (RF-AS-01).
      if (exodus && !reachable.length) this.exodusWithoutPlace(v, fams);
    }
  }

  /** O que mais falta no assentamento em falta: comida (gente com fome) ou lenha. */
  private lackName(v: Village): 'comida' | 'lenha' {
    const food = B.HUNGER_LEVEL - (v.fedShare ?? v.needs?.food ?? 1);
    const fuel = (B.SCARCITY_LEVEL - (v.needs?.fuel ?? 1)) * (B.HUNGER_LEVEL / B.SCARCITY_LEVEL);
    return food >= fuel ? 'comida' : 'lenha';
  }

  /** Afinidade entre dois assentamentos, de −100 a 100 (RF-AS-43). */
  affinity(a: number, b: number): number {
    return a === b ? 100 : (this.affinities.get(pairKey(a, b)) ?? 0);
  }

  /** Soma à afinidade entre dois assentamentos, dentro de −100 a 100. */
  addAffinity(a: number, b: number, delta: number): void {
    if (a === b) return;
    const k = pairKey(a, b);
    this.affinities.set(k, Math.max(-100, Math.min(100, (this.affinities.get(k) ?? 0) + delta)));
  }

  /** Muda a criatura `i` de `from` para `to`: chega pela borda do destino e vai andando até a praça. */
  private relocate(i: number, from: Village, to: Village): void {
    from.population--;
    (from.vitalNow ??= emptyVital()).left++;
    this.village[i] = -1;
    const w = this.map.width;
    for (let t = 0; t < 8; t++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.footprint(to) + 1 + this.civRnd() * 2;
      const x = to.x + Math.cos(a) * d;
      const y = to.y + Math.sin(a) * d;
      const tile = this.tileAt(x, Math.floor(y));
      if (tile < 0 || !this.habitable(to.species, tile)) continue;
      this.x[i] = ((x % w) + w) % w;
      this.y[i] = y;
      break;
    }
    if (this.role[i] === CHILD) {
      this.village[i] = to.id;
      this.movedAt[i] = this.year;
      to.population++;
      (to.vitalNow ??= emptyVital()).arrived++;
    } else this.join(i, to);
    this.tally.migrants++;
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
    // Todos os moradores (crianças também), para a vida social do ano.
    const residents: number[][] = this.villages.map(() => []);
    for (let i = 0; i < this.count; i++) {
      const v = this.village[i];
      if (v < 0 || !this.alive[i]) continue;
      residents[v].push(i);
      if (this.role[i] !== CHILD) people[v].push(i);
    }
    this.roleCount.clear();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const count = new Array<number>(ROLES.length).fill(0);
      for (const i of people[v.id] ?? []) if (this.role[i] < ROLES.length) count[this.role[i]]++;
      this.roleCount.set(v.id, count);
      this.updateNeeds(v, people[v.id]?.length ?? 0);
      this.updateStability(v);
      this.socialize(v, residents[v.id]);
      this.shiftLabor(v, people[v.id] ?? []);
      this.updateVocation(v);
      this.updateHerd(v);
      this.updateSoil(v);
      this.upkeep(v);
      this.neglect(v);
      this.woodland(v);
      this.clearYards(v);
      this.luxuryYear(v);
      this.clampStock(v);
      this.hardship(v);
      const curYear = Math.floor(this.year);
      const lastYear = v.history?.length ? v.history[v.history.length - 1].year : -1;
      if (this.yearSpan <= YEAR_SECONDS || curYear > lastYear) {
        v.ledger = v.ledgerNow ?? {};
        v.ledgerNow = {};
        const ledgers = (v.ledgers ??= []);
        ledgers.push(v.ledger);
        if (ledgers.length > 100) ledgers.shift();
        const lTot = (v.ledgerTotal ??= {});
        for (const [k, [m, u]] of Object.entries(v.ledger)) {
          const cur = lTot[k] ?? (lTot[k] = [0, 0]);
          cur[0] += m;
          cur[1] += u;
        }
        v.vital = v.vitalNow ?? emptyVital();
        v.vitalNow = emptyVital();
        const vitals = (v.vitals ??= []);
        vitals.push(v.vital);
        if (vitals.length > 100) vitals.shift();
        const vTot = (v.vitalTotal ??= emptyVital());
        vTot.births += v.vital.births;
        vTot.arrived += v.vital.arrived;
        vTot.left += v.vital.left;
        for (const [c, n] of Object.entries(v.vital.deaths)) {
          if (n) vTot.deaths[c as DeathCause] = (vTot.deaths[c as DeathCause] ?? 0) + n;
        }
        const history = (v.history ??= []);
        history.push({ year: curYear, population: v.population, stock: Math.round(v.food + GOODS.reduce((n, g) => n + v.stock[g], 0)) });
        if (history.length > HISTORY_YEARS) history.shift();
      }
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
    v.fedShare = ratio('_fed');
    n.food = 0.6 * v.fedShare + 0.4 * Math.min(1, v.food / (pop * B.CONSUME_FOOD));
    n.water = v.wet ? 1 : this.has(v, 'aqueduct') ? 1 : this.scale(v) >= 3 ? 0.5 : era >= 1 ? 0.85 : 0.75;
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
    if (movers <= 0) return;
    // Quem muda primeiro é decisão de cada um (IA local): o jeito para o ofício que falta, os traços que combinam
    // com ele mais que com o atual, e a abertura para mudar (curiosos mudam, pacientes ficam). Antes: só o jeito (RF-VIDA-420).
    const will = new Map<number, number>();
    const now = Math.floor(this.year);
    for (const i of adults) {
      // Quem acabou de trocar de ofício reluta em trocar de novo (sem isso, alguns pulavam de ofício a cada 3 anos).
      let last: number | undefined;
      for (const t of this.diary.get(this.uid[i]) ?? []) if (t.kind === 'ofício') last = t.year;
      will.set(i, switchWill(this.traits, i, ROLES[this.role[i]] as Role, role, P.aptitudeOf(this.uid[i], target), last === undefined ? Infinity : now - last));
    }
    for (const i of [...adults].sort((a, b) => will.get(b)! - will.get(a)!)) {
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
      if (from !== role) this.logThought(i, 'ofício', `Trocou ${ROLE_NAMES[from].toLowerCase()} por ${ROLE_NAMES[role].toLowerCase()}: ${calm ? 'é o forte do lugar' : `o lugar precisava de ${NEED_NAMES[need]}`}`);
      this.role[i] = target;
      movers--;
    }
  }

  /**
   * Profissão de quem vira adulto, escolhida pela IA da pessoa (src/ai/decisions/work.ts): a falta no lugar,
   * o que já está cheio, os traços, o jeito, o ofício dos pais e a vocação do lugar. Soldados e guardas
   * continuam sendo chamados pelo líder, na mesma proporção do sorteio antigo.
   */
  private firstRole(v: Village, era: number, i: number): number {
    const ctx = this.roleContext(v);
    const weights = roleWeights(era, this.scale(v), ctx);
    let total = 0;
    let arms = 0;
    for (const [r, w] of weights) {
      total += w;
      if (r === 'soldier' || r === 'guard') arms += w;
    }
    const draw = this.rnd();
    if (draw * total < arms) {
      let x = draw * total;
      for (const [r, w] of weights) {
        if (r !== 'soldier' && r !== 'guard') continue;
        x -= w;
        if (x <= 0) return ROLE[r];
      }
      return ROLE.soldier;
    }
    const pick = this.thinkProfession(v, i, weights);
    return pick ?? pickRole(era, this.scale(v), this.rnd(), ctx);
  }

  /** Contexto e escolha do ofício pela IA; anota no diário. Devolve null se não houver ofício civil. */
  private thinkProfession(v: Village, i: number, weights: [Role, number][], current?: Role): number | null {
    const civil = weights.filter(([r]) => r !== 'soldier' && r !== 'guard');
    if (!civil.length) return null;
    let top = 0;
    for (const [, w] of civil) top = Math.max(top, w);
    const common = new Map(civil.map(([r, w]) => [r, w / top]));
    const n = v.needs;
    const count = this.roleCount.get(v.id);
    let adults = 0;
    if (count) for (const c of count) adults += c;
    const parentIdx = this.indexOfUid(this.parent[i]);
    const parentRole = parentIdx >= 0 && this.role[parentIdx] !== CHILD ? ROLES[this.role[parentIdx]] : undefined;
    const c: ProfessionContext = {
      traits: this.traits,
      i,
      roles: civil.map(([r]) => r),
      demand: (r) => {
        const need = ROLE_NEED[r];
        return need && n ? needDemand(n[need]) : 0;
      },
      share: (r) => (count && adults ? count[ROLE[r]] / adults : 0),
      aptitude: (r) => P.aptitudeOf(this.uid[i], ROLE[r]),
      common: (r) => common.get(r) ?? 0,
      current,
      parent: parentRole,
      vocation: v.vocation ? VOCATION_ROLE[v.vocation] : undefined,
    };
    const choice = chooseProfession(c, this.mindRnd);
    if (!choice) return null;
    const role = choice.pick.action;
    if (role !== current) {
      const need = ROLE_NEED[role];
      const verb = current ? `Trocou ${ROLE_NAMES[current].toLowerCase()} por` : 'Virou';
      this.logThought(i, 'ofício', `${verb} ${ROLE_NAMES[role].toLowerCase()}: ${professionReason(c, role, need ? NEED_NAMES[need] : undefined)}`);
    }
    return ROLE[role];
  }

  /** Índice de quem tem esse `uid` (-1 se morreu ou não existe); o mapa é refeito uma vez por ano. */
  private indexOfUid(uid: number): number {
    if (!uid) return -1;
    if (this.uidYear !== Math.floor(this.year)) {
      this.uidYear = Math.floor(this.year);
      this.uidIndex.clear();
      for (let k = 0; k < this.count; k++) if (this.alive[k]) this.uidIndex.set(this.uid[k], k);
    }
    const k = this.uidIndex.get(uid);
    return k !== undefined && this.alive[k] && this.uid[k] === uid ? k : -1;
  }

  /**
   * Um ano de vida social no lugar (IA local, src/ai/decisions/social.ts): encontros, amizades, rivalidades,
   * casamentos e brigas, anotados no diário de cada um. Crianças fazem amigos mas não casam.
   */
  private socialize(v: Village, here: number[]): void {
    const people: Resident[] = [];
    const index = new Map<number, number>();
    const sp = this.species[v.species];
    const elder = elderAge(sp, Math.floor(v.tech));
    for (const i of here) {
      people.push({ i, uid: this.uid[i], adult: this.role[i] !== CHILD && this.age[i] < elder });
      index.set(this.uid[i], i);
    }
    const name = (uid: number) => personName(uid, v.culture.id);
    for (const e of socialYear(this.traits, this.bonds, people, this.mindRnd)) {
      const a = index.get(e.a);
      const b = index.get(e.b);
      if (a === undefined || b === undefined) continue;
      if (e.text === 'brigaram') {
        this.energy[a] = Math.max(0.05, this.energy[a] - SOCIAL.fightCost);
        this.energy[b] = Math.max(0.05, this.energy[b] - SOCIAL.fightCost);
        this.tally.fights++;
      } else if (e.text === 'casaram') this.tally.marriages++;
      const text: Record<typeof e.text, [string, string]> = {
        amigos: ['Ficou amigo(a) de', 'Ficou amigo(a) de'],
        rivais: ['Virou rival de', 'Virou rival de'],
        casaram: ['Casou com', 'Casou com'],
        brigaram: ['Brigou com', 'Brigou com'],
      };
      this.logThought(a, e.kind, `${text[e.text][0]} ${name(e.b)}`);
      this.logThought(b, e.kind, `${text[e.text][1]} ${name(e.a)}`);
    }
  }

  /** Quem morreu sai dos laços dos outros; o cônjuge fica livre para casar de novo e anota a perda. */
  private mourn(i: number): void {
    const me = this.uid[i];
    const list = this.bonds.get(me);
    if (!list) return;
    for (const b of list) {
      forget(this.bonds, b.uid, me);
      if (b.kind === BOND.partner || (b.kind === BOND.friend && b.value >= SOCIAL.love)) {
        const j = this.indexOfUid(b.uid);
        const v = this.villages[this.village[i]];
        if (j >= 0) this.logThought(j, b.kind === BOND.partner ? 'família' : 'amizade', `${b.kind === BOND.partner ? 'Perdeu o cônjuge' : 'Perdeu o melhor amigo'} ${personName(me, v?.culture.id ?? 0)}`);
      }
    }
    this.bonds.delete(me);
  }

  /**
   * Curiosidade para aprender e descobrir (de 0,3 a 1,8), pelo traço curiosidade da pessoa: a média fica
   * perto da antiga `curiosityOf` (0,87), então o ritmo das descobertas do povo não muda, só quem descobre.
   */
  curiosity(i: number): number {
    return Math.max(0.3, 0.87 + 0.09 * this.traits[i * TRAIT_COUNT + TRAIT.curiosity]);
  }

  /** Anota uma decisão no diário da pessoa (IA local, src/ai/trace.ts). */
  logThought(i: number, kind: ThoughtKind, text: string): void {
    remember(this.diary, this.uid[i], { year: Math.floor(this.year), kind, text });
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
      if (isForestBiome(b) || veg > 0.6) forest++;
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
      if (this.knew(v, 'domesticacao') && happens(this.civRnd, B.DOMESTICATE_RATE, 1)) this.domesticate(v);
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
    // O rebanho come o pasto em volta dos currais, a mesma erva dos selvagens; faltando, cresce menos.
    const fed = h.away || !pens ? 1 : this.herdGraze(v, h.head * B.HERD_GRAZE);
    h.head += binomial(this.civRnd, h.head, Math.max(0, B.HERD_GROWTH * (1 - h.head / cap) * tend * keeper * sick * fed));
    h.head = Math.min(h.head, Math.ceil(cap));
    // Predadores rondam o pasto.
    let predators = 0;
    this.forEachNear(v.x, v.y, this.radius(v) + 8, (j) => {
      if (this.species[this.kind[j]].kind === 'predator' && hunts(ecologyOf(this.species[this.kind[j]]))) predators++;
    });
    if (predators) {
      const lost = Math.min(h.head, binomial(this.civRnd, predators, 1 - Math.exp(-B.HERD_PREDATION)));
      h.head -= lost;
      if (lost >= 3) this.note(`Predadores atacaram o rebanho de ${v.name}`, 'natureza', v, { key: `pred-${v.id}` });
    }
    if ((h.plague ?? 0) <= this.year && happens(this.civRnd, B.HERD_PLAGUE_RATE * (1 + h.head / 40), 1)) this.herdPlague(v, null);
    if (horses) v.stock.horses = h.head;
    // Pasto cheio: mais um cercado, até o limite do nível.
    const maxPens = maxPensOf(this.scale(v), v.vocation);
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

  /** Rebanho pastando em volta dos currais: come até `need` de pasto e devolve a fração que achou (0 a 1). */
  private herdGraze(v: Village, need: number): number {
    const pens = v.pens ?? [];
    if (!pens.length || need <= 0) return 1;
    let got = 0;
    for (const p of pens) {
      const t = this.tileAt(p.x, p.y);
      if (t >= 0) got += this.grazePatch(t, need / pens.length);
    }
    return Math.min(1, got / need);
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
    const tiles = this.fieldLot(v, 5) ?? this.outerLot(v);
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
    // Comida: conta quem passou fome de verdade (celeiro vazio com todo mundo comendo não é falta).
    const food = Math.max(0, B.HUNGER_LEVEL - (v.fedShare ?? n.food)) / B.HUNGER_LEVEL;
    const fuel = Math.max(0, B.SCARCITY_LEVEL - n.fuel) / B.SCARCITY_LEVEL;
    return Math.max(food, fuel);
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
          // O campo abastece a cidade (evolução dos povos, etapa 2): aldeia ou vila do reino onde todos comem bem manda a
          // comida que passa de meio ano de consumo para o lugar maior que não tem nem um ano guardado.
          if (this.scale(b) > this.scale(a) && (a.fedShare ?? 0) >= B.SUPPLY_FED) {
            const spare = a.food - a.population * B.CONSUME_FOOD * 0.5;
            const room = b.population * B.CONSUME_FOOD - b.food;
            const load = Math.min(B.HAUL_LOAD * 2, spare, room, this.capOf(b, 'food') - b.food);
            if (load >= 1 && this.landPath(a.x, a.y, b.x, b.y)) {
              a.food -= load;
              b.food += load;
              this.book(a, 'saiu', 0, load);
              this.book(b, 'chegou', load, 0);
              this.tally.supplied += load;
              moved = true;
            }
          }
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
  /** Agricultores que cada roça do mapa comporta: a roça desenhada representa mais terra conforme o lugar cresce. */
  fieldHands(v: Village): number {
    return B.FIELD_HANDS * (1 + B.FIELD_HANDS_TIER * this.scale(v));
  }

  harvest(v: Village): number {
    // A água no solo do clima vivo pesa um quarto: chuva farta ajuda, seca de verdade derruba.
    return Math.max(0.15, (1 + B.HARVEST_SENSITIVITY * this.climateAt(v.x, v.y)) * (0.75 + 0.25 * this.soilFactor(v.x, v.y)));
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
      case 'shark': {
        // Filtrador (a baleia) vive do plâncton: nada devagar pelo mar aberto, sem caçar nem atacar barcos.
        if (ecologyOf(sp).guild === 'filtrador') {
          if (isWater(map, tile)) e += 0.03 * dt;
          this.wander(i, sp.speed * 0.5, comfort ?? mate);
          break;
        }
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
          if (veg > 0.25 || (e < 0.5 && v.food < 1 && veg > 0.12)) e += Math.max(B.FORAGE, B.FORAGE_WILD / (1 + v.population / B.FORAGE_CROWD)) * dt;
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
        if (v && this.role[i] === CHILD && this.age[i] >= sp.maturity) this.role[i] = this.firstRole(v, era, i);
        const elder = this.age[i] >= elderAge(sp, era);
        const working = this.role[i] !== CHILD && !elder;
        let bias: { x: number; y: number } | undefined = lone;
        // Com uma ordem presencial, anda reto até o alvo (sem o vaivém do passeio) e fica parado trabalhando.
        let direct = false;
        if (v) {
          let dx = v.x - this.x[i];
          if (dx > map.width / 2) dx -= map.width;
          else if (dx < -map.width / 2) dx += map.width;
          let dy = v.y - this.y[i];
          const role = this.role[i];
          if (this.jobKind[i] && !this.jobFits(i, v, role, working)) this.dropJob(i);
          // Crianças, idosos, soldados, guardas e líderes ficam perto do centro; pescadores, perto do porto.
          let range = this.radius(v) * (role >= ROLE.soldier || !working ? 0.4 : 0.8);
          if (working && B.PRESENCE_BUILD && this.canBuildHere(v, role) && this.pickBuildJob(i, v)) {
            // Construtores vão à obra e ficam batendo nela até terminar (seção 19.21).
            [dx, dy] = this.jobDelta(i);
            range = B.BUILD_REACH * 0.6;
            direct = true;
          } else if (role === ROLE.fisher && v.port >= 0) {
            dx = wrapDx((v.port % map.width) + 0.5 - this.x[i], map.width);
            dy = Math.floor(v.port / map.width) + 0.5 - this.y[i];
            range = 4;
          } else if (role === ROLE.miner && working && v.mines.length) {
            // Mineradores trabalham na mina do assentamento.
            const d = this.deposits[v.mines[i % v.mines.length]];
            dx = wrapDx(d.x + 0.5 - this.x[i], map.width);
            dy = d.y + 0.5 - this.y[i];
            range = 2;
          } else if (role === ROLE.woodcutter && working && B.PRESENCE_WOOD) {
            // Lenhadores pegam uma ordem (derrubar ou plantar) e só então vão à mata (seção 19.21).
            if (this.pickJob(i, v) >= 0) {
              [dx, dy] = this.jobDelta(i);
              range = B.JOB_REACH * 0.5;
              direct = true;
            }
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
          const scout = this.scoutTarget(i, v);
          if (scout) {
            dx = scout.x;
            dy = scout.y;
            range = 2;
          }
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
            const c = this.cells?.ready ? this.cells : null;
            this.forEachNear(this.x[i], this.y[i], 3, (j) => {
              // Caça sustentável: só abate onde a espécie está acima da metade do que a região sustenta.
              const k = this.kind[j];
              if (prey >= 0 || this.species[k].kind !== 'herbivore') return;
              const ok = c ? this.crowding(c, c.of(this.x[j], this.y[j], map.width), k, ecologyOf(this.species[k]).herd) > 0.5 : this.population[k] > this.caps[k] * 0.25;
              if (ok) prey = j;
            });
            // Sem caça por perto: o caçador vai para a célula vizinha com mais caça sobrando (o entorno esvaziado obriga a ir longe).
            if (prey < 0 && role === ROLE.hunter && c && !march) bias = this.gameCell(i, c) ?? bias;
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
        const walk = sp.speed * B.WALK_PACE;
        if (direct && bias) this.walkTo(i, walk, bias.x, bias.y);
        else if (direct) this.stand(i);
        else this.wander(i, walk * (this.role[i] === CHILD ? 0.8 : elder ? 0.55 : 1), bias);
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
    // Com gente passando fome quase não nascem filhos (evolução dos povos): o povo para de crescer antes de morrer de fome.
    // Conta quem comeu bem, não o celeiro: celeiro vazio com todo mundo comendo não segura os nascimentos.
    const share = v >= 0 ? this.villages[v].fedShare : undefined;
    const fed = share !== undefined ? Math.min(1, Math.max(0.05, (share - B.BIRTH_FED_MIN) / (B.BIRTH_FED_FULL - B.BIRTH_FED_MIN))) : 1;
    // Filhos vêm dos casais (IA local, relações): casado tem SOCIAL.coupleBirth, solteiro só SOCIAL.singleBirth.
    const partner = sp.kind === 'sapient' ? partnerOf(this.bonds, this.uid[i]) : 0;
    const couple = sp.kind !== 'sapient' ? 1 : partner ? SOCIAL.coupleBirth : SOCIAL.singleBirth;
    const content = (needs ? (0.5 + 0.5 * welfare(needs)) * fed : 1) * couple;
    if (fertile && this.energy[i] > 0.65 && happens(this.rnd, b.birthRate * this.fertility(s, era) * content, dt)) {
      // Precisa de um parceiro adulto por perto (do mesmo assentamento, para os inteligentes).
      // Bichos acham o parceiro num raio maior (o cheiro e o chamado vão longe).
      let crowd = 0;
      let mates = 0;
      let mate = -1;
      const reach = sp.kind === 'sapient' ? CELL : CELL * 1.5;
      this.forEachNear(this.x[i], this.y[i], reach, (j, dx, dy) => {
        if (this.kind[j] !== s) return;
        if (dx * dx + dy * dy <= CELL * CELL) crowd++;
        if (j !== i && this.age[j] >= sp.maturity && (sp.kind !== 'sapient' || this.village[j] === v)) {
          mates++;
          mate = j;
        }
      });
      if (!mates || (sp.kind === 'sapient' && v < 0)) return;
      // Casas de eras mais avançadas e com andares a mais abrigam mais gente (sobrados, prédios).
      const housed = v < 0 || this.villages[v].population < this.housing(this.villages[v]);
      // Inteligentes não têm teto de aglomeração: quem limita são as casas (uma cidade densa também tem filhos).
      if ((sp.kind === 'sapient' || crowd < b.crowd) && housed) {
        const child = this.spawn(s, this.x[i] + (this.rnd() - 0.5), this.y[i] + (this.rnd() - 0.5), v);
        if (child >= 0) {
          this.energy[i] -= 0.3;
          this.parent[child] = this.uid[i];
          this.family[child] = this.family[i];
          // Os filhos lembram os pais sem ser cópia (IA local: herança dos traços); o outro pai é o cônjuge, se houver.
          const spouse = partner ? this.indexOfUid(partner) : -1;
          if (spouse >= 0 && this.village[spouse] === v) mate = spouse;
          if (sp.kind === 'sapient') inheritTraits(this.traits, child, i, mate, this.mindRnd, v >= 0 ? this.villages[v].culture.value : undefined);
        }
      }
    }
  }

  // ---- Fauna de terra: células ecológicas, pasto, carcaças e IA (docs/REFATORACAO-ECOSSISTEMA.md) ----

  /** Bicho de terra que usa a IA nova (os aquáticos e os inteligentes têm a sua). */
  /** Algum caçador nas células que o raio toca (a lista é da última recontagem, com uma célula de folga). */
  private huntersAround(x: number, y: number, radius: number): boolean {
    const c = this.cells;
    if (!c) return true;
    const w = this.map.width;
    const r = Math.ceil(radius / ECO_CELL);
    const cx = Math.floor((((x % w) + w) % w) / ECO_CELL);
    const cy = Math.floor(y / ECO_CELL);
    for (let oy = -r; oy <= r; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= c.rows) continue;
      for (let ox = -r; ox <= r; ox++) if (c.hunters[yy * c.cols + ((cx + ox + c.cols) % c.cols)]) return true;
    }
    return false;
  }

  /** Longe da área que o jogador está vendo (com folga), para o detalhe menor. */
  private offscreen(i: number): boolean {
    const f = this.focus;
    if (!f) return false;
    return Math.abs(wrapDx(this.x[i] - f.x, this.map.width)) > f.r || Math.abs(this.y[i] - f.y) > f.r;
  }

  private wild(s: number): boolean {
    return isLandAnimal(this.species[s]);
  }

  /** Células ecológicas, prontas para uso (refeitas por inteiro quando chega uma espécie nova). */
  private ecoCells(): EcoCells {
    let c = this.cells;
    if (!c || c.n !== Math.ceil(this.map.width / ECO_CELL) * Math.ceil(this.map.height / ECO_CELL)) c = this.cells = new EcoCells(this.map.width, this.map.height);
    if (c.stride !== this.species.length) c.resize(this.species.length);
    if (!c.ready) {
      c.ready = true;
      for (let k = 0; k < c.n; k++) this.refreshCell(c, k);
      this.countWild(c);
      this.updateCapacity(c);
    }
    return c;
  }

  /** Fração do ano (0 começo da primavera … 1). */
  private yearPhase(): number {
    return this.year - Math.floor(this.year);
  }

  /**
   * Pasto que dá para comer no tile agora (0 a 1): a vegetação menos o que foi
   * pastado e ainda não rebrotou. A raiz (1 - GRAZE_MAX) não conta: um tile
   * rapado vale 0 e o bicho vai procurar outro.
   */
  forageAt(t: number): number {
    const veg = this.map.vegetation[t];
    if (veg <= 0 || !isLand(this.map, t)) return 0;
    const c = this.cells;
    const k = c ? this.cellOfTile(c, t) : -1;
    // Neve cobre o pasto: os bichos cavam, mas acham bem menos.
    const base = k >= 0 ? veg * c!.cover[k] : veg;
    const g = this.graze[t];
    if (g <= 0) return base;
    const regrow = k >= 0 ? c!.regrow[k] : REGROW_YEAR;
    return (base * Math.max(0, GRAZE_MAX - g * Math.exp(-regrow * (this.year - this.grazeAt[t])))) / GRAZE_MAX;
  }

  /** Célula ecológica de um tile. */
  private cellOfTile(c: EcoCells, t: number): number {
    const w = this.map.width;
    const x = t % w;
    return Math.floor((t - x) / w / ECO_CELL) * c.cols + Math.floor(x / ECO_CELL);
  }

  /**
   * Água no solo em relação ao normal do lugar (1 = ano normal; menos na seca, mais num ano de chuva),
   * de 0,4 a 1,3: multiplica a rebrota do pasto e do fruto e a colheita.
   */
  soilFactor(x: number, y: number): number {
    const wx = this.weather;
    if (!wx?.ready) return 1;
    const k = wx.of(x, y, this.map.width);
    return Math.max(0.4, Math.min(1.3, wx.soil[k] / Math.max(0.1, wx.base[k])));
  }

  /** O tempo agora no tile, para a ficha: temperatura da estação, chuva, neve e água no solo. */
  weatherAt(t: number): { temp: number; rain: number; snow: number; soil: number; wind: { x: number; y: number } } | null {
    const wx = this.weather;
    if (!wx?.ready) return null;
    const w = this.map.width;
    const x = t % w;
    const y = (t - x) / w;
    const k = wx.of(x, y, w);
    const temp = temperatureAt(this.map, t) + (wx.tempNow(k, this.yearPhase()) - wx.temp[k]);
    return { temp, rain: wx.rain[k], snow: wx.snow[k], soil: wx.soil[k], wind: windAt(y, this.map.height) };
  }

  /** Come até `need` unidades de pasto em volta do tile (a mancha cresce com o tamanho do bicho); devolve o que comeu. */
  private grazePatch(t: number, need: number): number {
    const m = this.map;
    const w = m.width;
    const x0 = t % w;
    const y0 = (t - x0) / w;
    const r = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(need / (0.25 * Math.PI)))));
    // A mancha é pequena perto da célula: a rebrota do centro vale para ela toda.
    const regrow = this.cells ? this.cells.regrow[this.cellOfTile(this.cells, t)] : REGROW_YEAR;
    const share = need / (Math.PI * r * r) + 0.02;
    let taken = 0;
    for (let oy = -r; oy <= r && taken < need; oy++) {
      const y = y0 + oy;
      if (y < 0 || y >= m.height) continue;
      for (let ox = -r; ox <= r && taken < need; ox++) {
        if (ox * ox + oy * oy > r * r) continue;
        const tt = y * w + ((x0 + ox + w) % w);
        const base = m.vegetation[tt];
        if (base <= 0.02 || !isLand(m, tt)) continue;
        const left = this.graze[tt] > 0 ? this.graze[tt] * Math.exp(-regrow * (this.year - this.grazeAt[tt])) : 0;
        // Raiz: o pastejo nunca passa de GRAZE_MAX do tile.
        const room = base * (GRAZE_MAX - left);
        if (room <= 0) continue;
        const take = Math.min(room, share, need - taken);
        this.graze[tt] = left + take / base;
        this.grazeAt[tt] = this.year;
        taken += take;
      }
    }
    return taken;
  }

  /** Insetos no tile (campo, não indivíduos): mais onde é verde, úmido e quente. */
  private insectsAt(t: number): number {
    const m = this.map;
    // Sobre a água rasa também há insetos (mosquitos, larvas): o sapo come na beira.
    if (!isLand(m, t)) return isWater(m, t) && m.elevation[t] > -0.2 ? 0.25 : 0;
    return m.vegetation[t] * (0.3 + 0.7 * m.moisture[t]) * (temperatureAt(m, t) > 278 ? 1 : 0.3);
  }

  /** Comida do mar raso e da beira d'água (peixinhos, krill, algas, restos) no tile. */
  private shoreAt(t: number): number {
    const m = this.map;
    if (isWater(m, t)) return m.elevation[t] > -0.2 ? 1 : 0.4;
    return this.nearWater(t) ? 0.7 : 0;
  }

  /** Quanto o tile alimenta a espécie, fora carne e carcaça (0 a 1). */
  private foodAt(e: Ecology, t: number): number {
    let f = 0;
    if (e.forage > 0) f = Math.max(f, e.forage * this.forageAt(t));
    if (e.fruit > 0) f = Math.max(f, e.fruit * this.browseAt(t));
    if (e.insects > 0) f = Math.max(f, e.insects * this.insectsAt(t));
    const water = Math.max(e.fish, e.plankton);
    if (water > 0) f = Math.max(f, water * this.shoreAt(t));
    return f;
  }

  /** Comida média da célula para a espécie (o "mapa de comida" que o bicho consulta). */
  private cellFood(c: EcoCells, e: Ecology, k: number): number {
    return Math.max(e.forage * c.forage[k], e.fruit * c.browse[k], e.insects * c.bugs[k], Math.max(e.fish, e.plankton) * c.shore[k]);
  }

  /** Ramagem e fruto que sobram na mata do tile agora (0 a 1): a estação menos o que a célula já comeu. */
  browseAt(t: number): number {
    const m = this.map;
    const w = woody(m.vegetation[t]);
    if (w <= 0 || !isLand(m, t)) return 0;
    const c = this.cells;
    if (!c) return browseOf(m.vegetation[t], temperatureAt(m, t), this.yearPhase());
    const k = this.cellOfTile(c, t);
    return w * c.bseason[k] * (1 - this.browseUsed(c, k));
  }

  /** Planta dominante do tile e se está com fruto (para a ficha do tile). */
  floraAt(t: number): Flora | null {
    const m = this.map;
    if (!isLand(m, t)) return null;
    return floraOf(m.biome[t] as Biome, m.vegetation[t], temperatureAt(m, t), this.yearPhase());
  }

  /** Parte da ramagem da célula que foi comida e ainda não rebrotou. */
  private browseUsed(c: EcoCells, k: number): number {
    const u = c.bused[k];
    return u > 0 ? u * Math.exp(-REGROW_YEAR * (this.year - c.busedAt[k])) : 0;
  }

  /** Come ramagem e fruto da célula: devolve quanto conseguiu (unidades de pasto). */
  private browseCell(c: EcoCells, k: number, need: number): number {
    const stock = c.wood[k] * GRAZE_MAX;
    if (stock <= 0) return 0;
    const used = this.browseUsed(c, k);
    const take = Math.min(need, stock * Math.max(0, GRAZE_MAX - used));
    c.bused[k] = used + take / stock;
    c.busedAt[k] = this.year;
    return take;
  }

  /** Quão bom o tile é para a espécie (nicho): bioma, temperatura, umidade e altitude. */
  private niche(s: number, e: Ecology, t: number, temp: number): number {
    if (!this.canStand(s, t)) return 0;
    const sp = this.species[s];
    if (temp < sp.tempMin || temp > sp.tempMax) return 0;
    const m = this.map;
    const margin = Math.min(temp - sp.tempMin, sp.tempMax - temp);
    const ft = Math.min(1, 0.35 + margin / 8);
    const fb = e.biomes[m.biome[t] as Biome] ?? e.open;
    const mo = m.moisture[t];
    const fm = mo >= e.moist[0] && mo <= e.moist[1] ? 1 : 0.35;
    const el = Math.max(0, m.elevation[t]);
    const fa = el >= e.alt[0] && el <= e.alt[1] ? 1 : 0.25;
    return fb * ft * fm * fa;
  }

  /** Refaz a comida e o nicho de uma célula. */
  private refreshCell(c: EcoCells, k: number): void {
    const m = this.map;
    const w = m.width;
    const x0 = (k % c.cols) * ECO_CELL;
    const y0 = Math.floor(k / c.cols) * ECO_CELL;
    let land = 0;
    let veg = 0;
    let avail = 0;
    let bugs = 0;
    let shore = 0;
    let wood = 0;
    const phase = this.yearPhase();
    // Amostra um tile a cada dois em cada eixo (64 de 256) e escala: o mesmo retrato da célula a um quarto do custo.
    for (let y = y0 + (k & 1); y < Math.min(m.height, y0 + ECO_CELL); y += 2) {
      for (let x = x0 + ((k >> 1) & 1); x < Math.min(w, x0 + ECO_CELL); x += 2) {
        const t = y * w + x;
        if (isWater(m, t)) {
          if (m.elevation[t] > -0.2) shore++;
          continue;
        }
        if (!isLand(m, t)) continue;
        land++;
        veg += m.vegetation[t];
        avail += this.forageAt(t);
        bugs += this.insectsAt(t);
        const v = m.vegetation[t];
        if (v > 0.25) wood += woody(v);
      }
    }
    land *= 4;
    veg *= 4;
    bugs *= 4;
    shore *= 4;
    avail *= 4;
    wood *= 4;
    c.land[k] = land;
    c.wood[k] = wood;
    // Clima vivo da célula: estação dos frutos pela temperatura de agora, rebrota pela água no solo, neve.
    const wx = this.weather;
    if (wx?.ready) {
      const T = wx.tempNow(k, phase);
      c.bseason[k] = browseOf(1, T, phase) / woody(1);
      c.regrow[k] = REGROW_YEAR * Math.max(0.4, Math.min(1.3, wx.soil[k] / Math.max(0.1, wx.base[k])));
      c.cover[k] = 1 - 0.4 * wx.snow[k];
    } else c.bseason[k] = browseOf(1, temperatureAt(m, Math.min(m.height - 1, y0 + 8) * w + ((x0 + 8) % w)), phase);
    c.browse[k] = land ? (wood / land) * c.bseason[k] * (1 - this.browseUsed(c, k)) : 0;
    c.forage[k] = land ? avail / land : 0;
    c.bugs[k] = land ? bugs / land : 0;
    // Costa: só conta onde há terra e mar raso juntos.
    const coast = land && shore ? Math.min(shore, land) : 0;
    c.shore[k] = coast / (ECO_CELL * ECO_CELL) * 4;
    // Rebrota sustentável: a parte pastada volta na taxa REGROW_YEAR; a capacidade usa só FORAGE_USE dela.
    c.fprod[k] = (veg * REGROW_YEAR * GRAZE_MAX * 0.5 * FORAGE_USE) / GRAZE_COST;
    // Ramagem e fruto: rebrota na mesma taxa, mas cada tile lenhoso rende menos que um de erva (BROWSE_YIELD).
    c.bprod[k] = (wood * REGROW_YEAR * GRAZE_MAX * 0.5 * FORAGE_USE * BROWSE_YIELD) / GRAZE_COST;
    c.iprod[k] = bugs * INSECT_YIELD;
    c.wprod[k] = coast * COAST_YIELD;
    // Nicho de cada espécie de terra, numa amostra de 16 tiles da célula. Muda devagar (clima e bioma):
    // refeito numa de cada quatro voltas, exceto na primeira.
    const S = c.stride;
    if (c.passes > 0 && (c.passes + k) % 4 !== 0) return;
    for (let s = 0; s < S; s++) c.suit[k * S + s] = 0;
    for (let sy = 2; sy < ECO_CELL; sy += 4) {
      const y = y0 + sy;
      if (y >= m.height) continue;
      for (let sx = 2; sx < ECO_CELL; sx += 4) {
        const t = y * w + ((x0 + sx) % w);
        const temp = temperatureAt(m, t);
        for (let s = 0; s < S; s++) if (this.wild(s)) c.suit[k * S + s] += this.niche(s, ecologyOf(this.species[s]), t, temp) / 16;
      }
    }
  }

  /** Conta os bichos de terra de cada espécie em cada célula. */
  private countWild(c: EcoCells): void {
    const hunter = this.species.map((sp, s) => this.wild(s) && hunts(ecologyOf(sp)));
    c.N.fill(0);
    c.hunters.fill(0);
    c.dens.fill(-1);
    c.herds.clear();
    c.herdKind.clear();
    const S = c.stride;
    const w = this.map.width;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || !this.wild(this.kind[i])) continue;
      const cell = c.of(this.x[i], this.y[i], w);
      const k = cell * S + this.kind[i];
      if (c.N[k] < 65535) c.N[k]++;
      if (hunter[this.kind[i]] && c.hunters[cell] < 65535) c.hunters[cell]++;
      // Centro do bando, com a volta do mapa (desvios a partir do primeiro membro visto).
      const h = c.herds.get(this.family[i]);
      if (h) {
        h[1] += wrapDx(this.x[i] - h[0], w);
        h[2] += this.y[i];
        h[3]++;
      } else {
        c.herds.set(this.family[i], [this.x[i], 0, this.y[i], 1]);
        c.herdKind.set(this.family[i], this.kind[i]);
      }
    }
  }

  /** Para onde fica o centro do bando do bicho (dx, dy), ou null se ele está sozinho no bando. */
  private herdCenter(i: number, c: EcoCells): { x: number; y: number } | null {
    const h = c.herds.get(this.family[i]);
    if (!h || h[3] < 2) return null;
    const w = this.map.width;
    return { x: wrapDx(h[0] + h[1] / h[3] - this.x[i], w), y: h[2] / h[3] - this.y[i] };
  }

  /**
   * Capacidade de suporte de cada espécie em cada célula: a produção de cada comida
   * (pasto, insetos, costa, presas, carcaças) dividida entre quem come aquilo, na
   * proporção do nicho, e dividida pela ração anual (massa^0,75). O total do planeta
   * fica dentro do orçamento de bichos de terra.
   */
  private updateCapacity(c: EcoCells): void {
    const S = c.stride;
    const eco = this.species.map((sp, s) => (this.wild(s) ? ecologyOf(sp) : null));
    // Caçador come pouco, mas mata mais do que come (sobra carcaça, caçadas perdidas): na conta da capacidade ele pesa quase como um herbívoro.
    const need = eco.map((e) => (e ? METABOLISM_YEAR * (hunts(e) ? 0.7 : 1) * ration(e) : 0));
    const clout = eco.map((e) => (e ? Math.sqrt(ration(e)) : 0));
    const preys = eco.map((e, s) => (e && !hunts(e) ? s : -1)).filter((s) => s >= 0);
    const hunters = eco.map((e, s) => (e && hunts(e) ? s : -1)).filter((s) => s >= 0);
    // Quem cada caçador consegue pegar (pelo tamanho; em bando, presas maiores).
    const eats = hunters.map((q) => {
      const e = eco[q]!;
      const limit = e.maxPrey * (e.pack ? 2 : 1);
      return preys.map((p) => eco[p]!.mass <= limit && eco[p]!.mass >= e.mass * 0.015);
    });
    // Ração das presas em cada célula (para o mapa de caça).
    for (let k = 0; k < c.n; k++) {
      let p = 0;
      for (const s of preys) p += c.N[k * S + s] * need[s];
      c.prey[k] = p;
    }
    const wants = (e: Ecology) => [e.forage, e.insects, Math.max(e.fish, e.plankton), e.carrion, e.fruit];
    const total = new Array(S).fill(0);
    const K = new Float32Array(S);
    const preyHere = new Float32Array(S);
    let all = 0;
    for (let k = 0; k < c.n; k++) {
      // Presas da vizinhança (o predador anda mais que uma célula), por espécie.
      const cx = k % c.cols;
      const cy = (k - cx) / c.cols;
      preyHere.fill(0);
      for (let oy = -1; oy <= 1; oy++) {
        const y = cy + oy;
        if (y < 0 || y >= c.rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const q = y * c.cols + ((cx + ox + c.cols) % c.cols);
          for (const s of preys) preyHere[s] += c.N[q * S + s] / 9;
        }
      }
      let carrion = 0;
      for (const s of preys) carrion += preyHere[s] * need[s] * CARRION_RATIO;
      const res = [c.fprod[k], c.iprod[k], c.wprod[k], carrion, c.bprod[k]];
      // Parte de cada um: nicho × peso na dieta × porte (bicho grande disputa melhor o pasto).
      const D = [0, 0, 0, 0, 0];
      for (let s = 0; s < S; s++) {
        if (!eco[s]) continue;
        const u = c.suit[k * S + s] * clout[s];
        const wv = wants(eco[s]!);
        for (let r = 0; r < 5; r++) D[r] += u * wv[r];
      }
      K.fill(0);
      for (let s = 0; s < S; s++) {
        if (!eco[s]) continue;
        const u = c.suit[k * S + s];
        if (u <= 0.02) continue;
        const wv = wants(eco[s]!);
        // A parte de cada comida rende na proporção do peso dela na dieta (como na hora de comer).
        for (let r = 0; r < 5; r++) if (D[r] > 0) K[s] += (res[r] * u * clout[s] * wv[r] * Math.min(1, wv[r])) / D[r];
      }
      // Carne: cada espécie de presa alimenta os caçadores que conseguem pegá-la, divididos pelo nicho e porte.
      for (let pi = 0; pi < preys.length; pi++) {
        const p = preys[pi];
        if (preyHere[p] <= 0) continue;
        let d = 0;
        for (let h = 0; h < hunters.length; h++) if (eats[h][pi]) d += c.suit[k * S + hunters[h]] * clout[hunters[h]] * eco[hunters[h]]!.meat;
        if (d <= 0) continue;
        const meat = preyHere[p] * need[p] * PREDATOR_RATIO;
        for (let h = 0; h < hunters.length; h++) {
          const q = hunters[h];
          if (eats[h][pi]) K[q] += (meat * c.suit[k * S + q] * clout[q] * eco[q]!.meat * Math.min(1, eco[q]!.meat)) / d;
        }
      }
      for (let s = 0; s < S; s++) {
        if (!eco[s]) continue;
        // Nicho ruim rende menos mesmo sem concorrente.
        const v = (Math.sqrt(c.suit[k * S + s]) * K[s]) / need[s];
        c.K[k * S + s] = v;
        total[s] += v;
        all += v;
      }
    }
    // Orçamento de entidades: o planeta inteiro não passa de LAND_BUDGET bichos de terra (na proporção da raiz da área).
    // Raiz da área: planetas pequenos ficam um pouco mais cheios, para caber uma teia inteira.
    const budget = LAND_BUDGET * Math.sqrt((this.map.width * this.map.height) / (1024 * 512));
    const scale = all > budget ? budget / all : 1;
    if (scale < 1) for (let j = 0; j < c.K.length; j++) c.K[j] *= scale;
    c.dens.fill(-1);
    for (let s = 0; s < S; s++) {
      c.total[s] = total[s] * scale;
      // O teto global vira só uma rede de segurança, bem acima da soma das capacidades locais.
      if (eco[s]) this.caps[s] = Math.max(MIN_WILD, Math.ceil(c.total[s] * 1.6));
    }
  }

  /**
   * Relógio da fauna de terra: refaz uma fatia das células a cada passo (todas em
   * um ano: pasto e clima mudam devagar), recontas e capacidades a cada oitavo de ano, e o
   * apodrecer das carcaças e o esquecer do medo.
   */
  private updateWildlife(yr: number): void {
    if (!this.species.some((_, s) => this.wild(s))) return;
    const c = this.ecoCells();
    let slice = Math.ceil(c.n * yr);
    while (slice-- > 0) {
      this.refreshCell(c, c.cursor);
      c.cursor = (c.cursor + 1) % c.n;
      if (c.cursor === 0) c.passes++;
    }
    this.wildClock += yr;
    if (this.wildClock < 1 / 8) return;
    const span = this.wildClock;
    this.wildClock = 0;
    this.countWild(c);
    // A capacidade (a conta mais cara) é refeita a cada quarto de ano; a contagem, a cada oitavo.
    if ((c.recounts = (c.recounts + 1) % 2) === 0) this.updateCapacity(c);
    const fade = Math.exp(-FEAR_DECAY_YEAR * span);
    for (let k = 0; k < this.fear.length; k++) this.fear[k] *= fade;
    // Carcaças apodrecem; o que sobra aduba o chão (o pasto em volta rebrota na hora).
    for (let k = this.carcasses.length - 1; k >= 0; k--) {
      const cc = this.carcasses[k];
      cc.kg *= Math.exp(-span / CARCASS_YEARS);
      if (this.year - cc.at < CARCASS_YEARS && cc.kg > 0.3) continue;
      const t = this.tileAt(cc.x, Math.floor(cc.y));
      if (t >= 0 && isLand(this.map, t)) {
        this.graze[t] = 0;
        const cap = vegetationCap(this.map, t);
        if (this.map.vegetation[t] < cap) this.map.vegetation[t] = Math.min(cap, this.map.vegetation[t] + 0.04);
      }
      this.carcasses.splice(k, 1);
    }
  }

  /** O bicho morto vira carcaça no lugar. */
  private leaveCarcass(i: number, kg = ecologyOf(this.species[this.kind[i]]).mass * EDIBLE): void {
    if (kg < 0.3) return;
    if (this.carcasses.length >= MAX_CARCASSES) this.carcasses.shift();
    this.carcasses.push({ x: this.x[i], y: this.y[i], kg, at: this.year, sp: this.kind[i] });
  }

  /** Carcaça mais perto a até `radius` tiles (com carne), ou -1. */
  private carcassNear(x: number, y: number, radius: number): number {
    const w = this.map.width;
    let best = -1;
    let bd = radius * radius;
    for (let k = 0; k < this.carcasses.length; k++) {
      const cc = this.carcasses[k];
      const dy = cc.y - y;
      if (dy * dy >= bd || cc.kg < 0.3) continue;
      const dx = wrapDx(cc.x - x, w);
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    return best;
  }

  /** Come da carcaça até saciar; devolve a energia ganha. */
  private eatCarcass(i: number, k: number, e: Ecology): number {
    const cc = this.carcasses[k];
    const tank = TANK_KG * metabolic(e);
    const want = Math.max(0, SATED - this.energy[i]) * tank;
    const take = Math.min(want, cc.kg);
    cc.kg -= take;
    return take / tank;
  }

  /**
   * Velocidade de viagem (tiles por segundo de simulação): a área de vida por ano dividida pela duração
   * do ano, mas nunca acima do passo da espécie na tela (senão no x1 o bicho atravessa o mapa correndo).
   */
  private pace(e: Ecology, sp: Species): number {
    return Math.min(sp.speed * ANIMAL_PACE, e.roam / this.yearSpan);
  }

  /** Anda reto até (dx, dy) de distância; chega sem passar do ponto na próxima decisão. */
  private headTo(i: number, dx: number, dy: number, speed: number): void {
    const d = Math.hypot(dx, dy);
    if (d < 0.25) {
      this.vx[i] = 0;
      this.vy[i] = 0;
      return;
    }
    // Um pouco de ruído na direção (o "wander" de Reynolds), sem virar passeio aleatório.
    const a = Math.atan2(dy, dx) + (this.rnd() - 0.5) * 0.3;
    // Fora da tela a próxima decisão demora `stride` vezes mais: anda mais devagar para não passar do ponto.
    const go = Math.min(speed, d / ((this.yearSpan / DECISIONS_PER_YEAR) * this.stride));
    this.vx[i] = Math.cos(a) * go;
    this.vy[i] = Math.sin(a) * go;
    this.aimX[i] = dx;
    this.aimY[i] = dy;
  }

  private headToTile(i: number, t: number, speed: number): void {
    const w = this.map.width;
    this.headTo(i, wrapDx((t % w) + 0.5 - this.x[i], w), Math.floor(t / w) + 0.5 - this.y[i], speed);
  }

  private stop(i: number): void {
    this.vx[i] = 0;
    this.vy[i] = 0;
  }

  /**
   * Melhor mancha de comida ao alcance: consulta o mapa de comida das células em
   * volta (mais longe quanto mais fome), escolhe pela comida menos o custo da
   * distância e do medo, e sorteia alguns tiles dentro dela. Devolve o tile ou -1.
   */
  private findFood(i: number, e: Ecology, c: EcoCells, reach: number): number {
    const m = this.map;
    const w = m.width;
    const s = this.kind[i];
    const S = c.stride;
    const here = c.of(this.x[i], this.y[i], w);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    let best = -1;
    let bestScore = 0;
    for (let oy = -reach; oy <= reach; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -reach; ox <= reach; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        if (c.suit[k * S + s] <= 0.02) continue;
        const food = this.cellFood(c, e, k);
        if (food < FOOD_MIN) continue;
        const score = food * (1 - Math.min(0.8, this.fear[k] * 0.3 * e.fear)) - Math.hypot(ox, oy) * 0.06;
        if (score > bestScore) {
          bestScore = score;
          best = k;
        }
      }
    }
    if (best < 0) return -1;
    const x0 = (best % c.cols) * ECO_CELL;
    const y0 = Math.floor(best / c.cols) * ECO_CELL;
    const sp = this.species[s];
    let tile = -1;
    let bestFood = FOOD_MIN;
    for (let k = 0; k < 10; k++) {
      const t = this.tileAt(x0 + Math.floor(this.rnd() * ECO_CELL), Math.min(m.height - 1, y0 + Math.floor(this.rnd() * ECO_CELL)));
      if (t < 0 || !this.canStand(s, t)) continue;
      const temp = temperatureAt(m, t);
      if (temp < sp.tempMin || temp > sp.tempMax) continue;
      const f = this.foodAt(e, t);
      if (f > bestFood) {
        bestFood = f;
        tile = t;
      }
    }
    return tile;
  }

  /** Tile com comida mais perto, olhando em anéis até `radius` tiles (onde o bicho pode ficar e no seu clima). */
  private nearFood(i: number, e: Ecology, radius: number, min = FOOD_MIN): number {
    const s = this.kind[i];
    const sp = this.species[s];
    for (let r = 1; r <= radius; r++) {
      let best = -1;
      let bestFood = min;
      const n = Math.max(8, Math.round(r * 5));
      const a0 = this.rnd() * Math.PI * 2;
      for (let k = 0; k < n; k++) {
        const a = a0 + (k / n) * Math.PI * 2;
        const t = this.tileAt(this.x[i] + Math.cos(a) * r, Math.floor(this.y[i] + Math.sin(a) * r));
        if (t < 0 || !this.canStand(s, t)) continue;
        const f = this.foodAt(e, t);
        if (f <= bestFood) continue;
        const temp = temperatureAt(this.map, t);
        if (temp < sp.tempMin || temp > sp.tempMax || !this.reachable(i, Math.cos(a), Math.sin(a), r)) continue;
        bestFood = f;
        best = t;
      }
      if (best >= 0) return best;
      if (r >= 3) r++;
    }
    return -1;
  }

  /** Dá para andar em linha reta `dist` tiles na direção (dx, dy) sem penhasco nem água no caminho? */
  private reachable(i: number, dx: number, dy: number, dist: number): boolean {
    const s = this.kind[i];
    let from = this.tileOf(i);
    for (let d = 1; d <= Math.ceil(dist); d++) {
      const t = this.tileAt(this.x[i] + dx * Math.min(d, dist), Math.floor(this.y[i] + dy * Math.min(d, dist)));
      if (t < 0 || !this.canStep(s, from, t)) return false;
      from = t;
    }
    return true;
  }

  /** Há comida da dieta (fora carne) a até `radius` tiles? Para medir a fome evitável. */
  private foodWithin(e: Ecology, x: number, y: number, radius: number): boolean {
    for (let oy = -radius; oy <= radius; oy += 2) {
      for (let ox = -radius; ox <= radius; ox += 2) {
        const t = this.tileAt(x + ox, Math.floor(y + oy));
        if (t >= 0 && this.foodAt(e, t) >= 0.3) return true;
      }
    }
    return false;
  }

  /** Predador que está caçando este bicho (ou com fome e colado nele), a até a distância de alerta. */
  private threatTo(i: number, e: Ecology): number {
    // A presa só percebe o caçador de perto (ele chega de tocaia).
    const radius = 2 + 4 * e.fear;
    const s = this.kind[i];
    if (hunts(e) || !this.huntersAround(this.x[i], this.y[i], radius)) return -1;
    let best = -1;
    let bd = Infinity;
    this.forEachNear(this.x[i], this.y[i], radius, (j, dx, dy) => {
      const k = this.kind[j];
      if (k === s || !this.wild(k)) return;
      const pe = ecologyOf(this.species[k]);
      if (!hunts(pe) || hunts(e) || e.mass > pe.maxPrey * (pe.pack ? 3 : 1)) return;
      const d = dx * dx + dy * dy;
      // Predador saciado não assusta; o que está caçando, sim (e o faminto colado também).
      const hunting = this.act[j] === ACT.hunt && (this.chase[j] === i || d < 9);
      if (!hunting && !(this.energy[j] < HUNGRY && d < 4)) return;
      if (d < bd) {
        bd = d;
        best = j;
      }
    });
    return best;
  }

  /**
   * Escolhe a presa (resposta funcional tipo III de Holling): dieta e tamanho
   * possíveis, a espécie mais abundante por perto pesa mais (a rara é atacada
   * menos, mas continua visível), e filhote, velho ou doente pesa mais.
   */
  private pickPrey(i: number, e: Ecology, helpers: number): number {
    const s = this.kind[i];
    const limit = e.maxPrey * (e.pack ? Math.min(3, 1 + helpers * 0.5) : 1);
    const min = e.mass * 0.015;
    const sight = Math.min(36, 8 + e.range);
    const escaped = this.goal[i];
    if (PREY_SEEN.length < this.species.length) PREY_SEEN = new Uint16Array(this.species.length * 2);
    const seen = PREY_SEEN;
    seen.fill(0);
    const cand = PREY_CAND;
    let n = 0;
    this.forEachNear(this.x[i], this.y[i], sight, (j, dx, dy) => {
      const k = this.kind[j];
      if (k === s || j === escaped || n >= cand.length / 3) return;
      const kk = this.species[k].kind;
      if (kk === 'fish') {
        // Peixe só na beira d'água (ou para os anfíbios, como o crocodilo).
        if (e.fish <= 0 || (dx * dx + dy * dy > 9 && !this.species[s].amphibious)) return;
      } else if (!this.wild(k)) return;
      const pe = ecologyOf(this.species[k]);
      // Filhote de bicho grande é presa possível (leões pegam elefantes jovens).
      const mass = this.age[j] < this.species[k].maturity ? pe.mass * 0.3 : pe.mass;
      if (hunts(pe) || mass > limit || mass < min) return;
      seen[k]++;
      cand[n * 3] = j;
      cand[n * 3 + 1] = dx;
      cand[n * 3 + 2] = dy;
      n++;
    });
    const tank = TANK_KG * metabolic(e);
    // A melhor presa que dá para alcançar por terra (do outro lado do rio não serve); até três tentativas.
    for (let tries = 0; tries < 3; tries++) {
      let best = -1;
      let bestScore = 0;
      for (let c = 0; c < n; c++) {
        const j = cand[c * 3];
        if (j < 0) continue;
        const k = this.kind[j];
        const pe = ecologyOf(this.species[k]);
        const a = seen[k] * seen[k];
        const abundance = a / (a + 4);
        const meal = Math.min(1.5, (pe.mass * EDIBLE) / tank);
        const score = (abundance * meal * this.vulnerable(j)) / (Math.hypot(cand[c * 3 + 1], cand[c * 3 + 2]) + 4);
        if (score > bestScore) {
          bestScore = score;
          best = c;
          this.preyAbundance = abundance;
        }
      }
      if (best < 0) return -1;
      const dx = cand[best * 3 + 1];
      const dy = cand[best * 3 + 2];
      const d = Math.hypot(dx, dy);
      if (d < 1 || this.reachable(i, dx / d, dy / d, d)) return cand[best * 3];
      cand[best * 3] = -1;
    }
    return -1;
  }

  /** Quão fácil é pegar o bicho: filhote, velho e com parasitas, mais; pequeno no refúgio, menos. */
  private vulnerable(j: number): number {
    const sp = this.species[this.kind[j]];
    let v = 1;
    if (this.age[j] < sp.maturity) v *= 1.6;
    else if (this.age[j] > sp.maxAge * 0.8) v *= 1.4;
    v *= 1 + this.parasite[j];
    const pe = ecologyOf(sp);
    if (pe.mass < 30 && REFUGES.has(this.map.biome[this.tileOf(j)])) v *= 1 - REFUGE;
    return v;
  }

  /** Conspecíficos adultos a até `radius` tiles e a direção do mais perto. */
  private kin(i: number, radius: number): { n: number; dx: number; dy: number; d: number } {
    const s = this.kind[i];
    const mature = this.species[s].maturity;
    const out = KIN;
    out.n = 0;
    out.d = Infinity;
    out.dx = 0;
    out.dy = 0;
    this.forEachNear(this.x[i], this.y[i], radius, (j, dx, dy) => {
      if (j === i || this.kind[j] !== s) return;
      if (this.age[j] >= mature) out.n++;
      const d = Math.hypot(dx, dy);
      if (d < out.d) {
        out.d = d;
        out.dx = dx;
        out.dy = dy;
      }
    });
    return out;
  }

  /**
   * Decisão de um bicho de terra, uma vez a cada 1/DECISIONS_PER_YEAR de ano.
   * Portões fixos primeiro (fugir de quem caça, comer com fome crítica); depois a
   * IAUS: cada ação recebe uma nota (produto de curvas), a atual ganha inércia e
   * vence a maior. Tudo por ano: a mesma coisa acontece com o ano de 6 s ou de 12 s.
   */
  private decideAnimal(i: number, yr: number): void {
    // Quantas decisões normais esta vale (3 longe da tela): o que é por decisão rende na mesma proporção.
    this.lodStride = yr * DECISIONS_PER_YEAR;
    const map = this.map;
    const s = this.kind[i];
    const sp = this.species[s];
    const e = ecologyOf(sp);
    const c = this.ecoCells();
    const tile = this.tileOf(i);
    const temp = temperatureAt(map, tile);
    const phase = this.yearPhase();
    const p = this.parasite[i];
    const cell = c.of(this.x[i], this.y[i], map.width);

    // Inverno: quem hiberna dorme e gasta pouco.
    const sleeping = e.hibernate && phase > 0.75 && this.energy[i] > STARVING;
    // População relicta (poucos no planeta inteiro) vive nos melhores cantos e gasta menos: o piso contra a extinção.
    const relict = this.population[s] < RELICT ? 0.3 : this.population[s] < RELICT * 1.5 ? 0.6 : 1;
    let en = this.energy[i] - METABOLISM_YEAR * appetite(e) * yr * (sleeping ? 0.3 : 1) * (1 + 0.5 * p) * relict;
    const cold = temp < sp.tempMin;
    const hot = temp > sp.tempMax;
    if (cold || hot) en -= THERMAL_YEAR * yr;
    if (!this.canStand(s, tile)) en -= 6 * yr;
    // Sede: sem água por perto (lago, rio, costa, chuva recente ou neve) o bicho gasta mais e vai beber.
    const thirsty = this.thirsty(e, cell);
    if (thirsty) en -= METABOLISM_YEAR * THIRST_COST * yr;

    // Parasitas: pega mais onde a célula está lotada; cura comendo bem.
    const dens = this.crowding(c, cell, s, e.herd);
    if (happens(this.rnd, PARASITE_RATE * Math.min(2, dens), yr)) this.parasite[i] = Math.min(1, p + 0.25);
    else if (p > 0) this.parasite[i] = Math.max(0, p - PARASITE_RECOVERY * yr * (en > 0.6 ? 1 : 0.3));

    // Morte: velhice, frio, calor, doença ou fome (cada uma com a sua causa).
    const old = this.age[i] > sp.maxAge * (0.85 + (0.3 * ((i * 2654435761) % 1000)) / 1000);
    if (en <= 0 || old) {
      const cause: DeathCause = en > 0 ? 'velhice' : cold ? 'frio' : hot ? 'calor' : p > 0.7 ? 'doença' : 'fome';
      if (cause === 'fome' && !hunts(e) && e.carrion < 0.5) {
        this.tally.wildStarved++;
        if (this.foodWithin(e, this.x[i], this.y[i], 8)) this.tally.wildStarvedNearFood++;
      }
      this.leaveCarcass(i);
      this.kill(i, false, cause);
      return;
    }
    this.energy[i] = Math.min(1, en);
    const speed = this.pace(e, sp) * (1 - 0.3 * p);

    // Portão 1: perigo real. Foge para longe do predador, mais rápido que o normal.
    const threat = e.fear > 0 ? this.threatTo(i, e) : -1;
    if (threat >= 0) {
      const dx = wrapDx(this.x[i] - this.x[threat], map.width);
      const dy = this.y[i] - this.y[threat];
      this.act[i] = ACT.flee;
      this.goal[i] = -1;
      this.headTo(i, dx * 4, dy * 4, speed * 1.6);
      return;
    }
    if (sleeping) {
      this.act[i] = ACT.hibernate;
      this.stop(i);
      return;
    }

    // Notas da IAUS (0 a 1). Fome: 0 saciado, 1 morrendo.
    const hunger = Math.max(0, Math.min(1, (SATED - en) / (SATED - STARVING)));
    const plants = e.forage > 0 || e.fruit > 0 || e.insects > 0 || e.fish > 0 || e.plankton > 0;
    const foodHere = plants ? this.foodAt(e, tile) : 0;
    // Come com fome e continua até saciar (com folga de meia mordida, para não beliscar sem parar).
    const want = en < HUNGRY ? 0.5 + 0.5 * hunger : en < SATED - BITE / 2 && this.act[i] === ACT.eat ? 0.45 : 0;
    const fearHere = 1 - Math.min(0.8, this.fear[cell] * 0.3 * e.fear);
    let best: number = ACT.rest;
    let top = 0.2 + (this.act[i] === ACT.rest ? 0.1 : 0);
    const consider = (act: number, score: number) => {
      const v = score + (this.act[i] === act ? 0.1 : 0) + this.rnd() * 0.03;
      if (v > top) {
        top = v;
        best = act;
      }
    };
    if (plants) consider(ACT.eat, want * (foodHere >= FOOD_MIN ? 1 : 0.8) * fearHere * Math.max(e.forage, e.fruit, e.insects, e.fish, e.plankton));
    // Predador só caça com fome (abaixo de HUNGRY - 0,1).
    // Quem também come planta ou inseto (raposa, urso) prefere isso a uma caçada sem presa à vista.
    if (hunts(e) && en < HUNGRY) consider(ACT.hunt, (0.55 + 0.45 * hunger) * e.meat * (this.chase[i] >= 0 || !plants ? 1 : 0.6));
    let carcass = -1;
    // Necrófagos enxergam carcaças longe; caçadores voltam à carne da caça que está perto.
    // Como no pasto: começa com fome e segue até saciar, sem beliscar a carcaça de barriga cheia.
    const meat = en < HUNGRY ? 0.5 + 0.5 * hunger : en < SATED - BITE / 2 && this.act[i] === ACT.scavenge ? 0.45 : 0;
    if ((e.carrion > 0 || hunts(e)) && meat > 0) {
      // O urubu, planando, enxerga longe.
      carcass = this.carcassNear(this.x[i], this.y[i], e.carrion > 0 ? (e.carrion >= 0.8 && !hunts(e) && !plants ? 90 : Math.min(40, 8 + e.range * 1.5)) : 6);
      if (carcass >= 0) consider(ACT.scavenge, meat * Math.max(e.carrion, hunts(e) ? 0.8 : 0));
      // Necrófago sem carcaça à vista sai rondando (o urubu plana procurando).
      else if (e.carrion >= 0.8 && !plants && !hunts(e) && en < HUNGRY) consider(ACT.scavenge, 0.5 + 0.4 * hunger);
    }
    // Fome crítica: comida passa por cima de tudo que não é fuga (portão 2).
    const starving = en < STARVING;
    if (!starving) {
      const gap = Math.max(0, sp.tempMin + 2 - temp, temp - (sp.tempMax - 2));
      if (gap > 0) consider(ACT.shelter, Math.min(1, gap / 6) * 0.9 + (cold || hot ? 0.3 : 0));
      if (thirsty) consider(ACT.drink, 0.5);
      const season = !e.seasonal || (phase >= BREED_START && phase < BREED_START + BREED_LENGTH);
      const adult = this.age[i] >= sp.maturity;
      if (season && adult && en > (hunts(e) ? 0.42 : 0.6) && dens < 1) consider(ACT.mate, 0.35);
      // Dispersão: o jovem que amadurece numa célula lotada sai procurando lugar.
      // (Só de vez em quando procura o destino; achado, segue nele até chegar.)
      // Bando grande demais também se divide: os jovens adultos saem.
      const going = this.act[i] === ACT.disperse && this.goal[i] >= 0;
      const young = this.age[i] < sp.maturity * 1.4;
      const big = young && (c.herds.get(this.family[i])?.[3] ?? 0) > e.herd * 1.5;
      if (adult && (going || this.rnd() < 0.15 * this.lodStride) && (dens > 1.2 || big || (young && dens > 0.8))) consider(ACT.disperse, 0.3 + 0.3 * Math.min(1, Math.max(0.3, dens - 0.8)));
      // Bando: quem ficou longe do centro do seu bando volta para perto; sozinho e adulto, procura parceiro.
      const center = e.herd > 1 ? this.herdCenter(i, c) : null;
      const away = center ? Math.hypot(center.x, center.y) : 0;
      if (center && away > 4 + e.herd * 0.5) consider(ACT.herd, Math.min(0.6, 0.35 + away / 100));
      else if (!center && adult && en > 0.5 && this.kin(i, 8).n === 0) consider(ACT.mate, 0.33);
    } else if (best === ACT.rest) best = plants ? ACT.eat : hunts(e) ? ACT.hunt : ACT.scavenge;

    this.act[i] = best;
    switch (best) {
      case ACT.eat: {
        if (foodHere >= FOOD_MIN) {
          this.stop(i);
          this.goal[i] = -1;
          // Mancha rendendo pouco (valor marginal de Charnov): já escolhe uma melhor por perto para a próxima.
          if (this.eatHere(i, e, tile, en) < BITE * 0.35) this.goal[i] = this.nearFood(i, e, Math.min(10, 2 + e.roam / 30), foodHere * 1.5);
          if (this.goal[i] >= 0) this.headToTile(i, this.goal[i], speed);
          break;
        }
        let goal = this.goal[i];
        // Destino que não chega nunca (penhasco, água no meio): larga e procura outro.
        if (goal >= 0 && ++this.effort[i] > GOAL_TRIES) {
          this.effort[i] = 0;
          this.goal[i] = -1;
          this.roam(i, speed);
          break;
        }
        if (goal < 0 || this.foodAt(e, goal) < FOOD_MIN) {
          this.effort[i] = 0;
          // Primeiro a vizinhança (o que dá para ver); depois o mapa de comida das células, até onde
          // o bicho anda em uns dois meses (mais longe com fome crítica).
          goal = this.nearFood(i, e, Math.min(10, 2 + e.roam / 30));
          const reach = Math.max(1, Math.min(4, Math.round((e.roam * (starving ? 0.25 : 0.15)) / ECO_CELL)));
          if (goal < 0) goal = this.findFood(i, e, c, reach);
        }
        this.goal[i] = goal;
        if (goal >= 0) this.headToTile(i, goal, speed);
        else this.roam(i, speed);
        break;
      }
      case ACT.hunt:
        this.hunt(i, e, c, speed);
        break;
      case ACT.scavenge: {
        if (carcass < 0) {
          this.roam(i, speed);
          break;
        }
        const cc = this.carcasses[carcass];
        const dx = wrapDx(cc.x - this.x[i], map.width);
        const dy = cc.y - this.y[i];
        if (dx * dx + dy * dy < 1.5) {
          this.stop(i);
          this.energy[i] = Math.min(1, this.energy[i] + this.eatCarcass(i, carcass, e));
        } else this.headTo(i, dx, dy, speed);
        break;
      }
      case ACT.drink: {
        // Vai até a célula com água mais perto; os bichos se juntam nos bebedouros na seca.
        const to = this.waterCell(i, c);
        if (to) this.headTo(i, to.x, to.y, speed);
        else this.roam(i, speed);
        break;
      }
      case ACT.shelter: {
        const dir = this.comfortBias(i, temp);
        if (dir) this.headTo(i, dir.x * 8, dir.y * 8, speed);
        else this.roam(i, speed);
        break;
      }
      case ACT.mate: {
        // Vai até o adulto mais perto; com um já ao lado, fica; sem ninguém à vista, explora.
        const dir = this.seekMate(i);
        if (dir) this.headTo(i, dir.x, dir.y, speed);
        else if (this.kin(i, 3).n) this.stop(i);
        else {
          // Ninguém à vista: vai para a célula vizinha com mais bichos da espécie (o cheiro, o chamado).
          // Predador com território não vai atrás de outro bando (juntaria todos num lugar só), a não ser que a espécie esteja rara.
          const cell2 = appetite(e) < 1 && this.population[this.kind[i]] > RELICT * 3 ? -1 : this.crowdedCell(i, c);
          if (cell2 >= 0) this.headTo(i, wrapDx((cell2 % c.cols) * ECO_CELL + 8 - this.x[i], map.width), Math.floor(cell2 / c.cols) * ECO_CELL + 8 - this.y[i], speed);
          else this.roam(i, speed);
        }
        break;
      }
      case ACT.disperse: {
        let goal = this.goal[i];
        if (goal < 0) {
          goal = this.goal[i] = this.emptierCell(i, c);
          // Quem sai para um lugar novo começa um bando novo (fissão).
          if (goal >= 0) this.family[i] = ++this.nextFamily;
        }
        if (goal >= 0 && c.of((goal % map.width) + 0.5, Math.floor(goal / map.width) + 0.5, map.width) === cell) goal = this.goal[i] = -1;
        if (goal >= 0) this.headToTile(i, goal, speed);
        else {
          // Nenhum lugar menos lotado por perto: fica.
          this.act[i] = ACT.rest;
          this.loiter(i, speed);
        }
        break;
      }
      case ACT.herd: {
        const center = this.herdCenter(i, c);
        if (center) this.headTo(i, center.x, center.y, speed);
        else this.loiter(i, speed);
        break;
      }
      default:
        this.goal[i] = -1;
        this.loiter(i, speed);
    }
    this.breed(i, e, c, cell, dens, yr);
  }

  /** Come no lugar: pasto (some do tile e rebrota), insetos ou comida da costa. Devolve a energia ganha. */
  private eatHere(i: number, e: Ecology, t: number, en: number): number {
    const gain = Math.min(BITE * this.lodStride, SATED - en);
    if (gain <= 0) return 0;
    const field = Math.max(e.insects * this.insectsAt(t), Math.max(e.fish, e.plankton) * this.shoreAt(t));
    const grass = e.forage * this.forageAt(t);
    const browse = e.fruit * this.browseAt(t);
    let got: number;
    // O peso da comida na dieta diz quanto ela rende (a raposa vive mal só de frutos e insetos).
    if (field >= grass && field >= browse) got = gain * Math.min(1, field / 0.4);
    else if (browse > grass && this.cells) {
      // Ramagem e fruto: sai da célula (a mata inteira em volta), não do tile.
      const cost = GRAZE_COST * ration(e);
      const c = this.cells;
      got = (this.browseCell(c, c.of(this.x[i], this.y[i], this.map.width), gain * cost) / cost) * e.fruit;
    } else {
      const cost = GRAZE_COST * ration(e);
      got = (this.grazePatch(t, gain * cost) / cost) * e.forage;
      // Engenheiro (elefante): às vezes derruba uma árvore e abre clareira.
      if (e.engineer && this.map.vegetation[t] > B.TREE_BAND && this.rnd() < 0.08 * this.lodStride) {
        this.map.vegetation[t] = Math.max(B.TREE_BAND - 0.1, this.map.vegetation[t] - 0.15);
        this.map.biome[t] = classify(this.map, t);
        this.onTileChanged(t);
      }
    }
    this.energy[i] = Math.min(1, this.energy[i] + got);
    return got;
  }

  /** Caça: segue a presa escolhida e dá o bote quando chega perto; sem presa à vista, vai para onde há mais caça. */
  private hunt(i: number, e: Ecology, c: EcoCells, speed: number): void {
    const map = this.map;
    const w = map.width;
    const helpers = e.pack ? Math.min(4, this.kin(i, 6).n) : 0;
    let prey = this.chase[i];
    if (prey >= 0 && (!this.alive[prey] || this.kind[prey] === this.kind[i])) prey = -1;
    if (prey >= 0) {
      const dx = wrapDx(this.x[prey] - this.x[i], w);
      const dy = this.y[prey] - this.y[i];
      // Longe demais ou perseguição comprida: desiste (e descansa um pouco antes de tentar outra).
      if (dx * dx + dy * dy > 30 * 30 || ++this.effort[i] > CHASE_LIMIT) {
        this.chase[i] = -1;
        this.effort[i] = 0;
        // Guarda a presa que escapou para não voltar logo atrás dela.
        this.goal[i] = prey;
        this.stop(i);
        return;
      }
    }
    if (prey < 0) {
      prey = this.pickPrey(i, e, helpers);
      // Fôlego da perseguição: o tempo de chegar até a presa (no passo de corrida, em decisões rápidas) e mais CHASE_TRIES.
      const d = prey >= 0 ? Math.hypot(wrapDx(this.x[prey] - this.x[i], w), this.y[prey] - this.y[i]) : 0;
      const step = speed * 1.8 * (this.yearSpan / DECISIONS_PER_YEAR / 3);
      this.effort[i] = Math.max(0, CHASE_LIMIT - CHASE_TRIES - Math.ceil(d / Math.max(0.05, step)));
    }
    this.chase[i] = prey;
    if (prey < 0) {
      // Sem presa à vista: vai para a célula próxima onde há mais caça, sem ficar rodando num lugar vazio.
      const here = c.of(this.x[i], this.y[i], w);
      const S = c.stride;
      const s = this.kind[i];
      const cx = here % c.cols;
      const cy = (here - cx) / c.cols;
      // Capacidade dele ali (que conta só as presas do seu tamanho), dividida pelos da espécie que já
      // caçam ali: senão todos correm para a mesma célula e ficam num lugar já vazio.
      let best = here;
      let most = (c.K[here * S + s] / Math.max(1, c.N[here * S + s])) * 1.2;
      for (let oy = -4; oy <= 4; oy++) {
        const y = cy + oy;
        if (y < 0 || y >= c.rows) continue;
        for (let ox = -4; ox <= 4; ox++) {
          const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
          const v = c.K[k * S + s] / (1 + c.N[k * S + s]) / (1 + Math.hypot(ox, oy) * 0.15);
          if (v > most) {
            most = v;
            best = k;
          }
        }
      }
      if (best !== here) this.headTo(i, wrapDx((best % c.cols) * ECO_CELL + 8 - this.x[i], w), Math.floor(best / c.cols) * ECO_CELL + 8 - this.y[i], speed);
      else this.roam(i, speed);
      return;
    }
    const dx = wrapDx(this.x[prey] - this.x[i], w);
    const dy = this.y[prey] - this.y[i];
    if (dx * dx + dy * dy > STRIKE * STRIKE) {
      // Mira um pouco à frente da presa (para onde ela está correndo).
      const lead = this.yearSpan / DECISIONS_PER_YEAR;
      this.headTo(i, dx + this.vx[prey] * lead, dy + this.vy[prey] * lead, speed * 1.8);
      return;
    }
    // O bote: chance base, mais fácil em presa frágil e em matilha.
    this.stop(i);
    // Tipo III de Holling: presa rara à vista (sozinha, longe do grupo) é mais difícil de pegar.
    // E presa abaixo da capacidade da região ocupa só os melhores esconderijos: a caça falha mais.
    const pk = this.kind[prey];
    // E a espécie já escassa no planeta (abaixo da metade do que a terra sustenta) sobra nos refúgios: a caça cai junto.
    let spare = 1;
    if (this.wild(pk)) {
      const scarce = Math.min(1, this.population[pk] / Math.max(1, c.total[pk] * 0.5));
      spare = Math.min(1, 0.4 + this.crowding(c, c.of(this.x[prey], this.y[prey], w), pk, ecologyOf(this.species[pk]).herd) / 0.8) * Math.max(0.05, scarce * scarce);
    }
    const chance = Math.min(0.9, HUNT_SUCCESS * this.vulnerable(prey) * (1 + 0.25 * helpers) * (0.4 + 0.6 * this.preyAbundance) * spare);
    if (this.rnd() < chance) {
      const young = this.age[prey] < this.species[this.kind[prey]].maturity;
      const kg = ecologyOf(this.species[this.kind[prey]]).mass * EDIBLE * (young ? 0.3 : 1);
      const at = c.of(this.x[prey], this.y[prey], w);
      this.fear[at] = Math.min(3, this.fear[at] + 1);
      this.leaveCarcass(prey, kg);
      this.kill(prey, false, 'predador');
      this.chase[i] = -1;
      this.effort[i] = 0;
      const k = this.carcasses.length - 1;
      if (k >= 0) {
        this.energy[i] = Math.min(1, this.energy[i] + this.eatCarcass(i, k, e));
        // A matilha come junto: quem do bando está perto e com fome divide a presa.
        if (e.pack) {
          const s = this.kind[i];
          this.forEachNear(this.x[i], this.y[i], 8, (j) => {
            if (j === i || this.kind[j] !== s || this.family[j] !== this.family[i] || this.energy[j] >= HUNGRY) return;
            this.energy[j] = Math.min(1, this.energy[j] + this.eatCarcass(j, k, e));
          });
        }
      }
    } else {
      // Errou: a presa dispara e o caçador cansa.
      this.energy[i] -= 0.01;
      const pe = ecologyOf(this.species[this.kind[prey]]);
      if (this.wild(this.kind[prey])) {
        this.act[prey] = ACT.flee;
        this.headTo(prey, dx * 4, dy * 4, this.pace(pe, this.species[this.kind[prey]]) * 1.6);
      }
    }
  }

  /** Sem destino: segue mais ou menos na mesma direção (explora em vez de rodar no lugar). */
  private roam(i: number, speed: number): void {
    const v = Math.hypot(this.vx[i], this.vy[i]);
    let a = this.rnd() * Math.PI * 2;
    if (v > 0.05) a = Math.atan2(this.vy[i], this.vx[i]) + (this.rnd() - 0.5) * 0.8;
    // Se o caminho em frente está fechado (penhasco, água), tenta outros rumos.
    for (let k = 0; k < 8 && !this.reachable(i, Math.cos(a), Math.sin(a), 3); k++) a += Math.PI / 4 + (this.rnd() - 0.5) * 0.4;
    this.vx[i] = Math.cos(a) * speed * 0.8;
    this.vy[i] = Math.sin(a) * speed * 0.8;
  }

  /**
   * Descansando: fica parado ou vai andando devagar, pastando pelo caminho, num
   * rumo que muda pouco de uma decisão para outra (o bando atravessa a área de vida
   * em vez de rodar no lugar).
   */
  private loiter(i: number, speed: number): void {
    // Caçadores descansam no território (de tocaia); pastadores vão pastando adiante.
    if (this.rnd() < (hunts(ecologyOf(this.species[this.kind[i]])) ? 0.75 : 0.3)) return this.stop(i);
    // O bando inteiro vai para o mesmo lado, que muda a cada estação (sorteio pela família e pela estação).
    const h = Math.imul(this.family[i] ^ Math.floor(this.year * 4), 2654435761) >>> 0;
    const a = (h / 4294967296) * Math.PI * 2 + (this.rnd() - 0.5) * 0.6;
    this.aimX[i] = Math.cos(a);
    this.aimY[i] = Math.sin(a);
    this.vx[i] = this.aimX[i] * speed * 0.5;
    this.vy[i] = this.aimY[i] * speed * 0.5;
  }

  /** A célula não tem água para beber e a espécie precisa (bicho do deserto aguenta; caçador tira água da presa). */
  private thirsty(e: Ecology, k: number): boolean {
    const wx = this.weather;
    if (!wx?.ready || (e.biomes[Biome.Desert] ?? 0) >= 0.8 || appetite(e) < 1) return false;
    return wx.water[k] < 0.01 && wx.soil[k] < 0.12 && wx.snow[k] < 0.05 && wx.rain[k] < 0.15;
  }

  /** Direção da célula com água mais perto (até 3 células), ou undefined. */
  private waterCell(i: number, c: EcoCells): { x: number; y: number } | undefined {
    const wx = this.weather;
    if (!wx?.ready) return undefined;
    const w = this.map.width;
    const here = c.of(this.x[i], this.y[i], w);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    let best = -1;
    let bd = Infinity;
    for (let oy = -3; oy <= 3; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -3; ox <= 3; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        if (wx.water[k] < 0.01 && wx.soil[k] < 0.3 && wx.rain[k] < 0.15) continue;
        const d = ox * ox + oy * oy;
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
    }
    if (best < 0) return undefined;
    return { x: wrapDx((best % c.cols) * ECO_CELL + 8 - this.x[i], w), y: Math.floor(best / c.cols) * ECO_CELL + 8 - this.y[i] };
  }

  /** Direção da célula (até 3 de distância) com mais herbívoros acima da metade da capacidade: onde dá para caçar sem esvaziar. */
  private gameCell(i: number, c: EcoCells): { x: number; y: number } | undefined {
    const S = c.stride;
    const w = this.map.width;
    const here = c.of(this.x[i], this.y[i], w);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    let best = -1;
    let most = 0.5;
    for (let oy = -3; oy <= 3; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -3; ox <= 3; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        let spare = 0;
        for (let s = 0; s < S; s++) if (this.species[s].kind === 'herbivore') spare += Math.max(0, c.N[k * S + s] - c.K[k * S + s] * 0.5);
        spare /= 1 + Math.hypot(ox, oy) * 0.3;
        if (spare > most) {
          most = spare;
          best = k;
        }
      }
    }
    if (best < 0 || best === here) return undefined;
    return { x: wrapDx((best % c.cols) * ECO_CELL + 8 - this.x[i], w), y: Math.floor(best / c.cols) * ECO_CELL + 8 - this.y[i] };
  }

  /** Célula a até 4 de distância com mais bichos da espécie (fora a do próprio bicho), ou -1. */
  private crowdedCell(i: number, c: EcoCells): number {
    const s = this.kind[i];
    const S = c.stride;
    const here = c.of(this.x[i], this.y[i], this.map.width);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    let best = -1;
    let most = 0;
    for (let oy = -4; oy <= 4; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -4; ox <= 4; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        if (k !== here && c.N[k * S + s] > most) {
          most = c.N[k * S + s];
          best = k;
        }
      }
    }
    return best;
  }

  /**
   * Lotação da área de vida do bando (N/K): soma células em anéis em volta até a
   * capacidade caber o bando com folga (até 9×9 células). Bichos raros e espalhados
   * olham uma área grande; num lugar farto, a vizinhança basta.
   */
  private crowding(c: EcoCells, cell: number, s: number, herd: number): number {
    const S = c.stride;
    const memo = c.dens[cell * S + s];
    if (memo >= 0) return memo;
    const cx = cell % c.cols;
    const cy = (cell - cx) / c.cols;
    let n = c.N[cell * S + s];
    let k = c.K[cell * S + s];
    // A área cobre alguns bandos, não um só: senão todo bando pareceria lotado.
    const want = Math.max(4, herd * 3);
    for (let r = 1; r <= 6 && k < want; r++) {
      for (let oy = -r; oy <= r; oy++) {
        const y = cy + oy;
        if (y < 0 || y >= c.rows) continue;
        const edge = oy === -r || oy === r;
        for (let ox = -r; ox <= r; ox += edge ? 1 : 2 * r) {
          const q = (y * c.cols + ((cx + ox + c.cols) % c.cols)) * S + s;
          n += c.N[q];
          k += c.K[q];
        }
      }
    }
    // Espécie tão rara que nem 13×13 células dão para um bando: vale a lotação do planeta inteiro.
    const d = k < want ? this.population[s] / Math.max(1, c.total[s]) : n / Math.max(0.5, k);
    c.dens[cell * S + s] = d;
    return d;
  }

  /** Tile no centro da célula vizinha (até 2 células) menos lotada e com nicho bom, para a dispersão. */
  private emptierCell(i: number, c: EcoCells): number {
    const s = this.kind[i];
    const S = c.stride;
    const here = c.of(this.x[i], this.y[i], this.map.width);
    const cx = here % c.cols;
    const cy = (here - cx) / c.cols;
    const herd = ecologyOf(this.species[s]).herd;
    let best = -1;
    let low = this.crowding(c, here, s, herd) - 0.2;
    // Até três células de distância: uma área vazia com capacidade é recolonizada a pé pelos vizinhos.
    for (let oy = -3; oy <= 3; oy++) {
      const y = cy + oy;
      if (y < 0 || y >= c.rows) continue;
      for (let ox = -3; ox <= 3; ox++) {
        const k = y * c.cols + ((cx + ox + c.cols) % c.cols);
        if (k === here || c.suit[k * S + s] < 0.15) continue;
        const fill = this.crowding(c, k, s, herd) + this.rnd() * 0.1;
        if (fill < low) {
          low = fill;
          best = k;
        }
      }
    }
    if (best < 0) return -1;
    for (let k = 0; k < 8; k++) {
      const t = this.tileAt((best % c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL), Math.min(this.map.height - 1, Math.floor(best / c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL)));
      if (t >= 0 && this.habitable(s, t)) return t;
    }
    return -1;
  }

  /**
   * Reprodução: na estação, com energia e um parceiro adulto por perto. Os
   * nascimentos caem com a lotação da vizinhança (Beverton–Holt local) e com os
   * parasitas; uma espécie rara no planeta tem um empurrão.
   */
  private breed(i: number, e: Ecology, c: EcoCells, cell: number, local: number, yr: number): void {
    const s = this.kind[i];
    const sp = this.species[s];
    // Espécie que já está abaixo da metade do que o planeta sustenta não sente a lotação de um canto
    // (o bando amontoado se espalharia): vale a lotação do planeta. Evita a extinção por um aperto local.
    const global = this.population[s] / Math.max(1, c.total[s]);
    const dens = global < 0.5 ? Math.min(local, global) : local;
    if (this.age[i] < sp.maturity || this.energy[i] < (hunts(e) ? 0.45 : 0.7) || dens >= 1) return;
    const phase = this.yearPhase();
    if (e.seasonal && (phase < BREED_START || phase >= BREED_START + BREED_LENGTH)) return;
    // Espécie rara no planeta (abaixo da metade do que a terra sustenta) se recupera mais rápido.
    const rare = this.population[s] < RELICT ? 3 : this.population[s] < c.total[s] * 0.5 ? 2 : 1;
    // Cada cria tem dois pais: metade da ninhada por adulto, espalhada pela estação.
    const rate = ((e.litter / 2) * (1 - dens * dens) * (1 - 0.6 * this.parasite[i]) * rare) / (e.seasonal ? BREED_LENGTH : 1);
    if (!happens(this.rnd, rate, yr)) return;
    // Parceiro adulto por perto (solitários, como a onça, se encontram de mais longe).
    const k = this.kin(i, e.herd > 2 ? 8 : Math.max(8, e.range));
    if (!k.n || k.n > e.herd * 1.5 + 1) return;
    // Predador só cria filhote com território: nenhum outro grupo da espécie, maior ou tão grande, mora ali perto.
    // Espécie já rara não briga por território: sobra espaço para todos.
    if (appetite(e) < 1 && this.population[s] > RELICT * 3 && !this.holdsTerritory(i, e, c)) return;
    const child = this.spawn(s, this.x[i] + (this.rnd() - 0.5), this.y[i] + (this.rnd() - 0.5));
    if (child < 0) return;
    this.energy[i] -= 0.12;
    this.parent[child] = this.uid[i];
    this.family[child] = this.family[i];
    c.N[cell * c.stride + s]++;
  }

  /**
   * Território do grupo do bicho (matilha, casal ou solitário): nenhum outro grupo da mesma espécie
   * com o centro a menos de `range` tiles, a não ser um menor. Empate fica com o grupo mais antigo.
   * É o que espaça lobos e leões como na natureza e corta o excesso de predadores pela raiz.
   */
  private holdsTerritory(i: number, e: Ecology, c: EcoCells): boolean {
    const w = this.map.width;
    const s = this.kind[i];
    const fam = this.family[i];
    const own = c.herds.get(fam);
    const size = own ? own[3] : 1;
    const ox = own ? own[0] + own[1] / own[3] : this.x[i];
    const oy = own ? own[2] / own[3] : this.y[i];
    // Territórios se encostam: o centro do vizinho pode ficar a 70% do alcance.
    const r2 = e.range * e.range * 0.5;
    for (const [f, h] of c.herds) {
      if (f === fam || c.herdKind.get(f) !== s) continue;
      const dx = wrapDx(h[0] + h[1] / h[3] - ox, w);
      const dy = h[2] / h[3] - oy;
      if (dx * dx + dy * dy > r2) continue;
      if (h[3] > size || (h[3] === size && f < fam)) return false;
    }
    return true;
  }

  /**
   * Checagem de viabilidade da fauna sorteada de um planeta com vida própria (Plano 2), sem simular:
   * a capacidade de suporte é calculada como no jogo, e a espécie nativa que não teria uma população
   * viável tem a faixa de temperatura puxada para o clima do planeta e os biomas soltos, até três vezes.
   */
  private adaptNatives(): void {
    const id = this.map.params.id;
    if (id === EARTH_ID) return;
    for (let round = 0; round < 3; round++) {
      const c = this.ecoCells();
      let changed = false;
      this.species.forEach((sp, s) => {
        // Herbívoros primeiro: a capacidade dos caçadores depende das presas já no mapa.
        if (!this.wild(s) || sp.origin !== id || sp.kind !== 'herbivore' || c.total[s] >= RELICT * 2) return;
        // A faixa anda metade do caminho até o clima médio do planeta e alarga um pouco.
        const shift = (this.map.params.temperatureK + 10 - (sp.tempMin + sp.tempMax) / 2) * 0.5;
        sp.tempMin = Math.round(sp.tempMin + shift - 8);
        sp.tempMax = Math.round(sp.tempMax + shift + 8);
        if (sp.eco) sp.eco = { ...sp.eco, biomes: {}, open: 1, moist: [0, 1], alt: [0, 0.85] };
        refreshEcology(sp);
        changed = true;
      });
      if (!changed) return;
      c.ready = false;
      c.passes = 0;
    }
  }

  /**
   * Coloca os bichos de terra pela capacidade de cada célula (herbívoros primeiro,
   * depois quem os come), já em bandos do tamanho típico da espécie: a capacidade
   * das células vai se acumulando e, quando dá um bando, ele nasce ali.
   */
  private populateWild(): void {
    this.adaptNatives();
    const c = this.ecoCells();
    const S = c.stride;
    const w = this.map.width;
    for (const predators of [false, true]) {
      for (let s = 0; s < S; s++) {
        if (!this.wild(s)) continue;
        const e = ecologyOf(this.species[s]);
        // Na segunda leva entram os que vivem de carne: caçadores e necrófagos.
        if ((hunts(e) || e.carrion >= 0.8) !== predators) continue;
        const sp = this.species[s];
        const group = Math.max(2, Math.round(e.herd * 0.6));
        let acc = 0;
        const start = Math.floor(this.rnd() * c.n);
        for (let q = 0; q < c.n; q++) {
          const k = (start + q) % c.n;
          if (c.K[k * S + s] <= 0) continue;
          acc += c.K[k * S + s] * 0.7;
          if (acc < group * (0.5 + this.rnd())) continue;
          let n = Math.min(group, Math.round(acc));
          acc -= n;
          let at = -1;
          for (let tries = 0; tries < 12 && at < 0; tries++) {
            const t = this.tileAt((k % c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL), Math.min(this.map.height - 1, Math.floor(k / c.cols) * ECO_CELL + Math.floor(this.rnd() * ECO_CELL)));
            if (t >= 0 && this.habitable(s, t)) at = t;
          }
          if (at < 0) continue;
          const family = ++this.nextFamily;
          for (let tries = 0; n > 0 && tries < 30; tries++) {
            const t = this.tileAt((at % w) + Math.floor((this.rnd() - 0.5) * 6), Math.floor(at / w) + Math.floor((this.rnd() - 0.5) * 6));
            if (t < 0 || !this.habitable(s, t)) continue;
            // Bando com adultos dos dois lados da idade: nunca só filhotes.
            const age = sp.maturity + this.rnd() * (sp.maxAge * 0.6 - sp.maturity);
            const j = this.spawn(s, (t % w) + this.rnd(), Math.floor(t / w) + this.rnd(), -1, Math.max(0, age));
            if (j < 0) continue;
            this.family[j] = family;
            n--;
          }
        }
      }
      this.countWild(c);
      this.updateCapacity(c);
    }
  }

  /**
   * Controle da natalidade: perto do teto quase não nascem filhotes (o
   * pasto e o espaço ficam disputados); uma espécie rara tem mais filhotes,
   * para conseguir se recuperar. Inteligentes só têm o empurrão de espécie rara: o teto deles é a comida e a casa de cada assentamento.
   */
  fertility(s: number, era = 0): number {
    const cap = this.caps[s] * (this.species[s].kind === 'sapient' ? 1 + 0.3 * era : 1);
    const fill = this.population[s] / Math.max(1, cap);
    if (fill < 0.2) return 2.2;
    // Inteligentes não têm teto global da espécie (etapa 1): quem limita é a comida e a casa de cada assentamento.
    if (this.species[s].kind === 'sapient') return 1.1;
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
      const r = 4 + this.rnd() * (this.wild(s) ? Math.max(6, ecologyOf(sp).roam / 8) : 6);
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
      if (this.civRnd() < 0.25 && this.canFound(tx, ty)) found(tx, ty);
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
    this.role[i] = this.age[i] < this.species[this.kind[i]].maturity ? CHILD : pickRole(Math.floor(v.tech), this.scale(v), this.civRnd(), this.roleContext(v));
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

  /**
   * Território (RF-AS-10): até onde o povo vai trabalhar (mata, caça, pasto e coleta), que cresce com a
   * gente. Não é a área construída: essa é a pegada (`footprint`), o contorno das casas.
   */
  radius(v: Village): number {
    return Math.min(B.TERRITORY_MAX, B.TERRITORY_BASE + B.TERRITORY_GROWTH * Math.sqrt(Math.max(4, v.population)));
  }

  /** Quantas pessoas as casas do assentamento abrigam. */
  housing(v: Village, planned = false): number {
    const era = Math.floor(v.tech);
    // A gente do campo conta pelas roças que o lugar comporta (uma a cada duas casas, ou quatro na Pedra),
    // mesmo quando só se planta o que os agricultores dão conta.
    const homes = v.houses.filter((h) => h.kind === 'house').length;
    const farms = v.fields > 0 || v.tech >= 0.12 ? Math.max(v.fields, Math.floor(homes / (era >= 1 ? 2 : 4))) : v.fields;
    let n = 4 + farms * 2;
    for (const h of v.houses) if (planned || !h.site) n += h.kind === 'house' ? (h.empty ? 0 : 4 + era + (h.level ?? 0) * B.LEVEL_HOUSING) : h.kind === 'port' ? 0 : 2;
    return n;
  }

  /** Andares a mais que uma casa pode ter (sobrado em vilas e cidades com siderurgia/Ferro; mais um na cidade com aço/Medieval). */
  private maxLevel(v: Village): number {
    const era = Math.floor(v.tech);
    if (this.scale(v) >= 2 && (era >= 3 || this.knew(v, 'aco'))) return 2;
    if (this.scale(v) >= 1 && (era >= 2 || this.knew(v, 'siderurgia'))) return 1;
    return 0;
  }

  /** Estrutura de referência do assentamento no nível e era atuais (RF-VIDA-200). */
  plan(v: Village): PlanItem[] {
    const era = Math.floor(v.tech);
    const built = new Set<string>(v.houses.map((h) => h.kind));
    const ctx = this.buildContext(v);
    return planItems({
      tier: this.scale(v),
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
      tier: this.scale(v),
      metal: st.copper + st.tin + st.iron > 0,
      culture: v.culture,
      capital: v.kingdom === v.id,
      vocation: v.vocation,
      herd: v.herd && v.herd.head > 0 ? v.herd.kind : undefined,
      clay: v.wet ?? false,
      forest: v.forest,
      techs: this.knows(v),
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

  private readonly contours = new WeakMap<Village, { key: number; radii: Float32Array }>();

  /** Assentamento cuja pegada contém o ponto, se houver (RF-AS-10). */
  settlementAt(x: number, y: number): Village | null {
    for (const v of this.villages) if (!v.abandoned && this.distance(v, x, y) < this.footprint(v) + 1) return v;
    return null;
  }

  /**
   * Contorno real do assentamento em 64 direções: envolve a praça, todas as
   * casas, construções especiais, porto, plantações (roças), currais (pastos)
   * e ruas internas, fechando os vãos entre vizinhos sem inventar área vazia.
   */
  villageContour(v: Village): Float32Array {
    const key =
      v.houses.length * 131071 +
      v.fields * 8191 +
      (v.pens?.length ?? 0) * 521 +
      (v.streetLen ?? 0) * 31 +
      Math.floor(this.year) * 7 +
      this.mapVersionKey;
    const hit = this.contours.get(v);
    if (hit && hit.key === key) return hit.radii;

    const N = 64;
    const mw = this.map.width;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const base = this.radius(v);
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < base * 2 + this.radius(o) + 8);
    const disks: { dx: number; dy: number; d2: number; pad: number }[] = [];
    const addDisk = (x: number, y: number, pad: number) => {
      const dx = wrapDx(x - v.x, mw);
      const dy = y - v.y;
      disks.push({ dx, dy, d2: dx * dx + dy * dy, pad });
    };
    // Praça central (3x3).
    addDisk(cx + 0.5, cy + 0.5, 3.0);
    // Casas, construções especiais e porto.
    for (const h of v.houses) {
      const s = h.kind === 'port' ? 1 : 2;
      addDisk(h.x + s * 0.5, h.y + s * 0.5, s === 1 ? 2.1 : 2.8);
    }
    // Currais (pastos 2x2).
    for (const p of v.pens ?? []) addDisk(p.x + 1, p.y + 1, 2.8);
    // Plantações (roças, road === 4) e ruas internas coladas em construções/roças/praça.
    const scanR = Math.ceil(base) + 4;
    for (let dy = -scanR; dy <= scanR; dy++) {
      for (let dx = -scanR; dx <= scanR; dx++) {
        if (dx * dx + dy * dy > scanR * scanR) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0) continue;
        const rk = this.road[t];
        if (rk !== 4 && rk !== 5 && !(rk >= 1 && rk <= 2 && dx * dx + dy * dy <= base * base)) continue;
        const tx = cx + dx + 0.5;
        const ty = cy + dy + 0.5;
        const dv = this.distance(v, tx, ty);
        if (near.some((o) => this.distance(o, tx, ty) < dv)) continue;
        if (rk === 4 || rk === 5) {
          addDisk(tx, ty, 2.2);
        } else {
          // Rua interna: só conta quando ladeia casa, roça, pasto ou praça (ignora estrada para outra vila).
          let urban = false;
          for (let oy = -2; oy <= 2 && !urban; oy++) {
            for (let ox = -2; ox <= 2 && !urban; ox++) {
              const u = this.tileAt(cx + dx + ox, cy + dy + oy);
              if (u >= 0 && (this.built[u] || this.road[u] >= 3)) urban = true;
            }
          }
          if (urban) addDisk(tx, ty, 1.8);
        }
      }
    }

    const strict = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      let s = 2.8;
      for (let j = 0; j < disks.length; j++) {
        const c = disks[j];
        const proj = c.dx * ux + c.dy * uy;
        if (proj < -c.pad) continue;
        const perp2 = c.d2 - proj * proj;
        if (perp2 < c.pad * c.pad) {
          const hitR = proj + Math.sqrt(c.pad * c.pad - perp2);
          if (hitR > s) s = hitR;
        }
      }
      strict[k] = s;
    }

    // Fechamento angular curto: une lotes próximos da mesma vila sem criar barriga onde não há nada.
    const dilated = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      let m = strict[k];
      for (let d = -3; d <= 3; d++) {
        const v0 = strict[(k + d + N) & 63] * Math.cos((d * Math.PI * 2) / N);
        if (v0 > m) m = v0;
      }
      dilated[k] = m;
    }
    const radii = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      let m = dilated[k];
      for (let d = -2; d <= 2; d++) {
        const v0 = dilated[(k + d + N) & 63];
        if (v0 < m) m = v0;
      }
      radii[k] = Math.max(strict[k], m);
    }
    const tmp = new Float32Array(N);
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < N; k++) {
        tmp[k] = Math.max(strict[k], 0.25 * radii[(k + N - 1) & 63] + 0.5 * radii[k] + 0.25 * radii[(k + 1) & 63]);
      }
      radii.set(tmp);
    }
    // Fronteira com assentamentos vizinhos, sem cortar construções ou plantações próprias.
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      let r = radii[k];
      for (const o of near) {
        const dx = wrapDx(o.x - v.x, mw);
        const dy = o.y - v.y;
        const d2 = dx * dx + dy * dy;
        const proj = ux * dx + uy * dy;
        if (proj <= 0.01) continue;
        r = Math.min(r, Math.max(strict[k] - 0.2, d2 / (2 * proj) - 0.3));
      }
      radii[k] = r;
    }
    this.contours.set(v, { key, radii });
    return radii;
  }

  /** Contador de alterações em tiles para atualizar o cache do contorno na hora. */
  private mapVersionKey = 0;

  /** Assentamento cujo contorno real contém o ponto (x, y), se houver. */
  villageAt(x: number, y: number): Village | null {
    const mw = this.map.width;
    let best: Village | null = null;
    let bestScore = Infinity;
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const dx = wrapDx(x - v.x, mw);
      const dy = y - v.y;
      const d = Math.hypot(dx, dy);
      if (d > this.radius(v) + 7) continue;
      for (const h of v.houses) {
        const s = h.kind === 'port' ? 1 : 2;
        if (Math.abs(wrapDx(x - (h.x + s * 0.5), mw)) <= s * 0.5 && Math.abs(y - (h.y + s * 0.5)) <= s * 0.5) return v;
      }
      for (const p of v.pens ?? []) {
        if (Math.abs(wrapDx(x - (p.x + 1), mw)) <= 1 && Math.abs(y - (p.y + 1)) <= 1) return v;
      }
      const r = this.villageContour(v);
      const a = (((Math.atan2(dy, dx) / (Math.PI * 2)) % 1) + 1) % 1;
      const idx = a * r.length;
      const k0 = Math.floor(idx) & 63;
      const k1 = (k0 + 1) & 63;
      const t = idx - Math.floor(idx);
      if (d <= r[k0] * (1 - t) + r[k1] * t && d < bestScore) {
        best = v;
        bestScore = d;
      }
    }
    return best;
  }

  /**
   * Um assentamento novo não pode nascer dentro (nem encostado) da área de outro, e guarda a
   * distância da hierarquia (RF-AS-05): 14 tiles de uma aldeia, 22 de uma vila, 30 de uma cidade.
   */
  canFound(x: number, y: number): boolean {
    return this.villages.every((v) => v.abandoned || this.distance(v, x + 0.5, y + 0.5) >= Math.max(spacingFor(v.tier), this.footprint(v) + B.FOOTPRINT_MIN));
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

  /** Moradores de todos os assentamentos ativos do reino cuja capital é `v`. */
  kingdomPopulation(v: Village): number {
    let n = 0;
    for (const o of this.villages) if (!o.abandoned && o.kingdom === v.id) n += o.population;
    return n;
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
        if (isRockyBiome(b) || this.map.elevation[t] > 0.45) rock++;
        if (isForestBiome(b)) forest++;
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
      if (h.kind !== 'house' || (h.era ?? era) >= era || this.underWork(h)) continue;
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
    this.startWork(h, B.WORK_YEARS, false);
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


  /** Tiles do lote livre (casas: do centro para fora; plantações: de fora para dentro). */
  private freeLot(v: Village, fromEdge = false): number[] | null {
    // Plano novo (RF-AS-11 e 16): casas pelo valor do solo; roças e cercados no anel de fora.
    // A busca olha centenas de lotes: o resultado vale por um tempo, enquanto os tiles continuam livres.
    const key = v.id * 2 + (fromEdge ? 1 : 0);
    const hit = this.lotCache.get(key);
    const free = (t: number) => !this.built[t] && (fromEdge ? !this.road[t] : !this.road[t] || this.road[t] === 4);
    if (hit && this.year < hit.until && (hit.tiles === null || hit.tiles.every(free))) return hit.tiles;
    const tiles = fromEdge ? this.fieldLot(v) : this.bestLot(v);
    this.lotCache.set(key, { tiles, until: this.year + (tiles ? 0.5 : 1) });
    return tiles;
  }

  /** Último lote achado por assentamento (casa e roça) e até quando vale. */
  private readonly lotCache = new Map<number, { tiles: number[] | null; until: number }>();

  /** Motivo para uma colônia agora, ou null (RF-AS-03). */
  private colonyMotive(v: Village, crowded: boolean): ColonyMotive | null {
    if (crowded) return 'espaço';
    if ((v.fedShare ?? 1) < 0.85 && !this.freeLot(v, true)) return 'terra';
    if (v.tech >= 0.5 && this.wanted(v).length) {
      const reach = this.radius(v) + B.COLONY_REACH;
      for (const d of this.deposits) {
        if (d.mine >= 0 || d.amount <= 0) continue;
        const dist = this.distance(v, d.x + 0.5, d.y + 0.5);
        if (dist > this.radius(v) + 25 && dist < reach) return 'jazida';
      }
    }
    if (v.culture.value === 'comércio' && v.port < 0 && v.tech >= 1 && !this.coastal(v)) return 'porto';
    return null;
  }

  /** Constrói uma casa (ou construção especial) no lote livre mais perto do centro. */
  private buildHouse(v: Village, kind: BuildingKind = 'house', free = false): boolean {
    const tiles = this.freeLot(v);
    if (!tiles || (!free && !this.pay(v, kind))) return false;
    const w = this.map.width;
    // Casa sobre roça (o núcleo cresceu até ela): a roça sai e o anel de roças anda para fora (RF-AS-16).
    if (tiles.some((t) => this.road[t] === 4)) this.dropFieldAt(v, tiles.find((t) => this.road[t] === 4)!);
    for (const t of tiles) {
      this.built[t] = 1;
      this.onTileChanged(t);
    }
    v.foot = undefined;
    this.layAccess(v, tiles[0] % w, Math.floor(tiles[0] / w));
    const built: Building = { x: tiles[0] % w, y: Math.floor(tiles[0] / w), kind, variant: Math.floor(this.civRnd() * 4), era: Math.floor(v.tech) };
    // A casa dos fundadores sai pronta; as demais viram obra e só os construtores no lugar a terminam (seção 19.21).
    if (!free) this.startWork(built, B.WORK_YEARS / 2, true);
    v.houses.push(built);
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
      if (h.kind !== 'house' || (h.level ?? 0) >= max || this.underWork(h)) continue;
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
    this.startWork(h, B.WORK_YEARS, false);
    this.note(`${v.name} está reformando casas`, 'povo', v, { key: `reform-${v.id}` });
    return true;
  }

  /** Próxima construção especial que o assentamento pode erguer, se houver. */
  private nextBuilding(v: Village): BuildingKind | null {
    const ctx = this.buildContext(v);
    // O prédio característico da vocação vem primeiro (RF-VIDA-221).
    const own = v.vocation ? VOCATION_BUILDING[v.vocation] : '';
    if (own && own !== 'port' && canBuild(own as (typeof BUILDINGS)[number], ctx) && !this.has(v, own as BuildingKind, true)) return own as BuildingKind;
    for (const b of BUILDINGS) if (canBuild(b, ctx) && !this.has(v, b, true)) return b;
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

  /** Tira a roça que tem o tile `t` (até 4 tiles de lavoura ligados). */
  private dropFieldAt(v: Village, t0: number): void {
    const w = this.map.width;
    const queue = [t0];
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
    v.fields = Math.max(0, v.fields - 1);
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
    // O povo escolhe (IA local, src/ai/decisions/leader.ts): carisma, ambição, idade e amigos; num reino, o herdeiro.
    const sp = this.species[v.species];
    const elder = elderAge(sp, Math.floor(v.tech));
    const old = v.leaderUid ?? 0;
    const oldMate = old ? partnerOf(this.bonds, old) : 0;
    const crown = v.kingdom === v.id && v.tier >= 2;
    const cands: Candidate[] = adults.map((i) => {
      let friends = 0;
      for (const b of this.bonds.get(this.uid[i]) ?? []) if (b.kind === BOND.friend) friends++;
      return { i, prime: this.age[i] < elder, friends, heir: !!old && (this.parent[i] === old || this.uid[i] === oldMate) };
    });
    const choice = chooseLeader({ traits: this.traits, crown }, cands, this.mindRnd);
    const pick = choice ? choice.pick.action : adults[0];
    v.leader = pick;
    v.leaderUid = this.uid[pick];
    this.role[pick] = king ? ROLE.king : ROLE.leader;
    const cand = cands.find((c) => c.i === pick)!;
    this.logThought(pick, 'poder', `${king ? 'Virou rei' : 'Virou líder'} de ${v.name}: ${leaderReason(this.traits, cand, crown)}`);
  }

  /** Agressividade do reino somada ao temperamento do rei (IA local): um rei belicoso puxa a guerra, um gentil a segura. */
  private warMood(k: number): number {
    const l = this.villages[k]?.leader ?? -1;
    const ruler = l >= 0 && this.alive[l] ? LEADER.temper * rulerTemper(this.traits, l) : 0;
    // O empurrão do jogador manda: no extremo (−1 ou 1) o temperamento do rei não pesa mais.
    const push = this.temperOf(k);
    return Math.max(-1, Math.min(1, push + ruler * (1 - Math.abs(push))));
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

  foundVillage(s: number, x: number, y: number, settlers: number, from?: Village, how?: Village['foundedBy']): Village {
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
      techs: from?.techs ? [...from.techs] : [],
      pts: P.emptyPoints(),
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
      foundedAt: this.year,
      foundedBy: how ?? (from ? 'colônia' : 'bando'),
    };
    if (!from) village.culture = makeCulture(village.culture.id, village.name, rnd);
    if (ruin) {
      village.ruinOf = ruin.id;
      if (!ruin.decay) village.fields = ruin.fields;
      ruin.decay = 3;
    }
    this.villages.push(village);
    this.layPlaza(village);
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

  private abandon(v: Village, quiet = false): void {
    v.abandoned = true;
    v.abandonedAt = this.year;
    v.decay = 0;
    this.dropWall(v);
    if (v.foundedAt !== undefined && this.year - v.foundedAt < 50) this.tally.shortLived++;
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
    if (quiet) return;
    // Abandono com destino (RF-AS-08): a crônica diz para onde foram os últimos moradores.
    const to = v.leftTo !== undefined ? this.villages[v.leftTo] : null;
    const cause = to ? `: os últimos moradores foram para ${to.name}` : v.lastCause ? `: o último morador morreu ${v.lastCause}` : '';
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
    // Sem o lugar, o terreiro volta a ser mato (a mata pode voltar).
    if (stage >= 3 && this.map.bare) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const t = this.tileAt(cx + dx, cy + dy);
          if (t >= 0 && this.map.bare[t] && !this.settlementAt(cx + dx + 0.5, cy + dy + 0.5)) {
            this.map.bare[t] = 0;
            this.onTileChanged(t);
          }
        }
      }
    }
    v.decay = stage;
    v.pens = undefined;
    if (stage >= 3) this.note(`As últimas ruínas de ${v.name} sumiram`, 'povo', v);
  }

  private updateVillages(dt: number): void {
    this.recountCrews();
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
      const eraPace = this.yearSpan > YEAR_SECONDS ? 1.5 : 1;
      this.develop(v, dt * eraPace, adults[v.id] ?? []);
      if (Math.floor(v.tech) > before) {
        this.note(`${v.name} entrou na ${ERAS[Math.floor(v.tech)]}`, 'era', v, { major: true });
        // Cada era nova refaz o calçamento das ruas que o uso abriu (RF-VIDA-253 e RF-AS-13).
        if (Math.floor(v.tech) >= 2) this.rankStreets(v);
      }
      this.updateTier(v, false);
      this.updateLeader(v, adults[v.id] ?? []);
      // Assentamentos fundados neste passo ainda não têm contagem.
      if (workers[v.id]) this.produce(v, workers[v.id], adults[v.id].length, dt);
      // Crescimento para dentro (RF-VIDA-202): preencher os lotes, completar a planta e reformar, adensar e só então expandir.
      const homes = v.houses.filter((h) => h.kind === 'house').length;
      const yr = dt / YEAR_SECONDS;
      const items = this.plan(v);
      v.completeness = completeness(items);
      v.missing = missingText(items);
      const needRoom = v.population > this.housing(v, true) - 3;
      // Obras ao mesmo tempo: quanto mais construtores, mais canteiros abertos (seção 19.21).
      const builders = workers[v.id]?.[ROLE.builder] ?? 0;
      const workRoom = v.houses.reduce((n, h) => n + ((h.labor ?? 0) > 0 ? 1 : 0), 0) < 1 + Math.max(1, builders);
      const lot = needRoom || v.completeness < 1 ? this.freeLot(v) : null;
      const pace = v.needs ? 0.6 + 0.4 * welfare(v.needs) : 1;
      if (workRoom && (needRoom || v.population > homes * 3) && happens(this.civRnd, B.HOUSE_RATE * pace, yr)) {
        // A planta pede uma construção especial: ela vem antes da casa nova, quando há material.
        const special = homes >= 4 && (v.completeness < 1 || this.civRnd() < B.SPECIAL_BUILDING_SHARE) ? this.nextBuilding(v) : null;
        if (!(special && this.buildHouse(v, special)) && lot) this.buildHouse(v, 'house');
      }
      // Reformas: casa que ganha um andar (sobrado), mais depressa quando falta lote e sobra gente.
      const squeezed = needRoom && !lot;
      const rich = v.needs && welfare(v.needs) >= 0.88 ? B.RICH_REFORM : 1;
      if (workRoom && happens(this.civRnd, B.REFORM_RATE * Math.max(1, builders) * (squeezed ? 3 : 1) * rich, yr)) this.reform(v);
      // Era nova: as casas antigas vão sendo trocadas pelo estilo novo, uma a uma.
      if (workRoom && this.outdated(v) && happens(this.civRnd, B.RESTYLE_RATE * Math.max(1, builders), yr)) this.restyle(v);
      // As ruas nascem do uso (RF-AS-13): não há planta a abrir. Sem lote ao alcance, o lugar adensa e,
      // apertado de verdade, organiza uma colônia (abaixo).
      // Lavouras trabalhadas por agricultores enchem o celeiro (cada porção mata a fome de um morador).
      // A colheita vem quase toda no outono (RF-VIDA-290); boi ou cavalo no arado dobram a área de cada agricultor;
      // o moinho faz pão (RF-VIDA-211); o solo cansado rende menos (RF-VIDA-294).
      if (v.fields > 0 && workers[v.id]) {
        const w = workers[v.id];
        const plough = v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat' && this.knew(v, 'arado') ? 1 : 0.5;
        // Cada roça no mapa é um lote grande, maior quanto maior o lugar (o mapa tem no máximo 5 roças).
        const worked = Math.min(v.fields * this.fieldHands(v), Math.ceil(w[ROLE.farmer] * plough) + 1);
        const mill = v.houses.some((h) => h.kind === 'windmill') ? 1 + (this.knew(v, 'moinhoagua') ? 0.45 : 0.3) * Math.min(1, w[ROLE.miller]) : 1;
        const bonus = v.vocation === 'agricola' ? 1 + B.VOCATION_BONUS : 1;
        const fallow = (v.soil ?? 1) < B.SOIL_FALLOW ? 0.5 : 1;
        const season = B.SEASON_HARVEST[seasonOf(this.yearClock / YEAR_SECONDS)];
        this.book(v, '_fields', this.gain(v, 'food', worked * B.FIELD_YIELD * B.ERA_YIELD[Math.min(B.ERA_YIELD.length - 1, Math.floor(v.tech))] * this.harvest(v) * (this.knew(v, 'irrigacao') ? 1.1 : 1) * (v.soil ?? 1) * fallow * mill * bonus * season * yr), 0);
      }
      if (workers[v.id]) this.consume(v, residents[v.id] ? fed[v.id] / residents[v.id] : 1, yr);
      // Roças desde a Idade da Pedra (uma para cada quatro casas; da Idade do Bronze em diante, uma para cada duas).
      // Só planta o que os agricultores dão conta (mais uma); roça sem ninguém para trabalhar volta a ser campo.
      // As roças acompanham quem as trabalha, num anel em volta das casas (RF-AS-16; antes, no máximo 5 no mapa).
      const hands = Math.ceil((workers[v.id]?.[ROLE.farmer] ?? 0) * (v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat' ? 1 : 0.5)) + 1;
      const room = Math.min(B.FIELDS_MAX, Math.ceil(hands / this.fieldHands(v)) + 1);
      if (v.fields < Math.min(room, homes / (Math.floor(v.tech) >= 1 ? 2 : 4)) && (v.population >= 6 || v.tech >= 0.12) && happens(this.civRnd, B.FIELD_RATE, dt / YEAR_SECONDS)) this.plantField(v);
      else if (v.fields > room && happens(this.civRnd, B.FIELD_FALLOW_RATE, dt / YEAR_SECONDS)) this.dropField(v);
      // De vez em quando aparece um andarilho do mesmo povo, mais fácil quando o lugar tem pouca gente.
      const rush = (v.goldRush ?? 0) > this.year ? B.GOLD_RUSH_WANDERERS : 0;
      const wander = B.WANDERER_RATE[v.population <= 3 ? 0 : v.population < 10 ? 1 : v.population < 30 ? 2 : 3] + rush;
      if (happens(this.civRnd, wander, dt / YEAR_SECONDS)) this.wanderer(v);
      // Porto na costa quando o assentamento ganha corpo (canoas); barcos de pesca saem dele.
      if (v.port < 0 && (v.population >= 6 || v.tech >= 0.2) && happens(this.civRnd, B.PORT_RATE, dt / YEAR_SECONDS)) this.buildPort(v);
      if (v.port >= 0 && fishers[v.id] > 0 && happens(this.civRnd, B.FISH_TRIP_RATE, dt / YEAR_SECONDS)) {
        let out = 0;
        for (const b of this.boats) if (b.village === v.id && b.purpose === 'fish' && b.sunk < 0) out++;
        if (out < Math.min(3, 1 + Math.floor(fishers[v.id] / 3))) this.launch(v, 'fish');
      }
      // Exploradores por mar quando já dominam o mar (cerâmica/bronze ou vila); povos comerciantes e sábios exploram mais.
      const curious = v.culture.value === 'comércio' || v.culture.value === 'conhecimento' ? 2 : 1;
      if (v.port >= 0 && (v.tech >= 1 || this.knew(v, 'ceramica') || v.tier >= 1) && happens(this.civRnd, B.EXPLORE_RATE * curious, dt / YEAR_SECONDS)) this.explore(v);
      // Caravanas, tributo pedido pela capital e rebanho rumo ao pasto alto (19.6).
      this.sendCaravan(v, yr);
      // Colônia com motivo (RF-AS-03): só de quem tem gente de sobra, e só quando há motivo fora (espaço, terra
      // ou jazida). O grupo é organizado: batedores primeiro, a partida depois (`departColony`, uma vez por ano).
      const crowded = squeezed && !this.reformable(v);
      if (!v.colony && v.population >= B.COLONY_SOURCE_POP && live < 150 && happens(this.civRnd, B.COLONY_RATE * (1 + 0.25 * Math.floor(v.tech)) * (crowded ? B.COLONY_PRESSURE_CROWDED : 1), yr)) {
        const motive = this.colonyMotive(v, crowded);
        if (motive && !this.organizeColony(v, motive) && crowded) this.colonizeBySea(v);
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

  /** O assentamento tem o prédio pronto (com `planned`, conta também a obra em andamento). */
  private has(v: Village, kind: BuildingKind, planned = false): boolean {
    return v.houses.some((h) => h.kind === kind && (planned || !h.site));
  }

  private roleContext(v: Village): RoleContext {
    const herd = !!v.herd && v.herd.head > 0;
    return {
      port: v.port >= 0,
      smithy: this.has(v, 'smithy'),
      warlike: v.culture.value === 'guerra' || this.plans.has(v.kingdom),
      herd,
      stable: this.has(v, 'stable'),
      loom: this.has(v, 'loom'),
      pottery: this.has(v, 'pottery'),
      windmill: this.has(v, 'windmill'),
      market: this.has(v, 'market'),
      temple: this.has(v, 'temple'),
      fields: v.fields > 0,
      vocation: v.vocation ? VOCATION_ROLE[v.vocation] : undefined,
    };
  }

  /** O que entra no teto do estoque do assentamento (RF-VIDA-218). */
  capContext(v: Village): CapContext {
    return { tier: this.scale(v), granary: this.has(v, 'granary'), warehouse: this.has(v, 'warehouse'), treasury: this.has(v, 'market'), mines: v.mines.length };
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
    // Obra nova só com o conserto das casas garantido: sem isso as casas velhas caem por falta de madeira (seção 19.20).
    const reserve = kind === 'mine' || kind === 'port' ? 0 : this.repairs(v).wood * B.REPAIR_RESERVE;
    if (st.wood < c.wood + reserve || st.stone + st.brick < c.stone || st.gold < c.gold) return false;
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
   * Avança o conhecimento (usado em difusão comercial e testes). Mudar de etapa
   * continua respeitando a sequência física dos materiais e dos pontos.
   */
  private advance(v: Village, amount: number): void {
    const era = Math.floor(v.tech);
    let next = Math.min(ERAS.length - 1, v.tech + amount);
    const kmade = this.villages[v.kingdom].made;
    const m = {
      bronze: Math.max(v.made.bronze, kmade.bronze),
      iron: Math.max(v.made.iron, kmade.iron),
      steel: Math.max(v.made.steel, kmade.steel),
      stone: Math.max(v.made.stone, kmade.stone),
      coal: Math.max(v.made.coal, kmade.coal),
    };
    const techGate =
      (era === 0 && this.knew(v, 'fundicao')) ||
      (era === 1 && this.knew(v, 'siderurgia')) ||
      (era === 2 && this.knew(v, 'aco')) ||
      (era === 3 && this.knew(v, 'vapor'));
    if (
      Math.floor(next) > era &&
      era < ERA_NEEDS.length &&
      (!techGate && (!ERA_NEEDS[era].met(m) || !P.pointsMet(v.pts ?? P.emptyPoints(), era)))
    ) {
      next = Math.min(next, era + 0.999);
    }
    v.tech = next;
  }

  /** Técnicas conhecidas (seção 19.10). */
  knows(v: Village): ReadonlySet<string> {
    return new Set(v.techs ?? []);
  }

  private knew(v: Village, id: string): boolean {
    return !!v.techs && v.techs.includes(id);
  }

  /** Aprende uma técnica: guarda e registra na crônica, com destaque para a primeira do mundo (RF-VIDA-274). */
  private learn(v: Village, t: P.Tech, how: string): void {
    if (this.knew(v, t.id)) return;
    (v.techs ??= []).push(t.id);
    if (v.samples) delete v.samples[t.id];
    const first = !this.techsSeen.has(t.id);
    this.techsSeen.add(t.id);
    this.note(`${v.name} ${how} ${t.name}: ${t.gives}`, 'economia', v, first ? { major: true } : { key: `tech-${t.id}` });
  }

  /** Assentamentos de onde vêm ideias: o mesmo reino e os parceiros de acordo comercial (RF-VIDA-74). */
  private partnersOf(v: Village): Village[] {
    const out = this.villages.filter((o) => o !== v && !o.abandoned && o.kingdom === v.kingdom);
    for (const g of this.agreements) {
      const o = g.a === v.id ? this.villages[g.b] : g.b === v.id ? this.villages[g.a] : null;
      if (o && !o.abandoned && !out.includes(o)) out.push(o);
    }
    return out;
  }

  private useContext(v: Village): P.UseContext {
    const st = v.stock;
    const kmade = this.villages[v.kingdom].made;
    const reach = this.radius(v) + 25;
    let softOre = st.copper + st.tin + st.gold > 0;
    let ironOre = st.iron > 0;
    let coal = st.coal > 0;
    for (const d of this.deposits) {
      if (d.amount <= 0 || (!d.known.has(v.kingdom) && d.mine !== v.id)) continue;
      if (d.mine !== v.id && this.distance(v, d.x + 0.5, d.y + 0.5) > reach) continue;
      if (d.ore === 'copper' || d.ore === 'tin' || d.ore === 'gold') softOre = true;
      else if (d.ore === 'iron') ironOre = true;
      else if (d.ore === 'coal') coal = true;
    }
    const herbivores = (!!v.herd && v.herd.head > 0) || this.species.some((sp, k) => sp.kind === 'herbivore' && this.population[k] > 0);
    return {
      tech: v.tech,
      tier: this.scale(v),
      wet: !!v.wet,
      herd: v.herd && v.herd.head > 0 ? v.herd.kind : undefined,
      farming: v.fields > 0,
      smithy: this.has(v, 'smithy'),
      market: this.has(v, 'market'),
      temple: this.has(v, 'temple'),
      mill: this.has(v, 'windmill'),
      coal,
      herbivores,
      tools: st.tools >= 1,
      softOre,
      ironOre,
      forgedBronze: v.made.bronze + kmade.bronze >= 1,
      forgedIron: v.made.iron + kmade.iron >= 1,
      stoneWorked: v.made.stone + kmade.stone >= 8 || st.stone >= 4,
    };
  }

  private pillarContext(v: Village): P.PillarContext {
    const cap = this.capOf(v, 'food');
    return {
      welfare: v.needs ? welfare(v.needs) : 1,
      foodFill: cap > 0 ? Math.min(1, v.food / cap) : 0,
      farming: v.fields > 0 || v.port >= 0,
      herd: !!v.herd && v.herd.head > 0,
      mines: v.mines.length > 0,
      smithy: this.has(v, 'smithy'),
      techs: v.techs?.length ?? 0,
      completeness: v.completeness ?? 0,
      port: v.port >= 0,
      market: this.has(v, 'market'),
      agreements: this.agreements.filter((g) => g.a === v.id || g.b === v.id).length,
      fair: v.fair !== undefined && this.year - v.fair < 3,
      temple: this.has(v, 'temple'),
      monument: this.has(v, 'statue') || this.has(v, 'wonder'),
      luxuryJoy: !!v.luxuryJoy,
      leader: v.leader >= 0 && !!this.alive[v.leader],
      tier: this.scale(v),
      stability: v.stability ?? 1,
      linked: !!v.linked,
      kingdom: this.kingdomSize(this.capitalOf(v)) > 1,
    };
  }

  /**
   * Desenvolvimento orgânico do assentamento (seção 19.10): nível e pontos de
   * cada pilar, progresso tecnológico pelo que o povo domina e constrói,
   * experimentação individual dos trabalhadores no ofício (com ensino gradual à
   * aldeia e risco de perda se o descobridor morrer antes), difusão pelos
   * vizinhos (RF-VIDA-271) e esquecimento raro num colapso (RF-VIDA-275).
   */
  private develop(v: Village, dt: number, adults: number[] = []): void {
    const yr = dt / YEAR_SECONDS;
    v.peak = Math.max(v.peak ?? 0, v.population);
    const levels = P.pillarLevels(this.pillarContext(v));
    v.levels = levels;
    const pts = (v.pts ??= P.emptyPoints());
    P.pointsFor(levels, yr, v.vocation).forEach((p, i) => (pts[i] += p));

    // Ensino em andamento: o descobridor passa a técnica aos poucos para a aldeia.
    if (v.pendingTech) {
      const aliveHere = adults.some((i) => this.uid[i] === v.pendingTech!.uid);
      // Sem o professor na aldeia, um aprendiz pode assumir; ele continua a partir do próximo passo.
      if (!aliveHere && adults.length > 0) this.losePendingTech(v, 'partiu');
      else {
        const wise = v.culture.value === 'conhecimento' ? 1.25 : 1;
        const written = this.knew(v, 'escrita') ? 1.2 : 1;
        v.pendingTech.progress += yr * P.TECH_TEACH_VILLAGE_RATE * wise * written;
        if (v.pendingTech.progress >= 1) {
          const t = P.TECH_BY_ID[v.pendingTech.id];
          const teacher = v.pendingTech.name;
          v.pendingTech = undefined;
          if (t) this.learn(v, t, `aprendeu com ${teacher}`);
        }
      }
    }

    // Atualiza o nível tecnológico orgânico pelo que a aldeia já domina e produz.
    const kmade = this.villages[v.kingdom].made;
    const organic = P.organicTech({
      techs: this.knows(v),
      tier: this.scale(v),
      fields: v.fields,
      herd: !!v.herd && v.herd.head > 0,
      port: v.port >= 0,
      smithy: this.has(v, 'smithy'),
      market: this.has(v, 'market'),
      madeBronze: Math.max(v.made.bronze, kmade.bronze),
      madeIron: Math.max(v.made.iron, kmade.iron),
      madeSteel: Math.max(v.made.steel, kmade.steel),
      madeStone: Math.max(v.made.stone, kmade.stone),
      madeCoal: Math.max(v.made.coal, kmade.coal),
      tools: v.stock.tools,
    });
    if (organic > v.tech) v.tech = organic;

    // Técnicas: no máximo quatro vezes por ano, com a chance do tempo passado.
    const since = this.year - (v.learnAt ?? 0);
    if (since < 0.25) return;
    v.learnAt = this.year;
    const known = this.knows(v);
    const learnable = P.learnable(known, v.tech);
    if (learnable.length) {
      const use = this.useContext(v);
      const partners = this.partnersOf(v);
      const press = known.has('imprensa') || partners.some((o) => o.techs?.includes('imprensa')) ? 1.5 : 1;
      const wise = v.culture.value === 'conhecimento' ? 1.25 : 1;
      const dev = P.devSpeed(levels) * wise * (known.has('escrita') ? 1.15 : 1);
      const fedEnough = (v.needs?.food ?? 1) >= 0.4;
      for (const t of learnable) {
        const taught = partners.some((o) => o.techs?.includes(t.id));
        if (taught && (t.use(use) || known.size >= t.needs.length) && happens(this.lore, P.TECH_NEIGHBOR_RATE * press * 0.45, since)) {
          if (v.pendingTech?.id === t.id) v.pendingTech = undefined;
          this.learn(v, t, 'aprendeu com os vizinhos');
          continue;
        }
        // Experimentação individual: trabalhadores do ofício com recursos disponíveis descobrem e ensinam.
        if (!v.pendingTech && fedEnough && t.use(use) && adults.length > 0) {
          const workers = adults.filter((i) => t.roles.includes(ROLES[this.role[i]]));
          const pool = workers.length > 0 ? workers : adults.length <= 6 ? adults : [];
          if (pool.length > 0) {
            let curiosity = 0;
            for (const i of pool) curiosity += this.curiosity(i);
            const effCuriosity = Math.min(4.5, curiosity);
            const sample = (v.samples?.[t.id] ?? -Infinity) > this.year ? P.TECH_SAMPLE_BOOST : 1;
            if (happens(this.lore, P.TECH_DISCOVER_RATE * effCuriosity * dev * sample, since)) {
              // Escolhe o descobridor ponderado pela curiosidade individual.
              let pick = pool[0];
              let r = this.lore() * curiosity;
              for (const i of pool) {
                r -= this.curiosity(i);
                if (r <= 0) {
                  pick = i;
                  break;
                }
              }
              const fullName = `${personName(this.uid[pick], v.culture.id)} ${familyName(this.family[pick], v.culture.id)}`;
              v.pendingTech = { id: t.id, uid: this.uid[pick], name: fullName, progress: 0 };
              this.note(`${fullName} descobriu ${t.name} em ${v.name} e começou a ensinar o povo`, 'economia', v, { key: `disc-${v.id}-${t.id}` });
            }
          }
        }
      }
    }
    // Colapso: gente demais perdida ou estabilidade no chão.
    const collapse = ((v.peak ?? 0) >= 20 && v.population < (v.peak ?? 0) * 0.4) || (v.stability ?? 1) < 0.12;
    if (collapse && (v.techs?.length ?? 0) > 0 && happens(this.lore, P.DECAY_RATE, since)) {
      const lost = P.forgettable(known);
      if (lost.length) {
        const t = lost[Math.floor(this.lore() * lost.length)];
        v.techs = v.techs!.filter((id) => id !== t.id);
        this.note(`${v.name} esqueceu ${t.name} depois do colapso`, 'economia', v, { major: true });
      }
    }
  }

  /**
   * Quem ensinava a técnica morreu ou partiu: com o ensino adiantado, o
   * aprendiz mais curioso do ofício guarda parte e continua (sem sorteio);
   * senão a descoberta se perde. Perder o sábio abala a aldeia.
   */
  private losePendingTech(v: Village, how: 'morreu' | 'partiu', quiet = false): void {
    const p = v.pendingTech;
    if (!p) return;
    v.pendingTech = undefined;
    const t = P.TECH_BY_ID[p.id];
    if (!t) return;
    v.stability = Math.max(0, (v.stability ?? 1) - P.TECH_LOSS_STABILITY);
    let heir = -1;
    if (p.progress >= P.TECH_RESCUE_MIN) {
      let best = -1;
      for (let j = 0; j < this.count; j++) {
        if (!this.alive[j] || this.village[j] !== v.id || this.uid[j] === p.uid || this.role[j] === CHILD) continue;
        // Quem trabalha no ofício aprendeu mais de perto; os outros só se não houver ninguém dele.
        const c = this.curiosity(j) + (t.roles.includes(ROLES[this.role[j]]) ? 10 : 0);
        if (c > best) {
          best = c;
          heir = j;
        }
      }
    }
    const verb = how === 'morreu' ? 'morreu' : 'partiu';
    if (heir >= 0) {
      const name = `${personName(this.uid[heir], v.culture.id)} ${familyName(this.family[heir], v.culture.id)}`;
      v.pendingTech = { id: t.id, uid: this.uid[heir], name, progress: P.TECH_RESCUE_KEEP };
      if (!quiet) this.note(`${p.name} ${verb} antes de ensinar ${t.name} a ${v.name}, mas ${name}, aprendiz, guardou parte do que aprendeu`, 'economia', v);
    } else if (!quiet) this.note(`${p.name} ${verb} antes de ensinar ${t.name} a ${v.name}`, 'economia', v);
  }

  /** Passa uma técnica entre dois assentamentos que se encontram (caravana, feira). */
  private shareTech(a: Village, b: Village, chance: number): void {
    for (const [from, to] of [[a, b], [b, a]] as const) {
      const known = this.knows(to);
      const options = P.learnable(known, to.tech).filter((t) => from.techs?.includes(t.id));
      if (options.length && happens(this.lore, chance, 1)) this.learn(to, options[Math.floor(this.lore() * options.length)], 'aprendeu com os mercadores');
    }
  }

  /** O jogador ensina: uma técnica que o povo pode aprender entra de uma vez (RF-VIDA-75). */
  private teachTech(v: Village): void {
    const options = P.learnable(this.knows(v), v.tech);
    if (!options.length) return;
    const use = this.useContext(v);
    const useful = options.filter((t) => t.use(use));
    const pool = useful.length ? useful : options;
    this.learn(v, pool[Math.floor(this.lore() * pool.length)], 'aprendeu com você');
  }

  /** Recursos conhecidos que ainda não se usam (RF-VIDA-272). */
  latent(v: Village): string[] {
    const r = this.radius(v) + 12;
    const ores = new Set<string>();
    for (const d of this.deposits) if (d.amount > 0 && this.distance(v, d.x + 0.5, d.y + 0.5) < r) ores.add(d.ore);
    let herbivores = false;
    this.forEachNear(v.x, v.y, this.radius(v) + 20, (j) => {
      if (this.species[this.kind[j]].kind === 'herbivore') herbivores = true;
    });
    return P.latentResources({ wet: !!v.wet, ores: [...ores], era: Math.floor(v.tech), techs: this.knows(v), herbivores: herbivores && v.tech < 1.5, tools: v.stock.tools >= 1 });
  }

  /** Próximo passo lógico do assentamento (ou o que falta quando forçado por teste), ou null. */
  eraNeed(v: Village): string | null {
    const era = Math.floor(v.tech);
    if (era >= ERA_NEEDS.length) return null;
    const use = this.useContext(v);
    const step = P.nextStepText({
      techs: this.knows(v),
      era,
      tools: v.stock.tools,
      wet: !!v.wet,
      smithy: this.has(v, 'smithy'),
      softOre: !!use.softOre,
      ironOre: !!use.ironOre,
      coal: use.coal,
      pendingTech: v.pendingTech?.id,
      discovererName: v.pendingTech?.name,
    });
    const kmade = this.villages[v.kingdom].made;
    const m = {
      bronze: Math.max(v.made.bronze, kmade.bronze),
      iron: Math.max(v.made.iron, kmade.iron),
      steel: Math.max(v.made.steel, kmade.steel),
      stone: Math.max(v.made.stone, kmade.stone),
      coal: Math.max(v.made.coal, kmade.coal),
    };
    const metal = ERA_NEEDS[era].met(m) ? null : ERA_NEEDS[era].text;
    const points = P.pointsText(v.pts ?? P.emptyPoints(), era);
    if (step) return metal && !step.includes('bronze') && era === 0 ? `${step} (${metal})` : step;
    return metal && points ? `${metal}; ${points}` : metal ?? points;
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
      if (isRockyBiome(b) || this.map.elevation[t] > 0.35) rock = true;
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
    v.crew = w[ROLE.builder];
    const cutters = w[ROLE.woodcutter] + (this.scale(v) === 0 && v.population <= 4 && st.wood < 6 ? w[ROLE.leader] * 0.5 : 0);
    if (cutters && !B.PRESENCE_WOOD) this.cutWood(v, cutters * B.CUT_RATE * yr * tools * bonus('madeireira'), this.has(v, 'sawmill') ? 1.3 : 1);
    // Coletores trazem frutos, raízes e mel do mato, que se gasta e rebrota (seção 19.19). Numa aldeia pequenina, o líder também ajuda a colher.
    if (this.scale(v) === 0 && v.population <= 6 && w[ROLE.leader] && v.food < 6 && v.forest > 0.2) {
      this.book(v, '_gather', this.put(v, 'food', w[ROLE.leader] * B.GATHER_RATE * 0.6 * yr * this.harvest(v)), 0);
    }
    if (w[ROLE.gatherer]) this.gather(v, w[ROLE.gatherer] * B.GATHER_RATE * yr * this.harvest(v) * B.SEASON_HARVEST[season] ** 0.5);
    // Minas: o minério sai da jazida (limitada) para o estoque do assentamento que a explora.
    const mines = v.mines.map((id) => this.deposits[id]);
    if (mines.length && w[ROLE.miner]) {
      const each = (w[ROLE.miner] * 0.8 * yr * tools * bonus('mineira')) / mines.length;
      for (const d of mines) {
        const take = this.gain(v, d.ore, Math.min(d.amount, each));
        d.amount -= take;
        if (d.ore === 'coal') {
          v.made.coal += take;
          if (v.kingdom !== v.id) made.coal += take;
        }
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
    if (quarry) {
      const q = this.quarry(v, quarry * B.QUARRY_RATE * yr * tools);
      v.made.stone += q;
      if (v.kingdom !== v.id) made.stone += q;
    }
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
    // Ferramentas e armas iniciais: construtores, coletores e mineradores lascam pedra e madeira (sem ferraria).
    if (st.stone >= 1 && st.wood >= 1 && this.civRnd() < (w[ROLE.builder] + w[ROLE.gatherer] + w[ROLE.miner]) * 0.18 * yr) {
      this.spend(v, 'stone', 1);
      this.spend(v, 'wood', 1);
      this.craft(v, st, this.needed(st, adults, soldiers, v), 'stone', era);
    }
    // Ferraria: cada ferreiro faz uma peça a cada ano e pouco, se houver metal e técnica; a fábrica dobra o ritmo.
    if (w[ROLE.blacksmith] && this.has(v, 'smithy')) {
      const factory = this.has(v, 'factory') ? 2 : 1;
      const known = this.knows(v);
      v.forgeWork += w[ROLE.blacksmith] * 0.6 * yr * factory * bonus('mineira');
      while (v.forgeWork >= 1) {
        // Ouro vira joia de vez em quando (anéis, amuletos e a coroa do rei).
        if ((era >= 1 || known.has('fundicao')) && st.gold >= 2 && this.civRnd() < 0.2) {
          this.spend(v, 'gold', 2);
          v.forgeWork -= 1;
          this.craft(v, st, 'joia', 'gold', era);
          continue;
        }
        const before = st.copper + st.tin + st.iron + st.coal;
        const piece = forge(st, era, known);
        if (!piece) {
          v.forgeWork = 0;
          break;
        }
        this.book(v, 'metal', 0, before - (st.copper + st.tin + st.iron + st.coal));
        v.forgeWork -= 1;
        v.made[piece.kind]++;
        if (v.kingdom !== v.id) made[piece.kind]++;
        this.craft(v, st, this.needed(st, adults, soldiers, v), TIER_MATERIAL[piece.tier], era);
      }
    }
    // Abre uma mina numa jazida conhecida, respeitando a sequência de materiais que o povo já sabe explorar.
    if (w[ROLE.miner] && v.mines.length < 1 + this.scale(v) && happens(this.civRnd, B.MINE_RATE, dt / YEAR_SECONDS)) this.openMine(v);
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
    const horses = this.knew(v, 'montaria') && (v.stock.horses > 0 || (!!v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat'));
    const carts = 1 + B.CART_PER_ERA * Math.floor(v.tech) + (this.knew(v, 'roda') ? 0.5 : 0) + (horses ? B.HORSE_HAUL : 0);
    return 1 / (1 + d / (B.HAUL_TILES * carts));
  }

  /** Tile com uma árvore de pé que o povo pode cortar. */
  standingTree(t: number): boolean {
    return isLand(this.map, t) && !this.road[t] && !this.built[t] && isTree(decorAt(this.map, t));
  }

  /** Depois de carregar um save de antes das ações presenciais: os vetores novos nascem zerados, do tamanho dos demais. */
  fixAfterLoad(): void {
    const n = this.x.length;
    if (this.jobKind.length < n) this.jobKind = new Uint8Array(n);
    if (this.job.length < n) this.job = new Int32Array(n);
    if (this.jobWork.length < n) this.jobWork = new Float32Array(n);
    if (this.jobWait.length < n) this.jobWait = new Float32Array(n);
    if (this.home.length < n) this.home = new Int32Array(n).fill(-1);
    // Saves de antes do plano novo dos assentamentos: sem muralha e com os contadores novos zerados.
    if (!this.wall || this.wall.length !== this.map.width * this.map.height) this.wall = new Uint8Array(this.map.width * this.map.height);
    const tally = this.tally as Record<string, number>;
    for (const k of ['soloFounds', 'colonies', 'farmsteads', 'merged', 'shortLived', 'lastWaves', 'tierDowns', 'interMarriages', 'annexations', 'revolts', 'capitalMoves', 'newPeoples', 'aid', 'aidRefused', 'rivalries', 'visits', 'festivals']) tally[k] ||= 0;
    // Saves de antes da fauna nova: sem ação, destino nem parasitas; pasto e medo zerados.
    if (this.act.length < n) this.act = new Uint8Array(n);
    if (this.goal.length < n) this.goal = new Int32Array(n).fill(-1);
    if (this.chase.length < n) this.chase = new Int32Array(n).fill(-1);
    if (this.effort.length < n) this.effort = new Uint8Array(n);
    if (this.parasite.length < n) this.parasite = new Float32Array(n);
    const tiles = this.map.width * this.map.height;
    if (!this.graze || this.graze.length !== tiles) this.graze = new Float32Array(tiles);
    if (!this.grazeAt || this.grazeAt.length !== tiles) this.grazeAt = new Float32Array(tiles);
    const cells = Math.ceil(this.map.width / ECO_CELL) * Math.ceil(this.map.height / ECO_CELL);
    if (!this.fear || this.fear.length !== cells) this.fear = new Float32Array(cells);
    if (!(this.threatened instanceof Set)) (this as { threatened: Set<number> }).threatened = new Set();
    // O save guarda os campos das células, não a classe; células de um save antigo são refeitas.
    // O save guarda os campos das células, não a classe: devolve os métodos (ou refaz se o save é antigo).
    if (this.cells && (!this.cells.hunters || !this.cells.bseason)) this.cells = null;
    if (this.cells && !(this.cells instanceof EcoCells)) Object.setPrototypeOf(this.cells, EcoCells.prototype);
    if (this.weather && !this.weather.base) this.weather = null;
    if (this.weather && !(this.weather instanceof Weather)) Object.setPrototypeOf(this.weather, Weather.prototype);
    this.tally.wildfires ??= 0;
    if (this.cells) Object.setPrototypeOf(this.cells, EcoCells.prototype);
    this.tally.wildStarved = this.tally.wildStarved || 0;
    this.tally.wildStarvedNearFood = this.tally.wildStarvedNearFood || 0;
    this.tally.marriages = this.tally.marriages || 0;
    this.tally.fights = this.tally.fights || 0;
    // Saves de antes da IA local: traços sorteados para quem já vivia.
    if (this.traits.length < n * TRAIT_COUNT) {
      const old = this.traits;
      this.traits = new Int8Array(n * TRAIT_COUNT);
      this.traits.set(old);
      for (let i = old.length / TRAIT_COUNT; i < this.count; i++) {
        if (this.alive[i] && this.species[this.kind[i]].kind === 'sapient') randomTraits(this.traits, i, this.mindRnd, this.villages[this.village[i]]?.culture.value);
      }
    }
  }

  // ---- Ações presenciais (seção 19.21) ----

  /** Alguém vivo reservou o tile (que não seja `i`) e ainda mira nele. */
  private claimed(t: number, i: number): boolean {
    const j = this.jobClaim.get(t);
    return j !== undefined && j !== i && this.alive[j] === 1 && this.jobKind[j] > 0 && this.job[j] === t;
  }

  private claim(i: number, t: number, kind: number): void {
    this.job[i] = t;
    this.jobKind[i] = kind;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
    this.jobClaim.set(t, i);
  }

  /** Larga a ordem e libera a reserva. */
  private dropJob(i: number): void {
    if (this.jobKind[i] && this.jobClaim.get(this.job[i]) === i) this.jobClaim.delete(this.job[i]);
    this.jobKind[i] = 0;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
  }

  /** A ordem ainda faz sentido: o alvo continua lá (ninguém cortou, plantou ou construiu por cima). */
  private jobValid(i: number): boolean {
    const t = this.job[i];
    if (this.jobKind[i] === JOB.fell) return this.standingTree(t);
    if (this.jobKind[i] === JOB.plant) return this.map.felled![t] === 1 && isLand(this.map, t) && !this.road[t] && !this.built[t];
    return false;
  }

  /** Árvore de pé livre mais perto do assentamento (a lista é refeita no máximo uma vez por ano). */
  private freeTree(v: Village, i: number): number {
    for (let pass = 0; pass < 2; pass++) {
      const list = v.treeList;
      if (list) {
        let k = v.treeNext ?? 0;
        while (k < list.length && !this.standingTree(list[k])) k++;
        v.treeNext = k;
        // Entre as primeiras árvores livres da lista, a que está mais perto de quem vai cortar (menos andar entre um corte e outro).
        let best = -1;
        let bd = Infinity;
        for (let seen = 0; k < list.length && seen < B.JOB_CHOICES; k++) {
          const t = list[k];
          if (!this.standingTree(t) || this.claimed(t, i) || (this.jobBlocked.get(t) ?? 0) > this.year) continue;
          seen++;
          const w = this.map.width;
          const d = Math.hypot(wrapDx((t % w) + 0.5 - this.x[i], w), Math.floor(t / w) + 0.5 - this.y[i]);
          if (d < bd) {
            bd = d;
            best = t;
          }
        }
        if (best >= 0) return best;
      }
      if (list && v.treeScan === Math.floor(this.year)) return -1;
      this.scanTrees(v);
    }
    return -1;
  }

  /** Toco ao alcance que ninguém está plantando. */
  private freeStump(v: Village, i: number): number {
    const reach = this.reachOf(v, B.WOOD_REACH);
    const w = this.map.width;
    let n = 0;
    for (const t of this.stumps) {
      if (++n > 6000) break;
      if (this.map.felled![t] !== 1 || this.road[t] || this.built[t] || this.claimed(t, i)) continue;
      if ((this.jobBlocked.get(t) ?? 0) > this.year) continue;
      if (this.distance(v, (t % w) + 0.5, Math.floor(t / w) + 0.5) > reach) continue;
      return t;
    }
    return -1;
  }

  /**
   * Ordem do lenhador (seção 19.21): mantém a que tem ou pega outra do quadro do assentamento.
   * Planta uma muda quando as árvores cortadas deixaram mudas a plantar (ou não há o que cortar);
   * derruba quando há lugar no armazém. Devolve o tile da ordem, ou -1 sem ordem.
   */
  private pickJob(i: number, v: Village): number {
    if (this.jobKind[i] && !this.jobValid(i)) this.dropJob(i);
    if (!this.jobKind[i]) {
      let t = -1;
      let kind: number = JOB.fell;
      if (v.forestry && (v.plantDue ?? 0) >= 1) {
        t = this.freeStump(v, i);
        kind = JOB.plant;
      }
      if (t < 0 && v.stock.wood + this.woodPerTree(v) <= this.capOf(v, 'wood')) {
        t = this.freeTree(v, i);
        kind = JOB.fell;
      }
      if (t < 0 && v.forestry && kind !== JOB.plant) {
        t = this.freeStump(v, i);
        kind = JOB.plant;
      }
      if (t >= 0) this.claim(i, t, kind);
    }
    return this.jobKind[i] ? this.job[i] : -1;
  }

  /** Madeira de uma árvore derrubada (a serraria aproveita mais de cada tronco). */
  private woodPerTree(v: Village): number {
    return B.WOOD_PER_TREE * (this.has(v, 'sawmill') ? 1.3 : 1);
  }

  /** Velocidade do gesto: ferramenta e vocação aceleram; mata longe do assentamento atrasa (carregar). */
  private jobSpeed(v: Village, t: number, kind: number): number {
    let k = (v.stock.tools > 0 ? B.TOOL_SPEED : 1) * (v.vocation === 'madeireira' ? 1 + B.VOCATION_BONUS : 1);
    if (kind === JOB.fell) k *= this.haulFactor(v, t);
    return k;
  }

  /** Vetor do indivíduo até o ponto de trabalho da ordem: o centro do tile, ou da casa (2x2) numa obra. */
  private jobDelta(i: number): [number, number] {
    const w = this.map.width;
    const t = this.job[i];
    const off = this.jobKind[i] === JOB.build ? 1 : 0.5;
    return [wrapDx((t % w) + off - this.x[i], w), Math.floor(t / w) + off - this.y[i]];
  }

  /** A ordem em andamento ainda combina com a profissão e a idade de quem a faz. */
  private jobFits(i: number, v: Village, role: number, working: boolean): boolean {
    if (!working) return false;
    return this.jobKind[i] === JOB.build ? this.canBuildHere(v, role) : role === ROLE.woodcutter;
  }

  /** Quem constrói: os construtores e, quando o assentamento não tem nenhum, coletores e o líder (todo mundo ajuda a levantar o primeiro abrigo). */
  private canBuildHere(v: Village, role: number): boolean {
    return role === ROLE.builder || ((v.crew ?? 1) === 0 && (role === ROLE.gatherer || role === ROLE.leader));
  }

  /** Obra ainda em andamento (também a dos saves de antes, que contavam em anos). */
  underWork(h: Building): boolean {
    return (h.labor ?? 0) > 0 || (h.workUntil ?? 0) > this.year;
  }

  /** Abre uma obra: `years` de trabalho de um construtor (um ano de jogo = `YEAR_SECONDS` segundos de trabalho). */
  private startWork(h: Building, years: number, site: boolean): void {
    if (!B.PRESENCE_BUILD) {
      h.workUntil = this.year + years;
      return;
    }
    h.labor = h.laborMax = years * YEAR_SECONDS * B.BUILD_LABOR;
    h.site = site || undefined;
    h.workUntil = undefined;
  }

  /** A obra que o indivíduo atende, pelo tile da casa. */
  private siteFor(i: number, v: Village): Building | undefined {
    const w = this.map.width;
    const t = this.job[i];
    let b = this.siteCache.get(i);
    if (!b || b.x + b.y * w !== t) {
      b = v.houses.find((h) => h.x + h.y * w === t);
      if (b) this.siteCache.set(i, b);
      else this.siteCache.delete(i);
    }
    return b;
  }

  /** Mantém a obra que tem ou pega a mais perto com vaga (`JOB_SLOTS_BUILD`). Devolve se há obra para ir. */
  private pickBuildJob(i: number, v: Village): boolean {
    if (this.jobKind[i] === JOB.build) {
      const b = this.siteFor(i, v);
      if (b && (b.labor ?? 0) > 0 && v.houses.includes(b)) return true;
      this.dropJob(i);
    } else if (this.jobKind[i]) this.dropJob(i);
    const w = this.map.width;
    let best: Building | null = null;
    let bd = Infinity;
    for (const h of v.houses) {
      if ((h.labor ?? 0) <= 0 || (h.crew ?? 0) >= B.JOB_SLOTS_BUILD) continue;
      const d = Math.hypot(wrapDx(h.x + 1 - this.x[i], w), h.y + 1 - this.y[i]);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    if (!best) return false;
    best.crew = (best.crew ?? 0) + 1;
    this.job[i] = best.x + best.y * w;
    this.jobKind[i] = JOB.build;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
    this.siteCache.set(i, best);
    return true;
  }

  /** Bate na obra: com o indivíduo ao pé da casa, o trabalho que falta cai a cada segundo; zerado, a casa está pronta. */
  private workBuild(i: number, v: Village, dt: number): void {
    const b = this.siteFor(i, v);
    if (!b || (b.labor ?? 0) <= 0 || !this.canBuildHere(v, this.role[i])) {
      this.dropJob(i);
      return;
    }
    const [dx, dy] = this.jobDelta(i);
    if (dx * dx + dy * dy > B.BUILD_REACH * B.BUILD_REACH) {
      if ((this.jobWait[i] += dt) > B.JOB_TIMEOUT) this.dropJob(i);
      return;
    }
    this.jobWait[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    b.labor = Math.max(0, b.labor! - dt * (v.stock.tools > 0 ? B.TOOL_SPEED : 1));
    if (b.labor > 0) return;
    b.site = undefined;
    this.dropJob(i);
  }

  /** Quantos trabalham em cada obra agora (revisto a cada segundo, para quem morreu ou mudou de ofício sair da conta). */
  private recountCrews(): void {
    for (const v of this.villages) for (const h of v.houses) h.crew = 0;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.jobKind[i] !== JOB.build || this.village[i] < 0) continue;
      const b = this.siteFor(i, this.villages[this.village[i]]);
      if (b) b.crew = (b.crew ?? 0) + 1;
    }
  }

  /** Anda reto até o ponto (dx, dy) relativo ao indivíduo, sem o vaivém do passeio. */
  private walkTo(i: number, speed: number, dx: number, dy: number): void {
    const len = Math.hypot(dx, dy) || 1;
    this.aimX[i] = dx;
    this.aimY[i] = dy;
    this.vx[i] = (dx / len) * speed;
    this.vy[i] = (dy / len) * speed;
  }

  private stand(i: number): void {
    this.aimX[i] = 0;
    this.aimY[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
  }

  /**
   * Trabalho de um indivíduo com ordem, a cada passo: só conta com ele no tile (a até `JOB_REACH`);
   * ao completar o gesto o mundo muda e o produto vai ao estoque (nunca passa do teto do armazém).
   */
  private workJob(i: number, dt: number): void {
    const vi = this.village[i];
    const v = vi >= 0 ? this.villages[vi] : null;
    if (!v || v.abandoned) {
      this.dropJob(i);
      return;
    }
    if (this.jobKind[i] === JOB.build) {
      this.workBuild(i, v, dt);
      return;
    }
    if (this.role[i] !== ROLE.woodcutter || !this.jobValid(i)) {
      this.dropJob(i);
      return;
    }
    const t = this.job[i];
    const [dx, dy] = this.jobDelta(i);
    if (dx * dx + dy * dy > B.JOB_REACH * B.JOB_REACH) {
      // Não chegou: depois de muito andar à toa o tile sai do quadro por uns anos (água no caminho, por exemplo).
      if ((this.jobWait[i] += dt) > B.JOB_TIMEOUT) {
        this.jobBlocked.set(t, this.year + B.JOB_BLOCK_YEARS);
        this.dropJob(i);
      }
      return;
    }
    this.jobWait[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    const kind = this.jobKind[i];
    this.jobWork[i] += dt * this.jobSpeed(v, t, kind);
    if (kind === JOB.fell) {
      if (this.jobWork[i] < B.FELL_SECONDS * (v.forestry ? 1 + B.REPLANT_WORK : 1)) return;
      const per = this.woodPerTree(v);
      // Sem lugar no armazém a árvore fica de pé: o gesto espera pronto.
      if (v.stock.wood + per > this.capOf(v, 'wood')) return;
      this.fellTree(t, !!v.forestry);
      this.put(v, 'wood', per);
      this.book(v, '_trees', 1, 0);
      if (v.forestry) v.plantDue = (v.plantDue ?? 0) + B.PLANT_PER_FELL;
    } else {
      if (this.jobWork[i] < B.PLANT_SECONDS) return;
      this.map.felled![t] = 3;
      this.treesPlanted++;
      v.plantDue = Math.max(0, (v.plantDue ?? 0) - 1);
      this.onTileChanged(t);
    }
    this.dropJob(i);
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

  /**
   * Terreiro (mapa organizado, pedido do Joab): dentro da área, árvore, toco ou muda colados numa
   * casa, prédio, rua, praça, roça ou pasto saem, e o chão fica limpo até o lugar ser abandonado.
   * A madeira das árvores vai para o estoque, até o teto.
   */
  private clearYards(v: Village): void {
    const map = this.map;
    const r = Math.ceil(this.radius(v));
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.road[t] || this.built[t] || map.bare?.[t] || !isLand(map, t)) continue;
        const decor = decorAt(map, t);
        if (!isTree(decor) && decor !== Decor.Stump && decor !== Decor.Sapling) continue;
        let yard = false;
        for (let oy = -1; oy <= 1 && !yard; oy++) {
          for (let ox = -1; ox <= 1 && !yard; ox++) {
            const n = this.tileAt(cx + dx + ox, cy + dy + oy);
            if (n >= 0 && (this.road[n] || this.built[n])) yard = true;
          }
        }
        if (!yard || this.settlementAt(cx + dx + 0.5, cy + dy + 0.5) !== v) continue;
        if (isTree(decor)) {
          this.put(v, 'wood', B.WOOD_PER_TREE);
          this.treesCut++;
        } else {
          map.felled![t] = 0;
          this.stumps.delete(t);
        }
        map.bare ??= new Uint8Array(map.width * map.height);
        map.bare[t] = 1;
        this.onTileChanged(t);
      }
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
    const total = isRockyBiome(b) ? B.STONE_ROCK : map.elevation[t] > 0.35 ? B.STONE_HILL : B.STONE_FIELD;
    return Math.max(0, total - this.stoneTaken[t]);
  }

  /** Quanto rende o trabalho num tile: rocha inteira, colina um pouco menos, pedra solta bem menos. */
  private stoneRate(t: number): number {
    const b = this.map.biome[t] as Biome;
    return isRockyBiome(b) ? 1 : this.map.elevation[t] > 0.35 ? 0.7 : B.FIELD_STONE_RATE;
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
      if (v.forestry && !B.PRESENCE_WOOD) planters.set(v.id, (planters.get(v.id) ?? 0) + B.PLANT_RATE);
    }
    for (const t of this.stumps) {
      if (!felled[t] || !isLand(map, t) || this.road[t] || this.built[t]) {
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
    const war = this.warOf(v.kingdom) !== null || this.plans.has(v.kingdom);
    if (!war && st.tools < adults * 0.3) return 'ferramenta';
    if (st.weapons < soldiers + 2 || (war && st.weapons <= st.armor)) return 'arma';
    if (st.armor < soldiers * (war ? 1 : 0.5)) return 'armadura';
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

  /** Minérios que o povo busca agora, conforme as técnicas que já domina. */
  private wanted(v: Village): Ore[] {
    if (this.knew(v, 'siderurgia') || v.tech >= 2) return ['coal', 'iron'];
    if (this.knew(v, 'fundicao') || v.tech >= 1) return ['iron', 'copper', 'tin'];
    return ['copper', 'tin'];
  }

  private openMine(v: Village): boolean {
    const w = this.map.width;
    const want = this.wanted(v);
    const canIron = this.knew(v, 'fundicao') || v.tech >= 1;
    const canCoal = this.knew(v, 'siderurgia') || v.tech >= 2;
    let best: Deposit | null = null;
    let score = Infinity;
    const reach = this.radius(v) + 25;
    for (const d of this.deposits) {
      if (d.amount <= 0 || d.mine >= 0 || !d.known.has(v.kingdom)) continue;
      if (d.ore === 'iron' && !canIron) continue;
      if (d.ore === 'coal' && !canCoal) continue;
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

  /**
   * Força de combate de um indivíduo: profissão, era, armas e armaduras do reino, cavalo
   * (RF-VIDA-223) e, no exército em campanha, comida e distância de casa (RF-VIDA-242).
   */
  private strength(i: number): number {
    const v = this.villages[this.village[i]];
    const st = this.store(v);
    const role = this.role[i];
    const rider = Math.floor(v.tech) >= 2 ? B.CAVALRY_STRENGTH : B.CHARIOT_STRENGTH;
    const base = role === ROLE.soldier ? (this.mounted(i) ? rider : 1.2) : role === ROLE.guard ? 1.1 : role === ROLE.king || role === ROLE.leader ? 0.8 : 0.4;
    const arms = 1 + 0.5 * st.weaponTier * Math.min(1, st.weapons / 10);
    const armor = 1 + 0.25 * st.armorTier * Math.min(1, st.armor / 10);
    const arena = this.villages[v.kingdom].houses.some((h) => h.kind === 'wonder') && this.villages[v.kingdom].culture.value === 'guerra' ? 1.15 : 1;
    return base * (1 + 0.15 * Math.floor(v.tech)) * arms * armor * arena * this.campaign(i, v);
  }

  /** Soldado montado: a parte dos soldados do assentamento que tem cavalo, do Bronze em diante (RF-VIDA-223). */
  mounted(i: number): boolean {
    if (this.role[i] !== ROLE.soldier || this.village[i] < 0) return false;
    const share = this.cavalry.get(this.village[i]) ?? 0;
    return share > 0 && (Math.imul(this.uid[i] + 1, 2654435761) >>> 0) / 4294967296 < share;
  }

  /** Força do soldado em campanha: perde com o exército sem comida e longe de casa (RF-VIDA-242). */
  private campaign(i: number, v: Village): number {
    if (this.role[i] !== ROLE.soldier) return 1;
    for (const war of this.wars) {
      if (war.a !== v.kingdom) continue;
      const fed = B.HUNGRY_ARMY + (1 - B.HUNGRY_ARMY) * war.supply;
      return fed * (this.distance(v, this.x[i], this.y[i]) > B.ARMY_REACH ? B.FAR_FROM_HOME : 1);
    }
    return 1;
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
      // O cavalo do soldado montado morre ou foge com ele.
      if (this.mounted(loser) && st.horses > 0) {
        st.horses--;
        const herd = this.villages[this.village[loser]].herd;
        if (herd && (herd.kind === 'horse' || herd.kind === 'camel') && herd.head > 0) herd.head--;
      }
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
    // O bando que já saqueou volta para casa com o saque.
    for (const war of this.wars) {
      if (war.a !== v.kingdom || war.returning !== undefined) continue;
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
        this.endWar(k);
        continue;
      }
      // Conquista pede soldados na praça; o saque acontece já na periferia, onde ficam roças, rebanho e celeiros.
      const inner = this.radius(target) * 0.6;
      const reach = war.motive === 'loot' ? this.radius(target) + 2 : inner;
      let attackers = 0;
      let defenders = 0;
      this.forEachNear(target.x, target.y, reach, (j, dx, dy) => {
        const vj = this.village[j];
        if (vj < 0 || this.species[this.kind[j]].kind !== 'sapient') return;
        const r = this.role[j];
        const kj = this.villages[vj].kingdom;
        if (kj === war.a && r === ROLE.soldier) attackers++;
        else if (kj === war.b && (r === ROLE.soldier || r === ROLE.guard) && dx * dx + dy * dy <= inner * inner) defenders++;
      });
      if (war.returning !== undefined) {
        // O bando com o saque saiu do alvo (ou demorou demais): o saque chega em casa e a guerra acaba.
        if ((attackers === 0 && this.year - war.returning >= 0.3) || this.year - war.returning >= B.LOOT_RETURN_YEARS) {
          this.bringLoot(war);
          this.endWar(k);
        }
        continue;
      }
      if (war.motive === 'loot') {
        // Saque: um bando que chega sem defesa à altura leva o que veio buscar e volta.
        if (attackers >= 1 && defenders < attackers + 1) this.plunder(war, target);
      } else if (attackers >= 3 && defenders === 0) {
        if (war.motive === 'extermination') this.exterminate(war, target);
        else this.conquer(war, target);
        this.endWar(k);
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

  /**
   * Fim de uma guerra: trégua mínima entre os dois (TRUCE_MIN anos) e os mercenários são dispensados.
   * Depois disso só o preparo segura uma guerra nova: o estoque gasto, as armas perdidas e os soldados
   * mortos têm de voltar a dar ao reino a sensação de vantagem.
   */
  private endWar(k: number): void {
    const war = this.wars[k];
    this.wars.splice(k, 1);
    this.truces.set(this.key(war.a, war.b), this.year + B.TRUCE_MIN);
    for (const i of this.mercenaries) {
      if (!this.alive[i] || this.village[i] < 0) {
        this.mercenaries.delete(i);
        continue;
      }
      const v = this.villages[this.village[i]];
      if (v.kingdom !== war.a && v.kingdom !== war.b) continue;
      // O mercenário fica onde está, com uma profissão de paz.
      this.role[i] = pickRole(Math.floor(v.tech), this.scale(v), this.civRnd(), this.roleContext(v));
      if (this.role[i] === ROLE.soldier) this.role[i] = ROLE.gatherer;
      this.mercenaries.delete(i);
    }
  }

  /** Rancor do vencido (RF-VIDA-243): a relação cai a cada ano até GRUDGE_YEARS. */
  private grudge(a: number, b: number, years = B.GRUDGE_YEARS): void {
    const key = this.key(a, b);
    this.grudges.set(key, Math.max(this.grudges.get(key) ?? 0, this.year + years));
  }

  /** Começa uma guerra (todas passam por aqui) e conta o pico. */
  private startWar(war: Omit<War, 'losses' | 'years' | 'supply' | 'mercs'>): War {
    const full: War = { ...war, losses: [0, 0], years: 0, supply: 1, mercs: [0, 0] };
    this.wars.push(full);
    const t = this.tally;
    if (war.motive === 'loot') t.lootWars++;
    else if (war.motive === 'extermination') t.exterminations++;
    else if (war.motive === 'civil') t.civilWars++;
    else t.landWars++;
    t.wars++;
    t.warsPeak = Math.max(t.warsPeak, this.wars.length);
    return full;
  }

  /** Nome do bem cobiçado na crônica: "os cavalos do haras de Votek". */
  private lootName(good: LootGood, v: Village, place = true): string {
    const what =
      good === 'horses' ? `os cavalos${this.has(v, 'stable') ? ' do haras' : ''}` : good === 'iron' ? 'o ferro' : good === 'gold' ? 'o ouro' : good === 'wood' ? 'a madeira' : 'a comida dos celeiros';
    return place ? `${what} de ${v.name}` : what;
  }

  /** O que a guerra de território quer tomar (RF-VIDA-240): jazida, porto, pasto, terra fértil ou o próprio lugar. */
  private prizeName(v: Village): string {
    if (v.mines.length) return `a jazida de ${ORE_NAMES[this.deposits[v.mines[0]].ore]} de ${v.name}`;
    if (v.port >= 0) return `o porto de ${v.name}`;
    if (v.herd && v.herd.head >= 4) return `os pastos de ${v.name}`;
    if (v.fields >= 2) return `as terras férteis de ${v.name}`;
    return v.name;
  }

  /**
   * Bem que um reino cobiça do vizinho (RF-VIDA-240): cavalos (do Bronze), ferro (do Ferro) ou
   * ouro, quando ele quase não tem e o vizinho tem muito. Devolve o bem, a cobiça (0 a 1) e onde está.
   */
  private covet(own: Village[], other: Village[]): { good: LootGood; want: number; from: Village } | null {
    let era = 0;
    let horses = 0;
    let iron = 0;
    let gold = 0;
    for (const v of own) {
      era = Math.max(era, Math.floor(v.tech));
      horses += v.stock.horses;
      iron += v.stock.iron + v.stock.weapons * 0.5;
      gold += v.stock.gold;
    }
    let best: { good: LootGood; want: number; from: Village } | null = null;
    const offer = (good: LootGood, mine: number, need: number, theirs: (o: Village) => number, plenty: number) => {
      if (mine >= need) return;
      for (const o of other) {
        const have = theirs(o);
        if (have < plenty) continue;
        const want = (1 - mine / need) * Math.min(1, have / (plenty * 2));
        if (!best || want > best.want) best = { good, want, from: o };
      }
    };
    if (era >= 1) offer('horses', horses, 2, (o) => o.stock.horses, 6);
    if (era >= 2) offer('iron', iron, 4, (o) => o.stock.iron, 10);
    offer('gold', gold, 2, (o) => o.stock.gold, 10);
    return best;
  }

  /** Moradores que fogem da guerra para o vizinho mais perto fora do reino inimigo (RF-VIDA-243). Devolve quantos. */
  private flee(v: Village, share: number, enemy: number): number {
    let best: Village | null = null;
    let bd = 80;
    for (const o of this.villages) {
      if (o === v || o.abandoned || o.species !== v.species || o.kingdom === enemy) continue;
      const d = this.distance(o, v.x, v.y);
      if (d < bd && this.landPath(v.x, v.y, o.x, o.y)) {
        bd = d;
        best = o;
      }
    }
    if (!best) return 0;
    const want = Math.round(v.population * share);
    let moved = 0;
    for (let i = 0; i < this.count && moved < want; i++) {
      if (!this.alive[i] || this.village[i] !== v.id || i === v.leader) continue;
      this.moveTo(i, v, best);
      moved++;
    }
    if (moved) {
      this.tally.refugees += moved;
      this.note(`${moved} refugiados de ${v.name} fugiram para ${best.name}`, 'guerra', best);
    }
    return moved;
  }

  /** Muda alguém de assentamento, com as contas de quem saiu e de quem chegou. */
  private moveTo(i: number, from: Village, to: Village): void {
    from.population--;
    this.village[i] = -1;
    (from.vitalNow ??= emptyVital()).left++;
    this.join(i, to);
  }

  /** O bando chega à praça (RF-VIDA-243): leva o bem cobiçado e parte do rebanho, queima roças e volta. */
  private plunder(war: War, target: Village): void {
    const good = war.good ?? 'food';
    let took = 0;
    if (good === 'food') {
      took = target.food * B.LOOT_SHARE;
      target.food -= took;
    } else if (good === 'horses' && target.herd && (target.herd.kind === 'horse' || target.herd.kind === 'camel')) {
      took = Math.floor(target.herd.head * B.LOOT_SHARE);
      target.herd.head -= took;
      target.stock.horses = target.herd.head;
    } else {
      took = good === 'horses' ? Math.floor(target.stock[good] * B.LOOT_SHARE) : target.stock[good] * B.LOOT_SHARE;
      target.stock[good] -= took;
    }
    let herd = 0;
    if (good !== 'horses' && target.herd && !target.herd.away && target.herd.head >= 4) {
      herd = Math.floor(target.herd.head * B.LOOT_HERD);
      target.herd.head -= herd;
    }
    let burned = 0;
    for (; burned < B.BURNED_FIELDS && target.fields > 0; burned++) this.dropField(target);
    if (burned) this.effect('flame', target.x, target.y, 25, 1.4);
    war.loot = took;
    war.herd = herd;
    war.returning = this.year;
    this.tally.looted++;
    this.tally.burned += burned;
    const extra = [herd ? `${herd} ${HERD_NAMES[target.herd!.kind]}` : '', burned ? 'queimou as roças' : ''].filter(Boolean).join(' e ');
    this.note(`${this.villages[war.home].name} saqueou ${target.name}: levou ${this.lootName(good, target, false)}${extra ? `, ${extra}` : ''}`, 'guerra', target, { major: true });
  }

  /** O saque chega em casa (até o teto), com o rebanho roubado; o vencido guarda rancor. */
  private bringLoot(war: War): void {
    let home = this.villages[war.home];
    if (home.abandoned || home.kingdom !== war.a) home = this.villages[war.a];
    const good = war.good ?? 'food';
    const n = war.loot ?? 0;
    if (good === 'food') home.food = Math.min(this.capOf(home, 'food'), home.food + n);
    else if (good === 'horses') {
      if (home.herd && (home.herd.kind === 'horse' || home.herd.kind === 'camel')) home.herd.head += n;
      home.stock.horses += n;
    } else home.stock[good] = Math.min(this.capOf(home, good), home.stock[good] + n);
    const stolen = war.herd ?? 0;
    const kind = this.villages[war.target].herd?.kind;
    // O rebanho roubado entra no do atacante se for do mesmo bicho; se não, vira comida.
    if (stolen && home.herd && home.herd.kind === kind) home.herd.head += stolen;
    else if (stolen) home.food = Math.min(this.capOf(home, 'food'), home.food + stolen * 2);
    this.relations.set(this.key(war.a, war.b), Math.min(this.relation(war.a, war.b), -30));
    this.grudge(war.a, war.b, B.GRUDGE_YEARS / 2);
    this.vengeance.set(`${war.b}>${war.a}`, this.year + B.GRUDGE_YEARS / 2);
    this.note(`O bando de ${home.name} voltou para casa com o saque de ${this.villages[war.target].name}`, 'guerra', home);
  }

  /**
   * Guerra de extermínio vencida (RF-VIDA-240): metade do povo foge, o resto morre, o lugar é
   * arrasado e o vencedor funda um assentamento novo sobre as ruínas (RF-VIDA-108).
   */
  private exterminate(war: War, target: Village): void {
    const winner = this.villages[war.a];
    const name = target.name;
    this.flee(target, 0.5, war.a);
    for (let i = 0; i < this.count; i++) if (this.alive[i] && this.village[i] === target.id) this.kill(i, true, 'guerra');
    target.lastCause = 'na guerra';
    this.abandon(target, true);
    this.effect('flame', target.x, target.y, 40, 2);
    this.tally.burned += 1;
    // Os soldados que estão no lugar ficam e fundam o assentamento novo.
    const settlers: number[] = [];
    this.forEachNear(target.x, target.y, TIER_RADIUS[0] + 4, (j) => {
      const vj = this.village[j];
      if (vj >= 0 && this.role[j] === ROLE.soldier && this.villages[vj].kingdom === war.a) settlers.push(j);
    });
    const people = winner.culture.name;
    if (settlers.length < 2) {
      this.note(`Os ${people} arrasaram ${name}`, 'guerra', target, { major: true });
      return;
    }
    const nv = this.foundVillage(winner.species, Math.floor(target.x), Math.floor(target.y), 0, winner);
    const fresh = `Nova ${winner.name}`;
    if (!this.villages.some((o) => o.name === fresh)) nv.name = fresh;
    for (const j of settlers) {
      this.expedition.delete(j);
      this.moveTo(j, this.villages[this.village[j]], nv);
    }
    this.note(`Os ${people} arrasaram ${name} e fundaram ${nv.name} nas ruínas`, 'guerra', nv, { major: true });
  }

  private conquer(war: War, target: Village): void {
    const winner = this.villages[war.a];
    // Consequências (RF-VIDA-243): parte do povo foge, casas queimam, o rebanho muda de dono.
    this.flee(target, B.REFUGEE_SHARE, war.a);
    const homes = target.houses.filter((h) => h.kind === 'house');
    const burn = Math.min(homes.length - 1, Math.round(homes.length * B.RAZE_SHARE));
    for (let n = 0; n < burn; n++) {
      const at = target.houses.indexOf(homes[n * Math.floor(homes.length / Math.max(1, burn)) % homes.length]);
      if (at >= 0) this.raze(target, at);
    }
    if (burn > 0) {
      this.effect('flame', target.x, target.y, 30, 1.6);
      this.tally.burned += burn;
    }
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
    this.grudge(war.a, war.b);
    this.vengeance.set(`${war.b}>${war.a}`, this.year + B.GRUDGE_YEARS);
    this.note(`${winner.name} conquistou ${target.name}${burn > 0 ? `; ${burn > 1 ? `${burn} casas queimaram` : 'uma casa queimou'}` : ''}`, 'guerra', target, { major: true });
  }

  /** Uma vez por ano: diplomacia, lava esfriando, ruínas sumindo e eventos do mundo. */
  private yearly(): void {
    this.updateClimate();
    this.communityYear();
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
    for (const [k, t] of this.temper) {
      const next = t * (1 - B.TEMPER_FADE);
      if (Math.abs(next) < 0.02) this.temper.delete(k);
      else this.temper.set(k, next);
    }
    const capitals = this.villages.filter((v) => !v.abandoned && v.kingdom === v.id);
    const members = new Map<number, Village[]>();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const list = members.get(v.kingdom) ?? [];
      list.push(v);
      members.set(v.kingdom, list);
    }
    // Soldados por reino e por assentamento, contados uma vez; um cavalo por soldado montado (RF-VIDA-223).
    const soldiers = new Map<number, number>();
    const local = new Map<number, number>();
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.role[i] !== ROLE.soldier || this.village[i] < 0) continue;
      const k = this.villages[this.village[i]].kingdom;
      soldiers.set(k, (soldiers.get(k) ?? 0) + 1);
      local.set(this.village[i], (local.get(this.village[i]) ?? 0) + 1);
    }
    this.cavalry.clear();
    const riders = new Map<number, number>();
    for (const [id, n] of local) {
      const v = this.villages[id];
      if ((!this.knew(v, 'montaria') && !this.knew(v, 'cavalaria') && Math.floor(v.tech) < 1) || v.stock.horses < 1) continue;
      const mounted = Math.min(n, Math.floor(v.stock.horses));
      this.cavalry.set(id, mounted / n);
      riders.set(v.kingdom, (riders.get(v.kingdom) ?? 0) + mounted);
    }
    // Força (RF-VIDA-242): soldados × armas × (1 + parte montada).
    const force = (k: number) => {
      const n = soldiers.get(k) ?? 0;
      return n * (1 + this.villages[k].stock.weaponTier * 0.5) * (1 + (n ? (riders.get(k) ?? 0) / n : 0));
    };
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
        // Rancor de guerra (RF-VIDA-243): o vencido não esquece por muitos anos.
        const grudge = this.grudges.get(key);
        if (grudge !== undefined) {
          if (grudge > this.year) rel -= B.GRUDGE_PULL;
          else this.grudges.delete(key);
        }
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
        if (busy || this.allied(a.id, b.id) || (this.truces.get(key) ?? 0) > this.year) continue;
        // Motivo (seção 19.7): cada lado vê se tem razão contra o outro e, se tiver, passa a se preparar (não declara na hora).
        const fa = force(a.id);
        const fb = force(b.id);
        const warlike = a.culture.value === 'guerra' || b.culture.value === 'guerra';
        const ma = members.get(a.id) ?? [a];
        const mb = members.get(b.id) ?? [b];
        const sides = [
          { att: a, def: b, target: pb, fAtt: fa, fDef: fb, lack: lackA, rich: richB, own: ma, other: mb },
          { att: b, def: a, target: pa, fAtt: fb, fDef: fa, lack: lackB, rich: richA, own: mb, other: ma },
        ];
        if (this.polRnd() < 0.5) sides.reverse();
        for (const side of sides) {
          if (this.plans.has(side.att.id) || this.warOf(side.att.id)) continue;
          const plan = this.intent(side, rel, border, warlike);
          if (plan) this.makePlan(side.att, side.def, plan);
        }
      }
    }
    this.updatePlans(members, soldiers, force);
    for (let k = this.wars.length - 1; k >= 0; k--) {
      const war = this.wars[k];
      war.years++;
      // Logística (RF-VIDA-242): o exército come do celeiro de casa; dois anos com fome e ele volta.
      if (this.supplyArmy(war, soldiers.get(war.a) ?? 0)) {
        this.tally.retreats++;
        this.relations.set(this.key(war.a, war.b), Math.min(this.relation(war.a, war.b), -10));
        this.note(`Sem comida, o exército de ${this.villages[war.home].name} desistiu de ${this.villages[war.target].name} e voltou para casa`, 'guerra', this.villages[war.home], { major: true });
        this.endWar(k);
        continue;
      }
      if (war.years >= 2) this.hireMercenaries(war, members);
      // Cansaço de guerra (RF-VIDA-241): a chance de paz sobe a cada ano e a cada morte.
      const dead = war.losses[0] + war.losses[1];
      if (this.polRnd() < B.PEACE_BASE + B.PEACE_PER_YEAR * war.years + B.PEACE_PER_DEATH * dead) {
        this.makePeace(war);
        this.endWar(k);
      }
    }
    this.vassals(members);
    this.rebuildEnemies();
    this.caravanPairs.clear();
  }

  /** Agressividade do reino, de -1 (passivo) a 1 (agressivo). */
  temperOf(k: number): number {
    return this.temper.get(k) ?? 0;
  }

  /** Soma `delta` à agressividade do reino (o jogador mexe nela; some aos poucos, TEMPER_FADE por ano). */
  addTemper(k: number, delta: number): void {
    const t = Math.max(-1, Math.min(1, this.temperOf(k) + delta));
    if (Math.abs(t) < 0.01) this.temper.delete(k);
    else this.temper.set(k, t);
  }

  /** Reino em preparo para a guerra, se estiver (o preparo puxa armas, armaduras e soldados). */
  preparing(k: number): WarPlan | null {
    return this.plans.get(k) ?? null;
  }

  /**
   * Prontidão do reino para a guerra (0 a 1): comida para PREP_FOOD_YEARS anos de exército, uma arma por
   * soldado, armaduras (da Era do Bronze) e ouro de reserva (idem). Só conta o lado que ataca: o alvo não
   * precisa estar pronto (e por isso pode ser pego de surpresa).
   */
  readiness(members: Village[], soldiers: number): number {
    const n = Math.max(1, soldiers);
    let food = 0;
    let weapons = 0;
    let armor = 0;
    let gold = 0;
    let era = 0;
    for (const v of members) {
      food += v.food;
      weapons += v.stock.weapons;
      armor += v.stock.armor;
      gold += v.stock.gold;
      era = Math.max(era, Math.floor(v.tech));
    }
    const parts: [number, number][] = [
      [0.4, food / (n * B.ARMY_FOOD * B.PREP_FOOD_YEARS)],
      [0.3, weapons / n],
    ];
    if (era >= 1) parts.push([0.15, armor / (n * B.PREP_ARMOR)], [0.15, gold / (B.PREP_GOLD * (1 + era))]);
    let total = 0;
    let sum = 0;
    for (const [w, v] of parts) {
      total += w;
      sum += w * Math.max(0, Math.min(1, v));
    }
    return sum / total;
  }

  /** Prontidão exigida de quem tem a agressividade dada: o agressivo se contenta com menos. */
  private readyLevel(k: number): number {
    return B.READY_LEVEL - B.TEMPER_READY * this.warMood(k);
  }

  /** Vantagem de força que o reino quer ter sobre o alvo antes de declarar, pelo motivo e pela agressividade. */
  private wantedAdvantage(motive: WarMotive, k: number): number {
    const base = motive === 'loot' ? B.ADVANTAGE_RAID : motive === 'extermination' ? B.ADVANTAGE_EXTERMINATION : B.ADVANTAGE;
    return base - B.TEMPER_ADVANTAGE * this.warMood(k);
  }

  /**
   * Motivo de guerra de `side.att` contra `side.def` neste ano (seção 19.7), ou null. A chance de cada um
   * é vezes (1 + agressividade do reino). Só nasce a intenção: a declaração espera o preparo (updatePlans).
   */
  private intent(
    side: { att: Village; def: Village; target: Village; fAtt: number; fDef: number; lack: number; rich: number; own: Village[]; other: Village[] },
    rel: number,
    border: boolean,
    warlike: boolean,
  ): { motive: WarMotive; target: Village; good?: LootGood } | null {
    const { att, def, target, fAtt, fDef } = side;
    const m = Math.max(0, 1 + this.warMood(att.kingdom));
    const rnd = this.polRnd;
    const w = warlike ? 2 : 1;
    if (border && rel <= B.EXTERMINATION_RELATION && fAtt >= 2 * Math.max(1, fDef) && happens(rnd, B.EXTERMINATION_RATE * m, 1)) return { motive: 'extermination', target };
    if ((this.vengeance.get(`${att.id}>${def.id}`) ?? 0) > this.year && rel < 10 && happens(rnd, B.REVENGE_WAR * m, 1)) return { motive: 'revenge', target };
    if (att.culture.value === 'fé' && def.culture.belief !== att.culture.belief && rel < 10 && happens(rnd, B.FAITH_WAR * m * (1 - att.culture.tolerance), 1)) return { motive: 'faith', target };
    // Falta de comida ou lenha: o reino em falta, mais forte, vai atrás da fartura do vizinho.
    const greed = side.lack * side.rich;
    if (greed > 0 && fAtt > fDef && rel < 20 && rnd() < B.RESOURCE_WAR * greed * w * m) {
      return { motive: 'loot', target, good: this.kingdomLackName(side.own) === 'comida' ? 'food' : 'wood' };
    }
    // Cobiça: cavalos, ferro ou ouro que faltam ao mais forte e sobram no vizinho.
    const want = fAtt > fDef && rel < 0 ? this.covet(side.own, side.other) : null;
    if (want && rnd() < B.COVET_WAR * want.want * w * m) return { motive: 'loot', target: want.from, good: want.good };
    // Domínio: um reino forte e avançado sobre um vizinho bem mais fraco.
    const strong = fAtt >= 2 * Math.max(1, fDef) && Math.floor(att.tech) >= 2;
    if (strong && rel < 0 && rnd() < 0.04 * m) return { motive: 'dominion', target };
    // Território: relação ruim demais.
    if (rel < (warlike ? -20 : -35) && rnd() < 0.15 * w * m) return { motive: 'land', target };
    return null;
  }

  /** Um reino passa a se preparar para atacar (RF-VIDA-241): os ferreiros e as profissões se voltam para a guerra. */
  private makePlan(att: Village, def: Village, plan: { motive: WarMotive; target: Village; good?: LootGood }): void {
    this.plans.set(att.id, { enemy: def.id, target: plan.target.id, motive: plan.motive, good: plan.good, since: this.year, belief: 1 + (this.polRnd() - 0.5) * 2 * B.BELIEF_NOISE });
    this.tally.plans++;
    this.note(`${att.name} começou a se preparar para a guerra contra ${def.name} (${WAR_MOTIVES[plan.motive]})`, 'guerra', att, { key: `prep-${att.id}-${def.id}` });
  }

  /**
   * Uma vez por ano: cada reino em preparo confere se está pronto (comida, armas, armaduras e ouro) e se acha
   * que tem vantagem sobre o alvo. Se sim, declara. Desiste se o motivo sumiu, a tensão passou ou o preparo
   * demorou PREP_MAX_YEARS.
   */
  private updatePlans(members: Map<number, Village[]>, soldiers: Map<number, number>, force: (k: number) => number): void {
    for (const [k, plan] of this.plans) {
      const att = this.villages[k];
      const def = this.villages[plan.enemy];
      const target = this.villages[plan.target];
      const rel = this.relation(k, plan.enemy);
      const gone = att.abandoned || att.kingdom !== k || def.abandoned || def.kingdom !== def.id || target.abandoned || target.kingdom !== plan.enemy;
      const calm = plan.motive !== 'revenge' && rel > B.PEACE_REL;
      if (gone || calm || this.allied(k, plan.enemy) || this.warOf(k)) {
        this.plans.delete(k);
        this.tally.plansDropped++;
        continue;
      }
      if (this.year - plan.since > B.PREP_MAX_YEARS) {
        this.plans.delete(k);
        this.tally.plansDropped++;
        this.note(`${att.name} desistiu da guerra contra ${def.name}: nunca se sentiu pronto`, 'guerra', att, { key: `giveup-${k}` });
        continue;
      }
      if (this.warOf(plan.enemy) || (this.truces.get(this.key(k, plan.enemy)) ?? 0) > this.year) continue;
      const mine = force(k);
      const loot = plan.motive === 'loot';
      if (mine < (loot ? B.RAID_FORCE : 4)) continue;
      if (this.readiness(members.get(k) ?? [att], soldiers.get(k) ?? 0) < this.readyLevel(k)) continue;
      // O que ele acha que o inimigo vale: a força de verdade, com o erro do plano.
      if (mine < this.wantedAdvantage(plan.motive, k) * Math.max(1, force(plan.enemy) * plan.belief)) continue;
      this.plans.delete(k);
      this.tally.prepYears += this.year - plan.since;
      if (this.declareWar(att, def, target, members, plan.motive, plan.good)) {
        if (loot && (plan.good === 'food' || plan.good === 'wood')) this.tally.greedWars++;
        this.callAllies(att, def, members);
      }
    }
  }

  // Influência do jogador (seção 19.20) -------------------------------------

  /** Aumenta a tensão entre dois reinos (a relação cai PLAYER_TENSION). */
  provoke(a: Village, b: Village): boolean {
    if (a.kingdom === b.kingdom) return false;
    const key = this.key(a.kingdom, b.kingdom);
    this.relations.set(key, Math.max(-100, this.relation(a.kingdom, b.kingdom) - B.PLAYER_TENSION));
    this.truces.delete(key);
    this.effect('swords', a.x, a.y - 3, 25, 1);
    this.effect('swords', b.x, b.y - 3, 25, 1);
    this.note(`Algo azedou a relação entre ${this.villages[a.kingdom].name} e ${this.villages[b.kingdom].name}`, 'jogador', a);
    return true;
  }

  /** Ameniza a tensão: a relação sobe PLAYER_TENSION, a trégua vale por mais um tempo e os planos de guerra entre os dois caem. */
  soothe(a: Village, b: Village): boolean {
    if (a.kingdom === b.kingdom) return false;
    const key = this.key(a.kingdom, b.kingdom);
    this.relations.set(key, Math.min(100, this.relation(a.kingdom, b.kingdom) + B.PLAYER_TENSION));
    this.truces.set(key, Math.max(this.truces.get(key) ?? 0, this.year + B.TRUCE_MIN));
    for (const [x, y] of [[a.kingdom, b.kingdom], [b.kingdom, a.kingdom]]) if (this.plans.get(x)?.enemy === y) this.plans.delete(x);
    this.effect('heart', a.x, a.y - 3, 25, 1);
    this.effect('heart', b.x, b.y - 3, 25, 1);
    this.note(`${this.villages[a.kingdom].name} e ${this.villages[b.kingdom].name} se aproximaram`, 'jogador', a);
    return true;
  }

  /** Manda um reino atacar outro agora, sem preparo (a vontade do jogador vale). Devolve falso se não der (já em guerra, sem caminho). */
  incite(a: Village, b: Village): boolean {
    if (a.kingdom === b.kingdom || this.warOf(a.kingdom) || this.warOf(b.kingdom)) return false;
    const members = new Map<number, Village[]>();
    for (const v of this.villages) if (!v.abandoned) members.set(v.kingdom, [...(members.get(v.kingdom) ?? []), v]);
    const target = (members.get(b.kingdom) ?? [b]).reduce((p, q) => (this.distance(q, a.x, a.y) < this.distance(p, a.x, a.y) ? q : p));
    this.plans.delete(a.kingdom);
    return this.declareWar(this.villages[a.kingdom], this.villages[b.kingdom], target, members, 'dominion');
  }

  /** Torna o reino mais agressivo (`dir` > 0) ou mais passivo (`dir` < 0), TEMPER_STEP por vez; a chance de ter motivo e o preparo exigido mudam. */
  sway(k: Village, dir: number): void {
    const delta = Math.sign(dir) * B.TEMPER_STEP;
    this.addTemper(k.kingdom, delta);
    const cap = this.villages[k.kingdom];
    this.effect(delta > 0 ? 'swords' : 'heart', cap.x, cap.y - 3, 25, 1);
    this.note(`${cap.name} ficou mais ${delta > 0 ? 'belicoso' : 'pacato'}`, 'jogador', cap);
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

  /**
   * Paz (RF-VIDA-134): a relação volta a −10. Na guerra de território, quem está ganhando
   * (perdeu menos gente) fica com o assentamento disputado: paz com cessão (RF-VIDA-240).
   */
  private makePeace(war: War): void {
    const a = this.villages[war.a];
    const b = this.villages[war.b];
    const target = this.villages[war.target];
    this.relations.set(this.key(war.a, war.b), -10);
    const cede = (war.motive === 'land' || war.motive === 'dominion' || war.motive === 'revenge' || war.motive === 'faith') && war.losses[0] < war.losses[1] && target.kingdom === war.b && target !== b && !target.abandoned;
    if (cede) {
      target.kingdom = a.id;
      target.color = a.color;
      target.leader = -1;
      this.grudge(war.a, war.b, B.GRUDGE_YEARS / 2);
      this.vengeance.set(`${war.b}>${war.a}`, this.year + B.GRUDGE_YEARS / 2);
      this.note(`Paz entre ${a.name} e ${b.name}: ${b.name} cedeu ${target.name}`, 'guerra', target, { major: true });
      return;
    }
    this.note(`Paz entre ${a.name} e ${b.name}`, 'guerra', b, { major: true });
  }

  /**
   * Comida do exército em campanha (RF-VIDA-242): ARMY_FOOD por soldado por ano, do celeiro do
   * assentamento de onde ele saiu. Guarda a parte paga em `supply`; devolve true quando o
   * exército passou dois anos seguidos com pouca comida e volta para casa.
   */
  private supplyArmy(war: War, soldiers: number): boolean {
    let home = this.villages[war.home];
    if (home.abandoned || home.kingdom !== war.a) {
      home = this.villages[war.a];
      war.home = home.id;
    }
    const need = soldiers * B.ARMY_FOOD;
    if (need <= 0) {
      war.supply = 1;
      return false;
    }
    const paid = Math.min(home.food, need);
    home.food -= paid;
    this.book(home, 'food', 0, paid);
    war.supply = paid / need;
    war.hungry = war.supply < B.RETREAT_SUPPLY ? (war.hungry ?? 0) + 1 : 0;
    return war.motive !== 'civil' && war.hungry >= 2;
  }

  /**
   * Mercenários (RF-VIDA-295): em guerra longa, o lado com ouro contrata adultos de um
   * assentamento pobre ou em crise de outro reino, que vão lutar por ele.
   */
  private hireMercenaries(war: War, members: Map<number, Village[]>): void {
    for (const [side, k] of [[0, war.a], [1, war.b]] as const) {
      if (!happens(this.polRnd, B.MERCENARY_RATE, 1)) continue;
      const list = members.get(k) ?? [];
      const payer = list.reduce<Village | null>((p, q) => (!p || q.stock.gold > p.stock.gold ? q : p), null);
      if (!payer || payer.stock.gold < B.MERCENARY_PRICE * 2) continue;
      const camp = side === 0 ? this.villages[war.home] : this.villages[war.target];
      let source: Village | null = null;
      let bd = 120;
      for (const o of this.villages) {
        if (o.abandoned || o.kingdom === war.a || o.kingdom === war.b || o.population < 8 || this.warOf(o.kingdom)) continue;
        const poor = (o.stability ?? 1) < 0.5 || (o.needs?.food ?? 1) < 0.6 || (o.needs ? welfare(o.needs) : 1) < 0.6;
        if (!poor) continue;
        const d = this.distance(o, camp.x, camp.y);
        if (d < bd && this.landPath(o.x, o.y, camp.x, camp.y)) {
          bd = d;
          source = o;
        }
      }
      if (!source) continue;
      const n = Math.min(B.MERCENARY_MAX, Math.floor(payer.stock.gold / B.MERCENARY_PRICE), Math.floor(source.population / 4));
      let hired = 0;
      const era = Math.floor(source.tech);
      for (let i = 0; i < this.count && hired < n; i++) {
        if (!this.alive[i] || this.village[i] !== source.id || i === source.leader || this.role[i] === CHILD) continue;
        if (this.age[i] >= elderAge(this.species[this.kind[i]], era)) continue;
        this.moveTo(i, source, camp);
        this.role[i] = ROLE.soldier;
        this.mercenaries.add(i);
        hired++;
      }
      if (!hired) continue;
      const pay = hired * B.MERCENARY_PRICE;
      payer.stock.gold -= pay;
      source.stock.gold = Math.min(this.capOf(source, 'gold'), source.stock.gold + pay);
      war.mercs[side] += hired;
      this.tally.mercenaries += hired;
      this.note(`${payer.name} contratou ${hired} mercenários de ${source.name} por ${pay} de ouro`, 'guerra', camp, { key: `merc-${payer.id}-${source.id}` });
    }
  }

  /** Declara guerra se houver caminho por terra ou, sem ele, por mar, e o teto do planeta deixar (RF-VIDA-241). Retorna se começou. */
  private declareWar(att: Village, def: Village, target: Village, members: Map<number, Village[]>, motive: WarMotive = 'land', good?: LootGood): boolean {
    let naval = false;
    const home = (members.get(att.id) ?? []).reduce((p, q) => (this.distance(q, target.x, target.y) < this.distance(p, target.x, target.y) ? q : p), att);
    if (!this.landPath(home.x, home.y, target.x, target.y)) {
      if (!this.navalBase(att.id, target)) return false;
      naval = true;
    }
    this.startWar({ a: att.id, b: def.id, target: target.id, naval, motive, good, home: home.id });
    this.breakAgreements(att.id, def.id);
    // Crônica com motivo (RF-VIDA-244).
    const sea = naval ? ', pelo mar' : '';
    const text =
      motive === 'loot'
        ? `${home.name} atacou ${target.name} para tomar ${this.lootName(good ?? 'food', target, false)}${sea}`
        : motive === 'extermination'
          ? `Guerra! ${att.name} marchou para arrasar ${target.name}${sea}`
          : motive === 'revenge'
            ? `Guerra! ${att.name} atacou ${def.name} por vingança, para retomar ${this.prizeName(target)}${sea}`
            : motive === 'faith'
              ? `Guerra santa! ${att.name} atacou ${def.name} em nome da fé ${att.culture.belief}${sea}`
              : motive === 'dominion'
                ? `Guerra! ${att.name} atacou ${def.name} para dominar ${this.prizeName(target)}${sea}`
                : `Guerra! ${att.name} atacou ${def.name} para tomar ${this.prizeName(target)}${sea}`;
    this.note(text, 'guerra', target, { major: true });
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
      this.startWar({ a: seat.id, b: capital.id, target: capital.id, naval: !this.landPath(seat.x, seat.y, capital.x, capital.y), motive: 'civil', home: seat.id });
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
      const nv = this.foundVillage(v.species, tx, ny, 0, v, 'família');
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

  // ---- Plano novo dos assentamentos: nascimento (seção 20, fase 1) ----

  /** Famílias de cada assentamento: cada adulto com os filhos crianças do mesmo lugar; o casal junto (chave: menor `uid`). */
  private familyGroups(): Map<number, Map<number, number[]>> {
    const families = new Map<number, Map<number, number[]>>();
    const here = new Map<number, number>();
    for (let i = 0; i < this.count; i++) if (this.alive[i] && this.village[i] >= 0) here.set(this.uid[i], i);
    const head = (k: number) => {
      const mate = partnerOf(this.bonds, this.uid[k]);
      const m = mate ? here.get(mate) : undefined;
      return m !== undefined && this.village[m] === this.village[k] ? Math.min(this.uid[k], mate) : this.uid[k];
    };
    for (let i = 0; i < this.count; i++) {
      const vid = this.village[i];
      if (vid < 0 || !this.alive[i] || this.species[this.kind[i]].kind !== 'sapient') continue;
      const p = this.role[i] === CHILD ? here.get(this.parent[i]) : undefined;
      const key = p !== undefined && this.village[p] === vid && this.role[p] !== CHILD ? head(p) : head(i);
      let fams = families.get(vid);
      if (!fams) families.set(vid, (fams = new Map()));
      const list = fams.get(key);
      if (list) list.push(i);
      else fams.set(key, [i]);
    }
    return families;
  }

  /** O que os batedores veem num sítio (RF-AS-04). */
  private siteLook(s: number, x: number, y: number, from: Village | null, motive: ColonyMotive): SiteLook {
    const map = this.map;
    const R = 8;
    let land = 0;
    let veg = 0;
    let trees = 0;
    let rock = 0;
    let level = 0;
    let water = 0;
    let road = 0;
    let elev = 0;
    let ore = 0;
    let near = 99;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const t = this.tileAt(x + dx, y + dy);
        if (t < 0) continue;
        if (isWater(map, t)) {
          water++;
          near = Math.min(near, Math.hypot(dx, dy));
          continue;
        }
        land++;
        veg += map.vegetation[t];
        elev += map.elevation[t];
        if (this.standingTree(t)) trees++;
        if (isRockyBiome(map.biome[t] as Biome)) rock++;
        if (this.flat(t)) level++;
        if (isStreet(this.road[t])) road++;
        const d = this.depositAt[t];
        if (d >= 0 && this.deposits[d].mine < 0 && this.deposits[d].amount > 0) ore++;
      }
    }
    const center = this.tileAt(x, y);
    const fertile = land ? veg / land : 0;
    const coast = water > 0 && water < (land + water) * 0.6 ? 1 : 0;
    const fit = motive === 'terra' ? fertile : motive === 'jazida' ? (ore ? 1 : 0) : motive === 'porto' ? coast : 0.5;
    return {
      water: near <= 3 ? 1 : near <= 6 ? 0.5 : 0,
      fertile,
      forest: Math.min(1, trees / (land * 0.3 + 1)),
      rock: Math.min(1, rock / (land * 0.1 + 1)),
      flat: land ? level / land : 0,
      coast,
      ruin: this.ruinNear(x + 0.5, y + 0.5, 4, s) ? 1 : 0,
      defense: land && center >= 0 ? Math.max(0, Math.min(1, (map.elevation[center] - elev / land) * 20)) : 0,
      route: road > 0 ? 1 : 0,
      motive: fit,
      dist: from ? this.distance(from, x + 0.5, y + 0.5) : B.SITE_IDEAL_DIST,
    };
  }

  /** Sítios bons para um grupo de `v` fundar, os melhores primeiro (RF-AS-04). */
  private scoutSites(v: Village, motive: ColonyMotive, count: number): { x: number; y: number; value: number }[] {
    const map = this.map;
    const out: { x: number; y: number; value: number }[] = [];
    const base = spacingFor(v.tier) + this.footprint(v);
    for (let k = 0; k < 28; k++) {
      const a = (k / 28) * Math.PI * 2 + this.civRnd() * 0.2;
      const d = base + this.civRnd() * B.COLONY_REACH;
      const ny = Math.floor(v.y + Math.sin(a) * d);
      if (ny < 2 || ny >= map.height - 2) continue;
      const nx = ((Math.floor(v.x + Math.cos(a) * d) % map.width) + map.width) % map.width;
      const tile = ny * map.width + nx;
      if (!this.habitable(v.species, tile) || map.vegetation[tile] < this.minFertility(v) || !this.canSettle(v.species, nx, ny, v.tech)) continue;
      if (!this.landPath(v.x, v.y, nx + 0.5, ny + 0.5)) continue;
      if (out.some((o) => Math.hypot(wrapDx(o.x - nx, map.width), o.y - ny) < 6)) continue;
      out.push({ x: nx, y: ny, value: siteValue(this.siteLook(v.species, nx, ny, v, motive)) });
    }
    return out.sort((p, q) => q.value - p.value).slice(0, count);
  }

  /** Começa a juntar uma colônia em `v`: batedores saem para ver os sítios (RF-AS-03). */
  private organizeColony(v: Village, motive: ColonyMotive): boolean {
    if (v.colony || v.population < B.COLONY_SOURCE_POP || this.year - (v.colonyAt ?? -1e9) < B.COLONY_COOLDOWN) return false;
    const sites = this.scoutSites(v, motive, B.COLONY_SCOUTS);
    if (!sites.length) return false;
    // Batedores: os adultos mais curiosos e corajosos, nunca o líder.
    const elder = elderAge(this.species[v.species], Math.floor(v.tech));
    const pool: { i: number; w: number }[] = [];
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.village[i] !== v.id || i === v.leader || this.role[i] === CHILD || this.age[i] >= elder || this.role[i] >= ROLE.soldier) continue;
      pool.push({ i, w: this.traits[i * TRAIT_COUNT + TRAIT.curiosity] + this.traits[i * TRAIT_COUNT + TRAIT.courage] + this.civRnd() * 4 });
    }
    pool.sort((p, q) => q.w - p.w);
    const scouts = pool.slice(0, 2).map((p) => this.uid[p.i]);
    v.colony = { motive, sites, until: this.year + B.COLONY_SCOUT_YEARS, scouts };
    for (const p of pool.slice(0, 2)) this.logThought(p.i, 'mudança', `Saiu de batedor para ver ${sites.length} lugares para uma colônia (${MOTIVE_TEXT[motive]})`);
    this.note(`${v.name} mandou batedores procurar ${MOTIVE_TEXT[motive]} para uma colônia`, 'povo', v, { key: `scout-${v.id}` });
    return true;
  }

  /** Para onde o batedor `i` anda agora: um sítio por vez e depois de volta (deslocamento), ou null. */
  private scoutTarget(i: number, v: Village): { x: number; y: number } | null {
    const c = v.colony;
    if (!c || !c.scouts.includes(this.uid[i])) return null;
    const left = Math.max(0, Math.min(1, (c.until - this.year) / B.COLONY_SCOUT_YEARS));
    const k = Math.floor((1 - left) * (c.sites.length + 1));
    if (k >= c.sites.length) return null;
    const p = c.sites[k];
    return { x: wrapDx(p.x + 0.5 - this.x[i], this.map.width), y: p.y + 0.5 - this.y[i] };
  }

  /** O grupo da colônia parte: escolhe o sítio, junta as famílias que querem ir e funda (RF-AS-03). */
  private departColony(v: Village, families: Map<number, number[]> | undefined): void {
    const c = v.colony!;
    v.colony = undefined;
    v.colonyAt = this.year;
    const sites = c.sites
      .filter((p) => this.canSettle(v.species, p.x, p.y, v.tech))
      .map((p) => ({ ...p, value: p.value + (this.civRnd() - 0.5) * 0.4 }))
      .sort((p, q) => q.value - p.value);
    if (!sites.length || !families) {
      this.note(`A colônia de ${v.name} desistiu: os lugares que os batedores viram já estavam tomados`, 'povo', v, { key: `colony-off-${v.id}` });
      return;
    }
    const site = sites[0];
    // Quem quer ir: curiosos e ambiciosos, pouco apegados, e quem passa fome. A família do líder fica.
    const t = (i: number, k: keyof typeof TRAIT) => this.traits[i * TRAIT_COUNT + TRAIT[k]] / 10;
    const fams = [...families.values()]
      .filter((m) => !m.includes(v.leader))
      .map((m) => {
        const adults = m.filter((i) => this.role[i] !== CHILD);
        const will = adults.reduce((n, i) => n + t(i, 'curiosity') + t(i, 'ambition') - t(i, 'attachment') + (this.energy[i] < 0.4 ? 0.5 : 0), 0) / Math.max(1, adults.length);
        return { m, will: will + (this.civRnd() - 0.5) * 0.6 };
      })
      .sort((p, q) => q.will - p.will);
    const group: number[] = [];
    let n = 0;
    for (const f of fams) {
      if (group.length >= B.COLONY_GROUP_MIN || group.length + f.m.length > B.COLONY_GROUP_MAX || v.population - group.length - f.m.length < v.population * 0.55) {
        if (group.length >= B.COLONY_GROUP_MIN) break;
        continue;
      }
      group.push(...f.m);
      n++;
    }
    if (group.length < B.COLONY_GROUP_MIN * 0.7) {
      this.note(`A colônia de ${v.name} não saiu: poucas famílias quiseram ir`, 'povo', v, { key: `colony-off-${v.id}` });
      return;
    }
    const nv = this.foundVillage(v.species, site.x, site.y, 0, v, 'colônia');
    // O enxoval vai numa carroça com o grupo (o que `foundVillage` separou da origem).
    const cargo: Cargo[] = [];
    if (nv.stock.wood >= 1) cargo.push({ good: 'wood', amount: Math.floor(nv.stock.wood) });
    if (nv.food >= 1) cargo.push({ good: 'food', amount: Math.floor(nv.food) });
    let leader = -1;
    for (const i of group) {
      this.village[i] = nv.id;
      this.movedAt[i] = this.year;
      this.home[i] = -1;
      v.population--;
      nv.population++;
      (v.vitalNow ??= emptyVital()).left++;
      (nv.vitalNow ??= emptyVital()).arrived++;
      this.logThought(i, 'mudança', `Partiu com a colônia para fundar ${nv.name} (${MOTIVE_TEXT[c.motive]})`);
      if (this.role[i] !== CHILD && (leader < 0 || t(i, 'charisma') > t(leader, 'charisma'))) leader = i;
    }
    if (leader >= 0) {
      nv.leader = leader;
      nv.leaderUid = this.uid[leader];
      this.role[leader] = ROLE.leader;
    }
    const path = this.roadPath(v.x, v.y, nv.x, nv.y);
    if (cargo.length && path && path.length > 1) {
      nv.stock.wood -= cargo.find((g) => g.good === 'wood')?.amount ?? 0;
      nv.food -= cargo.find((g) => g.good === 'food')?.amount ?? 0;
      const crew = group.find((i) => this.role[i] !== CHILD && i !== leader);
      if (crew === undefined || !this.launchConvoy(v, nv, 'settlers', path, cargo, crew)) {
        nv.stock.wood += cargo.find((g) => g.good === 'wood')?.amount ?? 0;
        nv.food += cargo.find((g) => g.good === 'food')?.amount ?? 0;
      }
    }
    this.tally.colonies++;
    this.note(`${n} famílias de ${v.name} partiram atrás de ${MOTIVE_TEXT[c.motive]} e fundaram ${nv.name}`, 'povo', nv, { major: v.tier >= 1 });
  }

  /**
   * Comboio que não é comércio (RF-AS-03, 42 e 45): enxoval de colonos, ajuda a um vizinho com fome
   * ou visita a parentes. Quem vai é a pessoa `i`, que sai do mapa e volta (ou chega) com a carroça.
   */
  private launchConvoy(v: Village, o: Village, kind: 'settlers' | 'aid' | 'visit', path: number[], cargo: Cargo[], i: number): boolean {
    if (i < 0 || !this.alive[i]) return false;
    const era = Math.floor(v.tech);
    const w = this.map.width;
    const walker = kind === 'visit';
    const animal = packAnimal(v.material === 'adobe' || v.herd?.kind === 'camel', v.stock.horses);
    if (kind === 'settlers') {
      // Quem leva o enxoval já mora no lugar novo.
      this.village[i] = o.id;
    }
    this.caravans.push({
      id: this.nextCaravan++,
      kind,
      home: kind === 'settlers' ? o.id : v.id,
      target: o.id,
      path,
      step: 0,
      x: (path[0] % w) + 0.5,
      y: Math.floor(path[0] / w) + 0.5,
      facing: 1,
      back: kind === 'settlers',
      animal,
      animals: walker ? 0 : 1,
      cart: walker ? 0 : cartOf(era),
      cargo,
      purse: 0,
      crew: this.embark(i),
      speed: B.CARAVAN_SPEED * (walker ? 0.8 : 1),
      wait: 0,
      tolls: [],
      era,
    });
    return true;
  }

  /** Família sem lugar melhor conhecido: sítio, colônia, refúgio e, só longe de tudo, fundar sozinha (RF-AS-01). */
  private exodusWithoutPlace(v: Village, families: Map<number, number[]> | undefined): void {
    const why = this.lackName(v);
    v.want = 0;
    this.tally.exodus++;
    if (why === 'lenha') this.tally.exodusFuel++;
    if (why === 'comida' && this.openFarmstead(v)) return;
    if (this.organizeColony(v, why === 'comida' ? 'terra' : 'espaço')) return;
    if (families && this.seekRefuge(v, families, why)) return;
    const near = this.villages.some((o) => o !== v && !o.abandoned && o.species === v.species && this.distance(o, v.x, v.y) < B.LONE_FOUND_DIST);
    if (!near && this.colonizeByLand(v)) {
      this.tally.soloFounds++;
      this.note(`Sem ${why}, uma família de ${v.name} partiu para longe`, 'povo', v, { key: `exodus-${v.id}` });
    }
  }

  /** Refúgio (RF-AS-01 e 08): famílias com falta vão para qualquer lugar do povo ao alcance, mesmo pior. */
  private seekRefuge(v: Village, families: Map<number, number[]>, why: string): boolean {
    const reach = (B.MOVE_RANGE + B.MOVE_RANGE_ERA * Math.floor(v.tech)) * 2.5;
    let best: Village | null = null;
    let bv = -Infinity;
    for (const o of this.villages) {
      if (o === v || o.abandoned || o.species !== v.species || o.population < 3) continue;
      const d = this.distance(o, v.x, v.y);
      if (d > reach || !this.landPath(v.x, v.y, o.x, o.y)) continue;
      const value = this.placeScore(o) - d / B.MOVE_DIST - (this.scarcity(o) > 0 ? 1 : 0) + this.affinity(v.id, o.id) / 50;
      if (value > bv) {
        bv = value;
        best = o;
      }
    }
    if (!best) return false;
    let moved = 0;
    for (const m of families.values()) {
      if (m.includes(v.leader) || !happens(this.civRnd, B.EXODUS_SHARE, 1)) continue;
      for (const i of m) this.relocate(i, v, best);
      moved += m.length;
      this.tally.familyMoves++;
    }
    if (!moved) return false;
    this.note(`Sem ${why}, famílias de ${v.name} buscaram refúgio em ${best.name}`, 'povo', best, { key: `refuge-${v.id}-${best.id}` });
    return true;
  }

  /**
   * Sítio rural (RF-AS-02): uma casa e uma roça a 6 a 15 tiles do núcleo, ligadas a ele por trilha. O
   * sítio não é um lugar novo: conta na população e no estoque do núcleo, e quem mora nele é do núcleo.
   */
  private openFarmstead(v: Village): boolean {
    const farms = v.houses.filter((h) => h.farm).length;
    if (farms >= B.FARMSTEADS_MAX || v.population < 8) return false;
    const map = this.map;
    const w = map.width;
    const foot = this.footprint(v);
    for (let k = 0; k < 20; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = foot + B.FARMSTEAD_MIN * 0.5 + this.civRnd() * (B.FARMSTEAD_MAX - B.FARMSTEAD_MIN);
      const x0 = Math.floor(v.x + Math.cos(a) * d);
      const y0 = Math.floor(v.y + Math.sin(a) * d);
      if (y0 < 2 || y0 >= map.height - 3) continue;
      const tiles: number[] = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) tiles.push(this.tileAt(x0 + dx, y0 + dy));
      if (tiles.some((t) => t < 0 || !isLand(map, t) || this.road[t] || this.built[t] || this.depositAt[t] >= 0 || !this.flat(t))) continue;
      if (tiles.slice(4).some((t) => map.vegetation[t] < this.minFertility(v))) continue;
      if (this.villages.some((o) => o !== v && !o.abandoned && this.distance(o, x0 + 2, y0 + 1) < this.footprint(o) + 6)) continue;
      if (!this.landPath(v.x, v.y, x0 + 1, y0 + 1) || !this.pay(v, 'house')) continue;
      const lot = [tiles[0], tiles[1], tiles[4], tiles[5]];
      for (const t of lot) {
        this.built[t] = 1;
        this.onTileChanged(t);
      }
      const house: Building = { x: x0, y: y0, kind: 'house', variant: Math.floor(this.civRnd() * 4), era: Math.floor(v.tech), farm: true };
      this.startWork(house, B.WORK_YEARS / 2, true);
      v.houses.push(house);
      for (const t of [tiles[2], tiles[3], tiles[6], tiles[7]]) {
        this.road[t] = 4;
        this.onTileChanged(t);
      }
      v.fields++;
      this.layAccess(v, x0, y0, Math.ceil(d) + 8);
      this.tally.farmsteads++;
      this.note(`Famílias de ${v.name} abriram um sítio a ${Math.round(d)} tiles do centro`, 'povo', { x: x0 + 1, y: y0 + 1 }, { key: `farmstead-${v.id}` });
      void w;
      return true;
    }
    return false;
  }

  /**
   * Sítios que viraram aldeia (RF-AS-02): casas de sítio com FARMSTEAD_FREE_POP moradores juntos, longe do
   * núcleo, se emancipam como um lugar novo do mesmo povo e do mesmo reino.
   */
  private freeFarmsteads(v: Village): void {
    const w = this.map.width;
    const farms = v.houses.filter((h) => h.farm && !h.site && this.distance(v, h.x + 1, h.y + 1) >= B.FARMSTEAD_FREE_DIST);
    if (farms.length < 2) return;
    const seed = farms[0];
    const group = farms.filter((h) => Math.hypot(wrapDx(h.x - seed.x, w), h.y - seed.y) < 8);
    const keys = new Set(group.map((h) => h.y * w + h.x));
    const people: number[] = [];
    for (let i = 0; i < this.count; i++) if (this.alive[i] && this.village[i] === v.id && keys.has(this.home[i])) people.push(i);
    if (people.length < B.FARMSTEAD_FREE_POP) return;
    const cx = Math.floor(group.reduce((n, h) => n + h.x + 1, 0) / group.length);
    const cy = Math.floor(group.reduce((n, h) => n + h.y + 1, 0) / group.length);
    // A praça do lugar novo fica num tile livre perto do meio do sítio.
    let px = -1;
    let py = -1;
    for (let r = 0; r < 4 && px < 0; r++) {
      for (let dy = -r; dy <= r && px < 0; dy++) {
        for (let dx = -r; dx <= r && px < 0; dx++) {
          const t = this.tileAt(cx + dx, cy + dy);
          if (t >= 0 && isLand(this.map, t) && !this.built[t] && this.road[t] !== 4) {
            px = cx + dx;
            py = cy + dy;
          }
        }
      }
    }
    if (px < 0) return;
    const nv = this.foundVillage(v.species, px, py, 0, v, 'sítio');
    // `foundVillage` ergueu uma cabana dos fundadores: as casas do sítio já bastam.
    for (const h of nv.houses.splice(0)) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) this.built[this.tileAt(h.x + dx, h.y + dy)] = 0;
    for (const h of group) {
      v.houses.splice(v.houses.indexOf(h), 1);
      h.farm = false;
      nv.houses.push(h);
    }
    nv.stock.wood += 0;
    v.foot = undefined;
    nv.foot = undefined;
    for (const i of people) {
      this.village[i] = nv.id;
      v.population--;
      nv.population++;
    }
    this.note(`O sítio de ${v.name} cresceu e virou a aldeia ${nv.name}`, 'povo', nv, { major: false });
  }

  /**
   * Fusão (RF-AS-06): quando o núcleo de uma cidade encosta numa aldeia ou vila do mesmo reino (ou livre),
   * ela vira um bairro da cidade, com nome de bairro. De outro povo, vira um bairro estrangeiro.
   */
  private mergeVillages(): void {
    for (const v of this.villages) {
      if (v.abandoned || v.tier < 2) continue;
      for (const o of this.villages) {
        if (o === v || o.abandoned || o.species !== v.species || o.tier >= 2) continue;
        if (this.distance(o, v.x, v.y) > this.footprint(v) + this.footprint(o) + 2) continue;
        const free = o.kingdom === o.id && this.kingdomSize(o) <= 1;
        if (o.kingdom !== v.kingdom && !free) {
          // De outro reino: a fronteira esquenta, como antes.
          const key = this.key(o.kingdom, v.kingdom);
          this.relations.set(key, (this.relations.get(key) ?? 0) - 10);
          continue;
        }
        if (this.warOf(o.kingdom) || this.villages.some((p) => p !== o && !p.abandoned && p.kingdom === o.id)) continue;
        this.mergeInto(o, v);
      }
    }
  }

  /** Junta `o` em `v`: gente, casas, roças, cercados, minas, estoque e porto; `o` some como lugar à parte. */
  private mergeInto(o: Village, v: Village): void {
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.village[i] !== o.id) continue;
      this.village[i] = v.id;
      v.population++;
    }
    o.population = 0;
    for (const h of o.houses) {
      h.quarter = o.name;
      v.houses.push(h);
    }
    o.houses.length = 0;
    v.fields += o.fields;
    o.fields = 0;
    if (o.pens?.length) v.pens = [...(v.pens ?? []), ...o.pens];
    o.pens = undefined;
    for (const id of o.mines) {
      this.deposits[id].mine = v.id;
      v.mines.push(id);
    }
    o.mines.length = 0;
    for (const g of Object.keys(o.stock) as (keyof Stock)[]) {
      const a = v.stock[g];
      const b = o.stock[g];
      if (typeof a === 'number' && typeof b === 'number') (v.stock as unknown as Record<string, number>)[g] = a + b;
    }
    v.food += o.food;
    if (v.port < 0 && o.port >= 0) v.port = o.port;
    o.port = -1;
    for (const b of this.boats) if (b.village === o.id) b.village = v.id;
    for (const c of this.caravans) {
      if (c.home === o.id) c.home = v.id;
      if (c.target === o.id) c.target = v.id;
    }
    for (let k = this.agreements.length - 1; k >= 0; k--) if (this.agreements[k].a === o.id || this.agreements[k].b === o.id) this.agreements.splice(k, 1);
    (v.quarters ??= []).push({ name: o.name, culture: o.culture.id, foreign: o.culture !== v.culture });
    o.abandoned = true;
    o.abandonedAt = this.year;
    o.decay = 3;
    o.mergedInto = v.id;
    v.foot = undefined;
    o.foot = undefined;
    this.tally.merged++;
    const foreign = o.culture !== v.culture ? `, um bairro do povo ${o.culture.name}` : '';
    this.note(`${o.name} foi engolida pelo crescimento de ${v.name} e virou o bairro ${o.name}${foreign}`, 'povo', v, { major: true });
  }

  /** Degrau político de cada centro (RF-AS-48), uma vez por ano. */
  private updatePolities(): void {
    const members = new Map<number, Village[]>();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const list = members.get(v.kingdom);
      if (list) list.push(v);
      else members.set(v.kingdom, [v]);
    }
    for (const v of this.villages) {
      if (v.abandoned) continue;
      if (v.kingdom !== v.id) {
        v.polity = undefined;
        continue;
      }
      const list = members.get(v.id) ?? [v];
      const cities = list.filter((o) => o !== v && o.tier >= 2).length;
      const before = v.polity;
      v.polity = polityOf(v.tier, list.length, cities >= 2 && list.length >= 10 ? 1 : 0);
      if (before && before !== v.polity && (v.polity === 'reino' || v.polity === 'império')) {
        this.note(`${v.name} é agora a capital ${v.polity === 'império' ? 'de um império' : 'de um reino'} com ${list.length} lugares`, 'povo', v, { major: true });
      }
    }
  }

  /** Reino ou império de verdade (RF-AS-48): só esses contam como reino e ganham o nome no rótulo. */
  /**
   * Porte econômico (0 a 3) só pela população, com os limiares antigos: quanto o lugar produz, guarda,
   * comercia e que ofícios tem. O degrau com nome (`tier`) pede também as funções (RF-AS seção 4).
   */
  scale(v: Village): number {
    let t = 0;
    while (t + 1 < B.SCALE_POPULATION.length && v.population >= B.SCALE_POPULATION[t + 1]) t++;
    return Math.max(t, v.tier);
  }

  /** Lugar de mercado: cidade em diante ou já escolhido como referência por outros (RF-AS-44). */
  isMarket(v: Village): boolean {
    return v.tier >= 2 || (v.market ?? 0) > 0;
  }

  /** Lugares no modo completo (jornadas, RF-AS-31): os que estão na tela, ou os escolhidos pela calibração. */
  private watched = new Set<number>();

  watch(ids: Iterable<number>): void {
    this.watched = new Set(ids);
  }

  /** O lugar roda jornadas e passos completos (os demais, o modo agregado). */
  full(v: Village): boolean {
    return this.watched.has(v.id);
  }

  /** Amostras do comportamento nos lugares em modo completo (seção 7.3): tarefa reservada, parado e passos sobre rua. */
  dayStats = { samples: 0, tasked: 0, idle: 0, steps: 0, streetSteps: 0 };

  isRealm(v: Village): boolean {
    const k = this.villages[v.kingdom];
    const p = k.polity ?? polityOf(k.tier, this.kingdomSize(k), 0);
    return p === 'reino' || p === 'império';
  }

  /** Nome da unidade política de `v`: "Reino de X", "Império de X", "Chefia de X" ou "Aldeia livre". */
  polityName(v: Village): string {
    const k = this.villages[v.kingdom];
    const p = k.polity ?? polityOf(k.tier, this.kingdomSize(k), 0);
    return p === 'livre' ? POLITY_NAMES.livre : `${POLITY_NAMES[p]} de ${k.name}`;
  }

  // ---- Plano novo dos assentamentos: forma e degraus (seção 20, fase 2) ----

  /** Pegada: raio das casas do núcleo (sem sítios nem porto) mais a folga (RF-AS-10). */
  footprint(v: Village): number {
    if (v.foot !== undefined) return v.foot;
    let r = 0;
    for (const h of v.houses) {
      if (h.farm || h.kind === 'port') continue;
      const d = this.distance(v, h.x + 1, h.y + 1);
      if (d > r) r = d;
    }
    v.foot = Math.max(B.FOOTPRINT_MIN, r + B.FOOTPRINT_PAD);
    return v.foot;
  }

  /** Nome do degrau, com o acampamento de tendas antes da aldeia de casas fixas. */
  tierName(v: Village): string {
    return this.camp(v) ? 'Acampamento' : TIER_NAMES[v.tier];
  }

  /** Ainda é um acampamento: pouca gente na Idade da Pedra e sem roça (RF-AS seção 4). */
  camp(v: Village): boolean {
    return v.tier === 0 && v.population < B.CAMP_POP && v.fields === 0 && Math.floor(v.tech) === 0;
  }

  /** O que o assentamento tem para o degrau (RF-AS seção 4). */
  private tierCheck(v: Village): TierCheck {
    const built = new Set<BuildingKind>();
    for (const h of v.houses) if (!h.site) built.add(h.kind);
    const center = this.tileAt(v.x, Math.floor(v.y));
    let water = Math.floor(v.tech) >= 1 || this.knew(v, 'ceramica');
    if (!water) {
      for (let dy = -3; dy <= 3 && !water; dy++) for (let dx = -3; dx <= 3 && !water; dx++) {
        const t = this.tileAt(v.x + dx, Math.floor(v.y) + dy);
        if (t >= 0 && isWater(this.map, t)) water = true;
      }
    }
    void center;
    const capital = v.kingdom === v.id && (v.polity === 'reino' || v.polity === 'império');
    return { population: v.population, built, capital, market: v.market ?? 0, water };
  }

  /** Funções que faltam para o próximo degrau (para o painel). */
  nextTierMissing(v: Village): string[] {
    if (v.tier >= 3) return [];
    return missingFunctions(v.tier + 1, this.tierCheck(v));
  }

  /**
   * Melhor lote 2x2 para uma casa pelo valor do solo (RF-AS-11 e 12): perto da praça pelo caminho, com
   * frente para a rua, água e vizinhos; no núcleo as casas podem encostar, na periferia ficam com folga.
   */
  private bestLot(v: Village): number[] | null {
    const foot = this.footprint(v);
    const reach = Math.ceil(foot + B.LOT_REACH);
    const core = Math.max(3.5, foot * B.CORE_SHARE);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const map = this.map;
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < reach + this.footprint(o) + 4);
    let best: number[] | null = null;
    let bv = -Infinity;
    const tiles = [0, 0, 0, 0];
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const lx = cx + ox;
        const ly = cy + oy;
        const d = this.distance(v, lx + 1, ly + 1);
        if (d > reach || d < 2.4) continue;
        let ok = true;
        let field = 0;
        let water = false;
        for (let k = 0; k < 4 && ok; k++) {
          const t = this.tileAt(lx + (k & 1), ly + (k >> 1));
          tiles[k] = t;
          if (t < 0 || !isLand(map, t) || this.built[t] || this.depositAt[t] >= 0 || this.wall[t] || !this.flat(t)) ok = false;
          else if (this.road[t] === 4) field++;
          else if (this.road[t]) ok = false;
          else if (!water && this.nearWater(t)) water = true;
        }
        if (!ok) continue;
        if (near.some((o) => this.distance(o, lx + 1, ly + 1) < this.footprint(o))) continue;
        // Anel em volta do lote: casas vizinhas e rua na frente.
        let neighbors = 0;
        let front = false;
        let street = false;
        for (let ry = -1; ry <= 2; ry++) {
          for (let rx = -1; rx <= 2; rx++) {
            if (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1) continue;
            const t = this.tileAt(lx + rx, ly + ry);
            if (t < 0) continue;
            if (this.built[t]) neighbors++;
            if (isStreet(this.road[t]) && (rx === -1 || rx === 2) !== (ry === -1 || ry === 2)) front = true;
          }
        }
        if (d > core && neighbors > 0) continue;
        if (!front) {
          for (let ry = -2; ry <= 3 && !street; ry++) {
            for (let rx = -2; rx <= 3 && !street; rx++) {
              const t = this.tileAt(lx + rx, ly + ry);
              if (t >= 0 && isStreet(this.road[t])) street = true;
            }
          }
          if (!street) continue;
        }
        const value =
          -B.LAND_DIST * d +
          B.LAND_CLUSTER * Math.min(neighbors, 6) +
          (front ? B.LAND_FRONT : 0) +
          (water ? B.LAND_WATER : 0) -
          1.5 * field +
          ((Math.imul(lx * 73856093 + ly, 19349663) >>> 0) % 100) * 0.001;
        if (value > bv) {
          bv = value;
          best = [...tiles];
        }
      }
    }
    return best;
  }

  /** Lote 2x2 para roça ou cercado (RF-AS-16): no anel logo fora das casas, encostado nas outras roças. */
  private fieldLot(v: Village, kind: 4 | 5 = 4): number[] | null {
    const foot = this.footprint(v);
    const reach = Math.ceil(foot + B.FIELD_RING + (kind === 5 ? 3 : 0));
    const inner = foot - 0.5 + (kind === 5 ? 2 : 0);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const map = this.map;
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < reach + this.footprint(o) + 4);
    let best: number[] | null = null;
    let bv = -Infinity;
    for (let oy = -reach; oy <= reach; oy++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const lx = cx + ox;
        const ly = cy + oy;
        const d = this.distance(v, lx + 1, ly + 1);
        if (d > reach || d < inner) continue;
        const tiles: number[] = [];
        let veg = 0;
        for (let k = 0; k < 4; k++) {
          const t = this.tileAt(lx + (k & 1), ly + (k >> 1));
          if (t < 0 || !isLand(map, t) || this.road[t] || this.built[t] || this.depositAt[t] >= 0 || this.wall[t]) break;
          tiles.push(t);
          veg += map.vegetation[t];
        }
        if (tiles.length < 4) continue;
        if (near.some((o) => this.distance(o, lx + 1, ly + 1) < this.footprint(o) + 1)) continue;
        // Faixas: encostar em roça (ou cercado) do mesmo tipo e numa trilha vale mais.
        let strip = 0;
        let trail = false;
        for (let ry = -1; ry <= 2; ry++) {
          for (let rx = -1; rx <= 2; rx++) {
            if (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1) continue;
            const t = this.tileAt(lx + rx, ly + ry);
            if (t < 0) continue;
            if (this.road[t] === kind) strip++;
            if (isStreet(this.road[t])) trail = true;
            if (this.built[t]) strip -= 0.5;
          }
        }
        const value = -0.6 * Math.abs(d - (inner + 2)) + 0.5 * Math.min(strip, 4) + (trail ? 0.8 : 0) + veg * 0.6;
        if (value > bv) {
          bv = value;
          best = tiles;
        }
      }
    }
    return best;
  }

  /**
   * Caminho de acesso (RF-AS-13): da casa nova até a rede mais perto, por tiles livres, pintado como
   * trilha. Sem rede ao alcance, o caminho vai até a praça (que sempre existe).
   */
  private layAccess(v: Village, x: number, y: number, reach = B.ACCESS_REACH): void {
    const map = this.map;
    const w = map.width;
    const start: number[] = [];
    for (let ry = -1; ry <= 2; ry++) {
      for (let rx = -1; rx <= 2; rx++) {
        const corner = (rx === -1 || rx === 2) && (ry === -1 || ry === 2);
        if (corner || (rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1)) continue;
        const t = this.tileAt(x + rx, y + ry);
        if (t < 0) continue;
        if (isStreet(this.road[t])) return;
        if (isLand(map, t) && !this.built[t] && !this.road[t] && this.depositAt[t] < 0) start.push(t);
      }
    }
    const prev = new Map<number, number>();
    const dist = new Map<number, number>();
    let queue = start;
    for (const t of start) {
      prev.set(t, -1);
      dist.set(t, 0);
    }
    let goal = -1;
    for (let step = 0; step < reach * 2 && queue.length && goal < 0; step++) {
      const next: number[] = [];
      for (const t of queue) {
        const tx = t % w;
        const ty = (t - tx) / w;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = this.tileAt(tx + ox, ty + oy);
          if (n < 0 || prev.has(n)) continue;
          if (isStreet(this.road[n])) {
            prev.set(n, t);
            goal = n;
            break;
          }
          if (!isLand(map, n) || this.built[n] || this.road[n] || this.depositAt[n] >= 0 || this.wall[n]) continue;
          prev.set(n, t);
          dist.set(n, (dist.get(t) ?? 0) + 1);
          next.push(n);
        }
        if (goal >= 0) break;
      }
      queue = next;
    }
    if (goal < 0) return;
    const laid: number[] = [];
    for (let t = prev.get(goal)!; t >= 0; t = prev.get(t)!) {
      if (!this.road[t]) {
        this.road[t] = TRAIL;
        this.roadDirty.push(t);
        this.onTileChanged(t);
        laid.push(t);
      }
    }
    if (laid.length) this.pruneRoads(laid);
    void v;
  }

  /** Praça do assentamento: 3x3 tiles no centro (RF-VIDA-100). As ruas nascem depois, do uso (RF-AS-13). */
  private layPlaza(v: Village): void {
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && isLand(this.map, t) && !this.built[t]) {
          this.road[t] = 3;
          this.onTileChanged(t);
        }
      }
    }
    v.streetLen = 0;
    v.streetPlan = 0;
    v.lots = [];
  }

  /**
   * Casa por família (RF-AS-17): uma vez por ano cada família ganha uma casa (a do líder, a melhor e mais
   * perto da praça; os agricultores preferem os sítios). Casa sem família por IDLE_HOUSE_YEARS anos fica
   * vazia e começa a cair; com o dobro, desaba.
   */
  private assignHomes(v: Village, families: Map<number, number[]> | undefined): void {
    const w = this.map.width;
    const era = Math.floor(v.tech);
    const homes = v.houses.filter((h) => h.kind === 'house' && !h.site);
    const room = new Map<Building, number>();
    for (const h of homes) room.set(h, 4 + era + (h.level ?? 0) * B.LEVEL_HOUSING);
    const byCenter = [...homes].sort((p, q) => this.distance(v, p.x + 1, p.y + 1) - this.distance(v, q.x + 1, q.y + 1));
    const used = new Set<Building>();
    const fams = [...(families?.entries() ?? [])].sort((p, q) => (q[1].includes(v.leader) ? 1 : 0) - (p[1].includes(v.leader) ? 1 : 0) || q[1].length - p[1].length);
    for (const [key, members] of fams) {
      const farmer = members.some((i) => this.role[i] === ROLE.farmer || this.role[i] === ROLE.shepherd);
      const order = farmer ? [...byCenter.filter((h) => h.farm), ...byCenter.filter((h) => !h.farm)] : byCenter.filter((h) => !h.farm).concat(byCenter.filter((h) => h.farm));
      let pick: Building | null = null;
      for (const h of order) {
        const left = room.get(h)!;
        if (left >= members.length || (left > 0 && !pick)) {
          pick = h;
          if (left >= members.length) break;
        }
      }
      if (!pick) {
        for (const i of members) this.home[i] = -1;
        continue;
      }
      room.set(pick, room.get(pick)! - members.length);
      if (!used.has(pick)) pick.owner = key;
      used.add(pick);
      const tile = pick.y * w + pick.x;
      for (const i of members) this.home[i] = tile;
    }
    for (const h of homes) {
      if (used.has(h)) {
        h.idle = 0;
        continue;
      }
      h.owner = undefined;
      h.idle = (h.idle ?? 0) + 1;
      if (h.idle >= B.IDLE_HOUSE_YEARS) h.empty = true;
      if (h.idle >= B.IDLE_HOUSE_YEARS * 2 && homes.length > 2) {
        const at = v.houses.indexOf(h);
        if (at >= 0) {
          this.raze(v, at);
          this.note(`Uma casa abandonada caiu em ${v.name}`, 'povo', v, { key: `idle-${v.id}` });
        }
      }
    }
  }

  /** Núcleo sem árvore nativa (RF-AS-12): de vila em diante, as árvores entre as casas viram lenha. */
  private clearCore(v: Village): void {
    if (v.tier < 1) return;
    const map = this.map;
    const r = Math.ceil(this.footprint(v) * B.CORE_SHARE + 1);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.road[t] || this.built[t] || !isLand(map, t)) continue;
        const decor = decorAt(map, t);
        if (!isTree(decor) && decor !== Decor.Stump && decor !== Decor.Sapling) continue;
        if (isTree(decor)) {
          this.put(v, 'wood', B.WOOD_PER_TREE);
          this.treesCut++;
        } else {
          map.felled![t] = 0;
          this.stumps.delete(t);
        }
        map.bare ??= new Uint8Array(map.width * map.height);
        map.bare[t] = 1;
        this.onTileChanged(t);
      }
    }
  }

  /**
   * Muralha que segue a pegada (RF-AS-18): paliçada de madeira na vila (Bronze em diante) e muralha de
   * pedra na cidade (Ferro em diante), contornando as casas do núcleo, com portão onde a rua cruza.
   * Quem constrói fora dela forma o subúrbio; a metrópole ergue um segundo anel quando ele enche.
   */
  private updateWall(v: Village): void {
    const era = Math.floor(v.tech);
    if (v.tier < 1 || era < 1) return;
    if (v.wallAt !== undefined && this.year - v.wallAt < B.WALL_REVIEW_YEARS) return;
    v.wallAt = this.year;
    const stone = v.tier >= 2 && era >= 2;
    const N = 64;
    const radii = new Float32Array(N);
    const inner = v.houses.filter((h) => !h.farm && h.kind !== 'port');
    const old = v.walls ?? [];
    // Casas fora do anel atual: o subúrbio. A metrópole cerca o subúrbio cheio com um segundo anel.
    const ringed = old.length > 0;
    if (ringed) {
      const outside = inner.filter((h) => !this.insideWall(v, h.x + 1, h.y + 1)).length;
      if (v.tier < 3 || outside < inner.length * 0.3) {
        if (stone && old.some((t) => this.wall[t] === WALL.palisade)) {
          if (!this.payWall(v, old.length, true)) return;
          for (const t of old) if (this.wall[t] === WALL.palisade) this.wall[t] = WALL.stone;
          for (const t of old) this.onTileChanged(t);
          this.note(`${v.name} trocou a paliçada por uma muralha de pedra`, 'povo', v, { major: true });
        }
        return;
      }
    }
    for (const h of inner) {
      const dx = wrapDx(h.x + 1 - v.x, this.map.width);
      const dy = h.y + 1 - v.y;
      const k = Math.floor(((Math.atan2(dy, dx) / (Math.PI * 2) + 1) % 1) * N) % N;
      radii[k] = Math.max(radii[k], Math.hypot(dx, dy) + 1.5);
    }
    const ring = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      let m = 0;
      for (let d = -3; d <= 3; d++) m = Math.max(m, radii[(k + d + N) % N]);
      ring[k] = Math.max(3, m) + B.WALL_PAD;
    }
    const R = Math.ceil(Math.max(...ring)) + 1;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const tiles: number[] = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || !isLand(this.map, t) || this.built[t] || this.wall[t]) continue;
        const ax = cx + dx + 0.5 - v.x;
        const ay = cy + dy + 0.5 - v.y;
        const k = Math.floor(((Math.atan2(ay, ax) / (Math.PI * 2) + 1) % 1) * N) % N;
        const d = Math.hypot(ax, ay);
        if (d < ring[k] || d >= ring[k] + 1) continue;
        if (this.road[t] === 4 || this.road[t] === 5 || this.road[t] === 3) continue;
        tiles.push(t);
      }
    }
    if (tiles.length < 8 || !this.payWall(v, tiles.length, stone)) return;
    for (const t of tiles) {
      this.wall[t] = isStreet(this.road[t]) ? WALL.gate : stone ? WALL.stone : WALL.palisade;
      this.onTileChanged(t);
    }
    v.walls = [...old, ...tiles];
    this.note(
      ringed ? `${v.name} cercou o subúrbio com um segundo anel de muralha` : stone ? `${v.name} ergueu uma muralha de pedra com portões` : `${v.name} se cercou com uma paliçada`,
      'povo',
      v,
      { major: v.tier >= 2 },
    );
  }

  /** O ponto está do lado de dentro da muralha de `v` (sem muralha, tudo é dentro). */
  insideWall(v: Village, x: number, y: number): boolean {
    if (!v.walls?.length) return true;
    const dx = wrapDx(x - v.x, this.map.width);
    const dy = y - v.y;
    const d = Math.hypot(dx, dy);
    const a = Math.atan2(dy, dx);
    let wall = Infinity;
    const w = this.map.width;
    for (const t of v.walls) {
      const tx = wrapDx((t % w) + 0.5 - v.x, w);
      const ty = Math.floor(t / w) + 0.5 - v.y;
      let da = Math.abs(Math.atan2(ty, tx) - a);
      if (da > Math.PI) da = Math.PI * 2 - da;
      if (da < 0.12) wall = Math.min(wall, Math.hypot(tx, ty));
    }
    return d < wall;
  }

  /** Paga a muralha do estoque: madeira na paliçada, pedra na muralha. */
  private payWall(v: Village, tiles: number, stone: boolean): boolean {
    const st = this.store(v);
    if (stone) {
      const need = tiles * B.WALL_STONE;
      if (st.stone < need) return false;
      this.spend(v, 'stone', need);
    } else {
      const need = tiles * B.WALL_WOOD;
      if (st.wood < need) return false;
      this.spend(v, 'wood', need);
    }
    return true;
  }

  /** Tira a muralha de um assentamento (abandono ou fusão). */
  private dropWall(v: Village): void {
    for (const t of v.walls ?? []) {
      this.wall[t] = 0;
      this.onTileChanged(t);
    }
    v.walls = undefined;
  }

  /**
   * Degrau por população e funções (RF-AS seção 4): sobe um degrau quando a gente e as funções
   * permitem; desce quando fica abaixo do que o degrau pede por TIER_DOWN_YEARS anos.
   */
  private updateTier(v: Village, yearly: boolean): void {
    const check = this.tierCheck(v);
    const target = tierAllowed(check);
    if (target > v.tier) {
      v.tier++;
      v.lowYears = 0;
      if (v.tier >= 2) this.rankStreets(v);
      this.note(`${v.name} virou ${TIER_NAMES[v.tier].toLowerCase()}`, 'povo', v, { major: v.tier >= 2 });
      return;
    }
    if (!yearly) return;
    if (belowTier(v.tier, check)) {
      v.lowYears = (v.lowYears ?? 0) + 1;
      if (v.lowYears >= B.TIER_DOWN_YEARS) {
        v.tier--;
        v.lowYears = 0;
        this.tally.tierDowns++;
        this.note(`${v.name} encolheu e voltou a ser ${TIER_NAMES[v.tier].toLowerCase()}`, 'povo', v, { major: v.tier >= 1 });
      }
    } else v.lowYears = 0;
  }

  /**
   * Um ano do plano novo dos assentamentos (seção 20): colônias que partem, casas por família, núcleo
   * sem árvore, muralhas, sítios que se emancipam, degraus que sobem ou descem, fusões e política.
   */
  private communityYear(): void {
    const families = this.familyGroups();
    for (const v of this.villages) {
      if (v.abandoned || v.population <= 0) continue;
      if (v.colony && this.year >= v.colony.until) this.departColony(v, families.get(v.id));
      this.assignHomes(v, families.get(v.id));
      this.clearCore(v);
      this.updateWall(v);
      this.freeFarmsteads(v);
      this.updateTier(v, true);
    }
    this.mergeVillages();
    this.updatePolities();
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
    for (const c of this.caravans) if (c.home === v.id && (c.kind === 'trade' || c.kind === 'tribute')) n++;
    for (const b of this.boats) if (b.village === v.id && b.purpose === 'trade' && b.sunk < 0) n++;
    return n;
  }

  /** Comércio no mundo todo (para o limite CARAVANS_MAX). */
  private tradeInMotion(): number {
    let n = 0;
    for (const c of this.caravans) if (c.kind === 'trade' || c.kind === 'tribute') n++;
    for (const b of this.boats) if (b.purpose === 'trade' && b.sunk < 0) n++;
    return n;
  }

  /** Neve no caminho: no inverno, as caravanas param nas terras frias (RF-VIDA-290). */
  private snowed(x: number, y: number): boolean {
    // Com o clima vivo, é a neve que está no chão; sem ele, a regra fixa do inverno nas terras frias.
    if (this.weather?.ready) return this.weather.snowAt(x, y, this.map.width) > 0.3;
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
    if ((this.scale(v) < 1 && !merc && !market && !v.request) || this.snowed(v.x, v.y)) return;
    if (this.tradeInMotion() >= B.CARAVANS_MAX || this.caravansOf(v) >= caravanCap(this.scale(v), merc)) return;
    if (v.request && happens(this.civRnd, 2, yr)) {
      this.sendTribute(v);
      return;
    }
    if (this.scale(v) < 1 && !merc && !market) return;
    if (!happens(this.civRnd, B.CARAVAN_RATE * (merc ? 2 : 1) * (market ? 1.5 : 1), yr)) return;
    const era = Math.floor(v.tech);
    const load = B.CARAVAN_LOAD * (2 + Math.min(2, this.scale(v)));
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
    const purse = kind === 'trade' ? Math.min(v.stock.gold, 3 + this.scale(v) * 2) : 0;
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
      animals: 1 + Math.min(2, this.scale(v)),
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
    const purse = Math.min(v.stock.gold, 3 + this.scale(v) * 2);
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
    if (kind === 'trade') this.inspire(o, t.cargo.map((c) => c.good), v);
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
    const load = (sea ? B.TRADE_BOAT_LOAD : B.CARAVAN_LOAD * (2 + Math.min(2, this.scale(v)))) - t.cargo.reduce((n, c) => n + c.amount, 0);
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
    this.shareTech(v, o, Math.min(1, P.TECH_TRADE_CHANCE * (fair ? 3 : 1)));
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
        if (this.species[this.kind[j]].kind === 'predator' && hunts(ecologyOf(this.species[this.kind[j]]))) predators++;
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
    if (!foes?.size || c.kind === 'flock' || c.kind === 'visit') return false;
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

  /**
   * Amostras na carga (RF-VIDA-421): ferramenta, metal, tijolo ou pano de quem
   * já domina a técnica inspiram os trabalhadores de quem ainda não a conhece.
   */
  private inspire(o: Village, goods: (Good | 'food')[], maker: Village): void {
    const known = this.knows(o);
    for (const id of P.sampleTechs(goods, this.knows(maker))) {
      if (known.has(id)) continue;
      const t = P.TECH_BY_ID[id];
      if (!t || !t.needs.every((n) => known.has(n))) continue;
      const fresh = (o.samples?.[id] ?? -Infinity) <= this.year;
      (o.samples ??= {})[id] = this.year + P.TECH_SAMPLE_YEARS;
      if (fresh) this.note(`Uma amostra de ${maker.name} deixou os artesãos de ${o.name} curiosos sobre ${t.name}`, 'economia', o, { key: `sample-${o.id}-${id}` });
    }
  }

  /** A caravana chegou ao fim do caminho. Retorna se a viagem acabou. */
  private arrived(c: Caravan): boolean {
    const home = this.villages[c.home];
    // Enxoval dos colonos (RF-AS-03): chega ao lugar novo, descarrega e quem levou fica morando lá.
    if (c.kind === 'settlers') {
      this.unload(home, c.cargo, 0);
      this.disembark(home, c.crew, c.x, c.y);
      return true;
    }
    // Ajuda (RF-AS-45) e visita (RF-AS-42): entrega ou fica um pouco, e volta para casa.
    if (c.kind === 'aid' || c.kind === 'visit') {
      if (!c.back) {
        const o = this.villages[c.target];
        if (!o.abandoned) {
          if (c.kind === 'aid') {
            this.unload(o, c.cargo, 0);
            this.addAffinity(home.id, o.id, B.AFFINITY_AID);
            this.note(`A ajuda de ${home.name} chegou a ${o.name}`, 'economia', o, { key: `aid-in-${o.id}` });
          } else this.addAffinity(home.id, o.id, 1);
        }
        c.cargo = [];
        c.back = true;
        c.path.reverse();
        c.step = 0;
        c.wait = c.kind === 'visit' ? 2 : 0.5;
        return false;
      }
      this.disembark(home, c.crew, c.x, c.y);
      return true;
    }
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
    if (v.luxury && era >= LUXURY_ERA[v.luxury]) this.gain(v, v.luxury, B.LUXURY_MAKE * (1 + this.scale(v)) * (v.vocation === 'mercantil' ? 1.4 : 1));
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
        if (b === Biome.Jungle || b === Biome.Mangrove) jungle++;
        if (b === Biome.Savanna) savanna++;
        if (isForestBiome(b)) forest++;
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
      if (v.vocation === 'mercantil' && this.scale(v) >= 1 && v.population >= 20) {
        v.fair = year;
        this.note(`Feira anual em ${v.name}`, 'economia', v, { key: `fair-${v.id}` });
      }
      // Moeda cunhada pelo reino (RF-VIDA-291).
      if (v.kingdom === v.id && !v.mint && Math.floor(v.tech) >= 3 && this.knew(v, 'moeda') && this.has(v, 'market')) {
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
    v.foot = undefined;
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
        if (t < 0) continue;
        if (!map.felled?.[t]) this.stumps.delete(t);
        if (isLand(map, t)) continue;
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
      if (v.abandoned) continue;
      if (this.distance(v, cx, cy) <= ri + this.reachOf(v, B.WOOD_REACH)) v.treeScan = -1;
      if (this.distance(v, cx, cy) > ri + this.radius(v) + 6) continue;
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
    this.mapVersionKey++;
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
    // Sem lava esfriando e sem lava de nascença, não há o que varrer (o mapa inteiro, uma vez por ano).
    if (!this.cooling.length) {
      if (this.bornLava < 0) this.bornLava = map.biome.some((b) => b === Biome.Lava) ? 1 : 0;
      if (!this.bornLava) return;
    }
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

  /**
   * Fogo natural (Plano 2): no auge do verão, algumas células são sorteadas; mata densa, quente e seca
   * pega fogo por raio com chance que cresce com a secura (umidade baixa e ano de seca na região).
   * O fogo anda alguns passos com o vento, deixa terra queimada que volta pelo capim (o crescimento
   * de sempre), mata parte dos bichos que não fogem e deixa as carcaças para os necrófagos.
   */
  private wildfires(): void {
    const c = this.cells;
    if (!c) return;
    const map = this.map;
    let fires = 0;
    const tries = Math.ceil(c.n / 8);
    for (let n = 0; n < tries && fires < B.WILDFIRE_MAX; n++) {
      const k = Math.floor(this.worldRnd() * c.n);
      if (c.wood[k] < 40) continue;
      const x0 = (k % c.cols) * ECO_CELL + Math.floor(this.worldRnd() * ECO_CELL);
      const y0 = Math.floor(k / c.cols) * ECO_CELL + Math.floor(this.worldRnd() * ECO_CELL);
      const t0 = this.tileAt(x0, y0);
      if (t0 < 0 || !isLand(map, t0) || map.vegetation[t0] < 0.5 || this.built[t0]) continue;
      const wx = this.weather;
      const temp = wx?.ready ? wx.tempNow(k, this.yearPhase()) : temperatureAt(map, t0);
      if (temp < 288 || (wx?.ready && wx.snow[k] > 0.05)) continue;
      const drought = Math.max(0, -this.climateAt(x0, y0));
      // Solo seco (pela água no solo do clima vivo, ou pela umidade do lugar) em ano de seca.
      const soil = wx?.ready ? wx.soil[k] : map.moisture[t0];
      const dry = Math.min(1, (1 - soil) * (0.6 + 0.6 * drought));
      if (this.worldRnd() > B.WILDFIRE_RATE * dry * dry * dry * 8) continue;
      fires++;
      this.burn(x0 + 0.5, y0 + 0.5);
    }
  }

  /** Um incêndio de mata: anda com o vento a partir de (x, y), queimando o que é lenhoso. */
  private burn(x: number, y: number): void {
    const map = this.map;
    const wind = windAt(y, map.height);
    let burnt = 0;
    let fx = x;
    let fy = y;
    for (let step = 0; step < B.WILDFIRE_STEPS; step++) {
      this.reshape(fx, fy, 2.5, (t, d) => {
        if (map.vegetation[t] < 0.3 || this.built[t] || this.worldRnd() > 0.95 - d * 0.15) return;
        map.vegetation[t] = 0.04;
        burnt++;
      });
      this.effect('flame', fx, fy, 6, 1.6);
      this.forEachNear(fx, fy, 3, (i) => {
        if (!this.wild(this.kind[i]) || this.worldRnd() > 0.25) return;
        this.leaveCarcass(i);
        this.kill(i, false, 'desastre');
      });
      fx += wind.x * 2.5 + (this.worldRnd() - 0.5) * 1.5;
      fy = Math.max(1, Math.min(map.height - 2, fy + wind.y * 2.5 + (this.worldRnd() - 0.5) * 1.5));
    }
    this.tally.wildfires++;
    const near = this.settlementAt(x, y) ?? this.villages.find((v) => !v.abandoned && Math.hypot(wrapDx(v.x - x, map.width), v.y - y) < 30);
    this.note(`Um raio pôs fogo na mata seca${near ? ` perto de ${near.name}` : ''}: ${burnt} tiles queimados, o capim volta primeiro`, 'natureza', { x: Math.floor(x), y: Math.floor(y) }, { key: 'wildfire' });
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
    this.teachTech(v);
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
        this.teachTech(v);
        taught.push(v);
      }
    }
    return taught;
  }

  /** Quem a pessoa é, para levar num barco. */
  private identity(i: number): Identity {
    const traits = this.traits.slice(i * TRAIT_COUNT, (i + 1) * TRAIT_COUNT);
    return { uid: this.uid[i], parent: this.parent[i], family: this.family[i], bornAt: this.bornAt[i], bornYear: this.bornYear[i], movedAt: this.movedAt[i], traits };
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
    if (who.traits) this.traits.set(who.traits, c * TRAIT_COUNT);
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
  /** Laços de quem está vivo (IA local, relações): cônjuge, amigos do mais próximo ao menos, e rivais. */
  tiesOf(i: number): { partner: number; friends: number[]; rivals: number[] } {
    const out = { partner: -1, friends: [] as number[], rivals: [] as number[] };
    const list = [...(this.bonds.get(this.uid[i]) ?? [])].sort((a, b) => b.value - a.value);
    for (const b of list) {
      const j = this.indexOfUid(b.uid);
      if (j < 0) continue;
      if (b.kind === BOND.partner) out.partner = j;
      else if (b.kind === BOND.friend) out.friends.push(j);
      else if (b.kind === BOND.rival) out.rivals.push(j);
    }
    return out;
  }

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

  /** O que um bicho de terra está fazendo e por quê (a ação que venceu na IAUS). */
  wildActivity(i: number): string {
    const sp = this.species[this.kind[i]];
    const e = ecologyOf(sp);
    const moving = Math.hypot(this.vx[i], this.vy[i]) > 0.05;
    const hungry = this.energy[i] < STARVING ? ', com muita fome' : this.energy[i] < HUNGRY ? ', com fome' : '';
    const w = this.map.width;
    switch (this.act[i]) {
      case ACT.eat: {
        const t = this.tileAt(this.x[i], Math.floor(this.y[i]));
        const food = t >= 0 && e.fruit * this.browseAt(t) > e.forage * this.forageAt(t) ? 'comendo frutos e brotos' : e.forage >= Math.max(e.insects, e.fish, e.plankton) ? 'pastando' : e.insects >= Math.max(e.fish, e.plankton) ? 'caçando insetos' : 'comendo na beira da água';
        if (!moving) return food + hungry;
        const g = this.goal[i];
        if (g < 0) return `procurando comida${hungry}`;
        const d = Math.round(Math.hypot(wrapDx((g % w) + 0.5 - this.x[i], w), Math.floor(g / w) + 0.5 - this.y[i]));
        return `indo comer a ${d} tiles${hungry}`;
      }
      case ACT.hunt: {
        const j = this.chase[i];
        if (j >= 0 && this.alive[j]) return `caçando ${this.species[this.kind[j]].name.toLowerCase()}${hungry}`;
        return `procurando caça${hungry}`;
      }
      case ACT.scavenge:
        return moving ? 'indo até uma carcaça' : 'comendo uma carcaça';
      case ACT.flee:
        return 'fugindo de um predador';
      case ACT.shelter:
        return temperatureAt(this.map, this.tileOf(i)) < (sp.tempMin + sp.tempMax) / 2 ? 'procurando um lugar mais quente' : 'procurando um lugar mais fresco';
      case ACT.mate:
        return 'procurando parceiro';
      case ACT.disperse:
        return 'mudando de território (aqui está lotado)';
      case ACT.herd:
        return e.pack ? 'andando com a matilha' : 'seguindo o bando';
      case ACT.hibernate:
        return 'hibernando';
      case ACT.drink:
        return 'indo beber água';
      default:
        return moving ? 'andando' : 'descansando';
    }
  }

  /** O que a criatura está fazendo agora, em poucas palavras (RF-VIDA-335). */
  activityOf(i: number): string {
    const sp = this.species[this.kind[i]];
    const moving = Math.hypot(this.vx[i], this.vy[i]) > 0.05;
    const vi = this.village[i];
    if (this.wild(this.kind[i])) return this.wildActivity(i);
    if (sp.kind !== 'sapient') {
      const filter = ecologyOf(sp).guild === 'filtrador';
      if (filter) return moving ? 'filtrando plâncton' : 'descansando';
      if (this.energy[i] < 0.3) return sp.kind === 'shark' ? 'caçando, com fome' : 'procurando comida';
      let threat = false;
      if (sp.kind === 'fish') {
        this.forEachNear(this.x[i], this.y[i], 4, (j) => {
          if (this.species[this.kind[j]].kind === 'shark' && ecologyOf(this.species[this.kind[j]]).guild !== 'filtrador') threat = true;
        });
      }
      if (threat && moving) return 'fugindo de um tubarão';
      return moving ? 'nadando' : 'descansando';
    }
    if (vi < 0) return moving ? 'andando sem rumo' : 'descansando no mato';
    const v = this.villages[vi];
    if (this.expedition.has(i)) return 'em campanha de guerra';
    const role = ROLES[this.role[i]];
    const d = this.distance(v, this.x[i], this.y[i]);
    const inside = d <= this.footprint(v) + 1;
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
        return v.houses.some((h) => this.underWork(h)) ? 'construindo uma casa' : 'consertando casas';
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
