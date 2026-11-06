import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Clock, 
  FileText, 
  Search, 
  Filter, 
  Download, 
  Lock,
  User
} from 'lucide-react';

export interface AuditLogEntry {
  id: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
  timestamp: string;
  oldValues?: any;
  newValues?: any;
}

interface AuditLogViewerProps {
  customLogs?: AuditLogEntry[];
}

export const AuditLogViewer: React.FC<AuditLogViewerProps> = ({ customLogs = [] }) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>(customLogs);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const filtered = logs.filter(l => {
    if (actionFilter !== 'all' && l.action !== actionFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        l.reason.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        l.userName.toLowerCase().includes(q) ||
        l.entityId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-emerald-700" />
            <h4 className="font-bold text-sm text-gray-900">
              Immutable Compliance Audit Trail (KDPA 2019 Section 42)
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-800 border">
              Read Only
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Every administrative override, merge, user approval, or ID reveal mandates a recorded justification. Records cannot be edited or deleted.
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex gap-2 text-xs">
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="p-2 border rounded-lg bg-gray-50 font-semibold"
          >
            <option value="all">All Actions</option>
            <option value="MERGE_ENTRIES">MERGE_ENTRIES</option>
            <option value="APPROVE_MOBILIZER">APPROVE_MOBILIZER</option>
            <option value="RESOLVE_FLAG">RESOLVE_FLAG</option>
            <option value="VERIFY_SUPPORTER">VERIFY_SUPPORTER</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
        <table className="min-w-full text-xs divide-y divide-gray-200">
          <thead className="bg-gray-100 text-gray-700 font-bold">
            <tr>
              <th className="py-3 px-4 text-left">Timestamp</th>
              <th className="py-3 px-4 text-left">Actor (Who)</th>
              <th className="py-3 px-4 text-left">Action (What)</th>
              <th className="py-3 px-4 text-left">Entity</th>
              <th className="py-3 px-4 text-left">Mandatory Reason / Justification</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-gray-700">
            {filtered.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50">
                <td className="py-3 px-4 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                  {entry.timestamp}
                </td>
                <td className="py-3 px-4">
                  <div className="font-bold text-gray-900">{entry.userName}</div>
                  <div className="text-[10px] text-emerald-800 uppercase font-mono">{entry.userRole}</div>
                </td>
                <td className="py-3 px-4 font-mono font-bold text-emerald-900">
                  <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[11px]">
                    {entry.action}
                  </span>
                </td>
                <td className="py-3 px-4 font-mono text-[11px] text-gray-600">
                  {entry.entityType}:{entry.entityId}
                </td>
                <td className="py-3 px-4 text-gray-800 leading-snug font-sans max-w-sm">
                  "{entry.reason}"
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
