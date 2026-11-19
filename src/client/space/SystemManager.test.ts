import * as THREE from 'three';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSurface, type SurfaceMap } from '../../procgen/surface';
import type { GameState } from '../state';
import { generateSurfaceAsync } from '../surface/generateAsync';
import { planetParams, SOL_PLANETS, type Body } from './bodies';
import { FloatingOrigin } from './FloatingOrigin';
import { SystemManager } from './SystemManager';

vi.mock('../surface/generateAsync', () => ({ generateSurfaceAsync: vi.fn() }));

const EARTH = 'sol-3';

/** Os canvas das texturas de faixas e do brilho: o suficiente para rodar sem navegador. */
const stubDocument = () => ({
  createElement: () => ({
    width: 0,
    height: 0,
    getContext: () => ({ fillStyle: '', fillRect() {}, createRadialGradient: () => ({ addColorStop() {} }) }),
  }),
});

function newState(): GameState {
  return {
    shipPos: new THREE.Vector3(0.3, 0.1, 0),
    shipQuat: new THREE.Quaternion(),
    time: 0,
    names: new Map(),
    surfaces: new Map(),
    surfaceArt: new Map(),
    orbitPlanetId: null,
    orbitOffset: null,
  } as unknown as GameState;
}

const silent = { systemEntered() {}, systemLeft() {}, visitorArrived() {} };
const manager = (state: GameState) => new SystemManager(new THREE.Scene(), new FloatingOrigin(), state, silent);
const planet = (sys: SystemManager, id: string): Body => sys.system!.planets.find((b) => b.planet!.id === id)!;

/** O começo de um quadro do espaço, na ordem do SpaceMode. */
function frame(sys: SystemManager, state: GameState): Body | null {
  sys.update(null);
  sys.updateBodies(state.time, null);
  const anchored = sys.restoreOrbit();
  sys.updateOrbit();
  return anchored;
}

/** Estado de quem desceu à Terra estando em órbita, a 2,5 raios dela. */
function descended(): { state: GameState; offset: THREE.Vector3 } {
  const state = newState();
  const sys = manager(state);
  frame(sys, state);
  const earth = planet(sys, EARTH);
  const offset = new THREE.Vector3(earth.radius * 2.5, 0, 0);
  state.shipPos.copy(earth.pos).add(offset);
  sys.updateOrbit();
  expect(sys.orbitBody).toBe(earth);
  sys.rememberOrbit();
  sys.dispose();
  return { state, offset };
}

beforeAll(() => vi.stubGlobal('document', stubDocument()));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => {
  vi.mocked(generateSurfaceAsync).mockReset();
  vi.mocked(generateSurfaceAsync).mockReturnValue(new Promise<SurfaceMap>(() => {}));
});

