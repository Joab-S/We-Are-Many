/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): vegetação e matas que crescem, brotam e são replantadas.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import * as surfaceModule from '../../../procgen/surface';
import * as rolesModule from '../../roles';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores importados (eco/*, superfície, papéis...; o porquê está em ecosystem.ts).
const { classify, decorAt, isTree, temperatureAt, vegetationCap } = surfaceModule;
const { ROLE } = rolesModule;
const { isLand } = tilesModule;

export const growthPart = {
  growVegetation(this: Ecosystem, dt: number): void {
    const m = this.map;
    const n = m.width * m.height;
    const samples = Math.min(40000, Math.round(n * 0.04 * dt));
    for (let k = 0; k < samples; k++) {
      const i = Math.floor(this.floraRnd() * n);
      if (m.elevation[i] < 0) continue;
      const cap = vegetationCap(m, i);
      const ok = cap > 0;
      const x = i % m.width;
      const y = (i - x) / m.width;
      const nx = (x + Math.floor(this.floraRnd() * 3) - 1 + m.width) % m.width;
      const ny = y + Math.floor(this.floraRnd() * 3) - 1;
      const neighbour = ny >= 0 && ny < m.height ? m.vegetation[ny * m.width + nx] : 0;
      const before = m.vegetation[i];
      // Espalha a partir dos vizinhos; um tile pastado ainda rebrota devagar pelas raízes.
      const season = ok ? Math.max(0.2, 1 + B.HARVEST_SENSITIVITY * this.climate[this.region(x, y)]) : 1;
      // Nada passa do que o lugar aguenta; mato baixo rebrota rápido e mata fechada (acima de TREE_BAND) cresce devagar (seção 19.19).
      if (before > cap) m.vegetation[i] = Math.max(cap, before - 0.05);
      else if (ok && neighbour > 0.3) m.vegetation[i] = Math.min(cap, before + 0.05 * season * (before >= B.TREE_BAND ? B.TREE_SPREAD : 1));
      else if (ok && before > 0.02 && before < 0.35) m.vegetation[i] = Math.min(cap, before + 0.02 * season);
      // Toco e muda: o capim cresce em volta, mas a árvore só volta no tempo dela (growForests).
      if (m.felled?.[i] && m.vegetation[i] > B.FELLED_VEG_MAX) m.vegetation[i] = Math.max(Math.min(before, m.vegetation[i]), B.FELLED_VEG_MAX);
      if (m.vegetation[i] !== before) {
        m.biome[i] = classify(m, i);
        this.onTileChanged(i);
      }
    }
  },

  /** Alguma árvore adulta nos 8 vizinhos (as sementes caem perto). */
  treeNear(this: Ecosystem, t: number): boolean {
    const w = this.map.width;
    const x = t % w;
    const y = (t - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const n = this.tileAt(x + dx, y + dy);
        if (n >= 0 && !this.map.felled![n] && isTree(decorAt(this.map, n))) return true;
      }
    }
    return false;
  },

  /**
   * Uma vez por ano (seção 19.19): tocos brotam sozinhos perto da mata (clareira grande demora
   * muito), mudas crescem até virar árvore e o povo que maneja a mata planta nos tocos antigos.
   */
  growForests(this: Ecosystem): void {
    const map = this.map;
    const felled = map.felled!;
    const w = map.width;
    // Plantio nos tocos antigos: cada lenhador de um povo que maneja a mata planta algumas mudas.
    const planters = new Map<number, number>();
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.role[i] !== ROLE.woodcutter || this.village[i] < 0) continue;
      const v = this.villages[this.village[i]];
      if (v.forestry && !B.PRESENCE_WOOD) planters.set(v.id, (planters.get(v.id) ?? 0) + B.PLANT_RATE);
    }
    for (const t of this.stumps) {
      if (!felled[t] || !isLand(map, t) || this.road[t] || this.built[t]) {
        felled[t] = 0;
        this.stumps.delete(t);
        this.onTileChanged(t);
        continue;
      }
      const temp = temperatureAt(map, t);
      if (temp <= 262 || temp >= 320 || map.moisture[t] <= 0.25) continue;
      let state = felled[t];
      if (state !== 3 && planters.size) {
        const v = this.settlementNear(t % w + 0.5, Math.floor(t / w) + 0.5, B.WOOD_REACH);
        const n = v ? (planters.get(v.id) ?? 0) : 0;
        if (v && n >= 1) {
          planters.set(v.id, n - 1);
          felled[t] = state = 3;
          this.treesPlanted++;
          this.onTileChanged(t);
        }
      }
      if (state === 1) {
        if (this.floraRnd() < B.SPROUT_RATE * (this.treeNear(t) ? 1 : B.SPROUT_FAR)) {
          felled[t] = 2;
          this.onTileChanged(t);
        }
        continue;
      }
      const x = t % w;
      const climate = Math.max(0.2, 1 + B.HARVEST_SENSITIVITY * this.climate[this.region(x, (t - x) / w)]);
      this.treeGrow[t] += climate / (state === 3 ? B.REPLANT_YEARS : B.TREE_YEARS);
      if (this.treeGrow[t] < 1) continue;
      felled[t] = 0;
      this.stumps.delete(t);
      map.vegetation[t] = Math.max(map.vegetation[t], this.treeVeg[t]);
      map.biome[t] = classify(map, t);
      this.onTileChanged(t);
    }
  },

  /** Assentamento vivo cuja área de corte (até `reach` além da borda) cobre o ponto, o mais perto. */
  settlementNear(this: Ecosystem, x: number, y: number, reach: number): Village | null {
    let best: Village | null = null;
    let bd = Infinity;
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const d = this.distance(v, x, y);
      if (d < this.radius(v) + reach && d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  },
};
export type GrowthPart = typeof growthPart;
