/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): raio, moradia, planta, contorno, lugar livre e tamanho dos reinos.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { Biome, temperatureAt } from '../../../procgen/surface';
import { planItems, type PlanItem } from '../../plan';
import { spacingFor, waterGrade } from '../../community';
import { VOCATION_BUILDING } from '../../needs';
import { wrapDx } from '../../settlement';
import { buildingType } from '../../buildingTypes';
import type { BuildContext, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { BUILDINGS } = constantsModule;
const { canBuild } = helpersModule;
const { isWater, isLand, NEIGHBORS4 } = tilesModule;

export const layoutPart = {
  /**
   * Território (RF-AS-10): até onde o povo vai trabalhar (mata, caça, pasto e coleta), que cresce com a
   * gente. Não é a área construída: essa é a pegada (`footprint`), o contorno das casas.
   */
  radius(this: Ecosystem, v: Village): number {
    return Math.min(B.TERRITORY_MAX, B.TERRITORY_BASE + B.TERRITORY_GROWTH * Math.sqrt(Math.max(4, v.population)));
  },

  /** Quantas pessoas as casas do assentamento abrigam. */
  housing(this: Ecosystem, v: Village, planned = false): number {
    const era = Math.floor(v.tech);
    // A gente do campo conta pelas roças que o lugar comporta (uma a cada duas casas, ou quatro na Pedra),
    // mesmo quando só se planta o que os agricultores dão conta.
    const homes = v.houses.filter((h) => h.kind === 'house').length;
    const farms = v.fields > 0 || v.tech >= 0.12 ? Math.max(v.fields, Math.floor(homes / (era >= 1 ? 2 : 4))) : v.fields;
    let n = 4 + farms * 2;
    // Quanto cada construção abriga vem do tipo dela (`BUILDING_TYPES`): casa pela era e pelos andares, porto nada, as outras dois.
    for (const h of v.houses) if (planned || !h.site) n += buildingType(h.kind).housing(era, h.level ?? 0, !!h.empty);
    return n;
  },

  /** Andares a mais que uma casa pode ter (sobrado em vilas e cidades com siderurgia/Ferro; mais um na cidade com aço/Medieval). */
  maxLevel(this: Ecosystem, v: Village): number {
    const era = Math.floor(v.tech);
    if (this.scale(v) >= 2 && (era >= 3 || this.knew(v, 'aco'))) return 2;
    if (this.scale(v) >= 1 && (era >= 2 || this.knew(v, 'siderurgia'))) return 1;
    return 0;
  },

  /** Estrutura de referência do assentamento no nível e era atuais (RF-VIDA-200). */
  plan(this: Ecosystem, v: Village): PlanItem[] {
    const era = Math.floor(v.tech);
    const built = new Set<string>(v.houses.map((h) => h.kind));
    const ctx = this.buildContext(v);
    return planItems({
      tier: this.scale(v),
      tech: v.tech,
      population: v.population,
      housing: this.housing(v),
      homes: v.houses.filter((h) => h.kind === 'house').length,
      fields: v.fields,
      food: v.food,
      port: v.port >= 0,
      coastal: v.port >= 0 || this.coastal(v),
      built,
      buildable: BUILDINGS.filter((b) => canBuild(b, ctx)),
      vocationBuilding: v.vocation ? VOCATION_BUILDING[v.vocation] : undefined,
      era,
    });
  },

  buildContext(this: Ecosystem, v: Village): BuildContext {
    const st = this.store(v);
    return {
      era: Math.floor(v.tech),
      tier: this.scale(v),
      metal: st.copper + st.tin + st.iron > 0,
      culture: v.culture,
      capital: v.kingdom === v.id,
      vocation: v.vocation,
      herd: v.herd && v.herd.head > 0 ? v.herd.kind : undefined,
      clay: v.wet ?? false,
      forest: v.forest,
      techs: this.knows(v),
    };
  },

  /** Tem mar (não lago) a até o raio da área: dá para ter porto. */
  coastal(this: Ecosystem, v: Village): boolean {
    const r = Math.ceil(this.radius(v));
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        const t = this.tileAt(v.x + dx, Math.floor(v.y) + dy);
        if (t >= 0 && isWater(this.map, t) && dx * dx + dy * dy <= r * r) return true;
      }
    }
    return false;
  },

  /** Assentamento cuja pegada contém o ponto, se houver (RF-AS-10). */
  settlementAt(this: Ecosystem, x: number, y: number): Village | null {
    for (const v of this.villages) if (!v.abandoned && this.distance(v, x, y) < this.footprint(v) + 1) return v;
    return null;
  },

  /**
   * Contorno real do assentamento em 64 direções: envolve a praça, todas as
   * casas, construções especiais, porto, plantações (roças), currais (pastos)
   * e ruas internas, fechando os vãos entre vizinhos sem inventar área vazia.
   */
  villageContour(this: Ecosystem, v: Village): Float32Array {
    const key =
      v.houses.length * 131071 +
      v.fields * 8191 +
      (v.pens?.length ?? 0) * 521 +
      (v.streetLen ?? 0) * 31 +
      Math.floor(this.year) * 7 +
      this.mapVersionKey;
    const hit = this.contours.get(v);
    if (hit && hit.key === key) return hit.radii;

    const N = 64;
    const mw = this.map.width;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const base = this.radius(v);
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < base * 2 + this.radius(o) + 8);
    const disks: { dx: number; dy: number; d2: number; pad: number }[] = [];
    const addDisk = (x: number, y: number, pad: number) => {
      const dx = wrapDx(x - v.x, mw);
      const dy = y - v.y;
      disks.push({ dx, dy, d2: dx * dx + dy * dy, pad });
    };
    // Praça central (3x3).
    addDisk(cx + 0.5, cy + 0.5, 3.0);
    // Casas, construções especiais e porto.
    for (const h of v.houses) {
      const s = h.kind === 'port' ? 1 : 2;
      addDisk(h.x + s * 0.5, h.y + s * 0.5, s === 1 ? 2.1 : 2.8);
    }
    // Currais (pastos 2x2).
    for (const p of v.pens ?? []) addDisk(p.x + 1, p.y + 1, 2.8);
    // Plantações (roças, road === 4) e ruas internas coladas em construções/roças/praça.
    // Até a casa mais longe (sítios rurais ficam além do território), para as roças dela entrarem no contorno.
    const scanR = Math.ceil(Math.max(base, this.houseReach(v))) + 4;
    for (let dy = -scanR; dy <= scanR; dy++) {
      for (let dx = -scanR; dx <= scanR; dx++) {
        if (dx * dx + dy * dy > scanR * scanR) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0) continue;
        const rk = this.road[t];
        if (rk !== 4 && rk !== 5 && !(rk >= 1 && rk <= 2 && dx * dx + dy * dy <= base * base)) continue;
        const tx = cx + dx + 0.5;
        const ty = cy + dy + 0.5;
        const dv = this.distance(v, tx, ty);
        if (near.some((o) => this.distance(o, tx, ty) < dv)) continue;
        if (rk === 4 || rk === 5) {
          addDisk(tx, ty, 2.2);
        } else {
          // Rua interna: só conta quando ladeia casa, roça, pasto ou praça (ignora estrada para outra vila).
          let urban = false;
          for (let oy = -2; oy <= 2 && !urban; oy++) {
            for (let ox = -2; ox <= 2 && !urban; ox++) {
              const u = this.tileAt(cx + dx + ox, cy + dy + oy);
              if (u >= 0 && (this.built[u] || this.road[u] >= 3)) urban = true;
            }
          }
          if (urban) addDisk(tx, ty, 1.8);
        }
      }
    }

    const strict = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      let s = 2.8;
      for (let j = 0; j < disks.length; j++) {
        const c = disks[j];
        const proj = c.dx * ux + c.dy * uy;
        if (proj < -c.pad) continue;
        const perp2 = c.d2 - proj * proj;
        if (perp2 < c.pad * c.pad) {
          const hitR = proj + Math.sqrt(c.pad * c.pad - perp2);
          if (hitR > s) s = hitR;
        }
      }
      strict[k] = s;
    }

    // Fechamento angular curto: une lotes próximos da mesma vila sem criar barriga onde não há nada.
    const dilated = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      let m = strict[k];
      for (let d = -3; d <= 3; d++) {
        const v0 = strict[(k + d + N) & 63] * Math.cos((d * Math.PI * 2) / N);
        if (v0 > m) m = v0;
      }
      dilated[k] = m;
    }
    const radii = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      let m = dilated[k];
      for (let d = -2; d <= 2; d++) {
        const v0 = dilated[(k + d + N) & 63];
        if (v0 < m) m = v0;
      }
      radii[k] = Math.max(strict[k], m);
    }
    const tmp = new Float32Array(N);
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < N; k++) {
        tmp[k] = Math.max(strict[k], 0.25 * radii[(k + N - 1) & 63] + 0.5 * radii[k] + 0.25 * radii[(k + 1) & 63]);
      }
      radii.set(tmp);
    }
    // Fronteira com assentamentos vizinhos, sem cortar construções ou plantações próprias.
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      let r = radii[k];
      for (const o of near) {
        const dx = wrapDx(o.x - v.x, mw);
        const dy = o.y - v.y;
        const d2 = dx * dx + dy * dy;
        const proj = ux * dx + uy * dy;
        if (proj <= 0.01) continue;
        r = Math.min(r, Math.max(strict[k] - 0.2, d2 / (2 * proj) - 0.3));
      }
      radii[k] = r;
    }
    this.contours.set(v, { key, radii });
    return radii;
  },

  /** Distância do centro até a casa mais longe (o sítio rural pode ficar além do território). */
  houseReach(this: Ecosystem, v: Village): number {
    let far = 0;
    for (const h of v.houses) far = Math.max(far, this.distance(v, h.x + 1, h.y + 1));
    return far;
  },

  /** Assentamento cujo contorno real contém o ponto (x, y), se houver. */
  villageAt(this: Ecosystem, x: number, y: number): Village | null {
    const mw = this.map.width;
    let best: Village | null = null;
    let bestScore = Infinity;
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const dx = wrapDx(x - v.x, mw);
      const dy = y - v.y;
      const d = Math.hypot(dx, dy);
      if (d > Math.max(this.radius(v), this.houseReach(v)) + 7) continue;
      for (const h of v.houses) {
        const s = h.kind === 'port' ? 1 : 2;
        if (Math.abs(wrapDx(x - (h.x + s * 0.5), mw)) <= s * 0.5 && Math.abs(y - (h.y + s * 0.5)) <= s * 0.5) return v;
      }
      for (const p of v.pens ?? []) {
        if (Math.abs(wrapDx(x - (p.x + 1), mw)) <= 1 && Math.abs(y - (p.y + 1)) <= 1) return v;
      }
      const r = this.villageContour(v);
      const a = (((Math.atan2(dy, dx) / (Math.PI * 2)) % 1) + 1) % 1;
      const idx = a * r.length;
      const k0 = Math.floor(idx) & 63;
      const k1 = (k0 + 1) & 63;
      const t = idx - Math.floor(idx);
      if (d <= r[k0] * (1 - t) + r[k1] * t && d < bestScore) {
        best = v;
        bestScore = d;
      }
    }
    return best;
  },

  /**
   * Um assentamento novo não pode nascer dentro (nem encostado) da área de outro, e guarda a
   * distância da hierarquia (RF-AS-05): 14 tiles de uma aldeia, 22 de uma vila, 30 de uma cidade.
   */
  canFound(this: Ecosystem, x: number, y: number): boolean {
    return this.villages.every((v) => v.abandoned || this.distance(v, x + 0.5, y + 0.5) >= Math.max(spacingFor(v.tier), this.footprint(v) + B.FOOTPRINT_MIN));
  },

  /** Tile plano o bastante para uma casa: nenhum vizinho com desnível acima de SITE_MAX_SLOPE. */
  flat(this: Ecosystem, t: number): boolean {
    const w = this.map.width;
    const x = t % w;
    const y = (t - x) / w;
    const e = this.map.elevation[t];
    for (const [ox, oy] of NEIGHBORS4) {
      const n = this.tileAt(x + ox, y + oy);
      if (n >= 0 && isLand(this.map, n) && Math.abs(this.map.elevation[n] - e) > B.SITE_MAX_SLOPE) return false;
    }
    return true;
  },

  /**
   * Filtro rápido de um lugar novo, igual em todas as entradas de fundação (onda 3): o centro é habitável, está
   * na faixa de temperatura da espécie (com folga de SITE_TEMP_MARGIN K), tem verde (SITE_CENTER_GREEN; com poço
   * sobre água no subsolo, ou numa praça ou rua antiga, não precisa) e respeita o espaçamento (`canFound`).
   * Devolve o porquê ou null. Não lê a área em volta: isso é `siteProblem`, mais caro, só para os melhores.
   */
  siteQuick(this: Ecosystem, s: number, x: number, y: number, tech = 0): string | null {
    const map = this.map;
    const center = this.tileAt(Math.floor(x), Math.floor(y));
    if (center < 0 || !isLand(map, center) || !this.habitable(s, center)) return 'o lugar não é habitável para eles';
    const sp = this.species[s];
    const temp = temperatureAt(map, center);
    if (temp < sp.tempMin - B.SITE_TEMP_MARGIN || temp > sp.tempMax + B.SITE_TEMP_MARGIN) return temp < sp.tempMin ? 'é frio demais para eles' : 'é quente demais para eles';
    if (!this.road[center] && map.vegetation[center] < this.minFertility(tech, center)) return 'o chão é pelado: nada verde onde as casas ficariam';
    if (!this.canFound(Math.floor(x), Math.floor(y))) return 'é perto demais de outro assentamento';
    return null;
  },

  /** Por que o lugar não serve para fundar (filtro rápido e exame da área), ou null: o veto único das entradas de fundação. */
  siteFilter(this: Ecosystem, s: number, x: number, y: number, tech = 0): string | null {
    return this.siteQuick(s, x, y, tech) ?? this.siteProblem(s, x, y, tech);
  },

  /**
   * Por que o lugar (x, y) não serve para a espécie `s` fundar um
   * assentamento, ou null se serve (seção 19.18). Antes de se estabelecer, o
   * povo olha a área em volta (SITE_RADIUS): nada de lava ou chão em brasa
   * por perto (pegaria fogo nas redondezas), área plana e firme suficiente
   * para as casas, sem penhasco cortando a área, água doce a uma caminhada
   * (lago; nascente no solo encharcado; da Idade do Ferro em diante, poço
   * sobre água no subsolo; o mar é salgado e não conta, onda 3) e comida
   * (vegetação para coletar, caçar e plantar; com água para pescar na área
   * ou poço para irrigar, basta a metade).
   */
  siteProblem(this: Ecosystem, s: number, x: number, y: number, tech = 0): string | null {
    const map = this.map;
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const center = this.tileAt(cx, cy);
    if (center < 0 || !isLand(map, center) || !this.habitable(s, center)) return 'o lugar não é habitável para eles';
    const sp = this.species[s];
    const bodies = this.waterBodies();
    const R = B.SITE_RADIUS;
    let total = 0;
    let land = 0;
    let good = 0;
    let veg = 0;
    let lo = Infinity;
    let hi = -Infinity;
    // Lago mais perto (tiles) e água na área (pesca, mar ou lago).
    let lake = Infinity;
    let fish = false;
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0) continue;
        total++;
        if (map.biome[t] === Biome.Lava) return 'tem lava ali: o fogo pegaria nas casas e na mata em volta';
        if (isWater(map, t)) {
          fish = true;
          if (bodies[t] === 1) lake = Math.min(lake, Math.hypot(dx, dy));
          continue;
        }
        land++;
        const e = map.elevation[t];
        lo = Math.min(lo, e);
        hi = Math.max(hi, e);
        veg += map.vegetation[t];
        const temp = temperatureAt(map, t);
        if (temp >= sp.tempMin - 5 && temp <= sp.tempMax + 5 && e < 0.62 && this.flat(t)) good++;
      }
    }
    if (hi - lo > B.SITE_MAX_RELIEF || !this.flat(center)) return 'o terreno é íngreme demais: um penhasco cortaria o assentamento';
    if (land < total * 0.3 || good < land * B.SITE_MIN_AREA) return 'falta área plana e firme para as casas';
    // Lava ou chão em brasa um pouco mais longe também espanta (o fogo chega).
    const L = B.SITE_LAVA_RANGE;
    const W = B.SITE_WATER_RANGE;
    for (let dy = -Math.max(L, W); dy <= Math.max(L, W); dy += 1) {
      for (let dx = -Math.max(L, W); dx <= Math.max(L, W); dx += 1) {
        const d2 = dx * dx + dy * dy;
        if (d2 <= R * R) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0) continue;
        if (d2 <= L * L && (map.biome[t] === Biome.Lava || temperatureAt(map, t) > 500)) return 'tem lava por perto: o fogo pegaria nas redondezas';
        if (d2 <= W * W && d2 < lake * lake && bodies[t] === 1 && isWater(map, t)) lake = Math.sqrt(d2);
      }
    }
    const moist = map.moisture[center];
    if (waterGrade(lake, moist, tech >= 2) <= 0) return 'não há água doce por perto: o mar é salgado e o solo é seco demais para nascentes ou poço';
    const well = tech >= 2 && moist >= B.SITE_WELL_MOISTURE;
    const food = veg / Math.max(1, land);
    if (food < B.SITE_MIN_FOOD * (fish || well ? 0.5 : 1)) return 'não há comida por perto: quase nada verde para coletar, caçar ou plantar';
    return null;
  },

  /** O lugar serve para fundar: o filtro rápido (clima, verde no centro, espaçamento) e o exame da área (seção 19.18, onda 3). */
  canSettle(this: Ecosystem, s: number, x: number, y: number, tech = 0): boolean {
    return this.siteFilter(s, x, y, tech) === null;
  },

  /** Capital do reino do assentamento. */
  capitalOf(this: Ecosystem, v: Village): Village {
    return this.villages[v.kingdom];
  },

  /** Moradores de todos os assentamentos ativos do reino cuja capital é `v`. */
  kingdomPopulation(this: Ecosystem, v: Village): number {
    let n = 0;
    for (const o of this.villages) if (!o.abandoned && o.kingdom === v.id) n += o.population;
    return n;
  },

  /** Quantos assentamentos ativos pertencem ao reino cuja capital é `v`. */
  kingdomSize(this: Ecosystem, v: Village): number {
    let n = 0;
    for (const o of this.villages) if (!o.abandoned && o.kingdom === v.id) n++;
    return n;
  },
};
export type LayoutPart = typeof layoutPart;
