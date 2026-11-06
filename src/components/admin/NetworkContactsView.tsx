import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client.ts';

type Contact = { id: string; type: 'pastor' | 'chp' | 'other'; name: string; phone_e164: string | null; denomination: string | null; community_unit: string | null; ward_id: string | null; polling_station_id: string | null; reach_status: 'not_contacted' | 'contacted' | 'meeting_held'; notes: string | null; exclude_from_campaign_exports: boolean };
type Place = { id: string; name: string };

export function NetworkContactsView() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [wards, setWards] = useState<Place[]>([]);
  const [stations, setStations] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [neutralityNote, setNeutralityNote] = useState('CHP contacts are politically neutral and must remain outside campaign activity.');
  const [busy, setBusy] = useState(false);

  async function load() {
    if (!supabase) return;
    const [contactResult, wardResult, stationResult, noteResult] = await Promise.all([
      supabase.from('network_contacts').select('id,type,name,phone_e164,denomination,community_unit,ward_id,polling_station_id,reach_status,notes,exclude_from_campaign_exports').order('name').limit(500),
      supabase.from('wards').select('id,name').order('name'),
      supabase.from('polling_stations').select('id,station_name').order('station_name'),
      supabase.from('settings').select('value').eq('key','chp_compliance_note').maybeSingle(),
    ]);
    const loadError = contactResult.error || wardResult.error || stationResult.error || noteResult.error;
    if (loadError) { setError(loadError.message); return; }
    setContacts((contactResult.data || []) as Contact[]);
    setWards((wardResult.data || []).map((row) => ({ id: row.id, name: row.name })));
    setStations((stationResult.data || []).map((row) => ({ id: row.id, name: row.station_name })));
    const noteValue = noteResult.data?.value as {text?:string}|undefined;
    if (noteValue?.text) setNeutralityNote(noteValue.text);
  }

  useEffect(() => { void load(); }, []);

  async function save() {
    if (!supabase || !selected || !reason.trim()) return;
    setBusy(true); setError('');
    const { error: saveError } = await supabase.rpc('update_network_contact', {
      p_contact_id: selected.id, p_ward_id: selected.ward_id, p_station_id: selected.polling_station_id,
      p_reach_status: selected.reach_status, p_notes: selected.notes, p_exclude_from_exports: selected.exclude_from_campaign_exports,
      p_reason: reason.trim(),
    });
    if (saveError) setError(saveError.message);
    else { setSelected(null); setReason(''); await load(); }
    setBusy(false);
  }

  return <section className="space-y-4">
    <div><h2 className="text-xl font-bold text-slate-900">Network contacts</h2><p className="mt-1 text-sm text-slate-600">Assign wards, record contact status and notes. CHP contacts are excluded from campaign exports by default.</p></div>
    {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {contacts.length === 0 ? <p className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No imported contacts.</p> : <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-600"><tr><th className="px-3 py-3">Name</th><th className="px-3 py-3">Type</th><th className="px-3 py-3">Phone</th><th className="px-3 py-3">Ward</th><th className="px-3 py-3">Reach</th><th className="px-3 py-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{contacts.map((contact) => <tr key={contact.id}><td className="px-3 py-3">{contact.name}</td><td className="px-3 py-3 capitalize">{contact.type}</td><td className="px-3 py-3">{contact.phone_e164 || '—'}</td><td className="px-3 py-3">{wards.find((ward) => ward.id === contact.ward_id)?.name || '—'}</td><td className="px-3 py-3">{contact.reach_status.replaceAll('_', ' ')}</td><td className="px-3 py-3"><button onClick={() => { setSelected({ ...contact }); setReason(''); }} className="rounded border border-slate-300 px-3 py-1.5 text-xs font-semibold">Edit</button></td></tr>)}</tbody></table></div>}
    {selected && <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 className="font-semibold">Update {selected.name}</h3>
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Ward<select value={selected.ward_id || ''} onChange={(event) => setSelected({ ...selected, ward_id: event.target.value || null, polling_station_id: null })} className="mt-1 block w-full rounded border p-2"><option value="">Unassigned</option>{wards.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="text-sm">Polling station<select value={selected.polling_station_id || ''} onChange={(event) => setSelected({ ...selected, polling_station_id: event.target.value || null })} className="mt-1 block w-full rounded border p-2"><option value="">Unassigned</option>{stations.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="text-sm">Reach status<select value={selected.reach_status} onChange={(event) => setSelected({ ...selected, reach_status: event.target.value as Contact['reach_status'] })} className="mt-1 block w-full rounded border p-2"><option value="not_contacted">Not contacted</option><option value="contacted">Contacted</option><option value="meeting_held">Meeting held</option></select></label>
        {selected.type === 'chp' && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.exclude_from_campaign_exports} onChange={(event) => setSelected({ ...selected, exclude_from_campaign_exports: event.target.checked })} />Exclude from campaign exports</label>}</div>
      <label className="block text-sm">Notes<textarea rows={2} value={selected.notes || ''} onChange={(event) => setSelected({ ...selected, notes: event.target.value })} className="mt-1 w-full rounded border p-2" /></label>
      <label className="block text-sm">Reason (required)<input required value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded border p-2" /></label>
      <p className="text-xs text-slate-500">{neutralityNote}</p>
      <div className="flex gap-2"><button disabled={busy || !reason.trim()} className="rounded bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button><button type="button" onClick={() => setSelected(null)} className="rounded border px-4 py-2 text-sm">Cancel</button></div>
    </form>}
  </section>;
}
