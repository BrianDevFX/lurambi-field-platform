import { FormEvent, useEffect, useState } from 'react';
import { loginIdentifierToEmail, phoneToPseudoEmail } from '../../lib/auth/phoneLogin.ts';
import { normaliseKenyanPhone } from '../../lib/normalisation/phone.ts';
import { getSupabaseConfigError, supabase } from '../../lib/supabase/client.ts';
import { Ward } from '../../types/index.ts';

interface AuthViewProps {
  onAuthenticated: () => void;
}
interface StationOption { id: string; station_name: string; ward_id: string; }

export function AuthView({ onAuthenticated }: AuthViewProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [homeWardId, setHomeWardId] = useState('');
  const [wards, setWards] = useState<Ward[]>([]);
  const [stations, setStations] = useState<StationOption[]>([]);
  const [homeStationId, setHomeStationId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (homeStationId && !stations.some((station) => station.id === homeStationId && station.ward_id === homeWardId)) {
      setHomeStationId('');
    }
  }, [homeWardId, homeStationId, stations]);

  useEffect(() => {
    if (mode !== 'signup' || !supabase) return;
    let active = true;
    Promise.all([
      supabase.rpc('list_registration_wards'),
      supabase.rpc('list_registration_stations'),
    ]).then(([wardResult, stationResult]) => {
      if (!active) return;
      if (wardResult.error || stationResult.error) setError('Could not load wards and stations. Try again later.');
      else {
        const rows = (wardResult.data || []) as Ward[];
        setWards(rows);
        setStations((stationResult.data || []) as StationOption[]);
        setHomeWardId((current) => current || rows[0]?.id || '');
      }
    });
    return () => { active = false; };
  }, [mode]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setError('Supabase is not configured. Add the public URL and anon key, then restart the app.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      if (mode === 'login') {
        const email = loginIdentifierToEmail(identifier);
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw new Error('Phone/email or password is incorrect.');
        onAuthenticated();
        return;
      }

      const phoneResult = normaliseKenyanPhone(phone);
      if (!phoneResult.isValid || !phoneResult.phone_e164) {
        throw new Error('Enter a valid Kenyan mobile number.');
      }
      if (!/^\d{7,8}$/.test(nationalId.trim())) {
        throw new Error('National ID must contain 7 or 8 digits.');
      }
      if (!homeWardId) throw new Error('Select your home ward.');

      const email = phoneToPseudoEmail(phoneResult.phone_e164);
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone_e164: phoneResult.phone_e164,
            home_ward_id: homeWardId,
            home_polling_station_id: homeStationId || null,
          },
        },
      });
      if (signUpError) throw new Error(signUpError.message);

      let session = data.session;
      if (!session) {
        const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) throw new Error('Account created. Sign in to finish registration.');
        session = loginData.session;
      }
      if (session) {
        const { error: registrationError } = await supabase.rpc('complete_mobilizer_registration', {
          p_national_id: nationalId.trim(),
        });
        if (registrationError) throw new Error(registrationError.message);
      }
      onAuthenticated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete this request.');
    } finally {
      setNationalId('');
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-slate-900">Lurambi Field Platform</h1>
        <p className="mt-1 text-sm text-slate-600">Sign in or register as a mobilizer.</p>
        {getSupabaseConfigError() && <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{getSupabaseConfigError()}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
          <button type="button" onClick={() => { setMode('login'); setError(''); }}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'login' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>
            Sign in
          </button>
          <button type="button" onClick={() => { setMode('signup'); setError(''); }}
            className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === 'signup' ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>
            Register
          </button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
          {mode === 'login' ? (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Phone number or admin email
                <input required autoComplete="username" value={identifier} onChange={(event) => setIdentifier(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="07… or admin@example.org" />
              </label>
            </>
          ) : (
            <>
              <label className="block text-sm font-medium text-slate-700">
                Full name
                <input required autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Phone number
                <input required type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" placeholder="07…" />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                National ID (7 or 8 digits)
                <input required inputMode="numeric" autoComplete="off" value={nationalId} onChange={(event) => setNationalId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
                <span className="mt-1 block text-xs text-slate-500">Sent directly to the database for protection. It is not saved in your browser.</span>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Home ward
                <select required value={homeWardId} onChange={(event) => setHomeWardId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">Select a ward</option>
                  {wards.map((ward) => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Home polling station (optional)
                <select value={homeStationId} onChange={(event) => setHomeStationId(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5">
                  <option value="">No station selected</option>
                  {stations.filter((station) => station.ward_id === homeWardId).map((station) => <option key={station.id} value={station.id}>{station.station_name}</option>)}
                </select>
              </label>
            </>
          )}

          <label className="block text-sm font-medium text-slate-700">
            Password
            <input required minLength={8} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password} onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" />
          </label>

          {error && <p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}

          <button disabled={loading || (mode === 'signup' && wards.length === 0)}
            className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">
            {loading ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
        {mode === 'signup' && <p className="mt-4 text-xs leading-5 text-slate-500">New accounts need approval before they can capture entries.</p>}
      </section>
    </main>
  );
}
