// consideration.ts — Consideration = Input → normalização → Response Curve → 0..1.
//
// No manual, GetInputValue é um switch gigante sobre o enum ConsiderationInput.
// Aqui ele vira um registro de funções: você adiciona inputs do seu jogo com
// Inputs.register(...) sem tocar no núcleo. Um input desconhecido lança erro
// (melhor que devolver um valor ruim em silêncio).
//
// Considerations NÃO guardam estado: tudo vem do ContextInfo.

import type { ContextInfo } from './context';
import { InputParameter } from './enums';
import { clamp01, distance, normalize } from './math';
import { ResponseCurve, ResponseCurveDef } from './responseCurve';

export interface ConsiderationParams {
  /** Parâmetros numéricos esparsos (RangeMin, RangeMax, Value…). */
  values?: Partial<Record<InputParameter, number>>;
  /** Tag a testar (inputs HasTag). */
  tag?: string;
  /** Nome do stat (inputs MyStat / TargetStat). */
  stat?: string;
  /** Nome da camada do Imap. */
  layer?: string;
  /** Id de behavior / tipo para inputs de histórico de outro behavior. */
  behaviorId?: number;
  behaviorType?: string;
}

/**
 * Função de input. Devolve um valor BRUTO; a Consideration normaliza com
 * RangeMin/RangeMax. Inputs já normalizados (0..1) devem usar o default
 * RangeMin = 0, RangeMax = 1.
 */
export type InputFn = (ctx: ContextInfo, p: ConsiderationParams) => number;

export class Inputs {
  private static readonly fns = new Map<string, InputFn>();

  static register(name: string, fn: InputFn): void {
    Inputs.fns.set(name, fn);
  }
  static get(name: string): InputFn {
    const fn = Inputs.fns.get(name);
    if (!fn) throw new Error(`Input de consideration desconhecido: "${name}"`);
    return fn;
  }
  static has(name: string): boolean {
    return Inputs.fns.has(name);
  }
}

export interface ConsiderationDef {
  name: string;
  input: string;
  curve: ResponseCurveDef | ResponseCurve;
  params?: ConsiderationParams;
}

export class Consideration {
  readonly name: string;
  readonly input: string;
  readonly curve: ResponseCurve;
  readonly params: ConsiderationParams;
  private readonly fn: InputFn;

  constructor(def: ConsiderationDef) {
    this.name = def.name;
    this.input = def.input;
    this.curve = def.curve instanceof ResponseCurve ? def.curve : new ResponseCurve(def.curve);
    this.params = def.params ?? {};
    this.fn = Inputs.get(def.input); // falha cedo, no carregamento dos dados
  }

  getParameterOrDefault(p: InputParameter, fallback: number): number {
    return this.params.values?.[p] ?? fallback;
  }

  /** Valor bruto do input. */
  getInputValue(ctx: ContextInfo): number {
    return this.fn(ctx, this.params);
  }

  /** x normalizado 0..1 usando os "bookends" RangeMin/RangeMax. */
  getNormalizedInput(ctx: ContextInfo): number {
    const raw = this.getInputValue(ctx);
    const min = this.getParameterOrDefault(InputParameter.RangeMin, 0);
    const max = this.getParameterOrDefault(InputParameter.RangeMax, 1);
    if (raw === Infinity) return 1; // ex.: "nunca fiz isso" = tempo máximo
    return normalize(raw, min, max);
  }

  /** Único ponto de entrada público para a pontuação. */
  getScore(ctx: ContextInfo): number {
    return clamp01(this.curve.evaluate(this.getNormalizedInput(ctx)));
  }
}

// ---------------------------------------------------------------------------
// Inputs embutidos. Registre os do seu jogo do mesmo jeito.
// ---------------------------------------------------------------------------

const boolToNum = (b: boolean): number => (b ? 1 : 0);

/** Nomes dos inputs embutidos (para evitar erro de digitação). */
export const In = {
  Constant: 'Constant',
  MyHealth: 'MyHealth',
  TargetHealth: 'TargetHealth',
  MyStat: 'MyStat',
  TargetStat: 'TargetStat',
  DistanceToTarget: 'DistanceToTarget',
  MyHasTag: 'MyHasTag',
  TargetHasTag: 'TargetHasTag',
  TargetIsEnemy: 'TargetIsEnemy',
  TargetIsAlly: 'TargetIsAlly',
  TargetIsAlive: 'TargetIsAlive',
  IsCurrentDecision: 'IsCurrentDecision',
  TimeSinceThisBehavior: 'TimeSinceThisBehavior',
  TimeSinceThisContext: 'TimeSinceThisContext',
  TimeSinceBehavior: 'TimeSinceBehavior',
  TimeSinceBehaviorType: 'TimeSinceBehaviorType',
  CurrentRuntime: 'CurrentRuntime',
  NeighborCount: 'NeighborCount',
  EnemyCountNear: 'EnemyCountNear',
  ImapAtSelf: 'ImapAtSelf',
  ImapAtTarget: 'ImapAtTarget',
  ImapBestInRange: 'ImapBestInRange',
} as const;

