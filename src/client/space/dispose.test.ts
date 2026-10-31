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
});
