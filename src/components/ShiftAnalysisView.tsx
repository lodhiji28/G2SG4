import React, { useState, useMemo } from 'react';
import { CandidateRecord, ShiftStats, FilterState } from '../types';
import { EXAM_SHIFTS } from '../data/shifts';
import { RawMarksDisclaimer } from './RawMarksDisclaimer';
import { FilterBar } from './FilterBar';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpDown, 
  Clock, 
  GitCompare, 
  Info,
  Calendar
} from 'lucide-react';

interface ShiftAnalysisViewProps {
  candidates: CandidateRecord[];
  shiftStats: ShiftStats[];
  onCompareShifts: (shiftA: number, shiftB: number) => void;
}

export const ShiftAnalysisView: React.FC<ShiftAnalysisViewProps> = ({
  candidates,
  shiftStats,
  onCompareShifts,
}) => {
  const [filters, setFilters] = useState<FilterState>({
    category: 'all',
    gender: 'all',
    qualification: 'all',
    searchQuery: '',
  });

  const [sortBy, setSortBy] = useState<'shift' | 'difficulty' | 'avg' | 'highest' | 'candidates'>('difficulty');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // Filtered shift stats calculation if category or gender filters are applied
  const filteredShiftStats = useMemo(() => {
    // If no category or gender or qual filter, use standard shiftStats
    const hasCohortFilter =
      (filters.category && filters.category !== 'all') ||
      (filters.gender && filters.gender !== 'all') ||
      (filters.qualification && filters.qualification !== 'all');

    if (!hasCohortFilter) {
      return [...shiftStats];
    }

    // Filter candidate cohort first
    const cohortCandidates = candidates.filter((c) => {
      if (filters.category && filters.category !== 'all' && c.category !== filters.category) return false;
      if (filters.gender && filters.gender !== 'all' && c.gender !== filters.gender) return false;
      if (filters.qualification && filters.qualification !== 'all' && !c.qualifications?.includes(filters.qualification)) return false;
      return true;
    });

    return shiftStats.map((base) => {
      const shiftCohort = cohortCandidates.filter((c) => c.shiftNumber === base.shiftNumber);
      const count = shiftCohort.length;
      if (count === 0) {
        return {
          ...base,
          candidateCount: 0,
          avgRawScore: 0,
          highestRawScore: 0,
          lowestRawScore: 0,
          medianRawScore: 0,
        };
      }
      const scores = shiftCohort.map((c) => c.rawScore).sort((a, b) => a - b);
      const sum = scores.reduce((acc, curr) => acc + curr, 0);
      const avgRawScore = Number((sum / count).toFixed(2));
      const mid = Math.floor(scores.length / 2);
      const medianRawScore = scores.length % 2 !== 0 ? scores[mid] : Number(((scores[mid - 1] + scores[mid]) / 2).toFixed(2));

      return {
        ...base,
        candidateCount: count,
        avgRawScore,
        highestRawScore: scores[scores.length - 1],
        lowestRawScore: scores[0],
        medianRawScore,
      };
    });
  }, [candidates, shiftStats, filters]);

  // Sorted list
  const sortedStats = useMemo(() => {
    const list = [...filteredShiftStats];
    list.sort((a, b) => {
      let comp = 0;
      if (sortBy === 'shift') comp = a.shiftNumber - b.shiftNumber;
      else if (sortBy === 'difficulty') comp = a.difficultyRank - b.difficultyRank;
      else if (sortBy === 'avg') comp = a.avgRawScore - b.avgRawScore;
      else if (sortBy === 'highest') comp = a.highestRawScore - b.highestRawScore;
      else if (sortBy === 'candidates') comp = a.candidateCount - b.candidateCount;
      return sortOrder === 'asc' ? comp : -comp;
    });
    return list;
  }, [filteredShiftStats, sortBy, sortOrder]);

  const toggleSort = (type: typeof sortBy) => {
    if (sortBy === type) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(type);
      setSortOrder(type === 'difficulty' || type === 'shift' ? 'asc' : 'desc');
    }
  };

  return (
    <div className="space-y-6 pb-12 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            22 शिफ्ट्स विस्तृत विश्लेषण (Shift-wise Performance)
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            23 सितम्बर से 05 अक्टूबर तक संपन्न सभी 22 शिफ्ट्स का तुलनात्मक कठिनाई स्तर, औसत अंक व वितरण
          </p>
        </div>
      </div>

      <RawMarksDisclaimer />

      {/* Filter Bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        showShiftFilter={false}
        totalFilteredCount={candidates.filter((c) => {
          if (filters.category && filters.category !== 'all' && c.category !== filters.category) return false;
          if (filters.gender && filters.gender !== 'all' && c.gender !== filters.gender) return false;
          if (filters.qualification && filters.qualification !== 'all' && !c.qualifications?.includes(filters.qualification)) return false;
          return true;
        }).length}
        totalCount={candidates.length}
      />

      {/* Sorting Tabs / Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl text-xs shadow-xs">
        <span className="text-slate-600 dark:text-slate-400 font-medium">क्रमबद्ध करें (Sort By):</span>
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => toggleSort('difficulty')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'difficulty' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            कठिनाई रैंक (Difficulty Rank {sortOrder === 'asc' ? '↑' : '↓'})
          </button>
          <button
            onClick={() => toggleSort('shift')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'shift' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            शिफ्ट क्रम (Shift 1–22)
          </button>
          <button
            onClick={() => toggleSort('avg')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'avg' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            औसत अंक (Average Score)
          </button>
          <button
            onClick={() => toggleSort('highest')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'highest' ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:text-white'
            }`}
          >
            सर्वोच्च अंक (Highest Score)
          </button>
        </div>
      </div>

      {/* Desktop Data Grid (High density, tabular figures) */}
      <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">कठिनाई रैंक</th>
                <th className="py-3 px-4">शिफ्ट विवरण</th>
                <th className="py-3 px-4">दिनांक व समय</th>
                <th className="py-3 px-4 text-right">अभ्यर्थी संख्या</th>
                <th className="py-3 px-4 text-right">औसत अंक (Mean)</th>
                <th className="py-3 px-4 text-right">मीडियन (Median)</th>
                <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">उच्चतम (High)</th>
                <th className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">न्यूनतम (Low)</th>
                <th className="py-3 px-4 text-right">सटीकता (Accuracy)</th>
                <th className="py-3 px-4 text-center">क्रिया (Action)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {sortedStats.map((s) => {
                const isTopHard = s.difficultyRank <= 3;
                const isTopEasy = s.difficultyRank >= 20;
                const shiftObj = EXAM_SHIFTS.find((item) => item.shiftNumber === s.shiftNumber);

                return (
                  <tr key={s.shiftNumber} className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                          isTopHard
                            ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30'
                            : isTopEasy
                            ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        #{s.difficultyRank}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                      Shift {s.shiftNumber}
                      {isTopHard && <span className="ml-2 text-[10px] text-rose-600 dark:text-rose-400 font-normal">कठिन</span>}
                      {isTopEasy && <span className="ml-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-normal">सरल</span>}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-700 dark:text-slate-300">
                      <div className="font-medium text-slate-900 dark:text-white">{shiftObj?.displayDate || s.date}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">{shiftObj?.timeLabel || s.timeLabel}</div>
                    </td>
                    <td className="py-3 px-4 text-right text-slate-900 dark:text-white tabular-nums font-semibold">
                      {s.candidateCount}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-amber-600 dark:text-amber-400 text-sm tabular-nums">
                      {s.avgRawScore}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                      {s.medianRawScore}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                      {s.highestRawScore}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-600 dark:text-rose-400 font-semibold tabular-nums">
                      {s.lowestRawScore}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                      {s.avgAccuracy}%
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <button
                        onClick={() => onCompareShifts(s.shiftNumber, s.shiftNumber === 1 ? 2 : 1)}
                        className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[11px] text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
                      >
                        तुलना करें
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Responsive Cards for Phone / Compact Screens */}
      <div className="md:hidden space-y-3">
        {sortedStats.map((s) => {
          const isTopHard = s.difficultyRank <= 3;
          const isTopEasy = s.difficultyRank >= 20;
          const shiftObj = EXAM_SHIFTS.find((item) => item.shiftNumber === s.shiftNumber);

          return (
            <div
              key={s.shiftNumber}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3 shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold font-mono ${
                      isTopHard
                        ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30'
                        : isTopEasy
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    कठिनाई #{s.difficultyRank}
                  </span>
                  <span className="font-bold text-slate-900 dark:text-white text-base">Shift {s.shiftNumber}</span>
                </div>
                <button
                  onClick={() => onCompareShifts(s.shiftNumber, s.shiftNumber === 1 ? 2 : 1)}
                  className="px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-xs text-amber-600 dark:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                >
                  तुलना
                </button>
              </div>

              <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 font-medium">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>{shiftObj?.displayDate || s.date} ({shiftObj?.timeLabel || s.timeLabel})</span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-950 p-2.5 rounded-lg border border-slate-200/80 dark:border-slate-850 text-center font-mono text-xs">
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">औसत अंक</span>
                  <span className="text-sm font-bold text-amber-600 dark:text-amber-400">{s.avgRawScore}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">सर्वोच्च (High)</span>
                  <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{s.highestRawScore}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block font-sans">न्यूनतम (Low)</span>
                  <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">{s.lowestRawScore}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <span>अभ्यर्थी संख्या: <strong className="text-slate-900 dark:text-white font-mono">{s.candidateCount}</strong></span>
                <span>सटीकता: <strong className="text-slate-700 dark:text-slate-300 font-mono">{s.avgAccuracy}%</strong></span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
