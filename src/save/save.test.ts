import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { seedFor, type StatefulRng } from '../core/rng';
import { createNavState } from '../nav/guide';
import { createProbeState } from '../explore/probes';
import { EARTH_PHYSICS, generateSurface, type PlanetParams } from '../procgen/surface';
import { SIM_STEP } from '../client/surface/SimDriver';
import { Ecosystem, YEAR_SECONDS } from '../sim/ecosystem';
import { worldFingerprint } from '../sim/fingerprint';
import { nativeSpecies } from '../sim/species';
import { streams } from '../sim/stochastic';
import type { GameState } from '../client/state';
import { REJECTED_KEY, SAVE_KEY, SaveManager } from './manager';
import { restoreGame, snapshotGame } from './game';
import { SAVE_VERSION, type ViewSnapshot } from './snapshot';
import { memoryStore } from './store';

const earth: PlanetParams = { id: 'sol-3', name: 'Terra', radiusEarth: 0.4, temperatureK: 288, water: 0.6, life: 0.85 };
const base = { manifest: {} as GameState['manifest'], names: new Map<number, string>() };
const seeds = (id: string) => seedFor(`${id}:life`);
const space: ViewSnapshot = { mode: 'space' };

function game(): GameState {
  const map = generateSurface(earth);
  const eco = new Ecosystem(map, seeds(earth.id));
  const known = new Map(nativeSpecies(earth).map((sp) => [sp.id, sp]));
  for (const sp of known.values()) eco.addSpecies(sp);
  eco.populate();
  for (let t = 0; t < 40; t += 0.1) eco.step(0.1);
  const nav = createNavState();
  nav.log.push({ time: 3, text: 'olá' });
  nav.visitedBodies.add('sol-3');
  nav.bookmarks.push({ id: 'b1', name: 'Casa', pos: [1, 2, 3] });
  const probes = createProbeState();
  probes.mined['sol-4'] = { metais: 12 };
  return {
    ...base,
    shipPos: new THREE.Vector3(0.32, 0.06, 0.01),
    shipQuat: new THREE.Quaternion(0.1, 0.2, 0.3, 0.9).normalize(),
    time: 123.5,
    surfaces: new Map([[earth.id, map]]),
    surfaceArt: new Map(),
    orbitPlanetId: earth.id,
    orbitOffset: new THREE.Vector3(1e-3, -2e-3, 3e-3),
    ecosystems: new Map([[earth.id, eco]]),
    knownSpecies: known,
    nav,
    probes,
  };
}

/** Ida e volta como o IndexedDB faz: clone estrutural do instantâneo inteiro. */
const roundTrip = (s: GameState, view: ViewSnapshot = space) => restoreGame(structuredClone(snapshotGame(s, view, seeds)), base);

const run = (eco: Ecosystem, seconds: number) => {
  for (let t = 0; t < seconds; t += 0.1) eco.step(0.1);
};

