/**
 * The one and only input path of this app.
 *
 *   ESB response-sheet page  →  Select all (Ctrl+A / long-press → Select all)
 *                          →  Copy        →  paste into the box below
 *
 * Nothing is uploaded anywhere. The pasted text is read in the browser, turned
 * into (roll · name · date · shift · right · wrong) and only *those numbers* are
 * sent to the server. The paste itself is never transmitted, never written to
 * disk and never kept after the page is closed — which is why this file has no
 * fetch() of raw content and no localStorage write of `rawText`.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnswerKeyParser } from '../lib/parser';
import { calculateRawScore } from '../lib/scoring';
import { repository } from '../lib/repository';
import type { RankBlock } from '../lib/api';
import { EXAM_SHIFTS, getShiftByNumber } from '../data/shifts';
import { MASTER_QUALIFICATIONS, QUALIFICATION_GROUPS } from '../data/qualifications';
import { Category, Gender, ParsedAnswerKeyData, CandidateRecord } from '../types';
import {
  AlertCircle,
  CheckCircle2,
  Clipboard,
  Eye,
  EyeOff,
  Info,
  ListChecks,
  Loader2,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';

interface Props {
  onSubmissionSuccess: (rollNumber: string) => void;
  /** rolls already stored — used to warn before a wasted submit */
  knownRolls?: string[];
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'UR', label: 'UR (अनारक्षित)' },
  { value: 'EWS', label: 'EWS' },
  { value: 'OBC', label: 'OBC / अन्य पिछड़ा वर्ग' },
  { value: 'SC', label: 'SC / अनुसूचित जाति' },
  { value: 'ST', label: 'ST / अनुसूचित जनजाति' },
];

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'Male', label: 'पुरुष (Male)' },
  { value: 'Female', label: 'महिला (Female)' },
  { value: 'Other', label: 'अन्य' },
];

/** Rough sanity floor: a real response sheet always carries a few thousand chars. */
const MIN_PASTE_CHARS = 200;

const key = (v?: string) => (v || '').trim().toUpperCase().replace(/\s+/g, '');

