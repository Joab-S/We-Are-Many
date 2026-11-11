import { describe, expect, it } from 'vitest';
import { generateSurface, GENERATOR_VERSION } from '../../procgen/surface';
import { CATCH_UP_YEARS, lostYears, type Runner } from '../../sim/api/catchUp';
import type { EngineCommand } from '../../sim/api/commands';
import { createEngine, ecosystemOf, type Engine } from '../../sim/api/engine';
import type { EngineEvent } from '../../sim/api/events';
import { replayCase } from '../../sim/api/replay';
import { runSnapshot } from '../../sim/api/runSnapshot';
import { earthParams } from '../../sim/calibrate';
import { worldFingerprint } from '../../sim/fingerprint';
import { nativeSpecies } from '../../sim/species';
import { caseJson, debugCase } from './debugPanel';
import { catchUpPlanet, type CatchUpState } from './catchUp';
import { LOG_LIMIT, SimDriver, type CommandRecord } from './SimDriver';
import { REAL_YEAR_SECONDS } from './tools';

const PLANET = { ...earthParams(0.1), id: 'sol-3' };
const STEPS_PER_YEAR = REAL_YEAR_SECONDS / 0.25;
const SEED = 7;

const newEngine = () => createEngine(generateSurface(PLANET), { seed: SEED, species: nativeSpecies(PLANET), yearSpan: REAL_YEAR_SECONDS });

/** Roda no mesmo processo, como o Worker rodaria. */
const direct: Runner = async (req, onYear) => runSnapshot(structuredClone(req), () => 0, onYear);

function stateOf(engine: Engine, leftAgoYears: number): CatchUpState {
  return {
    time: 1000 + leftAgoYears * REAL_YEAR_SECONDS,
    leftAt: new Map([[PLANET.id, 1000]]),
    ecosystems: new Map([[PLANET.id, ecosystemOf(engine)]]),
    surfaces: new Map([[PLANET.id, engine.view.map]]),
    replays: new Map(),
  };
}

describe('anos perdidos', () => {
  it('conta os anos inteiros desde a saída; planeta nunca visto não perdeu nada', () => {
    expect(lostYears(100, undefined, 12)).toBe(0);
    expect(lostYears(100, 100, 12)).toBe(0);
    expect(lostYears(111, 100, 12)).toBe(0);
    expect(lostYears(112, 100, 12)).toBe(1);
    expect(lostYears(100 + 12 * 50 + 3, 100, 12)).toBe(50);
    expect(lostYears(50, 100, 12)).toBe(0);
  });
});

