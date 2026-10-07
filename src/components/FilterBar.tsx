import React from 'react';
import { FilterState, Category, Gender } from '../types';
import { MASTER_QUALIFICATIONS } from '../data/qualifications';
import { EXAM_SHIFTS } from '../data/shifts';
import { Filter, Search, RotateCcw } from 'lucide-react';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  showShiftFilter?: boolean;
  totalFilteredCount?: number;
  totalCount?: number;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  showShiftFilter = true,
  totalFilteredCount,
  totalCount,
}) => {
  const categories: (Category | 'all')[] = ['all', 'UR', 'OBC', 'SC', 'ST', 'EWS'];
  const genders: (Gender | 'all')[] = ['all', 'Male', 'Female'];

  const handleReset = () => {
    onChange({
      shiftNumber: 'all',
      category: 'all',
      gender: 'all',
      qualification: 'all',
      postPreference: 'all',
      searchQuery: '',
    });
  };

  const isFiltered =
    (filters.shiftNumber && filters.shiftNumber !== 'all') ||
    (filters.category && filters.category !== 'all') ||
    (filters.gender && filters.gender !== 'all') ||
    (filters.qualification && filters.qualification !== 'all') ||
    (filters.postPreference && filters.postPreference !== 'all') ||
    Boolean(filters.searchQuery);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3 mb-6 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 font-medium">
          <Filter className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span>डेटा फ़िल्टर (Global Filters)</span>
          {totalFilteredCount !== undefined && totalCount !== undefined && (
            <span className="text-slate-500 dark:text-slate-400">
              · परिणाम: <strong className="text-slate-900 dark:text-white font-mono">{totalFilteredCount}</strong> / {totalCount} अभ्यर्थी
            </span>
          )}
        </div>

        {isFiltered && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>फ़िल्टर रीसेट करें</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {/* Search Input */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
            खोजें (नाम / रोल नंबर)
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="नाम या रोल..."
              value={filters.searchQuery || ''}
              onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>
        </div>

        {/* Shift Filter */}
        {showShiftFilter && (
          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              परीक्षा शिफ्ट (22 Shifts)
            </label>
            <select
              value={filters.shiftNumber || 'all'}
              onChange={(e) =>
                onChange({
                  ...filters,
                  shiftNumber: e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10),
                })
              }
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
            >
              <option value="all">सभी शिफ्ट्स (All 22 Shifts)</option>
              {EXAM_SHIFTS.map((s) => (
                <option key={s.shiftNumber} value={s.shiftNumber}>
                  Shift {s.shiftNumber} — {s.displayDate} ({s.shiftTime === 'Morning' ? 'प्रातः' : 'दोपहर'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Category Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
            आरक्षण श्रेणी (Category)
          </label>
          <select
            value={filters.category || 'all'}
            onChange={(e) => onChange({ ...filters, category: e.target.value as Category | 'all' })}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">सभी श्रेणियां (All Categories)</option>
            {categories
              .filter((c) => c !== 'all')
              .map((c) => (
                <option key={c} value={c}>
                  {c === 'UR' ? 'UR (अनारक्षित / Open)' : c}
                </option>
              ))}
          </select>
        </div>

        {/* Gender Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
            लिंग (Gender)
          </label>
          <select
            value={filters.gender || 'all'}
            onChange={(e) => onChange({ ...filters, gender: e.target.value as Gender | 'all' })}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">सभी लिंग (All Genders)</option>
            {genders
              .filter((g) => g !== 'all')
              .map((g) => (
                <option key={g} value={g}>
                  {g === 'Male' ? 'पुरुष (Male)' : g === 'Female' ? 'महिला (Female)' : 'अन्य (Other)'}
                </option>
              ))}
          </select>
        </div>

        {/* Qualification Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
            शैक्षणिक योग्यता (Qualification)
          </label>
          <select
            value={filters.qualification || 'all'}
            onChange={(e) => onChange({ ...filters, qualification: e.target.value })}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">सभी योग्यताएं (All Qualifications)</option>
            {MASTER_QUALIFICATIONS.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>

      </div>
    </div>
  );
};
