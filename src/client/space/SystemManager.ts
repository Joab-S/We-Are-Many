import * as THREE from 'three';
import { AU_PER_PC } from '../../core/units';
import { planetOffset } from '../../nav/planets';
import type { SurfaceMap } from '../../procgen/surface';
import type { Poi } from '../../nav/poi';
import {
  COMET_RADIUS,
  cometOffset,
  cometPath,
  generateSystem,
  SOL_ID,
  starInfo,
  starVisualRadius,
  VISITOR_WINDOW_S,
  visitorComet,
  type CometData,
  type StarInfo,
  type StarRef,
  type SystemData,
} from '../../nav/systemGen';
import type { GameState } from '../state';
import {
  applyPreview,
  circlePoints,
  compressOrbit,
  createCometBody,
  createOrbitLine,
  createPathLine,
  createPlanetBody,
  createPoiBody,
  createStarBody,
  loadPreview,
  planetParams,
  planetPixelsOf,
  isLowOver,
  spinRate,
  turnWithPlanet,
  type Body,
} from './bodies';
import { disposeObject } from './dispose';
import type { LodView } from './planet/lod';
import { requestPregen } from './planet/pregen';
import { mapHeight, QuadSphere } from './planet/QuadSphere';
import type { FloatingOrigin } from './FloatingOrigin';

/** Dentro desta distância, em raios do centro, o quadtree toma o lugar da esfera (2 raios de altitude). */
const QUAD_DISTANCE = 3;
/** Até aqui a nave conta como em órbita: é o que o quadtree dura na memória. */
const ORBIT_DISTANCE = 4;

/** De onde a câmera do mundo olha, em cada quadro, para o quadtree escolher o detalhe. */
export interface CameraView {
  quaternion: THREE.Quaternion;
  /** Metade do ângulo de visão da diagonal da tela, em radianos. */
  halfAngle: number;
  pixelsPerRadian: number;
}

/** Distância (pc) em que o sistema de uma estrela passa a ser desenhado. */
export const SYSTEM_ENTER_PC = 0.05;
export const SYSTEM_EXIT_PC = 0.06;

/** O Sol, que existe mesmo antes de o chunk dele carregar. */
const SOL: StarRef & { pos: THREE.Vector3 } = { id: SOL_ID, pos: new THREE.Vector3(), absmag: 4.85, ci: 0.656 };

/** Sistema estelar desenhado em volta da nave. */
export interface LocalSystem {
  starId: number;
  info: StarInfo;
  data: SystemData;
  star: Body;
  planets: Body[];
  comets: Body[];
  cometData: CometData[];
  group: THREE.Group;
  /** Linhas de órbita, de cometa e da zona habitável (todas centradas na estrela). */
  orbits: THREE.Object3D[];
  /** Cometa visitante da janela de tempo atual (não faz parte do sistema fixo). */
  visitor: { window: number; body: Body | null; path: THREE.Object3D | null };
}

/** Quem acompanha o ciclo de vida do sistema (o GUIA e o HUD). */
export interface SystemListener {
  /** A nave entrou num sistema (o grupo já está na cena). */
  systemEntered(sys: LocalSystem): void;
  /** O sistema foi descartado ao sair dele. */
  systemLeft(): void;
  /** Um cometa visitante apareceu: ao entrar no sistema (`entering`) ou ao virar a janela de tempo. */
  visitorArrived(sys: LocalSystem, comet: CometData, entering: boolean): void;
}

/**
 * Ciclo de vida do sistema estelar e dos corpos perto da nave: cria o
 * sistema da estrela mais próxima ao chegar perto e o descarta ao sair,
 * move planetas e cometas, troca o cometa visitante a cada janela de
 * tempo, mantém os objetos 3D dos pontos de interesse e detecta a órbita
 * de um planeta. Os corpos ficam ancorados na origem flutuante.
 */
export class SystemManager {
  system: LocalSystem | null = null;
  /** Planeta em cuja órbita a nave está. */
  orbitBody: Body | null = null;
  /** Luz da estrela local; fica apagada no espaço profundo. */
  readonly starLight = new THREE.PointLight(0xffffff, 3, 0, 0);
  private readonly poiBodies = new Map<string, { poi: Poi; body: Body }>();
  /** Corpos sólidos em cache: refeito só quando o sistema ou os pontos de interesse mudam. */
  private list: Body[] = [];
  private dirty = true;
  /** Muda a cada troca de corpos: quem guarda algo derivado deles sabe quando refazer. */
  version = 0;
  private readonly prev = new THREE.Vector3();
  private readonly forward = new THREE.Vector3();
  private readonly spin = new THREE.Quaternion();
  private readonly lodView: LodView = { camera: this.prev, pixelsPerRadian: 1 };

