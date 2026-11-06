import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase/client.ts';

type Row = { id: string; name: string; phone_e164: string | null; id_masked: string | null; ward_filed_id: string; polling_centre_id: string | null; polling_station_id: string | null; support_level: string; verification_status: string; flags: string[]; captured_on: string };

export function CoordinatorEntriesView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [wards, setWards] = useState<Map<string, string>>(new Map());
  const [centres, setCentres] = useState<Map<string, string>>(new Map());
  const [stations, setStations] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    void Promise.all([
      supabase.from('entries').select('id,name,phone_e164,id_masked,ward_filed_id,polling_centre_id,polling_station_id,support_level,verification_status,flags,captured_on').order('captured_on',{ascending:false}).limit(500),
      supabase.from('wards').select('id,name'), supabase.from('polling_centres').select('id,name'), supabase.from('polling_stations').select('id,station_name'),
    ]).then(([entries, wardRows, centreRows, stationRows]) => {
      const queryError = entries.error || wardRows.error || centreRows.error || stationRows.error;
      if (queryError) { setError(queryError.message); return; }
      setRows((entries.data || []) as Row[]);
      setWards(new Map((wardRows.data || []).map((row) => [row.id,row.name])));
      setCentres(new Map((centreRows.data || []).map((row) => [row.id,row.name])));
      setStations(new Map((stationRows.data || []).map((row) => [row.id,row.station_name])));
    });
  }, []);
  return <section className="space-y-4"><div><h2 className="text-lg font-bold">Entries in your ward</h2><p className="text-xs text-slate-600">Read only. Entry visibility is enforced by row-level security.</p></div>{error&&<p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}<div className="overflow-x-auto rounded-xl border bg-white"><table className="min-w-full text-left text-xs"><thead className="bg-slate-50"><tr>{['Name','Masked ID','Phone','Ward','Centre','Station','Support','Verification','Flags'].map((label)=><th key={label} className="px-3 py-2">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.map((row)=><tr key={row.id}><td className="px-3 py-2">{row.name}</td><td className="px-3 py-2 font-mono">{row.id_masked||'Pending ID'}</td><td className="px-3 py-2">{row.phone_e164||'—'}</td><td className="px-3 py-2">{wards.get(row.ward_filed_id)||'—'}</td><td className="px-3 py-2">{centres.get(row.polling_centre_id||'')||'—'}</td><td className="px-3 py-2">{stations.get(row.polling_station_id||'')||'—'}</td><td className="px-3 py-2">{row.support_level.replaceAll('_',' ')}</td><td className="px-3 py-2">{row.verification_status.replaceAll('_',' ')}</td><td className="px-3 py-2">{row.flags.join(', ')||'—'}</td></tr>)}</tbody></table></div></section>;
}
