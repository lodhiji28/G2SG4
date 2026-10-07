import React, { useState, useMemo } from 'react';
import { CandidateRecord, ShiftStats, FilterState } from '../types';
import { EXAM_SHIFTS } from '../data/shifts';
import { RawMarksDisclaimer } from './RawMarksDisclaimer';
import { FilterBar } from './FilterBar';
import { filterCandidates } from '../lib/filterUtils';
import { 
  TrendingUp, 
  TrendingDown, 
  ArrowUpDown, 
  Clock, 
  GitCompare, 
  Info,
  Calendar,
  Award,
  Sparkles,
  Zap,
  Target
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
    stream: 'all',
    searchQuery: '',
    scoreMin: '',
    scoreMax: '',
    contractStatus: 'all',
    exServiceman: 'all',
    shiftSlot: 'all',
  });

  const [sortBy, setSortBy] = useState<'shift' | 'difficulty' | 'avg' | 'highest' | 'candidates'>('difficulty');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [slotFilter, setSlotFilter] = useState<'all' | 'Morning' | 'Afternoon'>('all');

  // Filter candidates first
  const filteredCandidates = useMemo(() => {
    return filterCandidates(candidates, {
      ...filters,
      shiftNumber: 'all', // We want all shifts when analyzing per-shift stats
    });
  }, [candidates, filters]);

  // Overall Global Average Score for Normalization Baseline
  const globalAvg = useMemo(() => {
    if (filteredCandidates.length === 0) return 135;
    const sum = filteredCandidates.reduce((acc, c) => acc + c.rawScore, 0);
    return Number((sum / filteredCandidates.length).toFixed(2));
  }, [filteredCandidates]);

  // Enriched Shift Stats
  const enrichedShiftStats = useMemo(() => {
    return shiftStats.map((base) => {
      const shiftCohort = filteredCandidates.filter((c) => c.shiftNumber === base.shiftNumber);
      const count = shiftCohort.length;

      let avg = base.avgRawScore;
      let highest = base.highestRawScore;
      let lowest = base.lowestRawScore;
      let median = base.medianRawScore;
      let shiftTopper: CandidateRecord | undefined;

      if (count > 0) {
        const sortedScores = [...shiftCohort].sort((a, b) => a.rawScore - b.rawScore);
        const sum = sortedScores.reduce((acc, curr) => acc + curr.rawScore, 0);
        avg = Number((sum / count).toFixed(2));
        highest = sortedScores[count - 1].rawScore;
        lowest = sortedScores[0].rawScore;
        const mid = Math.floor(count / 2);
        median = count % 2 !== 0 ? sortedScores[mid].rawScore : Number(((sortedScores[mid - 1].rawScore + sortedScores[mid].rawScore) / 2).toFixed(2));
        shiftTopper = sortedScores[count - 1];
      }

      // Difficulty Classification
      let difficultyCategory: { label: string; color: string; level: 'VERY_HARD' | 'HARD' | 'MODERATE' | 'EASY' | 'VERY_EASY' };
      if (avg < 115) {
        difficultyCategory = { label: 'अति कठिन (Very Hard)', color: 'rose', level: 'VERY_HARD' };
      } else if (avg < 125) {
        difficultyCategory = { label: 'कठिन (Hard)', color: 'orange', level: 'HARD' };
      } else if (avg < 138) {
        difficultyCategory = { label: 'मध्यम (Moderate)', color: 'amber', level: 'MODERATE' };
      } else if (avg < 150) {
        difficultyCategory = { label: 'सरल (Easy)', color: 'emerald', level: 'EASY' };
      } else {
        difficultyCategory = { label: 'अति सरल (Very Easy)', color: 'teal', level: 'VERY_EASY' };
      }

      // Expected Normalization Impact
      const diffFromGlobal = Number((avg - globalAvg).toFixed(2));
      let normImpact: { text: string; kind: 'positive' | 'negative' | 'neutral'; diff: number };
      if (diffFromGlobal <= -3) {
        normImpact = {
          text: `+${Math.abs(diffFromGlobal)} अंक संभावित लाभ (Hard Shift)`,
          kind: 'positive',
          diff: Math.abs(diffFromGlobal),
        };
      } else if (diffFromGlobal >= 3) {
        normImpact = {
          text: `-${diffFromGlobal} अंक संभावित समायोजन (Easy Shift)`,
          kind: 'negative',
          diff: diffFromGlobal,
        };
      } else {
        normImpact = {
          text: `±0 अंक संतुलित (Neutral)`,
          kind: 'neutral',
          diff: 0,
        };
      }

      const spread = Number((highest - lowest).toFixed(2));

      return {
        ...base,
        candidateCount: count,
        avgRawScore: avg,
        highestRawScore: highest,
        lowestRawScore: lowest,
        medianRawScore: median,
        shiftTopper,
        difficultyCategory,
        normImpact,
        spread,
      };
    });
  }, [shiftStats, filteredCandidates, globalAvg]);

  // Apply Slot Filter (All, Morning, Afternoon)
  const slotFilteredList = useMemo(() => {
    if (slotFilter === 'all') return enrichedShiftStats;
    return enrichedShiftStats.filter((s) => {
      const shiftObj = EXAM_SHIFTS.find((item) => item.shiftNumber === s.shiftNumber);
      return shiftObj && shiftObj.shiftTime === slotFilter;
    });
  }, [enrichedShiftStats, slotFilter]);

  // Sorted list
  const sortedStats = useMemo(() => {
    const list = [...slotFilteredList];
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
  }, [slotFilteredList, sortBy, sortOrder]);

  const toggleSort = (type: typeof sortBy) => {
    if (sortBy === type) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(type);
      setSortOrder(type === 'difficulty' || type === 'shift' ? 'asc' : 'desc');
    }
  };

  // Top Extremes for summary cards
  const shiftsWithData = enrichedShiftStats.filter((s) => s.candidateCount > 0);
  const hardestShift = [...shiftsWithData].sort((a, b) => a.avgRawScore - b.avgRawScore)[0];
  const easiestShift = [...shiftsWithData].sort((a, b) => b.avgRawScore - a.avgRawScore)[0];
  const avgSpread =
    easiestShift && hardestShift ? (easiestShift.avgRawScore - hardestShift.avgRawScore).toFixed(2) : '0';

  return (
    <div className="space-y-6 pb-12 transition-colors">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <Zap className="w-6 h-6 text-amber-500" />
            <span>22 शिफ्ट्स विस्तृत विश्लेषण (Shift-wise Deep Analytics)</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            23 सितम्बर से 05 अक्टूबर 2026 तक सभी 22 शिफ्ट्स का तुलनात्मक कठिनाई स्तर, नॉर्मलाइजेशन प्रभाव व वितरण
          </p>
        </div>
      </div>

      <RawMarksDisclaimer />

      {/* Summary KPI Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Hardest Shift */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">सर्वाधिक कठिन शिफ्ट</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 font-mono">
            {hardestShift ? `Shift ${hardestShift.shiftNumber}` : 'Shift 1'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            औसत अंक: <strong className="font-mono text-slate-800 dark:text-slate-200">{hardestShift?.avgRawScore ?? 0}</strong> (संभावित नॉर्म. लाभ)
          </div>
        </div>

        {/* KPI 2: Easiest Shift */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">सर्वाधिक सरल शिफ्ट</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 font-mono">
            {easiestShift ? `Shift ${easiestShift.shiftNumber}` : 'Shift 22'}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            औसत अंक: <strong className="font-mono text-slate-800 dark:text-slate-200">{easiestShift?.avgRawScore ?? 0}</strong> (संतुलित अंक)
          </div>
        </div>

        {/* KPI 3: Shift Spread */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">शिफ्ट्स औसत अंतर (Spread)</span>
            <Target className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 font-mono">
            {avgSpread} <span className="text-xs text-slate-400 font-normal">अंक</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            ग्लोबल औसत: <strong className="font-mono text-slate-800 dark:text-slate-200">{globalAvg}</strong> / 200
          </div>
        </div>

        {/* KPI 4: Total Analyzed Shifts */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">विश्लेषित कुल शिफ्ट्स</span>
            <Clock className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl font-extrabold text-cyan-600 dark:text-cyan-400 font-mono">
            22 Shifts
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            प्रातः 11 + दोपहर 11 (समानुपातिक)
          </div>
        </div>
      </div>

      {/* Global Filter Bar */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        showShiftFilter={false}
        totalFilteredCount={filteredCandidates.length}
        totalCount={candidates.length}
        title="शिफ्ट विश्लेषण फ़िल्टर (Advance Cohort Filter)"
      />

      {/* Shift Timing Slot Filter Tabs & Sorting Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 sm:p-4 rounded-2xl text-xs shadow-xs">
        {/* Slot selection */}
        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
          {[
            { label: 'सभी 22 शिफ्ट्स', value: 'all' },
            { label: 'प्रातः 09:00 AM (Morning)', value: 'Morning' },
            { label: 'दोपहर 02:30 PM (Afternoon)', value: 'Afternoon' },
          ].map((tab) => (
            <button
              key={tab.label}
              onClick={() => setSlotFilter(tab.value as any)}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-colors cursor-pointer ${
                slotFilter === tab.value
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Sort Controls */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-500 dark:text-slate-400 font-medium mr-1">क्रमबद्ध:</span>
          <button
            onClick={() => toggleSort('difficulty')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'difficulty'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            कठिनाई रैंक {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
          <button
            onClick={() => toggleSort('shift')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'shift'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            शिफ्ट (1–22)
          </button>
          <button
            onClick={() => toggleSort('avg')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'avg'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            औसत अंक
          </button>
          <button
            onClick={() => toggleSort('highest')}
            className={`px-2.5 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              sortBy === 'highest'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            सर्वोच्च अंक
          </button>
        </div>
      </div>

      {/* Desktop Data Grid */}
      <div className="hidden md:block bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">कठिनाई स्तर</th>
                <th className="py-3 px-4">शिफ्ट विवरण</th>
                <th className="py-3 px-4">दिनांक व स्लॉट</th>
                <th className="py-3 px-4 text-right">अभ्यर्थी</th>
                <th className="py-3 px-4 text-right">औसत (Mean)</th>
                <th className="py-3 px-4 text-right">माध्यिका (Median)</th>
                <th className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400">उच्चतम (High)</th>
                <th className="py-3 px-4 text-right text-rose-600 dark:text-rose-400">न्यूनतम (Low)</th>
                <th className="py-3 px-4">नॉर्मलाइजेशन प्रभाव (संभावित)</th>
                <th className="py-3 px-4 text-center">क्रिया</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {sortedStats.map((s) => {
                const shiftObj = EXAM_SHIFTS.find((item) => item.shiftNumber === s.shiftNumber);

                return (
                  <tr key={s.shiftNumber} className="hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`inline-flex items-center justify-center w-7 h-7 rounded-lg text-xs font-bold ${
                            s.difficultyRank <= 3
                              ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30'
                              : s.difficultyRank >= 20
                              ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          #{s.difficultyRank}
                        </span>
                        <span className="font-sans text-[11px] font-semibold text-slate-800 dark:text-slate-200">
                          {s.difficultyCategory.label}
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4 font-sans font-semibold text-slate-900 dark:text-white">
                      Shift {s.shiftNumber}
                      {s.shiftTopper && (
                        <div className="text-[10px] text-slate-500 font-normal">
                          टॉपर: {s.shiftTopper.candidateNamePublic} ({s.shiftTopper.rawScore.toFixed(1)})
                        </div>
                      )}
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

                    <td className="py-3 px-4 font-sans text-[11px]">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          s.normImpact.kind === 'positive'
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                            : s.normImpact.kind === 'negative'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {s.normImpact.text}
                      </span>
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

      {/* Mobile Responsive Cards */}
      <div className="md:hidden space-y-3">
        {sortedStats.map((s) => {
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
                      s.difficultyRank <= 3
                        ? 'bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-500/30'
                        : s.difficultyRank >= 20
                        ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/30'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    #{s.difficultyRank}
                  </span>
                  <div>
                    <span className="font-bold text-slate-900 dark:text-white text-base">Shift {s.shiftNumber}</span>
                    <span className="text-[11px] text-slate-500 block">{s.difficultyCategory.label}</span>
                  </div>
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

              <div className="text-[11px] bg-slate-100/70 dark:bg-slate-800/40 p-2 rounded-lg">
                <span className="text-slate-500 block">नॉर्मलाइजेशन प्रभाव:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{s.normImpact.text}</span>
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
