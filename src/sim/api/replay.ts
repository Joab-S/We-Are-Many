import { generateSurface, GENERATOR_VERSION, type PlanetParams } from '../../procgen/surface';
import { nativeSpecies } from '../species';
import type { EngineCommand } from './commands';
import { createEngine } from './engine';

/** O que refaz um mundo: é o caso que a aba Tempo do painel F3 copia. */
export interface ReplayCase {
  seed: number;
  planet: PlanetParams;
  step: number;
  yearSpan: number;
  tick: number;
  fingerprint: string;
  generator: number;
  attempt: number;
  notes: string[];
  fresh: boolean;
  complete: boolean;
  log: { tick: number; cmd: EngineCommand }[];
}

export interface ReplayResult {
  tick: number;
  year: number;
  fingerprint: string;
  commands: number;
  /** Chegou ao passo do caso e deu a mesma impressão digital; null se parou antes. */
  same: boolean | null;
}

/**
 * Refaz o mundo do caso, sem tela, pelo mesmo caminho do jogo: os comandos de cada passo entram antes dele, e os do último
 * passo, depois dele. Recusa o que não daria para refazer: outro gerador de mapa, ou um log que não vem do começo.
 */
export function replayCase(c: ReplayCase, opts: { untilYear?: number } = {}): ReplayResult {
  if (c.generator !== GENERATOR_VERSION) throw new Error(`O caso é da versão ${c.generator} do gerador, e esta é a ${GENERATOR_VERSION}: o mapa sairia outro.`);
  if (!c.fresh) throw new Error('O caso é de um mundo de um save antigo: o log não vem do começo.');
  if (!c.complete) throw new Error('O log do caso chegou ao limite: os comandos mais antigos já saíram.');
  const species = nativeSpecies(c.planet, c.attempt);
  const engine = createEngine(generateSurface(c.planet), { seed: c.seed, species, yearSpan: c.yearSpan, notes: c.notes });
  let k = 0;
  let t = 0;
  for (; t <= c.tick; t++) {
    while (k < c.log.length && c.log[k].tick === t) engine.apply(c.log[k++].cmd);
    if (opts.untilYear !== undefined && engine.view.year >= opts.untilYear) break;
    if (t < c.tick) engine.step(c.step);
    engine.drainEvents();
    engine.drainTiles();
  }
  const tick = Math.min(t, c.tick);
  const fingerprint = engine.debug.fingerprint();
  return { tick, year: engine.view.year, fingerprint, commands: k, same: tick === c.tick ? fingerprint === c.fingerprint : null };
}
