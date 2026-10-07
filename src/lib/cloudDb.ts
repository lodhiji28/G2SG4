/**
 * Direct Cloud Supabase Client for Static & Drag-and-Drop Deployments.
 * Enables live shared multi-user leaderboard across all mobile devices
 * even when deployed as a purely static site without serverless functions.
 */

import type { CandidateRecord, Category, Gender } from '../types';

const SUPABASE_URL = 'https://cvxrnsaulnpshkssmist.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_h2Ll_6lh6KPh5zlPHF8PBQ_0yVXTHEa';

interface SupabaseSubmissionRow {
  id: string;
  submission_token?: string;
  display_name: string;
  category: string;
  gender: string;
  mp_domicile?: boolean;
  shift_id: string;
  correct_count: number;
  wrong_count: number;
  unattempted_count: number;
  raw_score: number;
  qualification_stream?: string;
  is_verified?: boolean;
  created_at?: string;
  updated_at?: string;
}

function parseShiftNumber(shiftId: string): number {
  if (!shiftId) return 1;
  const matchNum = shiftId.match(/shift[^\d]*(\d+)/i);
  if (matchNum) {
    const n = parseInt(matchNum[1], 10);
    if (!isNaN(n) && n >= 1 && n <= 22) return n;
  }
  // Try mapping shift dates if formatted as shift-YYYY-MM-DD-s1/s2
  const matchSlot = shiftId.match(/-s(\d+)$/i);
  if (matchSlot) {
    const slot = parseInt(matchSlot[1], 10);
    return slot === 2 ? 2 : 1;
  }
  return 1;
}

export function rowToCandidateRecord(row: SupabaseSubmissionRow): CandidateRecord {
  const roll = row.id.replace(/^cand-/, '') || row.submission_token || '3000000000';
  const shiftNum = parseShiftNumber(row.shift_id);
  const correct = Number(row.correct_count) || 0;
  const wrong = Number(row.wrong_count) || 0;
  const unattempted = Number(row.unattempted_count) || 0;
  const attempted = correct + wrong;
  const total = attempted + unattempted || 200;
  const accuracy = attempted > 0 ? (correct / attempted) * 100 : 0;

  return {
    id: row.id,
    examId: 'mpesb-g2sg4-2026',
    rollNumber: roll,
    candidateNamePublic: row.display_name || 'उम्मीदवार',
    examDate: row.created_at ? row.created_at.slice(0, 10) : '2026-09-26',
    shiftId: row.shift_id || `shift-${shiftNum}`,
    shiftNumber: shiftNum,
    totalQuestions: total,
    attempted,
    unattempted,
    correct,
    wrong,
    rawScore: Number(row.raw_score) || (correct - wrong * 0.25),
    accuracy: Math.round(accuracy * 10) / 10,
    category: (row.category as Category) || 'UR',
    gender: row.gender === 'F' ? 'Female' : 'Male',
    qualifications: row.qualification_stream ? [row.qualification_stream] : ['ANY'],
    submittedAt: row.created_at || new Date().toISOString(),
    isLocalOnly: false,
    confidence: 'VERIFIED',
  };
}

export async function fetchCloudSubmissions(limit = 50000): Promise<CandidateRecord[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/candidate_submissions?select=*&order=raw_score.desc&limit=${limit}`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Accept-Profile': 'public',
        },
      }
    );

    if (!res.ok) {
      console.warn('Cloud Supabase fetch error:', res.status, res.statusText);
      return [];
    }

    const rows: SupabaseSubmissionRow[] = await res.json();
    return rows.map(rowToCandidateRecord);
  } catch (err) {
    console.warn('Network error connecting to Cloud Supabase:', err);
    return [];
  }
}

export async function saveCloudSubmission(candidate: CandidateRecord): Promise<boolean> {
  try {
    const roll = candidate.rollNumber;
    const payload: SupabaseSubmissionRow = {
      id: `cand-${roll}`,
      submission_token: `tok-${roll}`,
      display_name: candidate.candidateNamePublic || 'उम्मीदवार',
      category: candidate.category || 'UR',
      gender: candidate.gender === 'Female' ? 'F' : 'M',
      mp_domicile: true,
      shift_id: candidate.shiftId || `shift-${candidate.shiftNumber || 1}`,
      correct_count: candidate.correct || 0,
      wrong_count: candidate.wrong || 0,
      unattempted_count: candidate.unattempted || 0,
      raw_score: candidate.rawScore,
      qualification_stream: (candidate.qualifications && candidate.qualifications[0]) || 'ANY',
      is_verified: true,
    };

    const res = await fetch(`${SUPABASE_URL}/rest/v1/candidate_submissions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify(payload),
    });

    return res.ok;
  } catch (err) {
    console.warn('Error saving to Cloud Supabase:', err);
    return false;
  }
}
