import { paintSurface, paintTile, tileHash, type SurfaceMap } from '../../procgen/surface';
import { isLand, type Ecosystem } from '../../sim/ecosystem';
import { AVENUE, GRAVEL, TRAIL, WALL } from '../../sim/architecture';
import { paintGeoTile, paintGeoView, type GeoView } from '../../procgen/debugViews';
import { makeDecorCanvas } from './art';
import { DirtyBlocks } from './dirty';
import { SoftArt } from './softArt';
import type { Viewport } from './Viewport';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Blocos sujos que vão para a tela por quadro, além dos do jogador (sempre) — 64×64 tiles cada. */
const UPLOAD_BUDGET = 48;

/**
 * O chão do mapa: um pixel por tile (RGBA, com o enfeite do tile no alfa),
 * o canvas chapado que vai para a tela, a arte detalhada de perto (softArt)
 * e os enfeites de 16 pixels por cima. Ruas, praças, muralhas e quintais são
 * pintados por cima do bioma (`paintSettlement`).
 *
 * Dirty Flag: o motor avisa o tile que mudou (`markDirty`, chamado pelo
 * gancho `tileChanged` da fachada do motor, que só marca); `flush` repinta
 * os tiles marcados e, dos que mudaram de cor de verdade, envia ao canvas só
 * o retângulo sujo de cada bloco de 64×64. O que o jogador mudou vai já; o
 * que a simulação mudou (a vegetação muda em tiles sorteados pelo mapa
 * inteiro) vai por orçamento, a vista primeiro.
 *
 * Não há caminho WebGL para o mapa: desde 0f7b0c7 a superfície desenha sempre
 * em Canvas 2D (o 3D fica escondido). Se um dia o mapa voltar a ser textura,
 * o three 0.186 já envia só faixas da textura (`Texture.addUpdateRange`, por
 * linhas) ou um retângulo (`renderer.copyTextureToTexture`): os blocos sujos
 * daqui servem às duas.
 */
export class MapRaster {
  readonly pixels: Uint8Array;
  /** Visão de depuração do gerador (placas, altitude, T, H, biomas) no lugar do mapa normal. */
  geoView: GeoView = 'none';
  /** Sobe a cada tile repintado (o painel refaz as contas do mapa quando ela muda). */
  version = 0;
  /** Enquanto verdadeiro, o que for marcado é do jogador e vai para a tela no mesmo quadro. */
  urgent = false;
  /** Medidas do último `flush`: tiles repintados, os que mudaram de cor, blocos e pixels enviados. */
  readonly stats = { tiles: 0, changed: 0, blocks: 0, pixels: 0, totalPixels: 0 };
  private readonly decorCanvas = makeDecorCanvas();
  private softCanvas: HTMLCanvasElement | null = null;
  private softCtx: CanvasRenderingContext2D | null = null;
  private softImage: ImageData | null = null;
  private softArt: SoftArt | null = null;
  /** Tiles marcados e ainda não repintados (sem repetição). */
  private readonly queued: Uint8Array;
  private queue = new Int32Array(1024);
  private queueN = 0;
  private readonly blocks: DirtyBlocks;

  constructor(
    private readonly map: SurfaceMap,
    private readonly eco: Ecosystem,
  ) {
    this.pixels = new Uint8Array(map.width * map.height * 4);
    this.queued = new Uint8Array(map.width * map.height);
    this.blocks = new DirtyBlocks(map.width, map.height, 64);
    this.paintAll();
  }

  /** Pinta o mapa inteiro (bioma ou visão do gerador) e as construções por cima. */
  private paintAll(): void {
    const eco = this.eco;
    if (this.geoView === 'none') {
      paintSurface(this.map, this.pixels);
      for (let i = 0; i < eco.road.length; i++) if (eco.road[i] || eco.built[i] || eco.wall[i]) this.paintSettlement(i);
    } else paintGeoView(this.map, this.geoView, this.pixels);
  }

  /** Um tile mudou (ouvinte do motor): só marca para repintar; o bioma já foi reclassificado no motor. */
  markDirty(i: number): void {
    const q = this.queued[i];
    if (!q) {
      if (this.queueN >= this.queue.length) {
        const grown = new Int32Array(this.queue.length * 2);
        grown.set(this.queue);
        this.queue = grown;
      }
      this.queue[this.queueN++] = i;
    }
    // 1: mudou na simulação; 2: mudou pelo jogador (vai para a tela no mesmo quadro).
    if (q !== 2) this.queued[i] = this.urgent ? 2 : 1;
  }

  /** Há tiles por repintar ou blocos por enviar (redesenhar). */
  get pending(): boolean {
    return this.queueN > 0 || this.blocks.count > 0;
  }

