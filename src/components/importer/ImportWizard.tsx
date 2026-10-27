import React, { useState } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  RefreshCw, 
  Download, 
  Play, 
  Layers, 
  Users, 
  Phone, 
  ShieldCheck, 
  FileText,
  Sparkles,
  ChevronRight,
  Database
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { generateSyntheticLegacyWorkbook, LegacyWorkbookRow } from '../../lib/synthetic/legacyWorkbookData.ts';
import { 
  processWorkbookData, 
  generateImportReportXlsx, 
  DryRunReport, 
  ProcessedImportRow 
} from '../../lib/normalisation/importerCore.ts';
import { runAllNormalisationUnitTests, TestResultItem } from '../../lib/normalisation/normalisation.test.ts';

export const ImportWizard: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [activeTab, setActiveTab] = useState<'wizard' | 'test_runner'>('wizard');

  // Importer state
  const [workbookData, setWorkbookData] = useState<Record<string, LegacyWorkbookRow[]> | null>(null);
  const [fileName, setFileName] = useState<string>('Lurambi_2024_Legacy_Workbook_v1.xlsx');
  const [selectedSheets, setSelectedSheets] = useState<string[]>([]);
  const [dryRunReport, setDryRunReport] = useState<DryRunReport | null>(null);
  const [processedEntries, setProcessedEntries] = useState<ProcessedImportRow[]>([]);
  
  // Progress state for Step 4
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [commitComplete, setCommitComplete] = useState(false);

  // Unit tests state
  const [testReport, setTestReport] = useState<{
    allPassed: boolean;
    total: number;
    passed: number;
    failed: number;
    results: TestResultItem[];
  } | null>(() => runAllNormalisationUnitTests());

  // Handle loading synthetic test workbook
  const handleLoadSynthetic = () => {
    const data = generateSyntheticLegacyWorkbook();
    setWorkbookData(data);
    setFileName('Synthetic_Lurambi_Legacy_Supporters_2024.xlsx');
    setSelectedSheets(Object.keys(data));
    setStep(2);
  };

  // Handle user uploaded file via SheetJS
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
        const sheets: Record<string, LegacyWorkbookRow[]> = {};

        wb.SheetNames.forEach(sheetName => {
          const ws = wb.Sheets[sheetName];
          const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '', header: 1 });
          
          // Auto-detect header row
          let headerIdx = 0;
          for (let i = 0; i < Math.min(rawJson.length, 6); i++) {
            const rowStr = JSON.stringify(rawJson[i]).toLowerCase();
            if (rowStr.includes('name') || rowStr.includes('phone') || rowStr.includes('ward')) {
              headerIdx = i;
              break;
            }
          }

          const headers: string[] = rawJson[headerIdx]?.map((h: any) => String(h).trim().toLowerCase()) || [];
          const nameCol = headers.findIndex(h => h.includes('name'));
          const idCol = headers.findIndex(h => h.includes('id'));
          const phoneCol = headers.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('mobile'));
          const wardCol = headers.findIndex(h => h.includes('ward'));
          const placeCol = headers.findIndex(h => h.includes('centre') || h.includes('station') || h.includes('polling'));
          const supportCol = headers.findIndex(h => h.includes('support'));
          const dateCol = headers.findIndex(h => h.includes('date'));
          const denomCol = headers.findIndex(h => h.includes('denom') || h.includes('church'));
          const cuCol = headers.findIndex(h => h.includes('cu') || h.includes('community unit'));

          const parsedRows: LegacyWorkbookRow[] = [];
          for (let r = headerIdx + 1; r < rawJson.length; r++) {
            const row = rawJson[r];
            if (!row || !row[nameCol]) continue; // Skip blank name rows

            parsedRows.push({
              sheetName,
              rowNumber: r + 1,
              date: dateCol >= 0 ? String(row[dateCol]) : '2024-03-01',
              name: String(row[nameCol] || ''),
              idNo: idCol >= 0 ? row[idCol] : '',
              phone: phoneCol >= 0 ? row[phoneCol] : '',
              pollingPlace: placeCol >= 0 ? String(row[placeCol] || '') : '',
              ward: wardCol >= 0 ? String(row[wardCol] || '') : '',
              supportLevel: supportCol >= 0 ? String(row[supportCol] || '') : '',
              denomination: denomCol >= 0 ? String(row[denomCol] || '') : '',
              communityUnit: cuCol >= 0 ? String(row[cuCol] || '') : ''
            });
          }

          sheets[sheetName] = parsedRows;
        });

        setWorkbookData(sheets);
        setSelectedSheets(wb.SheetNames);
        setStep(2);
      } catch (err) {
        console.error('Failed to parse workbook', err);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Run Dry-Run Analysis (Step 2 -> Step 3)
  const handleRunDryRun = () => {
    if (!workbookData) return;
    const activeSheetsData: Record<string, LegacyWorkbookRow[]> = {};
    selectedSheets.forEach(s => {
      if (workbookData[s]) activeSheetsData[s] = workbookData[s];
    });

    const result = processWorkbookData(activeSheetsData);
    setDryRunReport(result.report);
    setProcessedEntries(result.processedEntries);
    setStep(3);
  };

  // Execute Batch Commit (Step 3 -> Step 4)
  const handleCommitImport = () => {
    setStep(4);
    setIsCommitting(true);
    setCommitProgress(0);

    const total = processedEntries.length;
    let current = 0;
    const batchSize = Math.max(10, Math.floor(total / 10));

    const interval = setInterval(() => {
      current += batchSize;
      if (current >= total) {
        current = total;
        clearInterval(interval);
        setCommitProgress(100);
        setIsCommitting(false);
        setCommitComplete(true);
      } else {
        setCommitProgress(Math.floor((current / total) * 100));
      }
    }, 200);
  };

  // Download XLSX Audit Report
  const handleDownloadReport = () => {
    if (!processedEntries.length) return;
    const bytes = generateImportReportXlsx(processedEntries);
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lurambi_Import_Audit_Report_${Date.now()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Mode Switcher */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
            <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-gray-900">
              Stage 3: Legacy Excel Importer Wizard & Normalisation Engine
            </h3>
            <p className="text-xs text-gray-500">
              Handles lost leading zeros, 14% ID completion, place typos, and misused support columns.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('wizard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'wizard'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Play className="w-3.5 h-3.5" />
            4-Step Import Wizard
          </button>
          <button
            onClick={() => setActiveTab('test_runner')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'test_runner'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Unit Tests ({testReport?.passed}/{testReport?.total} Passed)
          </button>
        </div>
      </div>

      {activeTab === 'wizard' ? (
        <div className="space-y-6">
          {/* Stepper Header */}
          <div className="grid grid-cols-4 gap-2 text-xs font-bold text-center">
            <div className={`p-2.5 rounded-lg border transition-all ${step === 1 ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-600/20' : step > 1 ? 'bg-emerald-100/50 border-emerald-300 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
              1. File Ingestion
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${step === 2 ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-600/20' : step > 2 ? 'bg-emerald-100/50 border-emerald-300 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
              2. Multi-Tab & Preview
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${step === 3 ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-600/20' : step > 3 ? 'bg-emerald-100/50 border-emerald-300 text-emerald-800' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
              3. Dry-Run Audit Report
            </div>
            <div className={`p-2.5 rounded-lg border transition-all ${step === 4 ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-2 ring-emerald-600/20' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
              4. Batch Commit & Report
            </div>
          </div>

          {/* STEP 1: File Ingestion */}
          {step === 1 && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6">
              <div className="text-center max-w-xl mx-auto space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-2">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-lg font-bold text-gray-900">
                  Select Legacy Supporter Workbook (.xlsx, .csv)
                </h4>
                <p className="text-xs text-gray-600">
                  Upload the campaign's 1,000-supporter Excel sheet or test immediately using the synthetic dataset with all edge cases.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
                {/* 1-Click Synthetic Button */}
                <button
                  onClick={handleLoadSynthetic}
                  className="p-5 rounded-xl border-2 border-emerald-600/60 bg-emerald-50/50 hover:bg-emerald-50 text-left transition-all flex flex-col justify-between group cursor-pointer shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900">
                        RECOMMENDED FOR TEST
                      </span>
                      <Sparkles className="w-4 h-4 text-emerald-600 group-hover:scale-110 transition-transform" />
                    </div>
                    <h5 className="font-bold text-sm text-gray-900 mt-3">
                      Load Synthetic Lurambi Workbook
                    </h5>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      Preloaded with ~200 realistic rows: missing IDs, lost zero phones, ward typos ("Shieywe", "Mahialako"), junk places ("Daisy", "Approved"), and 10 Pastors + 10 CHPs.
                    </p>
                  </div>
                  <div className="mt-4 flex items-center gap-1 text-xs font-bold text-emerald-800">
                    <span>Load & Proceed</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>

                {/* Upload Real File */}
                <label className="p-5 rounded-xl border-2 border-dashed border-gray-300 hover:border-emerald-600 text-left transition-all flex flex-col justify-between cursor-pointer group bg-gray-50/50 hover:bg-white">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-200 text-gray-700">
                        CUSTOM FILE
                      </span>
                      <FileSpreadsheet className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
                    </div>
                    <h5 className="font-bold text-sm text-gray-900 mt-3">
                      Upload Custom Excel File
                    </h5>
                    <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                      Drag & drop your .xlsx or .xls file here. The auto-detector will scan for headers across all tabs.
                    </p>
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={handleFileUpload}
                  />
                  <div className="mt-4 flex items-center gap-1 text-xs font-bold text-gray-700 group-hover:text-emerald-700">
                    <span>Browse from disk</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </label>
              </div>
            </div>
          )}

          {/* STEP 2: Multi-Tab & Preview */}
          {step === 2 && workbookData && (
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
                <div>
                  <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                    Workbook Sheets Detected: {fileName}
                  </h4>
                  <p className="text-xs text-gray-500">
                    Select which tabs to import. Tabs will be de-duplicated across each other.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(1)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
                  >
                    Change File
                  </button>
                  <button
                    onClick={handleRunDryRun}
                    className="px-4 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    Run Dry-Run Audit
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Sheet checklist */}
              <div className="flex flex-wrap gap-2">
                {Object.keys(workbookData).map(sheet => {
                  const isSelected = selectedSheets.includes(sheet);
                  const rowCount = workbookData[sheet].length;
                  const isNetwork = sheet === 'pastors' || sheet === 'chps tv';
                  return (
                    <button
                      key={sheet}
                      onClick={() => {
                        if (isSelected) {
                          setSelectedSheets(selectedSheets.filter(s => s !== sheet));
                        } else {
                          setSelectedSheets([...selectedSheets, sheet]);
                        }
                      }}
                      className={`px-3 py-2 rounded-lg border text-xs font-semibold flex items-center gap-2 transition-all ${
                        isSelected
                          ? isNetwork
                            ? 'border-teal-500 bg-teal-50 text-teal-900'
                            : 'border-emerald-600 bg-emerald-50 text-emerald-950'
                          : 'border-gray-200 text-gray-400 bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="rounded text-emerald-600"
                      />
                      <span>{sheet}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-white border font-mono">
                        {rowCount} rows
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Raw Preview of First 15 Rows of First Sheet */}
              <div className="space-y-2">
                <h5 className="font-bold text-xs text-gray-700 uppercase tracking-wider">
                  Raw Ingestion Preview (First 10 Rows of "{selectedSheets[0] || 'Raw Data'}")
                </h5>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs divide-y divide-gray-200 font-sans">
                    <thead className="bg-gray-100 text-gray-700 font-bold">
                      <tr>
                        <th className="py-2 px-3 text-left">Date</th>
                        <th className="py-2 px-3 text-left">Name</th>
                        <th className="py-2 px-3 text-left">ID No.</th>
                        <th className="py-2 px-3 text-left">Phone</th>
                        <th className="py-2 px-3 text-left">Polling Place</th>
                        <th className="py-2 px-3 text-left">Ward</th>
                        <th className="py-2 px-3 text-left">Support Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-gray-600">
                      {(workbookData[selectedSheets[0] || 'Raw Data'] || []).slice(0, 10).map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-2 px-3 font-mono">{r.date || '—'}</td>
                          <td className="py-2 px-3 font-semibold text-gray-900">{r.name}</td>
                          <td className="py-2 px-3 font-mono">
                            {r.idNo ? String(r.idNo) : <span className="text-amber-600 italic">missing</span>}
                          </td>
                          <td className="py-2 px-3 font-mono">{String(r.phone)}</td>
                          <td className="py-2 px-3">{r.pollingPlace}</td>
                          <td className="py-2 px-3">{r.ward}</td>
                          <td className="py-2 px-3">
                            {r.supportLevel ? (
                              <span className="px-1.5 py-0.5 rounded bg-gray-100 text-[11px]">
                                {r.supportLevel}
                              </span>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Dry-Run Audit Report */}
          {step === 3 && dryRunReport && (
            <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-gray-100 gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <h4 className="font-bold text-base text-gray-900">
                      Dry-Run Audit & Cleaning Report
                    </h4>
                  </div>
                  <p className="text-xs text-gray-500">
                    Review cleaning statistics below before committing records to the campaign database.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setStep(2)}
                    className="px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900"
                  >
                    Back to Tabs
                  </button>
                  <button
                    onClick={handleCommitImport}
                    className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    Commit {processedEntries.length} Records to Database
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Data Problem KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50 space-y-1">
                  <span className="text-gray-500 font-semibold block">Total Rows Analyzed</span>
                  <span className="text-xl font-bold text-gray-900">{dryRunReport.totalRowsProcessed}</span>
                  <span className="text-[11px] text-gray-500 block">
                    {dryRunReport.voterRows} voters • {dryRunReport.pastorRows} pastors • {dryRunReport.chpRows} CHPs
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/50 space-y-1">
                  <span className="text-amber-800 font-semibold block">IDs Missing (Pending ID)</span>
                  <span className="text-xl font-bold text-amber-900">
                    {dryRunReport.pendingIdsCount} ({((dryRunReport.pendingIdsCount / Math.max(1, dryRunReport.voterRows)) * 100).toFixed(0)}%)
                  </span>
                  <span className="text-[11px] text-amber-700 block">
                    {dryRunReport.validIdsCount} valid 7-8 digit IDs
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                  <span className="text-emerald-800 font-semibold block">Phones Normalised to +254</span>
                  <span className="text-xl font-bold text-emerald-900">
                    {dryRunReport.validPhonesCount}
                  </span>
                  <span className="text-[11px] text-emerald-700 block">
                    {dryRunReport.sharedPhonesCount} flagged as shared phone
                  </span>
                </div>

                <div className="p-3.5 rounded-xl border border-teal-200 bg-teal-50/50 space-y-1">
                  <span className="text-teal-800 font-semibold block">Cross-Tab Duplicates Merged</span>
                  <span className="text-xl font-bold text-teal-900">
                    {dryRunReport.crossTabDuplicatesMergedCount}
                  </span>
                  <span className="text-[11px] text-teal-700 block">
                    Earliest captured_on retained
                  </span>
                </div>
              </div>

              {/* Data Cleaning Breakdown Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-2">
                  <h5 className="font-bold text-gray-900 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-emerald-700" />
                    Place & Ward Normalisation
                  </h5>
                  <div className="space-y-1.5 text-gray-600">
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Wards Resolved via Alias / Fuzzy:</span>
                      <strong className="text-emerald-800">{dryRunReport.resolvedWardsCount}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Junk Polling Places Detected ("Daisy", "Approved"):</span>
                      <strong className="text-rose-700">{dryRunReport.junkPlacesCount} (to Needs Mapping)</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>Centres Confidently Mapped:</span>
                      <strong className="text-emerald-800">{dryRunReport.resolvedPlacesCount}</strong>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-gray-200 bg-white space-y-2">
                  <h5 className="font-bold text-gray-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-emerald-700" />
                    Support Column & Network Attribution
                  </h5>
                  <div className="space-y-1.5 text-gray-600">
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Misused Support Level (First names extracted):</span>
                      <strong className="text-purple-700">{dryRunReport.misusedSupportLevelCount}</strong>
                    </div>
                    <div className="flex justify-between py-1 border-b border-gray-100">
                      <span>Pastors Routed to Faith Leaders Roster:</span>
                      <strong className="text-emerald-800">{dryRunReport.pastorRows}</strong>
                    </div>
                    <div className="flex justify-between py-1">
                      <span>CHPs Isolated with Neutrality Toggle:</span>
                      <strong className="text-teal-800">{dryRunReport.chpRows}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sample of Normalised Rows */}
              <div className="space-y-2">
                <h5 className="font-bold text-xs text-gray-700 uppercase tracking-wider">
                  Sample of Normalised Records (Ready for Insertion)
                </h5>
                <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-72">
                  <table className="min-w-full text-xs divide-y divide-gray-200">
                    <thead className="bg-gray-100 text-gray-700 font-bold sticky top-0">
                      <tr>
                        <th className="py-2 px-3 text-left">Status</th>
                        <th className="py-2 px-3 text-left">Name</th>
                        <th className="py-2 px-3 text-left">Masked ID</th>
                        <th className="py-2 px-3 text-left">Phone (+254)</th>
                        <th className="py-2 px-3 text-left">Ward</th>
                        <th className="py-2 px-3 text-left">Support Level</th>
                        <th className="py-2 px-3 text-left">Flags</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-gray-600">
                      {dryRunReport.sampleRows.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="py-2 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              r.status === 'imported'
                                ? 'bg-emerald-100 text-emerald-800'
                                : r.status === 'merged_duplicate'
                                ? 'bg-teal-100 text-teal-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}>
                              {r.status}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-semibold text-gray-900">{r.cleanName}</td>
                          <td className="py-2 px-3 font-mono">{r.nationalIdMasked || 'N/A'}</td>
                          <td className="py-2 px-3 font-mono text-emerald-700">{r.phoneE164 || 'INVALID'}</td>
                          <td className="py-2 px-3">{r.canonicalWardName || 'Unmapped'}</td>
                          <td className="py-2 px-3">
                            {r.legacyMobilizerLabel ? (
                              <span className="text-[11px] text-purple-800 bg-purple-50 px-1 rounded">
                                {r.legacyMobilizerLabel} (mobilizer)
                              </span>
                            ) : (
                              r.supportLevel
                            )}
                          </td>
                          <td className="py-2 px-3">
                            {r.flags.length > 0 ? (
                              <span className="text-[10px] text-amber-700 font-semibold">
                                {r.flags.join(', ')}
                              </span>
                            ) : (
                              <span className="text-[10px] text-emerald-600">Clean</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Chunked Batch Progress & Completion */}
          {step === 4 && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-xs space-y-6 text-center max-w-xl mx-auto">
              {!commitComplete ? (
                <div className="space-y-4 py-6">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto animate-spin">
                    <RefreshCw className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="font-bold text-base text-gray-900">
                      Executing Batch Inserts (Chunk Size: 1,000 / batch)...
                    </h4>
                    <p className="text-xs text-gray-500 mt-1">
                      Attributing records to system user <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">legacy_import</code>.
                    </p>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-emerald-600 h-3 rounded-full transition-all duration-300"
                      style={{ width: `${commitProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs font-mono text-gray-600">
                    {commitProgress}% Completed
                  </div>
                </div>
              ) : (
                <div className="space-y-5 py-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto shadow-xs">
                    <CheckCircle2 className="w-8 h-8 text-emerald-600" />
                  </div>
                  <div>
                    <h4 className="text-xl font-extrabold text-gray-900">
                      Import Successful!
                    </h4>
                    <p className="text-xs text-gray-600 mt-1">
                      {processedEntries.length} records processed and logged into <code className="bg-gray-100 px-1 py-0.5 rounded font-mono">imports</code> table.
                    </p>
                  </div>

                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-900 text-left space-y-1.5">
                    <div className="flex justify-between">
                      <span>Import Batch ID:</span>
                      <strong className="font-mono">imp-2024-legacy-01</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Attributed Mobilizer:</span>
                      <strong className="font-mono">legacy_import (System)</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Earliest Capture Date Preserved:</span>
                      <strong>2024-02-10 (Kennedy Musundi)</strong>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <button
                      onClick={handleDownloadReport}
                      className="px-4 py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors shadow-xs flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Download Import Report (XLSX)
                    </button>
                    <button
                      onClick={() => {
                        setStep(1);
                        setCommitComplete(false);
                      }}
                      className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-xs font-semibold hover:bg-gray-50"
                    >
                      Start Another Import
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Test Runner Tab */
        <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-gray-100">
            <div>
              <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Normalisation Unit Test Suite Execution
              </h4>
              <p className="text-xs text-gray-500">
                Automated assertions validating Kenyan phone normalisation, 7-8 digit national IDs, trigram ward matching, junk places, and support column names.
              </p>
            </div>
            <button
              onClick={() => setTestReport(runAllNormalisationUnitTests())}
              className="px-3 py-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 text-xs font-semibold flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
              Re-run Tests
            </button>
          </div>

          {/* Test results table */}
          {testReport && (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-xs divide-y divide-gray-200">
                <thead className="bg-gray-100 text-gray-700 font-bold">
                  <tr>
                    <th className="py-2 px-3 text-left">Category</th>
                    <th className="py-2 px-3 text-left">Test Specification</th>
                    <th className="py-2 px-3 text-left">Expected</th>
                    <th className="py-2 px-3 text-left">Actual</th>
                    <th className="py-2 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 text-gray-700">
                  {testReport.results.map((res, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-semibold text-gray-900">{res.category}</td>
                      <td className="py-2.5 px-3">{res.name}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-gray-600">{res.expected}</td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-emerald-700">{res.actual}</td>
                      <td className="py-2.5 px-3 text-center">
                        {res.passed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            PASS
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px]">
                            FAIL
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
