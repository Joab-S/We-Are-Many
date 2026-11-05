import type { SpaceMode } from './space/SpaceMode';
import type { SurfaceMode } from './surface/SurfaceMode';

/** Modo de depuração (`?debug` no endereço): mostra as taxas do momento nos painéis (RF-VIDA-310), o painel F3 e as alças abaixo. */
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

declare global {
  /**
   * Alças para o console e os testes (`tests/jogo`, `tools/capture-settlements.mjs`). Só existem com `?debug`;
   * `space` e `surface` são o modo aberto agora e somem quando ele é descartado, para ninguém mexer num modo morto.
   */
  interface Window {
    space?: SpaceMode;
    surface?: SurfaceMode;
    debugEarth?: () => void;
  }
}
