/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): a mente das pessoas nos lugares perto da tela (o modo
 * completo, RF-AS-31). Cada pessoa tem um cérebro do IAUS (src/IAUS/brain.ts) com os pacotes da aldeia
 * (src/IAUS/npc/aldeia/pacotes.ts); este arquivo é o resto do contrato com o motor:
 *
 * - **Percepção** (`perceber`): o que a pessoa conhece neste instante, como alvos do IAUS (o celeiro, a casa,
 *   a praça, o templo, o posto do ofício, as roças, as pilhas do pátio, as obras, uma árvore livre, a caça
 *   perto, as pessoas perto, o portão), cada um com os stats que as considerações leem.
 * - **Corpo** (`agir`): o que cada Behavior Type faz no mundo, passo a passo, até dizer `feito` ou `falhou`.
 *   Toda ação tem um alvo, anda até ele e termina; só então a pessoa pensa de novo (e, no meio, só troca se
 *   algo valer bem mais, pelo momentum).
 * - **Trabalho feito** (`effectiveWorkers`): a produção do lugar na tela conta o trabalho que as pessoas
 *   fizeram, não quantas têm cada ofício. Quem não vai ao posto não produz.
 *
 * Nada aqui escolhe pela pessoa. Fora da tela, o lugar roda o modo agregado (decide.ts), por desempenho.
 */

import { AiEntity, type World } from '../../../IAUS/aiEntity';
import { Brain } from '../../../IAUS/brain';
import type { ContextInfo } from '../../../IAUS/context';
import type { Decision } from '../../../IAUS/context';
import { SelectionMode } from '../../../IAUS/enums';
import { Pessoa, type Resultado } from '../../../IAUS/npc/pessoa';
import { CEREBRO_DA_ALDEIA } from '../../../IAUS/npc/aldeia/pacotes';
import { DAY, DAY_NAMES, type DayKind } from '../../../IAUS/npc/aldeia/dia';
import { TRAITS, TRAIT_COUNT } from '../../../IAUS/npc/pessoa/traits';
import { bondWith, touch } from '../../../IAUS/npc/pessoa/relations';
import { WOT } from '../../../IAUS/npc/vocab';
import type { DayNote, Ecosystem } from '../../ecosystem';
import { B } from '../../live';
import type { Good } from '../../economy';
import { CHILD, ROLE, ROLES } from '../../roles';
import { wrapDx } from '../../settlement';
import { ecologyOf } from '../../fauna';
import type { Building, Village } from '../types';
import * as constantsModule from '../constants';
import * as helpersModule from '../helpers';

// Cópias locais dos valores de eco/* (o porquê está em ecosystem.ts).
const { GESTURE, GESTURE_OF, JOB } = constantsModule;
const { carryCode, CARGO_GOOD } = helpersModule;

/** Ajustes da mente da aldeia (segundos de simulação; um ano de ação são 6 s). */
export const MIND = {
  /** Intervalo entre pensamentos com uma ação em andamento (o momentum segura a ação; isto só olha em volta). */
  think: 1,
  /** Turno no posto, na roça ou na obra antes de pensar de novo. */
  shift: 3,
  /** Tempo de uma conversa, de uma reza, de ficar à toa. */
  short: 2.5,
  /** Cada porção comida no celeiro. */
  bite: 0.6,
  /** Descanso por segundo de sono (o cansaço vai de 1 a 0 em uns 3 s). */
  sleep: 0.35,
  /** Andando sem chegar mais perto do destino por tanto tempo, a ação falha (o caminho não leva lá). */
  stall: 15,
  /** E andando por tanto tempo, mesmo chegando mais perto, também (o destino está longe demais). */
  walkTimeout: 180,
  /** Fração do tempo que um trabalhador saudável passa trabalhando (o resto é comer, dormir, conviver e andar). */
  laborNorm: 0.45,
  /** Segundos para a produção acompanhar o trabalho feito (média móvel). */
  laborTau: 6,
  /** Alcance da percepção de pessoas e caça (tiles). */
  sight: 12,
  /** Até onde o caçador procura presa (ele sabe por onde a caça anda). */
  huntSight: 24,
  /**
   * Ritmo do corpo na tela. A tela mostra gente andando a passo de gente (uns 8 tiles por ano), e no ritmo do
   * modo agregado ela comeria a cada 8 s, quando atravessar a aldeia leva 30: viveria indo comer. Na tela, o corpo
   * vive `pace` vezes mais devagar (fome, cansaço, solidão e fé sobem `pace` vezes menos) e cada bocado vale `pace`
   * porções: o lugar come o mesmo por ano que no modo agregado, e a pessoa come umas poucas vezes por minuto de tela.
   */
  pace: 25,
  /**
   * Quantas cargas do modo agregado cabem numa carga na tela: uma ida ao celeiro leva anos do mundo, então cada
   * uma leva o que o lugar produziu nesse tempo.
   */
  load: 4,
};

/** Um alvo percebido: o AiEntity do IAUS mais o que o corpo precisa para agir sobre ele. */
class Alvo extends AiEntity {
  tile = -1;
  /** Índice da pessoa ou do bicho (pessoa, animal). */
  j = -1;
  good: Good | 'food' | null = null;
  house: Building | null = null;
}

interface Mente {
  uid: number;
  i: number;
  seed: number;
  pessoa: Pessoa;
  brain: Brain;
  /** Para onde andar (tile do centro), com o alcance em que já conta como chegou; null = parado. */
  goal: { x: number; y: number; reach: number } | null;
  /** Ação em curso (o contexto da decisão) e quanto tempo dela: no lugar, andando, e o passo interno. */
  ctx: ContextInfo | null;
  /** Caminho a pé até o destino (caminho.ts): tiles, o destino dele e há quanto tempo foi achado. */
  path: number[] | null;
  pathGoal: number;
  pathAge: number;
  /** Onde acaba o caminho quando o destino não dá pé (o posto na água): chegar ali conta como chegar. -1 = não há. */
  edge: number;
  /** A menor distância ao destino nesta ação e há quanto tempo ela não melhora (quem não chega mais perto desiste). */
  best: number;
  stall: number;
  at: number;
  walked: number;
  tick: number;
  did: number;
}

