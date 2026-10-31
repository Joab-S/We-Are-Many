/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): células ecológicas da fauna: comida, nicho, capacidade e recontagem.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { browseOf, floraOf, woody, type Flora } from '../../flora';
import { windAt } from '../../climate';
import { type Biome, temperatureAt, vegetationCap } from '../../../procgen/surface';
import { wrapDx } from '../../settlement';
import {
  CARCASS_YEARS,
  CARRION_RATIO,
  COAST_YIELD,
  ECO_CELL,
  ecologyOf,
  FEAR_DECAY_YEAR,
  FORAGE_USE,
  GRAZE_COST,
  GRAZE_MAX,
  hunts,
  INSECT_YIELD,
  BROWSE_YIELD,
  isLandAnimal,
  LAND_BUDGET,
  METABOLISM_YEAR,
  ration,
  PREDATOR_RATIO,
  REGROW_YEAR,
  type Ecology,
} from '../../fauna';
import * as constantsModule from '../constants';
import * as tilesModule from '../tiles';
import { EcoCells } from '../cells';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { MIN_WILD } = constantsModule;
const { isWater, isLand } = tilesModule;

export const faunaCellsPart = {
  // ---- Fauna de terra: células ecológicas, pasto, carcaças e IA (docs/REFATORACAO-ECOSSISTEMA.md) ----

  /** Bicho de terra que usa a IA nova (os aquáticos e os inteligentes têm a sua). */
  /** Algum caçador nas células que o raio toca (a lista é da última recontagem, com uma célula de folga). */
  huntersAround(this: Ecosystem, x: number, y: number, radius: number): boolean {
    const c = this.cells;
    if (!c) return true;
    const w = this.map.width;
    const r = Math.ceil(radius / ECO_CELL);
    const cx = Math.floor((((x % w) + w) % w) / ECO_CELL);
    const cy = Math.floor(y / ECO_CELL);
    for (let oy = -r; oy <= r; oy++) {
      const yy = cy + oy;
      if (yy < 0 || yy >= c.rows) continue;
      for (let ox = -r; ox <= r; ox++) if (c.hunters[yy * c.cols + ((cx + ox + c.cols) % c.cols)]) return true;
    }
    return false;
  },

  /** Longe da área que o jogador está vendo (com folga), para o detalhe menor. */
  offscreen(this: Ecosystem, i: number): boolean {
    const f = this.focus;
    if (!f) return false;
    return Math.abs(wrapDx(this.x[i] - f.x, this.map.width)) > f.r || Math.abs(this.y[i] - f.y) > f.r;
  },

  wild(this: Ecosystem, s: number): boolean {
    return isLandAnimal(this.species[s]);
  },

  /** Células ecológicas, prontas para uso (refeitas por inteiro quando chega uma espécie nova). */
  ecoCells(this: Ecosystem): EcoCells {
    let c = this.cells;
    if (!c || c.n !== Math.ceil(this.map.width / ECO_CELL) * Math.ceil(this.map.height / ECO_CELL)) c = this.cells = new EcoCells(this.map.width, this.map.height);
    if (c.stride !== this.species.length) c.resize(this.species.length);
    if (!c.ready) {
      c.ready = true;
      for (let k = 0; k < c.n; k++) this.refreshCell(c, k);
      this.countWild(c);
      this.updateCapacity(c);
    }
    return c;
  },

  /** Fração do ano (0 começo da primavera … 1). */
  yearPhase(this: Ecosystem): number {
    return this.year - Math.floor(this.year);
  },

  /**
   * Pasto que dá para comer no tile agora (0 a 1): a vegetação menos o que foi
   * pastado e ainda não rebrotou. A raiz (1 - GRAZE_MAX) não conta: um tile
   * rapado vale 0 e o bicho vai procurar outro.
   */
  forageAt(this: Ecosystem, t: number): number {
    const veg = this.map.vegetation[t];
    if (veg <= 0 || !isLand(this.map, t)) return 0;
    const c = this.cells;
    const k = c ? this.cellOfTile(c, t) : -1;
    // Neve cobre o pasto: os bichos cavam, mas acham bem menos.
    const base = k >= 0 ? veg * c!.cover[k] : veg;
    const g = this.graze[t];
    if (g <= 0) return base;
    const regrow = k >= 0 ? c!.regrow[k] : REGROW_YEAR;
    return (base * Math.max(0, GRAZE_MAX - g * Math.exp(-regrow * (this.year - this.grazeAt[t])))) / GRAZE_MAX;
  },

  /** Célula ecológica de um tile. */
  cellOfTile(this: Ecosystem, c: EcoCells, t: number): number {
    const w = this.map.width;
    const x = t % w;
    return Math.floor((t - x) / w / ECO_CELL) * c.cols + Math.floor(x / ECO_CELL);
  },

  /**
   * Água no solo em relação ao normal do lugar (1 = ano normal; menos na seca, mais num ano de chuva),
   * de 0,4 a 1,3: multiplica a rebrota do pasto e do fruto e a colheita.
   */
  soilFactor(this: Ecosystem, x: number, y: number): number {
    const wx = this.weather;
    if (!wx?.ready) return 1;
    const k = wx.of(x, y, this.map.width);
    return Math.max(0.4, Math.min(1.3, wx.soil[k] / Math.max(0.1, wx.base[k])));
  },

  /** O tempo agora no tile, para a ficha: temperatura da estação, chuva, neve e água no solo. */
  weatherAt(this: Ecosystem, t: number): { temp: number; rain: number; snow: number; soil: number; wind: { x: number; y: number } } | null {
    const wx = this.weather;
    if (!wx?.ready) return null;
    const w = this.map.width;
    const x = t % w;
    const y = (t - x) / w;
    const k = wx.of(x, y, w);
    const temp = temperatureAt(this.map, t) + (wx.tempNow(k, this.yearPhase()) - wx.temp[k]);
    return { temp, rain: wx.rain[k], snow: wx.snow[k], soil: wx.soil[k], wind: windAt(y, this.map.height) };
  },

  /** Come até `need` unidades de pasto em volta do tile (a mancha cresce com o tamanho do bicho); devolve o que comeu. */
  grazePatch(this: Ecosystem, t: number, need: number): number {
    const m = this.map;
    const w = m.width;
    const x0 = t % w;
    const y0 = (t - x0) / w;
    const r = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(need / (0.25 * Math.PI)))));
    // A mancha é pequena perto da célula: a rebrota do centro vale para ela toda.
    const regrow = this.cells ? this.cells.regrow[this.cellOfTile(this.cells, t)] : REGROW_YEAR;
    const share = need / (Math.PI * r * r) + 0.02;
    let taken = 0;
    for (let oy = -r; oy <= r && taken < need; oy++) {
      const y = y0 + oy;
      if (y < 0 || y >= m.height) continue;
      for (let ox = -r; ox <= r && taken < need; ox++) {
        if (ox * ox + oy * oy > r * r) continue;
        const tt = y * w + ((x0 + ox + w) % w);
        const base = m.vegetation[tt];
        if (base <= 0.02 || !isLand(m, tt)) continue;
        const left = this.graze[tt] > 0 ? this.graze[tt] * Math.exp(-regrow * (this.year - this.grazeAt[tt])) : 0;
        // Raiz: o pastejo nunca passa de GRAZE_MAX do tile.
        const room = base * (GRAZE_MAX - left);
        if (room <= 0) continue;
        const take = Math.min(room, share, need - taken);
        this.graze[tt] = left + take / base;
        this.grazeAt[tt] = this.year;
        taken += take;
      }
    }
    return taken;
  },

  /** Insetos no tile (campo, não indivíduos): mais onde é verde, úmido e quente. */
  insectsAt(this: Ecosystem, t: number): number {
    const m = this.map;
    // Sobre a água rasa também há insetos (mosquitos, larvas): o sapo come na beira.
    if (!isLand(m, t)) return isWater(m, t) && m.elevation[t] > -0.2 ? 0.25 : 0;
    return m.vegetation[t] * (0.3 + 0.7 * m.moisture[t]) * (temperatureAt(m, t) > 278 ? 1 : 0.3);
  },

  /** Comida do mar raso e da beira d'água (peixinhos, krill, algas, restos) no tile. */
  shoreAt(this: Ecosystem, t: number): number {
    const m = this.map;
    if (isWater(m, t)) return m.elevation[t] > -0.2 ? 1 : 0.4;
    return this.nearWater(t) ? 0.7 : 0;
  },

  /** Quanto o tile alimenta a espécie, fora carne e carcaça (0 a 1). */
  foodAt(this: Ecosystem, e: Ecology, t: number): number {
    let f = 0;
    if (e.forage > 0) f = Math.max(f, e.forage * this.forageAt(t));
    if (e.fruit > 0) f = Math.max(f, e.fruit * this.browseAt(t));
    if (e.insects > 0) f = Math.max(f, e.insects * this.insectsAt(t));
    const water = Math.max(e.fish, e.plankton);
    if (water > 0) f = Math.max(f, water * this.shoreAt(t));
    return f;
  },

  /** Comida média da célula para a espécie (o "mapa de comida" que o bicho consulta). */
  cellFood(this: Ecosystem, c: EcoCells, e: Ecology, k: number): number {
    return Math.max(e.forage * c.forage[k], e.fruit * c.browse[k], e.insects * c.bugs[k], Math.max(e.fish, e.plankton) * c.shore[k]);
  },

  /** Ramagem e fruto que sobram na mata do tile agora (0 a 1): a estação menos o que a célula já comeu. */
  browseAt(this: Ecosystem, t: number): number {
    const m = this.map;
    const w = woody(m.vegetation[t]);
    if (w <= 0 || !isLand(m, t)) return 0;
    const c = this.cells;
    if (!c) return browseOf(m.vegetation[t], temperatureAt(m, t), this.yearPhase());
    const k = this.cellOfTile(c, t);
    return w * c.bseason[k] * (1 - this.browseUsed(c, k));
  },

  /** Planta dominante do tile e se está com fruto (para a ficha do tile). */
  floraAt(this: Ecosystem, t: number): Flora | null {
    const m = this.map;
    if (!isLand(m, t)) return null;
    return floraOf(m.biome[t] as Biome, m.vegetation[t], temperatureAt(m, t), this.yearPhase());
  },

  /** Parte da ramagem da célula que foi comida e ainda não rebrotou. */
  browseUsed(this: Ecosystem, c: EcoCells, k: number): number {
    const u = c.bused[k];
    return u > 0 ? u * Math.exp(-REGROW_YEAR * (this.year - c.busedAt[k])) : 0;
  },

  /** Come ramagem e fruto da célula: devolve quanto conseguiu (unidades de pasto). */
  browseCell(this: Ecosystem, c: EcoCells, k: number, need: number): number {
    const stock = c.wood[k] * GRAZE_MAX;
    if (stock <= 0) return 0;
    const used = this.browseUsed(c, k);
    const take = Math.min(need, stock * Math.max(0, GRAZE_MAX - used));
    c.bused[k] = used + take / stock;
    c.busedAt[k] = this.year;
    return take;
  },

  /** Quão bom o tile é para a espécie (nicho): bioma, temperatura, umidade e altitude. */
  niche(this: Ecosystem, s: number, e: Ecology, t: number, temp: number): number {
    if (!this.canStand(s, t)) return 0;
    const sp = this.species[s];
    if (temp < sp.tempMin || temp > sp.tempMax) return 0;
    const m = this.map;
    const margin = Math.min(temp - sp.tempMin, sp.tempMax - temp);
    const ft = Math.min(1, 0.35 + margin / 8);
    const fb = e.biomes[m.biome[t] as Biome] ?? e.open;
    const mo = m.moisture[t];
    const fm = mo >= e.moist[0] && mo <= e.moist[1] ? 1 : 0.35;
    const el = Math.max(0, m.elevation[t]);
    const fa = el >= e.alt[0] && el <= e.alt[1] ? 1 : 0.25;
    return fb * ft * fm * fa;
  },

  /** Refaz a comida e o nicho de uma célula. */
  refreshCell(this: Ecosystem, c: EcoCells, k: number): void {
    const m = this.map;
    const w = m.width;
    const x0 = (k % c.cols) * ECO_CELL;
    const y0 = Math.floor(k / c.cols) * ECO_CELL;
    let land = 0;
    let veg = 0;
    let avail = 0;
    let bugs = 0;
    let shore = 0;
    let wood = 0;
    const phase = this.yearPhase();
    // Amostra um tile a cada dois em cada eixo (64 de 256) e escala: o mesmo retrato da célula a um quarto do custo.
    for (let y = y0 + (k & 1); y < Math.min(m.height, y0 + ECO_CELL); y += 2) {
      for (let x = x0 + ((k >> 1) & 1); x < Math.min(w, x0 + ECO_CELL); x += 2) {
        const t = y * w + x;
        if (isWater(m, t)) {
          if (m.elevation[t] > -0.2) shore++;
          continue;
        }
        if (!isLand(m, t)) continue;
        land++;
        veg += m.vegetation[t];
        avail += this.forageAt(t);
        bugs += this.insectsAt(t);
        const v = m.vegetation[t];
        if (v > 0.25) wood += woody(v);
      }
    }
    land *= 4;
    veg *= 4;
    bugs *= 4;
    shore *= 4;
    avail *= 4;
    wood *= 4;
    c.land[k] = land;
    c.wood[k] = wood;
    // Clima vivo da célula: estação dos frutos pela temperatura de agora, rebrota pela água no solo, neve.
    const wx = this.weather;
    if (wx?.ready) {
      const T = wx.tempNow(k, phase);
      c.bseason[k] = browseOf(1, T, phase) / woody(1);
      c.regrow[k] = REGROW_YEAR * Math.max(0.4, Math.min(1.3, wx.soil[k] / Math.max(0.1, wx.base[k])));
      c.cover[k] = 1 - 0.4 * wx.snow[k];
    } else c.bseason[k] = browseOf(1, temperatureAt(m, Math.min(m.height - 1, y0 + 8) * w + ((x0 + 8) % w)), phase);
    c.browse[k] = land ? (wood / land) * c.bseason[k] * (1 - this.browseUsed(c, k)) : 0;
    c.forage[k] = land ? avail / land : 0;
    c.bugs[k] = land ? bugs / land : 0;
    // Costa: só conta onde há terra e mar raso juntos.
    const coast = land && shore ? Math.min(shore, land) : 0;
    c.shore[k] = coast / (ECO_CELL * ECO_CELL) * 4;
    // Rebrota sustentável: a parte pastada volta na taxa REGROW_YEAR; a capacidade usa só FORAGE_USE dela.
    c.fprod[k] = (veg * REGROW_YEAR * GRAZE_MAX * 0.5 * FORAGE_USE) / GRAZE_COST;
    // Ramagem e fruto: rebrota na mesma taxa, mas cada tile lenhoso rende menos que um de erva (BROWSE_YIELD).
    c.bprod[k] = (wood * REGROW_YEAR * GRAZE_MAX * 0.5 * FORAGE_USE * BROWSE_YIELD) / GRAZE_COST;
    c.iprod[k] = bugs * INSECT_YIELD;
    c.wprod[k] = coast * COAST_YIELD;
    // Nicho de cada espécie de terra, numa amostra de 16 tiles da célula. Muda devagar (clima e bioma):
    // refeito numa de cada quatro voltas, exceto na primeira.
    const S = c.stride;
    if (c.passes > 0 && (c.passes + k) % 4 !== 0) return;
    for (let s = 0; s < S; s++) c.suit[k * S + s] = 0;
    for (let sy = 2; sy < ECO_CELL; sy += 4) {
      const y = y0 + sy;
      if (y >= m.height) continue;
      for (let sx = 2; sx < ECO_CELL; sx += 4) {
        const t = y * w + ((x0 + sx) % w);
        const temp = temperatureAt(m, t);
        for (let s = 0; s < S; s++) if (this.wild(s)) c.suit[k * S + s] += this.niche(s, ecologyOf(this.species[s]), t, temp) / 16;
      }
    }
  },

  /** Conta os bichos de terra de cada espécie em cada célula. */
  countWild(this: Ecosystem, c: EcoCells): void {
    const hunter = this.species.map((sp, s) => this.wild(s) && hunts(ecologyOf(sp)));
    c.N.fill(0);
    c.hunters.fill(0);
    c.dens.fill(-1);
    c.herds.clear();
    c.herdKind.clear();
    const S = c.stride;
    const w = this.map.width;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || !this.wild(this.kind[i])) continue;
      const cell = c.of(this.x[i], this.y[i], w);
      const k = cell * S + this.kind[i];
      if (c.N[k] < 65535) c.N[k]++;
      if (hunter[this.kind[i]] && c.hunters[cell] < 65535) c.hunters[cell]++;
      // Centro do bando, com a volta do mapa (desvios a partir do primeiro membro visto).
      const h = c.herds.get(this.family[i]);
      if (h) {
        h[1] += wrapDx(this.x[i] - h[0], w);
        h[2] += this.y[i];
        h[3]++;
      } else {
        c.herds.set(this.family[i], [this.x[i], 0, this.y[i], 1]);
        c.herdKind.set(this.family[i], this.kind[i]);
      }
    }
  },

  /** Para onde fica o centro do bando do bicho (dx, dy), ou null se ele está sozinho no bando. */
  herdCenter(this: Ecosystem, i: number, c: EcoCells): { x: number; y: number } | null {
    const h = c.herds.get(this.family[i]);
    if (!h || h[3] < 2) return null;
    const w = this.map.width;
    return { x: wrapDx(h[0] + h[1] / h[3] - this.x[i], w), y: h[2] / h[3] - this.y[i] };
  },

  /**
   * Capacidade de suporte de cada espécie em cada célula: a produção de cada comida
   * (pasto, insetos, costa, presas, carcaças) dividida entre quem come aquilo, na
   * proporção do nicho, e dividida pela ração anual (massa^0,75). O total do planeta
   * fica dentro do orçamento de bichos de terra.
   */
  updateCapacity(this: Ecosystem, c: EcoCells): void {
    const S = c.stride;
    const eco = this.species.map((sp, s) => (this.wild(s) ? ecologyOf(sp) : null));
    // Caçador come pouco, mas mata mais do que come (sobra carcaça, caçadas perdidas): na conta da capacidade ele pesa quase como um herbívoro.
    const need = eco.map((e) => (e ? METABOLISM_YEAR * (hunts(e) ? 0.7 : 1) * ration(e) : 0));
    const clout = eco.map((e) => (e ? Math.sqrt(ration(e)) : 0));
    const preys = eco.map((e, s) => (e && !hunts(e) ? s : -1)).filter((s) => s >= 0);
    const hunters = eco.map((e, s) => (e && hunts(e) ? s : -1)).filter((s) => s >= 0);
    // Quem cada caçador consegue pegar (pelo tamanho; em bando, presas maiores).
    const eats = hunters.map((q) => {
      const e = eco[q]!;
      const limit = e.maxPrey * (e.pack ? 2 : 1);
      return preys.map((p) => eco[p]!.mass <= limit && eco[p]!.mass >= e.mass * 0.015);
    });
    // Ração das presas em cada célula (para o mapa de caça).
    for (let k = 0; k < c.n; k++) {
      let p = 0;
      for (const s of preys) p += c.N[k * S + s] * need[s];
      c.prey[k] = p;
    }
    const wants = (e: Ecology) => [e.forage, e.insects, Math.max(e.fish, e.plankton), e.carrion, e.fruit];
    const total = new Array(S).fill(0);
    const K = new Float32Array(S);
    const preyHere = new Float32Array(S);
    let all = 0;
    for (let k = 0; k < c.n; k++) {
      // Presas da vizinhança (o predador anda mais que uma célula), por espécie.
      const cx = k % c.cols;
      const cy = (k - cx) / c.cols;
      preyHere.fill(0);
      for (let oy = -1; oy <= 1; oy++) {
        const y = cy + oy;
        if (y < 0 || y >= c.rows) continue;
        for (let ox = -1; ox <= 1; ox++) {
          const q = y * c.cols + ((cx + ox + c.cols) % c.cols);
          for (const s of preys) preyHere[s] += c.N[q * S + s] / 9;
        }
      }
      let carrion = 0;
      for (const s of preys) carrion += preyHere[s] * need[s] * CARRION_RATIO;
      const res = [c.fprod[k], c.iprod[k], c.wprod[k], carrion, c.bprod[k]];
      // Parte de cada um: nicho × peso na dieta × porte (bicho grande disputa melhor o pasto).
      const D = [0, 0, 0, 0, 0];
      for (let s = 0; s < S; s++) {
        if (!eco[s]) continue;
        const u = c.suit[k * S + s] * clout[s];
        const wv = wants(eco[s]!);
        for (let r = 0; r < 5; r++) D[r] += u * wv[r];
      }
      K.fill(0);
      for (let s = 0; s < S; s++) {
        if (!eco[s]) continue;
        const u = c.suit[k * S + s];
        if (u <= 0.02) continue;
        const wv = wants(eco[s]!);
        // A parte de cada comida rende na proporção do peso dela na dieta (como na hora de comer).
        for (let r = 0; r < 5; r++) if (D[r] > 0) K[s] += (res[r] * u * clout[s] * wv[r] * Math.min(1, wv[r])) / D[r];
      }
      // Carne: cada espécie de presa alimenta os caçadores que conseguem pegá-la, divididos pelo nicho e porte.
      for (let pi = 0; pi < preys.length; pi++) {
        const p = preys[pi];
        if (preyHere[p] <= 0) continue;
        let d = 0;
        for (let h = 0; h < hunters.length; h++) if (eats[h][pi]) d += c.suit[k * S + hunters[h]] * clout[hunters[h]] * eco[hunters[h]]!.meat;
        if (d <= 0) continue;
        const meat = preyHere[p] * need[p] * PREDATOR_RATIO;
        for (let h = 0; h < hunters.length; h++) {
          const q = hunters[h];
          if (eats[h][pi]) K[q] += (meat * c.suit[k * S + q] * clout[q] * eco[q]!.meat * Math.min(1, eco[q]!.meat)) / d;
        }
      }
      for (let s = 0; s < S; s++) {
        if (!eco[s]) continue;
        // Nicho ruim rende menos mesmo sem concorrente.
        const v = (Math.sqrt(c.suit[k * S + s]) * K[s]) / need[s];
        c.K[k * S + s] = v;
        total[s] += v;
        all += v;
      }
    }
    // Orçamento de entidades: o planeta inteiro não passa de LAND_BUDGET bichos de terra (na proporção da raiz da área).
    // Raiz da área: planetas pequenos ficam um pouco mais cheios, para caber uma teia inteira.
    const budget = LAND_BUDGET * Math.sqrt((this.map.width * this.map.height) / (1024 * 512));
    const scale = all > budget ? budget / all : 1;
    if (scale < 1) for (let j = 0; j < c.K.length; j++) c.K[j] *= scale;
    c.dens.fill(-1);
    for (let s = 0; s < S; s++) {
      c.total[s] = total[s] * scale;
      // O teto global vira só uma rede de segurança, bem acima da soma das capacidades locais.
      if (eco[s]) this.caps[s] = Math.max(MIN_WILD, Math.ceil(c.total[s] * 1.6));
    }
  },

  /**
   * Relógio da fauna de terra: refaz uma fatia das células a cada passo (todas em
   * um ano: pasto e clima mudam devagar), recontas e capacidades a cada oitavo de ano, e o
   * apodrecer das carcaças e o esquecer do medo.
   */
  updateWildlife(this: Ecosystem, yr: number): void {
    if (!this.species.some((_, s) => this.wild(s))) return;
    const c = this.ecoCells();
    let slice = Math.ceil(c.n * yr);
    while (slice-- > 0) {
      this.refreshCell(c, c.cursor);
      c.cursor = (c.cursor + 1) % c.n;
      if (c.cursor === 0) c.passes++;
    }
    this.wildClock += yr;
    if (this.wildClock < 1 / 8) return;
    const span = this.wildClock;
    this.wildClock = 0;
    this.countWild(c);
    // A capacidade (a conta mais cara) é refeita a cada quarto de ano; a contagem, a cada oitavo.
    if ((c.recounts = (c.recounts + 1) % 2) === 0) this.updateCapacity(c);
    const fade = Math.exp(-FEAR_DECAY_YEAR * span);
    for (let k = 0; k < this.fear.length; k++) this.fear[k] *= fade;
    // Carcaças apodrecem; o que sobra aduba o chão (o pasto em volta rebrota na hora).
    for (let k = this.carcasses.length - 1; k >= 0; k--) {
      const cc = this.carcasses[k];
      cc.kg *= Math.exp(-span / CARCASS_YEARS);
      if (this.year - cc.at < CARCASS_YEARS && cc.kg > 0.3) continue;
      const t = this.tileAt(cc.x, Math.floor(cc.y));
      if (t >= 0 && isLand(this.map, t)) {
        this.graze[t] = 0;
        const cap = vegetationCap(this.map, t);
        if (this.map.vegetation[t] < cap) this.map.vegetation[t] = Math.min(cap, this.map.vegetation[t] + 0.04);
      }
      this.carcasses.splice(k, 1);
    }
  },
};
export type FaunaCellsPart = typeof faunaCellsPart;
