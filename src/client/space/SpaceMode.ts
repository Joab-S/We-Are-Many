import { icon as svgIcon } from '../ui/icons';
import * as THREE from 'three';
import { bvToTemperature, temperatureToRgb } from '../../core/astro';
import { adaptiveMaxSpeed, directionalDistance, formatDistance, formatSpeed } from '../../core/flight';
import { stepSpeedFactor, THROTTLE, Turbo, TURBO } from '../../core/shipControl';
import { AU_PER_PC } from '../../core/units';
import {
  createNavState,
  etaSeconds,
  formatEta,
  POI_INTEREST,
  rankSuggestions,
  starInterest,
  type Candidate,
  type NavTarget,
  type Suggestion,
} from '../../nav/guide';
import { findPoi, POI_LABEL, poisNear, TUTORIAL_POI, type Poi } from '../../nav/poi';
import {
  COMET_RADIUS,
  cometOffset,
  cometPath,
  describeSystem,
  generateSystem,
  LIFE_LABEL,
  lifeTierOf,
  SOL_ID,
  starVisualRadius,
  summarize,
  systemViewRadius,
  VISITOR_WINDOW_S,
  visitorComet,
  type CometData,
  type StarInfo,
  type SystemData,
} from '../../nav/systemGen';
import { Input } from '../input';
import type { GameRenderer } from '../renderer';
import type { AdaptiveResolution } from '../quality';
import type { GameState } from '../state';
import {
  circlePoints,
  compressOrbit,
  createCometBody,
  createOrbitLine,
  createPathLine,
  createPlanetBody,
  createPoiBody,
  createStarBody,
  disposeGlowTexture,
  getGlowTexture,
  planetOffset,
  SOL_PLANETS,
  type Body,
  type PlanetData,
} from './bodies';
import { GuideHud, type NavEntry, type TargetView } from './GuideHud';
import { ProbeControl, type MineSource } from './ProbeControl';
import { createProbeState, freeProbes } from '../../explore/probes';
import { StarField, type CatalogStar } from './starField';

/** Distância (pc) em que o sistema de uma estrela passa a ser desenhado. */
const SYSTEM_ENTER_PC = 0.05;
const SYSTEM_EXIT_PC = 0.06;
const MOUSE_SENSITIVITY = 0.0022;
/** Velocidade de curva com A/D, em rad/s. */
const TURN_RATE = 1.25;
/** Quão rápido a direção do movimento acompanha o nariz da nave (deriva nas curvas). */
const GRIP = 2.2;
const BASE_FOV = 70;
const STREAKS = 220;
/** Alcance da varredura de longo alcance (V). */
const SCAN_RANGE_PC = 4;
const SCAN_COOLDOWN_MS = 5000;
/** Pontos de interesse desenhados em 3D até esta distância. */
const POI_DRAW_PC = 1;
/** Pontos de interesse listados no GUIA até esta distância. */
const POI_LIST_PC = 6;
/** Dentro deste raio o GUIA detecta pontos de interesse sozinho, sem varredura. */
const POI_PASSIVE_PC = 0.15;
/** Nebulosas brilham: são vistas de longe. */
const NEBULA_SEEN_PC = 3;
/** Sem alvo e sem novidade por este tempo, o GUIA oferece uma sugestão. */
const IDLE_HINT_MS = 45000;
const MANUAL_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'];

export interface SpaceCallbacks {
  onObserve(planet: PlanetData): void;
}

interface LocalSystem {
  starId: number;
  info: StarInfo;
  data: SystemData;
  star: Body;
  planets: Body[];
  comets: Body[];
  cometData: CometData[];
  group: THREE.Group;
  /** Cometa visitante da janela de tempo atual (não faz parte do sistema fixo). */
  visitor: { window: number; body: Body | null; path: THREE.Object3D | null };
}

interface Label {
  el: HTMLDivElement;
  visible: boolean;
}

type NearbyStar = CatalogStar & { distAu: number };

const KIND_LABEL: Record<PlanetData['kind'], string> = { rocky: 'Rochoso', gas: 'Gigante gasoso', ice: 'Gigante de gelo' };
const KIND_COLOR: Record<PlanetData['kind'], string> = { rocky: '#7fd18b', gas: '#e3c08a', ice: '#8fd8ff' };

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;
const toTuple = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];

function starCss(ci: number): string {
  const [r, g, b] = temperatureToRgb(bvToTemperature(ci));
  return `rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)})`;
}

function poiArrive(p: Poi): number {
  if (p.kind === 'nebula') return p.radius * 1.3;
  if (p.kind === 'brown-dwarf') return p.radius * 6;
  if (p.kind === 'rogue') return p.radius * 4;
  return Math.max(p.radius * 12, 1e-4);
}

/**
 * Modo de exploração 3D: campo de estrelas em chunks, sistemas locais, nave
 * com voo livre e velocidade adaptativa, e o GUIA para navegar. A câmera
 * fica sempre na origem e o mundo é transladado em torno dela (origem
 * flutuante, RNF-05).
 */
/** Fita da bússola: rumo da proa no plano da eclíptica (N é +y), 3 px por grau, repetida para dar a volta. */
const CMP_PX = 3;
const COMPASS_TAPE = (() => {
  const names: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
  let html = '';
  for (let d = -180; d <= 540; d += 15) {
    const n = names[((d % 360) + 360) % 360];
    html += `<i class="${n ? 'big' : ''}" style="left:${(d + 180) * CMP_PX}px">${n ? `<b>${n}</b>` : ''}</i>`;
  }
  return html;
})();

/** Barra de comandos embaixo: tecla, ícone e nome. Clicar faz o mesmo que apertar a tecla; o resto fica na busca (G ou Ctrl K). */
const CMDS: [string, string, string][] = [
  ['KeyJ', 'auto', 'Piloto automático'],
  ['KeyC', 'cruise', 'Cruzeiro'],
  ['KeyV', 'scan', 'Varredura'],
  ['KeyM', 'probe', 'Sonda'],
  ['KeyB', 'flag', 'Marcador'],
];

