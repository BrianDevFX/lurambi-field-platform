import { FormEvent, lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { AuthView } from './components/auth/AuthView.tsx';
import { supabase } from './lib/supabase/client.ts';
import { cacheMobilizerProfile, getCachedMobilizerProfile } from './lib/offline/offlineQueue.ts';
import { Profile } from './types/index.ts';

const UserManagementView = lazy(() => import('./components/admin/UserManagementView.tsx').then((module) => ({ default: module.UserManagementView })));
const NetworkContactsView = lazy(() => import('./components/admin/NetworkContactsView.tsx').then((module) => ({ default: module.NetworkContactsView })));
const ImportWizard = lazy(() => import('./components/importer/ImportWizard.tsx').then((module) => ({ default: module.ImportWizard })));
const AdminOperationsView = lazy(() => import('./components/admin/AdminOperationsView.tsx').then((module) => ({ default: module.AdminOperationsView })));
const ExportCenter = lazy(() => import('./components/admin/ExportCenter.tsx').then((module) => ({ default: module.ExportCenter })));
const CoordinatorEntriesView = lazy(() => import('./components/admin/CoordinatorEntriesView.tsx').then((module) => ({ default: module.CoordinatorEntriesView })));
const PlacesAdminView = lazy(() => import('./components/admin/PlacesAdminView.tsx').then((module) => ({ default: module.PlacesAdminView })));
const DashboardView = lazy(() => import('./components/dashboard/DashboardView.tsx').then((module) => ({ default: module.DashboardView })));
const MobilizerDashboard = lazy(() => import('./components/mobilizer/MobilizerDashboard.tsx').then((module) => ({ default: module.MobilizerDashboard })));
const DataSubjectRequestPage = lazy(() => import('./components/public/PublicPages.tsx').then((module) => ({ default: module.DataSubjectRequestPage })));
const JoinPage = lazy(() => import('./components/public/PublicPages.tsx').then((module) => ({ default: module.JoinPage })));
const PrivacyNoticePage = lazy(() => import('./components/public/PublicPages.tsx').then((module) => ({ default: module.PrivacyNoticePage })));

function PageLoading() {
  return <main className="min-h-screen bg-slate-50 p-4"><div className="mx-auto max-w-3xl animate-pulse space-y-3 rounded-xl bg-white p-5"><div className="h-5 w-1/3 rounded bg-slate-200"/><div className="h-4 w-2/3 rounded bg-slate-100"/><div className="h-24 rounded bg-slate-100"/></div></main>;
}

function CompleteRegistration({ onComplete }: { onComplete: () => void }) {
  const [nationalId, setNationalId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setError('');
    try {
      const { error: rpcError } = await supabase.rpc('complete_mobilizer_registration', {
        p_national_id: nationalId.trim(),
      });
      if (rpcError) throw new Error(rpcError.message);
      setNationalId('');
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save registration details.');
    } finally {
      setNationalId('');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="text-lg font-bold text-slate-900">Finish registration</h2>
        <p className="mt-1 text-sm text-slate-600">Enter your National ID to complete your pending mobilizer profile.</p>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        National ID (7 or 8 digits)
        <input required inputMode="numeric" autoComplete="off" value={nationalId} onChange={(event) => setNationalId(event.target.value)}
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
        <span className="mt-1 block text-xs text-slate-500">The value is sent to a database function and is not saved in your browser.</span>
      </label>
      {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
      <button disabled={saving} className="w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? 'Saving…' : 'Complete registration'}
      </button>
    </form>
  );
}

function AdminWorkspace({ currentProfile }: { currentProfile: Profile }) {
  const adminTabs = ['dashboard', 'mobilizers', 'import', 'places', 'contacts', 'operations', 'exports'] as const;
  const coordinatorTabs = ['dashboard', 'entries', 'mobilizers', 'exports'] as const;
  const availableTabs = currentProfile.role === 'admin' ? adminTabs : coordinatorTabs;
  const [tab, setTab] = useState<string>('dashboard');
  return <div className="space-y-5">
    <nav aria-label="Admin sections" className="flex gap-2 overflow-x-auto border-b border-slate-200">
      {availableTabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-semibold capitalize ${tab === item ? 'border-emerald-700 text-emerald-800' : 'border-transparent text-slate-600'}`}>{item === 'dashboard' ? 'Dashboard' : item === 'contacts' ? 'Network contacts' : item === 'import' ? 'Import' : item === 'places' ? 'Places' : item === 'entries' ? 'Entries' : item === 'operations' ? 'Admin operations' : item === 'exports' ? 'Exports' : currentProfile.role === 'ward_coordinator' ? 'Mobilizers in ward' : 'Mobilizers'}</button>)}
    </nav>
    {tab === 'dashboard' ? <DashboardView profile={currentProfile} />
      : tab === 'mobilizers' ? <UserManagementView currentProfile={currentProfile} />
      : tab === 'import' && currentProfile.role === 'admin' ? <ImportWizard />
      : tab === 'contacts' && currentProfile.role === 'admin' ? <NetworkContactsView />
      : tab === 'places' && currentProfile.role === 'admin' ? <PlacesAdminView />
      : tab === 'operations' && currentProfile.role === 'admin' ? <AdminOperationsView />
      : tab === 'entries' && currentProfile.role === 'ward_coordinator' ? <CoordinatorEntriesView />
      : <ExportCenter role={currentProfile.role} />}
  </div>;
}

function AuthenticatedApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id,email,full_name,phone_e164,national_id_masked,role,status,home_ward_id,referral_code')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      if (!navigator.onLine) {
        try {
          const cached = await getCachedMobilizerProfile(userId);
          if (cached) { setProfile(cached as Profile); setLoadError(''); return; }
        } catch { /* No locally verified mobilizer profile. */ }
      }
      setLoadError(error.message);
    }
    else if (!data) setLoadError('Your profile is not available. Contact an administrator.');
    else {
      let homeWardName: string | undefined;
      if (data.home_ward_id) {
        const { data: ward } = await supabase.from('wards').select('name').eq('id', data.home_ward_id).maybeSingle();
        homeWardName = ward?.name;
      }
      const nextProfile = { ...data, home_ward_name: homeWardName } as Profile;
      setProfile(nextProfile);
      if (nextProfile.role === 'mobilizer' && nextProfile.status === 'approved') {
        void cacheMobilizerProfile({
          id: nextProfile.id, email: nextProfile.email || null, full_name: nextProfile.full_name,
          phone_e164: nextProfile.phone_e164 || null, national_id_masked: null, role: 'mobilizer', status: 'approved',
          home_ward_id: nextProfile.home_ward_id || null, home_ward_name: homeWardName, referral_code: nextProfile.referral_code || null,
        }).catch(() => undefined);
      }
      setLoadError('');
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user.id) await loadProfile(session.user.id);
  }, [loadProfile, session?.user.id]);

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setLoadError('');
  }, []);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    const loadSession = async (next: Session | null) => {
      if (!active) return;
      setSession(next);
      if (next) await loadProfile(next.user.id);
      else setProfile(null);
      if (active) setLoading(false);
    };
    void supabase.auth.getSession().then(({ data }) => loadSession(data.session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setProfile(null);
      } else {
        window.setTimeout(() => { if (active) void loadProfile(next.user.id); }, 0);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!session) return;
    let timeout = 0;
    const resetTimer = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => { void signOut(); }, 30 * 60 * 1000);
    };
    const events: (keyof WindowEventMap)[] = ['pointerdown', 'keydown', 'touchstart'];
    events.forEach((eventName) => window.addEventListener(eventName, resetTimer, { passive: true }));
    resetTimer();
    return () => {
      window.clearTimeout(timeout);
      events.forEach((eventName) => window.removeEventListener(eventName, resetTimer));
    };
  }, [session, signOut]);

  if (!supabase) {
    return <AuthView onAuthenticated={() => undefined} />;
  }
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-slate-600">Loading…</div>;
  if (!session) return <AuthView onAuthenticated={() => undefined} />;
  if (loadError) {
    return <main className="min-h-screen grid place-items-center p-4"><section className="max-w-md rounded-xl bg-white p-6 text-center">
      <p role="alert" className="text-sm text-rose-800">{loadError}</p>
      <button onClick={() => void signOut()} className="mt-4 rounded-lg bg-slate-800 px-4 py-2 text-sm text-white">Sign out</button>
    </section></main>;
  }
  if (!profile) return <div className="min-h-screen grid place-items-center text-sm text-slate-600">Loading profile…</div>;

  if (profile.status !== 'approved') {
    const needsRegistration = profile.role === 'mobilizer' && profile.status === 'pending' && !profile.national_id_masked;
    return <main className="min-h-screen bg-slate-50 p-4">
      <header className="mx-auto flex max-w-3xl items-center justify-between py-4">
        <strong className="text-slate-900">Lurambi Field Platform</strong>
        <button onClick={() => void signOut()} className="text-sm font-semibold text-slate-700">Sign out</button>
      </header>
      <div className="mx-auto mt-10 max-w-3xl space-y-4">
        {needsRegistration ? <CompleteRegistration onComplete={() => void refreshProfile()} /> : (
          <section className="rounded-xl border border-amber-200 bg-white p-6">
            <h1 className="text-lg font-bold text-slate-900">{profile.status === 'suspended' ? 'Account suspended' : 'Approval pending'}</h1>
            <p className="mt-1 text-sm text-slate-600">{profile.status === 'suspended' ? 'Contact an administrator for help.' : 'An administrator or your ward coordinator must approve your account before you can capture entries.'}</p>
          </section>
        )}
      </div>
    </main>;
  }

  return <main className="min-h-screen bg-slate-50">
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold text-slate-900 sm:text-base">Lurambi Field Platform</h1>
          <p className="truncate text-xs text-slate-500">{profile.full_name} · {profile.role.replace('_', ' ')}</p>
        </div>
        <button onClick={() => void signOut()} className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700">Sign out</button>
      </div>
    </header>
    <div className="mx-auto max-w-7xl px-4 py-5">
      {profile.role === 'mobilizer'
        ? <MobilizerDashboard profile={profile} onSignOut={() => void signOut()} />
        : <AdminWorkspace currentProfile={profile} />}
    </div>
  </main>;
}

function App() {
  const path=window.location.pathname;
  const joinMatch=path.match(/^\/join\/([^/]+)\/?$/);
  let page = <AuthenticatedApp/>;
  if (joinMatch) {
    let code = joinMatch[1];
    try { code = decodeURIComponent(code); } catch { code = ''; }
    page = <JoinPage referralCode={code}/>;
  } else if(path==='/privacy'||path==='/privacy-notice') page = <PrivacyNoticePage/>;
  else if(path==='/data-subject-request') page = <DataSubjectRequestPage/>;
  return <Suspense fallback={<PageLoading/>}>{page}</Suspense>;
}

export default App;
