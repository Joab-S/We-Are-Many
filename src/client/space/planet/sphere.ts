import * as THREE from 'three';

/**
 * A esfera do planeta rochoso no WebGL: um shader que acha o ponto do mapa pela direção a partir do centro, e não pelo uv
 * da `SphereGeometry` (é o uv que aperta a imagem nos polos e deixa a costura). Sem three.js só as contas de `dirToUv` e
 * `reliefPixels`, que valem também para a Etapa 2.
 */

/** Maior inclinação guardada na textura de relevo, em altura de 0 a 1 por radiano. */
export const RELIEF_SLOPE_RANGE = 16;

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
 * - B: reservado (a Etapa 1 guarda as luzes da noite aqui).
 * - A: 255 em terra, 0 em água.
 */
export function reliefPixels(elevation: Float32Array, width: number, height: number): Uint8Array {
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
      out[o + 2] = 0;
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

/** Luz da estrela e luz de fundo, nas contas do `MeshLambertMaterial` com a luz de intensidade 3 e o ambiente 0,08 da cena. */
const VERTEX = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vLocal;
  varying mat3 vToView;
  void main() {
    vLocal = position;
    vToView = normalMatrix;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    #include <logdepthbuf_vertex>
  }`;

const FRAGMENT = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_fragment>
  uniform sampler2D uMap;
  uniform sampler2D uRelief;
  uniform vec3 uStarDir;
  varying vec3 vLocal;
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
    vec3 normal = normalize(vToView * dir);
    vec3 toStar = normalize(mat3(viewMatrix) * uStarDir);
    vec3 color = albedo * (0.025 + 0.955 * max(dot(normal, toStar), 0.0));
    // O alfa da textura de cor guarda o código do enfeite, não transparência.
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }`;

/** Material da esfera. `starDir` é um vetor de quem chama, atualizado a cada quadro. */
export function rockyMaterial(map: THREE.Texture, relief: THREE.Texture, starDir: THREE.Vector3): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uMap: { value: map }, uRelief: { value: relief }, uStarDir: { value: starDir } },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
  });
}

/** Troca as texturas do material, liberando as anteriores. */
export function setRockyTextures(material: THREE.ShaderMaterial, map: THREE.Texture, relief: THREE.Texture): void {
  (material.uniforms.uMap.value as THREE.Texture).dispose();
  (material.uniforms.uRelief.value as THREE.Texture).dispose();
  material.uniforms.uMap.value = map;
  material.uniforms.uRelief.value = relief;
}
