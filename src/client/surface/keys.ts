import type { Input } from '../input';
import { keyName } from '../space/commands';

/**
 * Teclas da superfície (padrão Command, como `DEFAULT_KEYS` do espaço): cada ação de um aperto tem as suas
 * teclas numa tabela só, pelo `KeyboardEvent.code`, e a ajuda mostra o nome que sai daqui. Trocar uma tecla é
 * trocar a tabela, sem procurar `input.hit('KeyX')` pelo código. Ficam de fora o Esc (fecha o que abriu por
 * último), os dígitos das velocidades, o WASD da câmera e o Ctrl+Z.
 */
export type SurfaceAction = 'pause' | 'help' | 'territory' | 'panel' | 'follow' | 'brushDown' | 'brushUp' | 'chronicle' | 'kingdoms' | 'species' | 'items';

export const SURFACE_KEYS: Readonly<Record<SurfaceAction, readonly string[]>> = {
  pause: ['Space'],
  help: ['KeyH'],
  territory: ['KeyT'],
  panel: ['KeyP'],
  follow: ['KeyF'],
  brushDown: ['BracketLeft'],
  brushUp: ['BracketRight'],
  chronicle: ['KeyC'],
  kingdoms: ['KeyR'],
  species: ['KeyE'],
  items: ['KeyI'],
};

/** Teclas que a superfície lê fora da tabela (câmera, velocidades e Esc): a tabela não pode repeti-las. */
export const FIXED_KEYS = ['Escape', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyZ'];

/** A ação foi apertada neste quadro. */
export function pressed(input: Input, action: SurfaceAction): boolean {
  for (const c of SURFACE_KEYS[action]) if (input.hit(c)) return true;
  return false;
}

const NAMES: Record<string, string> = { BracketLeft: '[', BracketRight: ']' };

/** Nome da tecla principal da ação, para a ajuda e os botões ("KeyN" vira "N"). */
export function keyLabel(action: SurfaceAction): string {
  const c = SURFACE_KEYS[action];
  return c.length ? (NAMES[c[0]] ?? keyName(c[0])) : '';
}
