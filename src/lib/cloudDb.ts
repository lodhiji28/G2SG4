/**
 * Direct Cloud Supabase Client for psztuvublihxgnrrylkh
 * Writes directly into the user's "candidates" table.
 */

import { createClient } from '@supabase/supabase-js';
import type { CandidateRecord, Category, Gender } from '../types';

export const SUPABASE_URL = 'https://psztuvublihxgnrrylkh.supabase.co';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBzenR1dnVibGloeGducnJ5bGtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzNjM0MjUsImV4cCI6MjEwNjkzOTQyNX0.QEntW0h3MsB34PYnUMejFv6jnmgsY5XxW_DYwt0YFQo';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

interface CandidateDbRow {
  id: string;
  exam_id: string;
  roll_number: string;
  candidate_name_private?: string;
  candidate_name_public: string;
  email?: string;
  exam_date?: string;
  shift_id?: string;
  shift_number: number;
  total_questions: number;
  attempted: number;
  unattempted: number;
  correct: number;
  wrong: number;
  raw_score: number;
  accuracy: number;
  category: string;
  gender: string;
  ex_serviceman?: number;
  contract_status?: number;
  qualifications: string;
  post_preferences?: string;
  source_format?: string;
  parse_confidence?: string;
  file_name?: string;
  file_bytes?: number;
  answer_pattern?: string;
  claim_token_hash?: string;
  submitted_at: string;
  updated_at?: string;
}

export function dbRowToCandidateRecord(row: CandidateDbRow): CandidateRecord {
  let quals: string[] = [];
  try {
    quals = typeof row.qualifications === 'string' ? JSON.parse(row.qualifications) : row.qualifications || [];
  } catch {
    quals = row.qualifications ? [String(row.qualifications)] : [];
  }

  let postPrefs: string[] = [];
  try {
    postPrefs = typeof row.post_preferences === 'string' ? JSON.parse(row.post_preferences) : [];
  } catch {
    postPrefs = [];
  }

  return {
    id: row.id,
    examId: row.exam_id || 'mpesb-g2sg4-2026',
    rollNumber: row.roll_number,
    candidateNamePrivate: row.candidate_name_private,
    candidateNamePublic: row.candidate_name_public || 'उम्मीदवार',
    email: row.email,
    examDate: row.exam_date || '',
    shiftId: row.shift_id || `shift-${row.shift_number || 1}`,
    shiftNumber: Number(row.shift_number) || 1,
    totalQuestions: Number(row.total_questions) || 200,
    attempted: Number(row.attempted) || 0,
    unattempted: Number(row.unattempted) || 0,
    correct: Number(row.correct) || 0,
    wrong: Number(row.wrong) || 0,
    rawScore: Number(row.raw_score) || 0,
    accuracy: Number(row.accuracy) || 0,
    category: (row.category as Category) || 'UR',
    gender: (row.gender as Gender) || 'Male',
    exServiceman: Boolean(row.ex_serviceman),
    contractStatus: Boolean(row.contract_status),
    qualifications: quals,
    postPreferences: postPrefs,
    sourceFormat: row.source_format,
    confidence: (row.parse_confidence as any) || 'VERIFIED',
    submittedAt: row.submitted_at || new Date().toISOString(),
    isLocalOnly: false,
  };
}

export async function fetchCloudSubmissions(limit = 50000): Promise<CandidateRecord[]> {
  try {
    const { data, error } = await supabase
      .from('candidates')
      .select('*')
      .order('raw_score', { ascending: false })
      .limit(limit);

    if (error || !data) {
      console.warn('Cloud Supabase fetch error:', error?.message);
      return [];
    }

    return (data as CandidateDbRow[]).map(dbRowToCandidateRecord);
  } catch (err) {
    console.warn('Network error connecting to Cloud Supabase:', err);
    return [];
  }
}

export async function saveCloudSubmission(candidate: CandidateRecord): Promise<boolean> {
  try {
    const roll = (candidate.rollNumber || '').trim();
    const id = `cand-${roll || Date.now()}`;

    const payload: CandidateDbRow = {
      id,
      exam_id: 'mpesb-g2sg4-2026',
      roll_number: roll,
      candidate_name_private: candidate.candidateNamePrivate || '',
      candidate_name_public: candidate.candidateNamePublic || 'उम्मीदवार',
      email: candidate.email || '',
      exam_date: candidate.examDate || '',
      shift_id: candidate.shiftId || `shift-${candidate.shiftNumber || 1}`,
      shift_number: Number(candidate.shiftNumber) || 1,
      total_questions: Number(candidate.totalQuestions) || 200,
      attempted: Number(candidate.attempted) || 0,
      unattempted: Number(candidate.unattempted) || 0,
      correct: Number(candidate.correct) || 0,
      wrong: Number(candidate.wrong) || 0,
      raw_score: Number(candidate.rawScore) || 0,
      accuracy: Number(candidate.accuracy) || 0,
      category: candidate.category || 'UR',
      gender: candidate.gender || 'Male',
      ex_serviceman: candidate.exServiceman ? 1 : 0,
      contract_status: candidate.contractStatus ? 1 : 0,
      qualifications: JSON.stringify(candidate.qualifications || []),
      post_preferences: JSON.stringify(candidate.postPreferences || []),
      source_format: candidate.sourceFormat || 'PASTE',
      parse_confidence: candidate.confidence || 'VERIFIED',
      file_bytes: 0,
      submitted_at: candidate.submittedAt || new Date().toISOString(),
    };

    const { error } = await supabase.from('candidates').upsert(payload, { onConflict: 'id' });

    if (error) {
      console.warn('Error saving to Cloud Supabase candidates table:', error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.warn('Error saving to Cloud Supabase:', err);
    return false;
  }
}

export function subscribeToCloudSubmissions(onChange: () => void): () => void {
  try {
    const channel = supabase
      .channel('realtime:candidates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'candidates' },
        () => {
          onChange();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn('Supabase realtime error:', err);
    return () => {};
  }
}
