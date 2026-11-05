import * as THREE from 'three';
import { bvToTemperature, stellarRadius, temperatureToRgb } from '../../core/astro';
import { LruCache } from '../../core/lru';
import { mulberry32, seedFor } from '../../core/rng';
import { EARTH_RADIUS_KM, KM_PER_AU } from '../../core/units';
import { compressOrbit, SUN_VISUAL_RADIUS, type PlanetData, type PlanetKind } from '../../nav/planets';
import { EARTH_ID, nativeLifeLevel } from '../../sim/species';
import { mapSizeFor, paintSurface, type PlanetParams, type SurfaceMap } from '../../procgen/surface';
import type { GameState } from '../state';
import { generateSurfaceAsync } from '../surface/generateAsync';
import { markShared } from './dispose';

/**
 * Corpos desenhados em 3D perto da nave: a estrela local e, no Sistema Solar,
 * os planetas. As distâncias e os tamanhos dentro do sistema são comprimidos
 * (REQUISITOS.md, seção 3.5); os dados reais ficam no painel de informações.
 * Os dados e a escala ficam em nav/planets.ts, sem three.js; daqui são
 * reexportados para quem já importava deste módulo.
 */
export { compressOrbit, planetOffset, SOL_PLANETS, SUN_VISUAL_RADIUS, type PlanetData, type PlanetKind } from '../../nav/planets';

/** Fator de exagero do raio dos planetas. */
const PLANET_SCALE = 100;

export function planetParams(p: PlanetData): PlanetParams {
  return {
    id: p.id,
    name: p.name,
    radiusEarth: p.radiusKm / EARTH_RADIUS_KM,
    temperatureK: p.temperatureK,
    water: p.water,
    life: nativeLifeLevel(p.id, p.life),
  };
}

/** Corpo com o qual a nave interage (colisão, órbita, velocidade adaptativa). */
export interface Body {
  name: string;
  kind: 'star' | PlanetKind | 'comet' | 'poi';
  /** Id do cometa ou do ponto de interesse. */
  id?: string;
  /** Posição no mundo, em UA (double). */
  pos: THREE.Vector3;
  /** Raio visual, em UA. */
  radius: number;
  object: THREE.Object3D;
  planet?: PlanetData;
  /** Partes animadas, guardadas na criação para não procurar por nome a cada quadro. */
  glow?: THREE.Sprite;
  tail?: THREE.Line;
  surface?: THREE.Object3D;
  rocks?: THREE.Object3D;
  /** A esfera nasceu com a textura provisória de faixas: falta pedir a prévia (`loadPreview`). */
  previewPending?: boolean;
}

/** Inclinação do eixo dos planetas com anéis, em radianos (o anel fica no equador). */
const RING_TILT = 0.45;
const EARTH_TILT = 0.41;

/**
 * Inclinação do eixo do planeta, em radianos. Enquanto o eixo não vem dos dados
 * do planeta, só a Terra e os planetas com anéis têm um: sem inclinação, os
 * anéis ficariam de perfil para quem voa no plano das órbitas.
 */
export function axialTilt(p: PlanetData): number {
  if (p.id === EARTH_ID) return EARTH_TILT;
  return p.rings ? RING_TILT : 0;
}

/**
 * Põe o eixo da esfera perpendicular ao plano das órbitas (XY), inclinado em
 * torno de um eixo desse plano. A `SphereGeometry` tem os polos em ±Y; na ordem
 * XZY a rotação é Rx(90°)·Rz(inclinação)·Ry(giro), então `rotation.y` continua
 * sendo só o giro em torno do próprio eixo e o polo não bamboleia com ele.
 */
function orientPlanet(sphere: THREE.Object3D, tilt: number): void {
  sphere.rotation.order = 'XZY';
  sphere.rotation.x = Math.PI / 2;
  sphere.rotation.z = tilt;
}

let glowTexture: THREE.Texture | null = null;

/** Textura radial compartilhada pelos halos; recriada a cada entrada no modo 3D. */
export function getGlowTexture(): THREE.Texture {
  if (!glowTexture) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.15, 'rgba(255,255,255,0.6)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.12)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    // Compartilhada por todos os brilhos (Flyweight): disposeObject não a libera junto com um corpo.
    glowTexture = markShared(new THREE.CanvasTexture(c));
    glowTexture.colorSpace = THREE.SRGBColorSpace;
  }
  return glowTexture;
}

