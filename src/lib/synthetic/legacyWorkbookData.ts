/**
 * Synthetic Legacy Excel Workbook Generator for Lurambi Constituency 2027
 * 
 * Fictional sample records mirroring all legacy data problems:
 * 1. IDs mostly missing (~14% filled, remainder pending_id)
 * 2. Phones stored as numbers without leading zero (e.g. 712345678)
 * 3. 12-digit numbers without plus (254712345678)
 * 4. 8-digit invalid phones (71234567)
 * 5. Phones with spaces ("0705 961838")
 * 6. Shared phones across family members
 * 7. Ward spelling variants ("Shieywe", "Mahialako", "Butsotso south")
 * 8. Polling place junk values ("Approved", "Daisy", "uncle devi", "Chief Mutsembi", "chillpark", "Iyala ")
 * 9. SUPPORT LEVEL misused for mobilizer first names ("Zainab", "Mildred")
 * 10. Cross-tab duplicates between "Raw Data" and individual ward tabs
 * 11. "not found" tab mapped to not_found verification status
 * 12. "pastors" tab (~10 faith leaders) and "chps tv" tab (~10 CHPs with Community Units)
 */

export interface LegacyWorkbookRow {
  sheetName: string;
  rowNumber: number;
  date?: string;
  name: string;
  idNo?: string | number;
  phone?: string | number;
  pollingPlace?: string;
  ward?: string;
  supportLevel?: string;
  eventContact?: string;
  age?: string | number;
  // Specific to network tabs
  denomination?: string;
  communityUnit?: string;
  subCounty?: string;
}

