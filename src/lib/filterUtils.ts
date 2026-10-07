import { CandidateRecord, FilterState } from '../types';
import { QUALIFICATION_GROUPS } from '../data/qualifications';
import { EXAM_SHIFTS } from '../data/shifts';

export interface StreamDefinition {
  id: string;
  name: string;
  shortName: string;
  icon: string;
  color: string;
  groupIds: string[];
  description: string;
}

export const STREAM_DEFINITIONS: StreamDefinition[] = [
  {
    id: 'patwari-cpct',
    name: 'पटवारी, CPCT व कंप्यूटर स्ट्रीम',
    shortName: 'पटवारी / CPCT',
    icon: '💻',
    color: 'emerald',
    groupIds: ['patwari-cpct'],
    description: 'पटवारी, डाटा एंट्री ऑपरेटर व IT/कंप्यूटर दक्षता वाले अभ्यर्थी',
  },
  {
    id: 'commerce',
    name: 'वाणिज्य व लेखा स्ट्रीम (B.Com / Accounts)',
    shortName: 'कॉमर्स / लेखा',
    icon: '💼',
    color: 'amber',
    groupIds: ['commerce-audit'],
    description: 'सहायक संपरीक्षक, लेखापाल, कनिष्ठ लेखाधिकारी व वाणिज्य स्नातक',
  },
  {
    id: 'science-tech',
    name: 'विज्ञान, सांख्यिकी व तकनीकी (B.Sc. / Tech)',
    shortName: 'विज्ञान / तकनीकी',
    icon: '🔬',
    color: 'cyan',
    groupIds: ['science-tech'],
    description: 'सांख्यिकी अन्वेषक, तकनीकी विशेषज्ञ व विज्ञान स्नातक (PCM/CBZ/Agri)',
  },
  {
    id: 'arts-social',
    name: 'कला व सामाजिक विज्ञान (B.A. / Social)',
    shortName: 'कला / मानविकी',
    icon: '📚',
    color: 'purple',
    groupIds: ['social-special', 'grad-general'],
    description: 'कला संकाय स्नातक, सामाजिक कार्यकर्ता व प्रशासनिक योग्यता',
  },
  {
    id: 'steno-typing',
    name: 'शीघ्रलेखन व मुद्रलेखन (Stenography)',
    shortName: 'स्टेनो / टाइपिंग',
    icon: '✍️',
    color: 'rose',
    groupIds: ['steno-typing'],
    description: 'स्टेनोग्राफर, शीघ्रलेखक एवं टाइपिंग बोर्ड प्रमाण पत्र धारक',
  },
  {
    id: 'law-local',
    name: 'विधि व राजस्व (Law / LSGD / Revenue)',
    shortName: 'विधि / राजस्व',
    icon: '⚖️',
    color: 'indigo',
    groupIds: ['law-local'],
    description: 'एल.एल.बी., राजस्व निरीक्षक, संपत्ति कर व स्थानीय निकाय डिप्लोमा',
  },
  {
    id: 'general-grad',
    name: 'सामान्य स्नातक (Any Graduate All Posts)',
    shortName: 'सामान्य स्नातक',
    icon: '🎓',
    color: 'blue',
    groupIds: ['grad-general'],
    description: 'समस्त स्नातक अर्हता वाले सामान्य पद (Non-Technical)',
  },
];

/**
 * Filter candidates array based on multi-dimensional FilterState
 */
