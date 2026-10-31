/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): o ano da economia: solo, penúria, transporte, revoltas e clima por região.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens, ouStep } from '../../stochastic';
import { GOODS, type Good } from '../../economy';
import { CHILD, ROLES } from '../../roles';
import { emptyVital, HISTORY_YEARS, type DeathCause } from '../../people';
import { foodCap, goodCap, NEED_NAMES, worstNeed } from '../../needs';
import type { Village } from '../types';
import * as constantsModule from '../constants';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS } = constantsModule;

export const economyYearPart = {
  // Economia local por ano (seções 19.4 e 19.5) ------------------------------

  /**
   * Uma vez por ano: atendimento das necessidades, estabilidade, divisão do
   * trabalho, vocação, rebanhos, solo, tetos e carroças entre assentamentos
   * do mesmo reino.
   */
  economyYear(this: Ecosystem): void {
    const people: number[][] = this.villages.map(() => []);
    // Todos os moradores (crianças também), para a vida social do ano.
    const residents: number[][] = this.villages.map(() => []);
    for (let v = 0; v < this.villages.length; v++) {
      for (const i of this.residents(v)) {
        residents[v].push(i);
        if (this.role[i] !== CHILD) people[v].push(i);
      }
    }
    this.roleCount.clear();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const count = new Array<number>(ROLES.length).fill(0);
      for (const i of people[v.id] ?? []) if (this.role[i] < ROLES.length) count[this.role[i]]++;
      this.roleCount.set(v.id, count);
      this.updateNeeds(v, people[v.id]?.length ?? 0);
      this.updateStability(v);
      this.socialize(v, residents[v.id]);
      this.shiftLabor(v, people[v.id] ?? []);
      this.updateVocation(v);
      this.updateHerd(v);
      this.updateSoil(v);
      this.upkeep(v);
      this.neglect(v);
      this.woodland(v);
      this.clearYards(v);
      this.luxuryYear(v);
      this.clampStock(v);
      this.hardship(v);
      const curYear = Math.floor(this.year);
      const lastYear = v.history?.length ? v.history[v.history.length - 1].year : -1;
      if (this.yearSpan <= YEAR_SECONDS || curYear > lastYear) {
        v.ledger = v.ledgerNow ?? {};
        v.ledgerNow = {};
        const ledgers = (v.ledgers ??= []);
        ledgers.push(v.ledger);
        if (ledgers.length > 100) ledgers.shift();
        const lTot = (v.ledgerTotal ??= {});
        for (const [k, [m, u]] of Object.entries(v.ledger)) {
          const cur = lTot[k] ?? (lTot[k] = [0, 0]);
          cur[0] += m;
          cur[1] += u;
        }
        v.vital = v.vitalNow ?? emptyVital();
        v.vitalNow = emptyVital();
        const vitals = (v.vitals ??= []);
        vitals.push(v.vital);
        if (vitals.length > 100) vitals.shift();
        const vTot = (v.vitalTotal ??= emptyVital());
        vTot.births += v.vital.births;
        vTot.arrived += v.vital.arrived;
        vTot.left += v.vital.left;
        for (const [c, n] of Object.entries(v.vital.deaths)) {
          if (n) vTot.deaths[c as DeathCause] = (vTot.deaths[c as DeathCause] ?? 0) + n;
        }
        const history = (v.history ??= []);
        history.push({ year: curYear, population: v.population, stock: Math.round(v.food + GOODS.reduce((n, g) => n + v.stock[g], 0)) });
        if (history.length > HISTORY_YEARS) history.shift();
      }
    }
    this.haul();
    this.tradeYear();
    this.revolts();
  },

  /**
   * Solo das roças (RF-VIDA-294): roça no mesmo lugar cansa a terra (menos
   * com rotação, a partir da Era Medieval) e o desmatamento causa erosão;
   * com o solo fraco, parte das roças fica em pousio até ele se recuperar.
   * Quebra de safra vira notícia (RF-VIDA-285).
   */
  updateSoil(this: Ecosystem, v: Village): void {
    const soil = v.soil ?? 1;
    const fallow = soil < B.SOIL_FALLOW;
    let next = soil + (1 - soil) * B.SOIL_RECOVER * (fallow ? 1 : 0.3);
    if (v.fields > 0 && !fallow) next -= B.SOIL_WEAR * (Math.floor(v.tech) >= 3 ? 0.5 : 1) * Math.min(2, v.fields / 4);
    if (v.forest < 0.1) next -= 0.004;
    v.soil = Math.max(0.2, Math.min(1, next));
    if (!fallow && v.soil < B.SOIL_FALLOW) this.note(`A terra de ${v.name} cansou: parte das roças ficou em pousio`, 'economia', v, { key: `pousio-${v.id}` });
    if (v.fields > 0 && this.harvest(v) < B.CROP_FAILURE) this.note(`Quebra de safra em ${v.name}`, 'natureza', v, { key: `safra-${v.id}` });
  },

  /**
   * Fome, frio e falta (seção 19.19): mortes de fome e de frio vão para a crônica, e os anos
   * seguidos de falta de comida, lenha ou casa contam para a migração, o êxodo e a cobiça.
   */
  hardship(this: Ecosystem, v: Village): void {
    const dead = v.vitalNow?.deaths ?? {};
    const hunger = dead.fome ?? 0;
    const cold = dead.frio ?? 0;
    if (hunger >= B.FAMINE_DEATHS) this.note(`Fome em ${v.name}: ${hunger} morreram este ano`, 'natureza', v, { key: `famine-${v.id}`, major: hunger >= 6 });
    if (cold >= B.FAMINE_DEATHS) this.note(`Frio em ${v.name}: sem lenha, ${cold} morreram no inverno`, 'natureza', v, { key: `freeze-${v.id}` });
    v.want = this.scarcity(v) > 0 ? (v.want ?? 0) + 1 : 0;
  },

  /** Quanto falta de comida e de lenha no assentamento, de 0 (nada) a 1 (tudo). */
  scarcity(this: Ecosystem, v: Village): number {
    const n = v.needs;
    if (!n) return 0;
    // Comida: conta quem passou fome de verdade (celeiro vazio com todo mundo comendo não é falta).
    const food = Math.max(0, B.HUNGER_LEVEL - (v.fedShare ?? n.food)) / B.HUNGER_LEVEL;
    const fuel = Math.max(0, B.SCARCITY_LEVEL - n.fuel) / B.SCARCITY_LEVEL;
    return Math.max(food, fuel);
  },

  /** O que passou do teto se perde (sobra que não cabe no armazém). */
  clampStock(this: Ecosystem, v: Village): void {
    const c = this.capContext(v);
    const cap = foodCap(c);
    // Não vira ouro nem vai para outro lugar: o que não cabe estraga ou se perde (pedido do Joab, seção 19.19).
    if (v.food > cap) this.spend(v, 'food', v.food - cap);
    for (const g of GOODS) {
      const max = goodCap(g, c);
      if (v.stock[g] > max) this.spend(v, g, v.stock[g] - max);
    }
  },

  /**
   * Carroças (RF-VIDA-212): o que sobra num assentamento vai, carregado, para
   * um vizinho do mesmo reino onde falta, a pé e a até HAUL_RANGE tiles.
   * Entre reinos, as trocas continuam no comércio (`trade`).
   */
  haul(this: Ecosystem): void {
    const kingdoms = new Map<number, Village[]>();
    for (const v of this.villages) {
      if (v.abandoned) continue;
      const list = kingdoms.get(v.kingdom) ?? [];
      list.push(v);
      kingdoms.set(v.kingdom, list);
    }
    for (const list of kingdoms.values()) {
      if (list.length < 2) continue;
      for (const a of list) {
        for (const b of list) {
          if (a === b || this.distance(a, b.x, b.y) > B.HAUL_RANGE) continue;
          let moved = false;
          // O campo abastece a cidade (evolução dos povos, etapa 2): aldeia ou vila do reino onde todos comem bem manda a
          // comida que passa de meio ano de consumo para o lugar maior que não tem nem um ano guardado.
          if (this.scale(b) > this.scale(a) && (a.fedShare ?? 0) >= B.SUPPLY_FED) {
            const spare = a.food - a.population * B.CONSUME_FOOD * 0.5;
            const room = b.population * B.CONSUME_FOOD - b.food;
            const load = Math.min(B.HAUL_LOAD * 2, spare, room, this.capOf(b, 'food') - b.food);
            if (load >= 1 && this.landPath(a.x, a.y, b.x, b.y)) {
              a.food -= load;
              b.food += load;
              this.book(a, 'saiu', 0, load);
              this.book(b, 'chegou', load, 0);
              this.tally.supplied += load;
              moved = true;
            }
          }
          for (const g of [...GOODS, 'food'] as (Good | 'food')[]) {
            const capA = this.capOf(a, g);
            const capB = this.capOf(b, g);
            const have = g === 'food' ? a.food : a.stock[g];
            const want = g === 'food' ? b.food : b.stock[g];
            // Minério vai para quem tem ferraria; o resto, de onde sobra para onde falta.
            const ore = g === 'copper' || g === 'tin' || g === 'iron' || g === 'coal';
            const forge = ore && this.has(b, 'smithy') && !this.has(a, 'smithy');
            if (!forge && (have < capA * B.HAUL_HIGH || want > capB * B.HAUL_LOW)) continue;
            // Reino que cunha moeda troca mais dentro de si (RF-VIDA-291).
            const most = B.HAUL_LOAD * (this.villages[a.kingdom].mint ? B.MINT_HAUL : 1);
            const load = forge ? Math.min(most, have, capB - want) : Math.min(most, have - capA * B.HAUL_HIGH, capB * B.HAUL_LOW - want);
            if (load < 1) continue;
            if (!moved && !this.landPath(a.x, a.y, b.x, b.y)) break;
            moved = true;
            if (g === 'food') {
              a.food -= load;
              b.food += load;
            } else {
              a.stock[g] -= load;
              b.stock[g] += load;
            }
            this.book(a, 'saiu', 0, load);
            this.book(b, 'chegou', load, 0);
          }
        }
      }
    }
  },

  /** Revolta (RF-VIDA-280): assentamento muito instável longe da capital se separa do reino. */
  revolts(this: Ecosystem): void {
    for (const v of this.villages) {
      if (v.abandoned || v.kingdom === v.id || (v.stability ?? 1) >= B.REVOLT_STABILITY || v.population < 10) continue;
      if (!happens(this.polRnd, B.REVOLT_RATE, 1)) continue;
      const capital = this.villages[v.kingdom];
      const why = v.needs ? NEED_NAMES[worstNeed(v.needs)] : 'tudo';
      this.newKingdom(v, capital);
      this.relations.set(this.key(capital.id, v.id), -40);
      this.note(`${v.name} se revoltou contra ${capital.name}: faltava ${why}`, 'povo', v, { major: true });
    }
  },

  /** Região do clima do ano que contém o tile (x, y). */
  region(this: Ecosystem, x: number, y: number): number {
    const [cols, rows] = B.CLIMATE_REGIONS;
    const rx = Math.min(cols - 1, Math.floor((x * cols) / this.map.width));
    const ry = Math.min(rows - 1, Math.max(0, Math.floor((y * rows) / this.map.height)));
    return ry * cols + rx;
  },

  /** Clima do ano no ponto (0 = normal). */
  climateAt(this: Ecosystem, x: number, y: number): number {
    return this.climate[this.region(((Math.floor(x) % this.map.width) + this.map.width) % this.map.width, Math.floor(y))];
  },

  /** Quanto a colheita rende neste ano no assentamento (1 = ano normal). */
  /** Agricultores que cada roça do mapa comporta: a roça desenhada representa mais terra conforme o lugar cresce. */
  fieldHands(this: Ecosystem, v: Village): number {
    return B.FIELD_HANDS * (1 + B.FIELD_HANDS_TIER * this.scale(v));
  },

  harvest(this: Ecosystem, v: Village): number {
    // A água no solo do clima vivo pesa um quarto: chuva farta ajuda, seca de verdade derruba.
    return Math.max(0.15, (1 + B.HARVEST_SENSITIVITY * this.climateAt(v.x, v.y)) * (0.75 + 0.25 * this.soilFactor(v.x, v.y)));
  },

  /** Um ano de clima: ruído com retorno à média, comum e regional; secas fortes vão para a crônica. */
  updateClimate(this: Ecosystem): void {
    const shared = Math.sqrt(B.CLIMATE_SHARED);
    const local = Math.sqrt(1 - B.CLIMATE_SHARED);
    this.climateShared = ouStep(this.climateRnd, this.climateShared, 1, B.CLIMATE_THETA, B.CLIMATE_SIGMA);
    for (let r = 0; r < this.climate.length; r++) {
      this.climateLocal[r] = ouStep(this.climateRnd, this.climateLocal[r], 1, B.CLIMATE_THETA, B.CLIMATE_SIGMA);
      this.climate[r] = shared * this.climateShared + local * this.climateLocal[r];
    }
    for (let r = 0; r < this.climate.length; r++) {
      if (this.climate[r] >= B.DROUGHT_LEVEL || this.year - this.droughtNoted[r] < B.DROUGHT_COOLDOWN) continue;
      const hit = this.villages.filter((v) => !v.abandoned && this.region(Math.floor(v.x), Math.floor(v.y)) === r);
      if (!hit.length) continue;
      this.droughtNoted[r] = this.year;
      const names = hit.slice(0, 3).map((v) => v.name);
      this.note(`Uma seca castiga a região de ${names.join(', ')}${hit.length > 3 ? ' e arredores' : ''}: as colheitas minguam`, 'natureza', hit[0], { key: `drought-${r}` });
    }
  },
};
export type EconomyYearPart = typeof economyYearPart;
