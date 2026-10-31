/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): líder, fundação, abandono, ruínas e o passo dos assentamentos.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { happens } from '../../stochastic';
import * as P from '../../progress';
import { emptyMade, emptyStock, makeCulture } from '../../economy';
import { CHILD, ROLE, ROLES } from '../../roles';
import { BOND, partnerOf } from '../../../ai/relations';
import { LEADER } from '../../../ai/tuning';
import { chooseLeader, leaderReason, rulerTemper, type Candidate } from '../../../ai/decisions/leader';
import { completeness, missingText } from '../../plan';
import { seasonOf, welfare } from '../../needs';
import { TIER_RADIUS } from '../../settlement';
import { alienName } from '../../species';
import type { Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS, ERAS, KINGDOM_COLORS, RUIN_YEARS } = constantsModule;
const { hsl, elderAge } = helpersModule;

export const lifecyclePart = {
  /** Garante um líder vivo (rei, se for capital de um reino com cidade). */
  updateLeader(this: Ecosystem, v: Village, adults: number[]): void {
    const l = v.leader;
    const king = v.tier >= 2 && v.kingdom === v.id;
    if (l >= 0 && this.alive[l] && this.village[l] === v.id) {
      this.role[l] = king ? ROLE.king : ROLE.leader;
      return;
    }
    if (!adults.length) {
      v.leader = -1;
      return;
    }
    // O povo escolhe (IA local, src/ai/decisions/leader.ts): carisma, ambição, idade e amigos; num reino, o herdeiro.
    const sp = this.species[v.species];
    const elder = elderAge(sp, Math.floor(v.tech));
    const old = v.leaderUid ?? 0;
    const oldMate = old ? partnerOf(this.bonds, old) : 0;
    const crown = v.kingdom === v.id && v.tier >= 2;
    const cands: Candidate[] = adults.map((i) => {
      let friends = 0;
      for (const b of this.bonds.get(this.uid[i]) ?? []) if (b.kind === BOND.friend) friends++;
      return { i, prime: this.age[i] < elder, friends, heir: !!old && (this.parent[i] === old || this.uid[i] === oldMate) };
    });
    const choice = chooseLeader({ traits: this.traits, crown }, cands, this.mindRnd);
    const pick = choice ? choice.pick.action : adults[0];
    v.leader = pick;
    v.leaderUid = this.uid[pick];
    this.role[pick] = king ? ROLE.king : ROLE.leader;
    const cand = cands.find((c) => c.i === pick)!;
    this.logThought(pick, 'poder', `${king ? 'Virou rei' : 'Virou líder'} de ${v.name}: ${leaderReason(this.traits, cand, crown)}`);
  },

  /** Agressividade do reino somada ao temperamento do rei (IA local): um rei belicoso puxa a guerra, um gentil a segura. */
  warMood(this: Ecosystem, k: number): number {
    const l = this.villages[k]?.leader ?? -1;
    const ruler = l >= 0 && this.alive[l] ? LEADER.temper * rulerTemper(this.traits, l) : 0;
    // O empurrão do jogador manda: no extremo (−1 ou 1) o temperamento do rei não pesa mais.
    const push = this.temperOf(k);
    return Math.max(-1, Math.min(1, push + ruler * (1 - Math.abs(push))));
  },

  uniqueName(this: Ecosystem): string {
    let name = alienName(this.civRnd, 2);
    for (let t = 0; t < 20 && this.villages.some((v) => v.name === name); t++) name = alienName(this.civRnd, 2 + (t > 10 ? 1 : 0));
    return name;
  },

  foundVillage(this: Ecosystem, s: number, x: number, y: number, settlers: number, from?: Village, how?: Village['foundedBy']): Village {
    const sp = this.species[s];
    const rnd = this.civRnd;
    // Ruínas logo ali: o assentamento novo ocupa a antiga praça e aproveita as ruas e plantações que sobraram.
    const ruin = this.ruinNear(x + 0.5, y + 0.5, TIER_RADIUS[0] + 2, s);
    if (ruin) {
      x = Math.floor(ruin.x);
      y = Math.floor(ruin.y);
    }
    const id = this.villages.length;
    const village: Village = {
      id,
      name: this.uniqueName(),
      species: s,
      x: x + 0.5,
      y: y + 0.5,
      houses: [],
      fields: 0,
      leader: -1,
      tier: 0,
      kingdom: from ? from.kingdom : id,
      lots: [],
      tech: from ? from.tech * 0.8 : 0,
      techs: from?.techs ? [...from.techs] : [],
      pts: P.emptyPoints(),
      population: 0,
      port: -1,
      food: 0,
      stock: emptyStock(),
      made: emptyMade(),
      culture: from ? from.culture : makeCulture(this.cultures++, '', rnd),
      mines: [],
      forgeWork: 0,
      forest: 0,
      rock: false,
      color: from ? from.color : this.freshColor(),
      abandoned: false,
      foundedAt: this.year,
      foundedBy: how ?? (from ? 'colônia' : 'bando'),
      mother: from?.id,
    };
    if (!from) village.culture = makeCulture(village.culture.id, village.name, rnd);
    if (ruin) {
      village.ruinOf = ruin.id;
      if (!ruin.decay) village.fields = ruin.fields;
      ruin.decay = 3;
    }
    this.villages.push(village);
    this.layPlaza(village);
    this.buildHouse(village, 'house', true);
    this.chooseVocation(village, from);
    this.materialOf(village);
    // Colonos levam o enxoval: parte da madeira e da comida da origem (RF-VIDA-212).
    if (from) {
      const wood = Math.min(30, from.stock.wood * 0.25);
      from.stock.wood -= wood;
      village.stock.wood = wood;
      const food = Math.min(20, from.food * 0.2);
      from.food -= food;
      village.food = food;
    }
    for (let k = 0; k < settlers; k++) {
      this.spawn(s, x + (rnd() - 0.5) * 3, y + (rnd() - 0.5) * 3, village.id, sp.maturity + rnd() * 10);
    }
    return village;
  },

  /** Cor de reino que nenhum reino vivo usa (da paleta; acabando, uma cor gerada). */
  freshColor(this: Ecosystem): [number, number, number] {
    const used = new Set(this.villages.filter((o) => !o.abandoned && o.kingdom === o.id).map((o) => o.color.join(',')));
    const free = KINGDOM_COLORS.filter((c) => !used.has(c.join(',')));
    if (free.length) return free[Math.floor(this.civRnd() * Math.min(3, free.length))];
    return hsl(this.civRnd(), 0.65 + this.civRnd() * 0.25, 0.4 + this.civRnd() * 0.25);
  },

  abandon(this: Ecosystem, v: Village, quiet = false): void {
    v.abandoned = true;
    v.abandonedAt = this.year;
    v.decay = 0;
    this.dropWall(v);
    if (v.foundedAt !== undefined && this.year - v.foundedAt < 50) this.tally.shortLived++;
    // As casas viram ruína e somem; as ruas e plantações ficam e vão sumindo com o tempo (clearRuins).
    for (const h of v.houses) {
      const size = h.kind === 'port' ? 1 : 2;
      for (let dy = 0; dy < size; dy++) {
        for (let dx = 0; dx < size; dx++) {
          const t = this.tileAt(h.x + dx, h.y + dy);
          if (t >= 0) {
            this.built[t] = 0;
            this.onTileChanged(t);
          }
        }
      }
    }
    // O que sobrou no estoque se perde com o lugar: ninguém herda (pedido do Joab, seção 19.19). Só o saque leva bens embora.
    v.stock = emptyStock();
    v.stock.wood = 0;
    v.food = 0;
    v.houses.length = 0;
    v.port = -1;
    for (const id of v.mines) this.deposits[id].mine = -1;
    v.mines.length = 0;
    // Assentamentos do reino de uma capital abandonada ficam independentes.
    for (const o of this.villages) if (o.kingdom === v.id && o !== v) o.kingdom = o.id;
    if (quiet) return;
    // Abandono com destino (RF-AS-08): a crônica diz para onde foram os últimos moradores.
    const to = v.leftTo !== undefined ? this.villages[v.leftTo] : null;
    const cause = to ? `: os últimos moradores foram para ${to.name}` : v.lastCause ? `: o último morador morreu ${v.lastCause}` : '';
    this.note(`${v.name} foi abandonada${cause}`, 'povo', v, { major: v.tier >= 1 });
  },

  /**
   * Uma etapa do sumiço das ruínas: na 1ª somem as plantações e um terço das
   * ruas, na 2ª outro terço, na 3ª o resto, praça incluída. Não mexe no que
   * estiver dentro de um assentamento vivo.
   */
  clearRuins(this: Ecosystem, v: Village, stage: number): void {
    const r = Math.ceil(this.radius(v)) + 1;
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const t = this.tileAt(cx + dx, cy + dy);
        if (t < 0 || !this.road[t] || this.built[t]) continue;
        const gone = this.road[t] === 4 || this.road[t] === 5 || stage >= 3 || (Math.imul(t, 2654435761) >>> 0) % 3 < stage;
        if (!gone || this.settlementAt(cx + dx + 0.5, cy + dy + 0.5)) continue;
        this.road[t] = 0;
        this.onTileChanged(t);
      }
    }
    // Sem o lugar, o terreiro volta a ser mato (a mata pode voltar).
    if (stage >= 3 && this.map.bare) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const t = this.tileAt(cx + dx, cy + dy);
          if (t >= 0 && this.map.bare[t] && !this.settlementAt(cx + dx + 0.5, cy + dy + 0.5)) {
            this.map.bare[t] = 0;
            this.onTileChanged(t);
          }
        }
      }
    }
    v.decay = stage;
    v.pens = undefined;
    if (stage >= 3) this.note(`As últimas ruínas de ${v.name} sumiram`, 'povo', v);
  },

  updateVillages(this: Ecosystem, dt: number): void {
    this.recountCrews();
    // Adultos de cada assentamento, para escolher líderes.
    const adults: number[][] = this.villages.map(() => []);
    // Trabalhadores por profissão (adultos que ainda não são idosos).
    const workers = this.villages.map(() => new Array<number>(ROLES.length).fill(0));
    // Moradores e os que estão bem alimentados (atendimento de comida, RF-VIDA-210).
    const residents = new Array<number>(this.villages.length).fill(0);
    const fed = new Array<number>(this.villages.length).fill(0);
    for (let v = 0; v < this.villages.length; v++) {
      const village = this.villages[v];
      for (const i of this.residents(v)) {
        residents[v]++;
        if (this.energy[i] >= 0.3) fed[v]++;
        if (this.role[i] === CHILD) continue;
        adults[v].push(i);
        if (this.age[i] < elderAge(this.species[this.kind[i]], Math.floor(village.tech))) workers[v][this.role[i]]++;
      }
    }
    const fishers = workers.map((w) => w[ROLE.fisher]);
    fishers.length = this.villages.length;
    let live = 0;
    for (const v of this.villages) if (!v.abandoned) live++;
    for (const v of this.villages) {
      if (v.abandoned) {
        const stage = v.decay ?? 3;
        if (stage < 3 && this.year - (v.abandonedAt ?? 0) >= (stage + 1) * RUIN_YEARS) this.clearRuins(v, stage + 1);
        continue;
      }
      if (v.population <= 0) {
        this.abandon(v);
        continue;
      }
      const before = Math.floor(v.tech);
      const eraPace = this.yearSpan > YEAR_SECONDS ? 1.5 : 1;
      this.develop(v, dt * eraPace, adults[v.id] ?? []);
      if (Math.floor(v.tech) > before) {
        this.note(`${v.name} entrou na ${ERAS[Math.floor(v.tech)]}`, 'era', v, { major: true });
        // Cada era nova refaz o calçamento das ruas que o uso abriu (RF-VIDA-253 e RF-AS-13).
        if (Math.floor(v.tech) >= 2) this.rankStreets(v);
      }
      this.updateTier(v, false);
      this.updateLeader(v, adults[v.id] ?? []);
      // Assentamentos fundados neste passo ainda não têm contagem.
      if (workers[v.id]) this.produce(v, workers[v.id], adults[v.id].length, dt);
      if (v.yard) this.reserveFromYard(v);
      // Crescimento para dentro (RF-VIDA-202): preencher os lotes, completar a planta e reformar, adensar e só então expandir.
      const homes = v.houses.filter((h) => h.kind === 'house').length;
      const yr = dt / YEAR_SECONDS;
      const items = this.plan(v);
      v.completeness = completeness(items);
      v.missing = missingText(items);
      const needRoom = v.population > this.housing(v, true) - 3;
      // Obras ao mesmo tempo: quanto mais construtores, mais canteiros abertos (seção 19.21).
      const builders = workers[v.id]?.[ROLE.builder] ?? 0;
      const workRoom = v.houses.reduce((n, h) => n + ((h.labor ?? 0) > 0 ? 1 : 0), 0) < 1 + Math.max(1, builders);
      const lot = needRoom || v.completeness < 1 ? this.freeLot(v) : null;
      const pace = v.needs ? 0.6 + 0.4 * welfare(v.needs) : 1;
      if (workRoom && (needRoom || v.population > homes * 3) && happens(this.civRnd, B.HOUSE_RATE * pace, yr)) {
        // A planta pede uma construção especial: ela vem antes da casa nova, quando há material.
        const special = homes >= 4 && (v.completeness < 1 || this.civRnd() < B.SPECIAL_BUILDING_SHARE) ? this.nextBuilding(v) : null;
        if (!(special && this.buildHouse(v, special)) && lot) this.buildHouse(v, 'house');
      }
      // Reformas: casa que ganha um andar (sobrado), mais depressa quando falta lote e sobra gente.
      const squeezed = needRoom && !lot;
      const rich = v.needs && welfare(v.needs) >= 0.88 ? B.RICH_REFORM : 1;
      if (workRoom && happens(this.civRnd, B.REFORM_RATE * Math.max(1, builders) * (squeezed ? 3 : 1) * rich, yr)) this.reform(v);
      // Era nova: as casas antigas vão sendo trocadas pelo estilo novo, uma a uma.
      if (workRoom && this.outdated(v) && happens(this.civRnd, B.RESTYLE_RATE * Math.max(1, builders), yr)) this.restyle(v);
      // As ruas nascem do uso (RF-AS-13): não há planta a abrir. Sem lote ao alcance, o lugar adensa e,
      // apertado de verdade, organiza uma colônia (abaixo).
      // Lavouras trabalhadas por agricultores enchem o celeiro (cada porção mata a fome de um morador).
      // A colheita vem quase toda no outono (RF-VIDA-290); boi ou cavalo no arado dobram a área de cada agricultor;
      // o moinho faz pão (RF-VIDA-211); o solo cansado rende menos (RF-VIDA-294).
      if (v.fields > 0 && workers[v.id]) {
        const w = workers[v.id];
        const plough = v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat' && this.knew(v, 'arado') ? 1 : 0.5;
        // Cada roça no mapa é um lote grande, maior quanto maior o lugar (o mapa tem no máximo 5 roças).
        const worked = Math.min(v.fields * this.fieldHands(v), Math.ceil(w[ROLE.farmer] * plough) + 1);
        const mill = v.houses.some((h) => h.kind === 'windmill') ? 1 + (this.knew(v, 'moinhoagua') ? 0.45 : 0.3) * Math.min(1, w[ROLE.miller]) : 1;
        const bonus = v.vocation === 'agricola' ? 1 + B.VOCATION_BONUS : 1;
        const fallow = (v.soil ?? 1) < B.SOIL_FALLOW ? 0.5 : 1;
        const season = B.SEASON_HARVEST[seasonOf(this.yearClock / YEAR_SECONDS)];
        this.book(v, '_fields', this.gain(v, 'food', worked * B.FIELD_YIELD * B.ERA_YIELD[Math.min(B.ERA_YIELD.length - 1, Math.floor(v.tech))] * this.harvest(v) * (this.knew(v, 'irrigacao') ? 1.1 : 1) * (v.soil ?? 1) * fallow * mill * bonus * season * yr), 0);
      }
      if (workers[v.id]) this.consume(v, residents[v.id] ? fed[v.id] / residents[v.id] : 1, yr);
      // Roças desde a Idade da Pedra (uma para cada quatro casas; da Idade do Bronze em diante, uma para cada duas).
      // Só planta o que os agricultores dão conta (mais uma); roça sem ninguém para trabalhar volta a ser campo.
      // As roças acompanham quem as trabalha, num anel em volta das casas (RF-AS-16; antes, no máximo 5 no mapa).
      const hands = Math.ceil((workers[v.id]?.[ROLE.farmer] ?? 0) * (v.herd && v.herd.head >= 2 && v.herd.kind !== 'sheep' && v.herd.kind !== 'goat' ? 1 : 0.5)) + 1;
      const room = Math.min(B.FIELDS_MAX, Math.ceil(hands / this.fieldHands(v)) + 1);
      if (v.fields < Math.min(room, homes / (Math.floor(v.tech) >= 1 ? 2 : 4)) && (v.population >= 6 || v.tech >= 0.12) && happens(this.civRnd, B.FIELD_RATE, dt / YEAR_SECONDS)) this.plantField(v);
      else if (v.fields > room && happens(this.civRnd, B.FIELD_FALLOW_RATE, dt / YEAR_SECONDS)) this.dropField(v);
      // De vez em quando aparece um andarilho do mesmo povo, mais fácil quando o lugar tem pouca gente.
      const rush = (v.goldRush ?? 0) > this.year ? B.GOLD_RUSH_WANDERERS : 0;
      const wander = B.WANDERER_RATE[v.population <= 3 ? 0 : v.population < 10 ? 1 : v.population < 30 ? 2 : 3] + rush;
      if (happens(this.civRnd, wander, dt / YEAR_SECONDS)) this.wanderer(v);
      // Porto na costa quando o assentamento ganha corpo (canoas); barcos de pesca saem dele.
      if (v.port < 0 && (v.population >= 6 || v.tech >= 0.2) && happens(this.civRnd, B.PORT_RATE, dt / YEAR_SECONDS)) this.buildPort(v);
      if (v.port >= 0 && fishers[v.id] > 0 && happens(this.civRnd, B.FISH_TRIP_RATE, dt / YEAR_SECONDS)) {
        let out = 0;
        for (const b of this.boats) if (b.village === v.id && b.purpose === 'fish' && b.sunk < 0) out++;
        if (out < Math.min(3, 1 + Math.floor(fishers[v.id] / 3))) this.launch(v, 'fish');
      }
      // Exploradores por mar quando já dominam o mar (cerâmica/bronze ou vila); povos comerciantes e sábios exploram mais.
      const curious = v.culture.value === 'comércio' || v.culture.value === 'conhecimento' ? 2 : 1;
      if (v.port >= 0 && (v.tech >= 1 || this.knew(v, 'ceramica') || v.tier >= 1) && happens(this.civRnd, B.EXPLORE_RATE * curious, dt / YEAR_SECONDS)) this.explore(v);
      // Caravanas, tributo pedido pela capital e rebanho rumo ao pasto alto (19.6).
      this.sendCaravan(v, yr);
      // Colônia com motivo (RF-AS-03): só de quem tem gente de sobra, e só quando há motivo fora (espaço, terra
      // ou jazida). O grupo é organizado: batedores primeiro, a partida depois (`departColony`, uma vez por ano).
      const crowded = squeezed && !this.reformable(v);
      if (!v.colony && v.population >= B.COLONY_SOURCE_POP && live < 150 && happens(this.civRnd, B.COLONY_RATE * (1 + 0.25 * Math.floor(v.tech)) * (crowded ? B.COLONY_PRESSURE_CROWDED : 1), yr)) {
        const motive = this.colonyMotive(v, crowded);
        if (motive && !this.organizeColony(v, motive) && crowded) this.colonizeBySea(v);
      }
    }
    this.updateWars(dt);
    this.yearClock += dt;
    if (this.yearClock >= YEAR_SECONDS) {
      this.yearClock = 0;
      this.yearly();
    }
  },
};
export type LifecyclePart = typeof lifecyclePart;
