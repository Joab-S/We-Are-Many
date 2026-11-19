import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { generateSurface } from '../../../procgen/surface';
import { SOL_PLANETS, planetParams } from '../../../nav/planets';
import { cellSize, cubeDir, MAX_LEVEL, PATCH_CELLS, patchError, patchKey, selectPatches, type LodView, type PatchNode, type Vec3 } from './lod';
import { fillPatch, patchIndices, PATCH_VERTICES } from './Patch';
import { HEIGHT_SCALE, mapHeight, QuadSphere } from './QuadSphere';

/** Uma tela de 800 px com a câmera de 70° do jogo. */
const PIXELS_PER_RADIAN = 800 / (2 * Math.tan((70 * Math.PI) / 360));
const at = (altitude: number): LodView => ({ camera: { x: 0, y: 1 + altitude, z: 0 }, pixelsPerRadian: PIXELS_PER_RADIAN });
const select = (view: LodView) => {
  const out: PatchNode[] = [];
  selectPatches(view, out);
  return out;
};
const lookingDown = (altitude: number): LodView => ({ ...at(altitude), forward: { x: 0, y: -1, z: 0 }, halfAngle: (50 * Math.PI) / 180 });

describe('as faces do cubo', () => {
  it('são pontos da esfera, e s × t aponta para fora em todas', () => {
    const v = (face: number, s: number, t: number) => {
      const d = cubeDir(face, s, t, { x: 0, y: 0, z: 0 });
      return new THREE.Vector3(d.x, d.y, d.z);
    };
    for (let face = 0; face < 6; face++) {
      for (const [s, t] of [[0, 0], [0.5, -0.3], [-0.9, 0.9]]) {
        const p = v(face, s, t);
        expect(p.length()).toBeCloseTo(1, 12);
        const ds = v(face, s + 0.01, t).sub(p);
        const dt = v(face, s, t + 0.01).sub(p);
        expect(ds.cross(dt).dot(p)).toBeGreaterThan(0);
      }
    }
  });

  it('as bordas das faces vizinhas se encontram: as seis cobrem a esfera sem buraco', () => {
    // Cada direção cai em ao menos uma face; os cantos de uma face aparecem em outras duas.
    const key = (d: Vec3) => [d.x, d.y, d.z].map((n) => n.toFixed(6)).join();
    const corners = new Map<string, number>();
    for (let face = 0; face < 6; face++) {
      for (const [s, t] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const k = key(cubeDir(face, s, t, { x: 0, y: 0, z: 0 }));
        corners.set(k, (corners.get(k) ?? 0) + 1);
      }
    }
    expect(corners.size).toBe(8);
    expect([...corners.values()].every((n) => n === 3)).toBe(true);
  });
});

describe('o detalhe pela altitude', () => {
  it('quanto mais perto, mais fino, e o erro cai pela metade a cada nível', () => {
    const deepest = (altitude: number) => Math.max(...select(at(altitude)).map((n) => n.level));
    expect(deepest(10)).toBeLessThanOrEqual(1);
    expect(deepest(0.6)).toBeLessThan(deepest(0.05));
    expect(deepest(0.05)).toBeLessThan(deepest(0.02) + 1);
    expect(deepest(0.02)).toBeGreaterThanOrEqual(4);
    expect(deepest(1e-6)).toBeLessThanOrEqual(MAX_LEVEL);
    for (let level = 1; level <= MAX_LEVEL; level++) expect(patchError(level) / patchError(level - 1)).toBeLessThan(0.55);
  });

  it('o número de pedaços fica dentro do orçamento em toda a descida, mesmo sem recortar pela câmera', () => {
    const counts = [10, 2, 1, 0.6, 0.3, 0.1, 0.05, 0.02].map((a) => select(at(a)).length);
    console.info('pedaços por altitude (sem recorte da câmera)', counts.join(' '));
    for (const n of counts) expect(n).toBeLessThan(300);
    // A 1,6 raio, poucos.
    expect(select(at(0.6)).length).toBeLessThan(60);
    // Longe, nem todas as faces.
    expect(select(at(10)).length).toBeLessThanOrEqual(6);
    expect(select(at(10)).length).toBeGreaterThan(0);
  });

  it('o que está atrás da câmera não se refina', () => {
    for (const a of [0.3, 0.05, 0.02]) expect(select(lookingDown(a)).length).toBeLessThanOrEqual(select(at(a)).length);
    const up = { ...at(0.02), forward: { x: 0, y: 1, z: 0 }, halfAngle: (50 * Math.PI) / 180 };
    expect(select(up).length).toBeLessThan(5);
  });

  it('o que passa do horizonte não entra', () => {
    const out = select(at(0.05));
    const d = { x: 0, y: 0, z: 0 };
    // A face do lado oposto à câmera (−Y) fica de fora.
    expect(out.some((n) => n.face === 3)).toBe(false);
    cubeDir(2, 0, 0, d);
    expect(d.y).toBeCloseTo(1, 9);
    expect(out.some((n) => n.face === 2)).toBe(true);
  });

  it('nenhum pedaço cobre o outro', () => {
    const covers = (a: PatchNode, b: PatchNode) => {
      if (a.face !== b.face || a.level >= b.level) return false;
      const shift = b.level - a.level;
      return b.x >> shift === a.x && b.y >> shift === a.y;
    };
    const out = select(at(0.03));
    for (const a of out) for (const b of out) expect(covers(a, b)).toBe(false);
    expect(new Set(out.map(patchKey)).size).toBe(out.length);
  });

  it('sem os filhos prontos, o pai continua na tela e os filhos vão para a fila', () => {
    const out: PatchNode[] = [];
    const wanted: PatchNode[] = [];
    selectPatches(at(0.05), out, (n) => n.level === 0, wanted);
    expect(out.every((n) => n.level === 0)).toBe(true);
    expect(wanted.length).toBeGreaterThan(0);
    expect(wanted.every((n) => n.level === 1)).toBe(true);
  });
});

