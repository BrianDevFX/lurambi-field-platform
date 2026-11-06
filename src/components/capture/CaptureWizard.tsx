import { FormEvent, useEffect, useMemo, useState } from 'react';
import { normaliseKenyanPhone } from '../../lib/normalisation/phone.ts';
import { supabase } from '../../lib/supabase/client.ts';
import { Entry, Profile, SupportLevel } from '../../types/index.ts';

interface PlaceOption { id: string; name: string; ward_id?: string; polling_centre_id?: string; station_name?: string; }
interface ConsentPolicy { enabled?: boolean; version?: string; text?: string; }
interface CaptureWizardProps {
  profile: Profile;
  onEntryAdded: (entry: Entry) => void;
}

const supportLevels: SupportLevel[] = ['strong_supporter', 'leaning', 'undecided', 'opposed', 'not_reached', 'not_assessed'];

export function CaptureWizard({ profile, onEntryAdded }: CaptureWizardProps) {
  const [wards, setWards] = useState<PlaceOption[]>([]);
  const [centres, setCentres] = useState<PlaceOption[]>([]);
  const [stations, setStations] = useState<PlaceOption[]>([]);
  const [consent, setConsent] = useState<ConsentPolicy | null>(null);
  const [loadingPlaces, setLoadingPlaces] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Record<string, unknown>[]>([]);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [wardId, setWardId] = useState(profile.home_ward_id || '');
  const [centreId, setCentreId] = useState('');
  const [stationId, setStationId] = useState('');
  const [support, setSupport] = useState<SupportLevel>('not_assessed');
  const [issues, setIssues] = useState<string[]>([]);
  const [otherIssue, setOtherIssue] = useState('');
  const [issueCategories, setIssueCategories] = useState(['Transport', 'Healthcare', 'Education', 'Water', 'Roads', 'Jobs']);
  const [needsTransport, setNeedsTransport] = useState(false);
  const [hasPvc, setHasPvc] = useState(false);
  const [notes, setNotes] = useState('');
  const [consentChecked, setConsentChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [blockedMatch, setBlockedMatch] = useState<Record<string, unknown> | null>(null);
  const [saved, setSaved] = useState<Entry | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    async function loadOptions() {
      setLoadingPlaces(true);
      const [wardResult, centreResult, stationResult, consentResult, issueResult] = await Promise.all([
        supabase!.from('wards').select('id,name').order('name'),
        supabase!.from('polling_centres').select('id,name,ward_id').order('name'),
        supabase!.from('polling_stations').select('id,station_name,ward_id,polling_centre_id').order('station_number'),
        supabase!.from('settings').select('value').eq('key', 'consent_policy').maybeSingle(),
        supabase!.from('settings').select('value').eq('key', 'issue_categories').maybeSingle(),
      ]);
      if (!active) return;
      const queryError = wardResult.error || centreResult.error || stationResult.error || consentResult.error || issueResult.error;
      if (queryError) setLoadError(queryError.message);
      else {
        setWards(wardResult.data || []);
        setCentres((centreResult.data || []).map((row) => ({ ...row, name: row.name })));
        setStations((stationResult.data || []).map((row) => ({ ...row, name: row.station_name })));
        setConsent((consentResult.data?.value || null) as ConsentPolicy | null);
        if (Array.isArray(issueResult.data?.value)) setIssueCategories(issueResult.data.value.filter((item): item is string => typeof item === 'string'));
        if (!wardId && wardResult.data?.[0]) setWardId(wardResult.data[0].id);
      }
      setLoadingPlaces(false);
    }
    void loadOptions();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!supabase || search.trim().length < 3) {
      setResults([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      const { data, error: queryError } = await supabase!.rpc('search_entries', { p_query: search.trim(), p_ward_id: null });
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setResults((data?.results || []) as Record<string, unknown>[]);
      setSearching(false);
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [search]);

  const availableStations = useMemo(() => stations.filter((station) => station.polling_centre_id === centreId), [stations, centreId]);
  const phoneResult = phone ? normaliseKenyanPhone(phone) : null;
  const consentReady = consent?.enabled === true && Boolean(consent.version && consent.text?.trim());

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !consentReady || !consentChecked) return;
    setSaving(true);
    setError('');
    setBlockedMatch(null);
    const { data, error: rpcError } = await supabase.rpc('submit_entry', {
      p_client_request_id: crypto.randomUUID(),
      p_name: name.trim(),
      p_phone: phone.trim() || null,
      p_national_id: nationalId.trim() || null,
      p_ward_filed_id: wardId,
      p_polling_centre_id: centreId || null,
      p_polling_station_id: stationId || null,
      p_polling_centre_label: null,
      p_polling_station_label: null,
      p_support_level: support,
      p_issues: [...issues, ...(otherIssue.trim() ? [otherIssue.trim()] : [])],
      p_needs_transport: needsTransport,
      p_has_pvc: hasPvc,
      p_notes: notes.trim() || null,
      p_consent: true,
      p_consent_text_version: consent!.version,
    });
    setNationalId('');
    setSaving(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (data?.blocked) {
      setBlockedMatch(data.matched || null);
      setError('This entry matches an existing record and was not saved.');
      return;
    }
    const selectedWard = wards.find((ward) => ward.id === wardId);
    const selectedCentre = centres.find((centre) => centre.id === centreId);
    const selectedStation = stations.find((station) => station.id === stationId);
    const entry: Entry = {
      id: data.id,
      mobilizer_id: profile.id,
      mobilizer_name: profile.full_name,
      ward_filed_id: wardId,
      ward_name: selectedWard?.name || '',
      polling_centre_id: centreId || undefined,
      polling_centre_name: selectedCentre?.name,
      polling_station_id: stationId || undefined,
      polling_station_name: selectedStation?.name,
      name: name.trim(),
      phone_e164: phoneResult?.isValid ? phoneResult.phone_e164 || undefined : undefined,
      id_masked: data.id_masked || undefined,
      support_level: support,
      issues: [...issues, ...(otherIssue.trim() ? [otherIssue.trim()] : [])],
      needs_transport: needsTransport,
      has_pvc: hasPvc,
      notes: notes.trim() || undefined,
      consent_at: new Date().toISOString(),
      consent_text_version: consent!.version,
      consent_status: 'given',
      source: 'mobilizer',
      verification_status: data.verification_status,
      captured_on: new Date().toISOString(),
      flags: data.flags || [],
    };
    setSaved(entry);
    onEntryAdded(entry);
    setName(''); setPhone(''); setNotes(''); setIssues([]); setOtherIssue(''); setConsentChecked(false);
    setNeedsTransport(false); setHasPvc(false);
  }

  if (loadingPlaces) return <p className="rounded-xl bg-white p-5 text-sm text-slate-600">Loading wards and polling places…</p>;
  if (loadError) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Could not load capture data: {loadError}</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-slate-900">Search first</h2>
        <p className="mt-1 text-sm text-slate-600">Search your entries by name, phone, or full ID.</p>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="At least 3 characters or full ID"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
        {searching && <p className="mt-2 text-xs text-slate-500">Searching…</p>}
        {results.length > 0 && <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {results.map((result, index) => <li key={`${result.id}-${index}`} className="p-3 text-sm">
            <strong className="text-slate-900">{String(result.name || '')}</strong>
            <div className="mt-1 text-xs text-slate-600">{String(result.ward_name || '')} · {String(result.id_masked || 'Pending ID')} · {String(result.phone_e164 || 'No phone')}</div>
          </li>)}
        </ul>}
        {search.length >= 3 && !searching && results.length === 0 && <p className="mt-2 text-xs text-slate-500">No matching entries in your list.</p>}
      </section>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Add supporter</h2>
          <p className="mt-1 text-sm text-slate-600">Entries are saved to the database and cannot be edited by mobilizers.</p>
        </div>
        <label className="block text-sm font-medium text-slate-700">Name
          <input required minLength={2} maxLength={160} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Phone
            <input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="07…" />
            {phoneResult && !phoneResult.isValid && <span className="mt-1 block text-xs text-amber-700">This phone will be flagged as invalid.</span>}
          </label>
          <label className="block text-sm font-medium text-slate-700">National ID
            <input inputMode="numeric" autoComplete="off" value={nationalId} onChange={(event) => setNationalId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="Leave blank if pending" />
            <span className="mt-1 block text-xs text-slate-500">Sent directly to the database. Never stored in the browser or offline queue.</span>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">Filed ward
            <select required value={wardId} onChange={(event) => setWardId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5">
              <option value="">Select ward</option>{wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Polling centre
            <select value={centreId} onChange={(event) => { setCentreId(event.target.value); setStationId(''); }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5">
              <option value="">Select centre</option>{centres.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Polling station
            <select value={stationId} onChange={(event) => setStationId(event.target.value)} disabled={!centreId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-2 py-2.5">
              <option value="">Select station</option>{availableStations.map((station) => <option key={station.id} value={station.id}>{station.name}</option>)}
            </select>
          </label>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Support level
            <select value={support} onChange={(event) => setSupport(event.target.value as SupportLevel)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
              {supportLevels.map((level) => <option key={level} value={level}>{level.replaceAll('_', ' ')}</option>)}
            </select>
          </label>
          <fieldset className="space-y-2"><legend className="text-sm font-medium text-slate-700">Issues</legend><div className="flex flex-wrap gap-3">{issueCategories.map((category) => <label key={category} className="flex items-center gap-1.5 text-sm text-slate-700"><input type="checkbox" checked={issues.includes(category)} onChange={(event) => setIssues((current) => event.target.checked ? [...current, category] : current.filter((item) => item !== category))} />{category}</label>)}</div><label className="block text-xs text-slate-600">Other<input value={otherIssue} onChange={(event) => setOtherIssue(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label></fieldset>
        </div>
        <div className="flex flex-wrap gap-5 text-sm text-slate-700">
          <label className="flex items-center gap-2"><input type="checkbox" checked={needsTransport} onChange={(event) => setNeedsTransport(event.target.checked)} />Needs transport</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={hasPvc} onChange={(event) => setHasPvc(event.target.checked)} />Has PVC</label>
        </div>
        <label className="block text-sm font-medium text-slate-700">Notes
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          {consentReady ? <>
            <p className="text-sm leading-5 text-slate-700">{consent!.text}</p>
            <label className="mt-3 flex items-start gap-2 text-sm text-slate-800">
              <input required type="checkbox" checked={consentChecked} onChange={(event) => setConsentChecked(event.target.checked)} className="mt-1" />
              <span>I confirm the supporter gave consent. (Text version {consent!.version})</span>
            </label>
          </> : <p className="text-sm text-amber-800">Capture is disabled until approved consent wording and version are configured in settings.</p>}
        </div>
        {error && <div role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
          <p>{error}</p>
          {blockedMatch && <p className="mt-2">Match: {String(blockedMatch.name || '')} · {String(blockedMatch.id_masked || 'ID not recorded')}</p>}
        </div>}
        {saved && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">Saved. {saved.id_masked ? `ID ${saved.id_masked}. ` : ''}Flags: {saved.flags.length ? saved.flags.join(', ') : 'none'}.</p>}
        <button disabled={saving || !consentReady || !consentChecked || !wardId} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
          {saving ? 'Saving…' : 'Save entry'}
        </button>
      </form>
    </div>
  );
}
