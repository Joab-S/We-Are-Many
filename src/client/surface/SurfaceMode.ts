import * as THREE from 'three';
import { seedFor } from '../../core/rng';
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
import { BOATS, BUILDING_NAMES, Ecosystem, elderAge, ERAS, HERD_NAMES, isLand, YEAR_SECONDS, type ChronicleKind, type Village } from '../../sim/ecosystem';
import { NEED_NAMES, NEEDS, SEASONS, VOCATION_COLORS, VOCATION_ICONS, VOCATION_NAMES, welfare } from '../../sim/needs';
import { ORE_COLORS, ORE_NAMES, ORES, STOCK_NAMES, WONDER_NAMES, type Ore } from '../../sim/economy';
import { QUIET_YEARS, runEvent, runRandomEvent, WORLD_EVENT_NAMES, type WorldEvent } from '../../sim/events';
import { CATEGORIES, ITEMS, MATERIALS } from '../../sim/items';
import { CHILD } from '../../sim/roles';
import { TIER_NAMES } from '../../sim/settlement';
import { earthCatalog, EARTH_ID, habitatOf, nativeSpecies, type Species } from '../../sim/species';
import { Input } from '../input';
import { SoftRenderer, type GameRenderer } from '../renderer';
import type { GameState } from '../state';
import { BODY_NAMES, makeDecorCanvas, ROLE_NAMES, ROLES, SPRITES } from './art';
import { generateSurfaceAsync } from './generateAsync';
import { SoftArt } from './softArt';
import { SpriteAtlas, SpriteLayer, type SpriteName } from './sprites';
import { animalStage, DEATH_TEXT, familyName, personName } from '../../sim/people';
import { AVENUE, CREST_EMBLEMS, CREST_SHAPES, GRAVEL, houseStyle } from '../../sim/architecture';
import { CURRENCY_NAMES } from '../../sim/trade';
import { bar, compareHtml, economicState, fullName, ROLE_ICONS, SETTLEMENT_TABS, settlementTabHtml, stateIcons, type CompareKey, type SettlementTab } from './settlementWindow';

/** Raio de escolha de criaturas em pixels de tela, igual em qualquer zoom (RF-VIDA-330). */
const PICK_RADIUS_PX = 10;
/** Atualizações por segundo da janela do assentamento (RF-VIDA-341). */
const VWIN_HZ = 4;

/** Modo de depuração (`?debug` no endereço): mostra as taxas do momento nos painéis (RF-VIDA-310). */
const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

type Tab = 'terrain' | 'climate' | 'life' | 'civ' | 'events';

const TABS: [Tab, string][] = [
  ['terrain', '⛰ Terreno'],
  ['climate', '☁ Clima'],
  ['life', '🌿 Vida'],
  ['civ', '🏛 Civilização'],
  ['events', '☄ Eventos'],
];

/** Ajustes do jogador que as ferramentas de clima leem: temperatura alvo (K) e se ela vale como limite. */
interface ToolOpts {
  target: number;
  limit: boolean;
}

type FxKind = 'heat' | 'cool' | 'snow' | 'thaw' | 'rain' | 'dry' | 'rise' | 'sink' | 'sea' | 'flatten' | 'sand' | 'grow' | 'clear' | 'demolish';

/** Partícula da animação do pincel, em coordenadas do mapa (y para o norte, como a vista). */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  kind: 'ember' | 'flake' | 'streak' | 'dust' | 'drop' | 'ring' | 'spark' | 'chunk';
  size: number;
  rgb: [number, number, number];
}

/** Cor do brilho de cada animação e o que ela solta (tipo, cor, direção, velocidade em tiles/s). */
const FX: Record<FxKind, { glow: [number, number, number, number]; kind: Particle['kind']; rgb: [number, number, number]; vx: number; vy: number; spread: number; size: number }> = {
  heat: { glow: [255, 110, 30, 0.28], kind: 'ember', rgb: [255, 170, 50], vx: 0, vy: 2.2, spread: 0.8, size: 0.14 },
  cool: { glow: [90, 170, 255, 0.26], kind: 'flake', rgb: [225, 242, 255], vx: 0.2, vy: -1, spread: 0.4, size: 0.14 },
  snow: { glow: [210, 225, 245, 0.3], kind: 'flake', rgb: [255, 255, 255], vx: 0.5, vy: -1.6, spread: 0.5, size: 0.17 },
  thaw: { glow: [255, 190, 90, 0.2], kind: 'drop', rgb: [110, 180, 255], vx: 0, vy: -1.8, spread: 0.2, size: 0.12 },
  rain: { glow: [50, 80, 140, 0.3], kind: 'streak', rgb: [150, 200, 255], vx: -0.9, vy: -7, spread: 0.3, size: 0.4 },
  dry: { glow: [240, 200, 90, 0.26], kind: 'dust', rgb: [236, 206, 120], vx: 2, vy: 0.3, spread: 0.6, size: 0.3 },
  rise: { glow: [150, 110, 70, 0.22], kind: 'dust', rgb: [150, 112, 74], vx: 0, vy: 1.6, spread: 1, size: 0.3 },
  sink: { glow: [90, 70, 50, 0.22], kind: 'chunk', rgb: [110, 84, 58], vx: 0, vy: -2.4, spread: 0.5, size: 0.2 },
  sea: { glow: [40, 110, 200, 0.28], kind: 'ring', rgb: [180, 220, 255], vx: 0, vy: 0, spread: 0, size: 0.2 },
  flatten: { glow: [160, 160, 160, 0.2], kind: 'dust', rgb: [190, 190, 190], vx: 1.2, vy: 0, spread: 0.2, size: 0.22 },
  sand: { glow: [230, 200, 130, 0.24], kind: 'dust', rgb: [226, 196, 128], vx: 1.6, vy: 0.4, spread: 0.7, size: 0.26 },
  grow: { glow: [70, 190, 80, 0.24], kind: 'spark', rgb: [140, 240, 120], vx: 0, vy: 1.4, spread: 0.6, size: 0.18 },
  clear: { glow: [190, 190, 170, 0.22], kind: 'dust', rgb: [200, 196, 180], vx: 0.4, vy: 0.8, spread: 0.9, size: 0.3 },
  demolish: { glow: [150, 100, 70, 0.26], kind: 'chunk', rgb: [150, 112, 80], vx: 0, vy: 1.2, spread: 1.2, size: 0.24 },
};