export function filterCandidates(
  candidates: CandidateRecord[],
  filters: FilterState
): CandidateRecord[] {
  return candidates.filter((c) => {
    // 1. Shift Number
    if (filters.shiftNumber && filters.shiftNumber !== 'all') {
      const target = typeof filters.shiftNumber === 'string' ? parseInt(filters.shiftNumber, 10) : filters.shiftNumber;
      if (c.shiftNumber !== target) return false;
    }

    // 2. Shift Slot (Morning vs Afternoon)
    if (filters.shiftSlot && filters.shiftSlot !== 'all') {
      const shiftObj = EXAM_SHIFTS.find((s) => s.shiftNumber === c.shiftNumber);
      if (shiftObj && shiftObj.shiftTime !== filters.shiftSlot) return false;
    }

    // 3. Category
    if (filters.category && filters.category !== 'all') {
      if (c.category !== filters.category) return false;
    }

    // 4. Gender
    if (filters.gender && filters.gender !== 'all') {
      if (c.gender !== filters.gender) return false;
    }

    // 5. Special Quota: Samvidha (Contract Employee)
    if (filters.contractStatus !== undefined && filters.contractStatus !== 'all') {
      const expected = Boolean(filters.contractStatus);
      if (Boolean(c.contractStatus) !== expected) return false;
    }

    // 6. Special Quota: Ex-Serviceman
    if (filters.exServiceman !== undefined && filters.exServiceman !== 'all') {
      const expected = Boolean(filters.exServiceman);
      if (Boolean(c.exServiceman) !== expected) return false;
    }

    // 7. Minimum Raw Score
    if (typeof filters.scoreMin === 'number' && !isNaN(filters.scoreMin)) {
      if (c.rawScore < filters.scoreMin) return false;
    }

    // 8. Maximum Raw Score
    if (typeof filters.scoreMax === 'number' && !isNaN(filters.scoreMax)) {
      if (c.rawScore > filters.scoreMax) return false;
    }

    // 9. Specific Qualifications filter (supports multiple qualifications)
    if (filters.qualifications && filters.qualifications.length > 0) {
      const candidateQuals = c.qualifications || [];
      const hasAny = filters.qualifications.some((q) => candidateQuals.includes(q));
      if (!hasAny) return false;
    } else if (filters.qualification && filters.qualification !== 'all') {
      const hasQual = c.qualifications && c.qualifications.includes(filters.qualification);
      if (!hasQual) return false;
    }

    // 10. Stream filter
    if (filters.stream && filters.stream !== 'all') {
      const streamDef = STREAM_DEFINITIONS.find((s) => s.id === filters.stream);
      if (streamDef) {
        const streamItems = QUALIFICATION_GROUPS.filter((g) => streamDef.groupIds.includes(g.id)).flatMap(
          (g) => g.items
        );
        const matchesStream = (c.qualifications || []).some((q) => streamItems.includes(q));
        if (!matchesStream) return false;
      }
    }

    // 11. Search query (Roll number or candidate name)
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase().trim();
      const matchesRoll = (c.rollNumber || '').toLowerCase().includes(q);
      const matchesPrivateName = (c.candidateNamePrivate || '').toLowerCase().includes(q);
      const matchesPublicName = (c.candidateNamePublic || '').toLowerCase().includes(q);
      if (!matchesRoll && !matchesPrivateName && !matchesPublicName) return false;
    }

    return true;
  });
}

/**
 * Counts how many non-default filter dimensions are actively applied
 */
export function getActiveFilterCount(filters: FilterState): number {
  let count = 0;
  if (filters.shiftNumber && filters.shiftNumber !== 'all') count++;
  if (filters.shiftSlot && filters.shiftSlot !== 'all') count++;
  if (filters.category && filters.category !== 'all') count++;
  if (filters.gender && filters.gender !== 'all') count++;
  if (filters.contractStatus !== undefined && filters.contractStatus !== 'all') count++;
  if (filters.exServiceman !== undefined && filters.exServiceman !== 'all') count++;
  if (typeof filters.scoreMin === 'number' && !isNaN(filters.scoreMin)) count++;
  if (typeof filters.scoreMax === 'number' && !isNaN(filters.scoreMax)) count++;
  if (filters.qualifications && filters.qualifications.length > 0) count += filters.qualifications.length;
  else if (filters.qualification && filters.qualification !== 'all') count++;
  if (filters.stream && filters.stream !== 'all') count++;
  if (filters.searchQuery && filters.searchQuery.trim().length > 0) count++;
  return count;
}

export interface TopperItem {
  groupTitle: string;
  groupType: 'stream' | 'gender' | 'category' | 'quota';
  tag: string;
  icon: string;
  badgeColor: string;
  candidates: {
    rank: number;
    candidate: CandidateRecord;
  }[];
}

