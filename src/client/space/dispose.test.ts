import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { disposeObject, markShared } from './dispose';

const disposed = (r: THREE.EventDispatcher<{ dispose: object }>): (() => boolean) => {
  let hit = false;
  r.addEventListener('dispose', () => (hit = true));
  return () => hit;
};

describe('descarte com recursos compartilhados (Flyweight)', () => {
  it('libera o que é do objeto e preserva textura e material compartilhados', () => {
    const shared = markShared(new THREE.Texture());
    const own = new THREE.Texture();
    const sharedMat = markShared(new THREE.SpriteMaterial({ map: shared }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: shared }));
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 4), new THREE.MeshLambertMaterial({ map: own }));
    const other = new THREE.Sprite(sharedMat);
    const group = new THREE.Group().add(glow, sphere, other);

    const sharedGone = disposed(shared);
    const ownGone = disposed(own);
    const glowMatGone = disposed(glow.material);
    const sharedMatGone = disposed(sharedMat);
    const geoGone = disposed(sphere.geometry);
    disposeObject(group);

    expect(sharedGone()).toBe(false);
    expect(sharedMatGone()).toBe(false);
    expect(ownGone()).toBe(true);
    expect(glowMatGone()).toBe(true);
    expect(geoGone()).toBe(true);
  });

  it('libera as texturas dentro de uniforms, sozinhas ou em lista, menos as compartilhadas', () => {
    const own = new THREE.Texture();
    const inList = new THREE.Texture();
    const shared = markShared(new THREE.Texture());
    const material = new THREE.ShaderMaterial({
      uniforms: { uMap: { value: own }, uLayers: { value: [inList] }, uShared: { value: shared }, uTint: { value: new THREE.Color() } },
    });
    const ownGone = disposed(own);
    const inListGone = disposed(inList);
    const sharedGone = disposed(shared);
    const materialGone = disposed(material);

    disposeObject(new THREE.Mesh(new THREE.BufferGeometry(), material));

    expect(ownGone()).toBe(true);
    expect(inListGone()).toBe(true);
    expect(sharedGone()).toBe(false);
    expect(materialGone()).toBe(true);
  });
});
