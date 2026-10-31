/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): jangadas de quem atravessa a água sozinho (seção 19.18).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { classify } from '../../../procgen/surface';
import { wrapDx } from '../../settlement';
import type { Raft } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isWater, isLand } = tilesModule;

export const raftsPart = {
  /**
   * Jangada (seção 19.18): quem está travado na beira da água com o destino
   * do outro lado corta RAFT_TREES árvores por perto (ou, sem elas, gasta
   * RAFT_WOOD de madeira do estoque) e atravessa até a margem mais perto do
   * destino, a até RAFT_RANGE tiles de água. Sem árvore nem madeira, ou sem
   * margem melhor ao alcance, desiste e continua contornando.
   */
  tryRaft(this: Ecosystem, i: number): boolean {
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
  },

  /** Jangadas: remam pela rota e, na outra margem, quem remava volta a andar (com a mesma identidade). */
  updateRafts(this: Ecosystem, dt: number): void {
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
  },
};
export type RaftsPart = typeof raftsPart;
