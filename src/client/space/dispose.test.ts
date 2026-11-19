import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { disposeObject, markShared } from './dispose';
import { rockyMaterial, setRockyTextures } from './planet/sphere';

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

  it('a esfera do rochoso libera as duas texturas, ao sair e ao trocar pela prévia', () => {
    const map = new THREE.Texture();
    const relief = new THREE.Texture();
    const material = rockyMaterial(map, relief, new THREE.Vector3(1, 0, 0));
    const mapGone = disposed(map);
    const reliefGone = disposed(relief);
    const newMap = new THREE.Texture();
    const newRelief = new THREE.Texture();
    const newMapGone = disposed(newMap);
    const newReliefGone = disposed(newRelief);

    setRockyTextures(material, newMap, newRelief);
    expect(mapGone()).toBe(true);
    expect(reliefGone()).toBe(true);
    expect(newMapGone()).toBe(false);

    disposeObject(new THREE.Mesh(new THREE.BufferGeometry(), material));
    expect(newMapGone()).toBe(true);
    expect(newReliefGone()).toBe(true);
  });
});
