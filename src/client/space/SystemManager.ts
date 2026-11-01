import * as THREE from 'three';
import { AU_PER_PC } from '../../core/units';
import { planetOffset } from '../../nav/planets';
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
  circlePoints,
  compressOrbit,
  createCometBody,
  createOrbitLine,
  createPathLine,
  createPlanetBody,
  createPoiBody,
  createStarBody,
  type Body,
} from './bodies';
import { disposeObject } from './dispose';
import type { FloatingOrigin } from './FloatingOrigin';

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

  constructor(
    private readonly scene: THREE.Scene,
    private readonly origin: FloatingOrigin,
    private readonly state: GameState,
    private readonly listener: SystemListener,
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
      const body = createPlanetBody(p, this.state.surfaces);
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
  }

  private disposeSystem(): void {
    const sys = this.system;
    if (!sys) return;
    this.scene.remove(sys.group);
    this.origin.release(sys.star.object);
    for (const b of sys.planets) this.origin.release(b.object);
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
      b.surface!.rotation.y = time * 0.05;
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
  place(ship: THREE.Vector3, time: number): void {
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
    return true;
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