/**
 * Computes top rankers by Stream, Gender, Category, and Special Quotas
 */
export function computeAllToppers(candidates: CandidateRecord[]): {
  streamToppers: TopperItem[];
  genderToppers: TopperItem[];
  categoryToppers: TopperItem[];
  quotaToppers: TopperItem[];
} {
  const sorted = [...candidates].sort((a, b) => b.rawScore - a.rawScore);

  const getTopN = (pool: CandidateRecord[], limit = 3) => {
    return pool.slice(0, limit).map((c, i) => ({
      rank: i + 1,
      candidate: c,
    }));
  };

  // 1. Stream toppers
  const streamToppers: TopperItem[] = STREAM_DEFINITIONS.map((stream) => {
    const streamItems = QUALIFICATION_GROUPS.filter((g) => stream.groupIds.includes(g.id)).flatMap((g) => g.items);
    const pool = sorted.filter((c) => (c.qualifications || []).some((q) => streamItems.includes(q)));

    return {
      groupTitle: stream.name,
      groupType: 'stream',
      tag: stream.shortName,
      icon: stream.icon,
      badgeColor: stream.color,
      candidates: getTopN(pool, 3),
    };
  });

  // 2. Gender toppers
  const genderToppers: TopperItem[] = [
    {
      groupTitle: 'पुरुष टॉपर (Male Candidates)',
      groupType: 'gender',
      tag: 'पुरुष (Male)',
      icon: '👨',
      badgeColor: 'blue',
      candidates: getTopN(sorted.filter((c) => c.gender === 'Male'), 3),
    },
    {
      groupTitle: 'महिला टॉपर (Female Candidates)',
      groupType: 'gender',
      tag: 'महिला (Female)',
      icon: '👩',
      badgeColor: 'rose',
      candidates: getTopN(sorted.filter((c) => c.gender === 'Female'), 3),
    },
  ];

  // 3. Category toppers
  const categoriesList: { code: CandidateRecord['category']; label: string; icon: string; color: string }[] = [
    { code: 'UR', label: 'अनारक्षित (UR Toppers)', icon: '🟡', color: 'amber' },
    { code: 'OBC', label: 'अन्य पिछड़ा वर्ग (OBC Toppers)', icon: '🟢', color: 'emerald' },
    { code: 'EWS', label: 'ई.डब्ल्यू.एस (EWS Toppers)', icon: '🟠', color: 'orange' },
    { code: 'SC', label: 'अनुसूचित जाति (SC Toppers)', icon: '🔵', color: 'blue' },
    { code: 'ST', label: 'अनुसूचित जनजाति (ST Toppers)', icon: '🟣', color: 'purple' },
    { code: 'PWD', label: 'दिव्यांग जन (PWD Toppers)', icon: '♿', color: 'teal' },
  ];

  const categoryToppers: TopperItem[] = categoriesList.map((cat) => ({
    groupTitle: `${cat.code} — ${cat.label}`,
    groupType: 'category',
    tag: cat.code,
    icon: cat.icon,
    badgeColor: cat.color,
    candidates: getTopN(sorted.filter((c) => c.category === cat.code), 3),
  }));

  // 4. Special Quota toppers
  const quotaToppers: TopperItem[] = [
    {
      groupTitle: 'संविदा कर्मचारी टॉपर (Samvidha Employees)',
      groupType: 'quota',
      tag: 'संविदा कोटा (20%)',
      icon: '🏛️',
      badgeColor: 'cyan',
      candidates: getTopN(sorted.filter((c) => Boolean(c.contractStatus)), 3),
    },
    {
      groupTitle: 'भूतपूर्व सैनिक टॉपर (Ex-Servicemen)',
      groupType: 'quota',
      tag: 'भूतपूर्व सैनिक कोटा',
      icon: '🎖️',
      badgeColor: 'indigo',
      candidates: getTopN(sorted.filter((c) => Boolean(c.exServiceman)), 3),
    },
  ];

  return { streamToppers, genderToppers, categoryToppers, quotaToppers };
}
