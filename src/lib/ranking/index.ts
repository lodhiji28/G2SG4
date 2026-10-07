import { CandidateRecord, RankResult, ShiftStats } from '../../types';
import { EXAM_SHIFTS } from '../../data/shifts';
import type { ServerStats } from '../api';

/**
 * Calculates standard competition rank (1, 2, 2, 4) for a sorted array
 */
function assignRanks<T extends { rawScore: number }>(items: T[]): { item: T; rank: number }[] {
  const sorted = [...items].sort((a, b) => b.rawScore - a.rawScore);
  const result: { item: T; rank: number }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      result.push({ item: sorted[i], rank: 1 });
    } else {
      if (sorted[i].rawScore === sorted[i - 1].rawScore) {
        result.push({ item: sorted[i], rank: result[i - 1].rank });
      } else {
        result.push({ item: sorted[i], rank: i + 1 });
      }
    }
  }
  return result;
}

/**
 * Calculates comprehensive personal ranking across all cohorts for a candidate
 */
export function getCandidateRankings(
  candidates: CandidateRecord[],
  candidateRollNumber: string
): RankResult | null {
  const candidate = candidates.find((c) => c.rollNumber === candidateRollNumber);
  if (!candidate) return null;

  // 1. Overall Rank
  const overallRanked = assignRanks(candidates);
  const overallEntry = overallRanked.find((r) => r.item.rollNumber === candidateRollNumber);
  const overallRank = overallEntry ? overallEntry.rank : 1;
  const totalCandidates = candidates.length;

  // 2. Category Rank
  const categoryPool = candidates.filter((c) => c.category === candidate.category);
  const categoryRanked = assignRanks(categoryPool);
  const catEntry = categoryRanked.find((r) => r.item.rollNumber === candidateRollNumber);
  const categoryRank = catEntry ? catEntry.rank : 1;
  const totalCategoryCandidates = categoryPool.length;

  // 3. Gender Rank
  const genderPool = candidates.filter((c) => c.gender === candidate.gender);
  const genderRanked = assignRanks(genderPool);
  const genderEntry = genderRanked.find((r) => r.item.rollNumber === candidateRollNumber);
  const genderRank = genderEntry ? genderEntry.rank : 1;
  const totalGenderCandidates = genderPool.length;

  // 4. Shift Rank
  const shiftPool = candidates.filter((c) => c.shiftNumber === candidate.shiftNumber);
  const shiftRanked = assignRanks(shiftPool);
  const shiftEntry = shiftRanked.find((r) => r.item.rollNumber === candidateRollNumber);
  const shiftRank = shiftEntry ? shiftEntry.rank : 1;
  const totalShiftCandidates = shiftPool.length;

  // 5. Qualification Ranks
  const qualificationRanks = (candidate.qualifications || []).map((qual) => {
    const qualPool = candidates.filter((c) => c.qualifications?.includes(qual));
    const qualRanked = assignRanks(qualPool);
    const entry = qualRanked.find((r) => r.item.rollNumber === candidateRollNumber);
    return {
      qualification: qual,
      rank: entry ? entry.rank : 1,
      total: qualPool.length,
    };
  });

  // Top percentage and percentile
  const topPercentage = Number(((overallRank / totalCandidates) * 100).toFixed(2));
  const percentile = Number((((totalCandidates - overallRank + 1) / totalCandidates) * 100).toFixed(2));

  // Visual achievement badge (Blueprint #23)
  let badge = {
    title: 'PARTICIPANT',
    description: 'MPESB G2SG4 Dataset में शामिल',
    icon: '📊',
    color: 'slate',
  };

  if (topPercentage <= 1) {
    badge = {
      title: '🏆 TOP 1%',
      description: 'उत्कृष्ट प्रदर्शन — शीर्ष 1% अभ्यर्थियों में स्थान',
      icon: '🏆',
      color: 'amber',
    };
  } else if (topPercentage <= 5) {
    badge = {
      title: '🎖️ TOP 5%',
      description: 'शानदार प्रदर्शन — शीर्ष 5% अभ्यर्थियों में स्थान',
      icon: '🎖️',
      color: 'emerald',
    };
  } else if (topPercentage <= 10) {
    badge = {
      title: '⭐ TOP 10%',
      description: 'उत्कृष्ट प्रयास — शीर्ष 10% अभ्यर्थियों में स्थान',
      icon: '⭐',
      color: 'blue',
    };
  } else if (topPercentage <= 25) {
    badge = {
      title: '🎯 TOP 25%',
      description: 'मजबूत स्थिति — शीर्ष 25% अभ्यर्थियों में स्थान',
      icon: '🎯',
      color: 'indigo',
    };
  } else if (topPercentage <= 50) {
    badge = {
      title: '📈 TOP 50%',
      description: 'औसत से बेहतर प्रदर्शन — शीर्ष 50% अभ्यर्थियों में',
      icon: '📈',
      color: 'cyan',
    };
  }

  return {
    overallRank,
    totalCandidates,
    categoryRank,
    totalCategoryCandidates,
    genderRank,
    totalGenderCandidates,
    shiftRank,
    totalShiftCandidates,
    qualificationRanks,
    percentile,
    topPercentage,
    badge,
  };
}

