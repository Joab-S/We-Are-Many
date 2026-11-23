/**
 * Parte do Ecosystem (classe parcial, ver ecosystem.ts): a mente generativa. A pessoa não tem lista de
 * comportamentos. A cada pensamento ela percebe o que há em volta (`genPerceber`), combina cada verbo que o corpo
 * sabe com cada coisa percebida que o admite (`genOpcoes`) e cada combinação vira um Behavior do IAUS com
 * considerações também geradas: o quanto acredita que aquilo alivia o que sente, a confiança nessa crença, o custo,
 * o risco e o jeito dela. O IAUS continua sendo o juiz (multiplicação, compensação, sorteio entre os melhores): o
 * que mudou foi quem escreve os Behaviors.
 *
 * Depois de agir, a pessoa compara o que sentia antes e depois e corrige as crenças (crencas.ts). Quem está por
 * perto vê e aprende um pouco também.
 *
 * O mesmo modelo roda perto e longe da tela. Longe, pensa menos vezes, olha o terreno mais grosso e leva menos
 * opções ao IAUS (`detalhe`); a regra é a mesma.
 */
import { AiEntity, type World } from '../../IAUS/aiEntity';
import { Behavior } from '../../IAUS/behavior';
import { BehaviorTypes } from '../../IAUS/behaviorTypes';
import { Brain } from '../../IAUS/brain';
import { In, type ConsiderationDef } from '../../IAUS/consideration';
import { ContextInfo, Decision } from '../../IAUS/context';
import { ContextType, CurveType, DurationType, InputParameter, SelectionMode } from '../../IAUS/enums';
import { Pessoa, type Resultado } from '../../IAUS/npc/pessoa';
import { AcaoNoCorpo } from '../../IAUS/npc/tipos';
import { TRAITS, TRAIT_COUNT } from '../../IAUS/npc/pessoa/traits';
import type { Ecosystem } from '../ecosystem';
import { B } from '../live';
import { wrapDx } from '../settlement';
import { elderAge } from '../eco/helpers';
import { GESTURE } from '../eco/constants';
import { tileHash } from '../../procgen/surface';
import { aprender, contextualizar, creditar, encadear, esperaTer, esquecer, falharHabito, lembrarAto, lembrarLugar, porVerbo, prever, principais, valor, vencer, type Previsao } from './crencas';
import { novoMundoGen, type Efeito, type Percepto } from './fisica';
import { isWater } from '../eco/tiles';
import { GEN, MATERIAIS, N, NI, TAG_DO_MATERIAL, VERBO, VERBOS, VI, zeros, type Habito, type Material, type PessoaGen, type Verbo } from './tipos';

const TIPO = 'VerboGen';
if (!BehaviorTypes.has(TIPO)) BehaviorTypes.register(TIPO, (c) => new AcaoNoCorpo(c, TIPO));

/** O alvo do IAUS: o percepto, com a posição para o custo. */
class AlvoGen extends AiEntity {
  constructor(readonly p: Percepto) {
    super({ id: p.id, name: p.tipo, type: 'gen', position: { x: p.x, y: p.y } });
  }
}

/** Uma opção gerada: verbo × coisa percebida, com a conta de por que vale. */
export interface Opcao {
  v: Verbo;
  a: Percepto;
  /** O hábito de que este é o primeiro passo, se a opção é um hábito. */
  habito: Habito | null;
  /** As tags com que a crença foi consultada (as do alvo, mais a do que se tem na mão quando o verbo a usa). */
  tags: Record<string, number>;
  prev: Previsao;
  /** Urgência × alívio esperado, por necessidade (a soma, com as lentes e o que vem adiante, é o benefício). */
  porNec: number[];
  /** A parte das lentes e a do que a pessoa espera conseguir depois (encadeando até três passos). */
  lente: number;
  adiante: number;
  cadeia: string;
  beneficio: number;
  conf: number;
  custo: number;
  risco: number;
  /** Ficou fora das K melhores (não foi ao IAUS). */
  cortada: boolean;
  behavior: Behavior | null;
  chave: string;
}

interface Ato {
  ctx: ContextInfo;
  op: Opcao;
  fase: 'ir' | 'fazer';
  at: number;
  antes: number[];
  ctxTags: Record<string, number>;
  mao: string;
  /** Em que passo do hábito está. */
  passo: number;
  ganho: number[];
}

/** A mente em execução: fora do save (o cérebro recomeça ao carregar; o que a pessoa sabe está em `eco.gen`). */
export interface MenteGen {
  uid: number;
  i: number;
  pessoa: Pessoa;
  brain: CerebroGen;
  perceptos: Percepto[];
  ctx: Record<string, number>;
  u: number[];
  opcoes: Opcao[];
  porChave: Map<string, Opcao>;
  ato: Ato | null;
  goal: { x: number; y: number; reach: number } | null;
  path: number[] | null;
  pathGoal: number;
  pathAge: number;
  best: number;
  stall: number;
  walked: number;
  /** Do último olhar: gente a até 5 tiles, o perigo mais perto (0 a 1) e fogo por perto. */
  gente: number;
  perigo: number;
  fogo: number;
  detalhe: number;
  /** Longe da tela: as opções do último pensamento que ainda não foram feitas, quando ele foi, e o que havia na mão. */
  fila: Opcao[];
  pensouEm: number;
  maoNoPensar: string;
  /** A chave da última ação terminada (não se repete da fila) e quantas vezes a fila poupou um pensamento. */
  feita: string;
  poupou: number;
  /** Segundos seguidos dentro da água (para contar a travessia ao sair). */
  naAgua: number;
  /** Quantas vezes pensou e quantas opções gerou (para medir o custo). */
  pensou: number;
  geradas: number;
  /** Behaviors já montados, por verbo (ou hábito): o gerador reescreve os números em vez de criar tudo de novo a cada pensamento. */
  pool: Map<number, Behavior[]>;
}

/** O cérebro do IAUS com a lista de decisões escrita pelo gerador (o resto do núcleo é o mesmo). */
class CerebroGen extends Brain {
  opcoes: Opcao[] = [];
  override rebuildDecisionList(): void {
    this.decisions = [];
    for (const o of this.opcoes) if (o.behavior) this.decisions.push(new Decision(new ContextInfo(this, o.behavior, this.owner, new AlvoGen(o.a))));
  }
}

const MENTES = new WeakMap<Ecosystem, Map<number, MenteGen>>();
function mentes(eco: Ecosystem): Map<number, MenteGen> {
  let m = MENTES.get(eco);
  if (!m) MENTES.set(eco, (m = new Map()));
  return m;
}

const lim = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
const rumo = (alvo: number, atual: number, dt: number, tau: number) => atual + (alvo - atual) * Math.min(1, dt / tau);

/** O traço que pesa em cada verbo (o jeito da pessoa): quem é assim faz isto com mais gosto. */
const JEITO: Partial<Record<Verbo, [string, number]>> = {
  olhar: ['curiosity', 0.3],
  andar: ['attachment', -0.2],
  bater: ['aggression', 0.5],
  fugir: ['courage', -0.3],
  falar: ['sociability', 0.3],
  seguir: ['sociability', 0.25],
  mostrar: ['charisma', 0.25],
  dar: ['kindness', 0.35],
  pedir: ['ambition', -0.2],
  cuidar: ['familism', 0.3],
  acasalar: ['familism', 0.2],
  empilhar: ['diligence', 0.3],
  cavar: ['diligence', 0.3],
  cortar: ['strength', 0.25],
  acender: ['dexterity', 0.3],
  pegar: ['greed', 0.15],
};

/** Verbos que usam o que se tem na mão (os que entram na conta de "se eu tivesse isto na mão"). */
const USA_MAO: Verbo[] = ['comer', 'largar', 'empilhar', 'dar', 'bater', 'cortar', 'acender', 'cuidar'];
const MATERIAL_DA_TAG = Object.fromEntries(MATERIAIS.map((m) => [TAG_DO_MATERIAL[m], m])) as Record<string, Material>;

const linear = (m: number, b: number) => ({ type: CurveType.Linear, m, b });
const constante = (nome: string, x: number, lo: number, hi: number): ConsiderationDef => ({ name: nome, input: In.Constant, curve: linear(hi - lo, lo), params: { values: { [InputParameter.Value]: lim(x) } } });

