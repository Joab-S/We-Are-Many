import { describe, expect, it } from 'vitest';
import { COLORS, DECOR_ART, SPRITES } from './art';

describe('pixel art', () => {
  it('todas as linhas de cada desenho têm a mesma largura e só usam cores conhecidas', () => {
    for (const [name, rows] of [...Object.entries(SPRITES), ...DECOR_ART.map((r, k) => [`decor${k}`, r] as const)]) {
      const w = rows[0].length;
      for (const row of rows) {
        expect(row.length, name).toBe(w);
        for (const ch of row) if (ch !== '.' && ch !== '~') expect(COLORS[ch], `${name}: ${ch}`).toBeDefined();
      }
    }
    for (const rows of DECOR_ART) expect(rows.length).toBe(16);
  });
});
