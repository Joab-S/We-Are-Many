// context.ts — Context, ContextInfo e Decision.
//
// Context  = Behavior desejado + alvo do Behavior.
// Decision = um Behavior pontuado dentro de um Context ("atacar Chuck" e
//            "atacar Ralph" são duas decisões diferentes).
// ContextInfo carrega tudo o que é preciso para pontuar e executar.

import type { AiEntity } from './aiEntity';
import type { Behavior } from './behavior';
import type { Brain } from './brain';
import { ContextType } from './enums';
import { contextKey } from './history';
import type { Vec2 } from './math';

export class ContextInfo {
  /** Posição alvo (LocationTarget); calculada na execução se ainda não existir. */
  location: Vec2 | null = null;

  constructor(
    readonly brain: Brain,
    readonly behavior: Behavior,
    /** Dono do behavior (o agente que pensa). */
    readonly owner: AiEntity,
    /** Alvo, se houver (SingleTarget / SingleTargetOnSelf). */
    readonly target: AiEntity | null,
    /** Id de habilidade, quando o behavior veio de uma Behavior-Ability Pair. */
    readonly abilityId: string | null = null,
  ) {}

  /** Sobre quem o efeito recai. */
  get executeOn(): AiEntity | null {
    switch (this.behavior.contextType) {
      case ContextType.SingleTarget:
        return this.target;
      case ContextType.Self:
      case ContextType.SingleTargetOnSelf:
        return this.owner;
      default:
        return null;
    }
  }

  get key(): string {
    // A chave inclui a habilidade para distinguir o mesmo behavior com abilities diferentes.
    return `${contextKey(this.behavior.id, this.target?.id ?? null)}${this.abilityId ? '#' + this.abilityId : ''}`;
  }

  /** Atalho: tempo atual do mundo. */
  get now(): number {
    return this.brain.world.now();
  }
}

/** Uma entrada da lista de decisões de um ciclo de pensamento. */
export class Decision {
  score = 0;
  /** Score de cada consideration (para depuração). */
  readonly breakdown: { name: string; score: number }[] = [];

  constructor(readonly context: ContextInfo) {}

  get key(): string {
    return this.context.key;
  }

  describe(): string {
    const b = this.context.behavior.name;
    const t = this.context.target ? ` → ${this.context.target.name}` : '';
    const a = this.context.abilityId ? ` [${this.context.abilityId}]` : '';
    return `${b}${a}${t}`;
  }
}