export const genMentePart = {
  /** Liga o modelo generativo neste mundo (as pessoas sem lugar passam a pensar por ele). */
  genLigar(this: Ecosystem): void {
    if (!this.gen) this.gen = novoMundoGen();
  },

  /** A mente em execução da pessoa `i` (criada na primeira vez). */
  genMente(this: Ecosystem, i: number): MenteGen {
    const all = mentes(this);
    const uid = this.uid[i];
    let m = all.get(uid);
    if (m) {
      m.i = i;
      return m;
    }
    const eco = this;
    const pessoa = new Pessoa({ id: uid, name: String(uid), position: { x: this.x[i], y: this.y[i] } });
    const world: World = { now: () => eco.year * eco.yearSpan, entities: () => [], getEntity: () => undefined };
    const brain = new CerebroGen(pessoa, world, {
      thinkInterval: GEN.pensar,
      thinkJitter: 0.2,
      idleThinkInterval: 0.3,
      rng: { next: () => eco.mindRnd() },
      selection: { mode: SelectionMode.WeightedRandomTop, withinFractionOfBest: 0.85, topN: 3, stickWhenBest: true },
      perceive: () => {
        eco.genPensar(m!);
        return [];
      },
    });
    m = { uid, i, pessoa, brain, perceptos: [], ctx: {}, u: zeros(), opcoes: [], porChave: new Map(), ato: null, goal: null, path: null, pathGoal: -1, pathAge: 0, best: Infinity, stall: 0, walked: 0, gente: 0, perigo: 0, fogo: 0, detalhe: 0, fila: [], pensouEm: -Infinity, maoNoPensar: '', feita: '', poupou: 0, naAgua: 0, pensou: 0, geradas: 0, pool: new Map() };
    const mente = m;
    pessoa.corpo = { agir: (_acao, ctx, dt) => eco.genAgir(mente, ctx, dt) };
    brain.onDecisionChanged = (_b, _from, to) => {
      // A ação anterior foi trocada no meio: fica na linha do tempo como trocada.
      const p = eco.gen!.pessoas.get(uid);
      const ult = p?.linha[0];
      if (ult && ult.fim === '') ult.fim = 'trocou';
      const op = mente.porChave.get(to.key);
      if (p && op) {
        p.linha.unshift({ em: eco.year, chave: op.chave, esperado: op.beneficio, real: 0, fim: '', surpresa: false });
        if (p.linha.length > GEN.linha) p.linha.length = GEN.linha;
      }
    };
    all.set(uid, m);
    return m;
  },

  /** A mente de quem tem uma (para a ficha e o painel), sem criar. */
  genMenteDe(this: Ecosystem, i: number): MenteGen | undefined {
    const m = mentes(this).get(this.uid[i]);
    return m && m.i === i ? m : undefined;
  },

  /**
   * Um passo da pessoa `i` no modelo generativo: o corpo sente, a mente pensa e age, e o corpo anda. `e` é a energia
   * depois do metabolismo do passo; devolve a energia de depois (o resto do passo, a morte de fome ou de velhice,
   * é do mundo, como para qualquer bicho).
   */
  genStep(this: Ecosystem, i: number, e: number, dt: number): number {
    const sp = this.species[this.kind[i]];
    const p = this.genDe(i);
    const m = this.genMente(i);
    // O corpo vive `ritmo` vezes mais devagar que o dos bichos (a pessoa come umas vezes por minuto).
    let gasto = (this.energy[i] - e) / GEN.ritmo;
    // Na água: quem segura um tronco boia (o motor cobra de quem está fora do habitat; de quem boia, não).
    const agua = isWater(this.map, this.tileOf(i));
    if (agua && p.mao?.que === 'tronco') gasto = Math.max(0, gasto - (0.6 * dt) / GEN.ritmo);
    if (agua) m.naAgua += dt;
    else {
      if (m.naAgua > 1.5) p.conta.travessias++;
      m.naAgua = 0;
    }
    this.energy[i] -= gasto * (1 + (p.gravida ? GEN.custoGravidez : 0) + (p.colo ? GEN.custoColo : 0));
    m.detalhe = this.focus && !this.offscreen(i) ? 1 : 0;
    this.genSentir(i, p, m, dt);
    if (p.ferida >= 1) {
      this.kill(i, false, 'predador');
      return this.energy[i];
    }
    if (p.gravida && this.year >= p.gravida) this.genNascer(i, p);
    // No colo de alguém: vai junto.
    if (p.noColo) {
      const k = this.indexOfUid(p.noColo);
      const pk = k >= 0 && this.alive[k] ? this.gen!.pessoas.get(p.noColo) : undefined;
      if (!pk || pk.colo !== this.uid[i] || this.age[i] >= GEN.come) {
        p.noColo = 0;
        if (pk && pk.colo === this.uid[i]) pk.colo = 0;
      } else {
        this.x[i] = this.x[k];
        this.y[i] = this.y[k];
      }
    }
    m.brain.setThinkInterval(m.detalhe ? GEN.pensar : GEN.pensarLonge);
    m.brain.update(dt);
    if (!this.alive[i]) return 0;
    const cur = m.brain.currentDecision;
    const v = cur ? (cur.context.behavior.params.v as Verbo) : null;
    p.dorme = v === 'dormir' && m.ato?.fase === 'fazer';
    if (v !== 'seguir') p.segue = 0;
    if (!cur) {
      m.goal = null;
      m.ato = null;
      this.gesture[i] = GESTURE.none;
    }
    const go = p.noColo || this.age[i] < GEN.anda ? null : this.genAndar(m, dt);
    if (go) {
      const idoso = this.age[i] >= elderAge(sp, 0);
      const fator = (this.age[i] < sp.maturity ? 0.8 : idoso ? 0.6 : 1) * (p.gravida || p.colo ? GEN.lento : 1) * (1 - 0.4 * Math.min(1, p.ferida)) * (v === 'fugir' ? 1.3 : 1);
      this.walkTo(i, sp.speed * B.WALK_PACE * fator * (agua ? GEN.nadar : 1), go.x, go.y);
      p.nec[NI.cansaco] = Math.min(1, p.nec[NI.cansaco] + 0.004 * dt * (p.colo || p.gravida ? 1.5 : 1) * (agua ? 3 : 1));
    } else this.stand(i);
    return this.energy[i];
  },

  /** O que o corpo sente agora: cada necessidade sobe e desce pelo que acontece com ele, não pelo que ele "escolheu". */
  genSentir(this: Ecosystem, i: number, p: PessoaGen, m: MenteGen, dt: number): void {
    const sp = this.species[this.kind[i]];
    const n = p.nec;
    const t = this.tileOf(i);
    const noite = this.genNoite();
    const aqui = this.genCoisaEm(t);
    const abrigo = aqui ? this.genAbrigo(aqui) : 0;
    const adulto = this.age[i] >= sp.maturity;
    n[NI.fome] = lim((0.85 - this.energy[i]) / 0.6);
    n[NI.sede] = Math.min(1, n[NI.sede] + dt / GEN.sede);
    if (n[NI.sede] >= 1) this.energy[i] -= 0.012 * dt;
    // Sono: acordado sobe (mais à noite); dormindo desce, melhor sob abrigo e com gente perto.
    if (p.dorme) this.needRest[i] = Math.max(0, this.needRest[i] - (dt / 12) * (1 + 0.6 * abrigo + (m.gente > 0 ? 0.3 : 0)));
    else this.needRest[i] = Math.min(1, this.needRest[i] + (dt / GEN.sono) * (1 + 0.5 * noite));
    n[NI.sono] = Math.min(1, this.needRest[i] + 0.35 * noite * Math.min(1, this.needRest[i] * 4));
    const esforco = m.ato?.fase === 'fazer' ? VERBO[m.ato.op.v].esforco : 0;
    n[NI.cansaco] = lim(n[NI.cansaco] + esforco * dt - (p.dorme ? dt / 10 : m.goal ? 0 : dt / 45));
    // Frio e calor: o clima do tile, a noite, o fogo e o abrigo de onde se está.
    const temp = this.genTemperatura(t, noite);
    const sombra = (m.ctx.sombra ?? 0) > 0 || abrigo > 0.25 ? 0.5 : 1;
    n[NI.frio] = rumo(lim((sp.tempMin + 22 - temp) / 14), n[NI.frio], dt, 4);
    n[NI.calor] = rumo(lim((temp - (sp.tempMax - 12)) / 10) * sombra, n[NI.calor], dt, 4);
    if (n[NI.frio] > 0.5) this.energy[i] -= 0.006 * n[NI.frio] * dt;
    if (p.ferida > 0) p.ferida = Math.max(0, p.ferida - (dt / 90) * (m.goal ? 1 : 2));
    n[NI.dor] = Math.min(1, p.ferida);
    this.genMordida(i, p, m.perigo, m.gente, m.fogo);
    const escuro = 0.35 * noite * (m.gente > 0 ? 0.3 : 1) * (m.fogo > 0 ? 0.3 : 1) * (abrigo > 0.5 ? 0.5 : 1);
    const medo = Math.max(m.perigo, escuro, 0.5 * p.ferida);
    n[NI.medo] = rumo(medo, n[NI.medo], dt, medo > n[NI.medo] ? 0.8 : 5);
    if (m.gente > 0) this.needSocial[i] = Math.max(0, this.needSocial[i] - dt / 150);
    else this.needSocial[i] = Math.min(1, this.needSocial[i] + dt / GEN.solidao);
    n[NI.solidao] = this.needSocial[i];
    n[NI.tedio] = Math.min(1, n[NI.tedio] + dt / GEN.tedio);
    // Apego: os filhos pequenos (com fome, longe, pedindo) e a vontade de par.
    let cuidado = 0;
    for (const f of p.filhos) {
      const j = this.indexOfUid(f);
      if (j < 0 || !this.alive[j]) continue;
      const fome = lim((0.7 - this.energy[j]) / 0.4) * (this.age[j] < GEN.come ? 1 : 0.6);
      const longe = this.age[j] < GEN.come && this.genDist(i, this.x[j], this.y[j]) > 5 ? 0.6 : 0;
      cuidado = Math.max(cuidado, fome, longe);
    }
    if (p.pedido) {
      if (this.year - p.pedido.em > 1) p.pedido = null;
      else cuidado = Math.max(cuidado, 0.5);
    }
    const fertil = adulto && this.age[i] < elderAge(sp, 0) && !p.gravida && !p.filhos.some((f) => {
      const j = this.indexOfUid(f);
      return j >= 0 && this.age[j] < 1.5;
    });
    if (fertil) p.desejo = Math.min(1, p.desejo + (dt / GEN.desejo) * (this.energy[i] > 0.5 ? 1 : 0.2));
    else p.desejo = Math.max(0, p.desejo - dt / 30);
    n[NI.apego] = rumo(Math.max(p.desejo * 0.8, cuidado), n[NI.apego], dt, 2);
    if (adulto) n[NI.respeito] = Math.min(1, n[NI.respeito] + dt / GEN.respeito);
    this.needFaith[i] = Math.min(1, this.needFaith[i] + dt / GEN.sentido);
    n[NI.sentido] = this.needFaith[i];
  },

  /** A urgência de cada necessidade agora: a curva (o que dói pouco quase não pesa) vezes o peso do jeito da pessoa. */
  genUrgencias(this: Ecosystem, i: number, p: PessoaGen): number[] {
    const tr = (k: (typeof TRAITS)[number]) => this.traits[i * TRAIT_COUNT + TRAITS.indexOf(k)] / 10;
    const peso: Record<string, number> = {
      fome: 1.3,
      sede: 1.3,
      sono: 1,
      cansaco: 0.7,
      frio: 1,
      calor: 0.9,
      dor: 1,
      medo: 1.2 * (1 - 0.4 * tr('courage')),
      solidao: 0.8 * (1 + 0.5 * tr('sociability')),
      tedio: 0.7 * (1 + 0.5 * tr('curiosity')),
      apego: 1 * (1 + 0.4 * tr('familism')),
      respeito: 0.5 * (1 + 0.5 * tr('ambition')),
      sentido: 0.5 * (1 + 0.5 * tr('faith')),
    };
    const u = zeros();
    for (let n = 0; n < N; n++) {
      const nome = Object.keys(NI)[n];
      u[n] = peso[nome] * Math.pow(p.nec[n], 1.5);
    }
    // Um resto de curiosidade sempre há: é por ele que alguém satisfeito experimenta.
    u[NI.tedio] = Math.max(u[NI.tedio], 0.06 * (1 + tr('curiosity')));
    return u;
  },

  /**
   * O que a pessoa percebe agora: onde está, o que tem na mão, o melhor do terreno à vista (comida, água, árvore,
   * pedra, alto), os montes, as pessoas e os bichos, os lugares de que lembra e o desconhecido. Vê mais longe no
   * alto, menos no mato fechado e à noite. Longe da tela, olha o terreno de dois em dois tiles.
   */
  genPerceber(this: Ecosystem, i: number, p: PessoaGen, m: MenteGen): Percepto[] {
    const map = this.map;
    const w = map.width;
    const uid = this.uid[i];
    const x0 = this.x[i];
    const y0 = this.y[i];
    const t0 = this.tileOf(i);
    const out: Percepto[] = [];
    const noite = this.genNoite();
    const alto = lim((map.elevation[t0] - 0.3) / 0.4);
    const vista = GEN.vista * (1 + 0.5 * alto) * (1 - 0.3 * lim((map.vegetation[t0] - 0.6) / 0.4)) * (1 - 0.35 * noite);
    const tileXY = (t: number) => ({ x: x0 + wrapDx((t % w) + 0.5 - x0, w), y: Math.floor(t / w) + 0.5 });
    const coisaAqui = this.genCoisaEm(t0);
    const aqui: Percepto = { id: -1, tipo: 'aqui', x: x0, y: y0, dist: 0, tags: { chao: 1, ...this.genTagsDoTile(t0), ...(coisaAqui ? this.genTagsDaCoisa(coisaAqui, uid) : {}) }, t: t0, j: -1, coisa: coisaAqui?.id ?? 0, k: -1 };
    out.push(aqui);
    if (p.mao) out.push({ id: -2, tipo: 'mao', x: x0, y: y0, dist: 0, tags: { naMao: 1, [TAG_DO_MATERIAL[p.mao.que]]: 1, ...(p.mao.que === 'carne' ? { comivel: 0.7 } : {}) }, t: -1, j: -1, coisa: 0, k: -1 });
    // O terreno à vista: os dois melhores para comer, a água, a árvore e a pedra mais perto, e o ponto mais alto.
    const R = Math.max(3, Math.round(vista));
    const passo = m.detalhe ? 1 : 2;
    let c1 = -1;
    let c1v = 0;
    let c2 = -1;
    let c2v = 0;
    let agua = -1;
    let aguaD = Infinity;
    let arv = -1;
    let arvD = Infinity;
    let ped = -1;
    let pedD = Infinity;
    let top = -1;
    let topE = map.elevation[t0] + 0.12;
    const tx0 = Math.floor(x0);
    const ty0 = Math.floor(y0);
    for (let dy = -R; dy <= R; dy += passo) {
      for (let dx = -R; dx <= R; dx += passo) {
        const d2 = dx * dx + dy * dy;
        if (d2 > R * R || d2 === 0) continue;
        const t = this.tileAt(tx0 + dx, ty0 + dy);
        if (!this.genPisa(i, t)) continue;
        const tags = this.genTagsDoTile(t);
        const com = (tags.comivel ?? 0) - 0.035 * Math.sqrt(d2);
        if (com > c1v) {
          c2 = c1;
          c2v = c1v;
          c1 = t;
          c1v = com;
        } else if (com > c2v) {
          c2 = t;
          c2v = com;
        }
        if (tags.agua && d2 < aguaD) {
          agua = t;
          aguaD = d2;
        }
        if (tags.madeira && d2 < arvD) {
          arv = t;
          arvD = d2;
        }
        if ((tags.pedra ?? 0) >= 0.5 && d2 < pedD) {
          ped = t;
          pedD = d2;
        }
        if (map.elevation[t] > topE) {
          top = t;
          topE = map.elevation[t];
        }
        const c = this.genCoisaEm(t);
        if (c && out.length < 24) {
          const q = tileXY(t);
          out.push({ id: -(10_000_000 + c.id), tipo: 'coisa', x: q.x, y: q.y, dist: Math.sqrt(d2), tags: this.genTagsDaCoisa(c, uid), t, j: -1, coisa: c.id, k: -1 });
        }
      }
    }
    // A água se vê de mais longe que o resto (o rio brilha): sem água à vista, olha o dobro da distância, mais grosso.
    if (agua < 0) {
      const R2 = R * 2;
      for (let dy = -R2; dy <= R2; dy += 3) {
        for (let dx = -R2; dx <= R2; dx += 3) {
          const d2 = dx * dx + dy * dy;
          if (d2 > R2 * R2 || d2 >= aguaD) continue;
          const t = this.tileAt(tx0 + dx, ty0 + dy);
          if (!this.genPisa(i, t) || !this.nearWater(t)) continue;
          agua = t;
          aguaD = d2;
        }
      }
    }
    const visto = new Set<number>();
    for (const t of [c1, c2, agua, arv, ped, top]) {
      if (t < 0 || visto.has(t)) continue;
      visto.add(t);
      const q = tileXY(t);
      out.push({ id: -(1000 + t), tipo: 'tile', x: q.x, y: q.y, dist: Math.hypot(q.x - x0, q.y - y0), tags: this.genTagsDoTile(t), t, j: -1, coisa: 0, k: -1 });
    }
    // Gente e bichos.
    const gente: { j: number; d: number; dx: number; dy: number }[] = [];
    let bravo = -1;
    let bravoD = Infinity;
    const presas: { j: number; d: number; dx: number; dy: number }[] = [];
    let perto = 0;
    this.forEachNear(x0, y0, vista, (j, dx, dy) => {
      if (j === i) return;
      const d = Math.hypot(dx, dy);
      const k = this.species[this.kind[j]].kind;
      if (k === 'sapient') {
        if (this.village[j] >= 0) return;
        gente.push({ j, d, dx, dy });
        if (d <= 5) perto++;
      } else if (k === 'predator') {
        if (d < bravoD) {
          bravo = j;
          bravoD = d;
        }
      } else if (k === 'herbivore' && d <= 7) presas.push({ j, d, dx, dy });
    });
    gente.sort((a, b) => a.d - b.d || a.j - b.j);
    const meus = new Set<number>([...p.filhos, p.colo, p.noColo, p.par, p.segue, this.parent[i]].filter((x) => x > 0));
    let n = 0;
    for (const g of gente) {
      const dele = this.uid[g.j];
      if (n >= (m.detalhe ? 5 : 3) && !meus.has(dele)) continue;
      n++;
      out.push({ id: dele, tipo: 'pessoa', x: x0 + g.dx, y: y0 + g.dy, dist: g.d, tags: this.genTagsDaPessoa(i, g.j), t: -1, j: g.j, coisa: 0, k: -1 });
    }
    m.gente = perto;
    m.perigo = 0;
    if (bravo >= 0) {
      const prox = bravoD < 2.5 ? 1 : Math.max(0.25, 1 - (bravoD - 2.5) / Math.max(1, vista - 2.5));
      m.perigo = prox;
      out.push({ id: this.uid[bravo], tipo: 'animal', x: x0 + wrapDx(this.x[bravo] - x0, w), y: this.y[bravo], dist: bravoD, tags: { animal: 1, perigoso: prox, carne: 0.6 }, t: -1, j: bravo, coisa: 0, k: -1 });
    }
    presas.sort((a, b) => a.d - b.d || a.j - b.j);
    for (const g of presas.slice(0, 2)) out.push({ id: this.uid[g.j], tipo: 'animal', x: x0 + g.dx, y: y0 + g.dy, dist: g.d, tags: this.genTagsDoBicho(g.j), t: -1, j: g.j, coisa: 0, k: -1 });
    const ck = this.carcassNear(x0, y0, vista);
    if (ck >= 0) {
      const cc = this.carcasses[ck];
      const cx = x0 + wrapDx(cc.x - x0, w);
      out.push({ id: -(20_000_000 + Math.floor(cc.x) * 1000 + Math.floor(cc.y)), tipo: 'carcaca', x: cx, y: cc.y, dist: Math.hypot(cx - x0, cc.y - y0), tags: { carne: 1, comivel: 0.7, morto: 1 }, t: -1, j: -1, coisa: 0, k: ck });
    }
    // Os lugares de que lembra (os três em que viveu melhor, fora do que já vê) e dois rumos desconhecidos.
    const lembrados = p.lugares.filter((l) => Math.hypot(wrapDx(l.x - x0, w), l.y - y0) > vista).sort((a, b) => b.bem - a.bem || a.em - b.em);
    for (const l of lembrados.slice(0, 3)) {
      const tags: Record<string, number> = { lembrado: 1 };
      for (const [tg, wt] of Object.entries(l.tags)) tags[tg] = wt * 0.8;
      if (l.bem > 0.3) tags.lugarMeu = Math.min(1, l.bem / 3);
      const lx = x0 + wrapDx(l.x - x0, w);
      out.push({ id: -(30_000_000 + Math.floor(l.x) * 1000 + Math.floor(l.y)), tipo: 'lugar', x: lx, y: l.y, dist: Math.hypot(lx - x0, l.y - y0), tags, t: this.tileAt(l.x, Math.floor(l.y)), j: -1, coisa: 0, k: -1 });
    }
    const epoca = Math.floor(this.year / 2);
    for (let k = 0; k < 2; k++) {
      const ang = tileHash(uid * 31 + epoca * 7 + k) * Math.PI * 2;
      for (const r of [15, 11, 7]) {
        const ux = x0 + Math.cos(ang) * r;
        const uy = y0 + Math.sin(ang) * r;
        const t = this.tileAt(ux, Math.floor(uy));
        if (!this.genPisa(i, t)) continue;
        if (p.lugares.some((l) => Math.hypot(wrapDx(l.x - ux, w), l.y - uy) < 5)) break;
        out.push({ id: -(50_000_000 + k), tipo: 'lugar', x: ux, y: uy, dist: r, tags: { desconhecido: 1 }, t, j: -1, coisa: 0, k: -1 });
        break;
      }
    }
    // O contexto: o que há a poucos passos (é com ele que as lentes nascem e valem).
    const ctx: Record<string, number> = {};
    m.fogo = 0;
    for (const a of out) {
      if (a.tipo === 'mao' || a.tipo === 'lugar') continue;
      if (a.tags.fogo && a.dist <= 4) m.fogo = 1;
      if (a.dist > 3.5) continue;
      for (const [tg, wt] of Object.entries(a.tags)) if (tg !== 'chao' && wt > (ctx[tg] ?? 0)) ctx[tg] = wt;
    }
    if (noite > 0.3) ctx.noite = noite;
    // O inverno se vê (o mato seco, o frio): é um fato do contexto, de que podem nascer lentes como qualquer outro.
    const inverno = this.genInverno(t0);
    if (inverno > 0.3) ctx.inverno = inverno;
    // Onde já se viveu bem: estar ali é um fato do contexto (é dele que pode nascer o gosto de ficar e de voltar).
    let meu = 0;
    for (const l of p.lugares) if (l.bem > 0.3 && Math.hypot(wrapDx(l.x - x0, w), l.y - y0) <= 5) meu = Math.max(meu, Math.min(1, l.bem / 3));
    if (meu > 0) {
      ctx.lugarMeu = meu;
      aqui.tags.lugarMeu = meu;
    }
    // O que se tem na mão também é contexto (é com o tronco na mão que a água deixa de ser parede).
    if (p.mao) ctx[`mao:${TAG_DO_MATERIAL[p.mao.que]}`] = 1;
    if (!gente.length) ctx.sozinho = 1;
    m.ctx = ctx;
    return out;
  },

  /** O corpo consegue fazer `v` em `a` com `mao` na mão? Só o que é físico: o que vale a pena é a crença que diz. */
  genCabe(this: Ecosystem, i: number, p: PessoaGen, v: Verbo, a: Percepto, mao: Material | null): boolean {
    const sp = this.species[this.kind[i]];
    const tg = a.tags;
    const bebe = this.age[i] < GEN.anda;
    // Quem ainda não anda só alcança o que está ao lado.
    if ((bebe || p.noColo) && a.dist > 1.5) return false;
    const gente = a.tipo === 'pessoa';
    const acordado = gente && !tg.dormindo;
    const comivel = mao === 'comida' || mao === 'carne';
    switch (v) {
      case 'andar':
        return (a.tipo === 'lugar' || a.tipo === 'tile' || a.tipo === 'coisa') && a.dist > 2.5;
      case 'olhar':
        return a.tipo === 'aqui' || (a.tipo === 'lugar' && !!tg.desconhecido) || (a.tipo === 'tile' && !!tg.alto) || (a.tipo === 'coisa' && !!tg.fogo);
      case 'pegar': {
        if (a.tipo === 'mao' || a.tipo === 'lugar' || a.tipo === 'animal') return false;
        if (gente && (tg.bebe || !(tg.carregaComida || tg.armado))) return false;
        const livre = (m: Material) => !mao || (mao === m && (p.mao?.q ?? 0) < GEN.mao);
        if (a.tipo === 'carcaca') return livre('carne');
        if (gente) return !mao;
        if (a.tipo === 'coisa' || a.coisa) {
          for (const m of MATERIAIS) if (tg[TAG_DO_MATERIAL[m]] && livre(m)) return true;
          if (tg.planta && livre('comida')) return true;
        }
        return ((tg.comivel ?? 0) > 0.15 && livre('comida')) || (!!tg.galho && livre('galho')) || ((tg.pedra ?? 0) >= 0.5 && livre('pedra'));
      }
      case 'largar':
        return a.tipo === 'aqui' && !!mao && !isWater(this.map, this.tileOf(i));
      case 'carregar':
        return gente && (!!tg.bebe || (!!tg.crianca && this.age[a.j] < GEN.come)) && !p.colo && !bebe && this.age[i] >= sp.maturity * 0.6;
      case 'comer':
        if (a.tipo === 'mao') return comivel;
        if (gente || a.tipo === 'animal' || a.tipo === 'lugar') return false;
        return (tg.comivel ?? 0) > 0.08 || !!tg.carne;
      case 'beber':
        return !!tg.agua && a.tipo !== 'lugar';
      case 'dormir':
      case 'descansar':
        return a.tipo === 'aqui' || (a.tipo === 'coisa' && (!!tg.abrigo || !!tg.fogo));
      case 'abrigar':
        return (a.tipo === 'coisa' && (!!tg.abrigo || !!tg.quente)) || (a.tipo === 'tile' && !!tg.sombra) || (a.tipo === 'aqui' && (!!tg.abrigo || !!tg.sombra || !!tg.quente));
      case 'cavar':
        return a.tipo === 'aqui' && !bebe;
      case 'cortar':
        return mao === 'lasca' && (a.tipo === 'carcaca' || ((a.tipo === 'tile' || a.tipo === 'aqui') && !!tg.madeira));
      case 'bater':
        if (bebe) return false;
        if (a.tipo === 'animal') return true;
        if (gente) return true;
        return mao === 'pedra' && !!tg.pedra && a.tipo !== 'lugar' && a.tipo !== 'mao';
      case 'fugir':
        return a.tipo === 'animal' || (gente && !tg.filho && !tg.bebe);
      case 'seguir':
        return gente && !tg.bebe && !tg.dormindo;
      case 'falar':
        return acordado && !tg.bebe && !bebe;
      case 'mostrar':
        return acordado && !tg.bebe && !bebe && (!!mao || p.lugares.length > 0);
      case 'dar':
        return gente && !!mao && !isWater(this.map, this.tileOf(i));
      case 'pedir':
        return acordado && !tg.bebe && !tg.crianca;
      case 'empilhar':
        return (a.tipo === 'coisa' || (a.tipo === 'aqui' && a.coisa !== 0)) && (mao === 'galho' || mao === 'pedra' || mao === 'tronco');
      case 'acender':
        return (a.tipo === 'coisa' || (a.tipo === 'aqui' && a.coisa !== 0)) && !!tg.galho && !tg.fogo && !bebe;
      case 'cuidar':
        return gente && !bebe && (!!tg.bebe || !!tg.crianca || !!tg.ferido || !!tg.comFome);
      case 'acasalar':
        return gente && !!tg.parceiro && !tg.dormindo;
    }
    return false;
  },

  /** As tags com que a crença é consultada: as do alvo e, nos verbos que põem o que se tem na mão, a do material. */
  genTagsDoAto(this: Ecosystem, v: Verbo, a: Percepto, mao: Material | null): Record<string, number> {
    if (mao && (v === 'largar' || v === 'empilhar' || v === 'dar')) {
      const out: Record<string, number> = { [TAG_DO_MATERIAL[mao]]: 1 };
      for (const [t, w] of principais(a.tags, 3)) if (t !== 'chao') out[t] = Math.max(out[t] ?? 0, w * 0.8);
      return out;
    }
    return a.tags;
  },

  /**
   * Um pensamento: perceber e gerar as opções. Cada verbo que cabe em cada coisa percebida é uma opção, com o
   * benefício que a pessoa espera (pela crença, pelas lentes e pelo que ela acha que consegue em seguida). Um
   * corte barato pelo benefício deixa as K melhores, e só essas viram Behaviors do IAUS.
   */
  genPensar(this: Ecosystem, m: MenteGen): void {
    const i = m.i;
    const p = this.genDe(i);
    m.pessoa.position = { x: this.x[i], y: this.y[i] };
    for (let k = 0; k < TRAIT_COUNT; k++) m.pessoa.setStat(`tr.${TRAITS[k]}`, this.traits[i * TRAIT_COUNT + k] / 10);
    // Longe da tela a pessoa pensa mais devagar: um pensamento vale por um tempo, e as ideias que sobraram dele (as
    // que ainda cabem) são feitas em ordem, sem perceber nem gerar de novo. É o mesmo modelo, só mais grosso.
    const agora = this.year * this.yearSpan;
    const maoAgora = p.mao?.que ?? '';
    if (!m.detalhe && m.fila.length && agora - m.pensouEm < GEN.pensarLonge) {
      const aqui = this.tileOf(i);
      const resto = m.fila.filter((o) => {
        const a = o.a;
        if (!o.behavior || `${o.behavior.id}:${a.id}` === m.feita) return false;
        if ((a.tipo === 'aqui' && a.t !== aqui) || (a.tipo === 'mao' && maoAgora !== m.maoNoPensar)) return false;
        if (a.j >= 0) {
          if (!this.alive[a.j] || this.uid[a.j] !== a.id) return false;
          a.x = this.x[i] + wrapDx(this.x[a.j] - this.x[i], this.map.width);
          a.y = this.y[a.j];
        }
        a.dist = Math.hypot(a.x - this.x[i], a.y - this.y[i]);
        // O que mais muda em poucos segundos é o mato (alguém comeu): isso a pessoa confere de novo, o resto fica como viu.
        if (a.tipo === 'tile' && a.tags.comivel !== undefined) {
          const com = this.genComivel(a.t);
          if (com > 0.05) a.tags.comivel = com;
          else delete a.tags.comivel;
          a.ts = undefined;
        }
        return this.genCabe(i, p, o.v, a, (maoAgora || null) as Material | null);
      });
      if (resto.length) {
        m.fila = resto;
        m.brain.opcoes = resto;
        m.poupou++;
        return;
      }
    }
    m.pensouEm = agora;
    m.maoNoPensar = maoAgora;
    const perceptos = (m.perceptos = this.genPerceber(i, p, m));
    const u = (m.u = this.genUrgencias(i, p));
    const cur = this.traits[i * TRAIT_COUNT + TRAITS.indexOf('curiosity')] / 10;
    const coragem = this.traits[i * TRAIT_COUNT + TRAITS.indexOf('courage')] / 10;
    vencer(p, this.year);
    esquecer(p, (m.detalhe ? GEN.pensar : GEN.pensarLonge) / this.yearSpan);
    // Quanto vale passar a ver uma coisa com a tag `t`, ou passar a ter `mat` na mão: o melhor que as crenças dizem
    // que dá para fazer com isso (é por aqui que a pessoa encadeia até três passos).
    const idx = porVerbo(p);
    const nec = p.nec;
    // O alívio não passa do que dói agora: comer sem fome não vale o que comer com fome.
    const vale = (e: readonly number[]): number => {
      let s = 0;
      for (let n = 0; n < N; n++) s -= u[n] * (e[n] < -nec[n] ? -nec[n] : e[n]);
      return s;
    };
    const memoVer = new Map<string, number>();
    const valeVer = (t: string): number => {
      let x = memoVer.get(t);
      if (x === undefined) {
        x = 0;
        for (const m2 of idx.values()) {
          const cr = m2.get(t);
          if (cr) x = Math.max(x, vale(cr.e) * cr.c);
        }
        memoVer.set(t, x);
      }
      return x;
    };
    // O que falta aqui pode haver onde ainda não se foi: o desconhecido vale uma fração do melhor que a pessoa sabe
    // fazer com uma coisa que não está à vista agora. É o que faz alguém sair quando o lugar deixa de render (ou
    // quando falta par, água, comida): não uma regra de migrar, só a conta de quem não acha o que precisa.
    let esperanca = -1;
    let esperancaDe = '';
    const talvez = (): number => {
      if (esperanca >= 0) return esperanca;
      esperanca = 0;
      const vistas = new Set<string>();
      for (const b of perceptos) if (b.tipo !== 'lugar') for (const t in b.tags) vistas.add(t);
      for (const [v2, m2] of idx) for (const [t, cr] of m2) {
        if (vistas.has(t) || t === 'desconhecido' || t === 'lembrado') continue;
        const x = vale(cr.e) * cr.c;
        if (x > esperanca) {
          esperanca = x;
          esperancaDe = `talvez ${v2} ${t}`;
        }
      }
      return esperanca;
    };
    const memoMao = new Map<string, { x: number; nome: string }>();
    const valeMao = (mat: Material, prof: number): { x: number; nome: string } => {
      const k = `${mat}${prof}`;
      let r = memoMao.get(k);
      if (r) return r;
      r = { x: 0, nome: '' };
      memoMao.set(k, r);
      const naMao: Percepto = { id: -2, tipo: 'mao', x: this.x[i], y: this.y[i], dist: 0, tags: { naMao: 1, [TAG_DO_MATERIAL[mat]]: 1, ...(mat === 'carne' ? { comivel: 0.7 } : {}) }, t: -1, j: -1, coisa: 0, k: -1 };
      for (const b of [naMao, ...perceptos]) {
        if (b.tipo === 'mao' && b !== naMao) continue;
        for (const v2 of USA_MAO) {
          if (!this.genCabe(i, p, v2, b, mat)) continue;
          const r2 = avaliar(v2, b, mat, prof + 1);
          if (r2.total > r!.x) {
            r!.x = r2.total;
            r!.nome = `${v2} ${r2.prev.tag}${r2.cadeia ? ' → ' + r2.cadeia : ''}`;
          }
        }
      }
      return r;
    };
    const avaliar = (v: Verbo, a: Percepto, mao: Material | null, prof: number) => {
      const poe = !!mao && (v === 'largar' || v === 'empilhar' || v === 'dar');
      const tags = poe ? this.genTagsDoAto(v, a, mao) : a.tags;
      const ts = poe ? principais(tags) : (a.ts ??= principais(a.tags));
      const prev = prever(p, v, tags, m.ctx, ts, idx);
      const e = zeros();
      for (let n = 0; n < N; n++) e[n] = prev.e[n] + prev.lente[n];
      // O novo distrai: o que a pessoa nunca fez vale um pouco contra o tédio (é assim que se experimenta).
      if (prof === 0) e[NI.tedio] -= 0.3 * (1 - prev.c) * (1 + 0.5 * cur);
      const direto = vale(e);
      let adiante = 0;
      let cadeia = '';
      if (prof < 2) {
        const ter = esperaTer(p, v, tags, ts, idx);
        if (ter) for (const [k, wt] of Object.entries(ter)) {
          if (k.startsWith('ver:')) {
            const x = GEN.adiante * wt * valeVer(k.slice(4));
            if (x > adiante) {
              adiante = x;
              cadeia = k.slice(4);
            }
          } else if (k.startsWith('mao:')) {
            const mat = MATERIAL_DA_TAG[k.slice(4)];
            if (!mat || mat === mao) continue;
            const r = valeMao(mat, prof);
            const x = GEN.adiante * wt * r.x;
            if (x > adiante) {
              adiante = x;
              cadeia = r.nome;
            }
          }
        }
        // Ir até onde há uma coisa vale o que dá para fazer com ela lá (o que se sabe por tag, não por ter ido).
        if (v === 'andar') for (const [t, wt] of ts) {
          const x = GEN.adiante * wt * valeVer(t);
          if (x > adiante) {
            adiante = x;
            cadeia = t;
          }
        }
        if ((v === 'andar' || v === 'olhar') && a.tags.desconhecido) {
          const x = GEN.esperanca * talvez();
          if (x > adiante) {
            adiante = x;
            cadeia = esperancaDe;
          }
        }
      }
      return { tags, prev, e, direto, adiante, cadeia, total: direto + adiante };
    };
    const mao = p.mao?.que ?? null;
    const ops: Opcao[] = [];
    const medo = p.nec[NI.medo];
    // Cada verbo que cabe em cada coisa percebida é uma ideia. As que a pessoa não tem como avaliar (nunca fez
    // aquilo naquele tipo de coisa, nem ouviu falar) valem todas o mesmo, o gosto pelo novo: em vez de fazer a conta
    // de cada uma, ficam numa lista e só umas poucas entram na disputa (as mais à mão, variando a cada pensamento).
    type Ideia = { v: Verbo; a: Percepto; r: ReturnType<typeof avaliar> };
    const ideias: Ideia[] = [];
    const novas: { v: Verbo; a: Percepto }[] = [];
    const comLente = new Set(p.lentes.map((l) => l.v));
    const tagDaMao = mao ? TAG_DO_MATERIAL[mao] : '';
    for (const a of perceptos) {
      const ts = (a.ts ??= principais(a.tags));
      for (const v of VERBOS) {
        if (!this.genCabe(i, p, v, a, mao)) continue;
        const mv = idx.get(v);
        let sabe = v === 'andar' || (v === 'olhar' && !!a.tags.desconhecido) || comLente.has(v);
        if (!sabe && mv) {
          if (tagDaMao && mv.has(tagDaMao) && (v === 'largar' || v === 'empilhar' || v === 'dar')) sabe = true;
          else for (const [t] of ts) if (mv.has(t)) {
            sabe = true;
            break;
          }
        }
        if (sabe) ideias.push({ v, a, r: avaliar(v, a, mao, 0) });
        else novas.push({ v, a });
      }
    }
    if (novas.length) {
      const giro = m.pensou;
      novas.sort((x, y) => ((VI[x.v] * 7 + giro) % 23) - ((VI[y.v] * 7 + giro) % 23) || x.a.dist - y.a.dist || y.a.id - x.a.id);
      for (const { v, a } of novas.slice(0, 3)) ideias.push({ v, a, r: avaliar(v, a, mao, 0) });
    }
    m.geradas += ideias.length + Math.max(0, novas.length - 3);
    // O corte barato pelo benefício: a conta inteira (custo, risco, o benefício aberto por necessidade) só para as que ficam.
    ideias.sort((x, y) => y.r.total - x.r.total || VI[x.v] - VI[y.v] || y.a.id - x.a.id);
    const limite = (m.detalhe ? GEN.K : GEN.KLonge) + 10;
    const emCurso = m.brain.currentKey;
    for (let k = 0; k < ideias.length; k++) {
      const { v, a, r } = ideias[k];
      if (k >= limite && `${9000 + VI[v]}:${a.id}` !== emCurso) continue;
      // O perigo em volta do alvo (o próprio alvo não conta quando a ideia é fugir dele ou enfrentá-lo).
      let perigo = 0;
      for (const b of perceptos) if (b.tags.perigoso && b !== a && Math.hypot(b.x - a.x, b.y - a.y) < 4) perigo = Math.max(perigo, b.tags.perigoso);
      let lente = 0;
      const porNec = zeros();
      for (let n = 0; n < N; n++) {
        porNec[n] = -u[n] * Math.max(r.prev.e[n], -nec[n]);
        lente -= u[n] * r.prev.lente[n];
      }
      const custo = lim(a.dist / (GEN.vista * 2.2) + VERBO[v].tempo / 25 + (p.colo || p.gravida ? a.dist / 30 : 0));
      const risco = v === 'fugir' ? 0 : lim(Math.max(perigo, v === 'bater' ? (a.tags.perigoso ?? 0) * 0.8 + (a.tags.forte ?? 0) * 0.5 : 0) * (0.4 + medo) * (1 - 0.4 * coragem));
      ops.push({ v, a, habito: null, tags: r.tags, prev: r.prev, porNec, lente, adiante: r.adiante, cadeia: r.cadeia, beneficio: r.total, conf: r.prev.c, custo, risco, cortada: false, behavior: null, chave: `${v}|${r.prev.tag}` });
    }
    // Hábitos: a sequência que já rendeu é uma opção só, se o primeiro passo cabe agora.
    for (const h of p.habitos) {
      const [v, tag] = h.passos[0].split('|') as [Verbo, string];
      const a = perceptos.find((b) => (b.tags[tag] ?? 0) >= 0.2 && this.genCabe(i, p, v, b, mao));
      if (!a) continue;
      const porNec = zeros();
      for (let n = 0; n < N; n++) porNec[n] = -u[n] * Math.max(h.e[n], -nec[n]);
      const ben = vale(h.e);
      ops.push({ v, a, habito: h, tags: this.genTagsDoAto(v, a, mao), prev: { e: h.e.slice(), lente: zeros(), c: Math.min(1, h.n / 5), tag }, porNec, lente: 0, adiante: 0, cadeia: h.passos.slice(1).join(' → '), beneficio: ben, conf: Math.min(1, h.n / 5), custo: lim(a.dist / (GEN.vista * 2.2) + 0.15 * h.passos.length), risco: 0, cortada: false, behavior: null, chave: h.passos.join('>') });
    }
    m.pensou++;
    // O corte barato: as K melhores pelo benefício vão ao IAUS; as outras ficam (esmaecidas) só para o debug.
    ops.sort((x, y) => y.beneficio - x.beneficio || VI[x.v] - VI[y.v] || y.a.id - x.a.id);
    const K = m.detalhe ? GEN.K : GEN.KLonge;
    let dentro = 0;
    const usados = new Map<number, number>();
    const cur0 = m.brain.currentKey;
    m.porChave.clear();
    for (const o of ops) {
      const id = o.habito ? 9500 + o.habito.id : 9000 + VI[o.v];
      const key = `${id}:${o.a.id}`;
      // A ação em andamento continua na disputa mesmo que caia do corte (o foco do IAUS precisa da mesma chave).
      if (o.beneficio <= 0.004 || (dentro >= K && key !== cur0)) {
        o.cortada = true;
        continue;
      }
      dentro++;
      const cheios = usados.get(id) ?? 0;
      usados.set(id, cheios + 1);
      let fila = m.pool.get(id);
      if (!fila) m.pool.set(id, (fila = []));
      let b = fila[cheios];
      if (!b) {
        const considera: ConsiderationDef[] = [
          constante('benefício', 0, 0, 1),
          // Crença fraca vale menos; o curioso desconta menos (é ele que experimenta).
          constante('confiança', 0, lim(0.45 + 0.25 * cur, 0.2, 0.8), 1),
          constante('custo', 0, 0.3, 1),
          constante('risco', 0, 0.1, 1),
          { name: 'variar', input: In.TimeSinceThisContext, curve: linear(0.45, 0.55), params: { values: { [InputParameter.RangeMax]: 8 } } },
        ];
        const jeito = JEITO[o.v];
        if (jeito && !o.habito) {
          const f = Math.abs(jeito[1]);
          const mm = (2 * f) / (1 + f);
          const bb = (1 - f) / (1 + f);
          considera.push({ name: 'jeito', input: In.MyStat, curve: jeito[1] >= 0 ? linear(mm, bb) : linear(-mm, bb + mm), params: { stat: `tr.${jeito[0]}`, values: { [InputParameter.RangeMin]: -1, [InputParameter.RangeMax]: 1 } } });
        }
        b = fila[cheios] = new Behavior({ id, name: o.chave, behaviorType: TIPO, contextType: ContextType.SingleTarget, duration: DurationType.Continuous, weight: 1, momentum: 1.4, considerations: considera, params: { v: o.v } });
      }
      // As considerações são as mesmas; os números são os desta opção.
      const cs = b.considerations;
      cs[0].params.values![InputParameter.Value] = lim(o.beneficio / 0.6);
      cs[1].params.values![InputParameter.Value] = lim(o.conf);
      cs[2].params.values![InputParameter.Value] = lim(1 - o.custo);
      cs[3].params.values![InputParameter.Value] = lim(1 - o.risco);
      o.behavior = b;
      m.porChave.set(key, o);
    }
    m.opcoes = ops.slice(0, K + 10);
    m.brain.opcoes = ops;
    m.fila = m.detalhe ? [] : ops.filter((o) => !!o.behavior);
  },

  /** O corpo: um passo do ato em andamento. Vai até o alvo, fica o tempo do verbo, e o mundo diz o que aconteceu. */
  genAgir(this: Ecosystem, m: MenteGen, ctx: ContextInfo, dt: number): Resultado {
    const i = m.i;
    const p = this.genDe(i);
    if (!m.ato || m.ato.ctx !== ctx) {
      const op = m.porChave.get(ctx.key);
      if (!op) return 'falhou';
      m.ato = { ctx, op, fase: 'ir', at: 0, antes: p.nec.slice(), ctxTags: { ...m.ctx }, mao: p.mao?.que ?? '', passo: 0, ganho: zeros() };
      m.path = null;
      m.pathGoal = -1;
      m.best = Infinity;
      m.stall = 0;
      m.walked = 0;
    }
    const ato = m.ato;
    const { v, a } = ato.op;
    const def = VERBO[v];
    // O alvo vivo anda: a posição é a de agora (e ele pode ter morrido ou sumido).
    if (a.j >= 0) {
      if (!this.alive[a.j] || this.uid[a.j] !== a.id) return this.genFim(m, p, ato, null);
      a.x = this.x[i] + wrapDx(this.x[a.j] - this.x[i], this.map.width);
      a.y = this.y[a.j];
    }
    if (m.stall > 10 || m.walked > 45) return this.genFim(m, p, ato, null);
    this.gesture[i] = GESTURE.none;
    if (v === 'fugir') {
      // Para longe do alvo, por um tempo.
      const dx = this.x[i] - a.x;
      const dy = this.y[i] - a.y;
      const d = Math.hypot(dx, dy) || 1;
      m.goal = { x: this.x[i] + (dx / d) * 6, y: Math.max(1, Math.min(this.map.height - 2, this.y[i] + (dy / d) * 6)), reach: 0.5 };
      ato.fase = 'fazer';
      if ((ato.at += dt) < def.tempo) return 'continua';
      return this.genFim(m, p, ato, { ok: true, ref: 0, pos: [], rendeu: false });
    }
    if (a.tipo !== 'aqui' && a.tipo !== 'mao') {
      const chegou = this.genChegar(m, a.x, a.y, Math.max(def.perto, a.tipo === 'pessoa' || a.tipo === 'animal' ? 1.6 : 1.2), dt);
      if (!chegou) {
        if (ato.fase === 'fazer' && v !== 'seguir') ato.fase = 'ir';
        if (v !== 'seguir' || ato.fase === 'ir') return 'continua';
      }
    } else m.goal = null;
    if (ato.fase === 'ir') {
      // Chegou: o que sentia agora é o "antes" do ato (a caminhada é custo, não efeito).
      ato.fase = 'fazer';
      ato.antes = p.nec.slice();
      ato.at = 0;
    }
    if (v === 'seguir') p.segue = a.id;
    ato.at += dt;
    this.gesture[i] = GESTURE[def.gesto as keyof typeof GESTURE] ?? GESTURE.none;
    if (ato.at < def.tempo) return 'continua';
    return this.genFim(m, p, ato, this.genEfeito(i, p, v, a));
  },

  /** O ato acabou (ou não deu): a pessoa compara o que sentia antes e depois, corrige o que acreditava, e quem viu aprende um pouco. */
  genFim(this: Ecosystem, m: MenteGen, p: PessoaGen, ato: Ato, ef: Efeito | null): Resultado {
    const i = m.i;
    const uid = this.uid[i];
    const { op } = ato;
    const h = op.habito;
    const passos = h ? h.passos : null;
    const v = passos ? (passos[ato.passo].split('|')[0] as Verbo) : op.v;
    const a = op.a;
    const ok = !!ef?.ok;
    // O corpo de agora: a fome sai da energia, o resto já está em `nec`.
    p.nec[NI.fome] = lim((0.85 - this.energy[i]) / 0.6);
    p.nec[NI.solidao] = this.needSocial[i];
    p.nec[NI.sentido] = this.needFaith[i];
    const real = zeros();
    for (let n = 0; n < N; n++) real[n] = p.nec[n] - ato.antes[n];
    const u = m.u;
    const vReal = valor(u, real);
    const tags = this.genTagsDoAto(v, a, (ato.mao || null) as Material | null);
    const prev = passos ? prever(p, v, tags, ato.ctxTags) : op.prev;
    const esperado = zeros();
    for (let n = 0; n < N; n++) {
      esperado[n] = prev.e[n] + prev.lente[n];
      // A necessidade zerou: o alívio visto é só um piso do que a coisa dá (quem tinha pouca sede não descobre que a
      // água mata pouca sede). Se a crença já esperava mais alívio que isso, não há erro a corrigir.
      if (ok && p.nec[n] <= 0.02 && esperado[n] < real[n]) real[n] = esperado[n];
    }
    const o = { tipo: 'vivido' as const, de: 0, em: this.year };
    // O que apareceu depois: o que ficou na mão e o que passou a estar à vista (é o que deixa encadear).
    const ganhos: string[] = [];
    const maoAgora = p.mao?.que ?? '';
    if (ok && maoAgora && maoAgora !== ato.mao) ganhos.push(`mao:${TAG_DO_MATERIAL[maoAgora as Material]}`);
    if (ok && (v === 'andar' || v === 'olhar' || v === 'seguir')) {
      m.perceptos = this.genPerceber(i, p, m);
      for (const [t, w] of principais(m.ctx, 5)) if (w >= 0.4 && (ato.ctxTags[t] ?? 0) < 0.2 && t !== 'sozinho' && t !== 'noite') ganhos.push(`ver:${t}`);
      // Quem olhou um lugar novo passa a lembrar dele.
      if (v !== 'seguir') lembrarLugar(p, this.x[i], this.y[i], m.ctx, 0.2, this.year);
    }
    let surpresa = 0;
    // Mexi numa coisa (ou em alguém) e nada veio agora: o veredito fica para depois (ver `creditar`).
    const adiado = ok && ef!.ref !== 0 && Math.abs(vReal) < 0.03 && !ef!.rendeu;
    if (adiado) {
      lembrarAto(p, ef!.ref, v, ef!.pos.length ? ef!.pos : principais(tags, 2).map((t) => t[0]), this.year);
      if (ganhos.length) aprender(p, v, tags, esperado, esperado, GEN.aprende, o, ganhos);
    } else surpresa = aprender(p, v, tags, esperado, real, ok ? GEN.aprende : GEN.aprende * 0.6, o, ganhos);
    if (ok) {
      if (ef!.rendeu && ef!.ref) creditar(p, ef!.ref, real, this.year);
      const residuo = zeros();
      // A surpresa em relação à crença sozinha (sem as lentes): é ela que, separada por contexto, faz a lente.
      for (let n = 0; n < N; n++) residuo[n] = p.nec[n] <= 0.02 && prev.e[n] < real[n] ? 0 : real[n] - prev.e[n];
      contextualizar(p, v, ato.ctxTags, residuo, this.year);
      // O novo distrai de verdade.
      if (prev.c < 0.3) p.nec[NI.tedio] = Math.max(0, p.nec[NI.tedio] - 0.3);
      if (Math.abs(vReal) > 0.06) lembrarLugar(p, this.x[i], this.y[i], { ...m.ctx, ...(a.tipo === 'aqui' || a.dist < 3 ? Object.fromEntries(principais(a.tags, 3)) : {}) }, vReal * 2, this.year);
      if (v === 'dormir') {
        const d = p.dormiuEm;
        if (d && Math.hypot(wrapDx(d.x - this.x[i], this.map.width), d.y - this.y[i]) < 4) {
          if (ato.passo === 0 && this.year - (p.linha[1]?.em ?? -9) > 0.5) d.noites++;
        } else p.dormiuEm = { x: this.x[i], y: this.y[i], noites: 1 };
      }
      // Quem está perto e acordado vê o que foi feito e o que aconteceu, e aprende um pouco (os dois mais perto).
      if (Math.abs(vReal) >= 0.05) {
        let vistos = 0;
        for (const b of m.perceptos) {
          if (b.tipo !== 'pessoa' || b.dist > 6 || b.tags.dormindo || b.tags.bebe || vistos >= 2) continue;
          const pb = this.gen!.pessoas.get(b.id);
          if (!pb) continue;
          vistos++;
          aprender(pb, v, tags, prever(pb, v, tags, {}).e, real, GEN.aprende * GEN.visto, { tipo: 'visto', de: uid, em: this.year }, ganhos);
        }
      }
    }
    const k = `${v}|${prev.tag}`;
    for (let n = 0; n < N; n++) ato.ganho[n] += real[n];
    const reg = p.linha[0];
    const fecha = (fim: 'feito' | 'falhou') => {
      if (reg && reg.fim === '') {
        reg.real = valor(u, ato.ganho);
        reg.fim = fim;
        reg.surpresa = surpresa > 0.35;
      }
      m.feita = ato.ctx.key;
      m.ato = null;
      m.goal = null;
      return fim;
    };
    if (!ok) {
      if (h) falharHabito(p, h.id);
      return fecha('falhou');
    }
    if (!h) {
      encadear(p, k, real, vReal, this.year, () => this.gen!.proxHabito++, ganhos.length > 0);
      return fecha('feito');
    }
    // Hábito: o passo seguinte, na coisa mais à mão com a tag dele.
    if (ato.passo + 1 >= h.passos.length) {
      h.n = Math.min(99, h.n + 1);
      for (let n = 0; n < N; n++) h.e[n] += (ato.ganho[n] - h.e[n]) * 0.25;
      p.antes = { chave: h.passos.slice(-2).join('>'), em: this.year, ganho: valor(u, ato.ganho), abriu: false };
      return fecha('feito');
    }
    const [v2, tag2] = h.passos[ato.passo + 1].split('|') as [Verbo, string];
    m.perceptos = this.genPerceber(i, p, m);
    const mao = p.mao?.que ?? null;
    const b = m.perceptos.filter((x) => (x.tags[tag2] ?? 0) >= 0.2 && this.genCabe(i, p, v2, x, mao)).sort((x, y) => x.dist - y.dist || y.id - x.id)[0];
    if (!b) {
      falharHabito(p, h.id);
      return fecha('falhou');
    }
    ato.passo++;
    ato.op = { ...op, v: v2, a: b };
    ato.fase = 'ir';
    ato.at = 0;
    ato.antes = p.nec.slice();
    ato.ctxTags = { ...m.ctx };
    ato.mao = mao ?? '';
    m.best = Infinity;
    m.stall = 0;
    m.path = null;
    return 'continua';
  },

  /** Marca o destino e diz se já chegou; conta o tempo andando e o tempo sem chegar mais perto. */
  genChegar(this: Ecosystem, m: MenteGen, x: number, y: number, reach: number, dt: number): boolean {
    m.goal = { x, y, reach };
    const d = this.genDist(m.i, x, y);
    if (d <= reach) return true;
    m.walked += dt;
    if (d < m.best - 0.4) {
      m.best = d;
      m.stall = 0;
    } else m.stall += dt;
    return false;
  },

  /** Para onde andar agora rumo ao destino: perto, em linha reta; longe, pelo caminho (refeito no máximo a cada 1,5 s). */
  genAndar(this: Ecosystem, m: MenteGen, dt: number): { x: number; y: number } | null {
    const i = m.i;
    const g = m.goal;
    if (!g) return null;
    const w = this.map.width;
    const dx = wrapDx(g.x - this.x[i], w);
    const dy = g.y - this.y[i];
    if (dx * dx + dy * dy <= g.reach * g.reach) return null;
    // Em linha reta enquanto chega mais perto; emperrou, procura o caminho (achar caminho é caro: só quando precisa).
    if (dx * dx + dy * dy < 9 || (m.stall < 1.2 && !m.path)) return { x: dx, y: dy };
    const goal = this.tileAt(g.x, Math.floor(g.y));
    if (goal < 0) return { x: dx, y: dy };
    m.pathAge += dt;
    const here = this.tileOf(i);
    if (goal !== m.pathGoal && (m.pathAge > 1.5 || !m.path)) {
      m.path = this.findPath(i, goal);
      m.pathGoal = goal;
      m.pathAge = 0;
    }
    const path = m.path;
    if (!path) return { x: dx, y: dy };
    const k = path.indexOf(here);
    if (k >= 0) path.splice(0, k + 1);
    if (!path.length) return { x: dx, y: dy };
    const t = path[0];
    return { x: wrapDx((t % w) + 0.5 - this.x[i], w), y: Math.floor(t / w) + 0.5 - this.y[i] };
  },

  /** Larga as mentes de quem morreu (o que a pessoa sabia sai junto, em `genFisica`). */
  genEsquecerMentes(this: Ecosystem): void {
    const all = mentes(this);
    for (const [uid, m] of all) if (!this.alive[m.i] || this.uid[m.i] !== uid) all.delete(uid);
  },
};
export type GenMentePart = typeof genMentePart;
