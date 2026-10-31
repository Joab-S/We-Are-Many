import * as B from './balance';
import { Weather } from './weather';
import { streams } from './stochastic';
import type { SurfaceMap } from '../procgen/surface';
import { generateDeposits, type Deposit } from './economy';
import { yearlyEvents } from './events';
import type { Thought } from '../ai/trace';
import type { Bond } from '../ai/relations';
import type { BoardTask } from '../ai/decisions/day';
import type { Agreement, Caravan } from './trade';
import type { Species } from './species';
import { DECISIONS_PER_YEAR, ECO_CELL } from './fauna';
import type { ChronicleKind, ChronicleEntry, Effect, War, WarPlan, Boat, Raft, Building, Village, Death, Carcass } from './eco/types';
import * as constantsModule from './eco/constants';
import * as tilesModule from './eco/tiles';
import type { EcoCells } from './eco/cells';
import { entitiesPart, type EntitiesPart } from './eco/core/entities';
import { migrationPart, type MigrationPart } from './eco/people/migration';
import { societyPart, type SocietyPart } from './eco/people/society';
import { vocationPart, type VocationPart } from './eco/people/vocation';
import { herdsPart, type HerdsPart } from './eco/people/herds';
import { economyYearPart, type EconomyYearPart } from './eco/economy/year';
import { growthPart, type GrowthPart } from './eco/flora/growth';
import { peopleDecidePart, type PeopleDecidePart } from './eco/people/decide';
import { faunaCellsPart, type FaunaCellsPart } from './eco/fauna/cells';
import { faunaFoodPart, type FaunaFoodPart } from './eco/fauna/food';
import { faunaDecidePart, type FaunaDecidePart } from './eco/fauna/decide';
import { faunaSpacePart, type FaunaSpacePart } from './eco/fauna/space';
import { foundingPart, type FoundingPart } from './eco/settlements/founding';
import { layoutPart, type LayoutPart } from './eco/settlements/layout';
import { buildingsPart, type BuildingsPart } from './eco/settlements/buildings';
import { lifecyclePart, type LifecyclePart } from './eco/settlements/lifecycle';
import { roadsPart, type RoadsPart } from './eco/settlements/roads';
import { stockPart, type StockPart } from './eco/economy/stock';
import { techPart, type TechPart } from './eco/economy/tech';
import { productionPart, type ProductionPart } from './eco/economy/production';
import { savePart, type SavePart } from './eco/core/save';
import { journeysPart, type JourneysPart } from './eco/community/journeys';
import { wearPart, type WearPart } from './eco/community/wear';
import { relationsPart, type RelationsPart } from './eco/community/relations';
import { jobsPart, type JobsPart } from './eco/work/jobs';
import { resourcesPart, type ResourcesPart } from './eco/work/resources';
import { warPart, type WarPart } from './eco/war/war';
import { diplomacyPart, type DiplomacyPart } from './eco/politics/diplomacy';
import { coloniesPart, type ColoniesPart } from './eco/settlements/colonies';
import { polityPart, type PolityPart } from './eco/settlements/polity';
import { formPart, type FormPart } from './eco/settlements/form';
import { portsPart, type PortsPart } from './eco/naval/ports';
import { raftsPart, type RaftsPart } from './eco/naval/rafts';
import { boatsPart, type BoatsPart } from './eco/naval/boats';
import { marketsPart, type MarketsPart } from './eco/trade/markets';
import { caravansPart, type CaravansPart } from './eco/trade/caravans';
import { disastersPart, type DisastersPart } from './eco/world/disasters';
import { playerPart, type PlayerPart } from './eco/world/player';
import { queriesPart, type QueriesPart } from './eco/core/queries';
import { EVENT_QUEUE_LIMIT, type EngineEvent } from './api/events';
import { residentsPart, ResidentIndex, type ResidentsPart } from './eco/core/residents';
import { clockPart, type ClockPart } from './eco/core/clock';

export * from './eco/types';
export * from './eco/constants';
export * from './eco/helpers';
export * from './eco/tiles';
export * from './eco/cells';

