import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface DisclaimerProps {
  compact?: boolean;
}

export const RawMarksDisclaimer: React.FC<DisclaimerProps> = ({ compact }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs font-medium">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="truncate">कच्चे अंक (Raw Marks) केवल · Normalization लागू नहीं · गैर-आधिकारिक</span>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-gradient-to-r from-amber-500/10 via-amber-50/50 to-white dark:from-amber-950/30 dark:via-slate-900 dark:to-slate-900 border border-amber-300/80 dark:border-amber-500/30 p-4 shadow-xs mb-6 transition-colors">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-amber-900 dark:text-amber-200 text-sm">
              RAW MARKS ONLY — NORMALIZATION NOT APPLIED
            </span>
            <span className="text-slate-400 text-xs">·</span>
            <span className="text-xs text-amber-700 dark:text-amber-400/90 font-mono font-medium">चरण-1 विश्लेषिकी</span>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            यह विश्लेषण केवल <strong>Rank Mitra</strong> पर प्रस्तुत उम्मीदवारों के वास्तविक उत्तर-कुंजी डेटा (Raw Marks = Correct × 1.0 − Wrong × 0.25) पर आधारित है। इसमें किसी प्रकार का Normalization लागू नहीं किया गया है। यह आधिकारिक MPESB परिणाम, मेरिट या चयन की गारंटी नहीं है।
          </p>
        </div>
      </div>
    </div>
  );
};

