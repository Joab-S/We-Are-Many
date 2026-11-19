import { describe, expect, it, vi } from 'vitest';
import { generateSurface, type PlanetParams } from '../procgen/surface';
import { planetParams, SOL_PLANETS } from '../nav/planets';
import { createEngine } from './api/engine';
import { chooseLife, TRIAL_RETRIES, trialRun, type TrialRun } from './lifeTrial';
import { nativeLifeTier, nativeSpecies } from './species';

/** Um planeta que o sorteio diz ter um povo inteligente (raro: menos de 1 em 100). */
function sapientPlanet(): PlanetParams {
  for (let k = 0; ; k++) {
    const id = `povo-${k}`;
    if (nativeLifeTier(id, 0.7) === 'sapient') return { id, name: 'Sorteado', radiusEarth: 0.2, temperatureK: 288, water: 0.5, life: 0.7 };
  }
}

const SAPIENT = sapientPlanet();
const map = generateSurface(SAPIENT);

describe('rejeição do sorteio da vida', () => {
  it('um planeta forçado a inviável troca o sorteio e diz por quê', () => {
    const run = vi.fn<TrialRun>((_, species) => {
      // O povo só aguenta no terceiro sorteio.
      const third = species[0].name === nativeSpecies(SAPIENT, 2)[0].name;
      return { start: 40, end: third ? 55 : 12 };
    });
    const choice = chooseLife(map, run);
    expect(choice.attempt).toBe(2);
    expect(run).toHaveBeenCalledTimes(3);
    expect(choice.notes).toHaveLength(2);
    expect(choice.notes[0]).toContain('de 40 para 12');
  });

  it('um povo sem onde fundar também é rejeitado, e sem nenhum bom fica o que perdeu menos', () => {
    const shares = [0, 30, 5, 2];
    let k = 0;
    const choice = chooseLife(map, () => ({ start: k === 0 ? 0 : 40, end: shares[k++] }));
    expect(k).toBe(TRIAL_RETRIES + 1);
    expect(choice.attempt).toBe(1);
    expect(choice.notes[0]).toContain('não achou onde fundar');
    expect(choice.notes.at(-1)).toContain('ficou o 2');
  });

  it('o primeiro sorteio bom fica, sem nota', () => {
    expect(chooseLife(map, () => ({ start: 40, end: 40 }))).toEqual({ attempt: 0, notes: [] });
  });

  it('a Terra nunca é rejeitada, e planeta sem povo nem roda o teste', () => {
    const run = vi.fn<TrialRun>(() => ({ start: 10, end: 0 }));
    expect(chooseLife(generateSurface(planetParams(SOL_PLANETS[2]), 0.25), run)).toEqual({ attempt: 0, notes: [] });
    expect(chooseLife(generateSurface({ ...SAPIENT, id: 'sol-4', life: 0 }, 0.25), run)).toEqual({ attempt: 0, notes: [] });
    expect(run).not.toHaveBeenCalled();
  });

  it('andar o sorteio troca as espécies, sem mudar o de sempre nem o nível de vida', () => {
    expect(nativeSpecies(SAPIENT, 0)).toEqual(nativeSpecies(SAPIENT));
    expect(nativeSpecies(SAPIENT, 1).map((sp) => sp.name)).not.toEqual(nativeSpecies(SAPIENT, 0).map((sp) => sp.name));
    expect(nativeSpecies(SAPIENT, 1).some((sp) => sp.kind === 'sapient')).toBe(true);
    expect(nativeSpecies({ ...SAPIENT, id: 'sol-3' }, 2)).toEqual(nativeSpecies({ ...SAPIENT, id: 'sol-3' }));
  });

  it('o teste de verdade roda num rascunho: o mapa recebido não muda', () => {
    const before = map.vegetation.slice();
    const r = trialRun(map, nativeSpecies(SAPIENT), 7);
    expect(r.start).toBeGreaterThan(0);
    expect(map.vegetation).toEqual(before);
  });

  it('as rejeições viram linhas na crônica do mundo novo', () => {
    const engine = createEngine(generateSurface(SAPIENT), { seed: 1, species: nativeSpecies(SAPIENT, 1), notes: ['o sorteio 1 foi rejeitado'] });
    expect(engine.view.chronicle.some((c) => c.text === 'o sorteio 1 foi rejeitado')).toBe(true);
  });
});
