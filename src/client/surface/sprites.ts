import * as THREE from 'three';
import { COLORS, SPRITES, type SpriteName } from './art';

export type { SpriteName };

/**
 * Atlas e camada de sprites da superfície. A arte fica em `art.ts`; as cores
 * marcadoras (`M`, `m`, `+` e a pele `$`, `%`) são trocadas no shader pela
 * cor de cada instância.
 */

const CELL = 24;

export interface SpriteFrame {
  /** Retângulo no atlas, em UV (x, y, largura, altura). */
  uv: [number, number, number, number];
  /** Tamanho em pixels de arte. */
  w: number;
  h: number;
}

export class SpriteAtlas {
  readonly texture: THREE.CanvasTexture;
  readonly frames = {} as Record<SpriteName, SpriteFrame>;

  constructor() {
    const names = Object.keys(SPRITES);
    const cols = 8;
    const rows = Math.ceil(names.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * CELL;
    canvas.height = rows * CELL;
    const g = canvas.getContext('2d')!;
    names.forEach((name, k) => {
      const art = SPRITES[name];
      const ox = (k % cols) * CELL;
      const oy = Math.floor(k / cols) * CELL;
      art.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          const c = COLORS[ch];
          if (!c) return;
          g.fillStyle = c;
          g.fillRect(ox + x, oy + y, 1, 1);
        });
      });
      const w = art[0].length;
      const h = art.length;
      // UV com origem embaixo (flipY da textura).
      this.frames[name] = {
        uv: [ox / canvas.width, 1 - (oy + h) / canvas.height, w / canvas.width, h / canvas.height],
        w,
        h,
      };
    });
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
  }

  private readonly tintCache = new Map<string, HTMLCanvasElement>();

  /** Sprite já pintado com a cor da instância (para o renderizador por software). */
  tinted(name: SpriteName, tint: readonly number[], skin: readonly number[] = tint): HTMLCanvasElement {
    const key = `${name}:${tint.map((v) => v | 0).join(',')}:${skin.map((v) => v | 0).join(',')}`;
    let c = this.tintCache.get(key);
    if (!c) {
      const art = SPRITES[name];
      c = document.createElement('canvas');
      c.width = art[0].length;
      c.height = art.length;
      const g = c.getContext('2d')!;
      const rgb = (c: readonly number[], k: number) => `rgb(${c.map((v) => Math.min(255, v * k) | 0).join(',')})`;
      const marks: Record<string, string> = { M: rgb(tint, 1), m: rgb(tint, 0.62), '+': rgb(tint, 1.3), $: rgb(skin, 1), '%': rgb(skin, 0.62) };
      art.forEach((row, y) => {
        [...row].forEach((ch, x) => {
          const color = marks[ch] ?? COLORS[ch];
          if (!color) return;
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1);
        });
      });
      this.tintCache.set(key, c);
    }
    return c;
  }

  dispose(): void {
    this.texture.dispose();
  }
}

const vertexShader = /* glsl */ `
  attribute vec2 iOffset;
  attribute vec2 iSize;
  attribute vec4 iUv;
  attribute vec3 iTint;
  attribute vec3 iSkin;
  uniform vec2 uResolution;
  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vSkin;
  void main() {
    vUv = iUv.xy + uv * iUv.zw;
    vTint = iTint;
    vSkin = iSkin;
    vec2 p = iOffset + position.xy * iSize;
    gl_Position = vec4(p / uResolution * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec3 vTint;
  varying vec3 vSkin;
  bool near(vec3 a, vec3 b) { return all(lessThan(abs(a - b), vec3(0.04))); }
  void main() {
    vec4 c = texture2D(uAtlas, vUv);
    if (c.a < 0.5) discard;
    if (near(c.rgb, vec3(1.0, 0.0, 1.0))) c.rgb = vTint;
    else if (near(c.rgb, vec3(0.502, 0.0, 0.502))) c.rgb = vTint * 0.62;
    else if (near(c.rgb, vec3(1.0, 0.502, 1.0))) c.rgb = min(vTint * 1.3, vec3(1.0));
    else if (near(c.rgb, vec3(0.0, 1.0, 1.0))) c.rgb = vSkin;
    else if (near(c.rgb, vec3(0.0, 0.502, 0.502))) c.rgb = vSkin * 0.62;
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`;

