import { FormEvent, useEffect, useRef, useState } from 'react';

type Ward = { id: string; name: string };
type Centre = { id: string; name: string; ward_id: string };
type Station = { id: string; name: string; ward_id: string; polling_centre_id: string };
type JoinData = { wards: Ward[]; centres: Centre[]; stations: Station[]; consent: { version: string; text: string; text_sw?: string|null } | null };
type Language = 'en'|'sw';

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!siteKey || !container.current) return;
    let active = true;
    const render = () => {
      if (!active || !container.current || !window.turnstile || widgetId.current) return;
      widgetId.current = window.turnstile.render(container.current, {
        sitekey: siteKey,
        callback: (token: string) => onToken(token),
        'expired-callback': () => onToken(''),
        'error-callback': () => { onToken(''); setLoadError('Security check unavailable.'); },
      });
    };
    let script = document.getElementById('cloudflare-turnstile') as HTMLScriptElement | null;
    if (window.turnstile) render();
    else if (script) script.addEventListener('load', render, { once: true });
    else {
      script = document.createElement('script'); script.id = 'cloudflare-turnstile'; script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true;
      script.addEventListener('load', render, { once: true }); script.addEventListener('error', () => setLoadError('Security check unavailable.'), { once: true }); document.head.appendChild(script);
    }
    return () => { active = false; if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current); widgetId.current = null; };
  }, [onToken, siteKey]);
  if (!siteKey) return <p className="text-sm text-rose-700">Security check is not configured.</p>;
  return <div><div ref={container} />{loadError && <p role="alert" className="mt-1 text-xs text-rose-700">{loadError}</p>}</div>;
}

const labels = {
  en: { title: 'Join the supporter list', intro: 'Register through your mobilizer’s referral link.', name: 'Full name', id: 'National ID (optional)', phone: 'Phone number', ward: 'Ward', centre: 'Polling centre', station: 'Polling station', choose: 'Select', pledge: 'I support the campaign.', consent: 'I agree to the Privacy Notice and consent to this information being recorded.', privacy: 'Privacy Notice', submit: 'Submit', submitting: 'Submitting…', lang: 'Kiswahili' },
  sw: { title: 'Jiunge na orodha ya wafuasi', intro: 'Jisajili kupitia kiungo cha mhamasishaji wako.', name: 'Jina kamili', id: 'Nambari ya kitambulisho (si lazima)', phone: 'Nambari ya simu', ward: 'Kata', centre: 'Kituo cha kupigia kura', station: 'Kituo cha kupigia kura', choose: 'Chagua', pledge: 'Ninaunga mkono kampeni.', consent: 'Ninakubali Ilani ya Faragha na kutoa idhini ya kurekodi maelezo haya.', privacy: 'Ilani ya Faragha', submit: 'Tuma', submitting: 'Inatuma…', lang: 'English' },
};

