import * as THREE from 'three';
import { AU_PER_PC } from '../core/units';

/**
 * O que os modos usam do renderer. O WebGLRenderer do three.js atende a esta
 * interface, e o SoftRenderer abaixo também, para PCs sem WebGL.
 */
export interface GameRenderer {
  readonly domElement: HTMLCanvasElement;
  autoClear: boolean;
  readonly info: { memory: { geometries: number; textures: number } };
  readonly renderLists: { dispose(): void };
  setSize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  getPixelRatio(): number;
  getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2;
  setClearColor(color: THREE.ColorRepresentation): void;
  clear(): void;
  clearDepth(): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
}

const enum Kind {
  Sprite,
  Line,
  Atmosphere,
  Sphere,
  Ring,
  Triangle,
  Rocks,
}

/**
 * Algo a desenhar depois de ordenar por profundidade. Os itens vêm de um
 * pool reaproveitado a cada quadro (Object Pool): em vez de uma closure por
 * item, cada um guarda o tipo e os números de que o desenho precisa.
 */
interface Item {
  depth: number;
  kind: Kind;
  /** Centro na tela (sprite, esfera, atmosfera). */
  x: number;
  y: number;
  /** Tamanho do sprite, raio da esfera ou lado das pedras, em pixels. */
  size: number;
  opacity: number;
  additive: boolean;
  /** Cor CSS (linha, anel, triângulo, esfera sem textura). */
  style: string;
  /** Pontos na tela: pares x, y (NaN atrás da câmera); pedras: x, y e o índice da cor. */
  pts: number[];
  n: number;
  /** Linha: quantos vértices e como ligar. */
  count: number;
  segments: boolean;
  loop: boolean;
  /** Cor do brilho (sprite), em 0..255 sRGB. */
  r: number;
  g: number;
  b: number;
  /** Esfera: textura, material sem luz, luz e giro. */
  map: THREE.Texture | null;
  basic: boolean;
  lit: boolean;
  lx: number;
  ly: number;
  lz: number;
  spin: number;
  /** Atmosfera: as três cores do gradiente. Pedras: as cores de cada pedra. */
  stops: readonly string[] | null;
}

function newItem(): Item {
  return {
    depth: 0, kind: Kind.Sprite, x: 0, y: 0, size: 0, opacity: 1, additive: false, style: '', pts: [], n: 0,
    count: 0, segments: false, loop: false, r: 0, g: 0, b: 0, map: null, basic: false, lit: false, lx: 0, ly: 0, lz: 1, spin: 0, stops: null,
  };
}

type GlowProfile = 'star' | 'sprite';

const GLOW_STOPS: Record<GlowProfile, [number, number][]> = {
  // Mesmo perfil do shader das estrelas (núcleo + halo).
  star: [[0, 1], [0.2, 0.55], [0.45, 0.18], [0.75, 0.04], [1, 0]],
  // Mesmo perfil da textura de brilho dos sprites.
  sprite: [[0, 1], [0.15, 0.6], [0.4, 0.12], [1, 0]],
};

/**
 * Matriz de trabalho com os elementos num Float64Array: as contas são as
 * mesmas do three.js (multiplyMatrices), mas gravar um double num array
 * comum de elementos marcados alocava um número por elemento.
 */
function float64Matrix(): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.elements = Float64Array.from(m.elements) as unknown as THREE.Matrix4Tuple;
  return m;
}

/** Cor do brilho em degraus de 16, para o cache de brilhos ficar pequeno. */
const quantize = (c: number): number => Math.min(255, Math.round(c / 16) * 16);

/** Mais longe primeiro; estável (empates na ordem em que foram coletados), como o sort de antes. */
const farFirst = (a: Item, b: Item): boolean => b.depth - a.depth > 0;

/**
 * Renderizador por software em Canvas 2D, usado quando o navegador não
 * entrega WebGL (aceleração de hardware desligada, GPU bloqueada, driver
 * antigo). Desenha a mesma cena do three.js de forma simplificada: estrelas
 * como pixels somados num ImageData, esferas como discos sombreados com a
 * textura do planeta, sprites como brilhos radiais, linhas e malhas pequenas
 * (a nave) como triângulos com sombreamento chapado.
 *
 * Nada é alocado por item a cada quadro: itens, pontos e listas vêm de
 * buffers reaproveitados, e as cores CSS ficam em cache.
 */
