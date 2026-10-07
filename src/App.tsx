/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { CandidateRecord, ShiftStats } from './types';
import {
  getCurrentUserRoll,
  setCurrentUserRoll,
  getLastRefreshTime,
  updateRefreshTime,
} from './lib/storage';
import { repository } from './lib/repository';
import type { SyncMeta } from './lib/storage';
import type { ServerStats } from './lib/api';
import { calculateShiftStats } from './lib/ranking';
import { Navbar, NavTab } from './components/Navbar';
import { DashboardView } from './components/DashboardView';
import { ShiftAnalysisView } from './components/ShiftAnalysisView';
import { ShiftCompareView } from './components/ShiftCompareView';
import { LeaderboardView } from './components/LeaderboardView';
import { MyProfileRankView } from './components/MyProfileRankView';
import { PasteAnswerKeyView } from './components/PasteAnswerKeyView';
import { TopPasteGuide } from './components/TopPasteGuide';
import { PromoBar } from './components/PromoBar';
import { PromoModal } from './components/PromoModal';
import { FloatingCommunityWidget } from './components/FloatingCommunityWidget';
import { PROMO_LINKS } from './components/promoLinks';
import { MethodologyView } from './components/MethodologyView';
import { AdminView } from './components/AdminView';
import { DataStorageSyncBar } from './components/DataStorageSyncBar';

/** Shared with the server's own cache TTL (core/config.js → CACHE_MAX_AGE). */
const REFRESH_MS = 60 * 60 * 1000;

