export type OfflineQueueStatus = 'pending' | 'syncing' | 'saved' | 'duplicate-blocked' | 'error';

export interface OfflineQueuedEntry {
  queueId: string;
  clientRequestId: string;
  capturedOn: string;
  consentAt: string;
  consentTextVersion: string;
  mobilizerId: string;
  mobilizerName: string;
  name: string;
  phone: string | null;
  wardFiledId: string;
  wardName: string;
  pollingCentreId: string | null;
  pollingCentreName: string | null;
  pollingStationId: string | null;
  pollingStationName: string | null;
  supportLevel: string;
  issues: string[];
  needsTransport: boolean;
  hasPvc: boolean;
  notes: string;
  status: OfflineQueueStatus;
  retryCount: number;
  lastError?: string;
  resultFlags?: string[];
  resultIdMasked?: string | null;
}

const DB_NAME = 'LurambiFieldPlatformDB';
const DB_VERSION = 3;
const STORE_NAME = 'offline_entries_queue';
const CACHE_STORE = 'offline_app_cache';

export interface OfflineCaptureOptions {
  wards: Array<{ id: string; name: string }>;
  centres: Array<{ id: string; name: string; ward_id: string }>;
  stations: Array<{ id: string; name: string; ward_id: string; polling_centre_id: string }>;
  consent: { enabled?: boolean; version?: string; text?: string } | null;
  issueCategories: string[];
}

export interface CachedMobilizerProfile {
  id: string; email: string | null; full_name: string; phone_e164: string | null;
  national_id_masked: string | null; role: 'mobilizer'; status: 'approved';
  home_ward_id: string | null; home_ward_name?: string; referral_code: string | null;
}

export function createClientRequestId(): string {
  if (typeof window !== 'undefined' && typeof window.crypto?.randomUUID === 'function') return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('Offline storage is not available in this browser.'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'queueId' });
      }
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      // Upgrade earlier drafts without discarding them. Old drafts contained only masked IDs.
      const store = tx?.objectStore(STORE_NAME);
      const cursorRequest = store?.openCursor();
      if (cursorRequest && oldVersion > 0) cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return;
        const row = cursor.value as Record<string, unknown>;
        if (!row.clientRequestId) {
          const status: OfflineQueueStatus = row.status === 'synced' ? 'saved' : 'pending';
          cursor.update({
            ...row,
            clientRequestId: createClientRequestId(),
            capturedOn: row.capturedOn || row.captured_on || new Date().toISOString(),
            consentAt: row.consentAt || row.consent_at || row.capturedOn || row.captured_on || new Date().toISOString(),
            consentTextVersion: row.consentTextVersion || row.consent_text_version || '',
            mobilizerId: row.mobilizerId || row.mobilizer_id || '',
            mobilizerName: row.mobilizerName || row.mobilizer_name || '',
            wardFiledId: row.wardFiledId || row.ward_filed_id || '',
            wardName: row.wardName || row.ward_name || '',
            pollingCentreId: row.pollingCentreId || row.polling_centre_id || null,
            pollingCentreName: row.pollingCentreName || row.polling_centre_name || null,
            pollingStationId: row.pollingStationId || row.polling_station_id || null,
            pollingStationName: row.pollingStationName || row.polling_station_name || null,
            supportLevel: row.supportLevel || row.support_level || 'not_assessed',
            needsTransport: row.needsTransport ?? row.needs_transport ?? false,
            hasPvc: row.hasPvc ?? row.has_pvc ?? false,
            phone: row.phone || row.phone_e164 || null,
            status,
            retryCount: Number(row.retryCount || 0),
            lastError: status === 'saved' ? undefined : 'Ready to sync.',
          } as OfflineQueuedEntry);
        }
        cursor.continue();
      };
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'));
  });
}

export async function enqueueOfflineEntry(draft: Omit<OfflineQueuedEntry, 'queueId' | 'status' | 'retryCount'>): Promise<OfflineQueuedEntry> {
  if (!draft.clientRequestId || !draft.mobilizerId || !draft.consentTextVersion) throw new Error('The draft is missing its sync identity or consent version.');
  const db = await openDatabase();
  const queueItem: OfflineQueuedEntry = { ...draft, queueId: draft.clientRequestId, status: 'pending', retryCount: 0 };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(queueItem);
    tx.oncomplete = () => { db.close(); resolve(queueItem); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not save the offline draft.')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Could not save the offline draft.')); };
  });
}

export async function getQueuedEntries(): Promise<OfflineQueuedEntry[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => { db.close(); resolve((request.result || []) as OfflineQueuedEntry[]); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not read offline drafts.')); };
  });
}

export async function updateQueuedEntry(item: OfflineQueuedEntry): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not update the offline draft.'));
    tx.onabort = () => reject(tx.error || new Error('Could not update the offline draft.'));
  }).finally(() => db.close());
}

export async function removeQueuedEntry(queueId: string): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(queueId);
    request.onsuccess = () => {
      const item = request.result as OfflineQueuedEntry | undefined;
      if (!item || (item.status !== 'saved' && item.status !== 'duplicate-blocked')) {
        tx.abort();
        reject(new Error('Only a server-confirmed result can be removed.'));
        return;
      }
      store.delete(queueId);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not remove the confirmed result.'));
    tx.onabort = () => reject(tx.error || new Error('Could not remove the confirmed result.'));
  }).finally(() => db.close());
}

async function readCache<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const request = tx.objectStore(CACHE_STORE).get(key);
    request.onsuccess = () => { db.close(); resolve((request.result?.value as T | undefined) ?? null); };
    request.onerror = () => { db.close(); reject(request.error || new Error('Could not read offline cache.')); };
  });
}

async function writeCache(key: string, value: unknown): Promise<void> {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Could not save offline cache.'));
    tx.onabort = () => reject(tx.error || new Error('Could not save offline cache.'));
  }).finally(() => db.close());
}

export function getCachedCaptureOptions(): Promise<OfflineCaptureOptions | null> {
  return readCache<OfflineCaptureOptions>('capture_options');
}

export function cacheCaptureOptions(options: OfflineCaptureOptions): Promise<void> {
  return writeCache('capture_options', options);
}

export function getCachedMobilizerProfile(userId: string): Promise<CachedMobilizerProfile | null> {
  return readCache<CachedMobilizerProfile>(`mobilizer_profile_${userId}`);
}

export function cacheMobilizerProfile(profile: CachedMobilizerProfile): Promise<void> {
  return writeCache(`mobilizer_profile_${profile.id}`, profile);
}