interface Tool {
  id: string;
  tab: Tab;
  /** Subtítulo dentro da aba (ex.: Minérios, Água, Costa). */
  group?: string;
  label: string;
  /** Emoji, ou um sprite (`sprite:nome` pintado com `tint`). */
  icon: string;
  tint?: readonly number[];
  skin?: readonly number[];
  /** Explicação curta, mostrada acima da barra. */
  tip: string;
  /** Pincel contínuo enquanto o botão está apertado, ou um clique por vez. */
  mode: 'brush' | 'click';
  apply?(map: SurfaceMap, i: number, strength: number, opts: ToolOpts): void;
  /** Animação do pincel enquanto a ferramenta age (partículas e brilho sobre o mapa). */
  fx?: FxKind;
  act?(ctx: SurfaceMode, x: number, y: number): void;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const ORE_ICONS: Record<Ore, string> = { copper: '🟠', tin: '⚪', iron: '🟤', gold: '🟡', coal: '⚫' };

/** Sprite e cor de cada animal de rebanho. */
const HERD_SPRITES: Record<string, string> = { sheep: 'sheep', cattle: 'cow', goat: 'goat', horse: 'horse', camel: 'camel' };
/** Toldos das barracas da feira. */
const STALL_TINTS: [number, number, number][] = [
  [214, 64, 52],
  [52, 110, 220],
  [232, 196, 56],
  [64, 168, 80],
  [148, 72, 200],
];
const HERD_TINT: Record<string, [number, number, number]> = { sheep: [238, 234, 222], cattle: [150, 96, 62], goat: [196, 176, 146], horse: [128, 82, 48], camel: [204, 164, 104] };

/** Ferramentas de terraformação e clima (RF-SUP-06). */
const TERRAIN_TOOLS: Tool[] = [
  { id: 'raise', fx: 'rise', tab: 'terrain', label: 'Elevar', icon: '⛰', tip: 'Levanta o chão aos poucos: do mar nasce terra, da terra, morros.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] + 0.02 * s, -1, 1)) },
  { id: 'lower', fx: 'sink', tab: 'terrain', label: 'Rebaixar', icon: '⛏', tip: 'Abaixa o chão aos poucos: vales, lagos e, no fim, mar.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] - 0.02 * s, -1, 1)) },
  { id: 'mountain', fx: 'rise', tab: 'terrain', label: 'Montanha', icon: '🏔', tip: 'Ergue serras de rocha rapidamente.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = clamp(m.elevation[i] + 0.06 * s, -1, 0.95)) },
  { id: 'sea', fx: 'sea', tab: 'terrain', label: 'Mar', icon: '🌊', tip: 'Afunda a terra até virar mar raso.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] = Math.max(-0.3, m.elevation[i] - 0.06 * s)) },
  { id: 'flatten', fx: 'flatten', tab: 'terrain', label: 'Nivelar', icon: '▭', tip: 'Aplaina o terreno para perto do nível de planície.', mode: 'brush', apply: (m, i, s) => (m.elevation[i] += (0.12 - m.elevation[i]) * Math.min(1, 0.05 * s)) },
  { id: 'sand', fx: 'sand', tab: 'terrain', label: 'Areia', icon: '🏜', tip: 'Seca o solo: vira praia ou deserto.', mode: 'brush', apply: (m, i, s) => { m.moisture[i] = clamp(m.moisture[i] - 0.05 * s, 0, 1); m.vegetation[i] = clamp(m.vegetation[i] - 0.05 * s, 0, 1); } },
  { id: 'lake', fx: 'sea', tab: 'terrain', label: 'Lago', icon: '🏞', tip: 'Cava um lago raso, de margem suave, e umedece a terra em volta.', mode: 'brush', apply: (m, i, s) => { m.elevation[i] = Math.max(-0.12, m.elevation[i] - 0.05 * s); m.moisture[i] = clamp(m.moisture[i] + 0.02 * s, 0, 1); } },
  { id: 'clear', fx: 'clear', tab: 'terrain', group: 'Remover', label: 'Limpar', icon: '🧹', tip: 'Tira árvores, pedras, cactos, ruínas e veios de minério do pincel. A madeira, a pedra e o minério vão para o assentamento mais perto.', mode: 'brush', act: (ctx, x, y) => ctx.clearNature(x, y) },
  { id: 'demolish', fx: 'demolish', tab: 'terrain', group: 'Remover', label: 'Demolir', icon: '🧱', tip: 'Derruba casas, prédios, ruas, roças e pastos do pincel. Parte do material volta ao estoque; o povo reconstrói se precisar.', mode: 'brush', act: (ctx, x, y) => ctx.demolish(x, y) },
  // Minérios: ajuda leve aos povos, que ainda precisam achar o veio e abrir a mina.
  ...ORES.map(
    (ore): Tool => ({
      id: `ore:${ore}`,
      tab: 'terrain',
      group: 'Minérios',
      label: ORE_NAMES[ore][0].toUpperCase() + ORE_NAMES[ore].slice(1),
      icon: ORE_ICONS[ore],
      tip: `Coloca um veio de ${ORE_NAMES[ore]}. Os povos só usam depois de achá-lo e abrir uma mina.`,
      mode: 'click',
      act: (ctx, x, y) => ctx.placeOre(x, y, ore),
    }),
  ),
  {
    id: 'heat',
    fx: 'heat',
    tab: 'climate',
    label: 'Aquecer',
    icon: '🔥',
    tip: 'Esquenta a região (derrete gelo, seca, e no extremo vira lava). Com o limite ligado, para na temperatura alvo.',
    mode: 'brush',
    apply: (m, i, s, o) => {
      const t = temperatureAt(m, i);
      if (o.limit && t >= o.target) return;
      const step = o.limit ? Math.min(1.5 * s, o.target - t) : 1.5 * s;
      m.heat[i] = clamp(m.heat[i] + step, -150, 400);
    },
  },
  {
    id: 'cool',
    fx: 'cool',
    tab: 'climate',
    label: 'Resfriar',
    icon: '❄',
    tip: 'Esfria a região (neve, tundra e gelo no mar). Com o limite ligado, para na temperatura alvo.',
    mode: 'brush',
    apply: (m, i, s, o) => {
      const t = temperatureAt(m, i);
      if (o.limit && t <= o.target) return;
      const step = o.limit ? Math.min(1.5 * s, t - o.target) : 1.5 * s;
      m.heat[i] = clamp(m.heat[i] - step, -150, 400);
    },
  },
  {
    id: 'adjust',
    fx: 'heat',
    tab: 'climate',
    label: 'Ajustar',
    icon: '🌡',
    tip: 'Leva a temperatura da região, para cima ou para baixo, até a temperatura alvo e para ali.',
    mode: 'brush',
    apply: (m, i, s, o) => {
      const gap = o.target - temperatureAt(m, i);
      m.heat[i] = clamp(m.heat[i] + clamp(gap, -2 * s, 2 * s), -150, 400);
    },
  },
  {
    id: 'snow',
    fx: 'snow',
    tab: 'climate',
    label: 'Nevar',
    icon: '🌨',
    tip: 'Faz nevar: esfria só até a neve pegar (cerca de -15 °C) e umedece o solo, sem congelar além disso.',
    mode: 'brush',
    apply: (m, i, s) => {
      const t = temperatureAt(m, i);
      if (t > 258) m.heat[i] = clamp(m.heat[i] - Math.min(2 * s, t - 258), -150, 400);
      m.moisture[i] = clamp(m.moisture[i] + 0.02 * s, 0, 1);
    },
  },
  {
    id: 'thaw',
    fx: 'thaw',
    tab: 'climate',
    label: 'Degelo',
    icon: '💧',
    tip: 'Derrete neve e gelo: esquenta só o que está congelado, até cerca de 5 °C, sem ressecar o resto.',
    mode: 'brush',
    apply: (m, i, s) => {
      const t = temperatureAt(m, i);
      if (t < 278) m.heat[i] = clamp(m.heat[i] + Math.min(2 * s, 278 - t), -150, 400);
    },
  },
  { id: 'rain', fx: 'rain', tab: 'climate', label: 'Chuva', icon: '🌧', tip: 'Deixa o clima mais úmido: a mata cresce melhor.', mode: 'brush', apply: (m, i, s) => (m.moisture[i] = clamp(m.moisture[i] + 0.04 * s, 0, 1)) },
  { id: 'dry', fx: 'dry', tab: 'climate', label: 'Secar', icon: '☀', tip: 'Deixa o clima mais seco.', mode: 'brush', apply: (m, i, s) => (m.moisture[i] = clamp(m.moisture[i] - 0.04 * s, 0, 1)) },
  { id: 'plant', fx: 'grow', tab: 'climate', label: 'Semear vida', icon: '🌱', tip: 'Espalha vegetação, que depois se espalha sozinha onde o clima deixa.', mode: 'brush', apply: (m, i, s) => (m.vegetation[i] = clamp(m.vegetation[i] + 0.06 * s, 0, 1)) },
  { id: 'forest', fx: 'grow', tab: 'climate', label: 'Floresta', icon: '🌳', tip: 'Planta mata fechada e umedece o solo.', mode: 'brush', apply: (m, i, s) => { m.vegetation[i] = clamp(m.vegetation[i] + 0.15 * s, 0, 1); m.moisture[i] = clamp(m.moisture[i] + 0.02 * s, 0, 1); } },
];

/** Eventos que o jogador pode provocar (aba Eventos). */
const EVENT_TOOLS: Tool[] = (
  [
    ['comet', '☄', 'Um cometa cai onde você clicar: cratera, lago e minério do espaço.'],
    ['quake', '〰', 'Uma falha corta o chão: um lado sobe, o outro afunda; casas perto caem.'],
    ['volcano', '🌋', 'Um vulcão nasce: o chão sobe, a lava escorre e esfria em rocha.'],
    ['island', '🏝', 'Um vulcão no mar ergue uma ilha nova.'],
    ['fire', '🔥', 'Fogo na mata: queima a floresta em volta.'],
    ['drought', '🏜', 'Seca numa região grande: a vegetação murcha por um tempo.'],
  ] as [WorldEvent, string, string][]
).map(([ev, icon, tip]) => ({
  id: `event:${ev}`,
  tab: 'events' as Tab,
  label: WORLD_EVENT_NAMES[ev],
  icon,
  tip,
  mode: 'click' as const,
  act: (ctx: SurfaceMode, x: number, y: number) => ctx.trigger(ev, x, y),
}));

type Win = 'chronicle' | 'kingdoms' | 'settlements' | 'species' | 'items' | 'world';

const WINDOWS: [Win, string][] = [
  ['chronicle', '📜 Crônica'],
  ['kingdoms', '👑 Reinos'],
  ['settlements', '🏘 Assentamentos'],
  ['species', '🐾 Espécies'],
  ['items', '⚒ Itens'],
  ['world', '⚙ Mundo'],
];

const KIND_ICONS: Record<ChronicleKind, string> = { povo: '👥', era: '⭐', guerra: '⚔', natureza: '🌋', mar: '⛵', economia: '⚒', jogador: '✋' };

const DEFAULT_SPRITE = { fish: 'fish', herbivore: 'deer', predator: 'wolf', shark: 'shark', sapient: 'human' } as const;

/** Desenho de uma espécie de animal. */
function spriteOf(sp: Species): string {
  return sp.sprite && SPRITES[sp.sprite] ? sp.sprite : DEFAULT_SPRITE[sp.kind];
}

/** Corpo de uma espécie inteligente. */
function bodyOf(sp: Species): string {
  return sp.body && BODY_NAMES.includes(sp.body) ? sp.body : sp.origin === EARTH_ID ? 'human' : 'alien';
}

const SPEEDS = [0, 1, 2, 5];

/**
 * Visão da superfície no estilo WorldBox (REQUISITOS.md, seção 4.7). Enquanto
 * este modo está ativo, nada do 3D fica carregado.
 */
export class SurfaceMode {
  private map!: SurfaceMap;
  private eco!: Ecosystem;
  private pixels!: Uint8Array;
  /** Muda a cada repintura de tile; o canvas do mapa chapado é refeito quando ela muda. */
  private mapVersion = 0;
  private decorCanvas!: HTMLCanvasElement;
  private atlas!: SpriteAtlas;
  private sprites!: SpriteLayer;
  private readonly input: Input;
  private readonly root: HTMLDivElement;
  private tools: Tool[] = [...TERRAIN_TOOLS];
  /** Ferramenta na mão; null é a mão vazia (só move o mapa e inspeciona). */
  private tool: Tool | null = null;
  private brush = 6;
  /** Temperatura alvo das ferramentas de clima, em °C, e se Aquecer e Resfriar param nela. */
  private targetC = 15;
  private limitOn = true;
  /** Animação do pincel: partículas e brilho que some devagar depois que o jogador solta. */
  private particles: Particle[] = [];
  private glow: { kind: FxKind; alpha: number } | null = null;
  private zoom = 3;
  private speed = 1;
  private center = new THREE.Vector2();
  private hover = new THREE.Vector2(-1e6, -1e6);
  private mouse: { x: number; y: number } | null = null;
  private painting = false;
  private clicked = false;
  private dragging: { x: number; y: number } | null = null;
  /** Onde começou o arraste da mão vazia, para separar clique de arraste. */
  private pressAt: { x: number; y: number } | null = null;
  /** Ficha fixada com um clique da mão vazia: uma criatura (com o `uid`, porque o índice é reaproveitado), um grupo ou um lugar. */
  private pinned: { creature: number; uid: number } | { group: number[] } | { x: number; y: number } | null = null;
  /** A câmera acompanha a criatura fixada (RF-VIDA-333). */
  private follow = false;
  /** Criatura que seria escolhida num clique agora, com contorno (RF-VIDA-330). */
  private hoverPick = -1;
  /** Último clique numa pilha de criaturas, para passar à próxima (RF-VIDA-331). */
  private cycle: { x: number; y: number; list: number[]; k: number } | null = null;
  /** Lista "N aqui" quando há mais de 3 criaturas sob o clique. */
  private crowd: number[] | null = null;
  /** Retângulo da seleção de grupo (Shift + arrastar, RF-VIDA-336), em pixels de tela. */
  private box: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Destaque no mapa: uma espécie inteira ou uma profissão de um assentamento (RF-VIDA-337). */
  private highlight: { species: number } | { village: number; role: number } | null = null;
  private highlightStep = 0;
  /** Janela do assentamento aberta e a aba visível (RF-VIDA-341). */
  private vwin: { id: number; tab: SettlementTab } | null = null;
  private lastVwin = 0;
  private lastVwinHtml = '';
  /** Ordem da tabela de assentamentos (RF-VIDA-349a). */
  private compareKey: CompareKey = 'population';
  private compareDesc = true;
  private folded = false;
  private showTerritory = true;
  /** Camada das áreas coloridas: reinos, vocação ou economia (RF-VIDA-287). */
  private layer: 'kingdoms' | 'vocation' | 'economy' = 'kingdoms';
  private lastMini = 0;
  private miniBase: HTMLCanvasElement | null = null;
  private textureChanged = true;
  private lastView = '';
  private lastInfo = 0;
  private lastInfoHtml = '';
  private lastClockHtml = '';
  private lastPanelHtml = '';
  private raf = 0;
  private lastTime = performance.now();
  private simClock = 0;
  private ready = false;
  private readonly labels = new Map<number, HTMLDivElement>();
  private readonly abort = new AbortController();

  /**
   * A superfície é 2D e não precisa de placa de vídeo: desenha sempre num
   * Canvas 2D próprio (o canvas do 3D fica escondido enquanto isso), igual
   * em qualquer computador.
   */
  private readonly renderer: SoftRenderer;

  constructor(
    private readonly shared: GameRenderer,
    private readonly state: GameState,
    private readonly params: PlanetParams,
    hud: HTMLElement,
    private readonly onExit: () => void,
  ) {
    if (shared instanceof SoftRenderer) this.renderer = shared;
    else {
      this.renderer = new SoftRenderer();
      this.renderer.setPixelRatio(1);
      shared.domElement.after(this.renderer.domElement);
      shared.domElement.style.display = 'none';
    }
    const renderer = this.renderer;
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
    // O banco genético da Terra vem a bordo; variantes que surgem entram no catálogo.
    for (const sp of earthCatalog()) if (!state.knownSpecies.has(sp.id)) state.knownSpecies.set(sp.id, sp);
    for (const sp of eco.species) state.knownSpecies.set(sp.id, sp);
    eco.onSpecies = (sp) => {
      if (state.knownSpecies.has(sp.id)) return;
      state.knownSpecies.set(sp.id, sp);
      this.buildTools();
      if (this.ready) this.selectTab(this.tab);
    };

    this.pixels = new Uint8Array(map.width * map.height * 4);
    paintSurface(map, this.pixels);
    for (let i = 0; i < eco.road.length; i++) if (eco.road[i] || eco.built[i]) this.paintSettlement(i);
    this.center.set(map.width / 2, map.height / 2);
    this.zoom = Math.max(1, window.innerHeight / map.height);
    this.decorCanvas = makeDecorCanvas();
    this.atlas = new SpriteAtlas();
    this.sprites = new SpriteLayer(this.atlas, 12000);

    this.buildTools();
    this.buildUi();
    this.resize();
    this.ready = true;
    // `?debug` deixa a cena acessível no console (testes e calibragem).
    if (new URLSearchParams(location.search).has('debug')) (window as unknown as { surface: SurfaceMode }).surface = this;
    this.raf = requestAnimationFrame(this.frame);
  }

  /** Ferramentas: terreno e clima, uma por espécie conhecida (Vida e Civilização) e eventos. */
  private buildTools(): void {
    const known = [...this.state.knownSpecies.values()];
    const group = (sp: Species) => (sp.parent ? 'Variantes' : habitatOf(sp) === 1 ? 'Água' : habitatOf(sp) === 2 ? 'Costa' : 'Terra');
    const order = ['Terra', 'Costa', 'Água', 'Variantes'];
    const life: Tool[] = known
      .filter((sp) => sp.kind !== 'sapient')
      .sort((a, b) => order.indexOf(group(a)) - order.indexOf(group(b)))
      .map((sp) => ({
        id: `spawn:${sp.id}`,
        tab: 'life' as Tab,
        group: group(sp),
        label: sp.name,
        icon: `sprite:${spriteOf(sp)}`,
        tint: sp.color,
        tip: `Solta um(a) ${sp.name.toLowerCase()} por clique (para nascerem filhotes, precisa de pelo menos dois). Vive de ${(sp.tempMin - 273).toFixed(0)} a ${(sp.tempMax - 273).toFixed(0)} °C${habitatOf(sp) === 2 ? ', na costa' : habitatOf(sp) === 1 ? ', na água' : ''}.`,
        mode: 'click' as const,
        act: (ctx: SurfaceMode, x: number, y: number) => ctx.introduce(sp, x, y),
      }));
    life.push(
      { id: 'feed', tab: 'life', group: 'Cuidar', label: 'Alimentar', icon: '🍎', tip: 'Enche a energia das criaturas no pincel.', mode: 'brush', act: (ctx, x, y) => ctx.eco.feed(x, ctx.toRow(y), ctx.brush) },
      { id: 'cull', tab: 'life', group: 'Cuidar', label: 'Reduzir', icon: '✖', tip: 'Remove as criaturas dentro do pincel (controle de população).', mode: 'click', act: (ctx, x, y) => ctx.eco.cull(x, ctx.toRow(y), ctx.brush) },
    );
    const civ: Tool[] = known
      .filter((sp) => sp.kind === 'sapient')
      .map((sp) => ({
        id: `spawn:${sp.id}`,
        tab: 'civ' as Tab,
        group: 'Povos',
        label: sp.name,
        icon: `sprite:${bodyOf(sp)}:gatherer`,
        tint: [200, 160, 90],
        skin: sp.color,
        tip: `Solta um(a) ${sp.name.toLowerCase()} por clique. Sozinho, ele procura um assentamento do seu povo ou funda um novo; para nascerem filhos, precisa de pelo menos dois.`,
        mode: 'click' as const,
        act: (ctx: SurfaceMode, x: number, y: number) => ctx.introduce(sp, x, y),
      }));
    civ.push(
      {
        id: 'teach',
        tab: 'civ',
        group: 'Ajudar de leve',
        label: 'Ensinar',
        icon: '📜',
        tip: 'Adianta um pouco o conhecimento das aldeias no pincel (não pula a condição de era).',
        mode: 'click',
        act: (ctx, x, y) => {
          const taught = ctx.eco.teach(x, ctx.toRow(y), ctx.brush, 0.35);
          if (taught.length) ctx.eco.note(`Você ensinou ${taught.map((v) => v.name).join(', ')}`, 'jogador', taught[0]);
        },
      },
      {
        id: 'harvest',
        tab: 'civ',
        group: 'Ajudar de leve',
        label: 'Boa colheita',
        icon: '🌾',
        tip: 'Uma colheita farta para os assentamentos no pincel: comida guardada e mata viçosa em volta.',
        mode: 'click',
        act: (ctx, x, y) => ctx.harvest(x, y),
      },
    );
    const surprise: Tool = {
      id: 'surprise',
      tab: 'events',
      label: 'Surpresa',
      icon: '🎲',
      tip: 'Um evento aleatório acontece em algum lugar do mundo (pode ser um povo novo, uma espécie, um desastre...).',
      mode: 'click',
      act: (ctx) => ctx.surprise(),
    };
    this.tools = [...TERRAIN_TOOLS, ...life, ...civ, ...EVENT_TOOLS, surprise];
  }

  // Ações chamadas pelas ferramentas ----------------------------------------

  /** Converte coordenadas da vista (y para o norte) em linha do mapa. */
  toRow(viewY: number): number {
    return this.map.height - viewY;
  }

  introduce(sp: Species, x: number, viewY: number): void {
    const s = this.eco.addSpecies(sp);
    const born = this.eco.introduceOne(s, x, this.toRow(viewY));
    if (born < 0) this.eco.hint = `${sp.name}: o lugar não é habitável`;
    else this.eco.note(`Você soltou ${sp.name.toLowerCase()}`, 'jogador', { x, y: this.toRow(viewY) }, { key: `spawn:${sp.id}` });
  }

  placeOre(x: number, viewY: number, ore: Ore): void {
    if (!this.eco.placeOre(x, this.toRow(viewY), ore)) this.eco.hint = 'Aqui não dá para colocar minério';
  }

  /** Evento provocado pelo jogador no ponto clicado. */
  trigger(ev: WorldEvent, x: number, viewY: number): void {
    if (!runEvent(this.eco, ev, x, this.toRow(viewY))) this.eco.hint = `${WORLD_EVENT_NAMES[ev]}: não deu certo aqui`;
  }

  surprise(): void {
    const ev = runRandomEvent(this.eco);
    const e = this.eco.chronicle[0];
    if (ev && e && e.x >= 0) this.goTo(e.x, e.y);
  }

  /** Boa colheita: comida para os assentamentos no pincel e mata viçosa em volta. */
  harvest(x: number, viewY: number): void {
    const row = this.toRow(viewY);
    const helped = this.eco.villages.filter((v) => !v.abandoned && Math.hypot(((v.x - x + this.map.width * 1.5) % this.map.width) - this.map.width / 2, v.y - row) < this.brush + 6);
    for (const v of helped) v.food = Math.min(60, v.food + 25);
    this.forBrush(x, viewY, this.brush, (i) => (this.map.vegetation[i] = clamp(this.map.vegetation[i] + 0.2, 0, 1)));
    if (helped.length) this.eco.note(`Você deu uma boa colheita a ${helped.map((v) => v.name).join(', ')}`, 'jogador', helped[0]);
    else this.eco.hint = 'Nenhum assentamento no pincel';
  }

  /** Limpar: árvores, pedras, cactos, ruínas e minério do pincel (a vista tem y para o norte). */
  clearNature(x: number, viewY: number): void {
    if (!this.eco.clearNature(x, this.toRow(viewY), this.brush)) return;
    this.textureChanged = true;
  }

  /** Demolir: construções, ruas, roças e pastos do pincel. */
  demolish(x: number, viewY: number): void {
    if (!this.eco.demolish(x, this.toRow(viewY), this.brush)) return;
    this.textureChanged = true;
  }

  /** Leva a câmera até um tile (x, linha). */
  goTo(x: number, row: number): void {
    this.center.set(x, this.map.height - row);
    this.zoom = Math.max(this.zoom, 8);
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
    this.softArt?.invalidate(i);
    this.mapVersion++;
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
    // Ruas pela era e pela hierarquia (19.8, RF-VIDA-253): trilha, terra batida, cascalho nas principais, pedra, calçamento.
    const era = road === 1 || road === 2 ? this.streetEra(i) : 0;
    const main = this.eco.mainStreet[i] === 1;
    if (road === 1) c = era === 0 ? [164, 130, 88] : era >= 2 && main ? [170, 162, 146] : [140, 104, 66];
    else if (road === 2) c = era >= 4 ? [124, 122, 130] : [146, 144, 150];
    else if (road === AVENUE) c = [108, 108, 118];
    else if (road === GRAVEL) c = [158, 148, 128];
    else if (road === 3) c = [184, 160, 120];
    else if (road === 4) c = [196, 160, 78];
    else if (road === 5) c = [118, 168, 74];
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
    const kind = road === 4 ? 7 : road === 1 || road === GRAVEL ? 8 : road === 2 || road === AVENUE ? 9 : road === 3 ? 10 : 15;
    px[o + 3] = kind * 16 + 15;
  }

  /** Era do assentamento dono da rua neste tile (0 fora de qualquer um). */
  private streetEra(i: number): number {
    const w = this.map.width;
    const v = this.eco.settlementAt((i % w) + 0.5, Math.floor(i / w) + 0.5);
    return v ? Math.floor(v.tech) : 0;
  }

  // Interface ----------------------------------------------------------------

  private tab: Tab = 'terrain';
  /** Janela aberta (crônica, reinos, espécies, itens, mundo) e o filtro dela. */
  private win: Win | null = null;
  private winFilter = '';
  private lastWinHtml = '';
  private lastWin = 0;
  private showMinor = false;
  private showLabels = true;
  private readonly iconCache = new Map<string, string>();

  /** Ícone de sprite como imagem (para botões e janelas). */
  private icon(name: string, tint: readonly number[] = [200, 200, 200], skin: readonly number[] = tint): string {
    const key = `${name}|${tint.join(',')}|${skin.join(',')}`;
    let url = this.iconCache.get(key);
    if (!url) {
      url = SPRITES[name] ? this.atlas.tinted(name, tint, skin).toDataURL() : '';
      this.iconCache.set(key, url);
    }
    return url ? `<img class="wb-px" src="${url}" alt="">` : '';
  }

  private readonly crestCache = new Map<string, string>();

  /**
   * Brasão do reino (RF-VIDA-288): escudo na cor do reino com a forma pelo
   * valor do povo e o emblema da vocação da capital.
   */
  private crest(k: Village): string {
    const key = `${k.color.join(',')}|${k.culture.value}|${k.vocation ?? ''}`;
    let url = this.crestCache.get(key);
    if (!url) {
      const c = document.createElement('canvas');
      c.width = 11;
      c.height = 13;
      const g = c.getContext('2d')!;
      const shape = CREST_SHAPES[k.culture.value] ?? 'round';
      const inside = (x: number, y: number) => {
        if (shape === 'square') return y < 11;
        if (shape === 'banner') return y < 10 || (y < 13 && Math.abs(x - 5) >= y - 9);
        if (shape === 'pointed') return y < 7 || Math.abs(x - 5) <= 12 - y - 1;
        return y < 7 || (x - 5) ** 2 + (y - 6) ** 2 <= 30;
      };
      const [r, gr, b] = k.color;
      for (let y = 0; y < 13; y++) {
        for (let x = 0; x < 11; x++) {
          if (!inside(x, y)) continue;
          const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1) || x === 0 || x === 10 || y === 0;
          g.fillStyle = edge ? '#241a14' : x > 6 ? `rgb(${(r * 0.7) | 0},${(gr * 0.7) | 0},${(b * 0.7) | 0})` : `rgb(${r},${gr},${b})`;
          g.fillRect(x, y, 1, 1);
        }
      }
      const emblem = k.vocation ? CREST_EMBLEMS[k.vocation] : [];
      g.fillStyle = '#f1e8d4';
      emblem.forEach((row, y) => [...row].forEach((ch, x) => ch === '#' && g.fillRect(x + 3, y + 2, 1, 1)));
      url = c.toDataURL();
      this.crestCache.set(key, url);
    }
    return `<img class="wb-crest" src="${url}" alt="" title="Brasão do reino de ${k.name}">`;
  }

  private toolIcon(t: Tool): string {
    return t.icon.startsWith('sprite:') ? this.icon(t.icon.slice(7), t.tint, t.skin) : `<span>${t.icon}</span>`;
  }

  private buildUi(): void {
    this.root.innerHTML = `
      <canvas class="wb-terr" data-terr></canvas>
      <div class="wb-labels" data-l></div>
      <div class="wb-top">
        <button class="wb-back" data-a="back">⟵ Órbita</button>
        <div class="wb-title">${this.params.name}</div>
        <div class="wb-stats" data-s></div>
        <div class="wb-clock" data-clock></div>
        <div class="wb-menu">
          ${WINDOWS.map(([id, label]) => `<button class="wb-back" data-w="${id}">${label}</button>`).join('')}
          <button class="wb-back" data-a="help" title="Controles (H)">?</button>
        </div>
      </div>
      <div class="wb-info" data-i hidden></div>
      <div class="wb-side" data-side>
        <div class="wb-side-head">
          <canvas class="wb-mini" data-mini width="200" height="100" title="Clique ou arraste para levar a câmera"></canvas>
          <button class="wb-fold" data-fold title="Esconder ou mostrar o painel (P)">▾ Painel</button>
        </div>
        <div class="wb-side-body" data-p></div>
      </div>
      <div class="wb-cursor" data-cursor hidden></div>
      <div class="wb-window" data-win hidden>
        <div class="wb-win-head"><b data-win-title></b><button class="wb-x" data-close title="Fechar (Esc)">✕</button></div>
        <div class="wb-win-body" data-win-body></div>
      </div>
      <div class="wb-vwin" data-vwin hidden>
        <div class="wb-win-head"><b data-vwin-title></b><button class="wb-x" data-vclose title="Fechar (Esc)">✕</button></div>
        <div class="wb-vtabs" data-vtabs>${SETTLEMENT_TABS.map(([id, label]) => `<button data-vtab="${id}">${label}</button>`).join('')}</div>
        <div class="wb-win-body" data-vwin-body></div>
      </div>
      <div class="wb-crowd" data-crowd hidden></div>
      <div class="wb-boxsel" data-box hidden></div>
      <div class="wb-toast" data-toast hidden></div>
      <div class="wb-dock">
        <div class="wb-tip" data-tip></div>
        <div class="wb-tabs">${TABS.map(([id, label]) => `<button data-tab="${id}">${label}</button>`).join('')}</div>
        <div class="wb-bar" data-bar></div>
      </div>
      <div class="wb-help" data-help hidden>
        <div class="wb-win-head"><b>Controles</b><button class="wb-x" data-a="help" title="Fechar (H)">✕</button></div>
        <div class="wb-keys">
          <span><kbd>Esquerdo</kbd> usa a ferramenta; de mão vazia arrasta o mapa e um clique fixa a ficha do que está embaixo. Clicar de novo no mesmo ponto passa para a próxima criatura</span>
          <span>Clique no nome, na praça ou num prédio para abrir a janela do assentamento · <kbd>Shift</kbd> + arrastar escolhe um grupo · <kbd>F</kbd> segue a criatura escolhida</span>
          <span><kbd>Direito</kbd><kbd>WASD</kbd> movem o mapa · <kbd>Roda</kbd> zoom</span>
          <span><kbd>Espaço</kbd> pausa · <kbd>1</kbd>–<kbd>4</kbd> velocidade</span>
          <span><kbd>[</kbd><kbd>]</kbd> tamanho do pincel · <kbd>Esc</kbd> guarda a ferramenta, fecha a janela ou volta à órbita</span>
          <span><kbd>C</kbd> crônica · <kbd>R</kbd> reinos · <kbd>E</kbd> espécies · <kbd>I</kbd> itens · <kbd>P</kbd> painel · <kbd>T</kbd> territórios · <kbd>H</kbd> esta ajuda</span>
          <span>Cada reino tem uma cor: a área dos assentamentos e a faixa do nome mostram de quem é. Borda cheia é a capital; tracejada, os outros assentamentos do reino.</span>
          <span>No minimapa, clique ou arraste para levar a câmera.</span>
        </div>
      </div>`;
    const signal = this.abort.signal;
    this.root.querySelector('[data-a="back"]')!.addEventListener('click', () => this.onExit(), { signal });
    this.root.querySelectorAll('[data-a="help"]').forEach((b) => b.addEventListener('click', () => this.toggleHelp(), { signal }));
    this.root.querySelector('[data-fold]')!.addEventListener('click', () => this.fold(), { signal });
    const mini = this.root.querySelector<HTMLCanvasElement>('[data-mini]')!;
    const jump = (e: PointerEvent) => {
      const r = mini.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * this.map.width;
      const row = ((e.clientY - r.top) / r.height) * this.map.height;
      this.center.set(x, this.map.height - row);
    };
    mini.addEventListener('pointerdown', (e) => {
      mini.setPointerCapture(e.pointerId);
      jump(e);
    }, { signal });
    mini.addEventListener('pointermove', (e) => {
      if (mini.hasPointerCapture(e.pointerId)) jump(e);
    }, { signal });
    this.scrollable(this.root.querySelector<HTMLElement>('[data-bar]')!, signal);
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => this.selectTab(b.dataset.tab as Tab), { signal });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => {
      b.addEventListener('click', () => this.openWindow(b.dataset.w as Win), { signal });
    });
    this.root.querySelector('[data-close]')!.addEventListener('click', () => this.openWindow(null), { signal });
    // pointerdown porque o painel e as janelas são redesenhados enquanto a
    // simulação roda e um clique (descer e subir) poderia cair em botões já substituídos.
    const onPanel = (e: Event) => {
      const el = e.target as HTMLElement;
      const speed = el.closest<HTMLElement>('[data-speed]');
      if (speed) this.speed = Number(speed.dataset.speed);
      const go = el.closest<HTMLElement>('[data-go]');
      if (go) {
        const [x, y] = go.dataset.go!.split(',').map(Number);
        this.goTo(x, y);
      }
      const village = el.closest<HTMLElement>('[data-village]');
      const v = village && this.eco.villages.find((it) => it.id === Number(village.dataset.village));
      if (v) {
        this.goTo(v.x, v.y);
        // Da tabela de assentamentos ou das relações, abre também a janela dele.
        if (village.closest('[data-win-body]') && this.win === 'settlements') this.openSettlement(v.id);
        else if (village.closest('[data-vwin-body]')) this.openSettlement(v.id);
      }
      const sort = el.closest<HTMLElement>('[data-sort]');
      if (sort) {
        const key = sort.dataset.sort as CompareKey;
        this.compareDesc = key === this.compareKey ? !this.compareDesc : key !== 'name' && key !== 'vocation';
        this.compareKey = key;
        this.lastWinHtml = '';
        this.updateWindow(true);
      }
      const species = el.closest<HTMLElement>('[data-species]');
      if (species) this.highlightNext({ species: Number(species.dataset.species) });
      const role = el.closest<HTMLElement>('[data-role]');
      if (role && this.vwin) this.highlightNext({ village: this.vwin.id, role: Number(role.dataset.role) });
      const who = el.closest<HTMLElement>('[data-uid]');
      if (who) {
        const i = this.eco.findUid(Number(who.dataset.uid));
        if (i >= 0) this.select(i);
      }
      const act = el.closest<HTMLElement>('[data-act]');
      if (act?.dataset.act === 'follow') this.toggleFollow();
      const tab = el.closest<HTMLElement>('[data-vtab]');
      if (tab && this.vwin) {
        this.vwin.tab = tab.dataset.vtab as SettlementTab;
        this.lastVwinHtml = '';
        this.updateVwin(true);
      }
      const filter = el.closest<HTMLElement>('[data-filter]');
      if (filter) {
        this.winFilter = filter.dataset.filter!;
        this.lastWinHtml = '';
        this.updateWindow(true);
      }
      const tool = el.closest<HTMLElement>('[data-pick]');
      if (tool) {
        const t = this.tools.find((it) => it.id === tool.dataset.pick);
        if (t) {
          this.selectTab(t.tab);
          this.tool = t;
          this.updateToolbar();
          this.openWindow(null);
        }
      }
      const opt = el.closest<HTMLElement>('[data-opt]');
      if (opt) this.setOption(opt.dataset.opt!);
      const open = el.closest<HTMLElement>('[data-open]');
      if (open) this.openWindow(open.dataset.open as Win);
    };
    this.root.querySelector('[data-p]')!.addEventListener('pointerdown', onPanel, { signal });
    this.root.querySelector('[data-win-body]')!.addEventListener('pointerdown', onPanel, { signal });
    this.root.querySelector('[data-clock]')!.addEventListener('pointerdown', onPanel, { signal });
    this.root.querySelector('[data-i]')!.addEventListener('pointerdown', onPanel, { signal });
    this.root.querySelector('[data-vwin]')!.addEventListener('pointerdown', onPanel, { signal });
    this.root.querySelector('[data-vclose]')!.addEventListener('click', () => this.openSettlement(null), { signal });
    // Rótulo do assentamento: clicar abre a janela dele (RF-VIDA-340).
    this.root.querySelector('[data-l]')!.addEventListener('pointerdown', (e) => {
      const label = (e.target as HTMLElement).closest<HTMLElement>('[data-vid]');
      if (label) this.openSettlement(Number(label.dataset.vid));
    }, { signal });
    this.root.querySelector('[data-crowd]')!.addEventListener('pointerdown', (e) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>('[data-pickone]');
      if (row) this.select(Number(row.dataset.pickone));
      this.showCrowd(null);
    }, { signal });
    this.selectTab('terrain');

    const canvas = this.renderer.domElement;
    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener('pointerdown', (e) => {
      if (e.button === 0 && !this.tool && e.shiftKey) {
        this.box = { x0: e.clientX, y0: e.clientY, x1: e.clientX, y1: e.clientY };
      } else if (e.button === 0 && this.tool) {
        this.painting = true;
        this.clicked = true;
      } else {
        this.dragging = { x: e.clientX, y: e.clientY };
        if (e.button === 0) this.pressAt = { x: e.clientX, y: e.clientY };
      }
      canvas.setPointerCapture(e.pointerId);
    }, { signal });
    canvas.addEventListener('pointerup', (e) => {
      if (this.box) {
        this.selectBox(this.box);
        this.box = null;
        this.root.querySelector<HTMLElement>('[data-box]')!.hidden = true;
      }
      // Clique curto da mão vazia: fixa (ou solta) a ficha do que está embaixo.
      if (this.pressAt && Math.hypot(e.clientX - this.pressAt.x, e.clientY - this.pressAt.y) < 5) this.pin();
      this.pressAt = null;
      this.painting = false;
      this.dragging = null;
    }, { signal });
    canvas.addEventListener('pointermove', (e) => {
      if (this.box) {
        this.box.x1 = e.clientX;
        this.box.y1 = e.clientY;
        const el = this.root.querySelector<HTMLElement>('[data-box]')!;
        el.hidden = false;
        Object.assign(el.style, { left: `${Math.min(this.box.x0, this.box.x1)}px`, top: `${Math.min(this.box.y0, this.box.y1)}px`, width: `${Math.abs(this.box.x1 - this.box.x0)}px`, height: `${Math.abs(this.box.y1 - this.box.y0)}px` });
      }
      // Arrastar o mapa solta a câmera que seguia alguém.
      if (this.dragging && this.follow && Math.hypot(e.clientX - this.dragging.x, e.clientY - this.dragging.y) > 2) this.follow = false;
      if (this.dragging) {
        this.center.x -= (e.clientX - this.dragging.x) / this.zoom;
        this.center.y += (e.clientY - this.dragging.y) / this.zoom;
        this.dragging = { x: e.clientX, y: e.clientY };
      }
      this.mouse = { x: e.clientX, y: e.clientY };
    }, { signal });
    canvas.addEventListener('pointerleave', () => {
      this.mouse = null;
      this.root.querySelector<HTMLElement>('[data-cursor]')!.hidden = true;
    }, { signal });
  }

  private toggleHelp(): void {
    const el = this.root.querySelector<HTMLElement>('[data-help]')!;
    el.hidden = !el.hidden;
  }

  /** Esconde o painel lateral (o minimapa fica). */
  private fold(): void {
    this.folded = !this.folded;
    this.root.querySelector('[data-side]')!.classList.toggle('folded', this.folded);
    this.root.querySelector('[data-fold]')!.textContent = this.folded ? '▸ Painel' : '▾ Painel';
  }

  /** Raio de escolha em tiles para o zoom atual. */
  private pickRadius(): number {
    return PICK_RADIUS_PX / this.zoom;
  }

  /**
   * Clique da mão vazia (RF-VIDA-330, 331 e 340): na praça ou num prédio
   * abre a janela do assentamento; sobre criaturas escolhe a mais perto, e
   * clicar de novo no mesmo ponto passa para a próxima; no vazio do
   * assentamento fixa a ficha do lugar; no resto solta a seleção.
   */
  private pin(): void {
    const row = this.toRow(this.hover.y);
    const tile = this.tileIndex(this.hover.x, this.hover.y);
    const anchor = tile >= 0 ? this.anchorAt(tile) : null;
    if (anchor) {
      this.openSettlement(anchor.id);
      return;
    }
    const list = this.eco.pickAll(this.hover.x, row, this.pickRadius());
    this.showCrowd(null);
    if (list.length) {
      const m = this.mouse;
      const same = this.cycle && m && Math.hypot(m.x - this.cycle.x, m.y - this.cycle.y) < 6 && list.length === this.cycle.list.length && list.every((i) => this.cycle!.list.includes(i));
      const k = same ? (this.cycle!.k + 1) % list.length : 0;
      this.cycle = m ? { x: m.x, y: m.y, list, k } : null;
      this.select(same ? this.cycle!.list[k] : list[0], false);
      if (!same && list.length > 3) this.showCrowd(list);
      return;
    }
    this.cycle = null;
    this.follow = false;
    if (this.eco.settlementAt(this.hover.x, row)) this.pinned = { x: this.hover.x, y: this.hover.y };
    else this.pinned = null;
    this.lastInfoHtml = '';
    this.updateInfo();
  }

  /** Assentamento cuja praça ou prédio está neste tile (RF-VIDA-340). */
  private anchorAt(i: number): Village | null {
    const eco = this.eco;
    const w = this.map.width;
    const x = i % w;
    const y = Math.floor(i / w);
    if (eco.road[i] === 3) return eco.settlementAt(x + 0.5, y + 0.5);
    if (!eco.built[i]) return null;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      for (const h of v.houses) {
        const size = h.kind === 'port' ? 0 : 1;
        if (y >= h.y && y <= h.y + size && (x - h.x + w) % w <= size) return h.kind === 'house' ? null : v;
      }
    }
    return null;
  }

