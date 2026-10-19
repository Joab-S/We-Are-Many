import type * as THREE from 'three';

/**
 * Resolução dinâmica: se o jogo cai abaixo de ~40 FPS, a resolução interna
 * baixa um degrau; se volta a ficar folgado, sobe de novo. Assim um PC fraco
 * troca nitidez por fluidez sem o jogador precisar mexer em nada.
 */
export class AdaptiveResolution {
  private readonly max = Math.min(window.devicePixelRatio || 1, 1.5);
  private readonly min = 0.6;
  private ratio = this.max;
  private sum = 0;
  private count = 0;
  private windowStart = performance.now();
  private goodWindows = 0;

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    renderer.setPixelRatio(this.ratio);
  }

  get pixelRatio(): number {
    return this.ratio;
  }

  /** Chamar uma vez por frame com o intervalo desde o frame anterior. */
  frame(intervalMs: number, now: number): void {
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
    } else if (avg < 18 && this.ratio < this.max) {
      if (++this.goodWindows >= 2) {
        this.set(Math.min(this.max, this.ratio + 0.1));
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
