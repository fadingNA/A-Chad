import type { AsyncStorageLike } from "@assistant-ui/core/react";

/**
 * Minimal IndexedDB-backed key/value store implementing assistant-ui's
 * `AsyncStorageLike` (string keys → string values, async).
 *
 * This is the lowest layer of the chat persistence stack. The thread-list
 * adapter only knows about this `getItem/setItem/removeItem` contract, so the
 * backing engine can be swapped (IndexedDB now → network/encrypted later)
 * without the adapter or UI changing. See ./index.ts for the swap point.
 *
 * Implemented with raw IndexedDB (no dependency) — a single object store of
 * string values. IndexedDB is used over localStorage because chat histories
 * can exceed localStorage's ~5MB cap and IndexedDB writes are off the main
 * thread.
 */

const DB_NAME = "achad-chat";
const STORE_NAME = "kv";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = run(tx.objectStore(STORE_NAME));
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = tx.onerror = () => reject(tx.error);
      })
  );
}

/** IndexedDB implementation of assistant-ui's AsyncStorageLike. */
export const idbStorage: AsyncStorageLike = {
  async getItem(key) {
    const value = await withStore<string | undefined>("readonly", (store) =>
      store.get(key)
    );
    return value ?? null;
  },
  async setItem(key, value) {
    await withStore("readwrite", (store) => store.put(value, key));
  },
  async removeItem(key) {
    await withStore("readwrite", (store) => store.delete(key));
  },
};
