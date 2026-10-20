import * as THREE from 'three';
import type { SurfaceMap } from '../procgen/surface';
import type { IndexedManifest } from '../universe/manifest';
import type { Ecosystem } from '../sim/ecosystem';
import type { Species } from '../sim/species';
import type { NavState } from '../nav/guide';
import type { ProbeState } from '../explore/probes';

/**
 * Estado lógico que sobrevive às trocas de modo 3D/2D. As cenas são
 * descartadas e reconstruídas a partir dele (REQUISITOS.md, seção 6.4).
 */
export interface GameState {
  manifest: IndexedManifest;
  names: Map<number, string>;
  /** Posição da nave em UA, coordenadas galácticas, Sol na origem. */
  shipPos: THREE.Vector3;
  shipQuat: THREE.Quaternion;
  /** Tempo de jogo, em segundos. */
  time: number;
  /** Superfícies já geradas ou alteradas, por id do planeta. */
  surfaces: Map<string, SurfaceMap>;
  /** Planeta em cuja órbita a nave estava ao entrar na superfície. */
  orbitPlanetId: string | null;
  /** Ecossistemas em andamento, por id do planeta. */
  ecosystems: Map<string, Ecosystem>;
  /** Espécies que o jogador já conheceu e pode levar a outros planetas. */
  knownSpecies: Map<string, Species>;
  /** Alvo, marcadores, descobertas e diário de bordo do GUIA. */
  nav: NavState;
  /** Sondas, missões de extração e porão da nave. */
  probes: ProbeState;
}
