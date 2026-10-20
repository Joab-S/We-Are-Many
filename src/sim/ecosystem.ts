import { mulberry32 } from '../core/rng';
import { Biome, classify, temperatureAt, type SurfaceMap } from '../procgen/surface';
import {
  WONDER_NAMES,
  buildCost,
  emptyMade,
  emptyStock,
  ERA_NEEDS,
  forge,
  generateDeposits,
  makeCulture,
  ORE_NAMES,
  type Culture,
  type Deposit,
  type Made,
  type Ore,
  type Stock,
} from './economy';
import { yearlyEvents } from './events';
import { pickItem, pickPrimitive, TIER_MATERIAL, type Category, type Material } from './items';
import { CHILD, pickRole, ROLE, type RoleContext } from './roles';
import { lotsFor, plotSeed, streetPlan, tierFor, TIER_NAMES, TIER_RADIUS, wrapDx } from './settlement';
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
const COLONY_RATE = 0.05;

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
  /** Pesca, colonos, soldados de uma invasão ou exploradores. */
  purpose: 'fish' | 'colonize' | 'invade' | 'explore';
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
  passengers: { age: number; role: number }[];
  /** Segundos de pesca restantes (barcos de pesca). */
  timer: number;
  /** Segundos à deriva, perdido no mar. */
  adrift: number;
  /** Segundos desde o naufrágio; -1 enquanto navega. */
  sunk: number;
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
export const BUILDINGS = ['granary', 'smithy', 'market', 'windmill', 'temple', 'barracks', 'factory', 'statue', 'wonder'] as const;
export type BuildingKind = 'house' | 'port' | (typeof BUILDINGS)[number];

export const BUILDING_NAMES: Record<BuildingKind, string> = {
  house: 'Casa',
  port: 'Porto',
  granary: 'Celeiro',
  smithy: 'Ferraria',
  market: 'Mercado',
  windmill: 'Moinho',
  temple: 'Templo',
  barracks: 'Quartel',
  factory: 'Fábrica',
  statue: 'Estátua',
  wonder: 'Grande obra',
};

/**
 * Se o assentamento já pode erguer a construção: era, nível e condições
 * (a ferraria só faz sentido com metal no estoque; a cultura adianta templos e mercados).
 */
