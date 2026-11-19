// behaviorTypes.ts — Behavior Types (o "o quê") e Abilities.
//
// Behavior Type ≈ o botão que o jogador apertaria: MoveToTarget, FaceTarget,
// PlayAnimation, Ability… Cada um é uma classe. O Brain cria uma instância
// quando a decisão começa e chama:
//   setup()   — uma vez, quando a decisão é escolhida
//   execute() — na seleção e, se Continuous, a cada novo ciclo de pensamento
//   update()  — opcional, a cada frame (movimento suave, animação)
//   isDone()  — Continuous termina sozinho? (chegou, alvo morreu…)
//   end()     — quando é substituído ou termina

import type { ContextInfo } from './context';
import { Vec2, distance } from './math';

export abstract class BehaviorTypeBase {
  constructor(protected readonly ctx: ContextInfo) {}
  setup(): void {}
  abstract execute(): void;
  update(_dt: number): void {}
  isDone(): boolean {
    return false;
  }
  end(): void {}
}

export type BehaviorTypeFactory = (ctx: ContextInfo) => BehaviorTypeBase;

export class BehaviorTypes {
  private static readonly factories = new Map<string, BehaviorTypeFactory>();

  static register(name: string, factory: BehaviorTypeFactory): void {
    BehaviorTypes.factories.set(name, factory);
  }
  static create(name: string, ctx: ContextInfo): BehaviorTypeBase {
    const f = BehaviorTypes.factories.get(name);
    if (!f) throw new Error(`Behavior Type não registrado: "${name}"`);
    return f(ctx);
  }
  static has(name: string): boolean {
    return BehaviorTypes.factories.has(name);
  }
}

// ---------------------------------------------------------------------------
// Abilities (o "o quê" das Behavior-Ability Pairs)
// ---------------------------------------------------------------------------

export interface Ability {
  id: string;
  name: string;
  /** Executa o efeito. Devolva true se a habilidade terminou. */
  perform(ctx: ContextInfo, dt: number): boolean;
}

export class Abilities {
  private static readonly map = new Map<string, Ability>();
  static register(a: Ability): void {
    Abilities.map.set(a.id, a);
  }
  static get(id: string): Ability {
    const a = Abilities.map.get(id);
    if (!a) throw new Error(`Ability não registrada: "${id}"`);
    return a;
  }
}

// ---------------------------------------------------------------------------
// Behavior Types embutidos (genéricos; troque os efeitos pelo seu motor)
// ---------------------------------------------------------------------------

/** Não faz nada (útil para "ficar parado", "pensar"). */
export class IdleType extends BehaviorTypeBase {
  execute(): void {}
}

/** Move o dono até o alvo/posição a `speed` unidades/s; termina ao chegar em `stopDistance`. */
export class MoveToTargetType extends BehaviorTypeBase {
  private dest: Vec2 | null = null;

  setup(): void {
    this.dest = this.ctx.target?.position ?? this.ctx.location;
  }
  execute(): void {
    // Revalida o destino a cada ciclo (o alvo pode ter andado).
    this.dest = this.ctx.target?.position ?? this.ctx.location ?? this.dest;
  }
  update(dt: number): void {
    if (!this.dest) return;
    const o = this.ctx.owner.position;
    const speed = this.ctx.behavior.numParam('speed', 3);
    const d = distance(o, this.dest);
    const stop = this.ctx.behavior.numParam('stopDistance', 1);
    if (d <= stop) return;
    const step = Math.min(speed * dt, d - stop);
    o.x += ((this.dest.x - o.x) / d) * step;
    o.y += ((this.dest.y - o.y) / d) * step;
  }
  isDone(): boolean {
    if (!this.dest) return true;
    return distance(this.ctx.owner.position, this.dest) <= this.ctx.behavior.numParam('stopDistance', 1) + 1e-6;
  }
}

/** Vaga até um ponto aleatório perto (StandAlone). */
export class WanderType extends MoveToTargetType {
  setup(): void {
    const r = this.ctx.behavior.numParam('radius', 5);
    const rng = this.ctx.brain.rng;
    const o = this.ctx.owner.position;
    const a = rng.next() * Math.PI * 2;
    this.ctx.location = { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
    super.setup();
  }
}

/** Afasta-se do alvo (fugir). */
export class FleeFromTargetType extends BehaviorTypeBase {
  execute(): void {}
  update(dt: number): void {
    const t = this.ctx.target;
    if (!t) return;
    const o = this.ctx.owner.position;
    const d = Math.max(1e-6, distance(o, t.position));
    const speed = this.ctx.behavior.numParam('speed', 4);
    o.x += ((o.x - t.position.x) / d) * speed * dt;
    o.y += ((o.y - t.position.y) / d) * speed * dt;
  }
}

/** Dispara um evento de animação/emote (Instant). Ligue `onAnimation` ao seu motor. */
export class PlayAnimationType extends BehaviorTypeBase {
  static onAnimation: (ctx: ContextInfo, anim: string) => void = () => {};
  execute(): void {
    PlayAnimationType.onAnimation(this.ctx, this.ctx.behavior.strParam('animation', this.ctx.behavior.name));
  }
}

/** Executa a Ability da Behavior-Ability Pair. */
export class AbilityType extends BehaviorTypeBase {
  private done = false;
  private readonly ability: Ability;
  constructor(ctx: ContextInfo) {
    super(ctx);
    if (!ctx.abilityId) throw new Error(`Behavior "${ctx.behavior.name}" usa Ability sem abilityId`);
    this.ability = Abilities.get(ctx.abilityId);
  }
  execute(): void {
    this.done = this.ability.perform(this.ctx, 0);
  }
  update(dt: number): void {
    if (!this.done) this.done = this.ability.perform(this.ctx, dt);
  }
  isDone(): boolean {
    return this.done;
  }
}

BehaviorTypes.register('Idle', (c) => new IdleType(c));
BehaviorTypes.register('MoveToTarget', (c) => new MoveToTargetType(c));
BehaviorTypes.register('Wander', (c) => new WanderType(c));
BehaviorTypes.register('FleeFromTarget', (c) => new FleeFromTargetType(c));
BehaviorTypes.register('PlayAnimation', (c) => new PlayAnimationType(c));
BehaviorTypes.register('Ability', (c) => new AbilityType(c));
