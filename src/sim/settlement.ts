import { STREET_GAP } from './balance';

/**
 * Planta dos assentamentos (REQUISITOS-VIDA.md, seção de assentamentos):
 * níveis, área de cada um e ruas tortas que crescem com o nível. Funções
 * puras; o Ecosystem aplica o resultado ao mapa.
 */

export const TIER_NAMES = ['Aldeia', 'Vila', 'Cidade', 'Metrópole'];
/** Raio da área de cada nível, em tiles. */
export const TIER_RADIUS = [8, 12, 18, 25];
/** População mínima de cada nível. */
export const TIER_POPULATION = [0, 25, 60, 140];

/**
 * Raio da área: o do nível, crescendo até metade do caminho para o do nível
 * seguinte conforme `grow` (0 a 1) (área que cresce aos poucos, RF-VIDA-206).
 */
export function radiusFor(tier: number, grow = 0): number {
  const next = TIER_RADIUS[Math.min(TIER_RADIUS.length - 1, tier + 1)] + (tier >= TIER_RADIUS.length - 1 ? 6 : 0);
  return TIER_RADIUS[tier] + (next - TIER_RADIUS[tier]) * 0.5 * Math.max(0, Math.min(1, grow));
}

/** Cercados no mapa por nível: um na aldeia até quatro na metrópole, +1 se a vocação é de rebanho, no máximo 5. */
export function maxPensOf(tier: number, vocation?: string | null): number {
  const herding = vocation === 'gado' || vocation === 'ovelhas' || vocation === 'cavalos';
  return Math.min(5, 1 + tier + (herding ? 1 : 0));
}

/** Roças no mapa por nível: duas na aldeia até cinco na metrópole. */
export function maxFieldsOf(tier: number): number {
  return Math.min(5, 2 + tier);
}

export function tierFor(population: number): number {
  let t = 0;
  while (t + 1 < TIER_POPULATION.length && population >= TIER_POPULATION[t + 1]) t++;
  return t;
}

/** Rua: tiles em sequência (relativos ao centro), da praça para fora, sem diagonais soltas. */
export interface Street {
  pts: { x: number; y: number }[];
}

/** Comprimento das ruas principais por nível. */
const ARM = [5, 9, 15, 22];

/** Gerador pseudoaleatório simples e determinístico. */
function rng(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Semente estável de um assentamento a partir do lugar da praça. */
export function plotSeed(x: number, y: number): number {
  return (Math.imul(Math.floor(x), 73856093) ^ Math.imul(Math.floor(y), 19349663)) >>> 0;
}

/**
 * Anda `len` tiles a partir de (x, y) na direção `angle`, virando um pouco a
 * cada passo (sem se afastar muito da direção inicial). Quando o passo é
 * diagonal, põe um tile no meio para a rua não ficar furada, sempre do mesmo
 * lado (pelo eixo principal da rua): o degrau fica regular, sem zigue-zague
 * que forme blocos 2x2 (RF-VIDA-192).
 */
function walk(x: number, y: number, angle: number, len: number, r: () => number, wiggle: number): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  let fx = x;
  let fy = y;
  let a = angle;
  let px = Math.round(fx);
  let py = Math.round(fy);
  const horizontal = Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle));
  while (pts.length < len) {
    a += (r() - 0.5) * wiggle + (angle - a) * 0.1;
    fx += Math.cos(a);
    fy += Math.sin(a);
    const nx = Math.round(fx);
    const ny = Math.round(fy);
    if (nx === px && ny === py) continue;
    if (nx !== px && ny !== py) pts.push(horizontal ? { x: nx, y: py } : { x: px, y: ny });
    pts.push({ x: nx, y: ny });
    px = nx;
    py = ny;
  }
  return pts.slice(0, len);
}

/**
 * Ruas do nível, com traçado orgânico: de 3 a 5 ruas principais saem da praça
 * em direções sorteadas e vão serpenteando; em vilas e cidades nascem ruas
 * laterais delas. A mesma semente dá sempre a mesma planta, e cada nível
 * apenas estende a do nível anterior (as casas já construídas continuam
 * na beira da rua).
 *
 * Ruas diferentes nunca correm coladas: uma rua que chegaria a menos de
 * `STREET_GAP` tiles de outra para ali (RF-VIDA-191 e 193). A planta é
 * calculada inteira (nível máximo) e só depois cortada no nível pedido, para
 * continuar estável quando o assentamento cresce. `grow` (0 a 1) estende as
 * ruas rumo ao nível seguinte quando os lotes acabam (ruas sob demanda,
 * RF-VIDA-207).
 */
