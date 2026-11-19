import * as THREE from 'three';
import { restoreEcosystem, type ViewSnapshot } from '../save/snapshot';
import { createEngine } from '../sim/api/engine';
import { YEAR_SECONDS } from '../sim/ecosystem';
import { nativeSpecies } from '../sim/species';
import { litSide, planetOffset, planetParams, planetRadius, SOL_PLANETS, type PlanetData } from './space/bodies';
import type { GameState } from './state';
import { generateSurfaceAsync } from './surface/generateAsync';

/**
 * Cenas prontas (`?cena=nome`): abrem o jogo num estado conhecido, para testar e conferir sem jogar até lá. Cada cena
 * arruma um `GameState` novo e diz em que vista ele abre, como um save carregado. Sementes e passos são fixos, então
 * a mesma cena dá o mesmo mundo. O `main.ts` só baixa este módulo com `?cena=` e, nela, não lê nem grava o save.
 */

/** Escreve o andamento na tela de carregamento. */
type Report = (text: string) => void;
type Scene = (state: GameState, report: Report) => ViewSnapshot | Promise<ViewSnapshot>;

const EARTH = SOL_PLANETS[2];
const SATURN = SOL_PLANETS[5];

/** Passo da simulação e ano (o de ação, o da calibração), como em `runWorld`; ao abrir, a superfície põe o ano da tela. */
const STEP_S = 0.25;
const STEPS_PER_YEAR = YEAR_SECONDS / STEP_S;
/**
 * Cidade grande: o degrau Cidade (`TIER_NAMES`) ainda cheio. Para quando acontece, e não num ano fixo: guerras e fome
 * esvaziam os lugares, e a história muda com o equilíbrio.
 */
const CITY_TIER = 2;
const CITY_PEOPLE = 200;
/**
 * A semente desta cena, e não a do jogo: as cidades grandes são passageiras e o ano delas varia muito entre sementes,
 * e com a da Terra do jogo nenhuma aparece nos primeiros 400 anos (com esta, perto do ano 140).
 */
const CITY_SEED = 7;
/** Sem cidade até aqui, a cena falha na tela: o equilíbrio mudou e o critério acima precisa ser revisto. */
const MAX_YEARS = 400;

/** Quando a vista espacial abrir, a nave aparece a `radii` raios do planeta (o mesmo pedido da volta da superfície). */
function orbit(state: GameState, planet: PlanetData, radii: number): void {
  const center = planetOffset(planet, state.time, new THREE.Vector3());
  state.orbitPlanetId = planet.id;
  state.orbitOffset = litSide(center, new THREE.Vector3()).multiplyScalar(radii * planetRadius(planet));
}

/**
 * Superfície da Terra parada, com a câmera numa cidade grande; o Esc volta à órbita, com as ruas na esfera. O mundo roda
 * antes de existir tela (só pela fachada do motor) e entra como um mundo salvo.
 */
async function earthWithCity(state: GameState, report: Report): Promise<ViewSnapshot> {
  const params = planetParams(EARTH);
  const map = await generateSurfaceAsync(params);
  const engine = createEngine(map, { seed: CITY_SEED, species: nativeSpecies(params), yearSpan: YEAR_SECONDS });
  const findCity = () => engine.view.villages.find((v) => !v.abandoned && v.tier >= CITY_TIER && v.population >= CITY_PEOPLE);
  let city = findCity();
  for (let year = 1; !city; year++) {
    if (year > MAX_YEARS) throw new Error(`cena terra-cidade: nenhuma cidade grande em ${MAX_YEARS} anos`);
    for (let s = 0; s < STEPS_PER_YEAR; s++) engine.step(STEP_S);
    engine.drainEvents();
    city = findCity();
    report(`Simulando a Terra até surgir uma cidade grande: ano ${year}…`);
    await new Promise((resolve) => setTimeout(resolve));
  }
  const saved = engine.snapshot();
  state.surfaces.set(params.id, saved.map);
  state.ecosystems.set(params.id, restoreEcosystem(saved.eco, saved.map));
  orbit(state, EARTH, 3);
  return { mode: 'surface', params, center: [city.x, map.height - city.y], zoom: 8, speed: 0 };
}

const SCENES: Record<string, Scene> = {
  'terra-cidade': earthWithCity,
  saturno(state) {
    orbit(state, SATURN, 3);
    return { mode: 'space' };
  },
};

/** Arruma `state` para a cena e devolve a vista em que ela abre. Cena desconhecida é erro (o boot mostra na tela). */
export async function buildScene(name: string, state: GameState, report: Report): Promise<ViewSnapshot> {
  if (!Object.hasOwn(SCENES, name)) throw new Error(`cena desconhecida: "${name}" (existem: ${Object.keys(SCENES).join(', ')})`);
  return SCENES[name](state, report);
}
