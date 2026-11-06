import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client.ts';

type Row = Record<string, unknown>;
type Place = { id: string; name: string; parent?: string };
type ExportKind = 'supporters' | 'flags' | 'verification' | 'ward_summary' | 'station_summary' | 'mobilizer_performance' | 'network_contacts';
type Format = 'xlsx' | 'csv' | 'pdf';
const SAFE_ENTRY_COLUMNS = 'id,mobilizer_id,ward_filed_id,polling_centre_id,polling_station_id,name,phone_e164,id_masked,support_level,issues,needs_transport,has_pvc,source,consent_status,verification_status,captured_on,flags,notes';

function safeValue(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function csv(rows: Row[]) {
  if (!rows.length) return '';
  const fields = Object.keys(rows[0]);
  return [fields, ...rows.map((row) => fields.map((field) => safeValue(row[field])))].map((line) => line.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\r\n');
}

export function ExportCenter({ role }: { role: 'admin' | 'ward_coordinator' | 'mobilizer' }) {
  const [kind, setKind] = useState<ExportKind>('supporters');
  const [format, setFormat] = useState<Format>('xlsx');
  const [wards, setWards] = useState<Place[]>([]);
  const [centres, setCentres] = useState<Place[]>([]);
  const [stations, setStations] = useState<Place[]>([]);
  const [wardId, setWardId] = useState('');
  const [centreId, setCentreId] = useState('');
  const [stationId, setStationId] = useState('');
  const [verification, setVerification] = useState('');
  const [source, setSource] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    void Promise.all([
      supabase.from('wards').select('id,name').order('name'),
      supabase.from('polling_centres').select('id,name,ward_id').order('name'),
      supabase.from('polling_stations').select('id,station_name,polling_centre_id').order('station_name'),
    ]).then(([wardResult, centreResult, stationResult]) => {
      const loadError = wardResult.error || centreResult.error || stationResult.error;
      if (loadError) { setError(loadError.message); return; }
      setWards((wardResult.data || []).map(({ id, name }) => ({ id, name })));
      setCentres((centreResult.data || []).map(({ id, name, ward_id }) => ({ id, name, parent: ward_id })));
      setStations((stationResult.data || []).map(({ id, station_name, polling_centre_id }) => ({ id, name: station_name, parent: polling_centre_id })));
    });
  }, []);

  async function loadEntries() {
    if (!supabase) throw new Error('Database client is unavailable.');
    const all: Record<string, unknown>[] = [];
    for (let offset = 0; ; offset += 500) {
      let query = supabase.from('entries').select(SAFE_ENTRY_COLUMNS).order('captured_on', { ascending: false }).range(offset, offset + 499);
      if (wardId) query = query.eq('ward_filed_id', wardId);
      if (centreId) query = query.eq('polling_centre_id', centreId);
      if (stationId) query = query.eq('polling_station_id', stationId);
      if (verification) query = query.eq('verification_status', verification);
      if (source) query = query.eq('source', source);
      if (fromDate) query = query.gte('captured_on', `${fromDate}T00:00:00`);
      if (toDate) query = query.lte('captured_on', `${toDate}T23:59:59`);
      const { data, error: queryError } = await query;
      if (queryError) throw new Error(queryError.message);
      all.push(...(data || []));
      if (!data || data.length < 500) break;
    }
    return all;
  }

  async function collectRows(): Promise<Row[]> {
    if (!supabase) throw new Error('Database client is unavailable.');
    const entries = await loadEntries();
    const wardNames = new Map(wards.map((row) => [row.id, row.name]));
    const centreNames = new Map(centres.map((row) => [row.id, row.name]));
    const stationNames = new Map(stations.map((row) => [row.id, row.name]));
    const entriesAsRows = entries.map((entry) => ({
      'Captured on': entry.captured_on, Name: entry.name, 'National ID': entry.id_masked || 'Pending ID', Phone: entry.phone_e164 || '',
      Ward: wardNames.get(String(entry.ward_filed_id)) || '', Centre: centreNames.get(String(entry.polling_centre_id)) || '',
      Station: stationNames.get(String(entry.polling_station_id)) || '', 'Support level': entry.support_level,
      Verification: entry.verification_status, Source: entry.source, Flags: Array.isArray(entry.flags) ? entry.flags.join('; ') : '',
    }));
    if (kind === 'supporters') {
      const { data, error: settingError } = await supabase.from('settings').select('value').eq('key','exclude_legacy_unconfirmed_from_outreach').maybeSingle();
      if (settingError) throw new Error(settingError.message);
      const setting = data?.value as {enabled?:boolean}|undefined;
      return setting?.enabled === false ? entriesAsRows : entriesAsRows.filter((_,index) => !(entries[index].source === 'legacy' && entries[index].consent_status === 'legacy_unconfirmed'));
    }
    if (kind === 'verification') return entries.filter((entry) => entry.verification_status !== 'verified').map((entry) => ({
      Name: entry.name, 'National ID': entry.id_masked || 'Pending ID', Ward: wardNames.get(String(entry.ward_filed_id)) || '',
      Centre: centreNames.get(String(entry.polling_centre_id)) || '', Verification: entry.verification_status,
    }));
    if (kind === 'ward_summary' || kind === 'station_summary') {
      const groupKey = kind === 'ward_summary' ? 'ward_filed_id' : 'polling_station_id';
      const groupName = kind === 'ward_summary' ? 'Ward' : 'Polling station';
      const names = kind === 'ward_summary' ? wardNames : stationNames;
      const totals = new Map<string, { total: number; verified: number; flags: number }>();
      entries.forEach((entry) => {
        const id = String(entry[groupKey] || 'unassigned');
        const item = totals.get(id) || { total: 0, verified: 0, flags: 0 };
        item.total += 1; if (entry.verification_status === 'verified') item.verified += 1;
        if (Array.isArray(entry.flags) && entry.flags.length) item.flags += 1;
        totals.set(id, item);
      });
      return [...totals].map(([id, count]) => ({ [groupName]: names.get(id) || 'Unassigned', ...count }));
    }
    if (kind === 'mobilizer_performance') {
      const totals = new Map<string, { entries: number; flagged: number }>();
      entries.filter((entry) => entry.source !== 'legacy').forEach((entry) => {
        const id = String(entry.mobilizer_id || 'self_registered');
        const item = totals.get(id) || { entries: 0, flagged: 0 };
        item.entries += 1; if (Array.isArray(entry.flags) && entry.flags.length) item.flagged += 1;
        totals.set(id, item);
      });
      const profileIds = [...totals.keys()].filter((id) => id !== 'self_registered');
      const profileResult = profileIds.length ? await supabase.from('profiles').select('id,full_name').in('id', profileIds) : { data: [], error: null };
      if (profileResult.error) throw new Error(profileResult.error.message);
      const profiles = new Map((profileResult.data || []).map((profile) => [profile.id, profile.full_name]));
      return [...totals].map(([id, counts]) => ({ Mobilizer: profiles.get(id) || 'Self registered', ...counts }));
    }
    if (kind === 'flags') {
      let query = supabase.from('flag_events').select('id,entry_id,flag_code,severity,is_resolved,created_at,resolution_notes').order('created_at', { ascending: false }).limit(5000);
      if (entries.length) query = query.in('entry_id', entries.map((entry) => String(entry.id)));
      else query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      if (fromDate) query = query.gte('created_at', `${fromDate}T00:00:00`);
      if (toDate) query = query.lte('created_at', `${toDate}T23:59:59`);
      const { data, error: queryError } = await query;
      if (queryError) throw new Error(queryError.message);
      return (data || []).map((flag) => ({ 'Flag code': flag.flag_code, Severity: flag.severity, Resolved: flag.is_resolved, 'Entry ID': flag.entry_id, 'Created at': flag.created_at, Resolution: flag.resolution_notes }));
    }
    let contactQuery = supabase.from('network_contacts').select('type,name,phone_e164,denomination,community_unit,ward_id,polling_station_id,reach_status,notes,exclude_from_campaign_exports,created_at').eq('exclude_from_campaign_exports', false).limit(5000);
    if (wardId) contactQuery = contactQuery.eq('ward_id', wardId);
    if (stationId) contactQuery = contactQuery.eq('polling_station_id', stationId);
    else if (centreId) { const stationIds = stations.filter((station) => station.parent === centreId).map((station) => station.id); if (stationIds.length) contactQuery = contactQuery.in('polling_station_id', stationIds); else contactQuery = contactQuery.eq('id','00000000-0000-0000-0000-000000000000'); }
    if (fromDate) contactQuery = contactQuery.gte('created_at', `${fromDate}T00:00:00`);
    if (toDate) contactQuery = contactQuery.lte('created_at', `${toDate}T23:59:59`);
    const { data, error: queryError } = await contactQuery;
    if (queryError) throw new Error(queryError.message);
    return (data || []).map((contact) => ({ Type: contact.type, Name: contact.name, Phone: contact.phone_e164, Denomination: contact.denomination, 'Community unit': contact.community_unit, Ward: wardNames.get(String(contact.ward_id)) || '', Reach: contact.reach_status, Notes: contact.notes }));
  }

  async function exportNow() {
    setBusy(true); setError(''); setMessage('');
    try {
      const rows = await collectRows();
      const slug = `lurambi-${kind}-${new Date().toISOString().slice(0, 10)}`;
      const filters = { wardId: wardId || null, centreId: centreId || null, stationId: stationId || null, verification: verification || null, source: source || null, fromDate: fromDate || null, toDate: toDate || null };
      const { error: logError } = await supabase!.rpc('log_export', { p_export_type: kind, p_format: format, p_filters: filters, p_row_count: rows.length, p_file_name: `${slug}.${format}` });
      if (logError) throw new Error(`Export was not logged: ${logError.message}`);
      if (format === 'csv') {
        const blob = new Blob([csv(rows)], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `${slug}.csv`; link.click(); URL.revokeObjectURL(url);
      } else if (format === 'xlsx') {
        const XLSX = await import('xlsx');
        const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, safeValue(value)])));
        const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows), 'Export'); XLSX.writeFile(workbook, `${slug}.xlsx`);
      } else {
        const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
        const doc = new jsPDF({ orientation: 'landscape' });
        const fields = Object.keys(rows[0] || {});
        doc.setFontSize(14); doc.text('Lurambi Campaign Field Platform', 14, 14);
        doc.setFontSize(10); doc.text(`${kind.replaceAll('_', ' ')} · Filters: ${Object.entries(filters).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join(', ') || 'none'}`, 14, 21);
        autoTable(doc, { startY: 27, head: [fields], body: rows.map((row) => fields.map((field) => safeValue(row[field]))) });
        const pages = doc.getNumberOfPages();
        for (let page = 1; page <= pages; page++) { doc.setPage(page); doc.setFontSize(8); doc.text(`Page ${page} of ${pages}`, 280, 200, { align: 'right' }); }
        doc.save(`${slug}.pdf`);
      }
      setMessage(`Exported ${rows.length} rows.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Export failed.'); }
    finally { setBusy(false); }
  }

  const visibleKinds: ExportKind[] = role === 'admin'
    ? ['supporters', 'flags', 'verification', 'ward_summary', 'station_summary', 'mobilizer_performance', 'network_contacts']
    : role === 'ward_coordinator' ? ['supporters', 'verification', 'ward_summary', 'station_summary', 'network_contacts'] : ['supporters', 'verification'];

  return <section className="space-y-4">
    <div><h2 className="text-xl font-bold text-slate-900">Exports</h2><p className="mt-1 text-sm text-slate-600">Exports use your database permissions and are logged.</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-3">
      <label className="text-sm">Data<select value={kind} onChange={(event) => setKind(event.target.value as ExportKind)} className="mt-1 block w-full rounded border p-2">{visibleKinds.map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
      <label className="text-sm">Format<select value={format} onChange={(event) => setFormat(event.target.value as Format)} className="mt-1 block w-full rounded border p-2"><option value="xlsx">Excel</option><option value="csv">CSV</option><option value="pdf">PDF</option></select></label>
      <label className="text-sm">Ward<select value={wardId} onChange={(event) => { setWardId(event.target.value); setCentreId(''); setStationId(''); }} className="mt-1 block w-full rounded border p-2"><option value="">All permitted wards</option>{wards.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm">Centre<select value={centreId} onChange={(event) => { setCentreId(event.target.value); setStationId(''); }} className="mt-1 block w-full rounded border p-2"><option value="">All centres</option>{centres.filter((item) => !wardId || item.parent === wardId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label className="text-sm">Station<select value={stationId} onChange={(event) => setStationId(event.target.value)} className="mt-1 block w-full rounded border p-2"><option value="">All stations</option>{stations.filter((item) => !centreId || item.parent === centreId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      {kind !== 'network_contacts' && <label className="text-sm">Verification<select value={verification} onChange={(event) => setVerification(event.target.value)} className="mt-1 block w-full rounded border p-2"><option value="">All statuses</option>{['unverified','verified','not_found','wrong_constituency','pending_id'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>}
      {kind !== 'network_contacts' && <label className="text-sm">Source<select value={source} onChange={(event) => setSource(event.target.value)} className="mt-1 block w-full rounded border p-2"><option value="">All sources</option>{['mobilizer','legacy','self_registered'].map((item) => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>}
      <label className="text-sm">From<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
      <label className="text-sm">To<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="mt-1 block w-full rounded border p-2" /></label>
      <button disabled={busy} onClick={() => void exportNow()} className="self-end rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Preparing…' : 'Create export'}</button>
    </div>
  </section>;
}