export function disposeGlowTexture(): void {
  glowTexture?.dispose();
  glowTexture = null;
}

export function createStarBody(name: string, pos: THREE.Vector3, absmag: number, ci: number): Body {
  const [r, g, b] = temperatureToRgb(bvToTemperature(ci));
  const color = new THREE.Color(r, g, b);
  const radius = SUN_VISUAL_RADIUS * Math.min(Math.max(stellarRadius(absmag, ci), 0.15), 30);
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 24),
    new THREE.MeshBasicMaterial({ color: color.clone().lerp(new THREE.Color(1, 1, 1), 0.35) }),
  );
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      transparent: true,
    }),
  );
  glow.name = 'glow';
  group.add(sphere, glow);
  return { name, kind: 'star', pos: pos.clone(), radius, object: group, glow };
}

function bandTexture(p: PlanetData): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d')!;
  const base = new THREE.Color(p.color);
  const rnd = mulberry32(seedFor(p.id));
  for (let y = 0; y < 256; y++) {
    const band = Math.sin(y * 0.18 + rnd() * 0.3) * 0.08 + Math.sin(y * 0.05) * 0.06 + (rnd() - 0.5) * 0.03;
    const col = base.clone().offsetHSL(0, 0, band);
    g.fillStyle = `#${col.getHexString()}`;
    g.fillRect(0, y, 4, 1);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Teto da anisotropia: de longe a esfera é pequena, e mais que isso só gasta GPU. */
const MAX_ANISOTROPY = 8;

/** Mapa de um planeta já em pixels RGBA, pronto para virar textura. */
export interface PlanetPixels {
  pixels: Uint8Array;
  width: number;
  height: number;
}

/**
 * Pixels do planeta a partir do mesmo mapa da superfície 2D. `art` é o retrato do
 * mapa com ruas e casas (`GameState.surfaceArt`), se o planeta já foi visitado;
 * sem ele, pinta o terreno, o que custa caro num mapa inteiro.
 */
function planetPixels(map: SurfaceMap, art?: Uint8Array): PlanetPixels {
  const { width, height } = map;
  if (art?.length === width * height * 4) return { pixels: art, width, height };
  const pixels = new Uint8Array(width * height * 4);
  paintSurface(map, pixels);
  return { pixels, width, height };
}

/** Textura da esfera. Os mipmaps evitam a cintilação do mapa ao se afastar. */
function surfaceTexture({ pixels, width, height }: PlanetPixels, anisotropy: number): THREE.Texture {
  const tex = new THREE.DataTexture(pixels, width, height);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = Math.min(anisotropy, MAX_ANISOTROPY);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Prévias de 256 pixels dos planetas ainda não visitados: a geração é
 * determinística, então guarda-se para as próximas voltas ao espaço. Ficam já
 * pintadas, porque repintar sete rochosos a cada volta passa de um quadro. Cada
 * uma tem ~130 KB; o cache guarda as 16 usadas mais recentemente (o bastante
 * para alguns sistemas) e não segura memória da GPU (a textura é do corpo).
 */
const PREVIEW_LIMIT = 16;
const previews = new LruCache<string, PlanetPixels>(PREVIEW_LIMIT);
const loading = new Map<string, Promise<PlanetPixels>>();
/** As prévias saem uma por vez: um sistema pode ter vários rochosos, e cada uma ocupa um Worker. */
let previewQueue: Promise<unknown> = Promise.resolve();

/** Prévia do planeta, gerada num Web Worker para não travar a entrada no sistema. */
export function loadPreview(id: string, params: PlanetParams): Promise<PlanetPixels> {
  const cached = previews.get(id);
  if (cached) return Promise.resolve(cached);
  let job = loading.get(id);
  if (!job) {
    const scale = Math.min(1, 256 / mapSizeFor(params.radiusEarth).width);
    job = previewQueue
      .then(() => generateSurfaceAsync(params, scale))
      .then((map) => {
        const preview = planetPixels(map);
        previews.set(id, preview);
        return preview;
      })
      .finally(() => loading.delete(id));
    loading.set(id, job);
    // Uma prévia que falha não trava as seguintes.
    previewQueue = job.catch(() => undefined);
  }
  return job;
}

/** Troca a textura provisória de faixas pela prévia que chegou. */
export function applyPreview(body: Body, preview: PlanetPixels, anisotropy: number): void {
  const material = (body.surface as THREE.Mesh).material as THREE.MeshLambertMaterial;
  material.map?.dispose();
  material.map = surfaceTexture(preview, anisotropy);
  body.previewPending = false;
}

/** Raio do planeta na cena, em UA. */
export function planetRadius(p: PlanetData): number {
  return (p.radiusKm / KM_PER_AU) * PLANET_SCALE;
}

/**
 * Para onde olhar um planeta de frente: o lado da estrela, um pouco acima do plano das órbitas (os anéis
 * aparecem). Vetor unitário, do planeta para a nave.
 */
export function litSide(planet: THREE.Vector3, star: THREE.Vector3): THREE.Vector3 {
  const toStar = new THREE.Vector3(star.x - planet.x, star.y - planet.y, 0).normalize();
  return toStar.setZ(0.4).normalize();
}

/**
 * Direção, a partir do centro do planeta, do ponto do mapa em frações (`u` = x/largura, `v` = linha/altura), com
 * o giro atual da esfera. A conta é a da `SphereGeometry`; a textura tem `flipY`, então a linha 0 fica no polo norte.
 */
export function tileDirection(surface: THREE.Object3D, u: number, v: number): THREE.Vector3 {
  const phi = u * Math.PI * 2;
  const theta = v * Math.PI;
  return new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).applyEuler(surface.rotation);
}

export function createPlanetBody(p: PlanetData, world: Pick<GameState, 'surfaces' | 'surfaceArt'>, anisotropy = 1): Body {
  const radius = planetRadius(p);
  let map: THREE.Texture;
  let previewPending = false;
  if (p.kind === 'rocky') {
    // Planeta já visitado usa o mapa completo (com a terraformação e as ruas); os outros,
    // uma versão de 256 pixels de largura. Se ela ainda não existe, a esfera nasce
    // com as faixas na cor do planeta até a prévia chegar do Worker (`loadPreview`).
    const visited = world.surfaces.get(p.id);
    const pixels = visited ? planetPixels(visited, world.surfaceArt.get(p.id)) : previews.get(p.id);
    // Depois de carregar um save não há retrato: o terreno é pintado só na primeira
    // entrada, porque o mapa inteiro custa dezenas de ms. A superfície troca o retrato ao sair.
    if (visited && pixels) world.surfaceArt.set(p.id, pixels.pixels);
    if (pixels) {
      map = surfaceTexture(pixels, anisotropy);
    } else {
      map = bandTexture(p);
      previewPending = true;
    }
  } else {
    map = bandTexture(p);
  }
  const tilt = axialTilt(p);
  const group = new THREE.Group();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), new THREE.MeshLambertMaterial({ map }));
  orientPlanet(sphere, tilt);
  sphere.name = 'surface';
  group.add(sphere);
  let rocks: THREE.Object3D | undefined;
  if (p.atmosphere) {
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(radius * 1.04, 48, 24),
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color(p.atmosphere) } },
        vertexShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_vertex>
          varying vec3 vN; varying vec3 vV;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
            #include <logdepthbuf_vertex>
          }`,
        fragmentShader: /* glsl */ `
          #include <common>
          #include <logdepthbuf_pars_fragment>
          uniform vec3 uColor; varying vec3 vN; varying vec3 vV;
          void main() {
            #include <logdepthbuf_fragment>
            float rim = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
            gl_FragColor = vec4(uColor * rim, rim);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.FrontSide,
      }),
    );
    group.add(atmo);
  }
  if (p.rings) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.3, radius * 2.3, 96, 1),
      new THREE.MeshBasicMaterial({ color: 0xd8c79a, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    // O anel nasce no plano XY; girar em Y leva a normal dele até o polo do planeta (o equador).
    ring.rotation.y = -tilt;
    group.add(ring);
    rocks = createRingRocks(p, radius * 1.3, radius * 2.3, tilt);
    group.add(rocks);
  }
  return { name: p.name, kind: p.kind, pos: new THREE.Vector3(), radius, object: group, planet: p, surface: sphere, rocks, previewPending };
}