export const PasteAnswerKeyView: React.FC<Props> = ({ onSubmissionSuccess, knownRolls = [] }) => {
  const parserRef = useRef(new AnswerKeyParser());
  const [rawText, setRawText] = useState('');
  const [parsed, setParsed] = useState<ParsedAnswerKeyData | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [saved, setSaved] = useState<{ rank: RankBlock | null; message?: string } | null>(null);

  // fields the candidate can correct / set
  const [editShift, setEditShift] = useState<number>(1);
  const [editCorrect, setEditCorrect] = useState<number>(0);
  const [editWrong, setEditWrong] = useState<number>(0);
  const [editTotal, setEditTotal] = useState<number>(200);
  const [category, setCategory] = useState<Category>('UR');
  const [gender, setGender] = useState<Gender>('Male');
  const [qualifications, setQualifications] = useState<string[]>([]);
  const [qualQuery, setQualQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const parseCacheRef = useRef<{ sig: string; out: ParsedAnswerKeyData; ms: number } | null>(null);
  const [parseMs, setParseMs] = useState<number | null>(null);
  const known = useMemo(() => new Set(knownRolls.map(key)), [knownRolls]);

  const applyParse = (out: ParsedAnswerKeyData) => {
    setParsed(out);
    setEditShift(out.shiftNumber || 1);
    setEditCorrect(out.correct);
    setEditWrong(out.wrong);
    setEditTotal(out.totalQuestions || 200);
    const rollKey = key(out.rollNumber);
    setAlreadySaved(Boolean(rollKey && known.has(rollKey)));
  };

  const analyze = useCallback((text: string) => {
    setError(null);
    setSubmitError(null);
    setAlreadySaved(false);
    setSaved(null);
    if (!text.trim()) {
      setParsed(null);
      setError('पेस्ट बॉक्स खाली है — पहले ESB पेज की पूरी कॉपी यहाँ पेस्ट करें।');
      return;
    }
    if (text.trim().length < MIN_PASTE_CHARS) {
      setParsed(null);
      setError(
        `पेस्ट की गई सामग्री बहुत छोटी है (${text.trim().length} अक्षर)। ESB पेज पर पूरा सेलेक्ट (Ctrl+A / सभी चुनें) करके दोबारा कॉपी करें — उत्तरों की तालिका भी शामिल होनी चाहिए।`
      );
      return;
    }
    setBusy(true);

    /*
     * Instant by design. Reading a 50 kB sheet takes tens of milliseconds, but a
     * second press of "पहचानें" — or a re-render after a tab switch — must never
     * repeat it: the result is memoised on a cheap signature (length + head + tail
     * + block count) instead of the whole string. The work is also deferred one
     * frame so the spinner paints, which matters most on a budget phone.
     */
    const sig = `${text.length}:${text.slice(0, 120)}:${text.slice(-120)}:${(text.match(/Answer\s*Given/gi) || []).length}`;
    const cached = parseCacheRef.current;
    if (cached && cached.sig === sig) {
      applyParse(cached.out);
      setParseMs(cached.ms);
      setBusy(false);
      return;
    }

    // Parsing is synchronous but heavy on a 50 kB sheet; let the spinner paint first.
    window.setTimeout(() => {
      try {
        const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const out = parserRef.current.parse(text, 'pasted-from-esb');
        const ms = Math.round((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0);
        parseCacheRef.current = { sig, out, ms };
        setParseMs(ms);
        if (out.confidence === 'FAILED' || !out.totalQuestions) {
          setParsed(null);
          setError(
            'इस सामग्री से उत्तरों की तालिका पढ़ी नहीं जा सकी। आमतौर पर इसका मतलब है कि केवल आधा पेज कॉपी हुआ है — ' +
              'पेज पर वापस जाकर Ctrl+A (लैपटॉप) या "सभी चुनें" (मोबाइल) से पूरी कॉपी दोबारा पेस्ट करें। ' +
              'पूरा पेज संभव न हो तो पेज पर छपी सारांश पंक्ति (जैसे "Correct 162 / Wrong 34 / Unattempted 4") साथ में पेस्ट कर दें — वही भी पढ़ ली जाती है।'
          );
          return;
        }
        applyParse(out);
      } catch (e) {
        setParsed(null);
        setError(`पेस्ट पढ़ते समय समस्या आई: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    }, 20);
  }, [known]);

  // A plain Ctrl+V inside the box is enough — no extra button press needed.
  const onPasteEvent = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text.trim().length > MIN_PASTE_CHARS) {
      e.preventDefault();
      setRawText(text);
      analyze(text);
    }
  };

  const pasteFromClipboard = async () => {
    setError(null);
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) {
        setError('क्लिपबोर्ड खाली मिला — ESB पेज पर कॉपी (Ctrl+C) करने के बाद यह बटन दबाएँ।');
        return;
      }
      setRawText(text);
      analyze(text);
    } catch {
      setError(
        'यह ब्राउज़र सीधे क्लिपबोर्ड नहीं पढ़ पा रहा (फ़ायरफ़ॉक्स/मोबाइल में आम बात है) — बॉक्स में क्लिक करके Ctrl+V (लंबे दबाकर → पेस्ट) करें, अपने आप पहचान शुरू हो जाएगी।'
      );
      textareaRef.current?.focus();
    }
  };

  const reset = () => {
    parseCacheRef.current = null;
    setParseMs(null);
    setRawText('');
    setParsed(null);
    setError(null);
    setSubmitError(null);
    setAlreadySaved(false);
    setSaved(null);
    setShowRaw(false);
    textareaRef.current?.focus();
  };

  const score = useMemo(() => calculateRawScore(editCorrect, editWrong, editTotal), [editCorrect, editWrong, editTotal]);
  const shift = getShiftByNumber(editShift);
  const mismatch = parsed ? editCorrect !== parsed.correct || editWrong !== parsed.wrong : false;

  const buildRecord = (): CandidateRecord => {
    const roll = (parsed?.rollNumber || '').trim();
    const name = (parsed?.candidateName || '').trim();
    return {
      id: `local-${key(roll) || Date.now()}`,
      examId: 'mpesb-g2sg4-2026',
      rollNumber: roll,
      candidateNamePrivate: name,
      candidateNamePublic: name ? `${name.slice(0, Math.max(2, name.indexOf(' ') > 0 ? name.indexOf(' ') : 4))}${name.length > 6 ? ' L****' : ''}` : 'छात्र L****',
      examDate: parsed?.examDate || shift?.date || '',
      shiftId: `shift-${String(editShift).padStart(2, '0')}`,
      shiftNumber: editShift,
      totalQuestions: editTotal,
      attempted: score.attempted,
      unattempted: score.unattempted,
      correct: score.correct,
      wrong: score.wrong,
      rawScore: score.rawScore,
      accuracy: score.accuracy,
      category,
      gender,
      qualifications,
      submittedAt: new Date().toISOString(),
      sourceFormat: parsed?.sourceFormat,
      confidence: parsed?.confidence,
      // Deliberately NO fileName / fileBytes / answerPattern / email: only the
      // seven numbers plus category·gender·qualifications ever leave the browser.
    };
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    if (!parsed) return setSubmitError('पहले पेस्ट की गई सामग्री पहचानें (पेस्ट करें / पहचानें बटन)।');
    if (!parsed.rollNumber) return setSubmitError('रोल नंबर पेस्ट में नहीं मिला — कृपया पूरी कॉपी दोबारा पेस्ट करें।');
    if (editCorrect + editWrong > editTotal)
      return setSubmitError(`सही (${editCorrect}) + गलत (${editWrong}) कुल प्रश्नों (${editTotal}) से ज़्यादा नहीं हो सकते।`);

    setSubmitting(true);
    const result = await repository.submit(buildRecord());
    setSubmitting(false);

    if (!result.ok) {
      if (result.duplicate) {
        setAlreadySaved(true);
        setSubmitError(null);
      } else {
        setSubmitError(result.error || 'सबमिशन विफल रहा।');
      }
      return;
    }
    setSaved({ rank: result.rank ?? null, message: result.message });
    onSubmissionSuccess(parsed.rollNumber);
  };

  const toggleQual = (q: string) =>
    setQualifications((list) => (list.includes(q) ? list.filter((x) => x !== q) : [...list, q]));

  const filteredGroups = useMemo(() => {
    const needle = qualQuery.trim().toLowerCase();
    if (!needle) return QUALIFICATION_GROUPS;
    return QUALIFICATION_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.toLowerCase().includes(needle)) })).filter(
      (g) => g.items.length
    );
  }, [qualQuery]);

  useEffect(() => {
    // Ctrl+A on this page must not select the whole app by accident while reading.
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && document.activeElement !== textareaRef.current) {
        textareaRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="space-y-5">
      <HowToPaste />

      <form onSubmit={submit} className="space-y-5">
        {/* ------------------------------------------------------------------ */}
        {/* 1 · paste box                                                      */}
        {/* ------------------------------------------------------------------ */}
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white sm:text-lg">
              <Clipboard className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              1 · यहाँ पेस्ट करें (Paste)
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 dark:text-slate-400">{rawText.length.toLocaleString('en-IN')} अक्षर</span>
              <button
                type="button"
                onClick={pasteFromClipboard}
                className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                क्लिपबोर्ड से लें
              </button>
              {rawText && (
                <button
                  type="button"
                  onClick={reset}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <Trash2 className="h-3.5 w-3.5" /> साफ़
                </button>
              )}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={rawText}
            onChange={(e) => setRawText(e.target.value)}
            onPaste={onPasteEvent}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            placeholder={'इस बॉक्स में क्लिक करें और Ctrl+V दबाएँ (मोबाइल: लंबा दबाकर → पेस्ट)।\n\nपूरा पेज कॉपी करें — Roll Number, नाम, तारीख/शिफ्ट और सारे प्रश्नों की पंक्तियाँ आनी चाहिए।'}
            className="h-40 w-full resize-y rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 sm:text-xs"
          />

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => analyze(rawText)}
              disabled={busy || !rawText.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListChecks className="h-4 w-4" />}
              {busy ? 'पढ़ा जा रहा है…' : 'उत्तर कुंजी पहचानें'}
            </button>
            {rawText.length > 0 && (
              <button
                type="button"
                onClick={() => setShowRaw((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                {showRaw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showRaw ? 'पेस्ट की सामग्री छिपाएँ' : 'पेस्ट की सामग्री देखें'}
              </button>
            )}
            <span className="ml-auto flex items-center gap-3">
              {parseMs !== null && !busy && (
                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                  {parseMs} ms में गिनती तैयार
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <ShieldCheck className="h-3.5 w-3.5" /> पेस्ट की गई सामग्री कहीं अपलोड/सेव नहीं होती
              </span>
            </span>
          </div>

          {showRaw && (
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] leading-snug text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
              {rawText.slice(0, 4000)}
              {rawText.length > 4000 ? `\n… (${rawText.length - 4000} अक्षर और)` : ''}
            </pre>
          )}

          {error && (
            <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </p>
          )}
        </section>

        {/* ------------------------------------------------------------------ */}
        {/* 2 · review                                                         */}
        {/* ------------------------------------------------------------------ */}
        {parsed && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-1 flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white sm:text-lg">
              2 · जाँच लें — यही गिनती सेव होगी
            </h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              जो दिख रहा है वह पेस्ट से पढ़ा गया है। गलत लगे तो नीचे ठीक करें; सब सही हो तो सेव करें।
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="रोल नंबर (Roll Number)">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm font-semibold tracking-wide text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {parsed.rollNumber || '— नहीं मिला —'}
                </div>
              </Field>
              <Field label="नाम (जैसा पेज पर है)">
                <div className="truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {parsed.candidateName || '—'}
                </div>
              </Field>
              <Field label="तारीख (Exam Date)">
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100">
                  {parsed.examDate || 'पेस्ट में नहीं मिली'}
                </div>
              </Field>
              <Field label="शिफ्ट / पारी (Shift)">
                <select
                  value={editShift}
                  onChange={(e) => setEditShift(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {EXAM_SHIFTS.map((s) => (
                    <option key={s.shiftNumber} value={s.shiftNumber}>
                      Shift {s.shiftNumber} · {s.displayDate} · {s.timeLabel}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Num label="सही (Correct)" value={editCorrect} min={0} max={editTotal} onChange={setEditCorrect} tone="ok" />
              <Num label="गलत (Wrong)" value={editWrong} min={0} max={editTotal} onChange={setEditWrong} tone="bad" />
              <Num label="कुल प्रश्न (Total)" value={editTotal} min={1} max={400} onChange={setEditTotal} />
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  स्कोर (स्वतः)
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                  RAW {score.rawScore.toFixed(2)} · {score.accuracy.toFixed(2)}% · अनुत्तीर्ण {score.unattempted}
                </div>
              </div>
            </div>

            {mismatch && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900/50 dark:bg-sky-950/40 dark:text-sky-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                आप ESB पेज पर छपी संख्या सुधार रहे हैं (पेस्ट से {parsed.correct} सही / {parsed.wrong} गलत पढ़ा गया था)। सुधार की गई गिनती ही सेव होगी — यह आपके रैंक कार्ड पर "सुधारित" के रूप में दिखेगा।
              </p>
            )}

            {(parsed.warnings || []).length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {(parsed.warnings || []).map((w, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w}
                  </li>
                ))}
              </ul>
            )}

            {alreadySaved && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                यह रोल नंबर सर्वर पर पहले से सेव है। दोबारा सेव करने की ज़रूरत नहीं — "मेरी रैंक" में जाकर देखें। (गिनती सुधारनी हो तो प्रशासक से संपर्क करें।)
              </p>
            )}
          </section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 3 · profile fields — the only editable ones                        */}
        {/* ------------------------------------------------------------------ */}
        {parsed && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-1 text-base font-bold text-slate-900 dark:text-white sm:text-lg">3 · आपकी जानकारी (केवल यही बदल सकते हैं)</h2>
            <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
              नाम, रोल नंबर, शिफ्ट और गिनती पेज से पढ़े जाते हैं — उन्हें कहीं से नहीं बदला जा सकता।
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="आरक्षण श्रेणी (Category)">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as Category)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="लिंग (Gender)">
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as Gender)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  {GENDERS.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  योग्यताएँ (जितनी चाहें चुनें) · {qualifications.length} चुनी
                </span>
                <label className="relative flex items-center">
                  <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    value={qualQuery}
                    onChange={(e) => setQualQuery(e.target.value)}
                    placeholder="खोजें: B.Com, डिप्लोमा, CPCT…"
                    className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs text-slate-800 outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:w-64"
                  />
                </label>
              </div>

              {qualifications.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {qualifications.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => toggleQual(q)}
                      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
                    >
                      {q}
                      <X className="h-3 w-3" />
                    </button>
                  ))}
                </div>
              )}

              <div className="max-h-64 space-y-3 overflow-auto rounded-xl border border-slate-200 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                {filteredGroups.map((group) => (
                  <div key={group.id}>
                    <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                      {group.label}
                    </div>
                    {group.hint && <div className="mb-1.5 text-[10px] text-slate-500 dark:text-slate-400">{group.hint}</div>}
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((q) => {
                        const on = qualifications.includes(q);
                        return (
                          <button
                            key={q}
                            type="button"
                            onClick={() => toggleQual(q)}
                            aria-pressed={on}
                            className={`rounded-lg border px-2 py-1 text-[11px] transition ${
                              on
                                ? 'border-amber-500 bg-amber-100 font-semibold text-amber-900 dark:bg-amber-500/20 dark:text-amber-100'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                            }`}
                          >
                            {q}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {!filteredGroups.length && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    "{qualQuery}" से कुछ नहीं मिला — {MASTER_QUALIFICATIONS.length} विकल्पों में से खोजें।
                  </p>
                )}
              </div>
              <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                यह सूची केवल लीडरबोर्ड फ़िल्टर के लिए है। पद के लिए असली शैक्षिक योग्यता नियम पुस्तिका से ही जाँचें — यह ऐप पात्रता का दावा नहीं करता।
              </p>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {submitting ? 'सेव हो रहा है…' : 'रैंक के लिए सेव करें'}
              </button>
              {!repository.databaseConfigured && (
                <span className="text-[11px] text-slate-500 dark:text-slate-400">
                  डेटाबेस कॉन्फ़िगर नहीं — फ़िलहाल इसी ब्राउज़र में सेव होगा, सर्वर जुड़ते ही अपने आप भेज दिया जाएगा।
                </span>
              )}
            </div>

            {submitError && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                {submitError}
              </p>
            )}

            {saved && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                {saved.rank
                  ? `सेव हो गया — कुल ${saved.rank.totalCandidates} में से आपकी रैंक #${saved.rank.overallRank} (${saved.rank.percentile.toFixed(2)} percentile)। `
                  : saved.message || 'सेव हो गया। '}
                "मेरी रैंक" टैब में पूरा रैंक कार्ड देखें।
              </p>
            )}
          </section>
        )}
      </form>
    </div>
  );
};

/* ========================================================================== */
/*  small pieces                                                              */
/* ========================================================================== */

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
    {children}
  </label>
);

const Num: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  tone?: 'ok' | 'bad';
  onChange: (v: number) => void;
}> = ({ label, value, min, max, tone, onChange }) => (
  <label className="block">
    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      value={value}
      onChange={(e) => onChange(Math.max(min, Math.min(max, Number(e.target.value) || 0)))}
      className={`w-full rounded-lg border px-3 py-2 text-sm font-bold tabular-nums outline-none focus:ring-2 dark:bg-slate-800 ${
        tone === 'ok'
          ? 'border-emerald-300 bg-emerald-50 text-emerald-900 focus:border-emerald-500 focus:ring-emerald-500/20 dark:bg-emerald-950/30 dark:text-emerald-200'
          : tone === 'bad'
            ? 'border-rose-300 bg-rose-50 text-rose-900 focus:border-rose-500 focus:ring-rose-500/20 dark:bg-rose-950/30 dark:text-rose-200'
            : 'border-slate-300 bg-white text-slate-800 focus:border-amber-500 focus:ring-amber-500/20 dark:border-slate-700 dark:text-slate-100'
      }`}
    />
  </label>
);

