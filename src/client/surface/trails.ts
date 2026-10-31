import type { EngineView } from '../../sim/api/engine';
import type { EventOf } from '../../sim/api/events';
import { ParticlePool } from './pool';
import type { Viewport } from './Viewport';

/** Traços na tela, no máximo: com o mundo agitado (5x), os que não cabem não aparecem. */
const MAX_TRAILS = 48;
const MIGRATE = 0;
const COLONY = 1;
/** Quanto dura um traço (segundos reais): mais longe, um pouco mais. */
const LIFE_MIN = 2.5;
const LIFE_MAX = 5;

/**
 * Setas das mudanças de lugar (consumidor dos eventos `colony` e `migrate`): um traço curto que sai da origem, anda
 * até o destino e some em alguns segundos, na cor do lugar de origem. Colônia com traço grosso; família que se
 * muda, fino. Ficam numa piscina de tamanho fixo (Object Pool, `pool.ts`), em coordenadas do mapa (x coluna,
 * y linha), no relógio real; a velocidade leva o traço ao destino quando ele acaba.
 */
export class Trails {
  readonly pool = new ParticlePool(MAX_TRAILS);

  /** Há traço na tela (redesenhar mesmo parado). */
  get active(): boolean {
    return this.pool.count > 0;
  }

  /** Grupo de colonos: por terra, na partida (o lugar novo já existe); pelo mar, na chegada (antes não se sabe onde). */
  colony(e: EventOf<'colony'>, view: EngineView): void {
    if (e.to >= 0 && e.phase === (e.by === 'sea' ? 'arrive' : 'depart')) this.add(view, e.from, e.to, COLONY);
  }

  /** Família (ou a última leva de um lugar) que se mudou. */
  migrate(e: EventOf<'migrate'>, view: EngineView): void {
    this.add(view, e.from, e.to, MIGRATE);
  }

  /** Solta um traço de `from` para `to` (ids dos lugares), pelo lado curto do mapa; nada sem uma das pontas. */
  add(view: EngineView, from: number, to: number, kind: number): void {
    const a = from >= 0 ? view.villages[from] : undefined;
    const b = to >= 0 ? view.villages[to] : undefined;
    if (!a || !b || a === b || this.pool.full) return;
    const w = view.map.width;
    let dx = b.x - a.x;
    if (Math.abs(dx) > w / 2) dx -= Math.sign(dx) * w;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    const life = Math.min(LIFE_MAX, LIFE_MIN + d / 60);
    // `size` é o comprimento do traço em tiles.
    this.pool.spawn(a.x, a.y, dx / life, dy / life, 0, life, kind, Math.min(8, Math.max(2, d * 0.3)), a.color[0], a.color[1], a.color[2]);
  }

  step(dt: number): void {
    this.pool.step(dt);
  }

  /** Os traços por cima do mapa (canvas dos territórios): contorno escuro, a cor da origem e a ponta. */
  draw(ctx: CanvasRenderingContext2D, view: Viewport): void {
    const p = this.pool;
    if (!p.count) return;
    const z = view.zoom;
    const w = view.width;
    const h = view.height;
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < p.count; k++) {
      const t = p.age[k] / p.life[k];
      // Acende rápido e apaga devagar.
      const alpha = Math.min(1, t * 6) * (1 - t * t);
      const hx = view.screenX(p.x[k]);
      const hy = view.canvasY(p.y[k]);
      const speed = Math.hypot(p.vx[k], p.vy[k]) || 1;
      const ux = p.vx[k] / speed;
      const uy = p.vy[k] / speed;
      const len = Math.max(10, p.size[k] * z);
      const tx = hx - ux * len;
      const ty = hy - uy * len;
      if (Math.max(hx, tx) < -20 || Math.min(hx, tx) > w + 20 || Math.max(hy, ty) < -20 || Math.min(hy, ty) > h + 20) continue;
      const colony = p.kind[k] === COLONY;
      const width = colony ? Math.max(2.5, Math.min(5, z * 0.3)) : Math.max(1.5, Math.min(3, z * 0.15));
      const head = colony ? 8 : 5;
      const path = () => {
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(hx, hy);
        ctx.moveTo(hx - ux * head - uy * head * 0.6, hy - uy * head + ux * head * 0.6);
        ctx.lineTo(hx, hy);
        ctx.lineTo(hx - ux * head + uy * head * 0.6, hy - uy * head - ux * head * 0.6);
      };
      path();
      ctx.lineWidth = width + 2;
      ctx.strokeStyle = `rgba(0,0,0,${(alpha * 0.5).toFixed(3)})`;
      ctx.stroke();
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(${p.rgb[k * 3]},${p.rgb[k * 3 + 1]},${p.rgb[k * 3 + 2]},${(alpha * 0.95).toFixed(3)})`;
      ctx.stroke();
    }
    ctx.restore();
  }
}