  /** Repinta os tiles marcados e envia os blocos sujos ao canvas (os da vista primeiro). */
  flush(view: Viewport): void {
    const map = this.map;
    const eco = this.eco;
    const st = this.stats;
    st.tiles = this.queueN;
    st.blocks = 0;
    st.pixels = 0;
    const px = this.pixels;
    const mw = map.width;
    let changed = 0;
    for (let k = 0; k < this.queueN; k++) {
      const i = this.queue[k];
      const urgent = this.queued[i] === 2;
      this.queued[i] = 0;
      const o = i * 4;
      const r = px[o];
      const g = px[o + 1];
      const b = px[o + 2];
      const a = px[o + 3];
      if (this.geoView !== 'none') paintGeoTile(map, this.geoView, px, i);
      else paintTile(map, px, i);
      if (eco.road[i] || eco.built[i] || eco.wall[i]) this.paintSettlement(i);
      // A vegetação muda um pouco em milhares de tiles por passo e quase sempre a cor do tile fica igual:
      // só o que mudou de verdade na tela suja a arte detalhada e o bloco a enviar.
      if (px[o] === r && px[o + 1] === g && px[o + 2] === b && px[o + 3] === a) continue;
      changed++;
      this.softArt?.invalidate(i);
      const x = i % mw;
      this.blocks.mark(x, (i - x) / mw, urgent);
    }
    st.changed = changed;
    if (this.queueN) this.version++;
    this.queueN = 0;
    if (!this.softCanvas || !this.blocks.count) return;
    const out = this.softImage!.data;
    const src = this.pixels;
    const size = this.blocks.size;
    const cols = this.blocks.cols;
    // Colunas e linhas da vista (com a volta horizontal).
    const z = view.zoom;
    const vx0 = view.center.x - view.width / 2 / z;
    const span = view.width / z;
    const all = span >= mw;
    const xs = ((vx0 % mw) + mw) % mw;
    const r0 = map.height - view.center.y - view.height / 2 / z;
    const r1 = r0 + view.height / z;
    const visible = (b: number) => {
      const by = Math.floor(b / cols) * size;
      if (by > r1 || by + size < r0) return false;
      if (all) return true;
      const bx = (b % cols) * size;
      return (bx <= xs + span && bx + size >= xs) || (bx + mw <= xs + span && bx + mw + size >= xs);
    };
    this.blocks.drain(UPLOAD_BUDGET, visible, (_b, x0, y0, x1, y1) => {
      for (let y = y0; y <= y1; y++) {
        let o = (y * mw + x0) * 4;
        for (let x = x0; x <= x1; x++, o += 4) {
          out[o] = src[o];
          out[o + 1] = src[o + 1];
          out[o + 2] = src[o + 2];
          out[o + 3] = 255;
        }
      }
      const dw = x1 - x0 + 1;
      const dh = y1 - y0 + 1;
      this.softCtx!.putImageData(this.softImage!, 0, 0, x0, y0, dw, dh);
      st.blocks++;
      st.pixels += dw * dh;
    });
    st.totalPixels += st.pixels;
  }

  /** Troca a visão do mapa (normal ou uma etapa do gerador) e repinta tudo. */
  setGeoView(view: GeoView): void {
    this.geoView = view;
    this.paintAll();
    // A arte detalhada guarda blocos pintados; recomeça do zero com os pixels novos.
    this.softArt = null;
    this.version++;
    this.blocks.markAll(true);
  }

  /** Ruas, praça e terreno das casas por cima do terreno, sem enfeites. */
  private paintSettlement(i: number): void {
    if (this.geoView !== 'none' || !isLand(this.map, i)) return;
    const o = i * 4;
    const px = this.pixels;
    const eco = this.eco;
    const road = eco.road[i];
    const n = tileHash(i) * 0.12 - 0.06;
    let c: [number, number, number] | null = null;
    // Ruas pela era e pela hierarquia (19.8, RF-VIDA-253): trilha, terra batida, cascalho nas principais, pedra, calçamento.
    const era = road === 1 || road === 2 ? this.streetEra(i) : 0;
    const main = eco.mainStreet[i] === 1;
    if (road === 1) c = era === 0 ? [164, 130, 88] : era >= 2 && main ? [170, 162, 146] : [140, 104, 66];
    else if (road === 2) c = era >= 4 ? [124, 122, 130] : [146, 144, 150];
    else if (road === AVENUE) c = [108, 108, 118];
    else if (road === GRAVEL) c = [158, 148, 128];
    else if (road === 3) c = [184, 160, 120];
    else if (road === 4) c = [196, 160, 78];
    else if (road === 5) c = [118, 168, 74];
    else if (road === TRAIL) {
      // Trilha de desejo (RF-AS-13): o chão gasto pelos passos, meio apagado sobre o terreno.
      c = [px[o] * 0.45 + 172 * 0.55, px[o + 1] * 0.45 + 146 * 0.55, px[o + 2] * 0.45 + 104 * 0.55];
    }
    // Muralha que segue a pegada (RF-AS-18): paliçada de troncos, pedra e portão.
    const wall = eco.wall[i];
    if (wall) c = wall === WALL.palisade ? [104, 72, 44] : wall === WALL.stone ? [132, 128, 124] : [168, 136, 92];
    if (c) {
      px[o] = clamp(c[0] * (1 + n), 0, 255);
      px[o + 1] = clamp(c[1] * (1 + n), 0, 255);
      px[o + 2] = clamp(c[2] * (1 + n), 0, 255);
    } else {
      // Quintal: o chão sob a casa fica um pouco mais seco.
      px[o] = clamp(px[o] * 1.05 + 10, 0, 255);
      px[o + 1] = clamp(px[o + 1] * 0.98, 0, 255);
    }
    // Plantação leva o enfeite de trigo (7); terra batida, pedra e praça, os
    // enfeites 8, 9 e 10 (desenhados em softArt.ts); casas, o 15 (nem enfeite nem grama).
    const kind = wall ? 15 : road === 4 ? 7 : road === 1 || road === GRAVEL ? 8 : road === 2 || road === AVENUE ? 9 : road === 3 ? 10 : 15;
    px[o + 3] = kind * 16 + 15;
  }