Inputs.register(In.Constant, (_c, p) => p.values?.[InputParameter.Value] ?? 1);

Inputs.register(In.MyHealth, (c) => c.owner.healthRatio());
Inputs.register(In.TargetHealth, (c) => (c.target ? c.target.healthRatio() : 0));

Inputs.register(In.MyStat, (c, p) => c.owner.stat(p.stat ?? ''));
Inputs.register(In.TargetStat, (c, p) => (c.target ? c.target.stat(p.stat ?? '') : 0));

// Bruto em unidades do mundo: use RangeMax (ex.: 20 m) para normalizar.
Inputs.register(In.DistanceToTarget, (c) =>
  c.target ? distance(c.owner.position, c.target.position) : Infinity,
);

Inputs.register(In.MyHasTag, (c, p) => boolToNum(!!p.tag && c.owner.tags.has(p.tag, c.now)));
Inputs.register(In.TargetHasTag, (c, p) =>
  boolToNum(!!p.tag && !!c.target && c.target.tags.has(p.tag, c.now)),
);
Inputs.register(In.TargetIsEnemy, (c) => boolToNum(!!c.target && c.owner.isEnemyOf(c.target)));
Inputs.register(In.TargetIsAlly, (c) => boolToNum(!!c.target && c.owner.isAllyOf(c.target)));
Inputs.register(In.TargetIsAlive, (c) => boolToNum(!!c.target && c.target.isAlive(c.now)));

/** 1 se este context é o que o agente está executando agora. */
Inputs.register(In.IsCurrentDecision, (c) => boolToNum(c.brain.currentKey === c.key));

// Históricos — devolvem segundos (Infinity = nunca). Normalize com RangeMax (ex.: 30 s).
Inputs.register(In.TimeSinceThisBehavior, (c) =>
  c.brain.history.timeSinceBehavior(c.behavior.id, c.now),
);
Inputs.register(In.TimeSinceThisContext, (c) =>
  c.brain.history.timeSinceContext(c.behavior.id, c.target?.id ?? null, c.now),
);
Inputs.register(In.TimeSinceBehavior, (c, p) =>
  p.behaviorId === undefined ? Infinity : c.brain.history.timeSinceBehavior(p.behaviorId, c.now),
);
Inputs.register(In.TimeSinceBehaviorType, (c, p) =>
  c.brain.history.timeSinceBehaviorType(p.behaviorType ?? c.behavior.behaviorType, c.now),
);
/** Há quanto tempo o behavior atual está rodando (0 se não é o atual). */
Inputs.register(In.CurrentRuntime, (c) => c.brain.currentRuntime(c.key));

Inputs.register(In.NeighborCount, (c) => c.brain.neighbors.length);
Inputs.register(In.EnemyCountNear, (c, p) => {
  const r = p.values?.[InputParameter.Value] ?? Infinity;
  return c.brain.neighbors.filter(
    (n) => c.owner.isEnemyOf(n) && n.isAlive(c.now) && distance(c.owner.position, n.position) <= r,
  ).length;
});

// Imap — valores normalizados pelo máximo da camada (0..1).
Inputs.register(In.ImapAtSelf, (c, p) => {
  const imap = c.brain.imap;
  return imap && p.layer && imap.has(p.layer) ? imap.layer(p.layer).normalizedAt(c.owner.position) : 0;
});
Inputs.register(In.ImapAtTarget, (c, p) => {
  const imap = c.brain.imap;
  return imap && p.layer && c.target && imap.has(p.layer)
    ? imap.layer(p.layer).normalizedAt(c.target.position)
    : 0;
});
/** Melhor valor da camada dentro de Value metros do agente (para LocationTarget). */
Inputs.register(In.ImapBestInRange, (c, p) => {
  const imap = c.brain.imap;
  if (!imap || !p.layer || !imap.has(p.layer)) return 0;
  const layer = imap.layer(p.layer);
  const best = layer.findBest(c.owner.position, p.values?.[InputParameter.Value] ?? 10);
  const max = layer.maxValue();
  return best && max > 0 ? best.value / max : 0;
});
