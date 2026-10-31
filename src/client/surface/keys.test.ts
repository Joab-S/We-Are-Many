import { describe, expect, it } from 'vitest';
import { FIXED_KEYS, keyLabel, SURFACE_KEYS, type SurfaceAction } from './keys';
import { SPEEDS } from './SimDriver';

describe('teclas da superfície (tabela de comandos)', () => {
  it('cada tecla faz uma coisa só, e nenhuma pisa nas teclas fixas', () => {
    const all = Object.values(SURFACE_KEYS).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const c of all) expect(FIXED_KEYS).not.toContain(c);
    // Os dígitos das velocidades estão entre as fixas.
    for (let k = 1; k <= SPEEDS.length; k++) expect(FIXED_KEYS).toContain(`Digit${k}`);
  });

  it('a ajuda mostra o nome curto da tecla', () => {
    expect(keyLabel('pause')).toBe('Espaço');
    expect(keyLabel('chronicle')).toBe('C');
    expect(keyLabel('brushDown')).toBe('[');
    for (const a of Object.keys(SURFACE_KEYS) as SurfaceAction[]) expect(keyLabel(a).length).toBeGreaterThan(0);
  });
});
