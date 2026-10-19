import { cacheGet, cachePut } from './chunkCache';
import { indexManifest, type IndexedManifest, type Manifest } from './manifest';

const BASE = `${import.meta.env.BASE_URL}universe/v1/`;

export async function loadManifest(): Promise<IndexedManifest> {
  const res = await fetch(`${BASE}manifest.json`);
  if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
  return indexManifest((await res.json()) as Manifest);
}

export async function loadNames(): Promise<Map<number, string>> {
  const res = await fetch(`${BASE}names.json`);
  if (!res.ok) return new Map();
  const raw = (await res.json()) as Record<string, string>;
  return new Map(Object.entries(raw).map(([k, v]) => [Number(k), v]));
}

/** Baixa (ou lê do cache) as estrelas de um chunk. */
export async function loadChunk(version: number, id: string): Promise<Float32Array> {
  const key = `v${version}/${id}`;
  let buf = await cacheGet(key);
  if (!buf) {
    const res = await fetch(`${BASE}n/${id}.bin`);
    if (!res.ok) throw new Error(`chunk ${id}: HTTP ${res.status}`);
    buf = await res.arrayBuffer();
    void cachePut(key, buf);
  }
  return new Float32Array(buf);
}
