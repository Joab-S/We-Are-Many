import * as THREE from 'three';
import { tileHash } from '../../../procgen/surface';

/**
 * A esfera do planeta rochoso no WebGL: um shader que acha o ponto do mapa pela direção a partir do centro, e não pelo uv
 * da `SphereGeometry` (é o uv que aperta a imagem nos polos e deixa a costura). Sem three.js só as contas de `dirToUv` e
 * `reliefPixels`, que valem também para a Etapa 2.
 */

/** Maior inclinação guardada na textura de relevo, em altura de 0 a 1 por radiano. */
export const RELIEF_SLOPE_RANGE = 16;
/** Quanto a inclinação pesa na normal: exagero do relevo na luz, em fração do raio por unidade de elevação. */
const RELIEF_EXAGGERATION = 0.04;
/** Códigos do alfa do retrato do mapa (`MapRaster`, `alpha >> 4`) que acendem de noite: casas e muralhas; avenidas e praças, menos. */
const LIT_BUILDING = 15;
const LIT_STREETS = [9, 10];

/**
 * Inverso de `tileDirection` (sem o giro): de uma direção local e unitária, a fração do mapa em que ela cai. A mesma conta
 * está em GLSL no `FRAGMENT` abaixo; `u` fica em [0, 1).
 */
export function dirToUv(dir: { x: number; y: number; z: number }): { u: number; v: number } {
  const u = Math.atan2(dir.z, -dir.x) / (Math.PI * 2);
  return { u: u < 0 ? u + 1 : u, v: Math.acos(Math.min(1, Math.max(-1, dir.y))) / Math.PI };
}

/**
 * A textura de relevo, em bytes por tile:
 * - R e G: inclinação para o leste e para o norte, em altura por radiano (128 é plano), para não depender da resolução do
 *   mapa. Calcular aqui, e não por diferença finita no fragmento, deixa os mipmaps filtrarem a inclinação: de longe o
 *   relevo fica mais liso em vez de cintilar, e não é preciso textura de ponto flutuante, que nem toda GPU filtra.
 * - B: luzes da noite, das casas do retrato `art` (só um planeta visitado tem). Elas ficam aqui porque o alfa da textura de
 *   cor guarda códigos, que o filtro da GPU embaralha; neste canal, de longe, uma cidade vira um brilho fraco, sem sumir.
 * - A: 255 em terra, 0 em água.
 */
export function reliefPixels(elevation: Float32Array, width: number, height: number, art?: Uint8Array): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  const perRadianX = width / (Math.PI * 2);
  const perRadianY = height / Math.PI;
  const encode = (slope: number) => Math.round(128 + (Math.max(-RELIEF_SLOPE_RANGE, Math.min(RELIEF_SLOPE_RANGE, slope)) / RELIEF_SLOPE_RANGE) * 127);
  for (let y = 0; y < height; y++) {
    const up = Math.max(0, y - 1);
    const down = Math.min(height - 1, y + 1);
    // Perto do polo as colunas ficam estreitas: a mesma diferença de altura é uma encosta mais íngreme.
    const narrow = Math.max(0.05, Math.sin(((y + 0.5) / height) * Math.PI));
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const o = i * 4;
      const land = elevation[i] >= 0;
      let east = 0;
      let north = 0;
      if (land) {
        // O fundo do mar não conta: a costa é uma borda, não um penhasco.
        const left = Math.max(0, elevation[y * width + ((x - 1 + width) % width)]);
        const right = Math.max(0, elevation[y * width + ((x + 1) % width)]);
        const above = Math.max(0, elevation[up * width + x]);
        const below = Math.max(0, elevation[down * width + x]);
        east = (((right - left) / 2) * perRadianX) / narrow;
        north = ((above - below) / (down - up)) * perRadianY;
      }
      out[o] = encode(east);
      out[o + 1] = encode(north);
      const code = art ? art[o + 3] >> 4 : 0;
      // Cada casa com a sua luz, ou a cidade vira um bloco liso; o hash do tile não muda de uma visita para outra.
      out[o + 2] = code === LIT_BUILDING ? 90 + tileHash(i) * 165 : LIT_STREETS.includes(code) ? 70 : 0;
      out[o + 3] = land ? 255 : 0;
    }
  }
  return out;
}

