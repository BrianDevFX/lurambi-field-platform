import React, { useState } from 'react';
import { 
  Users, 
  UserCheck, 
  UserX, 
  Shield, 
  MapPin, 
  Check, 
  Clock, 
  Search,
  Sparkles,
  Key
} from 'lucide-react';
import { CANONICAL_WARDS } from '../../data/canonicalData.ts';
import { Profile, UserRole, UserStatus } from '../../types/index.ts';

const SAMPLE_PROFILES: Profile[] = [
  {
    id: 'usr-01',
    email: 'admin.lurambi@campaign.ke',
    full_name: 'Hon. Campaign Director',
    phone_e164: '+254710000001',
    national_id_masked: '21***123',
    role: 'admin',
    status: 'approved',
    home_ward_name: 'Sheywe',
    referral_code: 'DIR001'
  },
  {
    id: 'usr-02',
    email: 'coord.sheywe@campaign.ke',
    full_name: 'Barasa Coordinator (Sheywe)',
    phone_e164: '+254720000002',
    national_id_masked: '24***456',
    role: 'ward_coordinator',
    status: 'approved',
    home_ward_id: 'a0000001-0000-0000-0000-000000000001',
    home_ward_name: 'Sheywe',
    referral_code: 'CRD002'
  },
  {
    id: 'usr-03',
    email: 'zainab.field@gmail.com',
    full_name: 'Zainab Makokha',
    phone_e164: '+254712345678',
    national_id_masked: '28***023',
    role: 'mobilizer',
    status: 'approved',
    home_ward_name: 'Sheywe',
    referral_code: 'LUR789'
  },
  {
    id: 'usr-04',
    email: 'kelvin.onboarding@gmail.com',
    full_name: 'Kelvin Omwoma Synthetic',
    phone_e164: '+254733445566',
    national_id_masked: '32***901',
    role: 'mobilizer',
    status: 'pending',
    home_ward_id: 'a0000001-0000-0000-0000-000000000003',
    home_ward_name: 'Mahiakalo'
  },
  {
    id: 'usr-05',
    email: 'fridah.applicant@gmail.com',
    full_name: 'Fridah Khalayi Synthetic',
    phone_e164: '+254711889900',
    national_id_masked: '29***882',
    role: 'mobilizer',
    status: 'pending',
    home_ward_id: 'a0000001-0000-0000-0000-000000000004',
    home_ward_name: 'Butsotso East'
  }
];

interface UserManagementViewProps {
  onAuditAction: (action: string, entityId: string, reason: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({ onAuditAction }) => {
  const [profiles, setProfiles] = useState<Profile[]>(SAMPLE_PROFILES);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const handleApproveMobilizer = (profileId: string) => {
    const code = `LUR${Math.floor(100 + Math.random() * 900)}`;
    setProfiles(prev => prev.map(p => {
      if (p.id === profileId) {
        return {
          ...p,
          status: 'approved' as UserStatus,
          referral_code: code
        };
      }
      return p;
    }));

    onAuditAction('APPROVE_MOBILIZER', profileId, `Approved mobilizer and provisioned referral code ${code}`);
  };

  const handleSuspendUser = (profileId: string) => {
    setProfiles(prev => prev.map(p => {
      if (p.id === profileId) {
        return {
          ...p,
          status: 'suspended' as UserStatus
        };
      }
      return p;
    }));

    onAuditAction('SUSPEND_USER', profileId, 'Suspended access permissions');
  };

  const filtered = profiles.filter(p => {
    if (filterRole !== 'all' && p.role !== filterRole) return false;
    if (filterStatus !== 'all' && p.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-700" />
            <span>Mobilizer Onboarding & User Administration</span>
          </h4>
          <p className="text-xs text-gray-500">
            Pending mobilizers require approval before capture privileges and 6-char referral codes are activated.
          </p>
        </div>

        {/* Status filters */}
        <div className="flex gap-2 text-xs font-semibold">
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="p-1.5 border rounded-lg bg-gray-50"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending Approval</option>
            <option value="approved">Approved</option>
            <option value="suspended">Suspended</option>
          </select>

          <select
            value={filterRole}
            onChange={e => setFilterRole(e.target.value)}
            className="p-1.5 border rounded-lg bg-gray-50"
          >
            <option value="all">All Roles</option>
            <option value="mobilizer">Mobilizers</option>
            <option value="ward_coordinator">Ward Coordinators</option>
            <option value="admin">Admins</option>
          </select>
        </div>
      </div>

      {/* Profiles list */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-xs">
        <table className="min-w-full text-xs divide-y divide-gray-200">
          <thead className="bg-gray-100 text-gray-700 font-bold">
            <tr>
              <th className="py-3 px-4 text-left">User Name</th>
              <th className="py-3 px-4 text-left">Phone & Email</th>
              <th className="py-3 px-4 text-left">Role</th>
              <th className="py-3 px-4 text-left">Ward Assignment</th>
              <th className="py-3 px-4 text-left">Referral Code</th>
              <th className="py-3 px-4 text-left">Status</th>
              <th className="py-3 px-4 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 text-gray-700">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="py-3 px-4 font-bold text-gray-900">{p.full_name}</td>
                <td className="py-3 px-4 font-mono text-[11px] text-gray-600">
                  <div>{p.phone_e164}</div>
                  <div className="text-gray-400 font-sans text-[10px]">{p.email}</div>
                </td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                    p.role === 'admin'
                      ? 'bg-purple-100 text-purple-900'
                      : p.role === 'ward_coordinator'
                      ? 'bg-teal-100 text-teal-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}>
                    {p.role.replace('_', ' ')}
                  </span>
                </td>
                <td className="py-3 px-4">{p.home_ward_name || 'Lurambi Wide'}</td>
                <td className="py-3 px-4 font-mono font-bold text-emerald-800">
                  {p.referral_code || <span className="text-gray-400 font-normal italic">On approval</span>}
                </td>
                <td className="py-3 px-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    p.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : p.status === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}>
                    {p.status.toUpperCase()}
                  </span>
                </td>
                <td className="py-3 px-4 text-center">
                  {p.status === 'pending' && (
                    <button
                      onClick={() => handleApproveMobilizer(p.id)}
                      className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs"
                    >
                      Approve & Issue Code
                    </button>
                  )}
                  {p.status === 'approved' && p.role === 'mobilizer' && (
                    <button
                      onClick={() => handleSuspendUser(p.id)}
                      className="text-rose-600 hover:text-rose-800 font-semibold text-xs"
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
