import * as THREE from 'three';
import { mulberry32 } from '../../core/rng';
import {
  BIOME_NAMES,
  classify,
  generateSurface,
  paintSurface,
  temperatureAt,
  type PlanetParams,
  type SurfaceMap,
} from '../../procgen/surface';
import { Input } from '../input';
import type { GameState } from '../state';

interface Tool {
  id: string;
  label: string;
  icon: string;
  apply(map: SurfaceMap, i: number, strength: number): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ferramentas iniciais de terraformação (RF-SUP-06). */
const TOOLS: Tool[] = [
  { id: 'raise', label: 'Elevar', icon: '⛰', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] + 0.02 * s, -1, 1)) },
  { id: 'lower', label: 'Rebaixar', icon: '⛏', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] - 0.02 * s, -1, 1)) },
  {
    id: 'water',
    label: 'Água',
    icon: '💧',
    apply: (m, i, s) => {
      m.moisture[i] = clamp(m.moisture[i] + 0.05 * s, 0, 1);
      if (s > 0.6) m.elevation[i] = Math.min(m.elevation[i], -0.05);
    },
  },
  { id: 'life', label: 'Semear vida', icon: '🌱', apply: (m, i, s) => (m.vegetation[i] = clamp(m.vegetation[i] + 0.06 * s, 0, 1)) },
  { id: 'heat', label: 'Aquecer', icon: '🔥', apply: (m, i, s) => (m.heat[i] = clamp(m.heat[i] + 1.5 * s, -150, 400)) },
  { id: 'cool', label: 'Resfriar', icon: '❄', apply: (m, i, s) => (m.heat[i] = clamp(m.heat[i] - 1.5 * s, -150, 400)) },
];

const vertexShader = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/** Desenha o mapa em tela cheia; um texel por elemento, com volta horizontal. */
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec2 uMapSize;
  uniform vec2 uCenter;
  uniform float uZoom;
  uniform vec2 uResolution;
  uniform vec2 uHover;
  uniform float uBrush;
  in vec2 vUv;
  out vec4 outColor;
  void main() {
    vec2 tile = uCenter + (vUv * uResolution - uResolution * 0.5) / uZoom;
    if (tile.y < 0.0 || tile.y >= uMapSize.y) { outColor = vec4(0.02, 0.03, 0.06, 1.0); return; }
    float x = mod(tile.x, uMapSize.x);
    ivec2 t = ivec2(int(x), int(uMapSize.y) - 1 - int(tile.y));
    vec3 c = texelFetch(uMap, t, 0).rgb;
    vec2 d = vec2(mod(tile.x - uHover.x + uMapSize.x * 0.5, uMapSize.x) - uMapSize.x * 0.5, tile.y - uHover.y);
    float r = length(d);
    if (uBrush > 0.0 && abs(r - uBrush) < 0.6 / max(uZoom * 0.25, 1.0) + 0.15) c = mix(c, vec3(1.0), 0.6);
    outColor = vec4(c, 1.0);
  }
