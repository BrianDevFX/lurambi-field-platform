import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client.ts';
import { Profile, SupportLevel, UserRole, VerificationStatus } from '../../types/index.ts';

type FilterValues = {
  ward_id: string;
  centre_id: string;
  station_id: string;
  mobilizer_id: string;
  date_from: string;
  date_to: string;
  support_level: string;
  verification_status: string;
  source: string;
};
type Row = Record<string, string | number | null>;
type DashboardData = {
  role: UserRole;
  totals: { entries: number; valid_ids: number; valid_phones: number; mapped_places: number; assessed_support: number; verified: number; matched_register: number; id_coverage_pct: number; phone_coverage_pct: number; mapped_place_pct: number; assessed_support_pct: number };
  wards: Row[];
  stations: Row[];
  priority_stations: Row[];
  support: Row[];
  ward_support: Row[];
  verification: Row[];
  top_issues: Row[];
  mobilizer_quality: Row[];
  timeline: Row[];
  influencers: Row[];
};
type PlaceOption = { id: string; name: string; ward_id?: string; polling_centre_id?: string };

const emptyFilters: FilterValues = { ward_id: '', centre_id: '', station_id: '', mobilizer_id: '', date_from: '', date_to: '', support_level: '', verification_status: '', source: '' };
const supportLevels: SupportLevel[] = ['strong_supporter', 'leaning', 'undecided', 'opposed', 'not_reached', 'not_assessed'];
const verificationStatuses: VerificationStatus[] = ['unverified', 'verified', 'not_found', 'wrong_constituency', 'pending_id'];
const titleCase = (value: string) => value.replaceAll('_', ' ');

function cellText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? String(value) : `${value}%`;
  return titleCase(String(value));
}