describe('voltar da superfície', () => {
  it('sem reancorar, 1.000 s de relógio já tiram a nave da órbita (o bug que isto evita)', () => {
    const { state } = descended();
    state.orbitPlanetId = null;
    state.time += 1000;
    const sys = manager(state);
    frame(sys, state);
    const earth = planet(sys, EARTH);
    expect(earth.pos.distanceTo(state.shipPos)).toBeGreaterThan(earth.radius * 4);
    expect(sys.orbitBody).toBeNull();
  });

  it('a nave volta à órbita do planeta, no mesmo lugar em relação a ele', () => {
    const { state, offset } = descended();
    state.time += 1000;
    const sys = manager(state);

    const anchored = frame(sys, state);

    const earth = planet(sys, EARTH);
    expect(anchored).toBe(earth);
    expect(sys.orbitBody).toBe(earth);
    expect(state.shipPos.clone().sub(earth.pos).distanceTo(offset)).toBeLessThan(1e-12);
  });

  it('depois de reancorar a nave acompanha o planeta, como em qualquer órbita', () => {
    const { state } = descended();
    state.time += 1000;
    const sys = manager(state);
    frame(sys, state);
    const earth = planet(sys, EARTH);
    const rel = state.shipPos.clone().sub(earth.pos);
    state.time += 60;
    expect(frame(sys, state)).toBeNull();
    expect(sys.orbitBody).toBe(earth);
    expect(state.shipPos.clone().sub(earth.pos).distanceTo(rel)).toBeLessThan(1e-12);
  });

  it('o pedido é consumido: um save feito depois não reposiciona a nave de novo', () => {
    const { state } = descended();
    frame(manager(state), state);
    expect(state.orbitPlanetId).toBeNull();
    expect(state.orbitOffset).toBeNull();
  });

  it('save antigo, com o planeta e sem o deslocamento: a nave fica onde está', () => {
    const state = newState();
    state.orbitPlanetId = EARTH;
    const before = state.shipPos.clone();
    expect(frame(manager(state), state)).toBeNull();
    expect(state.shipPos.distanceTo(before)).toBe(0);
    expect(state.orbitPlanetId).toBeNull();
  });

  it('sem o sistema carregado, o pedido espera; planeta que não existe é descartado', () => {
    const state = newState();
    state.orbitPlanetId = 'outro-sistema-1';
    state.orbitOffset = new THREE.Vector3(1, 0, 0);
    const sys = manager(state);
    expect(sys.restoreOrbit()).toBeNull();
    expect(state.orbitPlanetId).toBe('outro-sistema-1');

    const before = state.shipPos.clone();
    expect(frame(sys, state)).toBeNull();
    expect(state.orbitPlanetId).toBeNull();
    expect(state.shipPos.distanceTo(before)).toBe(0);
  });
});

describe('prévias dos planetas', () => {
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const map = () => generateSurface(planetParams(SOL_PLANETS[1]), 0.25);

  /** Módulos novos: a fila e o cache das prévias são por módulo, e os testes acima deixam prévias pendentes. */
  async function fresh() {
    vi.resetModules();
    const { SystemManager: Fresh } = await import('./SystemManager');
    const { generateSurfaceAsync: generate } = await import('../surface/generateAsync');
    const state = newState();
    return { sys: new Fresh(new THREE.Scene(), new FloatingOrigin(), state, silent), generate: vi.mocked(generate) };
  }

  it('entrar no sistema não gera mapa na thread principal: as prévias vão ao Worker, e a textura troca ao chegar', async () => {
    const { sys, generate } = await fresh();
    generate.mockResolvedValue(map());
    sys.update(null);
    const pending = sys.system!.planets.filter((b) => b.previewPending);
    expect(pending.length).toBeGreaterThan(0);
    expect(generate).not.toHaveBeenCalled();
    for (let i = 0; i < 12 && pending.some((b) => b.previewPending); i++) await tick();
    expect(pending.every((b) => !b.previewPending)).toBe(true);
    expect(generate).toHaveBeenCalledTimes(pending.length);
    sys.dispose();
  });

  it('as prévias saem uma por vez, para não abrir um Worker por planeta', async () => {
    const { sys, generate } = await fresh();
    const deliveries: ((m: SurfaceMap) => void)[] = [];
    generate.mockImplementation(() => new Promise((resolve) => deliveries.push(resolve)));
    sys.update(null);
    await tick();
    expect(deliveries.length).toBe(1);
    deliveries[0](map());
    await tick();
    expect(deliveries.length).toBe(2);
    sys.dispose();
  });

  it('uma prévia que falha não trava as seguintes', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { sys, generate } = await fresh();
    generate.mockRejectedValueOnce(new Error('sem Worker')).mockResolvedValue(map());
    sys.update(null);
    const pending = sys.system!.planets.filter((b) => b.previewPending);
    for (let i = 0; i < 12; i++) await tick();
    expect(pending.filter((b) => b.previewPending).length).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    sys.dispose();
  });

  it('se a nave sair do sistema antes de a prévia chegar, o corpo descartado não é tocado', async () => {
    const { sys, generate } = await fresh();
    generate.mockResolvedValue(map());
    sys.update(null);
    const left = sys.system!.planets.filter((b) => b.previewPending);
    sys.dispose();
    for (let i = 0; i < 12; i++) await tick();
    expect(left.length).toBeGreaterThan(0);
    expect(left.every((b) => b.previewPending)).toBe(true);
  });
});
