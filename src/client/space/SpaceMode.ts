import * as THREE from 'three';
import { AU_PER_PC } from '../../core/units';
import { createProbeState } from '../../explore/probes';
import { createNavState } from '../../nav/guide';
import { planetOffset, SOL_PLANETS, type PlanetData } from '../../nav/planets';
import type { ViewSnapshot } from '../../save/snapshot';
import { Input } from '../input';
import type { GameMode } from '../mode';
import type { AdaptiveResolution } from '../quality';
import type { GameRenderer } from '../renderer';
import type { GameState } from '../state';
import { disposeGlowTexture } from './bodies';
import { CommandMap, KeyBindings, MANEUVERS } from './commands';
import { disposeObject } from './dispose';
import { FloatingOrigin } from './FloatingOrigin';
import { GuideHud } from './GuideHud';
import { NavDirector } from './NavDirector';
import { ProbeControl } from './ProbeControl';
import { ShipController, type FlightKeys, type FlightWorld } from './ShipController';
import { ShipView } from './ShipView';
import { SpaceHud } from './SpaceHud';
import { StarField } from './starField';
import { SystemManager } from './SystemManager';

/** Passo máximo do laço do espaço, em segundos (ver mode.ts). */
export const SPACE_MAX_DT = 0.25;

export interface SpaceCallbacks {
  onObserve(planet: PlanetData): void;
}

/**
 * Modo de exploração 3D: campo de estrelas em chunks, sistemas locais, nave
 * com voo livre e velocidade adaptativa, e o GUIA para navegar. A câmera
 * fica sempre na origem e o mundo é transladado em torno dela (origem
 * flutuante, RNF-05).
 *
 * Esta classe só monta os componentes e chama cada um na ordem do quadro:
 * - ShipController: pilotagem (teclas, mouse, piloto automático, colisão);
 * - ShipView: a nave desenhada por cima do mundo e os efeitos de velocidade;
 * - SystemManager: ciclo de vida do sistema estelar e dos corpos;
 * - FloatingOrigin: câmera na origem e mundo em volta;
 * - NavDirector: GUIA, alvo, sugestões, varredura e piloto automático;
 * - SpaceHud: HUD em DOM, com atualização estrangulada;
 * - StarField, GuideHud e ProbeControl, como antes.
 * Teclas e botões passam pelos comandos (commands.ts).
 */
export class SpaceMode implements GameMode {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(70, 1, 1e-6, 1e10);
  private readonly input: Input;
  private readonly stars: StarField;
  private readonly origin = new FloatingOrigin();
  private readonly systems: SystemManager;
  private readonly ship: ShipController;
  private readonly shipView = new ShipView();
  private readonly hud: SpaceHud;
  private readonly guide: GuideHud;
  private readonly probes: ProbeControl;
  private readonly director: NavDirector;
  private readonly world: FlightWorld;
  private readonly bindings = new KeyBindings();
  private readonly commands: CommandMap;
  private readonly keys: FlightKeys = { thrust: false, brake: false, left: false, right: false, up: false, down: false, rollLeft: false, rollRight: false, turbo: false };
  private raf = 0;
  private lastTime = performance.now();
  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;
  private disposed = false;
  private readonly isDisposed = (): boolean => this.disposed;

