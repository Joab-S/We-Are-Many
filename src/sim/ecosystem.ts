import { mulberry32 } from '../core/rng';
import { Biome, temperatureAt, type SurfaceMap } from '../procgen/surface';
import { alienName, type Species, type SpeciesKind } from './species';

/**
 * Ecossistema da superfície (RF-SUP-08, RF-SUP-09): criaturas individuais
 * que andam pelo mapa, comem, se reproduzem e morrem, e espécies
 * inteligentes primitivas que formam aldeias e avançam de era.
 * Não depende do three.js; a renderização só lê os arrays.
 */

/** Segundos de jogo (velocidade 1x) que formam um ano. */
export const YEAR_SECONDS = 6;

export const ERAS = ['Idade da Pedra', 'Idade do Bronze', 'Idade do Ferro', 'Era Medieval', 'Era Industrial'];

export interface Village {
  id: number;
  name: string;
  species: number;
  x: number;
  y: number;
  houses: { x: number; y: number }[];
  tech: number;
  population: number;
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
  sapient: { metabolism: 0.045, birthRate: 0.05, cap: 1800, crowd: 40 },
};

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
  readonly villages: Village[] = [];
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
      if (sp.kind === 'fish' ? isWater(map, i) : isLand(map, i)) area += 4;
    }
    const per = sp.kind === 'fish' ? 140 : sp.kind === 'herbivore' ? 150 : sp.kind === 'predator' ? 1400 : 120;
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
      const target =
        sp.kind === 'fish' ? water / 220 : sp.kind === 'herbivore' ? green / 260 : sp.kind === 'predator' ? green / 2200 : 0;
      const amount = Math.min(this.caps[s] * 0.6, Math.round(target));
      for (let k = 0; k < amount; k++) {
        const tile = this.findTile(s, Math.floor(this.rnd() * n), 40);
        if (tile >= 0) this.spawnAtTile(s, tile, -1, this.rnd() * sp.maxAge * 0.6);
      }
      if (sp.kind === 'sapient') {
        const villages = Math.max(2, Math.min(6, Math.round(green / 60000)));
        for (let v = 0; v < villages; v++) {
          const tile = this.findTile(s, Math.floor(this.rnd() * n), 400, true);
          if (tile >= 0) this.foundVillage(s, tile % map.width, Math.floor(tile / map.width), 8);
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
    const ok = sp.kind === 'fish' ? isWater(this.map, i) : isLand(this.map, i);
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
    // A grade pode estar em uso no meio de um passo: copiar, nunca zerar (zeros criariam um laço infinito).
    const next = new Int32Array(capacity).fill(-1);
    next.set(this.gridNext);
    this.gridNext = next;
    this.capacity = capacity;
  }

  spawn(s: number, x: number, y: number, village = -1, age = 0): number {
    if (this.population[s] >= this.caps[s]) return -1;
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
    if (village >= 0) this.villages[village].population++;
    return i;
  }

  private spawnAtTile(s: number, tile: number, village = -1, age = 0): number {
    const w = this.map.width;
    return this.spawn(s, (tile % w) + this.rnd(), Math.floor(tile / w) + this.rnd(), village, age);
  }

  kill(i: number): void {
    if (!this.alive[i]) return;
    this.alive[i] = 0;
    this.population[this.kind[i]]--;
    const v = this.village[i];
    if (v >= 0) this.villages[v].population--;
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
      const fish = this.species[s].kind === 'fish';
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
    if (sp.kind === 'fish' ? !isWater(map, tile) : !isLand(map, tile)) e -= 0.6 * dt;

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
      case 'sapient': {
        const v = this.village[i] >= 0 ? this.villages[this.village[i]] : null;
        const veg = map.vegetation[tile];
        if (veg > 0.1) e += 0.06 * dt * (1 + (v?.tech ?? 0) * 0.5);
        if (this.nearWater(tile)) e += 0.05 * dt;
        let bias: { x: number; y: number } | undefined;
        if (v) {
          let dx = v.x - this.x[i];
          if (dx > map.width / 2) dx -= map.width;
          else if (dx < -map.width / 2) dx += map.width;
          const dy = v.y - this.y[i];
          const range = 4 + Math.sqrt(v.houses.length) * 2.5;
          if (dx * dx + dy * dy > range * range) bias = { x: dx, y: dy };
        }
        this.wander(i, sp.speed, bias);
        break;
      }
    }

    this.energy[i] = Math.min(1, e);
    const old = this.age[i] > sp.maxAge * (0.85 + 0.3 * ((i * 2654435761) % 1000) / 1000);
    if (this.energy[i] <= 0 || old) {
      this.kill(i);
      return;
    }
    // Reprodução.
    if (this.age[i] >= sp.maturity && this.energy[i] > 0.65 && this.rnd() < b.birthRate * dt) {
      let crowd = 0;
      this.forEachNear(this.x[i], this.y[i], CELL, (j) => {
        if (this.kind[j] === s) crowd++;
      });
      const v = this.village[i];
      const housed = v < 0 || this.villages[v].population < this.villages[v].houses.length * 5 + 4;
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

  foundVillage(s: number, x: number, y: number, settlers: number, from?: Village): Village {
    const sp = this.species[s];
    const rnd = this.rnd;
    const village: Village = {
      id: this.villages.length,
      name: alienName(rnd, 2),
      species: s,
      x: x + 0.5,
      y: y + 0.5,
      houses: [{ x, y }],
      tech: from ? from.tech * 0.8 : 0,
      population: 0,
      color: from ? from.color : ([90 + rnd() * 160, 60 + rnd() * 150, 60 + rnd() * 150].map(Math.round) as [number, number, number]),
      abandoned: false,
    };
    this.villages.push(village);
    for (let k = 0; k < settlers; k++) {
      this.spawn(s, x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, village.id, sp.maturity + rnd() * 10);
    }
    return village;
  }

  private updateVillages(dt: number): void {
    const map = this.map;
    for (const v of this.villages) {
      if (v.abandoned) continue;
      if (v.population <= 0) {
        v.abandoned = true;
        this.log.unshift(`${v.name} foi abandonada`);
        continue;
      }
      const before = Math.floor(v.tech);
      v.tech = Math.min(ERAS.length - 1, v.tech + dt * 0.0025 * Math.sqrt(v.population));
      if (Math.floor(v.tech) > before) this.log.unshift(`${v.name} entrou na ${ERAS[Math.floor(v.tech)]}`);
      // Constrói casas quando a aldeia cresce.
      if (v.population > v.houses.length * 3 && this.rnd() < 0.4) {
        const r = 2 + Math.sqrt(v.houses.length) * 1.6;
        for (let t = 0; t < 8; t++) {
          const hx = Math.floor(v.x + (this.rnd() - 0.5) * 2 * r);
          const hy = Math.floor(v.y + (this.rnd() - 0.5) * 2 * r);
          if (hy < 1 || hy >= map.height - 1) continue;
          const tx = ((hx % map.width) + map.width) % map.width;
          if (!isLand(map, hy * map.width + tx)) continue;
          if (v.houses.some((h) => Math.abs(h.x - tx) < 2 && Math.abs(h.y - hy) < 2)) continue;
          v.houses.push({ x: tx, y: hy });
          break;
        }
      }
      // Aldeias cheias enviam colonos para fundar outra.
      if (v.population > 26 && this.rnd() < 0.04 * dt && this.villages.length < 60) {
        for (let t = 0; t < 12; t++) {
          const a = this.rnd() * Math.PI * 2;
          const d = 16 + this.rnd() * 22;
          const nx = Math.floor(v.x + Math.cos(a) * d);
          const ny = Math.floor(v.y + Math.sin(a) * d);
          if (ny < 2 || ny >= map.height - 2) continue;
          const tx = ((nx % map.width) + map.width) % map.width;
          const tile = ny * map.width + tx;
          if (!this.habitable(v.species, tile) || map.vegetation[tile] < 0.2) continue;
          const nv = this.foundVillage(v.species, tx, ny, 0, v);
          let moved = 0;
          for (let i = 0; i < this.count && moved < 6; i++) {
            if (this.alive[i] && this.village[i] === v.id && this.age[i] > this.species[v.species].maturity) {
              this.village[i] = nv.id;
              v.population--;
              nv.population++;
              moved++;
            }
          }
          this.log.unshift(`Colonos de ${v.name} fundaram ${nv.name}`);
          break;
        }
      }
    }
    if (this.log.length > 8) this.log.length = 8;
  }

  // Ferramentas do jogador -------------------------------------------------

  /** Introduz indivíduos de uma espécie já conhecida numa área. Retorna quantos nasceram. */
  introduce(s: number, x: number, y: number, radius: number, amount: number): number {
    const w = this.map.width;
    let born = 0;
    if (this.species[s].kind === 'sapient') {
      const tile = Math.floor(y) * w + (((Math.floor(x) % w) + w) % w);
      if (!this.habitable(s, tile)) return 0;
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
