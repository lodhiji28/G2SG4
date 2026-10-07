export type Category = 'UR' | 'OBC' | 'SC' | 'ST' | 'EWS';

export type Gender = 'Male' | 'Female' | 'Other';

export interface ShiftInfo {
  id: string;
  shiftNumber: number;
  date: string;
  displayDate: string;
  shiftTime: 'Morning' | 'Afternoon';
  timeLabel: string;
}

export interface CandidateRecord {
  id: string;
  examId: string;
  rollNumber: string;
  /** Only present for the owner's own device or an admin session — the public
   *  leaderboard payload never carries it (privacy + egress). */
  candidateNamePrivate?: string;
  candidateNamePublic: string;
  /** Optional: e-mail the analysis report to this address. */
  email?: string;
  examDate: string;
  shiftId: string;
  shiftNumber: number;
  totalQuestions: number;
  attempted: number;
  unattempted: number;
  correct: number;
  wrong: number;
  rawScore: number;
  accuracy: number;
  category: Category;
  gender: Gender;
  exServiceman?: boolean;
  contractStatus?: boolean;
  qualifications: string[];
  /** Ordered post codes chosen by the candidate (index 0 = preference 1). Blueprint #12. */
  postPreferences?: string[];
  submittedAt: string;
  updatedAt?: string;
  isSelf?: boolean;
  /** Row exists only in this browser (offline / no database configured). */
  isLocalOnly?: boolean;
  sourceFormat?: string;
  fileName?: string;
  fileBytes?: number;
  /** 1 = correct, 2 = wrong, 0 = unattempted, one char per question. */
  answerPattern?: string;
  confidence?: 'VERIFIED' | 'WARNING' | 'FAILED';
}

export interface QuestionData {
  questionNumber: number;
  questionId?: string;
  candidateAnswer?: string;
  correctAnswer?: string;
  status: 'correct' | 'wrong' | 'unattempted';
  marks: number;
}

export interface ParsedAnswerKeyData {
  candidateName: string;
  rollNumber: string;
  examDate: string;
  shiftNumber: number;
  shiftId: string;
  totalQuestions: number;
  attempted: number;
  unattempted: number;
  correct: number;
  wrong: number;
  rawScore: number;
  accuracy: number;
  confidence: 'VERIFIED' | 'WARNING' | 'FAILED';
  questions: QuestionData[];
  sourceFormat: string;
  notes?: string;
  /** '1' correct, '2' wrong, '0' unattempted — one char per question. */
  answerPattern?: string;
  /** How the uploaded file was decoded (MHTML quoted-printable, utf-8, ...). */
  fileKind?: 'MHTML' | 'HTML' | 'PLAIN';
  encoding?: string;
  fileName?: string;
  fileBytes?: number;
  /** Non-fatal issues found while parsing (shown to the user for review). */
  warnings?: string[];
}

export interface VacancyPost {
  postCode: string;
  postName: string;
  department: string;
  type: 'कार्यपालिक' | 'अकार्यपालिक';
  payScale: string;
  level: string;
  totalVacancies: number;
  categoryBreakdown: {
    UR: number;
    EWS: number;
    SC: number;
    ST: number;
    OBC: number;
  };
  divyangVacancies?: {
    total: number;
    vh?: number;
    eh?: number;
    ld?: number;
    md?: number;
  };
  qualificationsRequired: string[];
  qualificationSummary: string;
  sourcePage: number;
}

export interface FilterState {
  shiftNumber?: number | 'all';
  category?: Category | 'all';
  gender?: Gender | 'all';
  qualification?: string | 'all';
  /** post code the candidate put in their preference list (blueprint #25) */
  postPreference?: string | 'all';
  searchQuery?: string;
  scoreMin?: number;
  scoreMax?: number;
}

export interface ShiftStats {
  shiftNumber: number;
  date: string;
  timeLabel: string;
  candidateCount: number;
  avgRawScore: number;
  highestRawScore: number;
  lowestRawScore: number;
  medianRawScore: number;
  avgAccuracy: number;
  avgAttempted: number;
  avgCorrect: number;
  avgWrong: number;
  difficultyRank: number; // 1 = hardest (lowest average)
}

export interface RankResult {
  overallRank: number;
  totalCandidates: number;
  categoryRank: number;
  totalCategoryCandidates: number;
  genderRank: number;
  totalGenderCandidates: number;
  shiftRank: number;
  totalShiftCandidates: number;
  qualificationRanks: { qualification: string; rank: number; total: number }[];
  percentile: number;
  topPercentage: number;
  badge: {
    title: string;
    description: string;
    icon: string;
    color: string;
  };
}

export interface AuditLog {
  id: string;
  action: string;
  details: string;
  timestamp: string;
  adminUser: string;
}
