import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CandidateRecord, ShiftStats, AuditLog } from '../types';
import { getAuditLogs, addAuditLog, clearAllCandidates } from '../lib/storage';
import { repository } from '../lib/repository';
import type { SyncMeta } from '../lib/storage';
import { EXAM_SHIFTS } from '../data/shifts';
import { 
  Shield, 
  Lock, 
  Download, 
  Search, 
  Trash2, 
  LogOut,
  AlertTriangle,
  Database,
  Upload,
  Mail,
  RefreshCw,
  CheckCircle2
} from 'lucide-react';

interface AdminViewProps {
  candidates: CandidateRecord[];
  shiftStats: ShiftStats[];
  onRefreshData: () => void;
  sync?: SyncMeta;
}

export const AdminView: React.FC<AdminViewProps> = ({
  candidates,
  shiftStats,
  onRefreshData,
  sync,
}) => {
  const live = repository.databaseConfigured;
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => repository.admin.isSignedIn());
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  // local (browser-only) admin escape hatch so a demo build is never locked out
  const [localMode, setLocalMode] = useState<boolean>(!live);

  // Search & filter in admin
  const [search, setSearch] = useState<string>('');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(getAuditLogs());
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Database / e-mail diagnostics
  const [health, setHealth] = useState<any | null>(null);
  const [importCsv, setImportCsv] = useState<string>('');
  const [emailTest, setEmailTest] = useState<string>('');

  const refreshAudit = useCallback(async () => {
    if (!live || !repository.admin.isSignedIn()) return;
    const logs = await repository.admin.audit(80);
    if (logs) setAuditLogs(logs as unknown as AuditLog[]);
  }, [live]);

  const loadHealth = useCallback(async () => {
    if (!live) return;
    const h = await repository.admin.health();
    setHealth(h);
  }, [live]);

  useEffect(() => {
    void refreshAudit();
    void loadHealth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshAudit, loadHealth, isAuthenticated]);

  /*
   * Blueprint #44/#45: no admin secret may live in the frontend bundle and no
   * hard-coded demo password. With a live API the password is checked only by
   * the server. Without an API (pure local demo) the operator sets a device-local
   * password on first use — it is stored as a SHA-256 hash in this browser and
   * unlocks only this device's localStorage data.
   */
  const LOCAL_ADMIN_KEY = 'rank_mitra_local_admin_v1';
  const localSetupNeeded = !live && !localStorage.getItem(LOCAL_ADMIN_KEY);

  const sha256 = async (text: string) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!live) {
      setAuthBusy(true);
      void (async () => {
        const hash = await sha256(passwordInput);
        if (localSetupNeeded) {
          if (passwordInput.length < 8) {
            setAuthBusy(false);
            setAuthError('डेमो पासवर्ड कम-से-कम 8 अक्षर का रखें (यह केवल इसी डिवाइस पर लागू होगा)।');
            return;
          }
          localStorage.setItem(LOCAL_ADMIN_KEY, hash);
          setIsAuthenticated(true);
          setLocalMode(true);
          addAuditLog('ADMIN_LOGIN', 'स्थानीय डेमो सत्र — पासवर्ड इसी डिवाइस पर सेट किया गया', 'Admin');
          setAuditLogs(getAuditLogs());
        } else if (hash === localStorage.getItem(LOCAL_ADMIN_KEY)) {
          setIsAuthenticated(true);
          setLocalMode(true);
          addAuditLog('ADMIN_LOGIN', 'स्थानीय (डेमो) प्रशासक सत्र शुरू', 'Admin');
          setAuditLogs(getAuditLogs());
        } else {
          setAuthError('गलत पासवर्ड। (डेमो मोड — कोई डेटाबेस/API नहीं जुड़ा)');
        }
        setAuthBusy(false);
      })();
      return;
    }

    setAuthBusy(true);
    void (async () => {
      const res = await repository.admin.login(passwordInput);
      setAuthBusy(false);
      setPasswordInput('');
      if (res.ok) {
        setIsAuthenticated(true);
        void refreshAudit();
        void loadHealth();
      } else {
        setAuthError(res.error || 'पासवर्ड गलत है।');
      }
    })();
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setPasswordInput('');
    repository.admin.logout();
    addAuditLog('ADMIN_LOGOUT', 'Administrator signed out', 'Admin');
    setAuditLogs(getAuditLogs());
  };

  const handleClearAllData = () => {
    setBusyAction('clear');
    void (async () => {
      if (localMode) {
        clearAllCandidates();
        onRefreshData();
        setShowResetConfirm(false);
        setBusyAction(null);
        setAuditLogs(getAuditLogs());
        setActionNote({ kind: 'ok', text: 'इस ब्राउज़र का डेटा साफ़ कर दिया गया (डेमो मोड)।' });
        return;
      }
      const res = await repository.admin.clearAll();
      setBusyAction(null);
      setShowResetConfirm(false);
      if (res.ok) {
        onRefreshData();
        void refreshAudit();
        setActionNote({ kind: 'ok', text: `${res.deleted ?? 0} प्रविष्टियाँ डेटाबेस से हटा दी गईं।` });
      } else {
        setActionNote({ kind: 'err', text: res.error || 'डेटा हटाया नहीं जा सका।' });
      }
    })();
  };

  const handleImport = () => {
    if (!importCsv.trim()) {
      setActionNote({ kind: 'err', text: 'पहले CSV टेक्स्ट पेस्ट करें या फ़ाइल चुनें।' });
      return;
    }
    setBusyAction('import');
    void (async () => {
      const res = await repository.admin.importCsv(importCsv);
      setBusyAction(null);
      if (res.ok) {
        setActionNote({
          kind: 'ok',
          text: `आयात: ${res.inserted ?? 0} नई, ${res.skipped ?? 0} पहले से मौजूद${
            res.invalid?.length ? `, ${res.invalid.length} अमान्य` : ''
          }।`,
        });
        onRefreshData();
        void refreshAudit();
      } else {
        setActionNote({ kind: 'err', text: res.error || 'आयात विफल।' });
      }
    })();
  };

  const handleEmailTest = () => {
    const to = emailTest.trim();
    if (!to) {
      setActionNote({ kind: 'err', text: 'परीक्षण हेतु ई-मेल पता लिखें।' });
      return;
    }
    setBusyAction('mail');
    void (async () => {
      const res = await repository.admin.testEmail(to);
      setBusyAction(null);
      setActionNote(
        res.ok
          ? { kind: 'ok', text: 'परीक्षण ई-मेल स्वीकार हो गया (प्रदाता लॉग देखें)।' }
          : { kind: 'err', text: res.error || 'ई-मेल नहीं भेजा जा सका।' }
      );
    })();
  };

  const handleImportFile = (file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setImportCsv(String(reader.result || ''));
    reader.onerror = () => setActionNote({ kind: 'err', text: 'फ़ाइल पढ़ी नहीं जा सकी।' });
    reader.readAsText(file);
  };

  /**
   * Prefer the server export (it has every row, including the private columns
   * when the session asked for them); fall back to what this browser holds.
   */
  const exportRows = (): CandidateRecord[] => candidates;

  const buildCsv = (): string => {
    const headers = [
      'Roll Number',
      'Public Name',
      'Private Name',
      'Category',
      'Gender',
      'Ex-Serviceman',
      'Contract',
      'Qualifications',
      'Shift Number',
      'Correct',
      'Wrong',
      'Unattempted',
      'Raw Score',
      'Accuracy %',
      'Submission Timestamp',
      'Source Format',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [headers.join(',')];
    for (const c of exportRows()) {
      lines.push(
        [
          c.rollNumber,
          c.candidateNamePublic,
          c.candidateNamePrivate || c.candidateNamePublic,
          c.category,
          c.gender,
          c.exServiceman ? 'Yes' : 'No',
          c.contractStatus ? 'Yes' : 'No',
          (c.qualifications || []).join('|'),
          `Shift ${c.shiftNumber}`,
          c.correct,
          c.wrong,
          c.unattempted,
          c.rawScore,
          c.accuracy,
          c.submittedAt,
          c.sourceFormat || '',
        ]
          .map(esc)
          .join(',')
      );
    }
    return lines.join('\n');
  };

  const handleExportCSV = () => {
    const serverUrl = repository.admin.exportUrl('csv', true);
    if (serverUrl) {
      download(serverUrl, `rank-mitra-mpesb-g2sg4.csv`);
      addAuditLog('ADMIN_EXPORT', 'लाइव डेटाबेस से CSV निर्यात आरंभ किया', 'Admin');
      setAuditLogs(getAuditLogs());
      return;
    }
    const blob = new Blob(['\ufeff' + buildCsv()], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    download(url, 'rank-mitra-local-export.csv');
    URL.revokeObjectURL(url);
    addAuditLog('ADMIN_EXPORT', `${candidates.length} पंक्तियाँ CSV में निर्यात की गईं (स्थानीय)`, 'Admin');
    setAuditLogs(getAuditLogs());
  };

  const handleExportJSON = () => {
    const serverUrl = repository.admin.exportUrl('json', true);
    if (serverUrl) {
      download(serverUrl, `rank-mitra-mpesb-g2sg4.json`);
      return;
    }
    const blob = new Blob([JSON.stringify(candidates, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    download(url, 'rank-mitra-local-export.json');
    URL.revokeObjectURL(url);
  };

  const download = (url: string, filename: string) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  // Filtered candidate list
  const filteredCandidates = candidates.filter((c) => {
    if (shiftFilter !== 'all' && c.shiftNumber !== parseInt(shiftFilter, 10)) return false;
    if (search) {
      const q = search.toLowerCase();
      const matchRoll = c.rollNumber.toLowerCase().includes(q);
      const matchName = (c.candidateNamePrivate || c.candidateNamePublic || '').toLowerCase().includes(q);
      if (!matchRoll && !matchName) return false;
    }
    return true;
  });

  // If not authenticated, render login form
  if (!isAuthenticated) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl">
          <div className="text-center space-y-2">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mx-auto">
              <Shield className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">प्रशासक लॉगिन (Admin Login)</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {localSetupNeeded
                ? 'पहली बार: एक प्रशासक पासवर्ड सेट करें (केवल इसी ब्राउज़र में, हैश के रूप में सहेजा जाएगा)।'
                : 'डेटा प्रबंधन, ऑडिट लॉग्स और पूर्ण डेटासेट निर्यात हेतु अधिकृत पासवर्ड दर्ज करें।'}
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                प्रशासक पासवर्ड (Admin Password)
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-3 text-slate-400 dark:text-slate-500" />
                <input
                  type="password"
                  placeholder={localSetupNeeded ? 'नया प्रशासक पासवर्ड सेट करें (कम-से-कम 8 अक्षर)' : 'सुरक्षित पासवर्ड दर्ज करें...'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 font-medium"
                />
              </div>
            </div>

            {authError && (
              <p className="text-xs text-rose-600 dark:text-rose-400 font-medium">{authError}</p>
            )}

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 font-bold text-xs shadow-md transition-all cursor-pointer"
            >
              {authBusy ? 'जाँची जा रही है…' : 'लॉगिन करें'}
            </button>
          </form>

          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-4">
            {live ? (
              <>
                पासवर्ड सीधे <code className="font-mono">POST /api/admin/login</code> पर जाता है — सत्र का टोकन 12 घंटे में
                समाप्त हो जाता है और हर प्रशासक क्रिया डेटाबेस के ऑडिट लॉग में दर्ज होती है। बार-बार गलत प्रयास पर
                सर्वर कुछ देर के लिए अनुरोध रोक देता है।
              </>
            ) : (
              <>
                अभी कोई डेटाबेस/API नहीं जुड़ा है, इसलिए यह <b>डेमो लॉगिन</b> है और इसका प्रभाव केवल इसी ब्राउज़र
                पर पड़ेगा। वास्तविक सुरक्षा के लिए <code className="font-mono">ADMIN_PASSWORD</code> एनवायरनमेंट
                वैरिएबल सेट कर <code className="font-mono">DATABASE_URL</code> जोड़ें।
              </>
            )}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-16 transition-colors">
      {/* Admin Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 rounded-2xl shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">प्रशासक कंसोल (Admin Management Console)</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              डेटा गुणवत्ता सत्यापन · CSV/JSON निर्यात · ऑडिट लॉग्स · उम्मीदवार प्रबंधन
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>CSV निर्यात</span>
          </button>

          <button
            onClick={handleExportJSON}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-medium border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>JSON निर्यात</span>
          </button>

          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/20 border border-rose-200 dark:border-rose-500/30 text-xs font-medium transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>डेटा रीसेट करें</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>लॉगआउट</span>
          </button>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-sm">
            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
            <span>क्या आप सभी सबमिशन डेटा साफ़ (Reset) करना चाहते हैं?</span>
          </div>
          <p>
            इस क्रिया से स्थानीय स्तर पर जमा किए गए सभी उम्मीदवार रिकॉर्ड मिटा दिए जाएंगे और डेटा शून्य हो जाएगा।
          </p>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleClearAllData}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs cursor-pointer"
            >
              हाँ, सारा डेटा साफ़ करें
            </button>
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs cursor-pointer"
            >
              रद्द करें
            </button>
          </div>
        </div>
      )}

      {/* Result of the last admin action */}
      {actionNote && (
        <div
          className={`p-3 rounded-xl text-xs flex items-start gap-2 border ${
            actionNote.kind === 'ok'
              ? 'bg-emerald-50 dark:bg-emerald-950/25 border-emerald-200 dark:border-emerald-500/25 text-emerald-800 dark:text-emerald-300'
              : 'bg-rose-50 dark:bg-rose-950/25 border-rose-200 dark:border-rose-500/25 text-rose-800 dark:text-rose-300'
          }`}
        >
          {actionNote.kind === 'ok' && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />}
          <span className="flex-1">{actionNote.text}</span>
          <button onClick={() => setActionNote(null)} className="text-[11px] underline cursor-pointer">
            बंद करें
          </button>
        </div>
      )}

      {/* Database / e-mail wiring */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-500" />
            <span>डेटाबेस व ई-मेल की स्थिति</span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { void loadHealth(); void refreshAudit(); }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-300 dark:border-slate-700 text-[11px] hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              <span>जाँचें</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="text-[11px] underline text-cyan-700 dark:text-cyan-400 cursor-pointer"
            >
              बैकअप CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">मोड</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {live ? (localMode ? 'API + स्थानीय डेमो' : 'लाइव API') : 'केवल ब्राउज़र (localStorage)'}
            </span>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {live
                ? `सभी पंक्तियाँ: ${sync?.total ?? 0} · pending ${sync?.pending ?? 0}`
                : 'रैंक शेयर करने के लिए DATABASE_URL या Cloudflare D1 बाँधें।'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">ड्राइवर / परीक्षा</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {health?.driver || '—'} · {health?.examId || '—'}
            </span>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {health ? `जिला/वर्ग अनुমানित: ${health.counts?.total ?? 0}` : 'स्वास्थ्य जाँच उपलब्ध नहीं (API बंद?)'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">ई-मेल प्रदाता</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">{health?.emailProvider || 'console'}</span>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={emailTest}
                onChange={(e) => setEmailTest(e.target.value.trim())}
                placeholder="परीक्षण ई-मेल भेजें…"
                className="flex-1 min-w-0 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-cyan-500"
              />
              <button
                onClick={handleEmailTest}
                disabled={busyAction === 'mail'}
                className="px-2 py-1 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-bold cursor-pointer"
              >
                {busyAction === 'mail' ? '…' : 'भेजें'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk import */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-amber-500" />
            <span>थोक आयात (CSV)</span>
          </h3>
          <label className="text-[11px] text-slate-600 dark:text-slate-400 cursor-pointer flex items-center gap-1.5">
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => handleImportFile(e.target.files?.[0])}
              className="text-[11px]"
            />
            <span>फ़ाइल चुनें</span>
          </label>
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          स्तंभ: <code className="font-mono">roll_number, candidate_name, category, gender, shift_number, correct, wrong, unattempted, raw_score, email</code> —
          हेडर वाली CSV पेस्ट करें या फ़ाइल चुनें। रोल नंबर पहले से मौजूद हो तो पंक्ति छोड़ दी जाती है।
        </p>
        <textarea
          value={importCsv}
          onChange={(e) => setImportCsv(e.target.value)}
          rows={4}
          placeholder={'roll_number,candidate_name,category,gender,shift_number,correct,wrong,unattempted,raw_score\n26001,Ramesh Kumar,UR,Male,2,142,31,27,134.25'}
          className="w-full font-mono text-[11px] bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-800 rounded-lg p-3 focus:outline-none focus:border-amber-500"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleImport}
            disabled={busyAction === 'import'}
            className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold cursor-pointer"
          >
            {busyAction === 'import' ? 'आयात हो रहा है…' : 'डेटाबेस में आयात करें'}
          </button>
          <button
            onClick={() => setImportCsv('')}
            className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs cursor-pointer"
          >
            खाली करें
          </button>
          {!live && (
            <span className="text-[11px] text-rose-600 dark:text-rose-400">
              कोई डेटाबेस नहीं जुड़ा — आयात केवल लाइव API पर काम करेगा।
            </span>
          )}
        </div>
      </div>

      {/* Admin KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">कुल पंजीकृत उम्मीदवार</span>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
            {candidates.length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">कुल परीक्षा शिफ्ट्स</span>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            22 Shifts
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">पार्सिंग सटीकता दर</span>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            100%
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">डुप्लीकेट सुरक्षा</span>
          <div className="text-2xl font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1">
            सक्रिय
          </div>
        </div>
      </div>

      {/* Candidate Records Search & Management */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            उम्मीदवार रिकॉर्ड्स (Candidate Records - Unmasked Admin View)
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder="रोल या नाम खोजें..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <select
              value={shiftFilter}
              onChange={(e) => setShiftFilter(e.target.value)}
              className="bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-900 dark:text-white focus:outline-none"
            >
              <option value="all">सभी 22 शिफ्ट्स</option>
              {EXAM_SHIFTS.map((s) => (
                <option key={s.id} value={s.shiftNumber}>
                  Shift {s.shiftNumber} ({s.displayDate})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[11px] sticky top-0">
              <tr>
                <th className="py-2.5 px-3">रोल नंबर</th>
                <th className="py-2.5 px-3">पूरा नाम (Private Name)</th>
                <th className="py-2.5 px-3">शिफ्ट व दिनांक</th>
                <th className="py-2.5 px-3">श्रेणी</th>
                <th className="py-2.5 px-3">लिंग</th>
                <th className="py-2.5 px-3 text-right">सही</th>
                <th className="py-2.5 px-3 text-right">गलत</th>
                <th className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400 font-bold">रॉ स्कोर</th>
                <th className="py-2.5 px-3">योग्यताएं</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-6 text-center text-slate-500 font-sans">
                    कोई उम्मीदवार रिकॉर्ड उपलब्ध नहीं है।
                  </td>
                </tr>
              ) : (
                filteredCandidates.slice(0, 50).map((c) => (
                  <tr key={c.rollNumber} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                    <td className="py-2 px-3 text-slate-900 dark:text-white font-semibold">{c.rollNumber}</td>
                    <td className="py-2 px-3 font-sans text-slate-800 dark:text-slate-200">{c.candidateNamePrivate || c.candidateNamePublic}</td>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">Shift {c.shiftNumber} ({c.examDate})</td>
                    <td className="py-2 px-3 font-sans text-slate-700 dark:text-slate-300">{c.category}</td>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">{c.gender}</td>
                    <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">{c.correct}</td>
                    <td className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">{c.wrong}</td>
                    <td className="py-2 px-3 text-right text-amber-600 dark:text-amber-400 font-bold text-xs">{c.rawScore}</td>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400 truncate max-w-[150px]">
                      {c.qualifications.join(', ')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 text-right pt-1">
          दर्शाए जा रहे हैं {Math.min(50, filteredCandidates.length)} / {filteredCandidates.length} रिकॉर्ड्स
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-xs space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          सिस्टम ऑडिट लॉग्स (System Audit Trail)
        </h3>
        <div className="space-y-1.5 max-h-48 overflow-y-auto font-mono text-[11px]">
          {auditLogs.length === 0 ? (
            <p className="text-slate-500 font-sans">कोई लॉग उपलब्ध नहीं है।</p>
          ) : (
            auditLogs.map((log) => (
              <div key={log.id} className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800/80 flex items-center justify-between">
                <div>
                  <span className="text-amber-600 dark:text-amber-400 font-semibold">[{log.action}]</span>{' '}
                  <span className="text-slate-700 dark:text-slate-300">{log.details}</span>
                </div>
                <span className="text-slate-500 text-[10px]">
                  {new Date(log.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
