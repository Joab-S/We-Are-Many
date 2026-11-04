// behavior.ts — Behavior (o "porquê") e Behavior-Ability Pair.
//
// Um Behavior é só dados: considerations que dizem se a ação é adequada agora,
// o Behavior Type que diz O QUE fazer, o Context Type que diz como pontuar,
// a Duration e parâmetros próprios. Não tem código de execução.

import { Consideration, ConsiderationDef } from './consideration';
import { ContextType, DurationType } from './enums';
import type { WorldObjectType } from './aiEntity';

export interface BehaviorDef {
  id: number;
  name: string;
  description?: string;
  /** Nome de um Behavior Type registrado (MoveToTarget, Ability, Wander…). */
  behaviorType: string;
  contextType: ContextType;
  duration: DurationType;
  /**
   * Peso/prioridade do behavior. Multiplica o produto das considerations.
   * Convenção útil: 1 = ocioso/ambiente, 2 = social/útil, 3 = combate, 5 = emergência.
   */
  weight?: number;
  considerations: (Consideration | ConsiderationDef)[];
  /** Parâmetros usados pelo Behavior Type ao executar (velocidade, dano, alcance…). */
  params?: Record<string, number | string | boolean>;
  /** Filtro rápido de alvos por World Object Type (antes de pontuar). */
  targetTypes?: WorldObjectType[];
  /**
   * Bônus de momento para Continuous enquanto este behavior é o atual.
   * Padrão do manual: 1.25 (+25%).
   */
  momentum?: number;
}

export class Behavior {
  readonly id: number;
  readonly name: string;
  readonly description: string;
  readonly behaviorType: string;
  readonly contextType: ContextType;
  readonly duration: DurationType;
  readonly weight: number;
  readonly considerations: Consideration[];
  readonly params: Readonly<Record<string, number | string | boolean>>;
  readonly targetTypes: readonly WorldObjectType[] | null;
  readonly momentum: number;

  constructor(def: BehaviorDef) {
    this.id = def.id;
    this.name = def.name;
    this.description = def.description ?? '';
    this.behaviorType = def.behaviorType;
    this.contextType = def.contextType;
    this.duration = def.duration;
    this.weight = def.weight ?? 1;
    this.considerations = def.considerations.map((c) =>
      c instanceof Consideration ? c : new Consideration(c),
    );
    this.params = { ...(def.params ?? {}) };
    this.targetTypes = def.targetTypes ? [...def.targetTypes] : null;
    this.momentum = def.momentum ?? 1.25;
  }

  get isTargeted(): boolean {
    return (
      this.contextType === ContextType.SingleTarget ||
      this.contextType === ContextType.SingleTargetOnSelf
    );
  }

  numParam(name: string, fallback: number): number {
    const v = this.params[name];
    return typeof v === 'number' ? v : fallback;
  }
  strParam(name: string, fallback: string): string {
    const v = this.params[name];
    return typeof v === 'string' ? v : fallback;
  }
}

/**
 * Behavior-Ability Pair: um behavior compartilhado ("por que atacar corpo a
 * corpo") + uma habilidade concreta ("o que fazer": soco, espada, mordida).
 * O behavior desses pares usa o Behavior Type "Ability".
 */
export interface BehaviorAbilityPair {
  behavior: Behavior;
  abilityId: string;
}
