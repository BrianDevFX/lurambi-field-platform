import { useCallback, useEffect, useState } from 'react';
import { Profile } from '../../types/index.ts';
import { supabase } from '../../lib/supabase/client.ts';

interface UserManagementViewProps {
  currentProfile: Profile;
}

type UserAction = { profile: Profile; kind: 'approve' | 'suspend' } | null;

export function UserManagementView({ currentProfile }: UserManagementViewProps) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [action, setAction] = useState<UserAction>(null);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);

  const loadProfiles = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError('');
    const { data, error: queryError } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone_e164,role,status,home_ward_id,referral_code,created_at')
      .order('created_at', { ascending: false });
    if (queryError) {
      setError(queryError.message);
      setProfiles([]);
    } else {
      const rows = (data || []) as (Profile & { created_at: string })[];
      const wardIds = [...new Set(rows.map((profile) => profile.home_ward_id).filter(Boolean))] as string[];
      const wardNames = new Map<string, string>();
      if (wardIds.length) {
        const { data: wards } = await supabase.from('wards').select('id,name').in('id', wardIds);
        for (const ward of wards || []) wardNames.set(ward.id, ward.name);
      }
      setProfiles(rows.map((profile) => ({ ...profile, home_ward_name: wardNames.get(profile.home_ward_id || '') })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void loadProfiles(); }, [loadProfiles, refresh]);

  async function saveAction() {
    if (!supabase || !action || !reason.trim()) return;
    setSaving(true);
    setError('');
    const rpcName = action.kind === 'approve' ? 'approve_mobilizer' : 'suspend_mobilizer';
    const { error: rpcError } = await supabase.rpc(rpcName, {
      p_profile_id: action.profile.id,
      p_reason: reason.trim(),
    });
    if (rpcError) {
      setError(rpcError.message);
    } else {
      setAction(null);
      setReason('');
      setRefresh((value) => value + 1);
    }
    setSaving(false);
  }

  const canSuspend = currentProfile.role === 'admin';

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Mobilizers</h2>
        <p className="mt-1 text-sm text-slate-600">Review registrations in your ward. Approval enables capture and creates a referral code.</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

      {action && (
        <form onSubmit={(event) => { event.preventDefault(); void saveAction(); }} className="rounded-xl border border-emerald-200 bg-white p-4 space-y-3">
          <p className="text-sm text-slate-800">
            {action.kind === 'approve' ? 'Approve' : 'Suspend'} <strong>{action.profile.full_name}</strong>?
          </p>
          <label className="block text-sm font-medium text-slate-700">
            Reason (required)
            <textarea required rows={2} value={reason} onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 p-2.5" />
          </label>
          <div className="flex gap-2">
            <button disabled={saving || !reason.trim()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? 'Saving…' : 'Confirm'}
            </button>
            <button type="button" onClick={() => { setAction(null); setReason(''); }} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {loading ? <p className="rounded-xl bg-white p-6 text-sm text-slate-500">Loading mobilizers…</p> : profiles.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">No mobilizers found.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-600">
              <tr><th className="px-4 py-3">Name</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Ward</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Referral</th><th className="px-4 py-3">Action</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {profiles.filter((profile) => profile.role === 'mobilizer').map((profile) => (
                <tr key={profile.id}>
                  <td className="px-4 py-3 font-medium text-slate-900">{profile.full_name}</td>
                  <td className="px-4 py-3 text-slate-700">{profile.phone_e164 || '—'}</td>
                  <td className="px-4 py-3 text-slate-700">{profile.home_ward_name || '—'}</td>
                  <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs capitalize text-slate-700">{profile.status}</span></td>
                  <td className="px-4 py-3 font-mono text-slate-700">{profile.referral_code || '—'}</td>
                  <td className="px-4 py-3">
                    {profile.status === 'pending' && <button onClick={() => setAction({ profile, kind: 'approve' })} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Approve</button>}
                    {canSuspend && profile.status === 'approved' && <button onClick={() => setAction({ profile, kind: 'suspend' })} className="rounded-md border border-rose-300 px-3 py-1.5 text-xs font-semibold text-rose-700">Suspend</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
