import * as THREE from 'three';
import { Ecosystem } from '../sim/ecosystem';
import type { StatefulRng } from '../core/rng';
import type { PlanetParams, SurfaceMap } from '../procgen/surface';
import type { Species } from '../sim/species';
import type { NavState } from '../nav/guide';
import type { ProbeState } from '../explore/probes';
import type { GameState } from '../client/state';

/**
 * Salvamento do jogo (RF-SAV-01 a 03). O instantâneo é um objeto que o
 * `structuredClone` entende (Map, Set, arrays tipados, referências
 * compartilhadas), por isso vai direto para o IndexedDB, sem passar por JSON:
 * o mapa de um planeta tem alguns MB de arrays tipados, bem acima da cota do
 * localStorage (~5 MB). Sem three.js nem DOM no que é testado, para rodar em Node.
 */

/** Sobe quando o formato muda de um jeito que saves antigos não entendem. */
export const SAVE_VERSION = 1;

/** Onde o jogador estava e como via: a superfície guarda também câmera e velocidade. */
export type ViewSnapshot = { mode: 'space' } | { mode: 'surface'; params: PlanetParams; center: [number, number]; zoom: number; speed: number };

/** Campos de um Ecosystem que não vão para o save: o mapa vai à parte, e o resto é cache ou função. */
const ECO_SKIP = new Set(['map']);

export interface EcosystemSnapshot {
  seed: number;
  /** Estado de cada gerador de sorteios (campo da classe -> estado do mulberry32). */
  rng: Record<string, number>;
  fields: Record<string, unknown>;
}

export interface SaveData {
  version: number;
  savedAt: number;
  ship: { pos: [number, number, number]; quat: [number, number, number, number] };
  time: number;
  orbitPlanetId: string | null;
  surfaces: Map<string, SurfaceMap>;
  ecosystems: Map<string, EcosystemSnapshot>;
  knownSpecies: Map<string, Species>;
  nav: NavState;
  probes: ProbeState;
  view: ViewSnapshot;
}

const isRng = (v: unknown): v is StatefulRng => typeof v === 'function' && typeof (v as { state?: unknown }).state === 'number';

/**
 * Lê o ecossistema por reflexão: tudo o que a classe guarda (arrays tipados,
 * Maps, Sets, aldeias, guerras, crônica...) entra sem lista à mão, então um
 * campo novo no Ecosystem já é salvo. Funções e WeakMaps (caches) ficam de fora;
 * os geradores de sorteio entram pelo estado.
 */
function snapshotEcosystem(eco: Ecosystem, seed: number): EcosystemSnapshot {
  const rng: Record<string, number> = {};
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(eco)) {
    if (ECO_SKIP.has(key) || value instanceof WeakMap) continue;
    if (isRng(value)) rng[key] = value.state;
    else if (typeof value !== 'function') fields[key] = value;
  }
  return { seed, rng, fields };
}

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

export class SaveFormatError extends Error {}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const finiteTuple = (v: unknown, n: number): boolean => Array.isArray(v) && v.length === n && v.every(finite);

/** Confere o essencial antes de mexer no jogo; um save adulterado ou de outra versão é recusado inteiro. */
export function validateSave(raw: unknown): SaveData {
  const d = raw as Partial<SaveData> | null;
  if (!d || typeof d !== 'object') throw new SaveFormatError('save vazio');
  if (d.version !== SAVE_VERSION) throw new SaveFormatError(`versão ${String(d.version)} incompatível (esperada ${SAVE_VERSION})`);
  if (!finiteTuple(d.ship?.pos, 3) || !finiteTuple(d.ship?.quat, 4)) throw new SaveFormatError('posição da nave inválida');
  if (!finite(d.time) || d.time < 0) throw new SaveFormatError('tempo de jogo inválido');
  if (!(d.surfaces instanceof Map) || !(d.ecosystems instanceof Map) || !(d.knownSpecies instanceof Map)) throw new SaveFormatError('mundo ausente');
  if (!d.nav || !d.probes || !d.view || (d.view.mode !== 'space' && d.view.mode !== 'surface')) throw new SaveFormatError('estado incompleto');
  for (const [id, snap] of d.ecosystems) {
    const map = d.surfaces.get(id);
    if (!map || !(map.elevation instanceof Float32Array) || map.elevation.length !== map.width * map.height) throw new SaveFormatError(`terreno de ${id} ausente ou corrompido`);
    if (!snap || !snap.fields || !snap.rng) throw new SaveFormatError(`ecossistema de ${id} corrompido`);
  }
  return d as SaveData;
}

/** Recria um ecossistema idêntico ao salvo: classe nova (métodos e callbacks) com os campos e o RNG do save. */
function restoreEcosystem(snap: EcosystemSnapshot, map: SurfaceMap): Ecosystem {
  // O construtor zera o mapa de árvores cortadas, que pertence ao terreno e vem no save.
  const felled = map.felled;
  const eco = new Ecosystem(map, snap.seed);
  map.felled = felled;
  const target = eco as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(snap.fields)) target[key] = value;
  for (const [key, state] of Object.entries(snap.rng)) {
    const gen = target[key];
    if (!isRng(gen)) throw new SaveFormatError(`gerador ${key} desconhecido`);
    gen.state = state;
  }
  eco.fixAfterLoad();
  return eco;
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
