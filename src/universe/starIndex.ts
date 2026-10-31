import { AU_PER_PC } from '../core/units';

/**
 * Busca de estrelas entre os chunks carregados (Spatial Partition), sem
 * three.js. Cada chunk da octree ganha, ao carregar, a caixa das suas
 * estrelas e uma grade de G×G×G células com as estrelas ordenadas por
 * célula. A busca visita os chunks do mais perto ao mais longe e, dentro de
 * cada um, as células em anéis a partir da célula da nave, e para assim que
 * nada mais perto pode existir. Os K melhores ficam num heap de tamanho K.
 *
 * O resultado é idêntico ao da varredura completa de antes (o mesmo
 * conjunto, a mesma ordem e as mesmas contas em double): distâncias iguais
 * são desempatadas pela ordem de chegada do chunk e pelo índice da estrela,
 * como no laço antigo.
 */

/** Números por estrela no chunk: x, y, z (pc, relativos ao centro do nó), magnitude absoluta, índice de cor, id. */
export const STRIDE = 6;

/** Estrelas por célula da grade, em média. */
const PER_CELL = 2;
const MAX_GRID = 16;
/** Folga relativa das cotas inferiores: cobre o arredondamento das contas em double. */
const EPS = 1e-12;

/** Chunk carregado com a grade de busca. Posições do mundo em UA: centro (double) + offset × AU_PER_PC. */
export interface StarChunk {
  readonly data: Float32Array;
  readonly count: number;
  /** Centro do nó, em UA. */
  readonly cx: number;
  readonly cy: number;
  readonly cz: number;
  /** Ordem de chegada; desempata distâncias iguais (o chunk carregado antes vem primeiro). */
  readonly seq: number;
  /** Caixa das estrelas, em UA relativas ao centro: [x0, y0, z0, x1, y1, z1]. */
  readonly box: Float64Array;
  /** Células por eixo e tamanho de cada célula por eixo (UA). */
  readonly g: number;
  readonly cell: Float64Array;
  /** Início de cada célula em `items` (g³ + 1 posições). */
  readonly start: Uint32Array;
  /** Índices das estrelas agrupados por célula, em ordem crescente dentro de cada célula. */
  readonly items: Uint32Array;
  /** Id → índice da primeira estrela com esse id. */
  readonly ids: Map<number, number>;
}

/** Estrela encontrada, com a posição no mundo (UA) e a distância até o ponto da busca. */
export interface StarHit {
  id: number;
  x: number;
  y: number;
  z: number;
  absmag: number;
  ci: number;
  distAu: number;
}

function cellOf(off: number, lo: number, size: number, g: number): number {
  if (!(size > 0)) return 0;
  const c = Math.floor((off - lo) / size);
  return c < 0 ? 0 : c >= g ? g - 1 : c;
}

/** Monta a grade de um chunk (feito uma vez, ao carregar). */
export function indexChunk(data: Float32Array, cx: number, cy: number, cz: number, seq: number): StarChunk {
  const count = Math.floor(data.length / STRIDE);
  const box = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < count; i++) {
    for (let a = 0; a < 3; a++) {
      const off = data[i * STRIDE + a] * AU_PER_PC;
      if (off < box[a]) box[a] = off;
      if (off > box[a + 3]) box[a + 3] = off;
    }
  }
  if (!count) box.fill(0);
  const g = Math.max(1, Math.min(MAX_GRID, Math.round(Math.cbrt(count / PER_CELL))));
  const cell = new Float64Array(3);
  for (let a = 0; a < 3; a++) cell[a] = (box[a + 3] - box[a]) / g;
  const cells = g * g * g;
  const which = new Uint32Array(count);
  const start = new Uint32Array(cells + 1);
  for (let i = 0; i < count; i++) {
    const o = i * STRIDE;
    const ix = cellOf(data[o] * AU_PER_PC, box[0], cell[0], g);
    const iy = cellOf(data[o + 1] * AU_PER_PC, box[1], cell[1], g);
    const iz = cellOf(data[o + 2] * AU_PER_PC, box[2], cell[2], g);
    const c = (ix * g + iy) * g + iz;
    which[i] = c;
    start[c + 1]++;
  }
  for (let c = 0; c < cells; c++) start[c + 1] += start[c];
  const items = new Uint32Array(count);
  const fill = start.slice(0, cells);
  for (let i = 0; i < count; i++) items[fill[which[i]]++] = i;
  const ids = new Map<number, number>();
  for (let i = 0; i < count; i++) {
    const id = data[i * STRIDE + 5];
    if (!ids.has(id)) ids.set(id, i);
  }
  return { data, count, cx, cy, cz, seq, box, g, cell, start, items, ids };
}

