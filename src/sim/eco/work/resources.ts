/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): recursos do mapa (seção 19.19): árvores, pedreira, coleta, artesanato e minas.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { Biome, classify, Decor, decorAt, isRockyBiome, isTree } from '../../../procgen/surface';
import { ORE_NAMES, type Deposit, type Ore, type Stock } from '../../economy';
import { pickItem, pickPrimitive, TIER_MATERIAL, type Category, type Material } from '../../items';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isLand } = tilesModule;

export const resourcesPart = {
  /** Árvores de pé ao alcance, da mais perto para a mais longe (refeita quando acaba, no máximo uma vez por ano). */
  scanTrees(this: Ecosystem, v: Village): void {
    const r = this.reachOf(v, B.WOOD_REACH);
    const ri = Math.ceil(r);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const found: [number, number][] = [];
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = dx * dx + dy * dy;
        if (d > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && this.standingTree(t)) found.push([t, d]);
      }
    }
    found.sort((a, b) => a[1] - b[1]);
    v.treeList = found.map((f) => f[0]);
    v.treeNext = 0;
    v.trees = found.length;
    v.treesStart ??= found.length;
    v.treeScan = Math.floor(this.year);
  },

  /** Próxima árvore de pé a cortar (a mais perto), ou -1 quando a mata ao alcance acabou. */
  nextTree(this: Ecosystem, v: Village): number {
    for (;;) {
      if (!v.treeList || (v.treeNext ?? 0) >= v.treeList.length) {
        if (v.treeList && v.treeScan === Math.floor(this.year)) return -1;
        this.scanTrees(v);
        if (!v.treeList!.length) return -1;
      }
      const t = v.treeList![v.treeNext!];
      if (this.standingTree(t)) return t;
      v.treeNext!++;
    }
  },

  /**
   * Terreiro (mapa organizado, pedido do Joab): dentro da área, árvore, toco ou muda colados numa
   * casa, prédio, rua, praça, roça ou pasto saem, e o chão fica limpo até o lugar ser abandonado.
   * A madeira das árvores vai para o estoque, até o teto.
   */
  clearYards(this: Ecosystem, v: Village): void {
    const map = this.map;
    const r = Math.ceil(this.radius(v));
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.road[t] || this.built[t] || map.bare?.[t] || !isLand(map, t)) continue;
        const decor = decorAt(map, t);
        if (!isTree(decor) && decor !== Decor.Stump && decor !== Decor.Sapling) continue;
        let yard = false;
        for (let oy = -1; oy <= 1 && !yard; oy++) {
          for (let ox = -1; ox <= 1 && !yard; ox++) {
            const n = this.tileAt(cx + dx + ox, cy + dy + oy);
            if (n >= 0 && (this.road[n] || this.built[n])) yard = true;
          }
        }
        if (!yard || this.settlementAt(cx + dx + 0.5, cy + dy + 0.5) !== v) continue;
        if (isTree(decor)) {
          this.put(v, 'wood', B.WOOD_PER_TREE);
          this.treesCut++;
        } else {
          map.felled![t] = 0;
          this.stumps.delete(t);
        }
        map.bare ??= new Uint8Array(map.width * map.height);
        map.bare[t] = 1;
        this.onTileChanged(t);
      }
    }
  },

  /** Derruba a árvore do tile: fica o toco (ou a muda, quando o povo replanta). */
  fellTree(this: Ecosystem, t: number, replant: boolean): void {
    const map = this.map;
    this.treeVeg[t] = Math.max(map.vegetation[t], B.FELLED_VEG_MAX + 0.1);
    this.treeGrow[t] = 0;
    map.felled![t] = replant ? 3 : 1;
    this.stumps.add(t);
    map.vegetation[t] = Math.min(map.vegetation[t], B.FELLED_VEG_MAX);
    map.biome[t] = classify(map, t);
    this.treesCut++;
    if (replant) this.treesPlanted++;
    this.onTileChanged(t);
  },

  /**
   * Corte de lenha (seção 19.19): `work` em árvores por ano com a mata na porta; mata longe rende
   * menos. Só corta o que cabe no estoque (nada se desperdiça) e, com manejo, planta uma muda no
   * lugar de cada árvore cortada.
   */
  cutWood(this: Ecosystem, v: Village, work: number, yieldK: number): void {
    const per = B.WOOD_PER_TREE * yieldK;
    const cost = 1 + (v.forestry ? B.REPLANT_WORK : 0);
    let t = this.nextTree(v);
    v.fellAt = t;
    if (t < 0 || v.stock.wood + per > this.capOf(v, 'wood')) return;
    v.chop = (v.chop ?? 0) + work * this.haulFactor(v, t);
    while (v.chop >= cost && t >= 0 && v.stock.wood + per <= this.capOf(v, 'wood')) {
      v.chop -= cost;
      this.fellTree(t, !!v.forestry);
      this.put(v, 'wood', per);
      this.book(v, '_trees', 1, 0);
      t = this.nextTree(v);
      v.fellAt = t;
    }
    if (t < 0) v.chop = 0;
  },

  /** Pedra que um tile ainda dá: muita na rocha e na montanha, menos na colina, pedras soltas no chão comum. */
  stoneOf(this: Ecosystem, t: number): number {
    const map = this.map;
    if (!isLand(map, t)) return 0;
    const b = map.biome[t] as Biome;
    if (b === Biome.Snow || b === Biome.Ice || b === Biome.Lava) return 0;
    const total = isRockyBiome(b) ? B.STONE_ROCK : map.elevation[t] > 0.35 ? B.STONE_HILL : B.STONE_FIELD;
    return Math.max(0, total - this.stoneTaken[t]);
  },

  /** Quanto rende o trabalho num tile: rocha inteira, colina um pouco menos, pedra solta bem menos. */
  stoneRate(this: Ecosystem, t: number): number {
    const b = this.map.biome[t] as Biome;
    return isRockyBiome(b) ? 1 : this.map.elevation[t] > 0.35 ? 0.7 : B.FIELD_STONE_RATE;
  },

  /** Tiles com pedra ao alcance, do que mais rende (rocha perto) para o que menos rende. */
  scanStone(this: Ecosystem, v: Village): void {
    const r = this.reachOf(v, B.STONE_REACH);
    const ri = Math.ceil(r);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const found: [number, number][] = [];
    let left = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || this.built[t] || this.road[t]) continue;
        const n = this.stoneOf(t);
        if (n <= 0) continue;
        left += n;
        found.push([t, this.stoneRate(t) * this.haulFactor(v, t)]);
      }
    }
    found.sort((a, b) => b[1] - a[1]);
    v.stoneList = found.slice(0, 400).map((f) => f[0]);
    v.stoneNext = 0;
    v.stoneLeft = left;
    v.stoneScan = Math.floor(this.year);
  },

  /** Pedreira (seção 19.19): `work` em pedra por ano na rocha da porta; tira de cada tile até ele acabar. Retorna a pedra que entrou. */
  quarry(this: Ecosystem, v: Village, work: number): number {
    const cap = this.capOf(v, 'stone');
    let got = 0;
    let left = work;
    for (let guard = 0; left > 1e-6 && guard < 50 && v.stock.stone < cap; guard++) {
      if (!v.stoneList || (v.stoneNext ?? 0) >= v.stoneList.length) {
        if (v.stoneList && v.stoneScan === Math.floor(this.year)) break;
        this.scanStone(v);
        if (!v.stoneList!.length) break;
      }
      const t = v.stoneList![v.stoneNext!];
      const have = this.stoneOf(t);
      if (have <= 0 || this.built[t] || this.road[t]) {
        v.stoneNext!++;
        continue;
      }
      const rate = this.stoneRate(t) * this.haulFactor(v, t);
      const take = Math.min(have, left * rate, cap - v.stock.stone);
      if (take <= 0) break;
      this.stoneTaken[t] += take;
      v.stoneLeft = Math.max(0, (v.stoneLeft ?? 0) - take);
      got += this.put(v, 'stone', take);
      left -= take / rate;
      if (this.stoneOf(t) <= 0) {
        v.stoneNext!++;
        // Pedregulho que virou pedra de construção some do mapa.
        if (decorAt(this.map, t) === Decor.Boulder) {
          this.map.bare ??= new Uint8Array(this.map.width * this.map.height);
          this.map.bare[t] = 1;
          this.onTileChanged(t);
        }
      }
    }
    return got;
  },

  /**
   * Coleta (seção 19.19): cada porção vem de um tile com vegetação ao alcance e a desbasta um
   * pouco; o mato rebrota com o tempo. Em volta de um lugar cheio de gente a coleta rende cada
   * vez menos, e o povo precisa de roças, rebanho, caça e pesca.
   */
  gather(this: Ecosystem, v: Village, work: number): void {
    const map = this.map;
    const r = this.radius(v) + B.GATHER_REACH;
    v.gatherWork = (v.gatherWork ?? 0) + work;
    let fails = 0;
    while (v.gatherWork >= 1 && fails < 10) {
      const a = this.civRnd() * Math.PI * 2;
      const d = Math.sqrt(this.civRnd()) * r;
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0 || !isLand(map, t) || this.built[t] || this.road[t]) {
        fails++;
        continue;
      }
      const veg = map.vegetation[t];
      const floor = isTree(decorAt(map, t)) ? B.GATHER_TREE_FLOOR : B.GATHER_MIN;
      if (veg - B.GATHER_BITE < floor) {
        fails++;
        continue;
      }
      map.vegetation[t] = veg - B.GATHER_BITE;
      const biome = classify(map, t);
      if (biome !== map.biome[t]) {
        map.biome[t] = biome;
        this.onTileChanged(t);
      }
      v.gatherWork -= 1;
      this.book(v, '_gather', this.put(v, 'food', 1), 0);
    }
    // Nada mais para colher por perto neste momento: o trabalho do resto do passo se perde.
    if (fails >= 10) v.gatherWork = 0;
  },

  /** O que falta mais: ferramentas para quem trabalha, armas e armaduras para quem luta (antes, na guerra). */
  needed(this: Ecosystem, st: Stock, adults: number, soldiers: number, v: Village): Category {
    const war = this.warOf(v.kingdom) !== null || this.plans.has(v.kingdom);
    if (!war && st.tools < adults * 0.3) return 'ferramenta';
    if (st.weapons < soldiers + 2 || (war && st.weapons <= st.armor)) return 'arma';
    if (st.armor < soldiers * (war ? 1 : 0.5)) return 'armadura';
    return st.tools <= st.weapons ? 'ferramenta' : 'arma';
  },

  /** Um item do catálogo entra no estoque do reino; a primeira vez que alguém no mundo o faz vira notícia. */
  craft(this: Ecosystem, v: Village, st: Stock, category: Category, material: Material, era: number): void {
    const item = material === 'stone' ? pickPrimitive(category, this.civRnd()) : pickItem(material, category, era, this.civRnd());
    if (!item) return;
    st.items[item.id] = (st.items[item.id] ?? 0) + 1;
    const tier = Math.max(0, TIER_MATERIAL.indexOf(material));
    this.book(v, item.category === 'ferramenta' ? 'tools' : item.category === 'arma' ? 'weapons' : item.category === 'armadura' ? 'armor' : 'jewels', 1, 0);
    if (item.category === 'ferramenta') st.tools++;
    else if (item.category === 'arma') {
      st.weapons++;
      st.weaponTier = Math.max(st.weaponTier, tier);
    } else if (item.category === 'armadura') {
      st.armor++;
      st.armorTier = Math.max(st.armorTier, tier);
    } else st.jewels++;
    this.crafted.set(item.id, (this.crafted.get(item.id) ?? 0) + 1);
    if (this.crafted.get(item.id) === 1 && material !== 'stone' && material !== 'wood') {
      this.note(`Pela primeira vez neste mundo, ${v.name} fez ${item.name.toLowerCase()}`, 'economia', v);
    }
  },

  /** Minérios que o povo busca agora, conforme as técnicas que já domina. */
  wanted(this: Ecosystem, v: Village): Ore[] {
    if (this.knew(v, 'siderurgia') || v.tech >= 2) return ['coal', 'iron'];
    if (this.knew(v, 'fundicao') || v.tech >= 1) return ['iron', 'copper', 'tin'];
    return ['copper', 'tin'];
  },

  openMine(this: Ecosystem, v: Village): boolean {
    const w = this.map.width;
    const want = this.wanted(v);
    const canIron = this.knew(v, 'fundicao') || v.tech >= 1;
    const canCoal = this.knew(v, 'siderurgia') || v.tech >= 2;
    let best: Deposit | null = null;
    let score = Infinity;
    const reach = this.radius(v) + 25;
    for (const d of this.deposits) {
      if (d.amount <= 0 || d.mine >= 0 || !d.known.has(v.kingdom)) continue;
      if (d.ore === 'iron' && !canIron) continue;
      if (d.ore === 'coal' && !canCoal) continue;
      const dist = this.distance(v, d.x + 0.5, d.y + 0.5);
      if (dist > reach) continue;
      const sc = dist - (want.includes(d.ore) ? 40 : 0);
      if (sc < score && this.landPath(v.x, v.y, d.x + 0.5, d.y + 0.5)) {
        score = sc;
        best = d;
      }
    }
    if (!best || !this.pay(v, 'mine')) return false;
    best.mine = v.id;
    v.mines.push(best.id);
    this.lineRoad(v.x, v.y, best.x + 0.5, best.y + 0.5);
    const tile = best.y * w + best.x;
    if (this.road[tile]) {
      this.road[tile] = 0;
      this.onTileChanged(tile);
    }
    this.note(`${v.name} abriu uma mina de ${ORE_NAMES[best.ore]}${best.cave ? ' numa caverna' : ''}`, 'economia', best);
    return true;
  },

  /** Exploradores que passam perto de uma jazida a descobrem para o reino. */
  discover(this: Ecosystem, i: number, v: Village): void {
    const tx = Math.floor(this.x[i]);
    const ty = Math.floor(this.y[i]);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const t = this.tileAt(tx + dx, ty + dy);
        if (t < 0) continue;
        const id = this.depositAt[t];
        if (id < 0) continue;
        const d = this.deposits[id];
        if (d.amount <= 0 || d.known.has(v.kingdom)) continue;
        d.known.add(v.kingdom);
        this.note(`${v.name} encontrou ${ORE_NAMES[d.ore]} ${d.cave ? 'numa caverna' : 'num veio'}`, 'economia', d);
        // Corrida do ouro (RF-VIDA-285): a notícia atrai gente por alguns anos.
        if (d.ore === 'gold' && (v.goldRush ?? 0) < this.year) {
          v.goldRush = this.year + B.GOLD_RUSH_YEARS;
          this.note(`Corrida do ouro em ${v.name}: gente de longe chega atrás do ouro`, 'economia', v, { key: `ouro-${v.id}` });
        }
      }
    }
  },

  /** O jogador coloca um veio de minério num tile de terra (ajuda leve). */
  placeOre(this: Ecosystem, x: number, y: number, ore: Ore): boolean {
    const t = this.tileAt(x, Math.floor(y));
    if (t < 0 || this.road[t]) return false;
    const d = this.addDeposit(x, y, ore, 100, false);
    if (!d) return false;
    this.note(`Você colocou um veio de ${ORE_NAMES[ore]}`, 'jogador', d);
    return true;
  },
};
export type ResourcesPart = typeof resourcesPart;
