import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Copy, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Download, 
  FileCheck2, 
  Lock, 
  Radio, 
  Users, 
  Layers, 
  Sparkles,
  ArrowRight,
  Filter,
  Info
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { detectDuplicate, DuplicateCheckParams, DuplicateCheckResult } from '../../lib/duplicate/duplicateDetector.ts';
import { verificationEngine, SAMPLE_IEBC_REGISTER, VerificationResult } from '../../lib/verification/index.ts';
import { Entry, VerificationStatus } from '../../types/index.ts';
import { CANONICAL_WARDS, CANONICAL_CENTRES } from '../../data/canonicalData.ts';

// Seed entries for simulator
const SIMULATOR_EXISTING_ENTRIES: Entry[] = [
  {
    id: 'ent-01',
    name: 'Barasa Wekesa Synthetic',
    phone_e164: '+254712345678',
    id_masked: '28***023',
    id_hash: '28491023_hash',
    ward_filed_id: 'a0000001-0000-0000-0000-000000000001',
    ward_name: 'Sheywe',
    polling_centre_id: 'b0000001-0000-0000-0000-000000000001',
    polling_centre_name: 'Kakamega Primary School',
    support_level: 'strong_supporter',
    issues: ['Water Access', 'Youth Jobs'],
    needs_transport: false,
    has_pvc: true,
    source: 'legacy',
    verification_status: 'verified',
    captured_on: '2024-03-12',
    mobilizer_name: 'Zainab (Legacy Mobilizer)',
    flags: []
  },
  {
    id: 'ent-02',
    name: 'Kennedy Musundi Test',
    phone_e164: '+254720123456',
    id_masked: '27***930',
    id_hash: '27182930_hash',
    ward_filed_id: 'a0000001-0000-0000-0000-000000000001',
    ward_name: 'Sheywe',
    polling_centre_id: 'b0000001-0000-0000-0000-000000000001',
    polling_centre_name: 'Kakamega Primary School',
    support_level: 'strong_supporter',
    issues: ['Roads'],
    needs_transport: true,
    has_pvc: true,
    source: 'mobilizer',
    verification_status: 'verified',
    captured_on: '2024-02-10',
    mobilizer_name: 'Erick Mobilizer',
    flags: []
  },
  {
    id: 'ent-03',
    name: 'Nafuna Makokha Demo',
    phone_e164: '+254705961838',
    id_masked: undefined,
    id_hash: undefined, // Pending ID!
    ward_filed_id: 'a0000001-0000-0000-0000-000000000001',
    ward_name: 'Sheywe',
    polling_centre_id: 'b0000001-0000-0000-0000-000000000002',
    polling_centre_name: 'Bukhungu Stadium Grounds',
    support_level: 'leaning',
    issues: ['Markets'],
    needs_transport: false,
    has_pvc: false,
    source: 'legacy',
    verification_status: 'pending_id',
    captured_on: '2024-03-12',
    mobilizer_name: 'Mildred (Legacy Mobilizer)',
    flags: ['MISSING_ID']
  }
];

