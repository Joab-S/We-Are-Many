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

interface Item {
  depth: number;
  draw(): void;
}

type GlowProfile = 'star' | 'sprite';

const GLOW_STOPS: Record<GlowProfile, [number, number][]> = {
  // Mesmo perfil do shader das estrelas (núcleo + halo).
  star: [[0, 1], [0.2, 0.55], [0.45, 0.18], [0.75, 0.04], [1, 0]],
  // Mesmo perfil da textura de brilho dos sprites.
  sprite: [[0, 1], [0.15, 0.6], [0.4, 0.12], [1, 0]],
};

/**
 * Renderizador por software em Canvas 2D, usado quando o navegador não
 * entrega WebGL (aceleração de hardware desligada, GPU bloqueada, driver
 * antigo). Desenha a mesma cena do three.js de forma simplificada: estrelas
 * como pixels somados num ImageData, esferas como discos sombreados com a
 * textura do planeta, sprites como brilhos radiais, linhas e malhas pequenas
 * (a nave) como triângulos com sombreamento chapado.
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
  private readonly glows = new Map<string, HTMLCanvasElement>();
  private readonly textureCanvases = new WeakMap<THREE.Texture, { version: number; canvas: HTMLCanvasElement }>();
  private readonly v = new THREE.Vector3();
  private readonly mv = new THREE.Matrix4();

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

  render(scene: THREE.Object3D, camera: THREE.Camera): void {
    const ctx = this.context;
    const W = this.domElement.width;
    const H = this.domElement.height;
    scene.updateMatrixWorld();
    if (!camera.parent) camera.updateMatrixWorld();
    const clearing = this.autoClear || this.pendingClear;
    this.pendingClear = false;
    const bg = (scene as THREE.Scene).background instanceof THREE.Color ? ((scene as THREE.Scene).background as THREE.Color) : this.clearColor;

    const view = camera.matrixWorldInverse;
    const P = camera.projectionMatrix.elements;
    const near = (camera as THREE.PerspectiveCamera).near ?? 0.01;
    const project = (vx: number, vy: number, vz: number): [number, number] => [
      ((P[0] * vx + P[8] * vz) / -vz + 1) * W * 0.5,
      (1 - (P[5] * vy + P[9] * vz) / -vz) * H * 0.5,
    ];
    const focal = P[5] * H * 0.5;

    // Luzes da cena.
    const lights: { ambient: number; point: THREE.Vector3 | null; dir: THREE.Vector3 | null; dirIntensity: number } = {
      ambient: 0,
      point: null,
      dir: null,
      dirIntensity: 0,
    };
    const points: THREE.Points[] = [];
    const items: Item[] = [];
    scene.traverseVisible((o) => {
      if ((o as THREE.AmbientLight).isAmbientLight) lights.ambient += (o as THREE.Light).intensity;
      else if ((o as THREE.PointLight).isPointLight && (o as THREE.Light).intensity > 0) {
        lights.point = new THREE.Vector3().setFromMatrixPosition(o.matrixWorld).applyMatrix4(view);
      } else if ((o as THREE.DirectionalLight).isDirectionalLight) {
        const l = o as THREE.DirectionalLight;
        lights.dir = new THREE.Vector3().setFromMatrixPosition(l.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(l.target.matrixWorld)).transformDirection(view);
        lights.dirIntensity = l.intensity;
      }
    });

    scene.traverseVisible((o) => {
      if ((o as THREE.Points).isPoints) {
        if ((o as THREE.Points).geometry.getAttribute('absmag')) points.push(o as THREE.Points);
        else if (o.userData.rocks) this.collectRocks(o as THREE.Points, items, view, project, near);
      } else if ((o as THREE.Sprite).isSprite) {
        this.collectSprite(o as THREE.Sprite, items, view, project, focal, near);
      } else if ((o as THREE.Line).isLine) {
        this.collectLine(o as THREE.Line, items, view, project, near);
      } else if ((o as THREE.Mesh).isMesh) {
        const mesh = o as THREE.Mesh;
        const type = mesh.geometry.type;
        if (type === 'SphereGeometry') this.collectSphere(mesh, items, view, project, focal, near, lights.point);
        else if (type === 'RingGeometry') this.collectRing(mesh, items, view, project, near);
        else if (type !== 'PlaneGeometry') this.collectMesh(mesh, items, view, project, near, lights.ambient, lights.dir, lights.dirIntensity);
      }
    });

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (clearing) {
      if (!this.image || this.image.width !== W || this.image.height !== H) this.image = ctx.createImageData(W, H);
      const img = this.image;
      const hex = bg.getHex();
      new Uint32Array(img.data.buffer).fill(0xff000000 | ((hex & 0xff) << 16) | (hex & 0xff00) | ((hex >> 16) & 0xff));
      const big: number[] = [];
      for (const p of points) this.drawStars(p, img, view, P, near, big);
      ctx.putImageData(img, 0, 0);
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < big.length; k += 7) {
        const [x, y, s, r, g, b, a] = big.slice(k, k + 7);
        ctx.globalAlpha = a;
        ctx.drawImage(this.glow('star', r, g, b), x - s, y - s, s * 2, s * 2);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    items.sort((a, b) => b.depth - a.depth);
    for (const it of items) {
      it.draw();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  private drawStars(p: THREE.Points, img: ImageData, view: THREE.Matrix4, P: number[], near: number, big: number[]): void {
    const W = img.width;
    const H = img.height;
    const d = img.data;
    const e = this.mv.multiplyMatrices(view, p.matrixWorld).elements;
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
        big.push(sx, sy, size * 0.6, r, gg, b, alpha);
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
        // Halo de um pixel em volta das estrelas mais brilhantes.
        const a = alpha * 0.3;
        for (const o of [-4, 4, -W * 4, W * 4]) {
          const q = k + o;
          if (q < 0 || q >= d.length) continue;
          d[q] += r * a;
          d[q + 1] += gg * a;
          d[q + 2] += b * a;
        }
      }
    }
  }

  /** Pedras dos anéis: quadradinhos de 2 pixels, desenhados junto com o planeta. */
  private collectRocks(
    p: THREE.Points,
    items: Item[],
    view: THREE.Matrix4,
    project: (x: number, y: number, z: number) => [number, number],
    near: number,
  ): void {
    const e = this.mv.multiplyMatrices(view, p.matrixWorld).elements.slice();
    const pos = p.geometry.getAttribute('position');
    const col = p.geometry.getAttribute('color');
    const center = this.v.setFromMatrixPosition(p.matrixWorld).applyMatrix4(view);
    if (center.z >= -near) return;
    const W = this.domElement.width;
    const H = this.domElement.height;
    // As pedras atrás do planeta são desenhadas antes dele, as da frente depois.
    const front: number[] = [];
    const back: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (vz >= -near) continue;
      const [sx, sy] = project(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], vz);
      if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
      (vz > center.z ? front : back).push(sx, sy, i);
    }
    const ctx = this.context;
    const s = Math.max(1, Math.round(1.5 * this.ratio));
    const draw = (pts: number[]) => () => {
      ctx.globalAlpha = 0.9;
      for (let k = 0; k < pts.length; k += 3) {
        const i = pts[k + 2];
        ctx.fillStyle = `rgb(${(col.getX(i) * 255) | 0},${(col.getY(i) * 255) | 0},${(col.getZ(i) * 255) | 0})`;
        ctx.fillRect(pts[k] - s / 2, pts[k + 1] - s / 2, s, s);
      }
    };
    if (back.length) items.push({ depth: -center.z + 2e-9, draw: draw(back) });
    if (front.length) items.push({ depth: -center.z - 1e-9, draw: draw(front) });
  }

  private collectSprite(
    s: THREE.Sprite,
    items: Item[],
    view: THREE.Matrix4,
    project: (x: number, y: number, z: number) => [number, number],
    focal: number,
    near: number,
  ): void {
    const v = this.v.setFromMatrixPosition(s.matrixWorld).applyMatrix4(view);
    if (v.z >= -near) return;
    const scale = new THREE.Vector3().setFromMatrixScale(s.matrixWorld).x;
    const size = (scale * focal) / -v.z;
    if (size < 0.5) return;
    const [x, y] = project(v.x, v.y, v.z);
    const m = s.material;
    const c = m.color;
    const opacity = m.opacity;
    const additive = m.blending === THREE.AdditiveBlending;
    const ctx = this.context;
    items.push({
      depth: -v.z,
      draw: () => {
        ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = opacity;
        const half = Math.min(size, 4000) / 2;
        const rgb = c.clone().convertLinearToSRGB();
        ctx.drawImage(this.glow('sprite', rgb.r * 255, rgb.g * 255, rgb.b * 255), x - half, y - half, half * 2, half * 2);
      },
    });
  }

  private collectLine(
    line: THREE.Line,
    items: Item[],
    view: THREE.Matrix4,
    project: (x: number, y: number, z: number) => [number, number],
    near: number,
  ): void {
    const m = line.material as THREE.LineBasicMaterial;
    if (m.transparent && m.opacity < 0.01) return;
    const pos = line.geometry.getAttribute('position');
    if (!pos) return;
    const e = this.mv.multiplyMatrices(view, line.matrixWorld).elements.slice();
    const n = pos.count;
    const pts: ([number, number] | null)[] = [];
    for (let i = 0; i < n; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
      pts.push(vz >= -near ? null : project(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], vz));
    }
    const segments = (line as THREE.LineSegments).isLineSegments;
    const loop = (line as THREE.LineLoop).isLineLoop;
    const style = `#${m.color.getHexString()}`;
    const opacity = m.transparent ? m.opacity : 1;
    const additive = m.blending === THREE.AdditiveBlending;
    const ctx = this.context;
    items.push({
      // Linhas (órbitas, rastros) ficam atrás de tudo.
      depth: Number.MAX_VALUE,
      draw: () => {
        ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
        ctx.globalAlpha = opacity;
        ctx.strokeStyle = style;
        ctx.lineWidth = Math.max(1, this.ratio);
        ctx.beginPath();
        const step = segments ? 2 : 1;
        const last = loop ? n : n - 1;
        for (let i = 0; i < last; i += step) {
          const a = pts[i];
          const b = pts[(i + 1) % n];
          if (!a || !b) continue;
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
        ctx.stroke();
      },
    });
  }

  private collectSphere(
    mesh: THREE.Mesh,
    items: Item[],
    view: THREE.Matrix4,
    project: (x: number, y: number, z: number) => [number, number],
    focal: number,
    near: number,
    light: THREE.Vector3 | null,
  ): void {
    const v = this.v.setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(view).clone();
    const radius = (mesh.geometry as THREE.SphereGeometry).parameters.radius * mesh.matrixWorld.getMaxScaleOnAxis();
    if (v.z >= -near) return;
    const r = (radius * focal) / -v.z;
    if (r < 0.3) return;
    const [x, y] = project(v.x, v.y, v.z);
    const W = this.domElement.width;
    const H = this.domElement.height;
    if (x + r < 0 || y + r < 0 || x - r > W || y - r > H) return;
    const ctx = this.context;
    const material = mesh.material as THREE.Material;

    if ((material as THREE.ShaderMaterial).isShaderMaterial) {
      // Atmosfera: anel de brilho na borda.
      const u = (material as THREE.ShaderMaterial).uniforms.uColor;
      if (!u) return;
      const c = (u.value as THREE.Color).clone().convertLinearToSRGB();
      const rgb = `${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)}`;
      items.push({
        depth: -v.z - radius * 1.01,
        draw: () => {
          const g = ctx.createRadialGradient(x, y, r * 0.8, x, y, r);
          g.addColorStop(0, `rgba(${rgb},0)`);
          g.addColorStop(0.85, `rgba(${rgb},0.55)`);
          g.addColorStop(1, `rgba(${rgb},0)`);
          ctx.globalCompositeOperation = 'lighter';
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        },
      });
      return;
    }

    const basic = (material as THREE.MeshBasicMaterial).isMeshBasicMaterial;
    const map = (material as THREE.MeshLambertMaterial).map;
    const color = `#${(material as THREE.MeshBasicMaterial).color.getHexString()}`;
    // Direção da luz vista da esfera, no espaço da câmera.
    let lx = 0;
    let ly = 0;
    let lz = 1;
    if (light) {
      const l = light.clone().sub(v).normalize();
      const toCam = v.clone().negate().normalize();
      lx = l.x;
      ly = l.y;
      lz = l.dot(toCam);
    }
    const lit = !!light;
    const spin = mesh.rotation.y;
    items.push({
      depth: -v.z,
      draw: () => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.clip();
        const tex = map ? this.textureCanvas(map) : null;
        if (tex && r > 1.5) {
          // Mostra metade da textura equiretangular, girando com o planeta.
          ctx.imageSmoothingEnabled = true;
          const tw = tex.width;
          const th = tex.height;
          const half = tw / 2;
          let u0 = ((((-spin / (Math.PI * 2)) % 1) + 1) % 1) * tw;
          const first = Math.min(half, tw - u0);
          ctx.drawImage(tex, u0, 0, first, th, x - r, y - r, (2 * r * first) / half, 2 * r);
          if (first < half) {
            u0 = 0;
            ctx.drawImage(tex, 0, 0, half - first, th, x - r + (2 * r * first) / half, y - r, (2 * r * (half - first)) / half, 2 * r);
          }
        } else {
          ctx.fillStyle = tex ? this.averageColor(tex) : color;
          ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        if (!basic) {
          // Sombra: o lado oposto à estrela escurece.
          const cx = x + lx * r * 0.9;
          const cy = y - ly * r * 0.9;
          const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r * (1.3 + 0.7 * Math.max(0, lz)));
          g.addColorStop(0, 'rgba(0,0,0,0)');
          g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
          g.addColorStop(1, 'rgba(0,0,0,0.93)');
          ctx.fillStyle = lit ? g : 'rgba(0,0,0,0.85)';
          ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
        }
        ctx.restore();
      },
    });
  }

  private collectRing(
    mesh: THREE.Mesh,
    items: Item[],
    view: THREE.Matrix4,
    project: (x: number, y: number, z: number) => [number, number],
    near: number,
  ): void {
    const p = (mesh.geometry as THREE.RingGeometry).parameters;
    const e = this.mv.multiplyMatrices(view, mesh.matrixWorld).elements.slice();
    const ring = (radius: number): [number, number][] | null => {
      const out: [number, number][] = [];
      for (let i = 0; i < 64; i++) {
        const a = (i / 64) * Math.PI * 2;
        const x = Math.cos(a) * radius;
        const y = Math.sin(a) * radius;
        const vz = e[2] * x + e[6] * y + e[14];
        if (vz >= -near) return null;
        out.push(project(e[0] * x + e[4] * y + e[12], e[1] * x + e[5] * y + e[13], vz));
      }
      return out;
    };
    const outer = ring(p.outerRadius);
    const inner = ring(p.innerRadius);
    if (!outer || !inner) return;
    const m = mesh.material as THREE.MeshBasicMaterial;
    const style = `#${m.color.getHexString()}`;
    const opacity = m.transparent ? m.opacity : 1;
    const ctx = this.context;
    const center = this.v.setFromMatrixPosition(mesh.matrixWorld).applyMatrix4(view);
    items.push({
      // Desenhado logo antes do planeta.
      depth: -center.z + 1e-9,
      draw: () => {
        ctx.globalAlpha = opacity;
        ctx.fillStyle = style;
        ctx.beginPath();
        outer.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        inner.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.fill('evenodd');
      },
    });
  }

  /** Malhas pequenas (a nave): triângulos com sombreamento chapado e ordenados por profundidade. */
  private collectMesh(
    mesh: THREE.Mesh,
    items: Item[],
    view: THREE.Matrix4,
    project: (x: number, y: number, z: number) => [number, number],
    near: number,
    ambient: number,
    dir: THREE.Vector3 | null,
    dirIntensity: number,
  ): void {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    if (!pos || pos.count > 5000) return;
    const e = this.mv.multiplyMatrices(view, mesh.matrixWorld).elements.slice();
    const vs: number[] = [];
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      vs.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
    }
    const material = mesh.material as THREE.MeshStandardMaterial;
    const base = material.color.clone().convertLinearToSRGB();
    const emissive = material.emissive ? material.emissive.clone().convertLinearToSRGB() : new THREE.Color(0);
    const index = g.index;
    const tris = index ? index.count / 3 : pos.count / 3;
    const ctx = this.context;
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
      const style = `rgb(${r | 0},${gg | 0},${b | 0})`;
      const pa = project(ax, ay, az);
      const pb = project(bx, by, bz);
      const pc = project(cx, cy, cz);
      items.push({
        depth: -(az + bz + cz) / 3,
        draw: () => {
          ctx.fillStyle = style;
          ctx.strokeStyle = style;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(pa[0], pa[1]);
          ctx.lineTo(pb[0], pb[1]);
          ctx.lineTo(pc[0], pc[1]);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        },
      });
    }
  }

  /** Brilho radial colorido, guardado em cache por cor. */
  private glow(profile: GlowProfile, r: number, g: number, b: number): HTMLCanvasElement {
    const q = (c: number) => Math.min(255, Math.round(c / 16) * 16);
    const key = `${profile}:${q(r)},${q(g)},${q(b)}`;
    let canvas = this.glows.get(key);
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      for (const [at, a] of GLOW_STOPS[profile]) grad.addColorStop(at, `rgba(${q(r)},${q(g)},${q(b)},${a})`);
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
