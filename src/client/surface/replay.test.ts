import { describe, expect, it } from 'vitest';
import { generateSurface, GENERATOR_VERSION } from '../../procgen/surface';
import { earthParams } from '../../sim/calibrate';
import type { EngineCommand } from '../../sim/api/commands';
import { createEngine, type Engine } from '../../sim/api/engine';
import type { EngineEvent } from '../../sim/api/events';
import { replayCase, type ReplayCase } from '../../sim/api/replay';
import { resetConstants } from '../../sim/live';
import { nativeSpecies } from '../../sim/species';
import { caseJson, debugCase } from './debugPanel';
import { LOG_LIMIT, SimDriver, type CommandRecord } from './SimDriver';

const PLANET = earthParams(0.1);
const YEAR_SPAN = 12;
const STEPS_PER_YEAR = YEAR_SPAN / 0.25;

const newWorld = () => createEngine(generateSurface(PLANET), { seed: 7, species: nativeSpecies(PLANET), yearSpan: YEAR_SPAN });

function driverOf(engine: Engine, record?: CommandRecord<EngineCommand>) {
  const d = new SimDriver<EngineCommand, EngineEvent>(engine, (cmd) => engine.apply(cmd), { wrapWidth: engine.view.map.width, record });
  d.setSpeed(0);
  return d;
}

/** O caso, pelo mesmo caminho do botão Copiar caso. */
const caseOf = (engine: Engine, d: SimDriver<EngineCommand, EngineEvent>): ReplayCase =>
  JSON.parse(
    caseJson(
      debugCase({
        fingerprint: engine.debug.fingerprint(),
        seed: engine.seed,
        year: engine.view.year,
        tick: d.tick,
        step: d.h,
        yearSpan: engine.view.yearSpan,
        planet: engine.view.map.params,
        attempt: 0,
        notes: [],
        generator: GENERATOR_VERSION,
        fresh: d.record.fromStart,
        log: d.log,
        logLimit: LOG_LIMIT,
      }),
    ),
  );

describe('replay com o log do mundo', () => {
  // Um mundo só: rodar 100 anos custa, e os testes daqui leem o mesmo caso.
  const engine = newWorld();
  const first = driverOf(engine);
  const v = engine.view.villages[0];
  first.enqueue({ kind: 'feed', x: v.x, y: v.y, r: 6 });
  first.stepBy(40 * STEPS_PER_YEAR);
  // Outra visita: relógio novo, com o registro de antes.
  const second = driverOf(engine, first.record);
  second.enqueue({ kind: 'tune', name: 'MOVE_THINK', value: 0.2 });
  second.enqueue({ kind: 'cull', x: v.x + 3, y: v.y, r: 4 });
  second.stepBy(60 * STEPS_PER_YEAR);
  const c = caseOf(engine, second);

  it('o relógio continua entre as visitas', () => {
    expect(second.tick).toBe(100 * STEPS_PER_YEAR);
    expect(second.log.map((e) => [e.tick, e.cmd.kind])).toEqual([
      [0, 'feed'],
      [40 * STEPS_PER_YEAR, 'tune'],
      [40 * STEPS_PER_YEAR, 'cull'],
    ]);
  });

  it('100 anos jogados, em duas visitas, dão o mesmo hash refeitos sem tela', () => {
    resetConstants();
    const r = replayCase(c);
    expect(r).toEqual({ tick: c.tick, year: engine.view.year, fingerprint: c.fingerprint, commands: 3, same: true });
  });

  it('para no ano pedido, sem dizer que deu igual', () => {
    const r = replayCase(c, { untilYear: 3 });
    expect(r.same).toBeNull();
    expect(r.year).toBeGreaterThanOrEqual(3);
    expect(r.year).toBeLessThan(3.1);
    expect(r.commands).toBe(1);
  });

  it('um mundo diferente acusa, e o que não dá para refazer é recusado', () => {
    expect(replayCase({ ...c, fingerprint: 'deadbeef' }).same).toBe(false);
    expect(() => replayCase({ ...c, generator: GENERATOR_VERSION + 1 })).toThrow(/gerador/);
    expect(() => replayCase({ ...c, fresh: false })).toThrow(/save antigo/);
    expect(() => replayCase({ ...c, complete: false })).toThrow(/limite/);
    resetConstants();
  });
});
