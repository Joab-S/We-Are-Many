/**
 * Ponte entre o IAUS (o motor em src/IAUS) e as decisões das pessoas do mundo.
 *
 * Cada decisão (o ofício, o líder, ficar ou sair, a jornada) vira uma `Mind`: um conjunto fixo de
 * Behaviors do IAUS, cada um com as suas Considerations (input → normalização → Response Curve). As
 * opções do momento (os ofícios do lugar, os candidatos, os lugares ao alcance, as tarefas do quadro)
 * entram como alvos dos Behaviors (Context Type SingleTarget); opções sem alvo (ficar, comer,
 * descansar) usam o Context Type Self. Quem pontua e sorteia é o próprio `Brain` do IAUS, com a
 * compensação pelo número de considerations e a seleção WeightedRandomTop dentro de uma fração da
 * melhor (a "faixa" de cada pessoa: a paciente fica quase sempre com a melhor, a impulsiva varia mais).
 *
 * O ciclo de pensamento em tempo real do IAUS (vizinhos, histórico, Behavior Types) não é usado aqui:
 * a simulação chama cada decisão quando ela acontece (uma vez por ano, ao terminar uma tarefa...), e o
 * sorteio usa o gerador do mundo (fluxo `mente`), então a mesma semente continua dando a mesma história.
 */
import {
  AiEntity,
  Behavior,
  Brain,
  ContextInfo,
  ContextType,
  CurveType,
  Decision,
  DurationType,
  InputParameter,
  Inputs,
  SelectionMode,
  type ResponseCurveDef,
  type SelectionConfig,
  type World,
} from '../index';

/** Forma de uma consideration: a curva do IAUS e, se o input não vier de 0 a 1, a faixa dele. */
export interface Axis {
  curve: ResponseCurveDef;
  /** Valor bruto que vira x = 0 (RangeMin). Padrão: 0. */
  min?: number;
  /** Valor bruto que vira x = 1 (RangeMax). Padrão: 1. */
  max?: number;
}

/** Curvas usadas pelas decisões, já como Response Curves do IAUS. */
export const axes = {
  /** Reta de `lo` (em x = 0) a `hi` (em x = 1). */
  linear: (lo = 0, hi = 1): Axis => ({ curve: { type: CurveType.Linear, m: hi - lo, b: lo } }),
  /** Sobe devagar e acelera (exp > 1) ou sobe rápido e satura (exp < 1), de `lo` a `hi`. */
  power: (exp: number, lo = 0, hi = 1): Axis => ({ curve: { type: CurveType.Polynomial, m: hi - lo, k: exp, b: lo } }),
  /** Em S, centrada em `mid`, com inclinação `k`. */
  logistic: (mid = 0.5, k = 10): Axis => ({ curve: { type: CurveType.Logistic, m: k, k: 1, b: 0, c: mid } }),
  /**
   * Traço de −1 a 1 vira um fator: (1 − força) / (1 + força) no extremo de baixo, 1 no de cima. O input
   * vai de −`range` a `range` (RangeMin e RangeMax; uma soma de traços pode passar de 1), e a reta do IAUS
   * dá (1 + força × traço) / (1 + força), cortada em 0 e 1.
   */
  trait: (strength = 0.5, range = 1): Axis => ({
    curve: { type: CurveType.Linear, m: (2 * range * strength) / (1 + strength), b: (1 - range * strength) / (1 + strength) },
    min: -range,
    max: range,
  }),
  /** O input já é a utilidade (de 0 a 1): para formas que o IAUS não tem, calculadas no próprio input. */
  identity: (): Axis => ({ curve: { type: CurveType.Linear, m: 1, b: 0 } }),
};

/** Uma consideration de uma decisão: o nome que aparece no porquê, o input e a curva. */
export interface AxisDef<C, D> {
  name: string;
  input: (c: C, data: D) => number;
  axis: Axis;
}

/** Um Behavior de uma decisão. Com `targeted`, cada opção é um alvo (SingleTarget); sem, a opção é a própria pessoa (Self). */
export interface ActDef<C, D> {
  name: string;
  weight?: number;
  targeted?: boolean;
  considerations: AxisDef<C, D>[];
}

/** Uma opção do momento: qual Behavior, o que acontece se ela ganhar, o nome no porquê e o dado que os inputs leem. */
export interface OptionDef<A, D> {
  act: number;
  action: A;
  label: string;
  data: D;
}

export interface Factor {
  name: string;
  value: number;
}

export interface Scored<A> {
  action: A;
  label: string;
  score: number;
  /** Considerations em ordem de quanto pesaram (as mais baixas puxam mais a nota para baixo). */
  factors: Factor[];
}

export interface Choice<A> {
  pick: Scored<A>;
  /** As outras opções avaliadas, da melhor para a pior. */
  others: Scored<A>[];
}

/** Quem decide: o contexto da decisão vai junto da entidade, e os inputs o leem pelo `owner`. */
class Thinker<C> extends AiEntity {
  ctx: C | null = null;
}

/** Uma opção vista pelo IAUS como alvo. */
class Target<D> extends AiEntity {
  data: D | null = null;
}

