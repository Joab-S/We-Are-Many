import * as THREE from 'three';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOL_PLANETS, type PlanetData } from '../../nav/planets';
import { generateSurface, type SurfaceMap } from '../../procgen/surface';
import { generateSurfaceAsync } from '../surface/generateAsync';
import { applyPreview, axialTilt, createPlanetBody, loadPreview, planetParams, type Body } from './bodies';

vi.mock('../surface/generateAsync', () => ({ generateSurfaceAsync: vi.fn() }));

const earth = SOL_PLANETS[2];
const mars = SOL_PLANETS[3];
const saturn = SOL_PLANETS.find((p) => p.rings)!;
const empty = { surfaces: new Map<string, SurfaceMap>(), surfaceArt: new Map<string, Uint8Array>() };

/** O canvas da textura de faixas: o suficiente para rodar sem navegador. */
const stubDocument = () => ({
  createElement: () => ({ width: 0, height: 0, getContext: () => ({ fillStyle: '', fillRect() {} }) }),
});

const smallMap = (p: PlanetData): SurfaceMap => generateSurface(planetParams(p), 0.25);
const textureOf = (b: Body) => ((b.surface as THREE.Mesh).material as THREE.MeshLambertMaterial).map!;

/** Polo norte da esfera, no referencial do planeta (a origem do grupo). */
function poleOf(mesh: THREE.Object3D): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0).applyEuler(mesh.rotation);
}
const normalOf = (flat: THREE.Object3D) => new THREE.Vector3(0, 0, 1).applyEuler(flat.rotation);

beforeAll(() => vi.stubGlobal('document', stubDocument()));
afterAll(() => vi.unstubAllGlobals());
beforeEach(() => vi.mocked(generateSurfaceAsync).mockReset());

describe('eixo dos planetas', () => {
  it('sem inclinação, o polo é perpendicular ao plano das órbitas', () => {
    expect(axialTilt(mars)).toBe(0);
    const sphere = createPlanetBody(mars, empty).surface!;
    expect(poleOf(sphere).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
  });

  it('a Terra inclina o polo 0,41 rad em relação à normal do plano das órbitas', () => {
    const sphere = createPlanetBody(earth, empty).surface!;
    expect(poleOf(sphere).angleTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0.41, 9);
  });

  it('o giro diário não mexe no polo', () => {
    const sphere = createPlanetBody(earth, empty).surface!;
    const before = poleOf(sphere);
    sphere.rotation.y = 2.7;
    expect(poleOf(sphere).distanceTo(before)).toBeLessThan(1e-9);
  });

  it('anel e pedras ficam no equador do planeta, e não de perfil no plano das órbitas', () => {
    const body = createPlanetBody(saturn, empty);
    const [, , ring] = body.object.children;
    const pole = poleOf(body.surface!);
    expect(axialTilt(saturn)).toBeGreaterThan(0);
    expect(normalOf(ring).distanceTo(pole)).toBeLessThan(1e-9);
    expect(normalOf(body.rocks!).distanceTo(pole)).toBeLessThan(1e-9);
  });
});

describe('textura da esfera', () => {
  it('planeta não visitado nasce com as faixas, sem gerar o mapa na thread principal', () => {
    const body = createPlanetBody(SOL_PLANETS[1], empty);
    expect(body.previewPending).toBe(true);
    expect(textureOf(body)).toBeInstanceOf(THREE.CanvasTexture);
    expect(generateSurfaceAsync).not.toHaveBeenCalled();
  });

  it('a prévia chega do Worker com mipmaps e vira a textura, liberando a de faixas', async () => {
    const p = { ...mars, id: 'teste-previa' };
    vi.mocked(generateSurfaceAsync).mockResolvedValue(smallMap(mars));
    const body = createPlanetBody(p, empty);
    const bands = textureOf(body);
    let bandsGone = false;
    bands.addEventListener('dispose', () => (bandsGone = true));

    applyPreview(body, await loadPreview(p.id, planetParams(p)), 16);

    const tex = textureOf(body);
    expect(tex).toBeInstanceOf(THREE.DataTexture);
    expect(tex.generateMipmaps).toBe(true);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.anisotropy).toBe(8);
    expect(body.previewPending).toBe(false);
    expect(bandsGone).toBe(true);
  });

  it('a prévia sai uma vez por planeta, e na volta ao sistema já nasce pronta', async () => {
    const p = { ...mars, id: 'teste-cache' };
    vi.mocked(generateSurfaceAsync).mockResolvedValue(smallMap(mars));
    const twice = [loadPreview(p.id, planetParams(p)), loadPreview(p.id, planetParams(p))];
    await Promise.all(twice);
    expect(generateSurfaceAsync).toHaveBeenCalledTimes(1);

    const again = createPlanetBody(p, empty);
    expect(again.previewPending).toBe(false);
    expect(textureOf(again)).toBeInstanceOf(THREE.DataTexture);
    expect(generateSurfaceAsync).toHaveBeenCalledTimes(1);
  });

  it('a volta ao sistema reaproveita os pixels da prévia, sem pintar de novo', async () => {
    const p = { ...mars, id: 'teste-pixels' };
    vi.mocked(generateSurfaceAsync).mockResolvedValue(smallMap(mars));
    const { pixels } = await loadPreview(p.id, planetParams(p));
    const pixelsOf = (b: Body) => (textureOf(b).image as { data: Uint8Array }).data;
    expect(pixelsOf(createPlanetBody(p, empty))).toBe(pixels);
    expect(pixelsOf(createPlanetBody(p, empty))).toBe(pixels);
  });

  it('planeta visitado usa o retrato com ruas e casas, sem pintar de novo', () => {
    const map = smallMap(mars);
    const art = new Uint8Array(map.width * map.height * 4).fill(7);
    const body = createPlanetBody(mars, { surfaces: new Map([[mars.id, map]]), surfaceArt: new Map([[mars.id, art]]) });
    expect(body.previewPending).toBe(false);
    expect((textureOf(body).image as { data: Uint8Array }).data).toBe(art);
  });

  it('planeta visitado sem retrato (save carregado) pinta o terreno do mapa', () => {
    const map = smallMap(mars);
    const wrongSize = new Uint8Array(4);
    const body = createPlanetBody(mars, { surfaces: new Map([[mars.id, map]]), surfaceArt: new Map([[mars.id, wrongSize]]) });
    const { data, width, height } = textureOf(body).image as { data: Uint8Array; width: number; height: number };
    expect([width, height]).toEqual([map.width, map.height]);
    expect(data.length).toBe(map.width * map.height * 4);
    expect(data.some((v) => v > 0)).toBe(true);
  });

  it('o terreno do planeta visitado é pintado uma vez só, e a volta ao sistema reaproveita', () => {
    const world = { surfaces: new Map([[mars.id, smallMap(mars)]]), surfaceArt: new Map<string, Uint8Array>() };
    const pixelsOf = (b: Body) => (textureOf(b).image as { data: Uint8Array }).data;
    const first = pixelsOf(createPlanetBody(mars, world));
    expect(pixelsOf(createPlanetBody(mars, world))).toBe(first);
    expect(world.surfaceArt.get(mars.id)).toBe(first);
  });
});