// Cópias locais dos valores de eco/* (aqui e em cada parte), feitas uma vez ao carregar o módulo: antes da divisão eram
// nomes do próprio ecosystem.ts, e vários estão em laços quentes. No vitest cada import vira um getter, que deixava a
// simulação ~10% mais lenta (no build do jogo não faz diferença).
const { YEAR_SECONDS, CHRONICLE_MAX, MERGE_YEARS, CELL, THINK_INTERVAL, ACT } = constantsModule;
const { isWater } = tilesModule;

/**
 * Ecossistema da superfície (RF-SUP-08, RF-SUP-09): criaturas individuais
 * que andam pelo mapa, comem, se reproduzem e morrem, e espécies
 * inteligentes primitivas que formam aldeias e avançam de era.
 * Não depende do three.js; a renderização só lê os arrays.
 */

/**
 * O Ecosystem é uma classe parcial: aqui ficam o estado (campos), o construtor, a crônica e o
 * escalonador (`step` e `yearly`); os métodos de cada domínio ficam em src/sim/eco/<domínio>/*.ts,
 * como objetos literais com `this: Ecosystem`, e são instalados no protótipo logo depois da classe.
 * Esta interface junta os tipos deles à classe (merge de declaração).
 */
export interface Ecosystem
  extends EntitiesPart,
    MigrationPart,
    SocietyPart,
    VocationPart,
    HerdsPart,
    EconomyYearPart,
    GrowthPart,
    PeopleDecidePart,
    FaunaCellsPart,
    FaunaFoodPart,
    FaunaDecidePart,
    FaunaSpacePart,
    FoundingPart,
    LayoutPart,
    BuildingsPart,
    LifecyclePart,
    RoadsPart,
    StockPart,
    TechPart,
    ProductionPart,
    SavePart,
    JourneysPart,
    WearPart,
    RelationsPart,
    JobsPart,
    ResourcesPart,
    WarPart,
    DiplomacyPart,
    ColoniesPart,
    PolityPart,
    FormPart,
    PortsPart,
    RaftsPart,
    BoatsPart,
    MarketsPart,
    CaravansPart,
    DisastersPart,
    PlayerPart,
    QueriesPart,
    ResidentsPart,
    ClockPart {}

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
   * Jornadas (RF-AS-20 a 27): a jornada (DAY), o tile do destino, a perna (0 indo, 1 no lugar, 2 voltando
   * com a carga), o tempo no lugar, a carga (CARGO) e quanto leva, as necessidades de descanso, convívio e
   * fé (0 satisfeita, 1 urgente) e o gesto que a tela anima (GESTURE).
   */
  day = new Uint8Array(0);
  dayAt = new Int32Array(0);
  dayLeg = new Uint8Array(0);
  dayTime = new Float32Array(0);
  carry = new Uint8Array(0);
  carryAmt = new Float32Array(0);
  needRest = new Float32Array(0);
  needSocial = new Float32Array(0);
  needFaith = new Float32Array(0);
  gesture = new Uint8Array(0);
  /**
   * IA local das pessoas (src/ai): TRAIT_COUNT traços de −10 a 10 por indivíduo (inteligentes; bichos ficam em 0)
   * e o diário curto das decisões de cada um, pelo `uid`.
   */
  traits = new Int8Array(0);
  /** Fauna de terra: ação atual (ACT), tile de destino (-1 nenhum), presa perseguida (-1 nenhuma) e carga de parasitas (0 a 1). */
  act = new Uint8Array(0);
  goal = new Int32Array(0);
  chase = new Int32Array(0);
  /**
   * `uid` da presa perseguida (0 nenhuma): o handle de `chase`. O índice da presa é reaproveitado depois
   * da morte dela (Object Pool), então a perseguição só vale enquanto o lugar ainda tem esse `uid`.
   */
  chaseUid = new Uint32Array(0);
  /**
   * `uid` da presa que escapou da última caçada (0 nenhuma), para o caçador não voltar logo atrás dela; vale
   * enquanto ele segue caçando. Antes ficava em `goal`, que no resto do tempo guarda um tile.
   */
  escaped = new Uint32Array(0);
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
  preyAbundance = 1;
  /** Decisões normais que a decisão atual do bicho vale (detalhe menor longe da tela). */
  lodStride = 1;
  /** Último ano em que o fogo natural foi sorteado. */
  fireYear = -1;
  /** Quantas decisões normais cabem até a próxima deste bicho (3 fora da tela). */
  stride = 1;
  /** O mapa tinha lava sem erupção (planeta quente)? -1 = ainda não olhou. */
  bornLava = -1;
  /**
   * Onde o jogador está olhando (centro e meia largura, em tiles). Bichos de terra longe disso
   * decidem três vezes menos, cada decisão valendo por três: mesma biologia por ano, um terço do custo.
   */
  focus: { x: number; y: number; r: number } | null = null;
  /** Lugar da pessoa aberta na ficha: fica no modo completo mesmo fora da vista (a ficha sempre mostra o porquê). */
  pinned = -1;
  watchClock = 0;
  /** Células ecológicas (comida, nicho, capacidade e contagem); vão no save para a simulação seguir idêntica. */
  cells: EcoCells | null = null;
  /** Clima vivo: vento, umidade, chuva, neve e água no solo por célula de 16×16 (Plano 2). */
  weather: Weather | null = null;
  /** Tempo (anos) desde a última recontagem das células ecológicas. */
  wildClock = 0;
  readonly diary = new Map<number, Thought[]>();
  /** Laços de cada pessoa com outras (amizade, casamento, rivalidade), pelo `uid` (src/ai/relations.ts). */
  readonly bonds = new Map<number, Bond[]>();
  /** Ofícios de cada assentamento no último ano (índice em ROLES), para a IA saber o que já está cheio. */
  roleCount = new Map<number, number[]>();
  /**
   * `uid` -> índice de cada criatura viva (Object Pool com handle: o índice é reaproveitado depois da
   * morte, o `uid` não). Mantido por `spawn`, `kill` e `restore`; refeito dos vetores depois de carregar.
   */
  readonly uidIndex = new Map<number, number>();
  /** Tiles que ninguém alcançou, e o ano até o qual saem do quadro de serviços. */
  readonly jobBlocked = new Map<number, number>();
  /** Obra que cada construtor atende (cache; se faltar, é refeito pelo tile da ordem). */
  readonly siteCache = new Map<number, Building>();
  /** Tile alvo -> quem reservou; a reserva só vale enquanto o indivíduo vive e ainda mira esse tile. */
  readonly jobClaim = new Map<number, number>();
  /** Jangadas atravessando a água agora. */
  readonly rafts: Raft[] = [];
  nextUid = 0;
  nextFamily = 0;
  /** Últimas mortes, da mais nova para a mais antiga. */
  readonly deaths: Death[] = [];
  readonly villages: Village[] = [];
  readonly boats: Boat[] = [];
  /** Caravanas, tributos e rebanhos na estrada (RF-VIDA-230 e 293). */
  readonly caravans: Caravan[] = [];
  nextCaravan = 0;
  /** Acordos comerciais em vigor (RF-VIDA-232). */
  readonly agreements: Agreement[] = [];
  /** Viagens de ida e volta entre cada par de assentamentos (chave "a:b"), para firmar acordos. */
  readonly trips = new Map<string, number>();
  /** Pares de reinos que trocaram por caravana neste ano: a troca invisível fica só como reserva. */
  readonly caravanPairs = new Set<string>();
  /** Técnicas que já apareceram em algum assentamento (a primeira vai para a crônica). */
  readonly techsSeen = new Set<string>();
  /** Uso das estradas por tile e a maior era de quem passou (RF-VIDA-233). */
  readonly traffic: Uint16Array;
  readonly trafficEra: Uint8Array;
  readonly trafficTiles = new Set<number>();
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
  cultures = 0;
  /** Segundos do ano de ação em curso (o relógio de `yearly()`; os dois relógios estão em eco/core/clock.ts). */
  yearClock = 0;
  /**
   * Clima do ano por região (RF-VIDA-304 e 305): 0 é um ano normal, negativo
   * é seca ou frio fora de hora, positivo é ano bom. Parte é comum ao planeta
   * inteiro e parte é de cada região; tudo volta ao normal com o tempo.
   */
  readonly climate = new Float32Array(B.CLIMATE_REGIONS[0] * B.CLIMATE_REGIONS[1]);
  climateShared = 0;
  readonly climateLocal = new Float32Array(B.CLIMATE_REGIONS[0] * B.CLIMATE_REGIONS[1]);
  readonly droughtNoted = new Float32Array(B.CLIMATE_REGIONS[0] * B.CLIMATE_REGIONS[1]).fill(-1e9);
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
  readonly cavalry = new Map<number, number>();
  /** Reinos cujo rei morreu e que podem se dividir numa guerra civil. */
  readonly crises = new Set<number>();
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
  readonly cooling: { i: number; heat: number }[] = [];
  /** Ruas por tile: 0 nenhuma, 1 terra, 2 pedra, 3 praça. */
  readonly road: Uint8Array;
  /** Paliçada, muralha e portões (RF-AS-18, `WALL`). */
  wall: Uint8Array;
  /** Rua principal (1) ou viela (0), refeito a cada traçado das ruas (RF-VIDA-253). */
  readonly mainStreet: Uint8Array;
  /** Tiles ocupados por casas. */
  readonly built: Uint8Array;
  /** Crescimento da muda (0 a 1), vegetação da árvore antes do corte e tiles com toco ou muda (seção 19.19). */
  readonly treeGrow: Float32Array;
  readonly treeVeg: Float32Array;
  readonly stumps = new Set<number>();
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
    // Quando sair e fissão (agente 3B): fundações por pressão, por fome e por recurso; fissões e a soma do
    // tamanho da origem na hora; anos-lugar de circunscrição, lugares que ficaram circunscritos e guerras por terra.
    foundPressure: 0,
    foundLand: 0,
    foundFamine: 0,
    foundResource: 0,
    fissions: 0,
    fissionPop: 0,
    circumYears: 0,
    circumscribed: 0,
    landHunger: 0,
  };
  readonly population: number[] = [];
  /** Teto de cada espécie neste planeta, proporcional ao habitat. */
  readonly caps: number[] = [];
  /** Onde cada espécie vive (habitatOf) e se já teve indivíduos aqui (extinção). */
  readonly habitat: (0 | 1 | 2)[] = [];
  readonly everLived: boolean[] = [];
  /** Chamado quando uma espécie entra no planeta (variantes novas vão para o catálogo). */
  onSpecies: (sp: Species) => void = () => {};
  /** Anos de calendário desde a chegada (o ano que a tela mostra). */
  year = 0;
  /**
   * Segundos de simulação que formam um ano de calendário (padrão YEAR_SECONDS; maior na tela para o ano durar
   * mais sem desacelerar ações e eventos, que seguem o ano de ação). Os dois relógios estão em eco/core/clock.ts.
   */
  yearSpan = YEAR_SECONDS;
  /** Crônica do planeta, do mais novo para o mais antigo (RF-VIDA-156). */
  readonly chronicle: ChronicleEntry[] = [];
  /**
   * Fila de eventos de domínio (Event Queue, src/sim/api/events.ts), da mais antiga para a mais nova: o motor
   * só empurra (`emit`), quem ouve drena (`drainEvents`). Vai no save, então nada se perde ao carregar.
   */
  readonly events: EngineEvent[] = [];
  /** Ano do último acontecimento importante (para detectar marasmo). */
  lastMajor = 0;
  /** Aviso curto para o jogador (ex.: lugar inválido): a fachada (src/sim/api/engine.ts) o devolve no resultado do comando e limpa. */
  hint = '';
  free: number[] = [];
  /**
   * Sorteios da vida (cada subsistema tem o seu fluxo, RF-VIDA-306): o andar das pessoas e dos bichos da
   * água, nascimentos, o mundo inicial. Bichos de terra e vegetação têm fluxos próprios (abaixo).
   */
  readonly rnd: () => number;
  /**
   * Sorteios das decisões dos bichos de terra (e do nascer, desviar e quicar deles). O detalhe deles muda
   * com a câmera; num fluxo só deles, a câmera não mexe nos sorteios das pessoas nem da vegetação.
   */
  readonly faunaRnd: () => number;
  /** Sorteios da vegetação e das florestas (`growVegetation` e `growForests`). */
  readonly floraRnd: () => number;
  /** Sorteios dos povos: casas, colonos, barcos, produção. */
  readonly civRnd: () => number;
  /** Sorteios do saber: técnicas aprendidas e esquecidas. */
  readonly lore: () => number;
  /** Sorteios da política: relações, incidentes, guerras. */
  readonly polRnd: () => number;
  /** Sorteios dos eventos do mundo. */
  readonly worldRnd: () => number;
  /** Sorteios do clima do ano. */
  readonly climateRnd: () => number;
  /** Sorteios da IA das pessoas: traços, herança e escolhas (fluxo próprio, para não mexer nos outros). */
  readonly mindRnd: () => number;
  gridHead = new Int32Array(0);
  gridNext = new Int32Array(0);
  cols: number;
  rows: number;
  villageClock = 0;

  /** Chamado quando uma criatura altera um tile (ex.: come a vegetação). */
  onTileChanged: (i: number) => void = () => {};

  /**
   * Índices derivados (caches): ficam fora do save e da impressão digital (propriedades não enumeráveis,
   * criadas no construtor) e são refeitos sob demanda depois de carregar.
   */
  /** Moradores por assentamento (eco/core/residents.ts). */
  declare residentIndex: ResidentIndex;

  constructor(
    readonly map: SurfaceMap,
    seed: number,
  ) {
    Object.defineProperty(this, 'residentIndex', { value: new ResidentIndex(), writable: true, enumerable: false });
    const rng = streams(seed);
    this.rnd = rng.vida;
    this.civRnd = rng.povos;
    this.lore = rng.saber;
    this.polRnd = rng.politica;
    this.worldRnd = rng.mundo;
    this.climateRnd = rng.clima;
    this.mindRnd = rng.mente;
    // Saves de antes destes fluxos não têm o estado deles: começam aqui, da semente (determinístico).
    this.faunaRnd = rng.fauna;
    this.floraRnd = rng.flora;
    this.road = new Uint8Array(map.width * map.height);
    this.traffic = new Uint16Array(map.width * map.height);
    this.trafficEra = new Uint8Array(map.width * map.height);
    this.mainStreet = new Uint8Array(map.width * map.height);
    this.wall = new Uint8Array(map.width * map.height);
    this.wear = new Float32Array(map.width * map.height);
    this.roadIdle = new Uint8Array(map.width * map.height);
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
  note(text: string, kind: ChronicleKind, at?: { x: number; y: number } | null, opts: { major?: boolean; key?: string; place?: string; villages?: number[] } = {}): void {
    const major = opts.major ?? false;
    if (major && kind !== 'jogador') this.lastMajor = this.year;
    const villages = this.noteVillages(text, at, opts.villages);
    if (opts.key) {
      const old = this.chronicle.find((e) => e.key === opts.key && this.year - e.year < MERGE_YEARS);
      if (old) {
        old.count++;
        old.year = this.year;
        if (opts.place && !old.places.includes(opts.place)) old.places.push(opts.place);
        old.villages ??= [];
        for (const id of villages) if (!old.villages.includes(id)) old.villages.push(id);
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
      villages,
    });
    if (this.chronicle.length > CHRONICLE_MAX) this.chronicle.length = CHRONICLE_MAX;
  }

  /**
   * Assentamentos de uma linha da crônica, pelo id: o lugar onde aconteceu (quando `at` é um assentamento),
   * os pedidos e os citados pelo nome no texto (a colônia lembra a mãe, a guerra os dois lados). Guardado
   * na linha, a janela do assentamento acha a história dele sem procurar o nome no texto.
   */
  noteVillages(text: string, at?: { x: number; y: number } | null, ids?: number[]): number[] {
    const out: number[] = [];
    const id = at ? (at as { id?: unknown }).id : undefined;
    if (typeof id === 'number' && this.villages[id] === at) out.push(id);
    if (ids) for (const k of ids) if (!out.includes(k)) out.push(k);
    for (const v of this.villages) if (!out.includes(v.id) && text.includes(v.name)) out.push(v.id);
    return out;
  }

  /** Anota um evento de domínio na fila (só empurra: não sorteia nem muda o mundo). Cheia, o mais antigo sai. */
  emit(e: EngineEvent): void {
    if (this.events.length >= EVENT_QUEUE_LIMIT) this.events.shift();
    this.events.push(e);
  }

  /** Entrega e esvazia a fila de eventos, do mais antigo para o mais novo. */
  drainEvents(): EngineEvent[] {
    return this.events.splice(0, this.events.length);
  }

  /** Texto de uma linha da crônica, com repetições e lugares. */
  static describe(e: ChronicleEntry): string {
    const places = e.places.length > 1 ? ` (${e.places.slice(0, 4).join(', ')}${e.places.length > 4 ? '…' : ''})` : '';
    return `${e.text}${places}${e.count > 1 ? ` ×${e.count}` : ''}`;
  }

  get total(): number {
    return this.count - this.free.length;
  }

  /** Avança a simulação `dt` segundos de jogo (já multiplicados pela velocidade escolhida). */
  step(dt: number): void {
    if (dt <= 0) return;
    const yr = dt / this.yearSpan;
    this.year += yr;
    // Nível de detalhe (RF-AS-31): com a tela aberta, os lugares a até JOURNEY_MARGIN tiles da vista (e o da pessoa
    // seguida) rodam as jornadas; os demais, o modo agregado. Revisto a cada meio segundo de jogo.
    if (this.focus && (this.watchClock -= dt) <= 0) {
      this.watchClock = 0.5;
      const f = this.focus;
      const ids: number[] = [];
      for (const v of this.villages) if (!v.abandoned && (this.distance(v, f.x, f.y) <= f.r + B.JOURNEY_MARGIN + this.footprint(v) || v.id === this.pinned)) ids.push(v.id);
      this.watch(ids);
    }
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
    // Dois relógios (eco/core/clock.ts): bichos de terra decidem DECISIONS_PER_YEAR vezes por ano de calendário;
    // os aquáticos vivem no ano de ação, em que foram calibrados, então a biologia não muda com a duração do ano.
    const animalThink = this.yearSpan / DECISIONS_PER_YEAR;
    const legacy = this.actionScale();
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
          const r = sk === 'herbivore' || sk === 'predator' ? this.faunaRnd : this.rnd;
          this.vx[i] = -this.vx[i] + (r() - 0.5) * 0.5;
          this.vy[i] = -this.vy[i] + (r() - 0.5) * 0.5;
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
    // Efeitos só se desenham (a simulação conta só quantos há): o que acabou sai trocando de lugar com o último
    // (swap-remove, sem deslocar o resto). O laço vai de trás para frente, então o que vem para `k` já foi visto.
    const effects = this.effects;
    for (let k = effects.length - 1; k >= 0; k--) {
      const fx = effects[k];
      fx.age += dt;
      if (fx.age < fx.life) continue;
      const last = effects.pop()!;
      if (k < effects.length) effects[k] = last;
    }
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt);
    this.villageClock += dt;
    if (this.villageClock >= 1) {
      this.updateVillages(this.villageClock);
      this.villageClock = 0;
    }
  }

  readonly contours = new WeakMap<Village, { key: number; radii: Float32Array }>();

  /** Técnicas de cada lugar como conjunto (cache de `knows`, refeito quando a lista muda; WeakMap fica fora do save). */
  readonly knowsCache = new WeakMap<Village, { techs: string[] | undefined; n: number; set: ReadonlySet<string> }>();

  /** Contador de alterações em tiles para atualizar o cache do contorno na hora. */
  mapVersionKey = 0;

  /** Ruas pintadas desde a última limpeza anual (RF-VIDA-195). */
  roadDirty: number[] = [];

  /** Último lote achado por assentamento (casa e roça) e até quando vale. */
  readonly lotCache = new Map<number, { tiles: number[] | null; until: number }>();

  // ---- Jornadas (plano novo dos assentamentos, fase 3: RF-AS-20 a 31) ----

  /** O que entrou no pátio no modo completo e o que foi entregue no celeiro, por bem (o teste compara os dois). */
  yardIn: Record<string, number> = {};
  delivered: Record<string, number> = {};
  /** Porquê da última jornada de cada pessoa, pelo uid (RF-AS-30). */
  dayNotes = new Map<number, { label: string; why: string; others: { label: string; score: number }[] }>();
  /** Quadro de tarefas de cada assentamento no modo completo, refeito a cada TASK_SECONDS (RF-AS-21). */
  boards = new Map<number, { at: number; tasks: BoardTask[] }>();
  /** Roças de cada assentamento (tiles), refeitas no máximo uma vez por ano. */
  fieldCache = new Map<number, { year: number; tiles: number[] }>();

  // ---- Ruas por uso (plano novo dos assentamentos, fase 4: RF-AS-13 e 14) ----

  /** Desgaste de cada tile pelos passos (modo completo) e pelo tráfego anual (modo agregado). */
  wear = new Float32Array(0);
  /** Anos seguidos de cada tile de rua sem uso (para esquecer a rua que ninguém pisa). */
  roadIdle = new Uint8Array(0);
  /** Tiles com desgaste ou rua de terra a acompanhar (refeito a partir dos vetores depois de carregar). */
  wearTiles = new Set<number>();

  // ---- Relações entre lugares e política que emerge (plano novo dos assentamentos, fase 5: RF-AS-40 a 53) ----

  /** Lugar de onde cada pessoa veio (memória de origem, RF-AS-41): onde nasceu ou de onde se mudou. */
  origin = new Int32Array(0);
  /** Trocas do ano entre pares de lugares (caravanas que chegaram), para a afinidade. */
  pairTrades = new Map<string, number>();
  /** Dívidas de ajuda (RF-AS-45): quem deve a quem, pelo par, com o ano em que vence. */
  readonly debts = new Map<string, { creditor: number; debtor: number; until: number }>();

  /** Inimigos de cada reino; refeito a cada atualização das guerras. */
  enemies = new Map<number, Set<number>>();

  /** Uma vez por ano: diplomacia, lava esfriando, ruínas sumindo e eventos do mundo. */
  yearly(): void {
    this.updateClimate();
        this.communityYear();
    this.relationsYear();
    this.updateWear();
    // Rede de ruas: o que escapou da limpeza na hora (ruas de dois assentamentos que se encostam) sai uma vez por ano.
    if (this.roadDirty.length) {
      this.pruneRoads(this.roadDirty);
      this.roadDirty = [];
    }
    this.linkRoads();
    // Estradas novas mudam por onde passa mais gente: vilas e cidades revêem ruas principais e avenida a cada 10 anos.
    for (const v of this.villages) if (!v.abandoned && v.tier >= 1 && (Math.floor(this.year) + v.id) % 10 === 0) this.rankStreets(v);
    this.economyYear();
    // Quem sai decide com as necessidades, a estabilidade e a pressão deste ano (antes, a migração vinha antes da
    // economia e decidia com as do ano anterior).
    this.migrate();
    this.epidemics();
    for (const k of this.crises) this.succession(this.villages[k]);
    this.crises.clear();
    this.diplomacy();
    this.coolLava();
    this.lavaFires();
    this.growForests();
    for (let k = this.ruins.length - 1; k >= 0; k--) if (++this.ruins[k].age > 40) this.ruins.splice(k, 1);
    yearlyEvents(this);
  }

  /** Lugares no modo completo (jornadas, RF-AS-31): os que estão na tela, ou os escolhidos pela calibração. */
  watched = new Set<number>();

  /** Amostras do comportamento nos lugares em modo completo (seção 7.3): tarefa reservada, parado e passos sobre rua. */
  dayStats = { samples: 0, tasked: 0, idle: 0, steps: 0, streetSteps: 0 };

  searchParent = new Int32Array(0);
  searchDist = new Uint16Array(0);
  searchMark = new Uint32Array(0);
  searchQueue = new Int32Array(0);
  searchGen = 0;
}

// Métodos das partes no protótipo, não enumeráveis como os de classe: o save lê a instância por reflexão
// (Object.entries em src/save/snapshot.ts) e nenhum método pode aparecer nele.
for (const part of [
  entitiesPart,
  migrationPart,
  societyPart,
  vocationPart,
  herdsPart,
  economyYearPart,
  growthPart,
  peopleDecidePart,
  faunaCellsPart,
  faunaFoodPart,
  faunaDecidePart,
  faunaSpacePart,
  foundingPart,
  layoutPart,
  buildingsPart,
  lifecyclePart,
  roadsPart,
  stockPart,
  techPart,
  productionPart,
  savePart,
  journeysPart,
  wearPart,
  relationsPart,
  jobsPart,
  resourcesPart,
  warPart,
  diplomacyPart,
  coloniesPart,
  polityPart,
  formPart,
  portsPart,
  raftsPart,
  boatsPart,
  marketsPart,
  caravansPart,
  disastersPart,
  playerPart,
  queriesPart,
  residentsPart,
  clockPart,
]) {
  for (const [k, f] of Object.entries(part)) Object.defineProperty(Ecosystem.prototype, k, { value: f, writable: true, configurable: true, enumerable: false });
}
