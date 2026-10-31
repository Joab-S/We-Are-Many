/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): rebanhos domesticados, cercados e pragas (RF-VIDA-215).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { binomial, happens } from '../../stochastic';
import { Biome, classify } from '../../../procgen/surface';
import { CHILD, ROLE, ROLES } from '../../roles';
import { herdFor } from '../../needs';
import { maxPensOf } from '../../settlement';
import { ecologyOf, hunts } from '../../fauna';
import { herdFormsOf } from '../../species';
import type { HerdKind, Village } from '../types';
import * as constantsModule from '../constants';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { HERD_NAMES } = constantsModule;
const { isLand } = tilesModule;

export const herdsPart = {
  /**
   * Rebanho (RF-VIDA-215 e 285): domesticação a partir do fim da Idade da
   * Pedra, crescimento até o teto do pasto, cercados novos, predadores, praga
   * que pula para os rebanhos vizinhos (RF-VIDA-305) e sobrepastoreio (RF-VIDA-294).
   */
  updateHerd(this: Ecosystem, v: Village): void {
    if (!v.herd || v.herd.head <= 0) {
      // Curral vazio não fica de pé para sempre: as cercas vão sendo desmontadas.
      if (v.pens?.length && happens(this.civRnd, B.PEN_RATE, 1)) this.removePen(v);
      if (this.knew(v, 'domesticacao') && happens(this.civRnd, B.DOMESTICATE_RATE, 1)) this.domesticate(v);
      return;
    }
    const h = v.herd;
    const pens = v.pens?.length ?? 0;
    const cap = Math.max(2, (pens * B.PEN_AREA) / B.PASTURE_PER_HEAD);
    const w = this.workersOf(v);
    const tend = Math.min(1, 0.5 + (w[ROLE.shepherd] * 6) / h.head);
    const horses = h.kind === 'horse' || h.kind === 'camel';
    const keeper = horses && this.has(v, 'stable') ? 1 + 0.5 * Math.min(1, w[ROLE.horsekeeper]) : 1;
    const sick = (h.plague ?? 0) > this.year ? 0.3 : 1;
    // O rebanho come o pasto em volta dos currais, a mesma erva dos selvagens; faltando, cresce menos.
    const fed = h.away || !pens ? 1 : this.herdGraze(v, h.head * B.HERD_GRAZE);
    h.head += binomial(this.civRnd, h.head, Math.max(0, B.HERD_GROWTH * (1 - h.head / cap) * tend * keeper * sick * fed));
    h.head = Math.min(h.head, Math.ceil(cap));
    // Predadores rondam o pasto.
    let predators = 0;
    this.forEachNear(v.x, v.y, this.radius(v) + 8, (j) => {
      if (this.species[this.kind[j]].kind === 'predator' && hunts(ecologyOf(this.species[this.kind[j]]))) predators++;
    });
    if (predators) {
      const lost = Math.min(h.head, binomial(this.civRnd, predators, 1 - Math.exp(-B.HERD_PREDATION)));
      h.head -= lost;
      if (lost >= 3) this.note(`Predadores atacaram o rebanho de ${v.name}`, 'natureza', v, { key: `pred-${v.id}` });
    }
    if ((h.plague ?? 0) <= this.year && happens(this.civRnd, B.HERD_PLAGUE_RATE * (1 + h.head / 40), 1)) this.herdPlague(v, null);
    if (horses) v.stock.horses = h.head;
    // Pasto cheio: mais um cercado, até o limite do nível.
    const maxPens = maxPensOf(this.scale(v), v.vocation);
    if (h.head > cap * 0.8 && pens < maxPens && happens(this.civRnd, B.PEN_RATE, 1)) this.addPen(v);
    // Cercados demais para o rebanho que sobrou (ou acima do limite): o mais longe é desmontado.
    const needed = Math.max(1, Math.ceil((h.head * B.PASTURE_PER_HEAD) / (B.PEN_AREA * 0.8)));
    if ((pens > needed + 1 || pens > maxPens) && happens(this.civRnd, B.PEN_RATE, 1)) this.removePen(v);
    // Sobrepastoreio: o verde em volta dos cercados cheios diminui.
    if (h.head > cap * 0.7 && !h.away) {
      for (const p of v.pens ?? []) {
        const t = this.tileAt(p.x + Math.floor(this.civRnd() * 4) - 1, p.y + Math.floor(this.civRnd() * 4) - 1);
        if (t >= 0 && this.map.vegetation[t] > 0.1 && !this.road[t] && !this.built[t]) {
          this.map.vegetation[t] = Math.max(0, this.map.vegetation[t] - 0.04);
          // O motor reclassifica o bioma antes de avisar (a tela só repinta o que o motor já decidiu).
          this.map.biome[t] = classify(this.map, t);
          this.onTileChanged(t);
        }
      }
    }
    if (h.head <= 0) {
      v.herd = undefined;
      if (horses) v.stock.horses = 0;
    }
  },

  /** Rebanho pastando em volta dos currais: come até `need` de pasto e devolve a fração que achou (0 a 1). */
  herdGraze(this: Ecosystem, v: Village, need: number): number {
    const pens = v.pens ?? [];
    if (!pens.length || need <= 0) return 1;
    let got = 0;
    for (const p of pens) {
      const t = this.tileAt(p.x, p.y);
      if (t >= 0) got += this.grazePatch(t, need / pens.length);
    }
    return Math.min(1, got / need);
  },

  /** Profissões dos moradores de um assentamento agora. */
  workersOf(this: Ecosystem, v: Village): number[] {
    const w = new Array<number>(ROLES.length).fill(0);
    for (const i of this.residents(v.id)) if (this.role[i] !== CHILD) w[this.role[i]]++;
    return w;
  },

  /**
   * Bichos domesticáveis da região do lugar (Diamond: só quem passa pelos critérios, `herdFormsOf`), com a forma de
   * curral que cada um dá e o primeiro indivíduo visto de cada forma. Com `abundant`, só as espécies que não estão
   * raras no planeta (capturar a última manada acabaria com ela).
   */
  wildHerdsNear(this: Ecosystem, v: Village, abundant: boolean): Map<HerdKind, number> {
    const found = new Map<HerdKind, number>();
    this.forEachNear(v.x, v.y, this.radius(v) + B.DOMESTIC_REACH, (j) => {
      const k = this.kind[j];
      if (abundant && this.population[k] <= this.caps[k] * 0.2) return;
      for (const f of herdFormsOf(this.species[k])) if (!found.has(f)) found.set(f, j);
    });
    return found;
  },

  /** Domestica bichos da região: um domesticável por perto é capturado e começa o rebanho do tipo que ele dá. */
  domesticate(this: Ecosystem, v: Village): void {
    const wild = this.wildHerdsNear(v, true);
    if (!wild.size) return;
    const s = this.siteSample(v);
    const b = this.map.biome[this.tileAt(v.x, Math.floor(v.y))] as Biome;
    const kind = herdFor(v.vocation, s, b === Biome.Desert || b === Biome.Savanna, [...wild.keys()]);
    if (!kind) return;
    if (!v.pens?.length && !this.addPen(v)) return;
    this.kill(wild.get(kind)!, true);
    v.herd = { kind, head: 3 };
    this.note(`${v.name} domesticou ${HERD_NAMES[kind]}`, 'economia', v);
  },

  /** Cercado de pasto na borda da área ou logo fora dela (tiles de pasto, 2x2). */
  addPen(this: Ecosystem, v: Village): boolean {
    const tiles = this.fieldLot(v, 5) ?? this.outerLot(v);
    if (!tiles) return false;
    for (const t of tiles) {
      this.road[t] = 5;
      this.onTileChanged(t);
    }
    const w = this.map.width;
    (v.pens ??= []).push({ x: tiles[0] % w, y: Math.floor(tiles[0] / w) });
    return true;
  },

  /**
   * Lote 2x2 de terra livre logo fora da área, colado na borda (pasto e roças
   * que não cabem dentro). Não vai para o lado de um vizinho: o lote fica
   * longe da área dos outros e mais perto deste centro que de qualquer outro.
   */
  outerLot(this: Ecosystem, v: Village): number[] | null {
    const r = Math.ceil(this.radius(v));
    const near = this.villages.filter((o) => o !== v && !o.abandoned && this.distance(o, v.x, v.y) < r + this.radius(o) + 8);
    for (let k = 0; k < 40; k++) {
      const a = this.civRnd() * Math.PI * 2;
      const d = r + 1 + this.civRnd() * 2;
      const x = Math.floor(v.x + Math.cos(a) * d);
      const y = Math.floor(v.y + Math.sin(a) * d);
      const cx = x + 1;
      const cy = y + 1;
      if (near.some((o) => this.distance(o, cx, cy) < this.radius(o) + 3 || this.distance(o, cx, cy) < d)) continue;
      const tiles = [this.tileAt(x, y), this.tileAt(x + 1, y), this.tileAt(x, y + 1), this.tileAt(x + 1, y + 1)];
      if (tiles.every((t) => t >= 0 && isLand(this.map, t) && !this.road[t] && !this.built[t] && this.depositAt[t] < 0 && this.flat(t))) return tiles;
    }
    return null;
  },

  /** Desmonta o cercado mais longe do centro: o chão volta a ser campo. */
  removePen(this: Ecosystem, v: Village): void {
    const pens = v.pens;
    if (!pens?.length) return;
    let k = 0;
    for (let j = 1; j < pens.length; j++) if (this.distance(v, pens[j].x + 1, pens[j].y + 1) > this.distance(v, pens[k].x + 1, pens[k].y + 1)) k = j;
    const p = pens.splice(k, 1)[0];
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = this.tileAt(p.x + dx, p.y + dy);
        if (t < 0 || this.road[t] !== 5) continue;
        this.road[t] = 0;
        this.onTileChanged(t);
      }
    }
  },

  /** Praga no rebanho: mata parte dos animais e pode pular para os rebanhos vizinhos. */
  herdPlague(this: Ecosystem, v: Village, from: Village | null): void {
    const h = v.herd;
    if (!h || h.head <= 0) return;
    const dead = binomial(this.civRnd, h.head, 0.35 + this.civRnd() * 0.25);
    h.head -= dead;
    h.plague = this.year + 3;
    this.note(
      from ? `A praga do rebanho chegou de ${from.name} a ${v.name}: morreram ${dead} ${HERD_NAMES[h.kind]}` : `Uma praga atingiu o rebanho de ${v.name}: morreram ${dead} ${HERD_NAMES[h.kind]}`,
      'natureza',
      v,
    );
    if (from) return;
    for (const o of this.villages) {
      if (o === v || o.abandoned || !o.herd || o.herd.head <= 0 || (o.herd.plague ?? 0) > this.year) continue;
      const d = this.distance(o, v.x, v.y);
      if (d < B.HERD_PLAGUE_RANGE && this.civRnd() < B.HERD_PLAGUE_SPREAD * (1 - d / B.HERD_PLAGUE_RANGE)) this.herdPlague(o, v);
    }
  },
};
export type HerdsPart = typeof herdsPart;
