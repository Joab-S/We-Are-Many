import { describe, expect, it } from 'vitest';
import { DirtyBlocks, DirtyRect } from './dirty';
import { ParticlePool } from './pool';
import { CreatureGrid } from './spatial';

describe('Dirty Flag do mapa', () => {
  it('o retângulo sujo cobre os pontos marcados e só eles', () => {
    const r = new DirtyRect();
    expect(r.empty).toBe(true);
    expect(r.width).toBe(0);
    r.add(10, 5);
    r.add(3, 9);
    expect([r.x0, r.y0, r.x1, r.y1]).toEqual([3, 5, 10, 9]);
    expect([r.width, r.height]).toEqual([8, 5]);
    const o = new DirtyRect();
    o.add(20, 1);
    r.union(o);
    expect([r.x0, r.y0, r.x1, r.y1]).toEqual([3, 1, 20, 9]);
    r.clear();
    expect(r.empty).toBe(true);
  });

  it('cada bloco guarda o próprio retângulo e sai uma vez só', () => {
    const d = new DirtyBlocks(256, 128, 64);
    expect([d.cols, d.rows]).toEqual([4, 2]);
    d.mark(1, 1);
    d.mark(5, 7);
    d.mark(200, 100);
    d.mark(1, 1);
    expect(d.count).toBe(2);
    const out: number[][] = [];
    d.drain(10, () => false, (b, x0, y0, x1, y1) => out.push([b, x0, y0, x1, y1]));
    expect(out).toEqual([
      [0, 1, 1, 5, 7],
      [d.blockOf(200, 100), 200, 100, 200, 100],
    ]);
    expect(d.count).toBe(0);
    expect(d.drain(10, () => true, () => {})).toBe(0);
  });

  it('envia primeiro o urgente (jogador) e o visível; o resto vai aos poucos, pelo orçamento', () => {
    const d = new DirtyBlocks(512, 64, 64);
    for (let b = 0; b < 8; b++) d.mark(b * 64 + 3, 3);
    d.mark(7 * 64 + 9, 9, true);
    const visible = (b: number) => b === 5;
    const first: number[] = [];
    d.drain(2, visible, (b) => first.push(b));
    // O urgente sempre sai; ele e o visível completam o orçamento de 2.
    expect(first).toEqual([7, 5]);
    const second: number[] = [];
    d.drain(3, visible, (b) => second.push(b));
    expect(second).toEqual([0, 1, 2]);
    expect(d.count).toBe(3);
  });

  it('marcar tudo cobre cada bloco inteiro, inclusive os da borda menores', () => {
    const d = new DirtyBlocks(100, 70, 64);
    d.markAll();
    const rects: number[][] = [];
    d.drain(100, () => true, (_b, x0, y0, x1, y1) => rects.push([x0, y0, x1, y1]));
    expect(rects).toEqual([
      [0, 0, 63, 63],
      [64, 0, 99, 63],
      [0, 64, 63, 69],
      [64, 64, 99, 69],
    ]);
  });
});

describe('Object Pool de partículas', () => {
  it('nasce no fim, morre trocando com a última e respeita a capacidade', () => {
    const p = new ParticlePool(3);
    expect(p.spawn(0, 0, 1, 0, 0, 1, 2)).toBe(0);
    expect(p.spawn(10, 0, 1, 0, 0, 5, 3)).toBe(1);
    expect(p.spawn(20, 0, 1, 0, 0, 5, 4, 0, 9, 8, 7)).toBe(2);
    expect(p.full).toBe(true);
    expect(p.spawn(30, 0, 0, 0, 0, 1)).toBe(-1);
    p.remove(0);
    expect(p.count).toBe(2);
    // A última (x = 20) veio para o lugar da primeira, com tudo junto.
    expect([p.x[0], p.kind[0], p.rgb[0], p.rgb[1], p.rgb[2]]).toEqual([20, 4, 9, 8, 7]);
    expect(p.x[1]).toBe(10);
  });

  it('step envelhece, move e tira as que passaram da vida, sem pular nenhuma', () => {
    const p = new ParticlePool(10);
    for (let k = 0; k < 6; k++) p.spawn(k, 0, 2, -1, 0, k % 2 ? 10 : 0.5);
    p.step(1);
    expect(p.count).toBe(3);
    const xs = Array.from(p.x.subarray(0, p.count)).sort((a, b) => a - b);
    expect(xs).toEqual([3, 5, 7]);
    for (let k = 0; k < p.count; k++) {
      expect(p.age[k]).toBe(1);
      expect(p.y[k]).toBe(-1);
    }
  });
});

describe('grade das criaturas para o desenho', () => {
  it('devolve só as criaturas das células da vista, em ordem crescente, com a volta do mapa', () => {
    const g = new CreatureGrid(128, 64, 16);
    const x = new Float32Array([5, 100, 20, 127, 60, 6]);
    const y = new Float32Array([5, 5, 40, 10, 63, 6]);
    const alive = new Uint8Array([1, 1, 1, 1, 1, 0]);
    g.rebuild(6, alive, x, y);
    const ids = (n: number) => Array.from(g.indices.subarray(0, n));
    // Colunas 0..31, linhas 0..15: células (0,0) e (1,0).
    expect(ids(g.query(0, 31, 0, 15))).toEqual([0]);
    // Atravessando a borda oeste: -12..10 pega a última célula (x = 112..127); o recorte é por célula inteira.
    expect(ids(g.query(-12, 10, 0, 15))).toEqual([0, 3]);
    expect(ids(g.query(-20, 10, 0, 15))).toEqual([0, 1, 3]);
    // A vista inteira, mais larga que o mapa, conta cada uma uma vez só.
    expect(ids(g.query(-500, 500, 0, 63))).toEqual([0, 1, 2, 3, 4]);
  });
});
