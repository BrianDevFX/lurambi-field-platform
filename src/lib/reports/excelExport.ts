import * as XLSX from 'xlsx';
import { Entry } from '../../types/index.ts';

export function exportSupportersXlsx(entries: Entry[], filename = 'Lurambi_Supporters_Roster'): void {
  const wb = XLSX.utils.book_new();

  const data = entries.map((e, index) => ({
    'No': index + 1,
    'Capture Date': e.captured_on,
    'Supporter Name': e.name,
    'National ID (Masked)': e.id_masked || 'PENDING ID',
    'Phone (+254)': e.phone_e164 || 'INVALID',
    'Ward': e.ward_name,
    'Polling Centre': e.polling_centre_name || 'Unassigned',
    'Polling Station': e.polling_station_name || 'Stream 1',
    'Support Level': e.support_level.replace('_', ' ').toUpperCase(),
    'Verification Status': e.verification_status,
    'Has PVC': e.has_pvc ? 'YES' : 'NO',
    'Needs Transport': e.needs_transport ? 'YES' : 'NO',
    'Key Issues': (e.issues || []).join(', '),
    'Mobilizer': e.mobilizer_name || 'Self Registered',
    'Source': e.source,
    'Flags': (e.flags || []).join('; ')
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Supporters');

  XLSX.writeFile(wb, `${filename}_${Date.now()}.xlsx`);
}

export function downloadCleanImportTemplate(): void {
  const wb = XLSX.utils.book_new();

  const headers = [
    ['Date (YYYY-MM-DD)', 'NAME', 'ID NO.', 'PHONE', 'WARD', 'POLLING CENTRE', 'POLLING STATION', 'SUPPORT LEVEL', 'EVENT CONTACT', 'AGE']
  ];

  const sampleRows = [
    ['2026-10-22', 'Barasa Wekesa Example', '28491023', '0712345678', 'Sheywe', 'Kakamega Primary School', 'Kakamega Primary - Stream 1', 'Strong Supporter', '', '32'],
    ['2026-10-22', 'Nafuna Makokha Example', '', '0705961838', 'Shirere', 'Amalemba Primary School', 'Amalemba Primary - Stream 1', 'Leaning', '', '28']
  ];

  const ws = XLSX.utils.aoa_to_sheet([...headers, ...sampleRows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Template');

  XLSX.writeFile(wb, 'Lurambi_2027_Supporters_Clean_Import_Template.xlsx');
}