/** Linha da órbita comprimida. */
export function createOrbitLine(p: PlanetData): THREE.LineLoop {
  const r = compressOrbit(p.aAu);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineBasicMaterial({ color: 0x3a4f7a, transparent: true, opacity: 0.45, depthWrite: false }),
  );
}

/** Cometa: núcleo pequeno, coma brilhante e cauda apontando para longe da estrela. */
export function createCometBody(id: string, name: string, radius: number): Body {
  const group = new THREE.Group();
  const nucleus = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshLambertMaterial({ color: 0x9aa4b0 }));
  const coma = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: getGlowTexture(), color: 0xaee8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }),
  );
  coma.name = 'glow';
  const tail = new THREE.Line(
    new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)),
    new THREE.LineBasicMaterial({ color: 0x9fdcff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  tail.name = 'tail';
  tail.frustumCulled = false;
  group.add(nucleus, coma, tail);
  return { name, kind: 'comet', id, pos: new THREE.Vector3(), radius, object: group, glow: coma, tail };
}

/** Linha fechada a partir de pontos (órbitas de cometas, zona habitável). */
export function createPathLine(points: { x: number; y: number; z: number }[], color: number, opacity: number): THREE.LineLoop {
  return new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, p.y, p.z))),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
}

/** Círculo no plano das órbitas, com raio de cena `r`. */
export function circlePoints(r: number, n = 128): { x: number; y: number; z: number }[] {
  const pts: { x: number; y: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, z: 0 });
  }
  return pts;
}