  constructor(
    private readonly scene: THREE.Scene,
    private readonly origin: FloatingOrigin,
    private readonly state: GameState,
    private readonly listener: SystemListener,
    private readonly anisotropy = 1,
    /** O renderizador é o WebGL: os rochosos usam o shader, e não o material que o `SoftRenderer` entende. */
    private readonly webgl = false,
  ) {}

  private changed(): void {
    this.dirty = true;
    this.version++;
  }

  /** Cria ou descarta o sistema da estrela mais próxima. */
  update(nearestStar: (StarRef & { pos: THREE.Vector3 }) | null): void {
    const ship = this.state.shipPos;
    if (this.system) {
      if (ship.distanceTo(this.system.star.pos) > SYSTEM_EXIT_PC * AU_PER_PC) {
        this.disposeSystem();
        this.listener.systemLeft();
      }
      return;
    }
    let candidate: (StarRef & { pos: THREE.Vector3 }) | null = null;
    if (ship.length() < SYSTEM_ENTER_PC * AU_PER_PC) candidate = SOL;
    else if (nearestStar && nearestStar.pos.distanceTo(ship) < SYSTEM_ENTER_PC * AU_PER_PC) candidate = nearestStar;
    if (!candidate) return;
    const info = starInfo(candidate, this.state.names);
    const data = generateSystem(info);
    const star = createStarBody(info.name, candidate.pos, candidate.absmag, candidate.ci);
    star.radius = starVisualRadius(info);
    const group = new THREE.Group();
    group.add(star.object);
    this.origin.anchor(star.object, star.pos);
    const orbits: THREE.Object3D[] = [];
    const addOrbit = (line: THREE.Object3D) => {
      line.name = 'orbit';
      group.add(line);
      orbits.push(line);
      this.origin.anchor(line, star.pos);
    };
    const planets: Body[] = [];
    for (const p of data.planets) {
      const body = createPlanetBody(p, this.state, this.anisotropy, this.webgl);
      planets.push(body);
      group.add(body.object);
      this.origin.anchor(body.object, body.pos);
      addOrbit(createOrbitLine(p));
    }
    if (data.planets.length) {
      // Zona habitável: faixa verde entre duas linhas, para o jogador ver onde a vida é possível.
      for (const a of data.habitable) addOrbit(createPathLine(circlePoints(compressOrbit(a)), 0x48c878, 0.28));
    }
    const comets: Body[] = [];
    for (const c of data.comets) {
      const body = createCometBody(c.id, c.name, COMET_RADIUS);
      comets.push(body);
      group.add(body.object);
      this.origin.anchor(body.object, body.pos);
      addOrbit(createPathLine(cometPath(c), 0x7fb8d8, 0.16));
    }
    this.scene.add(group);
    this.system = { starId: candidate.id, info, data, star, planets, comets, cometData: [...data.comets], group, orbits, visitor: { window: -1, body: null, path: null } };
    this.changed();
    this.listener.systemEntered(this.system);
    this.swapVisitor(Math.floor(this.state.time / VISITOR_WINDOW_S), true);
    for (const body of planets) if (body.previewPending) this.requestPreview(body);
  }

  /** Pede a prévia do planeta ao Worker; se a nave já saiu do sistema, ela só fica no cache. */
  private requestPreview(body: Body): void {
    const p = body.planet!;
    void loadPreview(p.id, planetParams(p)).then(
      (preview) => {
        // Se o mapa inteiro chegou primeiro, a prévia não toma o lugar dele.
        if (body.previewPending && this.system?.planets.includes(body)) applyPreview(body, preview, this.anisotropy);
      },
      (err) => console.warn(`Falha ao gerar a prévia de ${p.name}`, err),
    );
  }

  private disposeSystem(): void {
    const sys = this.system;
    if (!sys) return;
    this.scene.remove(sys.group);
    this.origin.release(sys.star.object);
    for (const b of sys.planets) {
      b.quad?.dispose();
      this.origin.release(b.object);
    }
    for (const b of sys.comets) this.origin.release(b.object);
    for (const o of sys.orbits) this.origin.release(o);
    disposeObject(sys.group);
    this.system = null;
    this.orbitBody = null;
    this.changed();
  }

