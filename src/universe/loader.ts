import { cacheGet, cachePut } from './chunkCache';
import { indexManifest, type IndexedManifest, type Manifest } from './manifest';

/**
 * Adaptador de plataforma (navegador): baixa o manifesto, os nomes e os
 * chunks com fetch e guarda os chunks no IndexedDB (chunkCache.ts). O resto
 * de src/universe (manifest.ts, starIndex.ts) é motor puro e não depende
 * daqui; um servidor ou um teste pode trocar este módulo por outro que leia
 * os mesmos arquivos de outro lugar (ver ChunkLoader).
 */
const BASE = `${import.meta.env.BASE_URL}universe/v1/`;

/** Como os chunks chegam: no navegador, loadChunk; num servidor ou teste, leitura de arquivo. */
export type ChunkLoader = (version: number, id: string) => Promise<Float32Array>;

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
