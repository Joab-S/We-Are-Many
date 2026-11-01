import { PICK_RADIUS_PER_ZOOM, PICK_RADIUS_PX } from './tools';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Menor e maior zoom (pixels de tela por tile). */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 48;

/**
 * Câmera da superfície: centro, zoom e o tamanho da tela. Duas convenções de
 * coordenada convivem, como sempre foi no modo:
 *
 * - **vista**: x é a coluna e y cresce para o norte (y = altura - linha), usada
 *   pelo centro, pelo mouse e pelas ferramentas;
 * - **mapa**: x é a coluna e y é a linha (cresce para o sul), usada pela simulação.
 *
 * Na tela, `screenX` e `glY` dão a posição com a origem embaixo (a camada de
 * sprites desenha assim); `canvasY` a dá com a origem em cima (o canvas das áreas).
 * O mapa se repete na horizontal.
 */
export class Viewport {
  /** Centro da vista (x, y para o norte). */
  readonly center = { x: 0, y: 0 };
  /** Ponto do mapa sob o mouse (vista); x < -1e5 quando o mouse está fora. */
  readonly hover = { x: -1e6, y: -1e6 };
  /** Mouse em pixels de tela, ou null fora do canvas. */
  mouse: { x: number; y: number } | null = null;
  zoom = 3;
  /** Tamanho da tela em pixels (o renderizador usa razão de pixel 1). */
  width = 1;
  height = 1;

  constructor(
    readonly mapWidth: number,
    readonly mapHeight: number,
  ) {
    this.center.x = mapWidth / 2;
    this.center.y = mapHeight / 2;
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    if (this.zoom < this.minZoom) this.zoom = this.minZoom;
  }

  /** Zoom mínimo: o mapa cobre a altura da tela. */
  get minZoom(): number {
    return Math.max(MIN_ZOOM, this.height / this.mapHeight);
  }

  setZoom(z: number): void {
    this.zoom = clamp(z, MIN_ZOOM, MAX_ZOOM);
  }

  /** Converte coordenadas da vista (y para o norte) em linha do mapa. */
  toRow(viewY: number): number {
    return this.mapHeight - viewY;
  }

  /** Leva a câmera até um tile (x, linha), aproximando se estiver longe. */
  goTo(x: number, row: number): void {
    this.center.x = x;
    this.center.y = this.mapHeight - row;
    this.zoom = Math.max(this.zoom, 8);
  }

  /**
   * Como no WorldBox, a vista não passa dos polos quando o mapa cabe na
   * altura da tela; na horizontal o centro dá a volta.
   */
  clampCenter(): void {
    const halfView = this.height / 2 / this.zoom;
    const mh = this.mapHeight;
    const mw = this.mapWidth;
    this.center.y = halfView * 2 < mh ? clamp(this.center.y, halfView, mh - halfView) : mh / 2;
    this.center.x = ((this.center.x % mw) + mw) % mw;
  }

  /** Recalcula o ponto sob o mouse. */
  updateHover(): void {
    const m = this.mouse;
    if (!m) {
      this.hover.x = -1e6;
      this.hover.y = -1e6;
      return;
    }
    this.hover.x = this.center.x + (m.x - this.width / 2) / this.zoom;
    this.hover.y = this.center.y + (this.height / 2 - m.y) / this.zoom;
  }

  get hovering(): boolean {
    return this.hover.x > -1e5;
  }

  /** Tile de um ponto da vista (x, y para o norte), com volta horizontal; -1 fora do mapa. */
  tileIndex(x: number, viewY: number): number {
    const w = this.mapWidth;
    const tx = ((Math.floor(x) % w) + w) % w;
    const ty = this.mapHeight - 1 - Math.floor(viewY);
    return ty < 0 || ty >= this.mapHeight ? -1 : ty * w + tx;
  }

  /** Pixel x na tela de uma coluna do mapa, pela cópia do mapa mais perto do centro. */
  screenX(x: number, z = this.zoom): number {
    const mw = this.mapWidth;
    let dx = x - this.center.x;
    dx -= Math.round(dx / mw) * mw;
    return dx * z + this.width / 2;
  }

  /** Pixel y na tela, com a origem embaixo, de uma linha do mapa. */
  glY(row: number, z = this.zoom): number {
    return (this.mapHeight - row - this.center.y) * z + this.height / 2;
  }

  /** Pixel y na tela, com a origem em cima, de uma linha do mapa. */
  canvasY(row: number, z = this.zoom): number {
    return this.height - this.glY(row, z);
  }

  /** Pixel x de um ponto da vista (sem a volta: a vista já está perto do centro). */
  viewToScreenX(x: number): number {
    return (x - this.center.x) * this.zoom + this.width / 2;
  }

  /** Pixel y (origem em cima) de um ponto da vista. */
  viewToScreenY(y: number): number {
    return this.height / 2 - (y - this.center.y) * this.zoom;
  }

  /** Ponto do mapa (x, linha) de um pixel da tela. */
  screenToMap(sx: number, sy: number): [number, number] {
    return [this.center.x + (sx - this.width / 2) / this.zoom, this.mapHeight - (this.center.y + (this.height / 2 - sy) / this.zoom)];
  }

  /** Raio de escolha em tiles para o zoom atual (RF-VIDA-330). */
  pickRadius(): number {
    return Math.max(PICK_RADIUS_PX, this.zoom * PICK_RADIUS_PER_ZOOM) / this.zoom;
  }

  /** Raio do círculo de escolha em pixels. */
  pickPixels(): number {
    return Math.max(PICK_RADIUS_PX, this.zoom * PICK_RADIUS_PER_ZOOM);
  }

  /** Assinatura da câmera (para não redesenhar parado). */
  signature(): string {
    return `${this.width},${this.height},${this.center.x},${this.center.y},${this.zoom},${this.hover.x},${this.hover.y}`;
  }
}