/** O mundo do IAUS: as decisões não usam vizinhos nem relógio (o tempo é o ano da simulação). */
const WORLD: World = { now: () => 0, entities: () => [], getEntity: () => undefined };

let nextEntity = 1;

/**
 * Uma decisão do IAUS: os Behaviors são montados uma vez (dados), e cada chamada de `decide` só troca
 * o contexto, as opções e o sorteio.
 */
export class Mind<C, D> {
  private readonly me: Thinker<C>;
  private readonly brain: Brain;
  private readonly behaviors: Behavior[];
  private readonly selection: SelectionConfig = { mode: SelectionMode.WeightedRandomTop, withinFractionOfBest: 0.7 };
  /** Alvos reaproveitados entre chamadas, pela posição da opção (com buracos nas posições sem alvo). */
  private readonly pool: (Target<D> | undefined)[] = [];
  private rnd: () => number = () => 0;

  constructor(
    readonly name: string,
    acts: ActDef<C, D>[],
  ) {
    this.me = new Thinker<C>({ id: nextEntity++, name, type: 'pessoa' });
    this.brain = new Brain(this.me, WORLD, {
      selection: this.selection,
      // Qualquer nota acima de zero entra no sorteio (sem o piso de 0,0001 do IAUS).
      minScore: Number.MIN_VALUE,
      useCompensation: true,
      // Guarda a nota de cada consideration: é o porquê que vai para o diário e para a ficha.
      debug: true,
      rng: { next: () => this.rnd() },
    });
    this.behaviors = acts.map((a, id) => {
      const considerations = a.considerations.map((x) => {
        const input = `${name}.${a.name}.${x.name}`;
        Inputs.register(input, (ci: ContextInfo) => {
          const t = ci.target;
          return x.input((ci.owner as Thinker<C>).ctx as C, (t instanceof Target ? t.data : null) as D);
        });
        const values: Partial<Record<InputParameter, number>> = {};
        if (x.axis.min !== undefined) values[InputParameter.RangeMin] = x.axis.min;
        if (x.axis.max !== undefined) values[InputParameter.RangeMax] = x.axis.max;
        return { name: x.name, input, curve: x.axis.curve, params: { values } };
      });
      return new Behavior({
        id,
        name: a.name,
        behaviorType: 'Idle',
        contextType: a.targeted ? ContextType.SingleTarget : ContextType.Self,
        duration: DurationType.Instant,
        weight: a.weight ?? 1,
        considerations,
      });
    });
  }

  /**
   * Pontua as opções e escolhe uma: sorteio ponderado entre as que têm nota de pelo menos `band` da melhor.
   * Sem opção, devolve null; se todas zeram, fica com a primeira (a escolha "do que tinha").
   */
  decide<A>(ctx: C, options: OptionDef<A, D>[], rnd: () => number, band: number): Choice<A> | null {
    if (!options.length) return null;
    this.me.ctx = ctx;
    this.rnd = rnd;
    this.selection.withinFractionOfBest = band;
    const decisions = options.map((o, k) => {
      const b = this.behaviors[o.act];
      let target: AiEntity = this.me;
      if (b.isTargeted) {
        const t = (this.pool[k] ??= new Target<D>({ id: nextEntity++, name: `${this.name}:${k}`, type: 'opção' }));
        t.data = o.data;
        target = t;
      }
      return new Decision(new ContextInfo(this.brain, b, this.me, target));
    });
    this.brain.decisions = decisions;
    const chosen = this.brain.selectDecision();
    const scored = decisions.map((d, k) => {
      const o = options[k];
      const factors = d.breakdown.map((x) => ({ name: x.name, value: x.score })).sort((p, q) => p.value - q.value);
      return { d, s: { action: o.action, label: o.label, score: d.score, factors } as Scored<A> };
    });
    const order = scored.slice().sort((p, q) => q.s.score - p.s.score);
    const pick = (chosen ? scored.find((x) => x.d === chosen) : undefined) ?? order[0];
    // Solta as referências (o contexto e as opções são da simulação).
    this.me.ctx = null;
    for (const t of this.pool) if (t) t.data = null;
    this.brain.decisions = [];
    return { pick: pick.s, others: order.filter((x) => x !== pick).map((x) => x.s) };
  }
}

const fmt = (n: number) => n.toFixed(2).replace('.', ',');

/** As três considerations que mais ajudaram, em texto: "fome 0,90 · corajoso 0,80". */
export function topFactors(factors: Factor[]): string {
  return factors
    .slice()
    .sort((p, q) => q.value - p.value)
    .slice(0, 3)
    .map((x) => `${x.name} ${fmt(x.value)}`)
    .join(' · ');
}

/** Texto curto do porquê: "caçar (0,62): fome 0,9 · corajoso 0,8; depois coletar (0,41)". */
export function explain<A>(c: Choice<A>, name: (s: Scored<A>) => string = (s) => s.label): string {
  const next = c.others.slice(0, 2).map((o) => `${name(o)} (${fmt(o.score)})`).join(', ');
  return `${name(c.pick)} (${fmt(c.pick.score)}): ${topFactors(c.pick.factors)}${next ? `; depois ${next}` : ''}`;
}
