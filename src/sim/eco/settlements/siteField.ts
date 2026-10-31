/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): onde assentar (RF-AS-04). O campo de notas dos sítios
 * (mapa de influência na grade das células ecológicas, ECO_CELL×ECO_CELL tiles), a captação no alcance real de
 * quem vai morar no lugar, a presença dos lugares vivos e a escolha do lugar de fundação que todas as entradas
 * usam: melhor de N, com o exame da área (`siteProblem`) só para os melhores.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { ECO_CELL } from '../../fauna';
import { isRockyBiome, type Biome } from '../../../procgen/surface';
import { lensArea, siteDecay, siteValue, waterGrade, type ColonyMotive, type SiteLook } from '../../community';
import { wrapDx } from '../../settlement';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* e de balance (o porquê está em ecosystem.ts): os laços das células são quentes.
const { isWater, isLand, NEIGHBORS4 } = tilesModule;
const C = ECO_CELL;
const { SITE_CENTER_GREEN, SITE_SEA_SIZE, SITE_WOOD_FULL, SITE_ROCK_FULL, SITE_FISH_FOOD, SITE_DIRTY_PER_STEP } = B;

/** Camadas brutas de cada célula (fração da área amostrada, de 0 a 1; `wet` é a umidade média da terra). */
export const SITE_LAYER = { food: 0, wood: 1, rock: 2, fresh: 3, sea: 4, land: 5, flat: 6, wet: 7 } as const;
const L = 8;
const { food: LF, wood: LW, rock: LR, fresh: LH, sea: LS, land: LL, flat: LP, wet: LM } = SITE_LAYER;
/** Dirty Flag de uma célula: o terreno mudou (refaz as camadas) ou a presença mudou (refaz só a nota). */
const DIRTY_RAW = 1;
const DIRTY_SCORE = 2;
/** Células em volta que a nota de uma célula lê (a captação da Pedra cabe em ±2 células). */
const SPAN = 2;

/** Fila da busca dos corpos d'água (rascunho do módulo, reaproveitado). */
let floodQueue = new Int32Array(0);
/** Um lugar novo, para o raio de captação de quem ainda vai fundar: o território que terá com SITE_CATCH_POP moradores. */
const NEW_PLACE = { population: B.SITE_CATCH_POP } as Village;

/**
 * Campo de notas dos sítios (mapa de influência, RF-AS-04): dados puros, sem métodos (vai no save por reflexão e
 * volta igual do clone estrutural). As contas ficam em `siteFieldPart`.
 */
export class SiteField {
  readonly cols: number;
  readonly rows: number;
  readonly n: number;
  /**
   * Double Buffer: `raw` é a última volta completa, que as consultas e as notas leem; `rawNext` é a volta em curso,
   * escrita aos poucos. Na virada da volta os dois trocam. Assim a nota de uma célula nunca mistura vizinhas de
   * voltas diferentes.
   */
  raw: Float32Array;
  rawNext: Float32Array;
  /** Tile mais promissor de cada célula (plano, verde, úmido, perto do meio) para começar a busca; -1 sem terra. Troca com `raw`. */
  anchor: Int32Array;
  anchorNext: Int32Array;
  /** Nota de cada célula para um fundador genérico da Idade da Pedra, já descontada a presença dos lugares vivos. */
  readonly score: Float32Array;
  /** Corpo d'água de cada tile: 0 terra, 1 lago (água doce), 2 mar (SITE_SEA_SIZE tiles ou mais). */
  readonly water: Uint8Array;
  /** A água do mapa mudou desde o último rótulo dos corpos d'água (refeito na próxima consulta ou passo). */
  waterDirty = true;
  /** Dirty Flag por célula (DIRTY_RAW, DIRTY_SCORE) e a fila das sujas, na ordem em que sujaram. */
  readonly dirty: Uint8Array;
  readonly queue: number[] = [];
  /** Próxima célula da volta e voltas completas. */
  cursor = 0;
  passes = 0;

  constructor(width: number, height: number) {
    this.cols = Math.ceil(width / C);
    this.rows = Math.ceil(height / C);
    this.n = this.cols * this.rows;
    this.raw = new Float32Array(this.n * L);
    this.rawNext = new Float32Array(this.n * L);
    this.anchor = new Int32Array(this.n).fill(-1);
    this.anchorNext = new Int32Array(this.n).fill(-1);
    this.score = new Float32Array(this.n);
    this.water = new Uint8Array(width * height);
    this.dirty = new Uint8Array(this.n);
  }
}