/**
 * Os K melhores por (distância², ordem do chunk, índice), num heap de
 * máximo: o pior fica no topo e sai quando chega alguém melhor.
 */
class TopK {
  k = 0;
  n = 0;
  sq = new Float64Array(64);
  seq = new Float64Array(64);
  idx = new Int32Array(64);
  slot = new Int32Array(64);

  reset(k: number): void {
    this.k = k;
    this.n = 0;
    if (this.sq.length < k) {
      const size = Math.max(k, this.sq.length * 2);
      this.sq = new Float64Array(size);
      this.seq = new Float64Array(size);
      this.idx = new Int32Array(size);
      this.slot = new Int32Array(size);
    }
  }

  get full(): boolean {
    return this.n >= this.k;
  }

  /** a é pior que b? */
  private worse(a: number, b: number): boolean {
    const sa = this.sq[a];
    const sb = this.sq[b];
    if (sa !== sb) return sa > sb;
    if (this.seq[a] !== this.seq[b]) return this.seq[a] > this.seq[b];
    return this.idx[a] > this.idx[b];
  }

  private swap(a: number, b: number): void {
    let t = this.sq[a];
    this.sq[a] = this.sq[b];
    this.sq[b] = t;
    t = this.seq[a];
    this.seq[a] = this.seq[b];
    this.seq[b] = t;
    t = this.idx[a];
    this.idx[a] = this.idx[b];
    this.idx[b] = t;
    t = this.slot[a];
    this.slot[a] = this.slot[b];
    this.slot[b] = t;
  }

  private down(i: number, n: number): void {
    for (;;) {
      const l = i * 2 + 1;
      if (l >= n) return;
      const r = l + 1;
      const m = r < n && this.worse(r, l) ? r : l;
      if (!this.worse(m, i)) return;
      this.swap(i, m);
      i = m;
    }
  }

  /** Oferece um candidato; entra se ainda há vaga ou se é melhor que o pior. */
  offer(sq: number, seq: number, idx: number, slot: number): void {
    if (this.k === 0) return;
    if (this.n < this.k) {
      let i = this.n++;
      this.sq[i] = sq;
      this.seq[i] = seq;
      this.idx[i] = idx;
      this.slot[i] = slot;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (!this.worse(i, p)) break;
        this.swap(i, p);
        i = p;
      }
      return;
    }
    const top = this.sq[0];
    if (sq > top || (sq === top && (seq > this.seq[0] || (seq === this.seq[0] && idx > this.idx[0])))) return;
    this.sq[0] = sq;
    this.seq[0] = seq;
    this.idx[0] = idx;
    this.slot[0] = slot;
    this.down(0, this.n);
  }

  /** Ordena do melhor para o pior (heapsort no lugar). */
  sort(): void {
    for (let end = this.n - 1; end > 0; end--) {
      this.swap(0, end);
      this.down(0, end);
    }
  }
}

const enum Formula {
  /** (cx + offset) − nave: as contas do antigo `nearest`. */
  Nearest,
  /** (cx − nave) + offset: as contas do antigo `nearby`. */
  Nearby,
}

/** Quanto a última busca visitou (para testes e medição). */
export const lastSearch = { chunks: 0, cells: 0, stars: 0 };

const top = new TopK();
let order = new Int32Array(64);
let orderLb = new Float64Array(64);

/** Cota inferior (conservadora) da distância² do ponto à caixa [lo, hi] do eixo, já relativa ao ponto. */
function axisGap(lo: number, hi: number, scale: number): number {
  const m = EPS * scale + EPS;
  if (lo > m) return lo - m;
  if (hi < -m) return -hi - m;
  return 0;
}

