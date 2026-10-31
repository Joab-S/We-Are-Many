import * as THREE from 'three';
import { AU_PER_PC } from '../../core/units';
import { createProbeState } from '../../explore/probes';
import { createNavState } from '../../nav/guide';
import { planetOffset, SOL_PLANETS, type PlanetData } from '../../nav/planets';
import { Input } from '../input';
import type { AdaptiveResolution } from '../quality';
import type { GameRenderer } from '../renderer';
import type { GameState } from '../state';
import { disposeGlowTexture } from './bodies';
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

/** Passo máximo do laço do espaço, em segundos. */
export const SPACE_MAX_DT = 0.25;
const MANUAL_KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE'];

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
 */
export class SpaceMode {
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
  private readonly keys: FlightKeys = { thrust: false, brake: false, left: false, right: false, up: false, down: false, rollLeft: false, rollRight: false, turbo: false };
  private raf = 0;
  private lastTime = performance.now();
  private lastW = 0;
  private lastH = 0;
  private lastDpr = 0;
  private disposed = false;

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

    this.hud = new SpaceHud(hud);
    this.guide = new GuideHud(this.hud.root, {
      select: (t) => this.director.setTarget(t),
      engage: (t) => this.director.engage(t),
      search: (text) => this.director.searchStars(text),
      bookmarkRemove: (id) => this.director.removeBookmark(id),
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
    this.raf = requestAnimationFrame(this.frame);
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

  /** Um quadro do espaço: passo variável, limitado a SPACE_MAX_DT. */
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

    this.handleKeys(now);
    this.systems.update(this.director.nearestStar);
    this.systems.updateBodies(state.time, nav.autopilot ? nav.target?.id ?? null : null);
    const view = this.director.resolveView();

    // Voo: o piloto automático desliga se o piloto mexer em algo ou o alvo sumir.
    if (nav.autopilot) {
      const manual = this.ship.takesOver(MANUAL_KEYS.some((c) => this.input.hit(c)), this.input);
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
    const orbit = this.systems.orbitBody;
    if (orbit && this.input.hit('KeyF') && orbit.planet?.kind === 'rocky') {
      state.orbitPlanetId = orbit.planet.id;
      this.callbacks.onObserve(orbit.planet);
      // Ao observar, o modo é trocado e descartado na hora: nada mais deste quadro.
      if (this.disposed) return;
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

  private readFlightKeys(): void {
    const input = this.input;
    const k = this.keys;
    k.thrust = input.down('KeyW');
    k.brake = input.down('KeyS');
    k.left = input.down('KeyA');
    k.right = input.down('KeyD');
    k.up = input.down('Space');
    k.down = input.down('ShiftLeft') || input.down('ShiftRight');
    k.rollLeft = input.down('KeyQ');
    k.rollRight = input.down('KeyE');
    k.turbo = input.down('Tab');
  }

  private handleKeys(now: number): void {
    const input = this.input;
    if (input.hit('Digit1')) this.jumpToEarth();
    if (input.hit('Digit2')) this.jumpToStar('Rigil Kentaurus');
    if (input.hit('Digit3')) this.jumpToStar('Sirius');
    if (input.hit('KeyG')) this.guide.togglePanel();
    if (input.hit('KeyC')) this.director.toggleCruise();
    if (input.hit('KeyJ')) this.director.toggleAutopilot();
    if (input.hit('KeyN')) this.director.nextSuggestion();
    if (input.hit('KeyM')) this.probes.send(this.probes.pick(false), this.state.shipPos);
    if (input.hit('KeyR')) this.probes.send(this.probes.pick(true), this.state.shipPos);
    if (input.hit('KeyT')) this.director.lockAtCrosshair();
    if (input.hit('KeyV')) this.director.scan(now);
    if (input.hit('KeyB')) this.director.addBookmark();
    if (input.hit('KeyH')) this.director.goHome();
    if (input.hit('KeyX')) this.director.dropTarget();
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
