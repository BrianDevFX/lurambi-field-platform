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
import { verificationEngine, VerificationResult } from '../../lib/verification/index.ts';
import { Entry, VerificationStatus } from '../../types/index.ts';
import { CANONICAL_WARDS, CANONICAL_CENTRES } from '../../data/canonicalData.ts';

// The repository has no persistence layer to provide verification records.
const SIMULATOR_EXISTING_ENTRIES: Entry[] = [];

export const VerificationLogicView: React.FC = () => {
  const [subTab, setSubTab] = useState<'verification_providers' | 'verification_queue'>('verification_queue');

  const [activeProviderTab, setActiveProviderTab] = useState<'register_import' | 'manual'>('register_import');
  const [selectedEntryToVerify, setSelectedEntryToVerify] = useState<string>('');
  const [manualStatusChoice, setManualStatusChoice] = useState<VerificationStatus>('verified');
  const [manualEvidenceNote, setManualEvidenceNote] = useState('');
  const [verificationOutput, setVerificationOutput] = useState<VerificationResult | null>(null);

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
              Duplicates and verification
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
