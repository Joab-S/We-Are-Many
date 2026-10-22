import * as THREE from 'three';
import { loadManifest, loadNames } from '../universe/loader';
import { AdaptiveResolution } from './quality';
import { SoftRenderer, webglAvailable, type GameRenderer } from './renderer';
import { seedFor } from '../core/rng';
import { SaveManager } from '../save/manager';
import { indexedDbStore } from '../save/store';
import type { ViewSnapshot } from '../save/snapshot';
import { createSaveUi } from './saveUi';
import { nativeSpecies } from '../sim/species';
import { createNavState } from '../nav/guide';
import { createProbeState } from '../explore/probes';
import type { PlanetParams } from '../procgen/surface';
import { planetParams, SOL_PLANETS } from './space/bodies';
import { SpaceMode } from './space/SpaceMode';
import type { GameState } from './state';
import { SurfaceMode } from './surface/SurfaceMode';
import './style.css';

/** Intervalo do autosave. */
const AUTOSAVE_MS = 20_000;

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
let current: GameState | null = null;

const saves = new SaveManager(indexedDbStore, (planetId) => seedFor(`${planetId}:life`));
/** Falso se o armazenamento não respondeu ao ler: um save pode existir e não deve ser sobrescrito. */
let canSave = true;

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
  // Ao sair da superfície (ou ao começar no espaço) o estado fica salvo.
  void autosave({ mode: 'space' });
  switchTo(() => new SpaceMode(renderer, resolution, state, hud, { onObserve: (p) => enterSurface(state, planetParams(p)) }));
}

function enterSurface(state: GameState, params: PlanetParams, resume?: ConstructorParameters<typeof SurfaceMode>[5]): void {
  switchTo(() => new SurfaceMode(renderer, state, params, hud, () => enterSpace(state), resume));
}

function startFrom(state: GameState, view: ViewSnapshot): void {
  current = state;
  if (view.mode === 'surface') enterSurface(state, view.params, view);
  else enterSpace(state);
}

function currentView(): ViewSnapshot {
  return mode instanceof SurfaceMode ? mode.snapshotView() : { mode: 'space' };
}

async function autosave(view?: ViewSnapshot): Promise<boolean> {
  if (!current || !canSave) return false;
  try {
    return await saves.save(current, view ?? currentView());
  } catch (err) {
    console.warn('Falha ao salvar', err);
    return false;
  }
}

function newState(manifest: GameState['manifest'], names: GameState['names']): GameState {
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
    nav: createNavState(),
    probes: createProbeState(),
  };
  const m = new THREE.Matrix4().lookAt(state.shipPos, new THREE.Vector3(), new THREE.Vector3(0, 0, 1));
  state.shipQuat.setFromRotationMatrix(m);
  return state;
}

async function boot(): Promise<void> {
  const [manifest, names] = await Promise.all([loadManifest(), loadNames()]);
  const base = { manifest, names };
  let notice = '';
  let loaded: Awaited<ReturnType<SaveManager['load']>>;
  try {
    loaded = await saves.load(base);
  } catch (err) {
    loaded = { status: 'unavailable', reason: String(err) };
  }
  if (loaded.status === 'unavailable') {
    canSave = false;
    notice = 'Não foi possível acessar o armazenamento do navegador: o progresso não será salvo.';
    console.warn(loaded.reason);
  } else if (loaded.status === 'rejected') {
    notice = `O save anterior não pôde ser carregado (${loaded.reason}). Começando um mundo novo; o save antigo foi guardado à parte.`;
    console.warn(loaded.reason);
  }

  const ui = createSaveUi({
    save: async () => ui.toast((await autosave()) ? 'Jogo salvo.' : canSave ? 'Salvar agora não foi possível.' : 'Armazenamento indisponível.'),
    load: async () => {
      const r = await saves.load(base);
      if (r.status === 'ok') {
        startFrom(r.state, r.view);
        ui.toast('Save carregado.');
      } else ui.toast(r.status === 'empty' ? 'Ainda não há save.' : `Save não carregado: ${r.reason}`);
    },
    newWorld: async () => {
      if (!confirm('Começar um mundo novo? O progresso salvo será apagado.')) return;
      await saves.clear();
      startFrom(newState(manifest, names), { mode: 'space' });
      ui.toast('Mundo novo.');
    },
  });
  if (notice) ui.toast(notice);

  // Autosave periódico e ao esconder ou fechar a aba (o IndexedDB copia o estado na hora da chamada).
  setInterval(() => void autosave().then((ok) => ok && ui.toast('Progresso salvo.')), AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void autosave());
  window.addEventListener('pagehide', () => void autosave());

  loading.remove();
  if (loaded.status === 'ok') startFrom(loaded.state, loaded.view);
  else startFrom(newState(manifest, names), { mode: 'space' });
}

boot().catch((err) => {
  loading.textContent = `Falha ao carregar o universo: ${String(err)}`;
  console.error(err);
});
