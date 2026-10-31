/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): guerras: força, combate, invasão por mar, saque, extermínio e conquista.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { GOODS, ORE_NAMES } from '../../economy';
import { pickRole, ROLE } from '../../roles';
import { emptyVital } from '../../people';
import { TIER_RADIUS, wrapDx } from '../../settlement';
import type { War, LootGood, Boat, Village } from '../types';
import * as constantsModule from '../constants';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS, BOATS, HERD_NAMES } = constantsModule;
const { isLand } = tilesModule;

export const warPart = {
  // Relações, comércio e guerra ---------------------------------------------

  key(this: Ecosystem, a: number, b: number): string {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  },

  relation(this: Ecosystem, a: number, b: number): number {
    return this.relations.get(this.key(a, b)) ?? 0;
  },

  /** Guerra em que o reino está, se houver. */
  warOf(this: Ecosystem, k: number): War | null {
    for (const w of this.wars) if (w.a === k || w.b === k) return w;
    return null;
  },

  /** Guerra entre dois reinos, se houver. */
  warBetween(this: Ecosystem, a: number, b: number): War | null {
    for (const w of this.wars) if ((w.a === a && w.b === b) || (w.a === b && w.b === a)) return w;
    return null;
  },

  rebuildEnemies(this: Ecosystem): void {
    this.enemies.clear();
    for (const w of this.wars) {
      for (const [x, y] of [[w.a, w.b], [w.b, w.a]]) {
        const set = this.enemies.get(x) ?? new Set<number>();
        set.add(y);
        this.enemies.set(x, set);
      }
    }
  },

  allied(this: Ecosystem, a: number, b: number): boolean {
    return this.alliances.has(this.key(a, b));
  },

  /**
   * Força de combate de um indivíduo: profissão, era, armas e armaduras do reino, cavalo
   * (RF-VIDA-223) e, no exército em campanha, comida e distância de casa (RF-VIDA-242).
   */
  strength(this: Ecosystem, i: number): number {
    const v = this.villages[this.village[i]];
    const st = this.store(v);
    const role = this.role[i];
    const rider = Math.floor(v.tech) >= 2 ? B.CAVALRY_STRENGTH : B.CHARIOT_STRENGTH;
    const base = role === ROLE.soldier ? (this.mounted(i) ? rider : 1.2) : role === ROLE.guard ? 1.1 : role === ROLE.king || role === ROLE.leader ? 0.8 : 0.4;
    const arms = 1 + 0.5 * st.weaponTier * Math.min(1, st.weapons / 10);
    const armor = 1 + 0.25 * st.armorTier * Math.min(1, st.armor / 10);
    const arena = this.villages[v.kingdom].houses.some((h) => h.kind === 'wonder') && this.villages[v.kingdom].culture.value === 'guerra' ? 1.15 : 1;
    return base * (1 + 0.15 * Math.floor(v.tech)) * arms * armor * arena * this.campaign(i, v);
  },

  /** Soldado montado: a parte dos soldados do assentamento que tem cavalo, do Bronze em diante (RF-VIDA-223). */
  mounted(this: Ecosystem, i: number): boolean {
    if (this.role[i] !== ROLE.soldier || this.village[i] < 0) return false;
    const share = this.cavalry.get(this.village[i]) ?? 0;
    return share > 0 && (Math.imul(this.uid[i] + 1, 2654435761) >>> 0) / 4294967296 < share;
  },

  /** Força do soldado em campanha: perde com o exército sem comida e longe de casa (RF-VIDA-242). */
  campaign(this: Ecosystem, i: number, v: Village): number {
    if (this.role[i] !== ROLE.soldier) return 1;
    for (const war of this.wars) {
      if (war.a !== v.kingdom) continue;
      const fed = B.HUNGRY_ARMY + (1 - B.HUNGRY_ARMY) * war.supply;
      return fed * (this.distance(v, this.x[i], this.y[i]) > B.ARMY_REACH ? B.FAR_FROM_HOME : 1);
    }
    return 1;
  },

  /** Luta entre dois indivíduos de reinos em guerra: um deles morre. */
  fight(this: Ecosystem, i: number, j: number, war: War): void {
    const si = this.strength(i);
    const sj = this.strength(j);
    const loser = this.polRnd() < si / (si + sj) ? j : i;
    const k = this.villages[this.village[loser]].kingdom;
    war.losses[k === war.a ? 0 : 1]++;
    const st = this.villages[this.village[loser]].stock;
    if (this.role[loser] === ROLE.soldier) {
      if (st.weapons > 0) st.weapons--;
      if (st.armor > 0 && this.polRnd() < 0.5) st.armor--;
      // O cavalo do soldado montado morre ou foge com ele.
      if (this.mounted(loser) && st.horses > 0) {
        st.horses--;
        const herd = this.villages[this.village[loser]].herd;
        if (herd && (herd.kind === 'horse' || herd.kind === 'camel') && herd.head > 0) herd.head--;
      }
    }
    this.kill(loser, true, 'guerra');
  },

  /** Combate e marcha dos soldados; chamado no `decide` de cada inteligente. */
  soldier(this: Ecosystem, i: number, v: Village): { x: number; y: number } | null {
    const enemies = this.enemies.get(v.kingdom);
    if (!enemies) return null;
    const role = this.role[i];
    if (role === ROLE.soldier || role === ROLE.guard) {
      let foe = -1;
      this.forEachNear(this.x[i], this.y[i], 1.5, (j) => {
        if (foe >= 0 || this.village[j] < 0 || this.species[this.kind[j]].kind !== 'sapient') return;
        if (enemies.has(this.villages[this.village[j]].kingdom)) foe = j;
      });
      if (foe >= 0) {
        const war = this.warBetween(v.kingdom, this.villages[this.village[foe]].kingdom);
        if (war) this.fight(i, foe, war);
        return null;
      }
    }
    if (role !== ROLE.soldier) return null;
    // Soldados do atacante marcham até o alvo (por terra, até 90 tiles; os que desembarcaram, de qualquer distância).
    // O bando que já saqueou volta para casa com o saque.
    for (const war of this.wars) {
      if (war.a !== v.kingdom || war.returning !== undefined) continue;
      const target = this.villages[war.target];
      if (!this.expedition.has(i) && (war.naval || this.distance(target, v.x, v.y) > 90)) continue;
      // Soldados inimigos à vista: o alarme toca no alvo (RF-AS-28, milícia e abrigo).
      if (this.distance(target, this.x[i], this.y[i]) < this.footprint(target) + B.ALARM_DIST) target.alarmUntil = this.year + B.ALARM_SPAN;
      return { x: wrapDx(target.x - this.x[i], this.map.width), y: target.y - this.y[i] };
    }
    return null;
  },

  /** Conquista (atacantes na praça e nenhum defensor armado por perto) e invasões por mar. */
  updateWars(this: Ecosystem, dt: number): void {
    for (let k = this.wars.length - 1; k >= 0; k--) {
      const war = this.wars[k];
      const a = this.villages[war.a];
      const b = this.villages[war.b];
      const target = this.villages[war.target];
      if (a.abandoned || b.abandoned || target.abandoned || a.kingdom !== war.a || b.kingdom !== war.b || target.kingdom !== war.b) {
        this.endWar(k);
        continue;
      }
      // Conquista pede soldados na praça; o saque acontece já na periferia, onde ficam roças, rebanho e celeiros.
      const inner = this.radius(target) * 0.6;
      const reach = war.motive === 'loot' ? this.radius(target) + 2 : inner;
      let attackers = 0;
      let defenders = 0;
      this.forEachNear(target.x, target.y, reach, (j, dx, dy) => {
        const vj = this.village[j];
        if (vj < 0 || this.species[this.kind[j]].kind !== 'sapient') return;
        const r = this.role[j];
        const kj = this.villages[vj].kingdom;
        if (kj === war.a && r === ROLE.soldier) attackers++;
        else if (kj === war.b && (r === ROLE.soldier || r === ROLE.guard) && dx * dx + dy * dy <= inner * inner) defenders++;
      });
      if (war.returning !== undefined) {
        // O bando com o saque saiu do alvo (ou demorou demais): o saque chega em casa e a guerra acaba.
        if ((attackers === 0 && this.year - war.returning >= 0.3) || this.year - war.returning >= B.LOOT_RETURN_YEARS) {
          this.bringLoot(war);
          this.endWar(k);
        }
        continue;
      }
      if (war.motive === 'loot') {
        // Saque: um bando que chega sem defesa à altura leva o que veio buscar e volta.
        if (attackers >= 1 && defenders < attackers + 1) this.plunder(war, target);
      } else if (attackers >= 3 && defenders === 0) {
        if (war.motive === 'extermination') this.exterminate(war, target);
        else this.conquer(war, target);
        this.endWar(k);
        continue;
      }
      if (war.naval && happens(this.polRnd, B.NAVAL_LANDING_RATE, dt / YEAR_SECONDS)) this.invadeBySea(war);
    }
    this.rebuildEnemies();
  },

  /** Rota de barco do porto `from` até a costa perto do alvo, dentro do alcance; null se não houver. */
  seaRoute(this: Ecosystem, from: Village, target: Village): { path: number[]; landing: number } | null {
    if (from.port < 0) return null;
    const w = this.map.width;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(from.tech))];
    let found = -1;
    let landing = -1;
    const reach = this.radius(target) + 6;
    this.searchSea(from.port, 400000, type.range, (t) => {
      const x = t % w;
      const y = (t - x) / w;
      if (Math.hypot(wrapDx(x - target.x, w), y - target.y) > reach) return false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = this.tileAt(x + ox, y + oy);
        if (l >= 0 && isLand(this.map, l)) {
          found = t;
          landing = l;
          return true;
        }
      }
      return false;
    });
    if (found < 0) return null;
    const path: number[] = [];
    for (let t = found; t >= 0; t = this.searchParent[t]) path.push(t);
    return { path: path.reverse(), landing };
  },

  /** Porto do reino `k` com rota até o alvo, se houver. */
  navalBase(this: Ecosystem, k: number, target: Village): { from: Village; route: { path: number[]; landing: number } } | null {
    if (Math.floor(this.villages[k].tech) < 1) return null;
    const ports = this.villages.filter((v) => !v.abandoned && v.kingdom === k && v.port >= 0).sort((p, q) => this.distance(p, target.x, target.y) - this.distance(q, target.x, target.y));
    for (const from of ports.slice(0, 3)) {
      const route = this.seaRoute(from, target);
      if (route) return { from, route };
    }
    return null;
  },

  /** Invasão por mar: soldados embarcam no porto mais perto e desembarcam perto do alvo. */
  invadeBySea(this: Ecosystem, war: War): void {
    if (this.boats.filter((b) => b.purpose === 'invade' && b.sunk < 0 && this.villages[b.village].kingdom === war.a).length >= 2) return;
    const base = this.navalBase(war.a, this.villages[war.target]);
    if (!base) return;
    const { from, route } = base;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(from.tech))];
    const passengers: Boat['passengers'] = [];
    for (let i = 0; i < this.count && passengers.length < type.capacity; i++) {
      if (!this.alive[i] || this.role[i] !== ROLE.soldier || this.village[i] < 0 || this.villages[this.village[i]].kingdom !== war.a) continue;
      if (this.distance(from, this.x[i], this.y[i]) > this.radius(from) + 6) continue;
      passengers.push({ age: this.age[i], role: ROLE.soldier, who: this.identity(i) });
      this.kill(i, true, 'partiu');
    }
    if (passengers.length < 3) {
      for (const p of passengers) {
        const c = this.spawn(from.species, from.x + this.polRnd(), from.y + this.polRnd(), from.id, p.age);
        if (c >= 0) {
          this.role[c] = p.role;
          this.restore(c, p.who, true);
        }
      }
      return;
    }
    this.launch(from, 'invade', route.path, route.landing, passengers);
    this.note(`${passengers.length} soldados de ${from.name} zarparam ${type.on} para atacar ${this.villages[war.target].name}`, 'guerra', from);
  },

  /**
   * Fim de uma guerra: trégua mínima entre os dois (TRUCE_MIN anos) e os mercenários são dispensados.
   * Depois disso só o preparo segura uma guerra nova: o estoque gasto, as armas perdidas e os soldados
   * mortos têm de voltar a dar ao reino a sensação de vantagem.
   */
  endWar(this: Ecosystem, k: number): void {
    const war = this.wars[k];
    this.wars.splice(k, 1);
    this.truces.set(this.key(war.a, war.b), this.year + B.TRUCE_MIN);
    for (const i of this.mercenaries) {
      if (!this.alive[i] || this.village[i] < 0) {
        this.mercenaries.delete(i);
        continue;
      }
      const v = this.villages[this.village[i]];
      if (v.kingdom !== war.a && v.kingdom !== war.b) continue;
      // O mercenário fica onde está, com uma profissão de paz.
      this.role[i] = pickRole(Math.floor(v.tech), this.scale(v), this.civRnd(), this.roleContext(v));
      if (this.role[i] === ROLE.soldier) this.role[i] = ROLE.gatherer;
      this.mercenaries.delete(i);
    }
  },

  /** Rancor do vencido (RF-VIDA-243): a relação cai a cada ano até GRUDGE_YEARS. */
  grudge(this: Ecosystem, a: number, b: number, years = B.GRUDGE_YEARS): void {
    const key = this.key(a, b);
    this.grudges.set(key, Math.max(this.grudges.get(key) ?? 0, this.year + years));
  },

  /** Começa uma guerra (todas passam por aqui) e conta o pico. */
  startWar(this: Ecosystem, war: Omit<War, 'losses' | 'years' | 'supply' | 'mercs'>): War {
    const full: War = { ...war, losses: [0, 0], years: 0, supply: 1, mercs: [0, 0] };
    this.wars.push(full);
    const t = this.tally;
    if (war.motive === 'loot') t.lootWars++;
    else if (war.motive === 'extermination') t.exterminations++;
    else if (war.motive === 'civil') t.civilWars++;
    else t.landWars++;
    t.wars++;
    t.warsPeak = Math.max(t.warsPeak, this.wars.length);
    return full;
  },

  /** Nome do bem cobiçado na crônica: "os cavalos do haras de Votek". */
  lootName(this: Ecosystem, good: LootGood, v: Village, place = true): string {
    const what =
      good === 'horses' ? `os cavalos${this.has(v, 'stable') ? ' do haras' : ''}` : good === 'iron' ? 'o ferro' : good === 'gold' ? 'o ouro' : good === 'wood' ? 'a madeira' : 'a comida dos celeiros';
    return place ? `${what} de ${v.name}` : what;
  },

  /** O que a guerra de território quer tomar (RF-VIDA-240): jazida, porto, pasto, terra fértil ou o próprio lugar. */
  prizeName(this: Ecosystem, v: Village): string {
    if (v.mines.length) return `a jazida de ${ORE_NAMES[this.deposits[v.mines[0]].ore]} de ${v.name}`;
    if (v.port >= 0) return `o porto de ${v.name}`;
    if (v.herd && v.herd.head >= 4) return `os pastos de ${v.name}`;
    if (v.fields >= 2) return `as terras férteis de ${v.name}`;
    return v.name;
  },

  /**
   * Bem que um reino cobiça do vizinho (RF-VIDA-240): cavalos (do Bronze), ferro (do Ferro) ou
   * ouro, quando ele quase não tem e o vizinho tem muito. Devolve o bem, a cobiça (0 a 1) e onde está.
   */
  covet(this: Ecosystem, own: Village[], other: Village[]): { good: LootGood; want: number; from: Village } | null {
    let era = 0;
    let horses = 0;
    let iron = 0;
    let gold = 0;
    for (const v of own) {
      era = Math.max(era, Math.floor(v.tech));
      horses += v.stock.horses;
      iron += v.stock.iron + v.stock.weapons * 0.5;
      gold += v.stock.gold;
    }
    let best: { good: LootGood; want: number; from: Village } | null = null;
    const offer = (good: LootGood, mine: number, need: number, theirs: (o: Village) => number, plenty: number) => {
      if (mine >= need) return;
      for (const o of other) {
        const have = theirs(o);
        if (have < plenty) continue;
        const want = (1 - mine / need) * Math.min(1, have / (plenty * 2));
        if (!best || want > best.want) best = { good, want, from: o };
      }
    };
    if (era >= 1) offer('horses', horses, 2, (o) => o.stock.horses, 6);
    if (era >= 2) offer('iron', iron, 4, (o) => o.stock.iron, 10);
    offer('gold', gold, 2, (o) => o.stock.gold, 10);
    return best;
  },

  /** Moradores que fogem da guerra para o vizinho mais perto fora do reino inimigo (RF-VIDA-243). Devolve quantos. */
  flee(this: Ecosystem, v: Village, share: number, enemy: number): number {
    let best: Village | null = null;
    let bd = 80;
    for (const o of this.villages) {
      if (o === v || o.abandoned || o.species !== v.species || o.kingdom === enemy) continue;
      const d = this.distance(o, v.x, v.y);
      if (d < bd && this.landPath(v.x, v.y, o.x, o.y)) {
        bd = d;
        best = o;
      }
    }
    if (!best) return 0;
    const want = Math.round(v.population * share);
    let moved = 0;
    const here = this.residents(v.id);
    for (let k = 0; k < here.length && moved < want; k++) {
      const i = here[k];
      if (!this.alive[i] || this.village[i] !== v.id || i === v.leader) continue;
      this.moveTo(i, v, best);
      moved++;
    }
    if (moved) {
      this.tally.refugees += moved;
      this.note(`${moved} refugiados de ${v.name} fugiram para ${best.name}`, 'guerra', best);
    }
    return moved;
  },

  /** Muda alguém de assentamento, com as contas de quem saiu e de quem chegou. */
  moveTo(this: Ecosystem, i: number, from: Village, to: Village): void {
    from.population--;
    this.setVillage(i, -1);
    (from.vitalNow ??= emptyVital()).left++;
    this.join(i, to);
  },

  /** O bando chega à praça (RF-VIDA-243): leva o bem cobiçado e parte do rebanho, queima roças e volta. */
  plunder(this: Ecosystem, war: War, target: Village): void {
    const good = war.good ?? 'food';
    let took = 0;
    if (good === 'food') {
      took = target.food * B.LOOT_SHARE;
      target.food -= took;
    } else if (good === 'horses' && target.herd && (target.herd.kind === 'horse' || target.herd.kind === 'camel')) {
      took = Math.floor(target.herd.head * B.LOOT_SHARE);
      target.herd.head -= took;
      target.stock.horses = target.herd.head;
    } else {
      took = good === 'horses' ? Math.floor(target.stock[good] * B.LOOT_SHARE) : target.stock[good] * B.LOOT_SHARE;
      target.stock[good] -= took;
    }
    let herd = 0;
    if (good !== 'horses' && target.herd && !target.herd.away && target.herd.head >= 4) {
      herd = Math.floor(target.herd.head * B.LOOT_HERD);
      target.herd.head -= herd;
    }
    let burned = 0;
    for (; burned < B.BURNED_FIELDS && target.fields > 0; burned++) this.dropField(target);
    if (burned) this.effect('flame', target.x, target.y, 25, 1.4);
    war.loot = took;
    war.herd = herd;
    war.returning = this.year;
    this.tally.looted++;
    this.tally.burned += burned;
    const extra = [herd ? `${herd} ${HERD_NAMES[target.herd!.kind]}` : '', burned ? 'queimou as roças' : ''].filter(Boolean).join(' e ');
    this.note(`${this.villages[war.home].name} saqueou ${target.name}: levou ${this.lootName(good, target, false)}${extra ? `, ${extra}` : ''}`, 'guerra', target, { major: true });
  },

  /** O saque chega em casa (até o teto), com o rebanho roubado; o vencido guarda rancor. */
  bringLoot(this: Ecosystem, war: War): void {
    let home = this.villages[war.home];
    if (home.abandoned || home.kingdom !== war.a) home = this.villages[war.a];
    const good = war.good ?? 'food';
    const n = war.loot ?? 0;
    if (good === 'food') home.food = Math.min(this.capOf(home, 'food'), home.food + n);
    else if (good === 'horses') {
      if (home.herd && (home.herd.kind === 'horse' || home.herd.kind === 'camel')) home.herd.head += n;
      home.stock.horses += n;
    } else home.stock[good] = Math.min(this.capOf(home, good), home.stock[good] + n);
    const stolen = war.herd ?? 0;
    const kind = this.villages[war.target].herd?.kind;
    // O rebanho roubado entra no do atacante se for do mesmo bicho; se não, vira comida.
    if (stolen && home.herd && home.herd.kind === kind) home.herd.head += stolen;
    else if (stolen) home.food = Math.min(this.capOf(home, 'food'), home.food + stolen * 2);
    this.relations.set(this.key(war.a, war.b), Math.min(this.relation(war.a, war.b), -30));
    this.grudge(war.a, war.b, B.GRUDGE_YEARS / 2);
    this.vengeance.set(`${war.b}>${war.a}`, this.year + B.GRUDGE_YEARS / 2);
    this.note(`O bando de ${home.name} voltou para casa com o saque de ${this.villages[war.target].name}`, 'guerra', home);
  },

  /**
   * Guerra de extermínio vencida (RF-VIDA-240): metade do povo foge, o resto morre, o lugar é
   * arrasado e o vencedor funda um assentamento novo sobre as ruínas (RF-VIDA-108).
   */
  exterminate(this: Ecosystem, war: War, target: Village): void {
    const winner = this.villages[war.a];
    const name = target.name;
    this.flee(target, 0.5, war.a);
    for (const i of this.residents(target.id)) if (this.alive[i] && this.village[i] === target.id) this.kill(i, true, 'guerra');
    target.lastCause = 'na guerra';
    this.abandon(target, true);
    this.effect('flame', target.x, target.y, 40, 2);
    this.tally.burned += 1;
    // Os soldados que estão no lugar ficam e fundam o assentamento novo.
    const settlers: number[] = [];
    this.forEachNear(target.x, target.y, TIER_RADIUS[0] + 4, (j) => {
      const vj = this.village[j];
      if (vj >= 0 && this.role[j] === ROLE.soldier && this.villages[vj].kingdom === war.a) settlers.push(j);
    });
    const people = winner.culture.name;
    if (settlers.length < 2) {
      this.note(`Os ${people} arrasaram ${name}`, 'guerra', target, { major: true });
      return;
    }
    const nv = this.foundVillage(winner.species, Math.floor(target.x), Math.floor(target.y), 0, winner);
    const fresh = `Nova ${winner.name}`;
    if (!this.villages.some((o) => o.name === fresh)) nv.name = fresh;
    for (const j of settlers) {
      this.expedition.delete(j);
      this.moveTo(j, this.villages[this.village[j]], nv);
    }
    this.note(`Os ${people} arrasaram ${name} e fundaram ${nv.name} nas ruínas`, 'guerra', nv, { major: true });
  },

  conquer(this: Ecosystem, war: War, target: Village): void {
    const winner = this.villages[war.a];
    // Consequências (RF-VIDA-243): parte do povo foge, casas queimam, o rebanho muda de dono.
    this.flee(target, B.REFUGEE_SHARE, war.a);
    const homes = target.houses.filter((h) => h.kind === 'house');
    const burn = Math.min(homes.length - 1, Math.round(homes.length * B.RAZE_SHARE));
    for (let n = 0; n < burn; n++) {
      const at = target.houses.indexOf(homes[n * Math.floor(homes.length / Math.max(1, burn)) % homes.length]);
      if (at >= 0) this.raze(target, at);
    }
    if (burn > 0) {
      this.effect('flame', target.x, target.y, 30, 1.6);
      this.tally.burned += burn;
    }
    // Uma capital conquistada liberta os assentamentos do seu reino.
    if (target.kingdom === target.id) {
      for (const o of this.villages) if (o !== target && !o.abandoned && o.kingdom === target.id) o.kingdom = o.id;
    }
    // Saque: metade do estoque do assentamento tomado vai, carregada, para a capital vencedora (até o teto dela).
    const loot = target.stock;
    for (const key of GOODS) {
      const half = loot[key] / 2;
      loot[key] -= half;
      winner.stock[key] = Math.min(this.capOf(winner, key), winner.stock[key] + half);
    }
    target.kingdom = winner.id;
    target.color = winner.color;
    target.leader = -1;
    for (const id of target.mines) this.deposits[id].known.add(winner.id);
    this.relations.set(this.key(war.a, war.b), -20);
    this.grudge(war.a, war.b);
    this.vengeance.set(`${war.b}>${war.a}`, this.year + B.GRUDGE_YEARS);
    this.note(`${winner.name} conquistou ${target.name}${burn > 0 ? `; ${burn > 1 ? `${burn} casas queimaram` : 'uma casa queimou'}` : ''}`, 'guerra', target, { major: true });
  },
};
export type WarPart = typeof warPart;
