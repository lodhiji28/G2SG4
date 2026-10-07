import React, { useState } from 'react';
import { FilterState, Category, Gender } from '../types';
import { MASTER_QUALIFICATIONS } from '../data/qualifications';
import { EXAM_SHIFTS } from '../data/shifts';
import { STREAM_DEFINITIONS, getActiveFilterCount } from '../lib/filterUtils';
import { 
  Filter, 
  Search, 
  RotateCcw, 
  SlidersHorizontal, 
  ChevronDown, 
  ChevronUp, 
  X, 
  Clock, 
  Award, 
  Briefcase, 
  Shield, 
  Printer 
} from 'lucide-react';

interface FilterBarProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  showShiftFilter?: boolean;
  totalFilteredCount?: number;
  totalCount?: number;
  onExportPdf?: () => void;
  title?: string;
}

export const FilterBar: React.FC<FilterBarProps> = ({
  filters,
  onChange,
  showShiftFilter = true,
  totalFilteredCount,
  totalCount,
  onExportPdf,
  title = 'डेटा फ़िल्टर (Data Filters)',
}) => {
  const [isAdvanceOpen, setIsAdvanceOpen] = useState(false);
  const [isQualPickerOpen, setIsQualPickerOpen] = useState(false);
  const [qualSearch, setQualSearch] = useState('');

  const categories: (Category | 'all')[] = ['all', 'UR', 'OBC', 'SC', 'ST', 'EWS', 'PWD'];
  const genders: (Gender | 'all')[] = ['all', 'Male', 'Female'];

  const selectedQuals = filters.qualifications || (filters.qualification && filters.qualification !== 'all' ? [filters.qualification] : []);

  const toggleQualification = (q: string) => {
    const next = selectedQuals.includes(q)
      ? selectedQuals.filter((item) => item !== q)
      : [...selectedQuals, q];
    onChange({
      ...filters,
      qualifications: next,
      qualification: next.length === 1 ? next[0] : (next.length === 0 ? 'all' : undefined),
    });
  };

  const selectAllQualifications = () => {
    onChange({
      ...filters,
      qualifications: [...MASTER_QUALIFICATIONS],
      qualification: undefined,
    });
  };

  const clearQualifications = () => {
    onChange({
      ...filters,
      qualifications: [],
      qualification: 'all',
    });
  };

  const activeCount = getActiveFilterCount(filters);

  const handleReset = () => {
    onChange({
      shiftNumber: 'all',
      category: 'all',
      gender: 'all',
      qualification: 'all',
      qualifications: [],
      stream: 'all',
      postPreference: 'all',
      searchQuery: '',
      scoreMin: '',
      scoreMax: '',
      contractStatus: 'all',
      exServiceman: 'all',
      shiftSlot: 'all',
    });
  };

  const setScorePreset = (min?: number, max?: number) => {
    onChange({
      ...filters,
      scoreMin: min !== undefined ? min : '',
      scoreMax: max !== undefined ? max : '',
    });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4 mb-6 transition-colors">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800 text-xs">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-200 font-semibold">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Filter className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold text-slate-900 dark:text-white">{title}</span>
          {totalFilteredCount !== undefined && totalCount !== undefined && (
            <span className="text-slate-500 dark:text-slate-400 text-xs font-normal">
              · परिणाम: <strong className="text-slate-900 dark:text-white font-mono">{totalFilteredCount}</strong> / {totalCount} अभ्यर्थी
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* PDF Export trigger if provided (e.g. for Admin) */}
          {onExportPdf && (
            <button
              onClick={onExportPdf}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-xs transition-colors cursor-pointer"
              title="फ़िल्टर किया हुआ डेटा PDF में डाउनलोड या प्रिंट करें"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>PDF डाउनलोड / प्रिंट</span>
            </button>
          )}

          {/* Advance Filter Toggle Button */}
          <button
            onClick={() => setIsAdvanceOpen(!isAdvanceOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
              isAdvanceOpen || activeCount > 0
                ? 'bg-amber-500/15 border-amber-500 text-amber-800 dark:text-amber-300 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>एडवांस्ड फ़िल्टर (Advance)</span>
            {activeCount > 0 && (
              <span className="w-4 h-4 rounded-full bg-amber-500 text-slate-950 text-[10px] font-extrabold flex items-center justify-center">
                {activeCount}
              </span>
            )}
            {isAdvanceOpen ? <ChevronUp className="w-3.5 h-3.5 ml-0.5" /> : <ChevronDown className="w-3.5 h-3.5 ml-0.5" />}
          </button>

          {activeCount > 0 && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors cursor-pointer text-xs font-medium"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>रीसेट करें</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 1: Primary Common Filters (Now with Multi-Qualification Selector) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Search Input */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
            खोजें (नाम / रोल नंबर)
          </label>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-slate-400 dark:text-slate-500" />
            <input
              type="text"
              placeholder="नाम या रोल दर्ज करें..."
              value={filters.searchQuery || ''}
              onChange={(e) => onChange({ ...filters, searchQuery: e.target.value })}
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
            {filters.searchQuery && (
              <button
                onClick={() => onChange({ ...filters, searchQuery: '' })}
                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-3 h-3" />
              </button>
            )}
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
                  {c === 'UR'
                    ? 'UR (अनारक्षित / Open)'
                    : c === 'PWD'
                    ? 'PWD (दिव्यांग जन)'
                    : `${c} श्रेणी`}
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

        {/* Stream Filter */}
        <div>
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
            विषय / संकाय स्ट्रीम (Stream)
          </label>
          <select
            value={filters.stream || 'all'}
            onChange={(e) => onChange({ ...filters, stream: e.target.value })}
            className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
          >
            <option value="all">सभी स्ट्रीम (All Streams)</option>
            {STREAM_DEFINITIONS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.icon} {s.shortName}
              </option>
            ))}
          </select>
        </div>

        {/* Multi-Qualification Selector Trigger */}
        <div className="relative">
          <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 flex items-center justify-between">
            <span className="truncate">विशिष्ट शैक्षणिक योग्यता (Rulebook)</span>
            {selectedQuals.length > 0 && (
              <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 font-mono">
                {selectedQuals.length}
              </span>
            )}
          </label>
          <button
            type="button"
            onClick={() => setIsQualPickerOpen(!isQualPickerOpen)}
            className={`w-full flex items-center justify-between gap-1 px-2.5 py-1.5 rounded-lg border text-xs text-left transition-colors cursor-pointer ${
              selectedQuals.length > 0
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-950 dark:text-amber-200 font-semibold'
                : 'bg-slate-50 dark:bg-slate-950 border-slate-300 dark:border-slate-800 text-slate-900 dark:text-white hover:border-slate-400'
            }`}
          >
            <span className="truncate">
              {selectedQuals.length === 0
                ? 'सभी योग्यताएं (All Qualifications)'
                : `${selectedQuals.length} योग्यताएं (Multi)`}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          </button>

          {/* Quick Floating Multi-Select Panel */}
          {isQualPickerOpen && (
            <div className="absolute right-0 top-full mt-1.5 z-40 w-80 sm:w-96 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl p-3 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-900 dark:text-white">
                  36 आधिकारिक योग्यताएं (Multi-Select)
                </span>
                <div className="flex items-center gap-2">
                  {selectedQuals.length > 0 && (
                    <button
                      type="button"
                      onClick={clearQualifications}
                      className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                    >
                      हटाएं
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={selectAllQualifications}
                    className="text-[11px] text-amber-600 hover:underline cursor-pointer"
                  >
                    सभी चुनें
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsQualPickerOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="योग्यता खोजें (CPCT, B.Com, Steno, BCA...)..."
                  value={qualSearch}
                  onChange={(e) => setQualSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-2 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Checkboxes List */}
              <div className="max-h-56 overflow-y-auto space-y-1 p-1 bg-slate-50/70 dark:bg-slate-950/70 rounded-lg border border-slate-200 dark:border-slate-800">
                {MASTER_QUALIFICATIONS.filter((q) =>
                  !qualSearch.trim() || q.toLowerCase().includes(qualSearch.toLowerCase().trim())
                ).map((q) => {
                  const isChecked = selectedQuals.includes(q);
                  return (
                    <label
                      key={q}
                      className={`flex items-start gap-2 p-1.5 rounded-md text-xs cursor-pointer ${
                        isChecked
                          ? 'bg-amber-500/15 text-amber-950 dark:text-amber-200 font-medium'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleQualification(q)}
                        className="mt-0.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 shrink-0"
                      />
                      <span className="leading-tight text-[11px]">{q}</span>
                    </label>
                  );
                })}
              </div>

              <div className="text-[10px] text-slate-500 text-center pt-1 border-t border-slate-100 dark:border-slate-800">
                चयनित: <strong>{selectedQuals.length}</strong> योग्यताएं · चुने गए किसी भी योग्यता वाले अभ्यर्थी दिखाई देंगे
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Advance Filter Drawer Panel */}
      {isAdvanceOpen && (
        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 p-4 sm:p-5 rounded-b-2xl space-y-4 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-500" />
              एडवांस्ड फ़िल्टरिंग विकल्प (Multi-criteria Deep Filter)
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              एक साथ कई शर्तों के आधार पर सटीक डेटा फ़िल्टर करें
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 1. Score Range */}
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                <span>रॉ मार्क्स रेंज (Raw Score Range)</span>
                <span className="text-[10px] text-slate-400 font-mono">0–200</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="Min अंक"
                  value={filters.scoreMin !== undefined ? filters.scoreMin : ''}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      scoreMin: e.target.value === '' ? '' : parseFloat(e.target.value),
                    })
                  }
                  className="w-1/2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
                />
                <span className="text-slate-400 text-xs">से</span>
                <input
                  type="number"
                  placeholder="Max अंक"
                  value={filters.scoreMax !== undefined ? filters.scoreMax : ''}
                  onChange={(e) =>
                    onChange({
                      ...filters,
                      scoreMax: e.target.value === '' ? '' : parseFloat(e.target.value),
                    })
                  }
                  className="w-1/2 bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-900 dark:text-white font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Quick Score Presets */}
              <div className="flex flex-wrap items-center gap-1 pt-1">
                <span className="text-[10px] text-slate-400 w-full">त्वरित चयन:</span>
                {[
                  { label: '160+', min: 160, max: undefined },
                  { label: '140–160', min: 140, max: 160 },
                  { label: '120–140', min: 120, max: 140 },
                  { label: '< 120', min: undefined, max: 120 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => setScorePreset(preset.min, preset.max)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-mono transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Special Quotas: Samvidha (Contract) & Ex-Serviceman */}
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                विशेष आरक्षण कोटा (Special Quotas)
              </label>

              {/* Samvidha */}
              <div>
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                  संविदा कर्मचारी (20% कोटा):
                </span>
                <div className="flex items-center gap-1.5 text-xs">
                  {[
                    { label: 'सभी', value: 'all' },
                    { label: 'हाँ (संविदा)', value: true },
                    { label: 'नहीं (खुला)', value: false },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => onChange({ ...filters, contractStatus: opt.value as any })}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        (opt.value === 'all' && (filters.contractStatus === 'all' || filters.contractStatus === undefined)) ||
                        filters.contractStatus === opt.value
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Ex-Serviceman */}
              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <span className="block text-[10px] text-slate-500 dark:text-slate-400 mb-1">
                  भूतपूर्व सैनिक (Ex-Servicemen):
                </span>
                <div className="flex items-center gap-1.5 text-xs">
                  {[
                    { label: 'सभी', value: 'all' },
                    { label: 'हाँ (Ex-SM)', value: true },
                    { label: 'नहीं', value: false },
                  ].map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => onChange({ ...filters, exServiceman: opt.value as any })}
                      className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                        (opt.value === 'all' && (filters.exServiceman === 'all' || filters.exServiceman === undefined)) ||
                        filters.exServiceman === opt.value
                          ? 'bg-amber-500 text-slate-950 font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* 3. Shift Slot (Morning vs Afternoon) */}
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                शिफ्ट समय स्लॉट (Shift Slot Timing)
              </label>
              <div className="space-y-1.5">
                {[
                  { label: 'सभी स्लॉट (All Slots)', value: 'all', desc: 'सुबह व दोपहर दोनों' },
                  { label: 'प्रातः कालीन (Morning Slot)', value: 'Morning', desc: '09:00 AM – 12:00 PM' },
                  { label: 'दोपहर कालीन (Afternoon Slot)', value: 'Afternoon', desc: '02:30 PM – 05:30 PM' },
                ].map((slot) => (
                  <button
                    key={slot.label}
                    type="button"
                    onClick={() => onChange({ ...filters, shiftSlot: slot.value as any })}
                    className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                      (slot.value === 'all' && (filters.shiftSlot === 'all' || !filters.shiftSlot)) ||
                      filters.shiftSlot === slot.value
                        ? 'bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{slot.label}</span>
                    <span className="text-[10px] text-slate-400">{slot.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 4. Multi-Qualification Selector */}
            <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2.5 col-span-1 sm:col-span-2 lg:col-span-4">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    विशिष्ट शैक्षणिक योग्यताएं (Multi-select Qualifications)
                  </label>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400">
                    नोटिफिकेशन की आधिकारिक शैक्षणिक योग्यताओं में से एक या एक से अधिक योग्यताएं चुनें:
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-bold">
                    {selectedQuals.length} चुनी गईं
                  </span>
                  {selectedQuals.length > 0 && (
                    <button
                      type="button"
                      onClick={clearQualifications}
                      className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
                    >
                      सभी हटाएं
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={selectAllQualifications}
                    className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
                  >
                    सभी चुनें
                  </button>
                </div>
              </div>

              {/* Search box for qualifications */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="योग्यता खोजें (जैसे: B.Com, CPCT, BCA, B.Sc., कला, स्टेनो)..."
                  value={qualSearch}
                  onChange={(e) => setQualSearch(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-amber-500"
                />
                {qualSearch && (
                  <button
                    type="button"
                    onClick={() => setQualSearch('')}
                    className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Scrollable list of qualification checkboxes */}
              <div className="max-h-52 overflow-y-auto space-y-1 p-1.5 bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200/80 dark:border-slate-800">
                {MASTER_QUALIFICATIONS.filter((q) =>
                  !qualSearch.trim() || q.toLowerCase().includes(qualSearch.toLowerCase().trim())
                ).map((q) => {
                  const isChecked = selectedQuals.includes(q);
                  return (
                    <label
                      key={q}
                      className={`flex items-start gap-2 p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-amber-500/15 text-amber-950 dark:text-amber-200 font-medium'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleQualification(q)}
                        className="mt-0.5 rounded border-slate-300 text-amber-500 focus:ring-amber-500 shrink-0"
                      />
                      <span className="leading-tight text-[11px]">{q}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active Filter Chips / Badges */}
      {activeCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mr-1">
            सक्रिय फ़िल्टर ({activeCount}):
          </span>

          {filters.searchQuery && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px]">
              खोज: "{filters.searchQuery}"
              <button onClick={() => onChange({ ...filters, searchQuery: '' })} className="hover:text-amber-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.shiftNumber && filters.shiftNumber !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px]">
              Shift {filters.shiftNumber}
              <button onClick={() => onChange({ ...filters, shiftNumber: 'all' })} className="hover:text-slate-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.category && filters.category !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px]">
              श्रेणी: {filters.category}
              <button onClick={() => onChange({ ...filters, category: 'all' })} className="hover:text-slate-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.gender && filters.gender !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px]">
              लिंग: {filters.gender === 'Male' ? 'पुरुष' : 'महिला'}
              <button onClick={() => onChange({ ...filters, gender: 'all' })} className="hover:text-slate-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.stream && filters.stream !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px]">
              स्ट्रीम: {STREAM_DEFINITIONS.find((s) => s.id === filters.stream)?.shortName || filters.stream}
              <button onClick={() => onChange({ ...filters, stream: 'all' })} className="hover:text-slate-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.contractStatus !== undefined && filters.contractStatus !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950/40 text-cyan-800 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800 text-[11px]">
              संविदा: {filters.contractStatus ? 'हाँ' : 'नहीं'}
              <button onClick={() => onChange({ ...filters, contractStatus: 'all' })} className="hover:text-cyan-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.exServiceman !== undefined && filters.exServiceman !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800 text-[11px]">
              भूतपूर्व सैनिक: {filters.exServiceman ? 'हाँ' : 'नहीं'}
              <button onClick={() => onChange({ ...filters, exServiceman: 'all' })} className="hover:text-indigo-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {filters.shiftSlot && filters.shiftSlot !== 'all' && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px]">
              स्लॉट: {filters.shiftSlot === 'Morning' ? 'प्रातः' : 'दोपहर'}
              <button onClick={() => onChange({ ...filters, shiftSlot: 'all' })} className="hover:text-slate-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {(filters.scoreMin !== '' || filters.scoreMax !== '') && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 text-[11px]">
              स्कोर: {filters.scoreMin !== '' ? filters.scoreMin : '0'} – {filters.scoreMax !== '' ? filters.scoreMax : '200'}
              <button onClick={() => onChange({ ...filters, scoreMin: '', scoreMax: '' })} className="hover:text-amber-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {selectedQuals.map((q) => (
            <span
              key={q}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 text-[11px] truncate max-w-xs"
            >
              योग्यता: {q}
              <button onClick={() => toggleQualification(q)} className="hover:text-slate-900 cursor-pointer">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
