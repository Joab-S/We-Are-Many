/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): carcaças, deslocamento, busca de comida, ameaça, presa e bando dos bichos de terra.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as surfaceModule from '../../../procgen/surface';
import * as settlementModule from '../../settlement';
import type { Species } from '../../species';
import * as faunaModule from '../../fauna';
import type { Ecology } from '../../fauna';
import * as constantsModule from '../constants';
import type { EcoCells } from '../cells';

// Cópias locais dos valores importados (eco/*, fauna, superfície; o porquê está em ecosystem.ts).
const { DECISIONS_PER_YEAR, ECO_CELL, ecologyOf, EDIBLE, FOOD_MIN, HUNGRY, hunts, ANIMAL_PACE, metabolic, REFUGE, SATED, TANK_KG } = faunaModule;
const { wrapDx } = settlementModule;
const { temperatureAt } = surfaceModule;
const { ACT, MAX_CARCASSES, REFUGES } = constantsModule;

/** Rascunhos da escolha de presa e do bando (sem alocar a cada decisão). */
const PREY_CAND = new Float32Array(48 * 3);
let PREY_SEEN = new Uint16Array(64);
const KIN = { n: 0, dx: 0, dy: 0, d: 0 };

export const faunaFoodPart = {
  /** O bicho morto vira carcaça no lugar. */
  leaveCarcass(this: Ecosystem, i: number, kg = ecologyOf(this.species[this.kind[i]]).mass * EDIBLE): void {
    if (kg < 0.3) return;
    // A ordem das carcaças conta (por isso shift e splice, e não troca com a última): a mais velha é a
    // primeira a sair quando enche, a recém-deixada é a última (hunt come dela pelo índice), e
    // carcassNear desempata pela ordem.
    if (this.carcasses.length >= MAX_CARCASSES) this.carcasses.shift();
    this.carcasses.push({ x: this.x[i], y: this.y[i], kg, at: this.year, sp: this.kind[i] });
  },

  /** Carcaça mais perto a até `radius` tiles (com carne), ou -1. */
  carcassNear(this: Ecosystem, x: number, y: number, radius: number): number {
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
  },

  /** Come da carcaça até saciar; devolve a energia ganha. */
  eatCarcass(this: Ecosystem, i: number, k: number, e: Ecology): number {
    const cc = this.carcasses[k];
    const tank = TANK_KG * metabolic(e);
    const want = Math.max(0, SATED - this.energy[i]) * tank;
    const take = Math.min(want, cc.kg);
    cc.kg -= take;
    return take / tank;
  },

  /**
   * Velocidade de viagem (tiles por segundo de simulação): a área de vida por ano dividida pela duração
   * do ano, mas nunca acima do passo da espécie na tela (senão no x1 o bicho atravessa o mapa correndo).
   */
  pace(this: Ecosystem, e: Ecology, sp: Species): number {
    return Math.min(sp.speed * ANIMAL_PACE, e.roam / this.yearSpan);
  },

  /** Anda reto até (dx, dy) de distância; chega sem passar do ponto na próxima decisão. */
  headTo(this: Ecosystem, i: number, dx: number, dy: number, speed: number): void {
    const d = Math.hypot(dx, dy);
    if (d < 0.25) {
      this.vx[i] = 0;
      this.vy[i] = 0;
      return;
    }
    // Um pouco de ruído na direção (o "wander" de Reynolds), sem virar passeio aleatório.
    const a = Math.atan2(dy, dx) + (this.faunaRnd() - 0.5) * 0.3;
    // Fora da tela a próxima decisão demora `stride` vezes mais: anda mais devagar para não passar do ponto.
    const go = Math.min(speed, d / ((this.yearSpan / DECISIONS_PER_YEAR) * this.stride));
    this.vx[i] = Math.cos(a) * go;
    this.vy[i] = Math.sin(a) * go;
    this.aimX[i] = dx;
    this.aimY[i] = dy;
  },

  headToTile(this: Ecosystem, i: number, t: number, speed: number): void {
    const w = this.map.width;
    this.headTo(i, wrapDx((t % w) + 0.5 - this.x[i], w), Math.floor(t / w) + 0.5 - this.y[i], speed);
  },

  stop(this: Ecosystem, i: number): void {
    this.vx[i] = 0;
    this.vy[i] = 0;
  },

  /**
   * Melhor mancha de comida ao alcance: consulta o mapa de comida das células em
   * volta (mais longe quanto mais fome), escolhe pela comida menos o custo da
   * distância e do medo, e sorteia alguns tiles dentro dela. Devolve o tile ou -1.
   */
  findFood(this: Ecosystem, i: number, e: Ecology, c: EcoCells, reach: number): number {
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
      const t = this.tileAt(x0 + Math.floor(this.faunaRnd() * ECO_CELL), Math.min(m.height - 1, y0 + Math.floor(this.faunaRnd() * ECO_CELL)));
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
  },

  /** Tile com comida mais perto, olhando em anéis até `radius` tiles (onde o bicho pode ficar e no seu clima). */
  nearFood(this: Ecosystem, i: number, e: Ecology, radius: number, min = FOOD_MIN): number {
    const s = this.kind[i];
    const sp = this.species[s];
    for (let r = 1; r <= radius; r++) {
      let best = -1;
      let bestFood = min;
      const n = Math.max(8, Math.round(r * 5));
      const a0 = this.faunaRnd() * Math.PI * 2;
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
  },

  /** Dá para andar em linha reta `dist` tiles na direção (dx, dy) sem penhasco nem água no caminho? */
  reachable(this: Ecosystem, i: number, dx: number, dy: number, dist: number): boolean {
    const s = this.kind[i];
    let from = this.tileOf(i);
    for (let d = 1; d <= Math.ceil(dist); d++) {
      const t = this.tileAt(this.x[i] + dx * Math.min(d, dist), Math.floor(this.y[i] + dy * Math.min(d, dist)));
      if (t < 0 || !this.canStep(s, from, t)) return false;
      from = t;
    }
    return true;
  },

  /** Há comida da dieta (fora carne) a até `radius` tiles? Para medir a fome evitável. */
  foodWithin(this: Ecosystem, e: Ecology, x: number, y: number, radius: number): boolean {
    for (let oy = -radius; oy <= radius; oy += 2) {
      for (let ox = -radius; ox <= radius; ox += 2) {
        const t = this.tileAt(x + ox, Math.floor(y + oy));
        if (t >= 0 && this.foodAt(e, t) >= 0.3) return true;
      }
    }
    return false;
  },

  /** Predador que está caçando este bicho (ou com fome e colado nele), a até a distância de alerta. */
  threatTo(this: Ecosystem, i: number, e: Ecology): number {
    // A presa só percebe o caçador de perto (ele chega de tocaia).
    const radius = 2 + 4 * e.fear;
    const s = this.kind[i];
    if (hunts(e) || !this.huntersAround(this.x[i], this.y[i], radius)) return -1;
    let best = -1;
    let bd = Infinity;
    // Laço quente: a vizinhança vem de `gatherNear` (sem closure por consulta), na mesma ordem de `forEachNear`.
    const near = this.gatherNear(this.x[i], this.y[i], radius);
    for (let n = 0; n < near.n; n++) {
      const j = near.i[n];
      const k = this.kind[j];
      if (k === s || !this.wild(k)) continue;
      const pe = ecologyOf(this.species[k]);
      if (!hunts(pe) || hunts(e) || e.mass > pe.maxPrey * (pe.pack ? 3 : 1)) continue;
      const dx = near.dx[n];
      const dy = near.dy[n];
      const d = dx * dx + dy * dy;
      // Predador saciado não assusta; o que está caçando, sim (e o faminto colado também).
      const hunting = this.act[j] === ACT.hunt && ((this.chase[j] === i && this.chaseUid[j] === this.uid[i]) || d < 9);
      if (!hunting && !(this.energy[j] < HUNGRY && d < 4)) continue;
      if (d < bd) {
        bd = d;
        best = j;
      }
    }
    return best;
  },

  /**
   * Escolhe a presa (resposta funcional tipo III de Holling): dieta e tamanho
   * possíveis, a espécie mais abundante por perto pesa mais (a rara é atacada
   * menos, mas continua visível), e filhote, velho ou doente pesa mais.
   */
  pickPrey(this: Ecosystem, i: number, e: Ecology, helpers: number): number {
    const s = this.kind[i];
    const limit = e.maxPrey * (e.pack ? Math.min(3, 1 + helpers * 0.5) : 1);
    const min = e.mass * 0.015;
    const sight = Math.min(36, 8 + e.range);
    const escaped = this.escaped[i];
    if (PREY_SEEN.length < this.species.length) PREY_SEEN = new Uint16Array(this.species.length * 2);
    const seen = PREY_SEEN;
    seen.fill(0);
    const cand = PREY_CAND;
    let n = 0;
    const near = this.gatherNear(this.x[i], this.y[i], sight);
    for (let q = 0; q < near.n; q++) {
      const j = near.i[q];
      const k = this.kind[j];
      if (k === s || this.uid[j] === escaped || n >= cand.length / 3) continue;
      const dx = near.dx[q];
      const dy = near.dy[q];
      const kk = this.species[k].kind;
      if (kk === 'fish') {
        // Peixe só na beira d'água (ou para os anfíbios, como o crocodilo).
        if (e.fish <= 0 || (dx * dx + dy * dy > 9 && !this.species[s].amphibious)) continue;
      } else if (!this.wild(k)) continue;
      const pe = ecologyOf(this.species[k]);
      // Filhote de bicho grande é presa possível (leões pegam elefantes jovens).
      const mass = this.age[j] < this.species[k].maturity ? pe.mass * 0.3 : pe.mass;
      if (hunts(pe) || mass > limit || mass < min) continue;
      seen[k]++;
      cand[n * 3] = j;
      cand[n * 3 + 1] = dx;
      cand[n * 3 + 2] = dy;
      n++;
    }
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
  },

  /** Quão fácil é pegar o bicho: filhote, velho e com parasitas, mais; pequeno no refúgio, menos. */
  vulnerable(this: Ecosystem, j: number): number {
    const sp = this.species[this.kind[j]];
    let v = 1;
    if (this.age[j] < sp.maturity) v *= 1.6;
    else if (this.age[j] > sp.maxAge * 0.8) v *= 1.4;
    v *= 1 + this.parasite[j];
    const pe = ecologyOf(sp);
    if (pe.mass < 30 && REFUGES.has(this.map.biome[this.tileOf(j)])) v *= 1 - REFUGE;
    return v;
  },

  /** Conspecíficos adultos a até `radius` tiles e a direção do mais perto. */
  kin(this: Ecosystem, i: number, radius: number): { n: number; dx: number; dy: number; d: number } {
    const s = this.kind[i];
    const mature = this.species[s].maturity;
    const out = KIN;
    out.n = 0;
    out.d = Infinity;
    out.dx = 0;
    out.dy = 0;
    const near = this.gatherNear(this.x[i], this.y[i], radius);
    for (let q = 0; q < near.n; q++) {
      const j = near.i[q];
      if (j === i || this.kind[j] !== s) continue;
      if (this.age[j] >= mature) out.n++;
      const dx = near.dx[q];
      const dy = near.dy[q];
      const d = Math.hypot(dx, dy);
      if (d < out.d) {
        out.d = d;
        out.dx = dx;
        out.dy = dy;
      }
    }
    return out;
  },
};
export type FaunaFoodPart = typeof faunaFoodPart;
