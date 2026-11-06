import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface ReferralViewProps {
  referralCode?: string;
  mobilizerName?: string;
}

export function ReferralView({ referralCode, mobilizerName }: ReferralViewProps) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const url = referralCode ? `${window.location.origin}/join/${encodeURIComponent(referralCode)}` : '';

  useEffect(() => {
    if (!url) return;
    let active = true;
    QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: '#047857', light: '#FFFFFF' } })
      .then((dataUrl) => { if (active) setQr(dataUrl); })
      .catch(() => { if (active) setError('Could not create the QR code.'); });
    return () => { active = false; };
  }, [url]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access is unavailable on this device.');
    }
  }

  const message = `Join through ${mobilizerName || 'my'} supporter link: ${url}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  if (!referralCode) return <section className="rounded-xl border border-amber-200 bg-white p-5">
    <h2 className="font-bold text-slate-900">My link</h2>
    <p className="mt-1 text-sm text-slate-600">Your referral link will appear after your account is approved.</p>
  </section>;

  return <section className="mx-auto max-w-xl rounded-xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-bold text-slate-900">My link</h2>
    <p className="mt-1 text-sm text-slate-600">Share this link or QR code to invite supporters.</p>
    <div className="mt-4 flex flex-col items-center rounded-lg bg-slate-50 p-4">
      {qr ? <img src={qr} alt="QR code for the supporter join page" className="h-48 w-48" /> : <div className="grid h-48 w-48 place-items-center text-sm text-slate-500">Creating QR…</div>}
      <p className="mt-2 text-xs text-slate-600">Referral code <strong className="font-mono">{referralCode}</strong></p>
    </div>
    <p className="mt-4 break-all rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800">{url}</p>
    <div className="mt-3 grid grid-cols-2 gap-2">
      <button onClick={() => void copyLink()} className="rounded-lg bg-slate-800 px-3 py-2.5 text-sm font-semibold text-white">{copied ? 'Copied' : 'Copy link'}</button>
      <a href={whatsappUrl} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-700 px-3 py-2.5 text-center text-sm font-semibold text-white">Share on WhatsApp</a>
    </div>
    {error && <p role="alert" className="mt-3 text-sm text-rose-700">{error}</p>}
  </section>;
}