export function streetPlan(tier: number, seed = 0, grow = 0): Street[] {
  const r = rng(seed);
  const arms = 3 + Math.floor(r() * 3);
  const turn = r() * Math.PI * 2;
  const taken = new Map<string, number>();
  const key = (p: { x: number; y: number }) => `${p.x},${p.y}`;
  const mark = (pts: { x: number; y: number }[], id: number) => {
    for (const p of pts) if (!taken.has(key(p))) taken.set(key(p), id);
  };
  /** Corta a rua no primeiro tile perto demais de outra rua (menos as indicadas em `own`). */
  const clip = (pts: { x: number; y: number }[], own: (id: number, k: number) => boolean) => {
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      for (let dy = 1 - STREET_GAP; dy < STREET_GAP; dy++) {
        for (let dx = 1 - STREET_GAP; dx < STREET_GAP; dx++) {
          const id = taken.get(`${p.x + dx},${p.y + dy}`);
          if (id !== undefined && !own(id, k)) return pts.slice(0, k);
        }
      }
    }
    return pts;
  };
  const plaza = (p: { x: number; y: number }) => Math.abs(p.x) <= 2 && Math.abs(p.y) <= 2;
  const out: { pts: { x: number; y: number }[]; min: number; len?: number }[] = [];
  const mains: { x: number; y: number }[][] = [];
  for (let k = 0; k < arms; k++) {
    const angle = turn + (k / arms) * Math.PI * 2 + (r() - 0.5) * 0.6;
    const full = walk(Math.cos(angle) * 2, Math.sin(angle) * 2, angle, ARM[3], r, 0.45);
    // Perto da praça as principais se encontram de propósito; dali para fora, nada de rua colada.
    const kept = clip(full, (id, i) => id === k || (i < 3 && plaza(full[0])));
    mark(kept, k);
    mains.push(kept);
    out.push({ pts: kept, min: 0 });
  }
  let id = arms;
  for (let k = 0; k < arms; k++) {
    const full = mains[k];
    // Ruas laterais: saem da principal a cada 4–6 tiles, alternando o lado.
    let side = r() < 0.5 ? 1 : -1;
    for (let at = 3 + Math.floor(r() * 2); at < ARM[3] - 2; at += 4 + Math.floor(r() * 3)) {
      side = -side;
      r(); // antes: ângulo da lateral; o sorteio fica para não mudar a sequência
      const len = 4 + Math.floor(r() * 4) + Math.floor(at / 5);
      const branchSeed = r();
      if (at + 3 >= full.length) continue;
      const p = full[at];
      // Direção da principal medida em alguns tiles (um degrau sozinho engana), e a lateral sai perpendicular.
      const before = full[Math.max(0, at - 3)];
      const after = full[at + 3];
      const along = Math.atan2(after.y - before.y, after.x - before.x);
      const sub = rng((seed ^ Math.floor(branchSeed * 4294967296)) >>> 0);
      const raw = walk(p.x, p.y, along + side * (Math.PI / 2), len + 1, sub, 0.5).filter((t) => t.x !== p.x || t.y !== p.y);
      const branch = clip(raw, (o, i) => (o === k && i < STREET_GAP) || o === id);
      if (branch.length >= 2) {
        mark(branch, id);
        const minTier = at < ARM[1] - 1 ? 1 : at < ARM[2] - 1 ? 2 : 3;
        out.push({ pts: branch, min: minTier, len });
      }
      id++;
    }
  }
  // Onde duas ruas ainda se encostam (na saída da praça, num cruzamento), sai o tile que sobra.
  const all = new Set<string>();
  for (const st of out) for (const p of st.pts) all.add(key(p));
  const removed = new Set<string>();
  const inPlaza = (x: number, y: number) => Math.abs(x) <= 1 && Math.abs(y) <= 1;
  pruneBlocks(
    [...all].map((k) => k.split(',').map(Number) as [number, number]),
    (x, y) => all.has(`${x},${y}`) && !inPlaza(x, y),
    (x, y) => all.has(`${x},${y}`) || inPlaza(x, y),
    (x, y) => {
      all.delete(`${x},${y}`);
      removed.add(`${x},${y}`);
    },
  );
  for (const st of out) st.pts = st.pts.filter((p) => !removed.has(key(p)));
  const streets: Street[] = [];
  const g = tier < ARM.length - 1 ? Math.max(0, Math.min(1, grow)) : 0;
  const arm = Math.round(ARM[tier] + (tier < ARM.length - 1 ? (ARM[tier + 1] - ARM[tier]) * g : 0));
  for (const st of out) {
    if (st.min === 0) streets.push({ pts: st.pts.slice(0, arm) });
    else if (tier >= st.min) streets.push({ pts: st.pts.slice(0, Math.ceil((st.len ?? st.pts.length) * Math.min(1, (tier - st.min + 1) / 2))) });
    // Rumo ao nível seguinte: as laterais dele começam a nascer, curtas.
    else if (g > 0 && st.min === tier + 1) streets.push({ pts: st.pts.slice(0, Math.ceil((st.len ?? st.pts.length) * g * 0.5)) });
  }
  return streets.filter((st) => st.pts.length > 0);
}