describe('a malha de um pedaço', () => {
  const node: PatchNode = { face: 4, level: 2, x: 1, y: 2 };

  it('os triângulos da grade e das saias olham para fora', () => {
    const position = new Float32Array(PATCH_VERTICES * 3);
    const normal = new Float32Array(PATCH_VERTICES * 3);
    fillPatch(node, 1, () => 0, position, normal, { x: 0, y: 0, z: 0 });
    const index = patchIndices();
    const v = (i: number) => new THREE.Vector3(position[i * 3], position[i * 3 + 1], position[i * 3 + 2]);
    const dir = (i: number) => new THREE.Vector3(normal[i * 3], normal[i * 3 + 1], normal[i * 3 + 2]);
    const faces = PATCH_CELLS * PATCH_CELLS * 2;
    for (let t = 0; t < faces; t++) {
      const [a, b, c] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
      expect(v(b).sub(v(a)).cross(v(c).sub(v(a))).dot(dir(a))).toBeGreaterThan(0);
    }
    // Cada saia olha para fora do pedaço: para longe do meio dele.
    const middle = new THREE.Vector3();
    for (let i = 0; i < 33 * 33; i++) middle.add(v(i));
    middle.divideScalar(33 * 33);
    for (let t = faces; t < index.length / 3; t++) {
      const [a, b, c] = [index[t * 3], index[t * 3 + 1], index[t * 3 + 2]];
      const n = v(b).sub(v(a)).cross(v(c).sub(v(a)));
      expect(n.dot(v(a).sub(middle))).toBeGreaterThan(0);
    }
    expect(Math.max(...index)).toBe(PATCH_VERTICES - 1);
  });

  it('dois pedaços vizinhos do mesmo nível têm a mesma borda, e a saia desce só meia célula', () => {
    const position = new Float32Array(PATCH_VERTICES * 3);
    const normal = new Float32Array(PATCH_VERTICES * 3);
    const other = new Float32Array(PATCH_VERTICES * 3);
    const c1 = { x: 0, y: 0, z: 0 };
    const c2 = { x: 0, y: 0, z: 0 };
    const height = (x: number, y: number, z: number) => 0.01 * Math.sin(x * 9 + y * 5 + z * 3);
    fillPatch(node, 1, height, position, normal, c1);
    fillPatch({ ...node, x: 2 }, 1, height, other, normal, c2);
    for (let j = 0; j < 33; j++) {
      const a = (j * 33 + 32) * 3;
      const b = j * 33 * 3;
      expect(position[a] + c1.x).toBeCloseTo(other[b] + c2.x, 5);
      expect(position[a + 1] + c1.y).toBeCloseTo(other[b + 1] + c2.y, 5);
      expect(position[a + 2] + c1.z).toBeCloseTo(other[b + 2] + c2.z, 5);
    }
    // Vértice da saia sob o da borda.
    const top = new THREE.Vector3(position[0], position[1], position[2]);
    const below = new THREE.Vector3(position[33 * 33 * 3], position[33 * 33 * 3 + 1], position[33 * 33 * 3 + 2]);
    expect(top.distanceTo(below)).toBeCloseTo(cellSize(node.level) * 0.5, 5);
  });

  it('as posições ficam relativas ao meio do pedaço, em números pequenos', () => {
    const position = new Float32Array(PATCH_VERTICES * 3);
    const normal = new Float32Array(PATCH_VERTICES * 3);
    fillPatch({ face: 0, level: 7, x: 60, y: 60 }, 1, () => 0.005, position, normal, { x: 0, y: 0, z: 0 });
    expect(Math.max(...position.map(Math.abs))).toBeLessThan(0.02);
  });
});

