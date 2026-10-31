/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): fusão de lugares, degrau político, modo completo e nível dos assentamentos.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import type { Stock } from '../../economy';
import { missingFunctions, polityOf, POLITY_NAMES, type TierCheck } from '../../community';
import { TIER_NAMES } from '../../settlement';
import type { BuildingKind, Village } from '../types';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { isWater } = tilesModule;

export const polityPart = {
  /**
   * Fusão (RF-AS-06): quando o núcleo de uma cidade encosta numa aldeia ou vila do mesmo reino (ou livre),
   * ela vira um bairro da cidade, com nome de bairro. De outro povo, vira um bairro estrangeiro.
   */
  mergeVillages(this: Ecosystem): void {
    for (const v of this.villages) {
      if (v.abandoned || v.tier < 2) continue;
      for (const o of this.villages) {
        if (o === v || o.abandoned || o.species !== v.species || o.tier >= 2) continue;
        if (this.distance(o, v.x, v.y) > this.footprint(v) + this.footprint(o) + 2) continue;
        const free = o.kingdom === o.id && this.kingdomSize(o) <= 1;
        if (o.kingdom !== v.kingdom && !free) {
          // De outro reino: a fronteira esquenta, como antes.
          const key = this.key(o.kingdom, v.kingdom);
          this.relations.set(key, (this.relations.get(key) ?? 0) - 10);
          continue;
        }
        if (this.warOf(o.kingdom) || this.villages.some((p) => p !== o && !p.abandoned && p.kingdom === o.id)) continue;
        this.mergeInto(o, v);
      }
    }
  },

  /** Junta `o` em `v`: gente, casas, roças, cercados, minas, estoque e porto; `o` some como lugar à parte. */
  mergeInto(this: Ecosystem, o: Village, v: Village): void {
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.village[i] !== o.id) continue;
      this.village[i] = v.id;
      v.population++;
    }
    o.population = 0;
    for (const h of o.houses) {
      h.quarter = o.name;
      v.houses.push(h);
    }
    o.houses.length = 0;
    v.fields += o.fields;
    o.fields = 0;
    if (o.pens?.length) v.pens = [...(v.pens ?? []), ...o.pens];
    o.pens = undefined;
    for (const id of o.mines) {
      this.deposits[id].mine = v.id;
      v.mines.push(id);
    }
    o.mines.length = 0;
    for (const g of Object.keys(o.stock) as (keyof Stock)[]) {
      const a = v.stock[g];
      const b = o.stock[g];
      if (typeof a === 'number' && typeof b === 'number') (v.stock as unknown as Record<string, number>)[g] = a + b;
    }
    v.food += o.food;
    if (v.port < 0 && o.port >= 0) v.port = o.port;
    o.port = -1;
    for (const b of this.boats) if (b.village === o.id) b.village = v.id;
    for (const c of this.caravans) {
      if (c.home === o.id) c.home = v.id;
      if (c.target === o.id) c.target = v.id;
    }
    for (let k = this.agreements.length - 1; k >= 0; k--) if (this.agreements[k].a === o.id || this.agreements[k].b === o.id) this.agreements.splice(k, 1);
    (v.quarters ??= []).push({ name: o.name, culture: o.culture.id, foreign: o.culture !== v.culture });
    o.abandoned = true;
    o.abandonedAt = this.year;
    o.decay = 3;
    o.mergedInto = v.id;
    v.foot = undefined;
    o.foot = undefined;
    this.tally.merged++;
    const foreign = o.culture !== v.culture ? `, um bairro do povo ${o.culture.name}` : '';
    this.note(`${o.name} foi engolida pelo crescimento de ${v.name} e virou o bairro ${o.name}${foreign}`, 'povo', v, { major: true });
  },

  /** Degrau político de cada centro (RF-AS-48), uma vez por ano. */
  updatePolities(this: Ecosystem): void {
    const members = new Map<number, Village[]>();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const list = members.get(v.kingdom);
      if (list) list.push(v);
      else members.set(v.kingdom, [v]);
    }
    for (const v of this.villages) {
      if (v.abandoned) continue;
      if (v.kingdom !== v.id) {
        v.polity = undefined;
        continue;
      }
      const list = members.get(v.id) ?? [v];
      const cities = list.filter((o) => o !== v && o.tier >= 2).length;
      const before = v.polity;
      v.polity = polityOf(v.tier, list.length, cities >= 2 && list.length >= 10 ? 1 : 0);
      if (before && before !== v.polity && (v.polity === 'reino' || v.polity === 'império')) {
        this.note(`${v.name} é agora a capital ${v.polity === 'império' ? 'de um império' : 'de um reino'} com ${list.length} lugares`, 'povo', v, { major: true });
      }
    }
  },

  /** Reino ou império de verdade (RF-AS-48): só esses contam como reino e ganham o nome no rótulo. */
  /**
   * Porte econômico (0 a 3) só pela população, com os limiares antigos: quanto o lugar produz, guarda,
   * comercia e que ofícios tem. O degrau com nome (`tier`) pede também as funções (RF-AS seção 4).
   */
  scale(this: Ecosystem, v: Village): number {
    let t = 0;
    while (t + 1 < B.SCALE_POPULATION.length && v.population >= B.SCALE_POPULATION[t + 1]) t++;
    return Math.max(t, v.tier);
  },

  /** Lugar de mercado: cidade em diante ou já escolhido como referência por outros (RF-AS-44). */
  isMarket(this: Ecosystem, v: Village): boolean {
    return v.tier >= 2 || (v.market ?? 0) > 0;
  },

  watch(this: Ecosystem, ids: Iterable<number>): void {
    const next = new Set(ids);
    // Quem sai da tela entrega o pátio de carroça e larga as jornadas (o modo agregado não tem pátio).
    for (const id of this.watched) {
      if (next.has(id) || !this.villages[id]) continue;
      this.flushYard(this.villages[id]);
      this.boards.delete(id);
    }
    this.watched = next;
  },

  /** O lugar roda jornadas e passos completos (os demais, o modo agregado). */
  full(this: Ecosystem, v: Village): boolean {
    return this.watched.has(v.id);
  },

  isRealm(this: Ecosystem, v: Village): boolean {
    const k = this.villages[v.kingdom];
    const p = k.polity ?? polityOf(k.tier, this.kingdomSize(k), 0);
    return p === 'reino' || p === 'império';
  },

  /** Nome da unidade política de `v`: "Reino de X", "Império de X", "Chefia de X" ou "Aldeia livre". */
  polityName(this: Ecosystem, v: Village): string {
    const k = this.villages[v.kingdom];
    const p = k.polity ?? polityOf(k.tier, this.kingdomSize(k), 0);
    return p === 'livre' ? POLITY_NAMES.livre : `${POLITY_NAMES[p]} de ${k.name}`;
  },

  // ---- Plano novo dos assentamentos: forma e degraus (seção 20, fase 2) ----

  /** Pegada: raio das casas do núcleo (sem sítios nem porto) mais a folga (RF-AS-10). */
  footprint(this: Ecosystem, v: Village): number {
    if (v.foot !== undefined) return v.foot;
    let r = 0;
    for (const h of v.houses) {
      if (h.farm || h.kind === 'port') continue;
      const d = this.distance(v, h.x + 1, h.y + 1);
      if (d > r) r = d;
    }
    v.foot = Math.max(B.FOOTPRINT_MIN, r + B.FOOTPRINT_PAD);
    return v.foot;
  },

  /** Nome do degrau, com o acampamento de tendas antes da aldeia de casas fixas. */
  tierName(this: Ecosystem, v: Village): string {
    return this.camp(v) ? 'Acampamento' : TIER_NAMES[v.tier];
  },

  /** Ainda é um acampamento: pouca gente na Idade da Pedra e sem roça (RF-AS seção 4). */
  camp(this: Ecosystem, v: Village): boolean {
    return v.tier === 0 && v.population < B.CAMP_POP && v.fields === 0 && Math.floor(v.tech) === 0;
  },

  /** O que o assentamento tem para o degrau (RF-AS seção 4). */
  tierCheck(this: Ecosystem, v: Village): TierCheck {
    const built = new Set<BuildingKind>();
    for (const h of v.houses) if (!h.site) built.add(h.kind);
    const center = this.tileAt(v.x, Math.floor(v.y));
    let water = Math.floor(v.tech) >= 1 || this.knew(v, 'ceramica');
    if (!water) {
      for (let dy = -3; dy <= 3 && !water; dy++) for (let dx = -3; dx <= 3 && !water; dx++) {
        const t = this.tileAt(v.x + dx, Math.floor(v.y) + dy);
        if (t >= 0 && isWater(this.map, t)) water = true;
      }
    }
    void center;
    const capital = v.kingdom === v.id && (v.polity === 'reino' || v.polity === 'império');
    return { population: v.population, built, capital, market: v.market ?? 0, water };
  },

  /** Funções que faltam para o próximo degrau (para o painel). */
  nextTierMissing(this: Ecosystem, v: Village): string[] {
    if (v.tier >= 3) return [];
    return missingFunctions(v.tier + 1, this.tierCheck(v));
  },
};
export type PolityPart = typeof polityPart;
