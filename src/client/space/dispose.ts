import * as THREE from 'three';

/**
 * Marca um recurso compartilhado (Flyweight): uma textura ou material usado
 * por muitos objetos, como o brilho radial dos sprites. disposeObject não o
 * libera; quem o criou cuida do descarte (ex.: disposeGlowTexture ao sair
 * do espaço). Sem a marca, descartar um sistema liberava a textura de todos
 * e a forçava a subir de novo para a GPU.
 */
export function markShared<T extends THREE.Texture | THREE.Material>(resource: T): T {
  resource.userData.shared = true;
  return resource;
}

export function isShared(resource: THREE.Texture | THREE.Material): boolean {
  return resource.userData.shared === true;
}

/** Libera geometrias, materiais e texturas de uma árvore de objetos, menos os compartilhados. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      if (isShared(m)) continue;
      for (const v of Object.values(m)) if (v instanceof THREE.Texture && !isShared(v)) v.dispose();
      m.dispose();
    }
  });
}