describe('o chão vem do mapa', () => {
  const map = generateSurface(planetParams(SOL_PLANETS[2]), 0.25);
  const height = mapHeight(map);

  it('nunca passa do piso da nave, nem desce abaixo do mar', () => {
    let top = 0;
    for (let i = 0; i < 4000; i++) {
      const a = i * 2.399963;
      const y = 1 - (2 * i) / 3999;
      const r = Math.sqrt(1 - y * y);
      const h = height(r * Math.cos(a), y, r * Math.sin(a));
      expect(h).toBeGreaterThanOrEqual(0);
      top = Math.max(top, h);
    }
    expect(top).toBeGreaterThan(0);
    expect(top).toBeLessThanOrEqual(HEIGHT_SCALE);
  });

  it('o tile no mapa e o ponto na esfera são o mesmo', () => {
    const tiles = { elevation: new Float32Array(16 * 8), width: 16, height: 8 };
    // Uma ilha de um tile só: a direção do meio dele é o topo, e o tile do lado oposto da esfera continua no nível zero.
    tiles.elevation[3 * 16 + 5] = 1;
    const fn = mapHeight(tiles, 1);
    const toDir = (col: number, row: number) => {
      const phi = ((col + 0.5) / 16) * Math.PI * 2;
      const theta = ((row + 0.5) / 8) * Math.PI;
      return [-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)] as const;
    };
    expect(fn(...toDir(5, 3))).toBeCloseTo(1, 9);
    expect(fn(...toDir(13, 4))).toBe(0);
    // A emenda do mapa fecha: a coluna 15 enxerga a coluna 0.
    tiles.elevation.fill(0);
    tiles.elevation[3 * 16] = 1;
    const seam = Math.PI * 2 * (1 - 1e-6);
    const theta = ((3 + 0.5) / 8) * Math.PI;
    expect(fn(-Math.cos(seam) * Math.sin(theta), Math.cos(theta), Math.sin(seam) * Math.sin(theta))).toBeCloseTo(0.5, 3);
  });
});

describe('o quadtree', () => {
  const material = new THREE.MeshBasicMaterial();
  const flat = () => 0;
  /** Roda quadros até parar de construir. */
  const settle = (q: QuadSphere, view: LodView) => {
    for (let i = 0; i < 400; i++) {
      const before = q.built;
      q.update(view);
      if (q.built === before) return i;
    }
    throw new Error('não assentou');
  };

  it('começa com as seis raízes, e refina aos poucos, sem construir tudo num quadro só', () => {
    const q = new QuadSphere(1, flat, material);
    expect(q.built).toBe(6);
    q.update(at(0.02));
    expect(q.built).toBeLessThanOrEqual(6 + 8);
    expect(settle(q, at(0.02))).toBeGreaterThan(2);
    expect(q.drawn).toBe(select(at(0.02)).length);
    const visible = q.group.children.filter((c) => c.visible).length;
    expect(visible).toBe(q.drawn);
    q.dispose();
  });

  it('reaproveita a malha: voltar ao mesmo lugar não constrói nada de novo', () => {
    const q = new QuadSphere(1, flat, material);
    settle(q, at(0.02));
    const built = q.built;
    q.update(at(5));
    q.update(at(0.02));
    expect(q.built).toBe(built);
    q.dispose();
  });

  it('todos os pedaços compartilham os índices, e ao sair libera a geometria', () => {
    const q = new QuadSphere(1, flat, material);
    settle(q, at(0.3));
    const meshes = q.group.children as THREE.Mesh[];
    expect(new Set(meshes.map((m) => m.geometry.index)).size).toBe(1);
    let freed = 0;
    for (const m of meshes) m.geometry.addEventListener('dispose', () => freed++);
    const count = meshes.length;
    q.dispose();
    expect(freed).toBe(count);
    expect(q.group.children).toHaveLength(0);
  });

  it('não passa do teto de memória, mesmo andando em volta do planeta', () => {
    const q = new QuadSphere(1, flat, material);
    for (let i = 0; i < 80; i++) {
      const a = i * 0.25;
      const view: LodView = { camera: { x: Math.cos(a) * 1.02, y: Math.sin(a) * 1.02, z: 0 }, pixelsPerRadian: PIXELS_PER_RADIAN };
      for (let k = 0; k < 6; k++) q.update(view);
    }
    expect(q.built).toBeLessThanOrEqual(400);
    q.dispose();
  });
});
