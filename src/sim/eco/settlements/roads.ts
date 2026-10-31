/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): estradas entre assentamentos: traçado, curvas e limpeza.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { isStreet, TRAIL } from '../../architecture';
import { plotSeed, pruneBlocks, wrapDx } from '../../settlement';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isLand } = tilesModule;

export const roadsPart = {
  /** Estrada de terra entre dois assentamentos (a mesma em qualquer ordem, RF-VIDA-194). */
  connect(this: Ecosystem, a: Village, b: Village): void {
    this.lineRoad(a.x, a.y, b.x, b.y);
    a.linked = b.linked = true;
  },

  /**
   * Estradas só onde há movimento: uma vez por ano, um assentamento que já
   * tem gente e ainda não tem estrada se liga ao vizinho mais perto do mesmo
   * reino, se estiver perto e der para ir a pé. Reinos diferentes não ganham
   * estrada entre si.
   */
  linkRoads(this: Ecosystem): void {
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
  },

  /**
   * Estrada de terra entre dois pontos pela rede viária (RF-VIDA-190): busca
   * de caminho que anda barato sobre rua existente, paga caro para ficar ao
   * lado de uma rua sem estar nela, não passa por água nem por casa e segue
   * de perto uma curva suave entre os dois pontos. O resultado entra na rede
   * já existente em vez de correr paralelo a ela. Sem caminho por terra, a
   * estrada é desenhada em curva e para na água, como antes.
   */
  lineRoad(this: Ecosystem, ax: number, ay: number, bx: number, by: number): void {
    // Ordem fixa: ligar A a B ou B a A dá o mesmo traçado.
    if (ax > bx || (ax === bx && ay > by)) [ax, ay, bx, by] = [bx, by, ax, ay];
    const path = this.roadPath(ax, ay, bx, by);
    if (!path) {
      this.curveRoad(ax, ay, bx, by);
      return;
    }
    for (const t of path) if (!this.road[t] && !this.built[t]) this.setRoad(t, 1);
    this.pruneRoads(path);
  },

  /** Tiles da curva-guia de uma estrada (a curva suave de sempre). */
  guideTiles(this: Ecosystem, ax: number, ay: number, bx: number, by: number): { x: number; y: number }[] {
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
  },

  /** Busca A* da estrada numa janela em volta dos dois pontos; devolve os tiles ou null. */
  roadPath(this: Ecosystem, ax: number, ay: number, bx: number, by: number): number[] | null {
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
  },

  /** Estrada em curva que para na água (o traçado antigo, usado quando não há caminho por terra). */
  curveRoad(this: Ecosystem, ax: number, ay: number, bx: number, by: number): void {
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
  },

  /**
   * Limpeza da rede (RF-VIDA-195): tira tiles de rua que formam bloco 2x2
   * quando a retirada não desliga nenhum vizinho. Olha os tiles dados e os
   * vizinhos deles.
   */
  pruneRoads(this: Ecosystem, tiles: Iterable<number>): void {
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
        return t >= 0 && (this.road[t] === 1 || this.road[t] === 2 || this.road[t] === TRAIL);
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
  },
};
export type RoadsPart = typeof roadsPart;
