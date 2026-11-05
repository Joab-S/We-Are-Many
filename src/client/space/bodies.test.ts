import * as THREE from 'three';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOL_PLANETS, type PlanetData } from '../../nav/planets';
import { generateSurface, type SurfaceMap } from '../../procgen/surface';
import { generateSurfaceAsync } from '../surface/generateAsync';
import { dirToUv, RELIEF_SLOPE_RANGE, reliefPixels } from './planet/sphere';
import { applyPreview, axialTilt, createPlanetBody, litSide, loadPreview, planetParams, planetRadius, tileDirection, type Body } from './bodies';

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

describe('de onde olhar um planeta', () => {
  it('o raio de planetRadius é o do corpo', () => {
    expect(createPlanetBody(mars, empty).radius).toBe(planetRadius(mars));
  });

  it('litSide fica do lado da estrela, acima do plano das órbitas', () => {
    const star = new THREE.Vector3(0, 0, 0);
    const planet = new THREE.Vector3(10, 0, 0);
    const side = litSide(planet, star);
    expect(side.length()).toBeCloseTo(1, 9);
    expect(side.x).toBeLessThan(0);
    expect(side.y).toBeCloseTo(0, 9);
    expect(side.z).toBeGreaterThan(0);
  });

  it('tileDirection aponta para o vértice da esfera com a mesma coordenada do mapa, já com o giro', () => {
    const sphere = createPlanetBody(mars, empty).surface as THREE.Mesh;
    sphere.rotation.y = 1.3;
    const position = sphere.geometry.getAttribute('position');
    const uv = sphere.geometry.getAttribute('uv');
    for (const i of [70, 500, 1500]) {
      // A textura tem flipY: a linha 0 do mapa fica no topo da imagem, onde o `v` do uv é 1.
      const dir = tileDirection(sphere, uv.getX(i), 1 - uv.getY(i));
      const vertex = new THREE.Vector3().fromBufferAttribute(position, i).normalize().applyEuler(sphere.rotation);
      expect(dir.distanceTo(vertex)).toBeLessThan(1e-6);
    }
  });
});

