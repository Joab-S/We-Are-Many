/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): conserto depois de carregar o save e identidade de quem embarca.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { Weather } from '../../weather';
import { randomTraits, TRAIT_COUNT } from '../../../ai/traits';
import { ECO_CELL } from '../../fauna';
import type { Identity } from '../types';
import { EcoCells } from '../cells';

export const savePart = {
  /** Depois de carregar um save de antes das ações presenciais: os vetores novos nascem zerados, do tamanho dos demais. */
  fixAfterLoad(this: Ecosystem): void {
    const n = this.x.length;
    // Índice uid -> índice: refeito dos vetores (em saves antigos, `uidIndex` era um cache anual, com o ano em `uidYear`).
    this.uidIndex.clear();
    for (let k = 0; k < this.count; k++) if (this.alive[k]) this.uidIndex.set(this.uid[k], k);
    delete (this as { uidYear?: number }).uidYear;
    // Saves de antes do handle do líder: o uid do líder guardado sai do índice (se ele ainda vive ali).
    for (const v of this.villages) {
      if (v.leaderUid === undefined && v.leader >= 0 && this.alive[v.leader] && this.village[v.leader] === v.id) v.leaderUid = this.uid[v.leader];
    }
    if (this.jobKind.length < n) this.jobKind = new Uint8Array(n);
    if (this.job.length < n) this.job = new Int32Array(n);
    if (this.jobWork.length < n) this.jobWork = new Float32Array(n);
    if (this.jobWait.length < n) this.jobWait = new Float32Array(n);
    if (this.home.length < n) this.home = new Int32Array(n).fill(-1);
    if (this.origin.length < n) {
      const old = this.origin;
      this.origin = new Int32Array(n).fill(-1);
      this.origin.set(old);
    }
    // Saves de antes das jornadas: todo mundo sem jornada, sem carga e descansado.
    for (const k of ['day', 'dayLeg', 'carry', 'gesture'] as const) if (this[k].length < n) this[k] = new Uint8Array(n);
    if (this.dayAt.length < n) this.dayAt = new Int32Array(n);
    for (const k of ['dayTime', 'carryAmt', 'needRest', 'needSocial', 'needFaith'] as const) if (this[k].length < n) this[k] = new Float32Array(n);
    // Saves de antes do plano novo dos assentamentos: sem muralha e com os contadores novos zerados.
    if (!this.wall || this.wall.length !== this.map.width * this.map.height) this.wall = new Uint8Array(this.map.width * this.map.height);
    // Ruas por uso (fase 4): desgaste e anos sem uso; a lista de tiles acompanhados é refeita dos vetores.
    if (!this.wear || this.wear.length !== this.map.width * this.map.height) this.wear = new Float32Array(this.map.width * this.map.height);
    if (!this.roadIdle || this.roadIdle.length !== this.map.width * this.map.height) this.roadIdle = new Uint8Array(this.map.width * this.map.height);
    this.wearTiles = new Set();
    for (let t = 0; t < this.wear.length; t++) if (this.wear[t] > 0) this.wearTiles.add(t);
    const tally = this.tally as Record<string, number>;
    for (const k of ['soloFounds', 'colonies', 'farmsteads', 'merged', 'shortLived', 'lastWaves', 'tierDowns', 'interMarriages', 'annexations', 'revolts', 'capitalMoves', 'newPeoples', 'aid', 'aidRefused', 'rivalries', 'visits', 'festivals']) tally[k] ||= 0;
    // Saves de antes da fauna nova: sem ação, destino nem parasitas; pasto e medo zerados.
    if (this.act.length < n) this.act = new Uint8Array(n);
    if (this.goal.length < n) this.goal = new Int32Array(n).fill(-1);
    if (this.chase.length < n) this.chase = new Int32Array(n).fill(-1);
    // Saves de antes do handle da presa: o uid sai do índice guardado (vale se a presa ainda vive).
    if (this.chaseUid.length < n) {
      this.chaseUid = new Uint32Array(n);
      for (let k = 0; k < this.count; k++) {
        const j = this.chase[k];
        if (j >= 0 && this.alive[j]) this.chaseUid[k] = this.uid[j];
      }
    }
    // Saves de antes da presa que escapou em vetor próprio: ninguém lembra de presa nenhuma.
    if (this.escaped.length < n) this.escaped = new Uint32Array(n);
    if (this.effort.length < n) this.effort = new Uint8Array(n);
    if (this.parasite.length < n) this.parasite = new Float32Array(n);
    const tiles = this.map.width * this.map.height;
    if (!this.graze || this.graze.length !== tiles) this.graze = new Float32Array(tiles);
    if (!this.grazeAt || this.grazeAt.length !== tiles) this.grazeAt = new Float32Array(tiles);
    const cells = Math.ceil(this.map.width / ECO_CELL) * Math.ceil(this.map.height / ECO_CELL);
    if (!this.fear || this.fear.length !== cells) this.fear = new Float32Array(cells);
    if (!(this.threatened instanceof Set)) (this as { threatened: Set<number> }).threatened = new Set();
    // O save guarda os campos das células, não a classe; células de um save antigo são refeitas.
    // O save guarda os campos das células, não a classe: devolve os métodos (ou refaz se o save é antigo).
    if (this.cells && (!this.cells.hunters || !this.cells.bseason)) this.cells = null;
    if (this.cells && !(this.cells instanceof EcoCells)) Object.setPrototypeOf(this.cells, EcoCells.prototype);
    if (this.weather && !this.weather.base) this.weather = null;
    if (this.weather && !(this.weather instanceof Weather)) Object.setPrototypeOf(this.weather, Weather.prototype);
    this.tally.wildfires ??= 0;
    if (this.cells) Object.setPrototypeOf(this.cells, EcoCells.prototype);
    this.tally.wildStarved = this.tally.wildStarved || 0;
    this.tally.wildStarvedNearFood = this.tally.wildStarvedNearFood || 0;
    this.tally.marriages = this.tally.marriages || 0;
    this.tally.fights = this.tally.fights || 0;
    // Saves de antes da IA local: traços sorteados para quem já vivia.
    if (this.traits.length < n * TRAIT_COUNT) {
      const old = this.traits;
      this.traits = new Int8Array(n * TRAIT_COUNT);
      this.traits.set(old);
      for (let i = old.length / TRAIT_COUNT; i < this.count; i++) {
        if (this.alive[i] && this.species[this.kind[i]].kind === 'sapient') randomTraits(this.traits, i, this.mindRnd, this.villages[this.village[i]]?.culture.value);
      }
    }
  },

  /** Quem a pessoa é, para levar num barco. */
  identity(this: Ecosystem, i: number): Identity {
    const traits = this.traits.slice(i * TRAIT_COUNT, (i + 1) * TRAIT_COUNT);
    return { uid: this.uid[i], parent: this.parent[i], family: this.family[i], bornAt: this.bornAt[i], bornYear: this.bornYear[i], movedAt: this.movedAt[i], traits };
  },

  /**
   * Devolve a identidade a quem desembarcou. `back` é quem voltou ao mesmo
   * assentamento sem partir de fato: a saída e a chegada se anulam.
   */
  restore(this: Ecosystem, c: number, who: Identity | undefined, back = false): void {
    if (!who) return;
    // O lugar troca de dono: o índice uid -> índice segue o uid de volta.
    this.uidIndex.delete(this.uid[c]);
    this.uid[c] = who.uid;
    this.uidIndex.set(who.uid, c);
    this.parent[c] = who.parent;
    this.family[c] = who.family;
    this.bornAt[c] = who.bornAt;
    this.bornYear[c] = who.bornYear;
    this.movedAt[c] = who.movedAt;
    if (who.traits) this.traits.set(who.traits, c * TRAIT_COUNT);
    const v = this.villages[this.village[c]];
    if (back && v?.vitalNow) {
      v.vitalNow.arrived = Math.max(0, v.vitalNow.arrived - 1);
      v.vitalNow.left = Math.max(0, v.vitalNow.left - 1);
    }
  },
};
export type SavePart = typeof savePart;