/**
 * Limpeza de ruas (RF-VIDA-195): tira tiles que formam bloco 2x2 só de rua,
 * quando a retirada não desliga nenhum vizinho (ligação conferida numa janela
 * de 7x7 tiles). `loose(x, y)` diz se o tile é rua que pode sair, `road(x, y)`
 * se é qualquer rua (inclusive praça), e `remove` tira o tile. Tocos de rua
 * sem saída também saem, menos os tiles marcados por `keep` (ex.: o único
 * acesso de uma casa); `keep` recebe também quais tiles sairiam juntos.
 */
export function pruneBlocks(
  candidates: Iterable<[number, number]>,
  loose: (x: number, y: number) => boolean,
  road: (x: number, y: number) => boolean,
  remove: (x: number, y: number) => void,
  keep: (x: number, y: number, gone: (x: number, y: number) => boolean) => boolean = () => false,
): void {
  const list = [...candidates];
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const [x, y] of list) {
      if (!loose(x, y)) continue;
      let block = false;
      for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
        if (loose(x + ox, y + oy) && loose(x + ox + 1, y + oy) && loose(x + ox, y + oy + 1) && loose(x + ox + 1, y + oy + 1)) block = true;
      }
      if (!block) continue;
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => road(x + dx, y + dy));
      if (!nb.length) continue;
      const R = 3;
      // A rua que fica é a de um dos vizinhos (o primeiro com que a retirada dá certo).
      const tryRoot = (root: number[]): [number, number][] | null => {
        const seen = new Set<string>([`${root[0]},${root[1]}`]);
        const stack = [root];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (Math.abs(nx) > R || Math.abs(ny) > R || (nx === 0 && ny === 0) || seen.has(`${nx},${ny}`) || !road(x + nx, y + ny)) continue;
            seen.add(`${nx},${ny}`);
            stack.push([nx, ny]);
          }
        }
        // Um vizinho que ficaria solto só pode ser um toco curto de rua sem saída (até 6 tiles): sai junto.
        const stubs: [number, number][] = [];
        for (const [dx, dy] of nb) {
          if (seen.has(`${dx},${dy}`)) continue;
          const part: [number, number][] = [[dx, dy]];
          const mine = new Set<string>([`${dx},${dy}`]);
          for (let k = 0; k < part.length && part.length <= 6; k++) {
            const [cx, cy] = part[k];
            for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const nx = cx + ex;
              const ny = cy + ey;
              if ((nx === 0 && ny === 0) || mine.has(`${nx},${ny}`) || !road(x + nx, y + ny)) continue;
              mine.add(`${nx},${ny}`);
              part.push([nx, ny]);
            }
          }
          if (part.length > 6 || !part.every(([px, py]) => loose(x + px, y + py))) return null;
          stubs.push(...part);
        }
        const gone = new Set<string>([`${x},${y}`, ...stubs.map(([px, py]) => `${x + px},${y + py}`)]);
        const out = (gx: number, gy: number) => gone.has(`${gx},${gy}`);
        return stubs.some(([px, py]) => keep(x + px, y + py, out)) ? null : stubs;
      };
      let stubs: [number, number][] | null = null;
      for (const root of nb) if ((stubs = tryRoot(root))) break;
      if (!stubs) continue;
      for (const [px, py] of stubs) remove(x + px, y + py);
      remove(x, y);
      changed = true;
    }
    if (!changed) break;
  }
}

