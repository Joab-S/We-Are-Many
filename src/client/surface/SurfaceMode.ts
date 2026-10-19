import * as THREE from 'three';
import { mulberry32, seedFor } from '../../core/rng';
import {
  BIOME_NAMES,
  classify,
  paintSurface,
  paintTile,
  temperatureAt,
  type PlanetParams,
  type SurfaceMap,
} from '../../procgen/surface';
import { Ecosystem, ERAS, YEAR_SECONDS } from '../../sim/ecosystem';
import { nativeSpecies, type Species } from '../../sim/species';
import { Input } from '../input';
import type { GameState } from '../state';
import { generateSurfaceAsync } from './generateAsync';
import { SpriteAtlas, SpriteLayer, type SpriteName } from './sprites';

type Tab = 'terrain' | 'life' | 'civ';

interface Tool {
  id: string;
  tab: Tab;
  label: string;
  icon: string;
  /** Pincel contínuo enquanto o botão está apertado, ou um clique por vez. */
  mode: 'brush' | 'click';
  apply?(map: SurfaceMap, i: number, strength: number): void;
  act?(ctx: SurfaceMode, x: number, y: number): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Ferramentas de terraformação (RF-SUP-06). */
const TERRAIN_TOOLS: Tool[] = [
  { id: 'raise', tab: 'terrain', label: 'Elevar', icon: '⛰', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] + 0.02 * s, -1, 1)) },
  { id: 'lower', tab: 'terrain', label: 'Rebaixar', icon: '⛏', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] - 0.02 * s, -1, 1)) },
  {
    id: 'water',
    tab: 'terrain',
    label: 'Água',
    icon: '💧',
    mode: 'brush',
    apply: (m, i, s) => {
      m.moisture[i] = clamp(m.moisture[i] + 0.05 * s, 0, 1);
      if (s > 0.6) m.elevation[i] = Math.min(m.elevation[i], -0.05);
    },
  },
  { id: 'comet', tab: 'terrain', label: 'Cometa', icon: '☄', mode: 'click', act: (ctx, x, y) => ctx.comet(x, y) },
  { id: 'heat', tab: 'terrain', label: 'Aquecer', icon: '🔥', mode: 'brush', apply: (m, i, s) => (m.heat[i] = clamp(m.heat[i] + 1.5 * s, -150, 400)) },
  { id: 'cool', tab: 'terrain', label: 'Resfriar', icon: '❄', mode: 'brush', apply: (m, i, s) => (m.heat[i] = clamp(m.heat[i] - 1.5 * s, -150, 400)) },
  { id: 'plant', tab: 'terrain', label: 'Semear vida', icon: '🌱', mode: 'brush', apply: (m, i, s) => (m.vegetation[i] = clamp(m.vegetation[i] + 0.06 * s, 0, 1)) },
];

