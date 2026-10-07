/**
 * Qualification picker — the only thing (besides category and gender) a
 * candidate is allowed to set about themselves on this site.
 *
 * IMPORTANT — what this list is and is not
 * ------------------------------------------------------------------
 * This is a *tag list for filtering the leaderboard*. It is deliberately wider
 * than any single post's requirement, because 22 shifts and dozens of post codes
 * each ask for something different, and one candidate may hold several
 * qualifications.
 *
 * It is NOT an eligibility determination. The rulebook (नियम पुस्तिका) prints the
 * requirement per post code; this app never claims that a listed qualification
 * makes anyone eligible for a post, and the UI repeats that. Do not add a
 * "you are eligible" affordance here.
 *
 * Naming note: the strings below are what gets written to the database, so they
 * are load-bearing. Existing values must never be reworded — only appended to —
 * otherwise profiles saved earlier would silently stop matching the filters.
 * The first 13 entries are the original list, kept verbatim inside their groups.
 */

export interface QualificationGroup {
  id: string;
  label: string;
  hint?: string;
  items: string[];
}

/** Qualifications a candidate can pick for themselves, grouped for the UI. */
export const QUALIFICATION_GROUPS: QualificationGroup[] = [
  {
    id: 'grad-any',
    label: 'स्नातक — किसी भी विषय से (Graduation)',
    hint: 'अधिकांश पदों के लिए यही आधार शैक्षिक योग्यता है।',
    items: [
      'स्नातक (Graduation - Any Stream)',
      'स्नातक - B.A. (कला संकाय)',
      'स्नातक - B.Sc. (विज्ञान संकाय)',
      'वाणिज्य स्नातक (B.Com - Commerce)',
      'स्नातक - B.B.A. / B.M.S. (प्रबंधन)',
      'स्नातक - BCA (कंप्यूटर एप्लीकेशन)',
      'स्नातक - B.Sc. (Computer Science / IT)',
      'स्नातक - LL.B. (कानून)',
      'स्नातक - B.Ed. (शिक्षण)',
      'स्नातक - D.El.Ed. / B.Ed. (बाल शिक्षा)',
      'स्नातक - B.P.Ed. (शारीरिक शिक्षा)',
      'स्नातक - B.Optometry / BPT (फिजियोथेरेपी)',
      'स्नातक - B.Pharm. (फार्मेसी)',
      'स्नातक - B.Sc. Agriculture (कृषि)',
      'स्नातक - B.Sc. Nursing (नर्सिंग)',
      'स्नातक - BHM / B.H.M.S. (होटल / होम्योपैथी)',
      'स्नातक - B.Des. / B.F.A. (डिज़ाइन / कला)',
      'स्नातक - B.J.M.C. (पत्रकारिता)',
      'स्नातक - BSW / MSW (समाज कार्य)',
      'सांख्यिकी / गणित / अर्थशास्त्र स्नातक',
      'समाजशास्त्र / समाज कार्य (MSW / Social Work)',
      'पशुचिकित्सा विज्ञान / कृषि संकाय स्नातक (Veterinary / Agriculture)',
    ],
  },
  {
    id: 'grad-subject',
    label: 'विषयवार स्नातक (B.A. subjects)',
    hint: 'B.A. के मुख्य विषय — लीडरबोर्ड फ़िल्टर के लिए।',
    items: [
      'स्नातक - हिंदी (Hindi)',
      'स्नातक - अंग्रेजी (English)',
      'स्नातक - संस्कृत (Sanskrit)',
      'स्नातक - हिंदी एवं संस्कृत',
      'स्नातक - मराठी / उर्दू / भोजपुरी',
      'स्नातक - इतिहास (History)',
      'स्नातक - राजनीति विज्ञान (Political Science)',
      'स्नातक - अर्थशास्त्र (Economics)',
      'स्नातक - समाजशास्त्र (Sociology)',
      'स्नातक - भूगोल (Geography)',
      'स्नातक - मनोविज्ञान (Psychology)',
      'स्नातक - दर्शन (Philosophy)',
      'स्नातक - गणित (Mathematics)',
      'स्नातक - भौतिकी / रसायन / जीव विज्ञान',
      'स्नातक - राज्यशास्त्र एवं राजनीति विज्ञान',
      'स्नातक - लोक प्रशासन (Public Administration)',
      'स्नातक - शारीरिक शिक्षा (Physical Education)',
      'स्नातक - संगीत / नृत्य / चित्रकला',
    ],
  },
  {
    id: 'pg',
    label: 'परास्नातक (Post Graduation)',
    items: [
      'परास्नातक (Any Master\u2019s Degree)',
      'M.A. (कला)',
      'M.Sc. (विज्ञान)',
      'M.Com. (वाणिज्य)',
      'MBA / PGDBM (प्रबंधन)',
      'MCA (कंप्यूटर एप्लीकेशन)',
      'LL.M. (कानून)',
      'M.Ed. (शिक्षण)',
      'MSW (समाज कार्य)',
      'MPT / M.Sc. Nursing',
      'M.Sc. Agriculture / Veterinary',
      'P.G.D.C.A. (Post Graduate Diploma in Computer Applications)',
      'Ph.D. (पीएच.डी.)',
    ],
  },
  {
    id: 'diploma',
    label: 'डिप्लोमा / आईटीआई (Diploma & ITI)',
    hint: '3 वर्षीय / 2 वर्षीय पॉलिटेक्निक तथा आईटीआई उपाधियाँ।',
    items: [
      'कम्प्यूटर डिप्लोमा (1-Year PGDCA / BCA / DCA / COPA)',
      'स्थानीय निकाय डिप्लोमा (LSGD / Local Self Governance)',
      'राजस्व / संपत्ति कर विषय में डिप्लोमा (Revenue / Property Tax)',
      'डिप्लोमा - सिविल इंजीनियरिंग (Civil)',
      'डिप्लोमा - मेकेनिकल इंजीनियरिंग (Mechanical)',
      'डिप्लोमा - इलेक्ट्रिकल इंजीनियरिंग (Electrical)',
      'डिप्लोमा - इलेक्ट्रॉनिक्स / ECE',
      'डिप्लोमा - कंप्यूटर / IT',
      'डिप्लोमा - फार्मेसी (D.Pharm)',
      'डिप्लोमा - नर्सिंग / GNM',
      'डिप्लोमा - कृषि (Agriculture)',
      'डिप्लोमा - उद्यानिकी / फॉरीस्ट्री (Horticulture / Forestry)',
      'डिप्लोमा - पशुपालन / डेयरी (Animal Husbandry / Dairy)',
      'डिप्लोमा - मत्स्य विज्ञान (Fishery)',
      'डिप्लोमा - ग्रामीण तकनीक (Rural Technology)',
      'डिप्लोमा - ड्रॉइंग / सर्वे (Survey & Drawing)',
      'डिप्लोमा - अर्बन प्लानिंग (Urban Planning)',
      'डिप्लोमा - होटल मैनेजमेंट / कैटरिंग',
      'डिप्लोमा - फैशन डिज़ाइन / टेलरिंग',
      'डिप्लोमा - फायर एंड सेफ्टी',
      'डिप्लोमा - पत्रकारिता / प्रिंटिंग',
      'डिप्लोमा - लिब्रेरी साइंस (B.Lib / Library Science)',
      'आईटीआई - 1 वर्षीय (ITI 1 Year)',
      'आईटीआई - 2 वर्षीय (ITI 2 Year)',
      'ITI - वायरमैन / फिटर / टर्नर / मशीनिस्ट',
      'ITI - कंप्यूटर ऑपरेटर (COPA)',
      'ITI - डेटा एंट्री ऑपरेटर',
    ],
  },
  {
    id: 'computer',
    label: 'कंप्यूटर प्रमाणपत्र / दक्षता',
    items: [
      'CPCT (कंप्यूटर दक्षता प्रमाणन - हिंदी/अंग्रेजी)',
      'DCA (डिप्लोमा इन कंप्यूटर एप्लीकेशन)',
      'CCC / O-Level / A-Level (NIELIT)',
      'पैकेज अपरेशन सर्टिफिकेट (Tally / Excel / Office)',
      'वेब डिज़ाइन / सॉफ्टवेयर कोर्स सर्टिफिकेट',
    ],
  },
  {
    id: 'steno',
    label: 'शॉर्टहैंड / टाइपिंग (Steno & Typing)',
    items: [
      'शीघ्रलेखन / स्टेनोग्राफी (Hindi/English Steno)',
      'हिंदी टाइपिंग - 35 शब्द/मिनट से कम',
      'हिंदी टाइपिंग - 35 शब्द/मिनट',
      'हिंदी टाइपिंग - 40 शब्द/मिनट',
      'हिंदी टाइपिंग - 50 शब्द/मिनट एवं ऊपर',
      'अंग्रेज़ी टाइपिंग - 30 शब्द/मिनट से कम',
      'अंग्रेज़ी टाइपिंग - 30 शब्द/मिनट',
      'अंग्रेज़ी टाइपिंग - 40 शब्द/मिनट',
      'अंग्रेज़ी टाइपिंग - 50 शब्द/मिनट एवं ऊपर',
      'शॉर्टहैंड (हिंदी) टाइपिंग दोनों',
    ],
  },
  {
    id: 'other',
    label: 'अन्य / आधारभूत',
    items: [
      'केवल 12वीं (10+2)',
      'केवल 10वीं',
      'MP Accounts Exam Pass (राजस्व/लेखा परीक्षा उत्तीर्ण)',
      'ड्राइविंग लाइसेंस / अन्य प्रमाणपत्र',
      'कुछ नहीं (None of the above)',
    ],
  },
];

/**
 * Flat list, in display order. Everything that stores a qualification string
 * stores one of these values (or an older value that is still present here).
 */
export const MASTER_QUALIFICATIONS: string[] = QUALIFICATION_GROUPS.flatMap((g) => g.items);

/**
 * A stable `id` for every qualification, so the API and the filters never have
 * to carry a long Devanagari string in a query parameter.
 */
export const QUALIFICATION_ID = new Map(MASTER_QUALIFICATIONS.map((q, i) => [q, `q${String(i + 1).padStart(3, '0')}`]));