function canBuild(kind: (typeof BUILDINGS)[number], era: number, tier: number, metal: boolean, culture: Culture, capital: boolean): boolean {
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
      return era >= 2 && tier >= 1;
    case 'barracks':
      return era >= 2 && tier >= 2;
    case 'factory':
      return era >= 4 && tier >= 2;
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
  readonly villages: Village[] = [];
  readonly boats: Boat[] = [];
  /** Jazidas de minério do planeta, e o índice delas por tile. */
  readonly deposits: Deposit[];
  readonly depositAt: Int32Array;
  /** Relação entre reinos (chave "a:b", a < b), de -100 a 100. */
  readonly relations = new Map<string, number>();
  readonly wars: War[] = [];
  private cultures = 0;
  private yearClock = 0;
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
  /** Tiles ocupados por casas. */
  readonly built: Uint8Array;
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
  private readonly rnd: () => number;
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
    this.rnd = mulberry32(seed);
    this.road = new Uint8Array(map.width * map.height);
    this.built = new Uint8Array(map.width * map.height);
    this.cols = Math.ceil(map.width / CELL);
    this.rows = Math.ceil(map.height / CELL);
    this.gridHead = new Int32Array(this.cols * this.rows);
    this.grow(512);
    this.deposits = generateDeposits(map, this.rnd);
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
            if (tile < 0 || !this.canFound(tx, ty)) continue;
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
    const copy = <T extends Float32Array | Uint8Array | Int16Array>(a: T, make: (n: number) => T): T => {
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
    this.population[s]++;
    this.everLived[s] = true;
    if (village >= 0) {
      const v = this.villages[village];
      v.population++;
      this.role[i] = age < this.species[s].maturity ? CHILD : pickRole(Math.floor(v.tech), v.tier, this.rnd(), this.roleContext(v));
    }
    return i;
  }

  private spawnAtTile(s: number, tile: number, village = -1, age = 0): number {
    const w = this.map.width;
    return this.spawn(s, (tile % w) + this.rnd(), Math.floor(tile / w) + this.rnd(), village, age);
  }

  /** Remove a criatura. `quiet` não registra a morte (ex.: colonos que embarcaram). */
  kill(i: number, quiet = false): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    const s = this.kind[i];
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
      // Movimento contínuo; nunca entra num tile fora do habitat.
      const nx = this.x[i] + this.vx[i] * dt;
      const ny = this.y[i] + this.vy[i] * dt;
      const tile = Math.min(map.height - 1, Math.max(0, Math.floor(ny))) * w + (((Math.floor(nx) % w) + w) % w);
      const s = this.kind[i];
      if (ny >= 0 && ny < map.height && this.canStand(s, tile)) {
        this.x[i] = ((nx % w) + w) % w;
        this.y[i] = ny;
      } else {
        this.vx[i] = -this.vx[i] + (this.rnd() - 0.5) * 0.5;
        this.vy[i] = -this.vy[i] + (this.rnd() - 0.5) * 0.5;
      }
      this.age[i] += dt / YEAR_SECONDS;
      this.think[i] -= dt;
      if (this.think[i] <= 0) {
        this.think[i] += THINK_INTERVAL;
        this.decide(i, THINK_INTERVAL);
      }
    }
    this.updateBoats(dt);
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
  private growVegetation(dt: number): void {
    const m = this.map;
    const n = m.width * m.height;
    const samples = Math.min(40000, Math.round(n * 0.04 * dt));
    for (let k = 0; k < samples; k++) {
      const i = Math.floor(this.rnd() * n);
      if (m.elevation[i] < 0) continue;
      const t = temperatureAt(m, i);
      const ok = t > 262 && t < 320 && m.moisture[i] > 0.25;
      const x = i % m.width;
      const y = (i - x) / m.width;
      const nx = (x + Math.floor(this.rnd() * 3) - 1 + m.width) % m.width;
      const ny = y + Math.floor(this.rnd() * 3) - 1;
      const neighbour = ny >= 0 && ny < m.height ? m.vegetation[ny * m.width + nx] : 0;
      const before = m.vegetation[i];
      // Espalha a partir dos vizinhos; um tile pastado ainda rebrota devagar pelas raízes.
      if (ok && neighbour > 0.3) m.vegetation[i] = Math.min(1, before + 0.05);
      else if (ok && before > 0.02 && before < 0.35) m.vegetation[i] = before + 0.02;
      else if (!ok) m.vegetation[i] = Math.max(0, before - 0.05);
      if (m.vegetation[i] !== before) {
        m.biome[i] = classify(m, i);
        this.onTileChanged(i);
      }
    }
  }

  private wander(i: number, speed: number, bias?: { x: number; y: number }): void {
    const a = this.rnd() * Math.PI * 2;
    let dx = Math.cos(a);
    let dy = Math.sin(a);
    // Sem destino, segue mais ou menos na mesma direção: explora o mapa em vez de rodar no lugar.
    const v = Math.hypot(this.vx[i], this.vy[i]);
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
          this.kill(prey);
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
          this.kill(prey);
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
        if (veg > 0.1) e += 0.06 * dt * (1 + (v?.tech ?? 0) * 0.5);
        if (this.nearWater(tile)) e += 0.05 * dt;
        // Quem tem fome come o peixe que os barcos trouxeram.
        if (v && v.food >= 1 && e < 0.6) {
          v.food -= 1;
          e += 0.35;
        }
        // Crianças ganham uma profissão ao virar adultas.
        if (v && this.role[i] === CHILD && this.age[i] >= sp.maturity) this.role[i] = pickRole(era, v.tier, this.rnd(), this.roleContext(v));
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
          let range = TIER_RADIUS[v.tier] * (role >= ROLE.soldier || !working ? 0.4 : 0.8);
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
          } else if (working && (role === ROLE.hunter || role === ROLE.miner)) {
            // Caçadores e mineradores sem mina exploram longe de casa, mais longe a cada era.
            range = TIER_RADIUS[v.tier] * (role === ROLE.miner ? 2.5 : 1.8) * (1 + 0.25 * era);
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
              this.kill(prey);
              e += 0.4;
            }
          }
        }
        // Sozinho e com fome: procura onde há o que comer (verde ou água), como os outros bichos.
        if (!v && e < 0.5) bias = this.betterSite(i) ?? bias;
        // Fora do clima, mesmo com assentamento, primeiro se protege.
        if (comfort && (!v || e < 0.4)) bias = comfort;
        this.wander(i, sp.speed * (this.role[i] === CHILD ? 0.8 : elder ? 0.55 : 1), bias);
        break;
      }
    }

    this.energy[i] = Math.min(1, e);
    const v = this.village[i];
    const era = v >= 0 ? Math.floor(this.villages[v].tech) : 0;
    const life = lifespan(sp, era);
    const old = this.age[i] > life * (0.85 + 0.3 * ((i * 2654435761) % 1000) / 1000);
    if (this.energy[i] <= 0 || old) {
      if (v >= 0 && this.villages[v].population === 1) this.villages[v].lastCause = this.energy[i] <= 0 ? 'de fome' : 'de velhice';
      this.kill(i);
      return;
    }
    // Reprodução (idosos não têm filhos).
    const fertile = this.age[i] >= sp.maturity && (sp.kind !== 'sapient' || this.age[i] < elderAge(sp, era));
    if (fertile && this.energy[i] > 0.65 && this.rnd() < b.birthRate * dt * this.fertility(s, era)) {
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
      // Casas de eras mais avançadas abrigam mais gente (sobrados, prédios).
      const housed = v < 0 || this.villages[v].population < this.villages[v].houses.length * (4 + era) + this.villages[v].fields * 2 + 4;
      if (crowd < b.crowd && housed) {
        const child = this.spawn(s, this.x[i] + (this.rnd() - 0.5), this.y[i] + (this.rnd() - 0.5), v);
        if (child >= 0) this.energy[i] -= 0.3;
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
    if (best && bd < TIER_RADIUS[best.tier]) {
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
      if (this.rnd() < 0.05 && this.canFound(tx, ty)) found(tx, ty);
      return undefined;
    }
    return this.betterSite(i);
  }

  /** Lugar onde um inteligente sozinho consegue viver: verde ou na beira da água, e no clima da espécie. */
  private goodSite(s: number, tile: number): boolean {
    const sp = this.species[s];
    const temp = temperatureAt(this.map, tile);
    if (!this.habitable(s, tile) || temp < sp.tempMin + 2 || temp > sp.tempMax - 2) return false;
    return this.map.vegetation[tile] >= 0.3 || (this.map.vegetation[tile] > 0.1 && this.nearWater(tile));
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
      if (tile < 0 || !this.habitable(s, tile) || !this.canFound(Math.floor(v.x), Math.floor(v.y))) continue;
      bd = d;
      best = v;
    }
    return best;
  }

  /** Um adulto do povo de `v` chega andando de fora da área; ao entrar, se junta (ver `loner`). */
  private wanderer(v: Village): void {
    const sp = this.species[v.species];
    for (let t = 0; t < 12; t++) {
      const a = this.rnd() * Math.PI * 2;
      const d = TIER_RADIUS[v.tier] + 3 + this.rnd() * 6;
      const x = v.x + Math.cos(a) * d;
      const y = v.y + Math.sin(a) * d;
      const tile = this.tileAt(x, Math.floor(y));
      if (tile < 0 || !this.habitable(v.species, tile) || !this.landPath(x, y, v.x, v.y)) continue;
      this.spawn(v.species, ((x % this.map.width) + this.map.width) % this.map.width, y, -1, sp.maturity + this.rnd() * 10);
      return;
    }
  }

  /** Põe a criatura `i` (sem assentamento) no assentamento `v`, com uma profissão. */
  private join(i: number, v: Village): void {
    this.village[i] = v.id;
    v.lastCause = undefined;
    v.population++;
    this.role[i] = this.age[i] < this.species[this.kind[i]].maturity ? CHILD : pickRole(Math.floor(v.tech), v.tier, this.rnd(), this.roleContext(v));
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

  /** Assentamento cuja área contém o ponto, se houver. */
  settlementAt(x: number, y: number): Village | null {
    for (const v of this.villages) if (!v.abandoned && this.distance(v, x, y) < TIER_RADIUS[v.tier]) return v;
    return null;
  }

  /** Um assentamento novo não pode nascer dentro (nem encostado) da área de outro. */
  canFound(x: number, y: number): boolean {
    return this.villages.every((v) => v.abandoned || this.distance(v, x + 0.5, y + 0.5) >= TIER_RADIUS[v.tier] + TIER_RADIUS[0]);
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
    this.onTileChanged(i);
  }

  /** Praça e ruas do nível atual; ruas de pedra a partir da Era Medieval. */
  private layStreets(v: Village): void {
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const kind = v.tech >= 3 ? 2 : 1;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && isLand(this.map, t)) this.setRoad(t, 3);
      }
    }
    const seed = plotSeed(v.x, v.y);
    for (const st of streetPlan(v.tier, seed)) {
      for (const p of st.pts) {
        const t = this.tileAt(cx + p.x, cy + p.y);
        if (t < 0 || !isLand(this.map, t)) break;
        if (this.road[t] === 3) continue;
        if (kind === 2 && this.road[t] === 1) this.road[t] = 0;
        this.setRoad(t, kind);
      }
    }
    v.lots = lotsFor(v.tier, seed);
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
          if (t < 0 || !isLand(this.map, t) || this.road[t] || this.built[t] || this.depositAt[t] >= 0) break;
          tiles.push(t);
        }
      }
      if (tiles.length === 4) return tiles;
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
    v.houses.push({ x: tiles[0] % w, y: Math.floor(tiles[0] / w), kind, variant: Math.floor(this.rnd() * 4) });
    if (kind === 'wonder') this.note(`${v.name} ergueu a ${WONDER_NAMES[v.culture.value]}, orgulho do povo ${v.culture.name}`, 'povo', v, { major: true });
    else if (kind === 'statue') this.note(`${v.name} ergueu uma estátua do seu líder`, 'povo', v);
    else if (kind !== 'house') this.note(`${v.name} construiu ${kind === 'smithy' || kind === 'factory' ? 'uma' : 'um'} ${BUILDING_NAMES[kind].toLowerCase()}`, 'economia', v);
    return true;
  }

  /** Próxima construção especial que o assentamento pode erguer, se houver. */
  private nextBuilding(v: Village): BuildingKind | null {
    const era = Math.floor(v.tech);
    const st = this.store(v);
    const metal = st.copper + st.tin + st.iron > 0;
    const capital = v.kingdom === v.id;
    for (const b of BUILDINGS) if (canBuild(b, era, v.tier, metal, v.culture, capital) && !v.houses.some((h) => h.kind === b)) return b;
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
    const pick = pool[Math.floor(this.rnd() * pool.length)];
    v.leader = pick;
    this.role[pick] = king ? ROLE.king : ROLE.leader;
  }

  /** Estrada de terra em linha reta entre dois assentamentos, interrompida na água. */
  private connect(a: Village, b: Village): void {
    this.lineRoad(a.x, a.y, b.x, b.y);
  }

  /**
   * Estrada de terra entre dois pontos: uma curva suave (o meio desvia para
   * um lado, sempre o mesmo para o mesmo par de pontos), sem passos na
   * diagonal, para a estrada desenhada ficar contínua. Não passa por água.
   */
  private lineRoad(ax: number, ay: number, bx: number, by: number): void {
    const dx = wrapDx(bx - ax, this.map.width);
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const bend = (plotSeed(ax + bx, ay + by) / 4294967296 - 0.5) * 0.5 * len;
    const mx = ax + dx / 2 + (-dy / len) * bend;
    const my = ay + dy / 2 + (dx / len) * bend;
    const n = Math.max(2, Math.ceil(len * 2));
    let px = Math.floor(ax);
    let py = Math.floor(ay);
    const put = (x: number, y: number) => {
      const t = this.tileAt(x, y);
      if (t >= 0 && isLand(this.map, t)) this.setRoad(t, 1);
    };
    put(px, py);
    for (let k = 1; k <= n; k++) {
      const u = k / n;
      const x = Math.floor((1 - u) * (1 - u) * ax + 2 * u * (1 - u) * mx + u * u * (ax + dx));
      const y = Math.floor((1 - u) * (1 - u) * ay + 2 * u * (1 - u) * my + u * u * by);
      if (x === px && y === py) continue;
      if (x !== px && y !== py) put(x, py);
      put(x, y);
      px = x;
      py = y;
    }
  }

  private uniqueName(): string {
    let name = alienName(this.rnd, 2);
    for (let t = 0; t < 20 && this.villages.some((v) => v.name === name); t++) name = alienName(this.rnd, 2 + (t > 10 ? 1 : 0));
    return name;
  }

  foundVillage(s: number, x: number, y: number, settlers: number, from?: Village): Village {
    const sp = this.species[s];
    const rnd = this.rnd;
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
    if (from) this.connect(from, village);
    for (let k = 0; k < settlers; k++) {
      this.spawn(s, x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, village.id, sp.maturity + rnd() * 10);
    }
    return village;
  }

  /** Cor de reino que nenhum reino vivo usa (da paleta; acabando, uma cor gerada). */
  private freshColor(): [number, number, number] {
    const used = new Set(this.villages.filter((o) => !o.abandoned && o.kingdom === o.id).map((o) => o.color.join(',')));
    const free = KINGDOM_COLORS.filter((c) => !used.has(c.join(',')));
    if (free.length) return free[Math.floor(this.rnd() * Math.min(3, free.length))];
    return hsl(this.rnd(), 0.65 + this.rnd() * 0.25, 0.4 + this.rnd() * 0.25);
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
    const r = TIER_RADIUS[v.tier] + 1;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || !this.road[t] || this.built[t]) continue;
        const gone = this.road[t] === 4 || stage >= 3 || (Math.imul(t, 2654435761) >>> 0) % 3 < stage;
        if (!gone || this.settlementAt(cx + dx + 0.5, cy + dy + 0.5)) continue;
        this.road[t] = 0;
        this.onTileChanged(t);
      }
    }
    v.decay = stage;
    if (stage >= 3) this.note(`As últimas ruínas de ${v.name} sumiram`, 'povo', v);
  }

  /** Sobe de nível quando a população permite. Aldeias e vilas não podem conter outro assentamento. */
  private growTier(v: Village): void {
    const target = tierFor(v.population);
    if (target <= v.tier) return;
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
    this.layStreets(v);
    this.note(`${v.name} virou ${TIER_NAMES[target].toLowerCase()}`, 'povo', v, { major: target >= 2 });
  }

  private updateVillages(dt: number): void {
    // Adultos de cada assentamento, para escolher líderes.
    const adults: number[][] = this.villages.map(() => []);
    // Trabalhadores por profissão (adultos que ainda não são idosos).
    const workers = this.villages.map(() => new Array<number>(ROLE.king + 1).fill(0));
    for (let i = 0; i < this.count; i++) {
      const v = this.village[i];
      if (v < 0 || !this.alive[i] || this.role[i] === CHILD) continue;
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
        if (Math.floor(v.tech) === 3) this.layStreets(v);
      }
      this.growTier(v);
      this.updateLeader(v, adults[v.id] ?? []);
      // Assentamentos fundados neste passo ainda não têm contagem.
      if (workers[v.id]) this.produce(v, workers[v.id], adults[v.id].length, dt);
      // Constrói casas quando o assentamento cresce; às vezes uma construção especial.
      const homes = v.houses.filter((h) => h.kind === 'house').length;
      if (v.population > homes * 3 && this.rnd() < 0.4) {
        const special = homes >= 4 && this.rnd() < 0.35 ? this.nextBuilding(v) : null;
        this.buildHouse(v, special ?? 'house');
      }
      // Lavouras trabalhadas por agricultores enchem o celeiro (cada porção mata a fome de um morador).
      if (v.fields > 0 && workers[v.id]) {
        const worked = Math.min(v.fields, Math.ceil(workers[v.id][ROLE.farmer] / 2) + 1);
        v.food = Math.min(40 + v.fields * 6, v.food + worked * 3 * (dt / YEAR_SECONDS));
      }
      // Roças no fim da Idade da Pedra (uma para cada quatro casas); da Idade do Bronze em diante, uma para cada duas.
      if (v.fields < homes / (Math.floor(v.tech) >= 1 ? 2 : 4) && v.tech >= 0.12 && this.rnd() < 0.3) this.plantField(v);
      // De vez em quando aparece um andarilho do mesmo povo, mais fácil quando o lugar tem pouca gente.
      const wander = v.population <= 3 ? 0.35 : v.population < 10 ? 0.15 : v.population < 30 ? 0.05 : 0.01;
      if (this.rnd() < wander * (dt / YEAR_SECONDS)) this.wanderer(v);
      // Porto na costa a partir do fim da Idade da Pedra (canoas); barcos de pesca saem dele.
      if (v.port < 0 && v.tech >= 0.5 && this.rnd() < 0.08 * dt) this.buildPort(v);
      if (v.port >= 0 && fishers[v.id] > 0 && this.rnd() < 0.15 * dt) {
        let out = 0;
        for (const b of this.boats) if (b.village === v.id && b.purpose === 'fish' && b.sunk < 0) out++;
        if (out < Math.min(3, 1 + Math.floor(fishers[v.id] / 3))) this.launch(v, 'fish');
      }
      // Exploradores por mar a partir do Bronze; povos comerciantes e sábios exploram mais.
      const curious = v.culture.value === 'comércio' || v.culture.value === 'conhecimento' ? 2 : 1;
      if (v.port >= 0 && v.tech >= 1 && this.rnd() < (0.012 * curious * dt) / YEAR_SECONDS) this.explore(v);
      // Assentamentos cheios (ou sem espaço, como numa ilha) enviam colonos para fundar outro; mais em eras avançadas.
      const crowded = v.population >= 8 && v.population >= v.houses.length * 4 && !this.freeLot(v);
      if ((v.population > 26 || crowded) && this.rnd() < (COLONY_RATE * (1 + 0.25 * Math.floor(v.tech)) * dt) / YEAR_SECONDS && live < 100) {
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

  /** Estoque do reino do assentamento (guardado na capital). */
  store(v: Village): Stock {
    return this.villages[v.kingdom].stock;
  }

  private roleContext(v: Village): RoleContext {
    return { port: v.port >= 0, smithy: v.houses.some((h) => h.kind === 'smithy'), warlike: v.culture.value === 'guerra' };
  }

  /** Paga a construção com o estoque do reino; false se faltar material. */
  private pay(v: Village, kind: string): boolean {
    const st = this.store(v);
    const c = buildCost(kind, Math.floor(v.tech));
    if (st.wood < c.wood || st.stone < c.stone || st.gold < c.gold) return false;
    st.wood -= c.wood;
    st.stone -= c.stone;
    st.gold -= c.gold;
    return true;
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
    const r = TIER_RADIUS[v.tier] + 6;
    let veg = 0;
    let rock = false;
    for (let k = 0; k < 40; k++) {
      const a = this.rnd() * Math.PI * 2;
      const d = Math.sqrt(this.rnd()) * r;
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0) continue;
      veg += this.map.vegetation[t];
      const b = this.map.biome[t] as Biome;
      if (b === Biome.Rock || b === Biome.Mountain || this.map.elevation[t] > 0.35) rock = true;
    }
    v.forest = veg / 40;
    v.rock = rock;
  }

  /** Um ano (proporcional) de trabalho: lenha, pedra, minas e ferraria. */
  private produce(v: Village, w: number[], adults: number, dt: number): void {
    const yr = dt / YEAR_SECONDS;
    const capital = this.villages[v.kingdom];
    const st = capital.stock;
    const made = capital.made;
    if (this.rnd() < 0.05 * dt || v.forest === 0) this.survey(v);
    const tools = st.tools > 0 ? 1.4 : 1;
    // Lenha: quanto mais floresta por perto, mais madeira; o corte desbasta a mata.
    if (w[ROLE.woodcutter]) {
      const wood = w[ROLE.woodcutter] * 1.2 * yr * tools * Math.min(1, v.forest * 2 + 0.1);
      st.wood += wood;
      if (this.rnd() < wood) {
        const a = this.rnd() * Math.PI * 2;
        const d = TIER_RADIUS[v.tier] * (0.8 + this.rnd() * 0.6);
        const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
        if (t >= 0 && this.map.vegetation[t] > 0.35) {
          this.map.vegetation[t] -= 0.08;
          this.onTileChanged(t);
        }
      }
    }
    // Minas: o minério sai da jazida (limitada) para o estoque do reino.
    const mines = v.mines.map((id) => this.deposits[id]);
    if (mines.length && w[ROLE.miner]) {
      const each = (w[ROLE.miner] * 0.8 * yr * tools) / mines.length;
      for (const d of mines) {
        const take = Math.min(d.amount, each);
        d.amount -= take;
        st[d.ore] += take;
        if (d.ore === 'coal') made.coal += take;
        if (d.amount <= 0) {
          d.mine = -1;
          v.mines.splice(v.mines.indexOf(d.id), 1);
          this.note(`A mina de ${ORE_NAMES[d.ore]} de ${v.name} se esgotou`, 'economia', d);
        }
      }
    }
    // Pedra: mineradores sem mina e construtores tiram pedra (muito mais onde há rocha).
    const quarry = (mines.length ? 0 : w[ROLE.miner]) + w[ROLE.builder] * 0.5;
    if (quarry) {
      const stone = quarry * yr * tools * (v.rock ? 1 : 0.25);
      st.stone += stone;
      made.stone += stone;
    }
    const era = Math.floor(v.tech);
    const soldiers = w[ROLE.soldier] + w[ROLE.guard];
    // Idade da Pedra: construtores e coletores lascam pedra e madeira (sem ferraria).
    if (st.stone >= 1 && st.wood >= 1 && this.rnd() < (w[ROLE.builder] + w[ROLE.gatherer]) * 0.12 * yr) {
      st.stone -= 1;
      st.wood -= 1;
      this.craft(v, st, this.needed(st, adults, soldiers, v), 'stone', era);
    }
    // Ferraria: cada ferreiro faz uma peça a cada ano e pouco, se houver metal; a fábrica dobra o ritmo.
    if (w[ROLE.blacksmith] && v.houses.some((h) => h.kind === 'smithy')) {
      const factory = v.houses.some((h) => h.kind === 'factory') ? 2 : 1;
      v.forgeWork += w[ROLE.blacksmith] * 0.6 * yr * factory;
      while (v.forgeWork >= 1) {
        // Ouro vira joia de vez em quando (anéis, amuletos e a coroa do rei).
        if (era >= 1 && st.gold >= 2 && this.rnd() < 0.2) {
          st.gold -= 2;
          v.forgeWork -= 1;
          this.craft(v, st, 'joia', 'gold', era);
          continue;
        }
        const piece = forge(st, era);
        if (!piece) {
          v.forgeWork = 0;
          break;
        }
        v.forgeWork -= 1;
        made[piece.kind]++;
        this.craft(v, st, this.needed(st, adults, soldiers, v), TIER_MATERIAL[piece.tier], era);
      }
    }
    // Ferramentas se gastam com o uso.
    st.tools = Math.max(0, st.tools - st.tools * 0.02 * yr);
    // Abre uma mina numa jazida conhecida, de preferência do minério que falta para a próxima era.
    if (w[ROLE.miner] && v.mines.length < 1 + v.tier && this.rnd() < 0.1 * dt) this.openMine(v);
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
    const item = material === 'stone' ? pickPrimitive(category, this.rnd()) : pickItem(material, category, era, this.rnd());
    if (!item) return;
    st.items[item.id] = (st.items[item.id] ?? 0) + 1;
    const tier = Math.max(0, TIER_MATERIAL.indexOf(material));
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
    const reach = TIER_RADIUS[v.tier] + 25;
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
    const loser = this.rnd() < si / (si + sj) ? j : i;
    const k = this.villages[this.village[loser]].kingdom;
    war.losses[k === war.a ? 0 : 1]++;
    const st = this.villages[k].stock;
    if (this.role[loser] === ROLE.soldier) {
      if (st.weapons > 0) st.weapons--;
      if (st.armor > 0 && this.rnd() < 0.5) st.armor--;
    }
    this.kill(loser, true);
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
      this.forEachNear(target.x, target.y, TIER_RADIUS[target.tier] * 0.6, (j) => {
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
      if (war.naval && this.rnd() < 0.06 * dt) this.invadeBySea(war);
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
    const reach = TIER_RADIUS[target.tier] + 6;
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
      if (this.distance(from, this.x[i], this.y[i]) > TIER_RADIUS[from.tier] + 6) continue;
      passengers.push({ age: this.age[i], role: ROLE.soldier });
      this.kill(i, true);
    }
    if (passengers.length < 3) {
      for (const p of passengers) {
        const c = this.spawn(from.species, from.x + this.rnd(), from.y + this.rnd(), from.id, p.age);
        if (c >= 0) this.role[c] = p.role;
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
    // Saque: metade do estoque do vencido vai para o vencedor.
    const loot = this.villages[target.kingdom].stock;
    for (const key of ['wood', 'stone', 'copper', 'tin', 'iron', 'gold', 'coal', 'weapons', 'armor', 'jewels'] as const) {
      const half = loot[key] / 2;
      loot[key] -= half;
      winner.stock[key] += half;
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
    for (const k of this.crises) this.succession(this.villages[k]);
    this.crises.clear();
    this.diplomacy();
    this.coolLava();
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
    // Armazéns têm limite: madeira e pedra sobrando não se acumulam para sempre.
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom !== v.id) continue;
      const room = 200 + 20 * v.population;
      v.stock.wood = Math.min(v.stock.wood, room);
      v.stock.stone = Math.min(v.stock.stone, room);
    }
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
        const atWar = this.warBetween(a.id, b.id);
        const busy = this.warOf(a.id) || this.warOf(b.id);
        // Comércio: por terra entre vizinhos com mercado; por mar entre contatos com mercado e porto.
        // Sem mercado, vizinhos amigos ainda fazem escambo.
        const market = (has(a.id, 'market') && has(b.id, 'market') && (border || (port(a.id) && port(b.id)))) || (border && rel > 20);
        if (!atWar && market && this.trade(a, b)) rel += 3 * (a.culture.value === 'comércio' || b.culture.value === 'comércio' ? 2 : 1);
        if (!atWar && this.rnd() < 0.03) rel += this.incident(a, b, border);
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
        const ambition = strong && rel < 0 && this.rnd() < 0.04;
        if (!ambition && (!hostile || this.rnd() > 0.15 * (warlike ? 2 : 1))) continue;
        if (Math.max(fa, fb) < 4 || this.allied(a.id, b.id) || (this.truces.get(key) ?? 0) > this.year) continue;
        const [att, def, target] = fa >= fb ? [a, b, pb] : [b, a, pa];
        if (this.declareWar(att, def, target, members)) this.callAllies(att, def, members);
      }
    }
    for (let k = this.wars.length - 1; k >= 0; k--) {
      const war = this.wars[k];
      war.years++;
      const dead = war.losses[0] + war.losses[1];
      if (this.rnd() < 0.03 + dead / 150 + (war.years > 30 ? 0.1 : 0)) {
        this.wars.splice(k, 1);
        this.relations.set(this.key(war.a, war.b), -10);
        this.truces.set(this.key(war.a, war.b), this.year + TRUCE_YEARS);
        this.note(`Paz entre ${this.villages[war.a].name} e ${this.villages[war.b].name}`, 'guerra', this.villages[war.b], { major: true });
      }
    }
    this.vassals(members);
    this.rebuildEnemies();
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
    const good = this.rnd() < kind - warlike * 0.12;
    const [x, y] = this.rnd() < 0.5 ? [a, b] : [b, a];
    if (good) {
      if (a.species === b.species && a.tier >= 1 && b.tier >= 1 && this.rnd() < 0.35) {
        this.note(`Um casamento real uniu as famílias de ${a.name} e ${b.name}`, 'povo', a);
        return 12;
      }
      this.note(`${x.name} enviou presentes a ${y.name}`, 'povo', x);
      return 6;
    }
    const shared = this.deposits.find((d) => d.amount > 0 && d.known.has(a.id) && d.known.has(b.id) && this.distance(a, d.x, d.y) < 50 && this.distance(b, d.x, d.y) < 50);
    if (shared && this.rnd() < 0.5) {
      this.note(`${a.name} e ${b.name} disputam a jazida de ${ORE_NAMES[shared.ore]}`, 'guerra', shared);
      return -7;
    }
    if (border && this.rnd() < 0.5) {
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
      if (rel > 50 && !this.warOf(a.id) && !this.warOf(b.id) && this.rnd() < 0.12) {
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
    if (this.year - since > 50 && a.species === b.species && rel > 80 && this.rnd() < 0.03) {
      const [big, small] = this.kingdomSize(a) >= this.kingdomSize(b) ? [a, b] : [b, a];
      for (const o of this.villages) {
        if (o.abandoned || o.kingdom !== small.id) continue;
        o.kingdom = big.id;
        o.color = big.color;
      }
      small.leader = -1;
      for (const field of ['wood', 'stone', 'copper', 'tin', 'iron', 'gold', 'coal', 'tools', 'weapons', 'armor', 'jewels'] as const) big.stock[field] += small.stock[field];
      this.alliances.delete(key);
      this.connect(big, small);
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
        if (this.distance(c, v.x, v.y) > 45 || this.relation(c.id, v.id) < 20 || this.rnd() > 0.03) continue;
        v.kingdom = c.id;
        v.color = c.color;
        this.connect(c, v);
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
    if (capital.abandoned || capital.kingdom !== capital.id || this.rnd() > 0.3) return;
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
    if (!this.warOf(capital.id) && !this.warOf(seat.id) && this.rnd() < 0.6) {
      this.wars.push({ a: seat.id, b: capital.id, target: capital.id, losses: [0, 0], years: 0, naval: !this.landPath(seat.x, seat.y, capital.x, capital.y) });
      this.note(`Guerra civil entre ${seat.name} e ${capital.name}`, 'guerra', capital, { major: true });
      this.effect('swords', capital.x, capital.y - 3, 30, 1);
    }
  }

  /** Torna `v` capital de um reino novo saído de `old`: cultura, cor, estoque inicial. */
  private newKingdom(v: Village, old: Village): void {
    v.kingdom = v.id;
    v.culture = makeCulture(this.cultures++, v.name, this.rnd);
    v.color = this.freshColor();
    for (const o of this.villages) if (o.kingdom === v.id) o.color = v.color;
    v.stock = { ...emptyStock(), wood: old.stock.wood * 0.2, weapons: Math.floor(old.stock.weapons * 0.3) };
    old.stock.weapons -= v.stock.weapons;
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
      if (far < 40 || this.rnd() > 0.005 * (far / 40) * size * (capital.culture.tolerance < 0.3 ? 2 : 1)) continue;
      const old = v.kingdom;
      for (const o of this.villages) if (!o.abandoned && o.kingdom === old && this.distance(v, o.x, o.y) < 30) o.kingdom = v.id;
      this.newKingdom(v, capital);
      this.relations.set(this.key(old, v.id), -45);
      this.note(`${v.name} declarou independência de ${capital.name}: nasce o povo ${v.culture.name}`, 'povo', v, { major: true });
    }
  }

  /** Troca de excedentes entre dois reinos com mercado; quem recebe paga em ouro se tiver. */
  private trade(a: Village, b: Village): boolean {
    let traded: '' | 'tin' | 'copper' | 'iron' | 'coal' | 'stone' | 'wood' = '';
    for (const r of ['tin', 'copper', 'iron', 'coal', 'stone', 'wood'] as const) {
      for (const [from, to] of [[a, b], [b, a]]) {
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
      const a = this.rnd() * Math.PI * 2;
      const d = TIER_RADIUS[v.tier] + TIER_RADIUS[0] + 2 + this.rnd() * 22;
      const nx = Math.floor(v.x + Math.cos(a) * d);
      const ny = Math.floor(v.y + Math.sin(a) * d);
      if (ny < 2 || ny >= map.height - 2) continue;
      const tx = ((nx % map.width) + map.width) % map.width;
      const tile = ny * map.width + tx;
      if (!this.habitable(v.species, tile) || map.vegetation[tile] < this.minFertility(v) || !this.canFound(tx, ny)) continue;
      if (!this.landPath(v.x, v.y, tx + 0.5, ny + 0.5)) continue;
      const nv = this.foundVillage(v.species, tx, ny, 0, v);
      let moved = 0;
      for (let i = 0; i < this.count && moved < 6; i++) {
        if (this.alive[i] && this.village[i] === v.id && i !== v.leader && this.role[i] !== CHILD) {
          this.village[i] = nv.id;
          v.population--;
          nv.population++;
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

  /** Se a linha reta entre dois pontos é toda de terra (dá para ir a pé). */
  private landPath(ax: number, ay: number, bx: number, by: number): boolean {
    const dx = wrapDx(bx - ax, this.map.width);
    const dy = by - ay;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let k = 0; k <= n; k++) {
      const t = this.tileAt(Math.floor(ax + (dx * k) / n), Math.floor(ay + (dy * k) / n));
      if (t < 0 || !isLand(this.map, t)) return false;
    }
    return true;
  }

  // Portos e barcos ----------------------------------------------------------

  /** Constrói o porto no tile de costa mais perto do centro, se ele dá para o mar (não para um lago). */
  private buildPort(v: Village): boolean {
    const map = this.map;
    const w = map.width;
    const r = TIER_RADIUS[v.tier];
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
      heading: this.rnd() * Math.PI * 2,
      path,
      step: 0,
      landing,
      passengers,
      timer: purpose === 'fish' ? 20 + this.rnd() * 25 : 0,
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
    const home = TIER_RADIUS[v.tier] + TIER_RADIUS[0];
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
        candidates.push({ water: t, land: l });
        break;
      }
      return candidates.length >= 6;
    });
    if (!candidates.length) return false;
    const pick = candidates[Math.floor(this.rnd() * candidates.length)];
    const path: number[] = [];
    for (let t = pick.water; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    // Embarcam adultos (nunca o líder), deixando gente em casa.
    const passengers: Boat['passengers'] = [];
    const max = Math.min(type.capacity, v.population - 3);
    for (let i = 0; i < this.count && passengers.length < max; i++) {
      if (!this.alive[i] || this.village[i] !== v.id || i === v.leader || this.role[i] === CHILD) continue;
      if (this.age[i] >= elderAge(this.species[v.species], Math.floor(v.tech))) continue;
      passengers.push({ age: this.age[i], role: this.role[i] });
      this.kill(i, true);
    }
    if (passengers.length < 3) {
      // Gente de menos: desistem e voltam para casa.
      const w2 = map.width;
      for (const p of passengers) {
        const c = this.spawn(v.species, (v.port % w2) + this.rnd(), Math.floor(v.port / w2) + this.rnd(), v.id, p.age);
        if (c >= 0) this.role[c] = p.role;
      }
      return false;
    }
    this.launch(v, 'colonize', path, pick.land, passengers);
    this.note(`${passengers.length} colonos de ${v.name} partiram de ${type.name.toLowerCase()}`, 'mar', v);
    return true;
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
    if (this.rnd() > 0.35 * (1 - b.kind * 0.2)) return;
    const v = this.villages[b.village];
    const type = BOATS[b.kind];
    const crew = { fish: '', colonize: ' de colonos', invade: ' de soldados', explore: ' de exploradores' }[b.purpose];
    const what = b.purpose === 'fish' ? `um barco de pesca de ${v.name}` : `${type.the}${crew} de ${v.name}`;
    if (b.kind <= 1 && this.rnd() < 0.5) {
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
          this.kill(i, true);
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
        if (b.passengers.length && this.rnd() < 0.08 * dt) {
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
          b.heading += (this.rnd() - 0.5) * 2 * dt;
          tx = b.x + Math.cos(b.heading) * 3;
          ty = b.y + Math.sin(b.heading) * 3;
        }
        if (this.rnd() < 0.5 * dt) {
          this.forEachNear(b.x, b.y, 2, (j) => {
            if (this.species[this.kind[j]].kind === 'fish' && this.rnd() < 0.5) {
              this.kill(j);
              v.food = Math.min(40, v.food + 1);
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
          // Barco de pesca bateu na costa: vira.
          b.heading += Math.PI * (0.5 + this.rnd());
          nx = b.x;
          ny = b.y;
        }
        if (Math.abs(dx) > 0.05) b.facing = dx > 0 ? 1 : -1;
        b.x = (nx + w) % w;
        b.y = ny;
      }
      if (b.purpose !== 'fish' && d < 0.35) {
        b.step++;
        if (b.step >= b.path.length) {
          if (b.purpose === 'invade') this.landSoldiers(b);
          else if (b.purpose === 'explore') this.explored(b);
          else this.landColonists(b);
          this.boats.splice(k, 1);
          continue;
        }
      }
      // Perigos: tempestades (mais comuns nos barcos antigos), ficar à deriva e doenças em viagens longas.
      // Barcos de pesca ficam perto da costa e voltam com tempo ruim: risco bem menor.
      if (this.rnd() < type.risk * move * (b.purpose === 'fish' ? 0.25 : 1)) {
        if (b.purpose === 'fish') this.sink(b, 'Tempestades afundaram barcos de pesca', 'storm-fish');
        else this.sink(b, `Uma tempestade afundou ${type.the} de ${v.name}${b.passengers.length ? `: ${b.passengers.length} ${b.purpose === 'invade' ? 'soldados' : 'colonos'} morreram` : ''}`);
        continue;
      }
      if (b.purpose !== 'fish') {
        if (this.rnd() < type.risk * 0.6 * move) {
          b.adrift = 6 + this.rnd() * 10;
          b.heading = this.rnd() * Math.PI * 2;
          this.note(`${cap(type.the)} de ${v.name} ficou à deriva`, 'mar', b);
        } else if (b.step > 40 && this.rnd() < 0.0015 * move) {
          b.passengers.pop();
          this.note(`Uma doença a bordo matou um colono de ${v.name}`, 'mar', b, { key: `sick:${v.id}` });
          if (!b.passengers.length) this.sink(b, `Ninguém sobreviveu ${type.on} de ${v.name}`);
        }
      }
    }
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
      const c = this.spawn(from.species, lx + this.rnd(), ly + this.rnd(), from.id, p.age);
      if (c < 0) continue;
      this.role[c] = ROLE.soldier;
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
      if (d < type.range * 0.35 || this.rnd() > 0.05) return false;
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
    const pick = coasts[Math.floor(this.rnd() * coasts.length)];
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
    if (this.canFound(lx, ly)) {
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
      this.note(`Os colonos de ${from.name} não acharam onde morar e se perderam`, 'mar', b);
      return;
    }
    for (const p of b.passengers) {
      const c = this.spawn(from.species, lx + this.rnd(), ly + this.rnd(), target.id, p.age);
      if (c >= 0) this.role[c] = p.role;
    }
  }

  // Mudanças no mundo (eventos e ferramentas) -------------------------------

  /** Número aleatório da simulação (determinístico pela semente). */
  random(): number {
    return this.rnd();
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
        this.map.biome[t] = classify(this.map, t);
        this.onTileChanged(t);
      }
    }
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
      if (v.abandoned || this.distance(v, x, y) > r + TIER_RADIUS[v.tier]) continue;
      for (let k = v.houses.length - 1; k >= 0; k--) {
        const h = v.houses[k];
        if (Math.hypot(wrapDx(h.x + 1 - x, this.map.width), h.y + 1 - y) > r || this.rnd() > chance) continue;
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
        if (h.kind === 'port') v.port = -1;
        v.houses.splice(k, 1);
        this.ruins.push({ x: h.x + size / 2, y: h.y + size, age: 0 });
        n++;
      }
    }
    if (this.ruins.length > 200) this.ruins.splice(0, this.ruins.length - 200);
    return n;
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

  /** Mata criaturas num raio sem registrar cada morte; retorna quantas. */
  killAround(x: number, y: number, r: number, chance = 1): number {
    this.buildGrid();
    let n = 0;
    this.forEachNear(x, y, r, (i) => {
      if (this.rnd() > chance) return;
      this.kill(i, true);
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
      this.kill(i);
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