const vertexShader = /* glsl */ `
  out vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

/**
 * Terreno em tela cheia. Longe: um pixel por tile. Perto: cada tile ganha
 * textura própria e o enfeite guardado no alfa (árvores, pinheiros, cactos,
 * pedras), desenhado numa grade de 8x8 pixels de arte, como no WorldBox.
 */
const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D uMap;
  uniform vec2 uMapSize;
  uniform vec2 uCenter;
  uniform float uZoom;
  uniform vec2 uResolution;
  uniform vec2 uHover;
  uniform float uBrush;
  uniform float uTime;
  in vec2 vUv;
  out vec4 outColor;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  vec3 decor(int kind, vec2 f, vec3 base, inout bool hit) {
    // f: posição no tile em pixels de arte (0..8), y para baixo.
    vec2 p = floor(f) + 0.5;
    hit = false;
    if (kind == 1 || kind == 2) {
      float r = kind == 2 ? 3.6 : 3.1;
      vec2 c = vec2(4.0, 3.4);
      float d = length(p - c);
      if (p.x > 3.0 && p.x < 5.0 && p.y > 5.5 && p.y < 8.0) { hit = true; return vec3(0.33, 0.2, 0.1); }
      if (d < r) {
        hit = true;
        vec3 leaf = kind == 2 ? base * 1.05 : base * 1.3;
        if (d > r - 0.9) return base * 0.55;
        if (p.x + p.y < c.x + c.y - 1.5) return leaf * 1.22;
        return leaf;
      }
    } else if (kind == 3) {
      float w = (p.y - 0.5) * 0.45;
      if (p.y < 6.5 && abs(p.x - 4.0) < w + 0.5) { hit = true; return abs(p.x - 4.0) > w - 0.6 ? vec3(0.08, 0.25, 0.12) : vec3(0.14, 0.4, 0.2); }
      if (p.y >= 6.5 && abs(p.x - 4.0) < 1.0) { hit = true; return vec3(0.33, 0.2, 0.1); }
    } else if (kind == 4) {
      if (p.y > 1.5 && p.y < 3.5 && abs(p.x - 4.0) < 3.6) { hit = true; return p.y < 2.5 ? vec3(0.45, 0.55, 0.2) : vec3(0.3, 0.4, 0.12); }
      if (p.y >= 3.5 && abs(p.x - 4.0) < 1.0) { hit = true; return vec3(0.38, 0.25, 0.12); }
    } else if (kind == 5) {
      if ((abs(p.x - 4.0) < 1.0 && p.y > 1.0) || (abs(p.x - 2.0) < 0.6 && p.y > 3.0 && p.y < 5.5) || (abs(p.x - 6.0) < 0.6 && p.y > 2.0 && p.y < 4.5)) { hit = true; return vec3(0.25, 0.55, 0.25); }
    } else if (kind == 6) {
      vec2 q = (p - vec2(4.0, 5.0)) / vec2(3.0, 2.0);
      if (dot(q, q) < 1.0) { hit = true; return q.y < -0.2 ? vec3(0.62) : vec3(0.42); }
    }
    return base;
  }

  void main() {
    vec2 tile = uCenter + (vUv * uResolution - uResolution * 0.5) / uZoom;
    if (tile.y < 0.0 || tile.y >= uMapSize.y) { outColor = vec4(0.02, 0.03, 0.06, 1.0); return; }
    float x = mod(tile.x, uMapSize.x);
    ivec2 t = ivec2(int(x), int(uMapSize.y) - 1 - int(tile.y));
    vec4 texel = texelFetch(uMap, t, 0);
    vec3 c = texel.rgb;
    bool water = c.b > c.r + 0.25 && c.b > c.g;
    if (uZoom >= 3.0) {
      // Variação suave por tile, como as texturas de chão do WorldBox.
      c *= 0.95 + 0.1 * hash(vec2(t));
      if (water) c += 0.035 * step(0.93, sin(float(t.x) * 0.9 + float(t.y) * 1.7 + uTime * 1.6));
    }
    int kind = int(texel.a * 255.0 + 0.5) / 16;
    if (uZoom >= 5.0 && kind > 0) {
      vec2 f = vec2(fract(x), 1.0 - fract(tile.y)) * 8.0;
      bool hit;
      vec3 d = decor(kind, f, texel.rgb, hit);
      if (hit) c = d;
      else if (kind <= 4 && length(floor(f) + 0.5 - vec2(4.2, 7.4)) < 2.0) c *= 0.8;
    }
    vec2 dd = vec2(mod(tile.x - uHover.x + uMapSize.x * 0.5, uMapSize.x) - uMapSize.x * 0.5, tile.y - uHover.y);
    float r = length(dd);
    if (uBrush > 0.0 && abs(r - uBrush) < 0.6 / max(uZoom * 0.25, 1.0) + 0.15) c = mix(c, vec3(1.0), 0.6);
    outColor = vec4(c, 1.0);
  }
`;

const SPEEDS = [0, 1, 2, 5];