describe('pôr em dia', () => {
  it('10 anos postos em dia dão o mesmo mundo de 10 anos ao vivo', async () => {
    const live = newEngine();
    for (let i = 0; i < 10 * STEPS_PER_YEAR; i++) live.step(0.25);

    const engine = newEngine();
    const state = stateOf(engine, 10);
    const r = (await catchUpPlanet(state, PLANET.id, { run: direct, seed: SEED }))!;
    expect(r).toMatchObject({ lost: 10, yearsRun: 10, skipped: 0, steps: 10 * STEPS_PER_YEAR });
    // A nota da volta é o único comando a mais, e o ao vivo recebe o mesmo.
    live.apply(r.note);
    expect(worldFingerprint(state.ecosystems.get(PLANET.id)!)).toBe(live.debug.fingerprint());
  });

  it('troca o mundo no estado, marca a volta e anota na crônica; a fila de eventos vem junto, vazia', async () => {
    const engine = newEngine();
    const before = ecosystemOf(engine);
    before.emit({ kind: 'extinction', year: 0, species: 0 });
    const state = stateOf(engine, 3);
    const years: number[] = [];
    const r = (await catchUpPlanet(state, PLANET.id, { run: direct, seed: SEED, onYear: (y) => years.push(y) }))!;
    const eco = state.ecosystems.get(PLANET.id)!;
    expect(eco).not.toBe(before);
    expect(before.year).toBe(0);
    expect(eco.year).toBeCloseTo(3);
    expect(years.map(Math.round)).toEqual([1, 2, 3]);
    expect(state.surfaces.get(PLANET.id)).toBe(r.map);
    expect(state.leftAt.get(PLANET.id)).toBe(state.time);
    expect(eco.chronicle[0].text).toBe('Você esteve fora por 3 anos');
    expect(eco.caughtUpYears).toBe(3);
    expect(eco.skippedYears).toBe(0);
    expect(eco.drainEvents()).toEqual([]);
    expect(r.events).toContainEqual({ kind: 'extinction', year: 0, species: 0 });
  });

  it('acima do teto de anos, roda 200 e o resto vira nota', async () => {
    const engine = newEngine();
    const state = stateOf(engine, 500);
    const asked: number[] = [];
    const fake: Runner = async (req) => {
      asked.push(req.years);
      return { snapshot: req.snapshot, yearsRun: req.years, cut: false, fingerprint: '', ms: 0 };
    };
    const r = (await catchUpPlanet(state, PLANET.id, { run: fake, seed: SEED }))!;
    expect(asked).toEqual([CATCH_UP_YEARS]);
    expect(r.skipped).toBe(300);
    const eco = state.ecosystems.get(PLANET.id)!;
    expect(eco.skippedYears).toBe(300);
    expect(eco.chronicle[0].text).toBe('Você esteve fora por 500 anos: 200 foram acompanhados e 300 passaram sem registro');
  });

  it('o tempo de máquina acabou: para no ano em que está, e o resto vira nota', async () => {
    const engine = newEngine();
    const state = stateOf(engine, 8);
    let now = 0;
    const slow: Runner = async (req, onYear) => runSnapshot(structuredClone(req), () => (now += req.budgetMs / 2), onYear);
    const r = (await catchUpPlanet(state, PLANET.id, { run: slow, seed: SEED }))!;
    expect(r.yearsRun).toBeLessThan(8);
    expect(r.yearsRun).toBeGreaterThan(0);
    expect(r.skipped).toBe(8 - r.yearsRun);
    expect(state.ecosystems.get(PLANET.id)!.year).toBeCloseTo(r.yearsRun);
  });

  it('menos de um ano fora, ou planeta nunca visto: nada a fazer', async () => {
    const engine = newEngine();
    const state = stateOf(engine, 0);
    state.time += REAL_YEAR_SECONDS - 1;
    expect(await catchUpPlanet(state, PLANET.id, { run: direct })).toBeNull();
    expect(await catchUpPlanet(state, 'outro', { run: direct })).toBeNull();
    expect(state.ecosystems.get(PLANET.id)).toBe(ecosystemOf(engine));
  });

  it('o Worker falhou: o mundo fica como estava e a próxima visita tenta de novo', async () => {
    const engine = newEngine();
    const state = stateOf(engine, 3);
    const broken: Runner = () => Promise.reject(new Error('sem Worker'));
    expect(await catchUpPlanet(state, PLANET.id, { run: broken })).toBeNull();
    expect(state.ecosystems.get(PLANET.id)).toBe(ecosystemOf(engine));
    expect(state.leftAt.get(PLANET.id)).toBe(1000);
    expect(await catchUpPlanet(state, PLANET.id, { run: direct, seed: SEED })).not.toBeNull();
  });

  it('voltar enquanto ainda roda não conta os anos duas vezes', async () => {
    const engine = newEngine();
    const state = stateOf(engine, 2);
    let calls = 0;
    const counted: Runner = (req, onYear) => {
      calls++;
      return direct(req, onYear);
    };
    const [a, b] = await Promise.all([catchUpPlanet(state, PLANET.id, { run: counted, seed: SEED }), catchUpPlanet(state, PLANET.id, { run: counted, seed: SEED })]);
    expect(calls).toBe(1);
    expect(a).toBe(b);
  });

  it('o caso copiado depois de pôr em dia refaz o mesmo mundo', async () => {
    const first = newEngine();
    const record: CommandRecord<EngineCommand> = { tick: 0, log: [], fromStart: true };
    const visit = (engine: Engine) => {
      const d = new SimDriver<EngineCommand, EngineEvent>(engine, (cmd) => engine.apply(cmd), { wrapWidth: engine.view.map.width, record });
      d.setSpeed(0);
      return d;
    };
    const d1 = visit(first);
    d1.stepBy(2 * STEPS_PER_YEAR);

    const state = stateOf(first, 4);
    state.replays.set(PLANET.id, record);
    const r = (await catchUpPlanet(state, PLANET.id, { run: direct, seed: SEED }))!;
    expect(record.tick).toBe(6 * STEPS_PER_YEAR);

    const second = createEngine(r.map, { seed: SEED, eco: r.eco, yearSpan: REAL_YEAR_SECONDS });
    const d2 = visit(second);
    d2.stepBy(STEPS_PER_YEAR);
    expect(record.tick).toBe(7 * STEPS_PER_YEAR);

    const json = caseJson(
      debugCase({
        fingerprint: second.debug.fingerprint(),
        seed: SEED,
        year: second.view.year,
        tick: record.tick,
        step: d2.h,
        yearSpan: REAL_YEAR_SECONDS,
        planet: PLANET,
        attempt: 0,
        notes: [],
        generator: GENERATOR_VERSION,
        fresh: record.fromStart,
        log: record.log,
        logLimit: LOG_LIMIT,
      }),
    );
    expect(replayCase(JSON.parse(json))).toMatchObject({ tick: record.tick, same: true });
  });
});
