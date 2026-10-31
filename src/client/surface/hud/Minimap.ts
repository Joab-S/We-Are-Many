import type { Ecosystem } from '../../../sim/ecosystem';
import type { Viewport } from '../Viewport';
import { HudComponent } from './component';

/**
 * Minimapa: o mapa inteiro reduzido, os assentamentos como pontos na cor
 * do reino e o retângulo da vista. Desenha direto do canvas do mapa chapado
 * (sem copiar os pixels), a cada 150 ms.
 */
export class Minimap extends HudComponent {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly fills = new Map<string, string>();

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly view: Viewport,
    /** Canvas de um pixel por tile, já com o que mudou enviado. */
    private readonly source: () => CanvasImageSource,
  ) {
    super(150);
    this.ctx = canvas.getContext('2d')!;
  }

  protected update(eco: Ecosystem): void {
    const mini = this.canvas;
    const ctx = this.ctx;
    const view = this.view;
    const { width: w, height: h } = eco.map;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.source(), 0, 0, mini.width, mini.height);
    const sx = mini.width / w;
    const sy = mini.height / h;
    // Assentamentos como pontos na cor do reino.
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      ctx.fillStyle = this.fill(v.color);
      const r = 1 + v.tier;
      ctx.fillRect(v.x * sx - r / 2, v.y * sy - r / 2, r, r);
    }
    const vw = view.width / view.zoom;
    const vh = view.height / view.zoom;
    const x0 = view.center.x - vw / 2;
    const y0 = h - view.center.y - vh / 2;
    ctx.strokeStyle = '#f0c860';
    ctx.lineWidth = 1.5;
    for (const off of [-w, 0, w]) ctx.strokeRect((x0 + off) * sx, y0 * sy, vw * sx, vh * sy);
  }

  private fill(c: readonly number[]): string {
    const key = c.join(',');
    let s = this.fills.get(key);
    if (!s) this.fills.set(key, (s = `rgb(${key})`));
    return s;
  }

  /** Clique ou arraste no minimapa leva a câmera (x, linha do mapa). */
  pointAt(e: PointerEvent, mapWidth: number, mapHeight: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * mapWidth, ((e.clientY - r.top) / r.height) * mapHeight];
  }
}