/** Textura de relevo, com os mesmos eixos da textura de cor (`flipY`, repetição na horizontal). */
export function reliefTexture(pixels: Uint8Array, width: number, height: number): THREE.Texture {
  const tex = new THREE.DataTexture(pixels, width, height);
  tex.flipY = true;
  tex.wrapS = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** Relevo de quem ainda não tem mapa (as faixas provisórias): plano e todo em terra, sem reflexo. */
export function flatRelief(): THREE.Texture {
  const tex = new THREE.DataTexture(new Uint8Array([128, 128, 0, 255]), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

const VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vLocal;
  varying vec3 vView;
  varying mat3 vToView;
  void main() {
    // A direção a partir do centro: na esfera e nos pedaços do quadtree, é o normal (ver fillPatch).
    vLocal = normal;
    vToView = normalMatrix;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;

const FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform sampler2D uRelief;
  uniform vec3 uStarDir;
  uniform vec3 uTwilight;
  uniform float uExaggeration;
  varying vec3 vLocal;
  varying vec3 vView;
  varying mat3 vToView;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 dir = normalize(vLocal);
    // dirToUv; a linha 0 do mapa fica no topo da imagem, onde o v da textura é 1.
    vec2 uv = vec2(atan(dir.z, -dir.x) / PI2, 1.0 - acos(clamp(dir.y, -1.0, 1.0)) / PI);
    // Leste e norte no ponto. Os mipmaps saem do tamanho do pixel medido sobre a esfera, e não da variação de uv: ela
    // salta uma volta inteira na emenda (uma linha na imagem) e explode no polo, onde as colunas se apertam (um disco
    // borrado). Por isso a largura da coluna tem um piso: perto do polo elas são todas quase iguais.
    float sinTheta = sqrt(max(1.0 - dir.y * dir.y, 0.0));
    vec3 east = vec3(dir.z, 0.0, -dir.x) / max(sinTheta, 1e-4);
    vec3 north = cross(dir, east);
    float column = PI2 * max(sinTheta, 0.2);
    vec3 dirX = dFdx(dir);
    vec3 dirY = dFdy(dir);
    vec2 gradX = vec2(dot(dirX, east) / column, dot(dirX, north) / PI);
    vec2 gradY = vec2(dot(dirY, east) / column, dot(dirY, north) / PI);
    vec3 albedo = textureGrad(uMap, uv, gradX, gradY).rgb;
    vec4 relief = textureGrad(uRelief, uv, gradX, gradY);

    vec2 slope = (relief.rg - 128.0 / 255.0) * (255.0 / 127.0) * ${RELIEF_SLOPE_RANGE.toFixed(1)};
    vec3 normal = normalize(vToView * normalize(dir - uExaggeration * (slope.x * east + slope.y * north)));
    vec3 up = normalize(vToView * dir);
    vec3 toStar = normalize(mat3(viewMatrix) * uStarDir);
    // O dia e a noite saem da esfera lisa: uma montanha não acende do outro lado do terminador.
    float sun = dot(up, toStar);
    float day = smoothstep(-0.06, 0.14, sun);
    // 0,955 é o que a luz de intensidade 3 dá num material comum (3/π).
    vec3 color = albedo * (0.012 + 0.955 * max(dot(normal, toStar), 0.0) * day);
    // O reflexo da estrela, só na água.
    vec3 halfway = normalize(toStar + normalize(vView));
    color += vec3(1.0, 0.95, 0.85) * (1.0 - relief.a) * day * 0.45 * pow(max(dot(up, halfway), 0.0), 90.0);
    // O crepúsculo: uma faixa de cor na volta do terminador, se há ar para espalhar a luz.
    color += uTwilight * smoothstep(-0.1, 0.0, sun) * (1.0 - smoothstep(0.0, 0.14, sun));
    // As luzes da noite. A raiz segura o brilho de longe, onde o mipmap já misturou as casas com o escuro em volta.
    color += vec3(1.0, 0.72, 0.38) * 0.6 * sqrt(relief.b) * (1.0 - smoothstep(-0.04, 0.12, sun));
    // O alfa da textura de cor guarda o código do enfeite, não transparência.
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;

/** Cor do crepúsculo, na força de uma atmosfera como a da Terra. */
const TWILIGHT = new THREE.Color(0.07, 0.022, 0.007);

/** Material da esfera. `starDir` é um vetor de quem chama, atualizado a cada quadro; `twilight` é a força do crepúsculo (0 sem ar). */
export function rockyMaterial(map: THREE.Texture, relief: THREE.Texture, starDir: THREE.Vector3, twilight = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uRelief: { value: relief },
      uStarDir: { value: starDir },
      uTwilight: { value: TWILIGHT.clone().multiplyScalar(twilight) },
      uExaggeration: { value: RELIEF_EXAGGERATION },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

/** Altura da casca da atmosfera, em raios. */
export const ATMOSPHERE_SHELL = 1.02;

/**
 * Como a atmosfera aparece, pela pressão na superfície (em atmosferas), numa escala de ordem de grandeza: de 0,006 em Marte
 * a 92 em Vênus. `strength` é o brilho, e 1 é a Terra; quanto menor `falloff`, mais a borda avança sobre o disco.
 */
export function atmosphereLook(pressure: number): { strength: number; falloff: number } {
  const orders = Math.log10(Math.max(pressure, 1e-3));
  return { strength: Math.max(0.35, Math.min(1.4, 1 + orders * 0.2)), falloff: Math.max(5, Math.min(26, 12 - orders * 3.5)) };
}

const ATMOSPHERE_VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalMatrix * normal;
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;

const ATMOSPHERE_FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor;
  uniform vec3 uStarDir;
  uniform float uStrength;
  uniform float uFalloff;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 normal = normalize(vN);
    // A que distância do centro passa o raio de visão, em raios da casca: 1 é a beira de fora, e a conta abaixo diz onde fica o chão.
    float ndv = max(dot(normal, normalize(vV)), 0.0);
    float miss = sqrt(max(1.0 - ndv * ndv, 0.0));
    float ground = 1.0 / ${ATMOSPHERE_SHELL.toFixed(3)};
    // Sobre o disco, o ar some rápido em direção ao centro; fora dele, some até a beira da casca, sem a linha dura.
    float glow = miss < ground ? pow(miss / ground, uFalloff) : 1.0 - smoothstep(ground, 1.0, miss);
    float sun = dot(normal, normalize(mat3(viewMatrix) * uStarDir));
    float lit = smoothstep(-0.28, 0.3, sun);
    // Perto do terminador a luz atravessa mais ar, e sobra o vermelho.
    vec3 tint = mix(vec3(0.75, 0.28, 0.1), uColor, smoothstep(0.0, 0.45, sun));
    gl_FragColor = vec4(tint, glow * lit * uStrength);
  }`;

/** Material da casca da atmosfera (o `SoftRenderer` só lê `uColor`). */
export function atmosphereMaterial(color: number, pressure: number, starDir: THREE.Vector3): THREE.ShaderMaterial {
  const { strength, falloff } = atmosphereLook(pressure);
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uStarDir: { value: starDir }, uStrength: { value: strength }, uFalloff: { value: falloff } },
    vertexShader: ATMOSPHERE_VERTEX,
    fragmentShader: ATMOSPHERE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.FrontSide,
  });
}

/** Troca as texturas do material, liberando as anteriores. */
export function setRockyTextures(material: THREE.ShaderMaterial, map: THREE.Texture, relief: THREE.Texture): void {
  (material.uniforms.uMap.value as THREE.Texture).dispose();
  (material.uniforms.uRelief.value as THREE.Texture).dispose();
  material.uniforms.uMap.value = map;
  material.uniforms.uRelief.value = relief;
}
