import type { CanvasProjectState } from './studioTypes';

const DB_NAME = 'zimage_studio_db';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
const ACTIVE_DRAFT_KEY = 'active_studio_draft';

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IndexedDB'));
  });
}

export async function saveStudioDraftToIndexedDb(project: CanvasProjectState): Promise<void> {
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(project, ACTIVE_DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
    });
    db.close();
  } catch {
    // Non-fatal fallback if browser disables IndexedDB in private mode
  }
}

export async function loadStudioDraftFromIndexedDb(): Promise<CanvasProjectState | null> {
  try {
    const db = await openDraftDb();
    const result = await new Promise<CanvasProjectState | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_DRAFT_KEY);
      req.onsuccess = () => resolve((req.result as CanvasProjectState | undefined) || null);
      req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearStudioDraftFromIndexedDb(): Promise<void> {
  try {
    const db = await openDraftDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(ACTIVE_DRAFT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('IndexedDB delete failed'));
    });
    db.close();
  } catch {
    // Ignore
  }
}