function DashboardPanel({ title, panelKey, rows, filters, role, compact = false }: {
  title: string; panelKey: string; rows: Row[]; filters: FilterValues; role: UserRole; compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const displayRows = rows.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => !key.endsWith('_id'))));
  const columns = displayRows.length ? Object.keys(displayRows[0]) : [];

  async function exportPanel() {
    if (!supabase || rows.length === 0) return;
    setBusy(true); setError('');
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.utils.book_new();
      const safeRows = displayRows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value,
      ])));
      const worksheet = XLSX.utils.json_to_sheet(safeRows);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Dashboard');
      const fileName = `dashboard_${panelKey}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const { error: logError } = await supabase.rpc('log_export', {
        p_export_type: `dashboard_${panelKey}`,
        p_format: 'xlsx',
        p_filters: { ...filters, role },
        p_row_count: rows.length,
        p_file_name: fileName,
        p_ip_address: null,
      });
      if (logError) throw new Error(logError.message);
      XLSX.writeFile(workbook, fileName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the Excel file.');
    } finally { setBusy(false); }
  }

  return <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4">
    <div className="mb-3 flex items-start justify-between gap-2"><h3 className="font-semibold text-slate-900">{title}</h3>
      <button disabled={busy || !rows.length} onClick={() => void exportPanel()} className="shrink-0 rounded border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-50">{busy ? 'Preparing…' : 'Export Excel'}</button></div>
    {error && <p role="alert" className="mb-2 text-xs text-rose-700">{error}</p>}
    {!rows.length ? <p className="text-sm text-slate-500">No data for these filters.</p> : <div className="overflow-x-auto"><table className={`w-full text-left ${compact ? 'text-xs' : 'text-xs'}`}>
      <thead><tr className="border-b border-slate-100">{columns.map((column) => <th key={column} className="px-2 py-2 font-medium text-slate-500">{titleCase(column)}</th>)}</tr></thead>
      <tbody>{displayRows.map((row, index) => <tr key={`${panelKey}-${index}`} className="border-b border-slate-50 last:border-0">{columns.map((column) => <td key={column} className="whitespace-nowrap px-2 py-2 text-slate-800">{cellText(row[column])}</td>)}</tr>)}</tbody>
    </table></div>}
  </section>;
}

export function DashboardView({ profile, compact = false }: { profile: Profile; compact?: boolean }) {
  const [filters, setFilters] = useState<FilterValues>(emptyFilters);
  const [appliedFilters, setAppliedFilters] = useState<FilterValues>(emptyFilters);
  const [data, setData] = useState<DashboardData | null>(null);
  const [wards, setWards] = useState<PlaceOption[]>([]);
  const [centres, setCentres] = useState<PlaceOption[]>([]);
  const [stations, setStations] = useState<PlaceOption[]>([]);
  const [mobilizers, setMobilizers] = useState<PlaceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (nextFilters: FilterValues) => {
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    setLoading(true); setError('');
    const payload = Object.fromEntries(Object.entries(nextFilters).filter(([, value]) => value !== ''));
    const { data: result, error: rpcError } = await supabase.rpc('dashboard_metrics', { p_filters: payload });
    if (rpcError) { setError(rpcError.message); setData(null); }
    else setData(result as DashboardData);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;
    if (!supabase) return;
    void Promise.all([
      supabase.from('wards').select('id,name').order('name'),
      supabase.from('polling_centres').select('id,name,ward_id').order('name'),
      supabase.from('polling_stations').select('id,station_name,ward_id,polling_centre_id').order('station_number'),
      profile.role === 'mobilizer' ? Promise.resolve({ data: [], error: null }) : supabase.from('profiles').select('id,full_name,home_ward_id').eq('role', 'mobilizer').eq('status', 'approved').order('full_name'),
    ]).then(([wardResult, centreResult, stationResult, mobilizerResult]) => {
      if (!active) return;
      if (wardResult.error || centreResult.error || stationResult.error || mobilizerResult.error) {
        setError((wardResult.error || centreResult.error || stationResult.error || mobilizerResult.error)?.message || 'Could not load dashboard filters.');
      } else {
        setWards((wardResult.data || []) as PlaceOption[]);
        setCentres((centreResult.data || []) as PlaceOption[]);
        setStations(((stationResult.data || []) as Array<PlaceOption & { station_name?: string }>).map((item) => ({ ...item, name: item.station_name || item.name })));
        setMobilizers(((mobilizerResult.data || []) as Array<{ id: string; full_name: string; home_ward_id: string | null }>).map((item) => ({ id: item.id, name: item.full_name, ward_id: item.home_ward_id || undefined })));
      }
      void load(emptyFilters);
    }).catch(() => { if (active) { setError('Could not load dashboard filters.'); setLoading(false); } });
    return () => { active = false; };
  }, [load, profile.role]);

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setAppliedFilters(filters); void load(filters);
  }

  if (compact) {
    const quality = data?.mobilizer_quality.find((item) => item.mobilizer_id === profile.id);
    const summary: Row[] = data ? [
      { metric: 'Entries', value: data.totals.entries },
      { metric: 'Verified', value: data.totals.verified },
      { metric: 'Valid ID coverage', value: data.totals.id_coverage_pct },
      { metric: 'Flagged entries', value: quality?.flagged_entries ?? 0 },
      { metric: 'Duplicate attempts', value: quality?.duplicate_attempts ?? 0 },
    ] : [];
    return <div className="space-y-3">
      <h3 className="font-semibold text-slate-900">My activity</h3>
      {loading && <p className="text-sm text-slate-500">Loading activity…</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {data && <DashboardPanel title="My activity" panelKey="my_activity" rows={summary} filters={emptyFilters} role={profile.role} compact />}
      {data && <DashboardPanel title="Support levels" panelKey="my_support" rows={data.support} filters={emptyFilters} role={profile.role} compact />}
    </div>;
  }

  const totals = data?.totals;
  const completeness: Row[] = totals ? [
    { measure: 'Valid ID', entries: totals.valid_ids, coverage_pct: totals.id_coverage_pct },
    { measure: 'Valid phone', entries: totals.valid_phones, coverage_pct: totals.phone_coverage_pct },
    { measure: 'Mapped centre and station', entries: totals.mapped_places, coverage_pct: totals.mapped_place_pct },
    { measure: 'Assessed support', entries: totals.assessed_support, coverage_pct: totals.assessed_support_pct },
  ] : [];

  return <div className="space-y-4">
    <header><h2 className="text-xl font-bold text-slate-900">Dashboard</h2><p className="mt-1 text-sm text-slate-600">Field totals and data quality.</p></header>
    <form onSubmit={applyFilters} className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-medium text-slate-600">Ward<select value={filters.ward_id} onChange={(e) => setFilters({ ...filters, ward_id: e.target.value, centre_id: '', station_id: '' })} className="mt-1 block w-full rounded border p-2"><option value="">{profile.role === 'ward_coordinator' ? 'Your ward' : 'All wards'}</option>{wards.filter((item) => profile.role === 'admin' || item.id === profile.home_ward_id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Centre<select value={filters.centre_id} onChange={(e) => setFilters({ ...filters, centre_id: e.target.value, station_id: '' })} className="mt-1 block w-full rounded border p-2"><option value="">All centres</option>{centres.filter((item) => (profile.role !== 'ward_coordinator' || item.ward_id === profile.home_ward_id) && (!filters.ward_id || item.ward_id === filters.ward_id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Station<select value={filters.station_id} onChange={(e) => setFilters({ ...filters, station_id: e.target.value })} className="mt-1 block w-full rounded border p-2"><option value="">All stations</option>{stations.filter((item) => (profile.role !== 'ward_coordinator' || item.ward_id === profile.home_ward_id) && (!filters.ward_id || item.ward_id === filters.ward_id) && (!filters.centre_id || item.polling_centre_id === filters.centre_id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Mobilizer<select value={filters.mobilizer_id} onChange={(e) => setFilters({ ...filters, mobilizer_id: e.target.value })} className="mt-1 block w-full rounded border p-2"><option value="">All mobilizers</option>{mobilizers.filter((item) => (profile.role !== 'ward_coordinator' || item.ward_id === profile.home_ward_id) && (!filters.ward_id || item.ward_id === filters.ward_id)).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">From<input type="date" value={filters.date_from} onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="text-xs font-medium text-slate-600">To<input type="date" value={filters.date_to} onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="text-xs font-medium text-slate-600">Support level<select value={filters.support_level} onChange={(e) => setFilters({ ...filters, support_level: e.target.value })} className="mt-1 block w-full rounded border p-2"><option value="">All support levels</option>{supportLevels.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Verification<select value={filters.verification_status} onChange={(e) => setFilters({ ...filters, verification_status: e.target.value })} className="mt-1 block w-full rounded border p-2"><option value="">All statuses</option>{verificationStatuses.map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
      <label className="text-xs font-medium text-slate-600">Source<select value={filters.source} onChange={(e) => setFilters({ ...filters, source: e.target.value })} className="mt-1 block w-full rounded border p-2"><option value="">All sources</option>{['legacy', 'mobilizer', 'self_registered'].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}</select></label>
      <button className="self-end rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Apply filters</button>
    </form>
    {loading && !data && <div role="status" aria-label="Loading dashboard" className="grid animate-pulse gap-3 lg:grid-cols-2">{[0,1,2,3].map((item)=><div key={item} className="h-40 rounded-xl bg-white" />)}</div>}
    {error && <p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {data && <div className="grid gap-3 lg:grid-cols-2">
      <DashboardPanel title="Totals by ward" panelKey="wards" rows={data.wards} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Totals by polling station" panelKey="stations" rows={data.stations} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Support levels" panelKey="support" rows={data.support} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Ward × support level" panelKey="ward_support" rows={data.ward_support} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Verification funnel" panelKey="verification" rows={data.verification} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Priority polling stations" panelKey="priority_stations" rows={data.priority_stations} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Mobilizer quality" panelKey="mobilizer_quality" rows={data.mobilizer_quality} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Data completeness" panelKey="completeness" rows={completeness} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Top issues by ward" panelKey="top_issues" rows={data.top_issues} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Capture timeline" panelKey="timeline" rows={data.timeline} filters={appliedFilters} role={profile.role} />
      <DashboardPanel title="Community influencers by ward" panelKey="influencers" rows={data.influencers} filters={appliedFilters} role={profile.role} />
    </div>}
  </div>;
}