  /** Era do assentamento dono da rua neste tile (0 fora de qualquer um). */
  private streetEra(i: number): number {
    const w = this.map.width;
    const v = this.eco.settlementAt((i % w) + 0.5, Math.floor(i / w) + 0.5);
    return v ? Math.floor(v.tech) : 0;
  }

  /** Canvas de um pixel por tile, com os blocos já enviados (também é a fonte do minimapa). */
  canvas(): HTMLCanvasElement {
    const map = this.map;
    if (!this.softCanvas) {
      // A primeira vez vai o mapa inteiro; depois, só os blocos sujos (flush).
      this.softCanvas = document.createElement('canvas');
      this.softCanvas.width = map.width;
      this.softCanvas.height = map.height;
      this.softCtx = this.softCanvas.getContext('2d')!;
      this.softImage = new ImageData(map.width, map.height);
      const out = this.softImage.data;
      const src = this.pixels;
      for (let i = 0; i < out.length; i += 4) {
        out[i] = src[i];
        out[i + 1] = src[i + 1];
        out[i + 2] = src[i + 2];
        out[i + 3] = 255;
      }
      this.softCtx.putImageData(this.softImage, 0, 0);
      this.blocks.clear();
      this.stats.totalPixels += map.width * map.height;
    }
    return this.softCanvas;
  }

  /**
   * Desenha o chão em Canvas 2D: o mapa vira um canvas de um pixel por
   * tile, ampliado sem suavização; bem de perto (zoom 8 em diante), por cima
   * vai a arte detalhada feita na CPU (softArt.ts) e, de zoom 5 em diante, os
   * enfeites. Devolve falso se ainda faltam blocos da arte (redesenhar no próximo quadro).
   */
  draw(ctx: CanvasRenderingContext2D, view: Viewport, z: number): boolean {
    const map = this.map;
    const mw = map.width;
    const mh = map.height;
    const w = view.width;
    const h = view.height;
    const cx = view.center.x;
    const cy = view.center.y;
    const soft = this.canvas();
    let complete = true;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    // Canto superior esquerdo do mapa na tela; o mapa se repete na horizontal.
    const top = h / 2 - (mh - cy) * z;
    const x0 = cx - w / 2 / z;
    const x1 = cx + w / 2 / z;
    for (let copy = Math.floor(x0 / mw); copy * mw < x1; copy++) {
      const a = Math.max(x0, copy * mw);
      const b = Math.min(x1, (copy + 1) * mw);
      const sa = Math.floor(a - copy * mw);
      const sb = Math.min(mw, Math.ceil(b - copy * mw));
      if (sb <= sa) continue;
      const dx = (copy * mw + sa - cx) * z + w / 2;
      ctx.drawImage(soft, sa, 0, sb - sa, mh, dx, top, (sb - sa) * z, mh * z);
    }
    // Bem de perto, a arte detalhada, pintada aos poucos em blocos guardados.
    const level = SoftArt.levelFor(z);
    if (level) {
      this.softArt ??= new SoftArt(this.pixels, mw, mh);
      const r0 = Math.max(0, Math.floor(mh - cy - h / 2 / z));
      const r1 = Math.min(mh - 1, Math.ceil(mh - cy + h / 2 / z));
      // Blocos que ainda faltam saem nos próximos quadros.
      if (!this.softArt.draw(ctx, level, z, x0, x1, r0, r1, top, cx, w)) complete = false;
    }
    if (z >= 5) {
      // Enfeites (árvores, pedras, trigo) por cima do chão, sempre com a arte original de 16 pixels.
      const r0 = Math.max(0, Math.floor(mh - cy - h / 2 / z));
      const r1 = Math.min(mh - 1, Math.ceil(mh - cy + h / 2 / z));
      const c0 = Math.floor(x0);
      const c1 = Math.ceil(x1);
      const size = Math.ceil(z);
      const px = this.pixels;
      for (let row = r0; row <= r1; row++) {
        const sy = top + row * z;
        for (let col = c0; col <= c1; col++) {
          const i = row * mw + (((col % mw) + mw) % mw);
          const kind = px[i * 4 + 3] >> 4;
          if (kind < 1 || (kind > 7 && kind !== 11 && kind !== 12)) continue;
          ctx.drawImage(this.decorCanvas, (kind - 1) * 16, 0, 16, 16, Math.floor((col - cx) * z + w / 2), Math.floor(sy), size, size);
        }
      }
    }
    return complete;
  }
}
