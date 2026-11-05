import { describe, expect, it } from 'vitest';
import { ANIMAL_ART, ANIMAL_FRAMES, ANIMAL_PALETTES, ANIMAL_SPRITES } from './animalArt';
import { SPRITES } from './art';
import { earthCatalog } from '../../sim/species';

describe('bichos no padrão lobo', () => {
  it('todo quadro cabe na célula do atlas (24x24), tem linhas de largura igual e só cores da paleta', () => {
    for (const [name, rows] of Object.entries(ANIMAL_SPRITES)) {
      expect(rows.length, name).toBeLessThanOrEqual(24);
      expect(rows[0].length, name).toBeLessThanOrEqual(24);
      for (const row of rows) {
        expect(row.length, name).toBe(rows[0].length);
        for (const ch of row) if (ch !== '.') expect(ANIMAL_PALETTES[name][ch], `${name}: ${ch}`).toBeDefined();
      }
    }
  });

  it('cada bicho tem os quadros da Terra e o alienígena, todos registrados e virados para a esquerda', () => {
    for (const name of Object.keys(ANIMAL_ART)) {
      for (const f of ANIMAL_FRAMES[name]) {
        for (const s of [...f.idle, ...f.walk, ...f.eat, f.hit, f.dead, f.fallen]) {
          expect(SPRITES[s], s).toBeDefined();
          expect(SPRITES[`${s}:l`], s).toBeDefined();
        }
        expect(f.walk).toHaveLength(4);
      }
    }
  });

  it('a carcaça não toma dano nem morre; os outros bichos sim', () => {
    const [carcass] = ANIMAL_FRAMES.carcass;
    expect(carcass.hit).toBe(carcass.idle[0]);
    expect(carcass.fallen).toBe(carcass.idle[0]);
    const [wolf] = ANIMAL_FRAMES.wolf;
    expect(wolf.hit).not.toBe(wolf.idle[0]);
    expect(new Set(wolf.walk).size).toBeGreaterThan(1);
  });

  it('o alienígena leva as marcas da cor da espécie no corpo', () => {
    const body = ANIMAL_SPRITES['an:wolf:x:base'].join('');
    expect(body).toMatch(/[123]/);
    expect(ANIMAL_SPRITES['an:wolf:n:base'].join('')).not.toMatch(/[123]/);
  });

  it('todo bicho da Terra com desenho novo usa um nome que existe em ANIMAL_ART', () => {
    const missing = earthCatalog().filter((s) => s.kind !== 'sapient' && s.sprite && !ANIMAL_ART[s.sprite] && !['fish', 'shark'].includes(s.sprite)).map((s) => s.sprite);
    expect(missing).toEqual([]);
  });
});
