/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): jornadas do modo completo (RF-AS-20 a 27): quadro de serviços, entregas e passos.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import type { Good } from '../../economy';
import { ROLE, ROLE_NAMES, ROLES } from '../../roles';
import { TRAIT, TRAIT_COUNT } from '../../../ai/traits';
import { chooseDay, DAY, DAY_NAMES, dayWhy, type BoardTask, type DayKind } from '../../../ai/decisions/day';
import { isStreet, TRAIL, WALL } from '../../architecture';
import { wrapDx } from '../../settlement';
import type { BuildingKind, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS, BUILDING_NAMES, THINK_INTERVAL, JOB, RAW, CARGO_NAMES, GESTURE, GESTURE_OF } = constantsModule;
const { carryCode, CARGO_GOOD } = helpersModule;
const { isLand } = tilesModule;

export const journeysPart = {
  /** Guarda o que foi feito: no modo completo, bruto vai para o pátio e só chega ao estoque com uma entrega (RF-AS-23). */
  store1(this: Ecosystem, v: Village, good: Good | 'food', got: number): void {
    if (got <= 0) return;
    if (RAW.has(good) && this.full(v)) {
      const y = (v.yard ??= {});
      y[good] = (y[good] ?? 0) + got;
      this.yardIn[good] = (this.yardIn[good] ?? 0) + got;
      return;
    }
    if (good === 'food') v.food += got;
    else v.stock[good] += got;
  },

  /** Entrega no celeiro: tira do pátio e põe no estoque. Devolve quanto entregou. */
  deliver(this: Ecosystem, v: Village, good: Good | 'food', amount: number): number {
    const y = v.yard;
    const n = Math.min(amount, y?.[good] ?? 0);
    if (n <= 0 || !y) return 0;
    y[good] = (y[good] ?? 0) - n;
    if (good === 'food') v.food += n;
    else v.stock[good] += n;
    this.delivered[good] = (this.delivered[good] ?? 0) + n;
    return n;
  },

  /** Tudo o que ficou no pátio vai ao celeiro de carroça (fim do ano, ou o lugar saiu da tela). */
  flushYard(this: Ecosystem, v: Village): void {
    if (!v.yard) return;
    for (const g of Object.keys(v.yard) as (Good | 'food')[]) this.deliver(v, g, v.yard[g] ?? 0);
  },

  /**
   * Estoque quase vazio com carga parada no pátio: as famílias buscam o que precisam direto da roça e da
   * mata (conta como entrega). Evita fome e frio só porque os carregadores ainda não chegaram.
   */
  reserveFromYard(this: Ecosystem, v: Village): void {
    const yard = v.yard!;
    for (const g of Object.keys(yard) as (Good | 'food')[]) {
      const have = g === 'food' ? v.food : v.stock[g];
      const want = g === 'food' ? v.population * B.YARD_RESERVE_FOOD : g === 'wood' ? v.population * B.YARD_RESERVE_WOOD : 0;
      if ((yard[g] ?? 0) > 0 && have < want) this.deliver(v, g, want - have);
    }
  },

  /** Tile do celeiro (ou da praça, sem celeiro). */
  granaryTile(this: Ecosystem, v: Village): number {
    const g = v.houses.find((h) => h.kind === 'granary' || h.kind === 'warehouse');
    return g ? this.tileAt(g.x + 1, g.y + 1) : this.tileAt(Math.floor(v.x), Math.floor(v.y));
  },

  plazaTile(this: Ecosystem, v: Village): number {
    return this.tileAt(Math.floor(v.x), Math.floor(v.y));
  },

  /** Roças do assentamento (tiles de lavoura perto dele). */
  fieldTiles(this: Ecosystem, v: Village): number[] {
    const c = this.fieldCache.get(v.id);
    const year = Math.floor(this.year);
    if (c && c.year === year) return c.tiles;
    const r = Math.ceil(this.footprint(v) + B.FIELD_RING * 2);
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    const tiles: number[] = [];
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = this.tileAt(cx + dx, cy + dy);
        if (t >= 0 && this.road[t] === 4) tiles.push(t);
      }
    }
    this.fieldCache.set(v.id, { year, tiles });
    return tiles;
  },

  /** Posto de trabalho do ofício (RF-AS-20): a roça, a mina, o porto, a oficina, o templo, o mercado ou a praça. */
  workplace(this: Ecosystem, i: number, v: Village, role: number): number {
    const find = (...kinds: BuildingKind[]) => {
      const h = v.houses.find((b) => kinds.includes(b.kind) && !b.site);
      return h ? this.tileAt(h.x + 1, h.y + 1) : -1;
    };
    switch (role) {
      case ROLE.farmer: {
        const f = this.fieldTiles(v);
        return f.length ? f[(this.uid[i] * 7) % f.length] : -1;
      }
      case ROLE.miner:
        return v.mines.length ? this.tileAt(this.deposits[v.mines[i % v.mines.length]].x, this.deposits[v.mines[i % v.mines.length]].y) : -1;
      case ROLE.fisher:
        return v.port;
      case ROLE.blacksmith:
        return find('smithy');
      case ROLE.weaver:
        return find('loom');
      case ROLE.potter:
        return find('pottery');
      case ROLE.miller:
        return find('windmill');
      case ROLE.merchant:
        return find('market');
      case ROLE.priest:
        return find('temple');
      case ROLE.shepherd:
        return find('corral') >= 0 ? find('corral') : v.pens?.length ? this.tileAt(v.pens[0].x, v.pens[0].y) : -1;
      case ROLE.horsekeeper:
        return find('stable');
      case ROLE.gatherer: {
        // Coletores vão a um ponto além da borda, que muda de pessoa para pessoa e de estação para estação.
        const a = ((this.uid[i] * 2654435761) % 1000) / 1000 * Math.PI * 2 + this.season();
        const r = this.footprint(v) + B.FIELD_RING + 3;
        return this.tileAt(Math.floor(v.x + Math.cos(a) * r), Math.floor(v.y + Math.sin(a) * r));
      }
      case ROLE.leader:
      case ROLE.king:
        return this.plazaTile(v);
      default:
        return -1;
    }
  },

  /** O que cada ofício traz do posto (a carga que leva ao celeiro). */
  yieldOf(this: Ecosystem, role: number): Good | 'food' | null {
    if (role === ROLE.farmer || role === ROLE.gatherer || role === ROLE.hunter || role === ROLE.fisher) return 'food';
    if (role === ROLE.woodcutter) return 'wood';
    if (role === ROLE.miner) return 'stone';
    return null;
  },

  /** Quadro de tarefas do assentamento (RF-AS-21): o que ele precisa agora, com prioridade e vagas. */
  board(this: Ecosystem, v: Village): BoardTask[] {
    const b = this.boards.get(v.id);
    if (b && this.year - b.at < B.TASK_SECONDS / YEAR_SECONDS) return b.tasks;
    const tasks: BoardTask[] = [];
    const season = this.season();
    const pop = Math.max(1, v.population);
    const foodNeed = 1 - (v.needs?.food ?? 1);
    // Colheita: na safra (verão) vira urgente e junta ajudantes de todos os ofícios (colheita coletiva, RF-AS-28).
    const fields = this.fieldTiles(v);
    const harvest = season === 2;
    const nf = Math.min(fields.length, 8);
    for (let k = 0; k < nf; k++) {
      const t = fields[Math.floor((k * fields.length) / nf)];
      tasks.push({ kind: DAY.harvest, tile: t, prio: Math.min(1, B.SEASON_HARVEST[season] / 2.6 + foodNeed), slots: harvest ? 4 : 2, taken: 0, role: ROLE.farmer, urgent: harvest, label: `colher a roça ${k + 1}` });
    }
    // Carga parada no pátio: alguém leva ao celeiro.
    let left = 0;
    for (const g of Object.keys(v.yard ?? {}) as (Good | 'food')[]) left += v.yard![g] ?? 0;
    if (left >= B.CARRY_LOAD) {
      const at = fields.length ? fields[0] : this.plazaTile(v);
      tasks.push({ kind: DAY.haul, tile: at, prio: Math.min(1, left / (left + pop)), slots: Math.min(6, Math.ceil(left / B.CARRY_LOAD)), taken: 0, role: -1, label: `levar ${Math.round(left)} de carga ao celeiro` });
    }
    // Obras: o mutirão é chamado para a muralha, o templo e quando o lugar não tem construtor.
    for (const h of v.houses) {
      if ((h.labor ?? 0) <= 0) continue;
      const big = h.kind !== 'house' || (v.crew ?? 1) === 0;
      tasks.push({ kind: DAY.build, tile: this.tileAt(h.x, h.y), prio: big ? 0.8 : 0.5, slots: B.JOB_SLOTS_BUILD + (big ? 3 : 0), taken: 0, role: ROLE.builder, urgent: big, label: `erguer ${h.kind === 'house' ? 'uma casa' : BUILDING_NAMES[h.kind]?.toLowerCase() ?? 'uma obra'}` });
    }
    // Água do poço (ou do rio) para as casas.
    // O poço fica na praça da Idade do Bronze em diante (a tela desenha); antes, a água vem do rio ou do lago.
    if (Math.floor(v.tech) >= 1 || v.wet) {
      const t = this.plazaTile(v);
      tasks.push({ kind: DAY.water, tile: t, prio: 0.3, slots: Math.max(1, Math.ceil(pop / 25)), taken: 0, role: -1, label: 'buscar água' });
    }
    // Ofício no posto: uma tarefa por ofício com vagas para todos dele.
    for (const role of [ROLE.miner, ROLE.fisher, ROLE.blacksmith, ROLE.weaver, ROLE.potter, ROLE.miller, ROLE.merchant, ROLE.priest, ROLE.shepherd, ROLE.horsekeeper, ROLE.gatherer, ROLE.leader, ROLE.king]) {
      tasks.push({ kind: DAY.work, tile: -1, prio: 0.55, slots: 999, taken: 0, role, label: `trabalhar como ${ROLE_NAMES[ROLES[role]].toLowerCase()}` });
    }
    // Reservas de quem já está numa tarefa do quadro anterior continuam valendo.
    for (const t of tasks) t.taken = 0;
    for (const i of this.residents(v.id)) {
      if (!this.day[i] || this.day[i] >= DAY.eat) continue;
      const t = tasks.find((x) => x.kind === this.day[i] && x.tile === this.dayAt[i]);
      if (t) t.taken++;
    }
    this.boards.set(v.id, { at: this.year, tasks });
    return tasks;
  },

  /** Larga a jornada (e a carga volta ao pátio). */
  dropDay(this: Ecosystem, i: number, v: Village | null): void {
    if (this.carry[i] && this.carryAmt[i] > 0 && v) {
      const g = CARGO_GOOD(this.carry[i]);
      if (g && g !== 'water') (v.yard ??= {})[g] = (v.yard[g] ?? 0) + this.carryAmt[i];
    }
    this.day[i] = DAY.none;
    this.dayLeg[i] = 0;
    this.dayTime[i] = 0;
    this.carry[i] = 0;
    this.carryAmt[i] = 0;
    this.gesture[i] = 0;
  },

  /** Escolhe a próxima jornada pelo quadro e pelas necessidades (RF-AS-22 e 25). */
  pickDay(this: Ecosystem, i: number, v: Village, working: boolean): void {
    const role = this.role[i];
    const w = this.map.width;
    const tasks = working ? this.board(v) : [];
    const options: { task: BoardTask; dist: number }[] = [];
    for (const t of tasks) {
      if (t.taken >= t.slots) continue;
      let tile = t.tile;
      if (t.kind === DAY.work) {
        if (t.role !== role) continue;
        tile = this.workplace(i, v, role);
        if (tile < 0) continue;
      }
      const d = Math.hypot(wrapDx((tile % w) + 0.5 - this.x[i], w), Math.floor(tile / w) + 0.5 - this.y[i]);
      options.push({ task: t.kind === DAY.work ? { ...t, tile } : t, dist: d });
    }
    // Amigos na mesma tarefa (o sociável gosta de trabalhar junto).
    const friends = (t: BoardTask) => {
      let n = 0;
      for (const b of this.bonds.get(this.uid[i]) ?? []) {
        const j = this.indexOfUid(b.uid);
        if (j >= 0 && this.day[j] === t.kind && this.dayAt[j] === t.tile) n++;
      }
      return n;
    };
    const c = chooseDay(
      {
        traits: this.traits,
        i,
        role,
        hunger: Math.max(0, Math.min(1, (0.75 - this.energy[i]) / 0.5)),
        rest: this.needRest[i],
        social: this.needSocial[i],
        faith: this.needFaith[i],
        tasks: options,
        friends,
        temple: this.has(v, 'temple'),
      },
      this.mindRnd,
    );
    if (!c) {
      this.day[i] = DAY.none;
      return;
    }
    const a = c.pick.action;
    let tile = a.task?.tile ?? -1;
    if (a.kind === DAY.eat) tile = v.food >= 1 ? this.granaryTile(v) : this.home[i] >= 0 ? this.home[i] : this.plazaTile(v);
    else if (a.kind === DAY.rest) tile = this.home[i] >= 0 ? this.home[i] : this.plazaTile(v);
    else if (a.kind === DAY.social) tile = this.plazaTile(v);
    else if (a.kind === DAY.pray) {
      const h = v.houses.find((b) => b.kind === 'temple');
      tile = h ? this.tileAt(h.x + 1, h.y + 1) : this.plazaTile(v);
    }
    if (tile < 0) {
      this.day[i] = DAY.none;
      return;
    }
    if (a.task) a.task.taken++;
    this.day[i] = a.kind;
    this.dayAt[i] = tile;
    this.dayLeg[i] = 0;
    this.dayTime[i] = 0;
    this.dayNotes.set(this.uid[i], { label: c.pick.label, why: dayWhy(c), others: c.others.slice(0, 2).map((o) => ({ label: o.label, score: o.score })) });
  },

  /** Para onde andar agora rumo ao tile `t`: o vizinho que encurta o caminho, preferindo rua e trilha (RF-AS-26). */
  stepToward(this: Ecosystem, i: number, t: number): { x: number; y: number } {
    const w = this.map.width;
    const tx = (t % w) + 0.5;
    const ty = Math.floor(t / w) + 0.5;
    const dx = wrapDx(tx - this.x[i], w);
    const dy = ty - this.y[i];
    const d = Math.hypot(dx, dy);
    if (d < 2.5) return { x: dx, y: dy };
    const cx = Math.floor(this.x[i]);
    const cy = Math.floor(this.y[i]);
    let best = { x: dx, y: dy };
    let bv = Infinity;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (!ox && !oy) continue;
        const n = this.tileAt(cx + ox, cy + oy);
        if (n < 0 || !isLand(this.map, n)) continue;
        const nx = cx + ox + 0.5;
        const ny = cy + oy + 0.5;
        const rest = Math.hypot(wrapDx(tx - nx, w), ty - ny);
        const step = Math.hypot(ox, oy) * this.walkCost(n);
        const value = step + rest;
        if (value < bv) {
          bv = value;
          best = { x: wrapDx(nx - this.x[i], w), y: ny - this.y[i] };
        }
      }
    }
    return best;
  },

  /** Custo de andar num tile: rua e trilha baratas, roça e mato mais caros, casa evitada (RF-AS-26). */
  walkCost(this: Ecosystem, t: number): number {
    const r = this.road[t];
    if (isStreet(r)) return r === TRAIL ? 0.7 : 0.5;
    if (this.built[t]) return 4;
    if (this.wall[t] && this.wall[t] !== WALL.gate) return 6;
    if (r === 4 || r === 5) return 1.6;
    return 1.2;
  },

  /**
   * Um passo da jornada da pessoa `i` (modo completo): escolhe a jornada quando não tem, anda até o lugar,
   * faz o gesto, volta com a carga e entrega. Devolve o vetor até onde andar (0,0 = parada no lugar), ou
   * null quando outra regra cuida dela (lenhador e construtor com ordem presencial, soldado em marcha).
   */
  journey(this: Ecosystem, i: number, v: Village, working: boolean, dt: number): { x: number; y: number } | null {
    const role = this.role[i];
    const w = this.map.width;
    this.needRest[i] = Math.min(1, this.needRest[i] + B.NEED_REST * dt * (working ? 1 : 0.6));
    this.needSocial[i] = Math.min(1, this.needSocial[i] + B.NEED_SOCIAL * dt);
    this.needFaith[i] = Math.min(1, this.needFaith[i] + B.NEED_FAITH * dt);
    // Eventos do lugar passam na frente de tudo (RF-AS-28 e 29).
    const event = this.eventFor(i, v, working);
    if (event) {
      if (this.day[i] !== event.kind || this.dayAt[i] !== event.tile) {
        this.dropDay(i, v);
        this.day[i] = event.kind;
        this.dayAt[i] = event.tile;
        this.dayNotes.set(this.uid[i], { label: DAY_NAMES[event.kind], why: event.why, others: [] });
      }
    } else if (this.day[i] >= DAY.shelter && this.day[i] !== DAY.festival + 100) {
      if (this.day[i] === DAY.shelter || this.day[i] === DAY.festival || this.day[i] === DAY.funeral || this.day[i] === DAY.curious) this.dropDay(i, v);
    } else if (this.day[i] === DAY.militia) this.dropDay(i, v);
    // Lenhador e construtor com ordem presencial seguem a ordem; com a carga na mão, primeiro entregam.
    if (!this.carry[i] && this.jobKind[i] && !event) return null;
    if (role === ROLE.soldier || role === ROLE.guard) {
      if (!event) return null;
    }
    // Com carga: leva ao celeiro.
    if (this.carry[i] && this.dayLeg[i] !== 2) {
      this.dayLeg[i] = 2;
      this.dayAt[i] = this.granaryTile(v);
      if (!this.day[i]) this.day[i] = DAY.haul;
    }
    if (!this.day[i]) {
      this.pickDay(i, v, working);
      if (!this.day[i]) {
        this.sampleDay(i, v, working, false, true);
        // Sem nada a fazer: fica pela praça, devagar.
        return null;
      }
    }
    const t = this.dayAt[i];
    if (t < 0) {
      this.dropDay(i, v);
      return null;
    }
    const dx = wrapDx((t % w) + 0.5 - this.x[i], w);
    const dy = Math.floor(t / w) + 0.5 - this.y[i];
    const reach = this.day[i] === DAY.build ? B.BUILD_REACH : this.day[i] === DAY.festival || this.day[i] === DAY.social || this.day[i] === DAY.shelter || this.day[i] === DAY.curious || this.day[i] === DAY.funeral ? 3 : 1.4;
    this.sampleDay(i, v, working, true, false);
    if (dx * dx + dy * dy > reach * reach) {
      this.gesture[i] = this.carry[i] ? GESTURE.carry : 0;
      // Muito tempo sem chegar (água no caminho): desiste e devolve a carga ao pátio.
      if ((this.dayTime[i] += dt) > B.JOB_TIMEOUT * 2) this.dropDay(i, v);
      return this.stepToward(i, t);
    }
    if (this.dayLeg[i] === 0) {
      this.dayLeg[i] = 1;
      this.dayTime[i] = 0;
    }
    this.dayTime[i] += dt;
    // Chegou com a carga: entrega no celeiro (RF-AS-23).
    if (this.dayLeg[i] === 2) {
      const g = CARGO_GOOD(this.carry[i]);
      if (g) {
        if (g === 'food' || g === 'water') {
          if (g === 'food') {
            v.food += this.carryAmt[i];
            this.delivered.food = (this.delivered.food ?? 0) + this.carryAmt[i];
          }
        } else {
          v.stock[g] += this.carryAmt[i];
          this.delivered[g] = (this.delivered[g] ?? 0) + this.carryAmt[i];
        }
      }
      this.carry[i] = 0;
      this.carryAmt[i] = 0;
      this.dropDay(i, v);
      return { x: 0, y: 0 };
    }
    this.gesture[i] = GESTURE_OF[this.day[i] === DAY.work ? 100 + role : this.day[i]] ?? GESTURE.none;
    const k = this.day[i] as DayKind;
    if (this.dayTime[i] < B.TASK_SECONDS) {
      if (k === DAY.build) this.helpBuild(i, v, dt);
      return { x: 0, y: 0 };
    }
    // Terminou o gesto: o efeito e a próxima perna.
    switch (k) {
      case DAY.eat:
        if (v.food >= 1 && this.energy[i] < 0.9) {
          v.food -= 1;
          this.book(v, 'food', 0, 1);
          this.energy[i] = Math.min(1, this.energy[i] + 0.35);
        }
        break;
      case DAY.rest:
        this.needRest[i] = 0;
        break;
      case DAY.social:
      case DAY.festival:
      case DAY.curious:
        this.needSocial[i] = 0;
        break;
      case DAY.pray:
      case DAY.funeral:
        this.needFaith[i] = 0;
        break;
      case DAY.water:
        this.carry[i] = carryCode('water');
        this.carryAmt[i] = 1;
        this.dayAt[i] = this.home[i] >= 0 ? this.home[i] : this.plazaTile(v);
        this.dayLeg[i] = 2;
        this.dayTime[i] = 0;
        return { x: 0, y: 0 };
      case DAY.harvest:
      case DAY.haul:
      case DAY.work: {
        const g = k === DAY.haul ? this.biggestYard(v) : this.yieldOf(role) ?? (k === DAY.harvest ? 'food' : null);
        const have = g ? v.yard?.[g] ?? 0 : 0;
        if (g && have > 0) {
          const load = Math.min(have, B.CARRY_LOAD * (this.scale(v) >= 1 && k !== DAY.work ? B.CART_LOAD : 1));
          v.yard![g] = have - load;
          this.carry[i] = carryCode(g);
          this.carryAmt[i] = load;
          this.dayAt[i] = this.granaryTile(v);
          this.dayLeg[i] = 2;
          this.dayTime[i] = 0;
          return { x: 0, y: 0 };
        }
        break;
      }
      default:
        if (this.dayTime[i] < B.TASK_SECONDS * 2) return { x: 0, y: 0 };
    }
    this.dropDay(i, v);
    return { x: 0, y: 0 };
  },

  /** No modo completo, quem produziu leva nas mãos o que acabou de ir para o pátio (caçador com a carne, lenhador com o feixe). */
  pickUp(this: Ecosystem, i: number, v: Village, good: Good | 'food', amount: number): void {
    if (amount <= 0 || !this.full(v) || !v.yard?.[good]) return;
    const n = Math.min(amount, v.yard[good] ?? 0);
    v.yard[good] = (v.yard[good] ?? 0) - n;
    if (this.carry[i] && CARGO_GOOD(this.carry[i]) !== good) this.dropDay(i, v);
    this.carry[i] = carryCode(good);
    this.carryAmt[i] += n;
  },

  /** O bem com mais carga parada no pátio. */
  biggestYard(this: Ecosystem, v: Village): Good | 'food' | null {
    let best: Good | 'food' | null = null;
    let n = 0;
    for (const g of Object.keys(v.yard ?? {}) as (Good | 'food')[]) {
      if ((v.yard![g] ?? 0) > n) {
        n = v.yard![g] ?? 0;
        best = g;
      }
    }
    return best;
  },

  /** Mutirão: quem não é construtor também bate na obra (RF-AS-28). */
  helpBuild(this: Ecosystem, i: number, v: Village, dt: number): void {
    const w = this.map.width;
    const t = this.dayAt[i];
    const h = v.houses.find((b) => b.x + b.y * w === t);
    if (!h || (h.labor ?? 0) <= 0) {
      this.dayTime[i] = B.TASK_SECONDS;
      return;
    }
    h.labor = Math.max(0, h.labor! - dt * 0.6 * (v.stock.tools > 0 ? B.TOOL_SPEED : 1));
    if (h.labor <= 0) h.site = undefined;
  },

  /**
   * Evento do lugar que chama esta pessoa agora (RF-AS-28 e 29): no alarme quem luta vira milícia e os
   * demais se abrigam; na festa e na caravana todos vão à praça; no enterro vai a família.
   */
  eventFor(this: Ecosystem, i: number, v: Village, working: boolean): { kind: DayKind; tile: number; why: string } | null {
    if ((v.alarmUntil ?? -1) > this.year) {
      const brave = working && this.traits[i * TRAIT_COUNT + TRAIT.courage] >= 0 && this.role[i] !== ROLE.priest;
      if (brave) return { kind: DAY.militia, tile: this.gateTile(v), why: 'o alarme tocou e ela é corajosa: pegou a lança' };
      return { kind: DAY.shelter, tile: this.plazaTile(v), why: 'o alarme tocou: correu para dentro' };
    }
    if (v.funeral && v.funeral.until > this.year && this.family[i] === v.funeral.family) return { kind: DAY.funeral, tile: v.funeral.tile, why: 'enterro de alguém da família' };
    if ((v.festivalUntil ?? -1) > this.year) return { kind: DAY.festival, tile: this.plazaTile(v), why: 'festa da colheita na praça' };
    if ((v.curiousUntil ?? -1) > this.year && this.traits[i * TRAIT_COUNT + TRAIT.curiosity] >= 3 && !this.carry[i]) return { kind: DAY.curious, tile: this.plazaTile(v), why: 'chegou uma caravana e ela é curiosa' };
    return null;
  },

  /** Portão (ou a borda da praça, sem muralha) onde a milícia se junta. */
  gateTile(this: Ecosystem, v: Village): number {
    const gate = v.walls?.find((t) => this.wall[t] === WALL.gate);
    return gate ?? this.plazaTile(v);
  },

  /** Amostra do comportamento (seção 7.3): adultos que trabalham, com tarefa, parados e passos sobre rua. */
  sampleDay(this: Ecosystem, i: number, v: Village, working: boolean, tasked: boolean, idle: boolean): void {
    if (!working) return;
    const s = this.dayStats;
    s.samples++;
    const busy = tasked || this.jobKind[i] > 0 || this.carry[i] > 0;
    if (busy) s.tasked++;
    if (idle && !busy) s.idle++;
    if (Math.hypot(this.vx[i], this.vy[i]) > 0.05 && this.distance(v, this.x[i], this.y[i]) <= this.footprint(v) + B.FIELD_RING) this.tread(this.tileOf(i), THINK_INTERVAL * B.STEP_WEAR);
    if (this.distance(v, this.x[i], this.y[i]) <= this.footprint(v) && Math.hypot(this.vx[i], this.vy[i]) > 0.05) {
      s.steps++;
      const r = this.road[this.tileOf(i)];
      if (isStreet(r) || r === 3) s.streetSteps++;
    }
  },

  /** Ficha com o porquê (RF-AS-30): tarefa, as duas alternativas que perderam e o motivo. */
  dayOf(this: Ecosystem, i: number): { task: string; why: string; others: string[]; carry: string } {
    const f = (n: number) => n.toFixed(2).replace('.', ',');
    const n = this.dayNotes.get(this.uid[i]);
    const carry = this.carry[i] ? `${CARGO_NAMES[CARGO_GOOD(this.carry[i]) ?? ''] ?? 'carga'} (${f(this.carryAmt[i])})` : '';
    if (this.jobKind[i] && !this.carry[i]) {
      const kind = this.jobKind[i] === JOB.build ? 'bater na obra' : this.jobKind[i] === JOB.plant ? 'plantar uma muda' : 'derrubar uma árvore';
      return { task: kind, why: 'ordem do quadro do lugar para o seu ofício', others: n?.others.map((o) => `${o.label} (${f(o.score)})`) ?? [], carry };
    }
    const vi = this.village[i];
    const v = vi >= 0 ? this.villages[vi] : null;
    if (!v) return { task: 'sem lugar', why: 'vive solto, sem assentamento', others: [], carry };
    if (!this.full(v)) return { task: 'rotina do lugar', why: 'o lugar está fora da tela: a produção corre no modo agregado', others: [], carry };
    if (!this.day[i] || !n) return { task: DAY_NAMES[DAY.none], why: 'nada urgente no quadro e nenhuma necessidade: fica pela praça', others: [], carry };
    const task = this.dayLeg[i] === 2 ? `${n.label}, levando a carga ao celeiro` : n.label;
    return { task, why: n.why, others: n.others.map((o) => `${o.label} (${f(o.score)})`), carry };
  },
};
export type JourneysPart = typeof journeysPart;