describe('save: ida e volta', () => {
  it('guarda nave, relógio, GUIA e sondas', () => {
    const s = game();
    const { state } = roundTrip(s);
    expect(state.shipPos.toArray()).toEqual(s.shipPos.toArray());
    expect(state.shipQuat.equals(s.shipQuat)).toBe(true);
    expect(state.time).toBe(123.5);
    expect(state.orbitPlanetId).toBe('sol-3');
    expect(state.orbitOffset?.toArray()).toEqual(s.orbitOffset?.toArray());
    expect(state.nav.visitedBodies.has('sol-3')).toBe(true);
    expect(state.nav.log).toEqual(s.nav.log);
    expect(state.nav.bookmarks).toEqual(s.nav.bookmarks);
    expect(state.probes.mined).toEqual({ 'sol-4': { metais: 12 } });
    expect([...state.knownSpecies.keys()]).toEqual([...s.knownSpecies.keys()]);
  });

  it('guarda a vista (câmera e velocidade da superfície)', () => {
    const view: ViewSnapshot = { mode: 'surface', params: earth, center: [100, 50], zoom: 6, speed: 2 };
    expect(roundTrip(game(), view).view).toEqual(view);
  });

  it('terreno, criaturas, assentamentos e economia voltam iguais', () => {
    const s = game();
    const eco = s.ecosystems.get('sol-3')!;
    expect(eco.villages.length).toBeGreaterThan(0);
    const { state } = roundTrip(s);
    const back = state.ecosystems.get('sol-3')!;
    expect(back).toBeInstanceOf(Ecosystem);
    expect(back.map).toBe(state.surfaces.get('sol-3'));
    expect(back.map.elevation).toEqual(eco.map.elevation);
    expect(back.map.felled).toEqual(eco.map.felled);
    expect(back.villages).toEqual(eco.villages);
    expect(back.chronicle).toEqual(eco.chronicle);
    expect(back.population).toEqual(eco.population);
    expect(back.year).toBe(eco.year);
    // Todo campo de dados da classe volta igual (guarda contra campo novo que não seja salvo).
    for (const [k, v] of Object.entries(eco)) {
      if (typeof v === 'function' || v instanceof WeakMap || k === 'map') continue;
      expect((back as unknown as Record<string, unknown>)[k], k).toEqual(v);
    }
  });

  it('as espécies do ecossistema e as conhecidas continuam sendo os mesmos objetos', () => {
    const { state } = roundTrip(game());
    const eco = state.ecosystems.get('sol-3')!;
    for (const sp of eco.species) expect(state.knownSpecies.get(sp.id)).toBe(sp);
  });

  it('a simulação segue idêntica depois de carregar (inclusive o RNG)', () => {
    const s = game();
    const original = s.ecosystems.get('sol-3')!;
    const { state } = roundTrip(s);
    const loaded = state.ecosystems.get('sol-3')!;
    run(original, 60);
    run(loaded, 60);
    expect(loaded.year).toBe(original.year);
    expect(loaded.population).toEqual(original.population);
    expect(loaded.count).toBe(original.count);
    expect(loaded.x).toEqual(original.x);
    expect(loaded.y).toEqual(original.y);
    expect(loaded.villages).toEqual(original.villages);
    expect(loaded.chronicle).toEqual(original.chronicle);
    expect(loaded.map.vegetation).toEqual(original.map.vegetation);
  }, 60000);

  it('save antigo, sem os fluxos da fauna e da flora nem os vetores novos, carrega e segue determinístico', () => {
    const s = game();
    const data = structuredClone(snapshotGame(s, space, seeds));
    const snap = data.ecosystems.get('sol-3')!;
    // Como um save de antes: sem os fluxos novos, sem os handles da presa e com o cache anual de uid.
    delete snap.rng.faunaRnd;
    delete snap.rng.floraRnd;
    delete snap.fields.chaseUid;
    delete snap.fields.escaped;
    snap.fields.uidYear = 3;
    const load = () => restoreGame(structuredClone(data), base).state.ecosystems.get('sol-3')!;
    const a = load();
    const b = load();
    // Os fluxos novos começam da semente do planeta.
    const fresh = streams(snap.seed);
    expect((a.faunaRnd as StatefulRng).state).toBe((fresh.fauna as StatefulRng).state);
    expect((a.floraRnd as StatefulRng).state).toBe((fresh.flora as StatefulRng).state);
    // Os vetores que faltavam são refeitos do tamanho dos outros, e o cache anual sai.
    expect(a.chaseUid.length).toBe(a.x.length);
    expect(a.escaped.length).toBe(a.x.length);
    expect('uidYear' in a).toBe(false);
    for (let k = 0; k < a.count; k++) {
      const j = a.chase[k];
      if (a.alive[k] && j >= 0 && a.alive[j]) expect(a.chaseUid[k]).toBe(a.uid[j]);
    }
    run(a, 20);
    run(b, 20);
    expect(a.x).toEqual(b.x);
    expect(a.population).toEqual(b.population);
    expect(a.map.vegetation).toEqual(b.map.vegetation);
  }, 60000);

  it('save antigo, sem a pressão social nem a circunscrição dos lugares, carrega com zero', () => {
    const s = game();
    const data = structuredClone(snapshotGame(s, space, seeds));
    const villages = data.ecosystems.get('sol-3')!.fields.villages as { pressure?: number; circumscribed?: number }[];
    expect(villages.length).toBeGreaterThan(0);
    for (const v of villages) {
      delete v.pressure;
      delete v.circumscribed;
    }
    const eco = restoreGame(data, base).state.ecosystems.get('sol-3')!;
    for (const v of eco.villages) {
      expect(v.pressure).toBe(0);
      expect(v.circumscribed).toBe(0);
    }
    // E o mundo segue: o ano seguinte recalcula a pressão.
    run(eco, 12);
    expect(eco.villages.some((v) => !v.abandoned && v.population > 0 && (v.pressure ?? 0) > 0)).toBe(true);
  }, 60000);

  it('save antigo, sem o modo de vida nem a área dos lugares, carrega sedentário e segue determinístico', () => {
    const s = game();
    const data = structuredClone(snapshotGame(s, space, seeds));
    const snap = data.ecosystems.get('sol-3')!;
    // Como um save de antes do bioma e sociedade: os lugares não têm `lifeway` nem `area`.
    const old = snap.fields.villages as { lifeway?: string; area?: unknown }[];
    expect(old.length).toBeGreaterThan(0);
    for (const v of old) {
      delete v.lifeway;
      delete v.area;
    }
    const load = () => restoreGame(structuredClone(data), base).state.ecosystems.get('sol-3')!;
    const a = load();
    const b = load();
    for (const v of a.villages) expect(v.lifeway).toBe('sedentario');
    run(a, 20);
    run(b, 20);
    expect(a.villages).toEqual(b.villages);
    expect(a.x).toEqual(b.x);
    expect(a.population).toEqual(b.population);
  }, 60000);

  it('salvar e carregar não muda o mundo: 20 anos, o save, e mais 20 anos dão a mesma impressão digital', () => {
    const years = (eco: Ecosystem, n: number) => {
      for (let s = 0; s < n * (YEAR_SECONDS / SIM_STEP); s++) eco.step(SIM_STEP);
    };
    const s = game();
    const original = s.ecosystems.get('sol-3')!;
    years(original, 20);
    const loaded = roundTrip(s).state.ecosystems.get('sol-3')!;
    expect(worldFingerprint(loaded)).toBe(worldFingerprint(original));
    // De 5 em 5 anos, para a falha dizer quando os dois mundos se separaram.
    for (let k = 1; k <= 4; k++) {
      years(original, 5);
      years(loaded, 5);
      expect(worldFingerprint(loaded), `${k * 5} anos depois de carregar`).toBe(worldFingerprint(original));
    }
  }, 120000);

  it('save da versão 1, sem a física dos planetas, carrega com a da Terra e fica na versão atual', () => {
    const view: ViewSnapshot = { mode: 'surface', params: earth, center: [100, 50], zoom: 6, speed: 2 };
    const data = structuredClone(snapshotGame(game(), view, seeds));
    data.version = 1;
    const loaded = restoreGame(data, base);
    expect(data.version).toBe(SAVE_VERSION);
    expect(loaded.state.surfaces.get('sol-3')!.params).toEqual({ ...earth, ...EARTH_PHYSICS });
    if (loaded.view.mode !== 'surface') throw new Error('a vista do save era a superfície');
    expect(loaded.view.params).toEqual({ ...earth, ...EARTH_PHYSICS });
  });

  it('save da versão atual guarda a física de cada planeta', () => {
    const s = game();
    const mars: PlanetParams = { ...earth, id: 'sol-4', axialTilt: 0.44, dayHours: 24.62, atmosphere: { pressure: 0.006, greenhouse: 5 } };
    s.surfaces.get('sol-3')!.params = mars;
    const params = roundTrip(s).state.surfaces.get('sol-3')!.params;
    expect(params).toEqual(mars);
  });

  it('salvar não altera o jogo em andamento', () => {
    const s = game();
    const eco = s.ecosystems.get('sol-3')!;
    const before = eco.population.slice();
    snapshotGame(s, space, seeds);
    expect(eco.population).toEqual(before);
  });
});

