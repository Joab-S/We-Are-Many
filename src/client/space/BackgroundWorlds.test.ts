import { describe, expect, it } from 'vitest';
import { addSignal, clearSignals, createNavState, rankSuggestions, signalCandidate, SIGNAL_INTEREST, type NavTarget } from '../../nav/guide';
import { generateSurface } from '../../procgen/surface';
import type { Runner } from '../../sim/api/catchUp';
import { createEngine, ecosystemOf, type Engine } from '../../sim/api/engine';
import { runSnapshot } from '../../sim/api/runSnapshot';
import { earthParams } from '../../sim/calibrate';
import { nativeSpecies } from '../../sim/species';
import { REAL_YEAR_SECONDS } from '../surface/tools';
import { BACKGROUND_INTERVAL_MS, BACKGROUND_MIN_YEARS, BACKGROUND_YEARS, BackgroundWorlds, signalsOf } from './BackgroundWorlds';

const PLANET = { ...earthParams(0.1), id: 'sol-3', name: 'Terra' };
const newEngine = () => createEngine(generateSurface(PLANET), { seed: 7, species: nativeSpecies(PLANET), yearSpan: REAL_YEAR_SECONDS });
const direct: Runner = async (req, onYear) => runSnapshot(structuredClone(req), () => 0, onYear);

function stateOf(engine: Engine, id: string, yearsAgo: number) {
  return {
    time: 1000 + yearsAgo * REAL_YEAR_SECONDS,
    leftAt: new Map([[id, 1000]]),
    ecosystems: new Map([[id, ecosystemOf(engine)]]),
    surfaces: new Map([[id, engine.view.map]]),
    replays: new Map(),
    nav: createNavState(),
  };
}

describe('sinais ao GUIA', () => {
  it('um povo que chega a uma era nova ou um planeta em apuros viram sinal; o resto não', () => {
    const out = signalsOf(
      [
        { kind: 'era', year: 1, village: 0, era: 1, first: true },
        { kind: 'era', year: 1, village: 1, era: 1, first: false },
        { kind: 'found', year: 1, village: 2, from: -1, how: 'bando', x: 0, y: 0 },
        { kind: 'indicator', year: 2, what: 'fome', value: 0.1 },
        { kind: 'indicator', year: 2, what: 'calor', value: 0.8 },
      ],
      'p',
      'Planeta',
      5,
    );
    expect(out.map((s) => s.reason)).toEqual([expect.stringContaining('chegou à'), expect.stringContaining('fome'), expect.stringContaining('terraformação')]);
    expect(out.every((s) => s.planet === 'p' && s.name === 'Planeta' && s.time === 5)).toBe(true);
  });

  it('o sinal de outro planeta vira sugestão, na frente de um sistema já conhecido', () => {
    const nav = createNavState();
    const [s] = signalsOf([{ kind: 'era', year: 1, village: 0, era: 2, first: true }], 'p', 'Planeta', 5);
    expect(addSignal(nav, s)).toBe(true);
    const target: NavTarget = { kind: 'planet', id: 'p', name: 'Planeta', pos: [10, 0, 0], arrive: 1, info: '' };
    const far: NavTarget = { kind: 'star', id: 'x', name: 'Estrela', pos: [10, 0, 0], arrive: 1, info: '' };
    const ranked = rankSuggestions([{ target: far, distAu: 10, arriveAu: 1, interest: 3, reason: 'Conhecida' }, signalCandidate(nav.signals[0], target, 10, 1)]);
    expect(ranked[0].target.id).toBe('p');
    expect(ranked[0].reason).toContain('chegou à');
  });

  it('o mesmo aviso não se repete, o mais urgente fica, e pousar limpa', () => {
    const nav = createNavState();
    const era = { planet: 'p', name: 'P', time: 1, interest: SIGNAL_INTEREST.era, reason: 'era' };
    expect(addSignal(nav, era)).toBe(true);
    expect(addSignal(nav, { ...era, time: 2 })).toBe(false);
    expect(nav.signals).toHaveLength(1);
    expect(addSignal(nav, { ...era, interest: SIGNAL_INTEREST.indicator, reason: 'fome' })).toBe(true);
    expect(nav.signals.map((s) => s.reason)).toEqual(['fome']);
    expect(addSignal(nav, { ...era, time: 9 })).toBe(false);
    addSignal(nav, { ...era, planet: 'q' });
    clearSignals(nav, 'p');
    expect(nav.signals.map((s) => s.planet)).toEqual(['q']);
  });
});

describe('mundos em segundo plano', () => {
  it('sem atraso bastante, não faz nada', () => {
    const state = stateOf(newEngine(), PLANET.id, BACKGROUND_MIN_YEARS - 1);
    expect(new BackgroundWorlds(state, () => {}, direct).frame(0)).toBeNull();
  });

  it('roda um pedaço por vez, não pula ano nenhum e o atraso que sobra fica para o próximo', async () => {
    const engine = newEngine();
    const state = stateOf(engine, PLANET.id, BACKGROUND_YEARS + 3);
    const bg = new BackgroundWorlds(state, () => {}, direct);
    await bg.frame(0);
    const eco = state.ecosystems.get(PLANET.id)!;
    expect(eco.year).toBeCloseTo(BACKGROUND_YEARS);
    expect(eco.caughtUpYears).toBe(BACKGROUND_YEARS);
    expect(eco.skippedYears).toBe(0);
    expect(state.leftAt.get(PLANET.id)).toBe(1000 + BACKGROUND_YEARS * REAL_YEAR_SECONDS);
    // Andar em segundo plano não é uma volta do jogador: nada de nota na crônica.
    expect(eco.chronicle.some((e) => e.text.startsWith('Você esteve fora'))).toBe(false);
    expect(bg.frame(1)).toBeNull();
    expect(bg.frame(BACKGROUND_INTERVAL_MS + 1)).toBeNull();
  });

  it('um por vez, e o mais atrasado primeiro', async () => {
    const a = newEngine();
    const state = stateOf(a, 'a', 6);
    const b = newEngine();
    state.ecosystems.set('b', ecosystemOf(b));
    state.surfaces.set('b', b.view.map);
    state.leftAt.set('b', state.time - 8 * REAL_YEAR_SECONDS);
    const bg = new BackgroundWorlds(state, () => {}, direct);
    expect(bg.pick()).toBe('b');
    const job = bg.frame(0)!;
    expect(bg.frame(BACKGROUND_INTERVAL_MS + 1)).toBeNull();
    await job;
    expect(state.ecosystems.get('b')!.year).toBeCloseTo(8);
    expect(state.ecosystems.get('a')!.year).toBe(0);
  });

  it('um evento dos anos rodados chega ao GUIA, e uma vez só', async () => {
    const engine = newEngine();
    ecosystemOf(engine).emit({ kind: 'era', year: 0, village: 0, era: 1, first: true });
    const state = stateOf(engine, PLANET.id, BACKGROUND_MIN_YEARS);
    const seen: string[] = [];
    await new BackgroundWorlds(state, (s) => seen.push(s.reason), direct).frame(0);
    expect(seen[0]).toContain('chegou à');
    expect(state.nav.signals).toHaveLength(1);
    expect(state.nav.signals[0]).toMatchObject({ planet: PLANET.id, name: 'Terra' });
  });
});