/**
 * Visão da superfície no estilo WorldBox (REQUISITOS.md, seção 4.7). Enquanto
 * este modo está ativo, nada do 3D fica carregado.
 */
export class SurfaceMode {
  private readonly scene = new THREE.Scene();
  private readonly spriteScene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private map!: SurfaceMap;
  private eco!: Ecosystem;
  private pixels!: Uint8Array;
  private texture!: THREE.DataTexture;
  private material!: THREE.ShaderMaterial;
  private atlas!: SpriteAtlas;
  private sprites!: SpriteLayer;
  private readonly input: Input;
  private readonly root: HTMLDivElement;
  private readonly rnd = mulberry32(1234);
  private tools: Tool[] = [...TERRAIN_TOOLS];
  private tool: Tool | null = TERRAIN_TOOLS[0];
  private brush = 6;
  private zoom = 3;
  private speed = 1;
  private center = new THREE.Vector2();
  private hover = new THREE.Vector2(-1e6, -1e6);
  private mouse: { x: number; y: number } | null = null;
  private painting = false;
  private clicked = false;
  private dragging: { x: number; y: number } | null = null;
  private textureChanged = true;
  private lastView = '';
  private lastInfo = 0;
  private lastInfoHtml = '';
  private lastPanelHtml = '';
  private raf = 0;
  private lastTime = performance.now();
  private simClock = 0;
  private ready = false;
  private readonly labels = new Map<number, HTMLDivElement>();
  private readonly abort = new AbortController();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly state: GameState,
    private readonly params: PlanetParams,
    hud: HTMLElement,
    private readonly onExit: () => void,
  ) {
    this.input = new Input(renderer.domElement, false);
    this.root = document.createElement('div');
    this.root.className = 'surface-hud';
    this.root.innerHTML = `<div class="wb-loading">Observando a superfície de ${params.name}…</div>`;
    hud.appendChild(this.root);
    window.addEventListener('resize', this.resize, { signal: this.abort.signal });
    this.renderer.setClearColor(0x05070d);
    this.renderer.clear();

    const existing = state.surfaces.get(params.id);
    if (existing) this.init(existing);
    else void generateSurfaceAsync(params).then((map) => this.init(map));
  }

  private init(map: SurfaceMap): void {
    if (this.abort.signal.aborted) return;
    const state = this.state;
    this.map = map;
    state.surfaces.set(this.params.id, map);

    // Espécies nativas passam a ser conhecidas (podem ser levadas a outros planetas).
    let eco = state.ecosystems.get(this.params.id);
    if (!eco) {
      eco = new Ecosystem(map, seedFor(`${this.params.id}:life`));
      for (const sp of nativeSpecies(this.params)) {
        eco.addSpecies(sp);
        state.knownSpecies.set(sp.id, sp);
      }
      eco.populate();
      state.ecosystems.set(this.params.id, eco);
    }
    this.eco = eco;
    eco.onTileChanged = (i) => this.repaint(i);
    this.buildLifeTools();

    this.pixels = new Uint8Array(map.width * map.height * 4);
    paintSurface(map, this.pixels);
    this.texture = new THREE.DataTexture(this.pixels, map.width, map.height);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.center.set(map.width / 2, map.height / 2);
    this.zoom = Math.max(1, window.innerHeight / map.height);

    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader,
      fragmentShader,
      uniforms: {
        uMap: { value: this.texture },
        uMapSize: { value: new THREE.Vector2(map.width, map.height) },
        uCenter: { value: this.center },
        uZoom: { value: this.zoom },
        uResolution: { value: new THREE.Vector2() },
        uHover: { value: this.hover },
        uBrush: { value: this.brush },
        uTime: { value: 0 },
      },
      depthTest: false,
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.atlas = new SpriteAtlas();
    this.sprites = new SpriteLayer(this.atlas, 12000);
    this.spriteScene.add(this.sprites.mesh);

    this.buildUi();
    this.resize();
    this.ready = true;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Ferramentas da aba Vida: uma por espécie conhecida, mais controle de população. */
  private buildLifeTools(): void {
    const known = [...this.state.knownSpecies.values()];
    const life: Tool[] = known
      .filter((sp) => sp.kind !== 'sapient')
      .map((sp) => ({
        id: `spawn:${sp.id}`,
        tab: 'life' as Tab,
        label: sp.name,
        icon: sp.kind === 'fish' ? '🐟' : sp.kind === 'predator' ? '🐺' : '🦌',
        mode: 'click' as const,
        act: (ctx: SurfaceMode, x: number, y: number) => ctx.introduce(sp, x, y),
      }));
    life.push(
      { id: 'feed', tab: 'life', label: 'Alimentar', icon: '🍎', mode: 'brush', act: (ctx, x, y) => ctx.eco.feed(x, ctx.toRow(y), ctx.brush) },
      { id: 'cull', tab: 'life', label: 'Reduzir', icon: '✖', mode: 'click', act: (ctx, x, y) => ctx.eco.cull(x, ctx.toRow(y), ctx.brush) },
    );
    const civ: Tool[] = known
      .filter((sp) => sp.kind === 'sapient')
      .map((sp) => ({
        id: `spawn:${sp.id}`,
        tab: 'civ' as Tab,
        label: sp.name,
        icon: '🧑',
        mode: 'click' as const,
        act: (ctx: SurfaceMode, x: number, y: number) => ctx.introduce(sp, x, y),
      }));
    civ.push({
      id: 'teach',
      tab: 'civ',
      label: 'Ensinar',
      icon: '📜',
      mode: 'click',
      act: (ctx, x, y) => {
        const taught = ctx.eco.teach(x, ctx.toRow(y), ctx.brush, 0.35);
        if (taught.length) ctx.eco.log.unshift(`Você ensinou ${taught.map((v) => v.name).join(', ')}`);
      },
    });
    this.tools = [...TERRAIN_TOOLS, ...life, ...civ];
  }

  // Ações chamadas pelas ferramentas ----------------------------------------

  /** Converte coordenadas da vista (y para o norte) em linha do mapa. */
  toRow(viewY: number): number {
    return this.map.height - viewY;
  }

  introduce(sp: Species, x: number, viewY: number): void {
    const s = this.eco.addSpecies(sp);
    const born = this.eco.introduce(s, x, this.toRow(viewY), this.brush, sp.kind === 'sapient' ? 6 : 8);
    if (!born) this.eco.log.unshift(`${sp.name}: o lugar não é habitável`);
  }

  /** Impacto de cometa: abre uma cratera que vira lago e umedece os arredores. */
  comet(x: number, viewY: number): void {
    const r = Math.max(3, this.brush);
    this.forBrush(x, viewY, r * 1.6, (i, d) => {
      const m = this.map;
      if (d < r) m.elevation[i] = Math.min(m.elevation[i], -0.08 - (1 - d / r) * 0.25);
      else m.elevation[i] = clamp(m.elevation[i] + 0.08 * (1 - (d - r) / (r * 0.6)), -1, 1);
      m.moisture[i] = clamp(m.moisture[i] + 0.4, 0, 1);
      m.vegetation[i] *= 0.3;
    });
    this.eco.cull(x, this.toRow(viewY), r);
  }

  private forBrush(x: number, viewY: number, r: number, fn: (i: number, d: number) => void): void {
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) {
      for (let dx = -ri; dx <= ri; dx++) {
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > r) continue;
        const i = this.tileIndex(x + dx, viewY + dy);
        if (i < 0) continue;
        fn(i, d);
        this.map.biome[i] = classify(this.map, i);
        this.repaint(i);
      }
    }
  }

  private repaint(i: number): void {
    this.map.biome[i] = classify(this.map, i);
    paintTile(this.map, this.pixels, i);
    this.textureChanged = true;
  }

  // Interface ----------------------------------------------------------------

  private buildUi(): void {
    this.root.innerHTML = `
      <div class="wb-top">
        <button class="wb-back" data-a="back">⟵ Voltar à órbita</button>
        <div class="wb-title">${this.params.name}</div>
        <div class="wb-stats" data-s></div>
      </div>
      <div class="wb-info" data-i hidden></div>
      <div class="wb-side" data-p></div>
      <div class="wb-labels" data-l></div>
      <div class="wb-dock">
        <div class="wb-tabs">
          <button data-tab="terrain">⛰ Terreno</button>
          <button data-tab="life">🌿 Vida</button>
          <button data-tab="civ">🏛 Civilização</button>
        </div>
        <div class="wb-bar" data-bar></div>
      </div>
      <div class="wb-help"><b>Botão esquerdo</b> usa a ferramenta · <b>Botão direito/meio</b> ou <b>WASD</b> move · <b>Roda</b> zoom · <b>Espaço</b> pausa · <b>Esc</b> volta</div>`;
    const signal = this.abort.signal;
    this.root.querySelector('[data-a="back"]')!.addEventListener('click', () => this.onExit(), { signal });
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => this.selectTab(b.dataset.tab as Tab), { signal });
    });
    // pointerdown porque o painel é redesenhado enquanto a simulação roda e um
    // clique (descer e subir) poderia cair em botões já substituídos.
    this.root.querySelector('[data-p]')!.addEventListener('pointerdown', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-speed]');
      if (b) this.speed = Number(b.dataset.speed);
      const g = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-village]');
      const v = g && this.eco.villages.find((it) => it.id === Number(g.dataset.village));
      if (v) {
        this.center.set(v.x, this.map.height - v.y);
        this.zoom = Math.max(this.zoom, 10);
      }
    }, { signal });
    this.selectTab('terrain');

    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0) {
        this.painting = true;
        this.clicked = true;
      } else this.dragging = { x: e.clientX, y: e.clientY };
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

  private selectTab(tab: Tab): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const tools = this.tools.filter((t) => t.tab === tab);
    if (!this.tool || this.tool.tab !== tab) this.tool = tools[0] ?? null;
    const bar = this.root.querySelector<HTMLElement>('[data-bar]')!;
    bar.innerHTML = `
      ${tools.map((t) => `<button class="wb-tool" data-t="${t.id}" title="${t.label}"><span>${t.icon}</span>${t.label}</button>`).join('')}
      <button class="wb-tool" data-t="inspect" title="Inspecionar"><span>🔍</span>Inspecionar</button>
      <label class="wb-brush">Pincel <input type="range" min="1" max="30" value="${this.brush}" data-b /></label>`;
    const signal = this.abort.signal;
    bar.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.addEventListener('click', () => {
        this.tool = this.tools.find((t) => t.id === b.dataset.t) ?? null;
        this.updateToolbar();
      }, { signal });
    });
    bar.querySelector<HTMLInputElement>('[data-b]')!.addEventListener('input', (e) => {
      this.brush = Number((e.target as HTMLInputElement).value);
    }, { signal });
    this.updateToolbar();
  }

  private updateToolbar(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.classList.toggle('on', (this.tool?.id ?? 'inspect') === b.dataset.t);
    });
  }

  private readonly resize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    if (this.material) {
      (this.material.uniforms.uResolution.value as THREE.Vector2).copy(this.renderer.getDrawingBufferSize(new THREE.Vector2()));
    }
    this.lastView = '';
  };

  // Laço principal -----------------------------------------------------------

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
    if (input.hit('Space')) this.speed = this.speed ? 0 : 1;
    const pan = 300 / this.zoom;
    this.center.x += ((input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0)) * pan * dt;
    this.center.y += ((input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0)) * pan * dt;
    if (input.wheel) this.zoom = clamp(this.zoom * (input.wheel < 0 ? 1.25 : 0.8), 0.5, 48);
    // Como no WorldBox, a vista não passa dos polos quando o mapa cabe na altura da tela.
    const halfView = window.innerHeight / 2 / this.zoom;
    this.center.y = halfView * 2 < this.map.height ? clamp(this.center.y, halfView, this.map.height - halfView) : this.map.height / 2;
    this.center.x = ((this.center.x % this.map.width) + this.map.width) % this.map.width;

    this.updateHover();
    this.useTool(dt);

    // Simulação em passos de no máximo 0,1 s, multiplicados pela velocidade escolhida.
    const simDt = dt * SPEEDS[this.speed];
    if (simDt > 0) {
      this.simClock += simDt;
      while (this.simClock > 0.1) {
        this.eco.step(0.1);
        this.simClock -= 0.1;
      }
      this.spreadVegetation(simDt);
    }

    if (this.textureChanged) this.texture.needsUpdate = true;
    // Parado e sem mudanças, não redesenha.
    const view = `${this.center.x},${this.center.y},${this.zoom},${this.hover.x},${this.hover.y},${this.tool?.id},${this.brush},${this.renderer.getPixelRatio()}`;
    if (simDt > 0 || this.textureChanged || view !== this.lastView) {
      this.lastView = view;
      this.textureChanged = false;
      this.render(now);
    }
    if (now - this.lastInfo > 150) {
      this.lastInfo = now;
      this.updateInfo();
      this.updatePanel();
    }
    input.endFrame();
  };

  private render(now: number): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const pr = this.renderer.getPixelRatio();
    const u = this.material.uniforms;
    (u.uResolution.value as THREE.Vector2).copy(size);
    u.uZoom.value = this.zoom * pr;
    u.uBrush.value = this.tool ? this.brush : 0;
    u.uTime.value = now / 1000;
    this.renderer.autoClear = true;
    this.renderer.render(this.scene, this.camera);
    this.drawSprites(size.x, size.y, this.zoom * pr);
    this.renderer.autoClear = false;
    this.renderer.render(this.spriteScene, this.camera);
    this.renderer.autoClear = true;
    this.updateLabels();
  }

  /** Converte coordenadas do mapa (x, linha) em pixels do buffer, com volta horizontal. */
  private toScreen(x: number, row: number, z: number, w: number, h: number): [number, number] {
    const mw = this.map.width;
    let dx = x - this.center.x;
    dx -= Math.round(dx / mw) * mw;
    return [dx * z + w / 2, (this.map.height - row - this.center.y) * z + h / 2];
  }

  private drawSprites(w: number, h: number, z: number): void {
    const eco = this.eco;
    const layer = this.sprites;
    layer.begin(w, h);
    const margin = 40;
    const small = z < 3.5;
    // Casas primeiro, criaturas por cima.
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      const era = Math.floor(v.tech);
      const sprite: SpriteName = era >= 3 ? 'stoneHouse' : era >= 1 ? 'house' : 'hut';
      for (const house of v.houses) {
        const [sx, sy] = this.toScreen(house.x + 0.5, house.y + 1, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        layer.push(sprite, sx, sy, Math.max(3, z * 2.4), v.color);
      }
      if (!small) {
        const [fx, fy] = this.toScreen(v.x + 1.5, v.y + 0.5, z, w, h);
        layer.push('bonfire', fx, fy, z * 1.1, v.color);
      }
    }
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i]) continue;
      const [sx, sy] = this.toScreen(eco.x[i], eco.y[i], z, w, h);
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
      const sp = eco.species[eco.kind[i]];
      const vi = eco.village[i];
      const tint = sp.kind === 'sapient' && vi >= 0 ? eco.villages[vi].color : sp.color;
      if (small) {
        layer.push('dot', sx, sy, Math.max(1.5, z * 0.7), tint);
        continue;
      }
      const name: SpriteName =
        sp.kind === 'fish' ? 'fish' : sp.kind === 'herbivore' ? 'herbivore' : sp.kind === 'predator' ? 'predator' : sp.origin === 'sol-3' ? 'human' : 'alien';
      const height = sp.kind === 'fish' ? 0.5 : sp.kind === 'sapient' ? 1.3 : 0.9;
      layer.push(name, sx, sy - z * 0.5, z * height, tint);
    }
    layer.end();
  }

  /** Nomes das aldeias (como no WorldBox), visíveis com zoom. */
  private updateLabels(): void {
    const container = this.root.querySelector<HTMLElement>('[data-l]')!;
    const show = this.zoom >= 2.5;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const v of this.eco.villages) {
      let el = this.labels.get(v.id);
      if (!show || v.abandoned) {
        if (el) el.hidden = true;
        continue;
      }
      const [sx, sy] = this.toScreen(v.x, v.y - 2.5, this.zoom, w, h);
      if (sx < -100 || sx > w + 100 || sy < -40 || sy > h + 40) {
        if (el) el.hidden = true;
        continue;
      }
      if (!el) {
        el = document.createElement('div');
        el.className = 'wb-village';
        container.appendChild(el);
        this.labels.set(v.id, el);
      }
      el.hidden = false;
      const text = `${v.name} ${v.population}`;
      if (el.textContent !== text) el.textContent = text;
      el.style.transform = `translate(${sx}px, ${h - sy}px) translate(-50%, -100%)`;
    }
  }

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

  private tileIndex(x: number, viewY: number): number {
    const w = this.map.width;
    const tx = ((Math.floor(x) % w) + w) % w;
    const ty = this.map.height - 1 - Math.floor(viewY);
    return ty < 0 || ty >= this.map.height ? -1 : ty * w + tx;
  }

  private useTool(dt: number): void {
    const tool = this.tool;
    const click = this.clicked;
    this.clicked = false;
    if (!tool || this.hover.x < -1e5) return;
    if (tool.mode === 'click') {
      if (click) tool.act?.(this, this.hover.x, this.hover.y);
      return;
    }
    if (!this.painting) return;
    if (tool.apply) {
      const r = this.brush;
      this.forBrush(this.hover.x, this.hover.y, r, (i, d) => tool.apply!(this.map, i, (1 - d / (r + 1)) * dt * 30));
    } else {
      tool.act?.(this, this.hover.x, this.hover.y);
    }
  }

  /**
   * Clima e vegetação (RF-SUP-07): a vegetação se espalha para vizinhos com
   * clima favorável e morre onde o clima ficou hostil.
   */
  private spreadVegetation(simDt: number): void {
    const m = this.map;
    const n = m.width * m.height;
    const samples = Math.min(40000, Math.round(n * 0.04 * simDt));
    for (let k = 0; k < samples; k++) {
      const i = Math.floor(this.rnd() * n);
      if (m.elevation[i] < 0) continue;
      const t = temperatureAt(m, i);
      const ok = t > 262 && t < 320 && m.moisture[i] > 0.25;
      const x = i % m.width;
      const y = (i - x) / m.width;
      const nx = (x + Math.floor(this.rnd() * 3) - 1 + m.width) % m.width;
      const ny = y + Math.floor(this.rnd() * 3) - 1;
      const neighbour = ny >= 0 && ny < m.height ? m.vegetation[ny * m.width + nx] : 0;
      const before = m.vegetation[i];
      if (ok && neighbour > 0.3) m.vegetation[i] = Math.min(1, before + 0.05);
      else if (!ok) m.vegetation[i] = Math.max(0, before - 0.05);
      if (m.vegetation[i] !== before) this.repaint(i);
    }
  }

  private updateInfo(): void {
    const el = this.root.querySelector<HTMLElement>('[data-i]')!;
    const i = this.tileIndex(this.hover.x, this.hover.y);
    if (i < 0) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    let html: string;
    const picked = this.eco.pick(this.hover.x, this.toRow(this.hover.y), Math.max(0.8, 6 / this.zoom));
    if (picked >= 0) {
      const sp = this.eco.species[this.eco.kind[picked]];
      const v = this.eco.village[picked] >= 0 ? this.eco.villages[this.eco.village[picked]] : null;
      html = `
        <b>${sp.name}</b>
        ${v ? `<span>Aldeia ${v.name} · ${ERAS[Math.floor(v.tech)]}</span>` : ''}
        <span>Idade ${this.eco.age[picked].toFixed(0)} anos</span>
        <span>Energia ${(this.eco.energy[picked] * 100).toFixed(0)}%</span>`;
    } else {
      const t = temperatureAt(this.map, i);
      html = `
        <b>${BIOME_NAMES[this.map.biome[i] as keyof typeof BIOME_NAMES]}</b>
        <span>Altitude ${(this.map.elevation[i] * 100).toFixed(0)}</span>
        <span>Temperatura ${(t - 273.15).toFixed(0)} °C</span>
        <span>Umidade ${(this.map.moisture[i] * 100).toFixed(0)}%</span>
        <span>Vegetação ${(this.map.vegetation[i] * 100).toFixed(0)}%</span>`;
    }
    if (html !== this.lastInfoHtml) {
      this.lastInfoHtml = html;
      el.innerHTML = html;
    }
  }

  /** Painel lateral: ano, era, velocidade do tempo, população por espécie e acontecimentos. */
  private updatePanel(): void {
    const eco = this.eco;
    const live = eco.villages.filter((v) => !v.abandoned);
    const era = live.length ? ERAS[Math.floor(Math.max(...live.map((v) => v.tech)))] : 'Sem civilização';
    const rows = eco.species
      .map((sp, s) => `<div class="wb-pop"><i style="background:rgb(${sp.color.join(',')})"></i>${sp.name}<b>${eco.population[s]}</b></div>`)
      .join('');
    const html = `
      <div class="wb-era">${era}</div>
      <div class="wb-year">Ano ${Math.floor(eco.year)}</div>
      <div class="wb-speed">${SPEEDS.map((v, k) => `<button data-speed="${k}" class="${k === this.speed ? 'on' : ''}">${v === 0 ? 'II' : `${v}x`}</button>`).join('')}</div>
      <div class="wb-section">População</div>
      ${rows || '<div class="wb-empty">Nenhuma espécie. Leve uma pela aba Vida.</div>'}
      <div class="wb-pop">Aldeias<b>${live.length}</b></div>
      ${live.slice(0, 6).map((v) => `<button class="wb-goto" data-village="${v.id}"><i style="background:rgb(${v.color.join(',')})"></i>${v.name}<b>${v.population}</b></button>`).join('')}
      ${eco.log.length ? `<div class="wb-section">Acontecimentos</div>${eco.log.slice(0, 5).map((l) => `<div class="wb-log">${l}</div>`).join('')}` : ''}`;
    if (html !== this.lastPanelHtml) {
      this.lastPanelHtml = html;
      this.root.querySelector<HTMLElement>('[data-p]')!.innerHTML = html;
    }
    let land = 0;
    let life = 0;
    for (let k = 0; k < this.map.elevation.length; k += 7) {
      if (this.map.elevation[k] >= 0) land++;
      life += this.map.vegetation[k];
    }
    const total = this.map.elevation.length / 7;
    this.root.querySelector<HTMLElement>('[data-s]')!.textContent =
      `${this.map.width}×${this.map.height} · terra ${Math.round((land / total) * 100)}% · vegetação ${Math.round((life / total) * 100)}% · 1 ano = ${YEAR_SECONDS / Math.max(1, SPEEDS[this.speed])} s`;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.input.dispose();
    if (this.ready) {
      this.eco.onTileChanged = () => {};
      this.scene.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      this.material.dispose();
      this.texture.dispose();
      this.sprites.dispose();
      this.atlas.dispose();
    }
    this.root.remove();
    this.renderer.setClearColor(0x000000);
    this.renderer.renderLists.dispose();
  }
}