describe('save: gerenciador', () => {
  it('grava e carrega', async () => {
    const m = new SaveManager(memoryStore(), seeds);
    expect((await m.load(base)).status).toBe('empty');
    expect(await m.save(game(), space)).toBe(true);
    const r = await m.load(base);
    expect(r.status).toBe('ok');
    if (r.status === 'ok') expect(r.state.time).toBe(123.5);
  });

  it.each([
    ['mais nova', SAVE_VERSION + 1],
    ['anterior às que carregam', 0],
  ])('recusa save de versão %s sem derrubar o jogo, e guarda o original', async (_n, version) => {
    const store = memoryStore();
    const data = structuredClone(snapshotGame(game(), space, seeds));
    data.version = version;
    await store.put(SAVE_KEY, data);
    const r = await new SaveManager(store, seeds).load(base);
    expect(r.status).toBe('rejected');
    expect(store.data.has(SAVE_KEY)).toBe(false);
    expect(store.data.has(REJECTED_KEY)).toBe(true);
  });

  it.each([
    ['lixo', 'texto qualquer'],
    ['objeto vazio', {}],
    ['sem mundo', { version: SAVE_VERSION, savedAt: 0, ship: { pos: [0, 0, 0], quat: [0, 0, 0, 1] }, time: 1 }],
  ])('recusa save corrompido (%s)', async (_n, junk) => {
    const store = memoryStore();
    await store.put(SAVE_KEY, junk);
    expect((await new SaveManager(store, seeds).load(base)).status).toBe('rejected');
  });

  it('recusa terreno truncado e posição inválida', async () => {
    const store = memoryStore();
    const data = structuredClone(snapshotGame(game(), space, seeds));
    data.surfaces.get('sol-3')!.elevation = new Float32Array(10);
    await store.put(SAVE_KEY, data);
    expect((await new SaveManager(store, seeds).load(base)).status).toBe('rejected');
    const bad = structuredClone(snapshotGame(game(), space, seeds));
    bad.ship.pos = [NaN, 0, 0];
    await store.put(SAVE_KEY, bad);
    expect((await new SaveManager(store, seeds).load(base)).status).toBe('rejected');
  });

  it('armazenamento que falha na leitura não apaga nada', async () => {
    const store = memoryStore();
    store.get = async () => {
      throw new Error('bloqueado');
    };
    const r = await new SaveManager(store, seeds).load(base);
    expect(r.status).toBe('unavailable');
  });

  it('começar mundo novo apaga o save', async () => {
    const store = memoryStore();
    const m = new SaveManager(store, seeds);
    await m.save(game(), space);
    await m.clear();
    expect((await m.load(base)).status).toBe('empty');
  });
});
