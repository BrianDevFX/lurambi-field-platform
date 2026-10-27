import React, { useState } from 'react';
import { 
  TrendingUp, 
  Sliders, 
  AlertCircle, 
  Award, 
  CheckCircle2, 
  FileSpreadsheet, 
  Info,
  Layers,
  Sparkles
} from 'lucide-react';
import { Entry } from '../../types/index.ts';

interface ProjectionModelCardProps {
  entries: Entry[];
}

export const ProjectionModelCard: React.FC<ProjectionModelCardProps> = ({ entries }) => {
  // Conversion model parameters (Admin editable)
  const [verifiedTurnout, setVerifiedTurnout] = useState<number>(82); // 82%
  const [unverifiedTurnout, setUnverifiedTurnout] = useState<number>(58); // 58%
  const [strongConversion, setStrongConversion] = useState<number>(90); // 90%
  const [leaningConversion, setLeaningConversion] = useState<number>(65); // 65%
  const [undecidedConversion, setUndecidedConversion] = useState<number>(35); // 35%
  const [includeUnverified, setIncludeUnverified] = useState<boolean>(true);

  // Victory target in Lurambi (Total registered target ~117,000; ~50% + 1 winner target is ~55,000 votes)
  const WINNING_THRESHOLD = 55000;

  // Filter entries
  const activePool = includeUnverified
    ? entries.filter(e => e.verification_status !== 'wrong_constituency')
    : entries.filter(e => e.verification_status === 'verified');

  // Breakdown
  const strongCount = activePool.filter(e => e.support_level === 'strong_supporter').length;
  const leaningCount = activePool.filter(e => e.support_level === 'leaning').length;
  const undecidedCount = activePool.filter(e => e.support_level === 'undecided').length;

  // Effective turnout multiplier based on verification status mix
  const verifiedCount = activePool.filter(e => e.verification_status === 'verified').length;
  const unverifiedCount = activePool.length - verifiedCount;

  const effectiveTurnoutRate = activePool.length > 0
    ? ((verifiedCount * (verifiedTurnout / 100)) + (unverifiedCount * (unverifiedTurnout / 100))) / activePool.length
    : (verifiedTurnout / 100);

  // Projected votes calculation
  const projectedStrongVotes = Math.round(strongCount * effectiveTurnoutRate * (strongConversion / 100));
  const projectedLeaningVotes = Math.round(leaningCount * effectiveTurnoutRate * (leaningConversion / 100));
  const projectedUndecidedVotes = Math.round(undecidedCount * effectiveTurnoutRate * (undecidedConversion / 100));

  const totalProjectedVotes = projectedStrongVotes + projectedLeaningVotes + projectedUndecidedVotes;
  const progressToVictory = Math.min(100, Math.round((totalProjectedVotes / WINNING_THRESHOLD) * 100));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
        <div>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-emerald-700" />
            <h4 className="font-bold text-base text-gray-900">
              Transparent Election Day Projection Model
            </h4>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              Lurambi MP 2027
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            Dynamic election turnout estimator based on verified voter status and support level conversion probabilities.
          </p>
        </div>

        {/* Data Scope Switch */}
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-lg text-xs font-semibold text-gray-600">
          <button
            onClick={() => setIncludeUnverified(true)}
            className={`px-2.5 py-1 rounded-md transition-all ${
              includeUnverified ? 'bg-white text-emerald-950 shadow-2xs font-bold' : 'text-gray-500'
            }`}
          >
            All Field Supporter Rows ({activePool.length})
          </button>
          <button
            onClick={() => setIncludeUnverified(false)}
            className={`px-2.5 py-1 rounded-md transition-all ${
              !includeUnverified ? 'bg-white text-emerald-950 shadow-2xs font-bold' : 'text-gray-500'
            }`}
          >
            Verified Only ({verifiedCount})
          </button>
        </div>
      </div>

      {/* Projection Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-800 to-teal-900 text-white space-y-1 shadow-md">
          <span className="text-xs text-emerald-200 font-semibold uppercase">Projected Net Votes</span>
          <div className="text-3xl font-black">{totalProjectedVotes.toLocaleString()}</div>
          <div className="text-[11px] text-emerald-100/80">
            From {activePool.length.toLocaleString()} supporters under current conversion rates
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-600 font-bold">50% + 1 Victory Target:</span>
            <span className="font-mono font-bold text-gray-900">{WINNING_THRESHOLD.toLocaleString()}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className="bg-emerald-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(4, progressToVictory)}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[11px] text-gray-500 font-mono">
            <span>{progressToVictory}% of Victory Target</span>
            <span>Gap: {Math.max(0, WINNING_THRESHOLD - totalProjectedVotes).toLocaleString()}</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-gray-200 bg-gray-50 space-y-1 text-xs">
          <span className="text-gray-500 font-bold block">Vote Yield by Tier</span>
          <div className="space-y-1 text-[11px]">
            <div className="flex justify-between text-gray-700">
              <span>Strong Supporters ({strongCount}):</span>
              <strong className="text-emerald-800 font-mono">+{projectedStrongVotes.toLocaleString()}</strong>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Leaning Supporters ({leaningCount}):</span>
              <strong className="text-teal-800 font-mono">+{projectedLeaningVotes.toLocaleString()}</strong>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Undecided ({undecidedCount}):</span>
              <strong className="text-gray-700 font-mono">+{projectedUndecidedVotes.toLocaleString()}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Sliders for Parameter Customization */}
      <div className="bg-gray-50/80 p-4 rounded-xl border border-gray-200 space-y-3">
        <h5 className="font-bold text-xs text-gray-900 flex items-center gap-1.5 uppercase tracking-wider">
          <Sliders className="w-3.5 h-3.5 text-emerald-700" />
          Editable Conversion Rate Assumptions
        </h5>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          {/* Slider 1 */}
          <div>
            <div className="flex justify-between font-semibold text-gray-700 mb-1">
              <span>Verified Turnout:</span>
              <span className="text-emerald-700 font-bold">{verifiedTurnout}%</span>
            </div>
            <input
              type="range"
              min={40}
              max={95}
              value={verifiedTurnout}
              onChange={e => setVerifiedTurnout(Number(e.target.value))}
              className="w-full accent-emerald-700 cursor-pointer"
            />
          </div>

          {/* Slider 2 */}
          <div>
            <div className="flex justify-between font-semibold text-gray-700 mb-1">
              <span>Unverified Turnout:</span>
              <span className="text-emerald-700 font-bold">{unverifiedTurnout}%</span>
            </div>
            <input
              type="range"
              min={20}
              max={80}
              value={unverifiedTurnout}
              onChange={e => setUnverifiedTurnout(Number(e.target.value))}
              className="w-full accent-emerald-700 cursor-pointer"
            />
          </div>

          {/* Slider 3 */}
          <div>
            <div className="flex justify-between font-semibold text-gray-700 mb-1">
              <span>Strong Conv.:</span>
              <span className="text-emerald-700 font-bold">{strongConversion}%</span>
            </div>
            <input
              type="range"
              min={50}
              max={100}
              value={strongConversion}
              onChange={e => setStrongConversion(Number(e.target.value))}
              className="w-full accent-emerald-700 cursor-pointer"
            />
          </div>

          {/* Slider 4 */}
          <div>
            <div className="flex justify-between font-semibold text-gray-700 mb-1">
              <span>Leaning Conv.:</span>
              <span className="text-emerald-700 font-bold">{leaningConversion}%</span>
            </div>
            <input
              type="range"
              min={30}
              max={90}
              value={leaningConversion}
              onChange={e => setLeaningConversion(Number(e.target.value))}
              className="w-full accent-emerald-700 cursor-pointer"
            />
          </div>

          {/* Slider 5 */}
          <div>
            <div className="flex justify-between font-semibold text-gray-700 mb-1">
              <span>Undecided Conv.:</span>
              <span className="text-emerald-700 font-bold">{undecidedConversion}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={60}
              value={undecidedConversion}
              onChange={e => setUndecidedConversion(Number(e.target.value))}
              className="w-full accent-emerald-700 cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Mandatory On-Screen Disclaimer */}
      <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 text-[11px] leading-relaxed flex items-start gap-2">
        <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
        <div>
          <strong>Transparent Projection Disclaimer:</strong> This projection model is an internal statistical estimate 
          based on supporter pledges and historical Kakamega turnout rates. Currently calculating with{' '}
          <strong>{includeUnverified ? 'All Field Supporter Rows (including unverified & pending ID)' : 'Strictly Verified IEBC Voters Only'}</strong>. 
          Voters registered in neighboring constituencies (e.g., Shinyalu, Ikolomani) are excluded.
        </div>
      </div>
    </div>
  );
};
