import { ParticlePool } from './pool';
import { FX, PARTICLE_KINDS, type FxKind } from './tools';
import type { Viewport } from './Viewport';

/** Partículas da animação do pincel, no máximo. */
const MAX_PARTICLES = 700;
const RING = PARTICLE_KINDS.indexOf('ring');
const STREAK = PARTICLE_KINDS.indexOf('streak');
const CHUNK = PARTICLE_KINDS.indexOf('chunk');
const SPARK = PARTICLE_KINDS.indexOf('spark');
const DUST = PARTICLE_KINDS.indexOf('dust');

/**
 * Animação das ferramentas: partículas (em coordenadas da vista, y para o
 * norte) numa piscina de tamanho fixo e o brilho colorido sobre o pincel,
 * que some devagar depois que o jogador solta.
 */
export class BrushFx {
  readonly particles = new ParticlePool(MAX_PARTICLES);
  private glow: { kind: FxKind; alpha: number } | null = null;

  /** Há algo animando (redesenhar mesmo parado). */
  get active(): boolean {
    return this.particles.count > 0 || !!this.glow;
  }

  /** Explosão pontual de partículas da animação `kind` ao redor de um ponto (coordenadas da vista). */
  burst(kind: FxKind, x: number, y: number): void {
    const def = FX[kind];
    const p = this.particles;
    const type = PARTICLE_KINDS.indexOf(def.kind);
    for (let k = 0; k < 60 && !p.full; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * 5;
      p.spawn(x + Math.cos(a) * d, y + Math.sin(a) * d, def.vx + (Math.random() - 0.5) * def.spread, def.vy * (0.6 + Math.random() * 0.8), Math.random() * 0.2, 1 + Math.random() * 1.2, type, def.size * (0.8 + Math.random() * 0.8), def.rgb[0], def.rgb[1], def.rgb[2]);
    }
  }

  /** Solta partículas dentro do pincel enquanto a ferramenta age e acende o brilho (animação de cada ação). */
  emit(kind: FxKind, x: number, y: number, brush: number, dt: number): void {
    const def = FX[kind];
    const p = this.particles;
    const type = PARTICLE_KINDS.indexOf(def.kind);
    this.glow = { kind, alpha: 1 };
    const rate = 30 + brush * brush * 0.9;
    const n = Math.min(20, Math.round(rate * dt + Math.random()));
    for (let k = 0; k < n && !p.full; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * brush;
      const life = def.kind === 'ring' ? 1.1 : def.kind === 'streak' ? 0.6 : 0.8 + Math.random() * 0.9;
      p.spawn(x + Math.cos(a) * d, y + Math.sin(a) * d, def.vx + (Math.random() - 0.5) * def.spread, def.vy * (0.6 + Math.random() * 0.8), def.kind === 'streak' ? 0 : Math.random() * 0.2, life, type, def.size * (0.7 + Math.random() * 0.6), def.rgb[0], def.rgb[1], def.rgb[2]);
    }
  }

  /** Anda as partículas; o brilho apaga quando o botão não está apertado. */
  step(dt: number, painting: boolean): void {
    this.particles.step(dt);
    if (this.glow && !painting) {
      this.glow.alpha -= dt * 2.5;
      if (this.glow.alpha <= 0) this.glow = null;
    }
  }

  /** Brilho colorido sobre o pincel e as partículas, por cima do mapa (canvas dos territórios). */
  draw(ctx: CanvasRenderingContext2D, view: Viewport, brush: number): void {
    const z = view.zoom;
    const w = view.width;
    const h = view.height;
    const g = this.glow;
    if (g && view.hovering) {
      const [r, gr, b, a] = FX[g.kind].glow;
      const cx = view.viewToScreenX(view.hover.x);
      const cy = view.viewToScreenY(view.hover.y);
      const rad = brush * z;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 120);
      grad.addColorStop(0, `rgba(${r},${gr},${b},${(a * g.alpha * pulse).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    const p = this.particles;
    for (let k = 0; k < p.count; k++) {
      const t = p.age[k] / p.life[k];
      const kind = p.kind[k];
      const alpha = (1 - t) * (kind === RING ? 0.8 : 0.9);
      const x = view.viewToScreenX(p.x[k]);
      const y = view.viewToScreenY(p.y[k]);
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const px = Math.max(1.5, p.size[k] * z);
      ctx.fillStyle = `rgba(${p.rgb[k * 3]},${p.rgb[k * 3 + 1]},${p.rgb[k * 3 + 2]},${alpha.toFixed(3)})`;
      ctx.strokeStyle = ctx.fillStyle;
      if (kind === STREAK) {
        ctx.lineWidth = Math.max(1, z * 0.06);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx[k] * z * 0.05, y - p.vy[k] * z * 0.05);
        ctx.stroke();
      } else if (kind === RING) {
        ctx.lineWidth = Math.max(1, z * 0.08);
        ctx.beginPath();
        ctx.arc(x, y, px * (1 + t * 4), 0, Math.PI * 2);
        ctx.stroke();
      } else if (kind === CHUNK) {
        ctx.fillRect(x, y, px, px);
      } else if (kind === SPARK) {
        ctx.fillRect(x - px / 2, y, px, px / 3);
        ctx.fillRect(x - px / 6, y - px / 3, px / 3, px);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, px * (kind === DUST ? 0.5 + t : 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}
