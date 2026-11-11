import * as THREE from 'three';

/** Quanto a descida da Terra pode ocupar na GPU, em bytes. */
export const GPU_BUDGET_BYTES = 64 * 1024 * 1024;

/** Bytes de uma textura com os mipmaps, que somam um terço a mais. Uma textura sem imagem não ocupa nada. */
function textureBytes(tex: THREE.Texture): number {
  const image = tex.image as { width?: number; height?: number } | undefined;
  if (!image?.width || !image.height) return 0;
  return image.width * image.height * 4 * (tex.generateMipmaps ? 4 / 3 : 1);
}

/**
 * Estimativa do que a cena ocupa na GPU: os atributos e índices das geometrias, e as texturas com os mipmaps. Cada recurso
 * conta uma vez, mesmo compartilhado. O three.js só dá as contagens (`renderer.info.memory`), e não os bytes.
 */
export function gpuBytes(root: THREE.Object3D): number {
  const seen = new Set<object>();
  let bytes = 0;
  const addTexture = (value: unknown) => {
    if (value instanceof THREE.Texture && !seen.has(value)) {
      seen.add(value);
      bytes += textureBytes(value);
    }
  };
  const addAttribute = (a: { array: ArrayLike<number> & { byteLength?: number } } | null) => {
    if (a && !seen.has(a)) {
      seen.add(a);
      bytes += a.array.byteLength ?? 0;
    }
  };
  root.traverse((o) => {
    const { geometry, material } = o as THREE.Mesh;
    if (geometry) {
      for (const a of Object.values(geometry.attributes)) addAttribute(a as THREE.BufferAttribute);
      addAttribute(geometry.index);
    }
    for (const m of Array.isArray(material) ? material : material ? [material] : []) {
      if (seen.has(m)) continue;
      seen.add(m);
      addTexture((m as THREE.MeshBasicMaterial).map);
      for (const { value } of Object.values((m as THREE.ShaderMaterial).uniforms ?? {})) addTexture(value);
    }
  });
  return bytes;
}
