import { afterEach, describe, expect, it } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import * as tuning from '../IAUS/npc/mundo/ajustes';
import * as balance from './balance';
import { createEngine } from './api/engine';
import { restoreEcosystem, snapshotEcosystem } from '../save/snapshot';
import { applyTuned, B, liveConstants, NOT_LIVE, readConstant, resetConstants, setConstant } from './live';
import { YEAR_SECONDS } from './ecosystem';
import { nativeSpecies } from './species';

const PLANET: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.15, temperatureK: 288, water: 0.6, life: 0.85 };

afterEach(() => resetConstants());

describe('constantes ao vivo', () => {
  it('começam iguais às de balance.ts', () => {
    expect(B.SITE_MIN_VALUE).toBe(balance.SITE_MIN_VALUE);
    expect(B.DUNBAR).toBe(balance.DUNBAR);
    expect(B.SEASON_HARVEST).toBe(balance.SEASON_HARVEST);
  });

  it('mudam por NOME, NOME.campo e NOME[i], e voltam ao de fábrica', () => {
    const field = Object.keys(tuning.MOVE_W)[0];
    const names = ['SITE_MIN_VALUE', `MOVE_W.${field}`, 'SEASON_HARVEST[2]'];
    const before = names.map(readConstant);
    expect(before.every((v) => typeof v === 'number')).toBe(true);
    for (const name of names) expect(setConstant(name, 7.5)).toBe(true);
    expect(B.SITE_MIN_VALUE).toBe(7.5);
    expect((tuning.MOVE_W as unknown as Record<string, number>)[field]).toBe(7.5);
    expect(B.SEASON_HARVEST[2]).toBe(7.5);
    resetConstants();
    expect(names.map(readConstant)).toEqual(before);
  });

  it('recusam nome que não existe, o que não é número e valor inválido, sem mudar nada', () => {
    const before = B.SITE_MIN_VALUE;
    expect(setConstant('NAO_EXISTE', 1)).toBe(false);
    expect(setConstant('SITE_MIN_VALUE.campo', 1)).toBe(false);
    expect(setConstant('MOVE_W', 1)).toBe(false);
    expect(setConstant('SITE_MIN_VALUE', Number.NaN)).toBe(false);
    expect(B.SITE_MIN_VALUE).toBe(before);
    expect(liveConstants().filter((c) => c.factory !== undefined)).toEqual([]);
  });

  it('o que o motor copia ao carregar não é oferecido', () => {
    const names = new Set(liveConstants().map((c) => c.name));
    expect(names.has('SITE_MIN_VALUE')).toBe(true);
    expect(names.size).toBeGreaterThan(300);
    for (const name of NOT_LIVE) {
      expect(names.has(name)).toBe(false);
      expect(setConstant(name, 1)).toBe(false);
    }
  });

  it('o comando `tune` vale na hora, fica no mundo e o próximo mundo começa de fábrica', () => {
    const map = generateSurface(PLANET);
    const engine = createEngine(map, { seed: 5, species: nativeSpecies(PLANET), yearSpan: YEAR_SECONDS });
    const look = () => engine.debug.constants().find((c) => c.name === 'SITE_MIN_VALUE')!;
    expect(look().factory).toBeUndefined();
    expect(engine.apply({ kind: 'tune', name: 'NAO_EXISTE', value: 1 }).ok).toBe(false);
    expect(engine.apply({ kind: 'tune', name: 'SITE_MIN_VALUE', value: 2.5 }).ok).toBe(true);
    expect(look()).toEqual({ name: 'SITE_MIN_VALUE', value: 2.5, factory: balance.SITE_MIN_VALUE });
    const other = createEngine(map, { seed: 6, species: nativeSpecies(PLANET), yearSpan: YEAR_SECONDS });
    expect(B.SITE_MIN_VALUE).toBe(balance.SITE_MIN_VALUE);
    expect(other.debug.constants().filter((c) => c.factory !== undefined)).toEqual([]);
  });

  it('o ajuste vai no save e volta com o mundo', () => {
    const map = generateSurface(PLANET);
    const engine = createEngine(map, { seed: 5, species: nativeSpecies(PLANET), yearSpan: YEAR_SECONDS });
    engine.apply({ kind: 'tune', name: 'SITE_MIN_VALUE', value: 2.5 });
    const snap = engine.snapshot();
    resetConstants();
    const back = createEngine(snap.map, { seed: 5, eco: restoreEcosystem(structuredClone(snap.eco), snap.map) });
    expect(B.SITE_MIN_VALUE).toBe(2.5);
    expect(snapshotEcosystem(restoreEcosystem(structuredClone(snap.eco), snap.map), 5).fields.tuned).toEqual({ SITE_MIN_VALUE: 2.5 });
    back.restore(snap);
    expect(B.SITE_MIN_VALUE).toBe(2.5);
    applyTuned(undefined);
    expect(B.SITE_MIN_VALUE).toBe(balance.SITE_MIN_VALUE);
  });
});
