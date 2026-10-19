import * as THREE from 'three';
import { loadManifest, loadNames } from '../universe/loader';
import { planetParams, type PlanetData } from './space/bodies';
import { SpaceMode } from './space/SpaceMode';
import type { GameState } from './state';
import { SurfaceMode } from './surface/SurfaceMode';
import './style.css';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const loading = document.getElementById('loading')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

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
  switchTo(() => new SpaceMode(renderer, state, hud, { onObserve: (p) => enterSurface(state, p) }));
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
