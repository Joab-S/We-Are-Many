/**
 * Armazenamento do save no IndexedDB (uma chave para o save atual e outra
 * para o que foi recusado ao carregar, guardado para não se perder).
 */
export interface SaveStore {
  get(key: string): Promise<unknown | undefined>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

const DB = 'we-are-many';
const STORE = 'saves';

let connection: IDBDatabase | null = null;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => {
      connection = req.result;
      // Outra aba atualizando o banco ou o navegador fechando a conexão: abre de novo na próxima vez.
      connection.onclose = connection.onversionchange = () => {
        connection?.close();
        connection = null;
      };
      resolve(connection);
    };
    req.onerror = () => reject(req.error);
  });
}

function request<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = tx.onabort = () => reject(tx.error);
  });
}

/**
 * A conexão fica aberta: ao fechar a aba o pedido de gravação precisa sair na
 * hora, e esperar o `indexedDB.open` assíncrono fazia o save do F5 se perder.
 */
function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  if (connection) return request(connection, mode, fn);
  return open().then((db) => request(db, mode, fn));
}

export const indexedDbStore: SaveStore = {
  get: (key) => run('readonly', (s) => s.get(key)),
  put: async (key, value) => void (await run('readwrite', (s) => s.put(value, key))),
  delete: async (key) => void (await run('readwrite', (s) => s.delete(key))),
};

export const memoryStore = (): SaveStore & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>();
  return {
    data,
    get: async (k) => (data.has(k) ? structuredClone(data.get(k)) : undefined),
    put: async (k, v) => void data.set(k, structuredClone(v)),
    delete: async (k) => void data.delete(k),
  };
};
