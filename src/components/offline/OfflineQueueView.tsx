import React, { useState, useEffect } from 'react';
import { 
  WifiOff, 
  Wifi, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  Database, 
  ArrowUpRight, 
  Trash2, 
  AlertTriangle,
  Play,
  Layers,
  Sparkles
} from 'lucide-react';
import { 
  getQueuedEntries, 
  removeQueuedEntry, 
  clearSyncedEntries, 
  OfflineQueuedEntry 
} from '../../lib/offline/offlineQueue.ts';
import { Entry } from '../../types/index.ts';

interface OfflineQueueViewProps {
  isSimulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  onEntriesSynced: (syncedEntries: Entry[]) => void;
}

export const OfflineQueueView: React.FC<OfflineQueueViewProps> = ({
  isSimulatedOffline,
  onToggleSimulatedOffline,
  onEntriesSynced
}) => {
  const [queuedItems, setQueuedItems] = useState<OfflineQueuedEntry[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);

  // Load items from IndexedDB
  const refreshQueue = async () => {
    const items = await getQueuedEntries();
    setQueuedItems(items);
  };

  useEffect(() => {
    refreshQueue();
  }, []);

  // Execute manual batch sync
  const handleSyncNow = async () => {
    if (queuedItems.length === 0 || isSimulatedOffline) return;

    setIsSyncing(true);
    setSyncProgress(0);

    const convertedEntries: Entry[] = [];
    const total = queuedItems.length;

    for (let i = 0; i < total; i++) {
      const item = queuedItems[i];
      // Simulate network request to Supabase
      await new Promise(r => setTimeout(r, 200));

      convertedEntries.push({
        id: `synced-${Date.now()}-${i}`,
        name: item.name,
        phone_e164: item.phone_e164 || undefined,
        id_masked: item.national_id_masked || undefined,
        id_hash: item.national_id_hash || undefined,
        ward_filed_id: item.ward_filed_id,
        ward_name: item.ward_name,
        polling_centre_id: item.polling_centre_id || undefined,
        polling_centre_name: item.polling_centre_name || undefined,
        polling_station_id: item.polling_station_id || undefined,
        polling_station_name: item.polling_station_name || undefined,
        support_level: item.support_level as any,
        issues: item.issues,
        needs_transport: item.needs_transport,
        has_pvc: item.has_pvc,
        notes: item.notes,
        consent_at: item.consent_at,
        consent_text_version: item.consent_text_version,
        consent_status: 'given',
        source: 'mobilizer',
        verification_status: item.national_id_hash ? 'unverified' : 'pending_id',
        captured_on: item.capturedOn,
        mobilizer_name: item.mobilizer_name,
        flags: item.national_id_hash ? [] : ['MISSING_ID']
      });

      await removeQueuedEntry(item.queueId);
      setSyncProgress(Math.floor(((i + 1) / total) * 100));
    }

    onEntriesSynced(convertedEntries);
    await refreshQueue();
    setIsSyncing(false);
    setLastSyncTime(new Date().toLocaleTimeString());
  };

  return (
    <div className="space-y-6">
      {/* Network Status & Simulator Toggle */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            {isSimulatedOffline ? (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 font-bold text-xs">
                <WifiOff className="w-4 h-4 text-amber-700" />
                Simulated Offline (No Signal)
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs">
                <Wifi className="w-4 h-4 text-emerald-700" />
                Online (Connected to Supabase)
              </span>
            )}
            <span className="text-xs text-gray-500 font-mono">
              IndexedDB: {queuedItems.length} Pending
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            In remote polling stations (e.g. Butsotso South or interior Sheywe), mobilizers can continue registering supporters offline. Records queue safely in browser IndexedDB.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleSimulatedOffline}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
              isSimulatedOffline
                ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            {isSimulatedOffline ? 'Restore Network' : 'Simulate Weak Signal'}
          </button>

          <button
            disabled={queuedItems.length === 0 || isSimulatedOffline || isSyncing}
            onClick={handleSyncNow}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              queuedItems.length === 0 || isSimulatedOffline || isSyncing
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                : 'bg-emerald-700 text-white hover:bg-emerald-800 shadow-xs'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? `Syncing (${syncProgress}%)...` : 'Sync Queue Now'}
          </button>
        </div>
      </div>

      {/* Queue items list */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100">
          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-700" />
            Offline Storage Records ({queuedItems.length})
          </h4>
          {lastSyncTime && (
            <span className="text-xs text-gray-500 font-mono">
              Last synced: {lastSyncTime}
            </span>
          )}
        </div>

        {queuedItems.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs divide-y divide-gray-200">
              <thead className="bg-gray-50 text-gray-700 font-bold">
                <tr>
                  <th className="py-2 px-3 text-left">Queue ID</th>
                  <th className="py-2 px-3 text-left">Supporter Name</th>
                  <th className="py-2 px-3 text-left">Phone</th>
                  <th className="py-2 px-3 text-left">Ward</th>
                  <th className="py-2 px-3 text-left">Support Level</th>
                  <th className="py-2 px-3 text-left">Status</th>
                  <th className="py-2 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-700">
                {queuedItems.map(item => (
                  <tr key={item.queueId} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-500">{item.queueId.slice(0, 14)}...</td>
                    <td className="py-2 px-3 font-bold text-gray-900">{item.name}</td>
                    <td className="py-2 px-3 font-mono">{item.phone_e164 || 'N/A'}</td>
                    <td className="py-2 px-3">{item.ward_name}</td>
                    <td className="py-2 px-3 capitalize font-semibold text-emerald-800">{item.support_level.replace('_', ' ')}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                        {item.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={async () => {
                          await removeQueuedEntry(item.queueId);
                          await refreshQueue();
                        }}
                        className="text-rose-600 hover:text-rose-800 text-[11px] font-semibold"
                        title="Delete from offline queue"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
            <div className="font-bold text-sm text-gray-900">
              Offline Queue is Empty
            </div>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              All field captures have been successfully synchronized to the campaign database.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