export class SoftRenderer implements GameRenderer {
  readonly domElement = document.createElement('canvas');
  readonly context: CanvasRenderingContext2D;
  autoClear = true;
  readonly info = { memory: { geometries: 0, textures: 0 } };
  readonly renderLists = { dispose(): void {} };
  private width = 1;
  private height = 1;
  private ratio = 1;
  private readonly clearColor = new THREE.Color(0x000000);
  private pendingClear = true;
  private image: ImageData | null = null;
  private readonly glows = new Map<number, HTMLCanvasElement>();
  private readonly textureCanvases = new WeakMap<THREE.Texture, { version: number; canvas: HTMLCanvasElement }>();
  private readonly v = new THREE.Vector3();
  private readonly mv = float64Matrix();
  // Objetos de trabalho reaproveitados a cada quadro, para não gerar lixo para o coletor.
  private readonly v2 = new THREE.Vector3();
  private readonly lightVec = new THREE.Vector3();
  private readonly toCam = new THREE.Vector3();
  private readonly pointPos = new THREE.Vector3();
  private readonly dirPos = new THREE.Vector3();
  private readonly dirTarget = new THREE.Vector3();
  private readonly tmpColor = new THREE.Color();
  private readonly tmpEmissive = new THREE.Color();
  private points: THREE.Points[] = [];
  private pointCount = 0;
  /**
   * Estrelas brilhantes do quadro (7 números cada), desenhadas como brilho.
   * Escrito por índice até `bigN`, sem zerar o array: `length = 0` solta o
   * buffer e o fazia crescer de novo a cada quadro.
   */
  private big = new Float64Array(7 * 256);
  private bigN = 0;
  /** Pool de itens e a lista ordenada do quadro (só as `itemCount` primeiras posições valem). */
  private readonly pool: Item[] = [];
  private used = 0;
  private items: Item[] = [];
  private sortTmp: Item[] = [];
  private itemCount = 0;
  /** Vértices da malha em coordenadas da câmera. */
  private vs = new Float64Array(3 * 64);
  /** Cores CSS em cache: "#rrggbb" e "rgb(r,g,b)" por valor, gradientes da atmosfera e cores das pedras. */
  private readonly hexStyles = new Map<number, string>();
  private readonly rgbStyles = new Map<number, string>();
  private readonly atmoStops = new Map<number, readonly string[]>();
  private readonly rockStyles = new WeakMap<THREE.BufferAttribute | THREE.InterleavedBufferAttribute, { version: number; styles: string[] }>();
  // Estado do quadro em curso, lido pelos coletores (em vez de closures por render).
  private view: THREE.Matrix4 = new THREE.Matrix4();
  private P: number[] = [];
  private W = 1;
  private H = 1;
  private near = 0.01;
  private focal = 1;
  private ambient = 0;
  private point: THREE.Vector3 | null = null;
  private dir: THREE.Vector3 | null = null;
  private dirIntensity = 0;
  /** Saída de project(). */
  private px = 0;
  private py = 0;

