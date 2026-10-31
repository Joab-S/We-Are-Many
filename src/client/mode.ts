import type { ViewSnapshot } from '../save/snapshot';

/**
 * Modo de jogo (padrões State e Game Loop): o espaço 3D e a superfície 2D.
 * O main.ts só conhece esta interface; ele cria o modo, chama `start` e, na
 * troca, descarta o modo atual por completo antes de criar o próximo.
 *
 * Cada modo roda o próprio laço com requestAnimationFrame (um quadro por
 * atualização da tela) e mede o tempo com o `now` que o navegador entrega:
 *
 * - Espaço (SpaceMode): passo variável, `dt = min(Δt, 0,25 s)`. O teto é
 *   alto de propósito: em PCs lentos (sem placa de vídeo) a viagem não fica
 *   em câmera lenta, e a velocidade adaptativa anda no máximo ~10% da
 *   distância ao obstáculo por passo, então não atravessa nada. Ordem do
 *   quadro: comandos, sistema e corpos, alvo, voo, sondas, estrelas, GUIA
 *   (4 vezes por segundo), origem flutuante, órbita, desenho e HUD (10 vezes
 *   por segundo).
 * - Superfície (SurfaceMode): `dt = min(Δt, 0,1 s)` para a câmera, o relógio
 *   e os efeitos; a simulação acumula `dt × velocidade` e avança em passos
 *   fixos de 0,1 s (1x), 0,2 s (2x) ou 0,25 s (5x). O laço só começa depois
 *   que o mapa termina de ser gerado (num Web Worker), por isso a superfície
 *   não tem `start`: ela começa sozinha.
 *
 * O tempo de jogo (`GameState.time`) avança nos dois modos.
 */
export interface GameMode {
  /** Começa o laço. Opcional: a superfície começa sozinha quando o mapa fica pronto. */
  start?(): void;
  /** Para o laço e libera cena, HUD, ouvintes e recursos da GPU. */
  dispose(): void;
  /** O que o save guarda da vista atual. */
  snapshotView(): ViewSnapshot;
}
