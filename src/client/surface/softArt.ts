/**
 * Arte do mapa de perto, em Canvas 2D (a superfície não usa placa de vídeo):
 * bordas onduladas entre tiles, espuma na costa, ruas, plantações e enfeites,
 * com uma textura leve no chão. Pintada na CPU em blocos de 32x32 tiles
 * guardados em cache; cada bloco só é refeito quando um tile dele muda, e no
 * máximo a cada 1,5 s. De longe o mapa fica chapado (um pixel por tile).
 */

const CHUNK = 32;
/**
 * Pixels de arte por tile: 8, a mesma escala das casas e criaturas (uma
 * cabana de 2 tiles tem 16 pixels), para o chão não ficar mais miúdo que elas.
 * As coordenadas internas continuam em 16 por tile, andando de 2 em 2.
 */
const ART = 8;
const STEP = 16 / ART;
/** Blocos guardados. */
const KEEP = 140;
/** Tempo máximo por quadro gasto refazendo blocos (ms). */
const BUDGET = 12;

interface Chunk {
  canvas: HTMLCanvasElement;
  dirty: boolean;
  drawnAt: number;
  usedAt: number;
}

const fract = (x: number) => x - Math.floor(x);
const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);

export class SoftArt {
  private readonly chunks = new Map<string, Chunk>();
  private readonly decor: Uint8ClampedArray;
  private readonly decorW: number;
  private readonly cols: number;
  private readonly rows: number;

  constructor(
    private readonly pixels: Uint8Array,
    private readonly width: number,
    private readonly height: number,
    decorCanvas: HTMLCanvasElement,
  ) {
    this.decor = decorCanvas.getContext('2d')!.getImageData(0, 0, decorCanvas.width, decorCanvas.height).data;
    this.decorW = decorCanvas.width;
    this.cols = Math.ceil(width / CHUNK);
    this.rows = Math.ceil(height / CHUNK);
  }

  /** Resolução dos blocos para o zoom; 0 (mapa chapado) até chegar bem perto. */
  static levelFor(zoom: number): number {
    return zoom < 8 ? 0 : ART;
  }