/** Como terminaram as ações, por nome do comportamento (para a sonda e o painel de depuração). */
export interface MindTally {
  started: Record<string, number>;
  done: Record<string, number>;
  failed: Record<string, number>;
  /** Trocadas no meio por outra que valia mais. */
  switched: Record<string, number>;
  /** Trocas no meio, por par "de → para". */
  pairs: Record<string, number>;
}

interface Aldeia {
  minds: Map<number, Mente>;
  tally: MindTally;
  /** Segundos de trabalho por ofício desde a última conta da produção, por lugar. */
  labor: Map<number, Float64Array>;
  /** Trabalhadores efetivos por ofício (média móvel), por lugar. */
  effective: Map<number, Float64Array>;
}

/** Estado fora do Ecosystem: o save lê a instância por reflexão, e cérebros não vão para o save (recomeçam ao carregar). */
const STATE = new WeakMap<Ecosystem, Aldeia>();
function stateOf(eco: Ecosystem): Aldeia {
  let s = STATE.get(eco);
  if (!s) STATE.set(eco, (s = { minds: new Map(), tally: { started: {}, done: {}, failed: {}, switched: {}, pairs: {} }, labor: new Map(), effective: new Map() }));
  return s;
}

/** Ids dos alvos por tipo, para a mesma coisa ter a mesma chave de decisão de um pensamento ao outro (o momentum). */
const ID = { celeiro: 1, casa: 2, praca: 3, templo: 4, posto: 5, roca: 6, carga: 7, obra: 8, arvore: 9, portao: 10, evento: 11 } as const;
const idOf = (kind: number, n: number) => -(kind * 100_000_000 + n);

/** Atividade (DAY) de cada Behavior Type, para a tela e as contas do dia. */
const ACTIVITY: Record<string, DayKind> = {
  Comer: DAY.eat,
  Coletar: DAY.eat,
  Dormir: DAY.rest,
  Abrigar: DAY.shelter,
  Trabalhar: DAY.work,
  Colher: DAY.harvest,
  PegarCarga: DAY.haul,
  Entregar: DAY.haul,
  Construir: DAY.build,
  CortarLenha: DAY.work,
  Cacar: DAY.work,
  Defender: DAY.militia,
  Patrulhar: DAY.work,
  Conversar: DAY.social,
  Passear: DAY.social,
  Rezar: DAY.pray,
  Festejar: DAY.festival,
  IrParaCasa: DAY.none,
  Brincar: DAY.social,
  Seguir: DAY.social,
};
/** Ações que são trabalho (para a conta de quem está ocupado). */
const WORK = new Set(['Trabalhar', 'Colher', 'PegarCarga', 'Entregar', 'Construir', 'CortarLenha', 'Cacar', 'Defender', 'Patrulhar']);

