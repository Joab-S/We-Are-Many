/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): estoque, tetos, livro-caixa, gasto e consumo.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { temperatureAt } from '../../../procgen/surface';
import { buildCost, emptyStock, GOODS, type Good, type Stock } from '../../economy';
import type { RoleContext } from '../../roles';
import { foodCap, goodCap, room, seasonOf, VOCATION_ROLE, type CapContext } from '../../needs';
import type { BuildingKind, Village } from '../types';
export const stockPart = {
  // Economia ---------------------------------------------------------------

  /** Estação do ano econômico agora (0 primavera … 3 inverno, RF-VIDA-290). */
  season(this: Ecosystem): number {
    return seasonOf(this.actionPhase());
  },

  /** Estoque do próprio assentamento: nada é compartilhado com o reino (RF-VIDA-212). */
  store(this: Ecosystem, v: Village): Stock {
    return v.stock;
  },

  /** Soma dos estoques dos assentamentos de um reino (só para mostrar na janela de reinos). */
  kingdomStock(this: Ecosystem, k: number): Stock {
    const total = emptyStock();
    total.wood = 0;
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom !== k) continue;
      for (const g of GOODS) total[g] += v.stock[g];
      total.horses += v.stock.horses;
      total.weaponTier = Math.max(total.weaponTier, v.stock.weaponTier);
      total.armorTier = Math.max(total.armorTier, v.stock.armorTier);
    }
    return total;
  },

  /** O assentamento tem o prédio pronto (com `planned`, conta também a obra em andamento). */
  has(this: Ecosystem, v: Village, kind: BuildingKind, planned = false): boolean {
    return v.houses.some((h) => h.kind === kind && (planned || !h.site));
  },

  roleContext(this: Ecosystem, v: Village): RoleContext {
    const herd = !!v.herd && v.herd.head > 0;
    return {
      port: v.port >= 0,
      smithy: this.has(v, 'smithy'),
      warlike: v.culture.value === 'guerra' || this.plans.has(v.kingdom),
      herd,
      stable: this.has(v, 'stable'),
      loom: this.has(v, 'loom'),
      pottery: this.has(v, 'pottery'),
      windmill: this.has(v, 'windmill'),
      market: this.has(v, 'market'),
      temple: this.has(v, 'temple'),
      fields: v.fields > 0,
      vocation: v.vocation ? VOCATION_ROLE[v.vocation] : undefined,
    };
  },

  /** O que entra no teto do estoque do assentamento (RF-VIDA-218). */
  capContext(this: Ecosystem, v: Village): CapContext {
    return { tier: this.scale(v), granary: this.has(v, 'granary'), warehouse: this.has(v, 'warehouse'), treasury: this.has(v, 'market'), mines: v.mines.length };
  },

  /** Teto de um recurso no assentamento. */
  capOf(this: Ecosystem, v: Village, good: Good | 'food'): number {
    const c = this.capContext(v);
    return good === 'food' ? foodCap(c) : goodCap(good, c);
  },

  /** Anota produção e consumo do ano corrente (painel de economia, RF-VIDA-217). */
  book(this: Ecosystem, v: Village, key: string, made: number, used: number): void {
    const l = (v.ledgerNow ??= {});
    const e = (l[key] ??= [0, 0]);
    e[0] += made;
    e[1] += used;
  },

  /**
   * Produção que entra no estoque com retorno decrescente perto do teto
   * (RF-VIDA-219b) e parada no teto (RF-VIDA-218). Retorna quanto entrou.
   */
  gain(this: Ecosystem, v: Village, good: Good | 'food', amount: number): number {
    if (amount <= 0) return 0;
    const cap = this.capOf(v, good);
    const have = (good === 'food' ? v.food : v.stock[good]) + (v.yard?.[good] ?? 0);
    const got = Math.max(0, Math.min(cap - have, amount * room(have, cap)));
    this.store1(v, good, got);
    this.book(v, good, got, 0);
    return got;
  },

  /** Tira do estoque até `amount`; retorna quanto tirou. */
  spend(this: Ecosystem, v: Village, good: Good | 'food', amount: number): number {
    const have = good === 'food' ? v.food : v.stock[good];
    const take = Math.max(0, Math.min(have, amount));
    if (good === 'food') v.food -= take;
    else v.stock[good] -= take;
    if (take > 0) this.book(v, good, 0, take);
    return take;
  },

  /** Paga a construção com o estoque do próprio assentamento (tijolo serve no lugar da pedra); false se faltar material. */
  pay(this: Ecosystem, v: Village, kind: string): boolean {
    const st = this.store(v);
    const c = buildCost(kind, Math.floor(v.tech));
    // Obra nova só com o conserto das casas garantido: sem isso as casas velhas caem por falta de madeira (seção 19.20).
    const reserve = kind === 'mine' || kind === 'port' ? 0 : this.repairs(v).wood * B.REPAIR_RESERVE;
    if (st.wood < c.wood + reserve || st.stone + st.brick < c.stone || st.gold < c.gold) return false;
    this.spend(v, 'wood', c.wood);
    const brick = Math.min(st.brick, c.stone);
    this.spend(v, 'brick', brick);
    this.spend(v, 'stone', c.stone - brick);
    this.spend(v, 'gold', c.gold);
    return true;
  },

  /**
   * Consumo obrigatório e perecimento (RF-VIDA-219 e 219a), em fração de ano:
   * lenha (o dobro no frio, mais no inverno), roupa, comida e madeira que
   * estragam, ferramentas que enferrujam, ouro em excesso que perde valor.
   */
  consume(this: Ecosystem, v: Village, fedShare: number, yr: number): void {
    const st = v.stock;
    const season = seasonOf(this.actionPhase());
    const cold = temperatureAt(this.map, this.tileAt(v.x, Math.floor(v.y))) < B.COLD_K ? 2 : 1;
    // O inverno pesa mais longe do equador (a amplitude da estação do lugar).
    const fuel = v.population * B.CONSUME_FUEL * cold * this.seasonWeightOf(v, B.SEASON_FUEL) * yr;
    const burnt = this.spend(v, 'wood', fuel);
    this.book(v, '_fuel', burnt, fuel);
    // Consertos das casas ao longo do ano (seção 19.19); tijolo serve no lugar da pedra.
    const fix = this.repairs(v);
    if (fix.wood + fix.stone > 0) {
      const brick = Math.min(st.brick, fix.stone * yr);
      const paid = this.spend(v, 'wood', fix.wood * yr) + this.spend(v, 'brick', brick) + this.spend(v, 'stone', fix.stone * yr - brick);
      this.book(v, '_upkeep', paid, (fix.wood + fix.stone) * yr);
    }
    // Inverno frio sem lenha: a falta tira energia dos moradores (seção 19.19).
    v.chill = cold > 1 && season === 3 && fuel > 0 ? 1 - burnt / fuel : 0;
    const cloth = v.population * B.CONSUME_CLOTH * yr;
    const worn = this.spend(v, 'cloth', cloth);
    this.book(v, '_cloth', worn + this.spend(v, 'hides', cloth - worn), cloth);
    // Rebanho come grão no inverno.
    if (v.herd && season === 3) this.spend(v, 'food', v.herd.head * 0.1 * yr * 4);
    const granary = this.has(v, 'granary');
    // Sal conserva carne e peixe (RF-VIDA-282 e 219a).
    const salted = !granary && st.salt >= 0.1;
    if (salted) this.spend(v, 'salt', v.population * B.SALT_USE * yr);
    // O frio e o seco conservam (`spoilOf`: bioma da área e celeiro gelado no inverno).
    this.spend(v, 'food', v.food * (granary ? B.SPOIL_GRAIN : salted ? B.SPOIL_SALTED : B.SPOIL_MEAT) * this.spoilOf(v) * yr);
    this.spend(v, 'wood', st.wood * B.SPOIL_WOOD * yr);
    this.spend(v, 'tools', st.tools * 0.02 * yr);
    const goldCap = this.capOf(v, 'gold');
    if (st.gold > goldCap * B.GOLD_INFLATION_FILL) this.spend(v, 'gold', (st.gold - goldCap * B.GOLD_INFLATION_FILL) * B.GOLD_INFLATION * yr);
    // Quem já comeu bem: parte da comida (o resto vem da coleta).
    this.book(v, '_fed', fedShare * yr, yr);
  },
};
export type StockPart = typeof stockPart;