export class SpaceMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 1e-6, 1e10);
  private readonly overlay = new THREE.Scene();
  private readonly overlayCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 100);
  private readonly ship = new THREE.Group();
  private readonly engineGlow: THREE.Sprite;
  private readonly overlayLight = new THREE.DirectionalLight(0xffffff, 2.2);
  private readonly starLight = new THREE.PointLight(0xffffff, 3, 0, 0);
  private readonly input: Input;
  private readonly stars: StarField;
  private readonly guide: GuideHud;
  private readonly probes: ProbeControl;
  private readonly velocity = new THREE.Vector3();
  private readonly hudRoot: HTMLDivElement;
  private readonly tmpFwd = new THREE.Vector3();
  private readonly origin = new THREE.Vector3();
  private readonly hudEls: Record<string, HTMLElement> = {};
  private readonly labels = new Map<string, Label>();
  private readonly poiBodies = new Map<string, { poi: Poi; body: Body }>();
  private system: LocalSystem | null = null;
  private nearestStar: NearbyStar | null = null;
  private nearbyStars: NearbyStar[] = [];
  private entries: NavEntry[] = [];
  private suggestions: Suggestion[] = [];
  private suggestionIndex = -1;
  private view: TargetView | null = null;
  /** Distância ao corpo mais próximo, atualizada no HUD; serve à estimativa de chegada. */
  private departDistance = Infinity;
  private orbitBody: Body | null = null;
  private throttle = 1;
  /** Fração do teto de velocidade pedida pelo piloto (-0,3..1). */
  private speedFactor = 0;
  private readonly turbo = new Turbo();
  private turboBlend = 0;
  /** Rotação do mouse ainda não aplicada, suavizada ao longo de alguns frames. */
  private pendingYaw = 0;
  private pendingPitch = 0;
  /** Velocidade angular atual da curva com A/D (rad/s). */
  private turnRate = 0;
  private climb = 0;
  private readonly streaks: THREE.LineSegments;
  private readonly streakSeeds: Float32Array;
  private lastNearest = 0;
  private lastHud = 0;
  private scanReadyAt = 0;
  private lastNews = performance.now();
  private frames = 0;
  private fps = 0;
  private fpsTime = 0;
  private raf = 0;
  private lastTime = performance.now();
  private bank = 0;
  private cameraRoll = 0;

  constructor(
    private readonly renderer: GameRenderer,
    private readonly resolution: AdaptiveResolution,
    private readonly state: GameState,
    hud: HTMLElement,
    private readonly callbacks: SpaceCallbacks,
  ) {
    this.state.nav ??= createNavState();
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.08), this.starLight);
    this.stars = new StarField(state.manifest);
    this.scene.add(this.stars.group);
    this.input = new Input(renderer.domElement, true);

    this.engineGlow = this.buildShip();
    this.streakSeeds = new Float32Array(STREAKS * 3);
    for (let i = 0; i < this.streakSeeds.length; i++) this.streakSeeds[i] = Math.random() * 2 - 1;
    this.streaks = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(STREAKS * 6), 3)),
      new THREE.LineBasicMaterial({ color: 0x9fc4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.streaks.frustumCulled = false;
    this.overlay.add(this.streaks);
    this.overlay.add(this.ship, this.overlayLight, new THREE.AmbientLight(0x8899bb, 0.6));

    this.hudRoot = document.createElement('div');
    this.hudRoot.className = 'space-hud';
    this.hudRoot.innerHTML = `
      <div class="hud-panel hud-top-left">
        <button class="sp-head" data-a="probes" title="Mostrar ou esconder as sondas">${svgIcon('ship')}<span>We Are Many</span>${svgIcon('play', 'chev')}</button>
        <div class="sp-row">${svgIcon('bolt')}<span>Potência</span><b data-h="throttle"></b></div>
        <div class="sp-row turbo">${svgIcon('cruise')}<span>Turbo</span><span class="turbo-bar"><i data-h="turbo"></i></span></div>
        <div class="sp-row">${svgIcon('probe')}<span>Sondas</span><b data-h="probes"></b></div>
      </div>
      <div class="hud-compass">
        <div class="cmp-view"><div class="cmp-tape" data-h="tape">${COMPASS_TAPE}</div></div>
        <div class="cmp-row">
          <span>${svgIcon('sun')}<b data-h="system"></b></span>
          <span class="on">${svgIcon('planet')}<b data-h="nearest"></b></span>
          <span>${svgIcon('target')}<b data-h="distance"></b></span>
          <span>${svgIcon('play')}<b data-h="speed"></b></span>
        </div>
      </div>
      <div class="hud-panel hud-top-right" data-h="dev" hidden>
        <div><span class="k">FPS</span> <b data-h="fps"></b></div>
        <div><span class="k">Chunks</span> <b data-h="chunks"></b></div>
        <div><span class="k">Estrelas carregadas</span> <b data-h="stars"></b></div>
        <div><span class="k">Memória GPU</span> <b data-h="memory"></b></div>
        <div><span class="k">Resolução</span> <b data-h="resolution"></b></div>
        <div><span class="k">Posição</span> <b data-h="position"></b></div>
      </div>
      <button class="dev-pill" data-a="dev" title="Dados técnicos"><i></i>DEV</button>
      <div class="hud-crosshair"></div>
      <div class="hud-orbit hud-panel" data-h="orbit" hidden></div>
      <div class="hud-help">
        ${CMDS.map(([key, ico, name]) => `<button class="cmd" data-key="${key}" title="${name} (${key.replace('Key', '')})">${svgIcon(ico)}<span>${name}</span><kbd>${key.replace('Key', '')}</kbd></button>`).join('')}
      </div>
      <div class="hud-labels" data-h="labels"></div>
      <div class="hud-lock" data-h="lock">Clique para pilotar</div>`;
    hud.appendChild(this.hudRoot);
    // Botões com tecla (barra de comandos, cartões) fazem o mesmo que apertar a tecla.
    this.hudRoot.addEventListener('click', (e) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-key], [data-a]');
      if (!el) return;
      e.stopPropagation();
      if (el.dataset.a === 'probes') this.hudRoot.classList.toggle('show-probes');
      else if (el.dataset.a === 'dev') this.hudEls.dev.hidden = !this.hudEls.dev.hidden;
      else {
        const code = el.dataset.key!;
        window.dispatchEvent(new KeyboardEvent('keydown', { code }));
        window.dispatchEvent(new KeyboardEvent('keyup', { code }));
      }
    });
    this.hudRoot.querySelectorAll<HTMLElement>('[data-h]').forEach((el) => {
      this.hudEls[el.dataset.h!] = el;
    });

    this.guide = new GuideHud(this.hudRoot, {
      select: (t) => this.setTarget(t),
      engage: (t) => this.engage(t),
      search: (text) => this.searchStars(text),
      bookmarkRemove: (id) => {
        this.state.nav.bookmarks = this.state.nav.bookmarks.filter((b) => b.id !== id);
        if (this.state.nav.target?.id === id) this.clearTarget();
        this.refreshNav(performance.now());
      },
    });
    this.state.probes ??= createProbeState();
    this.probes = new ProbeControl(this.hudRoot, this.state.probes, this.scene, (text, tone) => this.guide.say(text, tone), (text) => this.addLog(text));
    if (!this.state.nav.greeted) {
      this.state.nav.greeted = true;
      this.guide.say('GUIA on-line. Estou aqui para ajudar a navegar: G abre o painel, V faz uma varredura e N aceita minhas sugestões.', 'good', 12);
      this.guide.say('Comece pelo sinal fraco na borda do Sistema Solar: aperte N e depois J.', 'info', 12);
    }

    this.resize();
    window.addEventListener('resize', this.resize);
    this.raf = requestAnimationFrame(this.frame);
  }

  private buildShip(): THREE.Sprite {
    const hull = new THREE.MeshStandardMaterial({ color: 0xc9d3e6, flatShading: true, metalness: 0.3, roughness: 0.5 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x3d7bff, flatShading: true, emissive: 0x0a2a80 });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.1, 6), hull);
    body.rotation.x = -Math.PI / 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.04, 0.38), hull);
    wing.position.set(0, -0.02, 0.22);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.26, 0.3), accent);
    fin.position.set(0, 0.13, 0.32);
    const tipL = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.4), accent);
    tipL.position.set(-0.65, -0.02, 0.22);
    const tipR = tipL.clone();
    tipR.position.x = 0.65;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0x66aaff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
    );
    glow.position.set(0, 0, 0.6);
    this.ship.add(body, wing, fin, tipL, tipR, glow);
    this.ship.position.set(0, -0.7, -3.4);
    this.ship.scale.setScalar(0.6);
    return glow;
  }

  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.lastW = w;
    this.lastH = h;
    this.lastDpr = window.devicePixelRatio || 1;
    this.resolution.reset();
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.overlayCamera.aspect = w / h;
    this.overlayCamera.updateProjectionMatrix();
  };

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (window.innerWidth !== this.lastW || window.innerHeight !== this.lastH || (window.devicePixelRatio || 1) !== this.lastDpr) {
      this.resize();
    }
    this.resolution.frame(now - this.lastTime, now);
    // Teto alto para o passo: em PCs lentos (sem placa de vídeo) a viagem não fica em câmera lenta.
    // A velocidade adaptativa anda no máximo ~10% da distância ao obstáculo por passo, então é seguro.
    const dt = Math.min((now - this.lastTime) / 1000, 0.25);
    this.lastTime = now;
    this.state.time += dt;
    this.frames++;
    if (now - this.fpsTime > 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsTime);
      this.frames = 0;
      this.fpsTime = now;
    }

    this.handleKeys(now);
    this.updateSystem();
    this.updateBodies();
    this.view = this.resolveTarget();
    this.fly(dt);
    this.probes.frame(dt, this.state.shipPos, (id) => this.mineSources(false).find((s) => s.id === id) ?? null, this.state.time);
    this.stars.update(this.state.shipPos, now, this.resolution.pixelRatio);
    if (now - this.lastNearest > 250) {
      this.lastNearest = now;
      this.refreshNav(now);
    }
    this.placeObjects();
    this.handleOrbit();

    this.renderer.autoClear = false;
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, this.overlayCamera);

    if (now - this.lastHud > 100) {
      this.lastHud = now;
      this.updateHud();
    }
    this.updateLabels();
    this.guide.frame(this.state.shipPos, this.state.shipQuat, this.camera, this.view, this.velocity);
    this.input.endFrame();
  };

  private handleKeys(now: number): void {
    const input = this.input;
    const nav = this.state.nav;
    // Atalhos de teste da Fase 0 para saltar entre estrelas.
    const jumpToStar = (name: string) => {
      const id = [...this.state.names].find(([, n]) => n === name)?.[0];
      const star = id !== undefined ? this.stars.find(id) : null;
      if (!star) return;
      this.state.shipPos.copy(star.pos).add(new THREE.Vector3(0.012 * AU_PER_PC, 0, 0));
      this.lookAt(star.pos);
    };
    if (input.hit('Digit1')) {
      const earth = SOL_PLANETS[2];
      const pos = planetOffset(earth, this.state.time, new THREE.Vector3());
      this.state.shipPos.copy(pos).add(new THREE.Vector3(0.01, 0.005, 0.003));
      this.lookAt(pos);
    }
    if (input.hit('Digit2')) jumpToStar('Rigil Kentaurus');
    if (input.hit('Digit3')) jumpToStar('Sirius');

    if (input.hit('KeyG')) this.guide.togglePanel();
    if (input.hit('KeyC')) {
      nav.cruise = !nav.cruise;
      if (nav.cruise) nav.autopilot = false;
      this.guide.say(nav.cruise ? 'Cruzeiro ligado: a nave mantém a velocidade sem segurar W.' : 'Cruzeiro desligado.');
    }
    if (input.hit('KeyJ')) {
      if (nav.autopilot) {
        nav.autopilot = false;
        this.guide.say('Piloto automático desligado.');
      } else {
        const t = nav.target ?? this.suggestions[0]?.target;
        if (t) this.engage(t);
        else this.guide.say('Sem alvo. Escolha um no painel (G), trave na mira (T) ou faça uma varredura (V).', 'warn');
      }
    }
    if (input.hit('KeyN')) {
      if (!this.suggestions.length) this.guide.say('Sem sugestões por perto. Tente uma varredura (V).', 'warn');
      else {
        this.suggestionIndex = (this.suggestionIndex + 1) % this.suggestions.length;
        const s = this.suggestions[this.suggestionIndex];
        this.setTarget(s.target, `${s.reason}. Aperte J para ir.`);
      }
    }
    if (input.hit('KeyM')) this.probes.send(this.probes.pick(false), this.state.shipPos);
    if (input.hit('KeyR')) this.probes.send(this.probes.pick(true), this.state.shipPos);
    if (input.hit('KeyT')) this.lockAtCrosshair();
    if (input.hit('KeyV')) this.scan(now);
    if (input.hit('KeyB')) this.addBookmark();
    if (input.hit('KeyH')) this.setTarget(this.homeTarget(), 'Rota para casa. Aperte J para ir.');
    if (input.hit('KeyX') && nav.target) {
      this.clearTarget();
      this.guide.say('Alvo removido.');
    }
  }

  private lookAt(target: THREE.Vector3): void {
    const m = new THREE.Matrix4().lookAt(this.state.shipPos, target, new THREE.Vector3(0, 0, 1));
    this.state.shipQuat.setFromRotationMatrix(m);
    this.velocity.set(0, 0, 0);
    this.speedFactor = 0;
    this.pendingYaw = 0;
    this.pendingPitch = 0;
    this.state.nav.autopilot = false;
  }

  private starInfo(s: { id: number; absmag: number; ci: number }): StarInfo {
    return { id: s.id, name: this.state.names.get(s.id) ?? (s.id === SOL_ID ? 'Sol' : `HYG ${s.id}`), absmag: s.absmag, ci: s.ci };
  }

  /** Cria ou descarta o sistema da estrela mais próxima. */
  private updateSystem(): void {
    const ship = this.state.shipPos;
    if (this.system) {
      if (ship.distanceTo(this.system.star.pos) > SYSTEM_EXIT_PC * AU_PER_PC) this.disposeSystem();
      return;
    }
    let candidate: { id: number; pos: THREE.Vector3; absmag: number; ci: number } | null = null;
    if (ship.length() < SYSTEM_ENTER_PC * AU_PER_PC) {
      candidate = { id: SOL_ID, pos: new THREE.Vector3(), absmag: 4.85, ci: 0.656 };
    } else if (this.nearestStar && this.nearestStar.pos.distanceTo(ship) < SYSTEM_ENTER_PC * AU_PER_PC) {
      candidate = this.nearestStar;
    }
    if (!candidate) return;
    const info = this.starInfo(candidate);
    const data = generateSystem(info);
    const star = createStarBody(info.name, candidate.pos, candidate.absmag, candidate.ci);
    star.radius = starVisualRadius(info);
    const group = new THREE.Group();
    group.add(star.object);
    const planets: Body[] = [];
    for (const p of data.planets) {
      const body = createPlanetBody(p, this.state.surfaces);
      planets.push(body);
      group.add(body.object);
      const orbit = createOrbitLine(p);
      orbit.name = 'orbit';
      group.add(orbit);
    }
    if (data.planets.length) {
      // Zona habitável: faixa verde entre duas linhas, para o jogador ver onde a vida é possível.
      for (const a of data.habitable) {
        const line = createPathLine(circlePoints(compressOrbit(a)), 0x48c878, 0.28);
        line.name = 'orbit';
        group.add(line);
      }
    }
    const comets: Body[] = [];
    for (const c of data.comets) {
      const body = createCometBody(c.id, c.name, COMET_RADIUS);
      comets.push(body);
      group.add(body.object);
      const path = createPathLine(cometPath(c), 0x7fb8d8, 0.16);
      path.name = 'orbit';
      group.add(path);
    }
    this.scene.add(group);
    this.system = { starId: candidate.id, info, data, star, planets, comets, cometData: [...data.comets], group, visitor: { window: -1, body: null, path: null } };
    this.nearestStar = this.stars.nearest(ship, candidate.id);
    this.announceSystem(info, data);
    this.swapVisitor(Math.floor(this.state.time / VISITOR_WINDOW_S), true);
  }

  private announceSystem(info: StarInfo, data: SystemData): void {
    const nav = this.state.nav;
    const summary = summarize(data);
    const first = !nav.visitedStars.has(info.id);
    nav.visitedStars.add(info.id);
    nav.scannedStars.add(info.id);
    this.lastNews = performance.now();
    const text = describeSystem(summary);
    if (first) {
      this.addLog(`Primeira visita ao sistema ${info.name}: ${text}.`);
      this.guide.say(`Sistema ${info.name}: ${text}.${data.catalogued ? ' Planetas de catálogo real.' : ''}`, 'good', 9);
    } else this.guide.say(`Entrando no sistema ${info.name}: ${text}.`);
  }

  private disposeSystem(): void {
    if (!this.system) return;
    this.scene.remove(this.system.group);
    disposeObject(this.system.group);
    this.system = null;
    this.orbitBody = null;
    this.renderOrbitMenu();
  }

  /** Move planetas e cometas; a nave em órbita acompanha o planeta. */
  private updateBodies(): void {
    if (!this.system) return;
    const tmp = new THREE.Vector3();
    // Com o piloto automático indo a um corpo que se move, a nave acompanha o movimento dele
    // na reta final; sem isso ela persegue o planeta sem nunca alcançar a órbita.
    const nav = this.state.nav;
    const chasing = (b: Body) => nav.autopilot && nav.target?.id === (b.planet?.id ?? b.id) && b.pos.distanceTo(this.state.shipPos) < b.radius * 40;
    for (const b of this.system.planets) {
      const prev = tmp.copy(b.pos);
      planetOffset(b.planet!, this.state.time, b.pos).add(this.system.star.pos);
      if ((this.orbitBody === b || chasing(b)) && prev.lengthSq() > 0) this.state.shipPos.add(prev.sub(b.pos).negate());
      b.object.getObjectByName('surface')!.rotation.y = this.state.time * 0.05;
    }
    const sys = this.system;
    const window = Math.floor(this.state.time / VISITOR_WINDOW_S);
    if (window !== sys.visitor.window) this.swapVisitor(window, false);
    sys.comets.forEach((b, i) => {
      const prev = tmp.copy(b.pos);
      const realR = cometOffset(sys.cometData[i], this.state.time, b.pos);
      b.pos.add(sys.star.pos);
      if (chasing(b) && prev.lengthSq() > 0) this.state.shipPos.add(prev.sub(b.pos).negate());
      b.object.userData.realR = realR;
    });
  }

  /** Troca o cometa visitante quando muda a janela de tempo. */
  private swapVisitor(window: number, entering: boolean): void {
    const sys = this.system!;
    const old = sys.visitor;
    if (old.body) {
      sys.group.remove(old.body.object, old.path!);
      disposeObject(old.body.object);
      disposeObject(old.path!);
      const i = sys.comets.indexOf(old.body);
      sys.comets.splice(i, 1);
      sys.cometData.splice(i, 1);
    }
    sys.visitor = { window, body: null, path: null };
    const c = visitorComet(sys.data, window);
    if (!c) return;
    const body = createCometBody(c.id, c.name, COMET_RADIUS);
    const path = createPathLine(cometPath(c), 0xb8e0ff, 0.12);
    path.name = 'orbit';
    sys.group.add(body.object, path);
    sys.comets.push(body);
    sys.cometData.push(c);
    sys.visitor = { window, body, path };
    this.addLog(`Cometa visitante ${entering ? 'passando por' : 'entrou em'} ${sys.info.name}: ${c.name}.`);
    this.guide.say(`${entering ? 'Há um cometa visitante passando agora' : 'Um cometa visitante entrou no sistema'}: ${c.name}. Bom alvo para uma sonda (gelo e voláteis).`, 'good', 9);
  }

  private bodies(): Body[] {
    const list = this.system ? [this.system.star, ...this.system.planets, ...this.system.comets] : [];
    for (const { body, poi } of this.poiBodies.values()) if (poi.kind !== 'nebula') list.push(body);
    return list;
  }

  /** Distância até a superfície visível mais próxima, em UA. */
  private distanceToNearestSurface(): { dist: number; name: string } {
    let best = { dist: Infinity, name: '—' };
    for (const b of this.bodies()) {
      const d = b.pos.distanceTo(this.state.shipPos) - b.radius;
      if (d < best.dist) best = { dist: d, name: b.name };
    }
    if (this.nearestStar) {
      const d = this.nearestStar.pos.distanceTo(this.state.shipPos) - starVisualRadius(this.starInfo(this.nearestStar));
      if (d < best.dist) best = { dist: d, name: this.starInfo(this.nearestStar).name };
    }
    return best;
  }

  /**
   * Distância que define o teto de velocidade: os obstáculos à frente contam
   * inteiros e os de trás contam bem menos (seção 3.5). Com piloto
   * automático, o próprio alvo é um obstáculo, para a nave chegar freando.
   */
  private speedDistance(dir: THREE.Vector3): number {
    const ship = this.state.shipPos;
    const rel = new THREE.Vector3();
    let best = Infinity;
    const consider = (pos: THREE.Vector3, radius: number) => {
      rel.subVectors(pos, ship);
      const len = rel.length();
      const cos = len > 0 ? rel.dot(dir) / len : 1;
      best = Math.min(best, directionalDistance(Math.max(len - radius, 0), cos));
    };
    // Cometas, destroços e sinais são minúsculos: não seguram a nave (a colisão continua valendo).
    for (const b of this.bodies()) if (b.kind !== 'comet' && b.radius > 1e-3) consider(b.pos, b.radius);
    for (let i = 0; i < Math.min(12, this.nearbyStars.length); i++) {
      const s = this.nearbyStars[i];
      consider(s.pos, starVisualRadius(this.starInfo(s)));
    }
    // O piso de meia distância de chegada evita o "rastejar" exponencial no fim.
    if (this.state.nav.autopilot && this.view) best = Math.min(best, Math.max(this.view.dist - this.view.arrive, this.view.arrive * 0.5));
    return best;
  }

  private fly(dt: number): void {
    const input = this.input;
    const nav = this.state.nav;
    const q = this.state.shipQuat;
    const k = (code: string) => (input.down(code) ? 1 : 0);

    if (nav.autopilot) {
      const manual = MANUAL_KEYS.some((c) => input.hit(c)) || (input.locked && Math.abs(input.mouseDx) + Math.abs(input.mouseDy) > 40);
      if (manual || !this.view) {
        nav.autopilot = false;
        if (manual) this.guide.say('Piloto automático desligado: você assumiu o controle.');
      }
    }

    let yawStep = 0;
    let pitchStep = 0;
    let roll = 0;
    if (nav.autopilot && this.view) {
      // Vira suavemente para o alvo e só acelera quando está alinhado.
      const dir = this.view.pos.clone().sub(this.state.shipPos).normalize();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const aim = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, up));
      q.slerp(aim, 1 - Math.exp(-2.4 * dt)).normalize();
      this.pendingYaw = 0;
      this.pendingPitch = 0;
      this.turnRate = THREE.MathUtils.lerp(this.turnRate, 0, 1 - Math.exp(-4 * dt));
      const aligned = new THREE.Vector3(0, 0, -1).applyQuaternion(q).dot(dir);
      this.speedFactor = stepSpeedFactor(this.speedFactor, aligned > 0.92 ? 1 : this.speedFactor > 0.15 ? -1 : 0, dt);
    } else {
      // Mira com o mouse, suavizada para o movimento não ficar duro.
      if (input.locked) {
        this.pendingYaw += -input.mouseDx * MOUSE_SENSITIVITY;
        this.pendingPitch += -input.mouseDy * MOUSE_SENSITIVITY;
      }
      const aim = 1 - Math.exp(-14 * dt);
      yawStep = this.pendingYaw * aim;
      pitchStep = this.pendingPitch * aim;
      this.pendingYaw -= yawStep;
      this.pendingPitch -= pitchStep;

      // A/D fazem a curva com inércia: a curva entra e sai suavemente.
      const steer = k('KeyA') - k('KeyD');
      this.turnRate = THREE.MathUtils.lerp(this.turnRate, steer * TURN_RATE, 1 - Math.exp(-4 * dt));
      roll = k('KeyQ') - k('KeyE');
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(pitchStep, yawStep + this.turnRate * dt, roll * 1.4 * dt, 'YXZ')));
      q.normalize();
      // Acelerador com arrancada, freio e deslize (ou velocidade mantida no cruzeiro).
      this.speedFactor = stepSpeedFactor(this.speedFactor, (k('KeyW') - k('KeyS')) as -1 | 0 | 1, dt, THROTTLE, nav.cruise);
    }
    if (input.wheel) this.throttle = THREE.MathUtils.clamp(this.throttle - input.wheel * 0.1, 0.1, 1);

    // Tab no lugar de Ctrl: Ctrl+W fecha a aba do navegador e não pode ser bloqueado.
    this.turbo.step(input.down('Tab') && this.speedFactor > 0.05, dt);
    this.turboBlend = THREE.MathUtils.lerp(this.turboBlend, this.turbo.active ? 1 : 0, 1 - Math.exp(-(this.turbo.active ? 3 : 1.5) * dt));
    // O ganho do turbo entra e sai em rampa, sem tranco.
    const turboMul = 1 + (TURBO.multiplier - 1) * this.turboBlend;

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const moveDir = this.speedFactor < 0 ? forward.clone().negate() : forward;
    const maxSpeed = adaptiveMaxSpeed(this.speedDistance(moveDir)) * turboMul;
    this.climb = THREE.MathUtils.lerp(
      this.climb,
      nav.autopilot ? 0 : k('Space') - (input.down('ShiftLeft') || input.down('ShiftRight') ? 1 : 0),
      1 - Math.exp(-5 * dt),
    );
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const desired = forward
      .clone()
      .multiplyScalar(this.speedFactor * maxSpeed * this.throttle)
      .addScaledVector(up, this.climb * 0.5 * maxSpeed * this.throttle);
    // O vetor velocidade segue o nariz com atraso: nas curvas a nave desliza um pouco.
    this.velocity.lerp(desired, 1 - Math.exp(-GRIP * dt));
    // O teto cai imediatamente ao se aproximar de algo, para a nave nunca atravessar um planeta.
    if (this.velocity.length() > maxSpeed) this.velocity.setLength(maxSpeed);
    this.state.shipPos.addScaledVector(this.velocity, dt);

    // Distância mínima: a nave nunca entra numa estrela ou planeta (RF-NAV-05).
    for (const b of this.bodies()) {
      const minDist = b.radius * (b.kind === 'star' ? 2 : 1.6);
      const offset = this.state.shipPos.clone().sub(b.pos);
      const d = offset.length();
      if (d < minDist) {
        const n = offset.divideScalar(d || 1);
        this.state.shipPos.copy(b.pos).addScaledVector(n, minDist);
        const inward = this.velocity.dot(n);
        if (inward < 0) this.velocity.addScaledVector(n, -inward);
        this.speedFactor *= 0.5;
      }
    }

    this.checkArrival();
    this.animateShip(dt, maxSpeed, yawStep / Math.max(dt, 1e-3), pitchStep / Math.max(dt, 1e-3), roll);
  }

  private checkArrival(): void {
    const nav = this.state.nav;
    const v = this.view;
    if (!nav.target || !v || v.viaSystem) return;
    const dist = v.pos.distanceTo(this.state.shipPos);
    if (dist > v.arrive * 1.15) return;
    if (nav.autopilot) {
      nav.autopilot = false;
      this.speedFactor = 0;
      this.velocity.multiplyScalar(0.05);
    }
    const t = nav.target;
    this.guide.say(`Chegamos: ${t.name}.${t.kind === 'planet' || t.kind === 'home' ? ' Em órbita.' : ''}`, 'good');
    if (t.kind === 'poi') this.visitPoi(t.id);
    if (t.kind === 'comet' && !nav.visitedBodies.has(t.id)) {
      nav.visitedBodies.add(t.id);
      this.addLog(`Visitamos o ${t.name}.`);
    }
    this.clearTarget();
  }

  /** Inclinação, deslocamento e efeitos visuais da nave e da câmera. */
  private animateShip(dt: number, maxSpeed: number, mouseYawRate: number, mousePitchRate: number, roll: number): void {
    const turning = this.turnRate + mouseYawRate * 0.6;
    const ease = 1 - Math.exp(-5 * dt);
    // A nave inclina para dentro da curva e escorrega um pouco para fora na tela.
    this.bank = THREE.MathUtils.lerp(this.bank, THREE.MathUtils.clamp(turning * 0.55, -0.85, 0.85) + roll * 0.35, ease);
    const nose = THREE.MathUtils.clamp(this.climb * 0.25 + mousePitchRate * 0.08, -0.4, 0.4);
    this.ship.rotation.x = THREE.MathUtils.lerp(this.ship.rotation.x, nose, ease);
    this.ship.rotation.y = THREE.MathUtils.lerp(this.ship.rotation.y, turning * 0.18, ease);
    this.ship.rotation.z = this.bank;
    const ratio = this.velocity.length() / Math.max(maxSpeed / (1 + (TURBO.multiplier - 1) * this.turboBlend), 1e-12);
    const shake = this.turboBlend * 0.015;
    this.ship.position.set(
      -turning * 0.25 + (Math.random() - 0.5) * shake,
      -0.7 - this.climb * 0.12 + (Math.random() - 0.5) * shake,
      -3.4 + this.speedFactor * 0.25 - this.turboBlend * 0.35,
    );

    // Motor: mais forte acelerando e azul-claro no turbo.
    const glowMat = this.engineGlow.material as THREE.SpriteMaterial;
    this.engineGlow.scale.setScalar(0.25 + Math.max(this.speedFactor, 0) * 0.5 + this.turboBlend * 0.9);
    glowMat.opacity = 0.35 + Math.max(this.speedFactor, 0) * 0.5 + this.turboBlend * 0.3;
    glowMat.color.setHex(0x66aaff).lerp(new THREE.Color(0xc8f0ff), this.turboBlend);

    // Câmera: campo de visão abre com a velocidade e acompanha um pouco a inclinação.
    const fov = BASE_FOV + Math.min(ratio, 1) * 6 + this.turboBlend * 14;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.cameraRoll = this.bank * 0.12;

    this.updateStreaks(dt, Math.min(ratio, 1.5) + this.turboBlend);
  }

  /** Riscos de poeira passando pela nave: dão noção de velocidade em qualquer escala. */
  private updateStreaks(dt: number, intensity: number): void {
    const local = this.velocity.clone().applyQuaternion(this.state.shipQuat.clone().invert());
    const speedNow = local.length();
    const pos = this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const dir = speedNow > 0 ? local.divideScalar(speedNow) : new THREE.Vector3(0, 0, -1);
    const flow = (2 + intensity * 26) * dt;
    const len = 0.05 + intensity * 0.9;
    const seeds = this.streakSeeds;
    for (let i = 0; i < STREAKS; i++) {
      const o = i * 3;
      seeds[o] -= dir.x * flow * 0.1;
      seeds[o + 1] -= dir.y * flow * 0.1;
      seeds[o + 2] -= dir.z * flow * 0.1;
      for (let a = 0; a < 3; a++) {
        if (seeds[o + a] < -1) seeds[o + a] += 2;
        else if (seeds[o + a] > 1) seeds[o + a] -= 2;
      }
      const x = seeds[o] * 6;
      const y = seeds[o + 1] * 4;
      const z = seeds[o + 2] * 10 - 6;
      arr[i * 6] = x;
      arr[i * 6 + 1] = y;
      arr[i * 6 + 2] = z;
      arr[i * 6 + 3] = x + dir.x * len;
      arr[i * 6 + 4] = y + dir.y * len;
      arr[i * 6 + 5] = z + dir.z * len;
    }
    pos.needsUpdate = true;
    (this.streaks.material as THREE.LineBasicMaterial).opacity = Math.min(0.55, Math.max(0, intensity - 0.15) * 0.4);
  }

  private placeObjects(): void {
    const ship = this.state.shipPos;
    this.camera.quaternion.copy(this.state.shipQuat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.cameraRoll));
    this.camera.position.set(0, 0, 0);
    this.camera.updateMatrixWorld();

    const t = this.state.time;
    for (const { poi, body } of this.poiBodies.values()) {
      body.object.position.subVectors(body.pos, ship);
      const dist = body.pos.distanceTo(ship);
      const glow = body.object.getObjectByName('glow') as THREE.Sprite;
      // O brilho nunca fica menor que um ponto visível na tela.
      glow.scale.setScalar(poi.kind === 'nebula' ? Math.max(poi.radius * 2.4, dist * 0.03) : Math.max(poi.radius * 8, dist * 0.008));
      if (poi.kind === 'signal' || poi.kind === 'derelict') {
        (glow.material as THREE.SpriteMaterial).opacity = 0.45 + 0.45 * Math.abs(Math.sin(t * (poi.kind === 'signal' ? 2.2 : 0.9)));
      }
    }

    if (!this.system) {
      this.starLight.intensity = 0;
      return;
    }
    const { star, planets, comets, group } = this.system;
    star.object.position.subVectors(star.pos, ship);
    const glow = star.object.getObjectByName('glow') as THREE.Sprite;
    const dist = star.pos.distanceTo(ship);
    glow.scale.setScalar(Math.max(star.radius * 10, dist * 0.04));
    for (const b of planets) {
      b.object.position.subVectors(b.pos, ship);
      // As pedras dos anéis só aparecem de perto; de longe o anel liso basta.
      const rocks = b.object.getObjectByName('ring-rocks');
      if (rocks) rocks.visible = b.pos.distanceTo(ship) < b.radius * 60;
    }
    const away = new THREE.Vector3();
    for (const b of comets) {
      b.object.position.subVectors(b.pos, ship);
      const d = b.pos.distanceTo(ship);
      const realR = (b.object.userData.realR as number) ?? 5;
      (b.object.getObjectByName('glow') as THREE.Sprite).scale.setScalar(Math.max(b.radius * (20 + 60 / realR), d * 0.006));
      // A cauda aponta para longe da estrela e cresce perto dela.
      away.subVectors(b.pos, star.pos).normalize().multiplyScalar(THREE.MathUtils.clamp(0.35 / realR, 0.004, 0.5));
      const tail = b.object.getObjectByName('tail') as THREE.Line;
      const arr = (tail.geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      arr[3] = away.x;
      arr[4] = away.y;
      arr[5] = away.z;
      tail.geometry.getAttribute('position').needsUpdate = true;
    }
    group.children.forEach((c) => {
      if (c.name === 'orbit') c.position.subVectors(star.pos, ship);
    });
    this.starLight.position.copy(star.object.position);
    this.starLight.intensity = 3;
    const toStar = star.object.position.clone().normalize().applyQuaternion(this.state.shipQuat.clone().invert());
    this.overlayLight.position.copy(toStar);
  }

  private handleOrbit(): void {
    let orbit: Body | null = null;
    for (const b of this.system?.planets ?? []) {
      if (b.pos.distanceTo(this.state.shipPos) < b.radius * 4) orbit = b;
    }
    if (orbit !== this.orbitBody) {
      this.orbitBody = orbit;
      this.renderOrbitMenu();
      const p = orbit?.planet;
      if (p && !this.state.nav.visitedBodies.has(p.id)) {
        this.state.nav.visitedBodies.add(p.id);
        const tier = lifeTierOf(p);
        this.addLog(`Órbita de ${p.name} (${KIND_LABEL[p.kind].toLowerCase()}${tier !== 'none' ? `, ${LIFE_LABEL[tier]}` : ''}).`);
        this.lastNews = performance.now();
      }
    }
    if (orbit && this.input.hit('KeyF') && orbit.planet?.kind === 'rocky') {
      this.state.orbitPlanetId = orbit.planet.id;
      this.callbacks.onObserve(orbit.planet);
    }
  }

  private renderOrbitMenu(): void {
    const el = this.hudEls.orbit;
    const b = this.orbitBody;
    if (!b?.planet) {
      el.hidden = true;
      return;
    }
    const p = b.planet;
    const sys = this.system!.data;
    const tier = lifeTierOf(p);
    const inZone = p.kind === 'rocky' && p.aAu >= sys.habitable[0] && p.aAu <= sys.habitable[1];
    const source = sys.starId === SOL_ID
      ? 'Dados reais: NASA/JPL · escala visual comprimida'
      : sys.catalogued
        ? 'Planeta real: NASA Exoplanet Archive · raio e clima estimados'
        : 'Planeta não catalogado: gerado a partir da estrela real';
    const res = (id: string) => {
      const d = this.probes.describeSource(id);
      return `<small>${d ? `Restam: ${d}` : 'Ainda não prospectado'}</small>`;
    };
    el.hidden = false;
    el.innerHTML = `
      <div class="oc-head"><span class="oc-globe ${p.id === 'sol-3' ? 'earth' : p.kind}"></span><div class="oc-name">${svgIcon('target')}<b>${p.name}</b><em>· em órbita</em></div></div>
      <div class="orbit-data">
        <span>${svgIcon('planet')}Tipo</span><b>${KIND_LABEL[p.kind]}</b>
        <span>${svgIcon('orbit')}Raio</span><b>${p.radiusKm.toLocaleString('pt-BR')} km</b>
        <span>${svgIcon('sun')}Distância da estrela</span><b>${p.aAu} UA</b>
        <span>${svgIcon('temp')}Temperatura média</span><b>${p.temperatureK} K</b>
        <span>${svgIcon('leaf')}Zona habitável</span><b>${inZone ? 'Sim' : 'Não'}</b>
        <span>${svgIcon('sprout')}Vida nativa</span><b>${p.id === 'sol-3' ? 'Sim' : tier === 'none' ? 'Nenhum sinal' : LIFE_LABEL[tier].replace('sinais de ', '')}</b>
      </div>
      <div class="orbit-actions">
        ${p.kind === 'rocky' ? `<button class="oc-btn main" data-key="KeyF">${svgIcon('eye')}Observar superfície<kbd>F</kbd></button>` : '<div class="oc-btn off">Sem superfície sólida</div>'}
        ${p.kind === 'rocky' ? `<button class="oc-btn" data-key="KeyM">${svgIcon('probe')}Enviar sonda<kbd>M</kbd>${res(p.id)}</button>` : ''}
        ${p.rings ? `<button class="oc-btn" data-key="KeyR">${svgIcon('orbit')}Sonda aos anéis<kbd>R</kbd>${res(`${p.id}:aneis`)}</button>` : ''}
      </div>
      <div class="source">${source}</div>`;
  }

  // ---------------------------------------------------------------- GUIA

  private addLog(text: string): void {
    const log = this.state.nav.log;
    log.push({ time: this.state.time, text });
    if (log.length > 200) log.shift();
  }

  private setTarget(t: NavTarget, note?: string): void {
    this.state.nav.target = t;
    this.lastNews = performance.now();
    const v = this.resolveTarget();
    const dist = v ? v.dist : 0;
    this.guide.say(`Alvo: ${t.name} · ${formatDistance(Math.max(0, dist))} · ≈ ${formatEta(etaSeconds(dist, v?.arrive ?? t.arrive, this.departDistance))}. ${note ?? (this.state.nav.autopilot ? '' : 'Aperte J para o piloto automático.')}`);
  }

  private engage(t: NavTarget): void {
    const nav = this.state.nav;
    nav.autopilot = true;
    nav.cruise = false;
    if (nav.target?.id !== t.id) this.setTarget(t, 'Piloto automático ligado.');
    else this.guide.say(`Piloto automático: rumo a ${t.name}. Qualquer comando manual desliga.`);
  }

  private clearTarget(): void {
    this.state.nav.target = null;
    this.state.nav.autopilot = false;
    this.view = null;
  }

  private homeTarget(): NavTarget {
    const sol = generateSystem(this.starInfo({ id: SOL_ID, absmag: 4.85, ci: 0.656 }));
    return {
      kind: 'home',
      id: 'sol-3',
      name: 'Terra (casa)',
      pos: [0, 0, 0],
      starId: SOL_ID,
      arrive: systemViewRadius(sol, this.starInfo({ id: SOL_ID, absmag: 4.85, ci: 0.656 })),
      info: 'Planeta natal, no Sistema Solar',
    };
  }

  private starTarget(s: CatalogStar): NavTarget {
    const info = this.starInfo(s);
    const sys = generateSystem(info);
    const nav = this.state.nav;
    const known = nav.scannedStars.has(s.id) ? describeSystem(summarize(sys)) : 'sistema ainda não varrido';
    return { kind: 'star', id: `star:${s.id}`, name: info.name, pos: toTuple(s.pos), starId: s.id, arrive: systemViewRadius(sys, info), info: `Estrela · ${known}` };
  }

  private poiTarget(p: Poi): NavTarget {
    return { kind: 'poi', id: p.id, name: p.name, pos: p.pos, arrive: poiArrive(p), info: `${POI_LABEL[p.kind]} · ${p.description}` };
  }

  /** Posição atual do alvo e onde parar; planetas de outro sistema passam primeiro pela estrela. */
  private resolveTarget(): TargetView | null {
    const t = this.state.nav.target;
    if (!t) return null;
    const ship = this.state.shipPos;
    if (t.kind === 'planet' || t.kind === 'comet' || t.kind === 'home') {
      const sys = this.system;
      if (sys && sys.starId === t.starId) {
        const b = [...sys.planets, ...sys.comets].find((x) => (x.planet?.id ?? x.id) === t.id);
        if (b) {
          const arrive = b.kind === 'comet' ? Math.max(b.radius * 20, 0.005) : b.radius * 3;
          return { target: t, pos: b.pos, dist: b.pos.distanceTo(ship), arrive, viaSystem: false, info: t.info, depart: this.departDistance };
        }
      }
      const pos = new THREE.Vector3(...t.pos);
      return { target: t, pos, dist: pos.distanceTo(ship), arrive: t.arrive, viaSystem: true, info: t.info, depart: this.departDistance };
    }
    const pos = new THREE.Vector3(...t.pos);
    return { target: t, pos, dist: pos.distanceTo(ship), arrive: t.arrive, viaSystem: false, info: t.info, depart: this.departDistance };
  }

  /** Trava como alvo o que estiver mais perto da cruz da mira. */
  private lockAtCrosshair(): void {
    const ship = this.state.shipPos;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.state.shipQuat);
    let best: { t: NavTarget; angle: number } | null = null;
    const test = (pos: THREE.Vector3, make: () => NavTarget) => {
      const angle = pos.clone().sub(ship).angleTo(fwd);
      if (angle < 0.09 && (!best || angle < best.angle)) best = { t: make(), angle };
    };
    for (const e of this.entries) test(e.pos, () => e.target);
    for (const s of this.nearbyStars) test(s.pos, () => this.starTarget(s));
    const found = best as { t: NavTarget; angle: number } | null;
    if (found) this.setTarget(found.t);
    else this.guide.say('Nada na mira. Aponte a cruz para uma estrela, planeta ou marcador e aperte T.', 'warn');
  }

  private addBookmark(): void {
    const nav = this.state.nav;
    const n = nav.bookmarks.length + 1;
    const where = this.system ? ` (${this.system.info.name})` : '';
    const mark = { id: `mark:${Date.now()}`, name: `Marcador ${n}${where}`, pos: toTuple(this.state.shipPos) };
    nav.bookmarks.push(mark);
    this.addLog(`${mark.name} criado.`);
    this.guide.say(`${mark.name} salvo aqui. Ele aparece no radar e no painel.`, 'good');
    this.refreshNav(performance.now());
  }

  /** Varredura de longo alcance: revela pontos de interesse e o que há nos sistemas próximos. */
  private scan(now: number): void {
    if (now < this.scanReadyAt) {
      this.guide.say(`Varredura recarregando: ${Math.ceil((this.scanReadyAt - now) / 1000)} s.`, 'warn', 3);
      return;
    }
    this.scanReadyAt = now + SCAN_COOLDOWN_MS;
    this.guide.pulse();
    const nav = this.state.nav;
    const ship = this.state.shipPos;
    const range = SCAN_RANGE_PC * AU_PER_PC;
    const stars = this.stars.nearby(ship, 400, undefined, range);
    let systems = 0;
    let habitable = 0;
    const life: string[] = [];
    for (const s of stars) {
      if (nav.scannedStars.has(s.id)) continue;
      nav.scannedStars.add(s.id);
      const info = this.starInfo(s);
      const sum = summarize(generateSystem(info));
      if (sum.planets) systems++;
      if (sum.habitable) habitable++;
      if (sum.life !== 'none') {
        life.push(info.name);
        this.addLog(`Varredura: ${LIFE_LABEL[sum.life]} no sistema ${info.name}.`);
      }
    }
    const fresh = poisNear(ship, range).filter((p) => !nav.discoveredPois.has(p.id));
    for (const p of fresh) {
      nav.discoveredPois.add(p.id);
      this.addLog(`Varredura: ${POI_LABEL[p.kind].toLowerCase()} detectado (${p.name}).`);
    }
    this.lastNews = now;
    const parts = [`${stars.length} estrelas`, `${systems} sistemas novos com planetas`];
    if (habitable) parts.push(`${habitable} com mundos na zona habitável`);
    parts.push(`${fresh.length} pontos de interesse novos`);
    this.guide.say(`Varredura (${SCAN_RANGE_PC} pc): ${parts.join(', ')}.`, fresh.length || systems ? 'good' : 'info', 9);
    if (life.length) this.guide.say(`Sinais de vida em ${life.slice(0, 3).join(', ')}! Veja as sugestões (N).`, 'good', 10);
    this.refreshNav(now);
  }

  private visitPoi(id: string): void {
    const nav = this.state.nav;
    if (nav.visitedPois.has(id)) return;
    const p = findPoi(id);
    if (!p) return;
    nav.visitedPois.add(id);
    nav.discoveredPois.add(id);
    this.addLog(`Visitamos ${p.name}: ${p.description}`);
    this.guide.say(`${p.name}: ${p.description}`, 'good', 12);
    this.lastNews = performance.now();
  }

  /** Atualiza pontos de interesse desenhados, a lista do GUIA e as sugestões (4 vezes por segundo). */
  private refreshNav(now: number): void {
    const nav = this.state.nav;
    const ship = this.state.shipPos;
    this.nearbyStars = this.stars.nearby(ship, 40, this.system?.starId);
    this.nearestStar = this.nearbyStars[0] ?? null;
    // Estrelas bem próximas são varridas sozinhas.
    for (const st of this.nearbyStars) if (st.distAu < 0.3 * AU_PER_PC) nav.scannedStars.add(st.id);

    // Pontos de interesse: detecção passiva, visita e objetos 3D por perto.
    const pois = poisNear(ship, POI_LIST_PC * AU_PER_PC);
    const drawn = new Set<string>();
    for (const p of pois) {
      const pc = p.dist / AU_PER_PC;
      if (!nav.discoveredPois.has(p.id) && (pc < POI_PASSIVE_PC || (p.kind === 'nebula' && pc < NEBULA_SEEN_PC))) {
        nav.discoveredPois.add(p.id);
        this.addLog(`Detectado: ${p.name} (${POI_LABEL[p.kind].toLowerCase()}).`);
        this.guide.say(`Detectei ${POI_LABEL[p.kind].toLowerCase()} por perto: ${p.name}. Aperte N para ver as sugestões.`, 'good');
        this.lastNews = now;
      }
      if (p.dist < poiArrive(p) * 1.6) this.visitPoi(p.id);
      if (pc < POI_DRAW_PC && nav.discoveredPois.has(p.id)) {
        drawn.add(p.id);
        if (!this.poiBodies.has(p.id)) {
          const body = createPoiBody(p.id, p.name, p.kind, new THREE.Vector3(...p.pos), p.radius, p.color);
          this.scene.add(body.object);
          this.poiBodies.set(p.id, { poi: p, body });
        }
      }
    }
    for (const [id, { body }] of this.poiBodies) {
      if (drawn.has(id)) continue;
      this.scene.remove(body.object);
      disposeObject(body.object);
      this.poiBodies.delete(id);
    }

    // Entradas do radar e do painel.
    const entries: NavEntry[] = [];
    const cands: Candidate[] = [];
    const sys = this.system;
    if (sys) {
      const sysArrive = systemViewRadius(sys.data, sys.info);
      for (const b of sys.planets) {
        const p = b.planet!;
        const tier = lifeTierOf(p);
        const inZone = p.kind === 'rocky' && p.aAu >= sys.data.habitable[0] && p.aAu <= sys.data.habitable[1];
        const visited = nav.visitedBodies.has(p.id);
        const detail = `${KIND_LABEL[p.kind]}${inZone ? ' · zona habitável' : ''}${tier !== 'none' ? ` · ${LIFE_LABEL[tier]}` : ''}${visited ? ' · visitado' : ''}`;
        const target: NavTarget = { kind: 'planet', id: p.id, name: p.name, pos: toTuple(sys.star.pos), starId: sys.starId, arrive: sysArrive, info: detail };
        const dist = b.pos.distanceTo(ship);
        entries.push({ key: p.id, group: 'system', target, name: p.name, pos: b.pos, dist, arrive: b.radius * 3, color: KIND_COLOR[p.kind], detail });
        const interest = visited ? 0.2
          : tier === 'sapient' ? 6 : tier === 'animals' ? 5 : tier === 'plants' ? 4.2
          : inZone ? 3.5 : p.kind === 'rocky' ? 1.8 : p.rings ? 1.6 : 1.1;
        const reason = tier !== 'none' ? `${LIFE_LABEL[tier][0].toUpperCase()}${LIFE_LABEL[tier].slice(1)}` : inZone ? 'Rochoso na zona habitável' : `${KIND_LABEL[p.kind]} ainda não visitado`;
        cands.push({ target, distAu: dist, arriveAu: b.radius * 3, interest, reason: visited ? 'Já visitado' : reason });
      }
      for (const b of sys.comets) {
        const target: NavTarget = { kind: 'comet', id: b.id!, name: b.name, pos: toTuple(sys.star.pos), starId: sys.starId, arrive: sysArrive, info: 'Cometa · gelo e poeira, cauda apontando para longe da estrela' };
        const dist = b.pos.distanceTo(ship);
        entries.push({ key: b.id!, group: 'system', target, name: b.name, pos: b.pos, dist, arrive: 0.005, color: '#aee8ff', detail: 'Cometa' });
        cands.push({ target, distAu: dist, arriveAu: 0.005, interest: nav.visitedBodies.has(b.id!) ? 0.2 : 2, reason: 'Cometa com cauda, perto da estrela' });
      }
    }
    for (const b of nav.bookmarks) {
      const pos = new THREE.Vector3(...b.pos);
      const target: NavTarget = { kind: 'mark', id: b.id, name: b.name, pos: b.pos, arrive: 0.05, info: 'Marcador do jogador' };
      entries.push({ key: b.id, group: 'mark', target, name: b.name, pos, dist: pos.distanceTo(ship), arrive: 0.05, color: '#ffd34d', detail: 'Marcador', marker: true });
    }
    const home = this.homeTarget();
    const homePos = this.system?.starId === SOL_ID ? this.system.planets[2].pos : new THREE.Vector3();
    entries.push({ key: 'home', group: 'mark', target: home, name: home.name, pos: homePos, dist: homePos.distanceTo(ship), arrive: home.arrive, color: '#6aa8ff', detail: 'Casa' });
    const homePc = ship.length() / AU_PER_PC;
    if (homePc > 1.5) cands.push({ target: home, distAu: ship.length(), arriveAu: home.arrive, interest: Math.min(1.5, 0.3 + homePc * 0.05), reason: 'Voltar para casa' });

    for (const p of pois) {
      if (!nav.discoveredPois.has(p.id)) continue;
      const target = this.poiTarget(p);
      const visited = nav.visitedPois.has(p.id);
      const pos = new THREE.Vector3(...p.pos);
      entries.push({ key: p.id, group: 'poi', target, name: p.name, pos, dist: p.dist, arrive: target.arrive, color: hex(p.color), detail: `${POI_LABEL[p.kind]}${visited ? ' · visitado' : ''}`, marker: true });
      const interest = visited ? 0.2 : p.id === TUTORIAL_POI.id ? 8 : POI_INTEREST[p.kind];
      cands.push({ target, distAu: p.dist, arriveAu: target.arrive, interest, reason: visited ? 'Já visitado' : `${POI_LABEL[p.kind]} ainda não visitado` });
    }
    for (const s of this.nearbyStars.slice(0, 30)) {
      const info = this.starInfo(s);
      const scanned = nav.scannedStars.has(s.id);
      const visited = nav.visitedStars.has(s.id);
      const summary = scanned ? summarize(generateSystem(info)) : null;
      const target = this.starTarget(s);
      const detail = visited ? `Visitado · ${describeSystem(summary!)}` : summary ? describeSystem(summary) : 'Não varrido';
      entries.push({ key: target.id, group: 'star', target, name: info.name, pos: s.pos, dist: s.distAu, arrive: target.arrive, color: starCss(s.ci), detail });
      const si = starInterest(visited, scanned, summary);
      cands.push({ target, distAu: s.distAu, arriveAu: target.arrive, interest: si.interest, reason: si.reason });
    }
    entries.sort((a, b) => a.dist - b.dist);
    this.entries = entries;
    this.departDistance = this.distanceToNearestSurface().dist;
    const ranked = rankSuggestions(cands, 5, this.departDistance);
    if (ranked.map((s) => s.target.id).join() !== this.suggestions.map((s) => s.target.id).join()) this.suggestionIndex = -1;
    this.suggestions = ranked;
    this.guide.setData(entries, ranked, nav.log);
    this.probes.setNearby(this.mineSources(true));

    // Sem alvo e sem novidade há um tempo: o GUIA oferece ajuda.
    if (!nav.target && now - this.lastNews > IDLE_HINT_MS && ranked[0]) {
      this.lastNews = now;
      this.guide.say(`Que tal ${ranked[0].target.name}? ${ranked[0].reason}, a ≈ ${formatEta(ranked[0].eta)}. Aperte N e depois J.`, 'info', 10);
    }
  }

  /**
   * Corpos de onde as sondas extraem: planetas rochosos, anéis, cometas e
   * alguns pontos de interesse. Com `inRange`, só os que estão ao alcance, do mais perto ao mais longe.
   */
  private mineSources(inRange: boolean): MineSource[] {
    const ship = this.state.shipPos;
    const out: (MineSource & { d: number; reach: number })[] = [];
    const add = (src: MineSource, reach: number) => out.push({ ...src, d: src.pos.distanceTo(ship), reach });
    for (const b of this.system?.planets ?? []) {
      const p = b.planet!;
      if (p.kind === 'rocky') add({ id: p.id, name: p.name, kind: 'rocky', water: p.water, pos: b.pos, radius: b.radius * 1.6 }, b.radius * 6);
      if (p.rings) add({ id: `${p.id}:aneis`, name: `Anéis de ${p.name}`, kind: 'ring', water: 0, pos: b.pos, radius: b.radius * 1.8 }, b.radius * 6);
    }
    for (const b of this.system?.comets ?? []) add({ id: b.id!, name: b.name, kind: 'comet', water: 0, pos: b.pos, radius: b.radius * 8 }, 0.03);
    for (const { poi, body } of this.poiBodies.values()) {
      const kind = poi.kind === 'comet' ? 'comet' : poi.kind === 'rogue' ? 'rogue' : poi.kind === 'derelict' ? 'derelict' : null;
      if (kind) add({ id: poi.id, name: poi.name, kind, water: 0, pos: body.pos, radius: poi.radius * 3 }, poiArrive(poi) * 3);
    }
    return inRange ? out.filter((s) => s.d < s.reach).sort((a, b) => a.d - b.d) : out;
  }

  /** Estrelas com nome entre as carregadas, para a busca do painel. */
  private searchStars(text: string): NavEntry[] {
    const ship = this.state.shipPos;
    const out: NavEntry[] = [];
    for (const s of this.stars.named(this.state.names)) {
      const info = this.starInfo(s);
      if (!info.name.toLowerCase().includes(text)) continue;
      const target = this.starTarget(s);
      out.push({ key: target.id, group: 'star', target, name: info.name, pos: s.pos, dist: s.pos.distanceTo(ship), arrive: target.arrive, color: starCss(s.ci), detail: target.info });
    }
    return out.sort((a, b) => a.dist - b.dist).slice(0, 30);
  }

  private updateHud(): void {
    const nearest = this.distanceToNearestSurface();
    const pc = this.state.shipPos.clone().divideScalar(AU_PER_PC);
    const mem = this.renderer.info.memory;
    this.hudEls.speed.textContent = formatSpeed(this.velocity.length());
    this.hudEls.throttle.textContent = `${Math.round(this.throttle * 100)}%`;
    this.hudEls.turbo.style.width = `${Math.round(this.turbo.energy * 100)}%`;
    this.hudEls.turbo.classList.toggle('out', this.turbo.exhausted);
    this.hudEls.turbo.classList.toggle('on', this.turbo.active);
    this.hudEls.nearest.textContent = nearest.name;
    this.hudEls.distance.textContent = Number.isFinite(nearest.dist) ? formatDistance(Math.max(nearest.dist, 0)) : '—';
    const fwd = this.tmpFwd.set(0, 0, -1).applyQuaternion(this.state.shipQuat);
    const heading = ((Math.atan2(fwd.x, fwd.y) * 180) / Math.PI + 360) % 360;
    this.hudEls.tape.style.transform = `translateX(${-(heading + 180) * CMP_PX}px)`;
    this.hudEls.probes.textContent = `${freeProbes(this.state.probes)}/${this.state.probes.probes}`;
    const star = this.system ? this.system.star.pos : this.state.shipPos.length() < SYSTEM_EXIT_PC * AU_PER_PC ? this.origin : null;
    this.guide.setRadarCenter(star, heading);
    this.hudEls.system.textContent = this.system ? `Sistema ${this.system.info.name}` : star ? 'Sistema Sol' : 'Espaço profundo';
    this.hudEls.position.textContent = `${pc.x.toFixed(3)}, ${pc.y.toFixed(3)}, ${pc.z.toFixed(3)} pc`;
    this.hudEls.fps.textContent = this.fps.toFixed(0);
    this.hudEls.chunks.textContent = `${this.stars.loadedCount} / ${this.state.manifest.manifest.nodes.length}`;
    this.hudEls.stars.textContent = this.stars.starCount.toLocaleString('pt-BR');
    this.hudEls.memory.textContent = `${mem.geometries} geometrias, ${mem.textures} texturas`;
    this.hudEls.resolution.textContent = `${Math.round(this.resolution.pixelRatio * 100)}%`;
    this.hudEls.lock.hidden = this.input.locked || this.guide.panelOpen;
    this.probes.render();
    if (this.orbitBody) this.renderOrbitMenu();
    const nav = this.state.nav;
    this.guide.updateCard(this.view, nav.autopilot ? 'auto' : nav.cruise ? 'cruise' : 'manual', this.suggestions[0] ?? null);
  }

  /** Rótulos na tela para a estrela mais próxima e os corpos do sistema. */
  private updateLabels(): void {
    const items: { key: string; name: string; pos: THREE.Vector3 }[] = [];
    if (this.nearestStar) {
      items.push({ key: 'star', name: this.starInfo(this.nearestStar).name, pos: this.nearestStar.pos });
    }
    if (this.system) {
      items.push({ key: 'sys', name: this.system.star.name, pos: this.system.star.pos });
      for (const b of this.system.planets) items.push({ key: b.planet!.id, name: b.name, pos: b.pos });
    }
    const container = this.hudEls.labels;
    for (const l of this.labels.values()) l.visible = false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const it of items) {
      // O alvo já tem o próprio marcador com nome e distância.
      if (this.view && this.view.target.name === it.name) continue;
      const rel = it.pos.clone().sub(this.state.shipPos);
      const dist = rel.length();
      const v = rel.project(this.camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
      let label = this.labels.get(it.key);
      if (!label) {
        const el = document.createElement('div');
        el.className = 'hud-label';
        container.appendChild(el);
        label = { el, visible: true };
        this.labels.set(it.key, label);
      }
      label.visible = true;
      const text = `<span>${svgIcon('target')}${it.name}</span><small>${formatDistance(dist)}</small>`;
      if (label.el.dataset.html !== text) {
        label.el.dataset.html = text;
        label.el.innerHTML = text;
      }
      label.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
    for (const l of this.labels.values()) l.el.hidden = !l.visible;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.input.dispose();
    this.guide.dispose();
    this.probes.dispose();
    this.disposeSystem();
    for (const { body } of this.poiBodies.values()) disposeObject(body.object);
    this.poiBodies.clear();
    this.stars.dispose();
    disposeObject(this.scene);
    disposeObject(this.overlay);
    disposeGlowTexture();
    this.hudRoot.remove();
    this.renderer.renderLists.dispose();
  }
}

/** Libera geometrias, materiais e texturas de uma árvore de objetos. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