export const VerificationLogicView: React.FC = () => {
  const [subTab, setSubTab] = useState<'duplicate_detector' | 'verification_providers' | 'verification_queue'>('duplicate_detector');

  // Duplicate simulator state
  const [testName, setTestName] = useState('Barasa Wekesa Synthetic');
  const [testId, setTestId] = useState('28491023');
  const [testPhone, setTestPhone] = useState('+254712345678');
  const [testWardId, setTestWardId] = useState('a0000001-0000-0000-0000-000000000001');
  const [testCentreId, setTestCentreId] = useState('b0000001-0000-0000-0000-000000000001');
  const [duplicateResult, setDuplicateResult] = useState<DuplicateCheckResult | null>(() => {
    return detectDuplicate(
      {
        name: 'Barasa Wekesa Synthetic',
        id_hash: '28491023_hash',
        phone_e164: '+254712345678',
        ward_filed_id: 'a0000001-0000-0000-0000-000000000001',
        polling_centre_id: 'b0000001-0000-0000-0000-000000000001'
      },
      SIMULATOR_EXISTING_ENTRIES
    );
  });

  // Verification simulator state
  const [activeProviderTab, setActiveProviderTab] = useState<'register_import' | 'manual' | 'external_link'>('register_import');
  const [selectedEntryToVerify, setSelectedEntryToVerify] = useState<string>('ent-01');
  const [manualStatusChoice, setManualStatusChoice] = useState<VerificationStatus>('verified');
  const [manualEvidenceNote, setManualEvidenceNote] = useState('Checked via official IEBC web portal on 2026-10-22. Voter active.');
  const [verificationOutput, setVerificationOutput] = useState<VerificationResult | null>(null);

  // Run duplicate check in simulator
  const handleRunDuplicateCheck = (preset?: 'exact_id' | 'fuzzy_no_id' | 'shared_phone' | 'unique_person') => {
    let name = testName;
    let id = testId;
    let phone = testPhone;
    let ward = testWardId;
    let centre = testCentreId;

    if (preset === 'exact_id') {
      name = 'Barasa Wekesa Different Name';
      id = '28491023'; // Matches existing Barasa's ID!
      phone = '+254799000111';
      setTestName(name);
      setTestId(id);
      setTestPhone(phone);
    } else if (preset === 'fuzzy_no_id') {
      name = 'Nafuna Makokha Demo'; // Matches ent-03 with missing ID!
      id = '';
      phone = '+254705961838';
      centre = 'b0000001-0000-0000-0000-000000000002';
      setTestName(name);
      setTestId(id);
      setTestPhone(phone);
      setTestCentreId(centre);
    } else if (preset === 'shared_phone') {
      name = 'Mama Wekesa (Family Member)';
      id = '39102948'; // Different ID
      phone = '+254712345678'; // Same phone as Barasa (Handset shared in family)
      setTestName(name);
      setTestId(id);
      setTestPhone(phone);
    } else if (preset === 'unique_person') {
      name = 'Silas Mulama Fresh';
      id = '44556677';
      phone = '+254788112233';
      setTestName(name);
      setTestId(id);
      setTestPhone(phone);
    }

    const res = detectDuplicate(
      {
        name,
        id_hash: id ? `${id}_hash` : null,
        phone_e164: phone || null,
        ward_filed_id: ward,
        polling_centre_id: centre
      },
      SIMULATOR_EXISTING_ENTRIES
    );
    setDuplicateResult(res);
  };

  // Run verification test
  const handleExecuteVerification = async () => {
    const entry = SIMULATOR_EXISTING_ENTRIES.find(e => e.id === selectedEntryToVerify);
    if (!entry) return;

    if (activeProviderTab === 'manual') {
      const manualProv = verificationEngine.getProvider('manual') as any;
      manualProv.recordManualVerification({
        entryId: entry.id,
        newStatus: manualStatusChoice,
        evidenceNote: manualEvidenceNote,
        verifiedByUserId: 'admin-01',
        verifiedByUserName: 'Campaign Admin'
      });
    }

    verificationEngine.setActiveProvider(activeProviderTab);
    const result = await verificationEngine.verifyEntry({
      entryId: entry.id,
      name: entry.name,
      nationalIdHash: entry.id_hash,
      rawNationalId: entry.id_masked ? entry.id_masked.replace(/\*/g, '4') : undefined,
      wardId: entry.ward_filed_id,
      wardName: entry.ward_name,
      pollingCentreId: entry.polling_centre_id,
      pollingCentreName: entry.polling_centre_name
    });

    setVerificationOutput(result);
  };

  // Download "To Verify" Sheet for field verifiers
  const handleDownloadToVerifySheet = () => {
    const wb = XLSX.utils.book_new();

    const headers = [
      ['Lurambi Campaign Field Platform - Official "To Verify" Register Sheet'],
      ['Constituency: Lurambi', 'County: Kakamega', 'Date Generated:', new Date().toLocaleDateString()],
      ['Instructions: Use official channels to confirm registration status. Return marked sheet with status and notes.'],
      []
    ];

    const rows = SIMULATOR_EXISTING_ENTRIES.map(e => ({
      'Entry ID': e.id,
      'Full Name': e.name,
      'National ID (Masked)': e.id_masked || 'PENDING ID',
      'Phone': e.phone_e164 || 'N/A',
      'Filing Ward': e.ward_name,
      'Polling Centre': e.polling_centre_name || 'Unassigned',
      'Current Status': e.verification_status,
      'Official Status (verified / not_found / wrong_constituency)': '',
      'Official Voter #': '',
      'Verification Date': '',
      'Verifier Evidence Note / Signature': ''
    }));

    const ws = XLSX.utils.aoa_to_sheet(headers);
    XLSX.utils.sheet_add_json(ws, rows, { origin: 'A5' });
    XLSX.utils.book_append_sheet(wb, ws, 'To_Verify_Queue');

    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([new Uint8Array(out).buffer as ArrayBuffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lurambi_To_Verify_Official_Queue_${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-base text-gray-900">
              Stage 4: Deduplication Engine & Pluggable Verification Architecture
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Anti-Scraping Certified
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            Multi-factor duplicate blocking (exact ID hash + fuzzy trigram place anchoring) paired with a 
            3-adapter voter verification subsystem designed for unconfirmed data sources and zero automated web scraping.
          </p>
        </div>

        <button
          onClick={handleDownloadToVerifySheet}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs transition-colors shrink-0"
        >
          <Download className="w-3.5 h-3.5" />
          Download "To Verify" Sheet (XLSX)
        </button>
      </div>

      {/* Sub-Tab Navigation */}
      <div className="flex border-b border-gray-200 space-x-2 sm:space-x-4 overflow-x-auto text-xs sm:text-sm font-semibold">
        <button
          onClick={() => setSubTab('duplicate_detector')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            subTab === 'duplicate_detector'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <AlertTriangle className="w-4 h-4 text-emerald-600" />
          1. Duplicate & Possible-Duplicate Detector
        </button>
        <button
          onClick={() => setSubTab('verification_providers')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            subTab === 'verification_providers'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileCheck2 className="w-4 h-4 text-emerald-600" />
          2. Verification Provider Hub (3 Adapters)
        </button>
        <button
          onClick={() => setSubTab('verification_queue')}
          className={`py-2 px-3 border-b-2 flex items-center gap-1.5 whitespace-nowrap transition-colors ${
            subTab === 'verification_queue'
              ? 'border-emerald-700 text-emerald-800'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4 text-emerald-600" />
          3. Verification Queue & Field Workflow
        </button>
      </div>

      {/* TAB 1: Duplicate Detector Interactive Simulator */}
      {subTab === 'duplicate_detector' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Controls & Presets */}
          <div className="lg:col-span-1 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                Live Rule Presets
              </h4>
              <p className="text-xs text-gray-500">
                Test the deduplication logic against real edge cases:
              </p>

              <div className="space-y-2">
                <button
                  onClick={() => handleRunDuplicateCheck('exact_id')}
                  className="w-full p-2.5 rounded-lg border border-rose-200 bg-rose-50/50 hover:bg-rose-50 text-left text-xs font-semibold text-rose-950 flex items-center justify-between transition-colors"
                >
                  <span>1. Exact National ID Match</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-200 text-rose-900 font-bold">Blocking</span>
                </button>

                <button
                  onClick={() => handleRunDuplicateCheck('fuzzy_no_id')}
                  className="w-full p-2.5 rounded-lg border border-amber-200 bg-amber-50/50 hover:bg-amber-50 text-left text-xs font-semibold text-amber-950 flex items-center justify-between transition-colors"
                >
                  <span>2. Fuzzy Name Sim (≥0.85) + Place</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-900 font-bold">Pending ID</span>
                </button>

                <button
                  onClick={() => handleRunDuplicateCheck('shared_phone')}
                  className="w-full p-2.5 rounded-lg border border-teal-200 bg-teal-50/50 hover:bg-teal-50 text-left text-xs font-semibold text-teal-950 flex items-center justify-between transition-colors"
                >
                  <span>3. Shared Phone Test</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-200 text-teal-900 font-bold">Informational</span>
                </button>

                <button
                  onClick={() => handleRunDuplicateCheck('unique_person')}
                  className="w-full p-2.5 rounded-lg border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 text-left text-xs font-semibold text-emerald-950 flex items-center justify-between transition-colors"
                >
                  <span>4. Fresh Unique Voter</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-200 text-emerald-900 font-bold">Permitted</span>
                </button>
              </div>

              {/* Input Form */}
              <div className="pt-2 border-t border-gray-100 space-y-2 text-xs">
                <div>
                  <label className="font-semibold text-gray-700">Supporter Name</label>
                  <input
                    type="text"
                    value={testName}
                    onChange={e => setTestName(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-lg bg-gray-50 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700">National ID (optional)</label>
                  <input
                    type="text"
                    value={testId}
                    onChange={e => setTestId(e.target.value)}
                    placeholder="Leave empty for pending_id"
                    className="w-full mt-1 p-2 border rounded-lg bg-gray-50 focus:bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="font-semibold text-gray-700">Phone Number</label>
                  <input
                    type="text"
                    value={testPhone}
                    onChange={e => setTestPhone(e.target.value)}
                    className="w-full mt-1 p-2 border rounded-lg bg-gray-50 focus:bg-white font-mono"
                  />
                </div>
                <button
                  onClick={() => handleRunDuplicateCheck()}
                  className="w-full mt-2 py-2 rounded-lg bg-emerald-700 text-white font-bold hover:bg-emerald-800 transition-colors"
                >
                  Evaluate Duplicate Shield
                </button>
              </div>
            </div>
          </div>

          {/* Results Display */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
              <h4 className="font-bold text-sm text-gray-900 flex items-center justify-between">
                <span>Evaluation Result & Mobilizer Action</span>
                {duplicateResult?.isDuplicate ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                    <XCircle className="w-3.5 h-3.5" />
                    DUPLICATE (BLOCKING)
                  </span>
                ) : duplicateResult?.isPossibleDuplicate ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    POSSIBLE DUPLICATE (AMBER)
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    NO DUPLICATE (PERMITTED)
                  </span>
                )}
              </h4>

              {/* Status explanation card */}
              <div className={`p-4 rounded-xl border text-xs leading-relaxed space-y-2 ${
                duplicateResult?.isDuplicate 
                  ? 'bg-rose-50 border-rose-200 text-rose-950'
                  : duplicateResult?.isPossibleDuplicate
                  ? 'bg-amber-50 border-amber-200 text-amber-950'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-950'
              }`}>
                <div className="font-bold text-sm">
                  {duplicateResult?.isDuplicate && 'Mobilizer Submission Blocked (0 Points Credited)'}
                  {duplicateResult?.isPossibleDuplicate && 'Allowed with Warning Flag (Routed to Admin Flag Queue)'}
                  {!duplicateResult?.isDuplicate && !duplicateResult?.isPossibleDuplicate && 'Clean Entry Permitted'}
                </div>
                <p>
                  {duplicateResult?.matchReason || 'No conflicting voter record found in Lurambi database.'}
                </p>
                {testPhone === '+254712345678' && testId === '39102948' && (
                  <div className="mt-2 pt-2 border-t border-teal-200 font-semibold text-teal-900 flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5" />
                    <span>Shared Phone Safeguard Active: Family members sharing a mobile phone are not treated as duplicates. Flagged as SHARED_PHONE (informational only).</span>
                  </div>
                )}
              </div>

              {/* Matched Record Details (Masked) */}
              {duplicateResult?.matchedEntry && (
                <div className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 space-y-3">
                  <h5 className="font-bold text-xs uppercase tracking-wider text-gray-700">
                    Existing Record on File (Masked for Privacy)
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500 block">Existing Supporter:</span>
                      <strong className="text-gray-900">{duplicateResult.matchedEntry.name}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Masked ID:</span>
                      <strong className="font-mono">{duplicateResult.matchedEntry.maskedId || 'Pending ID'}</strong>
                    </div>
                    <div>
                      <span className="text-gray-500 block">Ward & Centre:</span>
                      <span>{duplicateResult.matchedEntry.wardName} ({duplicateResult.matchedEntry.pollingCentreName})</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block">First Captured By:</span>
                      <span className="text-emerald-800 font-semibold">{duplicateResult.matchedEntry.capturedByMobilizerName}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-gray-500 italic pt-1 border-t border-gray-200">
                    Audit log records <code className="bg-white px-1 py-0.5 rounded border">duplicate_attempts</code> event with IP and timestamp.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Verification Provider Hub */}
      {subTab === 'verification_providers' && (
        <div className="space-y-6">
          {/* Adapter Selection Tabs */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <button
              onClick={() => setActiveProviderTab('register_import')}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeProviderTab === 'register_import'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600/20'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-700 uppercase">Adapter 1</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Active</span>
              </div>
              <h5 className="font-bold text-sm text-gray-900 mt-1">register_import</h5>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Matches against internal <code className="bg-gray-100 px-1 py-0.5 rounded">voter_register</code> table populated from authorized IEBC CSV/XLSX extracts.
              </p>
            </button>

            <button
              onClick={() => setActiveProviderTab('manual')}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeProviderTab === 'manual'
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600/20'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-emerald-700 uppercase">Adapter 2</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">Active</span>
              </div>
              <h5 className="font-bold text-sm text-gray-900 mt-1">manual</h5>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Authorized verifier marks status with mandatory evidence justification and bulk results sheet upload.
              </p>
            </button>

            <button
              onClick={() => setActiveProviderTab('external_link')}
              className={`p-4 rounded-xl border text-left transition-all ${
                activeProviderTab === 'external_link'
                  ? 'border-amber-600 bg-amber-50 text-amber-950 ring-2 ring-amber-600/20'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-amber-700 uppercase">Adapter 3</span>
                <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">Disabled Stub</span>
              </div>
              <h5 className="font-bold text-sm text-gray-900 mt-1">external_link (Stub)</h5>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Dormant stub with documented endpoints, 5 req/min rate limit, and strict anti-scraping notice.
              </p>
            </button>
          </div>

          {/* Active Provider Execution Panel */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <FileCheck2 className="w-5 h-5 text-emerald-700" />
                <span>Test Provider: <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-emerald-900">{activeProviderTab}</code></span>
              </h4>
              <button
                onClick={handleExecuteVerification}
                className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white font-bold text-xs hover:bg-emerald-800 transition-colors shadow-xs"
              >
                Execute Verification Test
              </button>
            </div>

            {/* Adapter 3 Warning Banner */}
            {activeProviderTab === 'external_link' && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Lock className="w-4 h-4 text-amber-700" />
                  Statutory Safeguard & Anti-Scraping Policy
                </div>
                <p className="leading-relaxed">
                  The campaign candidate has reported having a link to verify registered voters, but its exact terms of use 
                  and legality remain unconfirmed. <strong>Do NOT scrape any website or automate queries against IEBC or third-party portals.</strong> 
                  Automated scraping of electoral infrastructure without written permission violates the Kenya Computer Misuse and Cybercrimes Act 2018. 
                  This adapter is dormant and restricted by an admin master kill-switch and a 5 req/min rate limit.
                </p>
              </div>
            )}

            {/* Select Supporter Record to Verify */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Select Supporter from Field List</label>
                <select
                  value={selectedEntryToVerify}
                  onChange={e => setSelectedEntryToVerify(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-gray-300 bg-white"
                >
                  {SIMULATOR_EXISTING_ENTRIES.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.id_masked || 'Pending ID'}) - {e.ward_name}
                    </option>
                  ))}
                </select>
              </div>

              {activeProviderTab === 'manual' && (
                <div className="space-y-2">
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">Manual Status Override</label>
                    <select
                      value={manualStatusChoice}
                      onChange={e => setManualStatusChoice(e.target.value as VerificationStatus)}
                      className="w-full p-2.5 rounded-lg border border-gray-300 bg-white"
                    >
                      <option value="verified">verified (Confirmed on roll)</option>
                      <option value="not_found">not_found (Not present)</option>
                      <option value="wrong_constituency">wrong_constituency (Registered outside Lurambi)</option>
                    </select>
                  </div>
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">Mandatory Audit Evidence Note</label>
                    <input
                      type="text"
                      value={manualEvidenceNote}
                      onChange={e => setManualEvidenceNote(e.target.value)}
                      placeholder="e.g. Checked via official IEBC channel on 2026-10-22"
                      className="w-full p-2 rounded-lg border border-gray-300"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Output Card */}
            {verificationOutput && (
              <div className="mt-4 p-4 rounded-xl border border-gray-200 bg-gray-50/60 space-y-2 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-gray-200">
                  <span className="font-bold text-gray-700">Verification Result:</span>
                  <span className={`px-2.5 py-0.5 rounded-full font-bold text-xs ${
                    verificationOutput.status === 'verified'
                      ? 'bg-emerald-100 text-emerald-800'
                      : verificationOutput.status === 'not_found'
                      ? 'bg-rose-100 text-rose-800'
                      : verificationOutput.status === 'wrong_constituency'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}>
                    {verificationOutput.status.toUpperCase()}
                  </span>
                </div>
                <div className="text-gray-800 leading-relaxed">
                  <strong>Evidence Note:</strong> {verificationOutput.evidenceNote}
                </div>
                {verificationOutput.matchedVoterRecord && (
                  <div className="text-gray-600 pt-1 text-[11px] font-mono">
                    Official Roll Record: Voter #{verificationOutput.matchedVoterRecord.voterNumber} in {verificationOutput.matchedVoterRecord.wardName} ({verificationOutput.matchedVoterRecord.pollingCentreName})
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: Verification Queue & Field Workflow */}
      {subTab === 'verification_queue' && (
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
            <div>
              <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-700" />
                Unverified & Pending ID Queue (Grouped by Ward & Polling Centre)
              </h4>
              <p className="text-xs text-gray-500">
                Supporters waiting for official register confirmation. Download the "To Verify" sheet for authorized field verifiers.
              </p>
            </div>
            <button
              onClick={handleDownloadToVerifySheet}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download "To Verify" Sheet
            </button>
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs divide-y divide-gray-200">
              <thead className="bg-gray-100 text-gray-700 font-bold">
                <tr>
                  <th className="py-2 px-3 text-left">Supporter Name</th>
                  <th className="py-2 px-3 text-left">Masked ID</th>
                  <th className="py-2 px-3 text-left">Phone</th>
                  <th className="py-2 px-3 text-left">Ward</th>
                  <th className="py-2 px-3 text-left">Polling Centre</th>
                  <th className="py-2 px-3 text-left">Current Status</th>
                  <th className="py-2 px-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 text-gray-700">
                {SIMULATOR_EXISTING_ENTRIES.map(e => (
                  <tr key={e.id} className="hover:bg-gray-50">
                    <td className="py-2 px-3 font-semibold text-gray-900">{e.name}</td>
                    <td className="py-2 px-3 font-mono">{e.id_masked || <span className="text-amber-600">PENDING ID</span>}</td>
                    <td className="py-2 px-3 font-mono">{e.phone_e164}</td>
                    <td className="py-2 px-3">{e.ward_name}</td>
                    <td className="py-2 px-3">{e.polling_centre_name}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        e.verification_status === 'verified'
                          ? 'bg-emerald-100 text-emerald-800'
                          : e.verification_status === 'pending_id'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {e.verification_status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <button
                        onClick={() => {
                          setSelectedEntryToVerify(e.id);
                          setSubTab('verification_providers');
                        }}
                        className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 underline"
                      >
                        Verify Now
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
