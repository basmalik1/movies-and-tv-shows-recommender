import type { LibraryRepository, TrackedTitle } from "./types";

const DB_NAME = "reel-tracker";
const DB_VERSION = 1;
const STORE = "titles";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("status", "status", { unique: false });
        store.createIndex("mediaType", "mediaType", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  try {
    const tx = db.transaction(STORE, mode);
    const result = await run(tx.objectStore(STORE));
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
}

export class IndexedDbLibraryRepository implements LibraryRepository {
  list() {
    return withStore("readonly", (store) =>
      promisify(store.getAll() as IDBRequest<TrackedTitle[]>),
    );
  }

  get(id: string) {
    return withStore("readonly", (store) =>
      promisify(store.get(id) as IDBRequest<TrackedTitle | undefined>),
    );
  }

  async put(title: TrackedTitle) {
    await withStore("readwrite", (store) => promisify(store.put(title)));
  }

  async putMany(titles: TrackedTitle[]) {
    await withStore("readwrite", (store) => {
      for (const title of titles) store.put(title);
    });
  }

  async remove(id: string) {
    await withStore("readwrite", (store) => promisify(store.delete(id)));
  }

  async clear() {
    await withStore("readwrite", (store) => promisify(store.clear()));
  }
}

/** Used during SSR and in environments where IndexedDB is unavailable (e.g. private mode). */
export class MemoryLibraryRepository implements LibraryRepository {
  private readonly titles = new Map<string, TrackedTitle>();

  async list() {
    return [...this.titles.values()];
  }
  async get(id: string) {
    return this.titles.get(id);
  }
  async put(title: TrackedTitle) {
    this.titles.set(title.id, title);
  }
  async putMany(titles: TrackedTitle[]) {
    for (const title of titles) this.titles.set(title.id, title);
  }
  async remove(id: string) {
    this.titles.delete(id);
  }
  async clear() {
    this.titles.clear();
  }
}

export function createLibraryRepository(): LibraryRepository {
  if (typeof indexedDB === "undefined") return new MemoryLibraryRepository();
  return new IndexedDbLibraryRepository();
}
