export interface ScoreBreakdown {
  totalQuestions: number;
  attempted: number;
  unattempted: number;
  correct: number;
  wrong: number;
  correctMarks: number;
  negativeMarks: number;
  rawScore: number;
  accuracy: number;
  attemptPercentage: number;
  scorePercentage: number;
}

/**
 * Deterministic pure score calculation as defined in blueprint #5.2 & #61
 * Correct: +1.0 mark
 * Wrong: -0.25 mark (1/4 negative marking)
 * Unattempted: 0 penalty
 */
export function calculateRawScore(
  correct: number,
  wrong: number,
  totalQuestions: number = 200,
  marksPerQuestion: number = 1.0,
  negativeFactor: number = 0.25
): ScoreBreakdown {
  const safeCorrect = Math.max(0, Math.floor(correct));
  const safeWrong = Math.max(0, Math.floor(wrong));
  const attempted = safeCorrect + safeWrong;
  const unattempted = Math.max(0, totalQuestions - attempted);

  const correctMarks = safeCorrect * marksPerQuestion;
  const negativeMarks = safeWrong * negativeFactor;
  const rawScore = Number((correctMarks - negativeMarks).toFixed(2));

  const accuracy = attempted > 0 ? Number(((safeCorrect / attempted) * 100).toFixed(2)) : 0;
  const attemptPercentage = totalQuestions > 0 ? Number(((attempted / totalQuestions) * 100).toFixed(2)) : 0;
  const scorePercentage = totalQuestions > 0 ? Number(((rawScore / (totalQuestions * marksPerQuestion)) * 100).toFixed(2)) : 0;

  return {
    totalQuestions,
    attempted,
    unattempted,
    correct: safeCorrect,
    wrong: safeWrong,
    correctMarks,
    negativeMarks,
    rawScore,
    accuracy,
    attemptPercentage,
    scorePercentage,
  };
}

/**
 * Mask full name to preserve candidate privacy on public views (Blueprint #16)
 * E.g., "RAHUL KUMAR SINGH" -> "RAHUL K****"
 */
export function maskCandidateName(fullName: string): string {
  if (!fullName) return 'CANDIDATE •••';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) {
    const single = parts[0];
    if (single.length <= 2) return `${single}•••`;
    return `${single.slice(0, 3)}•••`;
  }
  const firstName = parts[0];
  const secondInitial = parts[1].charAt(0).toUpperCase();
  return `${firstName} ${secondInitial}****`;
}
