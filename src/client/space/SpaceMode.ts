import * as THREE from 'three';
import { adaptiveMaxSpeed, formatDistance, formatSpeed } from '../../core/flight';
import { AU_PER_PC } from '../../core/units';
import { Input } from '../input';
import type { GameState } from '../state';
import {
  createOrbitLine,
  createPlanetBody,
  createStarBody,
  disposeGlowTexture,
  getGlowTexture,
  planetOffset,
  SOL_PLANETS,
  SUN_VISUAL_RADIUS,
  type Body,
  type PlanetData,
} from './bodies';
import { StarField } from './starField';

const SOL_ID = 0;
/** Distância (pc) em que o sistema de uma estrela passa a ser desenhado. */
const SYSTEM_ENTER_PC = 0.05;
const SYSTEM_EXIT_PC = 0.06;
const MOUSE_SENSITIVITY = 0.0022;

export interface SpaceCallbacks {
  onObserve(planet: PlanetData): void;
}

interface LocalSystem {
  starId: number;
  star: Body;
  planets: Body[];
  group: THREE.Group;
}

interface Label {
  el: HTMLDivElement;
  visible: boolean;
}

/**
 * Modo de exploração 3D: campo de estrelas em chunks, sistema local, nave
 * com voo livre e velocidade adaptativa. A câmera fica sempre na origem e o
 * mundo é transladado em torno dela (origem flutuante, RNF-05).
 */
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
  private readonly velocity = new THREE.Vector3();
  private readonly hudRoot: HTMLDivElement;
  private readonly hudEls: Record<string, HTMLElement> = {};
  private readonly labels = new Map<string, Label>();
  private system: LocalSystem | null = null;
  private nearestStar: { id: number; pos: THREE.Vector3; absmag: number; ci: number } | null = null;
  private orbitBody: Body | null = null;
  private throttle = 1;
  private lastNearest = 0;
  private lastHud = 0;
  private frames = 0;
  private fps = 0;
  private fpsTime = 0;
  private raf = 0;
  private lastTime = performance.now();
  private bank = 0;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly state: GameState,
    hud: HTMLElement,
    private readonly callbacks: SpaceCallbacks,
  ) {
    this.scene.background = new THREE.Color(0x02030a);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.08), this.starLight);
    this.stars = new StarField(state.manifest);
    this.scene.add(this.stars.group);
    this.input = new Input(renderer.domElement, true);

    this.engineGlow = this.buildShip();
    this.overlay.add(this.ship, this.overlayLight, new THREE.AmbientLight(0x8899bb, 0.6));

    this.hudRoot = document.createElement('div');
    this.hudRoot.className = 'space-hud';
    this.hudRoot.innerHTML = `
      <div class="hud-panel hud-top-left">
        <div class="hud-title">WE ARE MANY</div>
        <div><span class="k">Velocidade</span> <b data-h="speed"></b></div>
        <div><span class="k">Potência</span> <b data-h="throttle"></b></div>
        <div><span class="k">Mais próximo</span> <b data-h="nearest"></b></div>
        <div><span class="k">Distância</span> <b data-h="distance"></b></div>
        <div><span class="k">Posição</span> <b data-h="position"></b></div>
      </div>
      <div class="hud-panel hud-top-right">
        <div><span class="k">FPS</span> <b data-h="fps"></b></div>
        <div><span class="k">Chunks</span> <b data-h="chunks"></b></div>
        <div><span class="k">Estrelas carregadas</span> <b data-h="stars"></b></div>
        <div><span class="k">Memória GPU</span> <b data-h="memory"></b></div>
      </div>
      <div class="hud-crosshair"></div>
      <div class="hud-orbit hud-panel" data-h="orbit" hidden></div>
      <div class="hud-help">
        <b>Clique</b> para pilotar · <b>Mouse</b> mira · <b>W/S</b> frente/ré · <b>A/D</b> lados ·
        <b>Espaço/Shift</b> sobe/desce · <b>Q/E</b> gira · <b>Roda</b> potência · <b>Esc</b> solta o mouse ·
        <b>1</b> Terra · <b>2</b> Alfa Centauri · <b>3</b> Sirius
      </div>
      <div class="hud-labels" data-h="labels"></div>
      <div class="hud-lock" data-h="lock">Clique para pilotar</div>`;
    hud.appendChild(this.hudRoot);
    this.hudRoot.querySelectorAll<HTMLElement>('[data-h]').forEach((el) => {
      this.hudEls[el.dataset.h!] = el;
    });

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

  private readonly resize = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.overlayCamera.aspect = w / h;
    this.overlayCamera.updateProjectionMatrix();
  };

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.state.time += dt;
    this.frames++;
    if (now - this.fpsTime > 500) {
      this.fps = (this.frames * 1000) / (now - this.fpsTime);
      this.frames = 0;
      this.fpsTime = now;
    }

    this.handleDebugKeys();
    this.updateSystem();
    this.updateBodies();
    this.fly(dt);
    this.stars.update(this.state.shipPos, now);
    if (now - this.lastNearest > 200) {
      this.lastNearest = now;
      this.nearestStar = this.stars.nearest(this.state.shipPos, this.system?.starId);
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
    this.input.endFrame();
  };

  /** Atalhos de teste da Fase 0 para saltar entre estrelas. */
  private handleDebugKeys(): void {
    const jumpToStar = (name: string) => {
      const id = [...this.state.names].find(([, n]) => n === name)?.[0];
      const star = id !== undefined ? this.stars.find(id) : null;
      if (!star) return;
      this.state.shipPos.copy(star.pos).add(new THREE.Vector3(0.012 * AU_PER_PC, 0, 0));
      this.lookAt(star.pos);
    };
    if (this.input.hit('Digit1')) {
      const earth = SOL_PLANETS[2];
      const pos = planetOffset(earth, this.state.time, new THREE.Vector3());
      this.state.shipPos.copy(pos).add(new THREE.Vector3(0.01, 0.005, 0.003));
      this.lookAt(pos);
    }
    if (this.input.hit('Digit2')) jumpToStar('Rigil Kentaurus');
    if (this.input.hit('Digit3')) jumpToStar('Sirius');
  }

  private lookAt(target: THREE.Vector3): void {
    const m = new THREE.Matrix4().lookAt(this.state.shipPos, target, new THREE.Vector3(0, 0, 1));
    this.state.shipQuat.setFromRotationMatrix(m);
    this.velocity.set(0, 0, 0);
  }

  /** Cria ou descarta o sistema da estrela mais próxima. */
  private updateSystem(): void {
    const ship = this.state.shipPos;
    if (this.system) {
      if (ship.distanceTo(this.system.star.pos) > SYSTEM_EXIT_PC * AU_PER_PC) this.disposeSystem();
      return;
    }
    const solDist = ship.length();
    let candidate: { id: number; pos: THREE.Vector3; absmag: number; ci: number } | null = null;
    if (solDist < SYSTEM_ENTER_PC * AU_PER_PC) {
      candidate = { id: SOL_ID, pos: new THREE.Vector3(), absmag: 4.85, ci: 0.656 };
    } else if (this.nearestStar && this.nearestStar.pos.distanceTo(ship) < SYSTEM_ENTER_PC * AU_PER_PC) {
      candidate = this.nearestStar;
    }
    if (!candidate) return;
    const name = this.state.names.get(candidate.id) ?? `HYG ${candidate.id}`;
    const star = createStarBody(name, candidate.pos, candidate.absmag, candidate.ci);
    if (candidate.id === SOL_ID) star.radius = SUN_VISUAL_RADIUS;
    const group = new THREE.Group();
    group.add(star.object);
    const planets: Body[] = [];
    if (candidate.id === SOL_ID) {
      for (const p of SOL_PLANETS) {
        const body = createPlanetBody(p, this.state.surfaces);
        planets.push(body);
        group.add(body.object);
        const orbit = createOrbitLine(p);
        orbit.name = 'orbit';
        group.add(orbit);
      }
    }
    this.scene.add(group);
    this.system = { starId: candidate.id, star, planets, group };
    this.nearestStar = this.stars.nearest(ship, candidate.id);
  }

  private disposeSystem(): void {
    if (!this.system) return;
    this.scene.remove(this.system.group);
    disposeObject(this.system.group);
    this.system = null;
    this.orbitBody = null;
  }

  /** Move os planetas; a nave em órbita acompanha o planeta. */
  private updateBodies(): void {
    if (!this.system) return;
    const tmp = new THREE.Vector3();
    for (const b of this.system.planets) {
      const prev = tmp.copy(b.pos);
      planetOffset(b.planet!, this.state.time, b.pos).add(this.system.star.pos);
      if (this.orbitBody === b && prev.lengthSq() > 0) this.state.shipPos.add(prev.sub(b.pos).negate());
      b.object.getObjectByName('surface')!.rotation.y = this.state.time * 0.05;
    }
  }

  private bodies(): Body[] {
    return this.system ? [this.system.star, ...this.system.planets] : [];
  }

  /** Distância até a superfície visível mais próxima, em UA. */
  private distanceToNearestSurface(): { dist: number; name: string } {
    let best = { dist: Infinity, name: '—' };
    for (const b of this.bodies()) {
      const d = b.pos.distanceTo(this.state.shipPos) - b.radius;
      if (d < best.dist) best = { dist: d, name: b.name };
    }
    if (this.nearestStar) {
      const d = this.nearestStar.pos.distanceTo(this.state.shipPos) - SUN_VISUAL_RADIUS;
      if (d < best.dist) best = { dist: d, name: this.state.names.get(this.nearestStar.id) ?? `HYG ${this.nearestStar.id}` };
    }
    return best;
  }

  private fly(dt: number): void {
    const input = this.input;
    const q = this.state.shipQuat;
    if (input.locked) {
      const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -input.mouseDx * MOUSE_SENSITIVITY);
      const pitch = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -input.mouseDy * MOUSE_SENSITIVITY);
      q.multiply(yaw).multiply(pitch);
    }
    const roll = (input.down('KeyQ') ? 1 : 0) - (input.down('KeyE') ? 1 : 0);
    if (roll) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), roll * 1.4 * dt));
    q.normalize();
    if (input.wheel) this.throttle = THREE.MathUtils.clamp(this.throttle - input.wheel * 0.1, 0.1, 1);

    const dir = new THREE.Vector3(
      (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0),
      (input.down('Space') ? 1 : 0) - (input.down('ShiftLeft') || input.down('ShiftRight') ? 1 : 0),
      (input.down('KeyS') ? 1 : 0) - (input.down('KeyW') ? 1 : 0),
    );
    const maxSpeed = adaptiveMaxSpeed(this.distanceToNearestSurface().dist);
    const target = dir.lengthSq() > 0 ? dir.normalize().applyQuaternion(q).multiplyScalar(maxSpeed * this.throttle) : dir;
    this.velocity.lerp(target, 1 - Math.exp(-2.5 * dt));
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
      }
    }

    this.bank = THREE.MathUtils.lerp(this.bank, (input.locked ? -input.mouseDx * 0.01 : 0) + roll * 0.3, 1 - Math.exp(-6 * dt));
    this.ship.rotation.set(input.locked ? -input.mouseDy * 0.004 : 0, 0, this.bank);
    const thrust = this.velocity.length() / Math.max(maxSpeed, 1e-12);
    this.engineGlow.scale.setScalar(0.25 + thrust * 0.5);
    (this.engineGlow.material as THREE.SpriteMaterial).opacity = 0.3 + thrust * 0.7;
  }

  private placeObjects(): void {
    const ship = this.state.shipPos;
    this.camera.quaternion.copy(this.state.shipQuat);
    this.camera.position.set(0, 0, 0);
    this.camera.updateMatrixWorld();
    if (!this.system) {
      this.starLight.intensity = 0;
      return;
    }
    const { star, planets, group } = this.system;
    star.object.position.subVectors(star.pos, ship);
    const glow = star.object.getObjectByName('glow') as THREE.Sprite;
    const dist = star.pos.distanceTo(ship);
    glow.scale.setScalar(Math.max(star.radius * 10, dist * 0.04));
    for (const b of planets) b.object.position.subVectors(b.pos, ship);
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
    const kind = p.kind === 'rocky' ? 'Rochoso' : p.kind === 'gas' ? 'Gigante gasoso' : 'Gigante de gelo';
    el.hidden = false;
    el.innerHTML = `
      <div class="hud-title">Em órbita de ${p.name}</div>
      <div class="orbit-data">
        <span>Tipo</span><b>${kind}</b>
        <span>Raio</span><b>${p.radiusKm.toLocaleString('pt-BR')} km</b>
        <span>Distância da estrela</span><b>${p.aAu} UA</b>
        <span>Temperatura média</span><b>${p.temperatureK} K</b>
      </div>
      <div class="orbit-actions">
        ${p.kind === 'rocky' ? '<div class="action"><kbd>F</kbd> Observar superfície</div>' : '<div class="action off">Sem superfície sólida</div>'}
        <div class="action off"><kbd>M</kbd> Minerar (Fase 2)</div>
        <div class="action off"><kbd>B</kbd> Construir (Fase 3)</div>
      </div>
      <div class="source">Dados reais: NASA/JPL · escala visual comprimida</div>`;
  }

  private updateHud(): void {
    const nearest = this.distanceToNearestSurface();
    const pc = this.state.shipPos.clone().divideScalar(AU_PER_PC);
    const mem = this.renderer.info.memory;
    this.hudEls.speed.textContent = formatSpeed(this.velocity.length());
    this.hudEls.throttle.textContent = `${Math.round(this.throttle * 100)}%`;
    this.hudEls.nearest.textContent = nearest.name;
    this.hudEls.distance.textContent = Number.isFinite(nearest.dist) ? formatDistance(Math.max(nearest.dist, 0)) : '—';
    this.hudEls.position.textContent = `${pc.x.toFixed(3)}, ${pc.y.toFixed(3)}, ${pc.z.toFixed(3)} pc`;
    this.hudEls.fps.textContent = this.fps.toFixed(0);
    this.hudEls.chunks.textContent = `${this.stars.loadedCount} / ${this.state.manifest.manifest.nodes.length}`;
    this.hudEls.stars.textContent = this.stars.starCount.toLocaleString('pt-BR');
    this.hudEls.memory.textContent = `${mem.geometries} geometrias, ${mem.textures} texturas`;
    this.hudEls.lock.hidden = this.input.locked;
  }

  /** Rótulos na tela para a estrela mais próxima e os corpos do sistema. */
  private updateLabels(): void {
    const items: { key: string; name: string; pos: THREE.Vector3 }[] = [];
    if (this.nearestStar) {
      items.push({ key: 'star', name: this.state.names.get(this.nearestStar.id) ?? `HYG ${this.nearestStar.id}`, pos: this.nearestStar.pos });
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
      label.el.textContent = `${it.name} · ${formatDistance(dist)}`;
      label.el.style.transform = `translate(${((v.x + 1) / 2) * w + 10}px, ${((1 - v.y) / 2) * h - 8}px)`;
    }
    for (const l of this.labels.values()) l.el.hidden = !l.visible;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.input.dispose();
    this.disposeSystem();
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