export default function App() {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [candidates, setCandidates] = useState<CandidateRecord[]>([]);
  const [currentUserRoll, setCurrentUserRollState] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState<SyncMeta>({
    mode: repository.databaseConfigured ? 'offline' : 'local',
    total: 0,
    revision: 0,
    lastSyncAt: null,
    pending: 0,
    synced: 0,
  });
  const [serverStats, setServerStats] = useState<ServerStats | null>(null);
  const refreshingRef = useRef(false);

  // Shift compare initial params
  const [compareShiftA, setCompareShiftA] = useState<number>(1);
  const [compareShiftB, setCompareShiftB] = useState<number>(2);

  /**
   * Single data entry point.
   * - pulls the public leaderboard page from the API (revalidated with an ETag,
   *   so an unchanged dataset costs one 304 instead of a full download)
   * - replays anything the user submitted while offline
   * - falls back to the local mirror when the API is unreachable
   */
  const refresh = useCallback(async (opts: { silent?: boolean } = {}) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!opts.silent) setLoading(true);
    try {
      const result = await repository.refreshAll();
      setCandidates(result.candidates);
      setSync(result.sync);
      if (result.serverStats) setServerStats(result.serverStats);
      updateRefreshTime();
      setLastRefresh(new Date());
    } finally {
      refreshingRef.current = false;
      setLoading(false);
    }
  }, []);

  /**
   * Refresh cadence: ONE hour, not the earlier 30 minutes.
   *
   * Two reasons, both about the free hosting the project lives on:
   *  - egress: every refresh pulls the leaderboard JSON; halving the polls
   *    halves the bytes out of the database
   *  - it is enough: the numbers only change when somebody submits, and a
   *    manual "रिफ्रेश करें" plus the `online`/`focus` listeners below already
   *    cover the "I just submitted" case instantly
   */
  useEffect(() => {
    setCandidates(repository.databaseConfigured ? candidates : candidates);
    const loaded = getLastRefreshTime();
    setLastRefresh(loaded);
    setCurrentUserRollState(getCurrentUserRoll());
    setSync(repository.syncMeta());

    void refresh({ silent: true });

    const interval = window.setInterval(() => void refresh({ silent: true }), REFRESH_MS);
    const onOnline = () => void refresh({ silent: true });
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onOnline);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  // Compute shift stats across dataset (server aggregates win when available)
  const shiftStats: ShiftStats[] = useMemo(() => {
    return calculateShiftStats(candidates, serverStats);
  }, [candidates, serverStats]);

  const handleManualRefresh = () => void refresh();

  // Callback when a user successfully submits their key
  const handleSubmissionSuccess = (submittedRoll: string) => {
    setCurrentUserRollState(submittedRoll);
    setCurrentUserRoll(submittedRoll);
    setActiveTab('my-rank');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    void refresh({ silent: true });
  };

  // Callback to compare two shifts from shift analysis table
  const handleTriggerCompare = (shiftA: number, shiftB: number) => {
    setCompareShiftA(shiftA);
    setCompareShiftB(shiftB);
    setActiveTab('compare');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Callback when clicking a candidate in leaderboard
  const handleSelectCandidate = (candidate: CandidateRecord) => {
    setCurrentUserRollState(candidate.rollNumber);
    setCurrentUserRoll(candidate.rollNumber);
    setActiveTab('my-rank');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-800 dark:selection:text-amber-200 transition-colors">
      {/* Community strip: Telegram channel, MP Sipyq, contact the owner */}
      <PromoBar />

      {/* The only instruction that matters, above the header, always reachable */}
      <TopPasteGuide
        onGoPaste={() => {
          setActiveTab('upload');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* 3-Zone Top Bar & Mobile Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        lastRefresh={lastRefresh}
        onRefreshClick={handleManualRefresh}
        hasUserSubmitted={Boolean(currentUserRoll)}
        sync={sync}
        loading={loading}
      />

      {/* Data source / offline queue strip */}
      <DataStorageSyncBar
        sync={sync}
        loading={loading}
        onRetry={() => void refresh()}
        onDismissDuplicates={() => void refresh({ silent: true })}
      />

      {/* Main Viewport Container (1440px baseline with responsive padding) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-20 lg:pb-12">
        {activeTab === 'dashboard' && (
          <DashboardView
            candidates={candidates}
            shiftStats={shiftStats}
            lastRefresh={lastRefresh}
            serverStats={serverStats}
            onNavigate={(tab) => {
              setActiveTab(tab);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {activeTab === 'shifts' && (
          <ShiftAnalysisView
            candidates={candidates}
            shiftStats={shiftStats}
            onCompareShifts={handleTriggerCompare}
          />
        )}

        {activeTab === 'compare' && (
          <ShiftCompareView
            candidates={candidates}
            shiftStats={shiftStats}
            initialShiftA={compareShiftA}
            initialShiftB={compareShiftB}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardView
            candidates={candidates}
            currentUserRoll={currentUserRoll}
            onSelectCandidate={handleSelectCandidate}
          />
        )}

        {activeTab === 'my-rank' && (
          <MyProfileRankView
            candidates={candidates}
            currentUserRoll={currentUserRoll}
            onSelectRoll={(roll) => {
              setCurrentUserRollState(roll);
              setCurrentUserRoll(roll);
            }}
            onNavigateToUpload={() => {
              setActiveTab('upload');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onDataChanged={() => void refresh({ silent: true })}
          />
        )}

        {activeTab === 'upload' && (
          <PasteAnswerKeyView
            onSubmissionSuccess={handleSubmissionSuccess}
            knownRolls={candidates.map((c) => c.rollNumber)}
          />
        )}

        {activeTab === 'methodology' && <MethodologyView candidates={candidates} />}

        {activeTab === 'admin' && (
          <AdminView
            candidates={candidates}
            shiftStats={shiftStats}
            onRefreshData={handleManualRefresh}
            sync={sync}
          />
        )}
      </main>

      {/* Bottom Community Banner */}
      <section className="border-t border-amber-500/20 bg-gradient-to-r from-slate-900 via-slate-950 to-amber-950/80 px-4 py-4 text-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <div>
            <h4 className="text-sm font-bold text-amber-300">
              MPESB G2SG4 आधिकारिक अपडेट्स व PYQs
            </h4>
            <p className="text-xs text-slate-300">
              TopperView Telegram चैनल, MP Sipyq और सहायता के लिए हमसे जुड़े रहें।
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {PROMO_LINKS.map((link) => (
              <a
                key={link.key}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/20 hover:text-white"
              >
                <span>{link.short}</span>
                <span className="text-[10px] text-amber-400">↗</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Clean Trustworthy Footer */}
      <footer className="bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs py-8 px-4 sm:px-6 lg:px-8 mt-auto transition-colors">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start gap-2">
              <span className="font-bold text-slate-900 dark:text-white text-sm">MPESB G2SG4</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
                MPESB Group-2 Sub-Group-4
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 max-w-xl">
              यह एक निष्पक्ष व स्वतंत्र छात्र विश्लेषण मंच है। प्रदर्शित आंकड़े केवल सबमिट की गई उत्तर कुंजियों के रॉ मार्क्स पर आधारित हैं।
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium text-slate-600 dark:text-slate-400">
            <button
              onClick={() => {
                setActiveTab('methodology');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              गणना नियम
            </button>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            <button
              onClick={() => {
                setActiveTab('admin');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors cursor-pointer"
            >
              प्रशासक पोर्टल
            </button>
            <span className="text-slate-300 dark:text-slate-700">·</span>
            {PROMO_LINKS.map((link) => (
              <a
                key={link.key}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="hover:text-amber-600 dark:hover:text-amber-400 transition-colors"
              >
                {link.short}
              </a>
            ))}
          </div>
        </div>
      </footer>

      {/* First-visit popup — one-time, dismissible with ✕ / Esc / बाहर का क्लिक */}
      <PromoModal />

      {/* Floating community hub on side */}
      <FloatingCommunityWidget />
    </div>
  );
}
