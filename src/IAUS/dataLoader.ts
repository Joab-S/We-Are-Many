// dataLoader.ts — Carrega behaviors, packs e brains de JSON (o "banco de dados").
//
// Assim designers ajustam curvas, pesos e packs sem recompilar.

import { Behavior, BehaviorDef } from './behavior';
import { BrainLibrary, BrainSeed } from './brain';
import { BehaviorTypes } from './behaviorTypes';
import { AbilityPackage, BehaviorPackage } from './packs';
import { WorldObjectTypeRegistry } from './aiEntity';

export interface AiDatabase {
  worldObjectTypes?: { type: string; tags: string[] }[];
  behaviors: BehaviorDef[];
  behaviorPacks: { id: number; name: string; description?: string; behaviorIds: number[] }[];
  abilityPacks?: {
    id: number;
    name: string;
    description?: string;
    pairs: { behaviorId: number; abilityId: string }[];
  }[];
  brains: BrainSeed[];
}

export function loadDatabase(db: AiDatabase): void {
  for (const w of db.worldObjectTypes ?? []) WorldObjectTypeRegistry.define(w.type, w.tags);

  for (const def of db.behaviors) {
    if (BrainLibrary.behaviors.has(def.id)) throw new Error(`Behavior id duplicado: ${def.id}`);
    if (!BehaviorTypes.has(def.behaviorType))
      throw new Error(`Behavior "${def.name}": Behavior Type "${def.behaviorType}" não registrado`);
    BrainLibrary.behaviors.set(def.id, new Behavior(def));
  }

  const behavior = (id: number, where: string): Behavior => {
    const b = BrainLibrary.behaviors.get(id);
    if (!b) throw new Error(`${where}: behavior ${id} não existe`);
    return b;
  };

  for (const p of db.behaviorPacks) {
    BrainLibrary.behaviorPackages.set(
      p.id,
      new BehaviorPackage(p.id, p.name, p.description, p.behaviorIds.map((id) => behavior(id, p.name))),
    );
  }
  for (const p of db.abilityPacks ?? []) {
    BrainLibrary.abilityPackages.set(
      p.id,
      new AbilityPackage(
        p.id,
        p.name,
        p.description,
        p.pairs.map((x) => ({ behavior: behavior(x.behaviorId, p.name), abilityId: x.abilityId })),
      ),
    );
  }
  for (const s of db.brains) BrainLibrary.brains.set(s.id, { ...s });
}
