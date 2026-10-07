import React, { useState } from 'react';
import { CandidateRecord, ShiftStats } from '../types';
import { EXAM_SHIFTS } from '../data/shifts';
import { RawMarksDisclaimer } from './RawMarksDisclaimer';
import { ToppersHub } from './ToppersHub';
import { 
  Users, 
  Target, 
  TrendingUp, 
  TrendingDown, 
  Calendar,
  Clock, 
  ArrowRight, 
  Upload, 
  Trophy, 
  BarChart2,
  Award,
  Sparkles,
  Info
} from 'lucide-react';

interface DashboardViewProps {
  candidates: CandidateRecord[];
  shiftStats: ShiftStats[];
  lastRefresh: Date;
  onNavigate: (tab: any) => void;
  /** SQL aggregates over the whole table (GET /api/stats) — may be null offline. */
  serverStats?: {
    summary: { totalCandidates: number; avgRawScore: number; highestRawScore: number; avgAccuracy: number; activeShifts: number; lastUpdate: string | null };
  } | null;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  candidates,
  shiftStats,
  lastRefresh,
  onNavigate,
  serverStats,
}) => {
  const [hoveredBucket, setHoveredBucket] = useState<{ label: string; count: number; pct: number } | null>(null);

  // Overall KPIs — the server counts every row, the browser only holds one page
  const serverSummary = serverStats?.summary;
  const totalStudents = Math.max(candidates.length, serverSummary?.totalCandidates ?? 0);
  const fromWholeTable = Boolean(serverSummary && serverSummary.totalCandidates > candidates.length);
  const scores = candidates.map((c) => c.rawScore).sort((a, b) => a - b);
  const highestScore = Math.max(scores.length > 0 ? scores[scores.length - 1] : 0, serverSummary?.highestRawScore ?? 0);
  const lowestScore = scores.length > 0 ? scores[0] : 0;
  const totalSum = scores.reduce((acc, curr) => acc + curr, 0);
  const avgScore = totalStudents > 0 ? Number((totalSum / totalStudents).toFixed(2)) : 0;
  
  const midIndex = Math.floor(scores.length / 2);
  const medianScore =
    scores.length === 0
      ? 0
      : scores.length % 2 !== 0
      ? scores[midIndex]
      : Number(((scores[midIndex - 1] + scores[midIndex]) / 2).toFixed(2));

  // Shift extremes
  const validShifts = shiftStats.filter((s) => s.candidateCount > 0);
  const sortedByAvg = [...validShifts].sort((a, b) => b.avgRawScore - a.avgRawScore);
  const easiestShift = sortedByAvg.length > 0 ? sortedByAvg[0] : undefined;
  const hardestShift = sortedByAvg.length > 0 ? sortedByAvg[sortedByAvg.length - 1] : undefined;

  const getShiftDate = (shiftNum?: number) => {
    if (!shiftNum) return '';
    const s = EXAM_SHIFTS.find((item) => item.shiftNumber === shiftNum);
    return s ? `${s.displayDate} · ${s.timeLabel}` : '';
  };

  // Score distribution buckets for 200 marks exam
  const buckets = [
    { label: '< 80', min: -50, max: 80 },
    { label: '80–100', min: 80, max: 100 },
    { label: '100–120', min: 100, max: 120 },
    { label: '120–140', min: 120, max: 140 },
    { label: '140–160', min: 140, max: 160 },
    { label: '160–180', min: 160, max: 180 },
    { label: '180–200', min: 180, max: 201 },
  ].map((b) => {
    const count = candidates.filter((c) => c.rawScore >= b.min && c.rawScore < b.max).length;
    const pct = totalStudents > 0 ? Number(((count / totalStudents) * 100).toFixed(1)) : 0;
    return { ...b, count, pct };
  });

  const maxBucketCount = Math.max(...buckets.map((b) => b.count), 1);

  // Category counts and averages
  const categoriesList = ['UR', 'OBC', 'SC', 'ST', 'EWS', 'PWD'] as const;
  const categoryStats = categoriesList.map((cat) => {
    const pool = candidates.filter((c) => c.category === cat);
    const count = pool.length;
    const catAvg =
      count > 0
        ? Number((pool.reduce((acc, c) => acc + c.rawScore, 0) / count).toFixed(2))
        : 0;
    return { category: cat, count, avg: catAvg };
  });

  return (
    <div className="space-y-8 pb-12 transition-colors">
      {/* Classic Refined Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-xs">
        <div className="relative z-10 max-w-3xl space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400 text-xs font-semibold">
            <Award className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>MPESB Group-2 Sub-Group-4 परीक्षा (23 सितम्बर – 05 अक्टूबर 2026)</span>
          </div>

          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            रॉ मार्क्स एवं 22 शिफ्ट्स लाइव विश्लेषण कंसोल
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            उम्मीदवारों द्वारा पेस्ट की गई अपनी Response Sheet से निकाला गया निष्पक्ष डेटा। किसी भी अनुमान के बिना 22 शिफ्ट्स की सटीक कठिनाई, औसत अंक व मेरिट स्थिति देखें।
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              onClick={() => onNavigate('upload')}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>उत्तर कुंजी पेस्ट करें (Paste your key)</span>
            </button>

            <button
              onClick={() => onNavigate('leaderboard')}
              className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>मेरिट सूची देखें (Leaderboard)</span>
            </button>
          </div>
        </div>
      </div>

      <RawMarksDisclaimer />

      {/* Data completeness (#40) — how much of the analytics the cohort actually filled */}
      {totalStudents > 0 && (() => {
        const pct = (f: (c: typeof candidates[number]) => boolean) =>
          Number(((candidates.filter(f).length / Math.max(1, totalStudents)) * 100).toFixed(0));
        const rows = [
          // the three fields a candidate can actually set — nothing else is counted
          { label: 'पूर्ण प्रोफ़ाइल (श्रेणी + लिंग + योग्यता)', v: pct((c) => (c.qualifications?.length || 0) > 0 && !!c.category && !!c.gender) },
          { label: 'योग्यता चुनी', v: pct((c) => (c.qualifications?.length || 0) > 0) },
          { label: 'श्रेणी दर्ज', v: pct((c) => !!c.category) },
          { label: 'लिंग दर्ज', v: pct((c) => !!c.gender) },
        ];
        return (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-xs font-bold text-slate-900 dark:text-white">डेटा पूर्णता (Data Completeness)</h2>
              <span className="text-[10.5px] text-slate-500 dark:text-slate-400">
                अधूरी प्रोफ़ाइल भी overall रैंक में गिनी जाती है; श्रेणी/योग्यता-वार तुलना में तभी जुड़ती है जब field भरा हो।
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {rows.map((r) => (
                <div key={r.label} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <span className="block text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{r.label}</span>
                  <span className="flex items-center gap-1.5 mt-1">
                    <span className="text-sm font-black font-mono text-slate-900 dark:text-white tabular-nums">{r.v}%</span>
                    <span className="flex-1 h-1 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                      <span className={`block h-full ${r.v >= 75 ? 'bg-emerald-500' : r.v >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${r.v}%` }} />
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">कुल अभ्यर्थी (Total Keys)</span>
            <Users className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 dark:text-white">
            {totalStudents}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            {fromWholeTable ? 'लाइव डेटाबेस की सभी प्रविष्टियाँ गिनी गईं' : 'सत्यापित उत्तर कुंजियों पर आधारित'}
          </p>
        </div>

        {/* KPI 2 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">औसत रॉ स्कोर (Mean Score)</span>
            <Target className="w-4 h-4 text-cyan-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 dark:text-white">
            {avgScore} <span className="text-xs font-normal text-slate-500">/ 200</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            मीडियन स्कोर: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">{medianScore}</span>
          </p>
        </div>

        {/* KPI 3 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">सर्वोच्च रॉ स्कोर (Highest)</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
            {highestScore} <span className="text-xs font-normal text-slate-500">/ 200</span>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
            न्यूनतम: <span className="font-mono text-rose-600 dark:text-rose-400 font-semibold">{lowestScore}</span>
          </p>
        </div>

        {/* KPI 4 with Date Mention */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
            <span className="text-xs font-semibold">कठिनतम शिफ्ट (Hardest Shift)</span>
            <TrendingDown className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold font-mono text-slate-900 dark:text-white">
            {hardestShift ? `Shift ${hardestShift.shiftNumber}` : 'डेटा प्रतीक्षारत'}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
            {hardestShift ? `${getShiftDate(hardestShift.shiftNumber)} · Avg: ${hardestShift.avgRawScore}` : 'कम से कम 1 उत्तर कुंजी आवश्यक'}
          </p>
        </div>
      </div>

      {/* Secondary Quick Metrics with Dates */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-4">
        <div>
          <span className="text-slate-500 dark:text-slate-400">कुल पारियां व दिनांक:</span>
          <p className="font-semibold text-slate-900 dark:text-white mt-0.5">22 Shifts (23 Sep – 05 Oct 2026)</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">सरलतम शिफ्ट (Easiest Shift):</span>
          <p className="font-semibold text-emerald-600 dark:text-emerald-400 mt-0.5 truncate">
            {easiestShift ? `Shift ${easiestShift.shiftNumber} (${getShiftDate(easiestShift.shiftNumber)})` : 'प्रतीक्षारत'}
          </p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">मार्किंग नियम (Marking Rule):</span>
          <p className="font-mono font-semibold text-amber-700 dark:text-amber-400 mt-0.5">+1.0 सही, -0.25 गलत</p>
        </div>
        <div>
          <span className="text-slate-500 dark:text-slate-400">अंतिम ताज़ा डेटा (Cache Freshness):</span>
          <p className="font-mono font-semibold text-slate-700 dark:text-slate-300 mt-0.5">
            {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (30 Min Cycle)
          </p>
        </div>
      </div>

      {/* Section: Score Distribution Histogram (PROMINENT & HIGH VISIBILITY) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-amber-500" />
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                रॉ स्कोर वितरण हिस्टोग्राम (Score Band Distribution)
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              प्रत्येक स्कोर श्रेणी (0–200) में अभ्यर्थियों की संख्या व प्रतिशत अनुपात (उच्च दृश्यता चार्ट)
            </p>
          </div>
          {hoveredBucket && (
            <div className="px-3 py-1.5 bg-amber-50 border border-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 rounded-lg text-xs text-amber-900 dark:text-amber-300 font-mono shadow-xs">
              स्कोर बैंड [{hoveredBucket.label}]: <strong>{hoveredBucket.count} छात्र</strong> ({hoveredBucket.pct}%)
            </div>
          )}
        </div>

        {/* High-Visibility Histogram Graphic */}
        <div className="space-y-4 pt-2">
          <div className="relative bg-slate-50/80 dark:bg-slate-950/80 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800">
            {/* Background Grid Guide Lines with percentage labels on left */}
            <div className="absolute inset-x-6 top-6 bottom-14 flex flex-col justify-between pointer-events-none opacity-40">
              <div className="border-b border-slate-300 dark:border-slate-700 border-dashed w-full" />
              <div className="border-b border-slate-300 dark:border-slate-700 border-dashed w-full" />
              <div className="border-b border-slate-300 dark:border-slate-700 border-dashed w-full" />
              <div className="border-b border-slate-300 dark:border-slate-700 border-dashed w-full" />
            </div>

            {/* Bars Grid */}
            <div className="relative z-10 grid grid-cols-7 gap-2 sm:gap-4 items-end h-60 sm:h-72 border-b-2 border-slate-300 dark:border-slate-700 pb-2">
              {buckets.map((b) => {
                const hasData = b.count > 0;
                // If there is data in this bucket, compute actual height proportional to max bucket count (min 15% for visibility)
                const heightPct = hasData ? Math.max(15, (b.count / maxBucketCount) * 100) : 0;

                return (
                  <div
                    key={b.label}
                    className="flex flex-col items-center h-full justify-end group cursor-pointer"
                    onMouseEnter={() => setHoveredBucket({ label: b.label, count: b.count, pct: b.pct })}
                    onMouseLeave={() => setHoveredBucket(null)}
                  >
                    {/* Count label above bar - highly visible bold number */}
                    <div className="mb-2 text-center transition-transform group-hover:scale-110">
                      <span
                        className={`text-xs sm:text-sm font-mono font-extrabold px-1.5 py-0.5 rounded ${
                          hasData
                            ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40 shadow-xs'
                            : 'text-slate-400'
                        }`}
                      >
                        {b.count}
                      </span>
                      {hasData && (
                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono block mt-0.5">
                          {b.pct}%
                        </span>
                      )}
                    </div>

                    {/* Bar graphic container */}
                    <div className="w-full sm:w-4/5 bg-slate-200/60 dark:bg-slate-800/60 rounded-t-xl overflow-hidden flex items-end h-full max-h-[82%] border border-slate-200 dark:border-slate-750">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t-lg transition-all duration-300 ${
                          hasData
                            ? 'bg-gradient-to-t from-amber-500 to-amber-400 group-hover:from-amber-600 group-hover:to-amber-300 shadow-sm border-t border-amber-300'
                            : 'bg-transparent'
                        }`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X-Axis Score Band Labels */}
            <div className="grid grid-cols-7 gap-2 sm:gap-4 text-center pt-3">
              {buckets.map((b) => (
                <div key={b.label}>
                  <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200">
                    {b.label}
                  </div>
                  <div className="text-[10px] text-slate-500 hidden sm:block">अंक परास</div>
                </div>
              ))}
            </div>
          </div>

          {/* Empty state notice if totalStudents is 0 */}
          {totalStudents === 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 text-center space-y-2">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">
                वर्तमान में कोई उत्तर कुंजी सबमिट नहीं हुई है।
              </p>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                अपनी उत्तर कुंजी पेस्ट करें और इस हिस्टोग्राम में अपना लाइव स्कोर व रैंक बैंड देखें।
              </p>
              <button
                onClick={() => onNavigate('upload')}
                className="mt-1 px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition-colors cursor-pointer"
              >
                उत्तर कुंजी पेस्ट करें
              </button>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] text-slate-500 px-1 font-medium">
            <span>← कम अंक (Lower Range: 0–80)</span>
            <span>अधिकतम 200 अंक (Total Marks)</span>
            <span>उच्च अंक (Topper Range: 180–200) →</span>
          </div>
        </div>
      </div>

      {/* Subject, Stream, Gender & Category Toppers Gallery */}
      <ToppersHub candidates={candidates} onSelectCandidate={() => onNavigate('leaderboard')} />

      {/* Category Breakdown Cards */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            आरक्षण श्रेणी वार विश्लेषण (Category Breakdown)
          </h2>
          <button
            onClick={() => onNavigate('leaderboard')}
            className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            <span>लीडरबोर्ड में देखें</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {categoryStats.map((item) => (
            <div
              key={item.category}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex flex-col justify-between shadow-xs"
            >
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  {item.category === 'UR' ? 'UR (अनारक्षित)' : item.category}
                </span>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
                  {item.count} <span className="text-xs font-normal text-slate-500">उम्मीदवार</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-500">औसत अंक:</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{item.avg}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* All 22 Shifts Quick Visual Heatmap with Dates */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              22 शिफ्ट्स का प्रदर्शन स्नैपशॉट (All 22 Shifts & Dates Overview)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              प्रत्येक शिफ्ट की आधिकारिक परीक्षा दिनांक, औसत रॉ स्कोर व कठिनाई स्तर
            </p>
          </div>
          <button
            onClick={() => onNavigate('shifts')}
            className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            <span>विस्तृत 22 शिफ्ट विश्लेषण तालिका</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-11 gap-2">
          {shiftStats.map((s) => {
            const isHardest = hardestShift && s.shiftNumber === hardestShift.shiftNumber;
            const isEasiest = easiestShift && s.shiftNumber === easiestShift.shiftNumber;
            const shiftObj = EXAM_SHIFTS.find((item) => item.shiftNumber === s.shiftNumber);

            return (
              <div
                key={s.shiftNumber}
                className={`p-2.5 rounded-xl border text-center transition-all ${
                  isHardest
                    ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-300 dark:border-rose-500/40 text-rose-950 dark:text-rose-200 font-medium'
                    : isEasiest
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-500/40 text-emerald-950 dark:text-emerald-200 font-medium'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white'
                }`}
              >
                <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold truncate">
                  Shift {s.shiftNumber}
                </div>
                <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate font-semibold">
                  {shiftObj ? `${shiftObj.date.split('-')[2]} ${shiftObj.date.split('-')[1] === '09' ? 'Sep' : 'Oct'}` : s.date}
                </div>
                <div className="text-sm font-black font-mono mt-0.5 tabular-nums">
                  {s.avgRawScore}
                </div>
                <div className="text-[9px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                  {s.candidateCount} छात्र
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
