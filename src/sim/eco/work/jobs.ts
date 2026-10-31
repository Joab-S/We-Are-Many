/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): ações presenciais (seção 19.21): reservas, ordens, obras e trabalho no lugar.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import * as B from '../../balance';
import { ROLE } from '../../roles';
import { wrapDx } from '../../settlement';
import type { Building, Village } from '../types';
import * as constantsModule from '../constants';
import * as tilesModule from '../tiles';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { YEAR_SECONDS, JOB } = constantsModule;
const { isLand } = tilesModule;

export const jobsPart = {
  // ---- Ações presenciais (seção 19.21) ----

  /** Alguém vivo reservou o tile (que não seja `i`) e ainda mira nele. */
  claimed(this: Ecosystem, t: number, i: number): boolean {
    const j = this.jobClaim.get(t);
    return j !== undefined && j !== i && this.alive[j] === 1 && this.jobKind[j] > 0 && this.job[j] === t;
  },

  claim(this: Ecosystem, i: number, t: number, kind: number): void {
    this.job[i] = t;
    this.jobKind[i] = kind;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
    this.jobClaim.set(t, i);
  },

  /** Larga a ordem e libera a reserva. */
  dropJob(this: Ecosystem, i: number): void {
    if (this.jobKind[i] && this.jobClaim.get(this.job[i]) === i) this.jobClaim.delete(this.job[i]);
    this.jobKind[i] = 0;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
  },

  /** A ordem ainda faz sentido: o alvo continua lá (ninguém cortou, plantou ou construiu por cima). */
  jobValid(this: Ecosystem, i: number): boolean {
    const t = this.job[i];
    if (this.jobKind[i] === JOB.fell) return this.standingTree(t);
    if (this.jobKind[i] === JOB.plant) return this.map.felled![t] === 1 && isLand(this.map, t) && !this.road[t] && !this.built[t];
    return false;
  },

  /** Árvore de pé livre mais perto do assentamento (a lista é refeita no máximo uma vez por ano). */
  freeTree(this: Ecosystem, v: Village, i: number): number {
    for (let pass = 0; pass < 2; pass++) {
      const list = v.treeList;
      if (list) {
        let k = v.treeNext ?? 0;
        while (k < list.length && !this.standingTree(list[k])) k++;
        v.treeNext = k;
        // Entre as primeiras árvores livres da lista, a que está mais perto de quem vai cortar (menos andar entre um corte e outro).
        let best = -1;
        let bd = Infinity;
        for (let seen = 0; k < list.length && seen < B.JOB_CHOICES; k++) {
          const t = list[k];
          if (!this.standingTree(t) || this.claimed(t, i) || (this.jobBlocked.get(t) ?? 0) > this.year) continue;
          seen++;
          const w = this.map.width;
          const d = Math.hypot(wrapDx((t % w) + 0.5 - this.x[i], w), Math.floor(t / w) + 0.5 - this.y[i]);
          if (d < bd) {
            bd = d;
            best = t;
          }
        }
        if (best >= 0) return best;
      }
      if (list && v.treeScan === Math.floor(this.year)) return -1;
      this.scanTrees(v);
    }
    return -1;
  },

  /** Toco ao alcance que ninguém está plantando. */
  freeStump(this: Ecosystem, v: Village, i: number): number {
    const reach = this.reachOf(v, B.WOOD_REACH);
    const w = this.map.width;
    let n = 0;
    for (const t of this.stumps) {
      if (++n > 6000) break;
      if (this.map.felled![t] !== 1 || this.road[t] || this.built[t] || this.claimed(t, i)) continue;
      if ((this.jobBlocked.get(t) ?? 0) > this.year) continue;
      if (this.distance(v, (t % w) + 0.5, Math.floor(t / w) + 0.5) > reach) continue;
      return t;
    }
    return -1;
  },

  /**
   * Ordem do lenhador (seção 19.21): mantém a que tem ou pega outra do quadro do assentamento.
   * Planta uma muda quando as árvores cortadas deixaram mudas a plantar (ou não há o que cortar);
   * derruba quando há lugar no armazém. Devolve o tile da ordem, ou -1 sem ordem.
   */
  pickJob(this: Ecosystem, i: number, v: Village): number {
    if (this.jobKind[i] && !this.jobValid(i)) this.dropJob(i);
    if (!this.jobKind[i]) {
      let t = -1;
      let kind: number = JOB.fell;
      if (v.forestry && (v.plantDue ?? 0) >= 1) {
        t = this.freeStump(v, i);
        kind = JOB.plant;
      }
      if (t < 0 && v.stock.wood + this.woodPerTree(v) <= this.capOf(v, 'wood')) {
        t = this.freeTree(v, i);
        kind = JOB.fell;
      }
      if (t < 0 && v.forestry && kind !== JOB.plant) {
        t = this.freeStump(v, i);
        kind = JOB.plant;
      }
      if (t >= 0) this.claim(i, t, kind);
    }
    return this.jobKind[i] ? this.job[i] : -1;
  },

  /** Madeira de uma árvore derrubada (a serraria aproveita mais de cada tronco). */
  woodPerTree(this: Ecosystem, v: Village): number {
    return B.WOOD_PER_TREE * (this.has(v, 'sawmill') ? 1.3 : 1);
  },

  /** Velocidade do gesto: ferramenta e vocação aceleram; mata longe do assentamento atrasa (carregar). */
  jobSpeed(this: Ecosystem, v: Village, t: number, kind: number): number {
    let k = (v.stock.tools > 0 ? B.TOOL_SPEED : 1) * (v.vocation === 'madeireira' ? 1 + B.VOCATION_BONUS : 1);
    if (kind === JOB.fell) k *= this.haulFactor(v, t);
    return k;
  },

  /** Vetor do indivíduo até o ponto de trabalho da ordem: o centro do tile, ou da casa (2x2) numa obra. */
  jobDelta(this: Ecosystem, i: number): [number, number] {
    const w = this.map.width;
    const t = this.job[i];
    const off = this.jobKind[i] === JOB.build ? 1 : 0.5;
    return [wrapDx((t % w) + off - this.x[i], w), Math.floor(t / w) + off - this.y[i]];
  },

  /** A ordem em andamento ainda combina com a profissão e a idade de quem a faz. */
  jobFits(this: Ecosystem, i: number, v: Village, role: number, working: boolean): boolean {
    if (!working) return false;
    return this.jobKind[i] === JOB.build ? this.canBuildHere(v, role) : role === ROLE.woodcutter;
  },

  /** Quem constrói: os construtores e, quando o assentamento não tem nenhum, coletores e o líder (todo mundo ajuda a levantar o primeiro abrigo). */
  canBuildHere(this: Ecosystem, v: Village, role: number): boolean {
    return role === ROLE.builder || ((v.crew ?? 1) === 0 && (role === ROLE.gatherer || role === ROLE.leader));
  },

  /** Obra ainda em andamento (também a dos saves de antes, que contavam em anos). */
  underWork(this: Ecosystem, h: Building): boolean {
    return (h.labor ?? 0) > 0 || (h.workUntil ?? 0) > this.year;
  },

  /** Abre uma obra: `years` de trabalho de um construtor (um ano de jogo = `YEAR_SECONDS` segundos de trabalho). */
  startWork(this: Ecosystem, h: Building, years: number, site: boolean): void {
    if (!B.PRESENCE_BUILD) {
      h.workUntil = this.year + years;
      return;
    }
    h.labor = h.laborMax = years * YEAR_SECONDS * B.BUILD_LABOR;
    h.site = site || undefined;
    h.workUntil = undefined;
  },

  /** A obra que o indivíduo atende, pelo tile da casa. */
  siteFor(this: Ecosystem, i: number, v: Village): Building | undefined {
    const w = this.map.width;
    const t = this.job[i];
    let b = this.siteCache.get(i);
    if (!b || b.x + b.y * w !== t) {
      b = v.houses.find((h) => h.x + h.y * w === t);
      if (b) this.siteCache.set(i, b);
      else this.siteCache.delete(i);
    }
    return b;
  },

  /** Mantém a obra que tem ou pega a mais perto com vaga (`JOB_SLOTS_BUILD`). Devolve se há obra para ir. */
  pickBuildJob(this: Ecosystem, i: number, v: Village): boolean {
    if (this.jobKind[i] === JOB.build) {
      const b = this.siteFor(i, v);
      if (b && (b.labor ?? 0) > 0 && v.houses.includes(b)) return true;
      this.dropJob(i);
    } else if (this.jobKind[i]) this.dropJob(i);
    const w = this.map.width;
    let best: Building | null = null;
    let bd = Infinity;
    for (const h of v.houses) {
      if ((h.labor ?? 0) <= 0 || (h.crew ?? 0) >= B.JOB_SLOTS_BUILD) continue;
      const d = Math.hypot(wrapDx(h.x + 1 - this.x[i], w), h.y + 1 - this.y[i]);
      if (d < bd) {
        bd = d;
        best = h;
      }
    }
    if (!best) return false;
    best.crew = (best.crew ?? 0) + 1;
    this.job[i] = best.x + best.y * w;
    this.jobKind[i] = JOB.build;
    this.jobWork[i] = 0;
    this.jobWait[i] = 0;
    this.siteCache.set(i, best);
    return true;
  },

  /** Bate na obra: com o indivíduo ao pé da casa, o trabalho que falta cai a cada segundo; zerado, a casa está pronta. */
  workBuild(this: Ecosystem, i: number, v: Village, dt: number): void {
    const b = this.siteFor(i, v);
    if (!b || (b.labor ?? 0) <= 0 || !this.canBuildHere(v, this.role[i])) {
      this.dropJob(i);
      return;
    }
    const [dx, dy] = this.jobDelta(i);
    if (dx * dx + dy * dy > B.BUILD_REACH * B.BUILD_REACH) {
      if ((this.jobWait[i] += dt) > B.JOB_TIMEOUT) this.dropJob(i);
      return;
    }
    this.jobWait[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    b.labor = Math.max(0, b.labor! - dt * (v.stock.tools > 0 ? B.TOOL_SPEED : 1));
    if (b.labor > 0) return;
    b.site = undefined;
    this.dropJob(i);
  },

  /** Quantos trabalham em cada obra agora (revisto a cada segundo, para quem morreu ou mudou de ofício sair da conta). */
  recountCrews(this: Ecosystem): void {
    for (const v of this.villages) for (const h of v.houses) h.crew = 0;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.jobKind[i] !== JOB.build || this.village[i] < 0) continue;
      const b = this.siteFor(i, this.villages[this.village[i]]);
      if (b) b.crew = (b.crew ?? 0) + 1;
    }
  },

  /** Anda reto até o ponto (dx, dy) relativo ao indivíduo, sem o vaivém do passeio. */
  walkTo(this: Ecosystem, i: number, speed: number, dx: number, dy: number): void {
    const len = Math.hypot(dx, dy) || 1;
    this.aimX[i] = dx;
    this.aimY[i] = dy;
    this.vx[i] = (dx / len) * speed;
    this.vy[i] = (dy / len) * speed;
  },

  stand(this: Ecosystem, i: number): void {
    this.aimX[i] = 0;
    this.aimY[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
  },

  /**
   * Trabalho de um indivíduo com ordem, a cada passo: só conta com ele no tile (a até `JOB_REACH`);
   * ao completar o gesto o mundo muda e o produto vai ao estoque (nunca passa do teto do armazém).
   */
  workJob(this: Ecosystem, i: number, dt: number): void {
    const vi = this.village[i];
    const v = vi >= 0 ? this.villages[vi] : null;
    if (!v || v.abandoned) {
      this.dropJob(i);
      return;
    }
    if (this.jobKind[i] === JOB.build) {
      this.workBuild(i, v, dt);
      return;
    }
    if (this.role[i] !== ROLE.woodcutter || !this.jobValid(i)) {
      this.dropJob(i);
      return;
    }
    const t = this.job[i];
    const [dx, dy] = this.jobDelta(i);
    if (dx * dx + dy * dy > B.JOB_REACH * B.JOB_REACH) {
      // Não chegou: depois de muito andar à toa o tile sai do quadro por uns anos (água no caminho, por exemplo).
      if ((this.jobWait[i] += dt) > B.JOB_TIMEOUT) {
        this.jobBlocked.set(t, this.year + B.JOB_BLOCK_YEARS);
        this.dropJob(i);
      }
      return;
    }
    this.jobWait[i] = 0;
    this.vx[i] = 0;
    this.vy[i] = 0;
    const kind = this.jobKind[i];
    this.jobWork[i] += dt * this.jobSpeed(v, t, kind);
    if (kind === JOB.fell) {
      if (this.jobWork[i] < B.FELL_SECONDS * (v.forestry ? 1 + B.REPLANT_WORK : 1)) return;
      const per = this.woodPerTree(v);
      // Sem lugar no armazém a árvore fica de pé: o gesto espera pronto.
      if (v.stock.wood + per > this.capOf(v, 'wood')) return;
      this.fellTree(t, !!v.forestry);
      this.pickUp(i, v, 'wood', this.put(v, 'wood', per));
      this.book(v, '_trees', 1, 0);
      if (v.forestry) v.plantDue = (v.plantDue ?? 0) + B.PLANT_PER_FELL;
    } else {
      if (this.jobWork[i] < B.PLANT_SECONDS) return;
      this.map.felled![t] = 3;
      this.treesPlanted++;
      v.plantDue = Math.max(0, (v.plantDue ?? 0) - 1);
      this.onTileChanged(t);
    }
    this.dropJob(i);
  },
};
export type JobsPart = typeof jobsPart;
