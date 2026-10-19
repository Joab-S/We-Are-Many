import * as THREE from 'three';

/**
 * Sprites em pixel art no estilo WorldBox, desenhados a partir de texto.
 * `M` é a cor da instância (espécie ou aldeia) e `m` a mesma cor escurecida;
 * o shader troca essas duas cores pela cor de cada criatura.
 */

const COLORS: Record<string, string> = {
  K: '#1a1410', // cabelo, contorno
  S: '#f0c896', // pele
  B: '#5a2e1c', // calça
  M: '#ff00ff', // cor da instância
  m: '#800080', // cor da instância escurecida
  W: '#e7d2a4', // parede de palha
  w: '#b89868', // parede sombreada
  R: '#a8552c', // telhado
  r: '#6e3418', // telhado sombreado
  G: '#9a9a9a', // pedra
  g: '#6a6a6a', // pedra sombreada
  D: '#2a1a10', // porta
  E: '#101010', // olho
  F: '#ffcc33', // fogo
  f: '#ff6622', // fogo
};

export type SpriteName =
  | 'human'
  | 'alien'
  | 'herbivore'
  | 'predator'
  | 'fish'
  | 'dot'
  | 'hut'
  | 'house'
  | 'stoneHouse'
  | 'bonfire';

const ART: Record<SpriteName, string[]> = {
  human: [
    '..KKK..',
    '..KSK..',
    '..SSS..',
    'SMMMMMS',
    'S.MMM.S',
    '..MMM..',
    '..B.B..',
    '..B.B..',
    '..S.S..',
  ],
  alien: [
    '..MMM..',
    '.MEMEM.',
    '..MMM..',
    'mmmmmmm',
    'm.mmm.m',
    '..mmm..',
    '..m.m..',
    '..m.m..',
  ],
  herbivore: [
    'm.m....',
    '.MM....',
    '.MEMMMM',
    '..MMMMm',
    '..m..m.',
    '..m..m.',
  ],
  predator: [
    'M.M....',
    'MMMMMM.',
    'EMMMMMM',
    '.MMMMMm',
    '.m...m.',
    '.m...m.',
  ],
  fish: [
    '.MMM.M',
    'MEMMMM',
    '.mmm.m',
  ],
  dot: ['M'],
  hut: [
    '....R....',
    '...RRR...',
    '..RRRrR..',
    '.RRRRRrR.',
    'RRRRRRRrR',
    '.WWWWWWw.',
    '.WWDDWWw.',
    '.WWDDWWw.',
    '.wwDDwww.',
  ],
  house: [
    '...RRRR..',
    '..RRRRRR.',
    '.RRRRRRrR',
    'RRRRRRRRr',
    '.WWWWWWw.',
    '.WDWWDWw.',
    '.WWWWWWw.',
    '.WWDDWWw.',
    '.wwDDwww.',
  ],
  stoneHouse: [
    '...ggg...',
    '..gGGGg..',
    '.gGGGGGg.',
    'gGGGGGGGg',
    '.GGGGGGg.',
    '.GDGGDGg.',
    '.GGGGGGg.',
    '.GGDDGGg.',
    '.ggDDggg.',
  ],
  bonfire: [
    '...F...',
    '..FfF..',
    '.FfffF.',
    '..fff..',
    '.K.K.K.',
  ],
};

const CELL = 16;

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
    const names = Object.keys(ART) as SpriteName[];
    const cols = 8;
    const rows = Math.ceil(names.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols * CELL;
    canvas.height = rows * CELL;
    const g = canvas.getContext('2d')!;
    names.forEach((name, k) => {
      const art = ART[name];
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

  dispose(): void {
    this.texture.dispose();
  }
}

const vertexShader = /* glsl */ `
  attribute vec2 iOffset;
  attribute vec2 iSize;
  attribute vec4 iUv;
  attribute vec3 iTint;
  uniform vec2 uResolution;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vUv = iUv.xy + uv * iUv.zw;
    vTint = iTint;
    vec2 p = iOffset + position.xy * iSize;
    gl_Position = vec4(p / uResolution * 2.0 - 1.0, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vec4 c = texture2D(uAtlas, vUv);
    if (c.a < 0.5) discard;
    if (c.r > 0.95 && c.g < 0.05 && c.b > 0.95) c.rgb = vTint;
    else if (c.r > 0.45 && c.r < 0.55 && c.g < 0.05 && c.b > 0.45 && c.b < 0.55) c.rgb = vTint * 0.62;
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
  private n = 0;

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
    const attr = (name: string, arr: Float32Array, k: number) => {
      const a = new THREE.InstancedBufferAttribute(arr, k);
      a.setUsage(THREE.DynamicDrawUsage);
      this.geometry.setAttribute(name, a);
    };
    attr('iOffset', this.offset, 2);
    attr('iSize', this.size, 2);
    attr('iUv', this.uv, 4);
    attr('iTint', this.tint, 3);
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

  /** Adiciona um sprite com o canto inferior esquerdo em (x, y) pixels e altura `h` pixels. */
  push(name: SpriteName, x: number, y: number, h: number, tint: readonly number[]): void {
    if (this.n >= this.max) return;
    const f = this.atlas.frames[name];
    const k = this.n++;
    const w = (h * f.w) / f.h;
    this.offset[k * 2] = Math.round(x - w / 2);
    this.offset[k * 2 + 1] = Math.round(y);
    this.size[k * 2] = Math.max(1, Math.round(w));
    this.size[k * 2 + 1] = Math.max(1, Math.round(h));
    this.uv.set(f.uv, k * 4);
    this.tint[k * 3] = tint[0] / 255;
    this.tint[k * 3 + 1] = tint[1] / 255;
    this.tint[k * 3 + 2] = tint[2] / 255;
  }

  end(): void {
    this.geometry.instanceCount = this.n;
    for (const name of ['iOffset', 'iSize', 'iUv', 'iTint']) {
      const a = this.geometry.getAttribute(name) as THREE.InstancedBufferAttribute;
      a.clearUpdateRanges();
      a.addUpdateRange(0, this.n * a.itemSize);
      a.needsUpdate = true;
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