export function generateSyntheticLegacyWorkbook(): Record<string, LegacyWorkbookRow[]> {
  const sheets: Record<string, LegacyWorkbookRow[]> = {
    'Raw Data': [],
    'Sheywe': [],
    'Shirere': [],
    'Butsotso Central': [],
    'Butsotso East': [],
    'Mahiakalo': [],
    'Butsotso South': [],
    'not found': [],
    'pastors': [],
    'chps tv': []
  };

  // Base list of fictional voters for Raw Data and Ward sheets
  // Demonstrating known edge cases
  const rawRows: Partial<LegacyWorkbookRow>[] = [
    // 1. Valid ID + lost zero phone (9 digits starting with 7)
    { date: '2024-03-12', name: 'Barasa Wekesa Synthetic', idNo: 28491023, phone: 712345678, pollingPlace: 'Kakamega Primary School', ward: 'Sheywe', supportLevel: 'Zainab' },
    
    // 2. Missing ID (pending_id) + phone with spaces
    { date: '2024-03-12', name: 'Nafuna Makokha Demo', idNo: '', phone: '0705 961838', pollingPlace: 'Bukhungu Stadium Grounds', ward: 'Shieywe', supportLevel: 'Mildred' },
    
    // 3. Typo ward ("Mahialako") + 12-digit phone (2547...)
    { date: '2024-03-14', name: 'Omondi Otieno Fictional', idNo: 31204958, phone: 254722112233, pollingPlace: 'MMUST (Masinde Muliro University)', ward: 'Mahialako', supportLevel: 'Strong Supporter' },
    
    // 4. Shared phone (same phone as row 1, different name)
    { date: '2024-03-15', name: 'Silvia Wekesa Synthetic', idNo: '', phone: 712345678, pollingPlace: 'Kakamega Primary School', ward: 'Sheywe', supportLevel: '' },
    
    // 5. Invalid 8-digit phone
    { date: '2024-03-15', name: 'Erick Mulama Test', idNo: 29384756, phone: 71234567, pollingPlace: 'Amalemba Primary School', ward: 'Shirere ', supportLevel: 'Zainab' },
    
    // 6. Junk place ("Daisy" - person name in place column)
    { date: '2024-03-16', name: 'Faith Shiundu Sample', idNo: '', phone: '0711998877', pollingPlace: 'Daisy', ward: 'Butsotso south', supportLevel: '' },
    
    // 7. Junk place ("Approved" - status string in place column)
    { date: '2024-03-16', name: 'Collins Khisa Mock', idNo: '', phone: '0722445566', pollingPlace: 'Approved', ward: 'Butsotso Central', supportLevel: 'Leaning' },
    
    // 8. Place alias ("chillpark" -> Muliro Gardens)
    { date: '2024-03-17', name: 'Mercyline Ambani Demo', idNo: 33445566, phone: '0733112233', pollingPlace: 'chillpark', ward: 'Sheywe', supportLevel: 'Mildred' },
    
    // 9. Place alias with trailing space ("Iyala ")
    { date: '2024-03-18', name: 'Geoffrey Shikoti Mock', idNo: '', phone: '0701002233', pollingPlace: 'Iyala ', ward: 'butsotso east', supportLevel: 'Zainab' },
    
    // 10. Junk place ("uncle devi")
    { date: '2024-03-19', name: 'Aggrey Lichoti Synthetic', idNo: '', phone: '0714556677', pollingPlace: 'uncle devi', ward: 'Mahiakalo', supportLevel: '' },
    
    // 11. Cross-tab duplicate candidate (will also appear in Sheywe tab with later date)
    { date: '2024-02-10', name: 'Kennedy Musundi Test', idNo: 27182930, phone: '0720123456', pollingPlace: 'Kakamega Primary School', ward: 'Sheywe', supportLevel: 'Strong' },

    // 12. Invalid ID length (only 5 digits)
    { date: '2024-03-20', name: 'Brenda Khalayi Demo', idNo: 12345, phone: '0723889900', pollingPlace: 'Shikoti Girls Secondary', ward: 'Butsotso East', supportLevel: 'Undecided' }
  ];

  // Synthesize up to 100 rows for Raw Data mirroring real proportions
  let rowId = 1;
  for (const item of rawRows) {
    sheets['Raw Data'].push({
      sheetName: 'Raw Data',
      rowNumber: rowId++,
      date: item.date,
      name: item.name!,
      idNo: item.idNo,
      phone: item.phone,
      pollingPlace: item.pollingPlace,
      ward: item.ward,
      supportLevel: item.supportLevel,
      eventContact: '',
      age: ''
    });
  }

  // Populate synthetic rows for 6 ward tabs (with cross-tab duplicates and missing IDs)
  const firstNames = ['Wycliffe', 'Bilha', 'Cornelius', 'Deborah', 'Emmanuel', 'Fridah', 'Gideon', 'Hellen', 'Isaac', 'Joyce', 'Kelvin', 'Lydia', 'Moses', 'Norah'];
  const luhyaSurnames = ['Wekesa', 'Makokha', 'Simiyu', 'Khisa', 'Ambani', 'Shikuku', 'Mukolwe', 'Lichoti', 'Musundi', 'Khalayi', 'Shiundu', 'Imbuhila'];
  const wardsList = ['Sheywe', 'Shirere', 'Butsotso Central', 'Butsotso East', 'Mahiakalo', 'Butsotso South'];

  let count = 0;
  for (const ward of wardsList) {
    for (let i = 0; i < 15; i++) {
      count++;
      const isIdFilled = i % 7 === 0; // ~14% filled IDs
      const fakeId = isIdFilled ? 26000000 + (count * 1234) % 10000000 : '';
      const phoneDigits = 710000000 + (count * 54321) % 89999999;
      const phoneFormat = i % 4 === 0 ? phoneDigits : (i % 4 === 1 ? `0${phoneDigits}` : (i % 4 === 2 ? `254${phoneDigits}` : `07${String(phoneDigits).slice(2, 6)} ${String(phoneDigits).slice(6)}`));
      
      const isMisused = i % 3 === 0;
      const supportVal = isMisused ? (i % 2 === 0 ? 'Zainab' : 'Mildred') : (i % 5 === 0 ? 'Strong Supporter' : (i % 5 === 1 ? 'Leaning' : ''));

      sheets[ward].push({
        sheetName: ward,
        rowNumber: i + 1,
        date: `2024-03-${10 + (i % 15)}`,
        name: `${firstNames[i % firstNames.length]} ${luhyaSurnames[(i + count) % luhyaSurnames.length]} Synthetic`,
        idNo: fakeId,
        phone: phoneFormat,
        pollingPlace: i % 5 === 0 ? 'chillpark' : (i % 6 === 0 ? 'Daisy' : `${ward} Centre ${((i % 3) + 1)}`),
        ward: i % 4 === 0 ? (ward === 'Sheywe' ? 'Shieywe' : (ward === 'Mahiakalo' ? 'Mahialako' : ward)) : ward,
        supportLevel: supportVal,
        eventContact: '',
        age: ''
      });
    }
  }

  // Cross-tab duplicate injection: Kennedy Musundi appears on Sheywe tab with later date
  sheets['Sheywe'].push({
    sheetName: 'Sheywe',
    rowNumber: 99,
    date: '2024-03-25', // Later date than in Raw Data (2024-02-10). Earliest date should be kept!
    name: 'Kennedy Musundi Test',
    idNo: 27182930,
    phone: '0720123456',
    pollingPlace: 'Kakamega Primary School',
    ward: 'Sheywe',
    supportLevel: 'Strong Supporter',
    eventContact: '',
    age: ''
  });

  // "not found" tab (mapped to not_found verification status)
  sheets['not found'] = [
    { sheetName: 'not found', rowNumber: 1, date: '2024-03-22', name: 'Titus Mukhwana Unfound', idNo: 19827364, phone: '0711223399', pollingPlace: 'Unknown Station', ward: 'Sheywe', supportLevel: 'Opposed' },
    { sheetName: 'not found', rowNumber: 2, date: '2024-03-22', name: 'Prudence Khatete Unfound', idNo: 28394012, phone: '0722334488', pollingPlace: 'Unknown Station', ward: 'Shirere', supportLevel: 'Undecided' }
  ];

  // "pastors" tab (~10 faith leaders)
  sheets['pastors'] = [
    { sheetName: 'pastors', rowNumber: 1, name: 'Rev. Timothy Wangila Fictional', phone: 710111222, denomination: 'PEFA Kakamega Central', ward: 'Sheywe' },
    { sheetName: 'pastors', rowNumber: 2, name: 'Pastor Mary Makokha Fictional', phone: '0721333444', denomination: 'Friends Church (Quakers) Shirere', ward: 'Shirere' },
    { sheetName: 'pastors', rowNumber: 3, name: 'Bishop Geoffrey Shikuku Fictional', phone: 254733555666, denomination: 'NCCK Regional Fellowship', ward: 'Mahiakalo' },
    { sheetName: 'pastors', rowNumber: 4, name: 'Fr. Aloysius Omondi Fictional', phone: '0701777888', denomination: 'Catholic Diocese of Kakamega', ward: 'Sheywe' },
    { sheetName: 'pastors', rowNumber: 5, name: 'Pastor Nathan Barasa Fictional', phone: 712999000, denomination: 'ACK St. Luke Butsotso East', ward: 'Butsotso East' },
    { sheetName: 'pastors', rowNumber: 6, name: 'Pastor Samuel Echesa Fictional', phone: '0724112233', denomination: 'Deliverance Church Bukura', ward: 'Butsotso South' },
    { sheetName: 'pastors', rowNumber: 7, name: 'Pastor Eunice Ambetsa Fictional', phone: '0718445566', denomination: 'Baptist Church Lurambi', ward: 'Butsotso Central' },
    { sheetName: 'pastors', rowNumber: 8, name: 'Pastor Christopher Inziani Fictional', phone: '0735778899', denomination: 'PCEA Kakamega Outreach', ward: 'Sheywe' },
    { sheetName: 'pastors', rowNumber: 9, name: 'Bishop Japheth Omwoma Fictional', phone: '0702334455', denomination: 'PAG Kakamega Town', ward: 'Sheywe' },
    { sheetName: 'pastors', rowNumber: 10, name: 'Rev. Florence Mukabana Fictional', phone: '0716667788', denomination: 'Salvation Army Shirere Citadel', ward: 'Shirere' }
  ];

  // "chps tv" tab (~10 Community Health Promoters with distinct Community Units)
  sheets['chps tv'] = [
    { sheetName: 'chps tv', rowNumber: 1, name: 'Grace Nafuna Simiyu Demo', idNo: 22114433, phone: 711223344, communityUnit: 'Amalemba Community Unit', subCounty: 'Lurambi', ward: 'Shirere' },
    { sheetName: 'chps tv', rowNumber: 2, name: 'Beatrice Imbuhila Demo', idNo: 23225544, phone: '0722334455', communityUnit: 'Bukura Community Unit', subCounty: 'Lurambi', ward: 'Butsotso South' },
    { sheetName: 'chps tv', rowNumber: 3, name: 'Silvanus Mukolwe Demo', idNo: 24336655, phone: 254733445566, communityUnit: 'Elukhambi Community Unit', subCounty: 'Lurambi', ward: 'Butsotso Central' },
    { sheetName: 'chps tv', rowNumber: 4, name: 'Roseline Khalayi Demo', idNo: 25447766, phone: '0705556677', communityUnit: 'Emukaya Community Unit', subCounty: 'Lurambi', ward: 'Butsotso East' },
    { sheetName: 'chps tv', rowNumber: 5, name: 'Dorothy Shirekaho Demo', idNo: 26558877, phone: 715667788, communityUnit: 'Shikoti Community Unit', subCounty: 'Lurambi', ward: 'Butsotso East' },
    { sheetName: 'chps tv', rowNumber: 6, name: 'Justus Wanyonyi Demo', idNo: 27669988, phone: '0726778899', communityUnit: 'Bukhungu Community Unit', subCounty: 'Lurambi', ward: 'Sheywe' },
    { sheetName: 'chps tv', rowNumber: 7, name: 'Hellen Anyango Demo', idNo: 28770099, phone: '0737889900', communityUnit: 'Mahiakalo Community Unit', subCounty: 'Lurambi', ward: 'Mahiakalo' },
    { sheetName: 'chps tv', rowNumber: 8, name: 'Patrick Liyayi Demo', idNo: 29881100, phone: '0708990011', communityUnit: 'Eshisiru Community Unit', subCounty: 'Lurambi', ward: 'Butsotso East' },
    { sheetName: 'chps tv', rowNumber: 9, name: 'Agnes Mwenesi Demo', idNo: 30992211, phone: 719001122, communityUnit: 'Sigalagala Community Unit', subCounty: 'Lurambi', ward: 'Shirere' },
    { sheetName: 'chps tv', rowNumber: 10, name: 'Festus Ambundo Demo', idNo: 31003322, phone: '0720112233', communityUnit: 'Town Central Community Unit', subCounty: 'Lurambi', ward: 'Sheywe' }
  ];

  return sheets;
}
