import React, { useState, useEffect } from 'react';
import { 
  Search, 
  UserPlus, 
  ShieldAlert, 
  CheckCircle2, 
  MapPin, 
  Phone, 
  CreditCard, 
  Vote, 
  Sparkles, 
  AlertCircle, 
  ArrowRight, 
  Save, 
  WifiOff, 
  Wifi, 
  Check, 
  Lock, 
  Info,
  Car,
  FileText
} from 'lucide-react';
import { CANONICAL_WARDS, CANONICAL_CENTRES, CANONICAL_STATIONS } from '../../data/canonicalData.ts';
import { normaliseKenyanPhone } from '../../lib/normalisation/phone.ts';
import { normaliseNationalId } from '../../lib/normalisation/nationalId.ts';
import { detectDuplicate } from '../../lib/duplicate/duplicateDetector.ts';
import { enqueueOfflineEntry } from '../../lib/offline/offlineQueue.ts';
import { Entry, SupportLevel } from '../../types/index.ts';

const ISSUES_LIST = [
  'CDF Bursaries & Education',
  'Rural Feeder Roads',
  'Clean Piped Water',
  'Youth Unemployment',
  'Health Dispensaries & Drugs',
  'Agriculture & Fertilizer',
  'Electricity Connectivity',
  'Market Stalls & Trade'
];

interface CaptureWizardProps {
  existingEntries: Entry[];
  onEntryAdded: (newEntry: Entry) => void;
  isSimulatedOffline: boolean;
}