`;

/**
 * Visão da superfície no estilo WorldBox (REQUISITOS.md, seção 4.7). Enquanto
 * este modo está ativo, nada do 3D fica carregado.
 */
export class SurfaceMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly map: SurfaceMap;
  private readonly pixels: Uint8Array;
  private readonly texture: THREE.DataTexture;
  private readonly material: THREE.ShaderMaterial;
  private readonly input: Input;
  private readonly root: HTMLDivElement;
  private readonly infoEl: HTMLElement;
  private readonly statsEl: HTMLElement;
  private readonly rnd = mulberry32(1234);
  private tool: Tool | null = TOOLS[0];
  private brush = 6;
  private zoom = 3;
  private center = new THREE.Vector2();
  private hover = new THREE.Vector2(-1e6, -1e6);
  private mouse: { x: number; y: number } | null = null;
  private painting = false;
  private dragging: { x: number; y: number } | null = null;
  private dirty = true;
  private textureChanged = true;
  private lastView = '';
  private lastInfo = 0;
  private lastInfoHtml = '';
  private raf = 0;
  private lastTime = performance.now();
  private lastSim = 0;
  private readonly abort = new AbortController();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly state: GameState,
    params: PlanetParams,
    hud: HTMLElement,
    private readonly onExit: () => void,
  ) {
    this.map = state.surfaces.get(params.id) ?? generateSurface(params);
    state.surfaces.set(params.id, this.map);
    this.pixels = new Uint8Array(this.map.width * this.map.height * 4);
    this.texture = new THREE.DataTexture(this.pixels, this.map.width, this.map.height);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.center.set(this.map.width / 2, this.map.height / 2);
    this.zoom = Math.max(1, Math.floor(window.innerHeight / this.map.height));

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uMap: { value: this.texture },
        uMapSize: { value: new THREE.Vector2(this.map.width, this.map.height) },
        uCenter: { value: this.center },
        uZoom: { value: this.zoom },
        uResolution: { value: new THREE.Vector2() },
        uHover: { value: this.hover },
        uBrush: { value: this.brush },
      },
      depthTest: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.input = new Input(renderer.domElement, false);

    this.root = document.createElement('div');
    this.root.className = 'surface-hud';
    this.root.innerHTML = `
      <div class="wb-top">
        <button class="wb-back" data-a="back">⟵ Voltar à órbita</button>
        <div class="wb-title">${params.name}</div>
        <div class="wb-stats" data-s></div>
      </div>
      <div class="wb-info" data-i></div>
      <div class="wb-bar">
        ${TOOLS.map((t) => `<button class="wb-tool" data-t="${t.id}" title="${t.label}"><span>${t.icon}</span>${t.label}</button>`).join('')}
        <button class="wb-tool" data-t="inspect" title="Inspecionar"><span>🔍</span>Inspecionar</button>
        <label class="wb-brush">Pincel <input type="range" min="1" max="30" value="${this.brush}" data-b /></label>
      </div>
      <div class="wb-help"><b>Botão esquerdo</b> usa a ferramenta · <b>Botão direito/meio</b> ou <b>WASD</b> move · <b>Roda</b> zoom · <b>Esc</b> volta</div>`;
    hud.appendChild(this.root);
    this.infoEl = this.root.querySelector('[data-i]')!;
    this.statsEl = this.root.querySelector('[data-s]')!;
    this.bindUi();

    window.addEventListener('resize', this.resize, { signal: this.abort.signal });
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private bindUi(): void {
    const signal = this.abort.signal;
    this.root.querySelector('[data-a="back"]')!.addEventListener('click', () => this.onExit(), { signal });
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.addEventListener('click', () => {
        this.tool = TOOLS.find((t) => t.id === b.dataset.t) ?? null;
        this.updateToolbar();
      }, { signal });
    });
    this.root.querySelector<HTMLInputElement>('[data-b]')!.addEventListener('input', (e) => {
      this.brush = Number((e.target as HTMLInputElement).value);
    }, { signal });
    this.updateToolbar();

    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) this.painting = true;
      else this.dragging = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    }, { signal });
    canvas.addEventListener('pointerup', () => {
      this.painting = false;
      this.dragging = null;
    }, { signal });
    canvas.addEventListener('pointermove', (e) => {
      if (this.dragging) {
        this.center.x -= (e.clientX - this.dragging.x) / this.zoom;
        this.center.y += (e.clientY - this.dragging.y) / this.zoom;
        this.dragging = { x: e.clientX, y: e.clientY };
      }
      this.mouse = { x: e.clientX, y: e.clientY };
    }, { signal });
    canvas.addEventListener('pointerleave', () => (this.mouse = null), { signal });
  }

  private updateToolbar(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.classList.toggle('on', (this.tool?.id ?? 'inspect') === b.dataset.t);
    });
  }

  private readonly resize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    (this.material.uniforms.uResolution.value as THREE.Vector2).copy(size);
  };

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.state.time += dt;

    const input = this.input;
    if (input.hit('Escape')) {
      this.onExit();
      return;
    }
    const pan = 300 / this.zoom;
    this.center.x += ((input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0)) * pan * dt;
    this.center.y += ((input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0)) * pan * dt;
    if (input.wheel) this.zoom = clamp(this.zoom * (input.wheel < 0 ? 1.25 : 0.8), 0.5, 40);
    this.center.y = clamp(this.center.y, 0, this.map.height);
    this.center.x = ((this.center.x % this.map.width) + this.map.width) % this.map.width;

    this.updateHover();
    if (this.painting && this.tool) this.applyBrush(this.tool, dt);
    if (now - this.lastSim > 250) {
      this.lastSim = now;
      this.simulate();
    }
    if (this.dirty) {
      paintSurface(this.map, this.pixels);
      this.texture.needsUpdate = true;
      this.dirty = false;
      this.textureChanged = true;
    }

    // Só redesenha quando algo mudou: o mapa parado não gasta GPU.
    const view = `${this.center.x},${this.center.y},${this.zoom},${this.hover.x},${this.hover.y},${this.tool?.id},${this.brush},${this.renderer.getPixelRatio()}`;
    if (this.textureChanged || view !== this.lastView) {
      this.lastView = view;
      this.textureChanged = false;
      (this.material.uniforms.uResolution.value as THREE.Vector2).copy(this.renderer.getDrawingBufferSize(new THREE.Vector2()));
      this.material.uniforms.uZoom.value = this.zoom * this.renderer.getPixelRatio();
      this.material.uniforms.uBrush.value = this.tool ? this.brush : 0;
      this.renderer.autoClear = true;
      this.renderer.render(this.scene, this.camera);
    }
    if (now - this.lastInfo > 150) {
      this.lastInfo = now;
      this.updateInfo();
    }
    input.endFrame();
  };

  /** Converte a posição do mouse em coordenadas do mapa (y cresce para o norte). */
  private updateHover(): void {
    if (!this.mouse) {
      this.hover.set(-1e6, -1e6);
      return;
    }
    const sx = this.mouse.x - window.innerWidth / 2;
    const sy = window.innerHeight / 2 - this.mouse.y;
    this.hover.set(this.center.x + sx / this.zoom, this.center.y + sy / this.zoom);
  }

  private tileIndex(x: number, y: number): number {
    const w = this.map.width;
    const tx = ((Math.floor(x) % w) + w) % w;
    const ty = this.map.height - 1 - Math.floor(y);
    return ty < 0 || ty >= this.map.height ? -1 : ty * w + tx;
  }

  private applyBrush(tool: Tool, dt: number): void {
    const r = this.brush;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const i = this.tileIndex(this.hover.x + dx, this.hover.y + dy);
        if (i < 0) continue;
        tool.apply(this.map, i, (1 - d / (r + 1)) * dt * 30);
        this.map.biome[i] = classify(this.map, i);
      }
    }
    this.dirty = true;
  }

  /**
   * Simulação mínima (RF-SUP-07): a vegetação se espalha para vizinhos com
   * clima favorável e morre onde o clima ficou hostil.
   */
  private simulate(): void {
    const m = this.map;
    const n = m.width * m.height;
    for (let k = 0; k < 6000; k++) {
      const i = Math.floor(this.rnd() * n);
      if (m.elevation[i] < 0) continue;
      const t = temperatureAt(m, i);
      const ok = t > 262 && t < 320 && m.moisture[i] > 0.25;
      const x = i % m.width;
      const y = Math.floor(i / m.width);
      const nx = (x + Math.floor(this.rnd() * 3) - 1 + m.width) % m.width;
      const ny = y + Math.floor(this.rnd() * 3) - 1;
      const neighbour = ny >= 0 && ny < m.height ? m.vegetation[ny * m.width + nx] : 0;
      const before = m.biome[i];
      if (ok && neighbour > 0.3) m.vegetation[i] = Math.min(1, m.vegetation[i] + 0.08);
      else if (!ok) m.vegetation[i] = Math.max(0, m.vegetation[i] - 0.05);
      m.biome[i] = classify(m, i);
      if (m.biome[i] !== before) this.dirty = true;
    }
  }

  private updateInfo(): void {
    const i = this.tileIndex(this.hover.x, this.hover.y);
    let land = 0;
    let life = 0;
    for (let k = 0; k < this.map.elevation.length; k += 7) {
      if (this.map.elevation[k] >= 0) land++;
      life += this.map.vegetation[k];
    }
    const total = this.map.elevation.length / 7;
    this.statsEl.textContent = `${this.map.width}×${this.map.height} · terra ${Math.round((land / total) * 100)}% · vida ${Math.round((life / total) * 100)}%`;
    if (i < 0) {
      this.infoEl.hidden = true;
      return;
    }
    this.infoEl.hidden = false;
    const t = temperatureAt(this.map, i);
    const html = `
      <b>${BIOME_NAMES[this.map.biome[i] as keyof typeof BIOME_NAMES]}</b>
      <span>Altitude ${(this.map.elevation[i] * 100).toFixed(0)}</span>
      <span>Temperatura ${(t - 273.15).toFixed(0)} °C</span>
      <span>Umidade ${(this.map.moisture[i] * 100).toFixed(0)}%</span>
      <span>Vegetação ${(this.map.vegetation[i] * 100).toFixed(0)}%</span>`;
    if (html !== this.lastInfoHtml) {
      this.lastInfoHtml = html;
      this.infoEl.innerHTML = html;
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.input.dispose();
    this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.material.dispose();
    this.texture.dispose();
    this.root.remove();
    this.renderer.renderLists.dispose();
  }
}
