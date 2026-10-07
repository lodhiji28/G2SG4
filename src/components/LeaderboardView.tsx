import React, { useState, useMemo } from 'react';
import { CandidateRecord, FilterState } from '../types';
import { RawMarksDisclaimer } from './RawMarksDisclaimer';
import { FilterBar } from './FilterBar';
import { 
  Trophy, 
  Medal, 
  Award, 
  ChevronLeft, 
  ChevronRight, 
  User, 
  ShieldCheck, 
  CheckCircle2, 
  XCircle 
} from 'lucide-react';

interface LeaderboardViewProps {
  candidates: CandidateRecord[];
  currentUserRoll?: string | null;
  onSelectCandidate?: (candidate: CandidateRecord) => void;
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({
  candidates,
  currentUserRoll,
  onSelectCandidate,
}) => {
  const [filters, setFilters] = useState<FilterState>({
    shiftNumber: 'all',
    category: 'all',
    gender: 'all',
    qualification: 'all',
    searchQuery: '',
  });

  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 50;

  // 1. Filter candidates
  const filteredList = useMemo(() => {
    return candidates.filter((c) => {
      if (filters.shiftNumber && filters.shiftNumber !== 'all' && c.shiftNumber !== filters.shiftNumber) {
        return false;
      }
      if (filters.category && filters.category !== 'all' && c.category !== filters.category) {
        return false;
      }
      if (filters.gender && filters.gender !== 'all' && c.gender !== filters.gender) {
        return false;
      }
      if (filters.qualification && filters.qualification !== 'all' && !c.qualifications?.includes(filters.qualification)) {
        return false;
      }
      if (filters.searchQuery) {
        const q = filters.searchQuery.toLowerCase().trim();
        const matchesName = (c.candidateNamePrivate || '').toLowerCase().includes(q) || c.candidateNamePublic.toLowerCase().includes(q);
        const matchesRoll = c.rollNumber.toLowerCase().includes(q);
        if (!matchesName && !matchesRoll) return false;
      }
      return true;
    });
  }, [candidates, filters]);

  // 2. Sort by Raw Score DESC and assign competition rank (1, 2, 2, 4)
  const rankedList = useMemo(() => {
    const sorted = [...filteredList].sort((a, b) => b.rawScore - a.rawScore);
    const result: { candidate: CandidateRecord; rank: number }[] = [];

    for (let i = 0; i < sorted.length; i++) {
      if (i === 0) {
        result.push({ candidate: sorted[i], rank: 1 });
      } else {
        if (sorted[i].rawScore === sorted[i - 1].rawScore) {
          result.push({ candidate: sorted[i], rank: result[i - 1].rank });
        } else {
          result.push({ candidate: sorted[i], rank: i + 1 });
        }
      }
    }
    return result;
  }, [filteredList]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(rankedList.length / pageSize));
  const pageItems = rankedList.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  // Top 3 Podium
  const top3 = rankedList.slice(0, 3);

  return (
    <div className="space-y-6 pb-12 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Trophy className="w-6 h-6 text-amber-500 dark:text-amber-400" />
            <span>समग्र व फ़िल्टर लीडरबोर्ड (Rank List)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            रॉ मार्क्स (Raw Score) के आधार पर मेरिट सूची · व्यक्तिगत गोपनीयता हेतु सार्वजनिक दृश्य में नाम मास्क है
          </p>
        </div>
      </div>

      <RawMarksDisclaimer />

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onChange={(newFilters) => {
          setFilters(newFilters);
          setCurrentPage(1);
        }}
        showShiftFilter={true}
        totalFilteredCount={rankedList.length}
        totalCount={candidates.length}
      />

      {/* Top 3 Visual Podium (Blueprint #26) */}
      {top3.length >= 3 && currentPage === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-2">
          {/* Rank 2 - Silver */}
          <div className="order-2 md:order-1 bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 text-center relative overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="absolute top-2 right-2 text-2xl opacity-20">🥈</div>
            <div>
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-400/20 text-slate-800 dark:text-slate-200 font-extrabold text-sm mb-2 border border-slate-300 dark:border-slate-400/30">
                #2
              </div>
              <div className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                {top3[1].candidate.candidateNamePublic}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Shift {top3[1].candidate.shiftNumber} · {top3[1].candidate.category}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">रॉ स्कोर</span>
              <div className="text-2xl font-extrabold font-mono text-slate-800 dark:text-slate-200">
                {top3[1].candidate.rawScore}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                सही: {top3[1].candidate.correct} · गलत: {top3[1].candidate.wrong}
              </span>
            </div>
          </div>

          {/* Rank 1 - Gold */}
          <div className="order-1 md:order-2 bg-gradient-to-b from-amber-500/10 via-amber-50/50 to-white dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-950 border-2 border-amber-400 dark:border-amber-500/50 rounded-2xl p-5 text-center relative overflow-hidden shadow-md shadow-amber-500/10 flex flex-col justify-between scale-100 md:scale-105">
            <div className="absolute top-2 right-2 text-3xl">👑</div>
            <div>
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-black text-lg mb-2 border border-amber-500/40 shadow-inner">
                #1
              </div>
              <div className="font-extrabold text-slate-900 dark:text-white text-base truncate">
                {top3[0].candidate.candidateNamePublic}
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300/80 mt-0.5 font-medium">
                Shift {top3[0].candidate.shiftNumber} · {top3[0].candidate.category} ({top3[0].candidate.gender})
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-amber-300 dark:border-amber-500/30">
              <span className="text-xs text-amber-800 dark:text-amber-300/80 font-medium">शीर्ष रॉ स्कोर</span>
              <div className="text-3xl font-black font-mono text-amber-600 dark:text-amber-400">
                {top3[0].candidate.rawScore}
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                सही: {top3[0].candidate.correct} · गलत: {top3[0].candidate.wrong} · सटीकता: {top3[0].candidate.accuracy}%
              </span>
            </div>
          </div>

          {/* Rank 3 - Bronze */}
          <div className="order-3 bg-white dark:bg-gradient-to-b dark:from-slate-900 dark:to-slate-950 border border-slate-200 dark:border-amber-800/40 rounded-2xl p-4 text-center relative overflow-hidden shadow-xs flex flex-col justify-between">
            <div className="absolute top-2 right-2 text-2xl opacity-20">🥉</div>
            <div>
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-700/20 text-amber-800 dark:text-amber-400 font-extrabold text-sm mb-2 border border-amber-300 dark:border-amber-700/40">
                #3
              </div>
              <div className="font-bold text-slate-900 dark:text-slate-100 text-sm truncate">
                {top3[2].candidate.candidateNamePublic}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Shift {top3[2].candidate.shiftNumber} · {top3[2].candidate.category}
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">रॉ स्कोर</span>
              <div className="text-2xl font-extrabold font-mono text-amber-700 dark:text-amber-300">
                {top3[2].candidate.rawScore}
              </div>
              <span className="text-[10px] text-slate-500 font-mono">
                सही: {top3[2].candidate.correct} · गलत: {top3[2].candidate.wrong}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Leaderboard Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 w-16 text-center">रैंक</th>
                <th className="py-3 px-4">अभ्यर्थी (Masked Name)</th>
                <th className="py-3 px-4">शिफ्ट</th>
                <th className="py-3 px-4">श्रेणी</th>
                <th className="py-3 px-4">लिंग</th>
                <th className="py-3 px-4 text-right">सही (+1)</th>
                <th className="py-3 px-4 text-right">गलत (-0.25)</th>
                <th className="py-3 px-4 text-right">प्रयास (Att.)</th>
                <th className="py-3 px-4 text-right text-amber-600 dark:text-amber-400 font-bold">रॉ स्कोर</th>
                <th className="py-3 px-4 text-right">सटीकता %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {pageItems.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-500 dark:text-slate-400 font-sans">
                    इस फ़िल्टर संयोजन के लिए अभी कोई उम्मीदवार उपलब्ध नहीं है।
                  </td>
                </tr>
              ) : (
                pageItems.map(({ candidate: c, rank }) => {
                  const isCurrent = currentUserRoll && c.rollNumber === currentUserRoll;

                  return (
                    <tr
                      key={c.rollNumber}
                      onClick={() => onSelectCandidate && onSelectCandidate(c)}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-850 transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-amber-500/15 border-l-4 border-amber-500 font-semibold'
                          : rank <= 3
                          ? 'bg-amber-500/5'
                          : ''
                      }`}
                    >
                      <td className="py-3 px-4 text-center">
                        {rank === 1 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-black text-xs">
                            1
                          </span>
                        ) : rank === 2 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-300 dark:bg-slate-300 text-slate-950 font-black text-xs">
                            2
                          </span>
                        ) : rank === 3 ? (
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-600 dark:bg-amber-700 text-white font-black text-xs">
                            3
                          </span>
                        ) : (
                          <span className="text-slate-500 dark:text-slate-400 font-bold">#{rank}</span>
                        )}
                      </td>

                      <td className="py-3 px-4 font-sans font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <span>{c.candidateNamePublic}</span>
                          {isCurrent && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-400 text-slate-950 text-[10px] font-bold">
                              आप
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <div className="text-slate-900 dark:text-white font-medium">Shift {c.shiftNumber}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">{c.examDate}</div>
                      </td>

                      <td className="py-3 px-4 font-sans">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">
                          {c.category === 'UR' ? 'UR' : c.category}
                        </span>
                      </td>

                      <td className="py-3 px-4 font-sans text-slate-500 dark:text-slate-400">
                        {c.gender === 'Male' ? 'पुरुष' : c.gender === 'Female' ? 'महिला' : 'अन्य'}
                      </td>

                      <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {c.correct}
                      </td>

                      <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 tabular-nums">
                        {c.wrong}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {c.attempted}
                      </td>

                      <td className="py-3 px-4 text-right font-black text-amber-600 dark:text-amber-400 text-sm tabular-nums">
                        {c.rawScore}
                      </td>

                      <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                        {c.accuracy}%
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls (Blueprint #24) */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <div>
              पृष्ठ <strong className="text-slate-900 dark:text-white font-mono">{currentPage}</strong> / {totalPages} (कुल {rankedList.length} अभ्यर्थी)
            </div>

            <div className="flex items-center gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>पिछला</span>
              </button>

              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 dark:hover:text-white disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer transition-colors"
              >
                <span>अगला</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
