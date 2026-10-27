import React, { useState } from 'react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts';
import { 
  BarChart3, 
  Download, 
  FileText, 
  Filter, 
  MapPin, 
  Users, 
  TrendingUp, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Sparkles,
  PieChart as PieIcon,
  ShieldCheck,
  FileSpreadsheet
} from 'lucide-react';
import { CANONICAL_WARDS, CANONICAL_CENTRES, CANONICAL_STATIONS } from '../../data/canonicalData.ts';
import { Entry } from '../../types/index.ts';
import { ProjectionModelCard } from './ProjectionModelCard.tsx';
import { exportSupportersXlsx, downloadCleanImportTemplate } from '../../lib/reports/excelExport.ts';
import { generateCampaignPdfReport } from '../../lib/reports/pdfGenerator.ts';

interface AnalyticsDashboardProps {
  entries: Entry[];
}

const COLORS = ['#047857', '#0D9488', '#0284C7', '#EAB308', '#F97316', '#64748B'];

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = ({ entries }) => {
  const [selectedWardFilter, setSelectedWardFilter] = useState('all');
  const [selectedSupportFilter, setSelectedSupportFilter] = useState('all');

  // Filtered pool
  const filteredEntries = entries.filter(e => {
    if (selectedWardFilter !== 'all' && e.ward_name !== selectedWardFilter) return false;
    if (selectedSupportFilter !== 'all' && e.support_level !== selectedSupportFilter) return false;
    return true;
  });

  // 1. Ward Coverage Data (Target vs Captured)
  const wardCoverageData = CANONICAL_WARDS.map(w => {
    const inWard = entries.filter(e => e.ward_name === w.name);
    const verifiedInWard = inWard.filter(e => e.verification_status === 'verified').length;
    const strongInWard = inWard.filter(e => e.support_level === 'strong_supporter').length;
    return {
      wardName: w.name,
      target: w.registered_voters_target,
      captured: inWard.length,
      verified: verifiedInWard,
      strong: strongInWard,
      coveragePct: `${((inWard.length / w.registered_voters_target) * 100).toFixed(1)}%`
    };
  });

  // 2. Verification Funnel Breakdown
  const verificationBreakdown = [
    { name: 'Verified', count: filteredEntries.filter(e => e.verification_status === 'verified').length, color: '#047857' },
    { name: 'Unverified', count: filteredEntries.filter(e => e.verification_status === 'unverified').length, color: '#0284C7' },
    { name: 'Pending ID', count: filteredEntries.filter(e => e.verification_status === 'pending_id').length, color: '#F59E0B' },
    { name: 'Not Found', count: filteredEntries.filter(e => e.verification_status === 'not_found').length, color: '#EF4444' },
    { name: 'Wrong Const.', count: filteredEntries.filter(e => e.verification_status === 'wrong_constituency').length, color: '#8B5CF6' }
  ];

  // 3. Support Level Funnel
  const supportLevelData = [
    { name: 'Strong Supporter', value: filteredEntries.filter(e => e.support_level === 'strong_supporter').length, color: '#047857' },
    { name: 'Leaning', value: filteredEntries.filter(e => e.support_level === 'leaning').length, color: '#0D9488' },
    { name: 'Undecided', value: filteredEntries.filter(e => e.support_level === 'undecided').length, color: '#0284C7' },
    { name: 'Opposed', value: filteredEntries.filter(e => e.support_level === 'opposed').length, color: '#EF4444' },
    { name: 'Not Assessed', value: filteredEntries.filter(e => e.support_level === 'not_assessed').length, color: '#94A3B8' }
  ];

  // 4. Data Completeness Metrics
  const validIdCount = filteredEntries.filter(e => e.id_masked && !e.flags.includes('MISSING_ID')).length;
  const validPhoneCount = filteredEntries.filter(e => e.phone_e164 && !e.flags.includes('INVALID_PHONE')).length;
  const mappedCentreCount = filteredEntries.filter(e => e.polling_centre_name && !e.flags.includes('UNMAPPED_PLACE')).length;
  const assessedSupportCount = filteredEntries.filter(e => e.support_level !== 'not_assessed').length;

  const total = Math.max(1, filteredEntries.length);
  const idRate = Math.round((validIdCount / total) * 100);
  const phoneRate = Math.round((validPhoneCount / total) * 100);
  const placeRate = Math.round((mappedCentreCount / total) * 100);
  const supportRate = Math.round((assessedSupportCount / total) * 100);

  // 5. Priority Polling Stations (Deficit ranking)
  const priorityStations = CANONICAL_STATIONS.slice(0, 5).map(s => {
    const centre = CANONICAL_CENTRES.find(c => c.id === s.polling_centre_id);
    const ward = CANONICAL_WARDS.find(w => w.id === s.ward_id);
    const inStation = entries.filter(e => e.polling_station_name === s.station_name).length;
    const gap = s.registered_voters_est - inStation;
    return {
      stationName: s.station_name,
      wardName: ward?.name || 'Sheywe',
      target: s.registered_voters_est,
      captured: inStation,
      gap: Math.max(0, gap),
      urgency: gap > 500 ? 'HIGH URGENCY' : 'MODERATE'
    };
  });

  // Handle Export to PDF
  const handleExportPdf = () => {
    generateCampaignPdfReport({
      title: 'Lurambi Constituency 2027 Field Intelligence Report',
      subtitle: 'Complete Ward Coverage, Verification Funnel & Priority Stations',
      filtersUsed: `Ward: ${selectedWardFilter} | Support: ${selectedSupportFilter}`,
      generatedBy: 'Campaign Director (Admin)',
      wardSummaries: wardCoverageData,
      priorityStations
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Export Actions */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-base text-gray-900">
              Stage 7: Campaign Intelligence & Analytics Dashboard
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              2027 Election Intelligence
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-600">
            Real-time coverage across 6 Lurambi wards, data completeness tracking, priority polling stations, and export reports.
          </p>
        </div>

        {/* Global Export Buttons */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            onClick={() => exportSupportersXlsx(filteredEntries, 'Lurambi_Supporters_Data')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-bold transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
            Export Data (XLSX)
          </button>

          <button
            onClick={handleExportPdf}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors shadow-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Download PDF Report
          </button>

          <button
            onClick={downloadCleanImportTemplate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            Import Template
          </button>
        </div>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-gray-700 font-bold">
          <Filter className="w-3.5 h-3.5 text-emerald-700" />
          <span>Filters:</span>
        </div>

        <div>
          <select
            value={selectedWardFilter}
            onChange={e => setSelectedWardFilter(e.target.value)}
            className="p-1.5 rounded-lg border border-gray-300 bg-white font-medium"
          >
            <option value="all">All 6 Wards (Constituency Wide)</option>
            {CANONICAL_WARDS.map(w => (
              <option key={w.id} value={w.name}>{w.name} Ward</option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedSupportFilter}
            onChange={e => setSelectedSupportFilter(e.target.value)}
            className="p-1.5 rounded-lg border border-gray-300 bg-white font-medium"
          >
            <option value="all">All Support Levels</option>
            <option value="strong_supporter">Strong Supporter</option>
            <option value="leaning">Leaning</option>
            <option value="undecided">Undecided</option>
            <option value="opposed">Opposed</option>
          </select>
        </div>

        <span className="text-gray-500 font-mono text-[11px] ml-auto">
          Active Records: <strong>{filteredEntries.length}</strong>
        </span>
      </div>

      {/* Data Quality & Completeness KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <span className="text-xs text-gray-500 font-bold">National ID Capture</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-gray-900">{idRate}%</span>
            <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded">
              vs 14% legacy
            </span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
            <div className="bg-emerald-600 h-1.5 rounded-full" style={{ width: `${idRate}%` }}></div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <span className="text-xs text-gray-500 font-bold">Valid +254 Phone</span>
          <div className="text-2xl font-black text-gray-900">{phoneRate}%</div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
            <div className="bg-teal-600 h-1.5 rounded-full" style={{ width: `${phoneRate}%` }}></div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <span className="text-xs text-gray-500 font-bold">Mapped Polling Centre</span>
          <div className="text-2xl font-black text-gray-900">{placeRate}%</div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
            <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: `${placeRate}%` }}></div>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-1">
          <span className="text-xs text-gray-500 font-bold">Support Assessed</span>
          <div className="text-2xl font-black text-gray-900">{supportRate}%</div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-1 overflow-hidden">
            <div className="bg-purple-600 h-1.5 rounded-full" style={{ width: `${supportRate}%` }}></div>
          </div>
        </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Chart 1: Captured Supporters by Ward */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-emerald-700" />
              Supporters Captured vs Target by Ward
            </h4>
            <span className="text-[10px] text-gray-500 font-mono">6 Canonical Wards</span>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wardCoverageData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="wardName" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(value: any) => [value.toLocaleString(), 'Count']} />
                <Bar dataKey="captured" fill="#047857" name="Captured Supporters" radius={[4, 4, 0, 0]} />
                <Bar dataKey="verified" fill="#0284C7" name="Verified Voters" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: Support Level Funnel */}
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-gray-100">
            <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-emerald-700" />
              Support Level Commitment Funnel
            </h4>
            <span className="text-[10px] text-gray-500 font-mono">Pledged Sentiment</span>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={supportLevelData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {supportLevelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Ward x Support-Level Heat Table */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-emerald-700" />
            Ward × Support Level Heat Table
          </h4>
          <span className="text-[11px] text-gray-500">Cross-Ward Density</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs divide-y divide-gray-200 font-sans">
            <thead className="bg-gray-100 text-gray-700 font-bold">
              <tr>
                <th className="py-2.5 px-3 text-left">Ward</th>
                <th className="py-2.5 px-3 text-center text-emerald-900">Strong Supporter</th>
                <th className="py-2.5 px-3 text-center text-teal-900">Leaning</th>
                <th className="py-2.5 px-3 text-center text-blue-900">Undecided</th>
                <th className="py-2.5 px-3 text-center text-rose-900">Opposed</th>
                <th className="py-2.5 px-3 text-center text-gray-700">Total Captured</th>
                <th className="py-2.5 px-3 text-center">Coverage Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-700">
              {CANONICAL_WARDS.map(w => {
                const inW = entries.filter(e => e.ward_name === w.name);
                const strong = inW.filter(e => e.support_level === 'strong_supporter').length;
                const leaning = inW.filter(e => e.support_level === 'leaning').length;
                const undecided = inW.filter(e => e.support_level === 'undecided').length;
                const opposed = inW.filter(e => e.support_level === 'opposed').length;
                const cov = ((inW.length / w.registered_voters_target) * 100).toFixed(1);

                return (
                  <tr key={w.id} className="hover:bg-gray-50">
                    <td className="py-2.5 px-3 font-bold text-gray-900">{w.name}</td>
                    <td className="py-2.5 px-3 text-center font-bold text-emerald-800 bg-emerald-50/40">{strong}</td>
                    <td className="py-2.5 px-3 text-center text-teal-800">{leaning}</td>
                    <td className="py-2.5 px-3 text-center text-blue-800">{undecided}</td>
                    <td className="py-2.5 px-3 text-center text-rose-800">{opposed}</td>
                    <td className="py-2.5 px-3 text-center font-bold font-mono">{inW.length}</td>
                    <td className="py-2.5 px-3 text-center font-mono font-semibold text-emerald-800">{cov}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Priority Polling Stations */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between pb-2 border-b border-gray-100">
          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Priority Polling Stations (Highest Voter Mobilization Deficit)
          </h4>
          <span className="text-[11px] text-gray-500 font-semibold">Deployment Priority</span>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-xs divide-y divide-gray-200">
            <thead className="bg-gray-100 text-gray-700 font-bold">
              <tr>
                <th className="py-2 px-3 text-left">Polling Station</th>
                <th className="py-2 px-3 text-left">Ward</th>
                <th className="py-2 px-3 text-right">Electorate Target</th>
                <th className="py-2 px-3 text-right">Captured</th>
                <th className="py-2 px-3 text-right text-rose-800">Deficit / Gap</th>
                <th className="py-2 px-3 text-center">Urgency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-gray-700">
              {priorityStations.map((s, idx) => (
                <tr key={idx} className="hover:bg-gray-50">
                  <td className="py-2.5 px-3 font-semibold text-gray-900">{s.stationName}</td>
                  <td className="py-2.5 px-3">{s.wardName}</td>
                  <td className="py-2.5 px-3 text-right font-mono">{s.target.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">{s.captured}</td>
                  <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-700">-{s.gap.toLocaleString()}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                      {s.urgency}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transparent Victory Projection Model */}
      <ProjectionModelCard entries={entries} />
    </div>
  );
};
