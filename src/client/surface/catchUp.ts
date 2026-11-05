import { seedFor } from '../../core/rng';
import { catchUpWorld, lostYears, UNWATCHED, type CatchUpResult, type Runner } from '../../sim/api/catchUp';
import type { GameState } from '../state';
import { runInWorker } from './engineWorker';
import { REAL_YEAR_SECONDS } from './tools';

/** O que o pôr em dia lê e troca no estado do jogo. */
export type CatchUpState = Pick<GameState, 'time' | 'leftAt' | 'ecosystems' | 'surfaces' | 'replays'>;

export interface CatchUpOptions {
  run?: Runner;
  seed?: number;
  /** Ano do planeta enquanto roda (para a tela mostrar). */
  onYear?: (year: number) => void;
  /** Em segundo plano: roda só até tantos anos, nada é pulado e o relógio do planeta anda só o que rodou. */
  slice?: number;
}

/** Um planeta por vez: quem voltar a ele enquanto o Worker ainda roda espera o mesmo resultado, sem contar os anos duas vezes. */
const running = new Map<object, Promise<CatchUpResult | null>>();

/** Quantos anos o planeta perdeu. Sem mundo, não há o que pôr em dia. */
export function yearsToCatchUp(state: CatchUpState, id: string): number {
  return state.ecosystems.has(id) && state.surfaces.has(id) ? lostYears(state.time, state.leftAt.get(id), REAL_YEAR_SECONDS) : 0;
}

/**
 * Põe em dia o planeta `id` e troca o mundo dele no estado do jogo. Devolve null quando não há o que fazer ou quando o
 * Worker falhou: nesse caso o mundo fica como estava e a próxima visita tenta de novo.
 */
export function catchUpPlanet(state: CatchUpState, id: string, opts: CatchUpOptions = {}): Promise<CatchUpResult | null> {
  const lost = yearsToCatchUp(state, id);
  const world = state.ecosystems.get(id);
  const map = state.surfaces.get(id);
  if (!world || !map) return Promise.resolve(null);
  const already = running.get(world);
  if (already) return already;
  if (lost < 1) return Promise.resolve(null);
  const startedAt = state.time;
  const record = state.replays.get(id);
  // A vista "sem ninguém olhando" entra no log no passo de agora, e os passos dados no Worker entram na conta dele.
  record?.log.push({ tick: record.tick, cmd: UNWATCHED });
  const startYear = world.year;
  const job = catchUpWorld(world, map, opts.seed ?? seedFor(`${id}:life`), lost, opts.run ?? runInWorker, (years) => opts.onYear?.(startYear + years), opts.slice)
    .then((r) => {
      state.ecosystems.set(id, r.eco);
      state.surfaces.set(id, r.map);
      state.leftAt.set(id, opts.slice ? (state.leftAt.get(id) ?? startedAt) + r.yearsRun * REAL_YEAR_SECONDS : startedAt);
      if (record) {
        record.tick += r.steps;
        record.log.push({ tick: record.tick, cmd: r.note });
      }
      return r;
    })
    .catch((err: unknown) => {
      console.warn('Não deu para pôr o planeta em dia', err);
      return null;
    })
    .finally(() => running.delete(world));
  running.set(world, job);
  return job;
}
