import React, { useState } from 'react';
import { CandidateRecord, ShiftStats } from '../types';
import { EXAM_SHIFTS } from '../data/shifts';
import { RawMarksDisclaimer } from './RawMarksDisclaimer';
import { GitCompare, ArrowRight, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface ShiftCompareViewProps {
  candidates: CandidateRecord[];
  shiftStats: ShiftStats[];
  initialShiftA?: number;
  initialShiftB?: number;
}

export const ShiftCompareView: React.FC<ShiftCompareViewProps> = ({
  candidates,
  shiftStats,
  initialShiftA = 1,
  initialShiftB = 2,
}) => {
  const [shiftANum, setShiftANum] = useState<number>(initialShiftA);
  const [shiftBNum, setShiftBNum] = useState<number>(initialShiftB);

  const statsA = shiftStats.find((s) => s.shiftNumber === shiftANum) || shiftStats[0];
  const statsB = shiftStats.find((s) => s.shiftNumber === shiftBNum) || shiftStats[1];

  const shiftInfoA = EXAM_SHIFTS.find((s) => s.shiftNumber === shiftANum);
  const shiftInfoB = EXAM_SHIFTS.find((s) => s.shiftNumber === shiftBNum);

  // Compute metrics comparison
  const metrics = [
    { label: 'अभ्यर्थी संख्या (Candidates)', valA: statsA.candidateCount, valB: statsB.candidateCount, isNumeric: true },
    { label: 'औसत अंक (Mean Raw Score)', valA: statsA.avgRawScore, valB: statsB.avgRawScore, isNumeric: true, highlight: true },
    { label: 'मीडियन अंक (Median Raw Score)', valA: statsA.medianRawScore, valB: statsB.medianRawScore, isNumeric: true },
    { label: 'सर्वोच्च अंक (Highest Score)', valA: statsA.highestRawScore, valB: statsB.highestRawScore, isNumeric: true },
    { label: 'न्यूनतम अंक (Lowest Score)', valA: statsA.lowestRawScore, valB: statsB.lowestRawScore, isNumeric: true },
    { label: 'औसत सही प्रश्न (Avg Correct)', valA: statsA.avgCorrect, valB: statsB.avgCorrect, isNumeric: true },
    { label: 'औसत गलत प्रश्न (Avg Wrong)', valA: statsA.avgWrong, valB: statsB.avgWrong, isNumeric: true },
    { label: 'औसत सटीकता (Avg Accuracy)', valA: `${statsA.avgAccuracy}%`, valB: `${statsB.avgAccuracy}%`, isNumeric: false },
    { label: 'कठिनाई रैंक (Difficulty Rank)', valA: `#${statsA.difficultyRank}`, valB: `#${statsB.difficultyRank}`, isNumeric: false },
  ];

  const renderDelta = (valA: number, valB: number) => {
    const diff = Number((valB - valA).toFixed(2));
    if (diff === 0) return <span className="text-slate-500 font-mono">0.00</span>;
    if (diff > 0) {
      return (
        <span className="text-emerald-400 font-mono font-semibold flex items-center justify-end gap-1">
          <TrendingUp className="w-3.5 h-3.5" /> +{diff}
        </span>
      );
    }
    return (
      <span className="text-rose-400 font-mono font-semibold flex items-center justify-end gap-1">
        <TrendingDown className="w-3.5 h-3.5" /> {diff}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12 transition-colors">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <GitCompare className="w-6 h-6 text-amber-500 dark:text-amber-400" />
          <span>दो शिफ्ट्स की आमने-सामने तुलना (Shift A vs Shift B)</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          MPESB Group-2 Sub-Group-4 की किन्हीं भी दो पारियों के वास्तविक अंकों, कठिनाई और सटीकता का तुलनात्मक अंतर
        </p>
      </div>

      <RawMarksDisclaimer />

      {/* Selectors Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Shift A Selector */}
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 block uppercase tracking-wider">
              शिफ्ट - A का चयन करें
            </span>
            <select
              value={shiftANum}
              onChange={(e) => setShiftANum(parseInt(e.target.value, 10))}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
            >
              {EXAM_SHIFTS.map((s) => (
                <option key={s.shiftNumber} value={s.shiftNumber}>
                  Shift {s.shiftNumber} — {s.displayDate} ({s.shiftTime === 'Morning' ? 'प्रातः' : 'दोपहर'})
                </option>
              ))}
            </select>
            {shiftInfoA && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {shiftInfoA.displayDate} · {shiftInfoA.timeLabel}
              </p>
            )}
          </div>

          {/* Shift B Selector */}
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
            <span className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 block uppercase tracking-wider">
              शिफ्ट - B का चयन करें
            </span>
            <select
              value={shiftBNum}
              onChange={(e) => setShiftBNum(parseInt(e.target.value, 10))}
              className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg p-2.5 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
            >
              {EXAM_SHIFTS.map((s) => (
                <option key={s.shiftNumber} value={s.shiftNumber}>
                  Shift {s.shiftNumber} — {s.displayDate} ({s.shiftTime === 'Morning' ? 'प्रातः' : 'दोपहर'})
                </option>
              ))}
            </select>
            {shiftInfoB && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {shiftInfoB.displayDate} · {shiftInfoB.timeLabel}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Comparison Matrix Table (Blueprint #57) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            तुलनात्मक मैट्रिक्स (Comparison Matrix)
          </h2>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Shift {shiftANum} बनाम Shift {shiftBNum}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[11px]">
              <tr>
                <th className="py-3 px-4">मापदंड (Metric)</th>
                <th className="py-3 px-4 text-right text-amber-700 dark:text-amber-300 font-mono font-bold">
                  Shift {shiftANum}
                </th>
                <th className="py-3 px-4 text-right text-cyan-700 dark:text-cyan-300 font-mono font-bold">
                  Shift {shiftBNum}
                </th>
                <th className="py-3 px-4 text-right font-mono">
                  अंतर (Difference: B − A)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {metrics.map((m, idx) => {
                const numericA = typeof m.valA === 'number' ? m.valA : parseFloat(String(m.valA).replace(/[^0-9.-]/g, ''));
                const numericB = typeof m.valB === 'number' ? m.valB : parseFloat(String(m.valB).replace(/[^0-9.-]/g, ''));

                return (
                  <tr
                    key={idx}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-850/60 transition-colors ${
                      m.highlight ? 'bg-amber-500/5' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-sans font-medium text-slate-900 dark:text-white">
                      {m.label}
                    </td>
                    <td className="py-3 px-4 text-right text-amber-600 dark:text-amber-300 font-semibold text-sm tabular-nums">
                      {m.valA}
                    </td>
                    <td className="py-3 px-4 text-right text-cyan-600 dark:text-cyan-300 font-semibold text-sm tabular-nums">
                      {m.valB}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums">
                      {m.isNumeric ? renderDelta(numericA, numericB) : (
                        <span className="text-slate-500 font-sans text-[11px]">सापेक्ष</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Visual Comparative Score Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-xs space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          औसत अंक दृश्य तुलना (Visual Score Comparison)
        </h3>
        
        <div className="space-y-3 font-mono text-xs">
          <div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300 mb-1 font-sans">
              <span>Shift {shiftANum} (औसत अंक)</span>
              <span className="font-mono text-amber-600 dark:text-amber-400 font-bold">{statsA.avgRawScore} / 200</span>
            </div>
            <div className="h-4 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800">
              <div
                style={{ width: `${Math.min(100, (statsA.avgRawScore / 200) * 100)}%` }}
                className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full transition-all"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between text-slate-700 dark:text-slate-300 mb-1 font-sans">
              <span>Shift {shiftBNum} (औसत अंक)</span>
              <span className="font-mono text-cyan-600 dark:text-cyan-400 font-bold">{statsB.avgRawScore} / 200</span>
            </div>
            <div className="h-4 bg-slate-100 dark:bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-200 dark:border-slate-800">
              <div
                style={{ width: `${Math.min(100, (statsB.avgRawScore / 200) * 100)}%` }}
                className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all"
              />
            </div>
          </div>
        </div>

        <div className="pt-2 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80">
          💡 <strong>निष्कर्ष:</strong>{' '}
          {statsA.avgRawScore > statsB.avgRawScore ? (
            <span>
              Shift {shiftANum} का औसत स्कोर Shift {shiftBNum} से <strong>{(statsA.avgRawScore - statsB.avgRawScore).toFixed(2)} अंक अधिक</strong> रहा है (Shift {shiftBNum} सापेक्षतः अधिक कठिन प्रतीत होती है)।
            </span>
          ) : statsB.avgRawScore > statsA.avgRawScore ? (
            <span>
              Shift {shiftBNum} का औसत स्कोर Shift {shiftANum} से <strong>{(statsB.avgRawScore - statsA.avgRawScore).toFixed(2)} अंक अधिक</strong> रहा है (Shift {shiftANum} सापेक्षतः अधिक कठिन प्रतीत होती है)।
            </span>
          ) : (
            <span>दोनों शिफ्ट्स का औसत रॉ स्कोर समान है।</span>
          )}
        </div>
      </div>
    </div>
  );
};
