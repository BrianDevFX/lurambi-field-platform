import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { normaliseKenyanPhone } from '../../lib/normalisation/phone.ts';
import { cacheCaptureOptions, createClientRequestId, enqueueOfflineEntry, getCachedCaptureOptions, getQueuedEntries, OfflineQueuedEntry, removeQueuedEntry, updateQueuedEntry } from '../../lib/offline/offlineQueue.ts';
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
  const [queuedEntries, setQueuedEntries] = useState<OfflineQueuedEntry[]>([]);
  const [queueError, setQueueError] = useState('');
  const [queueSuccess, setQueueSuccess] = useState('');
  const [syncingQueue, setSyncingQueue] = useState(false);
  const requestId = useRef<string | null>(null);
  const requestFingerprint = useRef<string | null>(null);
  const syncInProgress = useRef(false);

  const refreshQueue = useCallback(async () => {
    try {
      const items = await getQueuedEntries();
      setQueuedEntries(items.filter((item) => item.mobilizerId === profile.id).sort((a, b) => a.capturedOn.localeCompare(b.capturedOn)));
      setQueueError('');
    } catch {
      setQueueError('Offline drafts could not be loaded on this device.');
    }
  }, [profile.id]);

  const syncQueue = useCallback(async () => {
    if (!supabase || !navigator.onLine || syncInProgress.current) return;
    syncInProgress.current = true;
    setSyncingQueue(true);
    try {
      const items = await getQueuedEntries();
      for (const stored of items) {
        if (stored.mobilizerId !== profile.id || (stored.status !== 'pending' && stored.status !== 'error' && stored.status !== 'syncing')) continue;
        const item = { ...stored, status: 'syncing' as const, lastError: undefined };
        await updateQueuedEntry(item);
        await refreshQueue();
        const { data, error: rpcError } = await supabase.rpc('submit_entry', {
          p_client_request_id: item.clientRequestId,
          p_name: item.name,
          p_phone: item.phone,
          p_national_id: null,
          p_ward_filed_id: item.wardFiledId,
          p_polling_centre_id: item.pollingCentreId,
          p_polling_station_id: item.pollingStationId,
          p_polling_centre_label: null,
          p_polling_station_label: null,
          p_support_level: item.supportLevel,
          p_issues: item.issues,
          p_needs_transport: item.needsTransport,
          p_has_pvc: item.hasPvc,
          p_notes: item.notes || null,
          p_consent: true,
          p_consent_text_version: item.consentTextVersion,
        });
        if (rpcError) {
          await updateQueuedEntry({ ...item, status: 'error', retryCount: item.retryCount + 1, lastError: 'Sync failed. Check your connection or account and retry.' });
        } else if (data?.blocked) {
          await updateQueuedEntry({ ...item, status: 'duplicate-blocked', resultFlags: ['DUPLICATE'], resultIdMasked: data.matched?.id_masked || null });
        } else if (data?.saved) {
          await updateQueuedEntry({ ...item, status: 'saved', resultFlags: data.flags || [], resultIdMasked: data.id_masked || null });
          const phoneResult = item.phone ? normaliseKenyanPhone(item.phone) : null;
          onEntryAdded({
            id: data.id, mobilizer_id: profile.id, mobilizer_name: profile.full_name,
            ward_filed_id: item.wardFiledId, ward_name: item.wardName,
            polling_centre_id: item.pollingCentreId || undefined, polling_centre_name: item.pollingCentreName || undefined,
            polling_station_id: item.pollingStationId || undefined, polling_station_name: item.pollingStationName || undefined,
            name: item.name, phone_e164: phoneResult?.isValid ? phoneResult.phone_e164 || undefined : undefined,
            id_masked: data.id_masked || undefined, support_level: item.supportLevel as SupportLevel,
            issues: item.issues, needs_transport: item.needsTransport, has_pvc: item.hasPvc,
            notes: item.notes || undefined, consent_at: item.consentAt, consent_text_version: item.consentTextVersion,
            consent_status: 'given', source: 'mobilizer', verification_status: 'pending_id', captured_on: item.capturedOn,
            flags: data.flags || [],
          });
        } else {
          await updateQueuedEntry({ ...item, status: 'error', retryCount: item.retryCount + 1, lastError: 'No server confirmation was received. The draft remains on this device.' });
        }
        await refreshQueue();
        if (!navigator.onLine) break;
      }
    } catch {
      setQueueError('Could not sync offline drafts. They remain saved on this device.');
    } finally {
      syncInProgress.current = false;
      setSyncingQueue(false);
      await refreshQueue();
    }
  }, [onEntryAdded, profile.full_name, profile.id, refreshQueue]);

  useEffect(() => {
    void refreshQueue();
    void syncQueue();
    const onOnline = () => { void syncQueue(); };
    const onVisible = () => { if (document.visibilityState === 'visible') void syncQueue(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); };
  }, [refreshQueue, syncQueue]);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    async function loadOptions() {
      setLoadingPlaces(true);
      let hasCachedOptions = false;
      try {
        const cached = await getCachedCaptureOptions();
        if (active && cached) {
          hasCachedOptions = true;
          setWards(cached.wards);
          setCentres(cached.centres);
          setStations(cached.stations);
          setConsent(cached.consent);
          setIssueCategories(cached.issueCategories);
          if (!wardId && cached.wards[0]) setWardId(cached.wards[0].id);
          setLoadingPlaces(false);
        }
      } catch { /* Continue with the live database when local cache is unavailable. */ }
      const [wardResult, centreResult, stationResult, consentResult, issueResult] = await Promise.all([
        supabase!.from('wards').select('id,name').order('name'),
        supabase!.from('polling_centres').select('id,name,ward_id').order('name'),
        supabase!.from('polling_stations').select('id,station_name,ward_id,polling_centre_id').order('station_number'),
        supabase!.from('settings').select('value').eq('key', 'consent_policy').maybeSingle(),
        supabase!.from('settings').select('value').eq('key', 'issue_categories').maybeSingle(),
      ]);
      if (!active) return;
      const queryError = wardResult.error || centreResult.error || stationResult.error || consentResult.error || issueResult.error;
      if (queryError) {
        if (!hasCachedOptions) setLoadError(queryError.message);
      } else {
        setWards(wardResult.data || []);
        setCentres((centreResult.data || []).map((row) => ({ ...row, name: row.name })));
        setStations((stationResult.data || []).map((row) => ({ ...row, name: row.station_name })));
        setConsent((consentResult.data?.value || null) as ConsentPolicy | null);
        if (Array.isArray(issueResult.data?.value)) setIssueCategories(issueResult.data.value.filter((item): item is string => typeof item === 'string'));
        if (!wardId && wardResult.data?.[0]) setWardId(wardResult.data[0].id);
        void cacheCaptureOptions({
          wards: wardResult.data || [],
          centres: centreResult.data || [],
          stations: (stationResult.data || []).map((row) => ({ id: row.id, name: row.station_name, ward_id: row.ward_id, polling_centre_id: row.polling_centre_id })),
          consent: (consentResult.data?.value || null) as ConsentPolicy | null,
          issueCategories: Array.isArray(issueResult.data?.value) ? issueResult.data.value.filter((item): item is string => typeof item === 'string') : issueCategories,
        }).catch(() => undefined);
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

  function clearForm() {
    setName(''); setPhone(''); setNationalId(''); setNotes(''); setIssues([]); setOtherIssue(''); setConsentChecked(false);
    setNeedsTransport(false); setHasPvc(false); requestId.current = null; requestFingerprint.current = null;
  }

  async function saveOfflineDraft(clientRequestId: string): Promise<boolean> {
    if (nationalId.trim()) {
      setError('For privacy, an offline draft cannot store a National ID. Retry while online, or clear the ID and save as pending ID.');
      return false;
    }
    const capturedOn = new Date().toISOString();
    try {
      await enqueueOfflineEntry({
        clientRequestId,
        capturedOn,
        consentAt: capturedOn,
        consentTextVersion: consent!.version!,
        mobilizerId: profile.id,
        mobilizerName: profile.full_name,
        name: name.trim(),
        phone: phone.trim() || null,
        wardFiledId: wardId,
        wardName: wards.find((ward) => ward.id === wardId)?.name || '',
        pollingCentreId: centreId || null,
        pollingCentreName: centres.find((centre) => centre.id === centreId)?.name || null,
        pollingStationId: stationId || null,
        pollingStationName: stations.find((station) => station.id === stationId)?.name || null,
        supportLevel: support,
        issues: [...issues, ...(otherIssue.trim() ? [otherIssue.trim()] : [])],
        needsTransport,
        hasPvc,
        notes: notes.trim(),
      });
      setSaved(null);
      setError('');
      setQueueSuccess('Draft saved on this device. It will sync when the connection returns.');
      clearForm();
      setQueueError('');
      await refreshQueue();
      return true;
    } catch {
      setError('Could not save this offline draft on the device. Your form is still here; retry or copy the details safely.');
      return false;
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !consentReady || !consentChecked) return;
    setSaving(true);
    setError('');
    setQueueSuccess('');
    setBlockedMatch(null);
    setSaved(null);
    const fingerprint = JSON.stringify([name.trim(), phone.trim(), nationalId.trim(), wardId, centreId, stationId, support, issues, otherIssue.trim(), needsTransport, hasPvc, notes.trim(), consent!.version]);
    if (!requestId.current || requestFingerprint.current !== fingerprint) {
      requestId.current = createClientRequestId();
      requestFingerprint.current = fingerprint;
    }
    const clientRequestId = requestId.current;
    if (!navigator.onLine) {
      const queued = await saveOfflineDraft(clientRequestId);
      if (queued) setSaved(null);
      setSaving(false);
      return;
    }
    let data: Record<string, any> | null = null;
    let rpcError: { message: string } | null = null;
    try {
      const result = await supabase.rpc('submit_entry', {
      p_client_request_id: clientRequestId,
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
      data = result.data as Record<string, any> | null;
      rpcError = result.error;
    } catch {
      rpcError = { message: 'Failed to fetch' };
    }
    setSaving(false);
    if (rpcError) {
      const networkFailure = !navigator.onLine || /failed to fetch|network request failed|fetch failed|networkerror/i.test(rpcError.message);
      if (networkFailure && !nationalId.trim()) {
        const queued = await saveOfflineDraft(clientRequestId);
        if (queued) setError('');
      } else if (networkFailure) {
        setError('Connection failed. For privacy, the National ID was not queued. Retry online, or clear the ID and save as pending ID.');
      } else {
        setError(rpcError.message);
      }
      return;
    }
    if (data?.blocked) {
      setBlockedMatch(data.matched || null);
      setError('This entry matches an existing record and was not saved.');
      setNationalId('');
      requestId.current = null; requestFingerprint.current = null;
      return;
    }
    if (!data) {
      setError('The server did not confirm this entry. The form remains available; retry when ready.');
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
    clearForm();
  }

  async function retryQueuedEntry(item: OfflineQueuedEntry) {
    await updateQueuedEntry({ ...item, status: 'pending', lastError: undefined });
    await refreshQueue();
    void syncQueue();
  }

  async function dismissConfirmedEntry(item: OfflineQueuedEntry) {
    try { await removeQueuedEntry(item.queueId); await refreshQueue(); }
    catch { setQueueError('Could not remove this server-confirmed result from the device.'); }
  }

  if (loadingPlaces) return <div role="status" aria-label="Loading capture options" className="mx-auto max-w-2xl animate-pulse space-y-3"><div className="h-20 rounded-xl bg-white"/><div className="h-72 rounded-xl bg-white"/></div>;
  if (loadError) return <p role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">Could not load capture data: {loadError}</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <h2 className="text-lg font-bold text-slate-900">Search first</h2>
        <p className="mt-1 text-sm text-slate-600">Search your entries by name, phone, or full ID.</p>
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="At least 3 characters or full ID"
          className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
        {searching && <div role="status" aria-label="Searching entries" className="mt-3 animate-pulse space-y-2"><div className="h-4 w-1/2 rounded bg-slate-100"/><div className="h-10 rounded bg-slate-100"/></div>}
        {results.length > 0 && <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {results.map((result, index) => <li key={`${result.id}-${index}`} className="p-3 text-sm">
            <strong className="text-slate-900">{String(result.name || '')}</strong>
            <div className="mt-1 text-xs text-slate-600">{String(result.ward_name || '')} · {String(result.id_masked || 'Pending ID')} · {String(result.phone_e164 || 'No phone')}</div>
          </li>)}
        </ul>}
        {search.length >= 3 && !searching && results.length === 0 && <p className="mt-2 text-xs text-slate-500">No matching entries in your list.</p>}
      </section>

      {(queuedEntries.length > 0 || queueError || queueSuccess) && <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-semibold text-slate-900">Offline sync queue</h2><p className="text-xs text-slate-500">National IDs are never stored in offline drafts.</p></div><button disabled={syncingQueue || !navigator.onLine} onClick={() => void syncQueue()} className="rounded border border-slate-300 px-3 py-2 text-xs font-semibold disabled:opacity-50">{syncingQueue ? 'Syncing…' : 'Sync now'}</button></div>
        {queueSuccess && <p role="status" className="rounded bg-emerald-50 p-2 text-xs text-emerald-800">{queueSuccess}</p>}{queueError && <p role="alert" className="rounded bg-rose-50 p-2 text-xs text-rose-800">{queueError}</p>}
        {queuedEntries.length > 0 && <ul className="space-y-2">{queuedEntries.map((item) => <li key={item.queueId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3">
          <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{item.name}</p><p className="text-xs text-slate-500">{item.wardName}{item.pollingCentreName ? ` · ${item.pollingCentreName}` : ''} · ID pending</p><p className={`text-xs ${item.status === 'error' ? 'text-rose-700' : item.status === 'duplicate-blocked' ? 'text-amber-800' : item.status === 'saved' ? 'text-emerald-800' : 'text-slate-600'}`}>{item.status === 'duplicate-blocked' ? 'Duplicate blocked by server' : item.status === 'saved' ? 'Saved on server' : item.status === 'syncing' ? 'Syncing…' : item.status === 'error' ? item.lastError || 'Sync failed.' : 'Waiting to sync'}{item.resultFlags?.length ? ` · ${item.resultFlags.join(', ')}` : ''}</p></div>
          <div className="flex gap-2">{(item.status === 'pending' || item.status === 'error') && <button disabled={syncingQueue || !navigator.onLine} onClick={() => void retryQueuedEntry(item)} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold disabled:opacity-50">Retry</button>}{(item.status === 'saved' || item.status === 'duplicate-blocked') && <button onClick={() => void dismissConfirmedEntry(item)} className="rounded border border-slate-300 px-2 py-1.5 text-xs font-semibold">Dismiss</button>}</div>
        </li>)}</ul>}
      </section>}

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