  /** O tile `i` mudou (linha da textura, y para baixo): marca o bloco dele e os vizinhos que o enxergam. */
  invalidate(i: number): void {
    const x = i % this.width;
    const y = (i - x) / this.width;
    const seen = new Set<string>();
    for (const [ox, oy] of [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]]) {
      const cx = (((Math.floor((x + ox) / CHUNK)) % this.cols) + this.cols) % this.cols;
      const cy = Math.floor((y + oy) / CHUNK);
      if (cy < 0 || cy >= this.rows) continue;
      const k = `${cx},${cy}`;
      if (seen.has(k)) continue;
      seen.add(k);
      for (const level of [ART]) {
        const c = this.chunks.get(`${level}:${k}`);
        if (c) c.dirty = true;
      }
    }
  }

  /**
   * Desenha os blocos visíveis. `top` é o y na tela da linha 0 da textura e
   * `centerX` a coluna no centro da tela (o mapa se repete na horizontal).
   * Blocos ainda não pintados ficam para os próximos quadros (devolve falso);
   * o chamador já desenhou o mapa chapado por baixo.
   */
  draw(ctx: CanvasRenderingContext2D, level: number, z: number, x0: number, x1: number, r0: number, r1: number, top: number, centerX: number, w: number): boolean {
    const now = performance.now();
    let complete = true;
    const start = now;
    const size = CHUNK * z;
    for (let cy = Math.max(0, Math.floor(r0 / CHUNK)); cy <= Math.min(this.rows - 1, Math.floor(r1 / CHUNK)); cy++) {
      for (let gx = Math.floor(x0 / CHUNK); gx <= Math.floor(x1 / CHUNK); gx++) {
        const cx = ((gx % this.cols) + this.cols) % this.cols;
        const key = `${level}:${cx},${cy}`;
        let c = this.chunks.get(key);
        const stale = !c || (c.dirty && now - c.drawnAt > 1500);
        if (stale && performance.now() - start < BUDGET) {
          c = this.render(level, cx, cy, c);
          this.chunks.set(key, c);
        } else if (stale) complete = false;
        if (!c) continue;
        c.usedAt = now;
        const dx = (gx * CHUNK - centerX) * z + w / 2;
        ctx.drawImage(c.canvas, Math.floor(dx), Math.floor(top + cy * size), Math.ceil(size) + 1, Math.ceil(size) + 1);
      }
    }
    this.trim(level);
    return complete;
  }

  private trim(level: number): void {
    const mine = [...this.chunks.entries()].filter(([k]) => k.startsWith(`${level}:`));
    if (mine.length <= KEEP) return;
    mine.sort((a, b) => a[1].usedAt - b[1].usedAt);
    for (let k = 0; k < mine.length - KEEP; k++) this.chunks.delete(mine[k][0]);
  }

  // Leitura da textura ----------------------------------------------------

  private idx(tx: number, ty: number): number {
    const x = ((tx % this.width) + this.width) % this.width;
    const y = Math.min(this.height - 1, Math.max(0, ty));
    return (y * this.width + x) * 4;
  }

  private kindAt(o: number): number {
    return this.pixels[o + 3] >> 4;
  }

  private waterAt(o: number): boolean {
    const p = this.pixels;
    return p[o + 2] > p[o] + 64 && p[o + 2] > p[o + 1];
  }

  private edgeNoise(p: number, line: number): number {
    const i = Math.floor(p);
    const u = p - i;
    const a = hash(i, line);
    const b = hash(i + 1, line);
    return a + (b - a) * u * u * (3 - 2 * u);
  }

  /** Tile cuja cor vale no pixel de arte (gx, gy), com a fronteira ondulada . */
  private artTile(gx: number, gy: number): number {
    const tx = Math.floor(gx / 16);
    const ty = Math.floor(gy / 16);
    const fx = gx - tx * 16;
    const fy = gy - ty * 16;
    const me = this.idx(tx, ty);
    if (this.kindAt(me) >= 7) return me;
    const ex = fx < 8 ? fx : 15 - fx;
    const ey = fy < 8 ? fy : 15 - fy;
    const vertical = ex < ey;
    const e = Math.min(ex, ey);
    if (e >= 4) return me;
    const ox = vertical ? (fx < 8 ? -1 : 1) : 0;
    const oy = vertical ? 0 : fy < 8 ? -1 : 1;
    const nb = this.idx(tx + ox, ty + oy);
    if (this.kindAt(nb) >= 7) return me;
    const line = vertical ? (tx + Math.max(ox, 0)) * 3.7 + 11 : (ty + Math.max(oy, 0)) * 5.3 + 47;
    const along = vertical ? gy : gx;
    const d = (this.edgeNoise(along / 5, line) - 0.5) * 9;
    const lowSide = vertical ? ox > 0 : oy > 0;
    const push = lowSide ? d : -d;
    return push > e + 0.5 ? nb : me;
  }

  private waterPx(gx: number, gy: number): boolean {
    return this.waterAt(this.artTile(gx, gy));
  }

  private isRoad(o: number): boolean {
    const k = this.kindAt(o);
    return k >= 8 && k <= 10;
  }

  // Pintura -----------------------------------------------------------------

  private render(level: number, cx: number, cy: number, old?: Chunk): Chunk {
    const n = CHUNK * level;
    const canvas = old?.canvas ?? document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const g = canvas.getContext('2d')!;
    const img = g.createImageData(n, n);
    const out = img.data;
    const step = 16 / level;
    const zoom = 8;
    const rgb: [number, number, number] = [0, 0, 0];
    for (let py = 0; py < n; py++) {
      const ty = cy * CHUNK + Math.floor(py / level);
      if (ty >= this.height) break;
      const fy = (py % level) * step;
      for (let px = 0; px < n; px++) {
        const tx = cx * CHUNK + Math.floor(px / level);
        const fx = (px % level) * step;
        this.pixel(tx, ty, fx, fy, zoom, rgb);
        const o = (py * n + px) * 4;
        out[o] = rgb[0] * 255;
        out[o + 1] = rgb[1] * 255;
        out[o + 2] = rgb[2] * 255;
        out[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const now = performance.now();
    return { canvas, dirty: false, drawnAt: now, usedAt: now };
  }

  /** Cor de um pixel de arte: tile (tx, ty), posição (fx, fy) dentro dele (0..15). */
  private pixel(tx: number, ty: number, fx: number, fy: number, zoom: number, out: [number, number, number]): void {
    const p = this.pixels;
    const own = this.idx(tx, ty);
    const kind = this.kindAt(own);
    const gx = tx * 16 + fx;
    const gy = ty * 16 + fy;
    const src = this.artTile(gx, gy);
    let r = p[src] / 255;
    let gr = p[src + 1] / 255;
    let b = p[src + 2] / 255;
    const water = this.waterAt(src);
    const st = src / 4;
    const ptx = st % this.width;
    const pty = (st - ptx) / this.width;
    // Manchas de 3x3 pixels de arte (6 na grade de 16).
    const blot = hash(Math.floor(gx / 6) + 0.37, Math.floor(gy / 6) + 0.37);
    let m = 0.97 + 0.06 * hash(ptx, pty);
    r *= m;
    gr *= m;
    b *= m;
    if (water) {
      // Água rasa perto da terra e espuma colada na costa.
      const near =
        !this.waterAt(this.idx(ptx, pty - 1)) || !this.waterAt(this.idx(ptx, pty + 1)) || !this.waterAt(this.idx(ptx - 1, pty)) || !this.waterAt(this.idx(ptx + 1, pty));
      if (near) {
        r = r * 0.7 + 0.45 * 0.3;
        gr = gr * 0.7 + 0.78 * 0.3;
        b = b * 0.7 + 0.92 * 0.3;
      }
      m = 0.98 + 0.03 * blot;
      r *= m;
      gr *= m;
      b *= m;
      if (zoom >= 4) {
        const S = STEP;
        const shore = !this.waterPx(gx + S, gy) || !this.waterPx(gx - S, gy) || !this.waterPx(gx, gy + S) || !this.waterPx(gx, gy - S);
        if (shore) {
          r = r * 0.4 + 0.93 * 0.6;
          gr = gr * 0.4 + 0.97 * 0.6;
          b = b * 0.4 + 0.6;
        } else if (!this.waterPx(gx + 2 * S, gy) || !this.waterPx(gx - 2 * S, gy) || !this.waterPx(gx, gy + 2 * S) || !this.waterPx(gx, gy - 2 * S)) {
          r = r * 0.65 + 0.6 * 0.35;
          gr = gr * 0.65 + 0.86 * 0.35;
          b = b * 0.65 + 0.95 * 0.35;
        }
      }
    } else {
      const green = gr > r && gr > b * 1.1;
      const sand = r > 0.55 && r >= gr && gr > b + 0.08;
      // Textura leve: só manchas suaves, sem granulado.
      if (green) m = 0.96 + 0.06 * blot;
      else if (sand) m = 0.98 + 0.03 * blot;
      else m = 0.96 + 0.06 * blot;
      if (zoom >= 4) {
        const S = STEP;
        if (this.waterPx(gx, gy + S) || this.waterPx(gx, gy + 2 * S)) m *= 0.62;
        else if (this.waterPx(gx + S, gy) || this.waterPx(gx - S, gy) || this.waterPx(gx, gy - S)) m *= 0.85;
      }
      r *= m;
      gr *= m;
      b *= m;
    }
    if (kind >= 8 && kind <= 10) {
      this.road(tx, ty, fx, fy, kind, p[src] / 255, p[src + 1] / 255, p[src + 2] / 255, out);
      return this.clamp(out);
    }
    if (zoom >= (kind === 7 ? 3 : 5) && kind > 0 && kind <= 7) {
      // Arte 16x16 do enfeite: alfa cheio é cor, alfa parcial é sombra.
      // Cada pixel de arte cobre 2x2 do desenho de 16: vale o pixel mais opaco do bloco.
      let d = (fy * this.decorW + (kind - 1) * 16 + fx) * 4;
      for (const [ox, oy] of [[1, 1], [1, 0], [0, 1]]) {
        const e = ((fy + oy) * this.decorW + (kind - 1) * 16 + fx + ox) * 4;
        if (this.decor[e + 3] > this.decor[d + 3]) d = e;
      }
      const a = this.decor[d + 3] / 255;
      if (a > 0.9) {
        const s = 0.94 + 0.12 * hash(tx + 7, ty + 7);
        r = (this.decor[d] / 255) * s;
        gr = (this.decor[d + 1] / 255) * s;
        b = (this.decor[d + 2] / 255) * s;
      } else if (a > 0.2) {
        r *= 0.62;
        gr *= 0.62;
        b *= 0.62;
      }
    }
    out[0] = r;
    out[1] = gr;
    out[2] = b;
    this.clamp(out);
  }

  private clamp(c: [number, number, number]): void {
    c[0] = Math.min(1, Math.max(0, c[0]));
    c[1] = Math.min(1, Math.max(0, c[1]));
    c[2] = Math.min(1, Math.max(0, c[2]));
  }

  private onRoad(fx: number, fy: number, lo: number, hi: number, rn: boolean, rs: boolean, rw: boolean, re: boolean): boolean {
    const midX = fx >= lo && fx <= hi;
    const midY = fy >= lo && fy <= hi;
    if (midX && midY) {
      const cx = fx === lo || fx === hi;
      const cy = fy === lo || fy === hi;
      if (cx && cy) return (fy === lo ? rn : rs) || (fx === lo ? rw : re);
      return true;
    }
    if (midX && fy < lo) return rn;
    if (midX && fy > hi) return rs;
    if (midY && fx < lo) return rw;
    if (midY && fx > hi) return re;
    return false;
  }

  /** Ruas: terra batida (8), pedra (9) e praça (10). */
  private road(tx: number, ty: number, fx: number, fy: number, kind: number, br: number, bg: number, bb: number, out: [number, number, number]): void {
    const p = this.pixels;
    const n = this.idx(tx, ty - 1);
    const s = this.idx(tx, ty + 1);
    const wv = this.idx(tx - 1, ty);
    const e = this.idx(tx + 1, ty);
    const rn = this.isRoad(n);
    const rs = this.isRoad(s);
    const rw = this.isRoad(wv);
    const re = this.isRoad(e);
    const gx = tx * 16 + fx;
    const gy = ty * 16 + fy;
    const S = STEP;
    const set = (k: number) => {
      out[0] = br * k;
      out[1] = bg * k;
      out[2] = bb * k;
    };
    if (kind === 10) {
      // Praça: lajes de 4x4 pixels de arte com rejunte e borda.
      const edge = (fy === 0 && !rn) || (fy >= 16 - S && !rs) || (fx === 0 && !rw) || (fx >= 16 - S && !re);
      if (edge) return set(0.7);
      if (gx % 8 === 0 || gy % 8 === 0) return set(0.8);
      return set(0.93 + 0.1 * hash(Math.floor(gx / 8) + 2, Math.floor(gy / 8) + 2));
    }
    // Faixa da rua: 6 pixels de arte na pedra, 4 na terra, centrada no tile.
    const lo = kind === 9 ? 2 : 4;
    const hi = 15 - lo;
    const on = (x: number, y: number) => this.onRoad(x, y, lo, hi, rn, rs, rw, re);
    if (!on(fx, fy)) {
      // Chão do vizinho que não é rua; pisado logo ao lado da rua.
      const o = !rn ? n : !rs ? s : !rw ? wv : !re ? e : -1;
      let r = o >= 0 ? p[o] / 255 : br * 1.1;
      let g = o >= 0 ? p[o + 1] / 255 : bg * 1.1;
      let b = o >= 0 ? p[o + 2] / 255 : bb * 1.1;
      if (o >= 0 && this.waterAt(o)) {
        r = 0.55;
        g = 0.62;
        b = 0.32;
      }
      let k = 0.96 + 0.06 * hash(Math.floor(gx / 6) + 0.37, Math.floor(gy / 6) + 0.37);
      if (on(fx + S, fy) || on(fx - S, fy) || on(fx, fy + S) || on(fx, fy - S)) k *= 0.85;
      out[0] = r * k;
      out[1] = g * k;
      out[2] = b * k;
      return;
    }
    const border = !on(fx + S, fy) || !on(fx - S, fy) || !on(fx, fy + S) || !on(fx, fy - S);
    if (kind === 9) {
      // Calçamento: pedras de 4x2 pixels de arte em fiadas desencontradas e meio-fio claro.
      if (border) return set(1.15);
      const row = Math.floor(gy / 4);
      const off = (row % 2) * 4;
      if (gy % 4 === 0 || (gx + off) % 8 === 0) return set(0.75);
      return set(0.94 + 0.08 * hash(Math.floor((gx + off) / 8) + 9, row + 9));
    }
    // Terra batida: borda escura e manchas suaves.
    if (border) return set(0.8);
    set(0.97 + 0.05 * hash(Math.floor(gx / 6) + 1.3, Math.floor(gy / 6) + 1.3));
  }
}