/**
 * Aggregates for all 22 shifts.
 *
 * `serverStats` (from GET /api/stats, which SQL-aggregates the WHOLE table)
 * wins whenever it covers more rows than the page the browser is holding, so
 * a shift never looks empty just because the client fetched a subset.
 */
export function calculateShiftStats(candidates: CandidateRecord[], serverStats?: ServerStats | null): ShiftStats[] {
  const serverByShift = new Map<number, ServerStats['shifts'][number]>();
  for (const row of serverStats?.shifts ?? []) serverByShift.set(row.shiftNumber, row);

  const statsList: Omit<ShiftStats, 'difficultyRank'>[] = EXAM_SHIFTS.map((shift) => {
    const shiftCandidates = candidates.filter((c) => c.shiftNumber === shift.shiftNumber);
    const count = shiftCandidates.length;
    const server = serverByShift.get(shift.shiftNumber);

    if (server && server.candidateCount > count) {
      return {
        shiftNumber: shift.shiftNumber,
        date: shift.displayDate,
        timeLabel: shift.timeLabel,
        candidateCount: server.candidateCount,
        avgRawScore: server.avgRawScore,
        highestRawScore: server.highestRawScore,
        lowestRawScore: server.lowestRawScore,
        medianRawScore: server.medianRawScore,
        avgAccuracy: server.avgAccuracy,
        avgAttempted: server.avgAttempted,
        avgCorrect: server.avgCorrect,
        avgWrong: server.avgWrong,
      };
    }

    if (count === 0) {
      return {
        shiftNumber: shift.shiftNumber,
        date: shift.displayDate,
        timeLabel: shift.timeLabel,
        candidateCount: 0,
        avgRawScore: 0,
        highestRawScore: 0,
        lowestRawScore: 0,
        medianRawScore: 0,
        avgAccuracy: 0,
        avgAttempted: 0,
        avgCorrect: 0,
        avgWrong: 0,
      };
    }

    const scores = shiftCandidates.map((c) => c.rawScore).sort((a, b) => a - b);
    const highestRawScore = scores[scores.length - 1];
    const lowestRawScore = scores[0];
    const sumScore = scores.reduce((acc, curr) => acc + curr, 0);
    const avgRawScore = Number((sumScore / count).toFixed(2));

    const mid = Math.floor(scores.length / 2);
    const medianRawScore =
      scores.length % 2 !== 0
        ? scores[mid]
        : Number(((scores[mid - 1] + scores[mid]) / 2).toFixed(2));

    const avgAccuracy = Number(
      (shiftCandidates.reduce((acc, c) => acc + c.accuracy, 0) / count).toFixed(1)
    );
    const avgAttempted = Number(
      (shiftCandidates.reduce((acc, c) => acc + c.attempted, 0) / count).toFixed(1)
    );
    const avgCorrect = Number(
      (shiftCandidates.reduce((acc, c) => acc + c.correct, 0) / count).toFixed(1)
    );
    const avgWrong = Number(
      (shiftCandidates.reduce((acc, c) => acc + c.wrong, 0) / count).toFixed(1)
    );

    return {
      shiftNumber: shift.shiftNumber,
      date: shift.displayDate,
      timeLabel: shift.timeLabel,
      candidateCount: count,
      avgRawScore,
      highestRawScore,
      lowestRawScore,
      medianRawScore,
      avgAccuracy,
      avgAttempted,
      avgCorrect,
      avgWrong,
    };
  });

  // Assign difficulty rank: lowest average score = Rank 1 (Hardest shift)
  const sortedByDifficulty = [...statsList]
    .filter((s) => s.candidateCount > 0)
    .sort((a, b) => a.avgRawScore - b.avgRawScore);

  const diffMap = new Map<number, number>();
  sortedByDifficulty.forEach((s, idx) => {
    diffMap.set(s.shiftNumber, idx + 1);
  });

  return statsList.map((s) => ({
    ...s,
    difficultyRank: diffMap.get(s.shiftNumber) || 99,
  }));
}
