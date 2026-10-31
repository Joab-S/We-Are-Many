import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../core/rng';
import { AU_PER_PC } from '../core/units';
import { findStar, indexChunk, lastSearch, nearbyStars, nearestStar, type StarChunk, type StarHit } from './starIndex';

/**
 * Referência: a varredura completa que o StarField fazia antes (mesmas
 * contas, mesma ordem), copiada daqui para conferir que a busca nova dá
 * exatamente o mesmo resultado.
 */
interface Loaded {
  data: Float32Array;
  c: { x: number; y: number; z: number };
}

function refNearest(chunks: Loaded[], ship: { x: number; y: number; z: number }, skipId?: number): StarHit | null {
  let best: StarHit | null = null;
  let bestSq = Infinity;
  for (const c of chunks) {
    const d = c.data;
    const cx = c.c.x;
    const cy = c.c.y;
    const cz = c.c.z;
    for (let i = 0; i < d.length; i += 6) {
      const dx = cx + d[i] * AU_PER_PC - ship.x;
      const dy = cy + d[i + 1] * AU_PER_PC - ship.y;
      const dz = cz + d[i + 2] * AU_PER_PC - ship.z;
      const sq = dx * dx + dy * dy + dz * dz;
      if (sq < bestSq && d[i + 5] !== skipId) {
        bestSq = sq;
        best = { id: d[i + 5], x: dx + ship.x, y: dy + ship.y, z: dz + ship.z, absmag: d[i + 3], ci: d[i + 4], distAu: Math.sqrt(sq) };
      }
    }
  }
  return best;
}

function refNearby(chunks: Loaded[], ship: { x: number; y: number; z: number }, k: number, skipId?: number, maxAu = Infinity): StarHit[] {
  const ids: number[] = [];
  const sqs: number[] = [];
  const where: [Float32Array, number, Loaded['c']][] = [];
  let worst = maxAu === Infinity ? Infinity : maxAu * maxAu;
  for (const c of chunks) {
    const d = c.data;
    const cx = c.c.x - ship.x;
    const cy = c.c.y - ship.y;
    const cz = c.c.z - ship.z;
    for (let i = 0; i < d.length; i += 6) {
      const dx = cx + d[i] * AU_PER_PC;
      const dy = cy + d[i + 1] * AU_PER_PC;
      const dz = cz + d[i + 2] * AU_PER_PC;
      const sq = dx * dx + dy * dy + dz * dz;
      if (sq >= worst || d[i + 5] === skipId) continue;
      let j = sqs.length;
      while (j > 0 && sqs[j - 1] > sq) j--;
      sqs.splice(j, 0, sq);
      ids.splice(j, 0, d[i + 5]);
      where.splice(j, 0, [d, i, c.c]);
      if (sqs.length > k) {
        sqs.pop();
        ids.pop();
        where.pop();
      }
      if (sqs.length === k) worst = sqs[k - 1];
    }
  }
  return where.map(([d, i, center], n) => ({
    id: ids[n],
    x: d[i] * AU_PER_PC + center.x,
    y: d[i + 1] * AU_PER_PC + center.y,
    z: d[i + 2] * AU_PER_PC + center.z,
    absmag: d[i + 3],
    ci: d[i + 4],
    distAu: Math.sqrt(sqs[n]),
  }));
}

function refFind(chunks: Loaded[], id: number): StarHit | null {
  for (const c of chunks) {
    const d = c.data;
    for (let i = 0; i < d.length; i += 6) {
      if (d[i + 5] === id) return { id, x: d[i] * AU_PER_PC + c.c.x, y: d[i + 1] * AU_PER_PC + c.c.y, z: d[i + 2] * AU_PER_PC + c.c.z, absmag: d[i + 3], ci: d[i + 4], distAu: 0 };
    }
  }
  return null;
}

/** Os dois lados da comparação a partir dos mesmos chunks, na ordem de chegada. */
function build(list: { data: Float32Array; centerPc: [number, number, number] }[]): { loaded: Loaded[]; indexed: StarChunk[] } {
  const loaded: Loaded[] = [];
  const indexed: StarChunk[] = [];
  list.forEach(({ data, centerPc }, seq) => {
    const c = { x: centerPc[0] * AU_PER_PC, y: centerPc[1] * AU_PER_PC, z: centerPc[2] * AU_PER_PC };
    loaded.push({ data, c });
    indexed.push(indexChunk(data, c.x, c.y, c.z, seq));
  });
  return { loaded, indexed };
}

/** Chunks sintéticos em cubos aninhados como a octree, com estrelas repetidas (mesma posição) para forçar empates. */
function synthetic(seed: number): { data: Float32Array; centerPc: [number, number, number] }[] {
  const rnd = mulberry32(seed);
  const out: { data: Float32Array; centerPc: [number, number, number] }[] = [];
  let id = 1;
  const cubes: [number, number, number, number][] = [[0, 0, 0, 64], [-32, 32, 32, 32], [-16, 16, 48, 16], [16, -16, 16, 16], [-24, 8, 40, 8], [0, 0, 0, 4]];
  for (const [cx, cy, cz, h] of cubes) {
    const n = 50 + Math.floor(rnd() * 900);
    const data = new Float32Array(n * 6);
    for (let s = 0; s < n; s++) {
      const o = s * 6;
      if (s > 3 && rnd() < 0.08) {
        // Cópia de uma estrela anterior: distâncias exatamente iguais.
        const src = Math.floor(rnd() * s) * 6;
        data.set(data.subarray(src, src + 5), o);
      } else {
        // Coordenadas em múltiplos de 1/64 pc: há muitas distâncias iguais em pontos simétricos.
        for (let a = 0; a < 3; a++) data[o + a] = Math.round((rnd() * 2 - 1) * h * 64) / 64;
        data[o + 3] = rnd() * 15 - 2;
        data[o + 4] = rnd() * 2 - 0.3;
      }
      data[o + 5] = id++;
    }
    out.push({ data, centerPc: [cx, cy, cz] });
  }
  return out;
}