/** Cota inferior da distância² do ponto (sx, sy, sz) às estrelas da célula (ix, iy, iz) do chunk, ou ao chunk inteiro com ix < 0. */
function boxLb(c: StarChunk, sx: number, sy: number, sz: number, ix: number, iy: number, iz: number): number {
  const b = c.box;
  const ox = c.cx - sx;
  const oy = c.cy - sy;
  const oz = c.cz - sz;
  let x0 = b[0], y0 = b[1], z0 = b[2], x1 = b[3], y1 = b[4], z1 = b[5];
  if (ix >= 0) {
    x0 = b[0] + ix * c.cell[0];
    x1 = x0 + c.cell[0];
    y0 = b[1] + iy * c.cell[1];
    y1 = y0 + c.cell[1];
    z0 = b[2] + iz * c.cell[2];
    z1 = z0 + c.cell[2];
  }
  const gx = axisGap(ox + x0, ox + x1, Math.abs(c.cx) + Math.abs(sx) + Math.abs(x0) + Math.abs(x1));
  const gy = axisGap(oy + y0, oy + y1, Math.abs(c.cy) + Math.abs(sy) + Math.abs(y0) + Math.abs(y1));
  const gz = axisGap(oz + z0, oz + z1, Math.abs(c.cz) + Math.abs(sz) + Math.abs(z0) + Math.abs(z1));
  return gx * gx + gy * gy + gz * gz;
}

/** Pode haver algo nesta cota? Cheio: empate ainda pode ganhar pela ordem. Sem K ainda: precisa ficar abaixo do raio. */
function worth(lb: number, maxSq: number): boolean {
  return top.full ? lb <= top.sq[0] : lb < maxSq;
}

function scanCell(c: StarChunk, slot: number, cellIndex: number, sx: number, sy: number, sz: number, formula: Formula, skipId: number | undefined, maxSq: number): void {
  const d = c.data;
  const ccx = c.cx - sx;
  const ccy = c.cy - sy;
  const ccz = c.cz - sz;
  lastSearch.cells++;
  lastSearch.stars += c.start[cellIndex + 1] - c.start[cellIndex];
  for (let p = c.start[cellIndex], end = c.start[cellIndex + 1]; p < end; p++) {
    const i = c.items[p];
    const o = i * STRIDE;
    let dx: number, dy: number, dz: number;
    if (formula === Formula.Nearest) {
      dx = c.cx + d[o] * AU_PER_PC - sx;
      dy = c.cy + d[o + 1] * AU_PER_PC - sy;
      dz = c.cz + d[o + 2] * AU_PER_PC - sz;
    } else {
      dx = ccx + d[o] * AU_PER_PC;
      dy = ccy + d[o + 1] * AU_PER_PC;
      dz = ccz + d[o + 2] * AU_PER_PC;
    }
    const sq = dx * dx + dy * dy + dz * dz;
    if (!(sq < maxSq) || d[o + 5] === skipId) continue;
    top.offer(sq, c.seq, i, slot);
  }
}

/** Visita as células do chunk em anéis (distância de Chebyshev) a partir da célula mais próxima do ponto. */
function scanChunk(c: StarChunk, slot: number, sx: number, sy: number, sz: number, formula: Formula, skipId: number | undefined, maxSq: number): void {
  const g = c.g;
  const ox = sx - c.cx;
  const oy = sy - c.cy;
  const oz = sz - c.cz;
  const hx = cellOf(ox, c.box[0], c.cell[0], g);
  const hy = cellOf(oy, c.box[1], c.cell[1], g);
  const hz = cellOf(oz, c.box[2], c.cell[2], g);
  const minCell = Math.min(c.cell[0], c.cell[1], c.cell[2]);
  const rings = Math.max(hx, g - 1 - hx, hy, g - 1 - hy, hz, g - 1 - hz);
  for (let r = 0; r <= rings; r++) {
    if (r > 1) {
      // Toda célula do anel r fica a pelo menos (r − 1) células do ponto num dos eixos.
      const ring = (r - 1) * minCell * (1 - 1e-9);
      if (!worth(ring * ring, maxSq)) return;
    }
    for (let ix = Math.max(0, hx - r); ix <= Math.min(g - 1, hx + r); ix++) {
      const edgeX = Math.abs(ix - hx) === r;
      for (let iy = Math.max(0, hy - r); iy <= Math.min(g - 1, hy + r); iy++) {
        const edge = edgeX || Math.abs(iy - hy) === r;
        // Na casca do anel: com x ou y na borda, todos os z; senão, só os dois z da borda.
        const zStep = edge || r === 0 ? 1 : 2 * r;
        for (let iz = hz - r; iz <= hz + r; iz += zStep) {
          if (iz < 0 || iz >= g) continue;
          const cellIndex = (ix * g + iy) * g + iz;
          if (c.start[cellIndex] === c.start[cellIndex + 1]) continue;
          if (!worth(boxLb(c, sx, sy, sz, ix, iy, iz), maxSq)) continue;
          scanCell(c, slot, cellIndex, sx, sy, sz, formula, skipId, maxSq);
        }
      }
    }
  }
}

