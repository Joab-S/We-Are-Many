/**
 * Adaptador de plataforma (navegador), usado só por loader.ts.
 * Cache de chunks no IndexedDB. Os chunks são imutáveis por versão, então
 * uma vez baixados nunca precisam ser buscados de novo. Se o IndexedDB não
 * estiver disponível (janela privada, bloqueio), o jogo segue sem cache.
 */

const DB_NAME = 'we-are-many';
const STORE = 'chunks';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => req.result.createObjectStore(STORE);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function cacheGet(key: string): Promise<ArrayBuffer | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result as ArrayBuffer | undefined);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export async function cachePut(key: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(data, key);
  } catch {
    // Cache é só uma otimização.
  }
}