/**
 * Camada de sprites instanciados, em coordenadas de pixels da tela.
 * Cada frame a cena chama `begin`, `push` para cada sprite visível e `end`.
 */
export class SpriteLayer {
  readonly mesh: THREE.Mesh;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly offset: Float32Array;
  private readonly size: Float32Array;
  private readonly uv: Float32Array;
  private readonly tint: Float32Array;
  private readonly skin: Float32Array;
  private n = 0;
  private readonly names: SpriteName[] = [];
  private readonly tints: (readonly number[])[] = [];
  private readonly skins: (readonly number[])[] = [];

  constructor(
    readonly atlas: SpriteAtlas,
    readonly max: number,
  ) {
    const base = new THREE.PlaneGeometry(1, 1);
    base.translate(0.5, 0.5, 0);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = base.index;
    this.geometry.setAttribute('position', base.getAttribute('position'));
    this.geometry.setAttribute('uv', base.getAttribute('uv'));
    this.offset = new Float32Array(max * 2);
    this.size = new Float32Array(max * 2);
    this.uv = new Float32Array(max * 4);
    this.tint = new Float32Array(max * 3);
    this.skin = new Float32Array(max * 3);
    const attr = (name: string, arr: Float32Array, k: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, k);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, a);
    };
    attr('iOffset', this.offset, 2);
    attr('iSize', this.size, 2);
    attr('iUv', this.uv, 4);
    attr('iTint', this.tint, 3);
    attr('iSkin', this.skin, 3);
    this.mesh = new THREE.Mesh(
      this.geometry,
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: { uAtlas: { value: atlas.texture }, uResolution: { value: new THREE.Vector2(1, 1) } },
        depthTest: false,
        depthWrite: false,
      }),
    );
    this.mesh.frustumCulled = false;
  }

  begin(width: number, height: number): void {
    this.n = 0;
    ((this.mesh.material as THREE.ShaderMaterial).uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  /**
   * Adiciona um sprite centrado em x, com a base em y (pixels) e altura `h`
   * pixels. `tint` pinta a roupa ou o telhado; `skin`, a pele da espécie.
   */
  push(name: SpriteName, x: number, y: number, h: number, tint: readonly number[], skin: readonly number[] = tint): void {
    if (this.n >= this.max) return;
    const f = this.atlas.frames[name];
    const k = this.n++;
    this.names[k] = name;
    this.tints[k] = tint;
    this.skins[k] = skin;
    const w = (h * f.w) / f.h;
    this.offset[k * 2] = Math.round(x - w / 2);
    this.offset[k * 2 + 1] = Math.round(y);
    this.size[k * 2] = Math.max(1, Math.round(w));
    this.size[k * 2 + 1] = Math.max(1, Math.round(h));
    this.uv.set(f.uv, k * 4);
    this.tint[k * 3] = tint[0] / 255;
    this.tint[k * 3 + 1] = tint[1] / 255;
    this.tint[k * 3 + 2] = tint[2] / 255;
    this.skin[k * 3] = skin[0] / 255;
    this.skin[k * 3 + 1] = skin[1] / 255;
    this.skin[k * 3 + 2] = skin[2] / 255;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    for (const name of ['iOffset', 'iSize', 'iUv', 'iTint', 'iSkin']) {
      const a = this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  /** Desenha os sprites num Canvas 2D (renderizador por software); `height` é a altura do buffer. */
  drawSoft(ctx: CanvasRenderingContext2D, height: number): void {
    ctx.imageSmoothingEnabled = false;
    for (let k = 0; k < this.n; k++) {
      const w = this.size[k * 2];
      const h = this.size[k * 2 + 1];
      const x = this.offset[k * 2];
      const y = height - this.offset[k * 2 + 1] - h;
      const name = this.names[k];
      if (name === 'dot') {
        const t = this.tints[k];
        ctx.fillStyle = `rgb(${t[0] | 0},${t[1] | 0},${t[2] | 0})`;
        ctx.fillRect(x, y, w, h);
      } else ctx.drawImage(this.atlas.tinted(name, this.tints[k], this.skins[k]), x, y, w, h);
    }
  }

  get count(): number {
    return this.n;
  }

  dispose(): void {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
