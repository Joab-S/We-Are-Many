/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): barcos no mar: tubarões, naufrágios, rotas, desembarque e exploração.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { ROLE } from '../../roles';
import { wrapDx } from '../../settlement';
import type { Boat, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS, BOATS } = constantsModule;
const { cap } = helpersModule;
const { isWater, isLand } = tilesModule;

export const boatsPart = {
  /** Barco mais próximo de um ponto, dentro do raio. */
  boatNear(this: Ecosystem, x: number, y: number, radius: number): Boat | null {
    let best: Boat | null = null;
    let bd = radius * radius;
    for (const b of this.boats) {
      if (b.sunk >= 0) continue;
      const d = wrapDx(b.x - x, this.map.width) ** 2 + (b.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  },

  /** Um predador marinho ataca: barcos pequenos afundam, os grandes perdem alguém. */
  sharkAttack(this: Ecosystem, b: Boat, predator: string): void {
    if (this.civRnd() > 0.35 * (1 - b.kind * 0.2)) return;
    const v = this.villages[b.village];
    const type = BOATS[b.kind];
    const crew = { fish: '', colonize: ' de colonos', invade: ' de soldados', explore: ' de exploradores', trade: ' mercante' }[b.purpose];
    const what = b.purpose === 'fish' ? `um barco de pesca de ${v.name}` : `${type.the}${crew} de ${v.name}`;
    if (b.kind <= 1 && this.civRnd() < 0.5) {
      this.sink(b, `${predator}s afundaram ${b.purpose === 'fish' ? 'barcos de pesca' : what}`, b.purpose === 'fish' ? 'shark-fish' : undefined);
    } else if (b.passengers.length) {
      b.passengers.pop();
      this.note(`Um ${predator.toLowerCase()} atacou ${what}: um colono morreu`, 'mar', b);
      if (!b.passengers.length) this.sink(b, `Ninguém sobreviveu ${type.on} de ${v.name}`);
    } else if (b.purpose === 'fish') {
      this.sink(b, `${predator}s afundaram barcos de pesca`, 'shark-fish');
    }
  },

  /** Naufrágio: morrem os passageiros (ou um pescador, nos barcos de pesca). */
  sink(this: Ecosystem, b: Boat, message: string, key?: string): void {
    if (b.sunk >= 0) return;
    b.sunk = 0;
    const v = this.villages[b.village];
    if (b.purpose === 'fish') {
      for (let i = 0; i < this.count; i++) {
        if (this.alive[i] && this.village[i] === v.id && this.role[i] === ROLE.fisher) {
          this.kill(i, true, 'partiu');
          break;
        }
      }
    }
    b.passengers.length = 0;
    // Perder um barco de pesca é rotina: as repetições viram uma linha só.
    this.note(message, 'mar', b, { key, place: v.name, major: !key && b.purpose !== 'fish' });
  },

  /** Movimento dos barcos, pesca, chegada dos colonos e os perigos do mar. */
  updateBoats(this: Ecosystem, dt: number): void {
    const map = this.map;
    const w = map.width;
    for (let k = this.boats.length - 1; k >= 0; k--) {
      const b = this.boats[k];
      const v = this.villages[b.village];
      if (b.sunk >= 0) {
        b.sunk += dt;
        if (b.sunk > 6) this.boats.splice(k, 1);
        continue;
      }
      if (v.abandoned || v.port < 0) {
        if (b.purpose === 'fish') {
          this.boats.splice(k, 1);
          continue;
        }
      }
      const type = BOATS[b.kind];
      // À deriva: não avança, e a comida pode acabar.
      if (b.adrift > 0) {
        b.adrift -= dt;
        b.x = (b.x + Math.cos(b.heading) * 0.2 * dt + w) % w;
        if (b.passengers.length && happens(this.civRnd, B.ADRIFT_LOSS_RATE, dt / YEAR_SECONDS)) {
          b.passengers.pop();
          if (!b.passengers.length) this.sink(b, `${cap(type.the)} de ${v.name} se perdeu no mar e ninguém sobreviveu`);
        }
        continue;
      }
      let tx: number;
      let ty: number;
      if (b.purpose !== 'fish') {
        const t = b.path[Math.min(b.step, b.path.length - 1)];
        tx = (t % w) + 0.5;
        ty = Math.floor(t / w) + 0.5;
      } else {
        // Pesca em volta do porto e volta quando o tempo acaba.
        const px = (v.port % w) + 0.5;
        const py = Math.floor(v.port / w) + 0.5;
        b.timer -= dt;
        const far = Math.hypot(wrapDx(px - b.x, w), py - b.y);
        if (b.timer <= 0 && far < 1) {
          this.boats.splice(k, 1);
          continue;
        }
        if (b.timer <= 0 || far > 10) {
          tx = px;
          ty = py;
        } else {
          b.heading += (this.civRnd() - 0.5) * 2 * dt;
          tx = b.x + Math.cos(b.heading) * 3;
          ty = b.y + Math.sin(b.heading) * 3;
        }
        if (happens(this.civRnd, B.FISHING_CAST_RATE, dt / YEAR_SECONDS)) {
          this.forEachNear(b.x, b.y, 2, (j) => {
            if (this.species[this.kind[j]].kind === 'fish' && this.civRnd() < 0.5) {
              this.kill(j);
              this.book(v, '_fish', this.gain(v, 'food', v.vocation === 'pesqueira' ? 1 + B.VOCATION_BONUS : 1), 0);
            }
          });
        }
      }
      const dx = wrapDx(tx - b.x, w);
      const dy = ty - b.y;
      const d = Math.hypot(dx, dy);
      const move = Math.min(d, type.speed * dt);
      if (d > 0.01) {
        let nx = b.x + (dx / d) * move;
        let ny = b.y + (dy / d) * move;
        const t = this.tileAt(nx, Math.floor(ny));
        if (t < 0 || !isWater(map, t)) {
          // Barco de pesca bateu na costa: vira. Barco com rota conta o tempo parado (a costa mudou no caminho).
          b.heading += Math.PI * (0.5 + this.civRnd());
          nx = b.x;
          ny = b.y;
          b.blocked = (b.blocked ?? 0) + dt;
        } else b.blocked = 0;
        if (Math.abs(dx) > 0.05) b.facing = dx > 0 ? 1 : -1;
        b.x = (nx + w) % w;
        b.y = ny;
      }
      // Encalhado (o mar virou terra por baixo) ou parado tempo demais: refaz a rota ou desembarca onde está (seção 19.18).
      const under = this.tileAt(b.x, Math.floor(b.y));
      if (under < 0 || !isWater(map, under)) b.blocked = B.REROUTE_SECONDS + 1;
      if ((b.blocked ?? 0) > B.REROUTE_SECONDS) {
        if (b.purpose !== 'fish' && this.rerouteBoat(b)) b.blocked = 0;
        else {
          this.strand(b);
          this.boats.splice(k, 1);
          continue;
        }
      }
      if (b.purpose !== 'fish' && d < 0.35) {
        b.step++;
        if (b.step >= b.path.length) {
          if (b.purpose === 'trade') {
            if (!this.tradeBoatArrived(b)) continue;
            this.boats.splice(k, 1);
            continue;
          }
          if (b.purpose === 'invade') this.landSoldiers(b);
          else if (b.purpose === 'explore') this.explored(b);
          else this.landColonists(b);
          this.boats.splice(k, 1);
          continue;
        }
      }
      // Perigos: tempestades (mais comuns nos barcos antigos), ficar à deriva e doenças em viagens longas.
      // Barcos de pesca ficam perto da costa e voltam com tempo ruim: risco bem menor.
      if (this.civRnd() < type.risk * move * (b.purpose === 'fish' ? 0.25 : 1)) {
        if (b.purpose === 'fish') this.sink(b, 'Tempestades afundaram barcos de pesca', 'storm-fish');
        else this.sink(b, `Uma tempestade afundou ${type.the} de ${v.name}${b.passengers.length ? `: ${b.passengers.length} ${b.purpose === 'invade' ? 'soldados' : 'colonos'} morreram` : ''}`);
        continue;
      }
      if (b.purpose !== 'fish') {
        if (this.civRnd() < type.risk * 0.6 * move) {
          b.adrift = 6 + this.civRnd() * 10;
          b.heading = this.civRnd() * Math.PI * 2;
          this.note(`${cap(type.the)} de ${v.name} ficou à deriva`, 'mar', b);
        } else if (b.step > 40 && this.civRnd() < 0.0015 * move) {
          b.passengers.pop();
          this.note(`Uma doença a bordo matou um colono de ${v.name}`, 'mar', b, { key: `sick:${v.id}` });
          if (!b.passengers.length) this.sink(b, `Ninguém sobreviveu ${type.on} de ${v.name}`);
        }
      }
    }
  },

  /**
   * Nova rota pelo mar até o fim da rota antiga ou, se ele virou terra, até a
   * água mais perto dele (a até 3 tiles). Retorna se achou.
   */
  rerouteBoat(this: Ecosystem, b: Boat): boolean {
    const map = this.map;
    const w = map.width;
    const here = this.tileAt(b.x, Math.floor(b.y));
    if (here < 0 || !isWater(map, here) || !b.path.length) return false;
    const goal = b.path[b.path.length - 1];
    const gx = goal % w;
    const gy = Math.floor(goal / w);
    let found = -1;
    let bd = 3;
    this.searchSea(here, 200000, 65535, (t) => {
      if (t === goal) {
        found = t;
        return true;
      }
      const d = Math.hypot(wrapDx((t % w) - gx, w), Math.floor(t / w) - gy);
      if (d < bd) {
        bd = d;
        found = t;
      }
      return false;
    });
    if (found < 0) return false;
    const path: number[] = [];
    for (let t = found; t >= 0; t = this.searchParent[t]) path.push(t);
    b.path = path.reverse();
    b.step = 0;
    return true;
  },

  /**
   * Barco que não tem mais como seguir: o de pesca volta para casa; colonos,
   * soldados e exploradores desembarcam na terra mais perto; o mercante
   * devolve a carga em casa. Sem terra por perto, afunda.
   */
  strand(this: Ecosystem, b: Boat): void {
    const map = this.map;
    const w = map.width;
    const home = this.villages[b.village];
    if (b.purpose === 'fish') return;
    if (b.purpose === 'trade' && b.trade) {
      this.unload(home, b.trade.cargo, b.trade.purse);
      const px = home.port >= 0 ? (home.port % w) + 0.5 : home.x;
      const py = home.port >= 0 ? Math.floor(home.port / w) + 0.5 : home.y;
      for (const p of b.passengers) this.disembark(home, p, px, py);
      return;
    }
    let land = -1;
    const x = Math.floor(b.x);
    const y = Math.floor(b.y);
    for (let r = 0; r <= 3 && land < 0; r++) {
      for (let oy = -r; oy <= r && land < 0; oy++) {
        for (let ox = -r; ox <= r && land < 0; ox++) {
          const l = this.tileAt(x + ox, y + oy);
          if (l >= 0 && isLand(map, l)) land = l;
        }
      }
    }
    if (land < 0) {
      this.sink(b, `${cap(BOATS[b.kind].the)} de ${home.name} ficou sem rota e afundou`);
      return;
    }
    b.landing = land;
    if (b.purpose === 'invade') this.landSoldiers(b);
    else if (b.purpose === 'explore') this.explored(b);
    else this.landColonists(b);
  },

  /** Soldados desembarcam perto do alvo e marcham; se a guerra acabou no caminho, viram colonos. */
  landSoldiers(this: Ecosystem, b: Boat): void {
    const from = this.villages[b.village];
    const k = from.kingdom;
    if (!this.wars.some((w) => w.a === k)) {
      this.landColonists(b);
      return;
    }
    const w = this.map.width;
    const lx = b.landing % w;
    const ly = Math.floor(b.landing / w);
    for (const p of b.passengers) {
      const c = this.spawn(from.species, lx + this.polRnd(), ly + this.polRnd(), from.id, p.age);
      if (c < 0) continue;
      this.role[c] = ROLE.soldier;
      this.restore(c, p.who, true);
      this.expedition.add(c);
    }
    this.note(`Soldados de ${from.name} desembarcaram para a batalha`, 'guerra', { x: lx, y: ly });
  },

  /** Exploradores chegam a uma costa distante: podem achar outro povo (primeiro contato), minérios ou terras livres. */
  explored(this: Ecosystem, b: Boat): void {
    const from = this.villages[b.village];
    const w = this.map.width;
    const lx = b.landing % w;
    const ly = Math.floor(b.landing / w);
    const met = new Set<number>();
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom === from.kingdom || this.distance(v, lx, ly) > 35) continue;
      met.add(v.kingdom);
    }
    for (const k of met) {
      const key = this.key(k, from.kingdom);
      if (this.contacts.has(key) || this.relations.has(key)) continue;
      this.contacts.add(key);
      const other = this.villages[k];
      this.relations.set(key, (other.species !== from.species ? -30 : 0) + (other.culture.tolerance + from.culture.tolerance - 1) * 20);
      this.note(`Primeiro contato: exploradores de ${from.name} encontraram o povo ${other.culture.name}, de ${other.name}`, 'povo', { x: lx, y: ly }, { major: true });
    }
    for (const d of this.deposits) {
      if (d.amount > 0 && !d.known.has(from.kingdom) && Math.hypot(wrapDx(d.x - lx, w), d.y - ly) < 12) d.known.add(from.kingdom);
    }
    if (!met.size) this.note(`Exploradores de ${from.name} chegaram a terras desconhecidas`, 'mar', { x: lx, y: ly });
  },

  /** Manda exploradores pelo mar a uma costa distante, dentro do alcance do barco da era. */
  explore(this: Ecosystem, v: Village): boolean {
    if (v.port < 0 || this.boats.some((b) => b.village === v.id && b.purpose === 'explore' && b.sunk < 0)) return false;
    const map = this.map;
    const w = map.width;
    const type = BOATS[Math.min(BOATS.length - 1, Math.floor(v.tech))];
    const coasts: { water: number; land: number }[] = [];
    this.searchSea(v.port, 400000, type.range, (t, d) => {
      if (d < type.range * 0.35 || this.civRnd() > 0.05) return false;
      const x = t % w;
      const y = (t - x) / w;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const l = this.tileAt(x + ox, y + oy);
        if (l >= 0 && isLand(map, l)) {
          coasts.push({ water: t, land: l });
          break;
        }
      }
      return coasts.length >= 12;
    });
    if (!coasts.length) return false;
    const pick = coasts[Math.floor(this.civRnd() * coasts.length)];
    const path: number[] = [];
    for (let t = pick.water; t >= 0; t = this.searchParent[t]) path.push(t);
    path.reverse();
    this.launch(v, 'explore', path, pick.land, []);
    return true;
  },

  /** Os colonos desembarcam e fundam um assentamento (ou se juntam a um da mesma espécie). */
  landColonists(this: Ecosystem, b: Boat): void {
    const w = this.map.width;
    const from = this.villages[b.village];
    const lx = b.landing % w;
    const ly = Math.floor(b.landing / w);
    let target: Village | null = null;
    if (this.canSettle(from.species, lx, ly, from.tech)) {
      target = this.foundVillage(from.species, lx, ly, 0, from);
      this.note(`Colonos de ${from.name} cruzaram o mar de ${BOATS[b.kind].name.toLowerCase()} e fundaram ${target.name}`, 'mar', target, { major: true });
    } else {
      const other = this.settlementAt(lx, ly);
      if (other && other.species === from.species) {
        target = other;
        this.note(`Colonos de ${from.name} chegaram de barco a ${other.name}`, 'mar', other);
      }
    }
    if (!target) {
      // A costa mudou (ou não serve mais): desembarcam sozinhos e procuram um lugar bom a pé (seção 19.18).
      let landed = 0;
      for (const p of b.passengers) {
        if (!isLand(this.map, b.landing)) break;
        const c = this.spawn(from.species, lx + this.civRnd(), ly + this.civRnd(), -1, p.age);
        if (c < 0) continue;
        this.restore(c, p.who);
        this.movedAt[c] = this.year;
        landed++;
      }
      this.note(
        landed ? `Os colonos de ${from.name} desembarcaram num lugar ruim e saíram a pé procurando onde morar` : `Os colonos de ${from.name} não acharam onde morar e se perderam`,
        'mar',
        b,
      );
      return;
    }
    for (const p of b.passengers) {
      const c = this.spawn(from.species, lx + this.civRnd(), ly + this.civRnd(), target.id, p.age);
      if (c >= 0) {
        this.role[c] = p.role;
        this.restore(c, p.who);
        this.movedAt[c] = this.year;
      }
    }
  },
};
export type BoatsPart = typeof boatsPart;
