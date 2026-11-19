import { describe, expect, it } from 'vitest';
import { AVENUE, houseStyle, isStreet, mainStreets, pickMaterial } from './architecture';

describe('arquitetura que acompanha a era (19.8)', () => {
  it('estilo pela era da casa, com sobrado na cidade medieval e um estilo a mais por andar', () => {
    expect(houseStyle(0, 0)).toBe('hut');
    expect(houseStyle(2, 1)).toBe('house');
    expect(houseStyle(3, 1)).toBe('stoneHouse');
    expect(houseStyle(3, 2)).toBe('townhouse');
    expect(houseStyle(1, 0, 1)).toBe('house');
    expect(houseStyle(4, 0, 2)).toBe('townhouse');
  });

  it('material pelo entorno: frio, deserto, rocha, mata, barro', () => {
    const base = { rock: 0, forest: 0, desert: 0, cold: 0, wet: false };
    expect(pickMaterial({ ...base, cold: 0.6, rock: 0.5 })).toBe('snow');
    expect(pickMaterial({ ...base, desert: 0.5 })).toBe('adobe');
    expect(pickMaterial({ ...base, rock: 0.3, forest: 0.7 })).toBe('stone');
    expect(pickMaterial({ ...base, forest: 0.7, wet: true })).toBe('wood');
    expect(pickMaterial({ ...base, wet: true })).toBe('brick');
    expect(pickMaterial(base)).toBe('plain');
  });

  it('rua principal é o tronco por onde passa a maior parte da rede', () => {
    // Uma linha de 10 tiles saindo da praça (0) com 3 vielas curtas no fim.
    const streets = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 101, 102, 103]);
    const next = (t: number) => (t === 10 ? [9, 101, 102, 103] : t > 100 ? [10] : [t - 1, t + 1]);
    const main = mainStreets(streets, [0], next, 0.3, 4);
    expect(main.has(1)).toBe(true);
    expect(main.has(8)).toBe(true);
    expect(main.has(101)).toBe(false);
    expect(isStreet(AVENUE)).toBe(true);
    expect(isStreet(4)).toBe(false);
  });
});
