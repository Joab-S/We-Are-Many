import * as THREE from 'three';
import type { Ecosystem } from '../sim/ecosystem';
import type { GameState } from '../client/state';
import { restoreEcosystem, SAVE_VERSION, snapshotEcosystem, validateSave, type SaveData, type ViewSnapshot } from './snapshot';

/**
 * O jogo inteiro no save (RF-SAV-01 a 03): junta o estado do cliente (nave em
 * THREE.Vector3, GameState) aos retratos dos ecossistemas, que são do motor
 * (`snapshot.ts`). Fica fora do motor puro por causa do three.js e do
 * `GameState`; o formato e a validação continuam em `snapshot.ts`.
 */

export function snapshotGame(state: GameState, view: ViewSnapshot, seeds: (planetId: string) => number, now = Date.now()): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: now,
    ship: { pos: state.shipPos.toArray(), quat: state.shipQuat.toArray() as [number, number, number, number] },
    time: state.time,
    orbitPlanetId: state.orbitPlanetId,
    surfaces: state.surfaces,
    ecosystems: new Map([...state.ecosystems].map(([id, eco]) => [id, snapshotEcosystem(eco, seeds(id))])),
    knownSpecies: state.knownSpecies,
    nav: state.nav,
    probes: state.probes,
    view,
  };
}

/** Monta o estado do jogo a partir do save; `base` traz o que não é salvo (manifesto e nomes das estrelas). */
export function restoreGame(raw: unknown, base: Pick<GameState, 'manifest' | 'names'>): { state: GameState; view: ViewSnapshot; savedAt: number } {
  const d = validateSave(raw);
  const ecosystems = new Map<string, Ecosystem>();
  for (const [id, snap] of d.ecosystems) ecosystems.set(id, restoreEcosystem(snap, d.surfaces.get(id)!));
  const state: GameState = {
    ...base,
    shipPos: new THREE.Vector3().fromArray(d.ship.pos),
    shipQuat: new THREE.Quaternion().fromArray(d.ship.quat),
    time: d.time,
    surfaces: d.surfaces,
    orbitPlanetId: d.orbitPlanetId,
    ecosystems,
    knownSpecies: d.knownSpecies,
    nav: d.nav,
    probes: d.probes,
  };
  return { state, view: d.view, savedAt: d.savedAt };
}