/**
 * The three steps, in Hindi and English, right where the eyes land first.
 * Written for a phone as much as for a laptop — most candidates will do this on
 * a mobile browser, where there is no Ctrl+A at all.
 */
const HowToPaste: React.FC = () => {
  const [open, setOpen] = useState(true);
  return (
    <section className="overflow-hidden rounded-2xl border-2 border-amber-400/70 bg-gradient-to-br from-amber-50 to-white shadow-sm dark:border-amber-500/40 dark:from-amber-950/30 dark:to-slate-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-extrabold text-amber-950 dark:text-amber-100 sm:text-base">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-500 text-xs font-black text-white">3</span>
          केवल 3 स्टेप — उत्तर कुंजी पेस्ट करें, रैंक देखें · Just 3 steps
        </span>
        <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-200">{open ? 'छिपाएँ ▲' : 'खोलें ▼'}</span>
      </button>

      {open && (
        <ol className="grid gap-3 px-4 pb-4 sm:grid-cols-3">
          {[
            {
              n: 1,
              hi: 'अपना "Response Sheet / उत्तर कुंजी" पेज खोलें',
              en: 'Open your Response Sheet page on the ESB site',
              tip: 'जिस पेज पर आपके सारे प्रश्न, दिया गया उत्तर और सही उत्तर दिख रहा है।',
            },
            {
              n: 2,
              hi: 'पूरा पेज सेलेक्ट करें',
              en: 'Select the whole page',
              tip: 'लैपटॉप/PC: कहीं भी क्लिक करके Ctrl + A · मोबाइल: स्क्रीन पर अंगुली दबाकर रखें → "सभी चुनें / Select all"',
            },
            {
              n: 3,
              hi: 'कॉपी करके नीचे पेस्ट करें',
              en: 'Copy, then paste in the box below',
              tip: 'लैपटॉप/PC: Ctrl + C फिर यह बॉक्स → Ctrl + V · मोबाइल: लंबा दबाकर Copy → यहाँ Paste',
            },
          ].map((step) => (
            <li
              key={step.n}
              className="rounded-xl border border-amber-200/80 bg-white p-3 dark:border-amber-900/40 dark:bg-slate-900/70"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-600 text-[11px] font-black text-white">
                  {step.n}
                </span>
                <span className="text-[13px] font-bold leading-snug text-slate-900 dark:text-white">{step.hi}</span>
              </div>
              <div className="text-[11px] font-medium italic text-slate-500 dark:text-slate-400">{step.en}</div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">{step.tip}</p>
            </li>
          ))}
        </ol>
      )}

      <p className="border-t border-amber-200/70 bg-amber-100/50 px-4 py-2 text-[11px] font-medium text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100">
        ध्यान रहे: फ़ाइल सेव करने / भेजने की ज़रूरत नहीं है — पेस्ट की गई सामग्री आपके ब्राउज़र से बाहर नहीं जाती। सर्वर पर केवल नाम, रोल नंबर, शिफ्ट-तारीख, सही, गलत, प्रयासित व अनुत्तीर्ण संख्या सेव होती है।
      </p>
    </section>
  );
};

export default PasteAnswerKeyView;
