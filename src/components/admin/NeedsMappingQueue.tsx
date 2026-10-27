import React, { useState } from 'react';
import { 
  MapPin, 
  Sparkles, 
  Check, 
  Trash2, 
  ArrowRight, 
  HelpCircle, 
  Building2, 
  CheckCircle2, 
  AlertCircle 
} from 'lucide-react';
import { CANONICAL_WARDS, CANONICAL_CENTRES, CANONICAL_ALIASES } from '../../data/canonicalData.ts';
import { PlaceAlias } from '../../types/index.ts';

const UNRESOLVED_ALIASES_QUEUE: PlaceAlias[] = [
  {
    id: 'un-01',
    raw_alias: 'Daisy',
    canonical_type: 'polling_centre',
    confidence: 0,
    notes: 'Personal name entered into polling place column. Candidate for rejection or landmark routing.'
  },
  {
    id: 'un-02',
    raw_alias: 'uncle devi',
    canonical_type: 'polling_centre',
    confidence: 0,
    notes: 'Informal alias entered in place column.'
  },
  {
    id: 'un-03',
    raw_alias: 'Chief Mutsembi',
    canonical_type: 'polling_centre',
    confidence: 0,
    notes: 'Sub-chief administrative office landmark in Butsotso.'
  },
  {
    id: 'un-04',
    raw_alias: 'Approved',
    canonical_type: 'polling_centre',
    confidence: 0,
    notes: 'Misplaced workflow approval status in polling place cell.'
  }
];

export const NeedsMappingQueue: React.FC = () => {
  const [unresolvedQueue, setUnresolvedQueue] = useState<PlaceAlias[]>(UNRESOLVED_ALIASES_QUEUE);
  const [selectedAlias, setSelectedAlias] = useState<PlaceAlias | null>(null);
  const [targetWardId, setTargetWardId] = useState(CANONICAL_WARDS[0].id);
  const [targetCentreId, setTargetCentreId] = useState(CANONICAL_CENTRES[0].id);
  const [mappingType, setMappingType] = useState<'map_to_centre' | 'mark_as_junk'>('map_to_centre');
  const [mappingNotes, setMappingNotes] = useState('');

  const centresInSelectedWard = CANONICAL_CENTRES.filter(c => c.ward_id === targetWardId);

  const handleResolveMapping = () => {
    if (!selectedAlias) return;

    if (mappingType === 'map_to_centre') {
      const centre = CANONICAL_CENTRES.find(c => c.id === targetCentreId);
      const ward = CANONICAL_WARDS.find(w => w.id === targetWardId);
      CANONICAL_ALIASES.push({
        id: `alias-${Date.now()}`,
        raw_alias: selectedAlias.raw_alias,
        canonical_type: 'polling_centre',
        target_ward_id: targetWardId,
        target_polling_centre_id: targetCentreId,
        confidence: 0.95,
        notes: `Admin mapped "${selectedAlias.raw_alias}" to ${centre?.name} (${ward?.name}). Note: ${mappingNotes}`
      });
    }

    setUnresolvedQueue(prev => prev.filter(a => a.id !== selectedAlias.id));
    setSelectedAlias(null);
    setMappingNotes('');
  };

  return (
    <div className="space-y-5">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-700" />
            <span>"Needs Mapping" Geographic Resolution Queue ({unresolvedQueue.length})</span>
          </h4>
          <p className="text-xs text-gray-500">
            Resolves unmapped place values and personal nicknames from legacy Excel sheets into canonical wards and centres.
          </p>
        </div>
      </div>

      {/* Queue items */}
      {unresolvedQueue.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {unresolvedQueue.map(item => (
            <div
              key={item.id}
              className="p-4 rounded-xl border border-gray-200 bg-white shadow-xs space-y-3 hover:border-gray-300 transition-all"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                  "{item.raw_alias}"
                </span>
                <span className="text-[10px] uppercase font-bold text-gray-500">
                  {item.canonical_type.replace('_', ' ')}
                </span>
              </div>

              <p className="text-xs text-gray-600 leading-relaxed">
                {item.notes}
              </p>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-400">Confidence: 0.00</span>
                <button
                  onClick={() => setSelectedAlias(item)}
                  className="px-3 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  Map to Canonical
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-8 text-center bg-white rounded-xl border border-gray-200 space-y-2">
          <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
          <div className="font-bold text-sm text-gray-900">
            Needs Mapping Queue is Clear!
          </div>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            All raw aliases from the legacy workbook have been resolved to canonical Lurambi wards or polling centres.
          </p>
        </div>
      )}

      {/* Mapping Dialog Modal */}
      {selectedAlias && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="pb-2 border-b border-gray-100">
              <h4 className="font-bold text-sm text-gray-900">
                Resolve Raw Alias: <span className="font-mono text-emerald-800">"{selectedAlias.raw_alias}"</span>
              </h4>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-gray-700 block mb-1">Resolution Strategy</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setMappingType('map_to_centre')}
                    className={`p-2 rounded-lg border text-center font-bold ${
                      mappingType === 'map_to_centre'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-950'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    Map to Polling Centre
                  </button>
                  <button
                    type="button"
                    onClick={() => setMappingType('mark_as_junk')}
                    className={`p-2 rounded-lg border text-center font-bold ${
                      mappingType === 'mark_as_junk'
                        ? 'border-rose-600 bg-rose-50 text-rose-950'
                        : 'border-gray-200 text-gray-600'
                    }`}
                  >
                    Mark as Junk / Discard
                  </button>
                </div>
              </div>

              {mappingType === 'map_to_centre' && (
                <>
                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">Select Ward</label>
                    <select
                      value={targetWardId}
                      onChange={e => setTargetWardId(e.target.value)}
                      className="w-full p-2 border rounded-lg bg-gray-50"
                    >
                      {CANONICAL_WARDS.map(w => (
                        <option key={w.id} value={w.id}>{w.name} Ward</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-gray-700 block mb-1">Select Canonical Polling Centre</label>
                    <select
                      value={targetCentreId}
                      onChange={e => setTargetCentreId(e.target.value)}
                      className="w-full p-2 border rounded-lg bg-gray-50"
                    >
                      {centresInSelectedWard.map(c => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold text-gray-700 block mb-1">Audit Notes / Rationale</label>
                <input
                  type="text"
                  value={mappingNotes}
                  onChange={e => setMappingNotes(e.target.value)}
                  placeholder="e.g. Village elder clarified this is near Eshisiru"
                  className="w-full p-2 border rounded-lg bg-gray-50"
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setSelectedAlias(null)}
                className="flex-1 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleResolveMapping}
                className="flex-1 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800"
              >
                Save Canonical Alias
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
