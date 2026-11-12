/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): o caminho a pé das pessoas com mente (people/mente.ts).
 *
 * Antes, cada passo escolhia o vizinho que mais encurtava a reta (`stepToward`): perto de um penhasco ou de uma
 * enseada a pessoa ficava indo e voltando no mesmo lugar, e parecia andar à toa. Aqui o caminho é um A* nos
 * tiles, numa janela em volta da origem e do destino, com o custo de andar de cada tile (rua barata, casa
 * evitada) e só pelos passos que o corpo consegue dar (`canStep`: sem água, sem subir penhasco). A pessoa
 * segue os pontos do caminho; sem caminho, volta à reta.
 */

import type { Ecosystem } from '../../ecosystem';
import { wrapDx } from '../../settlement';

/** Até quantos tiles além da origem e do destino a busca olha, e quantos tiles ela abre no máximo. */
const MARGIN = 10;
const MAX_OPEN = 5000;
/** Sem caminho na janela curta, tenta uma vez numa janela larga (a saída de um vale pode dar uma volta grande). */
const WIDE_MARGIN = 32;
const WIDE_MAX_OPEN = 20000;

/** Fila de prioridade mínima (heap binário) de tiles pelo custo estimado. */
class Heap {
  private readonly t: number[] = [];
  private readonly f: number[] = [];
  get size(): number {
    return this.t.length;
  }
  push(tile: number, cost: number): void {
    const t = this.t;
    const f = this.f;
    t.push(tile);
    f.push(cost);
    let k = t.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (f[p] <= f[k]) break;
      [t[p], t[k]] = [t[k], t[p]];
      [f[p], f[k]] = [f[k], f[p]];
      k = p;
    }
  }
  pop(): number {
    const t = this.t;
    const f = this.f;
    const top = t[0];
    const lt = t.pop()!;
    const lf = f.pop()!;
    if (t.length) {
      t[0] = lt;
      f[0] = lf;
      let k = 0;
      for (;;) {
        const a = 2 * k + 1;
        const b = a + 1;
        let m = k;
        if (a < t.length && f[a] < f[m]) m = a;
        if (b < t.length && f[b] < f[m]) m = b;
        if (m === k) break;
        [t[m], t[k]] = [t[k], t[m]];
        [f[m], f[k]] = [f[k], f[m]];
        k = m;
      }
    }
    return top;
  }
}

export const pathPart = {
  /**
   * Caminho a pé da pessoa `i` até o tile `goal`: a lista de tiles do primeiro passo ao destino (sem o tile
   * onde está). Se o destino não tem caminho na janela (na água, do outro lado de um rio), vai até o tile
   * alcançável mais perto dele; null se nem isso chega mais perto do que já está.
   */
  findPath(this: Ecosystem, i: number, goal: number): number[] | null {
    const p = this.searchPath(i, goal, MARGIN, MAX_OPEN);
    if (p && (!p.length || p[p.length - 1] === goal)) return p;
    return this.searchPath(i, goal, WIDE_MARGIN, WIDE_MAX_OPEN) ?? p;
  },

  /** O A* em si, numa janela de `margin` tiles em volta da origem e do destino, abrindo até `maxOpen` tiles. */
  searchPath(this: Ecosystem, i: number, goal: number, margin: number, maxOpen: number): number[] | null {
    const map = this.map;
    const w = map.width;
    const h = map.height;
    const s = this.kind[i];
    const start = this.tileOf(i);
    if (start === goal) return [];
    const sx = start % w;
    const sy = Math.floor(start / w);
    const gx = goal % w;
    const gy = Math.floor(goal / w);
    // Janela em coordenadas locais (o mapa dá a volta na horizontal): origem em (sx, sy).
    const gdx = wrapDx(gx - sx, w);
    const x0 = Math.min(0, gdx) - margin;
    const x1 = Math.max(0, gdx) + margin;
    const y0 = Math.max(0, Math.min(sy, gy) - margin);
    const y1 = Math.min(h - 1, Math.max(sy, gy) + margin);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const n = bw * bh;
    const cost = new Float32Array(n).fill(Infinity);
    const from = new Int32Array(n).fill(-1);
    const local = (lx: number, y: number) => (y - y0) * bw + (lx - x0);
    const tileOfLocal = (k: number) => {
      const lx = (k % bw) + x0;
      const y = Math.floor(k / bw) + y0;
      return y * w + ((((sx + lx) % w) + w) % w);
    };
    const heur = (lx: number, y: number) => Math.hypot(lx - gdx, y - gy) * 0.5;
    const open = new Heap();
    const k0 = local(0, sy);
    const kg = local(gdx, gy);
    cost[k0] = 0;
    open.push(k0, heur(0, sy));
    let opened = 0;
    // O tile alcançado mais perto do destino: quando o destino não dá pé (um posto de pesca na água, uma casa
    // cercada), o caminho vai até a beira mais perto dele.
    let near = k0;
    let nearD = heur(0, sy);
    while (open.size && opened++ < maxOpen) {
      const k = open.pop();
      if (k === kg) break;
      const lx = (k % bw) + x0;
      const y = Math.floor(k / bw) + y0;
      const d = heur(lx, y);
      if (d < nearD) {
        nearD = d;
        near = k;
      }
      const here = tileOfLocal(k);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = lx + ox;
          const ny = y + oy;
          if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
          const nk = local(nx, ny);
          const t = tileOfLocal(nk);
          if (!this.canStep(s, here, t)) continue;
          // Na diagonal, os dois lados também precisam dar passagem (não corta a quina de um penhasco).
          if (ox && oy && (!this.canStep(s, here, tileOfLocal(local(lx + ox, y))) || !this.canStep(s, here, tileOfLocal(local(lx, y + oy))))) continue;
          const c = cost[k] + (ox && oy ? Math.SQRT2 : 1) * this.walkCost(t);
          if (c >= cost[nk]) continue;
          cost[nk] = c;
          from[nk] = k;
          open.push(nk, c + heur(nx, ny));
        }
      }
    }
    const end = cost[kg] < Infinity ? kg : near;
    if (end === k0) return null;
    const out: number[] = [];
    for (let k = end; k !== k0 && k >= 0; k = from[k]) out.push(tileOfLocal(k));
    return out.reverse();
  },
};

export type PathPart = typeof pathPart;