describe('eixo dos planetas', () => {
  it('sem inclinação, o polo é perpendicular ao plano das órbitas', () => {
    const upright = { ...mars, axialTilt: 0 };
    expect(axialTilt(upright)).toBe(0);
    const sphere = createPlanetBody(upright, empty).surface!;
    expect(poleOf(sphere).distanceTo(new THREE.Vector3(0, 0, 1))).toBeLessThan(1e-9);
  });

  it('a Terra inclina o polo 0,41 rad em relação à normal do plano das órbitas', () => {
    const sphere = createPlanetBody(earth, empty).surface!;
    expect(poleOf(sphere).angleTo(new THREE.Vector3(0, 0, 1))).toBeCloseTo(0.41, 9);
  });

  it('cada planeta inclina o eixo pelos dados dele, e Vênus fica de ponta-cabeça', () => {
    const poleAngle = (p: PlanetData) => poleOf(createPlanetBody(p, empty).surface!).angleTo(new THREE.Vector3(0, 0, 1));
    expect(poleAngle(mars)).toBeCloseTo(0.4396, 9);
    expect(poleAngle(SOL_PLANETS[1])).toBeGreaterThan(Math.PI / 2);
  });

  it('planeta com anéis nunca fica de perfil, com o eixo quase em pé ou quase de ponta-cabeça', () => {
    expect(axialTilt(saturn)).toBe(saturn.axialTilt);
    expect(axialTilt({ ...saturn, axialTilt: 0 })).toBe(0.45);
    expect(axialTilt({ ...saturn, axialTilt: Math.PI - 0.01 })).toBe(0.45);
    expect(axialTilt({ ...saturn, axialTilt: 1.7 })).toBe(1.7);
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

describe('a esfera no WebGL', () => {
  it('dirToUv desfaz tileDirection em toda a esfera', () => {
    const still = new THREE.Object3D();
    for (let v = 0.02; v < 1; v += 0.07) {
      for (let u = 0; u < 1; u += 0.05) {
        const back = dirToUv(tileDirection(still, u, v));
        expect(back.u).toBeCloseTo(u, 9);
        expect(back.v).toBeCloseTo(v, 9);
      }
    }
  });

  it('dirToUv: os polos são a primeira e a última linha do mapa, e a emenda fecha', () => {
    expect(dirToUv({ x: 0, y: 1, z: 0 }).v).toBe(0);
    expect(dirToUv({ x: 0, y: -1, z: 0 }).v).toBe(1);
    expect(dirToUv({ x: -1, y: 0, z: 0 })).toEqual({ u: 0, v: 0.5 });
    // Nos dois lados da emenda: u quase 1 e u quase 0.
    expect(dirToUv({ x: -1, y: 0, z: -1e-6 }).u).toBeGreaterThan(0.999);
    expect(dirToUv({ x: -1, y: 0, z: 1e-6 }).u).toBeLessThan(0.001);
  });

  it('o rochoso usa o shader, com a cor e o relevo; o gigante e o modo sem WebGL ficam com o material comum', () => {
    const material = (b: Body) => (b.surface as THREE.Mesh).material;
    const world = { surfaces: new Map([[mars.id, smallMap(mars)]]), surfaceArt: new Map<string, Uint8Array>() };
    const rocky = material(createPlanetBody(mars, world, 1, true)) as THREE.ShaderMaterial;
    expect(rocky).toBeInstanceOf(THREE.ShaderMaterial);
    expect((rocky.uniforms.uMap.value as THREE.DataTexture).image.width).toBe(world.surfaces.get(mars.id)!.width);
    expect((rocky.uniforms.uRelief.value as THREE.DataTexture).image.width).toBe(world.surfaces.get(mars.id)!.width);
    expect(material(createPlanetBody(saturn, empty, 1, true))).toBeInstanceOf(THREE.MeshLambertMaterial);
    expect(material(createPlanetBody(mars, world, 1, false))).toBeInstanceOf(THREE.MeshLambertMaterial);
  });

  it('o shader acompanha a direção da estrela de quem criou o corpo', () => {
    const body = createPlanetBody(earth, empty, 1, true);
    const uniforms = ((body.surface as THREE.Mesh).material as THREE.ShaderMaterial).uniforms;
    expect(uniforms.uStarDir.value).toBe(body.starDir);
  });

  it('a prévia que chega troca as duas texturas do shader', async () => {
    const p = { ...earth, id: 'previa-shader' };
    vi.mocked(generateSurfaceAsync).mockResolvedValueOnce(smallMap(earth));
    const body = createPlanetBody(p, empty, 1, true);
    const uniforms = ((body.surface as THREE.Mesh).material as THREE.ShaderMaterial).uniforms;
    const before = [uniforms.uMap.value, uniforms.uRelief.value];
    applyPreview(body, await loadPreview(p.id, planetParams(p)), 1);
    expect(body.previewPending).toBe(false);
    expect(uniforms.uMap.value).not.toBe(before[0]);
    expect(uniforms.uRelief.value).not.toBe(before[1]);
    expect(uniforms.uRelief.value.image.width).toBe(uniforms.uMap.value.image.width);
  });
});

describe('textura de relevo', () => {
  const W = 8;
  const H = 4;
  const at = (out: Uint8Array, x: number, y: number) => [...out.subarray((y * W + x) * 4, (y * W + x) * 4 + 4)];
  const grid = (f: (x: number, y: number) => number) => {
    const e = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) e[y * W + x] = f(x, y);
    return e;
  };

  it('chão plano é 128 nos dois eixos, e o mar marca a máscara', () => {
    const out = reliefPixels(grid((x) => (x < 4 ? 0.3 : -0.2)), W, H);
    expect(at(out, 1, 1)).toEqual([128, 128, 0, 255]);
    expect(at(out, 5, 1)).toEqual([128, 128, 0, 0]);
  });

  it('subir para o leste aumenta R; subir para o norte (linhas menores) aumenta G', () => {
    const east = reliefPixels(grid((x) => 0.5 + x * 0.1), W, H);
    expect(at(east, 3, 1)[0]).toBeGreaterThan(128);
    expect(at(east, 3, 1)[1]).toBe(128);
    const north = reliefPixels(grid((_, y) => 0.5 - y * 0.1), W, H);
    expect(at(north, 3, 1)[1]).toBeGreaterThan(128);
    expect(at(north, 3, 1)[0]).toBe(128);
  });

  it('a inclinação é por radiano: a mesma encosta dá o mesmo valor em qualquer resolução do mapa', () => {
    const slope = 1;
    const relief = (w: number) => {
      const e = new Float32Array(w * 4);
      for (let y = 0; y < 4; y++) for (let x = 0; x < w; x++) e[y * w + x] = 0.5 + Math.sin((x / w) * Math.PI * 2) * slope;
      return reliefPixels(e, w, 4);
    };
    const row = 1;
    const fine = relief(64);
    const coarse = relief(32);
    expect(Math.abs(fine[(row * 64 + 8) * 4] - coarse[(row * 32 + 4) * 4])).toBeLessThanOrEqual(1);
    expect(fine[(row * 64 + 8) * 4]).toBeGreaterThan(128);
  });

  it('o mapa dá a volta: a coluna 0 enxerga a última, e a encosta que passa do limite fica no limite', () => {
    const out = reliefPixels(grid((x) => (x === W - 1 ? 0 : x === 1 ? RELIEF_SLOPE_RANGE * 4 : 0.5)), W, H);
    expect(at(out, 0, 1)[0]).toBe(255);
  });

  it('as luzes da noite vêm do retrato: casas acendem, avenidas menos, e enfeite nenhum', () => {
    const e = grid(() => 0.2);
    const art = new Uint8Array(W * H * 4);
    const code = (x: number, kind: number) => (art[(W + x) * 4 + 3] = kind * 16 + 15);
    code(1, 15);
    code(2, 9);
    code(3, 1);
    const out = reliefPixels(e, W, H, art);
    expect(at(out, 1, 1)[2]).toBeGreaterThanOrEqual(90);
    expect(at(out, 2, 1)[2]).toBeGreaterThan(0);
    expect(at(out, 2, 1)[2]).toBeLessThan(90);
    expect(at(out, 3, 1)[2]).toBe(0);
    expect(at(reliefPixels(e, W, H), 1, 1)[2]).toBe(0);
  });

  it('num planeta visitado, a casa pintada no retrato chega ao shader', () => {
    const map = smallMap(earth);
    const art = new Uint8Array(map.width * map.height * 4);
    art[3] = 15 * 16 + 15;
    const world = { surfaces: new Map([[earth.id, map]]), surfaceArt: new Map([[earth.id, art]]) };
    const body = createPlanetBody(earth, world, 1, true);
    const relief = ((body.surface as THREE.Mesh).material as THREE.ShaderMaterial).uniforms.uRelief.value as THREE.DataTexture;
    expect(relief.image.data![2]).toBeGreaterThanOrEqual(90);
  });

  it('a costa não vira penhasco: o fundo do mar conta como nível zero', () => {
    const deep = reliefPixels(grid((x) => (x >= 4 ? 0.1 : -0.9)), W, H);
    const shallow = reliefPixels(grid((x) => (x >= 4 ? 0.1 : -0.01)), W, H);
    expect(at(deep, 4, 1)).toEqual(at(shallow, 4, 1));
  });
});
