/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): escolha de lugar, andarilhos e fundação por quem anda sozinho.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import { mulberry32 } from '../../../core/rng';
import { temperatureAt } from '../../../procgen/surface';
import { CHILD, pickRole } from '../../roles';
import { emptyVital } from '../../people';
import { plotSeed, wrapDx } from '../../settlement';
import { ecologyOf } from '../../fauna';
import type { Village } from '../types';
import * as tilesModule from '../tiles';
import * as constantsModule from '../constants';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isWater, NEIGHBORS4 } = tilesModule;
const { YEAR_SECONDS } = constantsModule;

export const foundingPart = {
  /** Direção de um tile mais verde (e no clima da espécie) a até `range` tiles, se houver. */
  greener(this: Ecosystem, i: number, range: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const sp = this.species[s];
    let bestVeg = this.map.vegetation[this.tileOf(i)] + 0.05;
    let best: { x: number; y: number } | undefined;
    for (let k = 0; k < 8; k++) {
      const a = this.rnd() * Math.PI * 2;
      const r = 3 + this.rnd() * (range - 3);
      const t = this.tileAt(this.x[i] + Math.cos(a) * r, Math.floor(this.y[i] + Math.sin(a) * r));
      if (t < 0 || !this.canStand(s, t)) continue;
      const tt = temperatureAt(this.map, t);
      if (tt < sp.tempMin || tt > sp.tempMax || this.map.vegetation[t] <= bestVeg) continue;
      bestVeg = this.map.vegetation[t];
      best = { x: Math.cos(a), y: Math.sin(a) };
    }
    return best;
  },

  /** Direção de um lugar com temperatura melhor para a espécie, a até 10 tiles. */
  comfortBias(this: Ecosystem, i: number, temp: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const sp = this.species[s];
    const mid = (sp.tempMin + sp.tempMax) / 2;
    let bestGap = Math.abs(temp - mid);
    let best: { x: number; y: number } | undefined;
    for (let k = 0; k < 8; k++) {
      // Bicho de terra procura abrigo no fluxo da fauna; gente, no da vida.
      const rnd = this.wild(s) ? this.faunaRnd : this.rnd;
      const a = (k / 8) * Math.PI * 2 + rnd() * 0.6;
      const r = 4 + rnd() * (this.wild(s) ? Math.max(6, ecologyOf(sp).roam / 8) : 6);
      const t = this.tileAt(this.x[i] + Math.cos(a) * r, Math.floor(this.y[i] + Math.sin(a) * r));
      if (t < 0 || !this.canStand(s, t)) continue;
      const gap = Math.abs(temperatureAt(this.map, t) - mid);
      if (gap < bestGap) {
        bestGap = gap;
        best = { x: Math.cos(a), y: Math.sin(a) };
      }
    }
    return best;
  },

  /**
   * Um inteligente sem assentamento anda até o assentamento mais perto do
   * seu povo (até 40 tiles) e se junta a ele. Sem nenhum por perto, procura
   * outros solitários do povo e só funda junto com eles (agente 3B: ninguém
   * funda vila de uma pessoa; LONER_GROUP_MIN juntos). O grupo segue o guia
   * (o de menor uid), que prefere reocupar ruínas próximas; senão funda num
   * lugar onde dá para viver (verde ou com água, e no clima da espécie),
   * andando até um lugar assim se onde está não serve. `dt` é o tempo desde a
   * última decisão (a fundação tem taxa por ano). Devolve a direção para andar
   * enquanto não chega.
   */
  loner(this: Ecosystem, i: number, dt: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const w = this.map.width;
    let best: Village | null = null;
    let bd = 40;
    for (const v of this.villages) {
      if (v.abandoned || v.species !== s) continue;
      const d = this.distance(v, this.x[i], this.y[i]);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    const name = this.species[s].name.toLowerCase();
    if (best && bd < this.radius(best)) {
      this.join(i, best);
      this.note(`Um ${name} solitário se juntou a ${best.name}`, 'povo', best, { key: `join:${best.id}` });
      return undefined;
    }
    if (best) return { x: wrapDx(best.x - this.x[i], w), y: best.y - this.y[i] };
    // Outros solitários do povo: os que estão juntos (a até LONER_MEET) e o mais perto de todos.
    const mates: number[] = [];
    let near = -1;
    let nd = Infinity;
    let ndx = 0;
    let ndy = 0;
    const meet = B.LONER_MEET * B.LONER_MEET;
    this.forEachNear(this.x[i], this.y[i], B.LONER_SEEK, (j, dx, dy) => {
      if (j === i || this.kind[j] !== s || this.village[j] >= 0) return;
      const d = dx * dx + dy * dy;
      if (d <= meet) mates.push(j);
      if (d < nd) {
        nd = d;
        near = j;
        ndx = dx;
        ndy = dy;
      }
    });
    if (mates.length + 1 < B.LONER_GROUP_MIN) {
      // Sozinho ou em dupla: vai ao encontro do solitário mais perto; sem ninguém à vista, anda para um lugar
      // melhor (onde outros também vão parar). Não funda.
      if (near >= 0 && nd > meet / 4) return { x: ndx, y: ndy };
      return this.betterSite(i) ?? this.greener(i, 25);
    }
    // O grupo anda junto atrás do guia, o de menor uid.
    let guide = i;
    for (const j of mates) if (this.uid[j] < this.uid[guide]) guide = j;
    if (guide !== i) {
      const dx = wrapDx(this.x[guide] - this.x[i], w);
      const dy = this.y[guide] - this.y[i];
      return dx * dx + dy * dy > 2.25 ? { x: dx, y: dy } : undefined;
    }
    const found = (tx: number, ty: number) => {
      const v = this.foundVillage(s, tx, ty, 0);
      this.join(i, v);
      for (const j of mates) if (this.alive[j] && this.village[j] < 0) this.join(j, v);
      const ruin = v.ruinOf !== undefined ? this.villages[v.ruinOf] : null;
      const who = `${v.population} ${name}s que andavam sozinhos`;
      this.note(ruin ? `${who} fundaram ${v.name} sobre as ruínas de ${ruin.name}` : `${who} se juntaram e fundaram ${v.name}`, 'povo', v, { major: true });
    };
    // Ruínas por perto: vai até a antiga praça e recomeça ali.
    const ruin = this.ruinNear(this.x[i], this.y[i], 30, s);
    if (ruin) {
      const dx = wrapDx(ruin.x - this.x[i], w);
      const dy = ruin.y - this.y[i];
      if (dx * dx + dy * dy > 4) return { x: dx, y: dy };
      found(Math.floor(ruin.x), Math.floor(ruin.y));
      return undefined;
    }
    const tx = ((Math.floor(this.x[i]) % w) + w) % w;
    const ty = Math.floor(this.y[i]);
    const tile = this.tileAt(tx, ty);
    if (tile >= 0 && this.goodSite(s, tile)) {
      if (happens(this.civRnd, B.LONER_FOUND_RATE, dt / YEAR_SECONDS) && this.canFound(tx, ty)) found(tx, ty);
      return undefined;
    }
    // Sem lugar bom à vista (no meio do deserto, por exemplo): anda para onde é mais verde.
    return this.betterSite(i) ?? this.greener(i, 25);
  },

  /**
   * Lugar onde um inteligente sozinho consegue viver: verde ou na beira da
   * água, no clima da espécie e, para fundar, um lugar que passa no exame da
   * área (água, comida, chão plano e longe de lava, seção 19.18).
   */
  goodSite(this: Ecosystem, s: number, tile: number): boolean {
    const sp = this.species[s];
    const temp = temperatureAt(this.map, tile);
    if (!this.habitable(s, tile) || temp < sp.tempMin + 2 || temp > sp.tempMax - 2) return false;
    if (!(this.map.vegetation[tile] >= 0.3 || (this.map.vegetation[tile] > 0.1 && this.nearWater(tile)))) return false;
    const w = this.map.width;
    return this.siteProblem(s, tile % w, Math.floor(tile / w)) === null;
  },

  /**
   * Direção do melhor lugar para fundar a até 25 tiles. A amostra só muda
   * quando a criatura troca de região, para ela não ficar indo e voltando.
   */
  betterSite(this: Ecosystem, i: number): { x: number; y: number } | undefined {
    const s = this.kind[i];
    const r = mulberry32((plotSeed(Math.floor(this.x[i] / 6), Math.floor(this.y[i] / 6)) ^ (i * 2654435761)) >>> 0);
    let best: { x: number; y: number } | undefined;
    let bv = -1;
    for (let k = 0; k < 20; k++) {
      const a = r() * Math.PI * 2;
      const d = 3 + r() * 22;
      const x = this.x[i] + Math.cos(a) * d;
      const y = this.y[i] + Math.sin(a) * d;
      const t = this.tileAt(x, Math.floor(y));
      if (t < 0 || !this.goodSite(s, t)) continue;
      const value = this.map.vegetation[t] + (this.nearWater(t) ? 0.3 : 0);
      if (value > bv) {
        bv = value;
        best = { x: x - this.x[i], y: y - this.y[i] };
      }
    }
    return best;
  },

  /** Ruínas (assentamento abandonado ainda não limpo) mais perto, a até `range` tiles e onde dá para recomeçar. */
  ruinNear(this: Ecosystem, x: number, y: number, range: number, s: number): Village | null {
    let best: Village | null = null;
    let bd = range;
    for (const v of this.villages) {
      if (!v.abandoned || (v.decay ?? 0) >= 3) continue;
      const d = this.distance(v, x, y);
      if (d >= bd) continue;
      const tile = this.tileAt(v.x, Math.floor(v.y));
      // Ruínas num lugar que deixou de servir (inundado, lava, penhasco) não são reocupadas.
      if (tile < 0 || !this.habitable(s, tile) || !this.canSettle(s, Math.floor(v.x), Math.floor(v.y), v.tech)) continue;
      bd = d;
      best = v;
    }
    return best;
  },

  /**
   * Um adulto do povo de `v` chega andando de fora da área; ao entrar, se junta (ver `loner`). Se o lugar
   * acabar antes, ele é mais um solitário: procura outros e só funda em grupo.
   */
  wanderer(this: Ecosystem, v: Village): void {
    const sp = this.species[v.species];
    for (let t = 0; t < 12; t++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = this.radius(v) + 3 + this.civRnd() * 6;
      const x = v.x + Math.cos(a) * d;
      const y = v.y + Math.sin(a) * d;
      const tile = this.tileAt(x, Math.floor(y));
      if (tile < 0 || !this.habitable(v.species, tile) || !this.landPath(x, y, v.x, v.y)) continue;
      this.spawn(v.species, ((x % this.map.width) + this.map.width) % this.map.width, y, -1, sp.maturity + this.civRnd() * 10);
      return;
    }
  },

  /** Põe a criatura `i` (sem assentamento) no assentamento `v`, com uma profissão. */
  join(this: Ecosystem, i: number, v: Village): void {
    this.setVillage(i, v.id);
    this.movedAt[i] = this.year;
    (v.vitalNow ??= emptyVital()).arrived++;
    v.lastCause = undefined;
    v.population++;
    this.role[i] = this.age[i] < this.species[this.kind[i]].maturity ? CHILD : pickRole(Math.floor(v.tech), this.scale(v), this.civRnd(), this.roleContext(v));
  },

  /**
   * Solta uma única criatura (ferramenta do jogador). Inteligentes chegam
   * sozinhos e decidem depois onde viver (ver `loner`). Devolve o índice ou -1.
   */
  introduceOne(this: Ecosystem, s: number, x: number, y: number): number {
    const tile = this.tileAt(x, Math.floor(y));
    if (tile < 0 || !this.habitable(s, tile)) return -1;
    return this.spawn(s, x, y, -1, this.species[s].maturity + this.rnd() * 5);
  },

  nearWater(this: Ecosystem, tile: number): boolean {
    const w = this.map.width;
    const x = tile % w;
    const y = (tile - x) / w;
    for (const [ox, oy] of NEIGHBORS4) {
      const ty = y + oy;
      if (ty < 0 || ty >= this.map.height) continue;
      if (isWater(this.map, ty * w + ((x + ox + w) % w))) return true;
    }
    return false;
  },

  // Assentamentos ----------------------------------------------------------

  /** Tile de (x, linha), com volta horizontal; -1 fora do mapa. */
  tileAt(this: Ecosystem, x: number, y: number): number {
    const w = this.map.width;
    if (y < 0 || y >= this.map.height) return -1;
    return y * w + (((Math.floor(x) % w) + w) % w);
  },

  distance(this: Ecosystem, v: Village, x: number, y: number): number {
    return Math.hypot(wrapDx(v.x - x, this.map.width), v.y - y);
  },
};
export type FoundingPart = typeof foundingPart;
