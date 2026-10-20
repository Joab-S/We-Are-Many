import * as THREE from 'three';
import { mulberry32, seedFor } from '../../core/rng';
import {
  BIOME_NAMES,
  classify,
  paintSurface,
  paintTile,
  tileHash,
  temperatureAt,
  type PlanetParams,
  type SurfaceMap,
} from '../../procgen/surface';
import { BOATS, BUILDING_NAMES, Ecosystem, elderAge, ERAS, isLand, YEAR_SECONDS, type Village } from '../../sim/ecosystem';
import { ORE_COLORS, ORE_NAMES, ORES, STOCK_NAMES, type Ore } from '../../sim/economy';
import { CHILD } from '../../sim/roles';
import { TIER_NAMES } from '../../sim/settlement';
import { nativeSpecies, type Species } from '../../sim/species';
import { Input } from '../input';
import { SoftRenderer, type GameRenderer } from '../renderer';
import type { GameState } from '../state';
import { makeDecorCanvas, ROLE_NAMES, ROLES } from './art';
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

const ORE_ICONS: Record<Ore, string> = { copper: '🟠', tin: '⚪', iron: '🟤', gold: '🟡', coal: '⚫' };

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
  // Minérios: ajuda leve aos povos, que ainda precisam achar o veio e abrir a mina.
  ...ORES.map(
    (ore): Tool => ({
      id: `ore:${ore}`,
      tab: 'terrain',
      label: ORE_NAMES[ore][0].toUpperCase() + ORE_NAMES[ore].slice(1),
      icon: ORE_ICONS[ore],
      mode: 'click',
      act: (ctx, x, y) => ctx.placeOre(x, y, ore),
    }),
  ),
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
  uniform sampler2D uDecor;
  in vec2 vUv;
  out vec4 outColor;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  bool isWater(vec3 c) { return c.b > c.r + 0.25 && c.b > c.g; }

  vec4 at(ivec2 t) {
    t.x = (t.x + int(uMapSize.x)) % int(uMapSize.x);
    t.y = clamp(t.y, 0, int(uMapSize.y) - 1);
    return texelFetch(uMap, t, 0);
  }

  int kindOf(vec4 texel) { return int(texel.a * 255.0 + 0.5) / 16; }

  // Ruído 1D suave ao longo de uma borda entre tiles.
  float edgeNoise(float p, float line) {
    float i = floor(p);
    float u = fract(p);
    return mix(hash(vec2(i, line)), hash(vec2(i + 1.0, line)), u * u * (3.0 - 2.0 * u));
  }

  struct Px { vec4 texel; ivec2 tile; };

  // Pixel de arte global (16 por tile, y para baixo) com bordas orgânicas:
  // a fronteira entre dois tiles diferentes ondula, em vez de formar quadrados.
  Px artPx(ivec2 gp) {
    ivec2 t = ivec2(floor(vec2(gp) / 16.0));
    ivec2 f = gp - t * 16;
    vec4 me = at(t);
    int k = kindOf(me);
    if (k == 15 || k == 7) return Px(me, t);
    int ex = f.x < 8 ? f.x : 15 - f.x;
    int ey = f.y < 8 ? f.y : 15 - f.y;
    bool vertical = ex < ey;
    int e = min(ex, ey);
    if (e >= 4) return Px(me, t);
    ivec2 off = vertical ? ivec2(f.x < 8 ? -1 : 1, 0) : ivec2(0, f.y < 8 ? -1 : 1);
    vec4 nb = at(t + off);
    int nk = kindOf(nb);
    if (nk == 15 || nk == 7) return Px(me, t);
    // Deslocamento da fronteira, igual para os dois lados: positivo empurra para o tile de menor índice.
    float line = vertical ? float(t.x + max(off.x, 0)) * 3.7 + 11.0 : float(t.y + max(off.y, 0)) * 5.3 + 47.0;
    float along = vertical ? float(gp.y) : float(gp.x);
    float d = (edgeNoise(along / 5.0, line) - 0.5) * 9.0;
    bool lowSide = vertical ? off.x > 0 : off.y > 0;
    float push = lowSide ? d : -d;
    if (push > float(e) + 0.5) return Px(nb, t + off);
    return Px(me, t);
  }

  bool waterPx(ivec2 gp) { return isWater(artPx(gp).texel.rgb); }

  void main() {
    vec2 tile = uCenter + (vUv * uResolution - uResolution * 0.5) / uZoom;
    if (tile.y < 0.0 || tile.y >= uMapSize.y) { outColor = vec4(0.02, 0.03, 0.06, 1.0); return; }
    float x = mod(tile.x, uMapSize.x);
    ivec2 t = ivec2(int(x), int(uMapSize.y) - 1 - int(tile.y));
    vec4 texel = texelFetch(uMap, t, 0);
    vec3 c = texel.rgb;
    bool water = isWater(c);
    int kind = kindOf(texel);
    // Posição dentro do tile em pixels de arte (16x16), y para baixo.
    vec2 fp = vec2(fract(x), 1.0 - fract(tile.y)) * 16.0;
    ivec2 f = ivec2(fp);
    if (uZoom >= 3.0) {
      ivec2 gp = t * 16 + f;
      Px px = artPx(gp);
      c = px.texel.rgb;
      water = isWater(c);
      ivec2 pt = px.tile;
      // Variação suave por tile e manchas de 3 px, como as texturas de chão do WorldBox.
      float blot = hash(floor(vec2(gp) / 3.0) + 0.37);
      float grain = hash(vec2(gp) * 1.13);
      c *= 0.95 + 0.1 * hash(vec2(pt));
      if (water) {
        // Água rasa perto da terra, espuma colada na costa e ondinhas.
        bool n = !isWater(at(pt + ivec2(0, -1)).rgb);
        bool s = !isWater(at(pt + ivec2(0, 1)).rgb);
        bool w = !isWater(at(pt + ivec2(-1, 0)).rgb);
        bool e = !isWater(at(pt + ivec2(1, 0)).rgb);
        if (n || s || w || e) c = mix(c, vec3(0.45, 0.78, 0.92), 0.3);
        c *= 0.97 + 0.05 * blot;
        if (uZoom >= 4.0) {
          bool shore = !waterPx(gp + ivec2(1, 0)) || !waterPx(gp - ivec2(1, 0)) || !waterPx(gp + ivec2(0, 1)) || !waterPx(gp - ivec2(0, 1));
          if (shore) c = mix(c, vec3(0.93, 0.97, 1.0), 0.6);
          else if (!waterPx(gp + ivec2(2, 0)) || !waterPx(gp - ivec2(2, 0)) || !waterPx(gp + ivec2(0, 2)) || !waterPx(gp - ivec2(0, 2))) c = mix(c, vec3(0.6, 0.86, 0.95), 0.35);
          float wave = mod(float(gp.x) + float(gp.y) * 3.0 + floor(uTime * 3.0), 23.0);
          if (wave < 2.0 && hash(vec2(pt) + floor(uTime * 0.5)) > 0.55) c += 0.06;
        }
      } else {
        bool green = c.g > c.r && c.g > c.b * 1.1;
        bool sand = c.r > 0.55 && c.r >= c.g && c.g > c.b + 0.08;
        if (green) {
          // Grama: manchas claras e escuras e alguns fios.
          c *= 0.88 + 0.22 * blot;
          if (grain > 0.92) c *= 1.12;
          else if (grain < 0.06) c *= 0.8;
        } else if (sand) {
          // Areia: grãos escuros e claros espalhados.
          c *= 0.95 + 0.08 * blot;
          if (grain > 0.94) c *= 0.84;
          else if (grain < 0.05) c *= 1.08;
        } else {
          c *= 0.92 + 0.14 * blot + 0.04 * grain;
        }
        if (uZoom >= 4.0) {
          // Areia molhada na beira d'água e barranco quando a água fica ao sul.
          if (waterPx(gp + ivec2(0, 1)) || waterPx(gp + ivec2(0, 2))) c *= 0.62;
          else if (waterPx(gp + ivec2(1, 0)) || waterPx(gp - ivec2(1, 0)) || waterPx(gp - ivec2(0, 1))) c *= 0.85;
        }
      }
      texel = px.texel;
    }
    if (uZoom >= 5.0 && kind > 0 && kind <= 7) {
      // Arte 16x16 do enfeite (art.ts): alfa cheio é cor, alfa parcial é sombra.
      vec4 d = texelFetch(uDecor, ivec2((kind - 1) * 16 + f.x, f.y), 0);
      if (d.a > 0.9) c = d.rgb * (0.94 + 0.12 * hash(vec2(t) + 7.0));
      else if (d.a > 0.2) c *= 0.62;
    } else if (uZoom >= 5.0 && kind == 0 && !water && texel.g > texel.r && texel.g > texel.b * 1.1) {
      // Tufos de grama e flores nos tiles verdes sem enfeite.
      float h = hash(vec2(t) + 3.1);
      ivec2 p = ivec2(3 + int(hash(vec2(t) + 1.7) * 10.0), 5 + int(hash(vec2(t) + 2.3) * 9.0));
      if (h < 0.4) {
        ivec2 d = f - p;
        if ((d.y == 0 && abs(d.x) <= 1 && d.x != 0) || (d.y == -1 && d.x == 0) || (d.y == -1 && abs(d.x) == 2)) c *= 0.72;
        if (d.y == -2 && abs(d.x) == 1) c *= 0.8;
      }
      if (h > 0.9) {
        ivec2 d = f - p + ivec2(4, 3);
        vec3 petals[4] = vec3[4](vec3(1.0, 0.95, 0.85), vec3(1.0, 0.85, 0.25), vec3(0.95, 0.5, 0.7), vec3(0.9, 0.3, 0.25));
        vec3 petal = petals[int(hash(vec2(t) + 9.0) * 4.0)];
        if (d == ivec2(0, 0)) c = petal;
        else if (abs(d.x) + abs(d.y) == 1 && d.y <= 0) c = mix(c, petal, 0.55);
        else if (d.x == 0 && d.y == 1) c *= 0.7;
      }
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
  private decorCanvas!: HTMLCanvasElement;
  private decorTexture!: THREE.CanvasTexture;
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
    private readonly renderer: GameRenderer,
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
    for (let i = 0; i < eco.road.length; i++) if (eco.road[i] || eco.built[i]) this.paintSettlement(i);
    this.texture = new THREE.DataTexture(this.pixels, map.width, map.height);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.needsUpdate = true;
    this.center.set(map.width / 2, map.height / 2);
    this.zoom = Math.max(1, window.innerHeight / map.height);
    this.decorCanvas = makeDecorCanvas();
    this.decorTexture = new THREE.CanvasTexture(this.decorCanvas);
    this.decorTexture.flipY = false;
    this.decorTexture.magFilter = THREE.NearestFilter;
    this.decorTexture.minFilter = THREE.NearestFilter;
    this.decorTexture.generateMipmaps = false;

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
        uDecor: { value: this.decorTexture },
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
    // `?debug` deixa a cena acessível no console (testes e calibragem).
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { surface: SurfaceMode }).surface = this;
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
        icon: { fish: '🐟', predator: '🐺', shark: '🦈', herbivore: '🦌', sapient: '' }[sp.kind],
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
    if (!born && !this.eco.log[0]?.startsWith('Muito perto')) this.eco.log.unshift(`${sp.name}: o lugar não é habitável`);
  }

  placeOre(x: number, viewY: number, ore: Ore): void {
    if (!this.eco.placeOre(x, this.toRow(viewY), ore)) this.eco.log.unshift('Aqui não dá para colocar minério');
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
    if (this.eco.road[i] || this.eco.built[i]) this.paintSettlement(i);
    this.textureChanged = true;
  }

  /** Ruas, praça e terreno das casas por cima do terreno, sem enfeites. */
  private paintSettlement(i: number): void {
    if (!isLand(this.map, i)) return;
    const o = i * 4;
    const px = this.pixels;
    const road = this.eco.road[i];
    const n = tileHash(i) * 0.12 - 0.06;
    let c: [number, number, number] | null = null;
    if (road === 1) c = [146, 112, 74];
    else if (road === 2) c = (i + Math.floor(i / this.map.width)) % 2 ? [150, 150, 158] : [128, 128, 138];
    else if (road === 3) c = [178, 148, 104];
    else if (road === 4) c = [122, 86, 48];
    if (c) {
      px[o] = clamp(c[0] * (1 + n), 0, 255);
      px[o + 1] = clamp(c[1] * (1 + n), 0, 255);
      px[o + 2] = clamp(c[2] * (1 + n), 0, 255);
    } else {
      // Quintal: o chão sob a casa fica um pouco mais seco.
      px[o] = clamp(px[o] * 1.05 + 10, 0, 255);
      px[o + 1] = clamp(px[o + 1] * 0.98, 0, 255);
    }
    // Plantação leva o enfeite de trigo (7); ruas e casas, o 15 (nem enfeite nem grama).
    px[o + 3] = road === 4 ? 7 * 16 + 15 : 255;
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
    if (this.renderer instanceof SoftRenderer) {
      this.renderSoft(this.renderer.context, size.x, size.y, this.zoom * pr);
      this.updateLabels();
      return;
    }
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

  private softCanvas: HTMLCanvasElement | null = null;
  private softImage: ImageData | null = null;
  private softVersion = -1;

  /**
   * Desenho sem WebGL: o mapa vira um canvas de um pixel por tile, ampliado
   * sem suavização; os sprites são desenhados por cima. Sem os enfeites por
   * tile nem o brilho da água, que dependem do shader.
   */
  private renderSoft(ctx: CanvasRenderingContext2D, w: number, h: number, z: number): void {
    const map = this.map;
    const mw = map.width;
    const mh = map.height;
    if (!this.softCanvas) {
      this.softCanvas = document.createElement('canvas');
      this.softCanvas.width = mw;
      this.softCanvas.height = mh;
      this.softImage = new ImageData(mw, mh);
    }
    if (this.softVersion !== this.texture.version) {
      this.softVersion = this.texture.version;
      const out = this.softImage!.data;
      const src = this.pixels;
      for (let i = 0; i < out.length; i += 4) {
        out[i] = src[i];
        out[i + 1] = src[i + 1];
        out[i + 2] = src[i + 2];
        out[i + 3] = 255;
      }
      this.softCanvas.getContext('2d')!.putImageData(this.softImage!, 0, 0);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false;
    // Canto superior esquerdo do mapa na tela; o mapa se repete na horizontal.
    const top = h / 2 - (mh - this.center.y) * z;
    const x0 = this.center.x - w / 2 / z;
    const x1 = this.center.x + w / 2 / z;
    for (let copy = Math.floor(x0 / mw); copy * mw < x1; copy++) {
      const a = Math.max(x0, copy * mw);
      const b = Math.min(x1, (copy + 1) * mw);
      const sa = Math.floor(a - copy * mw);
      const sb = Math.min(mw, Math.ceil(b - copy * mw));
      if (sb <= sa) continue;
      const dx = (copy * mw + sa - this.center.x) * z + w / 2;
      ctx.drawImage(this.softCanvas, sa, 0, sb - sa, mh, dx, top, (sb - sa) * z, mh * z);
    }
    if (z >= 5) {
      // Enfeites (árvores, pedras) com a mesma arte do shader.
      const r0 = Math.max(0, Math.floor(mh - this.center.y - h / 2 / z));
      const r1 = Math.min(mh - 1, Math.ceil(mh - this.center.y + h / 2 / z));
      const c0 = Math.floor(x0);
      const c1 = Math.ceil(x1);
      const size = Math.ceil(z);
      for (let row = r0; row <= r1; row++) {
        const sy = top + row * z;
        for (let col = c0; col <= c1; col++) {
          const i = row * mw + (((col % mw) + mw) % mw);
          const kind = this.pixels[i * 4 + 3] >> 4;
          if (kind < 1 || kind > 7) continue;
          ctx.drawImage(this.decorCanvas, (kind - 1) * 16, 0, 16, 16, Math.floor((col - this.center.x) * z + w / 2), Math.floor(sy), size, size);
        }
      }
    }
    this.drawSprites(w, h, z);
    this.sprites.drawSoft(ctx, h);
    if (this.tool && this.hover.x > -1e5) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = Math.max(1, z * 0.15);
      ctx.beginPath();
      ctx.arc((this.hover.x - this.center.x) * z + w / 2, h / 2 - (this.hover.y - this.center.y) * z, this.brush * z, 0, Math.PI * 2);
      ctx.stroke();
    }
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
    const buildings: { sprite: SpriteName; sx: number; sy: number; h: number; tint: readonly number[] }[] = [];
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      const era = Math.floor(v.tech);
      // Uma casa por era; cidades medievais já têm sobrados.
      const style =
        era >= 4 || (era >= 3 && v.tier >= 2) ? 'townhouse' : era >= 3 ? 'stoneHouse' : era >= 2 ? 'house' : era >= 1 ? 'cottage' : 'hut';
      for (const house of v.houses) {
        if (house.kind === 'port') {
          // O píer fica virado para a água (variante 1: água a oeste).
          const [px, py] = this.toScreen(house.x + 0.5, house.y + 1.1, z, w, h);
          if (px < -margin || px > w + margin || py < -margin || py > h + margin) continue;
          buildings.push({ sprite: 'port', sx: px, sy: py, h: z * 1.4, tint: v.color });
          continue;
        }
        const [sx, sy] = this.toScreen(house.x + 1, house.y + 2, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        const sprite = house.kind !== 'house' ? house.kind : house.variant ? `${style}:${house.variant}` : style;
        buildings.push({ sprite, sx, sy, h: Math.max(3, z * 2), tint: v.color });
      }
      if (!small) {
        const [fx, fy] = this.toScreen(v.x, v.y + 1.5, z, w, h);
        const capital = v.kingdom === v.id && eco.kingdomSize(v) > 1;
        if (v.tier >= 2) buildings.push({ sprite: capital ? 'castle' : 'keep', sx: fx, sy: fy, h: z * (capital ? 2 : 2.6), tint: v.color });
        else if (era >= 1) buildings.push({ sprite: 'well', sx: fx, sy: fy, h: z * 1.3, tint: v.color });
        else buildings.push({ sprite: 'bonfire', sx: fx, sy: fy, h: z * 1.1, tint: v.color });
      }
    }
    // Jazidas: caverna, veio ou mina, com pontos na cor do minério.
    if (!small) {
      for (const d of eco.deposits) {
        if (d.amount <= 0) continue;
        const [sx, sy] = this.toScreen(d.x + 0.5, d.y + 1, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        const sprite = d.mine >= 0 ? 'mine' : d.cave ? 'cave' : 'vein';
        const rows = { mine: 11, cave: 8, vein: 6 }[sprite];
        buildings.push({ sprite, sx, sy, h: (rows * z) / 8, tint: ORE_COLORS[d.ore] });
      }
    }
    // De cima para baixo, para as construções da frente cobrirem as de trás.
    buildings.sort((a, b) => b.sy - a.sy);
    for (const b of buildings) layer.push(b.sprite, b.sx, b.sy, b.h, b.tint);
    // Barcos com a cor do reino; destroços ficam boiando um pouco depois do naufrágio.
    const px = (z * 1.05) / 9;
    for (const b of eco.boats) {
      const [sx, sy] = this.toScreen(b.x, b.y, z, w, h);
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
      const tint = eco.villages[b.village].color;
      if (small) {
        layer.push('dot', sx, sy, Math.max(2, z), tint);
        continue;
      }
      const name = b.sunk >= 0 ? 'wreck' : BOATS[b.kind].sprite;
      const rows = { wreck: 4, canoe: 7, rowboat: 8, sailboat: 15, caravel: 17, steamship: 14 }[name] ?? 8;
      const bob = Math.sin((performance.now() / 1000) * 2 + b.x) * px * 0.6;
      layer.push(b.sunk < 0 && b.facing < 0 ? `${name}:l` : name, sx, sy - z * 0.4 + bob, rows * px, tint, tint);
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
      if (sp.kind === 'sapient') {
        // Aparência pela profissão e pela idade; a pele de espécies alienígenas é a cor da espécie.
        const body = sp.origin === 'sol-3' ? 'human' : 'alien';
        const role = vi >= 0 ? eco.role[i] : 0;
        const era = vi >= 0 ? Math.floor(eco.villages[vi].tech) : 0;
        if (role === CHILD) {
          layer.push(`${body}:child`, sx, sy - z * 0.5, z * 1.05 * (6 / 9), tint, sp.color);
          continue;
        }
        const elder = eco.age[i] >= elderAge(sp, era) && role < ROLES.indexOf('leader');
        layer.push(`${body}:${elder ? 'elder' : ROLES[role]}`, sx, sy - z * 0.5, z * 1.05 * (11 / 9), tint, sp.color);
        continue;
      }
      const name: SpriteName = { fish: 'fish', herbivore: 'herbivore', predator: 'predator', shark: 'shark' }[sp.kind];
      const height = sp.kind === 'fish' ? 0.5 : sp.kind === 'shark' ? 0.55 : 0.85;
      const flipped = sp.kind === 'shark' && eco.vx[i] < 0 ? `${name}:l` : name;
      layer.push(flipped, sx, sy - z * 0.5, z * height, tint);
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
      const text =
        v.kingdom === v.id && this.eco.kingdomSize(v) > 1
          ? `♛ Reino de ${v.name} · ${v.population}`
          : `${TIER_NAMES[v.tier]} ${v.name} · ${v.population}`;
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

  /** Nome da construção, rua ou plantação no tile, se houver. */
  private placeAt(i: number): string | null {
    const dep = this.eco.depositAt[i];
    if (dep >= 0 && this.eco.deposits[dep].amount > 0) {
      const d = this.eco.deposits[dep];
      const what = d.mine >= 0 ? `Mina de ${ORE_NAMES[d.ore]} · ${this.eco.villages[d.mine].name}` : `${d.cave ? 'Caverna com' : 'Veio de'} ${ORE_NAMES[d.ore]}`;
      return `${what} · restam ${Math.ceil(d.amount)} de ${d.initial}`;
    }
    const road = this.eco.road[i];
    if (road === 4) return 'Plantação';
    if (road === 3) return 'Praça';
    if (road) return 'Rua';
    if (!this.eco.built[i]) return null;
    const w = this.map.width;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const v of this.eco.villages) {
      for (const h of v.houses) {
        const size = h.kind === 'port' ? 0 : 1;
        if (y >= h.y && y <= h.y + size && (x - h.x + w) % w <= size) return `${BUILDING_NAMES[h.kind]} · ${v.name}`;
      }
    }
    return null;
  }

  /** Resumo do assentamento sob o mouse: reino, povo, estoque, o que falta para a próxima era e guerra. */
  private settlementInfo(v: Village): string {
    const eco = this.eco;
    const capital = eco.capitalOf(v);
    const st = eco.store(v);
    const stock = STOCK_NAMES.filter(([k]) => st[k] >= 1).map(([k, name]) => `${name} ${Math.floor(st[k])}`).join(' · ');
    const need = eco.eraNeed(v);
    const war = eco.warOf(v.kingdom);
    const enemy = war ? eco.villages[war.a === v.kingdom ? war.b : war.a].name : '';
    const c = v.culture;
    return `
      <b>${TIER_NAMES[v.tier]} ${v.name}${capital !== v ? ` · Reino de ${capital.name}` : ''}</b>
      <span>Povo ${c.name} · valoriza ${c.value} · crê n${c.belief.startsWith('a') ? 'a' : 'o'}${c.belief.startsWith('os') || c.belief.startsWith('as') ? 's' : ''} ${c.belief.split(' ').slice(1).join(' ')}</span>
      ${stock ? `<span>${stock}</span>` : ''}
      ${need ? `<span>Para a próxima era: ${need}</span>` : ''}
      ${war ? `<span>⚔ Em guerra com ${enemy}</span>` : ''}
      <hr>`;
  }

  /** Profissão, ou a fase da vida de quem não trabalha. */
  private lifeStage(i: number): string {
    const eco = this.eco;
    const role = eco.role[i];
    if (role === CHILD) return 'Criança';
    const sp = eco.species[eco.kind[i]];
    const v = eco.villages[eco.village[i]];
    const name = ROLE_NAMES[ROLES[role]];
    return eco.age[i] >= elderAge(sp, Math.floor(v.tech)) ? (role >= ROLES.indexOf('leader') ? `${name} idoso` : 'Idoso') : name;
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
        <b>${sp.name}${v ? ` · ${this.lifeStage(picked)}` : ''}</b>
        ${v ? `<span>${TIER_NAMES[v.tier]} ${v.name} · ${ERAS[Math.floor(v.tech)]}</span>` : ''}
        ${v && v.kingdom !== v.id ? `<span>Reino de ${this.eco.capitalOf(v).name}</span>` : ''}
        <span>Idade ${this.eco.age[picked].toFixed(0)} anos</span>
        <span>Energia ${(this.eco.energy[picked] * 100).toFixed(0)}%</span>`;
    } else {
      const t = temperatureAt(this.map, i);
      const place = this.placeAt(i);
      const v = this.eco.settlementAt(this.hover.x, this.toRow(this.hover.y));
      html = `
        ${v ? this.settlementInfo(v) : ''}
        <b>${place ?? BIOME_NAMES[this.map.biome[i] as keyof typeof BIOME_NAMES]}</b>
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

  /** Quanto falta para a próxima era no assentamento mais avançado. */
  private progressLine(live: { tech: number }[]): string {
    if (!live.length) return '';
    const top = Math.max(...live.map((v) => v.tech));
    const era = Math.floor(top);
    if (era >= ERAS.length - 1) return '<div class="wb-year">Última era conhecida</div>';
    return `<div class="wb-year">Rumo à ${ERAS[era + 1]}: ${Math.floor((top - era) * 100)}%</div>`;
  }

  /** Painel lateral: ano, era, velocidade do tempo, população por espécie e acontecimentos. */
  private updatePanel(): void {
    const eco = this.eco;
    const live = eco.villages.filter((v) => !v.abandoned);
    const kingdoms = live.filter((v) => v.kingdom === v.id && eco.kingdomSize(v) > 1).length;
    const era = live.length ? ERAS[Math.floor(Math.max(...live.map((v) => v.tech)))] : 'Sem civilização';
    const rows = eco.species
      .map((sp, s) => `<div class="wb-pop"><i style="background:rgb(${sp.color.join(',')})"></i>${sp.name}<b>${eco.population[s]}</b></div>`)
      .join('');
    const html = `
      <div class="wb-era">${era}</div>
      ${this.progressLine(live)}
      <div class="wb-year">Ano ${Math.floor(eco.year)}</div>
      <div class="wb-speed">${SPEEDS.map((v, k) => `<button data-speed="${k}" class="${k === this.speed ? 'on' : ''}">${v === 0 ? 'II' : `${v}x`}</button>`).join('')}</div>
      <div class="wb-section">População</div>
      ${rows || '<div class="wb-empty">Nenhuma espécie. Leve uma pela aba Vida.</div>'}
      <div class="wb-pop">Assentamentos<b>${live.length}</b></div>
      ${kingdoms ? `<div class="wb-pop">Reinos<b>${kingdoms}</b></div>` : ''}
      ${eco.wars.length ? `<div class="wb-section">Guerras</div>${eco.wars.map((war) => `<div class="wb-log">⚔ ${eco.villages[war.a].name} × ${eco.villages[war.b].name} · ${war.losses[0] + war.losses[1]} mortos</div>`).join('')}` : ''}
      ${eco.boats.length ? `<div class="wb-pop">Barcos no mar<b>${eco.boats.filter((b) => b.sunk < 0).length}</b></div>` : ''}
      ${[...live].sort((a, b) => b.population - a.population).slice(0, 6).map((v) => `<button class="wb-goto" data-village="${v.id}"><i style="background:rgb(${v.color.join(',')})"></i>${TIER_NAMES[v.tier]} ${v.name}<b>${v.population}</b></button>`).join('')}
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
      this.decorTexture.dispose();
      this.sprites.dispose();
      this.atlas.dispose();
    }
    this.root.remove();
    this.renderer.setClearColor(0x000000);
    this.renderer.renderLists.dispose();
  }
}
