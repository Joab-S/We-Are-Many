/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): preços, acordos, ofertas, luxo, pedidos da capital e tráfego.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { Biome, isForestBiome, temperatureAt } from '../../../procgen/surface';
import { GOODS, STOCK_NAMES, type Good } from '../../economy';
import { GRAVEL } from '../../architecture';
import { LUXURIES, LUXURY_ERA, currencyOf, pickLuxury, price, tradable, type Agreement, type Cargo, type Luxury } from '../../trade';
import { welfare } from '../../needs';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isLand } = tilesModule;

export const marketsPart = {
  // Comércio vivo (seção 19.6) ------------------------------------------------

  /** Nome de um bem em minúsculas, para a crônica. */
  goodName(this: Ecosystem, g: Good | 'food'): string {
    return g === 'food' ? 'comida' : (STOCK_NAMES.find(([k]) => k === g)?.[1] ?? g).toLowerCase();
  },

  amountOf(this: Ecosystem, v: Village, g: Good | 'food'): number {
    return g === 'food' ? v.food : v.stock[g];
  },

  addTo(this: Ecosystem, v: Village, g: Good | 'food', n: number): void {
    if (g === 'food') v.food += n;
    else v.stock[g] += n;
  },

  /** Preço local de um bem (RF-VIDA-231). */
  priceAt(this: Ecosystem, v: Village, g: Good | 'food'): number {
    const rich = v.needs ? welfare(v.needs) >= 0.75 : false;
    return price(g, this.amountOf(v, g), this.capOf(v, g), v.needs, rich);
  },

  /** Caravanas e barcos mercantes de um assentamento na estrada ou no mar (rebanhos não contam). */
  caravansOf(this: Ecosystem, v: Village): number {
    let n = 0;
    for (const c of this.caravans) if (c.home === v.id && (c.kind === 'trade' || c.kind === 'tribute')) n++;
    for (const b of this.boats) if (b.village === v.id && b.purpose === 'trade' && b.sunk < 0) n++;
    return n;
  },

  /** Comércio no mundo todo (para o limite CARAVANS_MAX). */
  tradeInMotion(this: Ecosystem): number {
    let n = 0;
    for (const c of this.caravans) if (c.kind === 'trade' || c.kind === 'tribute') n++;
    for (const b of this.boats) if (b.purpose === 'trade' && b.sunk < 0) n++;
    return n;
  },

  /** Neve no caminho: no inverno, as caravanas param nas terras frias (RF-VIDA-290). */
  snowed(this: Ecosystem, x: number, y: number): boolean {
    // Com o clima vivo, é a neve que está no chão; sem ele, a regra fixa do inverno nas terras frias.
    if (this.weather?.ready) return this.weather.snowAt(x, y, this.map.width) > 0.3;
    return this.season() === 3 && temperatureAt(this.map, this.tileAt(x, Math.floor(y))) < B.COLD_K;
  },

  /** Acordo em vigor entre dois assentamentos, se houver. */
  agreementOf(this: Ecosystem, a: number, b: number): Agreement | undefined {
    return this.agreements.find((g) => (g.a === a && g.b === b) || (g.a === b && g.b === a));
  },

  /** Algum acordo entre assentamentos dos dois reinos. */
  agreedKingdoms(this: Ecosystem, ka: number, kb: number): boolean {
    return this.agreements.some((g) => {
      const x = this.villages[g.a].kingdom;
      const y = this.villages[g.b].kingdom;
      return (x === ka && y === kb) || (x === kb && y === ka);
    });
  },

  /** Dois assentamentos podem comerciar: mesmo reino, ou reinos que se conhecem, em paz e sem ódio. */
  canTrade(this: Ecosystem, v: Village, o: Village): boolean {
    if (v.kingdom === o.kingdom) return true;
    const key = this.key(v.kingdom, o.kingdom);
    if (!this.relations.has(key) && !this.contacts.has(key)) return false;
    return !this.warBetween(v.kingdom, o.kingdom) && this.relation(v.kingdom, o.kingdom) >= -20;
  },

  /** O que dá lucro levar de `v` para `o` (até `load` unidades, no máximo dois bens) e o lucro esperado. */
  offer(this: Ecosystem, v: Village, o: Village, load: number, skip: (Good | 'food')[] = []): { cargo: Cargo[]; profit: number } {
    const rows: { good: Good | 'food'; amount: number; per: number }[] = [];
    for (const g of [...GOODS, 'food'] as (Good | 'food')[]) {
      if (!tradable(g) || skip.includes(g)) continue;
      const have = this.amountOf(v, g);
      let spare = have - this.capOf(v, g) * B.CARAVAN_KEEP;
      if (g === 'food') spare = Math.min(spare, v.food - v.population * B.CONSUME_FOOD * 0.5);
      if (spare < 2) continue;
      const room = this.capOf(o, g) - this.amountOf(o, g);
      if (room < 2) continue;
      const per = this.priceAt(o, g) - this.priceAt(v, g);
      if (per <= 0.1) continue;
      rows.push({ good: g, amount: Math.min(spare, room), per });
    }
    rows.sort((p, q) => q.per - p.per);
    const cargo: Cargo[] = [];
    let profit = 0;
    let left = load;
    for (const r of rows.slice(0, 2)) {
      const amount = Math.floor(Math.min(r.amount, left));
      if (amount < 1) continue;
      cargo.push({ good: r.good, amount });
      profit += amount * r.per;
      left -= amount;
    }
    return { cargo, profit };
  },

  /** Luxo da região: produção, o gosto dos ricos e o sal (RF-VIDA-282). */
  luxuryYear(this: Ecosystem, v: Village): void {
    if (v.luxury === undefined) v.luxury = this.luxuryOf(v);
    const era = Math.floor(v.tech);
    if (v.luxury && era >= LUXURY_ERA[v.luxury]) this.gain(v, v.luxury, B.LUXURY_MAKE * (1 + this.scale(v)) * (v.vocation === 'mercantil' ? 1.4 : 1));
    v.luxuryJoy = false;
    if (!v.needs || welfare(v.needs) < 0.75) return;
    for (const l of LUXURIES) {
      if (l === 'salt' || v.stock[l] < 0.5) continue;
      this.spend(v, l, Math.min(v.stock[l], Math.max(0.5, v.population * B.LUXURY_USE)));
      v.luxuryJoy = true;
    }
  },

  /** Luxo que a região em volta dá, sem sorteio. */
  luxuryOf(this: Ecosystem, v: Village): Luxury | null {
    const r = this.radius(v) + 6;
    let n = 0;
    let jungle = 0;
    let savanna = 0;
    let forest = 0;
    let fertile = 0;
    let dry = 0;
    let temp = 0;
    for (let dy = -r; dy <= r; dy += 2) {
      for (let dx = -r; dx <= r; dx += 2) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(v.x + dx, Math.floor(v.y + dy));
        if (t < 0 || !isLand(this.map, t)) continue;
        n++;
        const b = this.map.biome[t] as Biome;
        if (b === Biome.Jungle || b === Biome.Mangrove) jungle++;
        if (b === Biome.Savanna) savanna++;
        if (isForestBiome(b)) forest++;
        if (b === Biome.Desert || b === Biome.Beach || b === Biome.Barren) dry++;
        if (this.map.vegetation[t] > 0.45) fertile++;
        temp += temperatureAt(this.map, t);
      }
    }
    n = Math.max(1, n);
    return pickLuxury({ jungle: jungle / n, savanna: savanna / n, forest: forest / n, fertile: fertile / n, dry: dry / n, temp: temp / n, coast: this.coastal(v) });
  },

  /**
   * Uma vez por ano: feiras, pedidos da capital, moeda cunhada, acordos que
   * vencem ou caducam e as estradas que nascem e melhoram pelo uso.
   */
  tradeYear(this: Ecosystem): void {
    const year = Math.floor(this.year + 0.01);
    for (const v of this.villages) {
      if (v.abandoned) continue;
      // Feira anual (RF-VIDA-234): no verão, nas vilas e cidades mercantis.
      if (v.vocation === 'mercantil' && this.scale(v) >= 1 && v.population >= 20) {
        v.fair = year;
        this.note(`Feira anual em ${v.name}`, 'economia', v, { key: `fair-${v.id}` });
      }
      // Moeda cunhada pelo reino (RF-VIDA-291).
      if (v.kingdom === v.id && !v.mint && Math.floor(v.tech) >= 3 && this.knew(v, 'moeda') && this.has(v, 'market')) {
        v.mint = true;
        this.note(`O reino de ${v.name} passou a cunhar moeda própria`, 'economia', v, { major: true });
      }
      // Pedido que venceu sem resposta conta como recusa.
      if (v.request && year > v.request.until) {
        v.request = undefined;
        v.refused = (v.refused ?? 0) + 1;
        v.stability = Math.max(0, (v.stability ?? 0.5) - 0.05);
        this.note(`${v.name} não atendeu o pedido da capital ${this.villages[v.kingdom].name}`, 'povo', v, { key: `refuse-${v.id}` });
      }
    }
    this.capitalRequests(year);
    for (let k = this.agreements.length - 1; k >= 0; k--) {
      const g = this.agreements[k];
      const a = this.villages[g.a];
      const b = this.villages[g.b];
      if (a.abandoned || b.abandoned || this.year > g.until) {
        this.agreements.splice(k, 1);
        continue;
      }
      // Sem viagens no prazo, o acordo caduca e a relação piora um pouco.
      if (this.year - g.last > g.every * 2 + 1) {
        this.agreements.splice(k, 1);
        if (a.kingdom !== b.kingdom) {
          const key = this.key(a.kingdom, b.kingdom);
          this.relations.set(key, Math.max(-100, this.relation(a.kingdom, b.kingdom) - B.AGREEMENT_BROKEN / 2));
        }
        this.note(`O acordo entre ${a.name} e ${b.name} caducou`, 'economia', a, { key: `ag-end-${g.a}-${g.b}` });
      }
    }
    this.trafficYear();
  },

  /** A capital pede às colônias o que falta a ela (RF-VIDA-289). */
  capitalRequests(this: Ecosystem, year: number): void {
    for (const capital of this.villages) {
      if (capital.abandoned || capital.kingdom !== capital.id || !happens(this.polRnd, B.REQUEST_RATE, 1)) continue;
      let best: { c: Village; g: Good | 'food'; spare: number } | null = null;
      for (const g of ['food', 'wood', 'stone', 'cloth', 'tools', ...LUXURIES] as (Good | 'food')[]) {
        if (this.amountOf(capital, g) > this.capOf(capital, g) * 0.15) continue;
        if (LUXURIES.includes(g as Luxury) && (!capital.needs || welfare(capital.needs) < 0.75)) continue;
        for (const c of this.villages) {
          if (c === capital || c.abandoned || c.kingdom !== capital.id || c.request) continue;
          if (this.distance(c, capital.x, capital.y) > B.CARAVAN_RANGE * 1.5 || !this.landPath(c.x, c.y, capital.x, capital.y)) continue;
          const spare = this.amountOf(c, g) - this.capOf(c, g) * 0.5;
          if (spare >= 2 && (!best || spare > best.spare)) best = { c, g, spare };
        }
      }
      if (!best) continue;
      best.c.request = { good: best.g, amount: Math.min(B.REQUEST_LOAD, Math.floor(best.spare)), until: year + B.REQUEST_YEARS };
      this.note(`A capital ${capital.name} pediu ${this.goodName(best.g)} a ${best.c.name}`, 'povo', best.c, { key: `ask-${capital.id}` });
    }
  },

  /** Guerra entre dois reinos quebra os acordos entre eles (RF-VIDA-232). */
  breakAgreements(this: Ecosystem, ka: number, kb: number): void {
    for (let k = this.agreements.length - 1; k >= 0; k--) {
      const g = this.agreements[k];
      const x = this.villages[g.a].kingdom;
      const y = this.villages[g.b].kingdom;
      if (!((x === ka && y === kb) || (x === kb && y === ka))) continue;
      this.agreements.splice(k, 1);
      this.relations.set(this.key(ka, kb), Math.max(-100, this.relation(ka, kb) - B.AGREEMENT_BROKEN));
      this.note(`A guerra rompeu o acordo entre ${this.villages[g.a].name} e ${this.villages[g.b].name}`, 'economia', this.villages[g.a], { key: `ag-war-${g.a}-${g.b}` });
    }
  },

  /**
   * Estrada pelo uso (RF-VIDA-233): onde as caravanas passam muito nasce uma
   * estrada de terra; fora das cidades ela vira cascalho e, com uso e
   * técnica (Idade do Ferro), pedra. O uso cai aos poucos sem movimento.
   */
  trafficYear(this: Ecosystem): void {
    const map = this.map;
    const w = map.width;
    const fresh: number[] = [];
    for (const t of this.trafficTiles) {
      const n = this.traffic[t];
      const x = (t % w) + 0.5;
      const y = Math.floor(t / w) + 0.5;
      if (n >= B.ROUTE_USE && this.road[t] === 0 && !this.built[t] && isLand(map, t) && this.depositAt[t] < 0) {
        this.setRoad(t, 1);
        fresh.push(t);
        this.routeTiles++;
      } else if (this.road[t] === 1 && n >= B.GRAVEL_USE && !this.settlementAt(x, y)) {
        this.road[t] = GRAVEL;
        this.onTileChanged(t);
      } else if (this.road[t] === GRAVEL && n >= B.STONE_USE && this.trafficEra[t] >= 2) {
        this.road[t] = 2;
        this.onTileChanged(t);
      }
      const next = Math.floor(n * (1 - B.TRAFFIC_DECAY));
      this.traffic[t] = next;
      if (!next) {
        this.trafficTiles.delete(t);
        this.trafficEra[t] = 0;
      }
    }
    if (fresh.length) this.pruneRoads(fresh);
  },

  /** Moeda de um assentamento hoje (RF-VIDA-291), pelo nome. */
  currencyName(this: Ecosystem, v: Village): number {
    return currencyOf(Math.floor(v.tech), !!this.villages[v.kingdom].mint);
  },
};
export type MarketsPart = typeof marketsPart;
