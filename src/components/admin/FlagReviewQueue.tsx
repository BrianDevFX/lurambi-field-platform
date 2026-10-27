import React, { useState } from 'react';
import { 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  GitMerge, 
  Eye, 
  Filter, 
  ShieldAlert, 
  Search, 
  Check, 
  Clock, 
  Lock,
  MessageSquare
} from 'lucide-react';
import { Entry } from '../../types/index.ts';

interface FlaggedRecord {
  id: string;
  entryId: string;
  supporterName: string;
  phone: string;
  maskedId: string;
  wardName: string;
  centreName: string;
  flagCode: string;
  severity: 'critical' | 'warning' | 'info';
  details: string;
  capturedOn: string;
  isResolved: boolean;
}

const INITIAL_FLAGS: FlaggedRecord[] = [
  {
    id: 'flag-01',
    entryId: 'ent-01',
    supporterName: 'Nafuna Makokha Demo',
    phone: '+254705961838',
    maskedId: 'Pending ID',
    wardName: 'Sheywe',
    centreName: 'Bukhungu Stadium Grounds',
    flagCode: 'MISSING_ID',
    severity: 'warning',
    details: 'Supporter captured without National ID number. Status is pending_id.',
    capturedOn: '2024-03-12',
    isResolved: false
  },
  {
    id: 'flag-02',
    entryId: 'ent-02',
    supporterName: 'Collins Khisa Mock',
    phone: '+254722445566',
    maskedId: '29***481',
    wardName: 'Butsotso Central',
    centreName: 'Approved',
    flagCode: 'UNMAPPED_PLACE',
    severity: 'warning',
    details: 'Polling place "Approved" is a junk status string. Requires canonical centre mapping.',
    capturedOn: '2024-03-16',
    isResolved: false
  },
  {
    id: 'flag-03',
    entryId: 'ent-03',
    supporterName: 'Erick Mulama Test',
    phone: '+25471234567',
    maskedId: '29***756',
    wardName: 'Shirere',
    centreName: 'Amalemba Primary School',
    flagCode: 'INVALID_PHONE',
    severity: 'warning',
    details: 'Phone number has 8 digits (+25471234567). Invalid Kenyan mobile length.',
    capturedOn: '2024-03-15',
    isResolved: false
  },
  {
    id: 'flag-04',
    entryId: 'ent-04',
    supporterName: 'Silvia Wekesa Synthetic',
    phone: '+254712345678',
    maskedId: 'Pending ID',
    wardName: 'Sheywe',
    centreName: 'Kakamega Primary School',
    flagCode: 'SHARED_PHONE',
    severity: 'info',
    details: 'Handset shared with Barasa Wekesa. Verified as household family member.',
    capturedOn: '2024-03-15',
    isResolved: false
  },
  {
    id: 'flag-05',
    entryId: 'ent-05',
    supporterName: 'Kennedy Musundi Test',
    phone: '+254720123456',
    maskedId: '27***930',
    wardName: 'Sheywe',
    centreName: 'Kakamega Primary School',
    flagCode: 'POSSIBLE_DUPLICATE',
    severity: 'critical',
    details: 'Appeared in both Raw Data and Sheywe ward sheet. Duplicate candidate for merge.',
    capturedOn: '2024-02-10',
    isResolved: false
  }
];

interface FlagReviewQueueProps {
  onAuditAction: (action: string, entityId: string, reason: string, oldVal?: any, newVal?: any) => void;
}