export function JoinPage({ referralCode }: { referralCode: string }) {
  const [data, setData] = useState<JoinData | null>(null); const [language, setLanguage] = useState<Language>('en');
  const [name, setName] = useState(''); const [nationalId, setNationalId] = useState(''); const [phone, setPhone] = useState('');
  const [wardId, setWardId] = useState(''); const [centreId, setCentreId] = useState(''); const [stationId, setStationId] = useState('');
  const [pledge, setPledge] = useState(false); const [consent, setConsent] = useState(false); const [token, setToken] = useState('');
  const [website,setWebsite]=useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const text = labels[language];
  useEffect(() => { let active=true; void fetch('/api/join').then(async (response)=>{if(!response.ok)throw new Error();return response.json() as Promise<JoinData>;}).then((result)=>{if(active)setData(result);}).catch(()=>{if(active)setError('The registration form is temporarily unavailable.');}); return()=>{active=false;}; }, []);
  const filteredCentres = data?.centres.filter((centre)=>centre.ward_id===wardId)||[];
  const filteredStations = data?.stations.filter((station)=>station.ward_id===wardId&&station.polling_centre_id===centreId)||[];
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    if(!data?.consent){setError('Registration is not available right now.');return;}
    if(!consent){setError('Consent is required.');return;}
    if(!token){setError('Complete the security check.');return;}
    setBusy(true);
    try {
      const response=await fetch('/api/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({referral_code:referralCode,name,national_id:nationalId,phone,ward_id:wardId,polling_centre_id:centreId,polling_station_id:stationId,pledge,consent,turnstile_token:token,website})});
      const result=await response.json() as {message?:string;error?:string};
      if(!response.ok)throw new Error(result.error||'We could not submit this request.');
      setSuccess(result.message||'Thank you. Your response has been received.');
      setName('');setNationalId('');setPhone('');setWardId('');setCentreId('');setStationId('');setPledge(false);setConsent(false);setToken('');setWebsite('');
    } catch(cause) { setError(cause instanceof Error?cause.message:'We could not submit this request.'); }
    finally { setBusy(false); }
  }
  return <main className="min-h-screen bg-slate-50 p-4"><div className="mx-auto max-w-xl space-y-4">
    <header className="flex items-start justify-between gap-3"><div><h1 className="text-xl font-bold text-slate-900">{text.title}</h1><p className="mt-1 text-sm text-slate-600">{text.intro}</p></div><button onClick={()=>setLanguage(language==='en'?'sw':'en')} className="shrink-0 rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold">{text.lang}</button></header>
    {error&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{success&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 sm:p-6">
      <label className="block text-sm font-medium">{text.name}<input required minLength={2} maxLength={120} autoComplete="name" value={name} onChange={(event)=>setName(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium">{text.id}<input inputMode="numeric" autoComplete="off" value={nationalId} onChange={(event)=>setNationalId(event.target.value.replace(/\D/g,''))} maxLength={8} pattern="[0-9]{7,8}" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium">{text.phone}<input required type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(event)=>setPhone(event.target.value)} maxLength={32} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5" /></label>
      <label className="block text-sm font-medium">{text.ward}<select required value={wardId} onChange={(event)=>{setWardId(event.target.value);setCentreId('');setStationId('');}} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">{text.choose}</option>{(data?.wards||[]).map((ward)=><option key={ward.id} value={ward.id}>{ward.name}</option>)}</select></label>
      <label className="block text-sm font-medium">{text.centre}<select value={centreId} onChange={(event)=>{setCentreId(event.target.value);setStationId('');}} disabled={!wardId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">{text.choose}</option>{filteredCentres.map((centre)=><option key={centre.id} value={centre.id}>{centre.name}</option>)}</select></label>
      <label className="block text-sm font-medium">{text.station}<select value={stationId} onChange={(event)=>setStationId(event.target.value)} disabled={!centreId} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5"><option value="">{text.choose}</option>{filteredStations.map((station)=><option key={station.id} value={station.id}>{station.name}</option>)}</select></label>
      <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={pledge} onChange={(event)=>setPledge(event.target.checked)} className="mt-1" />{text.pledge}</label>
      {data?.consent?<p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">{language==='sw'?(data.consent.text_sw||data.consent.text):data.consent.text}</p>:<p role="alert" className="rounded bg-amber-50 p-3 text-sm text-amber-900">Registration is temporarily unavailable.</p>}
      <label className="flex items-start gap-2 text-sm text-slate-700"><input required type="checkbox" checked={consent} onChange={(event)=>setConsent(event.target.checked)} className="mt-1" /><span>{text.consent} <a href="/privacy" target="_blank" rel="noreferrer" className="font-semibold text-emerald-800 underline">{text.privacy}</a></span></label>
      <div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true"><label>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event)=>setWebsite(event.target.value)} /></label></div>
      <TurnstileWidget onToken={setToken} />
      <button disabled={busy||!data?.consent} className="w-full rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?text.submitting:text.submit}</button>
    </form>
    <footer className="flex justify-center gap-4 text-xs"><a href="/privacy" className="text-emerald-800 underline">{text.privacy}</a><a href="/data-subject-request" className="text-emerald-800 underline">Data request</a></footer>
  </div></main>;
}

export function PrivacyNoticePage() {
  return <main className="min-h-screen bg-slate-50 p-4"><article className="mx-auto max-w-3xl space-y-5 rounded-xl border bg-white p-5 sm:p-8">
    <header><h1 className="text-2xl font-bold text-slate-900">Privacy Notice</h1><p className="mt-2 text-sm text-slate-600">Lurambi Campaign Field Platform</p></header>
    <section><h2 className="font-semibold">Information collected</h2><p className="mt-1 text-sm leading-6 text-slate-700">With your consent, the platform records your name, phone number, optional National ID, ward and polling place, supporter response, and the date and version of your consent. Referral registrations may also record the mobilizer who shared the link.</p></section>
    <section><h2 className="font-semibold">How it is used</h2><p className="mt-1 text-sm leading-6 text-slate-700">The information supports campaign field coordination, supporter follow-up, data quality checks and verification. Access is limited by account role. National IDs are protected for matching and displayed in masked form in the field tools. Public forms use Cloudflare Turnstile; an IP-derived keyed hash is used for abuse rate limiting.</p></section>
    <section><h2 className="font-semibold">Your choices and rights</h2><p className="mt-1 text-sm leading-6 text-slate-700">You can choose not to provide an optional National ID. You may submit a request to access, correct or delete information associated with you. The team may need to verify your identity before acting on a request.</p></section>
    <section><h2 className="font-semibold">Contact and requests</h2><p className="mt-1 text-sm leading-6 text-slate-700">Use the data-subject request form for access, correction or deletion requests. A campaign administrator will review and record the response.</p></section>
    <div className="flex flex-wrap gap-3"><a href="/data-subject-request" className="rounded bg-emerald-700 px-3 py-2 text-sm font-semibold text-white">Submit a data request</a></div>
  </article></main>;
}

export function DataSubjectRequestPage() {
  const [requestType,setRequestType]=useState<'access'|'correction'|'deletion'>('access');const [name,setName]=useState('');const [phone,setPhone]=useState('');const [nationalId,setNationalId]=useState('');const [notes,setNotes]=useState('');const [token,setToken]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [success,setSuccess]=useState('');
  const [website,setWebsite]=useState('');
  async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();setError('');setSuccess('');if(!token){setError('Complete the security check.');return;}setBusy(true);try{const response=await fetch('/api/dsr',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({request_type:requestType,name,phone,national_id:nationalId,notes,turnstile_token:token,website})});const result=await response.json() as {message?:string;error?:string};if(!response.ok)throw new Error(result.error||'We could not submit this request.');setSuccess(result.message||'Your request has been received.');setName('');setPhone('');setNationalId('');setNotes('');setToken('');setWebsite('');}catch(cause){setError(cause instanceof Error?cause.message:'We could not submit this request.');}finally{setBusy(false);}}
  return <main className="min-h-screen bg-slate-50 p-4"><div className="mx-auto max-w-xl space-y-4"><header><h1 className="text-2xl font-bold text-slate-900">Data-subject request</h1><p className="mt-1 text-sm text-slate-600">Request access, correction or deletion of your information.</p></header>{error&&<p role="alert" className="rounded bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}{success&&<p role="status" className="rounded bg-emerald-50 p-3 text-sm text-emerald-900">{success}</p>}
    <form onSubmit={submit} className="space-y-4 rounded-xl border bg-white p-5"><label className="block text-sm font-medium">Request type<select value={requestType} onChange={(event)=>setRequestType(event.target.value as typeof requestType)} className="mt-1 w-full rounded border p-2.5"><option value="access">Access</option><option value="correction">Correction</option><option value="deletion">Deletion</option></select></label><label className="block text-sm font-medium">Full name<input required maxLength={120} value={name} onChange={(event)=>setName(event.target.value)} className="mt-1 w-full rounded border p-2.5" /></label><label className="block text-sm font-medium">Phone number<input required type="tel" maxLength={32} value={phone} onChange={(event)=>setPhone(event.target.value)} className="mt-1 w-full rounded border p-2.5" /></label><label className="block text-sm font-medium">National ID (optional)<input inputMode="numeric" autoComplete="off" maxLength={8} value={nationalId} onChange={(event)=>setNationalId(event.target.value.replace(/\D/g,''))} className="mt-1 w-full rounded border p-2.5" /></label><label className="block text-sm font-medium">Details<textarea rows={3} maxLength={1000} value={notes} onChange={(event)=>setNotes(event.target.value)} className="mt-1 w-full rounded border p-2.5" /></label><div className="absolute -left-[10000px] top-auto h-px w-px overflow-hidden" aria-hidden="true"><label>Leave this field empty<input name="website" tabIndex={-1} autoComplete="off" value={website} onChange={(event)=>setWebsite(event.target.value)} /></label></div><TurnstileWidget onToken={setToken}/><button disabled={busy} className="w-full rounded bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{busy?'Submitting…':'Submit request'}</button></form><a href="/privacy" className="text-sm text-emerald-800 underline">Read the Privacy Notice</a></div></main>;
}
