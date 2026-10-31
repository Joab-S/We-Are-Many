/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): trilhas que nascem do uso e o desgaste das ruas (RF-AS-21).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { isStreet, TRAIL } from '../../architecture';
import { wrapDx } from '../../settlement';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isLand } = tilesModule;

export const wearPart = {
  /** Um passo de alguém pisando o tile `t` (só fora de casa, água e roça). */
  tread(this: Ecosystem, t: number, amount: number): void {
    if (t < 0 || this.built[t] || !isLand(this.map, t)) return;
    const r = this.road[t];
    if (r === 4 || r === 5) return;
    this.wear[t] += amount;
    this.wearTiles.add(t);
  },

  /**
   * Tráfego do ano (modo agregado, RF-AS-13): de cada casa até a praça e de cada roça até o celeiro, pelo
   * caminho mais barato (rua e trilha valem menos), soma desgaste em cada tile do trajeto. Assim as
   * trilhas nascem de onde a gente anda, e o caminho já gasto atrai mais gente.
   */
  yearTraffic(this: Ecosystem, v: Village): void {
    if (this.full(v)) return;
    const plaza = this.plazaTile(v);
    const granary = this.granaryTile(v);
    for (const h of v.houses) {
      if (h.kind === 'port') continue;
      this.trafficPath(this.tileAt(h.x + (h.x % 2), h.y + 2), plaza, B.HOME_TRIPS);
    }
    const fields = this.fieldTiles(v);
    for (let k = 0; k < fields.length; k += 4) this.trafficPath(fields[k], granary, B.FIELD_TRIPS);
  },

  /** Anda do tile `a` ao `b` passo a passo (como `stepToward`) e gasta cada tile do caminho. */
  trafficPath(this: Ecosystem, a: number, b: number, trips: number): void {
    if (a < 0 || b < 0) return;
    const w = this.map.width;
    let x = a % w;
    let y = Math.floor(a / w);
    const bx = b % w;
    const by = Math.floor(b / w);
    for (let n = 0; n < 80; n++) {
      if (Math.abs(wrapDx(bx - x, w)) <= 1 && Math.abs(by - y) <= 1) return;
      let best = -1;
      let bv = Infinity;
      let nx = x;
      let ny = y;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const t = this.tileAt(x + ox, y + oy);
          if (t < 0 || !isLand(this.map, t)) continue;
          const value = Math.hypot(ox, oy) * this.walkCost(t) + Math.hypot(wrapDx(bx - x - ox, w), by - y - oy);
          if (value < bv) {
            bv = value;
            best = t;
            nx = x + ox;
            ny = y + oy;
          }
        }
      }
      if (best < 0) return;
      this.tread(best, trips);
      x = ((nx % w) + w) % w;
      y = ny;
    }
  },

  /**
   * Uma vez por ano (RF-AS-13 e 14): onde o desgaste passou de TRAIL_WEAR nasce trilha; trilha muito usada
   * vira rua de terra; rua de terra ou trilha sem uso por ROAD_FORGET_YEARS some (menos a que dá acesso
   * a uma casa). O desgaste se apaga devagar, então só fica o caminho que continua sendo usado.
   */
  updateWear(this: Ecosystem): void {
    for (const v of this.villages) if (!v.abandoned && v.population > 0) this.yearTraffic(v);
    const changed: number[] = [];
    for (const t of this.wearTiles) {
      const r = this.road[t];
      const wear = this.wear[t];
      if (!r && wear >= B.TRAIL_WEAR && !this.built[t] && !this.wall[t] && this.depositAt[t] < 0 && isLand(this.map, t) && !this.closesBlock(t)) {
        this.road[t] = TRAIL;
        changed.push(t);
      } else if (r === TRAIL && wear >= B.ROAD_WEAR) {
        this.road[t] = 1;
        changed.push(t);
      }
      if ((r === TRAIL || r === 1) && wear < B.WEAR_IDLE) {
        this.roadIdle[t] = Math.min(255, this.roadIdle[t] + 1);
        if (this.roadIdle[t] >= B.ROAD_FORGET_YEARS && !this.servesHouse(t)) {
          this.road[t] = r === 1 ? TRAIL : 0;
          this.roadIdle[t] = 0;
          changed.push(t);
        }
      } else this.roadIdle[t] = 0;
      this.wear[t] = wear * B.WEAR_FADE;
      if (this.wear[t] < 0.5 && !this.road[t]) {
        this.wear[t] = 0;
        this.wearTiles.delete(t);
      }
    }
    if (!changed.length) return;
    for (const t of changed) this.onTileChanged(t);
    this.pruneRoads(changed);
  },

  /** Virar rua no tile `t` fecharia um bloco 2x2 de rua (RF-VIDA-191): a trilha contorna. */
  closesBlock(this: Ecosystem, t: number): boolean {
    const w = this.map.width;
    const x = t % w;
    const y = Math.floor(t / w);
    const street = (ox: number, oy: number) => {
      const n = this.tileAt(x + ox, y + oy);
      return n >= 0 && (isStreet(this.road[n]) || this.road[n] === 3);
    };
    for (const [ax, ay] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      let all = true;
      for (let k = 0; k < 4 && all; k++) {
        const ox = ax + (k & 1);
        const oy = ay + (k >> 1);
        if (ox === 0 && oy === 0) continue;
        if (!street(ox, oy)) all = false;
      }
      if (all) return true;
    }
    return false;
  },

  /** O tile de rua encosta numa casa (sem ele a casa perde o acesso à rua). */
  servesHouse(this: Ecosystem, t: number): boolean {
    const w = this.map.width;
    const x = t % w;
    const y = Math.floor(t / w);
    for (let oy = -2; oy <= 2; oy++) {
      for (let ox = -2; ox <= 2; ox++) {
        const n = this.tileAt(x + ox, y + oy);
        if (n >= 0 && this.built[n]) return true;
      }
    }
    return false;
  },
};
export type WearPart = typeof wearPart;
