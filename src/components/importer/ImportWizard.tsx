import { ChangeEvent, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase/client.ts';

type ImportKind = 'entries' | 'network_contacts' | 'places' | 'skip';
type Sheet = { name: string; headers: string[]; rows: Record<string, unknown>[]; kind: ImportKind; mapping: Record<string, string> };
type ReportRow = { sheet: string; row: number; status: string; reason: string };
type PlaceType = 'ward' | 'polling_centre' | 'polling_station';
type AliasCandidate = { key: string; type: PlaceType; raw: string };

const FIELD_MAP: Record<Exclude<ImportKind, 'skip'>, string[]> = {
  entries: ['name', 'national_id', 'phone', 'ward', 'polling_centre', 'polling_station', 'support_level', 'captured_on', 'issues', 'needs_transport', 'has_pvc', 'notes'],
  network_contacts: ['type', 'name', 'phone', 'national_id', 'ward', 'polling_station', 'denomination', 'community_unit', 'sub_county', 'reach_status', 'notes', 'exclude_from_campaign_exports'],
  places: ['type', 'name', 'code', 'ward', 'polling_centre', 'station_number', 'registered_voters', 'total_registered_voters', 'county_name', 'constituency_name'],
};
const aliases: Record<string, string[]> = {
  name: ['name', 'full name', 'supporter'], national_id: ['national id', 'id no', 'id number', 'id'],
  phone: ['phone', 'telephone', 'mobile', 'tel'], ward: ['ward'], polling_centre: ['polling centre', 'polling center', 'centre', 'center', 'polling place'],
  polling_station: ['polling station', 'station'], support_level: ['support level', 'support'], captured_on: ['captured on', 'date', 'capture date'],
  denomination: ['denomination', 'church'], community_unit: ['community unit', 'cu'], type: ['type', 'contact type'],
  polling_station_id: ['polling station id'], reach_status: ['reach status'], notes: ['notes', 'comment'],
  exclude_from_campaign_exports: ['exclude from exports'], code: ['code'], station_number: ['station number'],
  registered_voters: ['registered voters'], total_registered_voters: ['total registered voters'], county_name: ['county'], constituency_name: ['constituency'],
  needs_transport: ['needs transport', 'transport'], has_pvc: ['has pvc', 'pvc'], issues: ['issues'], sub_county: ['sub county'],
};

function inferKind(sheetName: string, headers: string[]): ImportKind {
  const title = sheetName.toLowerCase();
  if (title.includes('pastor') || title.includes('chp') || title.includes('contact')) return 'network_contacts';
  if (title.includes('place') || title.includes('station list') || title.includes('ward list')) return 'places';
  if (headers.some((header) => /name|phone|ward/i.test(header))) return 'entries';
  return 'skip';
}

function initialMapping(kind: ImportKind, headers: string[]) {
  if (kind === 'skip') return {};
  const result: Record<string, string> = {};
  for (const field of FIELD_MAP[kind]) {
    const candidates = aliases[field] || [field.replaceAll('_', ' ')];
    const match = headers.find((header) => candidates.some((candidate) => header.toLowerCase().includes(candidate)));
    if (match) result[field] = match;
  }
  return result;
}

function cellText(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value == null ? '' : String(value).trim();
}

function safeCell(value: unknown): string {
  const text = cellText(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function ImportWizard() {
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [report, setReport] = useState<ReportRow[]>([]);
  const [dryRunReport, setDryRunReport] = useState<ReportRow[] | null>(null);
  const [phase, setPhase] = useState<'idle' | 'preview' | 'committed'>('idle');
  const [placeOptions, setPlaceOptions] = useState<Record<PlaceType, { id: string; name: string }[]>>({ ward: [], polling_centre: [], polling_station: [] });
  const [aliasTargets, setAliasTargets] = useState<Record<string, string>>({});
  const [aliasReason, setAliasReason] = useState('');
  const [aliasesSaved, setAliasesSaved] = useState(false);

  const rowsBySheet = useMemo(() => sheets.map((sheet) => {
    if (sheet.kind === 'skip') return [];
    return sheet.rows.map((row) => Object.fromEntries(Object.entries(sheet.mapping)
      .filter(([, header]) => Boolean(header)).map(([field, header]) => [field, cellText(row[header])])))
      .filter((row) => Object.values(row).some(Boolean));
  }), [sheets]);
  const unmappedAliases = useMemo(() => {
    const candidates = new Map<string, AliasCandidate>();
    for (const item of dryRunReport || []) {
      if (item.status !== 'unmapped') continue;
      const sheetIndex = sheets.findIndex((sheet) => sheet.name === item.sheet);
      if (sheetIndex < 0) continue;
      const row = rowsBySheet[sheetIndex]?.[item.row - 2];
      if (!row) continue;
      for (const [field, type] of [['ward', 'ward'], ['polling_centre', 'polling_centre'], ['polling_station', 'polling_station']] as const) {
        const raw = String(row[field] || '').trim();
        if (raw) candidates.set(`${type}:${raw.toLowerCase()}`, { key: `${type}:${raw.toLowerCase()}`, type, raw });
      }
    }
    return [...candidates.values()];
  }, [dryRunReport, rowsBySheet, sheets]);

  async function loadPlaceOptions() {
    if (!supabase) return;
    const [wards, centres, stations] = await Promise.all([
      supabase.from('wards').select('id,name').order('name'),
      supabase.from('polling_centres').select('id,name').order('name'),
      supabase.from('polling_stations').select('id,station_name').order('station_name'),
    ]);
    const loadError = wards.error || centres.error || stations.error;
    if (loadError) { setError(loadError.message); return; }
    setPlaceOptions({ ward: wards.data || [], polling_centre: centres.data || [], polling_station: (stations.data || []).map(({ id, station_name }) => ({ id, name: station_name })) });
  }

  async function saveAliases() {
    if (!supabase || !aliasReason.trim()) return;
    setBusy(true); setError('');
    for (const candidate of unmappedAliases) {
      const targetId = aliasTargets[candidate.key];
      if (!targetId) continue;
      const { error: saveError } = await supabase.rpc('save_place_alias', {
        p_type: candidate.type, p_raw_alias: candidate.raw, p_target_id: targetId, p_confidence: 1, p_reason: aliasReason.trim(),
      });
      if (saveError) { setError(saveError.message); setBusy(false); return; }
    }
    setAliasesSaved(true); setBusy(false);
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setError(''); setReport([]); setDryRunReport(null); setPhase('idle'); setAliasesSaved(false);
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) { setError('Choose an .xlsx or .csv file.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File must be 5 MB or smaller.'); return; }
    try {
      const XLSX = await import('xlsx');
      const bytes = await file.arrayBuffer();
      const workbook = XLSX.read(bytes, { type: 'array', cellDates: true });
      const parsed: Sheet[] = [];
      let totalRows = 0;
      for (const sheetName of workbook.SheetNames) {
        const matrix = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '' });
        const headerIndex = matrix.slice(0, 10).findIndex((row) => row.some((cell) => /name|phone|ward|station|type/i.test(cellText(cell))));
        if (headerIndex < 0) { parsed.push({ name: sheetName, headers: [], rows: [], kind: 'skip', mapping: {} }); continue; }
        const headers = matrix[headerIndex].map(cellText);
        const rows = matrix.slice(headerIndex + 1).filter((row) => row.some((cell) => cellText(cell) !== '')).map((values) =>
          Object.fromEntries(headers.map((header, index) => [header, values[index]])));
        totalRows += rows.length;
        const kind = inferKind(sheetName, headers);
        parsed.push({ name: sheetName, headers, rows, kind, mapping: initialMapping(kind, headers) });
      }
      if (totalRows > 20_000) { setError('File must contain 20,000 rows or fewer.'); return; }
      setFileName(file.name); setSheets(parsed); setPhase('preview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this workbook.');
    }
  }

  function setKind(index: number, kind: ImportKind) {
    setSheets((current) => current.map((sheet, i) => i === index ? { ...sheet, kind, mapping: initialMapping(kind, sheet.headers) } : sheet));
  }

  function setMapping(sheetIndex: number, field: string, header: string) {
    setSheets((current) => current.map((sheet, i) => i === sheetIndex ? { ...sheet, mapping: { ...sheet.mapping, [field]: header } } : sheet));
  }

  async function runImport(dryRun: boolean) {
    if (!supabase || !sheets.length) return;
    setBusy(true); setError(''); setProgress(0);
    const newReport: ReportRow[] = [];
    try {
      const XLSX = await import('xlsx');
      for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
        const sheet = sheets[sheetIndex];
        if (sheet.kind === 'skip') continue;
        let allRows = rowsBySheet[sheetIndex] || [];
        if (sheet.kind === 'places') {
          const title = sheet.name.toLowerCase();
          const defaultType = title.includes('ward') ? 'ward' : title.includes('centre') || title.includes('center') ? 'polling_centre' : title.includes('station') ? 'polling_station' : '';
          if (defaultType) allRows = allRows.map((row) => ({ ...row, type: row.type || defaultType }));
          const order = { ward: 0, polling_centre: 1, polling_station: 2 } as Record<string, number>;
          allRows = [...allRows].sort((a, b) => (order[String(a.type).toLowerCase()] ?? 3) - (order[String(b.type).toLowerCase()] ?? 3));
        }
        if (sheet.kind === 'network_contacts') {
          const title = sheet.name.toLowerCase();
          const defaultType = title.includes('pastor') ? 'pastor' : title.includes('chp') ? 'chp' : '';
          if (defaultType) allRows = allRows.map((row) => ({ ...row, type: row.type || defaultType }));
        }
        if (!allRows.length) continue;
        if (sheet.kind === 'network_contacts') {
          const { data: stations, error: stationsError } = await supabase.from('polling_stations').select('id,station_name');
          if (stationsError) throw new Error(`Could not load polling stations: ${stationsError.message}`);
          const byName = new Map((stations || []).map((station) => [station.station_name.trim().toLowerCase(), station.id]));
          allRows = allRows.map((row) => ({ ...row, polling_station_id: byName.get(String(row.polling_station || '').trim().toLowerCase()) || '' }));
        }
        const importId = crypto.randomUUID();
        const rpc = sheet.kind === 'entries' ? 'import_entries_batch' : sheet.kind === 'network_contacts' ? 'import_contacts_batch' : 'import_places_batch';
        if (dryRun) {
          for (let offset = 0; offset < allRows.length; offset += 500) {
            const batch = allRows.slice(offset, offset + 500);
            const { data, error: previewError } = await supabase.rpc('preview_import_rows', { p_kind: sheet.kind, p_rows: batch });
            if (previewError) throw new Error(`${sheet.name}: ${previewError.message}`);
            const previewRows = (data as { rows?: { status: string; reason: string }[] }).rows || [];
            previewRows.forEach((row, i) => newReport.push({ sheet: sheet.name, row: offset + i + 2, status: row.status, reason: row.reason }));
            setProgress(Math.round(((sheetIndex + Math.min(offset + batch.length, allRows.length) / allRows.length) / sheets.length) * 100));
          }
          continue;
        }
        for (let offset = 0; offset < allRows.length; offset += 500) {
          const batch = allRows.slice(offset, offset + 500);
          const { data, error: rpcError } = await supabase.rpc(rpc, {
            p_import_id: importId, p_file_name: fileName, p_rows: batch, p_dry_run: dryRun,
          });
          if (rpcError) throw new Error(`${sheet.name}: ${rpcError.message}`);
          if (sheet.kind === 'entries' && !dryRun && /not\s*found/i.test(sheet.name)) {
            const { error: statusError } = await supabase.rpc('set_import_verification_status', {
              p_import_id: importId,
              p_rows: batch.map((row) => ({ row, verification_status: 'not_found' })),
            });
            if (statusError) throw new Error(`${sheet.name}: ${statusError.message}`);
          }
          void data;
          setProgress(Math.round(((sheetIndex + (offset + batch.length) / allRows.length) / sheets.length) * 100));
        }
      }
      if (dryRun) { setReport(newReport); setDryRunReport(newReport); setPhase('preview'); setProgress(0); }
      else { setPhase('committed'); setProgress(100); }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Import failed.');
    } finally { setBusy(false); }
  }

  async function downloadReport() {
    if (!supabase) return;
    const filename = `${fileName.replace(/\.[^.]+$/, '')}-import-report.xlsx`;
    const { error: logError } = await supabase.rpc('log_export', { p_export_type: 'import_report', p_format: 'xlsx', p_filters: {}, p_row_count: (dryRunReport || report).length, p_file_name: filename });
    if (logError) { setError(logError.message); return; }
    const XLSX = await import('xlsx');
    const rows = (dryRunReport || report).map((row) => ({ Sheet: safeCell(row.sheet), Row: row.row, Status: safeCell(row.status), Reason: safeCell(row.reason) }));
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(rows), 'Import report');
    XLSX.writeFile(book, filename);
  }

  async function downloadTemplate() {
    if (!supabase) return;
    const filename = 'lurambi-import-template.xlsx';
    const { error: logError } = await supabase.rpc('log_export', { p_export_type: 'import_template', p_format: 'xlsx', p_filters: {}, p_row_count: 0, p_file_name: filename });
    if (logError) { setError(logError.message); return; }
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['name','national_id','phone','ward','polling_centre','polling_station','support_level','captured_on','issues','needs_transport','has_pvc','notes']]), 'Entries');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['type','name','phone','national_id','ward','polling_station','denomination','community_unit','reach_status','notes','exclude_from_campaign_exports']]), 'Network contacts');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['type','name','code','ward','polling_centre','station_number','registered_voters','total_registered_voters','county_name','constituency_name']]), 'Places');
    XLSX.writeFile(workbook, filename);
  }

  const counts = (dryRunReport || report).reduce<Record<string, number>>((result, row) => { result[row.status] = (result[row.status] || 0) + 1; return result; }, {});

  return <section className="space-y-4">
    <div><h2 className="text-xl font-bold text-slate-900">Import data</h2><p className="mt-1 text-sm text-slate-600">XLSX or CSV, up to 5 MB and 20,000 rows.</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
      <label className="block text-sm font-medium text-slate-700">Select workbook
        <input type="file" accept=".xlsx,.csv" onChange={(event) => void readFile(event)} className="mt-2 block w-full text-sm" />
      </label>
      {sheets.map((sheet, index) => <div key={sheet.name} className="rounded-lg border border-slate-200 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong>{sheet.name}</strong><select value={sheet.kind} onChange={(event) => setKind(index, event.target.value as ImportKind)} className="rounded-md border border-slate-300 p-2 text-sm">
          <option value="entries">Entries</option><option value="network_contacts">Network contacts</option><option value="places">Places</option><option value="skip">Skip sheet</option>
        </select></div>
        <p className="mt-1 text-xs text-slate-500">{sheet.rows.length} rows · header columns: {sheet.headers.join(', ') || 'none detected'}</p>
        {sheet.kind !== 'skip' && <div className="mt-3 space-y-2"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{FIELD_MAP[sheet.kind].map((field) => <label key={field} className="text-xs text-slate-600">{field}<select value={sheet.mapping[field] || ''} onChange={(event) => setMapping(index, field, event.target.value)} className="mt-1 block w-full rounded border border-slate-300 p-1.5"><option value="">Not mapped</option>{sheet.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><div className="overflow-x-auto"><table className="min-w-full text-left text-xs"><thead><tr>{FIELD_MAP[sheet.kind].map((field) => <th key={field} className="px-2 py-1">{field}</th>)}</tr></thead><tbody>{rowsBySheet[index]?.slice(0, 20).map((row, rowIndex) => <tr key={rowIndex}>{FIELD_MAP[sheet.kind as Exclude<ImportKind, 'skip'>].map((field) => <td key={field} className="max-w-40 truncate px-2 py-1">{field.includes('id') ? (row[field] ? '••••' : '') : row[field]}</td>)}</tr>)}</tbody></table></div></div>}
      </div>)}
      {sheets.length > 0 && <div className="flex flex-wrap gap-2">
        <button disabled={busy} onClick={() => void runImport(true)} className="rounded-lg border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">{busy ? 'Working…' : 'Dry run'}</button>
        <button disabled={busy || !dryRunReport} onClick={() => void runImport(false)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Commit import</button>
        <button disabled={busy || !dryRunReport} onClick={() => void downloadReport()} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Download report</button>
      </div>}
      <button onClick={() => void downloadTemplate()} className="text-sm font-semibold text-emerald-800 underline">Download import templates</button>
      {(busy || phase === 'committed') && <div><div className="h-2 overflow-hidden rounded bg-slate-200"><div className="h-full bg-emerald-600" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-slate-600">{progress}% {phase === 'committed' ? 'complete' : 'processed'}</p></div>}
      {dryRunReport && <div className="flex flex-wrap gap-3 text-sm">{['imported', 'merged', 'rejected', 'flagged', 'unmapped'].map((status) => <span key={status} className="rounded bg-slate-100 px-2 py-1">{status}: {counts[status] || 0}</span>)}</div>}
      {dryRunReport && unmappedAliases.length > 0 && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <div><h3 className="font-semibold text-slate-900">Needs mapping</h3><p className="text-xs text-slate-700">Choose the canonical place for each unmatched label, save aliases, then run the dry run again.</p></div>
        {placeOptions.ward.length + placeOptions.polling_centre.length + placeOptions.polling_station.length === 0 ? <button onClick={() => void loadPlaceOptions()} className="rounded border border-amber-300 px-3 py-2 text-xs font-semibold">Load places</button> : null}
        <div className="space-y-2">{unmappedAliases.map((candidate) => <label key={candidate.key} className="grid gap-1 text-xs sm:grid-cols-[1fr_2fr] sm:items-center"><span>{candidate.type.replaceAll('_', ' ')}: <strong>{candidate.raw}</strong></span><select value={aliasTargets[candidate.key] || ''} onChange={(event) => setAliasTargets((current) => ({ ...current, [candidate.key]: event.target.value }))} className="rounded border border-slate-300 bg-white p-2"><option value="">Select canonical place</option>{placeOptions[candidate.type].map((place) => <option key={place.id} value={place.id}>{place.name}</option>)}</select></label>)}</div>
        <label className="block text-xs">Reason (required)<input value={aliasReason} onChange={(event) => setAliasReason(event.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white p-2" /></label>
        <div className="flex flex-wrap gap-2"><button disabled={busy || !aliasReason.trim() || !unmappedAliases.some((candidate) => aliasTargets[candidate.key])} onClick={() => void saveAliases()} className="rounded bg-amber-800 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save mappings'}</button>{aliasesSaved && <button disabled={busy} onClick={() => void runImport(true)} className="rounded border border-amber-700 px-3 py-2 text-xs font-semibold">Re-run dry run</button>}</div>
      </div>}
    </div>
  </section>;
}