  /** Move planetas e cometas; a nave em órbita (ou chegando com o piloto em `chaseId`) acompanha o corpo. */
  updateBodies(time: number, chaseId: string | null): void {
    const sys = this.system;
    if (!sys) return;
    const ship = this.state.shipPos;
    for (const b of sys.planets) {
      const prev = this.prev.copy(b.pos);
      planetOffset(b.planet!, time, b.pos).add(sys.star.pos);
      if ((this.orbitBody === b || this.chasing(b, chaseId)) && prev.lengthSq() > 0) ship.add(prev.sub(b.pos).negate());
      const surface = b.surface!;
      const before = surface.rotation.y;
      surface.rotation.y = time * spinRate(b.planet!);
      if (this.orbitBody === b && isLowOver(b, ship)) {
        const offset = this.prev.subVectors(ship, b.pos);
        turnWithPlanet(surface, surface.rotation.y - before, offset, this.state.shipQuat);
        ship.copy(b.pos).add(offset);
      }
    }
    const window = Math.floor(time / VISITOR_WINDOW_S);
    if (window !== sys.visitor.window) this.swapVisitor(window, false);
    for (let i = 0; i < sys.comets.length; i++) {
      const b = sys.comets[i];
      const prev = this.prev.copy(b.pos);
      const realR = cometOffset(sys.cometData[i], time, b.pos);
      b.pos.add(sys.star.pos);
      if (this.chasing(b, chaseId) && prev.lengthSq() > 0) ship.add(prev.sub(b.pos).negate());
      b.object.userData.realR = realR;
    }
  }

  /**
   * Com o piloto automático indo a um corpo que se move, a nave acompanha o
   * movimento dele na reta final; sem isso ela persegue o planeta sem nunca
   * alcançar a órbita.
   */
  private chasing(b: Body, chaseId: string | null): boolean {
    return chaseId !== null && chaseId === (b.planet?.id ?? b.id) && b.pos.distanceTo(this.state.shipPos) < b.radius * 40;
  }

  /** Troca o cometa visitante quando muda a janela de tempo. */
  private swapVisitor(window: number, entering: boolean): void {
    const sys = this.system!;
    const old = sys.visitor;
    if (old.body) {
      sys.group.remove(old.body.object, old.path!);
      this.origin.release(old.body.object);
      this.origin.release(old.path!);
      sys.orbits.splice(sys.orbits.indexOf(old.path!), 1);
      disposeObject(old.body.object);
      disposeObject(old.path!);
      const i = sys.comets.indexOf(old.body);
      sys.comets.splice(i, 1);
      sys.cometData.splice(i, 1);
      this.changed();
    }
    sys.visitor = { window, body: null, path: null };
    const c = visitorComet(sys.data, window);
    if (!c) return;
    const body = createCometBody(c.id, c.name, COMET_RADIUS);
    const path = createPathLine(cometPath(c), 0xb8e0ff, 0.12);
    path.name = 'orbit';
    sys.group.add(body.object, path);
    this.origin.anchor(body.object, body.pos);
    this.origin.anchor(path, sys.star.pos);
    sys.orbits.push(path);
    sys.comets.push(body);
    sys.cometData.push(c);
    sys.visitor = { window, body, path };
    this.changed();
    this.listener.visitorArrived(sys, c, entering);
  }

  /** Estrela, planetas, cometas e pontos de interesse sólidos (sem nebulosas). Não guardar: muda com o sistema. */
  bodies(): readonly Body[] {
    if (this.dirty) {
      const list: Body[] = [];
      const sys = this.system;
      if (sys) list.push(sys.star, ...sys.planets, ...sys.comets);
      for (const { body, poi } of this.poiBodies.values()) if (poi.kind !== 'nebula') list.push(body);
      this.list = list;
      this.dirty = false;
    }
    return this.list;
  }

  /** Pontos de interesse com objeto 3D agora. */
  pois(): IterableIterator<{ poi: Poi; body: Body }> {
    return this.poiBodies.values();
  }

