/**
 * Dinâmica de pilotagem, sem three.js. A velocidade é guardada como fração
 * do teto adaptativo (seção 3.5 do REQUISITOS.md), então acelerar, frear e
 * deslizar parecem iguais perto de um planeta ou entre estrelas.
 */

export interface ThrottleTuning {
  /** Quanto a fração de velocidade sobe por segundo segurando W. */
  accel: number;
  /** Quanto cai por segundo segurando S. */
  brake: number;
  /** Quanto cai por segundo sem nada apertado (a nave desliza). */
  coast: number;
  /** Fração máxima em marcha à ré. */
  reverse: number;
}

export const THROTTLE: ThrottleTuning = { accel: 0.55, brake: 1.1, coast: 0.25, reverse: 0.3 };

/** Avança a fração de velocidade (-reverse..1) conforme W (+1), S (-1) ou nada (0). */
export function stepSpeedFactor(current: number, input: -1 | 0 | 1, dt: number, t: ThrottleTuning = THROTTLE): number {
  if (input > 0) {
    // Aceleração mais forte no começo e suave perto do máximo, para dar sensação de arrancada.
    const boost = current < 0 ? t.brake : t.accel * (1.4 - 0.8 * current);
    return Math.min(1, current + boost * dt);
  }
  if (input < 0) return Math.max(-t.reverse, current - t.brake * dt);
  const step = t.coast * dt;
  return Math.abs(current) <= step ? 0 : current - Math.sign(current) * step;
}

export interface TurboTuning {
  /** Multiplicador da velocidade com o turbo ligado. */
  multiplier: number;
  /** Energia gasta por segundo (de 0 a 1). */
  drain: number;
  /** Energia recuperada por segundo. */
  recharge: number;
  /** Segundos de espera após soltar o turbo antes de começar a recarregar. */
  rechargeDelay: number;
  /** Energia mínima para religar depois de esgotar. */
  restartAt: number;
}

export const TURBO: TurboTuning = { multiplier: 4, drain: 0.25, recharge: 0.12, rechargeDelay: 1, restartAt: 0.3 };

/** Turbo com energia limitada: dura ~4 s e recarrega sozinho. */
export class Turbo {
  energy = 1;
  active = false;
  /** Verdadeiro depois de esgotar, até recarregar `restartAt`. */
  exhausted = false;
  private idle = 0;

  constructor(private readonly t: TurboTuning = TURBO) {}

  step(wants: boolean, dt: number): void {
    if (this.exhausted && this.energy >= this.t.restartAt) this.exhausted = false;
    this.active = wants && !this.exhausted && this.energy > 0;
    if (this.active) {
      this.idle = 0;
      this.energy = Math.max(0, this.energy - this.t.drain * dt);
      if (this.energy === 0) {
        this.exhausted = true;
        this.active = false;
      }
    } else {
      this.idle += dt;
      if (this.idle >= this.t.rechargeDelay) this.energy = Math.min(1, this.energy + this.t.recharge * dt);
    }
  }

  get multiplier(): number {
    return this.active ? this.t.multiplier : 1;
  }
}
