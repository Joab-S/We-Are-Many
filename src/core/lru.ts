/**
 * Cache com limite que descarta o item usado há mais tempo (LRU). Usa a
 * ordem de inserção do Map: ler ou gravar um item o põe no fim da fila, e
 * quem sai é o primeiro. `onEvict` recebe todo valor que deixa o cache
 * (por limite, troca, delete ou clear), para liberar o que for preciso
 * (ex.: recursos da GPU).
 */
export class LruCache<K, V> {
  private readonly map = new Map<K, V>();

  constructor(
    readonly limit: number,
    private readonly onEvict?: (value: V, key: K) => void,
  ) {
    if (!(limit >= 1)) throw new Error(`limite inválido: ${limit}`);
  }

  get size(): number {
    return this.map.size;
  }

  /** Está no cache (sem contar como uso). */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Valor guardado, que passa a ser o usado mais recentemente. */
  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined;
    const value = this.map.get(key)!;
    this.map.delete(key);
    this.map.set(key, value);
    return value;
  }

  set(key: K, value: V): this {
    if (this.map.has(key)) {
      const old = this.map.get(key)!;
      this.map.delete(key);
      if (old !== value) this.onEvict?.(old, key);
    }
    this.map.set(key, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next().value as K;
      const v = this.map.get(oldest)!;
      this.map.delete(oldest);
      this.onEvict?.(v, oldest);
    }
    return this;
  }

  delete(key: K): boolean {
    if (!this.map.has(key)) return false;
    const v = this.map.get(key)!;
    this.map.delete(key);
    this.onEvict?.(v, key);
    return true;
  }

  clear(): void {
    const entries = [...this.map];
    this.map.clear();
    for (const [k, v] of entries) this.onEvict?.(v, k);
  }

  /** Chaves do usado há mais tempo para o mais recente. */
  keys(): IterableIterator<K> {
    return this.map.keys();
  }
}
