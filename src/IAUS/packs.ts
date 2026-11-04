// packs.ts — Behavior Packs e Ability Packs.
//
// Behavior Pack: coleção nomeada de behaviors por conceito ("Movimento tático",
//   "Vagar ambiente", "Emotes sociais"). Um Brain recebe vários.
// Ability Pack: coleção de Behavior-Ability Pairs (o mesmo "porquê" ligado a
//   "o quês" diferentes por tipo de personagem).

import { Behavior, BehaviorAbilityPair } from './behavior';

export class BehaviorPackage {
  private readonly list: Behavior[] = [];

  constructor(
    readonly id: number,
    readonly name: string,
    readonly description = '',
    behaviors: Behavior[] = [],
  ) {
    for (const b of behaviors) this.add(b);
  }

  get behaviors(): readonly Behavior[] {
    return this.list;
  }
  has(behaviorId: number): boolean {
    return this.list.some((b) => b.id === behaviorId);
  }
  add(b: Behavior): void {
    if (!this.has(b.id)) this.list.push(b);
  }
  remove(behaviorId: number): void {
    const i = this.list.findIndex((b) => b.id === behaviorId);
    if (i >= 0) this.list.splice(i, 1);
  }
}

export class AbilityPackage {
  private readonly list: BehaviorAbilityPair[] = [];

  constructor(
    readonly id: number,
    readonly name: string,
    readonly description = '',
    pairs: BehaviorAbilityPair[] = [],
  ) {
    for (const p of pairs) this.add(p.behavior, p.abilityId);
  }

  get pairs(): readonly BehaviorAbilityPair[] {
    return this.list;
  }
  has(behaviorId: number, abilityId: string): boolean {
    return this.list.some((p) => p.behavior.id === behaviorId && p.abilityId === abilityId);
  }
  add(behavior: Behavior, abilityId: string): void {
    if (!this.has(behavior.id, abilityId)) this.list.push({ behavior, abilityId });
  }
  remove(behaviorId: number, abilityId: string): void {
    const i = this.list.findIndex((p) => p.behavior.id === behaviorId && p.abilityId === abilityId);
    if (i >= 0) this.list.splice(i, 1);
  }
}