  /** Escolhe uma criatura e fixa a ficha dela. */
  private select(i: number, closeCrowd = true): void {
    if (i < 0 || !this.eco.alive[i]) return;
    if (closeCrowd) this.showCrowd(null);
    if (!(this.pinned && 'creature' in this.pinned && this.pinned.uid === this.eco.uid[i])) this.follow = false;
    this.pinned = { creature: i, uid: this.eco.uid[i] };
    this.lastInfoHtml = '';
    this.textureChanged = true;
    this.updateInfo();
  }

  /** Lista pequena "N aqui" para escolher numa pilha de criaturas (RF-VIDA-331). */
  private showCrowd(list: number[] | null): void {
    this.crowd = list;
    const el = this.root.querySelector<HTMLElement>('[data-crowd]')!;
    if (!list || !this.mouse) {
      el.hidden = true;
      return;
    }
    const rows = list.slice(0, 12).map((i) => `<button data-pickone="${i}">${this.shortName(i)}</button>`).join('');
    el.innerHTML = `<b>${list.length} aqui</b>${rows}${list.length > 12 ? `<span>e mais ${list.length - 12}</span>` : ''}`;
    el.style.transform = `translate(${this.mouse.x + 16}px, ${this.mouse.y - 8}px)`;
    el.hidden = false;
  }

