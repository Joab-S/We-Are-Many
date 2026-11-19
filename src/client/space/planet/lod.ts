/**
 * Que pedaços da esfera desenhar, e com que detalhe. Seis faces de um cubo, e cada face é uma árvore de quatro em quatro
 * (quadtree). Sem three.js: as contas valem em raios do planeta, no referencial dele, que gira com ele.
 */

/** Células por lado de um pedaço; a malha tem uma linha de vértices a mais. */
export const PATCH_CELLS = 32;
/** Nível mais fino. Um pedaço daqui cobre uns 2 tiles do mapa da Terra. */
export const MAX_LEVEL = 7;
/** Erro aceito na tela, em pixels. */
export const MAX_ERROR_PX = 2;
/** Inclinação típica do relevo, em raios por radiano: é ela, e não a curvatura, que manda no erro perto do chão. */
const TYPICAL_SLOPE = 0.03;
/** Folga do horizonte, em radianos: o relevo aparece um pouco além da esfera lisa. */
const HORIZON_MARGIN = 0.05;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Um pedaço: `x` e `y` contam de 0 a 2^level − 1 na face. */
export interface PatchNode {
  face: number;
  level: number;
  x: number;
  y: number;
}

/** De onde se olha. */
export interface LodView {
  /** A câmera, em raios, no referencial do planeta. */
  camera: Vec3;
  /** Pixels por radiano no centro da tela: altura da tela / (2·tan(fov/2)). */
  pixelsPerRadian: number;
  /** Direção da câmera, unitária, e a metade do ângulo de visão (da diagonal), para não refinar o que está atrás. */
  forward?: Vec3;
  halfAngle?: number;
}

/** Chave numérica de um pedaço, para o cache. */
export function patchKey(n: PatchNode): number {
  return ((n.face * 8 + n.level) * 128 + n.x) * 128 + n.y;
}

/**
 * Direção do ponto (`s`, `t`, de −1 a 1) de uma face. O `tan` dá células de ângulo quase igual, que a projeção direta do
 * cubo deixa bem maiores no meio da face. Os eixos são tais que s × t aponta para fora em todas as faces.
 */
export function cubeDir(face: number, s: number, t: number, out: Vec3): Vec3 {
  const a = Math.tan((s * Math.PI) / 4);
  const b = Math.tan((t * Math.PI) / 4);
  let x: number;
  let y: number;
  let z: number;
  switch (face) {
    case 0:
      x = 1;
      y = b;
      z = -a;
      break;
    case 1:
      x = -1;
      y = b;
      z = a;
      break;
    case 2:
      x = a;
      y = 1;
      z = -b;
      break;
    case 3:
      x = a;
      y = -1;
      z = b;
      break;
    case 4:
      x = a;
      y = b;
      z = 1;
      break;
    default:
      x = -a;
      y = b;
      z = -1;
      break;
  }
  const k = 1 / Math.sqrt(x * x + y * y + z * z);
  out.x = x * k;
  out.y = y * k;
  out.z = z * k;
  return out;
}

/** Tamanho de uma célula no nível, em raios. */
export function cellSize(level: number): number {
  return Math.PI / 2 / (PATCH_CELLS * 2 ** level);
}

/** Erro geométrico do nível, em raios: a flecha da curvatura numa célula e o relevo que cabe nela. */
export function patchError(level: number): number {
  const cell = cellSize(level);
  return (cell * cell) / 8 + cell * TYPICAL_SLOPE;
}

const center: Vec3 = { x: 0, y: 0, z: 0 };
const corner: Vec3 = { x: 0, y: 0, z: 0 };

/** Põe em `center` a direção do meio do pedaço e devolve o ângulo dele até o canto mais longe. */
function bounds(n: PatchNode): number {
  const size = 2 / 2 ** n.level;
  const s0 = -1 + n.x * size;
  const t0 = -1 + n.y * size;
  cubeDir(n.face, s0 + size / 2, t0 + size / 2, center);
  let cos = 1;
  for (let i = 0; i < 4; i++) {
    cubeDir(n.face, s0 + (i & 1) * size, t0 + (i >> 1) * size, corner);
    cos = Math.min(cos, center.x * corner.x + center.y * corner.y + center.z * corner.z);
  }
  return Math.acos(cos);
}

/** Até onde o pedaço interessa: o ângulo dele até a câmera, ou Infinity se ele está além do horizonte ou fora de visão. */
function visibleDistance(n: PatchNode, view: LodView, d: number): number {
  const radius = bounds(n);
  const c = view.camera;
  const offAxis = Math.acos(Math.max(-1, Math.min(1, (center.x * c.x + center.y * c.y + center.z * c.z) / d)));
  const nearest = Math.max(0, offAxis - radius);
  if (nearest > Math.acos(Math.min(1, 1 / d)) + HORIZON_MARGIN) return Infinity;
  const dist = Math.sqrt(Math.max(d * d + 1 - 2 * d * Math.cos(nearest), 1e-12));
  if (view.forward && view.halfAngle !== undefined) {
    // O pedaço como uma esfera (de corda `chord`): fora do cone de visão se o ângulo até ela passa da metade dele mais o dela.
    const chord = 2 * Math.sin(radius / 2);
    const dx = center.x - c.x;
    const dy = center.y - c.y;
    const dz = center.z - c.z;
    const toCenter = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (toCenter > chord) {
      const f = view.forward;
      const angle = Math.acos(Math.max(-1, Math.min(1, (dx * f.x + dy * f.y + dz * f.z) / toCenter)));
      if (angle > view.halfAngle + Math.asin(Math.min(1, chord / toCenter))) return Infinity;
    }
  }
  return dist;
}

/** O erro do nível, em pixels, à distância dada. */
function errorPx(level: number, dist: number, view: LodView): number {
  return (patchError(level) / dist) * view.pixelsPerRadian;
}

/**
 * Enche `out` com os pedaços a desenhar, sem sobreposição. Um pedaço só se divide quando os quatro filhos visíveis estão
 * prontos (`ready`); enquanto isso, os que faltam vão para `wanted` e ele continua na tela.
 */
export function selectPatches(view: LodView, out: PatchNode[], ready: (n: PatchNode) => boolean = () => true, wanted?: PatchNode[]): void {
  const c = view.camera;
  const d = Math.max(Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z), 1 + 1e-9);
  const visit = (n: PatchNode, dist: number): void => {
    if (n.level < MAX_LEVEL && errorPx(n.level, dist, view) > MAX_ERROR_PX) {
      const kids: { node: PatchNode; dist: number }[] = [];
      let missing = false;
      for (let i = 0; i < 4; i++) {
        const node: PatchNode = { face: n.face, level: n.level + 1, x: n.x * 2 + (i & 1), y: n.y * 2 + (i >> 1) };
        const childDist = visibleDistance(node, view, d);
        if (childDist === Infinity) continue;
        kids.push({ node, dist: childDist });
        if (!ready(node)) {
          missing = true;
          wanted?.push(node);
        }
      }
      if (!missing) {
        for (const k of kids) visit(k.node, k.dist);
        return;
      }
    }
    out.push(n);
  };
  for (let face = 0; face < 6; face++) {
    const root: PatchNode = { face, level: 0, x: 0, y: 0 };
    const dist = visibleDistance(root, view, d);
    if (dist !== Infinity) visit(root, dist);
  }
}
