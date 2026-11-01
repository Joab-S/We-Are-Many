import { describe, expect, it } from 'vitest';
import { runWorld } from '../calibrate';
import baseline from '../calibrate.baseline.json';

describe('indicadores da calibração', () => {
  // As contas que dependem só do estado saíram de `runWorld` para `indicatorsOf` (a vista de depuração usa as
  // mesmas): os números de uma rodada curta têm de ser os gravados antes da extração, na mesma ordem.
  for (const r of baseline.runs) {
    it(`semente ${r.seed}, ${r.years} anos (ano de ${r.yearSpan} s): iguais aos de antes`, () => {
      const { indicators } = runWorld(r.seed, r.years, r.radius, r.yearSpan);
      expect(Object.keys(indicators)).toEqual(Object.keys(r.indicators));
      expect(indicators).toEqual(r.indicators);
    });
  }
});
