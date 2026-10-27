import React, { useState } from 'react';
import { 
  ShieldAlert, 
  Users, 
  HeartHandshake, 
  Sparkles, 
  Lock, 
  Layers, 
  CheckCircle2, 
  Settings 
} from 'lucide-react';
import { FlagReviewQueue } from './FlagReviewQueue.tsx';
import { NetworkContactsManager } from './NetworkContactsManager.tsx';
import { NeedsMappingQueue } from './NeedsMappingQueue.tsx';
import { UserManagementView } from './UserManagementView.tsx';
import { AuditLogViewer, AuditLogEntry } from './AuditLogViewer.tsx';

interface AdminDashboardProps {
  onAuditAction?: (action: string, entityId: string, reason: string, oldVal?: any, newVal?: any) => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = () => {
  const [adminTab, setAdminTab] = useState<'flags' | 'users' | 'network' | 'mapping' | 'audit'>('flags');
  const [customAuditLogs, setCustomAuditLogs] = useState<AuditLogEntry[]>([]);

  const handleAuditAction = (action: string, entityId: string, reason: string, oldVal?: any, newVal?: any) => {
    const newLog: AuditLogEntry = {
      id: `aud-dyn-${Date.now()}`,
      userName: 'Hon. Campaign Director',
      userRole: 'admin',
      action,
      entityType: 'campaign_record',
      entityId,
      reason,
      timestamp: new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC',
      oldValues: oldVal,
      newValues: newVal
    };
    setCustomAuditLogs(prev => [newLog, ...prev]);
  };

  return (
    <div className="space-y-6">
      {/* Admin Navigation Pills */}
      <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-xs flex items-center justify-between sm:justify-start gap-1 overflow-x-auto text-xs font-bold">
        <button
          onClick={() => setAdminTab('flags')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            adminTab === 'flags'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          <span>Flag Review Queue</span>
        </button>

        <button
          onClick={() => setAdminTab('users')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            adminTab === 'users'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>User Approvals</span>
        </button>

        <button
          onClick={() => setAdminTab('network')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            adminTab === 'network'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <HeartHandshake className="w-4 h-4" />
          <span>Pastors & CHPs</span>
        </button>

        <button
          onClick={() => setAdminTab('mapping')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            adminTab === 'mapping'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Needs Mapping</span>
        </button>

        <button
          onClick={() => setAdminTab('audit')}
          className={`py-2 px-3 rounded-lg flex items-center gap-1.5 transition-all ${
            adminTab === 'audit'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Audit Log Viewer</span>
        </button>
      </div>

      {/* Sub-Views */}
      {adminTab === 'flags' && <FlagReviewQueue onAuditAction={handleAuditAction} />}
      {adminTab === 'users' && <UserManagementView onAuditAction={handleAuditAction} />}
      {adminTab === 'network' && <NetworkContactsManager />}
      {adminTab === 'mapping' && <NeedsMappingQueue />}
      {adminTab === 'audit' && <AuditLogViewer customLogs={customAuditLogs} />}
    </div>
  );
};
