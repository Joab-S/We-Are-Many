import { describe, expect, it } from 'vitest';
import { LruCache } from './lru';

describe('cache LRU', () => {
  it('descarta o usado há mais tempo ao passar do limite', () => {
    const gone: string[] = [];
    const c = new LruCache<string, number>(3, (_v, k) => gone.push(k));
    c.set('a', 1).set('b', 2).set('c', 3);
    expect(c.get('a')).toBe(1); // "a" vira o mais recente
    c.set('d', 4);
    expect(gone).toEqual(['b']);
    expect([...c.keys()]).toEqual(['c', 'a', 'd']);
    expect(c.size).toBe(3);
    expect(c.has('b')).toBe(false);
    expect(c.get('b')).toBeUndefined();
  });

  it('has não conta como uso; set de chave existente renova e avisa a troca', () => {
    const gone: [string, number][] = [];
    const c = new LruCache<string, number>(2, (v, k) => gone.push([k, v]));
    c.set('a', 1).set('b', 2);
    expect(c.has('a')).toBe(true);
    c.set('c', 3);
    expect(gone).toEqual([['a', 1]]);
    c.set('b', 20);
    expect(gone).toEqual([['a', 1], ['b', 2]]);
    c.set('b', 20);
    expect(gone).toHaveLength(2);
    c.set('d', 4);
    expect([...c.keys()]).toEqual(['b', 'd']);
  });

  it('delete e clear também descartam (para liberar recursos da GPU)', () => {
    let disposed = 0;
    const c = new LruCache<number, { dispose(): void }>(10, (v) => v.dispose());
    const res = () => ({ dispose: () => disposed++ });
    for (let i = 0; i < 25; i++) c.set(i, res());
    expect(disposed).toBe(15);
    expect(c.delete(20)).toBe(true);
    expect(c.delete(20)).toBe(false);
    c.clear();
    expect(disposed).toBe(25);
    expect(c.size).toBe(0);
  });

  it('valores falsos também ficam em cache', () => {
    const c = new LruCache<string, number | null>(2);
    c.set('zero', 0).set('nulo', null);
    expect(c.get('zero')).toBe(0);
    expect(c.get('nulo')).toBeNull();
    expect(() => new LruCache(0)).toThrow();
  });
});
