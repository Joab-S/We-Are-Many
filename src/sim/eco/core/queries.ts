/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): consultas da interface: seleção, laços, família e atividade.
 * Os métodos vão para o protótipo da classe; `this` é o ecossistema inteiro.
 */

import type { Ecosystem } from '../../ecosystem';
import { temperatureAt } from '../../../procgen/surface';
import { CHILD, ROLE, ROLES } from '../../roles';
import { BOND } from '../../../IAUS/npc/relations';
import { wrapDx } from '../../settlement';
import { ecologyOf, HUNGRY, STARVING } from '../../fauna';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { ACT } = constantsModule;
const { elderAge } = helpersModule;

// Cópia da grade da simulação durante uma consulta da tela (reaproveitada entre as consultas).
let keptHead = new Int32Array(0);
let keptNext = new Int32Array(0);

/**
 * Roda uma consulta da tela sobre a grade refeita com as posições de agora e devolve a grade da simulação como
 * estava. A grade é estado da simulação: o passo a refaz no começo, mas o fogo do ano a lê antes disso, então uma
 * consulta entre dois passos (o mouse sobre o mapa, a cada quadro) mudava quem o fogo pega, e o mundo deixava de
 * ser o da semente mais o log de comandos.
 */
function withFreshGrid<T>(eco: Ecosystem, query: () => T): T {
  const head = eco.gridHead;
  const next = eco.gridNext;
  if (keptHead.length < head.length) keptHead = new Int32Array(head.length);
  if (keptNext.length < next.length) keptNext = new Int32Array(next.length);
  keptHead.set(head);
  keptNext.set(next);
  eco.buildGrid();
  try {
    return query();
  } finally {
    head.set(keptHead.subarray(0, head.length));
    next.set(keptNext.subarray(0, next.length));
  }
}

