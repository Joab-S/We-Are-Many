import * as THREE from 'three';
import { loadManifest, loadNames } from '../universe/loader';
import { AdaptiveResolution } from './quality';
import { SoftRenderer, webglAvailable, type GameRenderer } from './renderer';
import { nativeSpecies } from '../sim/species';
import { planetParams, SOL_PLANETS, type PlanetData } from './space/bodies';
import { SpaceMode } from './space/SpaceMode';
import type { GameState } from './state';
import { SurfaceMode } from './surface/SurfaceMode';
import './style.css';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const loading = document.getElementById('loading')!;

// Sem WebGL (aceleração de hardware desligada, GPU bloqueada, driver antigo)
// o jogo usa o renderizador por software em Canvas 2D. `?soft` força esse modo.
let soft = new URLSearchParams(location.search).has('soft') || !webglAvailable();
let webgl: GameRenderer | null = null;
if (!soft) {
  try {
    webgl = createWebGLRenderer();
  } catch (err) {
    console.warn('WebGL indisponível, usando o renderizador por software', err);
    soft = true;
  }
}
const renderer: GameRenderer = webgl ?? new SoftRenderer();
const resolution = new AdaptiveResolution(renderer, soft);
app.appendChild(renderer.domElement);
if (soft) {
  const note = document.createElement('div');
  note.className = 'soft-note';
  note.textContent = 'Modo sem aceleração gráfica: visual simplificado. Ative a aceleração de hardware do navegador para o visual completo.';
  document.body.appendChild(note);
  setTimeout(() => note.remove(), 9000);
}

function createWebGLRenderer(): THREE.WebGLRenderer {
  // Em telas de alta densidade o antialiasing custa caro e quase não aparece.
  const r = new THREE.WebGLRenderer({
    antialias: window.devicePixelRatio < 1.5,
    logarithmicDepthBuffer: true,
    powerPreference: 'high-performance',
  });
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

type Mode = SpaceMode | SurfaceMode;
let mode: Mode | null = null;

/** Troca de modo: o modo atual é descartado por completo antes do próximo existir. */
function switchTo(create: () => Mode): void {
  mode?.dispose();
  mode = null;
  const fade = document.getElementById('fade')!;
  fade.classList.add('on');
  requestAnimationFrame(() => {
    mode = create();
    setTimeout(() => fade.classList.remove('on'), 50);
  });
}

function enterSpace(state: GameState): void {
  switchTo(() => new SpaceMode(renderer, resolution, state, hud, { onObserve: (p) => enterSurface(state, p) }));
}

function enterSurface(state: GameState, planet: PlanetData): void {
  switchTo(() => new SurfaceMode(renderer, state, planetParams(planet), hud, () => enterSpace(state)));
}

async function boot(): Promise<void> {
  const [manifest, names] = await Promise.all([loadManifest(), loadNames()]);
  const state: GameState = {
    manifest,
    names,
    // Começa perto da órbita da Terra, olhando para o Sol.
    shipPos: new THREE.Vector3(0.32, 0.06, 0.01),
    shipQuat: new THREE.Quaternion(),
    time: 0,
    surfaces: new Map(),
    orbitPlanetId: null,
    ecosystems: new Map(),
    // A nave saiu da Terra: as espécies terrestres já estão a bordo para levar a outros planetas.
    knownSpecies: new Map(nativeSpecies(planetParams(SOL_PLANETS[2])).map((sp) => [sp.id, sp])),
  };
  const m = new THREE.Matrix4().lookAt(state.shipPos, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
  state.shipQuat.setFromRotationMatrix(m);
  loading.remove();
  enterSpace(state);
}

boot().catch((err) => {
  loading.textContent = `Falha ao carregar o universo: ${String(err)}`;
  console.error(err);
});
