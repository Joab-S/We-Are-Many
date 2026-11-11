import * as THREE from 'three';
import type { SurfaceMap } from '../../../procgen/surface';
import { cellSize, patchKey, PATCH_CELLS, selectPatches, type LodView, type PatchNode } from './lod';
import { fillPatch, patchIndices, PATCH_VERTICES, type HeightFn } from './Patch';

/** Altura da elevação 1 acima da esfera, em raios. Abaixo do piso da nave (`DESCENT_FLOOR`): ela nunca entra numa montanha. */
export const HEIGHT_SCALE = 0.012;
/** Pedaços construídos por quadro, para a descida não engasgar: cada um passa por mais de mil vértices. */
const BUILD_PER_FRAME = 8;
/** Quantos pedaços ficam na memória. O que está na tela nunca sai. */
const MAX_PATCHES = 400;

/** O chão de um mapa: a elevação entre os centros dos tiles, e o mar conta como nível zero. */
export function mapHeight(map: Pick<SurfaceMap, 'elevation' | 'width' | 'height'>, scale = HEIGHT_SCALE): HeightFn {
  const { elevation, width, height } = map;
  const tile = (col: number, row: number) => {
    const e = elevation[row * width + col];
    return e > 0 ? e : 0;
  };
  return (x, y, z) => {
    // `dirToUv`, sem criar um objeto por vértice.
    const phi = Math.atan2(z, -x) / (Math.PI * 2);
    const u = (phi < 0 ? phi + 1 : phi) * width - 0.5;
    const v = (Math.acos(y > 1 ? 1 : y < -1 ? -1 : y) / Math.PI) * height - 0.5;
    const col = Math.floor(u);
    const row = Math.floor(v);
    const fu = u - col;
    const fv = v - row;
    const c0 = ((col % width) + width) % width;
    const c1 = (c0 + 1) % width;
    const r0 = row < 0 ? 0 : row;
    const r1 = row + 1 >= height ? height - 1 : row + 1;
    const top = tile(c0, r0) * (1 - fu) + tile(c1, r0) * fu;
    const bottom = tile(c0, r1) * (1 - fu) + tile(c1, r1) * fu;
    return (top * (1 - fv) + bottom * fv) * scale;
  };
}

interface Patch {
  mesh: THREE.Mesh;
  lastUsed: number;
}

/**
 * O planeta de perto: um quadtree em cada face do cubo, no lugar da esfera. Usa o mesmo material dela, então as texturas
 * e a luz são as mesmas. A malha é reaproveitada (Object Pool): sair de um lugar e chegar em outro não cria geometria nova.
 */
export class QuadSphere {
  readonly group = new THREE.Group();
  private readonly patches = new Map<number, Patch>();
  private readonly free: THREE.BufferGeometry[] = [];
  private readonly index = new THREE.BufferAttribute(patchIndices(), 1);
  private readonly selected: PatchNode[] = [];
  private readonly wanted: PatchNode[] = [];
  private readonly center = { x: 0, y: 0, z: 0 };
  private readonly isReady = (n: PatchNode) => this.patches.has(patchKey(n));
  private frame = 0;
  /** Pedaços na tela no último quadro, antes do recorte da câmera. */
  drawn = 0;

  constructor(
    private readonly radius: number,
    private readonly height: HeightFn,
    private readonly material: THREE.Material,
  ) {
    // As raízes ficam sempre prontas: sempre há o que desenhar.
    for (let face = 0; face < 6; face++) this.build({ face, level: 0, x: 0, y: 0 });
  }

  get built(): number {
    return this.patches.size;
  }

  private build(node: PatchNode): void {
    const geometry = this.free.pop() ?? this.createGeometry();
    fillPatch(node, this.radius, this.height, geometry.getAttribute('position').array as Float32Array, geometry.getAttribute('normal').array as Float32Array, this.center);
    geometry.getAttribute('position').needsUpdate = true;
    geometry.getAttribute('normal').needsUpdate = true;
    // Uma esfera em volta do pedaço, que o recorte da câmera usa: meia diagonal do pedaço, com folga para o relevo.
    const halfDiagonal = cellSize(node.level) * PATCH_CELLS * 0.75 * this.radius;
    geometry.boundingSphere!.radius = halfDiagonal + this.radius * 0.02;
    const mesh = new THREE.Mesh(geometry, this.material);
    mesh.position.set(this.center.x, this.center.y, this.center.z);
    mesh.visible = false;
    this.group.add(mesh);
    this.patches.set(patchKey(node), { mesh, lastUsed: this.frame });
  }

  private createGeometry(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PATCH_VERTICES * 3), 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(PATCH_VERTICES * 3), 3));
    geometry.setIndex(this.index);
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
    return geometry;
  }

  /** Um quadro: escolhe os pedaços, constrói alguns dos que faltam e mostra só os escolhidos. */
  update(view: LodView): void {
    this.frame++;
    this.selected.length = 0;
    this.wanted.length = 0;
    selectPatches(view, this.selected, this.isReady, this.wanted);
    const seen = new Set<number>();
    let budget = BUILD_PER_FRAME;
    for (const n of this.wanted) {
      const key = patchKey(n);
      if (seen.has(key)) continue;
      seen.add(key);
      if (budget-- <= 0) break;
      this.build(n);
    }
    for (const patch of this.patches.values()) patch.mesh.visible = false;
    for (const n of this.selected) {
      const patch = this.patches.get(patchKey(n))!;
      patch.mesh.visible = true;
      patch.lastUsed = this.frame;
    }
    this.drawn = this.selected.length;
    if (this.patches.size > MAX_PATCHES) this.evict();
  }

  /** Devolve ao pool os pedaços usados há mais tempo, menos as raízes. */
  private evict(): void {
    const old = [...this.patches.entries()].filter(([, p]) => p.lastUsed < this.frame).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    for (const [key, patch] of old) {
      if (this.patches.size <= MAX_PATCHES) break;
      if (key % (128 * 128) === 0 && Math.floor(key / (128 * 128)) % 8 === 0) continue;
      this.group.remove(patch.mesh);
      this.free.push(patch.mesh.geometry);
      this.patches.delete(key);
    }
  }

  /** Libera tudo, menos o material, que é o da esfera. */
  dispose(): void {
    for (const patch of this.patches.values()) patch.mesh.geometry.dispose();
    for (const geometry of this.free) geometry.dispose();
    this.patches.clear();
    this.free.length = 0;
    this.group.clear();
    this.group.removeFromParent();
  }
}