export const queriesPart = {
  /** Índice da criatura viva com esse `uid`, ou -1 (pelo índice uid -> índice, sem varrer a população). */
  findUid(this: Ecosystem, uid: number): number {
    const k = this.uidIndex.get(uid);
    return k !== undefined && this.alive[k] && this.uid[k] === uid ? k : -1;
  },

  /** Todas as criaturas a até `radius` de um ponto, da mais perto para a mais longe (RF-VIDA-331). */
  pickAll(this: Ecosystem, x: number, y: number, radius: number): number[] {
    const found: [number, number][] = [];
    withFreshGrid(this, () => this.forEachNear(x, y, radius, (i, dx, dy) => found.push([dx * dx + dy * dy, i])));
    return found.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(([, i]) => i);
  },

  /** Criaturas dentro de um retângulo do mapa (seleção de grupo, RF-VIDA-336). */
  pickRect(this: Ecosystem, x0: number, y0: number, x1: number, y1: number): number[] {
    const w = this.map.width;
    const out: number[] = [];
    const span = (((x1 - x0) % w) + w) % w || (x1 > x0 ? w : 0);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.y[i] < y0 || this.y[i] > y1) continue;
      if ((((this.x[i] - x0) % w) + w) % w <= span) out.push(i);
    }
    return out;
  },

  /** Pai ou mãe vivo e filhos vivos (ficha da criatura, RF-VIDA-335). */
  /** Laços de quem está vivo (IA local, relações): cônjuge, amigos do mais próximo ao menos, e rivais. */
  tiesOf(this: Ecosystem, i: number): { partner: number; friends: number[]; rivals: number[] } {
    const out = { partner: -1, friends: [] as number[], rivals: [] as number[] };
    const list = [...(this.bonds.get(this.uid[i]) ?? [])].sort((a, b) => b.value - a.value);
    for (const b of list) {
      const j = this.indexOfUid(b.uid);
      if (j < 0) continue;
      if (b.kind === BOND.partner) out.partner = j;
      else if (b.kind === BOND.friend) out.friends.push(j);
      else if (b.kind === BOND.rival) out.rivals.push(j);
    }
    return out;
  },

  familyOf(this: Ecosystem, i: number): { parent: number; children: number[] } {
    // O pai ou a mãe pelo índice uid -> índice; os filhos ainda pela varredura (só a ficha da criatura pergunta).
    const parent = this.parent[i] ? this.findUid(this.parent[i]) : -1;
    const children: number[] = [];
    const me = this.uid[i];
    for (let j = 0; j < this.count; j++) if (this.alive[j] && this.parent[j] === me) children.push(j);
    return { parent, children };
  },

  /**
   * Para onde vai quem vive sem assentamento (ficha, só leitura): o lugar do seu povo mais perto, a até 40
   * tiles, que é o que `loner` segue; -1 quando não há nenhum e ele procura outros solitários.
   */
  wanderGoal(this: Ecosystem, i: number): { village: number; distance: number } {
    const s = this.kind[i];
    let best = -1;
    let bd = 40;
    for (const v of this.villages) {
      if (v.abandoned || v.species !== s) continue;
      const d = this.distance(v, this.x[i], this.y[i]);
      if (d < bd) {
        bd = d;
        best = v.id;
      }
    }
    return { village: best, distance: best >= 0 ? bd : 0 };
  },

  /** O que um bicho de terra está fazendo e por quê (a ação que venceu na IAUS). */
  wildActivity(this: Ecosystem, i: number): string {
    const sp = this.species[this.kind[i]];
    const e = ecologyOf(sp);
    const moving = Math.hypot(this.vx[i], this.vy[i]) > 0.05;
    const hungry = this.energy[i] < STARVING ? ', com muita fome' : this.energy[i] < HUNGRY ? ', com fome' : '';
    const w = this.map.width;
    switch (this.act[i]) {
      case ACT.eat: {
        const t = this.tileAt(this.x[i], Math.floor(this.y[i]));
        const food = t >= 0 && e.fruit * this.browseAt(t) > e.forage * this.forageAt(t) ? 'comendo frutos e brotos' : e.forage >= Math.max(e.insects, e.fish, e.plankton) ? 'pastando' : e.insects >= Math.max(e.fish, e.plankton) ? 'caçando insetos' : 'comendo na beira da água';
        if (!moving) return food + hungry;
        const g = this.goal[i];
        if (g < 0) return `procurando comida${hungry}`;
        const d = Math.round(Math.hypot(wrapDx((g % w) + 0.5 - this.x[i], w), Math.floor(g / w) + 0.5 - this.y[i]));
        return `indo comer a ${d} tiles${hungry}`;
      }
      case ACT.hunt: {
        const j = this.prey(i);
        if (j >= 0) return `caçando ${this.species[this.kind[j]].name.toLowerCase()}${hungry}`;
        return `procurando caça${hungry}`;
      }
      case ACT.scavenge:
        return moving ? 'indo até uma carcaça' : 'comendo uma carcaça';
      case ACT.flee:
        return 'fugindo de um predador';
      case ACT.shelter:
        return temperatureAt(this.map, this.tileOf(i)) < (sp.tempMin + sp.tempMax) / 2 ? 'procurando um lugar mais quente' : 'procurando um lugar mais fresco';
      case ACT.mate:
        return 'procurando parceiro';
      case ACT.disperse:
        return 'mudando de território (aqui está lotado)';
      case ACT.herd:
        return e.pack ? 'andando com a matilha' : 'seguindo o bando';
      case ACT.hibernate:
        return 'hibernando';
      case ACT.drink:
        return 'indo beber água';
      default:
        return moving ? 'andando' : 'descansando';
    }
  },

  /** O que a criatura está fazendo agora, em poucas palavras (RF-VIDA-335). */
  activityOf(this: Ecosystem, i: number): string {
    const sp = this.species[this.kind[i]];
    const moving = Math.hypot(this.vx[i], this.vy[i]) > 0.05;
    const vi = this.village[i];
    if (this.wild(this.kind[i])) return this.wildActivity(i);
    if (sp.kind !== 'sapient') {
      const filter = ecologyOf(sp).guild === 'filtrador';
      if (filter) return moving ? 'filtrando plâncton' : 'descansando';
      if (this.energy[i] < 0.3) return sp.kind === 'shark' ? 'caçando, com fome' : 'procurando comida';
      let threat = false;
      if (sp.kind === 'fish') {
        this.forEachNear(this.x[i], this.y[i], 4, (j) => {
          if (this.species[this.kind[j]].kind === 'shark' && ecologyOf(this.species[this.kind[j]]).guild !== 'filtrador') threat = true;
        });
      }
      if (threat && moving) return 'fugindo de um tubarão';
      return moving ? 'nadando' : 'descansando';
    }
    if (vi < 0) return moving ? 'andando sem rumo' : 'descansando no mato';
    const v = this.villages[vi];
    if (this.expedition.has(i)) return 'em campanha de guerra';
    // No modo completo (lugar perto da tela ou aberto na ficha), o que a pessoa faz é a jornada que venceu na
    // IAUS (RF-AS-30); o texto pelo ofício abaixo vale para o modo agregado, onde não há jornada.
    if (this.full(v) && (this.day[i] || this.jobKind[i])) return this.dayOf(i).task;
    const role = ROLES[this.role[i]];
    const d = this.distance(v, this.x[i], this.y[i]);
    const inside = d <= this.footprint(v) + 1;
    const tile = this.tileOf(i);
    if (this.role[i] === CHILD) return moving ? 'brincando' : 'em casa';
    if (this.age[i] >= elderAge(sp, Math.floor(v.tech)) && this.role[i] < ROLE.leader) return 'descansando';
    if (this.energy[i] < 0.3) return 'procurando comida';
    const war = this.warOf(v.kingdom);
    switch (role) {
      case 'hunter':
        return inside ? (moving ? 'voltando da caça' : 'limpando a caça') : 'indo caçar';
      case 'gatherer':
        return inside ? 'separando o que colheu' : 'colhendo frutos e raízes';
      case 'farmer':
        return this.road[tile] === 4 ? 'trabalhando na roça' : moving ? 'indo para a roça' : 'guardando a colheita';
      case 'fisher':
        return inside ? 'voltando com peixe' : 'pescando na costa';
      case 'builder':
        return v.houses.some((h) => this.underWork(h)) ? 'construindo uma casa' : 'consertando casas';
      case 'woodcutter':
        return inside ? 'trazendo lenha' : 'cortando lenha';
      case 'miner':
        return v.mines.length ? 'trabalhando na mina' : 'procurando minério';
      case 'blacksmith':
        return 'trabalhando na forja';
      case 'soldier':
      case 'guard':
        return war ? 'de guarda, em guerra' : 'de guarda';
      case 'shepherd':
        return 'cuidando do rebanho';
      case 'horsekeeper':
        return 'cuidando dos cavalos';
      case 'weaver':
        return 'tecendo';
      case 'potter':
        return 'fazendo tijolos';
      case 'miller':
        return 'moendo grão';
      case 'merchant':
        return inside ? 'negociando na praça' : 'levando mercadoria';
      case 'priest':
        return 'no templo';
      case 'leader':
      case 'king':
        return war ? 'comandando a guerra' : 'cuidando do governo';
      default:
        return moving ? `andando por ${v.name}` : 'descansando';
    }
  },

  /** Índice da criatura mais próxima de um ponto, ou -1. */
  pick(this: Ecosystem, x: number, y: number, radius: number): number {
    let best = -1;
    let bd = Infinity;
    withFreshGrid(this, () =>
      this.forEachNear(x, y, radius, (i, dx, dy) => {
        const d = dx * dx + dy * dy;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }),
    );
    return best;
  },
};
export type QueriesPart = typeof queriesPart;
