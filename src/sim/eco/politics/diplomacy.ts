/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): diplomacia entre reinos: planos de guerra, paz, mercenários, alianças, sucessão e troca.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { makeCulture, ORE_NAMES } from '../../economy';
import { CHILD, ROLE } from '../../roles';
import { welfare } from '../../needs';
import type { War, WarMotive, LootGood, WarPlan, BuildingKind, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { WAR_MOTIVES } = constantsModule;
const { elderAge } = helpersModule;

export const diplomacyPart = {
  /**
   * Uma vez por ano: as relações entre reinos que se conhecem (vizinhos por
   * terra ou contatos por mar) mudam por fronteira, espécie, cultura,
   * comércio e incidentes; surgem alianças, uniões e guerras; guerras longas
   * ou sangrentas acabam em paz.
   */
  diplomacy(this: Ecosystem): void {
    // A independência só por distância (RF-VIDA-81) deu lugar à lealdade (RF-AS-49 e 50, `updateLoyalty`).
    for (const [k, t] of this.temper) {
      const next = t * (1 - B.TEMPER_FADE);
      if (Math.abs(next) < 0.02) this.temper.delete(k);
      else this.temper.set(k, next);
    }
    const capitals = this.villages.filter((v) => !v.abandoned && v.kingdom === v.id);
    const members = new Map<number, Village[]>();
    // Aperto de cada reino (agente 3B): o lugar mais circunscrito, de 0 a 1.
    const cramped = new Map<number, number>();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const list = members.get(v.kingdom) ?? [];
      list.push(v);
      members.set(v.kingdom, list);
      if (v.circumscribed) cramped.set(v.kingdom, Math.max(cramped.get(v.kingdom) ?? 0, Math.min(1, v.circumscribed / B.CIRCUM_FULL)));
    }
    // Soldados por reino e por assentamento, contados uma vez; um cavalo por soldado montado (RF-VIDA-223).
    const soldiers = new Map<number, number>();
    const local = new Map<number, number>();
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.role[i] !== ROLE.soldier || this.village[i] < 0) continue;
      const k = this.villages[this.village[i]].kingdom;
      soldiers.set(k, (soldiers.get(k) ?? 0) + 1);
      local.set(this.village[i], (local.get(this.village[i]) ?? 0) + 1);
    }
    this.cavalry.clear();
    const riders = new Map<number, number>();
    for (const [id, n] of local) {
      const v = this.villages[id];
      if ((!this.knew(v, 'montaria') && !this.knew(v, 'cavalaria') && Math.floor(v.tech) < 1) || v.stock.horses < 1) continue;
      const mounted = Math.min(n, Math.floor(v.stock.horses));
      this.cavalry.set(id, mounted / n);
      riders.set(v.kingdom, (riders.get(v.kingdom) ?? 0) + mounted);
    }
    // Força (RF-VIDA-242): soldados × armas × (1 + parte montada).
    const force = (k: number) => {
      const n = soldiers.get(k) ?? 0;
      return n * (1 + this.villages[k].stock.weaponTier * 0.5) * (1 + (n ? (riders.get(k) ?? 0) / n : 0));
    };
    const has = (k: number, kind: BuildingKind) => (members.get(k) ?? []).some((v) => v.houses.some((h) => h.kind === kind));
    const port = (k: number) => (members.get(k) ?? []).some((v) => v.port >= 0);
    for (let x = 0; x < capitals.length; x++) {
      for (let y = x + 1; y < capitals.length; y++) {
        const a = capitals[x];
        const b = capitals[y];
        // Assentamentos mais próximos dos dois reinos.
        let best = Infinity;
        let pa = a;
        let pb = b;
        for (const va of members.get(a.id) ?? []) {
          for (const vb of members.get(b.id) ?? []) {
            const d = this.distance(va, vb.x, vb.y);
            if (d < best) {
              best = d;
              pa = va;
              pb = vb;
            }
          }
        }
        const key = this.key(a.id, b.id);
        const border = best <= 60;
        if (!border && !this.contacts.has(key)) continue;
        let rel = this.relations.get(key) ?? (a.species !== b.species ? -30 : 0);
        if (border) rel -= 1.5;
        if (a.species !== b.species) rel -= 1;
        if (a.culture.id !== b.culture.id) rel -= 0.5;
        for (const c of [a.culture, b.culture]) {
          if (c.value === 'guerra') rel -= 1.5;
          if (c.value === 'fé' || c.value === 'comércio') rel += 0.5;
        }
        rel += (a.culture.tolerance + b.culture.tolerance) * 1.2;
        if (this.allied(a.id, b.id)) rel += 2;
        // Rancor de guerra (RF-VIDA-243): o vencido não esquece por muitos anos.
        const grudge = this.grudges.get(key);
        if (grudge !== undefined) {
          if (grudge > this.year) rel -= B.GRUDGE_PULL;
          else this.grudges.delete(key);
        }
        // Cobiça (seção 19.19): um reino com falta de comida ou lenha olha torto para o vizinho que tem de sobra.
        const lackA = border ? this.kingdomLack(members.get(a.id) ?? [a]) : 0;
        const lackB = border ? this.kingdomLack(members.get(b.id) ?? [b]) : 0;
        const richA = this.kingdomPlenty(members.get(a.id) ?? [a]);
        const richB = this.kingdomPlenty(members.get(b.id) ?? [b]);
        const greed = Math.max(lackA * richB, lackB * richA);
        rel -= B.SCARCITY_TENSION * greed;
        const atWar = this.warBetween(a.id, b.id);
        const busy = this.warOf(a.id) || this.warOf(b.id);
        // Comércio: por terra entre vizinhos com mercado; por mar entre contatos com mercado e porto.
        // Sem mercado, vizinhos amigos ainda fazem escambo.
        const market = (has(a.id, 'market') && has(b.id, 'market') && (border || (port(a.id) && port(b.id)))) || (border && rel > 20);
        // Com caravanas entre os dois neste ano, a troca invisível não acontece (fica como reserva, 19.6).
        if (!atWar && market && !this.caravanPairs.has(key) && this.trade(a, b)) rel += 3 * (a.culture.value === 'comércio' || b.culture.value === 'comércio' ? 2 : 1);
        // Entradas da diplomacia (RF-AS-53): a relação puxa para a média das afinidades entre os lugares dos dois
        // reinos, mais o temperamento dos reis; os incidentes vêm das rivalidades por recurso (`resourceRivalry`).
        if (!atWar) rel += (this.kingdomAffinity(a.id, b.id) + 20 * ((this.temper.get(a.id) ?? 0) + (this.temper.get(b.id) ?? 0)) - rel) * B.AFFINITY_PULL;
        if (!atWar && this.polRnd() < 0.01 && this.kingdomAffinity(a.id, b.id) > 40) rel += this.royalWedding(a, b);
        rel = Math.max(-100, Math.min(100, rel));
        this.relations.set(key, rel);
        if (atWar) continue;
        if (this.alliance(a, b, rel)) continue;
        if (busy || this.allied(a.id, b.id) || (this.truces.get(key) ?? 0) > this.year) continue;
        // Motivo (seção 19.7): cada lado vê se tem razão contra o outro e, se tiver, passa a se preparar (não declara na hora).
        const fa = force(a.id);
        const fb = force(b.id);
        const warlike = a.culture.value === 'guerra' || b.culture.value === 'guerra';
        const ma = members.get(a.id) ?? [a];
        const mb = members.get(b.id) ?? [b];
        const sides = [
          { att: a, def: b, target: pb, fAtt: fa, fDef: fb, lack: lackA, rich: richB, plenty: richA, cramped: cramped.get(a.id) ?? 0, own: ma, other: mb },
          { att: b, def: a, target: pa, fAtt: fb, fDef: fa, lack: lackB, rich: richA, plenty: richB, cramped: cramped.get(b.id) ?? 0, own: mb, other: ma },
        ];
        if (this.polRnd() < 0.5) sides.reverse();
        for (const side of sides) {
          if (this.plans.has(side.att.id) || this.warOf(side.att.id)) continue;
          const plan = this.intent(side, rel, border, warlike);
          if (plan) this.makePlan(side.att, side.def, plan);
        }
      }
    }
    this.updatePlans(members, soldiers, force);
    for (let k = this.wars.length - 1; k >= 0; k--) {
      const war = this.wars[k];
      war.years++;
      // Logística (RF-VIDA-242): o exército come do celeiro de casa; dois anos com fome e ele volta.
      if (this.supplyArmy(war, soldiers.get(war.a) ?? 0)) {
        this.tally.retreats++;
        this.relations.set(this.key(war.a, war.b), Math.min(this.relation(war.a, war.b), -10));
        this.note(`Sem comida, o exército de ${this.villages[war.home].name} desistiu de ${this.villages[war.target].name} e voltou para casa`, 'guerra', this.villages[war.home], { major: true });
        this.endWar(k);
        continue;
      }
      if (war.years >= 2) this.hireMercenaries(war, members);
      // Cansaço de guerra (RF-VIDA-241): a chance de paz sobe a cada ano e a cada morte.
      const dead = war.losses[0] + war.losses[1];
      if (this.polRnd() < B.PEACE_BASE + B.PEACE_PER_YEAR * war.years + B.PEACE_PER_DEATH * dead) {
        this.makePeace(war);
        this.endWar(k);
      }
    }
    this.vassals(members);
    this.rebuildEnemies();
    this.caravanPairs.clear();
  },

  /** Agressividade do reino, de -1 (passivo) a 1 (agressivo). */
  temperOf(this: Ecosystem, k: number): number {
    return this.temper.get(k) ?? 0;
  },

  /** Soma `delta` à agressividade do reino (o jogador mexe nela; some aos poucos, TEMPER_FADE por ano). */
  addTemper(this: Ecosystem, k: number, delta: number): void {
    const t = Math.max(-1, Math.min(1, this.temperOf(k) + delta));
    if (Math.abs(t) < 0.01) this.temper.delete(k);
    else this.temper.set(k, t);
  },

  /** Reino em preparo para a guerra, se estiver (o preparo puxa armas, armaduras e soldados). */
  preparing(this: Ecosystem, k: number): WarPlan | null {
    return this.plans.get(k) ?? null;
  },

  /**
   * Prontidão do reino para a guerra (0 a 1): comida para PREP_FOOD_YEARS anos de exército, uma arma por
   * soldado, armaduras (da Era do Bronze) e ouro de reserva (idem). Só conta o lado que ataca: o alvo não
   * precisa estar pronto (e por isso pode ser pego de surpresa).
   */
  readiness(this: Ecosystem, members: Village[], soldiers: number): number {
    const n = Math.max(1, soldiers);
    let food = 0;
    let weapons = 0;
    let armor = 0;
    let gold = 0;
    let era = 0;
    for (const v of members) {
      food += v.food;
      weapons += v.stock.weapons;
      armor += v.stock.armor;
      gold += v.stock.gold;
      era = Math.max(era, Math.floor(v.tech));
    }
    const parts: [number, number][] = [
      [0.4, food / (n * B.ARMY_FOOD * B.PREP_FOOD_YEARS)],
      [0.3, weapons / n],
    ];
    if (era >= 1) parts.push([0.15, armor / (n * B.PREP_ARMOR)], [0.15, gold / (B.PREP_GOLD * (1 + era))]);
    let total = 0;
    let sum = 0;
    for (const [w, v] of parts) {
      total += w;
      sum += w * Math.max(0, Math.min(1, v));
    }
    return sum / total;
  },

  /** Prontidão exigida de quem tem a agressividade dada: o agressivo se contenta com menos. */
  readyLevel(this: Ecosystem, k: number): number {
    return B.READY_LEVEL - B.TEMPER_READY * this.warMood(k);
  },

  /** Vantagem de força que o reino quer ter sobre o alvo antes de declarar, pelo motivo e pela agressividade. */
  wantedAdvantage(this: Ecosystem, motive: WarMotive, k: number): number {
    const base = motive === 'loot' ? B.ADVANTAGE_RAID : motive === 'extermination' ? B.ADVANTAGE_EXTERMINATION : B.ADVANTAGE;
    return base - B.TEMPER_ADVANTAGE * this.warMood(k);
  },

  /**
   * Motivo de guerra de `side.att` contra `side.def` neste ano (seção 19.7), ou null. A chance de cada um
   * é vezes (1 + agressividade do reino). Só nasce a intenção: a declaração espera o preparo (updatePlans).
   * `plenty` é a fartura do próprio reino e `cramped` o aperto do lugar mais circunscrito dele (agente 3B).
   */
  intent(
    this: Ecosystem,
    side: { att: Village; def: Village; target: Village; fAtt: number; fDef: number; lack: number; rich: number; plenty?: number; cramped?: number; own: Village[]; other: Village[] },
    rel: number,
    border: boolean,
    warlike: boolean,
  ): { motive: WarMotive; target: Village; good?: LootGood; cramped?: boolean } | null {
    const { att, def, target, fAtt, fDef } = side;
    const m = Math.max(0, 1 + this.warMood(att.kingdom));
    const rnd = this.polRnd;
    const w = warlike ? 2 : 1;
    if (border && rel <= B.EXTERMINATION_RELATION && fAtt >= 2 * Math.max(1, fDef) && happens(rnd, B.EXTERMINATION_RATE * m, 1)) return { motive: 'extermination', target };
    if ((this.vengeance.get(`${att.id}>${def.id}`) ?? 0) > this.year && rel < 10 && happens(rnd, B.REVENGE_WAR * m, 1)) return { motive: 'revenge', target };
    if (att.culture.value === 'fé' && def.culture.belief !== att.culture.belief && rel < 10 && happens(rnd, B.FAITH_WAR * m * (1 - att.culture.tolerance), 1)) return { motive: 'faith', target };
    // Circunscrição (Carneiro, agente 3B): apertado e sem sítio livre, o reino vai atrás da terra do vizinho.
    const cramp = side.cramped ?? 0;
    if (border && cramp > 0 && fAtt >= B.LAND_WAR_FORCE * Math.max(1, fDef) && rel < B.LAND_WAR_REL && rnd() < B.LAND_WAR_CIRCUM * cramp * w * m) return { motive: 'land', target, cramped: true };
    // Falta de comida ou lenha: o reino em falta, mais forte, vai atrás da fartura do vizinho. Reus: quem tem
    // fartura e força também saqueia (sustenta o bando); a fartura própria vezes a vantagem de força soma à chance.
    const greed = side.lack * side.rich;
    const reus = (side.plenty ?? 0) * Math.max(0, Math.min(1, (fAtt / Math.max(1, fDef) - 1) / 2));
    if ((greed > 0 || reus > 0) && fAtt > fDef && rel < 20 && rnd() < (B.RESOURCE_WAR * greed + B.REUS_LOOT * reus * side.rich) * w * m) {
      return { motive: 'loot', target, good: greed > 0 && this.kingdomLackName(side.own) !== 'comida' ? 'wood' : 'food' };
    }
    // Cobiça: cavalos, ferro ou ouro que faltam ao mais forte e sobram no vizinho.
    const want = fAtt > fDef && rel < 0 ? this.covet(side.own, side.other) : null;
    if (want && rnd() < B.COVET_WAR * want.want * w * m) return { motive: 'loot', target: want.from, good: want.good };
    // Domínio: um reino forte e avançado sobre um vizinho bem mais fraco.
    const strong = fAtt >= 2 * Math.max(1, fDef) && Math.floor(att.tech) >= 2;
    if (strong && rel < 0 && rnd() < (0.04 + B.REUS_DOMINION * (side.plenty ?? 0)) * m) return { motive: 'dominion', target };
    // Território: relação ruim demais.
    if (rel < (warlike ? -20 : -35) && rnd() < 0.15 * w * m) return { motive: 'land', target };
    return null;
  },

  /** Um reino passa a se preparar para atacar (RF-VIDA-241): os ferreiros e as profissões se voltam para a guerra. */
  makePlan(this: Ecosystem, att: Village, def: Village, plan: { motive: WarMotive; target: Village; good?: LootGood; cramped?: boolean }): void {
    this.plans.set(att.id, { enemy: def.id, target: plan.target.id, motive: plan.motive, good: plan.good, since: this.year, belief: 1 + (this.polRnd() - 0.5) * 2 * B.BELIEF_NOISE, cramped: plan.cramped });
    this.tally.plans++;
    this.note(`${att.name} começou a se preparar para a guerra contra ${def.name} (${WAR_MOTIVES[plan.motive]})`, 'guerra', att, { key: `prep-${att.id}-${def.id}` });
  },

  /**
   * Uma vez por ano: cada reino em preparo confere se está pronto (comida, armas, armaduras e ouro) e se acha
   * que tem vantagem sobre o alvo. Se sim, declara. Desiste se o motivo sumiu, a tensão passou ou o preparo
   * demorou PREP_MAX_YEARS.
   */
  updatePlans(this: Ecosystem, members: Map<number, Village[]>, soldiers: Map<number, number>, force: (k: number) => number): void {
    for (const [k, plan] of this.plans) {
      const att = this.villages[k];
      const def = this.villages[plan.enemy];
      const target = this.villages[plan.target];
      const rel = this.relation(k, plan.enemy);
      const gone = att.abandoned || att.kingdom !== k || def.abandoned || def.kingdom !== def.id || target.abandoned || target.kingdom !== plan.enemy;
      const calm = plan.motive !== 'revenge' && rel > B.PEACE_REL;
      if (gone || calm || this.allied(k, plan.enemy) || this.warOf(k)) {
        this.plans.delete(k);
        this.tally.plansDropped++;
        continue;
      }
      if (this.year - plan.since > B.PREP_MAX_YEARS) {
        this.plans.delete(k);
        this.tally.plansDropped++;
        this.note(`${att.name} desistiu da guerra contra ${def.name}: nunca se sentiu pronto`, 'guerra', att, { key: `giveup-${k}` });
        continue;
      }
      if (this.warOf(plan.enemy) || (this.truces.get(this.key(k, plan.enemy)) ?? 0) > this.year) continue;
      const mine = force(k);
      const loot = plan.motive === 'loot';
      if (mine < (loot ? B.RAID_FORCE : 4)) continue;
      if (this.readiness(members.get(k) ?? [att], soldiers.get(k) ?? 0) < this.readyLevel(k)) continue;
      // O que ele acha que o inimigo vale: a força de verdade, com o erro do plano.
      if (mine < this.wantedAdvantage(plan.motive, k) * Math.max(1, force(plan.enemy) * plan.belief)) continue;
      this.plans.delete(k);
      this.tally.prepYears += this.year - plan.since;
      if (this.declareWar(att, def, target, members, plan.motive, plan.good, plan.cramped)) {
        if (loot && (plan.good === 'food' || plan.good === 'wood')) this.tally.greedWars++;
        if (plan.cramped) this.tally.landHunger++;
        this.callAllies(att, def, members);
      }
    }
  },

  // Influência do jogador (seção 19.20) -------------------------------------

  /** Aumenta a tensão entre dois reinos (a relação cai PLAYER_TENSION). */
  provoke(this: Ecosystem, a: Village, b: Village): boolean {
    if (a.kingdom === b.kingdom) return false;
    const key = this.key(a.kingdom, b.kingdom);
    this.relations.set(key, Math.max(-100, this.relation(a.kingdom, b.kingdom) - B.PLAYER_TENSION));
    this.truces.delete(key);
    this.effect('swords', a.x, a.y - 3, 25, 1);
    this.effect('swords', b.x, b.y - 3, 25, 1);
    this.note(`Algo azedou a relação entre ${this.villages[a.kingdom].name} e ${this.villages[b.kingdom].name}`, 'jogador', a);
    return true;
  },

  /** Ameniza a tensão: a relação sobe PLAYER_TENSION, a trégua vale por mais um tempo e os planos de guerra entre os dois caem. */
  soothe(this: Ecosystem, a: Village, b: Village): boolean {
    if (a.kingdom === b.kingdom) return false;
    const key = this.key(a.kingdom, b.kingdom);
    this.relations.set(key, Math.min(100, this.relation(a.kingdom, b.kingdom) + B.PLAYER_TENSION));
    this.truces.set(key, Math.max(this.truces.get(key) ?? 0, this.year + B.TRUCE_MIN));
    for (const [x, y] of [[a.kingdom, b.kingdom], [b.kingdom, a.kingdom]]) if (this.plans.get(x)?.enemy === y) this.plans.delete(x);
    this.effect('heart', a.x, a.y - 3, 25, 1);
    this.effect('heart', b.x, b.y - 3, 25, 1);
    this.note(`${this.villages[a.kingdom].name} e ${this.villages[b.kingdom].name} se aproximaram`, 'jogador', a);
    return true;
  },

  /** Manda um reino atacar outro agora, sem preparo (a vontade do jogador vale). Devolve falso se não der (já em guerra, sem caminho). */
  incite(this: Ecosystem, a: Village, b: Village): boolean {
    if (a.kingdom === b.kingdom || this.warOf(a.kingdom) || this.warOf(b.kingdom)) return false;
    const members = new Map<number, Village[]>();
    for (const v of this.villages) if (!v.abandoned) members.set(v.kingdom, [...(members.get(v.kingdom) ?? []), v]);
    const target = (members.get(b.kingdom) ?? [b]).reduce((p, q) => (this.distance(q, a.x, a.y) < this.distance(p, a.x, a.y) ? q : p));
    this.plans.delete(a.kingdom);
    return this.declareWar(this.villages[a.kingdom], this.villages[b.kingdom], target, members, 'dominion');
  },

  /** Torna o reino mais agressivo (`dir` > 0) ou mais passivo (`dir` < 0), TEMPER_STEP por vez; a chance de ter motivo e o preparo exigido mudam. */
  sway(this: Ecosystem, k: Village, dir: number): void {
    const delta = Math.sign(dir) * B.TEMPER_STEP;
    this.addTemper(k.kingdom, delta);
    const cap = this.villages[k.kingdom];
    this.effect(delta > 0 ? 'swords' : 'heart', cap.x, cap.y - 3, 25, 1);
    this.note(`${cap.name} ficou mais ${delta > 0 ? 'belicoso' : 'pacato'}`, 'jogador', cap);
  },

  /** Falta de comida e madeira num reino, pelo assentamento que mais sofre (0 a 1, seção 19.19). */
  kingdomLack(this: Ecosystem, list: Village[]): number {
    let worst = 0;
    for (const v of list) {
      const n = v.needs;
      if (n) worst = Math.max(worst, Math.max(0, B.GREED_LEVEL - Math.min(n.food, n.fuel)) / B.GREED_LEVEL);
    }
    return worst;
  },

  /** O que mais falta num reino, para a crônica. */
  kingdomLackName(this: Ecosystem, list: Village[]): string {
    let food = 0;
    let fuel = 0;
    for (const v of list) {
      food += v.needs?.food ?? 1;
      fuel += v.needs?.fuel ?? 1;
    }
    return food <= fuel ? 'comida' : 'lenha';
  },

  /** Fartura de um reino: comida e madeira guardadas perto do teto (0 a 1). */
  kingdomPlenty(this: Ecosystem, list: Village[]): number {
    let n = 0;
    for (const v of list) n += Math.min(1, (v.food / this.capOf(v, 'food') + v.stock.wood / this.capOf(v, 'wood')) / 2);
    return list.length ? Math.max(0, n / list.length - 0.3) / 0.7 : 0;
  },

  /**
   * Paz (RF-VIDA-134): a relação volta a −10. Na guerra de território, quem está ganhando
   * (perdeu menos gente) fica com o assentamento disputado: paz com cessão (RF-VIDA-240).
   */
  makePeace(this: Ecosystem, war: War): void {
    const a = this.villages[war.a];
    const b = this.villages[war.b];
    const target = this.villages[war.target];
    this.relations.set(this.key(war.a, war.b), -10);
    const cede = (war.motive === 'land' || war.motive === 'dominion' || war.motive === 'revenge' || war.motive === 'faith') && war.losses[0] < war.losses[1] && target.kingdom === war.b && target !== b && !target.abandoned;
    if (cede) {
      target.kingdom = a.id;
      target.color = a.color;
      target.leader = -1;
      this.grudge(war.a, war.b, B.GRUDGE_YEARS / 2);
      this.vengeance.set(`${war.b}>${war.a}`, this.year + B.GRUDGE_YEARS / 2);
      this.emit({ kind: 'conquest', year: this.year, winner: war.a, loser: war.b, village: target.id, razed: false });
      this.note(`Paz entre ${a.name} e ${b.name}: ${b.name} cedeu ${target.name}`, 'guerra', target, { major: true });
      return;
    }
    this.note(`Paz entre ${a.name} e ${b.name}`, 'guerra', b, { major: true });
  },

  /**
   * Comida do exército em campanha (RF-VIDA-242): ARMY_FOOD por soldado por ano, do celeiro do
   * assentamento de onde ele saiu. Guarda a parte paga em `supply`; devolve true quando o
   * exército passou dois anos seguidos com pouca comida e volta para casa.
   */
  supplyArmy(this: Ecosystem, war: War, soldiers: number): boolean {
    let home = this.villages[war.home];
    if (home.abandoned || home.kingdom !== war.a) {
      home = this.villages[war.a];
      war.home = home.id;
    }
    const need = soldiers * B.ARMY_FOOD;
    if (need <= 0) {
      war.supply = 1;
      return false;
    }
    const paid = Math.min(home.food, need);
    home.food -= paid;
    this.book(home, 'food', 0, paid);
    war.supply = paid / need;
    war.hungry = war.supply < B.RETREAT_SUPPLY ? (war.hungry ?? 0) + 1 : 0;
    return war.motive !== 'civil' && war.hungry >= 2;
  },

  /**
   * Mercenários (RF-VIDA-295): em guerra longa, o lado com ouro contrata adultos de um
   * assentamento pobre ou em crise de outro reino, que vão lutar por ele.
   */
  hireMercenaries(this: Ecosystem, war: War, members: Map<number, Village[]>): void {
    for (const [side, k] of [[0, war.a], [1, war.b]] as const) {
      if (!happens(this.polRnd, B.MERCENARY_RATE, 1)) continue;
      const list = members.get(k) ?? [];
      const payer = list.reduce<Village | null>((p, q) => (!p || q.stock.gold > p.stock.gold ? q : p), null);
      if (!payer || payer.stock.gold < B.MERCENARY_PRICE * 2) continue;
      const camp = side === 0 ? this.villages[war.home] : this.villages[war.target];
      let source: Village | null = null;
      let bd = 120;
      for (const o of this.villages) {
        if (o.abandoned || o.kingdom === war.a || o.kingdom === war.b || o.population < 8 || this.warOf(o.kingdom)) continue;
        const poor = (o.stability ?? 1) < 0.5 || (o.needs?.food ?? 1) < 0.6 || (o.needs ? welfare(o.needs) : 1) < 0.6;
        if (!poor) continue;
        const d = this.distance(o, camp.x, camp.y);
        if (d < bd && this.landPath(o.x, o.y, camp.x, camp.y)) {
          bd = d;
          source = o;
        }
      }
      if (!source) continue;
      const n = Math.min(B.MERCENARY_MAX, Math.floor(payer.stock.gold / B.MERCENARY_PRICE), Math.floor(source.population / 4));
      let hired = 0;
      const era = Math.floor(source.tech);
      const here = this.residents(source.id);
      const leader = this.leaderOf(source);
      for (let k = 0; k < here.length && hired < n; k++) {
        const i = here[k];
        if (!this.alive[i] || this.village[i] !== source.id || i === leader || this.role[i] === CHILD) continue;
        if (this.age[i] >= elderAge(this.species[this.kind[i]], era)) continue;
        this.moveTo(i, source, camp);
        this.role[i] = ROLE.soldier;
        this.mercenaries.add(i);
        hired++;
      }
      if (!hired) continue;
      const pay = hired * B.MERCENARY_PRICE;
      payer.stock.gold -= pay;
      source.stock.gold = Math.min(this.capOf(source, 'gold'), source.stock.gold + pay);
      war.mercs[side] += hired;
      this.tally.mercenaries += hired;
      this.note(`${payer.name} contratou ${hired} mercenários de ${source.name} por ${pay} de ouro`, 'guerra', camp, { key: `merc-${payer.id}-${source.id}` });
    }
  },

  /** Declara guerra se houver caminho por terra ou, sem ele, por mar, e o teto do planeta deixar (RF-VIDA-241). Retorna se começou. */
  declareWar(this: Ecosystem, att: Village, def: Village, target: Village, members: Map<number, Village[]>, motive: WarMotive = 'land', good?: LootGood, cramped = false): boolean {
    let naval = false;
    const home = (members.get(att.id) ?? []).reduce((p, q) => (this.distance(q, target.x, target.y) < this.distance(p, target.x, target.y) ? q : p), att);
    if (!this.landPath(home.x, home.y, target.x, target.y)) {
      if (!this.navalBase(att.id, target)) return false;
      naval = true;
    }
    this.startWar({ a: att.id, b: def.id, target: target.id, naval, motive, good, home: home.id });
    this.breakAgreements(att.id, def.id);
    // Crônica com motivo (RF-VIDA-244).
    const sea = naval ? ', pelo mar' : '';
    const text =
      motive === 'loot'
        ? `${home.name} atacou ${target.name} para tomar ${this.lootName(good ?? 'food', target, false)}${sea}`
        : motive === 'extermination'
          ? `Guerra! ${att.name} marchou para arrasar ${target.name}${sea}`
          : motive === 'revenge'
            ? `Guerra! ${att.name} atacou ${def.name} por vingança, para retomar ${this.prizeName(target)}${sea}`
            : motive === 'faith'
              ? `Guerra santa! ${att.name} atacou ${def.name} em nome da fé ${att.culture.belief}${sea}`
              : motive === 'dominion'
                ? `Guerra! ${att.name} atacou ${def.name} para dominar ${this.prizeName(target)}${sea}`
                : cramped
                  ? `Guerra! Sem terra para crescer, ${att.name} atacou ${def.name} para tomar ${this.prizeName(target)}${sea}`
                  : `Guerra! ${att.name} atacou ${def.name} para tomar ${this.prizeName(target)}${sea}`;
    this.note(text, 'guerra', target, { major: true });
    this.effect('swords', target.x, target.y - 3, 30, 1);
    return true;
  },

  /** Aliados do atacado entram na guerra (pacto de defesa) ou mandam armas. */
  callAllies(this: Ecosystem, att: Village, def: Village, members: Map<number, Village[]>): void {
    for (const ally of this.villages) {
      if (ally.abandoned || ally.kingdom !== ally.id || ally === def || ally === att || !this.allied(ally.id, def.id) || this.allied(ally.id, att.id)) continue;
      if (this.warOf(ally.id)) continue;
      // Alvo: o assentamento do atacante mais perto do aliado.
      const target = (members.get(att.id) ?? [att]).reduce((p, q) => (this.distance(q, ally.x, ally.y) < this.distance(p, ally.x, ally.y) ? q : p));
      if (this.declareWar(ally, att, target, members)) {
        this.note(`${ally.name} entrou na guerra ao lado de ${def.name}`, 'guerra', ally, { major: true });
      } else {
        const gift = Math.min(ally.stock.weapons, 5);
        ally.stock.weapons -= gift;
        def.stock.weapons += gift;
        if (gift) this.note(`${ally.name} mandou armas para ajudar ${def.name}`, 'guerra', ally);
      }
    }
  },

  /** Incidente entre dois reinos (presente, casamento, insulto, escaramuça, disputa); devolve a mudança na relação. */
  /** Casamento de líderes (RF-AS-47): reúne gente dos dois lados e aproxima os reinos. */
  royalWedding(this: Ecosystem, a: Village, b: Village): number {
    if (a.species !== b.species) return 0;
    this.note(`Um casamento real uniu as famílias de ${a.name} e ${b.name}`, 'povo', a);
    this.addAffinity(a.id, b.id, B.AFFINITY_FEAST * 3);
    return 12;
  },

  /**
   * Alianças: relação acima de 50 pode virar aliança; abaixo de 15 ela acaba.
   * Aliados antigos da mesma espécie podem se unir num reino só (federação).
   * Retorna true se o par mudou de situação neste ano.
   */
  alliance(this: Ecosystem, a: Village, b: Village, rel: number): boolean {
    const key = this.key(a.id, b.id);
    const since = this.alliances.get(key);
    if (since === undefined) {
      if (rel > 50 && !this.warOf(a.id) && !this.warOf(b.id) && this.polRnd() < 0.12) {
        this.alliances.set(key, this.year);
        this.note(`Aliança entre ${a.name} e ${b.name}`, 'povo', a, { major: true });
        this.effect('heart', a.x, a.y - 3, 20, 1);
        this.effect('heart', b.x, b.y - 3, 20, 1);
        return true;
      }
      return false;
    }
    if (rel < 15) {
      this.alliances.delete(key);
      this.note(`A aliança entre ${a.name} e ${b.name} acabou`, 'povo', a, { major: true });
      return true;
    }
    if (this.year - since > 50 && a.species === b.species && rel > 80 && this.polRnd() < 0.03) {
      const [big, small] = this.kingdomSize(a) >= this.kingdomSize(b) ? [a, b] : [b, a];
      for (const o of this.villages) {
        if (o.abandoned || o.kingdom !== small.id) continue;
        o.kingdom = big.id;
        o.color = big.color;
      }
      small.leader = -1;
      this.alliances.delete(key);
      this.note(`${small.name} e ${big.name} se uniram num só reino, com capital em ${big.name}`, 'povo', big, { major: true });
      return true;
    }
    return false;
  },

  /** Aldeias independentes pequenas perto de um reino amigo pedem proteção e viram vassalas. */
  vassals(this: Ecosystem, members: Map<number, Village[]>): void {
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom !== v.id || v.tier > 0 || (members.get(v.id)?.length ?? 0) > 1 || this.warOf(v.id)) continue;
      for (const c of this.villages) {
        if (c.abandoned || c === v || c.kingdom !== c.id || c.species !== v.species || (members.get(c.id)?.length ?? 0) < 2) continue;
        if (this.distance(c, v.x, v.y) > 45 || this.relation(c.id, v.id) < 20 || this.polRnd() > 0.03) continue;
        this.emit({ kind: 'annex', year: this.year, village: v.id, from: -1, to: c.id });
        v.kingdom = c.id;
        v.color = c.color;
        this.note(`${v.name} pediu proteção e passou a fazer parte do reino de ${c.name}`, 'povo', v);
        break;
      }
    }
  },

  /**
   * Crise de sucessão (RF-VIDA-138): quando morre o rei de um reino grande,
   * um pretendente pode levar a metade mais distante do reino e começar uma
   * guerra civil.
   */
  succession(this: Ecosystem, capital: Village): void {
    if (capital.abandoned || capital.kingdom !== capital.id || this.civRnd() > 0.3) return;
    const others = this.villages.filter((o) => !o.abandoned && o.kingdom === capital.id && o !== capital);
    if (others.length < 3) return;
    others.sort((p, q) => this.distance(capital, q.x, q.y) - this.distance(capital, p.x, p.y));
    const rebels = others.slice(0, Math.ceil(others.length / 2));
    const seat = rebels.reduce((p, q) => (q.population > p.population ? q : p));
    for (const o of rebels) o.kingdom = seat.id;
    this.newKingdom(seat, capital);
    const key = this.key(capital.id, seat.id);
    this.relations.set(key, -60);
    this.note(`O rei de ${capital.name} morreu sem herdeiro aceito: ${seat.name} coroou outro rei e levou ${rebels.length} assentamentos`, 'povo', seat, { major: true });
    if (!this.warOf(capital.id) && !this.warOf(seat.id) && this.civRnd() < 0.6) {
      this.startWar({ a: seat.id, b: capital.id, target: capital.id, naval: !this.landPath(seat.x, seat.y, capital.x, capital.y), motive: 'civil', home: seat.id });
      this.note(`Guerra civil entre ${seat.name} e ${capital.name}`, 'guerra', capital, { major: true });
      this.effect('swords', capital.x, capital.y - 3, 30, 1);
    }
  },

  /** Torna `v` capital de um reino novo saído de `old`: cultura, cor, estoque inicial. */
  newKingdom(this: Ecosystem, v: Village, old: Village): void {
    v.kingdom = v.id;
    this.emit({ kind: 'independence', year: this.year, village: v.id, from: old.id });
    v.culture = makeCulture(this.cultures++, v.name, this.polRnd);
    v.color = this.freshColor();
    for (const o of this.villages) if (o.kingdom === v.id) o.color = v.color;
    // Cada assentamento já tem o próprio estoque (RF-VIDA-212) e as próprias peças forjadas (a era é local): o reino
    // novo fica com o que ele mesmo fez (antes copiava as da capital antiga, e a era do rebelde subia com elas).
  },

  /**
   * Troca de excedentes entre dois reinos com mercado; quem recebe paga em
   * ouro se tiver. Cada reino troca pelo assentamento que mais tem sobrando e
   * entrega no que mais precisa (minério vai para quem tem ferraria), já que
   * o estoque é de cada assentamento (RF-VIDA-212).
   */
  trade(this: Ecosystem, a: Village, b: Village): boolean {
    let traded: '' | 'tin' | 'copper' | 'iron' | 'coal' | 'stone' | 'wood' = '';
    const members = (k: Village) => this.villages.filter((o) => !o.abandoned && o.kingdom === k.id);
    const ma = members(a);
    const mb = members(b);
    for (const r of ['tin', 'copper', 'iron', 'coal', 'stone', 'wood'] as const) {
      const ore = r !== 'stone' && r !== 'wood';
      const richest = (list: Village[]) => list.reduce((p, q) => (q.stock[r] > p.stock[r] ? q : p), list[0] ?? a);
      const neediest = (list: Village[]) => {
        const pool = ore && list.some((o) => this.has(o, 'smithy')) ? list.filter((o) => this.has(o, 'smithy')) : list;
        return pool.reduce((p, q) => (q.stock[r] < p.stock[r] ? q : p), pool[0] ?? a);
      };
      for (const [from, to] of [
        [richest(ma), neediest(mb)],
        [richest(mb), neediest(ma)],
      ]) {
        const bulk = r === 'stone' || r === 'wood';
        const amount = bulk ? 5 : 4;
        if (from.stock[r] > (bulk ? 25 : 10) && to.stock[r] < (bulk ? 5 : 4)) {
          from.stock[r] -= amount;
          to.stock[r] += amount;
          if (to.stock.gold >= 1) {
            to.stock.gold -= 1;
            from.stock.gold += 1;
          }
          traded ||= r;
        }
      }
    }
    if (traded) this.note(`${a.name} e ${b.name} trocaram ${traded === 'wood' ? 'madeira' : traded === 'stone' ? 'pedra' : ORE_NAMES[traded]}`, 'economia', a, { key: `trade:${this.key(a.id, b.id)}` });
    return traded !== '';
  },
};
export type DiplomacyPart = typeof diplomacyPart;
