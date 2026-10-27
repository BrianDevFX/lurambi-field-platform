import React, { useState, useEffect } from 'react';
import QRCode from 'qrcode';
import { 
  QrCode, 
  Share2, 
  Copy, 
  Check, 
  ExternalLink, 
  Trophy, 
  Users, 
  Sparkles, 
  CheckCircle2, 
  Languages, 
  ShieldCheck, 
  Send 
} from 'lucide-react';
import { Entry } from '../../types/index.ts';

interface ReferralViewProps {
  referralCode?: string;
  mobilizerName?: string;
  entries: Entry[];
  onSelfRegisterEntry?: (newEntry: Entry) => void;
}

export const ReferralView: React.FC<ReferralViewProps> = ({
  referralCode = 'LUR789',
  mobilizerName = 'Barasa Field Officer',
  entries,
  onSelfRegisterEntry
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);
  const [showPublicModal, setShowPublicModal] = useState(false);
  const [lang, setLang] = useState<'en' | 'sw'>('en');

  // Public join form state
  const [joinName, setJoinName] = useState('');
  const [joinPhone, setJoinPhone] = useState('');
  const [joinId, setJoinId] = useState('');
  const [joinWard, setJoinWard] = useState('Sheywe');
  const [joinPledge, setJoinPledge] = useState('Strong Supporter');
  const [joinConsent, setJoinConsent] = useState(false);
  const [honeypot, setHoneypot] = useState(''); // Anti-bot honeypot
  const [joinSubmitted, setJoinSubmitted] = useState(false);

  const referralUrl = `https://lurambi2027.ke/join/${referralCode}`;
  
  const whatsappMessage = lang === 'en'
    ? `Hello! Join our grassroots team for Lurambi Constituency (Kakamega County) 2027 General Election. Register directly here: ${referralUrl} - Tuko Pamoja!`
    : `Habari! Ungana na timu yetu ya mashinani ya Eneo Bunge la Lurambi (Kakamega) 2027. Jisajili moja kwa moja hapa: ${referralUrl} - Tuko Pamoja!`;

  // Generate QR code
  useEffect(() => {
    QRCode.toDataURL(referralUrl, {
      width: 240,
      margin: 2,
      color: {
        dark: '#047857', // Emerald 700
        light: '#FFFFFF'
      }
    })
      .then(url => setQrCodeDataUrl(url))
      .catch(err => console.error(err));
  }, [referralUrl]);

  // Copy referral link
  const copyLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  // Copy WhatsApp message
  const copyWhatsappText = () => {
    navigator.clipboard.writeText(whatsappMessage);
    setCopiedMessage(true);
    setTimeout(() => setCopiedMessage(false), 2000);
  };

  // Launch WhatsApp Web or Mobile
  const shareToWhatsapp = () => {
    const encoded = encodeURIComponent(whatsappMessage);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // Handle self-registration submission
  const handleSelfRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (honeypot) return; // Silent discard if bot filled honeypot
    if (!joinName.trim() || !joinConsent) return;

    if (onSelfRegisterEntry) {
      onSelfRegisterEntry({
        id: `self-${Date.now()}`,
        name: joinName.trim(),
        phone_e164: joinPhone.startsWith('+') ? joinPhone : `+254${joinPhone.replace(/^0/, '')}`,
        id_masked: joinId ? `${joinId.slice(0, 2)}***${joinId.slice(-3)}` : undefined,
        id_hash: joinId ? `${joinId}_hash` : undefined,
        ward_filed_id: 'a0000001-0000-0000-0000-000000000001',
        ward_name: joinWard,
        support_level: 'strong_supporter',
        issues: ['Community Leadership'],
        needs_transport: false,
        has_pvc: true,
        source: 'self_registered',
        verification_status: joinId ? 'unverified' : 'pending_id',
        captured_on: new Date().toISOString().split('T')[0],
        mobilizer_name: `Referred by ${referralCode}`,
        flags: []
      });
    }

    setJoinSubmitted(true);
  };

  // Simulated leaderboard excluding legacy_import
  const leaderboard = [
    { rank: 1, name: 'Zainab (Sheywe)', referrals: 48, idRate: '88%' },
    { rank: 2, name: 'Mildred (Mahiakalo)', referrals: 42, idRate: '81%' },
    { rank: 3, name: `${mobilizerName} (You)`, referrals: 29, idRate: '84%' },
    { rank: 4, name: 'Erick (Shirere)', referrals: 26, idRate: '75%' },
    { rank: 5, name: 'Cornelius (Butsotso East)', referrals: 19, idRate: '69%' }
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-emerald-800 to-teal-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-2 text-center md:text-left">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-200 text-xs font-bold uppercase tracking-wider">
            Grassroots Mobilizer Tool
          </span>
          <h3 className="text-xl sm:text-2xl font-black">
            My Referral Link & Share Kit
          </h3>
          <p className="text-xs sm:text-sm text-emerald-100/90 max-w-xl leading-relaxed">
            Every voter who registers through your link or QR code is automatically credited to your quota under <code className="bg-emerald-950/60 px-1 py-0.5 rounded font-mono">source = self_registered</code>.
          </p>
          <div className="pt-2 flex items-center justify-center md:justify-start gap-3">
            <span className="text-xs text-emerald-200 font-semibold">Your Referral Code:</span>
            <span className="px-3 py-1 rounded-lg bg-white text-emerald-950 font-black font-mono text-base shadow-sm">
              {referralCode}
            </span>
          </div>
        </div>

        {/* QR Code Container */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xl flex flex-col items-center shrink-0">
          {qrCodeDataUrl ? (
            <img src={qrCodeDataUrl} alt="Mobilizer QR Code" className="w-40 h-40 rounded-lg" />
          ) : (
            <div className="w-40 h-40 bg-gray-100 rounded-lg flex items-center justify-center text-xs text-gray-400">
              Generating QR...
            </div>
          )}
          <span className="text-[10px] text-gray-500 font-mono mt-1">Scan to Join Lurambi 2027</span>
        </div>
      </div>

      {/* Sharing Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* WhatsApp Share Card */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
              <Share2 className="w-4 h-4 text-emerald-700" />
              WhatsApp Share
            </h4>
            <div className="flex rounded-md bg-gray-100 p-0.5 text-[10px] font-bold">
              <button
                onClick={() => setLang('en')}
                className={`px-1.5 py-0.5 rounded ${lang === 'en' ? 'bg-white shadow-2xs text-emerald-900' : 'text-gray-500'}`}
              >
                EN
              </button>
              <button
                onClick={() => setLang('sw')}
                className={`px-1.5 py-0.5 rounded ${lang === 'sw' ? 'bg-white shadow-2xs text-emerald-900' : 'text-gray-500'}`}
              >
                SW
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-600 bg-gray-50 p-3 rounded-lg font-sans italic border border-gray-100">
            "{whatsappMessage}"
          </p>

          <div className="flex gap-2 pt-1">
            <button
              onClick={shareToWhatsapp}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
            >
              <Send className="w-3.5 h-3.5" />
              Share to WhatsApp
            </button>
            <button
              onClick={copyWhatsappText}
              className="py-2 px-2.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold"
              title="Copy text"
            >
              {copiedMessage ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Copy Link Card */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
            <Copy className="w-4 h-4 text-emerald-700" />
            Public Join Link
          </h4>
          <p className="text-xs text-gray-500">
            Share this link via SMS, Facebook groups, or community meetings:
          </p>
          <div className="p-2.5 rounded-lg bg-gray-50 border border-gray-200 text-xs font-mono truncate text-gray-800">
            {referralUrl}
          </div>
          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="flex-1 py-2 px-3 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-1.5"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedLink ? 'Copied URL!' : 'Copy Join Link'}
            </button>
            <button
              onClick={() => {
                setJoinSubmitted(false);
                setShowPublicModal(true);
              }}
              className="py-2 px-3 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 text-xs font-bold"
            >
              Preview Page
            </button>
          </div>
        </div>

        {/* Leaderboard Card */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-gray-100">
            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-500" />
              Mobilizer Leaderboard
            </h4>
            <span className="text-[10px] text-gray-500 font-semibold">Excludes Legacy</span>
          </div>

          <div className="space-y-1.5 text-xs">
            {leaderboard.map(item => (
              <div
                key={item.rank}
                className={`flex items-center justify-between p-1.5 rounded-lg ${
                  item.name.includes('(You)') ? 'bg-emerald-50 font-bold text-emerald-950 border border-emerald-200' : 'text-gray-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${item.rank <= 3 ? 'bg-amber-100 text-amber-900' : 'bg-gray-100 text-gray-600'}`}>
                    {item.rank}
                  </span>
                  <span className="truncate max-w-[120px]">{item.name}</span>
                </div>
                <div className="flex items-center gap-3 font-mono text-[11px]">
                  <span>{item.referrals} voters</span>
                  <span className="text-gray-500">{item.idRate} ID</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Public Landing Page Simulator Modal */}
      {showPublicModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white font-bold flex items-center justify-center text-xs">
                  L27
                </div>
                <div>
                  <h4 className="font-bold text-sm text-gray-900">
                    Public Supporter Join Page
                  </h4>
                  <span className="text-[10px] text-emerald-700 font-mono">
                    Referral: {referralCode}
                  </span>
                </div>
              </div>

              {/* Language Switcher */}
              <div className="flex rounded-md bg-gray-100 p-0.5 text-xs font-bold">
                <button
                  onClick={() => setLang('en')}
                  className={`px-2 py-0.5 rounded ${lang === 'en' ? 'bg-white shadow-2xs text-emerald-900' : 'text-gray-500'}`}
                >
                  English
                </button>
                <button
                  onClick={() => setLang('sw')}
                  className={`px-2 py-0.5 rounded ${lang === 'sw' ? 'bg-white shadow-2xs text-emerald-900' : 'text-gray-500'}`}
                >
                  Kiswahili
                </button>
              </div>
            </div>

            {!joinSubmitted ? (
              <form onSubmit={handleSelfRegister} className="space-y-3 text-xs">
                {/* Honeypot field for bot spam prevention */}
                <input
                  type="text"
                  name="website_url"
                  value={honeypot}
                  onChange={e => setHoneypot(e.target.value)}
                  className="hidden"
                  tabIndex={-1}
                  autoComplete="off"
                />

                <div>
                  <label className="font-bold text-gray-700 block mb-1">
                    {lang === 'en' ? 'Full Legal Name *' : 'Jina Kamili *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={joinName}
                    onChange={e => setJoinName(e.target.value)}
                    placeholder="e.g. Silvia Wekesa"
                    className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">
                      {lang === 'en' ? 'Mobile Phone *' : 'Nambari ya Simu *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={joinPhone}
                      onChange={e => setJoinPhone(e.target.value)}
                      placeholder="07XXXXXXXX"
                      className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white font-mono"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-gray-700 block mb-1">
                      {lang === 'en' ? 'National ID Number' : 'Nambari ya Kitambulisho'}
                    </label>
                    <input
                      type="text"
                      value={joinId}
                      onChange={e => setJoinId(e.target.value)}
                      placeholder="7 or 8 digits"
                      className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="font-bold text-gray-700 block mb-1">
                    {lang === 'en' ? 'Your Ward in Lurambi' : 'Wodi Yako Katika Lurambi'}
                  </label>
                  <select
                    value={joinWard}
                    onChange={e => setJoinWard(e.target.value)}
                    className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white"
                  >
                    <option value="Sheywe">Sheywe Ward</option>
                    <option value="Shirere">Shirere Ward</option>
                    <option value="Mahiakalo">Mahiakalo Ward</option>
                    <option value="Butsotso East">Butsotso East Ward</option>
                    <option value="Butsotso South">Butsotso South Ward</option>
                    <option value="Butsotso Central">Butsotso Central Ward</option>
                  </select>
                </div>

                {/* Consent checkbox */}
                <div className="p-3 rounded-xl border border-emerald-300 bg-emerald-50/40 text-[11px] leading-snug space-y-1">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      required
                      checked={joinConsent}
                      onChange={e => setJoinConsent(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-700"
                    />
                    <span className="text-gray-700">
                      {lang === 'en'
                        ? 'I consent to receiving grassroots campaign updates and election reminders under the Kenya Data Protection Act 2019.'
                        : 'Ninakubali kupokea ujumbe wa kampeni na vikumbusho vya uchaguzi kulingana na Sheria ya Kulinda Data ya Kenya 2019.'}
                    </span>
                  </label>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowPublicModal(false)}
                    className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-2 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-md shadow-emerald-900/10"
                  >
                    {lang === 'en' ? 'Pledge Support' : 'Thibitisha Uungaji Mkono'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center space-y-3 py-4">
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h5 className="font-bold text-base text-gray-900">
                  {lang === 'en' ? 'Thank You for Registering!' : 'Asante kwa Kujisajili!'}
                </h5>
                <p className="text-xs text-gray-600">
                  {lang === 'en'
                    ? `Your registration has been linked to Mobilizer ${referralCode}. Tuko Pamoja 2027!`
                    : `Usajili wako umehusishwa na Mhamasishaji ${referralCode}. Tuko Pamoja 2027!`}
                </p>
                <button
                  onClick={() => setShowPublicModal(false)}
                  className="w-full py-2.5 rounded-xl bg-gray-800 text-white font-bold text-xs"
                >
                  Close Preview
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