  /** "Enka, caçador" ou "Lobo, adulto": o nome curto da lista e dos avisos. */
  private shortName(i: number): string {
    const eco = this.eco;
    const sp = eco.species[eco.kind[i]];
    if (sp.kind === 'sapient' && eco.village[i] >= 0) return `${personName(eco.uid[i], eco.villages[eco.village[i]].culture.id)}, ${this.lifeStage(i).toLowerCase()}`;
    if (sp.kind === 'sapient') return `${sp.name}, sem assentamento`;
    return `${sp.name}, ${animalStage(eco.age[i], sp.maturity, sp.maxAge)}`;
  }

  /** Shift + arrastar: seleciona as criaturas dentro do retângulo (RF-VIDA-336). */
  private selectBox(b: { x0: number; y0: number; x1: number; y1: number }): void {
    if (Math.abs(b.x1 - b.x0) < 4 || Math.abs(b.y1 - b.y0) < 4) return;
    const toMap = (sx: number, sy: number) => [this.center.x + (sx - window.innerWidth / 2) / this.zoom, this.map.height - (this.center.y + (window.innerHeight / 2 - sy) / this.zoom)];
    const [ax, ay] = toMap(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1));
    const [bx, by] = toMap(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
    const list = this.eco.pickRect(ax, ay, bx, by);
    this.pressAt = null;
    this.follow = false;
    this.pinned = list.length ? { group: list.map((i) => this.eco.uid[i]) } : null;
    this.lastInfoHtml = '';
    this.textureChanged = true;
    this.updateInfo();
  }

  /** Liga ou desliga a câmera que segue a criatura fixada (botão Seguir e tecla F). */
  private toggleFollow(): void {
    if (!this.pinned || !('creature' in this.pinned)) return;
    this.follow = !this.follow;
    this.lastInfoHtml = '';
  }

  /**
   * Destaca uma espécie ou uma profissão no mapa; cada clique seguido leva a
   * câmera ao próximo indivíduo (RF-VIDA-337).
   */
  private highlightNext(h: { species: number } | { village: number; role: number }): void {
    const same = JSON.stringify(h) === JSON.stringify(this.highlight);
    this.highlight = h;
    const list = this.highlighted();
    if (!list.length) {
      this.eco.hint = 'Ninguém assim no mapa agora';
      return;
    }
    this.highlightStep = same ? (this.highlightStep + 1) % list.length : 0;
    const i = list[this.highlightStep];
    this.goTo(this.eco.x[i], this.eco.y[i]);
    this.eco.hint = `${this.highlightStep + 1} de ${list.length} · clique de novo para o próximo · Esc tira o destaque`;
    this.textureChanged = true;
    this.lastPanelHtml = '';
  }