/** Blocos 2x2 inteiramente de rua (terra ou pedra) fora das praças: deve ser zero (RF-VIDA-191). */
export function roadBlocks(road: Uint8Array, width: number, height: number): number {
  const isRoad = (i: number) => road[i] === 1 || road[i] === 2;
  let n = 0;
  for (let y = 0; y + 1 < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = y * width + ((x + 1) % width);
      if (isRoad(i) && isRoad(r) && isRoad(i + width) && isRoad(r + width)) n++;
    }
  }
  return n;
}

/**
 * Lotes de casa (canto superior esquerdo de 2x2 tiles) dos dois lados das
 * ruas, a cada 3 tiles e com um pouco de folga, ordenados do centro para
 * fora. Lotes que caem em cima de rua ou de outra casa são pulados na hora
 * de construir.
 */
export function lotsFor(tier: number, seed = 0, grow = 0): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const seen = new Set<string>();
  const r = rng(seed ^ 0x9e3779b9);
  const limit = radiusFor(tier, grow);
  const add = (x: number, y: number) => {
    const k = `${x},${y}`;
    if (seen.has(k) || (x + 1) ** 2 + (y + 1) ** 2 > limit ** 2) return;
    seen.add(k);
    out.push({ x, y });
  };
  for (const { pts } of streetPlan(tier, seed, grow)) {
    for (let i = 1; i < pts.length; i += 3) {
      const a = pts[i - 1];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      const nx = -(b.y - a.y) / len;
      const ny = (b.x - a.x) / len;
      for (const side of [1, -1]) {
        const d = 2 + r() * 0.8;
        add(Math.round(pts[i].x - 0.5 + side * nx * d + (r() - 0.5) * 0.6), Math.round(pts[i].y - 0.5 + side * ny * d + (r() - 0.5) * 0.6));
      }
    }
  }
  return out.sort((a, b) => a.x * a.x + a.y * a.y - (b.x * b.x + b.y * b.y));
}

/** Diferença horizontal mais curta num mapa que dá a volta. */
export function wrapDx(dx: number, width: number): number {
  return dx - Math.round(dx / width) * width;
}

/**
 * Tiles da planta de ruas na ordem em que são abertos (ruas bloco a bloco,
 * RF-VIDA-207): cada rua começa pelo tile mais perto da praça e avança pelas
 * próprias ruas, e entre ruas diferentes abre primeiro o que está mais perto
 * do centro. Em qualquer começo da lista, cada pedaço de rua aberto está
 * ligado ao seu início.
 */
export function streetOrder(tier: number, seed = 0, grow = 0): { x: number; y: number }[] {
  const tiles = new Map<string, { x: number; y: number }>();
  for (const st of streetPlan(tier, seed, grow)) for (const p of st.pts) tiles.set(`${p.x},${p.y}`, p);
  const dist = new Map<string, number>();
  const sorted = [...tiles.entries()].sort((a, b) => Math.hypot(a[1].x, a[1].y) - Math.hypot(b[1].x, b[1].y));
  for (const [k0, p0] of sorted) {
    if (dist.has(k0)) continue;
    // Um pedaço ligado da planta: começa no tile mais perto do centro e anda tile a tile.
    dist.set(k0, Math.hypot(p0.x, p0.y));
    const queue = [p0];
    for (let h = 0; h < queue.length; h++) {
      const p = queue[h];
      const d = dist.get(`${p.x},${p.y}`)!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const k = `${p.x + dx},${p.y + dy}`;
        const q = tiles.get(k);
        if (q && !dist.has(k)) {
          dist.set(k, d + 1);
          queue.push(q);
        }
      }
    }
  }
  return sorted.map(([, p]) => p).sort((a, b) => dist.get(`${a.x},${a.y}`)! - dist.get(`${b.x},${b.y}`)!);
}
