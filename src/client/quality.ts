import type { GameRenderer } from './renderer';

/**
 * Resolução dinâmica: se o jogo cai abaixo de ~40 FPS, a resolução interna
 * baixa um degrau; se volta a ficar folgado, sobe de novo. Assim um PC fraco
 * troca nitidez por fluidez sem o jogador precisar mexer em nada.
 */
export class AdaptiveResolution {
  private readonly min: number;
  private ratio: number;
  private sum = 0;
  private count = 0;
  private windowStart = performance.now();
  private goodWindows = 0;

  /** `soft`: renderizador por software, que começa e pode descer mais baixo. */
  constructor(private readonly renderer: GameRenderer, private readonly soft = false) {
    this.min = soft ? 0.5 : 0.75;
    this.ratio = this.maxRatio();
    renderer.setPixelRatio(this.ratio);
  }

  private maxRatio(): number {
    return this.soft ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
  }

  /** Restaura a resolução máxima ao trocar de monitor ou redimensionar a janela. */
  reset(): void {
    this.sum = 0;
    this.count = 0;
    this.windowStart = performance.now();
    this.goodWindows = 0;
    this.set(this.maxRatio());
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  /** Chamar uma vez por frame com o intervalo desde o frame anterior. */
  frame(intervalMs: number, now: number): void {
    // Ignora pausas longas (troca de aba ou de monitor) para não derrubar a resolução à toa.
    if (intervalMs > 120) {
      this.windowStart = now;
      this.sum = 0;
      this.count = 0;
      return;
    }
    const max = this.maxRatio();
    this.sum += Math.min(intervalMs, 100);
    this.count++;
    if (now - this.windowStart < 2000) return;
    const avg = this.sum / this.count;
    this.sum = 0;
    this.count = 0;
    this.windowStart = now;
    if (avg > 24 && this.ratio > this.min) {
      this.set(Math.max(this.min, this.ratio - 0.15));
      this.goodWindows = 0;
    } else if (avg < 18 && this.ratio < max) {
      if (++this.goodWindows >= 2) {
        this.set(Math.min(max, this.ratio + 0.1));
        this.goodWindows = 0;
      }
    } else {
      this.goodWindows = 0;
    }
  }

  private set(ratio: number): void {
    this.ratio = ratio;
    this.renderer.setPixelRatio(ratio);
  }
}
