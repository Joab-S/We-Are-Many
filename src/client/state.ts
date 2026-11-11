import * as THREE from 'three';
import type { SurfaceMap } from '../procgen/surface';
import type { IndexedManifest } from '../universe/manifest';
import type { Ecosystem } from '../sim/ecosystem';
import type { Species } from '../sim/species';
import type { NavState } from '../nav/guide';
import type { ProbeState } from '../explore/probes';
import type { WorldRecord } from '../save/snapshot';
import type { Landing } from './fusion';
import type { PregenSlot } from './space/planet/pregen';

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
  /**
   * Cor de cada tile, por id do planeta, para a esfera em órbita mostrar o mesmo
   * mapa da superfície: guardada ao sair dela, com ruas e construções. É derivada
   * do mundo e não vai para o save; depois de carregar, fica só o terreno pintado
   * até a próxima visita.
   */
  surfaceArt: Map<string, Uint8Array>;
  /** O mapa do planeta em órbita, gerado antes de a nave descer. Não vai para o save. */
  pregen?: PregenSlot | null;
  /** Planeta em cuja órbita a nave estava ao entrar na superfície; limpo quando ela volta a ele. */
  orbitPlanetId: string | null;
  /** Nave menos planeta ao descer, em UA: onde a nave reaparece ao voltar da superfície. */
  orbitOffset: THREE.Vector3 | null;
  /** O giro do planeta ao descer de perto do chão: `orbitOffset` vale nesse giro. Sem ele, a nave volta ao mesmo lugar em volta do planeta. */
  orbitSpin?: number | null;
  /** A nave sobe pelo zoom do mapa: em vez de `orbitOffset`, ela volta sobre este ponto. Não vai para o save. */
  liftOff?: Landing | null;
  /** Ecossistemas em andamento, por id do planeta. */
  ecosystems: Map<string, Ecosystem>;
  /** O relógio e o log de comandos de cada mundo: com a semente, refazem o mundo (`npm run replay`). */
  replays: Map<string, WorldRecord>;
  /** O relógio do universo (`time`) quando cada planeta foi visto pela última vez: de lá conta o que ele perdeu. */
  leftAt: Map<string, number>;
  /** Espécies que o jogador já conheceu e pode levar a outros planetas. */
  knownSpecies: Map<string, Species>;
  /** Alvo, marcadores, descobertas e diário de bordo do GUIA. */
  nav: NavState;
  /** Sondas, missões de extração e porão da nave. */
  probes: ProbeState;
}