/** Busca os K melhores; deixa o resultado ordenado em `top`. */
function search(chunks: readonly StarChunk[], sx: number, sy: number, sz: number, k: number, formula: Formula, skipId: number | undefined, maxSq: number): void {
  top.reset(k);
  lastSearch.chunks = lastSearch.cells = lastSearch.stars = 0;
  const n = chunks.length;
  if (order.length < n) {
    order = new Int32Array(n * 2);
    orderLb = new Float64Array(n * 2);
  }
  // Chunks do mais perto ao mais longe (pela caixa), em ordenação por inserção: são poucos.
  for (let i = 0; i < n; i++) {
    const lb = boxLb(chunks[i], sx, sy, sz, -1, -1, -1);
    let j = i;
    while (j > 0 && orderLb[j - 1] > lb) {
      orderLb[j] = orderLb[j - 1];
      order[j] = order[j - 1];
      j--;
    }
    orderLb[j] = lb;
    order[j] = i;
  }
  for (let j = 0; j < n; j++) {
    if (!worth(orderLb[j], maxSq)) break;
    const slot = order[j];
    const c = chunks[slot];
    if (!c.count) continue;
    lastSearch.chunks++;
    scanChunk(c, slot, sx, sy, sz, formula, skipId, maxSq);
  }
  top.sort();
}

function hit(chunks: readonly StarChunk[], j: number, formula: Formula, sx: number, sy: number, sz: number): StarHit {
  const c = chunks[top.slot[j]];
  const o = top.idx[j] * STRIDE;
  const d = c.data;
  let x: number, y: number, z: number;
  if (formula === Formula.Nearest) {
    // Como antes: (dx, dy, dz) + nave.
    x = c.cx + d[o] * AU_PER_PC - sx + sx;
    y = c.cy + d[o + 1] * AU_PER_PC - sy + sy;
    z = c.cz + d[o + 2] * AU_PER_PC - sz + sz;
  } else {
    x = d[o] * AU_PER_PC + c.cx;
    y = d[o + 1] * AU_PER_PC + c.cy;
    z = d[o + 2] * AU_PER_PC + c.cz;
  }
  return { id: d[o + 5], x, y, z, absmag: d[o + 3], ci: d[o + 4], distAu: Math.sqrt(top.sq[j]) };
}

/** Estrela mais próxima de (sx, sy, sz), em UA, menos `skipId`. Igual ao antigo StarField.nearest. */
export function nearestStar(chunks: readonly StarChunk[], sx: number, sy: number, sz: number, skipId?: number): StarHit | null {
  search(chunks, sx, sy, sz, 1, Formula.Nearest, skipId, Infinity);
  return top.n ? hit(chunks, 0, Formula.Nearest, sx, sy, sz) : null;
}

/**
 * As `k` estrelas mais próximas, da mais perto para a mais longe, a menos
 * de `maxAu` e menos `skipId`. Igual ao antigo StarField.nearby.
 */
export function nearbyStars(chunks: readonly StarChunk[], sx: number, sy: number, sz: number, k: number, skipId?: number, maxAu = Infinity): StarHit[] {
  search(chunks, sx, sy, sz, Math.max(0, Math.floor(k)), Formula.Nearby, skipId, maxAu === Infinity ? Infinity : maxAu * maxAu);
  const out: StarHit[] = new Array(top.n);
  for (let j = 0; j < top.n; j++) out[j] = hit(chunks, j, Formula.Nearby, sx, sy, sz);
  return out;
}

/** Estrela pelo id, no primeiro chunk (pela ordem da lista) que a tiver; `distAu` vem zerada. */
export function findStar(chunks: readonly StarChunk[], id: number): StarHit | null {
  for (const c of chunks) {
    const i = c.ids.get(id);
    if (i === undefined) continue;
    const o = i * STRIDE;
    const d = c.data;
    return { id, x: d[o] * AU_PER_PC + c.cx, y: d[o + 1] * AU_PER_PC + c.cy, z: d[o + 2] * AU_PER_PC + c.cz, absmag: d[o + 3], ci: d[o + 4], distAu: 0 };
  }
  return null;
}
