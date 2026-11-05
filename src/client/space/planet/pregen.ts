import type { PlanetParams, SurfaceMap } from '../../../procgen/surface';
import { generateSurfaceAsync } from '../../surface/generateAsync';

/**
 * O mapa completo do planeta em cuja órbita a nave entrou, gerado antes de ela descer. Fica fora de `surfaces`, que quer
 * dizer "visitado" (vai para o save, e a esfera e o relógio dos mundos contam com isso), e guarda um só: o da órbita mais
 * recente. Enquanto o Worker roda, quem chega espera o mesmo trabalho em vez de começar outro.
 */
export interface PregenSlot {
  id: string;
  job: Promise<SurfaceMap>;
  /** O mapa, depois que o trabalho terminou. */
  map: SurfaceMap | null;
}

/** O pedaço do estado do jogo que guarda o mapa adiantado. */
export interface PregenState {
  pregen?: PregenSlot | null;
}

/** Pede o mapa de um planeta; um pedido para outro planeta toma o lugar do anterior. */
export function requestPregen(state: PregenState, params: PlanetParams, generate: (params: PlanetParams) => Promise<SurfaceMap> = generateSurfaceAsync): PregenSlot {
  if (state.pregen?.id === params.id) return state.pregen;
  const slot: PregenSlot = { id: params.id, job: generate(params), map: null };
  void slot.job.then((map) => {
    slot.map = map;
  });
  state.pregen = slot;
  return slot;
}

/** Quem vai descer leva o mapa adiantado, pronto ou a caminho; o lugar fica livre, porque agora ele é o mapa do planeta. */
export function takePregen(state: PregenState, id: string): Promise<SurfaceMap> | null {
  const slot = state.pregen;
  if (slot?.id !== id) return null;
  state.pregen = null;
  return slot.job;
}
