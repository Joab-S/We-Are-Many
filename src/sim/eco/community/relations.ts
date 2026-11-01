/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): relações entre assentamentos: afinidade, referências, casamentos, ajuda, lealdade e deriva.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { makeCulture, ORE_NAMES } from '../../economy';
import { CHILD, ROLE } from '../../roles';
import { TRAIT, TRAIT_COUNT } from '../../../ai/traits';
import { BOND, partnerOf, touch } from '../../../ai/relations';
import { loyaltyScore, pairKey } from '../../community';
import { personName } from '../../people';
import type { Village } from '../types';
import * as helpersModule from '../helpers';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { elderAge } = helpersModule;

export const relationsPart = {
  /** Um ano de relações (chamado por `yearly`): afinidade, referência, casamentos, visitas, ajuda, rivalidade, lealdade e cultura. */
  relationsYear(this: Ecosystem): void {
    const live = this.villages.filter((v) => !v.abandoned && v.population > 0);
    this.updateAffinity(live);
    this.chooseReferences(live);
    this.marryAcross(live);
    this.sendVisits(live);
    this.askAid(live);
    this.resourceRivalry(live);
    this.updateLoyalty(live);
    this.moveCapitals(live);
    this.driftCultures(live);
    this.pairTrades.clear();
    for (const [k, d] of this.debts) if (d.until <= this.year || this.villages[d.creditor]?.abandoned || this.villages[d.debtor]?.abandoned) this.debts.delete(k);
  },

  /**
   * Afinidade (RF-AS-43): cada par a até AFFINITY_RANGE tiles se aproxima de um alvo somado de laços de
   * família (gente de um que veio do outro), trocas do ano, mesmo povo e mesma fé, e afastado por rancor
   * de guerra. A ajuda, a recusa, a rivalidade e as festas mexem nela na hora em que acontecem.
   */
  updateAffinity(this: Ecosystem, live: Village[]): void {
    const kin = new Map<string, number>();
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.village[i] < 0) continue;
      const o = this.origin[i];
      if (o < 0 || o === this.village[i] || !this.villages[o] || this.villages[o].abandoned) continue;
      const k = pairKey(o, this.village[i]);
      kin.set(k, (kin.get(k) ?? 0) + 1);
    }
    const seen = new Set<string>();
    for (let x = 0; x < live.length; x++) {
      for (let y = x + 1; y < live.length; y++) {
        const a = live[x];
        const b = live[y];
        if (a.species !== b.species || this.distance(a, b.x, b.y) > B.AFFINITY_RANGE) continue;
        const k = pairKey(a.id, b.id);
        seen.add(k);
        let target = B.AFFINITY_KIN * Math.min(30, kin.get(k) ?? 0) + B.AFFINITY_TRADE * Math.min(5, this.pairTrades.get(k) ?? 0);
        if (a.culture.id === b.culture.id) target += B.AFFINITY_PEOPLE * 10;
        if (a.culture.belief === b.culture.belief) target += B.AFFINITY_FAITH * 10;
        if (a.kingdom === b.kingdom) target += 10;
        const grudge = this.grudges.get(this.key(a.kingdom, b.kingdom));
        if (grudge !== undefined && grudge > this.year) target -= B.AFFINITY_GRUDGE * 10;
        if (this.warBetween(a.kingdom, b.kingdom)) target -= 40;
        const now = this.affinities.get(k) ?? 0;
        this.affinities.set(k, Math.max(-100, Math.min(100, now + (target - now) * B.AFFINITY_FADE)));
      }
    }
    // Pares que se afastaram demais (ou sumiram) esquecem devagar.
    for (const [k, n] of this.affinities) {
      if (seen.has(k)) continue;
      const next = n * (1 - B.AFFINITY_FADE);
      if (Math.abs(next) < 1) this.affinities.delete(k);
      else this.affinities.set(k, next);
    }
  },

  /**
   * Cidade de referência (RF-AS-44): cada aldeia e vila escolhe, por nota (distância, tamanho, afinidade
   * e segurança), o lugar maior onde vende o excedente e compra o que falta. Os mercados e suas bacias
   * nascem disso. Quem não tem ninguém maior por perto é a própria referência.
   */
  chooseReferences(this: Ecosystem, live: Village[]): void {
    for (const v of live) v.market = 0;
    for (const v of live) {
      if (v.tier >= 2) {
        v.ref = v.id;
        continue;
      }
      let best = v;
      let bv = -Infinity;
      for (const o of live) {
        if (o === v || o.species !== v.species || o.population <= v.population * 1.3) continue;
        const d = this.distance(o, v.x, v.y);
        if (d > B.MARKET_RANGE) continue;
        const war = this.warBetween(o.kingdom, v.kingdom) ? 10 : 0;
        const value = -d / 10 + Math.log2(o.population) + o.tier + this.affinity(v.id, o.id) / 25 - war + (o.kingdom === v.kingdom ? 1 : 0);
        if (value > bv) {
          bv = value;
          best = o;
        }
      }
      if (best !== v && v.ref !== best.id && v.ref !== undefined && v.ref !== v.id) this.logVillage(v, `passou a vender em ${best.name}`);
      v.ref = best.id;
    }
    for (const v of live) if (v.ref !== undefined && v.ref !== v.id) this.villages[v.ref].market = (this.villages[v.ref].market ?? 0) + 1;
  },

  /** Nota no diário do lugar (crônica sem destaque). */
  logVillage(this: Ecosystem, v: Village, text: string): void {
    this.note(`${v.name} ${text}`, 'economia', v, { key: `log-${v.id}` });
  },

  /**
   * Casamento entre lugares (RF-AS-40): quem não acha par em casa casa com alguém de um vizinho que
   * visita (afinidade alta, perto). O casal mora no lugar com a melhor nota e o laço fica registrado.
   */
  marryAcross(this: Ecosystem, live: Village[]): void {
    const singles = new Map<number, number[]>();
    const sp = (v: Village) => this.species[v.species];
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.village[i] < 0 || this.role[i] === CHILD || this.role[i] >= ROLE.leader) continue;
      const v = this.villages[this.village[i]];
      if (this.age[i] >= elderAge(sp(v), Math.floor(v.tech)) || partnerOf(this.bonds, this.uid[i])) continue;
      const list = singles.get(v.id);
      if (list) list.push(i);
      else singles.set(v.id, [i]);
    }
    for (const v of live) {
      const mine = singles.get(v.id);
      if (!mine || mine.length < 2) continue;
      // Quanto mais solteiros sem par em casa, mais casam fora; só uma parte dos que visitam acha alguém.
      const tries = Math.min(3, Math.floor(mine.length / 6));
      for (let k = 0; k < tries; k++) {
        if (!happens(this.civRnd, B.MARRY_ACROSS, 1)) continue;
        let o: Village | null = null;
        let ov = -Infinity;
        for (const c of live) {
          if (c === v || c.species !== v.species || !(singles.get(c.id)?.length)) continue;
          const d = this.distance(c, v.x, v.y);
          if (d > B.VISIT_RANGE) continue;
          const value = this.affinity(v.id, c.id) / 20 - d / 15 + this.civRnd();
          if (value > ov) {
            ov = value;
            o = c;
          }
        }
        if (!o) continue;
        const theirs = singles.get(o.id)!;
        const a = mine.splice(Math.floor(this.civRnd() * mine.length), 1)[0];
        const b = theirs.splice(Math.floor(this.civRnd() * theirs.length), 1)[0];
        if (a === undefined || b === undefined) continue;
        const ab = touch(this.bonds, this.uid[a], this.uid[b]);
        const ba = touch(this.bonds, this.uid[b], this.uid[a]);
        ab.kind = BOND.partner;
        ba.kind = BOND.partner;
        this.tally.marriages++;
        this.tally.interMarriages++;
        // Mora no lugar com a melhor nota; quem se muda leva a memória de onde veio.
        const [mover, from, to] = this.placeScore(o) > this.placeScore(v) ? [a, v, o] : [b, o, v];
        this.relocate(mover, from, to);
        this.addAffinity(v.id, o.id, B.AFFINITY_KIN * 5);
        this.logThought(a, 'família', `Casou com ${personName(this.uid[b], o.culture.id)}, de ${o.name}`);
        this.logThought(b, 'família', `Casou com ${personName(this.uid[a], v.culture.id)}, de ${v.name}`);
      }
    }
  },

  /**
   * Visitas visíveis (RF-AS-42): parentes de quem se mudou, mascates e peregrinos andam pelas estradas
   * até o lugar com mais afinidade ou laço de família, ficam um pouco e voltam.
   */
  sendVisits(this: Ecosystem, live: Village[]): void {
    let sent = 0;
    const order = [...live].sort(() => this.civRnd() - 0.5);
    for (const v of order) {
      if (sent >= B.VISITORS * Math.max(1, live.length / 20) || v.population < 10 || this.tradeInMotion() >= B.CARAVANS_MAX) break;
      if (!happens(this.civRnd, B.VISIT_RATE, 1)) continue;
      let o: Village | null = null;
      let ov = 0;
      for (const c of live) {
        if (c === v || c.species !== v.species || this.warBetween(c.kingdom, v.kingdom)) continue;
        const d = this.distance(c, v.x, v.y);
        if (d > B.VISIT_RANGE) continue;
        const value = this.affinity(v.id, c.id) - d;
        if (value > ov) {
          ov = value;
          o = c;
        }
      }
      if (!o) continue;
      const path = this.roadPath(v.x, v.y, o.x, o.y);
      const who = this.traveler(v, ROLE.merchant);
      if (!path || who < 0) continue;
      if (this.launchConvoy(v, o, 'visit', path, [], who)) {
        sent++;
        this.tally.visits++;
        this.pairTrades.set(pairKey(v.id, o.id), (this.pairTrades.get(pairKey(v.id, o.id)) ?? 0) + 0.5);
      }
    }
  },

  /**
   * Ajuda e dívida (RF-AS-45): um lugar com fome pede comida a quem tem mais afinidade e sobra. Quem ajuda
   * ganha afinidade e um crédito: o devedor manda ajuda sem discutir quando o credor precisar. Recusar custa
   * afinidade. É a tarefa "buscar comida no vizinho" da fome (RF-AS-29).
   */
  askAid(this: Ecosystem, live: Village[]): void {
    for (const v of live) {
      if ((v.needs?.food ?? 1) >= B.AID_HUNGER || v.population < 4) continue;
      let o: Village | null = null;
      let ov = -Infinity;
      for (const c of live) {
        if (c === v || c.species !== v.species || this.warBetween(c.kingdom, v.kingdom)) continue;
        const d = this.distance(c, v.x, v.y);
        if (d > B.MARKET_RANGE) continue;
        const spare = c.food - c.population * B.CONSUME_FOOD;
        if (spare <= 4) continue;
        const owes = this.debts.get(pairKey(v.id, c.id));
        const value = this.affinity(v.id, c.id) / 20 + Math.log2(spare) - d / 20 + (owes && owes.creditor === v.id ? 5 : 0);
        if (value > ov) {
          ov = value;
          o = c;
        }
      }
      if (!o) continue;
      const k = pairKey(v.id, o.id);
      const owes = this.debts.get(k);
      const owed = owes !== undefined && owes.creditor === v.id;
      const ol = this.leaderOf(o);
      const leader = ol >= 0 ? this.traits[ol * TRAIT_COUNT + TRAIT.kindness] / 10 : 0;
      const will = owed ? 1 : 0.35 + this.affinity(v.id, o.id) / 100 + 0.25 * leader + (o.kingdom === v.kingdom ? 0.25 : 0);
      if (this.civRnd() > will) {
        this.addAffinity(v.id, o.id, -B.AFFINITY_REFUSE);
        this.tally.aidRefused++;
        this.note(`${o.name} negou comida a ${v.name}, que passava fome`, 'economia', v, { key: `aid-no-${v.id}` });
        continue;
      }
      const amount = (o.food - o.population * B.CONSUME_FOOD) * B.AID_SHARE;
      const path = this.roadPath(o.x, o.y, v.x, v.y);
      const who = this.traveler(o, ROLE.merchant);
      if (!path || who < 0 || amount < 1) continue;
      o.food -= amount;
      this.book(o, 'food', 0, amount);
      if (!this.launchConvoy(o, v, 'aid', path, [{ good: 'food', amount }], who)) {
        o.food += amount;
        continue;
      }
      this.tally.aid++;
      if (owed) this.debts.delete(k);
      else this.debts.set(k, { creditor: o.id, debtor: v.id, until: this.year + B.DEBT_YEARS });
      this.note(`${v.name} pediu comida e ${o.name} mandou ${Math.round(amount)}${owed ? ', pagando o que devia' : ''}`, 'economia', v, { key: `aid-${v.id}` });
    }
  },

  /**
   * Rivalidade por recurso (RF-AS-46): dois lugares que usam a mesma mata, o mesmo pasto ou a mesma jazida
   * brigam por ela, com a causa na crônica; com afinidade alta fazem um acordo de divisão. Substitui o
   * sorteio de incidentes (RF-VIDA-128d). O rancor que fica entra na diplomacia (RF-AS-53).
   */
  resourceRivalry(this: Ecosystem, live: Village[]): void {
    for (let x = 0; x < live.length; x++) {
      for (let y = x + 1; y < live.length; y++) {
        const a = live[x];
        const b = live[y];
        const d = this.distance(a, b.x, b.y);
        const woods = this.reachOf(a, B.WOOD_REACH) + this.reachOf(b, B.WOOD_REACH);
        let cause = '';
        if (d < woods * 0.8 && ((a.needs?.fuel ?? 1) < 0.8 || (b.needs?.fuel ?? 1) < 0.8)) cause = 'a mata entre os dois';
        else if (a.herd && b.herd && d < 2 * B.RIVAL_PASTURE) cause = 'o pasto';
        else {
          const shared = this.deposits.find((dp) => dp.amount > 0 && (dp.mine === a.id || dp.mine === b.id || (dp.known.has(a.id) && dp.known.has(b.id))) && this.distance(a, dp.x, dp.y) < 30 && this.distance(b, dp.x, dp.y) < 30);
          if (shared) cause = `a jazida de ${ORE_NAMES[shared.ore]}`;
        }
        if (!cause || !happens(this.civRnd, B.RIVALRY_RATE, 1)) continue;
        const aff = this.affinity(a.id, b.id);
        if (aff > 40) {
          this.addAffinity(a.id, b.id, 2);
          this.note(`${a.name} e ${b.name} fizeram um acordo para dividir ${cause}`, 'povo', a, { key: `share-${pairKey(a.id, b.id)}` });
          continue;
        }
        this.addAffinity(a.id, b.id, -B.AFFINITY_RIVAL);
        this.tally.rivalries++;
        const who = cause === 'o pasto' ? 'Pastores' : cause.startsWith('a mata') ? 'Lenhadores' : 'Mineiros';
        this.note(`${who} de ${a.name} e ${b.name} brigaram por ${cause}`, 'guerra', a, { key: `rival-${pairKey(a.id, b.id)}` });
        if (a.kingdom !== b.kingdom) this.relations.set(this.key(a.kingdom, b.kingdom), Math.max(-100, this.relation(a.kingdom, b.kingdom) - B.AFFINITY_RIVAL));
      }
    }
  },

  /** Lealdade de `v` a um centro político `k` (RF-AS-49). */
  loyaltyTo(this: Ecosystem, v: Village, k: Village): number {
    const trade = Math.min(1, (this.pairTrades.get(pairKey(v.id, k.id)) ?? 0) / 3 + (v.ref === k.id ? 0.4 : 0));
    const strong = Math.min(1, this.kingdomSize(k) / 6 + k.tier / 4);
    const kl = this.leaderOf(k);
    const king = kl >= 0 ? this.traits[kl * TRAIT_COUNT + TRAIT.charisma] / 10 : 0;
    return loyaltyScore({
      affinity: this.affinity(v.id, k.id),
      trade,
      protection: strong,
      burden: Math.min(1, (v.refused ?? 0) / 3),
      dist: this.distance(k, v.x, v.y),
      sameCulture: v.culture.id === k.culture.id,
      charisma: king,
    });
  },

  /**
   * Lealdade e troca de lado sem guerra (RF-AS-49 e 50): substitui a independência só por distância.
   * Quando outro centro atrai mais que o atual por LOYALTY_MARGIN durante LOYALTY_YEARS, o lugar muda
   * de reino em paz (anexação por atração). Lealdade muito baixa sem ter para onde ir vira independência.
   * Lugares livres também se juntam a um centro que os atrai (assim nascem chefias e reinos sem guerra).
   */
  updateLoyalty(this: Ecosystem, live: Village[]): void {
    const centers = live.filter((v) => v.kingdom === v.id && (v.tier >= 1 || this.kingdomSize(v) >= 2));
    for (const v of live) {
      const own = v.kingdom === v.id;
      if (own && this.kingdomSize(v) > 1) continue;
      const k = this.villages[v.kingdom];
      const now = own ? B.LOYALTY_FREE : this.loyaltyTo(v, k);
      v.loyalty = now;
      let best: Village | null = null;
      let bv = now + B.LOYALTY_MARGIN;
      for (const c of centers) {
        if (c.id === v.kingdom || c.id === v.id || c.species !== v.species || this.warBetween(c.id, v.kingdom)) continue;
        if (this.distance(c, v.x, v.y) > B.AFFINITY_RANGE) continue;
        const l = this.loyaltyTo(v, c);
        if (l > bv) {
          bv = l;
          best = c;
        }
      }
      if (best) {
        if (v.lure?.k === best.id) v.lure.years++;
        else v.lure = { k: best.id, years: 1 };
        if (v.lure.years >= B.LOYALTY_YEARS) {
          const from = own ? null : k;
          v.kingdom = best.id;
          v.color = best.color;
          v.lure = undefined;
          this.tally.annexations++;
          this.emit({ kind: 'annex', year: this.year, village: v.id, from: from?.id ?? -1, to: best.id });
          this.note(from ? `${v.name} deixou ${from.name} e passou, em paz, para o lado de ${best.name}` : `${v.name} se juntou, em paz, a ${best.name}`, 'povo', v, { major: true });
        }
        continue;
      }
      v.lure = undefined;
      if (!own && now < B.LOYALTY_REVOLT && v.population >= 20 && happens(this.polRnd, B.SECEDE_RATE, 1)) {
        const old = v.kingdom;
        for (const o of live) if (o.kingdom === old && o !== k && this.distance(v, o.x, o.y) < 30 && (o.loyalty ?? 1) < B.LOYALTY_REVOLT * 1.5) o.kingdom = v.id;
        v.kingdom = v.id;
        this.newKingdom(v, k);
        this.relations.set(this.key(old, v.id), -45);
        this.tally.revolts++;
        this.tally.newPeoples++;
        this.emit({ kind: 'revolt', year: this.year, village: v.id, against: old, cause: 'loyalty' });
        this.note(`${v.name}, sem lealdade a ${k.name}, se revoltou e declarou independência: nasce o povo ${v.culture.name}`, 'povo', v, { major: true });
      }
    }
  },

  /**
   * Capital que se move (RF-AS-51): se outra cidade do reino fica bem maior que a capital por
   * CAPITAL_MOVE_YEARS anos, a corte se muda para ela. O reino troca de número (o da capital nova)
   * e tudo o que estava guardado pelo número antigo passa para o novo.
   */
  moveCapitals(this: Ecosystem, live: Village[]): void {
    for (const k of live) {
      if (k.kingdom !== k.id) continue;
      let big: Village | null = null;
      for (const o of live) if (o.kingdom === k.id && o !== k && o.tier >= 2 && o.population > k.population * B.CAPITAL_MOVE_SHARE && (!big || o.population > big.population)) big = o;
      if (!big || this.warOf(k.id)) {
        k.rival = undefined;
        continue;
      }
      if (k.rival?.id === big.id) k.rival.years++;
      else k.rival = { id: big.id, years: 1 };
      if (k.rival.years < B.CAPITAL_MOVE_YEARS) continue;
      k.rival = undefined;
      this.rekeyKingdom(k.id, big.id);
      big.culture = k.culture;
      // As peças forjadas são de cada lugar (a era é local): a corte se muda, a experiência da forja fica onde foi feita.
      this.tally.capitalMoves++;
      this.note(`A corte de ${k.name} se mudou para ${big.name}, que cresceu mais que a velha capital`, 'povo', big, { major: true });
    }
  },

  /** Troca o número do reino `old` por `nw` em tudo que o guarda (lugares, relações, tréguas, rancores, planos e guerras). */
  rekeyKingdom(this: Ecosystem, old: number, nw: number): void {
    for (const v of this.villages) if (v.kingdom === old) v.kingdom = nw;
    const swap = (k: string) => {
      const [a, b] = k.split(':').map(Number) as [number, number];
      return this.key(a === old ? nw : a, b === old ? nw : b);
    };
    for (const m of [this.relations, this.truces, this.grudges, this.alliances] as Map<string, number>[]) {
      for (const [k, val] of [...m]) {
        const n = swap(k);
        if (n === k) continue;
        m.delete(k);
        m.set(n, val);
      }
    }
    for (const k of [...this.contacts]) {
      const n = swap(k);
      if (n !== k) {
        this.contacts.delete(k);
        this.contacts.add(n);
      }
    }
    const plan = this.plans.get(old);
    if (plan) {
      this.plans.delete(old);
      this.plans.set(nw, plan);
    }
    for (const p of this.plans.values()) if (p.enemy === old) p.enemy = nw;
    const t = this.temper.get(old);
    if (t !== undefined) {
      this.temper.delete(old);
      this.temper.set(nw, t);
    }
    for (const w of this.wars) {
      if (w.a === old) w.a = nw;
      if (w.b === old) w.b = nw;
    }
    const polity = this.villages[old].polity;
    this.villages[old].polity = undefined;
    this.villages[nw].polity = polity;
  },

  /**
   * Povos e cultura (RF-AS-52): lugares do mesmo povo longe do centro e com pouca convivência derivam
   * devagar; convivência (afinidade, trocas, visitas) puxa de volta. Quando a deriva passa de DRIFT_LIMIT
   * nasce um povo novo, com nome e cores próprios, e a crônica registra a separação.
   */
  driftCultures(this: Ecosystem, live: Village[]): void {
    for (const v of live) {
      const k = this.villages[v.kingdom];
      if (k === v && this.kingdomSize(v) === 1) {
        // Lugar livre: deriva em relação ao lugar de onde veio.
        const from = v.mother !== undefined ? this.villages[v.mother] : null;
        if (!from || from.abandoned || from.culture.id !== v.culture.id) {
          v.drift = 0;
          continue;
        }
        this.drift(v, from);
        continue;
      }
      if (k === v || k.culture.id !== v.culture.id) {
        v.drift = 0;
        continue;
      }
      this.drift(v, k);
    }
  },

  drift(this: Ecosystem, v: Village, from: Village): void {
    const d = this.distance(from, v.x, v.y);
    const near = this.affinity(v.id, from.id);
    const push = B.DRIFT_RATE * Math.min(3, d / 30) * (1 - Math.max(0, near) / 100);
    const pull = B.DRIFT_BACK * Math.max(0, near) / 50 + (this.pairTrades.get(pairKey(v.id, from.id)) ?? 0) * 0.5;
    v.drift = Math.max(0, (v.drift ?? 0) + push - pull);
    if (v.drift < B.DRIFT_LIMIT) return;
    const old = v.culture.name;
    v.culture = makeCulture(this.cultures++, v.name, this.polRnd);
    for (const o of this.villages) if (!o.abandoned && o.kingdom === v.kingdom && o !== v && this.distance(v, o.x, o.y) < 20 && o.culture.name === old) o.culture = v.culture;
    v.drift = 0;
    this.tally.newPeoples++;
    this.note(`Os ${v.culture.name} de ${v.name} já não se veem como ${old}`, 'povo', v, { major: true });
  },

  /** Média das afinidades entre os lugares de dois reinos (entrada da diplomacia, RF-AS-53). */
  kingdomAffinity(this: Ecosystem, a: number, b: number): number {
    let sum = 0;
    let n = 0;
    for (const [k, val] of this.affinities) {
      const [x, y] = k.split(':').map(Number);
      const kx = this.villages[x]?.kingdom;
      const ky = this.villages[y]?.kingdom;
      if ((kx === a && ky === b) || (kx === b && ky === a)) {
        sum += val;
        n++;
      }
    }
    return n ? sum / n : 0;
  },
};
export type RelationsPart = typeof relationsPart;
