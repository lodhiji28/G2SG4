/**
 * Qualification picker — MPESB Group-2 Sub-Group-4 & Patwari 2026 Rulebook.
 * Extracted directly from official notification qualification clauses (Post codes 097–250+).
 *
 * IMPORTANT:
 * This list is used for leaderboard filtering and candidate tagging.
 * Candidates can select multiple qualifications that they hold.
 */

export interface QualificationGroup {
  id: string;
  label: string;
  hint?: string;
  items: string[];
}

/** Qualifications directly from the MPESB Group-2 Sub-Group-4 Rulebook. */
export const QUALIFICATION_GROUPS: QualificationGroup[] = [
  {
    id: 'grad-general',
    label: 'स्नातक — सामान्य (Graduation - General)',
    hint: 'अधिकांश प्रशासनिक व समन्वय पदों के लिए आवश्यक आधार योग्यता।',
    items: [
      'स्नातक (किसी भी विषय में Graduation - सामान्य पद)',
      'स्नातक — न्यूनतम 50% अंकों के साथ',
      'स्नातक — न्यूनतम 60% अंकों के साथ',
      'कला संकाय में स्नातक (B.A.)',
    ],
  },
  {
    id: 'patwari-cpct',
    label: 'पटवारी, CPCT एवं कंप्यूटर योग्यता (Patwari & Computer)',
    hint: 'पटवारी, डाटा एंट्री ऑपरेटर व सहायक ग्रेड-3 पदों हेतु।',
    items: [
      'स्नातक + CPCT स्कोर कार्ड (हिंदी टाइपिंग) [पटवारी पद]',
      'स्नातक + CPCT स्कोर कार्ड (हिंदी एवं अंग्रेजी टाइपिंग)',
      'स्नातक + 1 वर्षीय कंप्यूटर डिप्लोमा (DCA / PGDCA / ITI COPA)',
      'स्नातक + CPCT + 1 वर्षीय कंप्यूटर डिप्लोमा (DCA / PGDCA)',
      'बी.सी.ए. (BCA - Bachelor of Computer Applications)',
      'बी.ई. / बी.टेक (Computer Science / IT)',
      'एम.सी.ए. (MCA) / एम.एससी (CS / IT)',
      'एम.टेक / बी.ई. (IT/CS) + वेब विकास / डेटाबेस अनुभव',
      'नाइलिट (NIELIT) O-Level / A-Level / CCC प्रमाणपत्र',
    ],
  },
  {
    id: 'steno-typing',
    label: 'शीघ्रलेखन एवं मुद्रलेखन (Stenography & Typing)',
    hint: 'स्टेनोग्राफर, शीघ्रलेखक एवं टाइपिस्ट पदों हेतु।',
    items: [
      'स्नातक + हिंदी शीघ्रलेखन (80 शब्द/मिनट) + कंप्यूटर डिप्लोमा / CPCT',
      'स्नातक + हिंदी शीघ्रलेखन (100 शब्द/मिनट) + कंप्यूटर डिप्लोमा / CPCT',
      'स्नातक + अंग्रेजी शीघ्रलेखन (English Steno) + कंप्यूटर डिप्लोमा / CPCT',
      'स्नातक + मुद्रलेखन / टाइपिंग बोर्ड प्रमाणपत्र (हिंदी / अंग्रेजी)',
      'स्टेनोटाइपिस्ट प्रमाणपत्र (हिंदी / अंग्रेजी)',
    ],
  },
  {
    id: 'commerce-audit',
    label: 'वाणिज्य एवं लेखा (Commerce & Accounts)',
    hint: 'सहायक संपरीक्षक, लेखापाल, कनिष्ठ लेखाधिकारी व अंकेक्षक पदों हेतु।',
    items: [
      'बी.कॉम (B.Com - वाणिज्य स्नातक)',
      'बी.कॉम + 1 वर्षीय कंप्यूटर डिप्लोमा (DCA/PGDCA)',
      'बी.कॉम + टैली (Tally) दक्षता प्रमाण पत्र',
      'बी.कॉम + म.प्र. लेखा परीक्षा उत्तीर्ण (MP Accounts Exam Pass)',
      'एम.कॉम (M.Com - वाणिज्य स्नातकोत्तर)',
      'अर्थशास्त्र / सांख्यिकी / गणित में स्नातक',
    ],
  },
  {
    id: 'science-tech',
    label: 'विज्ञान, सांख्यिकी एवं तकनीकी (Science & Technical)',
    hint: 'अन्वेषक, सांख्यिकी अन्वेषक एवं तकनीकी विशेषज्ञ पदों हेतु।',
    items: [
      'विज्ञान संकाय में स्नातक (B.Sc. Science - PCM / CBZ)',
      'बी.एससी. सांख्यिकी / गणित (Statistics / Maths)',
      'कृषि संकाय में स्नातक (B.Sc. Agriculture / Horticulture)',
      'पशुचिकित्सा विज्ञान में स्नातक (Veterinary Science)',
      'बी.ई. / बी.टेक (इलेक्ट्रॉनिक्स एवं टेलीकम्युनिकेशन)',
      'सांख्यिकी / भौतिकी / गणित में स्नातकोत्तर (M.Sc. / M.A.)',
    ],
  },
  {
    id: 'law-local',
    label: 'विधि, स्थानीय निकाय व प्रशासन (Law, LSGD & Revenue)',
    hint: 'राजस्व निरीक्षक, कर निर्धारक, अतिक्रमण निरोधक व विधिक पदों हेतु।',
    items: [
      'विधि स्नातक (एल.एल.बी. / LL.B.)',
      'स्नातक + स्थानीय निकाय डिप्लोमा (LSGD - Diploma in Local Self Government)',
      'स्नातक + राजस्व / संपत्ति कर विषय में डिप्लोमा (Revenue / Property Tax)',
      'नगर नियोजन में उपाधि (Degree in Urban Planning)',
      'यातायात प्रबंधन में उपाधि (Degree in Traffic Management)',
    ],
  },
  {
    id: 'library-journalism',
    label: 'ग्रंथालय विज्ञान एवं पत्रकारिता (Library Science & Journalism)',
    hint: 'ग्रंथपाल, सहायक लाइब्रेरियन, प्रचार सहायक व जनसंपर्क पदों हेतु।',
    items: [
      'पुस्तकालय विज्ञान में स्नातक (B.Lib / Bachelor of Library Science)',
      'पुस्तकालय विज्ञान में डिप्लोमा / प्रमाण पत्र (Diploma / Cert in Library Science)',
      'विज्ञान स्नातक (B.Sc.) + पुस्तकालय विज्ञान में प्रमाण पत्र',
      'पत्रकारिता एवं जनसंचार में स्नातक / स्नातकोत्तर / डिप्लोमा (Journalism & Mass Comm)',
    ],
  },
  {
    id: 'social-special',
    label: 'सामाजिक कार्य व अन्य विशिष्ट योग्यता (Social Work & Others)',
    hint: 'सोशल वर्कर, वार्डन, खेल एवं स्वास्थ्य विशेषज्ञ पदों हेतु।',
    items: [
      'मास्टर ऑफ सोशल वर्क (MSW) / मेडिकल सोशल वर्कर',
      'समाजशास्त्र में स्नातकोत्तर (M.A. Sociology)',
      'बी.पी.एड (B.P.Ed - शारीरिक शिक्षा) + राज्य स्तरीय खेल प्रतिनिधित्व',
      'अग्निशमन में डिग्री / डिप्लोमा (Fire & Safety Degree/Diploma)',
      'कार्डियो परफ्यूजनिस्ट / बी.एससी बायोलॉजी + पीजी डिप्लोमा परफ्यूजन',
      'कनिष्ठ ग्रामीण विस्तार संगठक योग्यता',
    ],
  },
];

/** Flat list of all official recruitment qualifications. */
export const MASTER_QUALIFICATIONS: string[] = QUALIFICATION_GROUPS.flatMap((g) => g.items);

/** Stable id for filter URLs and storage matching. */
export const QUALIFICATION_ID = new Map(
  MASTER_QUALIFICATIONS.map((q, i) => [q, `q${String(i + 1).padStart(3, '0')}`])
);
