import { describe, expect, it } from 'vitest';
import { FIXED_KEYS, keyLabel, SURFACE_KEYS, type SurfaceAction } from './keys';
import { OverlayStack } from './overlays';
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

  it('o painel de depuração abre com F3, que não é letra do jogo', () => {
    expect(SURFACE_KEYS.debug).toEqual(['F3']);
    expect(keyLabel('debug')).toBe('F3');
    // Uma tecla de função: não rouba nenhuma letra das janelas, das camadas ou da câmera.
    for (const c of SURFACE_KEYS.debug) expect(c).toMatch(/^F\d+$/);
  });
});

describe('pilha do Esc com o painel de depuração', () => {
  it('o painel entra e sai da pilha como as janelas, e o Esc fecha o que abriu por último', () => {
    const stack = new OverlayStack();
    const closed: string[] = [];
    stack.open('debug', () => closed.push('debug'));
    stack.open('vwin', () => closed.push('vwin'));
    expect(stack.top).toBe('vwin');
    expect(stack.escape()).toBe(true);
    expect(stack.top).toBe('debug');
    expect(stack.escape()).toBe(true);
    expect(closed).toEqual(['vwin', 'debug']);
    expect(stack.escape()).toBe(false);
    // Fechado pelo F3 ou pelo botão: sai da pilha sem chamar o fechamento.
    stack.set('debug', true, () => closed.push('de novo'));
    stack.set('debug', false, () => {});
    expect(stack.has('debug')).toBe(false);
    expect(closed).toEqual(['vwin', 'debug']);
  });
});
