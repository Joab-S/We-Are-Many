import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { gpuBytes } from './gpuBudget';
import { QuadSphere } from './planet/QuadSphere';
import { PATCH_VERTICES } from './planet/Patch';

describe('os bytes na GPU', () => {
  it('conta atributos e índice, uma vez só mesmo compartilhados', () => {
    const position = new THREE.BufferAttribute(new Float32Array(30), 3);
    const index = new THREE.BufferAttribute(new Uint16Array(6), 1);
    const geometry = new THREE.BufferGeometry().setAttribute('position', position).setIndex(index);
    const group = new THREE.Group().add(new THREE.Mesh(geometry), new THREE.Mesh(geometry));
    expect(gpuBytes(group)).toBe(30 * 4 + 6 * 2);
  });

  it('conta as texturas com os mipmaps, do material comum e dos uniforms', () => {
    const tex = (w: number, h: number, mip: boolean) => {
      const t = new THREE.DataTexture(new Uint8Array(w * h * 4), w, h);
      t.generateMipmaps = mip;
      return t;
    };
    const plain = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: tex(4, 4, false) }));
    const shared = tex(3, 3, true);
    const shader = new THREE.ShaderMaterial({ uniforms: { a: { value: shared }, b: { value: shared }, c: { value: 3 } } });
    const group = new THREE.Group().add(plain, new THREE.Mesh(new THREE.BufferGeometry(), shader));
    expect(gpuBytes(group)).toBeCloseTo(4 * 4 * 4 + (3 * 3 * 4 * 4) / 3, 6);
  });

  it('as texturas sem imagem não contam, e o quadtree custa o que diz', () => {
    expect(gpuBytes(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: new THREE.Texture() })))).toBe(0);
    const quad = new QuadSphere(1, () => 0, new THREE.MeshBasicMaterial());
    const six = 6 * PATCH_VERTICES * 3 * 4 * 2;
    expect(gpuBytes(quad.group)).toBeGreaterThan(six);
    expect(gpuBytes(quad.group)).toBeLessThan(six + 20_000);
    quad.dispose();
  });
});
