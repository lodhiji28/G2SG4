import React, { useState } from 'react';
import { CandidateRecord, Category, Gender } from '../types';
import { getCandidateRankings } from '../lib/ranking';
import { repository } from '../lib/repository';
import { QUALIFICATION_GROUPS } from '../data/qualifications';
import { profileCompletion } from '../lib/profile';
import { getClaimToken } from '../lib/api';
import { getOwnSubmittedRoll } from '../lib/storage';

import { EXAM_SHIFTS } from '../data/shifts';
import { RawMarksDisclaimer } from './RawMarksDisclaimer';
import { 
  UserCheck, 
  Trophy, 
  Award, 
  Lock, 
  Edit3, 
  Check, 
  Search, 
  ArrowRight,
  Briefcase,
  Share2,
  Calendar,
  Clock,
  AlertCircle,
  Loader2
} from 'lucide-react';

interface MyProfileRankViewProps {
  candidates: CandidateRecord[];
  currentUserRoll: string | null;
  onSelectRoll: (roll: string) => void;
  onNavigateToUpload: () => void;
  /** called after a server write so the leaderboard re-reads the DB */
  onDataChanged?: () => void;
}

export const MyProfileRankView: React.FC<MyProfileRankViewProps> = ({
  candidates,
  currentUserRoll,
  onSelectRoll,
  onNavigateToUpload,
  onDataChanged,
}) => {
  const [searchRollInput, setSearchRollInput] = useState('');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Edit Profile Modal / Section State
  const [isEditing, setIsEditing] = useState(false);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);

  // Find candidate
  const candidate = candidates.find((c) => c.rollNumber === currentUserRoll) || null;

  // Determine ownership (ONLY authentic submitter on this device can edit)
  const ownSubmittedRoll = getOwnSubmittedRoll();
  const hasClaimToken = Boolean(candidate && getClaimToken(candidate.rollNumber));
  const ownsThisRow = Boolean(
    candidate && (
      hasClaimToken ||
      candidate.isSelf ||
      (ownSubmittedRoll && ownSubmittedRoll.trim().toLowerCase() === candidate.rollNumber.trim().toLowerCase() && !repository.databaseConfigured)
    )
  );

  // Editable fields state
  const [editCategory, setEditCategory] = useState<Category>(candidate?.category || 'UR');
  const [editGender, setEditGender] = useState<Gender>(candidate?.gender || 'Male');
  const [editExServiceman, setEditExServiceman] = useState<boolean>(candidate?.exServiceman || false);
  const [editContractStatus, setEditContractStatus] = useState<boolean>(candidate?.contractStatus || false);
  const [editQualifications, setEditQualifications] = useState<string[]>(candidate?.qualifications || []);

  // The card is reused when the selected roll changes (search, leaderboard
  // click), so the edit state must follow the candidate — otherwise the form
  // keeps the previous person's values (blueprint #84 flow).
  React.useEffect(() => {
    setEditCategory(candidate?.category || 'UR');
    setEditGender(candidate?.gender || 'Male');
    setEditExServiceman(candidate?.exServiceman || false);
    setEditContractStatus(candidate?.contractStatus || false);
    setEditQualifications(candidate?.qualifications || []);
    setEditSuccessMessage(null);
    setSaveError(null);
    if (!ownsThisRow) {
      setIsEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate?.rollNumber, ownsThisRow]);

  // Handle Search Roll Number
  const handleSearchRoll = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError(null);
    const trimmed = searchRollInput.trim();
    if (!trimmed) return;
    const found = candidates.find((c) => c.rollNumber.toLowerCase() === trimmed.toLowerCase());
    if (found) {
      onSelectRoll(found.rollNumber);
      setSearchRollInput('');
    } else {
      setSearchError('यह रोल नंबर डेटासेट में नहीं मिला। कृपया पहले अपनी उत्तर कुंजी पेस्ट करें।');
    }
  };

  const startEdit = () => {
    if (!candidate || !ownsThisRow) return;
    setEditCategory(candidate.category);
    setEditGender(candidate.gender);
    setEditExServiceman(candidate.exServiceman || false);
    setEditContractStatus(candidate.contractStatus || false);
    setEditQualifications(candidate.qualifications || []);
    setIsEditing(true);
    setEditSuccessMessage(null);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!candidate || !ownsThisRow) {
      setSaveError('अनाधिकृत: आप केवल अपनी ही प्रोफ़ाइल संपादित कर सकते हैं। अन्य अभ्यर्थियों के रिकॉर्ड सुरक्षित हैं।');
      return;
    }
    setSaving(true);
    setSaveError(null);

    void (async () => {
      const res = await repository.updateProfile(candidate.rollNumber, {
        category: editCategory,
        gender: editGender,
        exServiceman: editExServiceman,
        contractStatus: editContractStatus,
        qualifications: editQualifications,
      });
      setSaving(false);
      if (res.success) {
        setEditSuccessMessage(
          res.synced
            ? 'प्रोफ़ाइल अपडेट हो गई है (लाइव डेटाबेस में सहेजी गई)।'
            : 'प्रोफ़ाइल इस डिवाइस पर अपडेट हो गई; डेटाबेस से जुड़ते ही सिंक हो जाएगी।'
        );
        setIsEditing(false);
        onDataChanged?.();
      } else {
        setSaveError(res.error || 'अपडेट सहेजा नहीं जा सका।');
      }
    })();
  };

  /** E-mail the analysis report to the candidate (uses the configured provider). */

  const toggleEditQualification = (qual: string) => {
    if (editQualifications.includes(qual)) {
      setEditQualifications(editQualifications.filter((q) => q !== qual));
    } else {
      setEditQualifications([...editQualifications, qual]);
    }
  };

  // If no candidate selected
  if (!candidate) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 text-center py-12 pb-16 transition-colors">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
          <UserCheck className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">मेरी रैंक व व्यक्तिगत विश्लेषण</h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            अपनी रैंक, शिफ्ट रैंक, कैटेगरी रैंक तथा पद योग्यता वार विश्लेषण देखने के लिए अपनी उत्तर कुंजी पेस्ट करें अथवा रोल नंबर खोजें।
          </p>
        </div>

        {/* Search by Roll Number */}
        <form onSubmit={handleSearchRoll} className="flex gap-2 max-w-md mx-auto">
          <input
            type="text"
            placeholder="अपना रोल नंबर दर्ज करें (उदा. 22049001)..."
            value={searchRollInput}
            onChange={(e) => setSearchRollInput(e.target.value)}
            className="flex-1 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl px-4 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer border border-transparent shadow-xs"
          >
            खोजें
          </button>
        </form>

        {searchError && (
          <p className="text-xs text-rose-600 dark:text-rose-400">{searchError}</p>
        )}

        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onNavigateToUpload}
            className="px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer flex items-center gap-2"
          >
            <span>अपनी उत्तर कुंजी पेस्ट करें</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // Calculate ranks
  const ranking = getCandidateRankings(candidates, candidate.rollNumber);
  const shiftInfo = EXAM_SHIFTS.find((s) => s.shiftNumber === candidate.shiftNumber);

  return (
    <div className="space-y-6 pb-16 transition-colors">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-amber-500" />
            <span>व्यक्तिगत स्कोर व रैंक कार्ड (Candidate Profile)</span>
          </h1>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-2">
            <span>रोल नंबर: <strong className="font-mono text-slate-900 dark:text-white">{candidate.rollNumber}</strong></span>
            <span>·</span>
            <span>
              परीक्षा शिफ्ट: <strong className="text-slate-900 dark:text-white">Shift {candidate.shiftNumber}</strong> ({shiftInfo ? `${shiftInfo.displayDate} · ${shiftInfo.timeLabel}` : candidate.examDate})
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {ownsThisRow ? (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 transition-colors cursor-pointer shadow-xs"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>प्रोफ़ाइल संपादित करें (Edit Profile)</span>
            </button>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {ownSubmittedRoll && ownSubmittedRoll.trim().toLowerCase() !== candidate.rollNumber.trim().toLowerCase() && (
                <button
                  onClick={() => onSelectRoll(ownSubmittedRoll)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold text-slate-950 transition-colors cursor-pointer shadow-xs"
                  title="अपनी रैंक कार्ड पर वापस जाएं"
                >
                  <UserCheck className="w-3.5 h-3.5" />
                  <span>← मेरी अपनी रैंक देखें</span>
                </button>
              )}
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-medium border border-slate-200 dark:border-slate-700 shadow-xs">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>केवल पढ़ने हेतु (Read-Only Public View)</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <RawMarksDisclaimer />

      {editSuccessMessage && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          <span>{editSuccessMessage}</span>
        </div>
      )}

      {/* Candidate Score Hero Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-slate-100 dark:border-slate-800">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {candidate.candidateNamePrivate || candidate.candidateNamePublic}
              </h2>
              {ownsThisRow ? (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-600" />
                  आपकी अपनी प्रोफ़ाइल (Verified Owner)
                </span>
              ) : (
                <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-500" />
                  सार्वजनिक दृश्य (अन्य अभ्यर्थी — सुरक्षित)
                </span>
              )}
              {candidate.exServiceman && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300 border border-blue-200 dark:border-blue-500/20">
                  भूतपूर्व सैनिक
                </span>
              )}
              {candidate.contractStatus && (
                <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300 border border-purple-200 dark:border-purple-500/20">
                  संविदा कर्मी
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono">Roll: {candidate.rollNumber}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                <span>{shiftInfo?.displayDate || candidate.examDate}</span>
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Shift {candidate.shiftNumber} ({shiftInfo?.timeLabel || ''})</span>
              </span>
            </div>
          </div>

          {/* Big Score Display */}
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
                कच्चे अंक (Raw Score)
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-3xl sm:text-4xl font-black font-mono text-amber-600 dark:text-amber-400 tabular-nums">
                  {candidate.rawScore}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">/ 200</span>
              </div>
            </div>
            <div className="h-10 w-px bg-slate-200 dark:bg-slate-800" />
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
                सटीकता (Accuracy)
              </span>
              <span className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
                {candidate.accuracy}%
              </span>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">कुल प्रश्न (Total)</span>
            <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">{candidate.totalQuestions}</span>
          </div>
          <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/20 rounded-xl border border-emerald-200 dark:border-emerald-500/20">
            <span className="text-[11px] text-emerald-700 dark:text-emerald-400 block font-medium">सही उत्तर (+1.0)</span>
            <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{candidate.correct}</span>
          </div>
          <div className="p-3 bg-rose-50/60 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-500/20">
            <span className="text-[11px] text-rose-700 dark:text-rose-400 block font-medium">गलत उत्तर (-0.25)</span>
            <span className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400">{candidate.wrong}</span>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">अनुत्तरित (Unattempted)</span>
            <span className="text-lg font-bold font-mono text-slate-700 dark:text-slate-300">{candidate.unattempted}</span>
          </div>
        </div>
      </div>

      {/* Profile completion (blueprint #40/#41) — the three editable fields */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">प्रोफ़ाइल पूर्णता</h2>
          {ownsThisRow && (
            <button
              onClick={() => setIsEditing(true)}
              className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              संपादित करें
            </button>
          )}
        </div>

        {(() => {
          const pct = profileCompletion(candidate);
          return (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
                <span>Profile Completion</span>
                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{pct.percent}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${pct.percent >= 90 ? 'bg-emerald-500' : pct.percent >= 50 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${pct.percent}%` }}
                />
              </div>
              {pct.missing.length > 0 && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  बाकी: {pct.missing.join(' · ')} — भरने पर category/qualification/post-वार तुलना में आपकी पंक्ति जुड़ेगी।
                  {pct.percent < 100 && ' (Answer key submit हो चुकी है; record valid है और overall rank में शामिल है।)'}
                </p>
              )}
            </div>
          );
        })()}

      </div>

      {/* Own-record tools (blueprint #43: no self-service delete) */}
      {ownsThisRow && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-500" />
            <span>आपकी प्रविष्टि (केवल इसी डिवाइस से प्रबंधित)</span>
          </h2>

          <div className="text-xs">
            <div className="space-y-1.5">
              <span className="block font-semibold text-slate-700 dark:text-slate-300">प्रविष्टि में गलती?</span>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                रोल नंबर, शिफ्ट या सही/गलत संख्याएँ गलत दर्ज हुई हैं? नियम के अनुसार उम्मीदवार स्वयं प्रविष्टि नहीं
                मिटा सकते — इससे तुलनाएँ बिगड़ती हैं। <b>रॉ स्कोर व शिफ्ट सदा अपरिवर्तनीय</b> रहते हैं; श्रेणी/लिंग/
                योग्यता आप नीचे स्वयं सुधार सकते हैं। संख्याएँ ही गलत हों तो संचालक को अपना रोल नंबर, शिफ्ट और पेज पर छपी सही/गलत संख्याएँ बताकर
                जानकारी दें — वे प्रशासक पैनल से सुधार/हटाएँगे।
              </p>
            </div>
          </div>

          {saveError && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {saveError}
            </p>
          )}
        </div>
      )}

      {/* Saving indicator */}
      {saving && (
        <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> डेटाबेस में सहेजा जा रहा है…
        </p>
      )}

      {/* Ranks & Cohort Position Cards */}
      {ranking && (
        <div className="space-y-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-500" />
            <span>आपकी रैंक स्थिति (Competitive Cohort Rankings)</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            {/* Overall Rank */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">समग्र रैंक (Overall Rank)</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400">
                  #{ranking.overallRank}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                  / {ranking.totalCandidates}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                शीर्ष <strong>{ranking.topPercentage}%</strong> उम्मीदवारों में
              </p>
            </div>

            {/* Category Rank */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
                कैटेगरी रैंक ({candidate.category} Rank)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                  #{ranking.categoryRank}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                  / {ranking.totalCategoryCandidates}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {candidate.category} श्रेणी के प्रतिस्पर्धियों में
              </p>
            </div>

            {/* Shift Rank */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
                शिफ्ट रैंक (Shift {candidate.shiftNumber})
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                  #{ranking.shiftRank}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                  / {ranking.totalShiftCandidates}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                {shiftInfo?.displayDate || candidate.examDate}
              </p>
            </div>

            {/* Gender Rank */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs">
              <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">
                लिंग रैंक ({candidate.gender} Rank)
              </span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-2xl font-bold font-mono text-purple-600 dark:text-purple-400">
                  #{ranking.genderRank}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                  / {ranking.totalGenderCandidates}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {candidate.gender} उम्मीदवारों के मध्य
              </p>
            </div>
          </div>

          {/* Qualification Specific Ranks */}
          {ranking.qualificationRanks && ranking.qualificationRanks.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3 shadow-xs">
              <div className="flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  योग्यता वार रैंक स्थिति (Qualification-wise Competitive Standing)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {ranking.qualificationRanks.map((qr) => (
                  <div
                    key={qr.qualification}
                    className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                  >
                    <div className="text-slate-600 dark:text-slate-400 font-medium truncate mb-1">
                      {qr.qualification}
                    </div>
                    <div className="flex items-baseline gap-1">
                      <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                        #{qr.rank}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">/ {qr.total} पात्र अभ्यर्थी</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Profile Edit Modal (Only accessible to authentic owner) */}
      {isEditing && ownsThisRow && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-xl w-full p-6 max-h-[90vh] overflow-y-auto space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">प्रोफ़ाइल संपादित करें (Edit Profile)</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  श्रेणी व योग्यताएं संशोधित करें · रोल नंबर एवं परीक्षा अंक अपरिवर्तनीय हैं
                </p>
              </div>
              <button
                onClick={() => setIsEditing(false)}
                className="text-slate-600 dark:text-slate-400 hover:text-black dark:hover:text-white text-xs px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 cursor-pointer"
              >
                बंद करें
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">श्रेणी (Category)</label>
                  <select
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value as Category)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white font-medium"
                  >
                    <option value="UR">UR (अनारक्षित / Open)</option>
                    <option value="OBC">OBC (अन्य पिछड़ा वर्ग)</option>
                    <option value="SC">SC (अनुसूचित जाति)</option>
                    <option value="ST">ST (अनुसूचित जनजाति)</option>
                    <option value="EWS">EWS (आर्थिक रूप से कमजोर)</option>
                    <option value="PWD">PWD (दिव्यांग / दिव्यांगजन)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">लिंग (Gender)</label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value as Gender)}
                    className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white font-medium"
                  >
                    <option value="Male">पुरुष (Male)</option>
                    <option value="Female">महिला (Female)</option>
                    <option value="Other">अन्य (Other)</option>
                  </select>
                </div>
              </div>

              {/* Quota checkboxes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editContractStatus}
                    onChange={(e) => setEditContractStatus(e.target.checked)}
                    className="rounded border-slate-400 dark:border-slate-700 text-amber-500"
                  />
                  <span>संविदा कर्मचारी (Samvidha - 20% कोटा)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editExServiceman}
                    onChange={(e) => setEditExServiceman(e.target.checked)}
                    className="rounded border-slate-400 dark:border-slate-700 text-amber-500"
                  />
                  <span>भूतपूर्व सैनिक (Ex-Serviceman कोटा)</span>
                </label>
              </div>

              {/* Qualifications */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    शैक्षणिक योग्यताएं · {editQualifications.length} चुनी
                  </label>
                  <div className="flex gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setEditQualifications(QUALIFICATION_GROUPS.flatMap((g) => g.items))}
                      className="text-amber-700 dark:text-amber-400 font-semibold hover:underline"
                    >
                      सभी चुनें
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditQualifications([])}
                      className="text-slate-500 hover:underline"
                    >
                      हटाएं
                    </button>
                  </div>
                </div>
                <div className="max-h-56 space-y-2.5 overflow-y-auto p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  {QUALIFICATION_GROUPS.map((group) => (
                    <div key={group.id}>
                      <div className="mb-1 text-[10.5px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        {group.label}
                      </div>
                      <div className="grid grid-cols-1 gap-1">
                        {group.items.map((q) => (
                          <label
                            key={q}
                            className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={editQualifications.includes(q)}
                              onChange={() => toggleEditQualification(q)}
                              className="rounded border-slate-400 dark:border-slate-700 text-amber-500"
                            />
                            <span>{q}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                  ये केवल लीडरबोर्ड फ़िल्टर के लिए टैग हैं — पद की असली योग्यता नियम पुस्तिका से जाँचें।
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:text-white cursor-pointer"
                >
                  रद्द करें
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer shadow-xs"
                >
                  अपडेट सुरक्षित करें
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
