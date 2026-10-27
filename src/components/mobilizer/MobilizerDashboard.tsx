import React, { useState } from 'react';
import { 
  UserPlus, 
  ListFilter, 
  Share2, 
  Wifi, 
  WifiOff, 
  Lock, 
  CheckCircle2, 
  Search, 
  MapPin, 
  Shield 
} from 'lucide-react';
import { CaptureWizard } from '../capture/CaptureWizard.tsx';
import { ReferralView } from '../referral/ReferralView.tsx';
import { OfflineQueueView } from '../offline/OfflineQueueView.tsx';
import { Entry } from '../../types/index.ts';

interface MobilizerDashboardProps {
  entries: Entry[];
  onAddEntry: (newEntry: Entry) => void;
  isSimulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
}

export const MobilizerDashboard: React.FC<MobilizerDashboardProps> = ({
  entries,
  onAddEntry,
  isSimulatedOffline,
  onToggleSimulatedOffline
}) => {
  const [mobileTab, setMobileTab] = useState<'capture' | 'my_list' | 'referrals' | 'offline_queue'>('capture');

  // Filter mobilizer's own entries (Mobilizers only view their own records under RLS)
  const myEntries = entries.filter(e => e.source === 'mobilizer' || e.source === 'self_registered');

  return (
    <div className="space-y-6">
      {/* Mobilizer Navigation Sub-tabs */}
      <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between sm:justify-start gap-1 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setMobileTab('capture')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            mobileTab === 'capture'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>Capture Voter</span>
        </button>

        <button
          onClick={() => setMobileTab('my_list')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            mobileTab === 'my_list'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <ListFilter className="w-4 h-4" />
          <span>My List ({myEntries.length})</span>
        </button>

        <button
          onClick={() => setMobileTab('referrals')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            mobileTab === 'referrals'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Share2 className="w-4 h-4" />
          <span>Referral QR & Link</span>
        </button>

        <button
          onClick={() => setMobileTab('offline_queue')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            mobileTab === 'offline_queue'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          {isSimulatedOffline ? <WifiOff className="w-4 h-4 text-amber-500" /> : <Wifi className="w-4 h-4" />}
          <span>PWA Offline Queue</span>
        </button>
      </div>

      {/* Main View Area */}
      {mobileTab === 'capture' && (
        <CaptureWizard
          existingEntries={entries}
          onEntryAdded={onAddEntry}
          isSimulatedOffline={isSimulatedOffline}
        />
      )}

      {mobileTab === 'my_list' && (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-emerald-700" />
                <span>My Captured Supporters ({myEntries.length})</span>
              </h4>
              <p className="text-xs text-gray-500">
                PostgreSQL RLS Policy: Mobilizers can view only their own records.
              </p>
            </div>

            <div className="flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-full border border-rose-200">
              <Lock className="w-3.5 h-3.5" />
              <span>Immutable (No Edit / Delete)</span>
            </div>
          </div>

          {myEntries.length > 0 ? (
            <div className="space-y-2">
              {myEntries.map(entry => (
                <div
                  key={entry.id}
                  className="p-3.5 rounded-xl border border-gray-200 bg-gray-50/50 hover:bg-white transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900">{entry.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        entry.verification_status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : entry.verification_status === 'pending_id'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-200 text-gray-700'
                      }`}>
                        {entry.verification_status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                      <span>ID: <code className="font-mono text-gray-700">{entry.id_masked || 'Pending ID'}</code></span>
                      <span>Phone: <code className="font-mono text-gray-700">{entry.phone_e164 || 'None'}</code></span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-600" />
                        {entry.ward_name} ({entry.polling_centre_name || 'Centre'})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-200 capitalize">
                      {entry.support_level.replace('_', ' ')}
                    </span>
                    <span className="text-[10px] text-gray-400 font-mono">
                      {entry.captured_on}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-xs text-gray-500">
              You haven't captured any supporters yet. Use the "Capture Voter" tab to register your first voter!
            </div>
          )}
        </div>
      )}

      {mobileTab === 'referrals' && (
        <ReferralView
          entries={entries}
          onSelfRegisterEntry={onAddEntry}
        />
      )}

      {mobileTab === 'offline_queue' && (
        <OfflineQueueView
          isSimulatedOffline={isSimulatedOffline}
          onToggleSimulatedOffline={onToggleSimulatedOffline}
          onEntriesSynced={syncedList => {
            syncedList.forEach(item => onAddEntry(item));
          }}
        />
      )}
    </div>
  );
};