export type PoiVisual = 'nebula' | 'rogue' | 'comet' | 'derelict' | 'signal' | 'brown-dwarf';

/** Objeto 3D de um ponto de interesse do espaço profundo. */
export function createPoiBody(id: string, name: string, kind: PoiVisual, pos: THREE.Vector3, radius: number, color: number): Body {
  const group = new THREE.Group();
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: getGlowTexture(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: kind === 'nebula' ? 0.5 : 0.9 }),
  );
  glow.name = 'glow';
  group.add(glow);
  if (kind === 'rogue') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), new THREE.MeshLambertMaterial({ color })));
  } else if (kind === 'brown-dwarf') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), new THREE.MeshBasicMaterial({ color: 0x7a2c1c })));
  } else if (kind === 'comet') {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshLambertMaterial({ color: 0x9aa4b0 })));
  } else if (kind === 'derelict') {
    // Casco partido, low-poly: duas peças tortas.
    const hull = new THREE.MeshStandardMaterial({ color: 0x8a8070, flatShading: true, metalness: 0.4, roughness: 0.7 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(radius * 2, radius * 0.6, radius * 0.6), hull);
    const b = new THREE.Mesh(new THREE.ConeGeometry(radius * 0.4, radius * 1.4, 5), hull);
    b.position.set(radius * 1.5, radius * 0.4, 0);
    b.rotation.z = 1.1;
    group.add(a, b);
  }
  return { name, kind: 'poi', id, pos: pos.clone(), radius, object: group, glow };
}

/**
 * Pedras e blocos de gelo dos anéis, vistos de perto: pontos de poucos pixels
 * em tons de rocha, gelo e minério. É de onde as sondas tiram gelo e silicatos.
 */
function createRingRocks(p: PlanetData, inner: number, outer: number, tilt: number): THREE.Points {
  const rnd = mulberry32(seedFor(`${p.id}:ring-rocks`));
  const n = 900;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const tones = [
    [0.85, 0.82, 0.74],
    [0.7, 0.66, 0.6],
    [0.92, 0.95, 1],
    [0.62, 0.5, 0.4],
    [0.78, 0.6, 0.38],
  ];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    // Mais pedras no meio do anel do que nas bordas.
    const r = inner + (outer - inner) * (0.5 + (rnd() + rnd() - 1) * 0.5);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = Math.sin(a) * r;
    pos[i * 3 + 2] = (rnd() - 0.5) * (outer - inner) * 0.03;
    const t = tones[Math.floor(rnd() * tones.length)];
    const shade = 0.75 + rnd() * 0.25;
    col[i * 3] = t[0] * shade;
    col[i * 3 + 1] = t[1] * shade;
    col[i * 3 + 2] = t[2] * shade;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const rocks = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false }));
  rocks.rotation.y = -tilt;
  rocks.name = 'ring-rocks';
  rocks.userData.rocks = true;
  return rocks;
}
