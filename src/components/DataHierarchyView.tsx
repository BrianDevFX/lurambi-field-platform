import React, { useState } from 'react';
import { 
  MapPin, 
  Building2, 
  Vote, 
  Sparkles, 
  Users, 
  Cross, 
  HeartHandshake, 
  Search, 
  AlertCircle 
} from 'lucide-react';
import { 
  CANONICAL_WARDS, 
  CANONICAL_CENTRES, 
  CANONICAL_STATIONS, 
  CANONICAL_ALIASES, 
  INITIAL_PASTORS, 
  INITIAL_CHPS 
} from '../data/canonicalData.ts';

export const DataHierarchyView: React.FC = () => {
  const [selectedWardId, setSelectedWardId] = useState<string>(CANONICAL_WARDS[0].id);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const currentWard = CANONICAL_WARDS.find(w => w.id === selectedWardId) || CANONICAL_WARDS[0];
  const centresInWard = CANONICAL_CENTRES.filter(c => c.ward_id === selectedWardId);
  const stationsInWard = CANONICAL_STATIONS.filter(s => s.ward_id === selectedWardId);
  const pastorsInWard = INITIAL_PASTORS.filter(p => p.ward_id === selectedWardId);
  const chpsInWard = INITIAL_CHPS.filter(c => c.ward_id === selectedWardId);

  return (
    <div className="space-y-6">
      {/* Introduction Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
        <div className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-emerald-700" />
          <h3 className="font-bold text-base text-gray-900">
            Lurambi Constituency Official Geographic Hierarchy & Seed Explorer
          </h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            Kakamega County
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-600 leading-relaxed">
          The campaign operates strictly across all 6 official wards of Lurambi. Below is the seeded hierarchy
          (Wards → Polling Centres → Stations) alongside known place aliases from the legacy workbook and community influencers.
        </p>

        {/* 6 Ward Quick Switcher */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {CANONICAL_WARDS.map(ward => {
            const isSelected = ward.id === selectedWardId;
            return (
              <button
                key={ward.id}
                onClick={() => setSelectedWardId(ward.id)}
                className={`p-3 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-600/20 shadow-xs'
                    : 'border-gray-200 bg-white hover:border-gray-300 text-gray-700'
                }`}
              >
                <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">{ward.code}</div>
                <div className="text-xs font-bold truncate mt-0.5">{ward.name}</div>
                <div className="text-[11px] text-gray-500 mt-1 font-mono">
                  {ward.registered_voters_target.toLocaleString()} target
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Ward Details & Centres */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Centres & Streams */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-700" />
                <h4 className="font-bold text-sm text-gray-900">
                  Polling Centres & Stations in {currentWard.name} Ward
                </h4>
              </div>
              <span className="text-xs font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md">
                {centresInWard.length} Centres
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {centresInWard.map(centre => {
                const streams = stationsInWard.filter(s => s.polling_centre_id === centre.id);
                return (
                  <div key={centre.id} className="p-3.5 rounded-lg border border-gray-200 bg-gray-50/50 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Vote className="w-4 h-4 text-emerald-600" />
                        <span className="font-bold text-xs text-gray-900">{centre.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-700 font-mono font-semibold">
                          {centre.code}
                        </span>
                      </div>
                      <span className="text-xs text-gray-600 font-medium">
                        ~{centre.total_registered_voters.toLocaleString()} voters
                      </span>
                    </div>

                    {/* Streams */}
                    <div className="mt-2.5 pt-2 border-t border-gray-200/60 flex flex-wrap gap-2">
                      {streams.length > 0 ? (
                        streams.map(stream => (
                          <span key={stream.id} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-gray-200 text-[11px] text-gray-700 font-medium shadow-2xs">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                            {stream.station_name} ({stream.registered_voters_est} est.)
                          </span>
                        ))
                      ) : (
                        <span className="text-[11px] text-gray-400 italic">Canonical streams loaded from IEBC extract</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Place Aliases & Fuzzy Matching Seed */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-700" />
                <h4 className="font-bold text-sm text-gray-900">
                  Legacy Excel Place Aliases & Fuzzy Mapping Seed
                </h4>
              </div>
              <span className="text-xs text-gray-500 font-medium">
                Solves messy spreadsheet entries
              </span>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-xs divide-y divide-gray-200">
                <thead className="bg-gray-50 text-gray-600 font-semibold">
                  <tr>
                    <th className="py-2 px-3 text-left">Observed Raw Text</th>
                    <th className="py-2 px-3 text-left">Canonical Resolution</th>
                    <th className="py-2 px-3 text-left">Confidence</th>
                    <th className="py-2 px-3 text-left">Action / Rule</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-700">
                  {CANONICAL_ALIASES.map(alias => (
                    <tr key={alias.id}>
                      <td className="py-2 px-3 font-mono font-semibold text-rose-800">
                        "{alias.raw_alias}"
                      </td>
                      <td className="py-2 px-3 font-medium text-emerald-900">
                        {alias.confidence > 0 ? 'Resolved to Canonical' : 'Route to Needs Mapping'}
                      </td>
                      <td className="py-2 px-3 font-mono">
                        {(alias.confidence * 100).toFixed(0)}%
                      </td>
                      <td className="py-2 px-3 text-gray-500 text-[11px]">
                        {alias.notes}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Sidebar: Network Influencers (Pastors & CHPs) in Ward */}
        <div className="space-y-4">
          {/* Pastors */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
              <Cross className="w-4 h-4 text-emerald-700" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-900">
                Faith Leaders in {currentWard.name}
              </h4>
            </div>
            {pastorsInWard.length > 0 ? (
              <div className="space-y-2">
                {pastorsInWard.map(pastor => (
                  <div key={pastor.id} className="p-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-xs">
                    <div className="font-bold text-gray-900">{pastor.name}</div>
                    <div className="text-emerald-800 font-medium text-[11px] mt-0.5">{pastor.denomination}</div>
                    <div className="text-gray-500 text-[10px] mt-1">{pastor.phone_e164} • {pastor.reach_status}</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No faith contacts assigned to {currentWard.name} yet.</p>
            )}
          </div>

          {/* CHPs */}
          <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-teal-700" />
                <h4 className="font-bold text-xs uppercase tracking-wider text-gray-900">
                  Community Health Promoters
                </h4>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold">
                Neutrality Toggle
              </span>
            </div>
            {chpsInWard.length > 0 ? (
              <div className="space-y-2">
                {chpsInWard.map(chp => (
                  <div key={chp.id} className="p-2.5 rounded-lg border border-gray-200 bg-gray-50/50 text-xs">
                    <div className="font-bold text-gray-900">{chp.name}</div>
                    <div className="text-teal-800 font-medium text-[11px] mt-0.5">{chp.community_unit}</div>
                    <div className="text-gray-500 text-[10px] mt-1">{chp.phone_e164} • Protected from political export</div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-500 italic">No CHP contacts mapped to {currentWard.name} yet.</p>
            )}

            <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 leading-snug">
              <strong>Admin Compliance Notice:</strong> CHPs are community health workers linked to public health programmes. The app keeps them in a separate influencer table and automatically excludes them from campaign export rosters.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
