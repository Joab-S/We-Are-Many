/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): vocação dos assentamentos (RF-VIDA-220).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { Biome, isForestBiome, temperatureAt } from '../../../procgen/surface';
import { pickVocation, VOCATION_LEAVE, VOCATION_TAKE, vocationWeights, type SiteSample } from '../../needs';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isLand } = tilesModule;

export const vocationPart = {
  /** Vocação que muda devagar quando a base acaba (RF-VIDA-222). */
  updateVocation(this: Ecosystem, v: Village): void {
    const voc = v.vocation;
    if (!voc) return;
    let bad = false;
    switch (voc) {
      case 'agricola':
        bad = v.tech >= 0.5 && (this.harvest(v) < 0.75 || (v.soil ?? 1) < B.SOIL_FALLOW);
        break;
      case 'gado':
      case 'ovelhas':
      case 'cavalos':
        bad = v.tech >= 1.2 && (!v.herd || v.herd.head < 2);
        break;
      case 'pesqueira':
        bad = v.tech >= 0.8 && v.port < 0;
        break;
      case 'mercantil':
        bad = !this.villages.some((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < B.HAUL_RANGE);
        break;
      case 'mineira':
        bad = v.tech >= 0.6 && !v.mines.length;
        break;
      case 'madeireira':
        bad = v.forest < 0.15;
        break;
    }
    v.badYears = bad ? (v.badYears ?? 0) + 1 : Math.max(0, (v.badYears ?? 0) - 2);
    if ((v.badYears ?? 0) < B.VOCATION_CHANGE_YEARS) return;
    const next = pickVocation(vocationWeights(this.siteSample(v)), this.civRnd(), voc);
    v.vocation = next;
    v.badYears = 0;
    this.note(`${v.name} deixou ${VOCATION_LEAVE[voc]} e passou a ${VOCATION_TAKE[next]}`, 'economia', v);
  },

  /** Amostra do lugar em volta do assentamento para a vocação (RF-VIDA-220). */
  siteSample(this: Ecosystem, v: Village): SiteSample {
    const r = this.radius(v) + 6;
    let fertile = 0;
    let open = 0;
    let hills = 0;
    let cold = 0;
    let dry = 0;
    let forest = 0;
    let n = 0;
    for (let k = 0; k < 40; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = Math.sqrt(this.civRnd()) * r;
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0 || !isLand(this.map, t)) continue;
      n++;
      const b = this.map.biome[t] as Biome;
      const veg = this.map.vegetation[t];
      const m = this.map.moisture[t];
      fertile += Math.min(1, veg * 1.4) * Math.min(1, m * 1.6);
      if (b === Biome.Grass || b === Biome.Savanna || b === Biome.Tundra) open++;
      if (this.map.elevation[t] > 0.3 || b === Biome.Rock || b === Biome.Mountain) hills++;
      if (temperatureAt(this.map, t) < B.COLD_K) cold++;
      if (m < 0.35) dry++;
      if (isForestBiome(b) || veg > 0.6) forest++;
    }
    n = Math.max(1, n);
    let deposits = 0;
    for (const d of this.deposits) if (d.amount > 0 && this.distance(v, d.x + 0.5, d.y + 0.5) < r + 12) deposits++;
    let roads = 0;
    for (const o of this.villages) if (o !== v && !o.abandoned && this.distance(o, v.x, v.y) < 40) roads++;
    return { fertile: fertile / n, open: open / n, hills: hills / n, cold: cold / n, dry: dry / n, forest: forest / n, coast: this.coastal(v), deposits, roads, value: v.culture.value };
  },

  /** Sorteia a vocação de um assentamento novo; colônias tendem a herdar a da origem. */
  chooseVocation(this: Ecosystem, v: Village, from?: Village): void {
    if (from?.vocation && this.civRnd() < B.VOCATION_INHERIT) v.vocation = from.vocation;
    else v.vocation = pickVocation(vocationWeights(this.siteSample(v)), this.civRnd());
  },
};
export type VocationPart = typeof vocationPart;
