import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CandidateRecord, ShiftStats, AuditLog, FilterState, Category, Gender } from '../types';
import { getAuditLogs, addAuditLog, clearAllCandidates } from '../lib/storage';
import { repository } from '../lib/repository';
import type { SyncMeta } from '../lib/storage';
import { EXAM_SHIFTS } from '../data/shifts';
import { MASTER_QUALIFICATIONS } from '../data/qualifications';
import { FilterBar } from './FilterBar';
import { filterCandidates } from '../lib/filterUtils';
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
  CheckCircle2,
  Printer,
  Eye,
  EyeOff,
  Settings,
  FileText,
  X,
  Check,
  Pencil
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
  const [localMode, setLocalMode] = useState<boolean>(!live);

  // Advance Filters in admin
  const [filters, setFilters] = useState<FilterState>({
    shiftNumber: 'all',
    category: 'all',
    gender: 'all',
    qualification: 'all',
    qualifications: [],
    stream: 'all',
    searchQuery: '',
    scoreMin: '',
    scoreMax: '',
    contractStatus: 'all',
    exServiceman: 'all',
    shiftSlot: 'all',
  });

  // Admin Settings
  const [unmaskNames, setUnmaskNames] = useState<boolean>(true);
  const [rowLimit, setRowLimit] = useState<number>(100);
  const [showPdfModal, setShowPdfModal] = useState<boolean>(false);

  // Student modification & deletion state
  const [editingCandidate, setEditingCandidate] = useState<CandidateRecord | null>(null);
  const [candidateToDelete, setCandidateToDelete] = useState<CandidateRecord | null>(null);

  // Edit form state
  const [editCategory, setEditCategory] = useState<Category>('UR');
  const [editGender, setEditGender] = useState<Gender>('Male');
  const [editContract, setEditContract] = useState<boolean>(false);
  const [editExServiceman, setEditExServiceman] = useState<boolean>(false);
  const [editQualifications, setEditQualifications] = useState<string[]>([]);

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
  }, [refreshAudit, loadHealth, isAuthenticated]);

  const LOCAL_ADMIN_KEY = 'rank_mitra_local_admin_v1';
  const localSetupNeeded = !live && !localStorage.getItem(LOCAL_ADMIN_KEY);

  const sha256 = async (text: string) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  };

  // Master password hash for offline fallback (SHA-256)
  const MASTER_HASH = '18965b77f507288d1b87263b045b56672f3687b4128c6498dd6c124b4463bad7';

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const entered = passwordInput.trim();
    if (!entered) {
      setAuthError('कृपया पासवर्ड दर्ज करें।');
      return;
    }

    setAuthBusy(true);
    void (async () => {
      try {
        // 1. Try server login first (gets official admin session token)
        if (live) {
          const res = await repository.admin.login(entered);
          if (res.ok) {
            setIsAuthenticated(true);
            setLocalMode(false);
            setPasswordInput('');
            addAuditLog('ADMIN_LOGIN', 'अधिकृत लाइव प्रशासक सत्र शुरू', 'Admin');
            setAuditLogs(getAuditLogs());
            void refreshAudit();
            void loadHealth();
            setAuthBusy(false);
            return;
          }
        }

        // 2. Offline fallback (or if local dev without server) using SHA-256
        const hash = await sha256(entered);
        if (hash === MASTER_HASH) {
          setIsAuthenticated(true);
          setLocalMode(true);
          setPasswordInput('');
          addAuditLog('ADMIN_LOGIN', 'अधिकृत प्रशासक सत्र शुरू', 'Admin');
          setAuditLogs(getAuditLogs());
          setAuthBusy(false);
          return;
        }

        if (localSetupNeeded) {
          if (entered.length < 8) {
            setAuthBusy(false);
            setAuthError('पासवर्ड कम-से-कम 8 अक्षर का रखें।');
            return;
          }
          localStorage.setItem(LOCAL_ADMIN_KEY, hash);
          setIsAuthenticated(true);
          setLocalMode(true);
          setPasswordInput('');
          addAuditLog('ADMIN_LOGIN', 'स्थानीय सत्र पासवर्ड सेट किया गया', 'Admin');
          setAuditLogs(getAuditLogs());
        } else if (hash === localStorage.getItem(LOCAL_ADMIN_KEY)) {
          setIsAuthenticated(true);
          setLocalMode(true);
          setPasswordInput('');
          addAuditLog('ADMIN_LOGIN', 'प्रशासक सत्र शुरू', 'Admin');
          setAuditLogs(getAuditLogs());
        } else {
          setAuthError('पासवर्ड गलत है। कृपया पुनः प्रयास करें।');
        }
      } catch (err: any) {
        setAuthError(err?.message || 'लॉगिन में त्रुटि हुई।');
      } finally {
        setAuthBusy(false);
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

  // Open edit modal for student
  const openEditCandidate = (c: CandidateRecord) => {
    setEditingCandidate(c);
    setEditCategory(c.category);
    setEditGender(c.gender);
    setEditContract(Boolean(c.contractStatus));
    setEditExServiceman(Boolean(c.exServiceman));
    setEditQualifications(c.qualifications || []);
  };

  // Save student modifications
  const saveCandidateEdit = async () => {
    if (!editingCandidate) return;
    setBusyAction('saveEdit');
    const updated = {
      category: editCategory,
      gender: editGender,
      contractStatus: editContract,
      exServiceman: editExServiceman,
      qualifications: editQualifications,
    };
    const res = await repository.updateProfile(editingCandidate.rollNumber, updated);
    setBusyAction(null);
    if (res.success) {
      setActionNote({ kind: 'ok', text: `रोल ${editingCandidate.rollNumber} की जानकारी सफलतापूर्वक अपडेट कर दी गई।` });
      onRefreshData();
      void refreshAudit();
      setEditingCandidate(null);
    } else {
      setActionNote({ kind: 'err', text: res.error || 'अपडेट विफल रहा।' });
    }
  };

  // Delete student record
  const confirmDeleteCandidate = async () => {
    if (!candidateToDelete) return;
    setBusyAction('deleteCand');
    const res = await repository.remove(candidateToDelete.rollNumber);
    setBusyAction(null);
    if (res.success) {
      setActionNote({ kind: 'ok', text: `रोल ${candidateToDelete.rollNumber} का रिकॉर्ड डेटाबेस से हटा दिया गया।` });
      onRefreshData();
      void refreshAudit();
      setCandidateToDelete(null);
    } else {
      setActionNote({ kind: 'err', text: res.error || 'रिकॉर्ड हटाया नहीं जा सका।' });
    }
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

  // Filtered candidate list using advance filter
  const filteredCandidates = useMemo(() => {
    return filterCandidates(candidates, filters).sort((a, b) => b.rawScore - a.rawScore);
  }, [candidates, filters]);

  // Trigger browser print for PDF
  const triggerPdfPrint = () => {
    window.print();
  };

  // If not authenticated, render clean login form (NO password displayed on screen!)
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
              डेटा प्रबंधन, एडवांस्ड फ़िल्टरिंग, PDF एक्सपोर्ट (वाटरमार्क सहित) व ऑडिट लॉग्स हेतु लॉगिन करें।
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
                  placeholder="सुरक्षित प्रशासक पासवर्ड दर्ज करें..."
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
              छात्र डेटा संशोधन व विलोपन · एडवांस्ड फ़िल्टरिंग · PDF डाउनलोड (वाटरमार्क) · CSV/JSON बैकअप
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* PDF Download Button */}
          <button
            onClick={() => setShowPdfModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>PDF डाउनलोड / प्रिंट</span>
          </button>

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

      {/* Admin Settings & Controls Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">प्रशासक सेटिंग्स व कॉन्फ़िगरेशन (Admin Settings)</h2>
          </div>
          <span className="text-xs text-slate-500">MPESB Group-2 Sub-Group-4</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Setting 1: Admin Session status (Password is NOT displayed) */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[11px]">प्रशासक सुरक्षा स्थिति</span>
            <div className="flex items-center gap-1.5 font-bold text-emerald-600 dark:text-emerald-400">
              <Check className="w-4 h-4" />
              <span>सत्यापित अधिकृत सत्र</span>
            </div>
            <p className="text-[10px] text-slate-400">सत्र टोकन 12 घंटे हेतु मान्य</p>
          </div>

          {/* Setting 2: Unmask Names toggle */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[11px]">अभ्यर्थी नाम दृश्यता</span>
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {unmaskNames ? 'वास्तविक नाम (Unmasked)' : 'मास्क नाम (Masked)'}
              </span>
              <button
                onClick={() => setUnmaskNames(!unmaskNames)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                  unmaskNames ? 'bg-amber-500 text-slate-950' : 'bg-slate-200 dark:bg-slate-800 text-slate-600'
                }`}
              >
                {unmaskNames ? 'Unmasked' : 'Masked'}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">तालिका एवं PDF रिपोर्ट दोनों पर लागू</p>
          </div>

          {/* Setting 3: Watermark info */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[11px]">PDF वाटरमार्क ब्रांडिंग</span>
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              TOPPER VIEW
            </div>
            <p className="text-[10px] text-slate-400">
              Owner: <strong>@LODHIJI27</strong> (Telegram)
            </p>
          </div>

          {/* Setting 4: Rows displayed */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="text-slate-500 block text-[11px]">तालिका में रिकॉर्ड सीमा</span>
            <div className="flex items-center gap-1.5 pt-0.5">
              {[50, 100, 250, 1000].map((lim) => (
                <button
                  key={lim}
                  onClick={() => setRowLimit(lim)}
                  className={`px-2 py-0.5 rounded text-[10px] font-mono cursor-pointer ${
                    rowLimit === lim
                      ? 'bg-amber-500 text-slate-950 font-bold'
                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {lim === 1000 ? 'सभी' : lim}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">वर्तमान चयन: {rowLimit} पंक्तियाँ</p>
          </div>
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

      {/* Admin KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">कुल पंजीकृत उम्मीदवार</span>
          <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white mt-1 tabular-nums">
            {candidates.length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">फ़िल्टर परिणाम</span>
          <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 mt-1 tabular-nums">
            {filteredCandidates.length}
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">कुल परीक्षा शिफ्ट्स</span>
          <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-1 tabular-nums">
            22 Shifts
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 dark:text-slate-400 block font-medium">डेटाबेस स्थिति</span>
          <div className="text-lg font-bold font-mono text-cyan-600 dark:text-cyan-400 mt-1 truncate">
            {health?.driver || (live ? 'postgres' : 'sqlite')}
          </div>
        </div>
      </div>

      {/* Global Advance Filter for Admin */}
      <FilterBar
        filters={filters}
        onChange={setFilters}
        showShiftFilter={true}
        totalFilteredCount={filteredCandidates.length}
        totalCount={candidates.length}
        onExportPdf={() => setShowPdfModal(true)}
        title="प्रशासक एडवांस्ड फ़िल्टर (Admin Advance Multi-Filter)"
      />

      {/* Candidate Records Table with Edit & Delete Rights */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              उम्मीदवार रिकॉर्ड्स (Candidate Records — {unmaskNames ? 'Unmasked Admin View' : 'Masked Public View'})
            </h2>
            <p className="text-[11px] text-slate-500">
              प्रत्येक रिकॉर्ड को संपादित (संशोधन) करने या हटाने (विलोपन) का पूर्ण अधिकार उपलब्ध है।
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPdfModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>फ़िल्टर डेटा PDF डाउनलोड करें</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs text-slate-700 dark:text-slate-300">
            <thead className="bg-slate-50 dark:bg-slate-950 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800 uppercase text-[11px] sticky top-0">
              <tr>
                <th className="py-2.5 px-3">मेरिट</th>
                <th className="py-2.5 px-3">रोल नंबर</th>
                <th className="py-2.5 px-3">उम्मीदवार का नाम</th>
                <th className="py-2.5 px-3">शिफ्ट व दिनांक</th>
                <th className="py-2.5 px-3">श्रेणी व कोटा</th>
                <th className="py-2.5 px-3">लिंग</th>
                <th className="py-2.5 px-3 text-right">सही</th>
                <th className="py-2.5 px-3 text-right">गलत</th>
                <th className="py-2.5 px-3 text-right text-amber-600 dark:text-amber-400 font-bold">रॉ मार्क्स</th>
                <th className="py-2.5 px-3 text-right">सटीकता</th>
                <th className="py-2.5 px-3">योग्यताएं</th>
                <th className="py-2.5 px-3 text-center">क्रिया (Actions)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono text-[11px]">
              {filteredCandidates.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-8 text-center text-slate-500 font-sans">
                    कोई उम्मीदवार रिकॉर्ड उपलब्ध नहीं है। कृपया फ़िल्टर जांचें।
                  </td>
                </tr>
              ) : (
                filteredCandidates.slice(0, rowLimit).map((c, idx) => (
                  <tr key={c.rollNumber} className="hover:bg-slate-50 dark:hover:bg-slate-850">
                    <td className="py-2 px-3 text-slate-500 font-bold">#{idx + 1}</td>
                    <td className="py-2 px-3 text-slate-900 dark:text-white font-semibold">{c.rollNumber}</td>
                    <td className="py-2 px-3 font-sans text-slate-800 dark:text-slate-200">
                      {unmaskNames ? (c.candidateNamePrivate || c.candidateNamePublic) : c.candidateNamePublic}
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">Shift {c.shiftNumber} ({c.examDate})</td>
                    <td className="py-2 px-3 font-sans">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-slate-700 dark:text-slate-300 font-medium">{c.category}</span>
                        {c.contractStatus && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-cyan-100 text-cyan-800">संविदा</span>
                        )}
                        {c.exServiceman && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-indigo-100 text-indigo-800">Ex-SM</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400">
                      {c.gender === 'Male' ? 'पुरुष' : c.gender === 'Female' ? 'महिला' : 'अन्य'}
                    </td>
                    <td className="py-2 px-3 text-right text-emerald-600 dark:text-emerald-400">{c.correct}</td>
                    <td className="py-2 px-3 text-right text-rose-600 dark:text-rose-400">{c.wrong}</td>
                    <td className="py-2 px-3 text-right text-amber-600 dark:text-amber-400 font-bold text-xs">{c.rawScore.toFixed(2)}</td>
                    <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">{c.accuracy}%</td>
                    <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                      {c.qualifications.join(', ')}
                    </td>
                    {/* Action buttons: Edit & Delete */}
                    <td className="py-2 px-3 text-center font-sans">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => openEditCandidate(c)}
                          title="उम्मीदवार डेटा संशोधित करें (Edit)"
                          className="p-1 rounded bg-slate-100 hover:bg-amber-100 dark:bg-slate-800 dark:hover:bg-amber-950/40 text-slate-700 hover:text-amber-700 dark:text-slate-300 dark:hover:text-amber-400 transition-colors cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setCandidateToDelete(c)}
                          title="रिकॉर्ड हटाएं (Delete)"
                          className="p-1 rounded bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950/40 text-slate-700 hover:text-rose-700 dark:text-slate-300 dark:hover:text-rose-400 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 text-right pt-1">
          दर्शाए जा रहे हैं {Math.min(rowLimit, filteredCandidates.length)} / {filteredCandidates.length} रिकॉर्ड्स
        </div>
      </div>

      {/* Database / e-mail wiring */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
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
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px]">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">मोड</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {live ? (localMode ? 'API + स्थानीय सत्र' : 'लाइव API') : 'केवल ब्राउज़र (localStorage)'}
            </span>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {live
                ? `सभी पंक्तियाँ: ${sync?.total ?? candidates.length}`
                : 'स्थानीय डेटा केवल इस ब्राउज़र में है।'}
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block">ड्राइवर / परीक्षा</span>
            <span className="font-bold text-slate-800 dark:text-slate-200">
              {health?.driver || (live ? 'postgres' : 'sqlite')} · {health?.examId || 'mpesb-g2sg4-2026'}
            </span>
            <p className="text-slate-500 dark:text-slate-400 mt-1">
              {health ? `कुल प्रविष्टियाँ: ${health.counts?.total ?? candidates.length}` : 'डेटाबेस सक्रिय है।'}
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
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Upload className="w-4 h-4 text-amber-500" />
            <span>थोक आयात (CSV Import)</span>
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
        <textarea
          value={importCsv}
          onChange={(e) => setImportCsv(e.target.value)}
          rows={3}
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
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs space-y-3">
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

      {/* Edit Candidate Modal */}
      {editingCandidate && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-amber-500" />
                <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                  उम्मीदवार डेटा संशोधन (Edit Candidate)
                </h3>
              </div>
              <button
                onClick={() => setEditingCandidate(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex justify-between">
                <div>
                  <span className="text-slate-500 block">रोल नंबर:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{editingCandidate.rollNumber}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">नाम:</span>
                  <span className="font-semibold text-slate-900 dark:text-white">{editingCandidate.candidateNamePrivate || editingCandidate.candidateNamePublic}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">रॉ स्कोर:</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{editingCandidate.rawScore.toFixed(2)}</span>
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  आरक्षण श्रेणी (Category)
                </label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value as Category)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                >
                  {(['UR', 'OBC', 'SC', 'ST', 'EWS', 'PWD'] as Category[]).map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Gender */}
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  लिंग (Gender)
                </label>
                <select
                  value={editGender}
                  onChange={(e) => setEditGender(e.target.value as Gender)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-900 dark:text-white"
                >
                  {(['Male', 'Female', 'Other'] as Gender[]).map((g) => (
                    <option key={g} value={g}>{g === 'Male' ? 'पुरुष' : g === 'Female' ? 'महिला' : 'अन्य'}</option>
                  ))}
                </select>
              </div>

              {/* Quotas */}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editContract}
                    onChange={(e) => setEditContract(e.target.checked)}
                    className="rounded text-amber-500"
                  />
                  <span>संविदा कर्मचारी (Contract Quota)</span>
                </label>
                <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editExServiceman}
                    onChange={(e) => setEditExServiceman(e.target.checked)}
                    className="rounded text-amber-500"
                  />
                  <span>भूतपूर्व सैनिक (Ex-Serviceman)</span>
                </label>
              </div>

              {/* Qualifications */}
              <div>
                <label className="block text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                  शैक्षणिक योग्यताएं ({editQualifications.length} चुनी गईं)
                </label>
                <div className="max-h-36 overflow-y-auto space-y-1 p-2 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-200 dark:border-slate-800">
                  {MASTER_QUALIFICATIONS.map((q) => {
                    const isChecked = editQualifications.includes(q);
                    return (
                      <label key={q} className="flex items-start gap-2 p-1 text-[11px] cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-850 rounded">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setEditQualifications((prev) =>
                              isChecked ? prev.filter((x) => x !== q) : [...prev, q]
                            );
                          }}
                          className="mt-0.5 rounded text-amber-500 shrink-0"
                        />
                        <span>{q}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setEditingCandidate(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                onClick={saveCandidateEdit}
                disabled={busyAction === 'saveEdit'}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                {busyAction === 'saveEdit' ? 'सहेजा जा रहा है…' : 'बदलाव सहेजें (Save Changes)'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Candidate Confirmation Modal */}
      {candidateToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-800 rounded-2xl max-w-sm w-full p-5 space-y-3 shadow-2xl text-xs">
            <div className="flex items-center gap-2 text-rose-600 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>उम्मीदवार रिकॉर्ड विलोपन (Delete)</span>
            </div>
            <p className="text-slate-700 dark:text-slate-300">
              क्या आप रोल नंबर <strong className="font-mono text-slate-900 dark:text-white">{candidateToDelete.rollNumber}</strong> ({candidateToDelete.candidateNamePrivate || candidateToDelete.candidateNamePublic}) का रिकॉर्ड डेटाबेस से हटाना चाहते हैं?
            </p>
            <p className="text-[11px] text-slate-500">
              यह क्रिया अपरिवर्तनीय है। संबंधित छात्र की रैंक और गणना डेटाबेस से हटा दी जाएगी।
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setCandidateToDelete(null)}
                className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                रद्द करें
              </button>
              <button
                onClick={confirmDeleteCandidate}
                disabled={busyAction === 'deleteCand'}
                className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
              >
                {busyAction === 'deleteCand' ? 'हटाया जा रहा है…' : 'हाँ, रिकॉर्ड हटाएं'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PDF Printable Modal with Watermark */}
      {showPdfModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xs flex flex-col items-center justify-center p-2 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:static print:inset-auto">
          {/* Modal Toolbar (hidden in print) */}
          <div className="w-full max-w-5xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-t-2xl p-4 flex items-center justify-between gap-3 shadow-xl print:hidden">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  PDF प्रिंट व डाउनलोड प्रीव्यू (PDF Report with Watermark)
                </h3>
                <p className="text-[11px] text-slate-500">
                  वाटरमार्क: <strong>TOPPER VIEW</strong> · Owner: <strong>@LODHIJI27 (Telegram)</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={triggerPdfPrint}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-md transition-colors cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>प्रिंट / PDF के रूप में सहेजें</span>
              </button>
              <button
                onClick={() => setShowPdfModal(false)}
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Printable Report Sheet */}
          <div className="w-full max-w-5xl bg-white text-slate-900 border border-slate-300 p-6 sm:p-8 rounded-b-2xl shadow-2xl relative overflow-hidden print:border-none print:shadow-none print:p-0 print:max-w-none">
            {/* Repeating Background Watermarks (Repeats on every printed page via fixed position in print) */}
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-around items-center select-none overflow-hidden print:fixed print:inset-0 opacity-[0.06] z-0">
              {[1, 2, 3].map((idx) => (
                <div key={idx} className="transform -rotate-[32deg] text-center my-16">
                  <div className="text-7xl sm:text-8xl font-black text-amber-900 tracking-widest uppercase">
                    TOPPER VIEW
                  </div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-wider mt-2">
                    Owner: @LODHIJI27 (Telegram)
                  </div>
                </div>
              ))}
            </div>

            {/* Document Header */}
            <div className="relative z-10 border-b-2 border-slate-800 pb-4 mb-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-900 uppercase">
                    मध्य प्रदेश कर्मचारी चयन मण्डल (MPESB), भोपाल
                  </h1>
                  <h2 className="text-base font-bold text-amber-800 mt-0.5">
                    Group-2 Sub-Group-4 परीक्षा 2026 — अधिकृत मेरिट व फ़िल्टर सूची
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    सत्यापित उत्तर कुंजियों पर आधारित रॉ स्कोर रैंकिंग रिपोर्ट
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-600 space-y-0.5 font-mono">
                  <div>दिनांक: {new Date().toLocaleDateString('hi-IN')}</div>
                  <div>समय: {new Date().toLocaleTimeString('hi-IN')}</div>
                  <div className="font-bold text-amber-800">वाटरमार्क: TOPPER VIEW</div>
                  <div className="text-slate-700">@LODHIJI27</div>
                </div>
              </div>

              {/* Filter summary bar in report */}
              <div className="mt-4 p-2.5 bg-slate-100 rounded-lg text-xs grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono">
                <div>कुल अभ्यर्थी: <strong>{filteredCandidates.length}</strong></div>
                <div>औसत स्कोर: <strong>{(filteredCandidates.reduce((acc, c) => acc + c.rawScore, 0) / Math.max(1, filteredCandidates.length)).toFixed(2)}</strong></div>
                <div>सर्वोच्च अंक: <strong>{filteredCandidates.length > 0 ? filteredCandidates[0].rawScore.toFixed(2) : 0}</strong></div>
                <div>न्यूनतम अंक: <strong>{filteredCandidates.length > 0 ? filteredCandidates[filteredCandidates.length - 1].rawScore.toFixed(2) : 0}</strong></div>
              </div>
            </div>

            {/* Candidate Table in Printable Document */}
            <div className="relative z-10 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-800 bg-slate-100 text-slate-900 font-bold uppercase text-[10px]">
                    <th className="py-2 px-2 text-center w-12">रैंक</th>
                    <th className="py-2 px-2">रोल नंबर</th>
                    <th className="py-2 px-2">अभ्यर्थी का नाम</th>
                    <th className="py-2 px-2">शिफ्ट</th>
                    <th className="py-2 px-2">श्रेणी</th>
                    <th className="py-2 px-2">लिंग</th>
                    <th className="py-2 px-2">कोटा</th>
                    <th className="py-2 px-2 text-right">सही</th>
                    <th className="py-2 px-2 text-right">गलत</th>
                    <th className="py-2 px-2 text-right font-black">रॉ मार्क्स</th>
                    <th className="py-2 px-2 text-right">सटीकता</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {filteredCandidates.map((c, idx) => (
                    <tr key={c.rollNumber} className="hover:bg-slate-50">
                      <td className="py-1.5 px-2 text-center font-bold">#{idx + 1}</td>
                      <td className="py-1.5 px-2 font-semibold text-slate-900">{c.rollNumber}</td>
                      <td className="py-1.5 px-2 font-sans font-medium text-slate-800">
                        {unmaskNames ? (c.candidateNamePrivate || c.candidateNamePublic) : c.candidateNamePublic}
                      </td>
                      <td className="py-1.5 px-2 font-sans text-slate-700">Shift {c.shiftNumber}</td>
                      <td className="py-1.5 px-2 font-sans font-medium">{c.category}</td>
                      <td className="py-1.5 px-2 font-sans">{c.gender === 'Male' ? 'पुरुष' : 'महिला'}</td>
                      <td className="py-1.5 px-2 font-sans text-[10px]">
                        {c.contractStatus ? 'संविदा' : c.exServiceman ? 'Ex-SM' : '—'}
                      </td>
                      <td className="py-1.5 px-2 text-right text-emerald-800">{c.correct}</td>
                      <td className="py-1.5 px-2 text-right text-rose-800">{c.wrong}</td>
                      <td className="py-1.5 px-2 text-right font-black text-amber-900">{c.rawScore.toFixed(2)}</td>
                      <td className="py-1.5 px-2 text-right">{c.accuracy}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Document Footer */}
            <div className="relative z-10 mt-6 pt-3 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500">
              <span>MPESB Group-2 Sub-Group-4 परीक्षा 2026 मेरिट रिपोर्ट</span>
              <span className="font-bold">वाटरमार्क: TOPPER VIEW — Telegram: @LODHIJI27</span>
              <span>पृष्ठ 1 / 1</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