export const FlagReviewQueue: React.FC<FlagReviewQueueProps> = ({ onAuditAction }) => {
  const [flags, setFlags] = useState<FlaggedRecord[]>(INITIAL_FLAGS);
  const [filterCode, setFilterCode] = useState<string>('all');
  const [selectedFlagForAction, setSelectedFlagForAction] = useState<FlaggedRecord | null>(null);
  const [actionType, setActionType] = useState<'resolve' | 'dismiss' | 'merge'>('resolve');
  const [auditReason, setAuditReason] = useState<string>('');
  const [mergeTarget, setMergeTarget] = useState<string>('keep_earliest');

  const filteredFlags = flags.filter(f => {
    if (filterCode !== 'all' && f.flagCode !== filterCode) return false;
    return true;
  });

  const handleExecuteAction = () => {
    if (!selectedFlagForAction) return;
    if (!auditReason.trim() || auditReason.trim().length < 5) {
      alert('Mandatory justification reason required (min 5 characters).');
      return;
    }

    const flagId = selectedFlagForAction.id;
    const entryId = selectedFlagForAction.entryId;

    if (actionType === 'resolve') {
      setFlags(prev => prev.map(f => f.id === flagId ? { ...f, isResolved: true } : f));
      onAuditAction(
        'RESOLVE_FLAG',
        entryId,
        auditReason.trim(),
        { flag: selectedFlagForAction.flagCode, resolved: false },
        { flag: selectedFlagForAction.flagCode, resolved: true }
      );
    } else if (actionType === 'dismiss') {
      setFlags(prev => prev.filter(f => f.id !== flagId));
      onAuditAction(
        'DISMISS_FLAG',
        entryId,
        auditReason.trim(),
        { flag: selectedFlagForAction.flagCode },
        { dismissed: true }
      );
    } else if (actionType === 'merge') {
      setFlags(prev => prev.filter(f => f.id !== flagId));
      onAuditAction(
        'MERGE_ENTRIES',
        entryId,
        `Merged duplicate entries. Rule: ${mergeTarget}. Reason: ${auditReason.trim()}`,
        { duplicateEntryId: entryId },
        { mergedIntoMasterId: 'ent-02' }
      );
    }

    setSelectedFlagForAction(null);
    setAuditReason('');
  };

  return (
    <div className="space-y-5">
      {/* Top Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-emerald-700" />
            <span>Admin Flag Review Queue ({flags.filter(f => !f.isResolved).length} Unresolved)</span>
          </h4>
          <p className="text-xs text-gray-500">
            Audit-governed resolution of data discrepancies, duplicate warnings, and missing IDs.
          </p>
        </div>

        {/* Filter buttons */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
          <button
            onClick={() => setFilterCode('all')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              filterCode === 'all' ? 'bg-emerald-700 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => setFilterCode('POSSIBLE_DUPLICATE')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              filterCode === 'POSSIBLE_DUPLICATE' ? 'bg-rose-700 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Duplicates
          </button>
          <button
            onClick={() => setFilterCode('UNMAPPED_PLACE')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              filterCode === 'UNMAPPED_PLACE' ? 'bg-amber-700 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Unmapped Place
          </button>
          <button
            onClick={() => setFilterCode('MISSING_ID')}
            className={`px-2.5 py-1 rounded-lg transition-colors ${
              filterCode === 'MISSING_ID' ? 'bg-purple-700 text-white shadow-xs' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Missing ID
          </button>
        </div>
      </div>

      {/* Flag Items List */}
      <div className="space-y-3">
        {filteredFlags.map(item => (
          <div
            key={item.id}
            className={`p-4 rounded-xl border transition-all bg-white shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              item.isResolved ? 'opacity-50 border-gray-200 bg-gray-50' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="space-y-1.5 max-w-xl">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  item.severity === 'critical'
                    ? 'bg-rose-100 text-rose-800'
                    : item.severity === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-teal-100 text-teal-800'
                }`}>
                  {item.flagCode}
                </span>

                <span className="font-bold text-sm text-gray-900">{item.supporterName}</span>

                {item.isResolved && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Resolved
                  </span>
                )}
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                {item.details}
              </p>

              <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500 font-mono">
                <span>Ward: {item.wardName}</span>
                <span>Place: {item.centreName}</span>
                <span>Masked ID: {item.maskedId}</span>
                <span>Phone: {item.phone}</span>
              </div>
            </div>

            {/* Action buttons */}
            {!item.isResolved ? (
              <div className="flex items-center gap-2 shrink-0">
                {item.flagCode === 'POSSIBLE_DUPLICATE' && (
                  <button
                    onClick={() => {
                      setSelectedFlagForAction(item);
                      setActionType('merge');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold transition-colors shadow-xs flex items-center gap-1"
                  >
                    <GitMerge className="w-3.5 h-3.5" />
                    Merge
                  </button>
                )}

                <button
                  onClick={() => {
                    setSelectedFlagForAction(item);
                    setActionType('resolve');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  Resolve
                </button>

                <button
                  onClick={() => {
                    setSelectedFlagForAction(item);
                    setActionType('dismiss');
                  }}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold"
                >
                  Dismiss
                </button>
              </div>
            ) : (
              <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Closed in Audit Log
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Action Modal (Mandates reason for audit log) */}
      {selectedFlagForAction && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <ShieldAlert className="w-5 h-5 text-emerald-700" />
              <h4 className="font-bold text-base text-gray-900 capitalize">
                {actionType} Flag: {selectedFlagForAction.flagCode}
              </h4>
            </div>

            <div className="text-xs text-gray-600 space-y-1">
              <div><strong>Voter:</strong> {selectedFlagForAction.supporterName}</div>
              <div><strong>Location:</strong> {selectedFlagForAction.wardName} - {selectedFlagForAction.centreName}</div>
            </div>

            {actionType === 'merge' && (
              <div className="space-y-1.5 text-xs">
                <label className="font-bold text-gray-700 block">Merge Policy</label>
                <select
                  value={mergeTarget}
                  onChange={e => setMergeTarget(e.target.value)}
                  className="w-full p-2 border rounded-lg bg-gray-50"
                >
                  <option value="keep_earliest">Keep Earliest Capture Date (Recommended)</option>
                  <option value="keep_more_complete">Keep Record with National ID</option>
                  <option value="manual_combine">Combine Issue Priorities & Notes</option>
                </select>
              </div>
            )}

            {/* Mandatory Reason Input */}
            <div className="space-y-1.5 text-xs">
              <label className="font-bold text-gray-800 flex items-center justify-between">
                <span>Mandatory Audit Reason (Required by KDPA 2019) *</span>
                <span className="text-rose-600 font-normal">Min 5 chars</span>
              </label>
              <textarea
                rows={3}
                required
                value={auditReason}
                onChange={e => setAuditReason(e.target.value)}
                placeholder="Explain why this flag is being resolved/merged/dismissed for the immutable audit log..."
                className="w-full p-2.5 border rounded-xl bg-gray-50 focus:bg-white text-xs outline-hidden"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedFlagForAction(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                disabled={auditReason.trim().length < 5}
                onClick={handleExecuteAction}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-bold transition-all shadow-md ${
                  auditReason.trim().length < 5
                    ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                    : 'bg-emerald-700 hover:bg-emerald-800 shadow-emerald-900/10'
                }`}
              >
                Confirm & Log Event
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