  constructor(
    private readonly renderer: GameRenderer,
    private readonly resolution: AdaptiveResolution,
    private readonly state: GameState,
    hud: HTMLElement,
    private readonly callbacks: SpaceCallbacks,
  ) {
    state.nav ??= createNavState();
    state.probes ??= createProbeState();
    this.scene.background = new THREE.Color(0x02030a);
    this.systems = new SystemManager(this.scene, this.origin, state, {
      systemEntered: (sys) => this.director.systemEntered(sys),
      systemLeft: () => this.hud.renderOrbitMenu(),
      visitorArrived: (sys, comet, entering) => this.director.visitorArrived(sys, comet, entering),
    });
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.08), this.systems.starLight);
    this.stars = new StarField(state.manifest);
    this.scene.add(this.stars.group);
    this.input = new Input(renderer.domElement, true);
    this.ship = new ShipController(state.shipPos, state.shipQuat);
    this.commands = this.buildCommands();

    this.hud = new SpaceHud(hud, this.commands, this.bindings);
    this.guide = new GuideHud(this.hud.root, {
      select: (t) => this.director.setTarget(t),
      engage: (t) => this.director.engage(t),
      search: (text) => this.director.searchStars(text),
      bookmarkRemove: (id) => this.director.removeBookmark(id),
      keyOf: (action) => this.bindings.label(action),
    });
    this.probes = new ProbeControl(this.hud.root, state.probes, this.scene, (text, tone) => this.guide.say(text, tone), (text) => this.director.addLog(text));
    this.director = new NavDirector(state, this.stars, this.systems, this.guide, this.probes);
    this.world = { bodies: () => this.systems.bodies(), nearbyStars: () => this.director.nearbyStars };
    this.hud.connect({
      state,
      ship: this.ship,
      director: this.director,
      systems: this.systems,
      stars: this.stars,
      guide: this.guide,
      probes: this.probes,
      renderer,
      resolution,
      input: this.input,
      camera: this.camera,
    });
    if (!state.nav.greeted) {
      state.nav.greeted = true;
      this.guide.say('GUIA on-line. Estou aqui para ajudar a navegar: G abre o painel, V faz uma varredura e N aceita minhas sugestões.', 'good', 12);
      this.guide.say('Comece pelo sinal fraco na borda do Sistema Solar: aperte N e depois J.', 'info', 12);
    }

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  start(): void {
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  snapshotView(): ViewSnapshot {
    return { mode: 'space' };
  }

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
    this.shipView.resize(w / h);
  };

  /** Um quadro do espaço: passo variável, limitado a SPACE_MAX_DT (ver mode.ts). */
  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    if (window.innerWidth !== this.lastW || window.innerHeight !== this.lastH || (window.devicePixelRatio || 1) !== this.lastDpr) {
      this.resize();
    }
    this.resolution.frame(now - this.lastTime, now);
    // Teto alto para o passo: em PCs lentos (sem placa de vídeo) a viagem não fica em câmera lenta.
    // A velocidade adaptativa anda no máximo ~10% da distância ao obstáculo por passo, então é seguro.
    const dt = Math.min((now - this.lastTime) / 1000, SPACE_MAX_DT);
    this.lastTime = now;
    const state = this.state;
    const nav = state.nav;
    state.time += dt;

    // Comandos das teclas apertadas neste quadro (observar troca de modo: nada mais deste quadro).
    this.commands.dispatch(this.input, this.bindings, this.isDisposed);
    if (this.disposed) return;
    this.systems.update(this.director.nearestStar);
    this.systems.updateBodies(state.time, nav.autopilot ? nav.target?.id ?? null : null);
    const view = this.director.resolveView();

    // Voo: o piloto automático desliga se o piloto mexer em algo ou o alvo sumir.
    if (nav.autopilot) {
      const manual = this.ship.takesOver(this.bindings.anyHit(this.input, MANEUVERS), this.input);
      if (manual || !view) this.director.disengage(manual);
    }
    this.readFlightKeys();
    this.ship.update(dt, this.keys, this.input, nav.autopilot ? view : null, nav.cruise, this.world);
    if (this.director.checkArrival()) this.ship.halt();
    this.shipView.animate(dt, this.ship, state.shipQuat, this.camera);

    this.probes.frame(dt, state.shipPos, this.director.source, state.time);
    this.stars.update(state.shipPos, now, this.resolution.pixelRatio);
    this.director.tick(now);

    // Origem flutuante: a nave vai para a origem e o mundo para o lugar em volta dela.
    this.origin.update(state.shipPos, state.shipQuat, this.shipView.cameraRoll, this.camera);
    this.systems.place(state.shipPos, state.time);
    const starLocal = this.systems.starLocal();
    if (starLocal) this.shipView.lightFrom(starLocal, state.shipQuat);
    if (this.systems.updateOrbit()) {
      this.hud.renderOrbitMenu();
      this.director.orbitEntered(this.systems.orbitBody);
    }

    this.renderer.autoClear = false;
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.clearDepth();
    this.shipView.render(this.renderer);

    this.hud.frame(now);
    this.guide.frame(state.shipPos, state.shipQuat, this.camera, this.director.view, this.ship.velocity);
    this.input.endFrame();
  };

  /** Teclas de voo seguradas, pelas ligações de teclas. */
  private readFlightKeys(): void {
    const input = this.input;
    const b = this.bindings;
    const k = this.keys;
    k.thrust = b.down(input, 'thrust');
    k.brake = b.down(input, 'brake');
    k.left = b.down(input, 'left');
    k.right = b.down(input, 'right');
    k.up = b.down(input, 'up');
    k.down = b.down(input, 'down');
    k.rollLeft = b.down(input, 'rollLeft');
    k.rollRight = b.down(input, 'rollRight');
    k.turbo = b.down(input, 'turbo');
  }

  /**
   * Ação → comando (Command). A ordem é a ordem em que as teclas são lidas
   * a cada quadro; rótulo e ícone servem aos botões do HUD. Os comandos só
   * usam os componentes quando executam, então a tabela pode ser montada
   * antes deles.
   */
  private buildCommands(): CommandMap {
    const send = (rings: boolean) => this.probes.send(this.probes.pick(rings), this.state.shipPos);
    return new CommandMap({
      jumpEarth: { label: 'Terra', execute: () => this.jumpToEarth() },
      jumpAlpha: { label: 'Alfa Centauri', execute: () => this.jumpToStar('Rigil Kentaurus') },
      jumpSirius: { label: 'Sirius', execute: () => this.jumpToStar('Sirius') },
      panel: { label: 'Painel do GUIA', execute: () => this.guide.togglePanel() },
      cruise: { label: 'Cruzeiro', icon: 'cruise', execute: () => this.director.toggleCruise() },
      autopilot: { label: 'Piloto automático', icon: 'auto', execute: () => this.director.toggleAutopilot() },
      suggest: { label: 'Rastrear', icon: 'target', execute: () => this.director.nextSuggestion() },
      probe: { label: 'Sonda', icon: 'probe', execute: () => send(false) },
      probeRings: { label: 'Sonda aos anéis', icon: 'orbit', execute: () => send(true) },
      lock: { label: 'Travar alvo na mira', execute: () => this.director.lockAtCrosshair() },
      scan: { label: 'Varredura', icon: 'scan', execute: () => this.director.scan(performance.now()) },
      bookmark: { label: 'Marcador', icon: 'flag', execute: () => this.director.addBookmark() },
      home: { label: 'Casa', execute: () => this.director.goHome() },
      clearTarget: { label: 'Limpar alvo', execute: () => this.director.dropTarget() },
      observe: { label: 'Observar superfície', icon: 'eye', execute: () => this.observe() },
      probesPanel: { label: 'Sondas', execute: () => this.hud.toggleProbes() },
      devPanel: { label: 'Dados técnicos', execute: () => this.hud.toggleDev() },
    });
  }

  /** F: em órbita de um planeta rochoso, desce para a superfície (o modo é trocado na hora). */
  private observe(): void {
    const p = this.systems.orbitBody?.planet;
    if (p?.kind !== 'rocky') return;
    this.state.orbitPlanetId = p.id;
    this.callbacks.onObserve(p);
  }

  // Atalhos de teste da Fase 0 para saltar entre estrelas.

  private jumpToEarth(): void {
    const pos = planetOffset(SOL_PLANETS[2], this.state.time, new THREE.Vector3());
    this.state.shipPos.copy(pos).add(new THREE.Vector3(0.01, 0.005, 0.003));
    this.lookAt(pos);
  }

  private jumpToStar(name: string): void {
    const id = [...this.state.names].find(([, n]) => n === name)?.[0];
    const star = id !== undefined ? this.stars.find(id) : null;
    if (!star) return;
    this.state.shipPos.copy(star.pos).add(new THREE.Vector3(0.012 * AU_PER_PC, 0, 0));
    this.lookAt(star.pos);
  }

  private lookAt(target: THREE.Vector3): void {
    this.ship.lookAt(target);
    this.state.nav.autopilot = false;
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.input.dispose();
    this.guide.dispose();
    this.probes.dispose();
    this.systems.dispose();
    this.origin.clear();
    this.stars.dispose();
    disposeObject(this.scene);
    this.shipView.dispose();
    disposeGlowTexture();
    this.hud.dispose();
    this.renderer.renderLists.dispose();
  }
}