  /** Desenha estes pontos de interesse (na ordem dada) e descarta os outros. */
  syncPois(draw: readonly Poi[]): void {
    let changed = false;
    for (const p of draw) {
      if (this.poiBodies.has(p.id)) continue;
      const body = createPoiBody(p.id, p.name, p.kind, new THREE.Vector3(...p.pos), p.radius, p.color);
      this.scene.add(body.object);
      this.origin.anchor(body.object, body.pos);
      this.poiBodies.set(p.id, { poi: p, body });
      changed = true;
    }
    for (const [id, { body }] of this.poiBodies) {
      if (draw.some((p) => p.id === id)) continue;
      this.removePoi(id, body);
      changed = true;
    }
    if (changed) this.changed();
  }

  private removePoi(id: string, body: Body): void {
    this.scene.remove(body.object);
    this.origin.release(body.object);
    disposeObject(body.object);
    this.poiBodies.delete(id);
  }

  /**
   * Efeitos que dependem da distância à nave: brilhos que nunca ficam
   * menores que um ponto, caudas dos cometas, pedras dos anéis e a luz da
   * estrela. As posições já foram postas pela origem flutuante.
   */
  place(ship: THREE.Vector3, time: number, camera?: CameraView): void {
    for (const { poi, body } of this.poiBodies.values()) {
      const dist = body.pos.distanceTo(ship);
      const glow = body.glow!;
      // O brilho nunca fica menor que um ponto visível na tela.
      glow.scale.setScalar(poi.kind === 'nebula' ? Math.max(poi.radius * 2.4, dist * 0.03) : Math.max(poi.radius * 8, dist * 0.008));
      if (poi.kind === 'signal' || poi.kind === 'derelict') {
        glow.material.opacity = 0.45 + 0.45 * Math.abs(Math.sin(time * (poi.kind === 'signal' ? 2.2 : 0.9)));
      }
    }

    const sys = this.system;
    if (!sys) {
      this.starLight.intensity = 0;
      return;
    }
    const { star, planets, comets } = sys;
    star.glow!.scale.setScalar(Math.max(star.radius * 10, star.pos.distanceTo(ship) * 0.04));
    for (const b of planets) {
      // As pedras dos anéis só aparecem de perto; de longe o anel liso basta.
      if (b.rocks) b.rocks.visible = b.pos.distanceTo(ship) < b.radius * 60;
      b.starDir?.subVectors(star.object.position, b.object.position).normalize();
      if (camera) this.updateQuad(b, ship, camera);
    }
    const away = this.prev;
    for (const b of comets) {
      const d = b.pos.distanceTo(ship);
      const realR = (b.object.userData.realR as number) ?? 5;
      b.glow!.scale.setScalar(Math.max(b.radius * (20 + 60 / realR), d * 0.006));
      // A cauda aponta para longe da estrela e cresce perto dela.
      away.subVectors(b.pos, star.pos).normalize().multiplyScalar(THREE.MathUtils.clamp(0.35 / realR, 0.004, 0.5));
      const attr = b.tail!.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      arr[3] = away.x;
      arr[4] = away.y;
      arr[5] = away.z;
      attr.needsUpdate = true;
    }
    this.starLight.position.copy(star.object.position);
    this.starLight.intensity = 3;
  }

  /** O mapa em que o chão do planeta se apoia: o da visita ou o adiantado da órbita. */
  private mapOf(id: string): SurfaceMap | null {
    const { surfaces, pregen } = this.state;
    return surfaces.get(id) ?? (pregen?.id === id ? pregen.map : null);
  }

  private ensureQuad(b: Body): void {
    if (b.quad || !this.webgl || b.kind !== 'rocky') return;
    const map = this.mapOf(b.planet!.id);
    if (!map) return;
    b.quad = new QuadSphere(b.radius, mapHeight(map), (b.surface as THREE.Mesh).material as THREE.Material);
    b.object.add(b.quad.group);
  }