describe('busca de estrelas por grade nos chunks (Spatial Partition)', () => {
  it('nearest, nearby e find iguais à varredura completa, com empates', () => {
    for (const seed of [1, 2, 3]) {
      const { loaded, indexed } = build(synthetic(seed));
      const rnd = mulberry32(seed * 977);
      for (let q = 0; q < 60; q++) {
        // Pontos sobre a grade de 1/64 pc (empates exatos), dentro, entre e fora dos chunks.
        const pc = [0, 1, 2].map(() => (q % 3 === 0 ? Math.round((rnd() * 2 - 1) * 80 * 64) / 64 : (rnd() * 2 - 1) * (q % 2 ? 30 : 200)));
        const ship = { x: pc[0] * AU_PER_PC, y: pc[1] * AU_PER_PC, z: pc[2] * AU_PER_PC };
        const skip = q % 4 === 0 ? refNearest(loaded, ship)?.id : undefined;
        expect(nearestStar(indexed, ship.x, ship.y, ship.z, skip)).toEqual(refNearest(loaded, ship, skip));
        for (const k of [1, 5, 40, 400]) {
          expect(nearbyStars(indexed, ship.x, ship.y, ship.z, k, skip)).toEqual(refNearby(loaded, ship, k, skip));
        }
        const maxAu = (2 + rnd() * 20) * AU_PER_PC;
        expect(nearbyStars(indexed, ship.x, ship.y, ship.z, 400, undefined, maxAu)).toEqual(refNearby(loaded, ship, 400, undefined, maxAu));
      }
      for (const id of [1, 77, 500, 999999]) expect(findStar(indexed, id)).toEqual(refFind(loaded, id));
    }
  });

  it('empates de distância saem na ordem de chegada dos chunks e das estrelas', () => {
    const star = (x: number, id: number) => [x, 0, 0, 5, 0.6, id];
    const a = new Float32Array([...star(1, 10), ...star(-1, 11), ...star(2, 12)]);
    const b = new Float32Array([...star(-1, 20), ...star(1, 21)]);
    const { loaded, indexed } = build([{ data: a, centerPc: [0, 0, 0] }, { data: b, centerPc: [0, 0, 0] }]);
    const got = nearbyStars(indexed, 0, 0, 0, 3).map((s) => s.id);
    expect(got).toEqual([10, 11, 20]);
    expect(got).toEqual(refNearby(loaded, { x: 0, y: 0, z: 0 }, 3).map((s) => s.id));
    expect(nearestStar(indexed, 0, 0, 0)!.id).toBe(10);
    expect(nearestStar(indexed, 0, 0, 0, 10)!.id).toBe(11);
  });

  it('chunks reais do catálogo HYG: igual à varredura completa em vários pontos', async () => {
    // Sem tipos do Node no projeto: o módulo é carregado pelo nome.
    const fsName = 'node:fs';
    const fs = (await import(/* @vite-ignore */ fsName)) as { readFileSync(path: string, enc?: string): { buffer: ArrayBuffer; byteOffset: number; byteLength: number } & string };
    const dir = 'public/universe/v1';
    const manifest = JSON.parse(fs.readFileSync(`${dir}/manifest.json`, 'utf8')) as { nodes: { id: string; c: [number, number, number] }[] };
    // Ordem de chegada embaralhada, como acontece no jogo (os chunks carregam fora de ordem).
    const rnd = mulberry32(5);
    const nodes = manifest.nodes.map((n) => ({ n, r: rnd() })).sort((p, q) => p.r - q.r).map((p) => p.n);
    const list = nodes.map((n) => {
      const buf = fs.readFileSync(`${dir}/n/${n.id}.bin`);
      return { data: new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)), centerPc: n.c };
    });
    const { loaded, indexed } = build(list);
    const points: [number, number, number][] = [[0, 0, 0], [0.32 / AU_PER_PC, 0.06 / AU_PER_PC, 0], [-0.5, 0.4, -1.1], [1.3, -0.2, 0.9], [8.6, 0.1, -2], [40, 20, -10], [200, 0, 0], [-900, 300, 50]];
    const total = list.reduce((n, c) => n + c.data.length / 6, 0);
    for (const pc of points) {
      const ship = { x: pc[0] * AU_PER_PC, y: pc[1] * AU_PER_PC, z: pc[2] * AU_PER_PC };
      const near = refNearest(loaded, ship);
      expect(nearestStar(indexed, ship.x, ship.y, ship.z)).toEqual(near);
      // A grade poupa trabalho: a busca olha uma fração pequena das estrelas.
      expect(lastSearch.stars).toBeLessThan(total / 10);
      expect(nearestStar(indexed, ship.x, ship.y, ship.z, near!.id)).toEqual(refNearest(loaded, ship, near!.id));
      expect(nearbyStars(indexed, ship.x, ship.y, ship.z, 40, near!.id)).toEqual(refNearby(loaded, ship, 40, near!.id));
      expect(lastSearch.stars).toBeLessThan(total / 5);
      expect(nearbyStars(indexed, ship.x, ship.y, ship.z, 400, undefined, 4 * AU_PER_PC)).toEqual(refNearby(loaded, ship, 400, undefined, 4 * AU_PER_PC));
    }
    for (const id of [0, 70890, 32263, 71456]) expect(findStar(indexed, id)).toEqual(refFind(loaded, id));
  });
});