export const mindPart = {
  /**
   * Um passo da pessoa `i` com mente (modo completo): atualiza o que ela sente, deixa o cérebro pensar e agir,
   * e devolve para onde andar (null = fica parada onde está).
   */
  mindStep(this: Ecosystem, i: number, v: Village, working: boolean, dt: number): { x: number; y: number } | null {
    const slow = dt / MIND.pace;
    this.needRest[i] = Math.min(1, this.needRest[i] + B.NEED_REST * slow * (working ? 1 : 0.6));
    this.needSocial[i] = Math.min(1, this.needSocial[i] + B.NEED_SOCIAL * slow);
    this.needFaith[i] = Math.min(1, this.needFaith[i] + B.NEED_FAITH * slow);
    const m = this.mindOf(i, working);
    this.feel(m, v, working);
    m.brain.update(dt);
    const busy = m.brain.currentDecision;
    if (!busy) {
      m.goal = null;
      this.gesture[i] = this.carry[i] ? GESTURE.carry : GESTURE.none;
      this.day[i] = DAY.none;
    }
    // Uma árvore reservada sem a ação de cortar (a ação foi trocada no meio): solta a reserva.
    if (this.jobKind[i] && busy?.context.behavior.behaviorType !== 'CortarLenha') this.dropJob(i);
    const type = busy?.context.behavior.behaviorType ?? '';
    this.sampleDay(i, v, working, WORK.has(type) || this.carry[i] > 0, !busy || type === 'IrParaCasa');
    if (!m.goal) return null;
    const w = this.map.width;
    const dx = wrapDx(m.goal.x - this.x[i], w);
    const dy = m.goal.y - this.y[i];
    if (dx * dx + dy * dy <= m.goal.reach * m.goal.reach) return null;
    // Perto, em linha reta; longe, pelo caminho (refeito quando o destino muda, no máximo a cada 1,5 s).
    if (dx * dx + dy * dy < 9) return { x: dx, y: dy };
    const goal = this.tileAt(m.goal.x, Math.floor(m.goal.y));
    m.pathAge += dt;
    // Refaz o caminho quando o destino mudou, ou quando a pessoa saiu dele (o primeiro passo não fica mais ao lado).
    const here = this.tileOf(i);
    const off = (t: number) => Math.max(Math.abs(wrapDx((t % w) - (here % w), w)), Math.abs(Math.floor(t / w) - Math.floor(here / w))) > 1;
    const lost = !!m.path && m.path.length > 0 && !m.path.includes(here) && off(m.path[0]);
    if ((goal !== m.pathGoal || lost) && (m.pathAge > 1.5 || !m.path)) {
      m.path = this.findPath(i, goal);
      m.pathGoal = goal;
      m.pathAge = 0;
      const last = m.path?.length ? m.path[m.path.length - 1] : this.tileOf(i);
      m.edge = last !== goal ? last : -1;
    }
    const path = m.path;
    if (!path) return null;
    const k = path.indexOf(here);
    if (k >= 0) path.splice(0, k + 1);
    if (!path.length) return { x: dx, y: dy };
    const t = path[0];
    return { x: wrapDx((t % w) + 0.5 - this.x[i], w), y: Math.floor(t / w) + 0.5 - this.y[i] };
  },

  /** A mente da pessoa: cria na primeira vez e troca o cérebro quando a fase da vida muda. */
  mindOf(this: Ecosystem, i: number, working: boolean): Mente {
    const s = stateOf(this);
    const uid = this.uid[i];
    const seed = this.role[i] === CHILD ? CEREBRO_DA_ALDEIA.crianca : working ? CEREBRO_DA_ALDEIA.adulto : CEREBRO_DA_ALDEIA.idoso;
    let m = s.minds.get(uid);
    if (m && m.seed === seed) {
      m.i = i;
      return m;
    }
    const pessoa = new Pessoa({ id: uid, name: String(uid), position: { x: this.x[i], y: this.y[i] } });
    const eco = this;
    const world: World = { now: () => eco.year * eco.yearSpan, entities: () => [], getEntity: () => undefined };
    const brain = Brain.fromSeed(seed, pessoa, world, {
      thinkInterval: MIND.think,
      thinkJitter: 0.25,
      idleThinkInterval: 0.01,
      rng: { next: () => eco.mindRnd() },
      selection: { mode: SelectionMode.WeightedRandomTop, withinFractionOfBest: 0.85, topN: 3, stickWhenBest: true },
      perceive: () => eco.perceive(m!),
    });
    m = { uid, i, seed, pessoa, brain, goal: null, ctx: null, path: null, pathGoal: -1, pathAge: 0, edge: -1, best: Infinity, stall: 0, at: 0, walked: 0, tick: 0, did: 0 };
    const mind = m;
    const tally = s.tally;
    const bump = (r: Record<string, number>, k: string) => (r[k] = (r[k] ?? 0) + 1);
    let open: string | null = null;
    pessoa.corpo = {
      agir: (acao, ctx, dt) => {
        const r = eco.mindAct(mind, acao, ctx, dt);
        if (r !== 'continua') {
          bump(r === 'feito' ? tally.done : tally.failed, ctx.behavior.name);
          open = null;
        }
        return r;
      },
    };
    brain.onDecisionChanged = (_b, from, to) => {
      if (open && from) {
        bump(tally.switched, open);
        bump(tally.pairs, `${open} → ${to.context.behavior.name}`);
      }
      open = to.context.behavior.name;
      bump(tally.started, open);
      eco.noteDecision(mind, to);
    };
    s.minds.set(uid, m);
    return m;
  },

  /** O que a pessoa sente agora (os stats `eu` das considerações). */
  feel(this: Ecosystem, m: Mente, v: Village, working: boolean): void {
    const i = m.i;
    const p = m.pessoa;
    p.position = { x: this.x[i], y: this.y[i] };
    p.setStat('fome', Math.max(0, Math.min(1, (0.85 - this.energy[i]) / 0.6)));
    p.setStat('cansaco', this.needRest[i]);
    p.setStat('solidao', this.needSocial[i]);
    p.setStat('fe', this.needFaith[i]);
    // A carga na mão: `carga` (tem alguma), `cheio` (quanto pesa para levar já: comida e o que não se junta contam
    // cheio; a lenha, o quanto encheu) e `espacoLenha` (quanto cabe de lenha ainda: o lenhador corta mais de uma
    // árvore antes de ir ao celeiro).
    const g = this.carry[i] && this.carryAmt[i] > 0 ? CARGO_GOOD(this.carry[i]) : null;
    const fill = g ? Math.min(1, this.carryAmt[i] / this.loadCap(v)) : 0;
    p.setStat('carga', g ? 1 : 0);
    p.setStat('cheio', !g ? 0 : g === 'wood' ? fill : 1);
    p.setStat('espacoLenha', !g ? 1 : g === 'wood' ? 1 - fill : 0);
    p.setStat('trabalha', working ? 1 : 0);
    p.setStat('semCasa', this.homeTile(i, v) < 0 ? 1 : 0);
    p.setStat('semComida', 1 - this.foodHere(v));
    p.setStat('alarme', (v.alarmUntil ?? -1) > this.year ? 1 : 0);
    p.setStat('enterro', v.funeral && v.funeral.until > this.year && this.family[i] === v.funeral.family ? 1 : 0);
    for (let k = 0; k < TRAIT_COUNT; k++) p.setStat(`tr.${TRAITS[k]}`, this.traits[i * TRAIT_COUNT + k] / 10);
  },

  /** Casa da pessoa (tile do centro), ou -1: a da família, ou uma casa do lugar escolhida pela família. */
  homeTile(this: Ecosystem, i: number, v: Village): number {
    if (this.home[i] >= 0) return this.home[i];
    let n = 0;
    for (const h of v.houses) if (h.kind === 'house' && !h.site) n++;
    if (!n) return -1;
    let k = this.family[i] % n;
    for (const h of v.houses) {
      if (h.kind !== 'house' || h.site) continue;
      if (k-- === 0) return this.tileAt(h.x, h.y);
    }
    return -1;
  },

  /** Quanto o lugar precisa de um bem (0 a 1), pelo atendimento das necessidades e pelo estoque. */
  lack(this: Ecosystem, v: Village, good: Good | 'food' | null): number {
    if (!good) return 0.5;
    const n = v.needs;
    if (good === 'food') return n ? 1 - n.food : v.food < v.population ? 1 : 0.3;
    const cap = Math.max(1, this.capOf(v, good));
    const have = v.stock[good as Good] ?? 0;
    const short = 1 - Math.min(1, have / (cap * 0.6));
    if (good === 'wood' && n) return Math.max(short, 1 - n.fuel);
    if (good === 'stone' && n) return Math.max(short * 0.8, 1 - n.material);
    return short;
  },

  /** O que a pessoa conhece agora, como alvos do IAUS. */
  perceive(this: Ecosystem, m: Mente): AiEntity[] {
    const i = m.i;
    const vi = this.village[i];
    const v = vi >= 0 ? this.villages[vi] : null;
    if (!v) return [];
    const w = this.map.width;
    const out: AiEntity[] = [];
    const x0 = this.x[i];
    const at = (t: number, off = 0.5) => ({ x: x0 + wrapDx((t % w) + off - x0, w), y: Math.floor(t / w) + off });
    const add = (kind: number, n: number, type: string, t: number, stats: Record<string, number>, off = 0.5): Alvo => {
      const a = new Alvo({ id: idOf(kind, n), name: type, type, position: at(t, off), stats });
      a.tile = t;
      out.push(a);
      return a;
    };
    const role = this.role[i];
    const working = m.seed === CEREBRO_DA_ALDEIA.adulto;
    const alarm = (v.alarmUntil ?? -1) > this.year;
    const plaza = this.plazaTile(v);
    add(ID.celeiro, v.id, WOT.celeiro, this.granaryTile(v), { comida: this.foodHere(v) });
    const home = this.homeTile(i, v);
    if (home >= 0) add(ID.casa, home, WOT.casa, home, { comida: this.foodHere(v) }, 1);
    let crowd = 0;
    this.forEachNear((plaza % w) + 0.5, Math.floor(plaza / w) + 0.5, 3, (j) => {
      if (this.village[j] === v.id) crowd++;
    });
    // Um evento na praça só conta se dá tempo de chegar antes de ele acabar (a pessoa sabe o próprio passo).
    const pace = this.species[this.kind[i]].speed * B.WALK_PACE;
    const far = Math.hypot(wrapDx((plaza % w) + 0.5 - x0, w), Math.floor(plaza / w) + 0.5 - this.y[i]);
    const distTo = (t: number) => Math.hypot(wrapDx((t % w) + 0.5 - x0, w), Math.floor(t / w) + 0.5 - this.y[i]);
    const inTime = (until: number | undefined, d = far) => ((until ?? -1) - this.year) * this.yearSpan * pace + 3 >= d ? 1 : 0;
    add(ID.praca, v.id, WOT.praca, plaza, { gente: Math.min(1, crowd / 4), festa: inTime(v.festivalUntil), caravana: inTime(v.curiousUntil) });
    const temple = v.houses.find((h) => h.kind === 'temple' && !h.site);
    if (temple) add(ID.templo, v.id, WOT.templo, this.tileAt(temple.x, temple.y), {}, 1);
    if (v.funeral && this.family[i] === v.funeral.family && inTime(v.funeral.until, distTo(v.funeral.tile))) add(ID.evento, v.id, WOT.evento, v.funeral.tile, {});
    if (alarm || role === ROLE.guard || role === ROLE.soldier) add(ID.portao, v.id, WOT.portao, this.gateTile(v), { oficio: role === ROLE.guard || role === ROLE.soldier ? 1 : 0 });
    if (working) {
      // O posto do ofício: o que sai dali e quanto o lugar precisa disso.
      if (role !== ROLE.woodcutter && role !== ROLE.builder && role !== ROLE.hunter && role !== ROLE.guard && role !== ROLE.soldier) {
        const post = this.workplace(i, v, role);
        if (post >= 0) add(ID.posto, post, WOT.posto, post, { falta: this.lack(v, this.yieldOf(role)) });
      }
      // Roças: as três mais perto. Na tela o ano passa em segundos (uma estação dura menos que uma ida à roça),
      // então a safra não pode ligar e desligar com a estação: a roça tem o que fazer o ano todo, e no inverno
      // menos (o momentum segura quem já está lá).
      const ripe = this.season() === 3 ? 0.6 : 1;
      const foodLack = this.lack(v, 'food');
      const fields = this.fieldTiles(v);
      const near = fields
        .map((t) => ({ t, d: Math.abs(wrapDx((t % w) + 0.5 - x0, w)) + Math.abs(Math.floor(t / w) + 0.5 - this.y[i]) }))
        .sort((a, b) => a.d - b.d || a.t - b.t)
        .slice(0, 3);
      for (const f of near) add(ID.roca, f.t, WOT.roca, f.t, { safra: ripe, oficio: role === ROLE.farmer ? 1 : 0.3 + 0.5 * foodLack, falta: foodLack });
      // Pilhas no pátio: comida junto das roças, o resto na praça. A lenha não: quem corta já leva na mão (o que
      // sobra no pátio é de passagem, e quem fosse buscar na praça não acharia nada lá).
      for (const g of Object.keys(v.yard ?? {}) as (Good | 'food')[]) {
        const n = v.yard![g] ?? 0;
        if (n < 0.5 || !carryCode(g) || g === 'wood') continue;
        const t = g === 'food' && fields.length ? fields[0] : plaza;
        const a = add(ID.carga, carryCode(g), WOT.carga, t, { quantidade: Math.min(1, n / (B.CARRY_LOAD * MIND.load)), falta: this.lack(v, g) });
        a.good = g;
      }
      // Obras abertas: o construtor sempre; os outros na obra grande ou quando o lugar não tem construtor.
      const crew = this.crewBySite(v);
      for (const h of v.houses) {
        if ((h.labor ?? 0) <= 0) continue;
        const big = h.kind !== 'house' || (v.crew ?? 1) === 0;
        const t = this.tileAt(h.x, h.y);
        const slots = B.JOB_SLOTS_BUILD + (big ? 3 : 0);
        const a = add(ID.obra, t, WOT.obra, t, { oficio: role === ROLE.builder ? 1 : big ? 0.7 : 0.12, vaga: (crew.get(h) ?? 0) < slots || m.ctx?.target?.id === idOf(ID.obra, t) ? 1 : 0, urgente: big ? 1 : 0 }, 1);
        a.house = h;
      }
      // Lenha: o lenhador vê a árvore livre mais perto (ou a que já reservou).
      if (role === ROLE.woodcutter) {
        const t = this.jobKind[i] === JOB.fell ? this.job[i] : this.freeTree(v, i);
        if (t >= 0) add(ID.arvore, t, WOT.arvore, t, { falta: this.lack(v, 'wood'), cabe: v.stock.wood + this.woodPerTree(v) <= this.capOf(v, 'wood') ? 1 : 0 });
      }
    }
    // Pessoas e bichos por perto.
    const hunter = working && role === ROLE.hunter;
    const hungry = working && v.food < 1 && this.energy[i] < 0.45;
    const c = this.cells?.ready ? this.cells : null;
    let people = 0;
    let prey = 0;
    // O caçador conhece o território de caça: procura a presa mais longe que a vista comum.
    this.forEachNear(x0, this.y[i], hunter ? MIND.huntSight : MIND.sight, (j, dx, dy) => {
      if (j === i) return;
      const sp = this.species[this.kind[j]];
      if (sp.kind === 'sapient') {
        if (dx * dx + dy * dy > MIND.sight * MIND.sight) return;
        if (this.village[j] !== v.id || people >= 5) return;
        people++;
        const bond = bondWith(this.bonds, this.uid[i], this.uid[j]);
        const parent = this.uid[j] === this.parent[i] ? 1 : 0;
        const busy = this.carry[j] > 0 || this.gesture[j] === GESTURE.rest || WORK_GESTURES.has(this.gesture[j]);
        const a = new Alvo({ id: this.uid[j], name: 'pessoa', type: WOT.pessoa, position: { x: x0 + dx, y: this.y[i] + dy }, stats: { laco: ((bond?.value ?? 0) + 100) / 200, livre: busy ? 0 : 1, parente: parent } });
        a.j = j;
        out.push(a);
      } else if ((hunter || hungry) && sp.kind === 'herbivore' && prey < 3) {
        const ok = c ? this.crowding(c, c.of(this.x[j], this.y[j], w), this.kind[j], ecologyOf(sp).herd) > 0.5 : this.population[this.kind[j]] > this.caps[this.kind[j]] * 0.25;
        prey++;
        const a = new Alvo({ id: this.uid[j], name: 'animal', type: WOT.animal, position: { x: x0 + dx, y: this.y[i] + dy }, stats: { oficio: hunter ? 1 : 0.8, abundante: ok ? 1 : 0 } });
        a.j = j;
        out.push(a);
      }
    });
    // O alvo da ação em andamento continua conhecido mesmo que saia da lista dos mais perto: sem isso, a
    // pessoa largaria a roça ou a presa só porque outra ficou um passo mais perto (o momentum precisa da mesma chave).
    const cur = m.brain?.currentDecision?.context.target;
    if (cur instanceof Alvo && !out.some((e) => e.id === cur.id) && (cur.type !== WOT.arvore || this.standingTree(cur.tile))) {
      const j = cur.j;
      if (j < 0 || (this.alive[j] && this.uid[j] === cur.id)) {
        cur.position = j >= 0 ? { x: x0 + wrapDx(this.x[j] - x0, w), y: this.y[j] } : at(cur.tile, cur.house || cur.type === WOT.casa || cur.type === WOT.templo ? 1 : 0.5);
        out.push(cur);
      }
    }
    // Os pais entram mesmo longe (a criança procura por eles).
    if (this.role[i] === CHILD && this.parent[i]) {
      const j = this.indexOfUid(this.parent[i]);
      if (j >= 0 && this.alive[j] && !out.some((e) => e.id === this.uid[j])) {
        const a = new Alvo({ id: this.uid[j], name: 'pessoa', type: WOT.pessoa, position: { x: x0 + wrapDx(this.x[j] - x0, w), y: this.y[j] }, stats: { laco: 1, livre: 1, parente: 1 } });
        a.j = j;
        out.push(a);
      }
    }
    return out;
  },

  /** Quantos estão batendo em cada obra agora (a vaga da obra). */
  crewBySite(this: Ecosystem, v: Village): Map<Building, number> {
    const out = new Map<Building, number>();
    const s = stateOf(this);
    for (const i of this.residents(v.id)) {
      const m = s.minds.get(this.uid[i]);
      const t = m?.ctx?.target;
      if (t instanceof Alvo && t.house && m!.ctx!.behavior.behaviorType === 'Construir') out.set(t.house, (out.get(t.house) ?? 0) + 1);
    }
    return out;
  },

  /** Anda até `goal`; devolve se já chegou. Andando demais sem chegar, a ação falha (`walked`). */
  reach(this: Ecosystem, m: Mente, x: number, y: number, reach: number, dt: number): boolean {
    m.goal = { x, y, reach };
    const dx = wrapDx(x - this.x[m.i], this.map.width);
    const dy = y - this.y[m.i];
    if (dx * dx + dy * dy <= reach * reach) return true;
    // O destino não dá pé e a pessoa já está na beira mais perto dele: chegou, se a beira fica perto; senão, desiste.
    if (m.edge >= 0 && m.pathGoal === this.tileAt(x, Math.floor(y)) && this.tileOf(m.i) === m.edge) {
      if (dx * dx + dy * dy <= (reach + 4) ** 2) return true;
      m.stall = Infinity;
      return false;
    }
    m.walked += dt;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < m.best - 0.5) {
      m.best = d;
      m.stall = 0;
    } else m.stall += dt;
    this.gesture[m.i] = this.carry[m.i] ? GESTURE.carry : GESTURE.none;
    return false;
  },

  /** O corpo: um passo da ação `acao` no alvo do contexto. */
  mindAct(this: Ecosystem, m: Mente, acao: string, ctx: ContextInfo, dt: number): Resultado {
    const i = m.i;
    const vi = this.village[i];
    const v = vi >= 0 ? this.villages[vi] : null;
    if (!v) return 'falhou';
    if (m.ctx !== ctx) {
      m.ctx = ctx;
      m.at = 0;
      m.walked = 0;
      m.path = null;
      m.pathGoal = -1;
      m.best = Infinity;
      m.stall = 0;
      m.tick = 0;
      m.did = 0;
    }
    const a = ctx.target instanceof Alvo ? ctx.target : null;
    this.day[i] = ACTIVITY[acao] ?? DAY.none;
    const tx = a ? (a.tile % this.map.width) + (a.house || a.type === WOT.casa || a.type === WOT.templo ? 1 : 0.5) : this.x[i];
    const ty = a ? Math.floor(a.tile / this.map.width) + (a.house || a.type === WOT.casa || a.type === WOT.templo ? 1 : 0.5) : this.y[i];
    const go = (reach: number) => this.reach(m, tx, ty, reach, dt);
    if (m.stall > MIND.stall || m.walked > MIND.walkTimeout) return 'falhou';
    const stay = (gesture: number) => {
      m.at += dt;
      this.gesture[i] = gesture;
    };
    switch (acao) {
      case 'Comer': {
        if (!go(1.6)) return 'continua';
        stay(GESTURE.rest);
        if ((m.tick += dt) < MIND.bite) return 'continua';
        m.tick = 0;
        // Uma refeição na tela vale `pace` porções (a fome também sobe `pace` vezes mais devagar).
        if (v.food < 1) return m.did ? 'feito' : 'falhou';
        const meal = Math.min(v.food, MIND.pace);
        v.food -= meal;
        this.book(v, 'food', 0, meal);
        this.energy[i] = Math.min(1, this.energy[i] + (0.35 * meal) / MIND.pace);
        m.did++;
        return this.energy[i] >= 0.9 ? 'feito' : 'continua';
      }
      case 'Coletar': {
        // O melhor mato a até 6 tiles (escolhido uma vez por ação).
        if (!m.goal || m.at === 0) {
          if (!m.did) {
            const best = this.bestForage(i);
            m.goal = { x: best.x, y: best.y, reach: 1 };
            m.did = 1;
          }
        }
        if (!this.reach(m, m.goal!.x, m.goal!.y, 1, dt)) return 'continua';
        stay(GESTURE.reap);
        const veg = this.map.vegetation[this.tileOf(i)];
        this.energy[i] = Math.min(1, this.energy[i] + B.FORAGE_WILD * 0.5 * Math.max(0.1, veg) * dt);
        return m.at >= MIND.shift ? 'feito' : 'continua';
      }
      case 'Dormir': {
        if (a && !go(1.4)) return 'continua';
        if (!a) m.goal = null;
        stay(GESTURE.rest);
        this.needRest[i] = Math.max(0, this.needRest[i] - MIND.sleep * dt);
        return this.needRest[i] <= 0.02 ? 'feito' : 'continua';
      }
      case 'Abrigar':
      case 'Defender': {
        if (!go(acao === 'Abrigar' ? 3 : 2)) return 'continua';
        stay(acao === 'Defender' ? GESTURE.hammer : GESTURE.none);
        return (v.alarmUntil ?? -1) > this.year ? 'continua' : 'feito';
      }
      case 'Trabalhar': {
        const role = this.role[i];
        if (!go(role === ROLE.fisher ? 2.5 : 1.6)) return 'continua';
        stay(GESTURE_OF[100 + role] ?? GESTURE.none);
        this.credit(v, role, dt);
        if (m.at < MIND.shift) return 'continua';
        this.takeLoad(i, v, this.yieldOf(role));
        return 'feito';
      }
      case 'Colher': {
        if (!go(1.6)) return 'continua';
        stay(GESTURE.reap);
        this.credit(v, ROLE.farmer, dt);
        if (m.at < MIND.shift) return 'continua';
        this.takeLoad(i, v, 'food');
        return 'feito';
      }
      case 'PegarCarga': {
        if (!a?.good) return 'falhou';
        if (!go(1.8)) return 'continua';
        stay(GESTURE.pick);
        if (m.at < 0.6) return 'continua';
        return this.takeLoad(i, v, a.good) > 0 ? 'feito' : 'falhou';
      }
      case 'Entregar': {
        if (!this.carry[i] || this.carryAmt[i] <= 0) return 'falhou';
        if (!go(1.8)) return 'continua';
        const g = CARGO_GOOD(this.carry[i]);
        const n = this.carryAmt[i];
        if (g === 'food') v.food += n;
        else if (g && g !== 'water') v.stock[g] += n;
        if (g && g !== 'water') this.delivered[g] = (this.delivered[g] ?? 0) + n;
        this.carry[i] = 0;
        this.carryAmt[i] = 0;
        this.gesture[i] = GESTURE.none;
        return 'feito';
      }
      case 'Construir': {
        const h = a?.house;
        if (!h || (h.labor ?? 0) <= 0 || !v.houses.includes(h)) return m.at > 0 ? 'feito' : 'falhou';
        if (!go(B.BUILD_REACH)) return 'continua';
        stay(GESTURE.hammer);
        this.credit(v, ROLE.builder, dt);
        h.labor = Math.max(0, h.labor! - dt * (v.stock.tools > 0 ? B.TOOL_SPEED : 1));
        if (h.labor <= 0) {
          h.site = undefined;
          return 'feito';
        }
        return m.at >= MIND.shift * 1.5 ? 'feito' : 'continua';
      }
      case 'CortarLenha': {
        if (!a) return 'falhou';
        if (!m.did) {
          m.did = 1;
          if (this.jobKind[i] !== JOB.fell || this.job[i] !== a.tile) {
            if (this.jobKind[i]) this.dropJob(i);
            if (!this.standingTree(a.tile) || this.claimed(a.tile, i)) return 'falhou';
            this.claim(i, a.tile, JOB.fell);
          }
        }
        // O corte em si é o `workJob` (o mesmo do modo agregado): ao pé da árvore, ela cai e a madeira vai na mão.
        // A ordem acabou: a árvore caiu (com a madeira na mão, ou no pátio se a mão não deu) ou a ordem venceu.
        if (!this.jobKind[i]) return this.carry[i] || !this.standingTree(a.tile) ? 'feito' : 'falhou';
        if (!go(B.JOB_REACH * 0.6)) return 'continua';
        stay(GESTURE.chop);
        this.credit(v, ROLE.woodcutter, dt);
        return 'continua';
      }
      case 'Cacar': {
        const j = a?.j ?? -1;
        if (j < 0 || !this.alive[j] || this.uid[j] !== a!.id) return 'falhou';
        const reached = this.reach(m, this.x[j], this.y[j], 1.5, dt);
        this.credit(v, ROLE.hunter, dt);
        if (!reached) return 'continua';
        this.kill(j, false, 'predador');
        this.energy[i] = Math.min(1, this.energy[i] + B.HUNT_EAT);
        const meat = this.put(v, 'food', B.HUNT_FOOD);
        this.book(v, '_hunt', meat, 0);
        this.pickUp(i, v, 'food', meat);
        this.gain(v, 'hides', 1);
        return 'feito';
      }
      case 'Patrulhar': {
        if (!go(2)) return 'continua';
        stay(GESTURE.none);
        this.credit(v, this.role[i], dt);
        return m.at >= MIND.shift ? 'feito' : 'continua';
      }
      case 'Conversar':
      case 'Seguir': {
        const j = a?.j ?? -1;
        if (j < 0 || !this.alive[j] || this.uid[j] !== a!.id) return 'falhou';
        if (!this.reach(m, this.x[j], this.y[j], 1.8, dt)) return 'continua';
        stay(acao === 'Conversar' ? GESTURE.talk : GESTURE.none);
        if (m.at < MIND.short) return 'continua';
        this.needSocial[i] = Math.max(0, this.needSocial[i] - (acao === 'Conversar' ? 0.75 : 0.4));
        if (acao === 'Conversar') {
          this.needSocial[j] = Math.max(0, this.needSocial[j] - 0.35);
          for (const [p, q] of [
            [i, j],
            [j, i],
          ]) {
            const b = touch(this.bonds, this.uid[p], this.uid[q]);
            b.value = Math.min(100, b.value + 2);
          }
        }
        return 'feito';
      }
      case 'Passear':
      case 'Brincar':
      case 'Festejar': {
        if (!go(3)) return 'continua';
        const party = acao === 'Festejar';
        stay(party ? GESTURE.cheer : GESTURE.talk);
        if (party && (v.festivalUntil ?? -1) > this.year && m.at < MIND.short * 3) return 'continua';
        if (!party && m.at < MIND.short) return 'continua';
        this.needSocial[i] = Math.max(0, this.needSocial[i] - (party ? 1 : (a?.stat('gente') ?? 0) > 0 ? 0.6 : 0.25));
        return 'feito';
      }
      case 'Rezar': {
        if (!go(2.5)) return 'continua';
        stay(GESTURE.pray);
        if (m.at < MIND.short) return 'continua';
        this.needFaith[i] = 0;
        return 'feito';
      }
      case 'IrParaCasa': {
        if (!go(1.4)) return 'continua';
        stay(GESTURE.none);
        return m.at >= MIND.short ? 'feito' : 'continua';
      }
      default:
        return 'falhou';
    }
  },

  /**
   * Quanta comida o celeiro tem, de 0 a 1 (cheio a partir de dois bocados). Gradual, e não "tem ou não tem": com o
   * celeiro quase vazio, cada entrega e cada refeição ligariam e desligariam a vontade de ir comer lá, e a pessoa
   * ficaria indo e voltando entre o celeiro e o mato.
   */
  foodHere(this: Ecosystem, v: Village): number {
    return Math.max(0, Math.min(1, v.food / (2 * MIND.pace)));
  },

  /** Quanto cabe numa carga na tela (com carroça a partir da vila). */
  loadCap(this: Ecosystem, v: Village): number {
    return B.CARRY_LOAD * MIND.load * (this.scale(v) >= 1 ? B.CART_LOAD : 1);
  },

  /** Pega do pátio até uma carga do bem `g` (na mão). Devolve quanto pegou. */
  takeLoad(this: Ecosystem, i: number, v: Village, g: Good | 'food' | null): number {
    if (!g || !carryCode(g) || this.carry[i]) return 0;
    const have = v.yard?.[g] ?? 0;
    const load = Math.min(have, this.loadCap(v));
    if (load <= 0) return 0;
    v.yard![g] = have - load;
    this.carry[i] = carryCode(g);
    this.carryAmt[i] = load;
    return load;
  },

  /** O tile mais verde a até 6 tiles (oito direções), para colher no mato. */
  bestForage(this: Ecosystem, i: number): { x: number; y: number } {
    let best = { x: this.x[i], y: this.y[i] };
    let bv = this.map.vegetation[this.tileOf(i)];
    for (let k = 0; k < 8; k++) {
      const ang = (k * Math.PI) / 4;
      for (const r of [3, 6]) {
        const x = this.x[i] + Math.cos(ang) * r;
        const y = this.y[i] + Math.sin(ang) * r;
        const t = this.tileAt(x, Math.floor(y));
        if (t < 0 || !this.canStand(this.kind[i], t)) continue;
        if (this.map.vegetation[t] > bv + 0.05) {
          bv = this.map.vegetation[t];
          best = { x: Math.floor(x) + 0.5, y: Math.floor(y) + 0.5 };
        }
      }
    }
    return best;
  },

  /** Conta segundos de trabalho no ofício `role` (a produção do lugar na tela vem disso). */
  credit(this: Ecosystem, v: Village, role: number, dt: number): void {
    const s = stateOf(this);
    let acc = s.labor.get(v.id);
    if (!acc) s.labor.set(v.id, (acc = new Float64Array(ROLES.length)));
    acc[role] += dt;
  },

  /**
   * Trabalhadores por ofício para a produção de um lugar na tela: o trabalho feito desde a última conta,
   * dividido pela fração normal de um dia de trabalho (`laborNorm`), em média móvel. Na primeira conta, os
   * números do modo agregado (quem tem o ofício), para a produção não cair a zero ao chegar na tela.
   */
  effectiveWorkers(this: Ecosystem, v: Village, counted: number[], dt: number): number[] {
    const s = stateOf(this);
    let eff = s.effective.get(v.id);
    if (!eff) {
      s.effective.set(v.id, (eff = Float64Array.from(counted)));
      s.labor.delete(v.id);
      return counted;
    }
    const acc = s.labor.get(v.id);
    const k = Math.min(1, dt / MIND.laborTau);
    for (let r = 0; r < eff.length; r++) {
      const rate = dt > 0 ? (acc?.[r] ?? 0) / dt / MIND.laborNorm : 0;
      eff[r] += (rate - eff[r]) * k;
    }
    acc?.fill(0);
    return Array.from(eff);
  },

  /** Larga a mente de quem saiu da tela ou morreu: a carga volta ao pátio e a árvore reservada fica livre. */
  forgetMinds(this: Ecosystem): void {
    const s = stateOf(this);
    for (const [uid, m] of s.minds) {
      const i = m.i;
      const alive = this.alive[i] === 1 && this.uid[i] === uid;
      const vi = alive ? this.village[i] : -1;
      if (alive && vi >= 0 && this.full(this.villages[vi])) continue;
      if (alive) {
        if (this.jobKind[i]) this.dropJob(i);
        this.dropDay(i, vi >= 0 ? this.villages[vi] : null);
      }
      s.minds.delete(uid);
    }
    for (const id of [...s.effective.keys()]) {
      if (!this.villages[id] || !this.full(this.villages[id])) {
        s.effective.delete(id);
        s.labor.delete(id);
      }
    }
  },

  /** Como terminaram as ações das mentes deste mundo (desde o começo). */
  mindTally(this: Ecosystem): MindTally {
    return stateOf(this).tally;
  },

  /** A mente da pessoa, se ela tem uma (lugar na tela). */
  mindNow(this: Ecosystem, i: number): Mente | undefined {
    const m = stateOf(this).minds.get(this.uid[i]);
    return m && m.i === i ? m : undefined;
  },

  /** Guarda o porquê da decisão nova para a ficha (RF-AS-30): a nota, as considerações e as outras ideias. */
  noteDecision(this: Ecosystem, m: Mente, d: Decision): void {
    const brain = m.brain;
    const label = (x: Decision) => x.context.behavior.name.toLowerCase();
    const mine = brain.explain(d);
    const others = brain.decisions
      .filter((x) => x !== d && x.score > 0 && x.context.behavior !== d.context.behavior)
      .sort((p, q) => q.score - p.score)
      .slice(0, 3)
      .map((x) => {
        const e = brain.explain(x);
        const low = e.factors.reduce((p, q) => (q.score < p.score ? q : p), e.factors[0]);
        return { label: label(x), score: e.score, low: low?.name };
      });
    const note: DayNote = {
      label: label(d),
      why: d.context.behavior.description,
      score: mine.score,
      cut: Math.max(mine.score, others[0]?.score ?? 0) * 0.85,
      factors: mine.factors
        .filter((f) => f.score > 0)
        .sort((p, q) => q.score - p.score)
        .slice(0, 3)
        .map((f) => ({ name: f.name, value: f.score })),
      others,
    };
    this.dayNotes.set(m.uid, note);
  },

  /** Ficha com o porquê (RF-AS-30): a ação, as outras ideias e a carga. */
  dayOf(this: Ecosystem, i: number): { task: string; why: string; others: string[]; carry: string; note: DayNote | null } {
    const f = (n: number) => n.toFixed(2).replace('.', ',');
    const n = this.dayNotes.get(this.uid[i]);
    const carry = this.carry[i] ? `${constantsModule.CARGO_NAMES[CARGO_GOOD(this.carry[i]) ?? ''] ?? 'carga'} (${f(this.carryAmt[i])})` : '';
    const vi = this.village[i];
    const v = vi >= 0 ? this.villages[vi] : null;
    if (!v) return { task: 'sem lugar', why: 'vive solto, sem assentamento', others: [], carry, note: null };
    if (!this.full(v)) return { task: 'rotina do lugar', why: 'o lugar está fora da tela: a produção corre no modo agregado', others: [], carry, note: null };
    const m = this.mindNow(i);
    const cur = m?.brain.currentDecision;
    if (!cur || !n) return { task: DAY_NAMES[DAY.none], why: 'nada pede a pessoa agora: espera a próxima ideia', others: [], carry, note: null };
    return { task: n.label, why: n.why, others: n.others.map((o) => `${o.label} (${f(o.score)})`), carry, note: n };
  },
};

/** Gestos de quem está trabalhando (não é hora de conversar com essa pessoa). */
const WORK_GESTURES = new Set<number>([GESTURE.dig, GESTURE.reap, GESTURE.chop, GESTURE.hammer, GESTURE.row, GESTURE.pick]);

export type MindPart = typeof mindPart;