  /** O quadtree existe enquanto a nave está em órbita e há mapa; sem WebGL, nunca: fica a esfera. */
  private updateQuad(b: Body, ship: THREE.Vector3, camera: CameraView): void {
    if (!this.webgl || b.kind !== 'rocky') return;
    const surface = b.surface as THREE.Mesh;
    const distance = b.pos.distanceTo(ship);
    if (distance >= b.radius * ORBIT_DISTANCE) {
      if (b.quad) {
        b.quad.dispose();
        b.quad = undefined;
        surface.visible = true;
      }
      return;
    }
    this.ensureQuad(b);
    if (!b.quad) return;
    const near = distance < b.radius * QUAD_DISTANCE;
    surface.visible = !near;
    b.quad.group.visible = near;
    if (!near) return;
    b.quad.group.quaternion.copy(surface.quaternion);
    // A câmera no referencial do planeta, em raios.
    const toPlanet = this.spin.copy(surface.quaternion).invert();
    const local = this.prev.subVectors(ship, b.pos).applyQuaternion(toPlanet).divideScalar(b.radius);
    const forward = this.forward.set(0, 0, -1).applyQuaternion(camera.quaternion).applyQuaternion(toPlanet);
    this.lodView.camera = local;
    this.lodView.forward = forward;
    this.lodView.halfAngle = camera.halfAngle;
    this.lodView.pixelsPerRadian = camera.pixelsPerRadian;
    b.quad.update(this.lodView);
  }

  /** Posição da estrela local na cena (depois da origem flutuante), ou null no espaço profundo. */
  starLocal(): THREE.Vector3 | null {
    return this.system ? this.system.star.object.position : null;
  }

  /** Planeta em cuja órbita a nave está (a menos de 4 raios). Devolve true se mudou. */
  updateOrbit(): boolean {
    const ship = this.state.shipPos;
    let orbit: Body | null = null;
    const planets = this.system?.planets;
    if (planets) {
      for (const b of planets) if (b.pos.distanceTo(ship) < b.radius * 4) orbit = b;
    }
    if (orbit === this.orbitBody) return false;
    this.orbitBody = orbit;
    if (orbit?.kind === 'rocky' && !this.state.surfaces.has(orbit.planet!.id)) this.pregenerate(orbit);
    return true;
  }

  /** Adianta o mapa do planeta em órbita. Quando ele chega, a esfera troca a prévia pelo mapa inteiro. */
  private pregenerate(body: Body): void {
    const slot = requestPregen(this.state, planetParams(body.planet!));
    if (!this.webgl) return;
    void slot.job.then((map) => {
      if (!this.system?.planets.includes(body) || this.state.pregen !== slot) return;
      applyPreview(body, planetPixelsOf(map), this.anisotropy);
    });
  }

  /** A nave vai descer ao planeta em órbita: guarda onde ela estava em relação a ele. */
  rememberOrbit(): void {
    const body = this.orbitBody;
    if (!body?.planet) return;
    this.state.orbitPlanetId = body.planet.id;
    this.state.orbitOffset = this.state.shipPos.clone().sub(body.pos);
    // Perto do chão, a nave está num lugar do planeta, e não num lugar em volta dele: ao voltar, é o mesmo lugar do mapa.
    this.state.orbitSpin = isLowOver(body, this.state.shipPos) ? body.surface!.rotation.y : null;
  }

  /**
   * De volta da superfície: o relógio andou e o planeta está em outro ponto da
   * órbita, então a nave volta para o mesmo lugar em relação a ele. Chamar depois
   * de `updateBodies`, com o planeta já na posição certa; o `updateOrbit` do mesmo
   * quadro reconhece a órbita pela distância. Como isso consome o pedido, um save
   * posterior não reposiciona a nave de novo. Devolve o corpo se a nave mudou de lugar.
   */
  restoreOrbit(): Body | null {
    const state = this.state;
    const sys = this.system;
    // Sem o sistema (a estrela ainda não carregou), o pedido espera os próximos quadros.
    if (state.orbitPlanetId === null || !sys) return null;
    const body = sys.planets.find((b) => b.planet!.id === state.orbitPlanetId);
    const offset = state.orbitOffset;
    const spin = state.orbitSpin;
    state.orbitPlanetId = null;
    state.orbitOffset = null;
    state.orbitSpin = null;
    // Saves antigos guardam o planeta sem o deslocamento: a nave fica onde está.
    if (!body || !offset) return null;
    if (spin != null) turnWithPlanet(body.surface!, body.surface!.rotation.y - spin, offset);
    state.shipPos.copy(body.pos).add(offset);
    // Já neste quadro, ou a colisão empurra a nave para onde a esfera lisa aguenta.
    this.ensureQuad(body);
    return body;
  }

  /** O Sistema Solar está em volta da nave, mesmo que ainda não desenhado. */
  nearSol(): boolean {
    return this.state.shipPos.length() < SYSTEM_EXIT_PC * AU_PER_PC;
  }

  dispose(): void {
    this.disposeSystem();
    for (const [id, { body }] of this.poiBodies) this.removePoi(id, body);
  }
}
