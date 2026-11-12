/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): o chão das jornadas do modo completo (RF-AS-20 a 27): o pátio e o
 * celeiro, os lugares de cada coisa (posto do ofício, roças, praça, portão) e o passo pelas ruas. Quem decide o que
 * fazer é a mente de cada pessoa (people/mente.ts).
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { B } from '../../live';
import type { Good } from '../../economy';
import { ROLE } from '../../roles';
import { DAY } from '../../../IAUS/npc/aldeia/dia';
import { isStreet, TRAIL, WALL } from '../../architecture';
import { wrapDx } from '../../settlement';
import type { BuildingKind, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { THINK_INTERVAL, RAW } = constantsModule;
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


  /** No modo completo, quem produziu leva nas mãos o que acabou de ir para o pátio (caçador com a carne, lenhador com o feixe). */
  pickUp(this: Ecosystem, i: number, v: Village, good: Good | 'food', amount: number): void {
    if (amount <= 0 || !this.full(v) || !v.yard?.[good]) return;
    const n = Math.min(amount, v.yard[good] ?? 0);
    v.yard[good] = (v.yard[good] ?? 0) - n;
    if (this.carry[i] && CARGO_GOOD(this.carry[i]) !== good) this.dropDay(i, v);
    this.carry[i] = carryCode(good);
    this.carryAmt[i] += n;
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

};
export type JourneysPart = typeof journeysPart;
