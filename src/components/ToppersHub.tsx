import React, { useState, useMemo } from 'react';
import { CandidateRecord } from '../types';
import { computeAllToppers, TopperItem } from '../lib/filterUtils';
import { Trophy, Award, Crown, Medal, User, Sparkles, Filter } from 'lucide-react';

interface ToppersHubProps {
  candidates: CandidateRecord[];
  onSelectCandidate?: (candidate: CandidateRecord) => void;
}

export const ToppersHub: React.FC<ToppersHubProps> = ({ candidates, onSelectCandidate }) => {
  const [activeTab, setActiveTab] = useState<'stream' | 'gender' | 'category' | 'quota'>('stream');

  const { streamToppers, genderToppers, categoryToppers, quotaToppers } = useMemo(
    () => computeAllToppers(candidates),
    [candidates]
  );

  const currentGroups: TopperItem[] = useMemo(() => {
    switch (activeTab) {
      case 'stream':
        return streamToppers;
      case 'gender':
        return genderToppers;
      case 'category':
        return categoryToppers;
      case 'quota':
        return quotaToppers;
      default:
        return streamToppers;
    }
  }, [activeTab, streamToppers, genderToppers, categoryToppers, quotaToppers]);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5 transition-colors">
      {/* Box Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Trophy className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>विषय, संकाय व श्रेणी टॉपर्स गैलरी</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold border border-amber-300 dark:border-amber-800">
                Toppers Hub
              </span>
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            प्रत्येक विषय स्ट्रीम, जेंडर (पुरुष/महिला), आरक्षण वर्ग व विशेष कोटा के शीर्ष रैंकर्स
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-950 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('stream')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'stream'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            💼 विषय / स्ट्रीम टॉपर्स
          </button>
          <button
            onClick={() => setActiveTab('gender')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'gender'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            👥 जेंडर टॉपर्स (M/F)
          </button>
          <button
            onClick={() => setActiveTab('category')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'category'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            🏷️ वर्ग-वार (Category)
          </button>
          <button
            onClick={() => setActiveTab('quota')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
              activeTab === 'quota'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            🏛️ विशेष कोटा (संविदा / Ex-SM)
          </button>
        </div>
      </div>

      {/* Grid of Topper Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {currentGroups.map((group) => {
          const topCandidate = group.candidates[0];

          return (
            <div
              key={group.groupTitle}
              className="bg-slate-50/80 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-xl p-4 flex flex-col justify-between hover:border-amber-400/50 dark:hover:border-amber-500/30 transition-all shadow-2xs"
            >
              <div>
                {/* Card Group Header */}
                <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-slate-200/80 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{group.icon}</span>
                    <div>
                      <h3 className="text-xs font-bold text-slate-900 dark:text-white leading-tight">
                        {group.groupTitle}
                      </h3>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">
                        {group.tag}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {group.candidates.length > 0 ? `${group.candidates.length} रैंकर्स` : 'प्रतीक्षारत'}
                  </span>
                </div>

                {/* Topper Content */}
                {topCandidate ? (
                  <div className="space-y-3">
                    {/* #1 Gold Champion */}
                    <div
                      onClick={() => onSelectCandidate && onSelectCandidate(topCandidate.candidate)}
                      className="p-3 rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-400/40 dark:border-amber-500/30 flex items-center justify-between gap-2 cursor-pointer hover:scale-[1.01] transition-transform"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                          👑 1
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {topCandidate.candidate.candidateNamePrivate || topCandidate.candidate.candidateNamePublic}
                          </div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <span>Shift {topCandidate.candidate.shiftNumber}</span>
                            <span>·</span>
                            <span>{topCandidate.candidate.category}</span>
                            <span>·</span>
                            <span>{topCandidate.candidate.gender === 'Male' ? 'पुरुष' : 'महिला'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-base font-extrabold font-mono text-amber-700 dark:text-amber-400">
                          {topCandidate.candidate.rawScore.toFixed(2)}
                        </div>
                        <div className="text-[9px] text-slate-500 font-mono">
                          {topCandidate.candidate.accuracy}% सही
                        </div>
                      </div>
                    </div>

                    {/* Runners Up (#2 and #3) */}
                    {group.candidates.slice(1, 3).length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        {group.candidates.slice(1, 3).map((item) => (
                          <div
                            key={item.candidate.rollNumber}
                            onClick={() => onSelectCandidate && onSelectCandidate(item.candidate)}
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 font-mono w-4">
                                #{item.rank}
                              </span>
                              <span className="text-[11px] text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                                {item.candidate.candidateNamePrivate || item.candidate.candidateNamePublic}
                              </span>
                              <span className="text-[10px] text-slate-400">
                                (S-{item.candidate.shiftNumber})
                              </span>
                            </div>
                            <span className="font-mono font-bold text-[11px] text-slate-800 dark:text-slate-200">
                              {item.candidate.rawScore.toFixed(1)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="py-6 text-center text-slate-400 dark:text-slate-500 text-xs italic">
                    इस वर्ग में अभी कोई उत्तर कुंजी दर्ज नहीं है
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