  constructor() {
    this.context = this.domElement.getContext('2d', { alpha: false })!;
    this.domElement.style.imageRendering = 'pixelated';
  }

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.domElement.style.width = `${width}px`;
    this.domElement.style.height = `${height}px`;
    this.applySize();
  }

  setPixelRatio(ratio: number): void {
    this.ratio = ratio;
    this.applySize();
  }

  private applySize(): void {
    const w = Math.max(1, Math.floor(this.width * this.ratio));
    const h = Math.max(1, Math.floor(this.height * this.ratio));
    if (this.domElement.width !== w || this.domElement.height !== h) {
      this.domElement.width = w;
      this.domElement.height = h;
      this.image = null;
    }
  }

  getPixelRatio(): number {
    return this.ratio;
  }

  getDrawingBufferSize(target: THREE.Vector2): THREE.Vector2 {
    return target.set(this.domElement.width, this.domElement.height);
  }

  setClearColor(color: THREE.ColorRepresentation): void {
    this.clearColor.set(color);
  }

  clear(): void {
    this.pendingClear = true;
  }

  clearDepth(): void {}

  /** Projeta um ponto em coordenadas da câmera para pixels (em this.px, this.py). */
  private project(vx: number, vy: number, vz: number): void {
    const P = this.P;
    this.px = ((P[0] * vx + P[8] * vz) / -vz + 1) * this.W * 0.5;
    this.py = (1 - (P[5] * vy + P[9] * vz) / -vz) * this.H * 0.5;
  }

  private alloc(kind: Kind, depth: number): Item {
    let it = this.pool[this.used];
    if (!it) this.pool[this.used] = it = newItem();
    this.used++;
    it.kind = kind;
    it.depth = depth;
    it.n = 0;
    this.items[this.itemCount++] = it;
    return it;
  }

  private hexStyle(color: THREE.Color): string {
    const hex = color.getHex();
    let s = this.hexStyles.get(hex);
    if (s === undefined) {
      s = `#${color.getHexString()}`;
      this.hexStyles.set(hex, s);
    }
    return s;
  }

  private rgbStyle(r: number, g: number, b: number): string {
    const key = (r << 16) | (g << 8) | b;
    let s = this.rgbStyles.get(key);
    if (s === undefined) {
      // O sombreamento da nave muda de quadro a quadro: o cache não cresce sem limite.
      if (this.rgbStyles.size > 4096) this.rgbStyles.clear();
      s = `rgb(${r},${g},${b})`;
      this.rgbStyles.set(key, s);
    }
    return s;
  }

  private readonly collectLight = (o: THREE.Object3D): void => {
    if ((o as THREE.AmbientLight).isAmbientLight) this.ambient += (o as THREE.Light).intensity;
    else if ((o as THREE.PointLight).isPointLight && (o as THREE.Light).intensity > 0) {
      this.point = this.pointPos.setFromMatrixPosition(o.matrixWorld).applyMatrix4(this.view);
    } else if ((o as THREE.DirectionalLight).isDirectionalLight) {
      const l = o as THREE.DirectionalLight;
      this.dir = this.dirPos.setFromMatrixPosition(l.matrixWorld).sub(this.dirTarget.setFromMatrixPosition(l.target.matrixWorld)).transformDirection(this.view);
      this.dirIntensity = l.intensity;
    }
  };

  private readonly collect = (o: THREE.Object3D): void => {
    if ((o as THREE.Points).isPoints) {
      if ((o as THREE.Points).geometry.getAttribute('absmag')) this.points[this.pointCount++] = o as THREE.Points;
      else if (o.userData.rocks) this.collectRocks(o as THREE.Points);
    } else if ((o as THREE.Sprite).isSprite) {
      this.collectSprite(o as THREE.Sprite);
    } else if ((o as THREE.Line).isLine) {
      this.collectLine(o as THREE.Line);
    } else if ((o as THREE.Mesh).isMesh) {
      const mesh = o as THREE.Mesh;
      const type = mesh.geometry.type;
      if (type === 'SphereGeometry') this.collectSphere(mesh);
      else if (type === 'RingGeometry') this.collectRing(mesh);
      else if (type !== 'PlaneGeometry') this.collectMesh(mesh);
    }
  };

  render(scene: THREE.Object3D, camera: THREE.Camera): void {
    const ctx = this.context;
    const W = this.domElement.width;
    const H = this.domElement.height;
    scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();
    const clearing = this.autoClear || this.pendingClear;
    this.pendingClear = false;
    const bg = (scene as THREE.Scene).background instanceof THREE.Color ? ((scene as THREE.Scene).background as THREE.Color) : this.clearColor;

    this.view = camera.matrixWorldInverse;
    this.P = camera.projectionMatrix.elements;
    this.W = W;
    this.H = H;
    this.near = (camera as THREE.PerspectiveCamera).near ?? 0.01;
    this.focal = this.P[5] * H * 0.5;

    // Luzes da cena.
    this.ambient = 0;
    this.point = null;
    this.dir = null;
    this.dirIntensity = 0;
    this.pointCount = 0;
    this.itemCount = 0;
    this.used = 0;
    scene.traverseVisible(this.collectLight);
    scene.traverseVisible(this.collect);

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (clearing) {
      if (!this.image || this.image.width !== W || this.image.height !== H) this.image = ctx.createImageData(W, H);
      const img = this.image;
      const hex = bg.getHex();
      new Uint32Array(img.data.buffer).fill(0xff000000 | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff));
      this.bigN = 0;
      for (let i = 0; i < this.pointCount; i++) this.drawStars(this.points[i], img);
      const big = this.big;
      ctx.putImageData(img, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < this.bigN; k += 7) {
        const s = big[k + 2];
        ctx.globalAlpha = big[k + 6];
        ctx.drawImage(this.glow(0, big[k + 3], big[k + 4], big[k + 5]), big[k] - s, big[k + 1] - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    // Solta as referências da cena (pontos de estrelas) até o próximo quadro.
    for (let i = 0; i < this.pointCount; i++) this.points[i] = null!;

    this.sortItems();
    for (let i = 0; i < this.itemCount; i++) {
      this.drawItem(this.items[i]);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  /** Ordena as `itemCount` primeiras posições (merge sort estável, com buffer reaproveitado). */
  private sortItems(): void {
    const n = this.itemCount;
    let a = this.items;
    if (this.sortTmp.length < a.length) this.sortTmp = new Array<Item>(a.length);
    let b = this.sortTmp;
    for (let width = 1; width < n; width *= 2) {
      for (let lo = 0; lo < n; lo += 2 * width) {
        const mid = Math.min(lo + width, n);
        const hi = Math.min(lo + 2 * width, n);
        let i = lo;
        let j = mid;
        let k = lo;
        // Do lado direito só passa à frente quem estiver estritamente mais longe: estável.
        while (i < mid && j < hi) b[k++] = farFirst(a[i], a[j]) ? a[j++] : a[i++];
        while (i < mid) b[k++] = a[i++];
        while (j < hi) b[k++] = a[j++];
      }
      const t = a;
      a = b;
      b = t;
    }
    this.items = a;
    this.sortTmp = b;
  }

  private drawStars(p: THREE.Points, img: ImageData): void {
    const W = img.width;
    const H = img.height;
    const d = img.data;
    const P = this.P;
    const near = this.near;
    const e = this.mv.multiplyMatrices(this.view, p.matrixWorld).elements;
    const g = p.geometry;
    const pos = g.getAttribute('position').array as Float32Array;
    const mag = g.getAttribute('absmag').array as Float32Array;
    const col = g.getAttribute('starColor').array as Float32Array;
    const u = (p.material as THREE.ShaderMaterial).uniforms;
    const magLimit = u.uMagLimit.value as number;
    const fade = u.uFadeNearPc.value as number;
    const pr = u.uPixelRatio.value as number;
    const n = mag.length;
    const hw = W * 0.5;
    const hh = H * 0.5;
    const row = W * 4;
    const end = d.length;
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (vz >= -near) continue;
      const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
      const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
      const sx = ((P[0] * vx + P[8] * vz) / -vz + 1) * hw;
      const sy = (1 - (P[5] * vy + P[9] * vz) / -vz) * hh;
      if (sx < -30 || sy < -30 || sx >= W + 30 || sy >= H + 30) continue;
      const dpc = Math.max(Math.sqrt(vx * vx + vy * vy + vz * vz) / AU_PER_PC, 1e-9);
      const m = mag[i] + 5 * Math.log10(dpc) - 5;
      const flux = Math.pow(10, -0.4 * (m - magLimit));
      const t = Math.min(1, Math.max(0, (dpc - fade * 0.3) / (fade * 0.7)));
      const alpha = Math.min(1, flux * 0.9) * t * t * (3 - 2 * t);
      if (alpha < 0.004) continue;
      const size = Math.min(22, Math.max(1, 1.2 + 1.6 * Math.sqrt(flux))) * pr;
      const r = col[i * 3] * 255;
      const gg = col[i * 3 + 1] * 255;
      const b = col[i * 3 + 2] * 255;
      if (size >= 3.5) {
        let k = this.bigN;
        if (k + 7 > this.big.length) {
          const grown = new Float64Array(this.big.length * 2);
          grown.set(this.big);
          this.big = grown;
        }
        const big = this.big;
        big[k++] = sx;
        big[k++] = sy;
        big[k++] = size * 0.6;
        big[k++] = r;
        big[k++] = gg;
        big[k++] = b;
        big[k++] = alpha;
        this.bigN = k;
        continue;
      }
      const px = sx | 0;
      const py = sy | 0;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const k = (py * W + px) * 4;
      d[k] += r * alpha;
      d[k + 1] += gg * alpha;
      d[k + 2] += b * alpha;
      if (size >= 2) {
        // Halo de um pixel em volta das estrelas mais brilhantes (esquerda, direita, cima, baixo).
        const a = alpha * 0.3;
        const ra = r * a;
        const ga = gg * a;
        const ba = b * a;
        let q = k - 4;
        if (q >= 0) {
          d[q] += ra;
          d[q + 1] += ga;
          d[q + 2] += ba;
        }
        q = k + 4;
        if (q < end) {
          d[q] += ra;
          d[q + 1] += ga;
          d[q + 2] += ba;
        }
        q = k - row;
        if (q >= 0) {
          d[q] += ra;
          d[q + 1] += ga;
          d[q + 2] += ba;
        }
        q = k + row;
        if (q < end) {
          d[q] += ra;
          d[q + 1] += ga;
          d[q + 2] += ba;
        }
      }
    }
  }

  /** Pedras dos anéis: quadradinhos de 2 pixels, desenhados junto com o planeta. */
  private collectRocks(p: THREE.Points): void {
    const near = this.near;
    const e = this.mv.multiplyMatrices(this.view, p.matrixWorld).elements;
    const pos = p.geometry.getAttribute('position');
    const col = p.geometry.getAttribute('color');
    const center = this.v.setFromMatrixPosition(p.matrixWorld).applyMatrix4(this.view);
    if (center.z >= -near) return;
    const cz = center.z;
    const W = this.W;
    const H = this.H;
    // As pedras atrás do planeta são desenhadas antes dele, as da frente depois.
    const styles = this.rockColors(col);
    const s = Math.max(1, Math.round(1.5 * this.ratio));
    const back = this.alloc(Kind.Rocks, -cz + 2e-9);
    const front = this.alloc(Kind.Rocks, -cz - 1e-9);
    back.stops = front.stops = styles;
    back.size = front.size = s;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (vz >= -near) continue;
      this.project(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], vz);
      const sx = this.px;
      const sy = this.py;
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      const it = vz > cz ? front : back;
      it.pts[it.n++] = sx;
      it.pts[it.n++] = sy;
      it.pts[it.n++] = i;
    }
    // Lados vazios saem da lista (mantendo a ordem dos que ficam).
    if (!front.n) this.dropLast(front);
    if (!back.n) this.dropLast(back);
  }

  /** Tira um item recém-coletado da lista do quadro. */
  private dropLast(it: Item): void {
    const i = this.items.lastIndexOf(it, this.itemCount - 1);
    for (let k = i; k < this.itemCount - 1; k++) this.items[k] = this.items[k + 1];
    this.itemCount--;
  }

  /** Cor CSS de cada pedra, feita uma vez por geometria (as cores não mudam). */
  private rockColors(col: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): string[] {
    const version = (col as THREE.BufferAttribute).version ?? 0;
    const cached = this.rockStyles.get(col);
    if (cached && cached.version === version) return cached.styles;
    const styles: string[] = [];
    for (let i = 0; i < col.count; i++) styles.push(`rgb(${(col.getX(i) * 255) | 0},${(col.getY(i) * 255) | 0},${(col.getZ(i) * 255) | 0})`);
    this.rockStyles.set(col, { version, styles });
    return styles;
  }

  private collectSprite(s: THREE.Sprite): void {
    const v = this.v.setFromMatrixPosition(s.matrixWorld).applyMatrix4(this.view);
    if (v.z >= -this.near) return;
    const scale = this.v2.setFromMatrixScale(s.matrixWorld).x;
    const size = (scale * this.focal) / -v.z;
    if (size < 0.5) return;
    this.project(v.x, v.y, v.z);
    const m = s.material;
    const it = this.alloc(Kind.Sprite, -v.z);
    it.x = this.px;
    it.y = this.py;
    it.size = size;
    it.opacity = m.opacity;
    it.additive = m.blending === THREE.AdditiveBlending;
    const rgb = this.tmpColor.copy(m.color).convertLinearToSRGB();
    it.r = rgb.r * 255;
    it.g = rgb.g * 255;
    it.b = rgb.b * 255;
  }

  private collectLine(line: THREE.Line): void {
    const m = line.material as THREE.LineBasicMaterial;
    if (m.transparent && m.opacity < 0.01) return;
    const pos = line.geometry.getAttribute('position');
    if (!pos) return;
    const near = this.near;
    const e = this.mv.multiplyMatrices(this.view, line.matrixWorld).elements;
    const n = pos.count;
    // Linhas (órbitas, rastros) ficam atrás de tudo.
    const it = this.alloc(Kind.Line, Number.MAX_VALUE);
    const pts = it.pts;
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (vz >= -near) {
        pts[i * 2] = NaN;
        pts[i * 2 + 1] = NaN;
      } else {
        this.project(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], vz);
        pts[i * 2] = this.px;
        pts[i * 2 + 1] = this.py;
      }
    }
    it.n = n * 2;
    it.count = n;
    it.segments = !!(line as THREE.LineSegments).isLineSegments;
    it.loop = !!(line as THREE.LineLoop).isLineLoop;
    it.style = this.hexStyle(m.color);
    it.opacity = m.transparent ? m.opacity : 1;
    it.additive = m.blending === THREE.AdditiveBlending;
  }

  private collectSphere(mesh: THREE.Mesh): void {
    const v = this.v2.setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(this.view);
    const radius = (mesh.geometry as THREE.SphereGeometry).parameters.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    if (v.z >= -this.near) return;
    const r = (radius * this.focal) / -v.z;
    if (r < 0.3) return;
    this.project(v.x, v.y, v.z);
    const x = this.px;
    const y = this.py;
    if (x + r < 0 || y + r < 0 || x - r > this.W || y - r > this.H) return;
    const material = mesh.material as THREE.Material;

    if ((material as THREE.ShaderMaterial).isShaderMaterial) {
      // Atmosfera: anel de brilho na borda.
      const u = (material as THREE.ShaderMaterial).uniforms.uColor;
      if (!u) return;
      const c = this.tmpColor.copy(u.value as THREE.Color).convertLinearToSRGB();
      const it = this.alloc(Kind.Atmosphere, -v.z - radius * 1.01);
      it.x = x;
      it.y = y;
      it.size = r;
      it.stops = this.atmosphereStops(Math.round(c.r * 255), Math.round(c.g * 255), Math.round(c.b * 255));
      return;
    }

    const it = this.alloc(Kind.Sphere, -v.z);
    it.x = x;
    it.y = y;
    it.size = r;
    it.basic = !!(material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    it.map = (material as THREE.MeshLambertMaterial).map ?? null;
    it.style = this.hexStyle((material as THREE.MeshBasicMaterial).color);
    // Direção da luz vista da esfera, no espaço da câmera.
    it.lx = 0;
    it.ly = 0;
    it.lz = 1;
    const light = this.point;
    if (light) {
      const l = this.lightVec.copy(light).sub(v).normalize();
      const toCam = this.toCam.copy(v).negate().normalize();
      it.lx = l.x;
      it.ly = l.y;
      it.lz = l.dot(toCam);
    }
    it.lit = !!light;
    it.spin = mesh.rotation.y;
  }

  /** As três cores do gradiente da atmosfera, por cor (feitas uma vez). */
  private atmosphereStops(r: number, g: number, b: number): readonly string[] {
    const key = (r << 16) | (g << 8) | b;
    let stops = this.atmoStops.get(key);
    if (!stops) {
      const rgb = `${r},${g},${b}`;
      stops = [`rgba(${rgb},0)`, `rgba(${rgb},0.55)`, `rgba(${rgb},0)`];
      this.atmoStops.set(key, stops);
    }
    return stops;
  }

  private collectRing(mesh: THREE.Mesh): void {
    const p = (mesh.geometry as THREE.RingGeometry).parameters;
    const near = this.near;
    const e = this.mv.multiplyMatrices(this.view, mesh.matrixWorld).elements;
    // Contorno de fora e de dentro, 64 pontos cada; se algum ficar atrás da câmera, o anel não é desenhado.
    const it = this.alloc(Kind.Ring, 0);
    const pts = it.pts;
    let k = 0;
    for (let pass = 0; pass < 2; pass++) {
      const radius = pass ? p.innerRadius : p.outerRadius;
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        const vz = e[2] * x + e[6] * y + e[14];
        if (vz >= -near) {
          this.dropLast(it);
          return;
        }
        this.project(e[0] * x + e[4] * y + e[12], e[1] * x + e[5] * y + e[13], vz);
        pts[k++] = this.px;
        pts[k++] = this.py;
      }
    }
    it.n = k;
    const m = mesh.material as THREE.MeshBasicMaterial;
    it.style = this.hexStyle(m.color);
    it.opacity = m.transparent ? m.opacity : 1;
    const center = this.v.setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(this.view);
    // Desenhado logo antes do planeta.
    it.depth = -center.z + 1e-9;
  }

  /** Malhas pequenas (a nave): triângulos com sombreamento chapado e ordenados por profundidade. */
  private collectMesh(mesh: THREE.Mesh): void {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    if (!pos || pos.count > 5000) return;
    const near = this.near;
    const e = this.mv.multiplyMatrices(this.view, mesh.matrixWorld).elements;
    if (this.vs.length < pos.count * 3) this.vs = new Float64Array(pos.count * 6);
    const vs = this.vs;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      vs[i * 3] = e[0] * x + e[4] * y + e[8] * z + e[12];
      vs[i * 3 + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      vs[i * 3 + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
    }
    const material = mesh.material as THREE.MeshStandardMaterial;
    const base = this.tmpColor.copy(material.color).convertLinearToSRGB();
    const emissive = material.emissive ? this.tmpEmissive.copy(material.emissive).convertLinearToSRGB() : this.tmpEmissive.setRGB(0, 0, 0);
    const index = g.index;
    const tris = index ? index.count / 3 : pos.count / 3;
    const ambient = this.ambient;
    const dir = this.dir;
    const dirIntensity = this.dirIntensity;
    for (let t = 0; t < tris; t++) {
      const ia = index ? index.getX(t * 3) : t * 3;
      const ib = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const ic = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      const ax = vs[ia * 3], ay = vs[ia * 3 + 1], az = vs[ia * 3 + 2];
      const bx = vs[ib * 3], by = vs[ib * 3 + 1], bz = vs[ib * 3 + 2];
      const cx = vs[ic * 3], cy = vs[ic * 3 + 1], cz = vs[ic * 3 + 2];
      if (az >= -near || bz >= -near || cz >= -near) continue;
      let nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
      let ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      let nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (nx * ax + ny * ay + nz * az >= 0) continue;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      const diffuse = dir ? Math.max(0, nx * dir.x + ny * dir.y + nz * dir.z) * dirIntensity * 0.45 : 0;
      const k = Math.min(1.4, ambient * 0.5 + diffuse);
      const r = Math.min(255, (base.r * k + emissive.r) * 255);
      const gg = Math.min(255, (base.g * k + emissive.g) * 255);
      const b = Math.min(255, (base.b * k + emissive.b) * 255);
      const it = this.alloc(Kind.Triangle, -(az + bz + cz) / 3);
      it.style = this.rgbStyle(r | 0, gg | 0, b | 0);
      const pts = it.pts;
      this.project(ax, ay, az);
      pts[0] = this.px;
      pts[1] = this.py;
      this.project(bx, by, bz);
      pts[2] = this.px;
      pts[3] = this.py;
      this.project(cx, cy, cz);
      pts[4] = this.px;
      pts[5] = this.py;
      it.n = 6;
    }
  }

  private drawItem(it: Item): void {
    const ctx = this.context;
    switch (it.kind) {
      case Kind.Sprite: {
        ctx.globalCompositeOperation = it.additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = it.opacity;
        const half = Math.min(it.size, 4000) / 2;
        ctx.drawImage(this.glow(1, it.r, it.g, it.b), it.x - half, it.y - half, half * 2, half * 2);
        return;
      }
      case Kind.Line: {
        ctx.globalCompositeOperation = it.additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = it.opacity;
        ctx.strokeStyle = it.style;
        ctx.lineWidth = Math.max(1, this.ratio);
        ctx.beginPath();
        const pts = it.pts;
        const n = it.count;
        const step = it.segments ? 2 : 1;
        const last = it.loop ? n : n - 1;
        for (let i = 0; i < last; i += step) {
          const j = (i + 1) % n;
          const ax = pts[i * 2];
          const bx = pts[j * 2];
          // NaN marca o ponto atrás da câmera.
          if (ax !== ax || bx !== bx) continue;
          ctx.moveTo(ax, pts[i * 2 + 1]);
          ctx.lineTo(bx, pts[j * 2 + 1]);
        }
        ctx.stroke();
        return;
      }
      case Kind.Atmosphere: {
        const { x, y, size: r } = it;
        const stops = it.stops!;
        const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r);
        g.addColorStop(0, stops[0]);
        g.addColorStop(0.85, stops[1]);
        g.addColorStop(1, stops[2]);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      case Kind.Sphere:
        this.drawSphere(it);
        return;
      case Kind.Ring: {
        ctx.globalAlpha = it.opacity;
        ctx.fillStyle = it.style;
        ctx.beginPath();
        const pts = it.pts;
        for (let i = 0; i < 64; i++) (i ? ctx.lineTo(pts[i * 2], pts[i * 2 + 1]) : ctx.moveTo(pts[0], pts[1]));
        ctx.closePath();
        for (let i = 0; i < 64; i++) (i ? ctx.lineTo(pts[128 + i * 2], pts[128 + i * 2 + 1]) : ctx.moveTo(pts[128], pts[129]));
        ctx.closePath();
        ctx.fill('evenodd');
        return;
      }
      case Kind.Triangle: {
        const p = it.pts;
        ctx.fillStyle = it.style;
        ctx.strokeStyle = it.style;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(p[0], p[1]);
        ctx.lineTo(p[2], p[3]);
        ctx.lineTo(p[4], p[5]);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        return;
      }
      case Kind.Rocks: {
        const s = it.size;
        const styles = it.stops!;
        const pts = it.pts;
        ctx.globalAlpha = 0.9;
        for (let k = 0; k < it.n; k += 3) {
          ctx.fillStyle = styles[pts[k + 2]];
          ctx.fillRect(pts[k] - s / 2, pts[k + 1] - s / 2, s, s);
        }
        return;
      }
    }
  }

  private drawSphere(it: Item): void {
    const ctx = this.context;
    const { x, y, size: r } = it;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    const tex = it.map ? this.textureCanvas(it.map) : null;
    if (tex && r > 1.5) {
      // Mostra metade da textura equiretangular, girando com o planeta.
      ctx.imageSmoothingEnabled = true;
      const tw = tex.width;
      const th = tex.height;
      const half = tw / 2;
      let u0 = ((((-it.spin / (Math.PI * 2)) % 1) + 1) % 1) * tw;
      const first = Math.min(half, tw - u0);
      ctx.drawImage(tex, u0, 0, first, th, x - r, y - r, (2 * r * first) / half, 2 * r);
      if (first < half) {
        u0 = 0;
        ctx.drawImage(tex, 0, 0, half - first, th, x - r + (2 * r * first) / half, y - r, (2 * r * (half - first)) / half, 2 * r);
      }
    } else {
      ctx.fillStyle = tex ? this.averageColor(tex) : it.style;
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    if (!it.basic) {
      // Sombra: o lado oposto à estrela escurece.
      const cx = x + it.lx * r * 0.9;
      const cy = y - it.ly * r * 0.9;
      const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * (1.3 + 0.7 * Math.max(0, it.lz)));
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0.93)');
      ctx.fillStyle = it.lit ? g : 'rgba(0,0,0,0.85)';
      ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    ctx.restore();
  }

  /** Brilho radial colorido, guardado em cache por perfil (0 estrela, 1 sprite) e cor (chave numérica, sem string). */
  private glow(profile: 0 | 1, r: number, g: number, b: number): HTMLCanvasElement {
    const qr = quantize(r);
    const qg = quantize(g);
    const qb = quantize(b);
    const key = profile * 16777216 + qr * 65536 + qg * 256 + qb;
    let canvas = this.glows.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      for (const [at, a] of GLOW_STOPS[profile ? 'sprite' : 'star']) grad.addColorStop(at, `rgba(${qr},${qg},${qb},${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
      this.glows.set(key, canvas);
    }
    return canvas;
  }

  /** Converte a textura do three.js num canvas, refeito quando ela muda. */
  private textureCanvas(tex: THREE.Texture): HTMLCanvasElement | null {
    const cached = this.textureCanvases.get(tex);
    if (cached && cached.version === tex.version) return cached.canvas;
    const img = tex.image as { data?: ArrayLike<number>; width: number; height: number } | HTMLCanvasElement | null;
    if (!img) return null;
    let canvas: HTMLCanvasElement;
    if (img instanceof HTMLCanvasElement) canvas = img;
    else if (img.data) {
      canvas = cached?.canvas ?? document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      const out = ctx.createImageData(img.width, img.height);
      const src = img.data;
      // O canal alfa do mapa guarda os enfeites; aqui ele é sempre opaco.
      for (let i = 0; i < out.data.length; i += 4) {
        out.data[i] = src[i];
        out.data[i + 1] = src[i + 1];
        out.data[i + 2] = src[i + 2];
        out.data[i + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
    } else return null;
    this.textureCanvases.set(tex, { version: tex.version, canvas });
    return canvas;
  }

  private readonly averages = new WeakMap<HTMLCanvasElement, string>();

  private averageColor(canvas: HTMLCanvasElement): string {
    let c = this.averages.get(canvas);
    if (!c) {
      const tmp = document.createElement('canvas');
      tmp.width = tmp.height = 1;
      const ctx = tmp.getContext('2d')!;
      ctx.drawImage(canvas, 0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      c = `rgb(${d[0]},${d[1]},${d[2]})`;
      this.averages.set(canvas, c);
    }
    return c;
  }
}

/** Verdadeiro se o navegador consegue criar um contexto WebGL. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') ?? c.getContext('webgl'));
  } catch {
    return false;
  }
}
