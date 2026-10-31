import type { Ecosystem, Village } from '../../sim/ecosystem';
import { VOCATION_COLORS, welfare } from '../../sim/needs';
import type { BrushFx } from './fx';
import type { SurfaceSettings } from './hud/Windows';
import type { Selection } from './selection';
import type { CreaturePositions } from './SpriteCollector';
import type { Viewport } from './Viewport';
import type { WeatherView } from './weatherView';

/**
 * Canvas transparente por cima do mapa: o assentamento com a janela aberta,
 * os marcadores de seleção, o clima, a animação das ferramentas e o
 * território de cada assentamento na cor do seu reino.
 */
export class MapOverlay {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pts: Float32Array = new Float32Array(256);

  constructor(
    readonly canvas: HTMLCanvasElement,
    private readonly eco: Ecosystem,
    private readonly view: Viewport,
    private readonly sel: Selection,
    private readonly settings: SurfaceSettings,
    private readonly weather: WeatherView,
    private readonly fx: BrushFx,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  /**
   * Território de cada assentamento na cor do seu reino: área tingida e borda.
   * Assentamentos do mesmo reino têm a mesma cor; povos independentes, outra.
   */
  draw(openId: number | null, pos: CreaturePositions, brush: number): void {
    const canvas = this.canvas;
    const view = this.view;
    const w = view.width;
    const h = view.height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = this.ctx;
    ctx.clearRect(0, 0, w, h);
    this.drawOpenSettlement(openId);
    this.drawSelection(pos);
    this.weather.draw(ctx, view);
    this.fx.draw(ctx, view, brush);
    if (!this.settings.showTerritory) return;
    const z = view.zoom;
    const eco = this.eco;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      const sx = view.screenX(v.x);
      const sy = view.canvasY(v.y);
      const r = (eco.radius(v) + 7) * z;
      if (sx < -r || sx > w + r || sy < -r || sy > h + r) continue;
      const c = this.layerColor(v).join(',');
      const capital = v.kingdom === v.id;
      this.regionPath(v);
      // De perto o véu fica leve, para não apagar a arte das casas, ruas e plantações, mas a área segue visível.
      const strong = this.settings.layer === 'kingdoms' ? 1 : 2;
      const near = Math.max(0.45, Math.min(1, (14 - z) / 8));
      ctx.fillStyle = `rgba(${c},${(near * Math.min(0.18 * strong, Math.max(0.03, (0.7 * strong) / z))).toFixed(3)})`;
      ctx.fill();
      ctx.lineWidth = Math.min(capital ? 4 : 3, Math.max(1.5, z * (capital ? 0.35 : 0.22)));
      ctx.setLineDash(capital ? [] : [z * 0.8, z * 0.5]);
      ctx.strokeStyle = `rgba(${c},${(0.9 * near).toFixed(3)})`;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /**
   * Contorno real do assentamento: envolve a praça, as casas, os prédios, o
   * porto, as plantações, os currais e as ruas internas, seguindo o formato e
   * a área verdadeira da vila.
   */
  private regionPath(v: Village): void {
    const ctx = this.ctx;
    const view = this.view;
    const radii = this.eco.villageContour(v);
    const N = radii.length;
    const cx = view.screenX(v.x);
    const cy = view.canvasY(v.y);
    const z = view.zoom;
    const pts = N * 2 <= this.pts.length ? this.pts : new Float32Array(N * 2);
    for (let k = 0; k < N; k++) {
      const a = (k / N) * Math.PI * 2;
      const r = radii[k] * z;
      pts[k * 2] = cx + Math.cos(a) * r;
      pts[k * 2 + 1] = cy + Math.sin(a) * r;
    }
    ctx.beginPath();
    ctx.moveTo((pts[(N - 1) * 2] + pts[0]) * 0.5, (pts[(N - 1) * 2 + 1] + pts[1]) * 0.5);
    for (let k = 0; k < N; k++) {
      const px = pts[k * 2];
      const py = pts[k * 2 + 1];
      const n = ((k + 1) % N) * 2;
      ctx.quadraticCurveTo(px, py, (px + pts[n]) * 0.5, (py + pts[n + 1]) * 0.5);
    }
    ctx.closePath();
  }

  /**
   * Destaque do assentamento com a janela aberta (RF-VIDA-348): área
   * tingida, prédios contornados, minas e porto.
   */
  private drawOpenSettlement(openId: number | null): void {
    if (openId === null) return;
    const eco = this.eco;
    const v = eco.villages[openId];
    if (!v || v.abandoned) return;
    const ctx = this.ctx;
    const view = this.view;
    const w = view.width;
    const z = view.zoom;
    const c = v.color.join(',');
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    this.regionPath(v);
    ctx.fillStyle = `rgba(${c},0.14)`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255,240,180,${(0.5 + 0.4 * pulse).toFixed(2)})`;
    ctx.stroke();
    // Rotas das caravanas ligadas ao assentamento (RF-VIDA-348).
    ctx.setLineDash([Math.max(3, z * 0.6), Math.max(2, z * 0.4)]);
    ctx.lineWidth = Math.max(1.5, z * 0.12);
    ctx.strokeStyle = 'rgba(255,240,180,0.7)';
    const mw = eco.map.width;
    for (const car of eco.caravans) {
      if (car.home !== v.id && car.target !== v.id) continue;
      ctx.beginPath();
      let last = NaN;
      for (const t of car.path) {
        const px = view.screenX((t % mw) + 0.5);
        const py = view.canvasY(Math.floor(t / mw) + 0.5);
        // Na volta do mapa (borda leste-oeste) a linha recomeça do outro lado.
        if (Math.abs(px - last) < w / 2) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        last = px;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (z < 3) return;
    ctx.lineWidth = Math.max(1, z * 0.12);
    ctx.strokeStyle = 'rgba(255,240,180,0.85)';
    for (const b of v.houses) {
      const size = b.kind === 'port' ? 1 : 2;
      if (b.kind !== 'house') ctx.strokeRect(view.screenX(b.x), view.canvasY(b.y), size * z, size * z);
    }
    ctx.strokeStyle = 'rgba(240,200,96,0.9)';
    for (const id of v.mines) {
      const d = eco.deposits[id];
      if (!d) continue;
      ctx.beginPath();
      ctx.arc(view.screenX(d.x + 0.5), view.canvasY(d.y + 0.5), z * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * Marcadores (RF-VIDA-330, 332, 336 e 337): contorno de quem o clique
   * escolheria, anel pulsante na cor do reino (branco para animais) sobre
   * quem está selecionado, com seta na borda da tela quando sai da vista, e
   * anéis pequenos nos destacados e no grupo. As posições são as desenhadas.
   */
  private drawSelection(pos: CreaturePositions): void {
    const eco = this.eco;
    const ctx = this.ctx;
    const view = this.view;
    const sel = this.sel;
    const w = view.width;
    const h = view.height;
    const z = view.zoom;
    const t = performance.now() / 1000;
    const colorOf = (i: number) => (eco.village[i] >= 0 && eco.species[eco.kind[i]].kind === 'sapient' ? eco.villages[eco.village[i]].color.join(',') : '255,255,255');
    // O desenho da criatura fica meio tile acima do ponto dela.
    const atX = (i: number) => view.screenX(pos.x(i));
    const atY = (i: number) => view.canvasY(pos.y(i)) - z * 0.5;
    const ring = (i: number, r: number, width: number, alpha: number) => {
      const sx = atX(i);
      const sy = atY(i);
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) return;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(${colorOf(i)},${alpha.toFixed(2)})`;
      ctx.stroke();
    };
    const base = view.pickPixels();
    if (sel.highlight) for (const i of sel.highlighted()) ring(i, base * 0.8, 1.5, 0.85);
    const pin = sel.pinned;
    if (pin && 'group' in pin) {
      for (let i = 0; i < eco.count; i++) if (eco.alive[i] && pin.set.has(eco.uid[i])) ring(i, base * 0.8, 1.5, 0.9);
    }
    if (sel.hoverPick >= 0 && !(pin && 'creature' in pin && pin.creature === sel.hoverPick)) {
      ctx.beginPath();
      ctx.arc(atX(sel.hoverPick), atY(sel.hoverPick), base, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
    }
    const i = sel.creature;
    if (i < 0) return;
    const sx = atX(i);
    const sy = atY(i);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const inside = sx >= 0 && sx <= w && sy >= 0 && sy <= h;
    if (inside) {
      ctx.beginPath();
      ctx.arc(sx, sy, base * (1.1 + 0.25 * pulse), 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${colorOf(i)},${(0.7 + 0.3 * pulse).toFixed(2)})`;
      ctx.stroke();
      return;
    }
    // Fora da vista: seta na borda apontando para ela.
    const a = Math.atan2(sy - h / 2, sx - w / 2);
    const m = 24;
    const k = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(a))), (h / 2 - m) / Math.max(1e-6, Math.abs(Math.sin(a))));
    ctx.save();
    ctx.translate(w / 2 + Math.cos(a) * k, h / 2 + Math.sin(a) * k);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = `rgba(${colorOf(i)},0.95)`;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Cor do assentamento na camada escolhida: reino, vocação ou situação da economia. */
  private layerColor(v: Village): readonly number[] {
    const layer = this.settings.layer;
    if (layer === 'vocation') return v.vocation ? VOCATION_COLORS[v.vocation] : [160, 160, 160];
    if (layer === 'economy') {
      const w = v.needs ? welfare(v.needs) : 1;
      const t = Math.max(0, Math.min(1, (w - 0.4) / 0.55));
      return [Math.round(230 - 150 * t), Math.round(70 + 140 * t), 60];
    }
    return v.color;
  }
}