  /** Índices destacados agora. */
  private highlighted(): number[] {
    const h = this.highlight;
    if (!h) return [];
    const eco = this.eco;
    const out: number[] = [];
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i]) continue;
      if ('species' in h ? eco.kind[i] === h.species : eco.village[i] === h.village && eco.role[i] === h.role) out.push(i);
    }
    return out;
  }

  /** Abre (ou fecha, com null) a janela do assentamento. */
  private openSettlement(id: number | null): void {
    this.vwin = id === null ? null : { id, tab: this.vwin?.id === id ? this.vwin.tab : 'summary' };
    if (id === null && this.highlight && 'village' in this.highlight) this.highlight = null;
    this.lastVwinHtml = '';
    this.root.querySelector<HTMLElement>('[data-vwin]')!.hidden = !this.vwin;
    this.textureChanged = true;
    this.updateVwin(true);
  }

  /** Só a aba visível é refeita, no máximo VWIN_HZ vezes por segundo (RF-VIDA-341). */
  private updateVwin(force = false): void {
    if (!this.vwin) return;
    const now = performance.now();
    if (!force && now - this.lastVwin < 1000 / VWIN_HZ) return;
    this.lastVwin = now;
    const v = this.eco.villages[this.vwin.id];
    if (!v) return;
    const tab = this.vwin.tab;
    const html = settlementTabHtml(this.eco, v, tab, (e) => Ecosystem.describe(e));
    const title = `${this.crest(this.eco.villages[v.kingdom])}<span>${v.vocation ? `${VOCATION_ICONS[v.vocation]} ` : ''}${TIER_NAMES[v.tier]} ${v.name} ${stateIcons(this.eco, v)}</span>`;
    const head = this.root.querySelector<HTMLElement>('[data-vwin-title]')!;
    if (head.dataset.html !== title) {
      head.dataset.html = title;
      head.innerHTML = title;
    }
    this.root.querySelectorAll<HTMLElement>('[data-vtab]').forEach((b) => b.classList.toggle('on', b.dataset.vtab === tab));
    if (html === this.lastVwinHtml) return;
    this.lastVwinHtml = html;
    const body = this.root.querySelector<HTMLElement>('[data-vwin-body]')!;
    const scroll = body.scrollTop;
    body.innerHTML = html;
    body.scrollTop = scroll;
  }

  /** Minimapa: o mapa inteiro reduzido e o retângulo da vista. */
  private updateMinimap(now: number): void {
    const mini = this.root.querySelector<HTMLCanvasElement>('[data-mini]')!;
    const { width: w, height: h } = this.map;
    if (!this.miniBase || now - this.lastMini > 1000) {
      this.lastMini = now;
      this.miniBase ??= Object.assign(document.createElement('canvas'), { width: w, height: h });
      const ctx = this.miniBase.getContext('2d')!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(this.pixels), w, h), 0, 0);
    }
    const ctx = mini.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase, 0, 0, mini.width, mini.height);
    const sx = mini.width / w;
    const sy = mini.height / h;
    // Assentamentos como pontos na cor do reino.
    for (const v of this.eco.villages) {
      if (v.abandoned) continue;
      ctx.fillStyle = `rgb(${v.color.join(',')})`;
      const r = 1 + v.tier;
      ctx.fillRect(v.x * sx - r / 2, v.y * sy - r / 2, r, r);
    }
    const vw = window.innerWidth / this.zoom;
    const vh = window.innerHeight / this.zoom;
    const x0 = this.center.x - vw / 2;
    const y0 = h - this.center.y - vh / 2;
    ctx.strokeStyle = '#f0c860';
    ctx.lineWidth = 1.5;
    for (const off of [-w, 0, w]) ctx.strokeRect((x0 + off) * sx, y0 * sy, vw * sx, vh * sy);
  }

  /** Soltar uma criatura é num ponto só: sem círculo de pincel. */
  private usesBrush(): boolean {
    return !!this.tool && !this.tool.id.startsWith('spawn:');
  }

  /** Ícone da ferramenta na mão, ao lado do cursor. */
  private updateCursor(): void {
    const el = this.root.querySelector<HTMLElement>('[data-cursor]')!;
    if (!this.tool || !this.mouse) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.style.transform = `translate(${this.mouse.x + 14}px, ${this.mouse.y + 14}px)`;
    if (el.dataset.t !== this.tool.id) {
      el.dataset.t = this.tool.id;
      el.innerHTML = this.toolIcon(this.tool);
    }
  }

  private setOption(opt: string): void {
    const eco = this.eco;
    if (opt === 'events') eco.autoEvents = !eco.autoEvents;
    else if (opt.startsWith('rate:')) eco.eventRate = Number(opt.slice(5));
    else if (opt === 'minor') this.showMinor = !this.showMinor;
    else if (opt === 'labels') this.showLabels = !this.showLabels;
    else if (opt === 'territory') this.showTerritory = !this.showTerritory;
    else if (opt.startsWith('layer:')) {
      this.layer = opt.slice(6) as typeof this.layer;
      this.showTerritory = true;
      this.lastView = '';
    }
    else if (opt === 'now') this.surprise();
    this.lastWinHtml = '';
    this.lastPanelHtml = '';
    this.updateWindow(true);
  }

  private selectTab(tab: Tab): void {
    this.tab = tab;
    this.root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    const tools = this.tools.filter((t) => t.tab === tab);
    if (this.tool && this.tool.tab !== tab) this.tool = null;
    const bar = this.root.querySelector<HTMLElement>('[data-bar]')!;
    let html = '';
    let group: string | undefined;
    for (const t of tools) {
      if (t.group !== group) {
        group = t.group;
        if (group) html += `<div class="wb-group">${group}</div>`;
      }
      html += `<button class="wb-tool" data-t="${t.id}" title="${t.tip}">${this.toolIcon(t)}${t.label}</button>`;
    }
    bar.innerHTML = `
      ${html}
      <div class="wb-group"></div>
      <button class="wb-tool" data-t="inspect" title="Mão vazia: arraste para mover o mapa e passe o mouse para ver detalhes, sem mexer em nada"><span>✋</span>Mão</button>
      <label class="wb-brush">Pincel <input type="range" min="1" max="30" value="${this.brush}" data-b /></label>
      ${
        tab === 'climate'
          ? `<label class="wb-brush" title="Temperatura que Aquecer, Resfriar e Ajustar buscam">Alvo <input type="range" min="-150" max="450" value="${this.targetC}" data-tc /> <b data-tcv>${this.targetC} °C</b></label>
      <label class="wb-brush" title="Com o limite, Aquecer e Resfriar param no alvo"><input type="checkbox" data-tl ${this.limitOn ? 'checked' : ''} /> Limitar ao alvo</label>
      <span class="wb-brush" data-tnow title="Temperatura sob o mouse e o quanto o pincel consegue mudar ali"></span>`
          : ''
      }`;
    const signal = this.abort.signal;
    bar.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.addEventListener('click', () => {
        // Clicar de novo na ferramenta da mão a guarda (volta à mão vazia).
        const t = this.tools.find((it) => it.id === b.dataset.t) ?? null;
        this.tool = t && t !== this.tool ? t : null;
        this.updateToolbar();
      }, { signal });
    });
    bar.querySelector<HTMLInputElement>('[data-b]')!.addEventListener('input', (e) => {
      this.brush = Number((e.target as HTMLInputElement).value);
    }, { signal });
    bar.querySelector<HTMLInputElement>('[data-tc]')?.addEventListener('input', (e) => {
      this.targetC = Number((e.target as HTMLInputElement).value);
      bar.querySelector('[data-tcv]')!.textContent = `${this.targetC} °C`;
      this.updateToolbar();
    }, { signal });
    bar.querySelector<HTMLInputElement>('[data-tl]')?.addEventListener('change', (e) => {
      this.limitOn = (e.target as HTMLInputElement).checked;
      this.updateToolbar();
    }, { signal });
    this.updateToolbar();
  }

  /**
   * Barra de ferramentas rolável para o lado: roda do mouse, arrastar com o
   * mouse ou o dedo e a barra de rolagem. Um arraste não conta como clique.
   */
  private scrollable(bar: HTMLElement, signal: AbortSignal): void {
    bar.addEventListener('wheel', (e) => {
      e.stopPropagation();
      if (bar.scrollWidth <= bar.clientWidth) return;
      e.preventDefault();
      bar.scrollLeft += Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    }, { signal, passive: false });
    let drag: { x: number; left: number; id: number } | null = null;
    let moved = false;
    bar.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target instanceof HTMLInputElement) return;
      drag = { x: e.clientX, left: bar.scrollLeft, id: e.pointerId };
      moved = false;
    }, { signal });
    bar.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x;
      if (!moved && Math.abs(dx) > 6) {
        moved = true;
        bar.setPointerCapture(e.pointerId);
      }
      if (moved) bar.scrollLeft = drag.left - dx;
    }, { signal });
    const end = () => {
      drag = null;
    };
    bar.addEventListener('pointerup', end, { signal });
    bar.addEventListener('pointercancel', end, { signal });
    bar.addEventListener('click', (e) => {
      if (!moved) return;
      moved = false;
      e.stopPropagation();
      e.preventDefault();
    }, { signal, capture: true });
  }

  private updateToolbar(): void {
    this.root.querySelectorAll<HTMLButtonElement>('[data-t]').forEach((b) => {
      b.classList.toggle('on', (this.tool?.id ?? 'inspect') === b.dataset.t);
    });
    const tip = this.root.querySelector<HTMLElement>('[data-tip]')!;
    const limited = this.tool && ['heat', 'cool', 'adjust'].includes(this.tool.id) ? ` Alvo: ${this.targetC} °C${this.tool.id !== 'adjust' ? (this.limitOn ? ' (limite ligado)' : ' (sem limite)') : ''}.` : '';
    tip.textContent = this.tool ? `${this.tool.label}: ${this.tool.tip}${limited} (clique de novo ou Esc para guardar)` : 'Mão vazia: arraste para mover o mapa e passe o mouse para ver detalhes. Escolha uma ferramenta para mexer no mundo.';
  }

  // Janelas ----------------------------------------------------------------

  private openWindow(win: Win | null): void {
    this.win = this.win === win ? null : win;
    this.winFilter = '';
    this.lastWinHtml = '';
    const el = this.root.querySelector<HTMLElement>('[data-win]')!;
    el.hidden = !this.win;
    this.root.querySelectorAll<HTMLButtonElement>('[data-w]').forEach((b) => b.classList.toggle('on', b.dataset.w === this.win));
    this.updateWindow(true);
  }

  private updateWindow(force = false): void {
    if (!this.win) return;
    const now = performance.now();
    if (!force && now - this.lastWin < 600) return;
    this.lastWin = now;
    const title = WINDOWS.find(([id]) => id === this.win)![1];
    const body =
      this.win === 'chronicle'
        ? this.chronicleHtml()
        : this.win === 'kingdoms'
          ? this.kingdomsHtml()
          : this.win === 'settlements'
            ? compareHtml(this.eco, this.compareKey, this.compareDesc)
            : this.win === 'species'
              ? this.speciesHtml()
              : this.win === 'items'
                ? this.itemsHtml()
                : this.worldHtml();
    if (body === this.lastWinHtml) return;
    this.lastWinHtml = body;
    this.root.querySelector<HTMLElement>('[data-win-title]')!.textContent = title;
    this.root.querySelector<HTMLElement>('[data-win-body]')!.innerHTML = body;
  }

  private filters(list: [string, string][]): string {
    return `<div class="wb-filters">${list.map(([id, label]) => `<button data-filter="${id}" class="${this.winFilter === id ? 'on' : ''}">${label}</button>`).join('')}</div>`;
  }

  private chronicleHtml(): string {
    const f = this.winFilter;
    const kinds: Record<string, ChronicleKind[]> = { povos: ['povo', 'era'], guerra: ['guerra'], natureza: ['natureza'], mar: ['mar'], economia: ['economia'], voce: ['jogador'] };
    const list = this.eco.chronicle.filter((e) => (f === '' ? true : f === 'major' ? e.major : kinds[f]?.includes(e.kind)));
    const rows = list
      .slice(0, 150)
      .map((e) => {
        const where = e.x >= 0 ? ` data-go="${e.x.toFixed(1)},${e.y.toFixed(1)}"` : '';
        return `<button class="wb-row ${e.major ? 'major' : ''}"${where}><i>${KIND_ICONS[e.kind]}</i><span class="wb-yr">${Math.floor(e.year)}</span>${Ecosystem.describe(e)}${e.x >= 0 ? '<em>📍</em>' : ''}</button>`;
      })
      .join('');
    return `
      ${this.filters([['', 'Tudo'], ['major', 'Importantes'], ['povos', 'Povos'], ['guerra', 'Guerras'], ['natureza', 'Natureza'], ['mar', 'Mar'], ['economia', 'Economia'], ['voce', 'Você']])}
      <div class="wb-list">${rows || '<div class="wb-empty">Nada registrado ainda.</div>'}</div>
      <div class="wb-note">Clique numa linha com 📍 para ir ao lugar. A crônica guarda os ${this.eco.chronicle.length} acontecimentos mais recentes.</div>`;
  }

  private kingdomsHtml(): string {
    const eco = this.eco;
    const capitals = eco.villages.filter((v) => !v.abandoned && v.kingdom === v.id);
    if (!capitals.length) return '<div class="wb-empty">Nenhum povo neste planeta ainda. Leve um pela aba Civilização.</div>';
    const cards = capitals
      .map((k) => {
        const members = eco.villages.filter((v) => !v.abandoned && v.kingdom === k.id);
        const pop = members.reduce((n, v) => n + v.population, 0);
        // Cada assentamento tem o próprio estoque; aqui aparece a soma do reino.
        const st = eco.kingdomStock(k.id);
        const stock = STOCK_NAMES.filter(([key]) => st[key] >= 1).map(([key, name]) => `${name} ${Math.floor(st[key])}`).join(' · ');
        const c = k.culture;
        const rels = capitals
          .filter((o) => o !== k && (eco.relations.has(`${Math.min(o.id, k.id)}:${Math.max(o.id, k.id)}`)))
          .map((o) => {
            const r = eco.relation(o.id, k.id);
            const at = eco.warOf(k.id) && eco.wars.some((w) => (w.a === k.id && w.b === o.id) || (w.b === k.id && w.a === o.id));
            const [mark, cls] = at ? ['⚔ guerra', 'bad'] : eco.allied(o.id, k.id) ? ['❤ aliado', 'good'] : r < -35 ? ['hostil', 'bad'] : r < 0 ? ['tensão', 'warn'] : r > 40 ? ['amigo', 'good'] : ['paz', ''];
            return `<span class="wb-rel ${cls}"><i style="background:rgb(${o.color.join(',')})"></i>${o.name}: ${mark}</span>`;
          })
          .join('');
        const wonder = k.houses.some((h) => h.kind === 'wonder') ? ` · 🏛 ${WONDER_NAMES[c.value]}` : '';
        // Acordos comerciais com os assentamentos do reino (RF-VIDA-232) e a moeda (RF-VIDA-291).
        const ids = new Set(members.map((v) => v.id));
        const deals = eco.agreements
          .filter((g) => ids.has(g.a) || ids.has(g.b))
          .map((g) => `${eco.villages[g.a].name} ↔ ${eco.villages[g.b].name}: ${eco.goodName(g.goods[0])} por ${eco.goodName(g.goods[1])}`)
          .join(' · ');
        const tolls = [...eco.tolls.values()].filter((o) => ids.has(o)).length;
        return `
          <div class="wb-card">
            <button class="wb-card-head" data-village="${k.id}">${this.crest(k)}<b>${members.length > 1 || k.tier >= 2 ? 'Reino de ' : ''}${k.name}</b><em>📍</em></button>
            <div>Povo ${c.name} · ${eco.species[k.species].name} · valoriza ${c.value} · crê em ${c.belief}${wonder}</div>
            <div>${members.length} assentamento${members.length > 1 ? 's' : ''} · ${pop} habitantes · ${ERAS[Math.floor(Math.max(...members.map((v) => v.tech)))]}</div>
            ${stock ? `<div class="wb-dim">${stock}</div>` : ''}
            <div class="wb-dim">Moeda: ${CURRENCY_NAMES[eco.currencyName(k)]}${tolls ? ` · ${tolls} posto${tolls > 1 ? 's' : ''} de pedágio` : ''}</div>
            ${deals ? `<div class="wb-dim">🤝 Acordos: ${deals}</div>` : ''}
            ${rels ? `<div class="wb-rels">${rels}</div>` : ''}
          </div>`;
      })
      .join('');
    return `<div class="wb-grid">${cards}</div>`;
  }

  private speciesHtml(): string {
    const eco = this.eco;
    const f = this.winFilter;
    const known = [...this.state.knownSpecies.values()].filter((sp) => (f === '' ? true : f === 'here' ? eco.species.some((o, s) => o.id === sp.id && eco.population[s] > 0) : f === 'sapient' ? sp.kind === 'sapient' : sp.kind !== 'sapient'));
    const kindName = (sp: Species) => (sp.kind === 'sapient' ? 'Inteligente' : sp.kind === 'fish' ? 'Peixe' : sp.kind === 'shark' ? 'Marinho grande' : sp.kind === 'predator' ? 'Predador' : 'Herbívoro') + (sp.amphibious ? ' · anfíbio' : '');
    const cards = known
      .map((sp) => {
        const s = eco.species.findIndex((o) => o.id === sp.id);
        const pop = s >= 0 ? eco.population[s] : 0;
        const status = s < 0 ? 'Não vive aqui' : eco.extinct.has(s) ? '<span class="bad">Extinta aqui</span>' : `${pop} aqui`;
        const origin = sp.parent ? `variante de ${this.state.knownSpecies.get(sp.parent)?.name ?? '?'}` : sp.origin === EARTH_ID ? 'Terra' : sp.origin === this.params.id ? 'nativa' : sp.origin;
        const img = sp.kind === 'sapient' ? this.icon(`${bodyOf(sp)}:gatherer`, [200, 160, 90], sp.color) : this.icon(spriteOf(sp), sp.color);
        return `
          <div class="wb-sp">
            <div class="wb-sp-img">${img}</div>
            <div><b>${sp.name}</b><div class="wb-dim">${kindName(sp)} · ${origin}</div><div class="wb-dim">${(sp.tempMin - 273).toFixed(0)} a ${(sp.tempMax - 273).toFixed(0)} °C · vive ${Math.round(sp.maxAge)} anos</div><div>${status}</div></div>
            <button class="wb-mini" data-pick="spawn:${sp.id}">Soltar</button>
          </div>`;
      })
      .join('');
    return `${this.filters([['', 'Todas'], ['here', 'Neste planeta'], ['animal', 'Animais'], ['sapient', 'Inteligentes']])}<div class="wb-grid sp">${cards}</div>
      <div class="wb-note">O banco genético da Terra viaja com você. Espécies novas que surgem por evolução entram aqui sozinhas.</div>`;
  }

  private itemsHtml(): string {
    const eco = this.eco;
    const sections = CATEGORIES.map((cat) => {
      const items = ITEMS.filter((it) => it.category === cat)
        .map((it) => {
          const n = eco.crafted.get(it.id) ?? 0;
          const mat = MATERIALS[it.material];
          return `<div class="wb-item ${n ? '' : 'locked'}" title="${it.name}: ${mat.name}, desde a ${ERAS[it.era]}">${this.icon(`item:${it.icon}`, mat.color)}<b>${it.name}</b><span>${n ? `${n} feitos` : 'ainda não'}</span></div>`;
        })
        .join('');
      return `<div class="wb-section">${cat[0].toUpperCase() + cat.slice(1)}s</div><div class="wb-items">${items}</div>`;
    }).join('');
    return `${sections}<div class="wb-note">Os ferreiros fazem o que o minério permite: bronze (cobre + estanho), ferro e aço (ferro + carvão). Ouro vira joia. Na Idade da Pedra, pedra e madeira.</div>`;
  }

  private worldHtml(): string {
    const eco = this.eco;
    const quiet = Math.floor(eco.year - eco.lastMajor);
    const on = (b: boolean) => (b ? 'on' : '');
    return `
      <div class="wb-section">Eventos do mundo</div>
      <div class="wb-filters"><button data-opt="events" class="${on(eco.autoEvents)}">${eco.autoEvents ? 'Eventos aleatórios: ligados' : 'Eventos aleatórios: desligados'}</button></div>
      <div class="wb-filters">${[[0.5, 'Raros'], [1, 'Normais'], [2, 'Frequentes']].map(([r, l]) => `<button data-opt="rate:${r}" class="${on(eco.eventRate === r)}">${l}</button>`).join('')}</div>
      <div class="wb-note">Cometas, terremotos, vulcões, incêndios, secas, pestes, povos nômades, espécies novas e reaparecimentos acontecem de vez em quando. Se ${QUIET_YEARS} anos passam sem nada importante, um deles sacode o mundo. Agora: ${quiet} anos desde o último acontecimento importante.</div>
      <div class="wb-filters"><button data-opt="now">🎲 Provocar um evento agora</button></div>
      <div class="wb-section">Exibição</div>
      <div class="wb-filters"><button data-opt="labels" class="${on(this.showLabels)}">Nomes no mapa</button><button data-opt="territory" class="${on(this.showTerritory)}">Territórios coloridos (T)</button><button data-opt="minor" class="${on(this.showMinor)}">Acontecimentos menores no painel</button></div>
      <div class="wb-section">Camada do mapa</div>
      <div class="wb-filters">${[['kingdoms', 'Reinos'], ['vocation', 'Vocação'], ['economy', 'Economia']].map(([k, l]) => `<button data-opt="layer:${k}" class="${on(this.layer === k)}">${l}</button>`).join('')}</div>
      <div class="wb-note">${this.layer === 'vocation' ? Object.entries(VOCATION_NAMES).map(([k, n]) => `<span style="color:rgb(${VOCATION_COLORS[k as keyof typeof VOCATION_COLORS].join(',')})">■</span> ${VOCATION_ICONS[k as keyof typeof VOCATION_ICONS]} ${n}`).join(' · ') : this.layer === 'economy' ? 'Verde: necessidades atendidas e estoque cheio · amarelo: apertado · vermelho: em crise.' : 'Cada reino com a sua cor; capitais com linha cheia.'}</div>
      <div class="wb-section">Atalhos</div>
      <div class="wb-note">Espaço pausa · 1 a 4 mudam a velocidade · C crônica · R reinos · E espécies · I itens · Esc fecha a janela ou volta à órbita.</div>`;
  }

  private readonly resize = (): void => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
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
      // Fecha o que estiver por cima primeiro (RF-VIDA-349b).
      if (this.crowd) this.showCrowd(null);
      else if (this.vwin) this.openSettlement(null);
      else if (this.win) this.openWindow(null);
      else if (!this.root.querySelector<HTMLElement>('[data-help]')!.hidden) this.toggleHelp();
      else if (this.highlight) {
        this.highlight = null;
        this.textureChanged = true;
      } else if (this.pinned) {
        this.pinned = null;
        this.follow = false;
        this.lastInfoHtml = '';
        this.textureChanged = true;
      } else if (this.tool) {
        this.tool = null;
        this.updateToolbar();
      } else {
        this.onExit();
        return;
      }
    }
    if (input.hit('Space')) this.speed = this.speed ? 0 : 1;
    for (let k = 0; k < SPEEDS.length; k++) if (input.hit(`Digit${k + 1}`)) this.speed = k;
    if (input.hit('KeyH')) this.toggleHelp();
    if (input.hit('KeyT')) {
      this.showTerritory = !this.showTerritory;
      this.lastView = '';
    }
    if (input.hit('KeyP')) this.fold();
    if (input.hit('KeyF')) this.toggleFollow();
    for (const [code, step] of [['BracketLeft', -2], ['BracketRight', 2]] as const) {
      if (!input.hit(code)) continue;
      this.brush = clamp(this.brush + step, 1, 30);
      this.root.querySelector<HTMLInputElement>('[data-b]')!.value = String(this.brush);
    }
    for (const [code, win] of [['KeyC', 'chronicle'], ['KeyR', 'kingdoms'], ['KeyE', 'species'], ['KeyI', 'items']] as const) if (input.hit(code)) this.openWindow(win);
    const pan = 300 / this.zoom;
    this.center.x += ((input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0)) * pan * dt;
    this.center.y += ((input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0)) * pan * dt;
    if (input.wheel) this.zoom = clamp(this.zoom * (input.wheel < 0 ? 1.25 : 0.8), 0.5, 48);
    // Como no WorldBox, a vista não passa dos polos quando o mapa cabe na altura da tela.
    const halfView = window.innerHeight / 2 / this.zoom;
    this.center.y = halfView * 2 < this.map.height ? clamp(this.center.y, halfView, this.map.height - halfView) : this.map.height / 2;
    this.center.x = ((this.center.x % this.map.width) + this.map.width) % this.map.width;

    // Câmera seguindo a criatura fixada (RF-VIDA-333).
    const pin = this.pinned;
    if (this.follow && pin && 'creature' in pin && this.eco.alive[pin.creature] && this.eco.uid[pin.creature] === pin.uid) this.center.set(this.eco.x[pin.creature], this.map.height - this.eco.y[pin.creature]);
    this.updateHover();
    // Quem seria escolhido num clique ganha contorno (RF-VIDA-330).
    this.hoverPick = !this.tool && !this.box && this.hover.x > -1e5 ? this.eco.pick(this.hover.x, this.toRow(this.hover.y), this.pickRadius()) : -1;
    this.useTool(dt);
    this.stepFx(dt);

    // Simulação em passos de no máximo 0,1 s, multiplicados pela velocidade escolhida.
    const simDt = dt * SPEEDS[this.speed];
    if (simDt > 0) {
      this.simClock += simDt;
      while (this.simClock > 0.1) {
        this.eco.step(0.1);
        this.simClock -= 0.1;
      }
    }

    // Parado e sem mudanças, não redesenha.
    const view = `${this.center.x},${this.center.y},${this.zoom},${this.hover.x},${this.hover.y},${this.tool?.id},${this.brush},${this.renderer.getPixelRatio()}`;
    // Seleção, destaque e janela do assentamento pulsam: redesenha mesmo parado.
    const marked = !!this.pinned || !!this.highlight || !!this.vwin || this.hoverPick >= 0;
    if (simDt > 0 || this.textureChanged || view !== this.lastView || this.eco.effects.length || marked || this.particles.length || this.glow) {
      this.lastView = view;
      this.textureChanged = false;
      this.render();
    }
    if (now - this.lastInfo > 150) {
      this.lastInfo = now;
      this.updateInfo();
      this.updateTempReadout();
      this.updatePanel();
      this.updateMinimap(now);
      this.updateWindow();
      this.updateVwin();
      this.updateToast(now);
    }
    this.updateCursor();
    input.endFrame();
  };

  private render(): void {
    // Terremoto: a câmera treme enquanto dura.
    const shake = this.eco.shake > 0 ? Math.min(1, this.eco.shake) * 6 / this.zoom : 0;
    const cx = this.center.x;
    const cy = this.center.y;
    if (shake) this.center.set(cx + (Math.random() - 0.5) * shake, cy + (Math.random() - 0.5) * shake);
    this.renderView();
    this.drawTerritory();
    this.center.set(cx, cy);
  }

  /**
   * Território de cada assentamento na cor do seu reino: área tingida e borda.
   * Assentamentos do mesmo reino têm a mesma cor; povos independentes, outra.
   */
  private drawTerritory(): void {
    const canvas = this.root.querySelector<HTMLCanvasElement>('[data-terr]')!;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    this.drawOpenSettlement(ctx, w, h);
    this.drawSelection(ctx, w, h);
    this.drawFx(ctx, w, h);
    if (!this.showTerritory || this.zoom < 1) return;
    const z = this.zoom;
    for (const v of this.eco.villages) {
      if (v.abandoned) continue;
      const [sx, gy] = this.toScreen(v.x, v.y, z, w, h);
      const sy = h - gy;
      const r = this.eco.radius(v) * z;
      if (sx < -r || sx > w + r || sy < -r || sy > h + r) continue;
      const c = this.layerColor(v).join(',');
      const capital = v.kingdom === v.id;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      // De perto o véu quase some, para não apagar a arte das casas, ruas e plantações.
      const strong = this.layer === 'kingdoms' ? 1 : 2;
      ctx.fillStyle = `rgba(${c},${Math.min(0.18 * strong, Math.max(0.03, (0.7 * strong) / z)).toFixed(3)})`;
      ctx.fill();
      ctx.lineWidth = Math.min(capital ? 4 : 3, Math.max(1.5, z * (capital ? 0.35 : 0.22)));
      ctx.setLineDash(capital ? [] : [z * 0.8, z * 0.5]);
      ctx.strokeStyle = `rgba(${c},0.9)`;
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }

  /** Ponto de tela (canvas das áreas) de uma posição do mapa (x, linha). */
  private screenOf(x: number, row: number, w: number, h: number): [number, number] {
    const [sx, gy] = this.toScreen(x, row, this.zoom, w, h);
    return [sx, h - gy];
  }

  /**
   * Destaque do assentamento com a janela aberta (RF-VIDA-348): área
   * tingida, prédios contornados, minas e porto.
   */
  private drawOpenSettlement(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    if (!this.vwin) return;
    const v = this.eco.villages[this.vwin.id];
    if (!v || v.abandoned) return;
    const z = this.zoom;
    const c = v.color.join(',');
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 300);
    const [cx, cy] = this.screenOf(v.x, v.y, w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, this.eco.radius(v) * z, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${c},0.14)`;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255,240,180,${(0.5 + 0.4 * pulse).toFixed(2)})`;
    ctx.stroke();
    // Rotas das caravanas ligadas ao assentamento (RF-VIDA-348).
    ctx.setLineDash([Math.max(3, z * 0.6), Math.max(2, z * 0.4)]);
    ctx.lineWidth = Math.max(1.5, z * 0.12);
    ctx.strokeStyle = 'rgba(255,240,180,0.7)';
    const mw = this.map.width;
    for (const c of this.eco.caravans) {
      if (c.home !== v.id && c.target !== v.id) continue;
      ctx.beginPath();
      let last = NaN;
      for (const t of c.path) {
        const [px, py] = this.screenOf((t % mw) + 0.5, Math.floor(t / mw) + 0.5, w, h);
        // Na volta do mapa (borda leste-oeste) a linha recomeça do outro lado.
        if (Math.abs(px - last) < w / 2) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        last = px;
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (z < 3) return;
    ctx.lineWidth = Math.max(1, z * 0.12);
    ctx.strokeStyle = 'rgba(255,240,180,0.85)';
    for (const b of v.houses) {
      const size = b.kind === 'port' ? 1 : 2;
      const [x0, y0] = this.screenOf(b.x, b.y, w, h);
      if (b.kind !== 'house') ctx.strokeRect(x0, y0, size * z, size * z);
    }
    ctx.strokeStyle = 'rgba(240,200,96,0.9)';
    for (const id of v.mines) {
      const d = this.eco.deposits[id];
      if (!d) continue;
      const [mx, my] = this.screenOf(d.x + 0.5, d.y + 0.5, w, h);
      ctx.beginPath();
      ctx.arc(mx, my, z * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * Marcadores (RF-VIDA-330, 332, 336 e 337): contorno de quem o clique
   * escolheria, anel pulsante na cor do reino (branco para animais) sobre
   * quem está selecionado, com seta na borda da tela quando sai da vista, e
   * anéis pequenos nos destacados e no grupo.
   */
  private drawSelection(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const eco = this.eco;
    const z = this.zoom;
    const t = performance.now() / 1000;
    const colorOf = (i: number) => (eco.village[i] >= 0 && eco.species[eco.kind[i]].kind === 'sapient' ? eco.villages[eco.village[i]].color.join(',') : '255,255,255');
    const at = (i: number) => {
      const [sx, sy] = this.screenOf(eco.x[i], eco.y[i], w, h);
      // O desenho da criatura fica meio tile acima do ponto dela.
      return [sx, sy - z * 0.5] as const;
    };
    const ring = (i: number, r: number, width: number, alpha: number) => {
      const [sx, sy] = at(i);
      if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) return;
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.lineWidth = width;
      ctx.strokeStyle = `rgba(${colorOf(i)},${alpha.toFixed(2)})`;
      ctx.stroke();
    };
    const base = Math.max(6, z * 0.9);
    for (const i of this.highlighted()) ring(i, base * 0.8, 1.5, 0.85);
    const pin = this.pinned;
    if (pin && 'group' in pin) {
      const set = new Set(pin.group);
      for (let i = 0; i < eco.count; i++) if (eco.alive[i] && set.has(eco.uid[i])) ring(i, base * 0.8, 1.5, 0.9);
    }
    if (this.hoverPick >= 0 && !(pin && 'creature' in pin && pin.creature === this.hoverPick)) {
      const [sx, sy] = at(this.hoverPick);
      ctx.beginPath();
      ctx.arc(sx, sy, base, 0, Math.PI * 2);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.stroke();
    }
    if (!pin || !('creature' in pin) || !eco.alive[pin.creature] || eco.uid[pin.creature] !== pin.uid) return;
    const i = pin.creature;
    const [sx, sy] = at(i);
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const inside = sx >= 0 && sx <= w && sy >= 0 && sy <= h;
    if (inside) {
      ctx.beginPath();
      ctx.arc(sx, sy, base * (1.1 + 0.25 * pulse), 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = `rgba(${colorOf(i)},${(0.7 + 0.3 * pulse).toFixed(2)})`;
      ctx.stroke();
      return;
    }
    // Fora da vista: seta na borda apontando para ela.
    const a = Math.atan2(sy - h / 2, sx - w / 2);
    const m = 24;
    const k = Math.min((w / 2 - m) / Math.max(1e-6, Math.abs(Math.cos(a))), (h / 2 - m) / Math.max(1e-6, Math.abs(Math.sin(a))));
    const ax = w / 2 + Math.cos(a) * k;
    const ay = h / 2 + Math.sin(a) * k;
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, -9);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = `rgba(${colorOf(i)},0.95)`;
    ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /** Cor do assentamento na camada escolhida: reino, vocação ou situação da economia. */
  private layerColor(v: Village): readonly number[] {
    if (this.layer === 'vocation') return v.vocation ? VOCATION_COLORS[v.vocation] : [160, 160, 160];
    if (this.layer === 'economy') {
      const w = v.needs ? welfare(v.needs) : 1;
      const t = Math.max(0, Math.min(1, (w - 0.4) / 0.55));
      return [Math.round(230 - 150 * t), Math.round(70 + 140 * t), 60];
    }
    return v.color;
  }

  private renderView(): void {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.renderSoft(this.renderer.context, size.x, size.y, this.zoom * this.renderer.getPixelRatio());
    this.updateLabels();
  }

  private softCanvas: HTMLCanvasElement | null = null;
  private softImage: ImageData | null = null;
  private softVersion = -1;
  private softArt: SoftArt | null = null;

  /**
   * Desenho em Canvas 2D: o mapa vira um canvas de um pixel por tile,
   * ampliado sem suavização; bem de perto (zoom 8 em diante), por cima vai a
   * arte detalhada feita na CPU (softArt.ts). Os sprites são desenhados por cima.
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
    if (this.softVersion !== this.mapVersion) {
      this.softVersion = this.mapVersion;
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
    // Bem de perto, a arte detalhada, pintada aos poucos em blocos guardados.
    const level = SoftArt.levelFor(z);
    if (level) {
      this.softArt ??= new SoftArt(this.pixels, mw, mh);
      const r0 = Math.max(0, Math.floor(mh - this.center.y - h / 2 / z));
      const r1 = Math.min(mh - 1, Math.ceil(mh - this.center.y + h / 2 / z));
      // Blocos que ainda faltam saem nos próximos quadros.
      if (!this.softArt.draw(ctx, level, z, x0, x1, r0, r1, top, this.center.x, w)) this.textureChanged = true;
    }
    if (z >= 5) {
      // Enfeites (árvores, pedras, trigo) por cima do chão, sempre com a arte original de 16 pixels.
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
          if (kind < 1 || (kind > 7 && kind !== 11 && kind !== 12)) continue;
          ctx.drawImage(this.decorCanvas, (kind - 1) * 16, 0, 16, 16, Math.floor((col - this.center.x) * z + w / 2), Math.floor(sy), size, size);
        }
      }
    }
    this.drawSprites(w, h, z);
    this.sprites.drawSoft(ctx, h);
    if (this.usesBrush() && this.hover.x > -1e5) {
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
    // As chamas das fogueiras trocam de quadro algumas vezes por segundo.
    const flame = Math.floor(performance.now() / 260) % 2 === 0;
    for (const v of eco.villages) {
      if (v.abandoned) continue;
      const era = Math.floor(v.tech);
      const material = eco.materialOf(v);
      const prosperous = economicState(v).label === 'Próspero';
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
        // Estilo da era em que a casa foi feita ou reformada (a cidade mistura estilos na troca de era, RF-VIDA-251);
        // casa reformada ganha um andar e usa o estilo seguinte. Material da região (RF-VIDA-252).
        const style = houseStyle(house.era ?? era, v.tier, house.level ?? 0);
        const sprite =
          house.kind !== 'house'
            ? house.kind
            : material === 'plain'
              ? house.variant
                ? `${style}:${house.variant}`
                : style
              : `${style}:${material}${house.variant % 2 ? ':1' : ''}`;
        buildings.push({ sprite, sx, sy, h: Math.max(3, z * 2), tint: v.color });
        if (!small && house.kind === 'house') {
          // Casa vazia na crise: tábuas nas janelas; assentamento próspero: canteiro de flores (RF-VIDA-254).
          if (house.empty) buildings.push({ sprite: 'boards', sx, sy: sy - 0.01, h: Math.max(3, z * 2), tint: v.color });
          else if (prosperous && (house.x * 7 + house.y * 3) % 3 === 0) {
            const [gx, gy] = this.toScreen(house.x + 2.1, house.y + 2, z, w, h);
            buildings.push({ sprite: 'garden', sx: gx, sy: gy + 0.01, h: z * 0.55, tint: v.color });
          }
        }
        // Olaria acesa: fumaça saindo da chaminé.
        if (!small && house.kind === 'pottery') buildings.push({ sprite: flame ? 'smoke' : 'smoke2', sx: sx + z * 0.45, sy: sy + z * 2.05, h: z * 0.5, tint: v.color });
        // Obra em andamento (construção ou reforma): andaime por cima.
        if (!small && (house.workUntil ?? 0) > eco.year) buildings.push({ sprite: 'scaffold', sx, sy: sy - 0.01, h: z * 1.75, tint: v.color });
        // Na Idade da Pedra, algumas cabanas têm uma fogueira no quintal.
        if (!small && era === 0 && house.kind === 'house' && house.variant === 1) {
          const [cx, cy] = this.toScreen(house.x + 2.3, house.y + 2, z, w, h);
          buildings.push({ sprite: flame ? 'campfire' : 'campfire2', sx: cx, sy: cy, h: z * 0.6, tint: v.color });
        }
      }
      // Cercados de pasto e o rebanho pastando dentro deles (RF-VIDA-215 e 216).
      if (!small && v.pens) {
        const animal = v.herd ? HERD_SPRITES[v.herd.kind] : '';
        // Parte do rebanho pode estar no pasto alto (RF-VIDA-293).
        let left = (v.herd?.head ?? 0) - (v.herd?.away ?? 0);
        const now = performance.now() / 1000;
        for (const pen of v.pens) {
          const [px, py] = this.toScreen(pen.x + 1, pen.y + 2, z, w, h);
          if (px < -margin || px > w + margin || py < -margin || py > h + margin) continue;
          buildings.push({ sprite: 'pen', sx: px, sy: py + 0.02, h: z * 2, tint: v.color });
          // Até 3 bichos por cercado, andando devagar de um lado para o outro.
          const shown = animal ? Math.min(3, left) : 0;
          for (let k = 0; k < shown; k++) {
            const seed = (pen.x * 7 + pen.y * 13 + k * 31) % 17;
            const ox = 0.45 + 1.1 * (0.5 + 0.5 * Math.sin(now * 0.25 + seed));
            const oy = 0.55 + 0.35 * k + 0.1 * Math.sin(now * 0.4 + seed * 2);
            const [ax, ay] = this.toScreen(pen.x + ox, pen.y + oy + 0.5, z, w, h);
            const facing = Math.cos(now * 0.25 + seed) < 0 && SPRITES[`${animal}:l`] ? `${animal}:l` : animal;
            buildings.push({ sprite: facing, sx: ax, sy: ay, h: z * 0.62, tint: HERD_TINT[v.herd!.kind] });
          }
          left -= shown;
        }
      }
      if (!small) {
        const [fx, fy] = this.toScreen(v.x, v.y + 1.5, z, w, h);
        const capital = v.kingdom === v.id && eco.kingdomSize(v) > 1;
        // Idade da Pedra: a praça é uma fogueira, mesmo nas cidades; depois, poço ou fortaleza.
        if (era === 0) buildings.push({ sprite: flame ? 'bonfire' : 'bonfire2', sx: fx, sy: fy, h: z * 1.25, tint: v.color });
        else if (v.tier >= 2) {
          buildings.push({ sprite: capital ? 'castle' : 'keep', sx: fx, sy: fy, h: z * (capital ? 2 : 2.6), tint: v.color });
          // Bandeira com o brasão do reino na fortaleza (RF-VIDA-288).
          const king = eco.villages[v.kingdom];
          buildings.push({ sprite: `flag:${king.vocation ?? 'none'}`, sx: fx + z * 0.15, sy: fy + z * (capital ? 2.6 : 3.1), h: z * 1.1, tint: king.color });
        } else buildings.push({ sprite: 'well', sx: fx, sy: fy, h: z * 1.3, tint: v.color });
        if (era >= 4 && z >= 6) this.pushLamps(v, buildings, z, w, h, margin);
        // Feira anual no verão: barracas em volta da praça (RF-VIDA-234).
        if (v.fair === Math.floor(eco.year) && eco.season() === 1) {
          for (const [ox, oy] of [[-2.6, -0.2], [2.6, -0.2], [-0.9, -2.3], [1.4, 2.4]]) {
            const [bx, by] = this.toScreen(v.x + ox, v.y + oy + 1, z, w, h);
            buildings.push({ sprite: 'stall', sx: bx, sy: by, h: z * 0.8, tint: STALL_TINTS[(Math.abs(Math.round(ox * 3 + oy)) + v.id) % STALL_TINTS.length] });
          }
        }
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
    // Ruínas de construções destruídas por desastres.
    if (!small) {
      for (const r of eco.ruins) {
        const [sx, sy] = this.toScreen(r.x, r.y, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        buildings.push({ sprite: 'ruin', sx, sy, h: z * 1.25, tint: [150, 150, 150] });
      }
    }
    // Postos de pedágio nos passos de montanha (RF-VIDA-286).
    if (!small) {
      for (const [t, owner] of eco.tolls) {
        const o = eco.villages[owner];
        if (!o || o.abandoned) continue;
        const [sx, sy] = this.toScreen((t % this.map.width) + 0.5, Math.floor(t / this.map.width) + 1, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        buildings.push({ sprite: 'toll', sx, sy, h: z * 0.9, tint: eco.villages[o.kingdom].color });
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
      // Barco mercante leva caixotes no convés (RF-VIDA-235).
      if (b.sunk < 0 && b.purpose === 'trade') layer.push('crates', sx - b.facing * z * 0.2, sy - z * 0.4 + bob + px * 3, z * 0.35, tint);
      // Bandeira do reino no mastro (RF-VIDA-288).
      if (b.sunk < 0 && z >= 4) {
        const king = eco.villages[eco.villages[b.village].kingdom];
        layer.push(`flag:${king.vocation ?? 'none'}`, sx + z * 0.1, sy - z * 0.4 + bob + rows * px, z * 0.55, king.color);
      }
    }
    this.pushCaravans(layer, z, w, h, margin, small);
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
        const body = bodyOf(sp);
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
      const name: SpriteName = spriteOf(sp);
      // Altura pelo tamanho da espécie; os bichos olham para onde andam.
      const height = (name === 'fish' ? 0.5 : name === 'shark' ? 0.55 : name === 'whale' ? 0.7 : 0.85) * (sp.size ?? 1);
      const flipped = eco.vx[i] < 0 && SPRITES[`${name}:l`] ? `${name}:l` : name;
      layer.push(flipped, sx, sy - z * 0.5, z * height, tint);
    }
    this.drawEffects(layer, w, h, z, margin);
    layer.end();
  }

  /**
   * Caravanas (RF-VIDA-230): o comerciante na frente, os animais de carga
   * atrás, com fardos no lombo na Idade da Pedra, carroça do Bronze ao Ferro
   * e carroção coberto depois. Na transumância, o pastor e o rebanho.
   */
  private pushCaravans(layer: SpriteLayer, z: number, w: number, h: number, margin: number, small: boolean): void {
    const eco = this.eco;
    for (const c of eco.caravans) {
      const home = eco.villages[c.home];
      const [sx, sy] = this.toScreen(c.x, c.y, z, w, h);
      if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
      if (small) {
        layer.push('dot', sx, sy, Math.max(2, z), home.color);
        continue;
      }
      const left = c.facing < 0;
      const behind = (k: number): [number, number] => this.toScreen(c.x - c.facing * k, c.y + 0.05 * (k % 2), z, w, h);
      const sp = eco.species[home.species];
      if (c.kind === 'flock') {
        const name = HERD_SPRITES[c.animal] ?? 'sheep';
        const shown = Math.min(5, c.animals);
        for (let k = shown; k >= 1; k--) {
          const [ax, ay] = this.toScreen(c.x - c.facing * (0.7 + 0.55 * k), c.y + 0.35 * ((k * 7) % 3 - 1), z, w, h);
          layer.push(left && SPRITES[`${name}:l`] ? `${name}:l` : name, ax, ay - z * 0.5, z * 0.62, HERD_TINT[c.animal] ?? [220, 220, 220]);
        }
        layer.push(`${bodyOf(sp)}:shepherd`, sx, sy - z * 0.5, z * 1.05 * (11 / 9), home.color, sp.color);
        continue;
      }
      const animal = c.animal === 'donkey' ? 'donkey' : c.animal;
      const tint = c.animal === 'donkey' ? [132, 122, 112] : (HERD_TINT[c.animal] ?? [140, 100, 70]);
      const n = Math.max(1, Math.min(3, c.animals));
      // De trás para a frente: carroça, animais, comerciante.
      if (c.cart > 0) {
        const cart = c.cart >= 2 ? 'wagon' : 'cart';
        const [cx, cy] = behind(0.8 + n * 0.85);
        layer.push(left ? `${cart}:l` : cart, cx, cy - z * 0.5, z * (c.cart >= 2 ? 0.95 : 0.7), home.color);
      }
      for (let k = n; k >= 1; k--) {
        const [ax, ay] = behind(0.15 + k * 0.85);
        layer.push(left ? `${animal}:l` : animal, ax, ay - z * 0.5, z * 0.72, tint);
        if (c.cart === 0) layer.push(left ? 'packs:l' : 'packs', ax - c.facing * z * 0.05, ay - z * 0.5 + z * 0.42, z * 0.32, tint);
      }
      layer.push(`${bodyOf(sp)}:merchant`, sx, sy - z * 0.5, z * 1.05 * (11 / 9), home.color, sp.color);
    }
  }

  /** Lampiões nas ruas principais e na avenida da Era Industrial. */
  private pushLamps(v: Village, out: { sprite: SpriteName; sx: number; sy: number; h: number; tint: readonly number[] }[], z: number, w: number, h: number, margin: number): void {
    const eco = this.eco;
    const r = Math.ceil(eco.radius(v));
    const cx = Math.floor(v.x);
    const cy = Math.floor(v.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (((cx + dx) * 3 + (cy + dy) * 5) % 7 !== 0) continue;
        const t = this.tileIndex(cx + dx, this.map.height - (cy + dy) - 1);
        if (t < 0 || !eco.mainStreet[t] || !(eco.road[t] === 2 || eco.road[t] === AVENUE)) continue;
        const [sx, sy] = this.toScreen(cx + dx + 0.85, cy + dy + 1, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        out.push({ sprite: 'lamp', sx, sy, h: z * 0.8, tint: v.color });
      }
    }
  }

  /** Efeitos de eventos (cometa caindo, explosão, fumaça, fogo, peste) e marcadores de guerra. */
  private drawEffects(layer: SpriteLayer, w: number, h: number, z: number, margin: number): void {
    const eco = this.eco;
    const white = [255, 255, 255];
    for (const fx of eco.effects) {
      const t = fx.age / fx.life;
      let x = fx.x;
      let y = fx.y;
      let size = Math.max(fx.size, 1) * z;
      let sprite: SpriteName = fx.kind;
      if (fx.kind === 'comet') {
        // Desce do céu em diagonal até o ponto de impacto.
        x -= (1 - t) * 30;
        y -= (1 - t) * 40;
        size = z * 3;
      } else if (fx.kind === 'boom') {
        // A explosão só aparece quando o cometa chega (depois de 2 s) e cresce.
        const start = 2 / fx.life;
        if (t < start && fx.life > 3) continue;
        size *= 0.6 + 0.4 * Math.min(1, (t - start) * 4);
      } else if (fx.kind === 'smoke') {
        y -= t * 4;
        size *= 1 + t;
      } else if (fx.kind === 'flame') {
        size = z * (1 + 0.2 * Math.sin(fx.age * 12 + fx.x));
      } else if (fx.kind === 'quake') {
        size = z * 1.2;
      } else size = z * 1.6;
      const [sx, sy] = this.toScreen(x, y, z, w, h);
      if (sx < -margin * 4 || sx > w + margin * 4 || sy < -margin * 4 || sy > h + margin * 4) continue;
      layer.push(sprite, sx, sy, size, white);
    }
    // Espadas cruzadas sobre os alvos das guerras em andamento.
    if (z >= 1.5) {
      for (const war of eco.wars) {
        const v = eco.villages[war.target];
        const [sx, sy] = this.toScreen(v.x, v.y - 4.5, z, w, h);
        if (sx < -margin || sx > w + margin || sy < -margin || sy > h + margin) continue;
        layer.push('swords', sx, sy, Math.max(10, z * 1.6), white);
      }
    }
  }

  /** Nomes das aldeias (como no WorldBox), visíveis com zoom. */
  private updateLabels(): void {
    const container = this.root.querySelector<HTMLElement>('[data-l]')!;
    const show = this.showLabels && this.zoom >= 2.5;
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
        el.dataset.vid = String(v.id);
        container.appendChild(el);
        this.labels.set(v.id, el);
      }
      el.hidden = false;
      // Ícone simples da vocação antes do nome e os ícones de estado depois (RF-VIDA-224 e 349).
      const icon = v.vocation ? `${VOCATION_ICONS[v.vocation]} ` : '';
      const marks = stateIcons(this.eco, v);
      const text =
        (v.kingdom === v.id && this.eco.kingdomSize(v) > 1
          ? `♛ ${icon}Reino de ${v.name} · ${v.population}`
          : `${icon}${TIER_NAMES[v.tier]} ${v.name} · ${v.population}`) + (marks ? ` ${marks}` : '');
      el.classList.toggle('open', this.vwin?.id === v.id);
      if (el.textContent !== text) el.textContent = text;
      const color = `rgb(${v.color.join(',')})`;
      if (el.style.borderLeftColor !== color) el.style.borderLeftColor = color;
      el.title = `${v.kingdom === v.id ? `Povo ${v.culture.name}` : `Reino de ${this.eco.capitalOf(v).name} · povo ${v.culture.name}`} · clique para abrir a janela`;
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
    const opts: ToolOpts = { target: this.targetC + 273.15, limit: this.limitOn };
    if (tool.apply) {
      const r = this.brush;
      this.forBrush(this.hover.x, this.hover.y, r, (i, d) => tool.apply!(this.map, i, (1 - d / (r + 1)) * dt * 30, opts));
      // O que o terreno novo não sustenta (rua na água, casa no barranco, mina afogada) some junto (seção 19.18).
      this.eco.sweep(this.hover.x, this.toRow(this.hover.y), r);
    } else {
      tool.act?.(this, this.hover.x, this.hover.y);
    }
    if (tool.fx) this.emitFx(tool, dt);
  }

  /** Animação a usar: o Ajustar esquenta ou esfria conforme o alvo está acima ou abaixo da temperatura do ponto. */
  private fxOf(tool: Tool): FxKind | undefined {
    if (tool.id !== 'adjust') return tool.fx;
    const i = this.tileIndex(this.hover.x, this.hover.y);
    return i >= 0 && this.targetC + 273.15 < temperatureAt(this.map, i) ? 'cool' : 'heat';
  }

  /** Solta partículas dentro do pincel enquanto a ferramenta age e acende o brilho (animação de cada ação). */
  private emitFx(tool: Tool, dt: number): void {
    const kind = this.fxOf(tool);
    if (!kind) return;
    const def = FX[kind];
    this.glow = { kind, alpha: 1 };
    const rate = 30 + this.brush * this.brush * 0.9;
    const n = Math.min(20, Math.round(rate * dt + Math.random()));
    for (let k = 0; k < n && this.particles.length < 700; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = Math.sqrt(Math.random()) * this.brush;
      const life = def.kind === 'ring' ? 1.1 : def.kind === 'streak' ? 0.6 : 0.8 + Math.random() * 0.9;
      this.particles.push({
        x: this.hover.x + Math.cos(a) * d,
        y: this.hover.y + Math.sin(a) * d,
        vx: def.vx + (Math.random() - 0.5) * def.spread,
        vy: def.vy * (0.6 + Math.random() * 0.8),
        age: def.kind === 'streak' ? 0 : Math.random() * 0.2,
        life,
        kind: def.kind,
        size: def.size * (0.7 + Math.random() * 0.6),
        rgb: def.rgb,
      });
    }
  }

  private stepFx(dt: number): void {
    for (let k = this.particles.length - 1; k >= 0; k--) {
      const p = this.particles[k];
      p.age += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.age >= p.life) this.particles.splice(k, 1);
    }
    if (this.glow && !this.painting) {
      this.glow.alpha -= dt * 2.5;
      if (this.glow.alpha <= 0) this.glow = null;
    }
  }

  /** Brilho colorido sobre o pincel e as partículas, por cima do mapa (canvas dos territórios). */
  private drawFx(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    const z = this.zoom;
    const sx = (x: number) => (x - this.center.x) * z + w / 2;
    const sy = (y: number) => h / 2 - (y - this.center.y) * z;
    const g = this.glow;
    if (g && this.hover.x > -1e5) {
      const [r, gr, b, a] = FX[g.kind].glow;
      const cx = sx(this.hover.x);
      const cy = sy(this.hover.y);
      const rad = this.brush * z;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
      const pulse = 0.85 + 0.15 * Math.sin(performance.now() / 120);
      grad.addColorStop(0, `rgba(${r},${gr},${b},${(a * g.alpha * pulse).toFixed(3)})`);
      grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.particles) {
      const t = p.age / p.life;
      const alpha = (1 - t) * (p.kind === 'ring' ? 0.8 : 0.9);
      const [r, gr, b] = p.rgb;
      const x = sx(p.x);
      const y = sy(p.y);
      if (x < -20 || x > w + 20 || y < -20 || y > h + 20) continue;
      const px = Math.max(1.5, p.size * z);
      ctx.fillStyle = `rgba(${r},${gr},${b},${alpha.toFixed(3)})`;
      ctx.strokeStyle = ctx.fillStyle;
      if (p.kind === 'streak') {
        ctx.lineWidth = Math.max(1, z * 0.06);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * z * 0.05, y - p.vy * z * 0.05);
        ctx.stroke();
      } else if (p.kind === 'ring') {
        ctx.lineWidth = Math.max(1, z * 0.08);
        ctx.beginPath();
        ctx.arc(x, y, px * (1 + t * 4), 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'chunk') {
        ctx.fillRect(x, y, px, px);
      } else if (p.kind === 'spark') {
        ctx.fillRect(x - px / 2, y, px, px / 3);
        ctx.fillRect(x - px / 6, y - px / 3, px / 3, px);
      } else {
        ctx.beginPath();
        ctx.arc(x, y, px * (p.kind === 'dust' ? 0.5 + t : 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
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
    if (road === 5) {
      const v = this.eco.settlementAt(i % this.map.width + 0.5, Math.floor(i / this.map.width) + 0.5) ?? this.eco.villages.find((o) => o.pens?.some((p) => (p.x === i % this.map.width || p.x + 1 === i % this.map.width) && (p.y === Math.floor(i / this.map.width) || p.y + 1 === Math.floor(i / this.map.width))));
      return v?.herd ? `Pasto · ${v.herd.head} ${HERD_NAMES[v.herd.kind]} de ${v.name}` : 'Pasto cercado';
    }
    if (road === 3) return 'Praça';
    if (road) return 'Rua';
    if (!this.eco.built[i]) return null;
    const w = this.map.width;
    const x = i % w;
    const y = Math.floor(i / w);
    for (const v of this.eco.villages) {
      for (const h of v.houses) {
        const size = h.kind === 'port' ? 0 : 1;
        if (y >= h.y && y <= h.y + size && (x - h.x + w) % w <= size) return `${h.kind === 'wonder' ? WONDER_NAMES[v.culture.value] : BUILDING_NAMES[h.kind]} · ${v.name}`;
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
    const allies = eco.villages.filter((o) => !o.abandoned && o.kingdom === o.id && o.id !== v.kingdom && eco.allied(o.id, v.kingdom)).map((o) => o.name);
    return `
      <b>${TIER_NAMES[v.tier]} ${v.name}${capital !== v ? ` · Reino de ${capital.name}` : ''}</b>
      <span>Povo ${c.name} · valoriza ${c.value} · crê n${c.belief.startsWith('a') ? 'a' : 'o'}${c.belief.startsWith('os') || c.belief.startsWith('as') ? 's' : ''} ${c.belief.split(' ').slice(1).join(' ')}</span>
      ${v.vocation ? `<span>${VOCATION_ICONS[v.vocation]} Vocação ${VOCATION_NAMES[v.vocation].toLowerCase()}${v.herd ? ` · rebanho de ${v.herd.head} ${HERD_NAMES[v.herd.kind]}` : ''}</span>` : ''}
      ${v.completeness !== undefined ? `<span>Planta ${Math.round(v.completeness * 100)}%${v.missing ? ` · falta ${v.missing}` : ' · completa'}</span>` : ''}
      ${this.economyLines(v)}
      ${stock ? `<span>${stock}</span>` : ''}
      ${need ? `<span>Para a próxima era: ${need}</span>` : ''}
      ${war ? `<span>⚔ Em guerra com ${enemy}</span>` : ''}
      ${allies.length ? `<span>❤ Aliado de ${allies.join(', ')}</span>` : ''}
      ${DEBUG ? `<span class="wb-debug">${eco.rates(v).map((r) => `${r.name} ${r.perYear.toFixed(2).replace('.', ',')}`).join(' · ')}</span>` : ''}
      <hr>`;
  }

  /**
   * Necessidades, estabilidade e a balança do ano passado (painel de
   * economia, RF-VIDA-217): o que mais se produziu, o que mais se gastou e
   * o que está faltando.
   */
  private economyLines(v: Village): string {
    if (!v.needs) return '';
    const eco = this.eco;
    const n = v.needs;
    const low = NEEDS.filter((k) => n[k] < 0.7);
    const needs = `<span>Necessidades ${Math.round(welfare(n) * 100)}%${low.length ? ` · falta ${low.map((k) => NEED_NAMES[k]).join(', ')}` : ' · tudo atendido'} · estabilidade ${Math.round((v.stability ?? 1) * 100)}%</span>`;
    const names = new Map<string, string>([...STOCK_NAMES.map(([k, l]) => [k, l.toLowerCase()] as [string, string]), ['food', 'comida']]);
    const rows = Object.entries(v.ledger ?? {}).filter(([k]) => names.has(k));
    const top = (i: 0 | 1) =>
      rows
        .filter(([, e]) => e[i] >= 1)
        .sort((a, b) => b[1][i] - a[1][i])
        .slice(0, 3)
        .map(([k, e]) => `${names.get(k)} ${Math.round(e[i])}`)
        .join(', ');
    const made = top(0);
    const used = top(1);
    const full = rows.filter(([k]) => {
      const have = k === 'food' ? v.food : v.stock[k as keyof typeof v.stock];
      return typeof have === 'number' && have >= eco.capOf(v, k as never) * 0.95;
    });
    const season = SEASONS[eco.season()];
    return `${needs}
      ${made || used ? `<span>Ano passado: fez ${made || 'nada'} · gastou ${used || 'nada'}${full.length ? ` · sobra ${full.map(([k]) => names.get(k)).join(', ')}` : ''}</span>` : ''}
      <span>Agora é ${season}</span>`;
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

  /** Barras de energia e saúde (saúde: energia e o peso da idade). */
  private vitals(i: number): string {
    const eco = this.eco;
    const sp = eco.species[eco.kind[i]];
    const v = eco.village[i] >= 0 ? eco.villages[eco.village[i]] : null;
    const life = sp.kind === 'sapient' ? sp.maxAge * (1 + 0.12 * Math.floor(v?.tech ?? 0)) : sp.maxAge;
    const old = Math.max(0, (eco.age[i] - life * 0.6) / (life * 0.4));
    const health = Math.max(0, Math.min(1, 0.4 + eco.energy[i] * 0.6) * (1 - 0.7 * Math.min(1, old)));
    return `<span class="wb-line">Energia ${bar(eco.energy[i], `${Math.round(eco.energy[i] * 100)}%`)}</span>
      <span class="wb-line">Saúde ${bar(health, `${Math.round(health * 100)}%`)}</span>`;
  }

  /** O que a pessoa leva: a ferramenta da profissão, armas se o assentamento tem. */
  private carries(i: number): string {
    const eco = this.eco;
    const v = eco.villages[eco.village[i]];
    const era = Math.floor(v.tech);
    const role = ROLES[eco.role[i]];
    const metal = era >= 1 && v.stock.tools > 0;
    const tools: Partial<Record<typeof role, string>> = {
      hunter: era >= 1 ? 'arco e flechas' : 'lança de pedra',
      farmer: metal ? 'enxada de metal' : 'enxada de madeira',
      woodcutter: metal ? 'machado de metal' : 'machado de pedra',
      miner: metal ? 'picareta' : 'cunha de pedra',
      builder: 'martelo',
      blacksmith: 'martelo e tenaz',
      fisher: 'rede',
      shepherd: 'cajado',
      merchant: 'mercadoria',
      soldier: v.stock.weapons > 0 ? 'arma do arsenal' : 'lança de madeira',
      guard: v.stock.weapons > 0 ? 'arma do arsenal' : 'porrete',
      gatherer: 'cesto',
    };
    return tools[role] ?? '';
  }

  /** Ficha completa da criatura (RF-VIDA-335). */
  private creatureCard(i: number): string {
    const eco = this.eco;
    const sp = eco.species[eco.kind[i]];
    const vi = eco.village[i];
    const v = vi >= 0 ? eco.villages[vi] : null;
    const following = this.pinned && 'creature' in this.pinned && this.pinned.creature === i;
    const follow = following ? `<button class="wb-btn" data-act="follow">${this.follow ? '⏹ Parar de seguir (F)' : '🎥 Seguir (F)'}</button>` : '';
    const doing = `<span>Agora: ${eco.activityOf(i)}</span>`;
    if (sp.kind !== 'sapient') {
      const diet = sp.kind === 'herbivore' ? 'plantas' : sp.kind === 'fish' ? 'algas e plâncton' : sp.kind === 'shark' ? 'peixes' : sp.omnivore ? 'carne, frutos e raízes' : 'carne';
      let group = 0;
      let threat = '';
      let td = Infinity;
      for (const j of eco.pickAll(eco.x[i], eco.y[i], 8)) {
        const o = eco.species[eco.kind[j]];
        const d = Math.hypot(eco.x[j] - eco.x[i], eco.y[j] - eco.y[i]);
        if (eco.kind[j] === eco.kind[i] && d <= 6) group++;
        if (j !== i && (o.kind === 'predator' || o.kind === 'shark') && sp.kind !== 'predator' && sp.kind !== 'shark' && d < td) {
          td = d;
          threat = `${o.name} a ${Math.round(d)} tiles`;
        }
      }
      const gname = sp.kind === 'fish' || sp.kind === 'shark' ? 'cardume' : sp.kind === 'predator' ? 'matilha' : 'bando';
      return `
        <b>${sp.name} · ${animalStage(eco.age[i], sp.maturity, sp.maxAge)}</b>
        <span>Idade ${eco.age[i].toFixed(0)} de até ${Math.round(sp.maxAge)} anos</span>
        ${this.vitals(i)}
        ${doing}
        <span>Come ${diet}</span>
        <span>${group > 1 ? `Num ${gname} de ${group}` : 'Sozinho por aqui'}</span>
        ${threat ? `<span class="bad">Predador por perto: ${threat}</span>` : ''}
        ${follow}`;
    }
    const name = v ? fullName(eco, i) : sp.name;
    const role = eco.role[i];
    const job = v ? `${role === CHILD ? '🧒' : ROLE_ICONS[ROLES[role]]} ${this.lifeStage(i)}` : 'Sem assentamento';
    const fam = eco.familyOf(i);
    const person = (j: number) => `<button class="wb-link" data-uid="${eco.uid[j]}">${personName(eco.uid[j], v?.culture.id ?? 0)}</button>`;
    const born = eco.bornAt[i] >= 0 ? eco.villages[eco.bornAt[i]] : null;
    const story = [
      born ? `nasceu em ${born.name} no ano ${Math.max(0, Math.floor(eco.bornYear[i]))}` : `chegou de fora${eco.bornYear[i] >= 0 ? `, nascido por volta do ano ${Math.floor(eco.bornYear[i])}` : ''}`,
      v && eco.movedAt[i] >= 0 && (!born || born.id !== v.id) ? `mudou para ${v.name} no ano ${Math.floor(eco.movedAt[i])}` : '',
    ].filter(Boolean).join(', ');
    const carry = v && role !== CHILD ? this.carries(i) : '';
    return `
      <b>${name}</b>
      <span>${sp.name} · ${job}</span>
      <span>Idade ${eco.age[i].toFixed(0)} anos</span>
      ${this.vitals(i)}
      ${doing}
      ${v ? `<span>Mora em <button class="wb-link" data-village="${v.id}">${TIER_NAMES[v.tier]} ${v.name}</button>${v.kingdom !== v.id ? ` · Reino de ${eco.capitalOf(v).name}` : ''}</span>` : ''}
      ${v ? `<span>Família ${familyName(eco.family[i], v.culture.id)}${fam.parent >= 0 ? ` · filho(a) de ${person(fam.parent)}` : ''}${fam.children.length ? ` · filhos: ${fam.children.slice(0, 5).map(person).join(', ')}${fam.children.length > 5 ? ` e mais ${fam.children.length - 5}` : ''}` : ''}</span>` : ''}
      ${carry ? `<span>Leva ${carry}</span>` : ''}
      ${story ? `<span class="wb-dim">${story[0].toUpperCase()}${story.slice(1)}.</span>` : ''}
      ${follow}`;
  }

  /** Resumo do grupo escolhido com Shift + arrastar (RF-VIDA-336). */
  private groupCard(uids: number[]): string {
    const eco = this.eco;
    const set = new Set(uids);
    const species = new Map<string, number>();
    const jobs = new Map<string, number>();
    let energy = 0;
    let n = 0;
    for (let i = 0; i < eco.count; i++) {
      if (!eco.alive[i] || !set.has(eco.uid[i])) continue;
      n++;
      energy += eco.energy[i];
      const sp = eco.species[eco.kind[i]];
      species.set(sp.name, (species.get(sp.name) ?? 0) + 1);
      if (sp.kind === 'sapient' && eco.village[i] >= 0) jobs.set(this.lifeStage(i), (jobs.get(this.lifeStage(i)) ?? 0) + 1);
    }
    if (!n) return '<b>Grupo</b><span>Ninguém do grupo está vivo.</span>';
    const list = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]).map(([k, c]) => `${k} ${c}`).join(' · ');
    return `
      <b>Grupo de ${n}</b>
      <span>${list(species)}</span>
      ${jobs.size ? `<span>${list(jobs)}</span>` : ''}
      <span class="wb-line">Energia média ${bar(energy / n, `${Math.round((energy / n) * 100)}%`)}</span>`;
  }

  /** Balão leve do assentamento sob o mouse (RF-VIDA-349); o detalhe fica na janela. */
  private settlementHover(v: Village): string {
    const st = economicState(v);
    const marks = stateIcons(this.eco, v);
    return `
      <b>${TIER_NAMES[v.tier]} ${v.name}${marks ? ` ${marks}` : ''}</b>
      <span>${v.population} moradores${v.vocation ? ` · ${VOCATION_ICONS[v.vocation]} ${VOCATION_NAMES[v.vocation]}` : ''} · <span class="${st.tone}">${st.label.toLowerCase()}</span></span>
      <span class="wb-dim">Clique no nome, na praça ou num prédio para abrir a janela</span>
      <hr>`;
  }

  /** Leitura da temperatura sob o mouse e do que o pincel alcança ali (teto e piso por tile), na aba Clima. */
  private updateTempReadout(): void {
    const el = this.root.querySelector<HTMLElement>('[data-tnow]');
    if (!el) return;
    const i = this.tileIndex(this.hover.x, this.hover.y);
    if (i < 0) {
      el.textContent = '';
      return;
    }
    const t = temperatureAt(this.map, i);
    const base = t - this.map.heat[i];
    const c = (k: number) => (k - 273.15).toFixed(0);
    el.textContent = `Aqui ${c(t)} °C · alcance do pincel ${c(base - 150)} a ${c(base + 400)} °C`;
  }

  private updateInfo(): void {
    const el = this.root.querySelector<HTMLElement>('[data-i]')!;
    const eco = this.eco;
    // Ficha fixada: segue a criatura (enquanto viver) ou fica no lugar clicado.
    let at = this.hover;
    let picked = -1;
    const pin = this.pinned;
    if (pin && 'creature' in pin) {
      if (eco.alive[pin.creature] && eco.uid[pin.creature] === pin.uid) {
        picked = pin.creature;
        at = new THREE.Vector2(eco.x[picked], this.map.height - eco.y[picked]);
      } else {
        // Morreu: avisa e solta (RF-VIDA-333).
        const d = eco.deaths.find((x) => x.uid === pin.uid);
        if (d) {
          const cause = DEATH_TEXT[d.cause];
          eco.hint = `${this.lastName ?? 'Quem você seguia'} morreu${cause ? ` ${cause}` : ''} aos ${Math.floor(d.age)} anos`;
        }
        this.pinned = null;
        this.follow = false;
        this.textureChanged = true;
      }
    } else if (pin && 'x' in pin) at = new THREE.Vector2(pin.x, pin.y);
    let html: string;
    if (pin && 'group' in pin) {
      html = this.groupCard(pin.group);
    } else {
      const i = this.tileIndex(at.x, at.y);
      if (i < 0) {
        el.hidden = true;
        return;
      }
      if (!pin) picked = this.hoverPick;
      if (picked >= 0) {
        html = this.creatureCard(picked);
        if (this.pinned && 'creature' in this.pinned) this.lastName = this.shortName(picked).split(',')[0];
      } else {
        const t = temperatureAt(this.map, i);
        const place = this.placeAt(i);
        const v = eco.settlementAt(at.x, this.toRow(at.y));
        html = `
          ${v ? (pin ? this.settlementInfo(v) : this.settlementHover(v)) : ''}
          <b>${place ?? BIOME_NAMES[this.map.biome[i] as keyof typeof BIOME_NAMES]}</b>
          <span>Altitude ${(this.map.elevation[i] * 100).toFixed(0)}</span>
          <span>Temperatura ${(t - 273.15).toFixed(0)} °C</span>
          <span>Umidade ${(this.map.moisture[i] * 100).toFixed(0)}%</span>
          <span>Vegetação ${(this.map.vegetation[i] * 100).toFixed(0)}%</span>`;
      }
    }
    el.hidden = false;
    el.classList.toggle('pinned', !!this.pinned);
    if (this.pinned) html = `<div class="wb-pin">📌 Fixado · Esc ou clique no vazio solta</div>${html}`;
    if (html !== this.lastInfoHtml) {
      this.lastInfoHtml = html;
      el.innerHTML = html;
    }
  }

  /** Nome de quem está fixado, para o aviso da morte. */
  private lastName: string | null = null;

  /** Quanto falta para a próxima era no assentamento mais avançado. */
  private progressLine(live: { tech: number }[]): string {
    if (!live.length) return '';
    const top = Math.max(...live.map((v) => v.tech));
    const era = Math.floor(top);
    if (era >= ERAS.length - 1) return ' · última era';
    return ` · rumo à ${ERAS[era + 1]}: ${Math.floor((top - era) * 100)}%`;
  }

  /** Painel lateral: ano, era, velocidade, população, povos, guerras e acontecimentos importantes. */
  private updatePanel(): void {
    const eco = this.eco;
    const live = eco.villages.filter((v) => !v.abandoned);
    const kingdoms = live.filter((v) => v.kingdom === v.id).length;
    const era = live.length ? ERAS[Math.floor(Math.max(...live.map((v) => v.tech)))] : 'Sem civilização';
    const alive = eco.species.map((sp, s) => ({ sp, n: eco.population[s] })).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    const rows = alive
      .slice(0, 7)
      .map(({ sp, n }) => `<button class="wb-goto wb-pop" data-species="${eco.species.indexOf(sp)}" title="Destacar no mapa; clique de novo para ir ao próximo"><i style="background:rgb(${sp.color.join(',')})"></i>${sp.name}<b>${n}</b></button>`)
      .join('');
    const more = alive.length > 7 ? `<button class="wb-goto" data-open="species">+ ${alive.length - 7} espécies…</button>` : '';
    const events = eco.chronicle.filter((e) => this.showMinor || e.major).slice(0, 6);
    const clock = `
      <div class="wb-clock-text"><b>${era}</b><span>Ano ${Math.floor(eco.year)}${this.progressLine(live)}</span></div>
      <div class="wb-speed">${SPEEDS.map((v, k) => `<button data-speed="${k}" class="${k === this.speed ? 'on' : ''}" title="${v === 0 ? 'Pausa (Espaço)' : `Velocidade ${v}x (${k + 1})`}">${v === 0 ? '❚❚' : `${v}x`}</button>`).join('')}</div>`;
    if (clock !== this.lastClockHtml) {
      this.lastClockHtml = clock;
      this.root.querySelector<HTMLElement>('[data-clock]')!.innerHTML = clock;
    }
    const html = `
      <div class="wb-section">População</div>
      ${rows || '<div class="wb-empty">Nenhuma espécie. Leve uma pela aba Vida.</div>'}
      ${more}
      <div class="wb-section">Povos</div>
      <div class="wb-pop">Assentamentos<b>${live.length}</b></div>
      ${kingdoms ? `<button class="wb-goto" data-open="kingdoms">Reinos e povos<b>${kingdoms}</b></button>` : ''}
      ${eco.alliances.size ? `<div class="wb-pop">Alianças<b>${eco.alliances.size}</b></div>` : ''}
      ${eco.wars.map((war) => `<button class="wb-goto bad" data-village="${war.target}">⚔ ${eco.villages[war.a].name} × ${eco.villages[war.b].name}<b>${war.losses[0] + war.losses[1]}†</b></button>`).join('')}
      ${[...live].sort((a, b) => b.population - a.population).slice(0, 4).map((v) => `<button class="wb-goto" data-village="${v.id}"><i style="background:rgb(${v.color.join(',')})"></i>${TIER_NAMES[v.tier]} ${v.name}<b>${v.population}</b></button>`).join('')}
      ${events.length ? `<div class="wb-section">Acontecimentos</div>${events.map((e) => `<button class="wb-log"${e.x >= 0 ? ` data-go="${e.x.toFixed(1)},${e.y.toFixed(1)}"` : ''}><span class="wb-yr">${Math.floor(e.year)}</span> ${Ecosystem.describe(e)}</button>`).join('')}<button class="wb-goto" data-open="chronicle">Crônica completa…</button>` : ''}`;
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
      `terra ${Math.round((land / total) * 100)}% · vegetação ${Math.round((life / total) * 100)}% · 1 ano = ${YEAR_SECONDS / Math.max(1, SPEEDS[this.speed])} s`;
  }

  private toastUntil = 0;

  /** Avisos curtos (lugar inválido etc.) num balão que some sozinho. */
  private updateToast(now: number): void {
    const el = this.root.querySelector<HTMLElement>('[data-toast]')!;
    if (this.eco.hint) {
      el.textContent = this.eco.hint;
      el.hidden = false;
      this.eco.hint = '';
      this.toastUntil = now + 2500;
    } else if (now > this.toastUntil) el.hidden = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.abort.abort();
    this.input.dispose();
    if (this.ready) {
      this.eco.onTileChanged = () => {};
      this.sprites.dispose();
      this.atlas.dispose();
    }
    this.root.remove();
    // Devolve a tela ao renderizador do 3D.
    if (this.renderer !== this.shared) {
      this.renderer.domElement.remove();
      this.shared.domElement.style.display = '';
    }
    this.shared.setClearColor(0x000000);
    this.shared.renderLists.dispose();
  }
}