export const CaptureWizard: React.FC<CaptureWizardProps> = ({
  existingEntries,
  onEntryAdded,
  isSimulatedOffline
}) => {
  // Step navigation: 1: Search, 2: Ward Bucket, 3: Voter Details & Consent, 4: Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Entry[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [idRaw, setIdRaw] = useState('');
  const [selectedWardId, setSelectedWardId] = useState(CANONICAL_WARDS[0].id);
  const [selectedCentreId, setSelectedCentreId] = useState('');
  const [selectedStationId, setSelectedStationId] = useState('');
  const [supportLevel, setSupportLevel] = useState<SupportLevel>('strong_supporter');
  const [selectedIssues, setSelectedIssues] = useState<string[]>(['CDF Bursaries & Education', 'Clean Piped Water']);
  const [needsTransport, setNeedsTransport] = useState(false);
  const [hasPvc, setHasPvc] = useState(true);
  const [notes, setNotes] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);

  // Duplicate warning modal state
  const [duplicateWarning, setDuplicateWarning] = useState<any | null>(null);
  const [showSkipIdModal, setShowSkipIdModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submittedEntry, setSubmittedEntry] = useState<Entry | null>(null);

  // Filter centres and stations based on selected ward
  const availableCentres = CANONICAL_CENTRES.filter(c => c.ward_id === selectedWardId);
  const availableStations = CANONICAL_STATIONS.filter(s => s.polling_centre_id === selectedCentreId);

  // Auto-select first centre when ward changes
  useEffect(() => {
    if (availableCentres.length > 0 && !availableCentres.some(c => c.id === selectedCentreId)) {
      setSelectedCentreId(availableCentres[0].id);
    }
  }, [selectedWardId]);

  // Auto-select first station when centre changes
  useEffect(() => {
    if (availableStations.length > 0) {
      setSelectedStationId(availableStations[0].id);
    } else {
      setSelectedStationId('');
    }
  }, [selectedCentreId]);

  // Debounced search with 10-result limit (Anti-scraping)
  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    const timer = setTimeout(() => {
      const q = searchQuery.toLowerCase().trim();
      const results = existingEntries
        .filter(e => 
          e.name.toLowerCase().includes(q) || 
          (e.phone_e164 && e.phone_e164.includes(q)) ||
          (e.id_masked && e.id_masked.includes(q))
        )
        .slice(0, 10); // Capped to max 10 to prevent bulk scraping
      setSearchResults(results);
      setIsSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery, existingEntries]);

  // Handle Issue toggle
  const toggleIssue = (issue: string) => {
    if (selectedIssues.includes(issue)) {
      setSelectedIssues(selectedIssues.filter(i => i !== issue));
    } else {
      if (selectedIssues.length < 4) {
        setSelectedIssues([...selectedIssues, issue]);
      }
    }
  };

  // Submit Handler
  const handleFinalSubmit = async () => {
    if (!name.trim()) return;
    if (!consentAccepted) return;

    setSubmitting(true);

    const phoneRes = normaliseKenyanPhone(phoneRaw);
    const idRes = normaliseNationalId(idRaw);

    const ward = CANONICAL_WARDS.find(w => w.id === selectedWardId) || CANONICAL_WARDS[0];
    const centre = CANONICAL_CENTRES.find(c => c.id === selectedCentreId);
    const station = CANONICAL_STATIONS.find(s => s.id === selectedStationId);

    // Duplicate Check
    const dupCheck = detectDuplicate(
      {
        name,
        phone_e164: phoneRes.phone_e164,
        id_hash: idRes.idHash,
        polling_centre_id: selectedCentreId,
        polling_station_id: selectedStationId,
        ward_filed_id: selectedWardId
      },
      existingEntries
    );

    if (dupCheck.isDuplicate) {
      setDuplicateWarning(dupCheck);
      setSubmitting(false);
      return;
    }

    const flags: string[] = [];
    if (idRes.status === 'missing') flags.push('MISSING_ID');
    if (!phoneRes.isValid) flags.push('INVALID_PHONE');
    if (dupCheck.isPossibleDuplicate) flags.push('POSSIBLE_DUPLICATE');

    const newEntry: Entry = {
      id: `ent-${Date.now()}`,
      name: name.trim(),
      phone_e164: phoneRes.phone_e164 || undefined,
      id_masked: idRes.maskedId || undefined,
      id_hash: idRes.idHash || undefined,
      ward_filed_id: selectedWardId,
      ward_name: ward.name,
      polling_centre_id: selectedCentreId || undefined,
      polling_centre_name: centre?.name || undefined,
      polling_station_id: selectedStationId || undefined,
      polling_station_name: station?.station_name || undefined,
      support_level: supportLevel,
      issues: selectedIssues,
      needs_transport: needsTransport,
      has_pvc: hasPvc,
      notes: notes.trim() || undefined,
      consent_at: new Date().toISOString(),
      consent_text_version: 'v1.2-2027',
      consent_status: 'given',
      source: 'mobilizer',
      verification_status: idRes.isValid ? 'unverified' : 'pending_id',
      captured_on: new Date().toISOString().split('T')[0],
      mobilizer_name: 'Current Mobilizer',
      flags
    };

    if (isSimulatedOffline) {
      // Save directly to IndexedDB Offline Queue
      await enqueueOfflineEntry({
        capturedOn: newEntry.captured_on,
        name: newEntry.name,
        phone_e164: newEntry.phone_e164 || null,
        national_id_raw: idRaw || null,
        national_id_masked: newEntry.id_masked || null,
        national_id_hash: newEntry.id_hash || null,
        ward_filed_id: newEntry.ward_filed_id,
        ward_name: newEntry.ward_name,
        polling_centre_id: newEntry.polling_centre_id || null,
        polling_centre_name: newEntry.polling_centre_name || null,
        polling_station_id: newEntry.polling_station_id || null,
        polling_station_name: newEntry.polling_station_name || null,
        support_level: newEntry.support_level,
        issues: newEntry.issues,
        needs_transport: newEntry.needs_transport,
        has_pvc: newEntry.has_pvc,
        notes: newEntry.notes || '',
        consent_at: newEntry.consent_at || new Date().toISOString(),
        consent_text_version: newEntry.consent_text_version || 'v1.2-2027',
        mobilizer_id: 'mob-curr',
        mobilizer_name: 'Current Mobilizer'
      });
    } else {
      // Direct commit
      onEntryAdded(newEntry);
    }

    setSubmittedEntry(newEntry);
    setSubmitting(false);
    setStep(4);
  };

  const resetForm = () => {
    setName('');
    setPhoneRaw('');
    setIdRaw('');
    setNotes('');
    setConsentAccepted(false);
    setSearchQuery('');
    setDuplicateWarning(null);
    setStep(1);
  };

  return (
    <div className="max-w-md mx-auto space-y-4 pb-12">
      {/* Offline Status Badge */}
      {isSimulatedOffline && (
        <div className="p-3 rounded-xl bg-amber-500 text-white text-xs font-bold flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 animate-pulse" />
            <span>OFFLINE MODE ACTIVE (Weak Signal Area)</span>
          </div>
          <span className="text-[10px] bg-amber-700/60 px-2 py-0.5 rounded">IndexedDB Queue</span>
        </div>
      )}

      {/* STEP 1: Fast Anti-Scraping Search */}
      {step === 1 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
          <div>
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Step 1 of 3</span>
            <h3 className="text-base font-extrabold text-gray-900 mt-0.5">
              Check Existing Register & Supporters
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Search by name, ID or phone number to check if voter has already been registered.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Type name, phone or ID (min 3 chars)..."
              className="w-full pl-9 pr-3 py-2.5 text-xs rounded-xl border border-gray-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 outline-hidden bg-gray-50/50"
            />
          </div>

          {/* Search Results / Empty State */}
          {searchQuery.trim().length >= 3 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[11px] text-gray-500 font-medium">
                <span>Search Matches ({searchResults.length} / max 10):</span>
                {isSearching && <span className="text-emerald-600">Searching...</span>}
              </div>

              {searchResults.length > 0 ? (
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {searchResults.map(result => (
                    <div
                      key={result.id}
                      className="p-2.5 rounded-lg border border-amber-200 bg-amber-50/60 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-gray-900">{result.name}</div>
                        <div className="text-[11px] text-gray-500">
                          {result.ward_name} • {result.id_masked || 'No ID'} • {result.phone_e164 || 'No phone'}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-200 text-amber-900">
                        Already Registered
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>No existing supporter found matching "{searchQuery}". You can register them!</span>
                </div>
              )}
            </div>
          )}

          {/* Action to Proceed */}
          <button
            onClick={() => {
              if (searchQuery.trim().length > 0 && !name) {
                setName(searchQuery.trim());
              }
              setStep(2);
            }}
            className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md shadow-emerald-900/10 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Register New Supporter</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* STEP 2: Pick Ward Bucket */}
      {step === 2 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
          <div>
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Step 2 of 3</span>
            <h3 className="text-base font-extrabold text-gray-900 mt-0.5">
              Select Ward Filing Bucket
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Field mobilizers may capture voters in any ward. Defaults to voter's residence ward.
            </p>
          </div>

          {/* 6 Wards Radio Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {CANONICAL_WARDS.map(ward => {
              const isSelected = ward.id === selectedWardId;
              return (
                <button
                  key={ward.id}
                  onClick={() => setSelectedWardId(ward.id)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600/20 font-bold'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <div className="text-[10px] text-emerald-700 font-mono">{ward.code}</div>
                  <div className="text-xs mt-0.5 truncate">{ward.name}</div>
                </button>
              );
            })}
          </div>

          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="flex-2 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-md shadow-emerald-900/10 flex items-center justify-center gap-1.5"
            >
              <span>Continue to Voter Details</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: Voter Details & Consent */}
      {step === 3 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-4">
          <div>
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Step 3 of 3</span>
            <h3 className="text-base font-extrabold text-gray-900 mt-0.5">
              Voter Details & Mandatory Consent
            </h3>
          </div>

          {/* Form fields */}
          <div className="space-y-3 text-xs">
            {/* Full Name */}
            <div>
              <label className="font-bold text-gray-700 block mb-1">Full Name (As on ID) *</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="e.g. Barasa Wekesa"
                className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white focus:border-emerald-600 outline-hidden"
              />
            </div>

            {/* National ID with Strong Prompt */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-gray-700">National ID Number</label>
                <span className="text-[10px] text-emerald-700 font-semibold">Targets 100% ID capture</span>
              </div>
              <input
                type="text"
                value={idRaw}
                onChange={e => setIdRaw(e.target.value)}
                placeholder="7 or 8 digits (e.g. 28491023)"
                className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white focus:border-emerald-600 outline-hidden font-mono"
              />
              {!idRaw && (
                <p className="text-[11px] text-amber-700 mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  If left blank, voter imports as "pending_id" and cannot be verified on the register.
                </p>
              )}
            </div>

            {/* Mobile Phone */}
            <div>
              <label className="font-bold text-gray-700 block mb-1">Phone Number *</label>
              <input
                type="text"
                value={phoneRaw}
                onChange={e => setPhoneRaw(e.target.value)}
                placeholder="e.g. 0712345678 or 712345678"
                className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white focus:border-emerald-600 outline-hidden font-mono"
              />
              {phoneRaw && (
                <div className="text-[11px] text-emerald-700 mt-1">
                  Normalises to: <strong>{normaliseKenyanPhone(phoneRaw).phone_e164 || 'Invalid format'}</strong>
                </div>
              )}
            </div>

            {/* Polling Centre Dropdown */}
            <div>
              <label className="font-bold text-gray-700 block mb-1">Polling Centre</label>
              <select
                value={selectedCentreId}
                onChange={e => setSelectedCentreId(e.target.value)}
                className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white text-xs"
              >
                {availableCentres.map(centre => (
                  <option key={centre.id} value={centre.id}>
                    {centre.name} ({centre.code})
                  </option>
                ))}
              </select>
            </div>

            {/* Support Level Enum */}
            <div>
              <label className="font-bold text-gray-700 block mb-1">Support Level</label>
              <select
                value={supportLevel}
                onChange={e => setSupportLevel(e.target.value as SupportLevel)}
                className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white text-xs"
              >
                <option value="strong_supporter">Strong Supporter (Confirmed Vote)</option>
                <option value="leaning">Leaning (Warm towards candidate)</option>
                <option value="undecided">Undecided (Persuadable)</option>
                <option value="opposed">Opposed (Alternative candidate)</option>
                <option value="not_reached">Not Reached (Follow-up needed)</option>
              </select>
            </div>

            {/* Top Local Issues (Multi-select) */}
            <div>
              <label className="font-bold text-gray-700 block mb-1.5">Top Priority Issues (Max 3)</label>
              <div className="flex flex-wrap gap-1.5">
                {ISSUES_LIST.map(issue => {
                  const isChecked = selectedIssues.includes(issue);
                  return (
                    <button
                      key={issue}
                      type="button"
                      onClick={() => toggleIssue(issue)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                        isChecked
                          ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                          : 'bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200'
                      }`}
                    >
                      {issue}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Election Day Readiness Toggles */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="p-2.5 rounded-xl border border-gray-200 flex items-center gap-2 cursor-pointer bg-gray-50/50">
                <input
                  type="checkbox"
                  checked={needsTransport}
                  onChange={e => setNeedsTransport(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span className="text-[11px] font-medium text-gray-800">Needs Election Transit</span>
              </label>

              <label className="p-2.5 rounded-xl border border-gray-200 flex items-center gap-2 cursor-pointer bg-gray-50/50">
                <input
                  type="checkbox"
                  checked={hasPvc}
                  onChange={e => setHasPvc(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span className="text-[11px] font-medium text-gray-800">Has PVC / ID in Hand</span>
              </label>
            </div>

            {/* Mandatory Kenya Data Protection Act 2019 Consent */}
            <div className="p-3 rounded-xl border-2 border-emerald-500/50 bg-emerald-50/30 space-y-2 mt-2">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={e => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-700 shrink-0"
                />
                <span className="text-[11px] text-gray-700 leading-snug">
                  <strong>Mandatory Consent (KDPA 2019):</strong> I confirm the voter has provided explicit consent to be contacted regarding the 2027 Lurambi MP campaign under policy version <strong>v1.2-2027</strong>.
                </span>
              </label>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50"
            >
              Back
            </button>
            <button
              disabled={!name.trim() || !consentAccepted || submitting}
              onClick={handleFinalSubmit}
              className={`flex-2 py-3 rounded-xl text-white text-xs font-bold shadow-md flex items-center justify-center gap-2 transition-all ${
                !name.trim() || !consentAccepted || submitting
                  ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                  : 'bg-emerald-700 hover:bg-emerald-800 shadow-emerald-900/20'
              }`}
            >
              <Save className="w-4 h-4" />
              <span>{isSimulatedOffline ? 'Save to Offline Queue' : 'Submit & Lock Entry'}</span>
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Success Confirmation */}
      {step === 4 && submittedEntry && (
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center space-y-5 shadow-xs">
          <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-xs">
            <CheckCircle2 className="w-8 h-8 text-emerald-600" />
          </div>

          <div>
            <h3 className="text-lg font-extrabold text-gray-900">
              Supporter Registered Successfully!
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              {isSimulatedOffline 
                ? 'Entry stored in IndexedDB. Will auto-sync when network returns.' 
                : 'Entry locked into campaign database.'}
            </p>
          </div>

          {/* Summary Box */}
          <div className="p-3.5 rounded-xl bg-gray-50 border border-gray-200 text-left text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-gray-500">Name:</span>
              <strong className="text-gray-900">{submittedEntry.name}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Masked ID:</span>
              <strong className="font-mono">{submittedEntry.id_masked || 'PENDING ID'}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Ward & Centre:</span>
              <span>{submittedEntry.ward_name} ({submittedEntry.polling_centre_name})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Support Level:</span>
              <span className="capitalize font-semibold text-emerald-800">{submittedEntry.support_level.replace('_', ' ')}</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-[11px] text-slate-600 leading-snug flex items-center gap-2">
            <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
            <span>Under campaign security rules & Postgres RLS, this entry cannot be edited or deleted after submission.</span>
          </div>

          <button
            onClick={resetForm}
            className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-md shadow-emerald-900/10 flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            <span>Add Another Supporter</span>
          </button>
        </div>
      )}

      {/* Duplicate Warning Modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center mx-auto">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div className="text-center">
              <h4 className="font-extrabold text-base text-gray-900">
                Duplicate Voter Detected!
              </h4>
              <p className="text-xs text-rose-700 font-semibold mt-1">
                {duplicateWarning.matchReason}
              </p>
            </div>

            {duplicateWarning.matchedEntry && (
              <div className="p-3 rounded-xl bg-gray-50 border border-gray-200 text-xs space-y-1.5 text-left">
                <div className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Existing Record</div>
                <div className="font-bold text-gray-900">{duplicateWarning.matchedEntry.name}</div>
                <div className="text-gray-600">ID: <code className="font-mono">{duplicateWarning.matchedEntry.maskedId}</code></div>
                <div className="text-gray-600">First Captured: {duplicateWarning.matchedEntry.capturedOn}</div>
                <div className="text-gray-600">Mobilizer: {duplicateWarning.matchedEntry.capturedByMobilizerName}</div>
              </div>
            )}

            <div className="text-[11px] text-gray-500 leading-snug">
              Mobilizers receive 0 points for duplicate records. An event has been logged in <code className="bg-gray-100 px-1 rounded">duplicate_attempts</code>.
            </div>

            <button
              onClick={() => setDuplicateWarning(null)}
              className="w-full py-2.5 rounded-xl bg-gray-800 text-white font-bold text-xs hover:bg-gray-900"
            >
              Dismiss & Return
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
