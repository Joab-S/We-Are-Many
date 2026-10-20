import { mulberry32 } from '../core/rng';
import { Biome, temperatureAt, type SurfaceMap } from '../procgen/surface';
import { CHILD, pickRole, ROLE } from './roles';
import { lotsFor, streetPlan, tierFor, TIER_NAMES, TIER_RADIUS, wrapDx } from './settlement';
import { alienName, isAquatic, type Species, type SpeciesKind } from './species';

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

export interface Boat {
  village: number;
  /** Índice em BOATS (a era de quem construiu). */
  kind: number;
  purpose: 'fish' | 'colonize';
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
];

/** Construções especiais, na ordem em que um assentamento costuma erguê-las. */
export const BUILDINGS = ['granary', 'smithy', 'market', 'windmill', 'temple', 'barracks', 'factory'] as const;
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
};

/** Se o assentamento já pode erguer a construção (era e nível). */
function canBuild(kind: (typeof BUILDINGS)[number], era: number, tier: number): boolean {
  switch (kind) {
    case 'granary':
      return era >= 1;
    case 'smithy':
      return era >= 1;
    case 'market':
      return tier >= 1;
    case 'windmill':
    case 'temple':
      return era >= 2 && tier >= 1;
    case 'barracks':
      return era >= 2 && tier >= 2;
    case 'factory':
      return era >= 4 && tier >= 2;
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
  /** Cor das roupas dos moradores. */
  color: [number, number, number];
  abandoned: boolean;
}

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
  fish: { metabolism: 0.03, birthRate: 0.12, cap: 2500, crowd: 6 },
  herbivore: { metabolism: 0.09, birthRate: 0.14, cap: 1600, crowd: 8 },
  predator: { metabolism: 0.035, birthRate: 0.08, cap: 400, crowd: 3 },
  shark: { metabolism: 0.012, birthRate: 0.08, cap: 150, crowd: 3 },
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
  /** Ruas por tile: 0 nenhuma, 1 terra, 2 pedra, 3 praça. */
  readonly road: Uint8Array;
  /** Tiles ocupados por casas. */
  readonly built: Uint8Array;
  readonly population: number[] = [];
  /** Teto de cada espécie neste planeta, proporcional ao habitat. */
  private readonly caps: number[] = [];
  /** Anos de jogo desde a chegada. */
  year = 0;
  /** Acontecimentos recentes, para o painel. */
  readonly log: string[] = [];
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
  }

  get total(): number {
    return this.count - this.free.length;
  }

  addSpecies(sp: Species): number {
    const existing = this.species.findIndex((s) => s.id === sp.id);
    if (existing >= 0) return existing;
    this.species.push(sp);
    this.population.push(0);
    this.caps.push(this.habitatCap(sp));
    return this.species.length - 1;
  }

  private habitatCap(sp: Species): number {
    const map = this.map;
    let area = 0;
    for (let i = 0; i < map.elevation.length; i += 4) {
      if (isAquatic(sp.kind) ? isWater(map, i) : isLand(map, i)) area += 4;
    }
    // Inteligentes: o teto é largo; quem limita cada assentamento são as casas.
    const per = { fish: 140, herbivore: 150, predator: 1400, shark: 5000, sapient: 80 }[sp.kind];
    return Math.max(20, Math.min(BEHAVIOUR[sp.kind].cap, Math.round(area / per)));
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
      const amount = Math.min(this.caps[s] * 0.6, Math.round(target));
      for (let k = 0; k < amount; k++) {
        const tile = this.findTile(s, Math.floor(this.rnd() * n), 40);
        if (tile >= 0) this.spawnAtTile(s, tile, -1, this.rnd() * sp.maxAge * 0.6);
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
    const ok = isAquatic(sp.kind) ? isWater(this.map, i) : isLand(this.map, i);
    if (!ok) return false;
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
    if (village >= 0) {
      const v = this.villages[village];
      v.population++;
      this.role[i] = age < this.species[s].maturity ? CHILD : pickRole(Math.floor(v.tech), v.tier, this.rnd(), v.port >= 0);
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
    this.population[this.kind[i]]--;
    const v = this.village[i];
    if (v >= 0) {
      const village = this.villages[v];
      village.population--;
      // Só a morte de reis e de líderes de reinos entra nos acontecimentos.
      if (!quiet && village.leader === i && village.kingdom === village.id && (village.tier >= 2 || this.kingdomSize(village) > 1)) {
        const title = this.role[i] === ROLE.king ? 'O rei' : 'O líder';
        this.log.unshift(`${title} de ${village.name} morreu aos ${Math.floor(this.age[i])} anos`);
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
      const fish = isAquatic(this.species[s].kind);
      if (ny >= 0 && ny < map.height && (fish ? isWater(map, tile) : isLand(map, tile))) {
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
    this.villageClock += dt;
    if (this.villageClock >= 1) {
      this.updateVillages(this.villageClock);
      this.villageClock = 0;
    }
  }

  private wander(i: number, speed: number, bias?: { x: number; y: number }): void {
    const a = this.rnd() * Math.PI * 2;
    let dx = Math.cos(a);
    let dy = Math.sin(a);
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
    if (isAquatic(sp.kind) ? !isWater(map, tile) : !isLand(map, tile)) e -= 0.6 * dt;

    switch (sp.kind) {
      case 'fish':
        if (isWater(map, tile)) e += 0.05 * dt;
        this.wander(i, sp.speed);
        break;
      case 'herbivore': {
        const veg = map.vegetation[tile];
        if (veg > 0.12) {
          const bite = Math.min(veg - 0.1, 0.025);
          map.vegetation[tile] = veg - bite;
          e += bite * 9;
          this.onTileChanged(tile);
        }
        // Vai para onde há mais vegetação por perto, e foge de predadores.
        let best = { x: 0, y: 0 };
        let bestVeg = veg;
        for (let k = 0; k < 3; k++) {
          const a = this.rnd() * Math.PI * 2;
          const tx = Math.floor(this.x[i] + Math.cos(a) * 4);
          const ty = Math.floor(this.y[i] + Math.sin(a) * 4);
          if (ty < 0 || ty >= map.height) continue;
          const t = ty * map.width + (((tx % map.width) + map.width) % map.width);
          if (isLand(map, t) && map.vegetation[t] > bestVeg) {
            bestVeg = map.vegetation[t];
            best = { x: Math.cos(a), y: Math.sin(a) };
          }
        }
        this.forEachNear(this.x[i], this.y[i], 5, (j, dx, dy) => {
          if (this.species[this.kind[j]].kind === 'predator') best = { x: -dx, y: -dy };
        });
        this.wander(i, sp.speed, best.x || best.y ? best : undefined);
        break;
      }
      case 'predator': {
        let prey = -1;
        let pd = Infinity;
        let pdx = 0;
        let pdy = 0;
        this.forEachNear(this.x[i], this.y[i], 20, (j, dx, dy) => {
          if (this.species[this.kind[j]].kind !== 'herbivore') return;
          const d = dx * dx + dy * dy;
          if (d < pd) {
            pd = d;
            prey = j;
            pdx = dx;
            pdy = dy;
          }
        });
        if (prey >= 0 && pd < 0.8) {
          this.kill(prey);
          e += 0.6;
          this.wander(i, sp.speed * 0.3);
        } else if (prey >= 0 && e < 0.85) {
          const len = Math.sqrt(pd) || 1;
          this.vx[i] = (pdx / len) * sp.speed;
          this.vy[i] = (pdy / len) * sp.speed;
        } else {
          this.wander(i, sp.speed * 0.6);
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
        this.forEachNear(this.x[i], this.y[i], 12, (j, dx, dy) => {
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
        } else if (prey >= 0 && e < 0.85) {
          const len = Math.sqrt(pd) || 1;
          this.vx[i] = (pdx / len) * sp.speed;
          this.vy[i] = (pdy / len) * sp.speed;
        } else {
          this.wander(i, sp.speed * 0.5);
        }
        break;
      }
      case 'sapient': {
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
        if (v && this.role[i] === CHILD && this.age[i] >= sp.maturity) this.role[i] = pickRole(era, v.tier, this.rnd(), v.port >= 0);
        const elder = this.age[i] >= elderAge(sp, era);
        const working = this.role[i] !== CHILD && !elder;
        let bias: { x: number; y: number } | undefined;
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
          }
          if (dx * dx + dy * dy > range * range) bias = { x: dx, y: dy };
          // Caçadores abatem herbívoros por perto.
          if (role === ROLE.hunter && working && e < 0.8) {
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
      this.kill(i);
      return;
    }
    // Reprodução (idosos não têm filhos).
    const fertile = this.age[i] >= sp.maturity && (sp.kind !== 'sapient' || this.age[i] < elderAge(sp, era));
    if (fertile && this.energy[i] > 0.65 && this.rnd() < b.birthRate * dt) {
      let crowd = 0;
      this.forEachNear(this.x[i], this.y[i], CELL, (j) => {
        if (this.kind[j] === s) crowd++;
      });
      // Casas de eras mais avançadas abrigam mais gente (sobrados, prédios).
      const housed = v < 0 || this.villages[v].population < this.villages[v].houses.length * (4 + era) + this.villages[v].fields * 2 + 4;
      if (crowd < b.crowd && housed) {
        const child = this.spawn(s, this.x[i] + (this.rnd() - 0.5), this.y[i] + (this.rnd() - 0.5), v);
        if (child >= 0) this.energy[i] -= 0.3;
      }
    }
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
    for (const st of streetPlan(v.tier)) {
      for (let step = 0; step <= st.len; step++) {
        const t = this.tileAt(cx + st.x + st.dx * step, cy + st.y + st.dy * step);
        if (t < 0 || !isLand(this.map, t)) break;
        if (this.road[t] === 3) continue;
        if (kind === 2 && this.road[t] === 1) this.road[t] = 0;
        this.setRoad(t, kind);
      }
    }
    v.lots = lotsFor(v.tier);
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
          if (t < 0 || !isLand(this.map, t) || this.road[t] || this.built[t]) break;
          tiles.push(t);
        }
      }
      if (tiles.length === 4) return tiles;
    }
    return null;
  }

  /** Constrói uma casa (ou construção especial) no lote livre mais perto do centro. */
  private buildHouse(v: Village, kind: BuildingKind = 'house'): boolean {
    const tiles = this.freeLot(v);
    if (!tiles) return false;
    const w = this.map.width;
    for (const t of tiles) {
      this.built[t] = 1;
      this.onTileChanged(t);
    }
    v.houses.push({ x: tiles[0] % w, y: Math.floor(tiles[0] / w), kind, variant: Math.floor(this.rnd() * 4) });
    if (kind !== 'house') this.log.unshift(`${v.name} construiu ${kind === 'smithy' || kind === 'factory' ? 'uma' : 'um'} ${BUILDING_NAMES[kind].toLowerCase()}`);
    return true;
  }

  /** Próxima construção especial que o assentamento pode erguer, se houver. */
  private nextBuilding(v: Village): BuildingKind | null {
    const era = Math.floor(v.tech);
    for (const b of BUILDINGS) if (canBuild(b, era, v.tier) && !v.houses.some((h) => h.kind === b)) return b;
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

  private lineRoad(ax: number, ay: number, bx: number, by: number): void {
    const dx = wrapDx(bx - ax, this.map.width);
    const dy = by - ay;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let k = 0; k <= n; k++) {
      const t = this.tileAt(Math.floor(ax + (dx * k) / n), Math.floor(ay + (dy * k) / n));
      if (t >= 0 && isLand(this.map, t)) this.setRoad(t, 1);
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
      color: from ? from.color : KINGDOM_COLORS[(this.villages.filter((o) => o.kingdom === o.id).length + Math.floor(rnd() * 3)) % KINGDOM_COLORS.length],
      abandoned: false,
    };
    this.villages.push(village);
    this.layStreets(village);
    this.buildHouse(village);
    if (from) this.connect(from, village);
    for (let k = 0; k < settlers; k++) {
      this.spawn(s, x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, village.id, sp.maturity + rnd() * 10);
    }
    return village;
  }

  private abandon(v: Village): void {
    v.abandoned = true;
    // As casas viram ruína e somem; as ruas ficam.
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
    // Assentamentos do reino de uma capital abandonada ficam independentes.
    for (const o of this.villages) if (o.kingdom === v.id && o !== v) o.kingdom = o.id;
    this.log.unshift(`${v.name} foi abandonada`);
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
        if (o.species !== v.species || o.tier >= 2) continue;
        const old = o.kingdom;
        for (const m of this.villages) {
          if (m.kingdom === old) {
            m.kingdom = v.kingdom;
            m.color = v.color;
          }
        }
        this.connect(v, o);
        this.log.unshift(`${o.name} passou a fazer parte do reino de ${this.capitalOf(v).name}`);
      }
    }
    v.tier = target;
    this.layStreets(v);
    this.log.unshift(`${v.name} virou ${TIER_NAMES[target].toLowerCase()}`);
  }

  private updateVillages(dt: number): void {
    // Adultos de cada assentamento, para escolher líderes.
    const adults: number[][] = this.villages.map(() => []);
    const fishers = this.villages.map(() => 0);
    for (let i = 0; i < this.count; i++) {
      const v = this.village[i];
      if (v < 0 || !this.alive[i] || this.role[i] === CHILD) continue;
      adults[v].push(i);
      if (this.role[i] === ROLE.fisher) fishers[v]++;
    }
    let live = 0;
    for (const v of this.villages) if (!v.abandoned) live++;
    for (const v of this.villages) {
      if (v.abandoned) continue;
      if (v.population <= 0) {
        this.abandon(v);
        continue;
      }
      const before = Math.floor(v.tech);
      if (before < ERA_YEARS.length) {
        // Cresce com a população e com o tamanho do reino (troca de ideias).
        const people = Math.min(1.3, Math.max(0.4, Math.sqrt(v.population / 30)));
        const kingdom = Math.min(1.25, 1 + 0.05 * (this.kingdomSize(this.capitalOf(v)) - 1));
        v.tech = Math.min(ERAS.length - 1, v.tech + ((dt / YEAR_SECONDS) * people * kingdom) / ERA_YEARS[before]);
      }
      if (Math.floor(v.tech) > before) {
        this.log.unshift(`${v.name} entrou na ${ERAS[Math.floor(v.tech)]}`);
        if (Math.floor(v.tech) === 3) this.layStreets(v);
      }
      this.growTier(v);
      this.updateLeader(v, adults[v.id] ?? []);
      // Constrói casas quando o assentamento cresce; às vezes uma construção especial.
      const homes = v.houses.filter((h) => h.kind === 'house').length;
      if (v.population > homes * 3 && this.rnd() < 0.4) {
        const special = homes >= 4 && this.rnd() < 0.35 ? this.nextBuilding(v) : null;
        this.buildHouse(v, special ?? 'house');
      }
      // Plantações a partir da Idade do Bronze, uma para cada duas casas.
      if (Math.floor(v.tech) >= 1 && v.fields < homes / 2 && this.rnd() < 0.3) this.plantField(v);
      // Porto na costa a partir do fim da Idade da Pedra (canoas); barcos de pesca saem dele.
      if (v.port < 0 && v.tech >= 0.5 && this.rnd() < 0.08 * dt) this.buildPort(v);
      if (v.port >= 0 && fishers[v.id] > 0 && this.rnd() < 0.15 * dt) {
        let out = 0;
        for (const b of this.boats) if (b.village === v.id && b.purpose === 'fish' && b.sunk < 0) out++;
        if (out < Math.min(3, 1 + Math.floor(fishers[v.id] / 3))) this.launch(v, 'fish');
      }
      // Assentamentos cheios (ou sem espaço, como numa ilha) enviam colonos para fundar outro.
      const crowded = v.population >= 8 && v.population >= v.houses.length * 4 && !this.freeLot(v);
      if ((v.population > 26 || crowded) && this.rnd() < (COLONY_RATE * dt) / YEAR_SECONDS && live < 100) {
        if (!this.colonizeByLand(v)) this.colonizeBySea(v);
      }
    }
    if (this.log.length > 8) this.log.length = 8;
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
      this.log.unshift(`Colonos de ${v.name} fundaram ${nv.name}`);
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
    if (best < 0 || this.seaSize(bestWater, 600) < 600) return false;
    this.built[best] = 1;
    this.onTileChanged(best);
    const bx = best % w;
    const by = Math.floor(best / w);
    const wx = bestWater % w;
    v.houses.push({ x: bx, y: by, kind: 'port', variant: wx === (bx + 1) % w ? 0 : wx === (bx - 1 + w) % w ? 1 : 2 });
    v.port = bestWater;
    this.lineRoad(v.x, v.y, bx + 0.5, by + 0.5);
    this.log.unshift(`${v.name} construiu um porto`);
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
    this.log.unshift(`${passengers.length} colonos de ${v.name} partiram de ${type.name.toLowerCase()}`);
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
    const what = b.purpose === 'fish' ? `um barco de pesca de ${v.name}` : `${type.the} de colonos de ${v.name}`;
    if (b.kind <= 1 && this.rnd() < 0.5) {
      this.sink(b, `${predator}s afundaram ${what}`);
    } else if (b.passengers.length) {
      b.passengers.pop();
      this.log.unshift(`Um ${predator.toLowerCase()} atacou ${what}: um colono morreu`);
      if (!b.passengers.length) this.sink(b, `Ninguém sobreviveu ${type.on} de ${v.name}`);
    } else if (b.purpose === 'fish') {
      this.sink(b, `${predator}s afundaram ${what}`);
    }
  }

  /** Naufrágio: morrem os passageiros (ou um pescador, nos barcos de pesca). */
  private sink(b: Boat, message: string): void {
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
    this.log.unshift(message);
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
      if (b.purpose === 'colonize') {
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
      if (b.purpose === 'colonize' && d < 0.35) {
        b.step++;
        if (b.step >= b.path.length) {
          this.landColonists(b);
          this.boats.splice(k, 1);
          continue;
        }
      }
      // Perigos: tempestades (mais comuns nos barcos antigos), ficar à deriva e doenças em viagens longas.
      if (this.rnd() < type.risk * move) {
        this.sink(
          b,
          b.purpose === 'fish'
            ? `Uma tempestade afundou um barco de pesca de ${v.name}`
            : `Uma tempestade afundou ${type.the} de ${v.name}: ${b.passengers.length} colonos morreram`,
        );
        continue;
      }
      if (b.purpose === 'colonize') {
        if (this.rnd() < type.risk * 0.6 * move) {
          b.adrift = 6 + this.rnd() * 10;
          b.heading = this.rnd() * Math.PI * 2;
          this.log.unshift(`${cap(type.the)} de ${v.name} ficou à deriva`);
        } else if (b.step > 40 && this.rnd() < 0.0015 * move) {
          b.passengers.pop();
          this.log.unshift(`Uma doença a bordo matou um colono de ${v.name}`);
          if (!b.passengers.length) this.sink(b, `Ninguém sobreviveu ${type.on} de ${v.name}`);
        }
      }
    }
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
      this.log.unshift(`Colonos de ${from.name} cruzaram o mar de ${BOATS[b.kind].name.toLowerCase()} e fundaram ${target.name}`);
    } else {
      const other = this.settlementAt(lx, ly);
      if (other && other.species === from.species) {
        target = other;
        this.log.unshift(`Colonos de ${from.name} chegaram de barco a ${other.name}`);
      }
    }
    if (!target) {
      this.log.unshift(`Os colonos de ${from.name} não acharam onde morar e se perderam`);
      return;
    }
    for (const p of b.passengers) {
      const c = this.spawn(from.species, lx + this.rnd(), ly + this.rnd(), target.id, p.age);
      if (c >= 0) this.role[c] = p.role;
    }
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
        this.log.unshift(`Muito perto de ${other?.name ?? 'outro assentamento'}: escolha um lugar fora da área`);
        return 0;
      }
      const v = this.foundVillage(s, ((Math.floor(x) % w) + w) % w, Math.floor(y), Math.max(4, amount));
      this.log.unshift(`${this.species[s].name}s fundaram ${v.name}`);
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

  /** Ensina as aldeias numa área: avança a tecnologia delas. */
  teach(x: number, y: number, radius: number, amount: number): Village[] {
    const w = this.map.width;
    const taught: Village[] = [];
    for (const v of this.villages) {
      if (v.abandoned) continue;
      let dx = Math.abs(v.x - x);
      if (dx > w / 2) dx = w - dx;
      if (dx * dx + (v.y - y) ** 2 <= (radius + 4) ** 2) {
        v.tech = Math.min(ERAS.length - 1, v.tech + amount);
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
