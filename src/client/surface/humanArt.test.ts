import { describe, expect, it } from 'vitest';
import { ROLES } from '../../sim/roles';
import { HUMAN_FRAMES, HUMAN_PALETTES, HUMAN_SPRITES, LOOKS, personOf, SKIN_TONES } from './humanArt';

describe('humanos em 16x18', () => {
  it('toda profissão do jogo tem aparência e quadros para homem e mulher', () => {
    for (const role of [...ROLES, 'free', 'elder', 'child']) {
      expect(LOOKS[role], role).toBeDefined();
      for (const f of HUMAN_FRAMES[role]) {
        for (const name of [...f.idle, ...f.walk, ...f.work, f.hit, f.dead, f.fallen]) expect(HUMAN_SPRITES[name], name).toBeDefined();
        expect(f.work.length).toBe(f.workTicks.length);
      }
    }
  });

  it('os desenhos têm 18 linhas de largura igual e só cores da paleta', () => {
    for (const [name, rows] of Object.entries(HUMAN_SPRITES)) {
      expect(rows.length, name).toBe(18);
      for (const row of rows) {
        expect(row.length, name).toBe(rows[0].length);
        for (const ch of row) if (ch !== '.') expect(HUMAN_PALETTES[name][ch], `${name}: ${ch}`).toBeDefined();
      }
    }
  });

  it('gênero, pele e cabelo são estáveis e a pele escura tem cabelo escuro', () => {
    expect(personOf(42)).toEqual(personOf(42));
    let females = 0;
    for (let uid = 1; uid <= 400; uid++) {
      const p = personOf(uid);
      if (p.female) females++;
      if (p.skin === SKIN_TONES[2]) expect(Math.max(...p.hair)).toBeLessThan(90);
    }
    expect(females).toBeGreaterThan(150);
    expect(females).toBeLessThan(250);
  });
});
