import React, { useState } from 'react';
import { 
  Users, 
  Cross, 
  HeartHandshake, 
  ShieldAlert, 
  Search, 
  Filter, 
  Plus, 
  CheckCircle2, 
  Phone, 
  MapPin, 
  Lock, 
  Download,
  AlertTriangle,
  FileCheck
} from 'lucide-react';
import { INITIAL_PASTORS, INITIAL_CHPS, CANONICAL_WARDS } from '../../data/canonicalData.ts';
import { NetworkContact, ReachStatus } from '../../types/index.ts';

export const NetworkContactsManager: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'pastors' | 'chps'>('pastors');
  const [pastors, setPastors] = useState<NetworkContact[]>(INITIAL_PASTORS);
  const [chps, setChps] = useState<NetworkContact[]>(INITIAL_CHPS);
  const [chpExportProtection, setChpExportProtection] = useState<boolean>(true);
  const [editingContact, setEditingContact] = useState<NetworkContact | null>(null);

  // Search & Ward filter
  const [searchQuery, setSearchQuery] = useState('');
  const [wardFilter, setWardFilter] = useState('all');

  const currentList = activeTab === 'pastors' ? pastors : chps;

  const filteredList = currentList.filter(item => {
    if (wardFilter !== 'all' && item.ward_name !== wardFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        (item.denomination && item.denomination.toLowerCase().includes(q)) ||
        (item.community_unit && item.community_unit.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const handleUpdateContact = (updated: NetworkContact) => {
    if (activeTab === 'pastors') {
      setPastors(prev => prev.map(p => p.id === updated.id ? updated : p));
    } else {
      setChps(prev => prev.map(c => c.id === updated.id ? updated : c));
    }
    setEditingContact(null);
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-base text-gray-900">
              Community Influencers by Ward (Faith Leaders & CHPs)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Separate from Voter Roll
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-600 leading-relaxed">
            Community opinion leaders mapped across Lurambi wards to track institutional outreach without corrupting voter turnout models.
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex rounded-lg bg-gray-100 p-1 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab('pastors')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'pastors' ? 'bg-white text-emerald-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <Cross className="w-3.5 h-3.5 text-emerald-700" />
            <span>Pastors ({pastors.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('chps')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
              activeTab === 'chps' ? 'bg-white text-teal-900 shadow-xs' : 'text-gray-500 hover:text-gray-900'
            }`}
          >
            <HeartHandshake className="w-3.5 h-3.5 text-teal-700" />
            <span>CHPs ({chps.length})</span>
          </button>
        </div>
      </div>

      {/* CHP Statutory Compliance Banner */}
      {activeTab === 'chps' && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              <span>Public Service Neutrality Compliance (Kenya Public Health Regulations)</span>
            </div>

            {/* Protection Toggle */}
            <label className="flex items-center gap-2 cursor-pointer font-bold text-emerald-900 bg-white px-2.5 py-1 rounded-lg border border-amber-200 shadow-2xs">
              <input
                type="checkbox"
                checked={chpExportProtection}
                onChange={e => setChpExportProtection(e.target.checked)}
                className="rounded text-emerald-700"
              />
              <span>Exclude CHPs from Campaign Exports</span>
            </label>
          </div>
          <p className="leading-relaxed text-amber-900/90">
            Community Health Promoters (CHPs) are frontline public health volunteers linked to County Government health programmes. 
            The campaign must take care that discussions remain restricted to health needs (dispensaries, maternity transit) and do not breach 
            statutory neutrality rules. With protection active, CHP rosters are omitted from all political outreach exports.
          </p>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-2 justify-between">
        <div className="flex items-center gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={`Search ${activeTab === 'pastors' ? 'pastor or church...' : 'CHP or community unit...'}`}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-gray-300 bg-white"
            />
          </div>

          <select
            value={wardFilter}
            onChange={e => setWardFilter(e.target.value)}
            className="text-xs p-2 rounded-lg border border-gray-300 bg-white"
          >
            <option value="all">All Wards</option>
            {CANONICAL_WARDS.map(w => (
              <option key={w.id} value={w.name}>{w.name} Ward</option>
            ))}
          </select>
        </div>
      </div>

      {/* Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filteredList.map(contact => (
          <div
            key={contact.id}
            className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-2.5 hover:border-gray-300 transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="font-bold text-sm text-gray-900">{contact.name}</h4>
                <div className="text-xs font-semibold text-emerald-800 mt-0.5">
                  {contact.type === 'pastor' ? contact.denomination : contact.community_unit}
                </div>
              </div>

              {/* Reach Status Pill */}
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${
                contact.reach_status === 'meeting_held'
                  ? 'bg-emerald-100 text-emerald-800'
                  : contact.reach_status === 'contacted'
                  ? 'bg-teal-100 text-teal-800'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {contact.reach_status.replace('_', ' ')}
              </span>
            </div>

            <p className="text-xs text-gray-600 italic bg-gray-50/70 p-2.5 rounded-lg border border-gray-100">
              "{contact.notes || 'No notes on record.'}"
            </p>

            <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500 font-mono">
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3 text-emerald-600" />
                {contact.ward_name || 'Unassigned Ward'}
              </span>
              <span>{contact.phone_e164 || 'No phone'}</span>
              <button
                onClick={() => setEditingContact(contact)}
                className="text-emerald-700 font-bold hover:underline text-[11px]"
              >
                Update Status
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Contact Modal */}
      {editingContact && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 space-y-4 shadow-2xl">
            <div className="pb-2 border-b border-gray-100">
              <h4 className="font-bold text-sm text-gray-900">
                Update Outreach: {editingContact.name}
              </h4>
              <p className="text-xs text-gray-500">{editingContact.denomination || editingContact.community_unit}</p>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Assigned Ward</label>
                <select
                  value={editingContact.ward_name || 'Sheywe'}
                  onChange={e => setEditingContact({ ...editingContact, ward_name: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-gray-50"
                >
                  {CANONICAL_WARDS.map(w => (
                    <option key={w.id} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Outreach Reach Status</label>
                <select
                  value={editingContact.reach_status}
                  onChange={e => setEditingContact({ ...editingContact, reach_status: e.target.value as ReachStatus })}
                  className="w-full p-2 border rounded-lg bg-gray-50"
                >
                  <option value="not_contacted">Not Contacted</option>
                  <option value="contacted">Contacted (Follow-up scheduled)</option>
                  <option value="meeting_held">Meeting Held (Warm outreach)</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Engagement Notes</label>
                <textarea
                  rows={3}
                  value={editingContact.notes || ''}
                  onChange={e => setEditingContact({ ...editingContact, notes: e.target.value })}
                  className="w-full p-2 border rounded-lg bg-gray-50"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditingContact(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUpdateContact(editingContact)}
                className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
