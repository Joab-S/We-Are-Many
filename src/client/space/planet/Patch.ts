import { cellSize, cubeDir, PATCH_CELLS, type PatchNode, type Vec3 } from './lod';

/** Altura do chão numa direção unitária, em raios acima da esfera lisa. */
export type HeightFn = (x: number, y: number, z: number) => number;

/** Vértices por lado da malha. */
const SIDE = PATCH_CELLS + 1;
const GRID_VERTICES = SIDE * SIDE;
/** A grade e uma saia em cada um dos quatro lados. */
export const PATCH_VERTICES = GRID_VERTICES + 4 * SIDE;

/** Vértice da grade. */
const grid = (i: number, j: number) => j * SIDE + i;
/** Vértice da saia, debaixo do da borda: `side` é 0 (t mínimo), 1 (t máximo), 2 (s mínimo) ou 3 (s máximo). */
const skirt = (side: number, k: number) => GRID_VERTICES + side * SIDE + k;

/** Os índices de um pedaço, iguais em todos: a malha muda de lugar, não de forma. */
export function patchIndices(): Uint16Array {
  const out: number[] = [];
  for (let j = 0; j < PATCH_CELLS; j++) {
    for (let i = 0; i < PATCH_CELLS; i++) {
      out.push(grid(i, j), grid(i + 1, j), grid(i + 1, j + 1), grid(i, j), grid(i + 1, j + 1), grid(i, j + 1));
    }
  }
  // As saias: uma parede em cada borda, virada para fora do pedaço, que tapa a fresta entre dois níveis diferentes.
  for (let k = 0; k < PATCH_CELLS; k++) {
    out.push(skirt(0, k), skirt(0, k + 1), grid(k + 1, 0), skirt(0, k), grid(k + 1, 0), grid(k, 0));
    out.push(skirt(1, k + 1), skirt(1, k), grid(k, PATCH_CELLS), skirt(1, k + 1), grid(k, PATCH_CELLS), grid(k + 1, PATCH_CELLS));
    out.push(skirt(2, k + 1), skirt(2, k), grid(0, k), skirt(2, k + 1), grid(0, k), grid(0, k + 1));
    out.push(skirt(3, k), skirt(3, k + 1), grid(PATCH_CELLS, k + 1), skirt(3, k), grid(PATCH_CELLS, k + 1), grid(PATCH_CELLS, k));
  }
  return Uint16Array.from(out);
}

const dir: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Preenche a malha de um pedaço. `position` fica relativa ao meio do pedaço, em float32, e o meio volta em double, para a
 * posição não tremer perto do chão (a mesma ideia da `FloatingOrigin`). `normal` é a direção a partir do centro do planeta:
 * é o que o shader usa para achar o ponto do mapa, e a luz sai da textura de relevo.
 */
export function fillPatch(node: PatchNode, radius: number, height: HeightFn, position: Float32Array, normal: Float32Array, center: Vec3): void {
  const size = 2 / 2 ** node.level;
  const s0 = -1 + node.x * size;
  const t0 = -1 + node.y * size;
  cubeDir(node.face, s0 + size / 2, t0 + size / 2, dir);
  const up = radius * (1 + height(dir.x, dir.y, dir.z));
  center.x = dir.x * up;
  center.y = dir.y * up;
  center.z = dir.z * up;
  const drop = cellSize(node.level) * 0.5;
  const put = (o: number, s: number, t: number, lower: number) => {
    cubeDir(node.face, s, t, dir);
    const r = radius * (1 + height(dir.x, dir.y, dir.z) - lower);
    position[o * 3] = dir.x * r - center.x;
    position[o * 3 + 1] = dir.y * r - center.y;
    position[o * 3 + 2] = dir.z * r - center.z;
    normal[o * 3] = dir.x;
    normal[o * 3 + 1] = dir.y;
    normal[o * 3 + 2] = dir.z;
  };
  const step = size / PATCH_CELLS;
  for (let j = 0; j < SIDE; j++) {
    for (let i = 0; i < SIDE; i++) put(grid(i, j), s0 + i * step, t0 + j * step, 0);
  }
  for (let k = 0; k < SIDE; k++) {
    put(skirt(0, k), s0 + k * step, t0, drop);
    put(skirt(1, k), s0 + k * step, t0 + size, drop);
    put(skirt(2, k), s0, t0 + k * step, drop);
    put(skirt(3, k), s0 + size, t0 + k * step, drop);
  }
}
