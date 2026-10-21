import { describe, expect, it } from 'vitest';
import { maxFieldsOf, maxPensOf } from './settlement';

describe('limites de currais e roças', () => {
  it('nunca passam de 5 e crescem com o nível', () => {
    expect(maxPensOf(0)).toBe(1);
    expect(maxPensOf(3, 'gado')).toBe(5);
    expect(maxFieldsOf(0)).toBe(2);
    expect(maxFieldsOf(3)).toBe(5);
    for (let t = 0; t < 6; t++) expect(Math.max(maxPensOf(t, 'ovelhas'), maxFieldsOf(t))).toBeLessThanOrEqual(5);
  });
});
