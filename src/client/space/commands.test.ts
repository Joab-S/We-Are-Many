import { describe, expect, it } from 'vitest';
import type { Input } from '../input';
import { CommandMap, DEFAULT_KEYS, KeyBindings, keyName, MANEUVERS, type Action } from './commands';

/** Teclado de mentira: o que está segurado e o que foi apertado neste quadro. */
function fakeInput(down: string[], hit: string[] = []): Input {
  return { down: (c: string) => down.includes(c), hit: (c: string) => hit.includes(c) } as unknown as Input;
}

describe('comandos e teclas do espaço', () => {
  it('as teclas padrão são as do README', () => {
    const readme: [Action, string][] = [
      ['thrust', 'KeyW'], ['brake', 'KeyS'], ['left', 'KeyA'], ['right', 'KeyD'],
      ['up', 'Space'], ['down', 'ShiftLeft'], ['down', 'ShiftRight'], ['rollLeft', 'KeyQ'], ['rollRight', 'KeyE'],
      ['turbo', 'Tab'], ['cruise', 'KeyC'], ['observe', 'KeyF'], ['panel', 'KeyG'], ['lock', 'KeyT'],
      ['suggest', 'KeyN'], ['autopilot', 'KeyJ'], ['scan', 'KeyV'], ['probe', 'KeyM'], ['probeRings', 'KeyR'],
      ['bookmark', 'KeyB'], ['home', 'KeyH'], ['clearTarget', 'KeyX'],
      ['jumpEarth', 'Digit1'], ['jumpAlpha', 'Digit2'], ['jumpSirius', 'Digit3'],
    ];
    for (const [action, code] of readme) expect(DEFAULT_KEYS[action]).toContain(code);
    // Nenhuma tecla dispara duas ações.
    const all = Object.values(DEFAULT_KEYS).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it('o turbo não conta como manobra (não desliga o piloto automático)', () => {
    expect(MANEUVERS).not.toContain('turbo');
    expect(MANEUVERS).toHaveLength(8);
  });

  it('lê teclas pelas ligações e aceita troca de tecla', () => {
    const keys = new KeyBindings();
    expect(keys.down(fakeInput(['ShiftRight']), 'down')).toBe(true);
    expect(keys.hit(fakeInput([], ['KeyJ']), 'autopilot')).toBe(true);
    expect(keys.anyHit(fakeInput([], ['KeyE']), MANEUVERS)).toBe(true);
    expect(keys.anyHit(fakeInput([], ['Tab']), MANEUVERS)).toBe(false);
    keys.rebind('autopilot', ['KeyP']);
    expect(keys.hit(fakeInput([], ['KeyJ']), 'autopilot')).toBe(false);
    expect(keys.label('autopilot')).toBe('P');
    expect(keyName('Digit1')).toBe('1');
    expect(keyName('Space')).toBe('Espaço');
    expect(new KeyBindings().label('devPanel')).toBe('');
  });

  it('executa na ordem da tabela e para quando o modo é trocado', () => {
    const ran: string[] = [];
    let stopped = false;
    const map = new CommandMap({
      panel: { execute: () => ran.push('panel') },
      scan: { execute: () => ran.push('scan') },
      observe: { execute: () => { ran.push('observe'); stopped = true; } },
      home: { execute: () => ran.push('home') },
    });
    map.dispatch(fakeInput([], ['KeyH', 'KeyV', 'KeyG', 'KeyF']), new KeyBindings(), () => stopped);
    expect(ran).toEqual(['panel', 'scan', 'observe']);
    expect(map.run('home')).toBe(true);
    expect(map.run('nada')).toBe(false);
    expect(ran.at(-1)).toBe('home');
  });
});
