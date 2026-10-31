import { describe, expect, it } from 'vitest';
import balanceSource from './balance.ts?raw';
import tuningSource from '../ai/tuning.ts?raw';
import * as B from './balance';
import { MOVE_W } from '../ai/tuning';
import { LONG_TARGETS, type Indicators } from './calibrate';
import { goalLoss, goalMiss, goalsFrom } from './tuneGoals';
import { formatNumber, readConstant, writeConstant } from '../../tools/tune/constants.mjs';
import plan from '../../tools/tune/assentamentos.json';

describe('ajuste automático: metas', () => {
  it('dentro da faixa não custa; fora, a distância na escala da borda', () => {
    expect(goalMiss(0.3, { key: 'hunger', max: 0.5 })).toBe(0);
    expect(goalMiss(1, { key: 'hunger', max: 0.5 })).toBeCloseTo(1, 9);
    expect(goalMiss(25, { key: 'medianPop', min: 50 })).toBeCloseTo(0.5, 9);
    expect(goalMiss(300, { key: 'people', min: 800, scale: 800 })).toBeCloseTo(0.625, 9);
    // Borda zero: a escala é 1.
    expect(goalMiss(2, { key: 'roadBlocks', min: 0, max: 0 })).toBe(2);
    expect(goalMiss(Number.NaN, { key: 'hunger', max: 0.5 })).toBe(10);
  });

  it('a distância soma as partes, ao quadrado e com peso', () => {
    const ind = { hunger: 1, settlements: 20 } as unknown as Indicators;
    const { loss, parts } = goalLoss(ind, [
      { key: 'hunger', max: 0.5, weight: 3 },
      { key: 'settlements', min: 40, max: 90 },
    ]);
    expect(parts.hunger).toBeCloseTo(3, 9);
    expect(parts.settlements).toBeCloseTo(0.25, 9);
    expect(loss).toBeCloseTo(3.25, 9);
  });

  it('as metas da calibração longa viram metas do ajuste, sem teto onde o teto é 99999', () => {
    const goals = goalsFrom(LONG_TARGETS);
    expect(goals.length).toBe(LONG_TARGETS.length);
    expect(goals.find((g) => g.key === 'medianPop')!.max).toBeUndefined();
    expect(goals.find((g) => g.key === 'hunger')!.max).toBe(0.5);
  });
});

describe('ajuste automático: constantes no código', () => {
  it('lê o número solto, o campo do objeto e o item do vetor, como o módulo carregado', () => {
    expect(readConstant(balanceSource, 'SITE_MIN_VALUE')).toBe(B.SITE_MIN_VALUE);
    expect(readConstant(balanceSource, 'SEASON_HARVEST[2]')).toBe(B.SEASON_HARVEST[2]);
    expect(readConstant(balanceSource, 'INST_POLITY.reino')).toBe(B.INST_POLITY.reino);
    expect(readConstant(tuningSource, 'MOVE_W.stay')).toBe(MOVE_W.stay);
    // Conta não é número solto: não dá para trocar.
    expect(readConstant(balanceSource, 'PLANT_PER_FELL')).toBeNull();
    expect(readConstant(balanceSource, 'NAO_EXISTE')).toBeNull();
  });

  it('troca só o número pedido, e o texto continua o mesmo no resto', () => {
    const out = writeConstant(writeConstant(balanceSource, 'SITE_MIN_VALUE', 3.75), 'SEASON_HARVEST[2]', 2.9);
    expect(readConstant(out, 'SITE_MIN_VALUE')).toBe(3.75);
    expect(readConstant(out, 'SEASON_HARVEST[2]')).toBe(2.9);
    expect(readConstant(out, 'SEASON_HARVEST[1]')).toBe(B.SEASON_HARVEST[1]);
    expect(out.length - balanceSource.length).toBe(formatNumber(3.75).length - String(B.SITE_MIN_VALUE).length + formatNumber(2.9).length - String(B.SEASON_HARVEST[2]).length);
    expect(() => writeConstant(balanceSource, 'PLANT_PER_FELL', 1)).toThrow();
  });

  it('todo parâmetro do plano de exemplo existe e começa dentro da faixa', () => {
    for (const q of plan.parametros) {
      const v = readConstant(balanceSource, q.nome) ?? readConstant(tuningSource, q.nome);
      expect(v, q.nome).not.toBeNull();
      expect(v!, q.nome).toBeGreaterThanOrEqual(q.min);
      expect(v!, q.nome).toBeLessThanOrEqual(q.max);
    }
  });
});
