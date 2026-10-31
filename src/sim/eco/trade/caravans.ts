/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): caravanas, barcos mercantes, venda, pedágio, tributo e rebanhos na estrada.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { binomial, happens } from '../../stochastic';
import * as P from '../../progress';
import { Biome } from '../../../procgen/surface';
import type { Good } from '../../economy';
import { CHILD, ROLE } from '../../roles';
import { pairKey } from '../../community';
import { CURRENCY_EFFICIENCY, caravanCap, cartOf, currencyOf, packAnimal, type Caravan, type Cargo, type Crew } from '../../trade';
import { emptyVital, type DeathCause } from '../../people';
import { wrapDx } from '../../settlement';
import { ecologyOf, hunts } from '../../fauna';
import type { Boat, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS, BOATS } = constantsModule;
const { elderAge } = helpersModule;
const { isLand } = tilesModule;

export const caravansPart = {
  /** Um adulto para viajar: de preferência comerciante (ou pastor, no rebanho), nunca o líder. */
  traveler(this: Ecosystem, v: Village, role: number): number {
    let pick = -1;
    for (const i of this.residents(v.id)) {
      if (i === v.leader || this.role[i] === CHILD) continue;
      if (this.age[i] >= elderAge(this.species[v.species], Math.floor(v.tech))) continue;
      if (this.role[i] === role) return i;
      if (pick < 0) pick = i;
    }
    return pick;
  },

  /** Tira o viajante do mapa (ele vai junto com a caravana) e guarda quem ele é. */
  embark(this: Ecosystem, i: number): Crew {
    const crew: Crew = { age: this.age[i], role: this.role[i], who: this.identity(i) };
    this.kill(i, true, 'partiu');
    return crew;
  },

  /** O viajante volta para casa. */
  disembark(this: Ecosystem, v: Village, crew: Crew, x: number, y: number): void {
    if (v.abandoned) return;
    const c = this.spawn(v.species, x, y, v.id, crew.age);
    if (c < 0) return;
    this.role[c] = crew.role;
    this.restore(c, crew.who, true);
  },

  /** O viajante morreu no caminho: a saída vira morte, com a causa. */
  lostCrew(this: Ecosystem, v: Village, crew: Crew, cause: DeathCause, x: number, y: number): void {
    const vital = (v.vitalNow ??= emptyVital());
    vital.left = Math.max(0, vital.left - 1);
    vital.deaths[cause] = (vital.deaths[cause] ?? 0) + 1;
    if (crew.who) {
      this.deaths.unshift({ uid: crew.who.uid, cause, age: crew.age, x, y });
      if (this.deaths.length > 64) this.deaths.pop();
    }
  },

  /**
   * Saída de caravanas (RF-VIDA-230 e 236): o tributo pedido pela capital
   * vai primeiro; depois, de vez em quando, uma caravana de comércio para o
   * destino com mais lucro; no verão, o rebanho sobe para o pasto alto.
   */
  sendCaravan(this: Ecosystem, v: Village, yr: number): void {
    if (v.herd && !v.herd.away && v.herd.head >= B.TRANSHUMANCE_HEAD && this.season() === 1 && v.herd.kind !== 'horse' && v.herd.kind !== 'camel' && happens(this.civRnd, 3, yr)) this.sendFlock(v);
    if (v.tech < 0.5 || v.population < 8) return;
    const merc = v.vocation === 'mercantil';
    const market = this.has(v, 'market');
    if ((this.scale(v) < 1 && !merc && !market && !v.request) || this.snowed(v.x, v.y)) return;
    if (this.tradeInMotion() >= B.CARAVANS_MAX || this.caravansOf(v) >= caravanCap(this.scale(v), merc)) return;
    if (v.request && happens(this.civRnd, 2, yr)) {
      this.sendTribute(v);
      return;
    }
    if (this.scale(v) < 1 && !merc && !market) return;
    if (!happens(this.civRnd, B.CARAVAN_RATE * (merc ? 2 : 1) * (market ? 1.5 : 1), yr)) return;
    const era = Math.floor(v.tech);
    const load = B.CARAVAN_LOAD * (2 + Math.min(2, this.scale(v)));
    const year = Math.floor(this.year);
    const boat = BOATS[Math.min(BOATS.length - 1, era)];
    let best: { o: Village; cargo: Cargo[]; d: number } | null = null;
    let top = 0;
    for (const o of this.villages) {
      if (o === v || o.abandoned || o.population < 3) continue;
      const fair = o.fair === year;
      const d = this.distance(o, v.x, v.y);
      const byLand = d <= B.CARAVAN_RANGE * (fair ? 1.5 : 1);
      const bySea = v.port >= 0 && o.port >= 0 && era >= 1 && d <= boat.range;
      if ((!byLand && !bySea) || !this.canTrade(v, o)) continue;
      const deal = this.offer(v, o, load);
      if (!deal.cargo.length) continue;
      let score = deal.profit - d * B.CARAVAN_TRIP_COST;
      if (this.agreementOf(v.id, o.id)) score *= B.AGREEMENT_PREFERENCE;
      if (fair) score *= B.FAIR_PREFERENCE;
      if (v.kingdom === o.kingdom && this.villages[v.kingdom].mint) score *= B.MINT_PREFERENCE;
      if (score > top) {
        top = score;
        best = { o, cargo: deal.cargo, d };
      }
    }
    if (!best) return;
    const { o, cargo, d } = best;
    const path = d <= B.CARAVAN_RANGE * 1.5 && this.landPath(v.x, v.y, o.x, o.y) ? this.roadPath(v.x, v.y, o.x, o.y) : null;
    if (path && path.length > 1) this.launchCaravan(v, o, 'trade', path, cargo);
    else if (v.port >= 0 && o.port >= 0 && era >= 1) this.launchTradeBoat(v, o, cargo);
  },

  /** Põe a caravana na estrada, com a carga tirada do estoque e um pouco de ouro para comprar na volta. */
  launchCaravan(this: Ecosystem, v: Village, o: Village, kind: 'trade' | 'tribute', path: number[], cargo: Cargo[]): boolean {
    const i = this.traveler(v, ROLE.merchant);
    if (i < 0) return false;
    for (const c of cargo) {
      c.amount = Math.min(c.amount, this.amountOf(v, c.good));
      this.addTo(v, c.good, -c.amount);
      this.book(v, 'saiu', 0, c.amount);
    }
    const purse = kind === 'trade' ? Math.min(v.stock.gold, 3 + this.scale(v) * 2) : 0;
    v.stock.gold -= purse;
    const era = Math.floor(v.tech);
    const animal = packAnimal(v.material === 'adobe' || v.herd?.kind === 'camel', v.stock.horses);
    const w = this.map.width;
    this.caravans.push({
      id: this.nextCaravan++,
      kind,
      home: v.id,
      target: o.id,
      path,
      step: 0,
      x: (path[0] % w) + 0.5,
      y: Math.floor(path[0] / w) + 0.5,
      facing: 1,
      back: false,
      animal,
      animals: 1 + Math.min(2, this.scale(v)),
      cart: cartOf(era),
      cargo: cargo.filter((c) => c.amount >= 1),
      purse,
      crew: this.embark(i),
      speed: B.CARAVAN_SPEED * (animal === 'horse' ? B.HORSE_SPEED : 1),
      wait: 0,
      tolls: [],
      era,
    });
    return true;
  },

  /** Barco mercante (RF-VIDA-235): de porto a porto, com os perigos do mar. */
  launchTradeBoat(this: Ecosystem, v: Village, o: Village, cargo: Cargo[]): boolean {
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(v.tech))];
    let found = false;
    this.searchSea(v.port, 400000, type.range, (t) => (found = t === o.port));
    if (!found) return false;
    const path: number[] = [];
    for (let t = o.port; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    const i = this.traveler(v, ROLE.merchant);
    if (i < 0) return false;
    let room = B.TRADE_BOAT_LOAD;
    for (const c of cargo) {
      c.amount = Math.min(c.amount, this.amountOf(v, c.good), room);
      room -= c.amount;
      this.addTo(v, c.good, -c.amount);
      this.book(v, 'saiu', 0, c.amount);
    }
    const purse = Math.min(v.stock.gold, 3 + this.scale(v) * 2);
    v.stock.gold -= purse;
    const boat = this.launch(v, 'trade', path, -1, [this.embark(i)]);
    boat.trade = { target: o.id, cargo: cargo.filter((c) => c.amount >= 1), purse, back: false };
    return true;
  },

  /** O barco mercante chegou: vende e volta, ou entrega em casa. Retorna se acabou a viagem. */
  tradeBoatArrived(this: Ecosystem, b: Boat): boolean {
    const t = b.trade!;
    const home = this.villages[b.village];
    const o = this.villages[t.target];
    if (!t.back) {
      if (!o.abandoned) this.sell(home, o, t, 'trade', true);
      t.back = true;
      b.path.reverse();
      b.step = 0;
      return false;
    }
    this.unload(home, t.cargo, t.purse);
    const w = this.map.width;
    for (const p of b.passengers) this.disembark(home, p, (home.port % w) + this.civRnd(), Math.floor(home.port / w) + this.civRnd());
    return true;
  },

  /**
   * Chegada ao destino: entrega a carga (até o teto), recebe pelo valor na
   * moeda da era (no escambo, só em bens, RF-VIDA-291), compra a carga da
   * volta e soma relação, conhecimento e o acordo (RF-VIDA-231, 232 e 74).
   */
  sell(this: Ecosystem, v: Village, o: Village, t: { cargo: Cargo[]; purse: number }, kind: Caravan['kind'], sea = false): void {
    const era = Math.min(Math.floor(v.tech), Math.floor(o.tech));
    const minted = !!this.villages[o.kingdom].mint && v.kingdom === o.kingdom;
    const eff = CURRENCY_EFFICIENCY[currencyOf(era, minted || !!this.villages[o.kingdom].mint)];
    let value = 0;
    const sold = t.cargo[0]?.good;
    if (kind === 'trade') this.inspire(o, t.cargo.map((c) => c.good), v);
    for (const c of t.cargo) {
      const put = Math.max(0, Math.min(c.amount, this.capOf(o, c.good) - this.amountOf(o, c.good)));
      value += put * this.priceAt(o, c.good);
      this.addTo(o, c.good, put);
      this.book(o, 'chegou', put, 0);
      c.amount -= put;
    }
    t.cargo = t.cargo.filter((c) => c.amount >= 1);
    if (kind === 'tribute') {
      v.stability = Math.min(1, (v.stability ?? 0.5) + B.REQUEST_STABILITY);
      v.refused = Math.max(0, (v.refused ?? 0) - 1);
      this.note(`${v.name} atendeu o pedido da capital ${o.name}`, 'economia', o, { key: `tribute-${v.id}` });
      return;
    }
    // Pagamento: ouro na moeda da era, ou bens de igual valor no escambo.
    let budget: number;
    if (eff <= 0) budget = value;
    else {
      const gold = Math.min(o.stock.gold, (value * eff) / B.GOLD_VALUE);
      o.stock.gold -= gold;
      t.purse += gold;
      budget = t.purse * B.GOLD_VALUE;
    }
    const load = (sea ? B.TRADE_BOAT_LOAD : B.CARAVAN_LOAD * (2 + Math.min(2, this.scale(v)))) - t.cargo.reduce((n, c) => n + c.amount, 0);
    // A volta traz outro bem (ninguém leva ferramentas para trazer ferramentas).
    const back = this.offer(o, v, load, t.cargo.map((c) => c.good).concat(sold ? [sold] : []));
    let bought: Good | 'food' | undefined;
    for (const c of back.cargo) {
      const each = this.priceAt(o, c.good);
      const n = Math.floor(Math.min(c.amount, budget / Math.max(0.1, each)));
      if (n < 1) continue;
      budget -= n * each;
      if (eff > 0) {
        const pay = Math.min(t.purse, (n * each) / B.GOLD_VALUE);
        t.purse -= pay;
        o.stock.gold = Math.min(this.capOf(o, 'gold'), o.stock.gold + pay);
      }
      this.addTo(o, c.good, -n);
      this.book(o, 'saiu', 0, n);
      t.cargo.push({ good: c.good, amount: n });
      bought ??= c.good;
    }
    // Relação, conhecimento e acordo.
    const fair = o.fair === Math.floor(this.year);
    if (v.kingdom !== o.kingdom) {
      const key = this.key(v.kingdom, o.kingdom);
      const merchants = v.culture.value === 'comércio' || o.culture.value === 'comércio' ? 2 : 1;
      this.relations.set(key, Math.min(100, this.relation(v.kingdom, o.kingdom) + B.CARAVAN_RELATION * merchants + (fair ? B.FAIR_RELATION : 0)));
      this.contacts.add(key);
      this.caravanPairs.add(key);
      this.note(`Uma caravana de ${v.name} levou ${sold ? this.goodName(sold) : 'mercadorias'} até ${o.name}${sea ? ' pelo mar' : ''}`, 'economia', o, { key: `caravan:${key}` });
    }
    const teach = B.TRADE_TEACH * (fair ? 3 : 1);
    if (o.tech > v.tech) this.advance(v, (o.tech - v.tech) * teach);
    else if (v.tech > o.tech) this.advance(o, (v.tech - o.tech) * teach);
    this.shareTech(v, o, Math.min(1, P.TECH_TRADE_CHANCE * (fair ? 3 : 1)));
    const pair = this.key(v.id, o.id);
    const ag = this.agreementOf(v.id, o.id);
    if (ag) {
      ag.last = this.year;
      ag.kept++;
      if (v.kingdom !== o.kingdom) {
        const key = this.key(v.kingdom, o.kingdom);
        this.relations.set(key, Math.min(100, this.relation(v.kingdom, o.kingdom) + B.AGREEMENT_KEPT));
      }
    } else if (sold && bought) {
      const n = (this.trips.get(pair) ?? 0) + 1;
      this.trips.set(pair, n);
      if (n >= B.AGREEMENT_TRIPS && (v.kingdom === o.kingdom || this.relation(v.kingdom, o.kingdom) >= B.AGREEMENT_RELATION)) {
        const every = v.vocation === 'mercantil' || o.vocation === 'mercantil' ? 1 : 2;
        this.agreements.push({ a: v.id, b: o.id, goods: [sold, bought], since: this.year, until: this.year + B.AGREEMENT_YEARS, every, last: this.year, kept: 0 });
        this.trips.delete(pair);
        this.note(`${v.name} e ${o.name} firmaram um acordo: ${this.goodName(sold)} por ${this.goodName(bought)}, ${every === 1 ? 'todo ano' : `a cada ${every} anos`}`, 'economia', o, { major: v.kingdom !== o.kingdom });
      }
    }
  },

  /** Descarrega em casa a carga e o ouro que voltaram (o que não cabe se perde). */
  unload(this: Ecosystem, v: Village, cargo: Cargo[], purse: number): void {
    if (v.abandoned) return;
    for (const c of cargo) {
      const put = Math.max(0, Math.min(c.amount, this.capOf(v, c.good) - this.amountOf(v, c.good)));
      this.addTo(v, c.good, put);
      this.book(v, 'chegou', put, 0);
    }
    v.stock.gold = Math.min(this.capOf(v, 'gold'), v.stock.gold + purse);
  },

  /** Movimento das caravanas e rebanhos, pedágios, neve e os perigos do caminho. */
  updateCaravans(this: Ecosystem, dt: number): void {
    const w = this.map.width;
    for (let k = this.caravans.length - 1; k >= 0; k--) {
      const c = this.caravans[k];
      const home = this.villages[c.home];
      if (c.wait > 0) {
        c.wait -= dt;
        continue;
      }
      let t = c.path[Math.min(c.step, c.path.length - 1)];
      // A estrada virou água, lava ou penhasco (terraformação, cometa, terremoto): refaz o caminho por terra
      // até o fim da rota; sem caminho, a viagem acaba e quem ia volta para casa com a carga (seção 19.18).
      if (!isLand(this.map, t)) {
        const end = c.path[c.path.length - 1];
        const path = isLand(this.map, end) ? this.roadPath(c.x, c.y, (end % w) + 0.5, Math.floor(end / w) + 0.5) : null;
        if (!path || path.length < 2) {
          this.unload(home, c.cargo, c.purse);
          if (c.kind === 'flock' && home.herd) home.herd.away = undefined;
          this.disembark(home, c.crew, home.x, home.y);
          this.caravans.splice(k, 1);
          continue;
        }
        c.path = path;
        c.step = 0;
        t = path[0];
      }
      // Inverno nas terras frias: a caravana espera a neve passar (RF-VIDA-290).
      if (c.kind !== 'flock' && this.snowed(c.x, c.y)) continue;
      const tx = (t % w) + 0.5;
      const ty = Math.floor(t / w) + 0.5;
      const dx = wrapDx(tx - c.x, w);
      const dy = ty - c.y;
      const d = Math.hypot(dx, dy);
      const move = Math.min(d, c.speed * dt);
      if (d > 0.01) {
        c.x = (((c.x + (dx / d) * move) % w) + w) % w;
        c.y += (dy / d) * move;
        if (Math.abs(dx) > 0.05) c.facing = dx > 0 ? 1 : -1;
      }
      if (d - move < 0.05) {
        if (this.traffic[t] < 65535) this.traffic[t]++;
        if (this.trafficEra[t] < c.era) this.trafficEra[t] = c.era;
        this.trafficTiles.add(t);
        if (c.kind === 'trade') this.tollAt(c, t);
        if (this.raided(c, t)) {
          this.caravans.splice(k, 1);
          continue;
        }
        c.step++;
        if (c.step >= c.path.length && this.arrived(c)) {
          this.caravans.splice(k, 1);
          continue;
        }
      }
      // Predadores atacam animais de carga e rebanhos.
      let predators = 0;
      this.forEachNear(c.x, c.y, 3, (j) => {
        if (this.species[this.kind[j]].kind === 'predator' && hunts(ecologyOf(this.species[this.kind[j]]))) predators++;
      });
      if (predators && happens(this.civRnd, B.CARAVAN_PREDATOR * predators, dt / YEAR_SECONDS)) {
        if (c.kind === 'flock') {
          c.animals = Math.max(0, c.animals - 1);
          if (home.herd) home.herd.head = Math.max(0, home.herd.head - 1);
          this.note(`Predadores atacaram o rebanho de ${home.name} no caminho do pasto`, 'natureza', c, { key: `flock-pred-${home.id}` });
          continue;
        }
        c.animals--;
        for (const g of c.cargo) g.amount = Math.floor(g.amount * 0.6);
        if (c.animals <= 0 || this.civRnd() < 0.25) {
          this.lostCrew(home, c.crew, 'predador', c.x, c.y);
          this.note(`Predadores atacaram uma caravana de ${home.name}: o comerciante morreu`, 'natureza', c, { key: `caravan-pred-${home.id}` });
          this.caravans.splice(k, 1);
        }
      }
    }
  },

  /** Inimigos em guerra roubam a caravana que passa perto deles. Retorna se ela se perdeu. */
  raided(this: Ecosystem, c: Caravan, t: number): boolean {
    const home = this.villages[c.home];
    const foes = this.enemies.get(home.kingdom);
    if (!foes?.size || c.kind === 'flock' || c.kind === 'visit') return false;
    const w = this.map.width;
    const x = (t % w) + 0.5;
    const y = Math.floor(t / w) + 0.5;
    for (const o of this.villages) {
      if (o.abandoned || !foes.has(o.kingdom) || this.distance(o, x, y) > this.radius(o) + 8) continue;
      if (this.civRnd() > B.CARAVAN_RAID) return false;
      for (const g of c.cargo) {
        const put = Math.max(0, Math.min(g.amount, this.capOf(o, g.good) - this.amountOf(o, g.good)));
        this.addTo(o, g.good, put);
      }
      o.stock.gold = Math.min(this.capOf(o, 'gold'), o.stock.gold + c.purse);
      this.lostCrew(home, c.crew, 'guerra', x, y);
      this.note(`Soldados de ${o.name} saquearam uma caravana de ${home.name}`, 'guerra', { x, y }, { key: `raid-${home.id}-${o.kingdom}` });
      return true;
    }
    return false;
  },

  /**
   * Pedágio (RF-VIDA-286): no passo de montanha perto de outro reino, a
   * caravana paga uma vez por viagem, a não ser que os reinos tenham acordo.
   */
  tollAt(this: Ecosystem, c: Caravan, t: number): void {
    const map = this.map;
    if (!(map.biome[t] === Biome.Mountain || map.elevation[t] > 0.45)) return;
    const home = this.villages[c.home];
    const w = map.width;
    const x = (t % w) + 0.5;
    const y = Math.floor(t / w) + 0.5;
    let owner: Village | null = null;
    let bd: number = B.TOLL_RANGE;
    for (const o of this.villages) {
      if (o.abandoned || o.kingdom === home.kingdom || o.tech < 1) continue;
      const d = this.distance(o, x, y);
      if (d < bd) {
        bd = d;
        owner = o;
      }
    }
    if (!owner || c.tolls.includes(owner.kingdom) || this.agreedKingdoms(home.kingdom, owner.kingdom)) return;
    c.tolls.push(owner.kingdom);
    const due = B.TOLL_GOLD * (1 + Math.floor(owner.tech) * 0.5);
    const paid = Math.min(c.purse, due);
    c.purse -= paid;
    if (paid < due && c.cargo.length) c.cargo[0].amount = Math.max(0, c.cargo[0].amount - 1);
    owner.stock.gold = Math.min(this.capOf(owner, 'gold'), owner.stock.gold + paid);
    const key = this.key(home.kingdom, owner.kingdom);
    this.relations.set(key, Math.max(-100, this.relation(home.kingdom, owner.kingdom) - B.TOLL_TENSION));
    let post = false;
    for (const [p, by] of this.tolls) {
      if (by === owner.id && Math.hypot(wrapDx((p % w) + 0.5 - x, w), Math.floor(p / w) + 0.5 - y) < 6) post = true;
    }
    if (!post) {
      this.tolls.set(t, owner.id);
      this.note(`${owner.name} passou a cobrar pedágio no passo da montanha`, 'economia', { x, y }, { key: `toll-${owner.id}` });
    }
  },

  /**
   * Amostras na carga (RF-VIDA-421): ferramenta, metal, tijolo ou pano de quem
   * já domina a técnica inspiram os trabalhadores de quem ainda não a conhece.
   */
  inspire(this: Ecosystem, o: Village, goods: (Good | 'food')[], maker: Village): void {
    const known = this.knows(o);
    for (const id of P.sampleTechs(goods, this.knows(maker))) {
      if (known.has(id)) continue;
      const t = P.TECH_BY_ID[id];
      if (!t || !t.needs.every((n) => known.has(n))) continue;
      const fresh = (o.samples?.[id] ?? -Infinity) <= this.year;
      (o.samples ??= {})[id] = this.year + P.TECH_SAMPLE_YEARS;
      if (fresh) this.note(`Uma amostra de ${maker.name} deixou os artesãos de ${o.name} curiosos sobre ${t.name}`, 'economia', o, { key: `sample-${o.id}-${id}` });
    }
  },

  /** A caravana chegou ao fim do caminho. Retorna se a viagem acabou. */
  arrived(this: Ecosystem, c: Caravan): boolean {
    const home = this.villages[c.home];
    // Caravana chegando junta curiosos na praça (RF-AS-29).
    const at = this.villages[c.back ? c.home : c.target];
    if (at && !at.abandoned) at.curiousUntil = this.year + B.CURIOUS_SPAN;
    // Troca entre os dois lugares conta para a afinidade e a lealdade (RF-AS-43 e 49).
    if ((c.kind === 'trade' || c.kind === 'tribute') && !c.back) this.pairTrades.set(pairKey(c.home, c.target), (this.pairTrades.get(pairKey(c.home, c.target)) ?? 0) + 1);
    // Enxoval dos colonos (RF-AS-03): chega ao lugar novo, descarrega e quem levou fica morando lá.
    if (c.kind === 'settlers') {
      this.unload(home, c.cargo, 0);
      this.disembark(home, c.crew, c.x, c.y);
      return true;
    }
    // Ajuda (RF-AS-45) e visita (RF-AS-42): entrega ou fica um pouco, e volta para casa.
    if (c.kind === 'aid' || c.kind === 'visit') {
      if (!c.back) {
        const o = this.villages[c.target];
        if (!o.abandoned) {
          if (c.kind === 'aid') {
            this.unload(o, c.cargo, 0);
            this.addAffinity(home.id, o.id, B.AFFINITY_AID);
            this.note(`A ajuda de ${home.name} chegou a ${o.name}`, 'economia', o, { key: `aid-in-${o.id}` });
          } else this.addAffinity(home.id, o.id, 1);
        }
        c.cargo = [];
        c.back = true;
        c.path.reverse();
        c.step = 0;
        c.wait = c.kind === 'visit' ? 2 : 0.5;
        return false;
      }
      this.disembark(home, c.crew, c.x, c.y);
      return true;
    }
    if (c.kind === 'flock') {
      if (!c.back) {
        // No pasto alto até o outono.
        const phase = this.actionPhase();
        c.wait = Math.max(0.5, (0.5 - phase) * YEAR_SECONDS);
        c.back = true;
        c.path.reverse();
        c.step = 0;
        return false;
      }
      if (home.herd && !home.abandoned) {
        home.herd.head += binomial(this.civRnd, c.animals, B.TRANSHUMANCE_GROWTH);
        home.herd.away = undefined;
      }
      this.disembark(home, c.crew, c.x, c.y);
      return true;
    }
    if (!c.back) {
      const o = this.villages[c.target];
      if (!o.abandoned) this.sell(home, o, c, c.kind);
      c.back = true;
      c.path.reverse();
      c.step = 0;
      c.tolls = [];
      // Um tempo no mercado (mais na feira).
      c.wait = o.fair === Math.floor(this.year) ? 3 : 1;
      return false;
    }
    this.unload(home, c.cargo, c.purse);
    this.disembark(home, c.crew, c.x, c.y);
    return true;
  },

  /** A colônia manda à capital o que ela pediu (RF-VIDA-289). */
  sendTribute(this: Ecosystem, v: Village): void {
    const r = v.request!;
    const capital = this.villages[v.kingdom];
    const amount = Math.floor(Math.min(r.amount, this.amountOf(v, r.good) - this.capOf(v, r.good) * 0.2));
    if (capital === v || capital.abandoned || amount < 1) return;
    const path = this.roadPath(v.x, v.y, capital.x, capital.y);
    if (!path || path.length < 2) return;
    if (this.launchCaravan(v, capital, 'tribute', path, [{ good: r.good, amount }])) v.request = undefined;
  },

  /** Transumância (RF-VIDA-293): pastores levam parte do rebanho a um pasto alto no verão. */
  sendFlock(this: Ecosystem, v: Village): void {
    const h = v.herd!;
    const map = this.map;
    const home = map.elevation[this.tileAt(v.x, Math.floor(v.y))] ?? 0;
    let goal = -1;
    for (let k = 0; k < 30 && goal < 0; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.radius(v) + 8 + this.civRnd() * (B.TRANSHUMANCE_RANGE - 8);
      const t = this.tileAt(v.x + Math.cos(a) * d, Math.floor(v.y + Math.sin(a) * d));
      if (t < 0 || !isLand(map, t) || this.built[t] || this.road[t]) continue;
      if (map.elevation[t] < Math.max(0.3, home + 0.12) || map.vegetation[t] < 0.3) continue;
      goal = t;
    }
    if (goal < 0) return;
    const w = map.width;
    const path = this.roadPath(v.x, v.y, (goal % w) + 0.5, Math.floor(goal / w) + 0.5);
    if (!path || path.length < 4) return;
    const i = this.traveler(v, ROLE.shepherd);
    if (i < 0) return;
    const animals = Math.max(2, Math.floor(h.head / 2));
    h.away = animals;
    // Cruzar terra de outro reino sem acordo gera briga.
    const crossed = new Set<number>();
    for (let s = 0; s < path.length; s += 4) {
      const px = (path[s] % w) + 0.5;
      const py = Math.floor(path[s] / w) + 0.5;
      for (const o of this.villages) {
        if (!o.abandoned && o.kingdom !== v.kingdom && this.distance(o, px, py) < this.radius(o) + 6) crossed.add(o.kingdom);
      }
    }
    for (const k of crossed) {
      if (this.agreedKingdoms(v.kingdom, k)) continue;
      const key = this.key(v.kingdom, k);
      this.relations.set(key, Math.max(-100, this.relation(v.kingdom, k) - B.TRANSHUMANCE_TENSION));
      this.note(`Pastores de ${v.name} levaram o rebanho pelas terras de ${this.villages[k].name}`, 'povo', v, { key: `cross-${v.id}-${k}` });
    }
    this.caravans.push({
      id: this.nextCaravan++,
      kind: 'flock',
      home: v.id,
      target: -1,
      path,
      step: 0,
      x: (path[0] % w) + 0.5,
      y: Math.floor(path[0] / w) + 0.5,
      facing: 1,
      back: false,
      animal: h.kind,
      animals,
      cart: 0,
      cargo: [],
      purse: 0,
      crew: this.embark(i),
      speed: B.FLOCK_SPEED,
      wait: 0,
      tolls: [],
      era: Math.floor(v.tech),
    });
  },
};
export type CaravansPart = typeof caravansPart;
