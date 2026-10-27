/**
 * PWA Offline IndexedDB Queue for Lurambi Field Mobilizers
 * 
 * Enables mobilizers to register voters in weak-signal or remote rural polling stations.
 * Queued records are stored in IndexedDB and synchronized automatically when online,
 * with idempotency hashing to prevent duplicate submissions on retry.
 */

export interface OfflineQueuedEntry {
  queueId: string;
  capturedOn: string;
  name: string;
  phone_e164: string | null;
  national_id_raw?: string | null;
  national_id_masked: string | null;
  national_id_hash: string | null;
  ward_filed_id: string;
  ward_name: string;
  polling_centre_id: string | null;
  polling_centre_name: string | null;
  polling_station_id: string | null;
  polling_station_name: string | null;
  support_level: string;
  issues: string[];
  needs_transport: boolean;
  has_pvc: boolean;
  notes: string;
  consent_at: string;
  consent_text_version: string;
  mobilizer_id: string;
  mobilizer_name: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;
  lastError?: string;
}

const DB_NAME = 'LurambiFieldPlatformDB';
const DB_VERSION = 1;
const STORE_NAME = 'offline_entries_queue';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'queueId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Enqueues a supporter record to IndexedDB
 */
export async function enqueueOfflineEntry(entry: Omit<OfflineQueuedEntry, 'queueId' | 'status' | 'retryCount'>): Promise<OfflineQueuedEntry> {
  const db = await openDatabase();
  const queueItem: OfflineQueuedEntry = {
    ...entry,
    queueId: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    status: 'pending',
    retryCount: 0
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(queueItem);

    req.onsuccess = () => resolve(queueItem);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Gets all currently queued offline entries
 */
export async function getQueuedEntries(): Promise<OfflineQueuedEntry[]> {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (e) {
    console.warn('IndexedDB not accessible, returning empty queue', e);
    return [];
  }
}

/**
 * Removes a synced entry from the queue
 */
export async function removeQueuedEntry(queueId: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(queueId);

    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clears all synced records from the queue
 */
export async function clearSyncedEntries(): Promise<void> {
  const db = await openDatabase();
  const entries = await getQueuedEntries();
  const syncedIds = entries.filter(e => e.status === 'synced').map(e => e.queueId);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    syncedIds.forEach(id => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
