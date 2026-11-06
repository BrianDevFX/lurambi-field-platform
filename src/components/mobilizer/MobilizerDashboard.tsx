import { lazy, useCallback, useEffect, useRef, useState } from 'react';
import { Link2, List, Search, UserRound } from 'lucide-react';
import { CaptureWizard } from '../capture/CaptureWizard.tsx';
import { ReferralView } from '../referral/ReferralView.tsx';
import { supabase } from '../../lib/supabase/client.ts';
import { DashboardView } from '../dashboard/DashboardView.tsx';
import { Entry, Profile } from '../../types/index.ts';

const ExportCenter = lazy(() => import('../admin/ExportCenter.tsx').then((module) => ({ default: module.ExportCenter })));

type Tab = 'capture' | 'list' | 'link' | 'profile';
type RawEntry = Omit<Entry, 'ward_name' | 'polling_centre_name' | 'polling_station_name'>;

interface MobilizerDashboardProps {
  profile: Profile;
  onSignOut: () => void;
}

export function MobilizerDashboard({ profile, onSignOut }: MobilizerDashboardProps) {
  const [tab, setTab] = useState<Tab>('capture');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const loadedCount = useRef(0);

  const loadEntries = useCallback(async (append = false) => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    const offset = append ? loadedCount.current : 0;
    const [entryResult, wardResult, centreResult, stationResult] = await Promise.all([
      supabase.from('entries')
        .select('id,mobilizer_id,ward_filed_id,polling_centre_id,polling_station_id,name,phone_e164,id_masked,support_level,issues,needs_transport,has_pvc,notes,consent_at,consent_text_version,consent_status,source,verification_status,captured_on,flags')
        .order('captured_on', { ascending: false }).range(offset, offset + 49),
      supabase.from('wards').select('id,name'),
      supabase.from('polling_centres').select('id,name'),
      supabase.from('polling_stations').select('id,station_name'),
    ]);
    if (entryResult.error || wardResult.error || centreResult.error || stationResult.error) {
      setError((entryResult.error || wardResult.error || centreResult.error || stationResult.error)!.message);
      if (!append) { setEntries([]); loadedCount.current = 0; }
      setHasMore(false);
    } else {
      const wards = new Map((wardResult.data || []).map((row) => [row.id, row.name]));
      const centres = new Map((centreResult.data || []).map((row) => [row.id, row.name]));
      const stations = new Map((stationResult.data || []).map((row) => [row.id, row.station_name]));
      const nextEntries = ((entryResult.data || []) as RawEntry[]).map((entry) => ({
        ...entry,
        ward_name: wards.get(entry.ward_filed_id) || '',
        polling_centre_name: entry.polling_centre_id ? centres.get(entry.polling_centre_id) : undefined,
        polling_station_name: entry.polling_station_id ? stations.get(entry.polling_station_id) : undefined,
        mobilizer_name: profile.full_name,
      }));
      setEntries((current) => {
        const next = append ? [...current, ...nextEntries] : nextEntries;
        loadedCount.current = next.length;
        return next;
      });
      setHasMore((entryResult.data || []).length === 50);
    }
    setLoading(false);
  }, [profile.full_name]);

  useEffect(() => {
    if (tab === 'list') void loadEntries();
  }, [tab, refresh, loadEntries]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'capture', label: 'Search / Add' },
    { id: 'list', label: 'My List' },
    { id: 'link', label: 'My Link' },
    { id: 'profile', label: 'Profile' },
  ];

  return <div className="pb-24">
    <div hidden={tab !== 'capture'}><CaptureWizard profile={profile} onEntryAdded={() => setRefresh((value) => value + 1)} /></div>

    {tab === 'list' && <section className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-900">My entries</h2><button onClick={() => void loadEntries()} className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Refresh</button></div>
      <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-800">Export my entries</summary><div className="mt-3"><ExportCenter role="mobilizer" /></div></details>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      {loading && entries.length === 0 ? <div role="status" aria-label="Loading entries" className="animate-pulse space-y-2">{[0,1,2].map((item)=><div key={item} className="h-24 rounded-xl bg-white" />)}</div> : entries.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No entries yet.</p>
      ) : entries.map((entry) => <article key={entry.id} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div><h3 className="font-semibold text-slate-900">{entry.name}</h3><p className="mt-1 text-xs text-slate-600">{entry.ward_name} · {entry.polling_centre_name || 'No centre'}{entry.polling_station_name ? ` · ${entry.polling_station_name}` : ''}</p></div>
          <span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize text-slate-700">{entry.verification_status.replaceAll('_', ' ')}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>ID: {entry.id_masked || 'Pending ID'}</span><span>Phone: {entry.phone_e164 || 'No phone'}</span>
          <span>Support: {entry.support_level.replaceAll('_', ' ')}</span><span>{new Date(entry.captured_on).toLocaleString()}</span>
        </div>
        {entry.flags.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{entry.flags.map((flag) => <span key={flag} className="rounded-md bg-amber-100 px-2 py-1 text-xs text-amber-900">{flag.replaceAll('_', ' ')}</span>)}</div>}
        <p className="mt-3 text-xs text-slate-500">Submitted entries cannot be edited or deleted.</p>
      </article>)}
      {hasMore && <button disabled={loading} onClick={() => void loadEntries(true)} className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{loading ? 'Loading…' : 'Load more'}</button>}
    </section>}

    {tab === 'link' && <ReferralView referralCode={profile.referral_code} mobilizerName={profile.full_name} />}

    {tab === 'profile' && <section className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold text-slate-900">Profile</h2>
      <dl className="mt-4 divide-y divide-slate-100 text-sm">
        <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">Name</dt><dd className="text-right font-medium text-slate-900">{profile.full_name}</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">Phone</dt><dd className="text-right font-medium text-slate-900">{profile.phone_e164 || '—'}</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">Home ward</dt><dd className="text-right font-medium text-slate-900">{profile.home_ward_name || '—'}</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">National ID</dt><dd className="text-right font-mono text-slate-900">{profile.national_id_masked || '—'}</dd></div>
        <div className="flex justify-between gap-3 py-3"><dt className="text-slate-500">Referral code</dt><dd className="text-right font-mono font-semibold text-slate-900">{profile.referral_code || '—'}</dd></div>
      </dl>
      <button onClick={onSignOut} className="mt-4 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Sign out</button>
      <div className="mt-6 border-t border-slate-100 pt-5"><DashboardView profile={profile} compact /></div>
    </section>}

    <nav aria-label="Mobilizer navigation" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white px-1 pb-2 pt-1 shadow-[0_-4px_14px_rgba(15,23,42,0.08)]">
      {tabs.map((item) => {
        const Icon = item.id === 'capture' ? Search : item.id === 'list' ? List : item.id === 'link' ? Link2 : UserRound;
        return <button key={item.id} aria-current={tab === item.id ? 'page' : undefined} onClick={() => setTab(item.id)}
          className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-semibold ${tab === item.id ? 'text-emerald-800' : 'text-slate-600'}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
          <span className="truncate">{item.label}{item.id === 'list' ? ` (${entries.length})` : ''}</span>
        </button>;
      })}
    </nav>
  </div>;
}
