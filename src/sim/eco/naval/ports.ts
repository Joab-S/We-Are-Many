/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): portos, busca no mar e colonização por barco.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { CHILD } from '../../roles';
import { TIER_RADIUS, wrapDx } from '../../settlement';
import type { Boat, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { BOATS } = constantsModule;
const { elderAge } = helpersModule;
const { isWater, isLand, NEIGHBORS4 } = tilesModule;

/** Desvios do caminho a pé, em fração da distância para o lado da reta (ver `landPath`). */
const DETOUR_SIDES = [0.35, -0.35, 0.7, -0.7];

/** A linha reta entre dois pontos é toda de terra, sem penhasco no meio. */
function straightWalk(eco: Ecosystem, ax: number, ay: number, bx: number, by: number): boolean {
  const dx = wrapDx(bx - ax, eco.map.width);
  const dy = by - ay;
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
  let prev = -1;
  for (let k = 0; k <= n; k++) {
    const t = eco.tileAt(Math.floor(ax + (dx * k) / n), Math.floor(ay + (dy * k) / n));
    if (t < 0 || !isLand(eco.map, t)) return false;
    if (prev >= 0 && Math.abs(eco.map.elevation[t] - eco.map.elevation[prev]) > B.MAX_CLIMB * 1.5) return false;
    prev = t;
  }
  return true;
}

export const portsPart = {
  /**
   * Vegetação mínima no centro para fundar (SITE_CENTER_GREEN), de `v` ou de quem tem a técnica `v`. A partir da
   * Idade do Ferro, poços e irrigação abrem o deserto, mas só onde há água no subsolo (SITE_WELL_MOISTURE no `tile`,
   * onda 3); sem tile, vale a regra antiga (nenhuma vegetação da Idade do Ferro em diante).
   */
  minFertility(this: Ecosystem, v: Village | number, tile = -1): number {
    const tech = typeof v === 'number' ? v : v.tech;
    if (tech < 2) return B.SITE_CENTER_GREEN;
    return tile < 0 || this.map.moisture[tile] >= B.SITE_WELL_MOISTURE ? 0 : B.SITE_CENTER_GREEN;
  },

  /**
   * Se dá para ir a pé de um ponto ao outro: a linha reta é toda de terra, sem penhasco no meio. Com `detour`
   * (onda 3), uma baía ou um lago no meio do caminho não fecha a passagem: tenta contornar por um ponto ao lado
   * da reta (a um terço e a dois terços da distância, para cada lado), em duas retas.
   */
  landPath(this: Ecosystem, ax: number, ay: number, bx: number, by: number, detour = false): boolean {
    if (straightWalk(this, ax, ay, bx, by)) return true;
    if (!detour) return false;
    const dx = wrapDx(bx - ax, this.map.width);
    const dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (d < 4) return false;
    for (const k of DETOUR_SIDES) {
      const mx = ax + dx / 2 - (dy / d) * d * k;
      const my = ay + dy / 2 + (dx / d) * d * k;
      if (my < 1 || my >= this.map.height - 1) continue;
      if (straightWalk(this, ax, ay, mx, my) && straightWalk(this, mx, my, bx, by)) return true;
    }
    return false;
  },

  // Portos e barcos ----------------------------------------------------------

  /** Constrói o porto no tile de costa mais perto do centro, se ele dá para o mar (não para um lago). */
  buildPort(this: Ecosystem, v: Village): boolean {
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
  },

  /**
   * Busca em largura pelo mar a partir de `start`. `visit` é chamada para cada
   * tile de água com a distância navegada; devolver true encerra a busca.
   * Retorna quantos tiles de água visitou.
   */
  searchSea(this: Ecosystem, start: number, maxNodes: number, maxDist: number, visit?: (t: number, dist: number) => boolean): number {
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
      for (const [ox, oy] of NEIGHBORS4) {
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
  },

  /** Quantos tiles de água são alcançáveis (até `limit`): distingue mar de lago. */
  seaSize(this: Ecosystem, start: number, limit: number): number {
    return this.searchSea(start, limit, 65535);
  },

  /** Sai um barco do porto da era do assentamento. */
  launch(this: Ecosystem, v: Village, purpose: Boat['purpose'], path: number[] = [], landing = -1, passengers: Boat['passengers'] = []): Boat {
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
  },

  /**
   * Procura pelo mar uma costa livre para fundar uma colônia e manda colonos de barco. Os trechos de costa ao
   * alcance do barco que passam no filtro rápido (`siteQuick`) entram na nota, e o melhor que passa no exame da
   * área é o destino (`chooseSite`, melhor de N); abaixo de SITE_MIN_VALUE ninguém embarca.
   */
  colonizeBySea(this: Ecosystem, v: Village): boolean {
    if (v.port < 0 || this.boats.some((b) => b.village === v.id && b.purpose === 'colonize' && b.sunk < 0)) return false;
    const map = this.map;
    const w = map.width;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(v.tech))];
    const coast = new Map<number, number>();
    const candidates: { x: number; y: number }[] = [];
    const home = this.radius(v) + TIER_RADIUS[0];
    this.searchSea(v.port, 400000, type.range, (t, d) => {
      if (d < 6) return false;
      const x = t % w;
      const y = (t - x) / w;
      for (const [ox, oy] of NEIGHBORS4) {
        const l = this.tileAt(x + ox, y + oy);
        if (l < 0 || isWater(map, l)) continue;
        const lx = l % w;
        const ly = Math.floor(l / w);
        if (this.distance(v, lx, ly) < home || this.siteQuick(v.species, lx, ly, v.tech)) continue;
        if (candidates.some((c) => Math.hypot(wrapDx(c.x - lx, w), c.y - ly) < 8)) continue;
        candidates.push({ x: lx, y: ly });
        // A busca é em largura: a primeira água que encosta nesta costa é a rota mais curta até ela.
        coast.set(l, t);
        break;
      }
      return candidates.length >= B.SITE_CANDIDATES;
    });
    const site = this.chooseSite(candidates, v.species, v, 'porto', v.tech, { min: B.SITE_MIN_VALUE })[0];
    if (!site) return false;
    const pick = { water: coast.get(site.y * w + site.x)!, land: site.y * w + site.x };
    const path: number[] = [];
    for (let t = pick.water; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    // Embarcam adultos (nunca o líder), deixando gente em casa.
    const passengers: Boat['passengers'] = [];
    const max = Math.min(type.capacity, v.population - 3);
    const here = this.residents(v.id);
    const leader = this.leaderOf(v);
    for (let k = 0; k < here.length && passengers.length < max; k++) {
      const i = here[k];
      if (!this.alive[i] || this.village[i] !== v.id || i === leader || this.role[i] === CHILD) continue;
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
    this.emit({ kind: 'colony', year: this.year, phase: 'depart', from: v.id, to: -1, people: passengers.length, by: 'sea' });
    return true;
  },
};
export type PortsPart = typeof portsPart;