/** Recursos de uma captação: médias com decaimento, por área (a água conta zero na comida da terra). */
export interface Catchment {
  food: number;
  wood: number;
  rock: number;
  /** Água (mar ou lago) no alcance da comida: dá peixe. */
  water: number;
}

/** Recurso da captação de que se quer o raio. */
export type CatchKind = 'food' | 'wood' | 'stone';

export const siteFieldPart = {
  /**
   * Raio de captação (tiles) de um lugar ou de quem vai fundar com a técnica `of`: o território mais o alcance da
   * coleta, do corte ou da pedreira, como no trabalho (`reachOf`). É o ponto único do modo de vida: hoje a era faz
   * as vezes dele (coletores da Pedra vão mais longe atrás de comida); quando houver `Village.lifeway` (frente 3C),
   * o raio lê o modo de vida aqui.
   */
  catchRadius(this: Ecosystem, of: Village | number, kind: CatchKind = 'food'): number {
    const v = typeof of === 'number' ? null : of;
    const era = Math.max(0, Math.floor(v ? v.tech : (of as number)));
    const core = this.radius(v ?? NEW_PLACE);
    if (kind === 'food') return core + B.GATHER_REACH * B.SITE_LIFEWAY_GATHER[Math.min(era, B.SITE_LIFEWAY_GATHER.length - 1)];
    return core + (kind === 'wood' ? B.WOOD_REACH : B.STONE_REACH) * (1 + B.REACH_PER_ERA * era);
  },

  /** Campo de notas, pronto para uso: criado e preenchido por inteiro na primeira consulta. */
  siteField(this: Ecosystem): SiteField {
    let f = this.sites;
    if (f && f.n === Math.ceil(this.map.width / C) * Math.ceil(this.map.height / C)) return f;
    f = this.sites = new SiteField(this.map.width, this.map.height);
    this.labelWater(f);
    for (let k = 0; k < f.n; k++) this.refreshSiteCell(f, k, true);
    for (let k = 0; k < f.n; k++) this.scoreSiteCell(f, k);
    return f;
  },

  /**
   * Os rótulos dos corpos d'água discordam do mapa no retângulo (terra que virou água ou o contrário)? Só então
   * vale refazê-los (a busca no mapa inteiro custa caro, e quase todo terreno mudado não mexe na água).
   */
  waterChanged(this: Ecosystem, f: SiteField, x0: number, y0: number, x1: number, y1: number): boolean {
    const map = this.map;
    const w = map.width;
    const water = f.water;
    for (let y = Math.max(0, y0); y <= Math.min(map.height - 1, y1); y++) {
      for (let x = x0; x <= x1; x++) {
        const t = y * w + (((x % w) + w) % w);
        if (isWater(map, t) !== water[t] > 0) return true;
      }
    }
    return false;
  },

  /** Corpo d'água de cada tile (0 terra, 1 lago, 2 mar), com o rótulo em dia. */
  waterBodies(this: Ecosystem): Uint8Array {
    const f = this.siteField();
    if (f.waterDirty) this.labelWater(f);
    return f.water;
  },

  /** Rotula os corpos d'água do mapa inteiro: o que tem SITE_SEA_SIZE tiles ou mais é mar, o resto é lago. */
  labelWater(this: Ecosystem, f: SiteField): void {
    const map = this.map;
    const w = map.width;
    const h = map.height;
    const n = w * h;
    const out = f.water;
    out.fill(0);
    if (floodQueue.length < n) floodQueue = new Int32Array(n);
    const q = floodQueue;
    for (let s = 0; s < n; s++) {
      if (out[s] || !isWater(map, s)) continue;
      // Marca provisória 1 enquanto anda; no fim, o corpo inteiro vira lago ou mar.
      let head = 0;
      let tail = 0;
      q[tail++] = s;
      out[s] = 1;
      while (head < tail) {
        const t = q[head++];
        const x = t % w;
        const y = (t - x) / w;
        for (let k = 0; k < 4; k++) {
          const ny = y + NEIGHBORS4[k][1];
          if (ny < 0 || ny >= h) continue;
          const nt = ny * w + ((x + NEIGHBORS4[k][0] + w) % w);
          if (out[nt] || !isWater(map, nt)) continue;
          out[nt] = 1;
          q[tail++] = nt;
        }
      }
      if (tail >= SITE_SEA_SIZE) for (let k = 0; k < tail; k++) out[q[k]] = 2;
    }
    f.waterDirty = false;
  },

  /**
   * Refaz as camadas brutas de uma célula, numa amostra de um tile a cada dois em cada eixo (o deslocamento muda a
   * cada volta, então em quatro voltas todos contam). Escreve na volta em curso (`rawNext`); com `both`, também na
   * completa (`raw`), para a criação do campo e para o terreno que mudou de repente (Dirty Flag).
   */
  refreshSiteCell(this: Ecosystem, f: SiteField, k: number, both: boolean): void {
    // Mar aberto continua mar aberto (o terreno que muda suja a célula e vem com `both`).
    if (!both && f.raw[k * L + LL] === 0 && f.raw[k * L + LH] === 0) {
      f.rawNext.set(f.raw.subarray(k * L, k * L + L), k * L);
      f.anchorNext[k] = f.anchor[k];
      return;
    }
    const map = this.map;
    const w = map.width;
    const water = f.water;
    const x0 = (k % f.cols) * C;
    const y0 = Math.floor(k / f.cols) * C;
    const turn = (f.passes + k) & 3;
    const cx = x0 + C / 2;
    const cy = y0 + C / 2;
    let total = 0;
    let land = 0;
    let food = 0;
    let wood = 0;
    let rock = 0;
    let fresh = 0;
    let sea = 0;
    let level = 0;
    let wet = 0;
    let anchor = -1;
    let best = -Infinity;
    for (let y = y0 + (turn & 1); y < Math.min(map.height, y0 + C); y += 2) {
      for (let x = x0 + (turn >> 1); x < Math.min(w, x0 + C); x += 2) {
        const t = y * w + x;
        total++;
        if (isWater(map, t)) {
          if (water[t] === 1) fresh++;
          else sea++;
          continue;
        }
        if (!isLand(map, t)) continue;
        land++;
        const veg = map.vegetation[t];
        const m = map.moisture[t];
        food += veg;
        wet += m;
        if (this.standingTree(t)) wood++;
        if (isRockyBiome(map.biome[t] as Biome)) rock++;
        if (!this.flat(t)) continue;
        level++;
        // Âncora: o tile plano mais verde e úmido, perto do meio da célula e de água (a 3 tiles, nos quatro rumos).
        let q = (veg >= SITE_CENTER_GREEN ? 1 : 0) + veg + 0.3 * m - 0.004 * ((x - cx) * (x - cx) + (y - cy) * (y - cy));
        for (let d = 0; d < 4; d++) {
          const u = this.tileAt(x + 3 * NEIGHBORS4[d][0], y + 3 * NEIGHBORS4[d][1]);
          if (u >= 0 && isWater(map, u)) {
            q += 0.5;
            break;
          }
        }
        if (q > best) {
          best = q;
          anchor = t;
        }
      }
    }
    const inv = total ? 1 / total : 0;
    const put = (a: Float32Array) => {
      const b = k * L;
      a[b + LF] = food * inv;
      a[b + LW] = wood * inv;
      a[b + LR] = rock * inv;
      a[b + LH] = fresh * inv;
      a[b + LS] = sea * inv;
      a[b + LL] = land * inv;
      a[b + LP] = level * inv;
      a[b + LM] = land ? wet / land : 0;
    };
    put(f.rawNext);
    f.anchorNext[k] = anchor;
    if (both) {
      put(f.raw);
      f.anchor[k] = anchor;
    }
  },

  /**
   * Recursos da captação em volta de (x, y), pela volta completa do campo: médias por área com decaimento
   * (`siteDecay`), cada recurso no seu raio (comida, mata e pedra). Lê só células, não tiles.
   */
  catchmentAt(this: Ecosystem, x: number, y: number, rFood: number, rWood: number, rStone: number): Catchment {
    const f = this.siteField();
    const raw = f.raw;
    const w = this.map.width;
    const h = this.map.height;
    const span = Math.ceil(Math.max(rFood, rWood, rStone) / C) + 1;
    const ccx = Math.floor((((x % w) + w) % w) / C);
    const ccy = Math.floor(y / C);
    let wf = 0;
    let ww = 0;
    let wr = 0;
    let food = 0;
    let wood = 0;
    let rock = 0;
    let wet = 0;
    for (let oy = -span; oy <= span; oy++) {
      const cy = ccy + oy;
      if (cy < 0 || cy >= f.rows) continue;
      const my = Math.min(h, cy * C + C) - cy * C;
      const dy = cy * C + my / 2 - y;
      for (let ox = -span; ox <= span; ox++) {
        const cx = (((ccx + ox) % f.cols) + f.cols) % f.cols;
        const d = Math.hypot(wrapDx(cx * C + C / 2 - x, w), dy);
        const b = (cy * f.cols + cx) * L;
        const decay = siteDecay(d);
        // Parte da célula dentro do disco, aproximada pela distância ao centro dela.
        const a = decay * Math.max(0, Math.min(1, (rFood - d) / C + 0.5));
        if (a > 0) {
          wf += a;
          food += a * raw[b + LF];
          wet += a * (raw[b + LH] + raw[b + LS]);
        }
        const bw = decay * Math.max(0, Math.min(1, (rWood - d) / C + 0.5));
        if (bw > 0) {
          ww += bw;
          wood += bw * raw[b + LW];
        }
        const br = decay * Math.max(0, Math.min(1, (rStone - d) / C + 0.5));
        if (br > 0) {
          wr += br;
          rock += br * raw[b + LR];
        }
      }
    }
    return { food: wf ? food / wf : 0, wood: ww ? wood / ww : 0, rock: wr ? rock / wr : 0, water: wf ? wet / wf : 0 };
  },

  /**
   * Presença dos lugares vivos na captação de raio `r` em volta de (x, y): a parte dela que cai na captação de
   * algum (sobreposição, até 1) e quanta gente já a explora (moradores de cada um na parte da área dele que cai
   * nela, para a distribuição livre ideal). `skip` não conta (o próprio lugar, ao se reavaliar).
   */
  sitePresence(this: Ecosystem, x: number, y: number, r: number, skip?: Village): { overlap: number; crowd: number } {
    const area = Math.PI * r * r;
    let overlap = 0;
    let crowd = 0;
    for (const o of this.villages) {
      if (o.abandoned || o === skip || o.population <= 0) continue;
      const ro = this.catchRadius(o, 'food');
      const d = this.distance(o, x, y);
      if (d >= r + ro) continue;
      const lens = lensArea(r, ro, d);
      overlap += lens / area;
      crowd += (o.population * lens) / (Math.PI * ro * ro);
    }
    return { overlap: Math.min(1, overlap), crowd };
  },

  /** Jazidas conhecidas pelo reino de `from`, úteis na era (`wanted`) e livres, a até `r` tiles, com decaimento (0 a 1). */
  siteOre(this: Ecosystem, from: Village, x: number, y: number, r: number): number {
    const want = this.wanted(from);
    const w = this.map.width;
    let sum = 0;
    for (const d of this.deposits) {
      if (d.amount <= 0 || d.mine >= 0 || !d.known.has(from.kingdom) || !want.includes(d.ore)) continue;
      const dist = Math.hypot(wrapDx(d.x + 0.5 - x, w), d.y + 0.5 - y);
      if (dist <= r) sum += siteDecay(dist);
    }
    return Math.min(1, sum);
  },

  /**
   * Nota de uma célula para o campo: a mesma `siteValue` dos batedores, com o que a célula sabe (captação da Pedra
   * pelas camadas da volta completa, água pelo lago e pela umidade, chão plano, costa) e a presença dos lugares vivos.
   * Sem ruína, defesa, rota nem motivo: isso é de cada sítio, visto de perto.
   */
  scoreSiteCell(this: Ecosystem, f: SiteField, k: number): void {
    const raw = f.raw;
    const b = k * L;
    if (raw[b + LL] < 0.2) {
      f.score[k] = -9;
      return;
    }
    const cols = f.cols;
    const cx = (k % cols) * C + C / 2;
    const cy = Math.min(this.map.height - 1, Math.floor(k / cols) * C + C / 2);
    const rf = this.catchRadius(0, 'food');
    const c = this.catchmentAt(cx, cy, rf, this.catchRadius(0, 'wood'), this.catchRadius(0, 'stone'));
    // Lago na célula ou ao lado.
    let lake = raw[b + LH] > 0 ? 3 : Infinity;
    if (lake > 3) {
      const row = Math.floor(k / cols);
      for (let oy = -1; oy <= 1 && lake > 3; oy++) {
        if (row + oy < 0 || row + oy >= f.rows) continue;
        for (let ox = -1; ox <= 1; ox++) if (raw[((row + oy) * cols + (((k % cols) + ox + cols) % cols)) * L + LH] > 0) lake = B.SITE_WATER_RANGE;
      }
    }
    const sea = raw[b + LS];
    const pres = this.sitePresence(cx, cy, rf);
    const look: SiteLook = {
      water: waterGrade(lake, raw[b + LM], false),
      fertile: Math.min(1, c.food + SITE_FISH_FOOD * c.water),
      forest: Math.min(1, c.wood / SITE_WOOD_FULL),
      rock: Math.min(1, c.rock / SITE_ROCK_FULL),
      flat: raw[b + LP] / raw[b + LL],
      coast: sea > 0 && sea < 0.6 ? 1 : 0,
      ruin: 0,
      defense: 0,
      route: 0,
      motive: 0,
      dist: B.SITE_IDEAL_DIST,
      era: 0,
      overlap: pres.overlap,
      crowd: pres.crowd,
    };
    f.score[k] = siteValue(look);
  },

  /**
   * Suja as células a até `r` tiles de (x, y): a nota (fundação, abandono) ou também as camadas, quando o terreno
   * mudou (`raw`); aí os corpos d'água são rotulados de novo. Sem campo ainda, nada a fazer.
   */
  siteDirty(this: Ecosystem, x: number, y: number, r: number, raw = false): void {
    const f = this.sites;
    if (!f) return;
    const ri = Math.ceil(r) + 1;
    if (raw && !f.waterDirty && this.waterChanged(f, Math.floor(x) - ri, Math.floor(y) - ri, Math.floor(x) + ri, Math.floor(y) + ri)) f.waterDirty = true;
    const w = this.map.width;
    const span = Math.ceil(r / C) + (raw ? SPAN : 0);
    const ccx = Math.floor((((x % w) + w) % w) / C);
    const ccy = Math.floor(y / C);
    for (let oy = -span; oy <= span; oy++) {
      const cy = ccy + oy;
      if (cy < 0 || cy >= f.rows) continue;
      for (let ox = -span; ox <= span; ox++) {
        const k = cy * f.cols + ((((ccx + ox) % f.cols) + f.cols) % f.cols);
        const inner = Math.abs(ox) <= Math.ceil(r / C) && Math.abs(oy) <= Math.ceil(r / C);
        const flag = raw && inner ? DIRTY_RAW | DIRTY_SCORE : DIRTY_SCORE;
        if (!f.dirty[k]) f.queue.push(k);
        f.dirty[k] |= flag;
      }
    }
  },

  /**
   * Relógio do campo: primeiro as células sujas (até SITE_DIRTY_PER_STEP por passo), depois a fatia da volta (uma a
   * cada SITE_FIELD_YEARS anos), que refaz as camadas na volta em curso e a nota pela volta completa. Na virada, as
   * voltas trocam (Double Buffer) e os corpos d'água são rotulados de novo se a água mudou por um caminho que não
   * passou por `sweep`. Sem campo (mundo sem povos), nada.
   */
  updateSites(this: Ecosystem, yr: number): void {
    const f = this.sites;
    if (!f) return;
    if (f.waterDirty) this.labelWater(f);
    for (let k = 0; k < SITE_DIRTY_PER_STEP && f.queue.length; k++) {
      const c = f.queue.shift()!;
      const flag = f.dirty[c];
      f.dirty[c] = 0;
      if (flag & DIRTY_RAW) this.refreshSiteCell(f, c, true);
      this.scoreSiteCell(f, c);
    }
    let slice = Math.ceil((f.n * yr) / B.SITE_FIELD_YEARS);
    while (slice-- > 0) {
      this.refreshSiteCell(f, f.cursor, false);
      this.scoreSiteCell(f, f.cursor);
      if (++f.cursor < f.n) continue;
      f.cursor = 0;
      f.passes++;
      const raw = f.raw;
      f.raw = f.rawNext;
      f.rawNext = raw;
      const anchor = f.anchor;
      f.anchor = f.anchorNext;
      f.anchorNext = anchor;
      // Rede de segurança: a água que mudou por um caminho que não passou por `sweep`.
      if (!f.waterDirty && this.waterChanged(f, 0, 0, this.map.width - 1, this.map.height - 1)) f.waterDirty = true;
    }
  },

  /**
   * Candidatos a sítio num anel de `rMin` a `rMax` tiles em volta de (x, y): a âncora das `cells` células de melhor
   * nota no campo e `random` pontos sorteados no anel (fluxo dos povos), para o campo não esconder o que só se vê
   * de perto (motivo, jazida, ruína).
   */
  siteRing(this: Ecosystem, x: number, y: number, rMin: number, rMax: number, cells: number, random: number): { x: number; y: number }[] {
    const f = this.siteField();
    const w = this.map.width;
    const out: { x: number; y: number }[] = [];
    const span = Math.ceil(rMax / C) + 1;
    const ccx = Math.floor((((x % w) + w) % w) / C);
    const ccy = Math.floor(y / C);
    const ranked: { k: number; s: number }[] = [];
    for (let oy = -span; oy <= span; oy++) {
      const cy = ccy + oy;
      if (cy < 0 || cy >= f.rows) continue;
      for (let ox = -span; ox <= span; ox++) {
        const k = cy * f.cols + ((((ccx + ox) % f.cols) + f.cols) % f.cols);
        const t = f.anchor[k];
        if (t < 0) continue;
        const d = Math.hypot(wrapDx((t % w) + 0.5 - x, w), Math.floor(t / w) + 0.5 - y);
        if (d < rMin || d > rMax) continue;
        ranked.push({ k, s: f.score[k] });
      }
    }
    ranked.sort((p, q) => q.s - p.s);
    for (let k = 0; k < ranked.length && k < cells; k++) {
      const t = f.anchor[ranked[k].k];
      out.push({ x: t % w, y: Math.floor(t / w) });
    }
    for (let k = 0; k < random; k++) {
      const a = (k / Math.max(1, random)) * Math.PI * 2 + this.civRnd() * 0.4;
      const d = rMin + this.civRnd() * (rMax - rMin);
      out.push({ x: Math.floor(x + Math.cos(a) * d), y: Math.floor(y + Math.sin(a) * d) });
    }
    return out;
  },

  /** Nota de fundar em (x, y): a nota única de toda entrada de fundação (`siteValue` do que os batedores veem, `siteLook`). */
  siteScore(this: Ecosystem, s: number, x: number, y: number, from: Village | null, motive: ColonyMotive, tech = from ? from.tech : 0): number {
    return siteValue(this.siteLook(s, x, y, from, motive, tech));
  },

  /**
   * Escolhe onde fundar (RF-AS-04), igual para todas as entradas: dá nota (`siteScore`) a todos os
   * candidatos que passam no filtro rápido (`siteQuick`), e só os melhores passam, em ordem, pelo caminho a pé
   * (com `walk`, a partir desse ponto, com desvio) e pelo exame da área (`siteProblem`): até `veto` (SITE_VETO_K)
   * por sítio pedido. Devolve até `count` sítios, os melhores primeiro, a pelo menos `apart` tiles um do outro; com
   * `min`, nenhum abaixo dessa nota.
   */
  chooseSite(
    this: Ecosystem,
    cands: { x: number; y: number }[],
    s: number,
    from: Village | null,
    motive: ColonyMotive,
    tech: number,
    opts: { count?: number; min?: number; walk?: { x: number; y: number }; apart?: number; veto?: number } = {},
  ): { x: number; y: number; value: number }[] {
    const map = this.map;
    const w = map.width;
    const count = opts.count ?? 1;
    const seen = new Set<number>();
    const scored: { x: number; y: number; value: number }[] = [];
    for (const c of cands) {
      const y = Math.floor(c.y);
      if (y < 2 || y >= map.height - 2) continue;
      const x = ((Math.floor(c.x) % w) + w) % w;
      const t = y * w + x;
      if (seen.has(t)) continue;
      seen.add(t);
      if (this.siteQuick(s, x, y, tech)) continue;
      scored.push({ x, y, value: this.siteScore(s, x, y, from, motive, tech) });
    }
    // Ordenação estável: empate fica na ordem dos candidatos.
    scored.sort((p, q) => q.value - p.value);
    const out: { x: number; y: number; value: number }[] = [];
    const apart = opts.apart ?? 0;
    let tries = (opts.veto ?? B.SITE_VETO_K) * count;
    for (const p of scored) {
      if (out.length >= count || tries <= 0) break;
      if (opts.min !== undefined && p.value < opts.min) break;
      if (apart && out.some((o) => Math.hypot(wrapDx(o.x - p.x, w), o.y - p.y) < apart)) continue;
      tries--;
      if (opts.walk && !this.landPath(opts.walk.x, opts.walk.y, p.x + 0.5, p.y + 0.5, true)) continue;
      if (this.siteProblem(s, p.x, p.y, tech)) continue;
      out.push(p);
    }
    return out;
  },
};
export type SiteFieldPart = typeof siteFieldPart;
