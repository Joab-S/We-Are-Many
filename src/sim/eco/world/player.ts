/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): ferramentas do jogador: jazidas, limpeza, demolição, espécies, comida e ensino.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { classify, Decor, decorAt } from '../../../procgen/surface';
import type { Deposit, Ore } from '../../economy';
import { wrapDx } from '../../settlement';
import type { Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isLand } = tilesModule;

export const playerPart = {
  /** Nova jazida de minério (cometa, terremoto, vulcão ou o jogador). */
  addDeposit(this: Ecosystem, x: number, y: number, ore: Ore, amount: number, cave: boolean): Deposit | null {
    const t = this.tileAt(x, Math.floor(y));
    if (t < 0 || !isLand(this.map, t) || this.depositAt[t] >= 0 || this.built[t]) return null;
    const w = this.map.width;
    const d: Deposit = { id: this.deposits.length, x: t % w, y: Math.floor(t / w), ore, amount, initial: amount, cave, mine: -1, known: new Set() };
    this.deposits.push(d);
    this.depositAt[t] = d.id;
    return d;
  },

  /**
   * Ferramenta Limpar (seção 19.18): tira do mapa o que é da natureza num
   * raio: árvores (a mata fica rala e rebrota), pedregulhos e cactos, jazidas
   * de minério e ruínas. O material se perde: só o trabalho do povo põe
   * madeira, pedra e minério no estoque (seção 19.19). Retorna quantos itens.
   */
  clearNature(this: Ecosystem, x: number, y: number, r: number): number {
    const map = this.map;
    map.bare ??= new Uint8Array(map.width * map.height);
    const ri = Math.ceil(r);
    let trees = 0;
    let rocks = 0;
    let ores = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(Math.floor(x) + dx, Math.floor(y) + dy);
        if (t < 0) continue;
        let changed = false;
        const decor = isLand(map, t) && !this.road[t] && !this.built[t] ? decorAt(map, t) : Decor.None;
        if (decor === Decor.Tree || decor === Decor.JungleTree || decor === Decor.Pine || decor === Decor.Acacia) {
          // Fica mato baixo: abaixo do limiar de árvore de cada bioma.
          map.vegetation[t] = Math.min(map.vegetation[t], 0.26);
          trees++;
          changed = true;
        } else if (decor === Decor.Stump || decor === Decor.Sapling) {
          map.felled![t] = 0;
          this.stumps.delete(t);
          trees++;
          changed = true;
        } else if (decor === Decor.Boulder || decor === Decor.Cactus) {
          map.bare[t] = 1;
          if (decor === Decor.Boulder) rocks++;
          changed = true;
        }
        const id = this.depositAt[t];
        if (id >= 0 && this.deposits[id].amount > 0) {
          const d = this.deposits[id];
          d.amount = 0;
          if (d.mine >= 0) {
            const owner = this.villages[d.mine];
            const at = owner.mines.indexOf(id);
            if (at >= 0) owner.mines.splice(at, 1);
            d.mine = -1;
          }
          ores++;
        }
        if (changed) {
          map.biome[t] = classify(map, t);
          this.onTileChanged(t);
        }
      }
    }
    for (let k = this.ruins.length - 1; k >= 0; k--) {
      const q = this.ruins[k];
      if (Math.hypot(wrapDx(q.x - x, map.width), q.y - 1 - y) <= r) {
        this.ruins.splice(k, 1);
        rocks++;
      }
    }
    const n = trees + rocks + ores;
    if (n) this.note('Você limpou o terreno', 'jogador', { x, y }, { key: 'limpar' });
    return n;
  },

  /**
   * Ferramenta Demolir (seção 19.18): derruba as construções do povo num
   * raio: casas e prédios que encostam no pincel, ruas, praça, roças e
   * pastos. O material se perde; o povo reconstrói depois, se precisar,
   * pagando de novo. Retorna quantas construções caíram.
   */
  demolish(this: Ecosystem, x: number, y: number, r: number): number {
    const w = this.map.width;
    let n = 0;
    for (const v of this.villages) {
      if (v.abandoned || this.distance(v, x, y) > r + this.radius(v) + 3) continue;
      for (let k = v.houses.length - 1; k >= 0; k--) {
        const h = v.houses[k];
        const size = h.kind === 'port' ? 1 : 2;
        if (Math.hypot(wrapDx(h.x + size / 2 - x, w), h.y + size / 2 - y) > r + size / 2) continue;
        this.raze(v, k);
        n++;
      }
    }
    const ri = Math.ceil(r);
    let tiles = 0;
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(Math.floor(x) + dx, Math.floor(y) + dy);
        if (t < 0 || !this.road[t]) continue;
        this.road[t] = 0;
        this.mainStreet[t] = 0;
        this.traffic[t] = 0;
        this.tolls.delete(t);
        this.onTileChanged(t);
        tiles++;
      }
    }
    for (let k = this.ruins.length - 1; k >= 0; k--) {
      const q = this.ruins[k];
      if (Math.hypot(wrapDx(q.x - x, w), q.y - 1 - y) <= r) this.ruins.splice(k, 1);
    }
    if (n || tiles) {
      this.reconcile(x, y, ri);
      this.note(`Você demoliu ${n ? `${n} construções` : 'ruas e roças'}`, 'jogador', { x, y }, { key: 'demolir' });
    }
    return n;
  },

  /** Mata criaturas num raio sem registrar cada morte; retorna quantas. */
  killAround(this: Ecosystem, x: number, y: number, r: number, chance = 1): number {
    this.buildGrid();
    let n = 0;
    this.forEachNear(x, y, r, (i) => {
      if (this.worldRnd() > chance) return;
      this.kill(i, true, 'desastre');
      n++;
    });
    return n;
  },

  // Ferramentas do jogador -------------------------------------------------

  /** Introduz indivíduos de uma espécie já conhecida numa área. Retorna quantos nasceram. */
  introduce(this: Ecosystem, s: number, x: number, y: number, radius: number, amount: number): number {
    const w = this.map.width;
    let born = 0;
    if (this.species[s].kind === 'sapient') {
      const tile = Math.floor(y) * w + (((Math.floor(x) % w) + w) % w);
      if (!this.habitable(s, tile)) return 0;
      const other = this.settlementAt(x, y);
      if (other || !this.canFound(Math.floor(x), Math.floor(y))) {
        this.hint = `Muito perto de ${other?.name ?? 'outro assentamento'}: escolha um lugar fora da área`;
        return 0;
      }
      // Lugar ruim para morar (seção 19.18): eles chegam, olham em volta e saem procurando um lugar melhor. O veto é o
      // de toda fundação (`siteFilter`: clima, verde no centro e o exame da área), com a técnica de quem chega (Pedra).
      const why = this.siteFilter(s, x, y, 0);
      if (why) {
        for (let k = 0; k < Math.max(4, amount); k++) {
          if (this.spawn(s, (((x + (this.rnd() - 0.5) * 3) % w) + w) % w, y + (this.rnd() - 0.5) * 3, -1, this.species[s].maturity + this.rnd() * 10) >= 0) born++;
        }
        this.hint = `Aqui não dá para fundar (${why}): eles vão procurar um lugar melhor`;
        this.note(`Você trouxe ${this.species[s].name.toLowerCase()}s, que saíram procurando onde morar`, 'jogador', { x, y });
        return born;
      }
      const v = this.foundVillage(s, ((Math.floor(x) % w) + w) % w, Math.floor(y), Math.max(4, amount));
      this.note(`Você trouxe ${this.species[s].name.toLowerCase()}s, que fundaram ${v.name}`, 'jogador', v);
      return v.population;
    }
    for (let k = 0; k < amount * 4 && born < amount; k++) {
      const a = this.rnd() * Math.PI * 2;
      const d = Math.sqrt(this.rnd()) * radius;
      const tx = Math.floor(x + Math.cos(a) * d);
      const ty = Math.floor(y + Math.sin(a) * d);
      if (ty < 0 || ty >= this.map.height) continue;
      const tile = ty * w + (((tx % w) + w) % w);
      if (!this.habitable(s, tile)) continue;
      if (this.spawnAtTile(s, tile, -1, this.species[s].maturity) >= 0) born++;
    }
    return born;
  },

  /** Reduz a população numa área (controle de população). */
  cull(this: Ecosystem, x: number, y: number, radius: number): number {
    this.buildGrid();
    let n = 0;
    this.forEachNear(x, y, radius, (i) => {
      this.kill(i, false, 'jogador');
      n++;
    });
    return n;
  },

  /** Alimenta as criaturas numa área. */
  feed(this: Ecosystem, x: number, y: number, radius: number): void {
    this.buildGrid();
    this.forEachNear(x, y, radius, (i) => {
      this.energy[i] = 1;
    });
  },

  /** Avança o conhecimento de um assentamento (sem pular a condição de era). */
  teachVillage(this: Ecosystem, v: Village, amount: number): void {
    this.advance(v, amount);
    this.teachTech(v);
  },

  /** Ensina as aldeias numa área: avança a tecnologia delas. */
  teach(this: Ecosystem, x: number, y: number, radius: number, amount: number): Village[] {
    const w = this.map.width;
    const taught: Village[] = [];
    for (const v of this.villages) {
      if (v.abandoned) continue;
      let dx = Math.abs(v.x - x);
      if (dx > w / 2) dx = w - dx;
      if (dx * dx + (v.y - y) ** 2 <= (radius + 4) ** 2) {
        this.advance(v, amount);
        this.teachTech(v);
        taught.push(v);
      }
    }
    return taught;
  },
};
export type PlayerPart = typeof playerPart;
