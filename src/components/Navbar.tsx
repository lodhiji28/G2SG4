import React, { useState } from 'react';
import type { SyncMeta } from '../lib/storage';
import { 
  BarChart3, 
  GitCompare, 
  Trophy, 
  Briefcase, 
  UserCheck, 
  BookOpen, 
  Upload, 
  Shield, 
  Menu, 
  X, 
  Clock,
  Sun,
  Moon
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';

export type NavTab = 
  | 'dashboard' 
  | 'shifts' 
  | 'compare' 
  | 'leaderboard' 
  | 'my-rank' 
  | 'upload' 
  | 'methodology' 
  | 'admin';

interface NavbarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  lastRefresh: Date;
  onRefreshClick: () => void;
  hasUserSubmitted: boolean;
  /** Where the numbers on screen came from (live DB / cache / browser only). */
  sync?: SyncMeta;
  loading?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  lastRefresh,
  onRefreshClick,
  hasUserSubmitted,
  sync,
  loading = false,
}) => {
  const mode = sync?.mode ?? 'local';
  const dotClass =
    mode === 'live' ? 'bg-emerald-500' : mode === 'offline' ? 'bg-amber-500' : 'bg-slate-400';
  const liveCount = (sync?.total ?? 0) + (sync?.pending ?? 0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const formatRefreshTime = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const navItems = [
    { id: 'dashboard', label: 'डैशबोर्ड', icon: BarChart3 },
    { id: 'shifts', label: '22 शिफ्ट्स', icon: BarChart3 },
    { id: 'compare', label: 'तुलना (Compare)', icon: GitCompare },
    { id: 'leaderboard', label: 'लीडरबोर्ड', icon: Trophy },
    { id: 'my-rank', label: hasUserSubmitted ? 'मेरी रैंक' : 'रैंक कार्ड', icon: UserCheck, highlight: hasUserSubmitted },
    { id: 'methodology', label: 'नियम व पद्धति', icon: BookOpen },
  ];

  return (
    <>
      <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-950/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Zone 1: Brand Wordmark */}
            <div className="flex items-center gap-3 shrink-0">
              <button 
                onClick={() => onTabChange('dashboard')} 
                className="flex items-center gap-2.5 text-left group focus:outline-none cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center font-bold text-slate-950 text-sm shadow-sm">
                  ESB
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                      MPESB G2SG4
                    </span>
                    <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                      पटवारी व अन्य
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block truncate max-w-[200px]">
                    उत्तर कुंजी व रैंक विश्लेषक
                  </p>
                </div>
              </button>
            </div>

            {/* Zone 2: Navigation Links (Desktop) */}
            <nav className="hidden lg:flex items-center gap-1 xl:gap-2 text-xs xl:text-sm font-medium">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onTabChange(item.id as NavTab)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                      isActive
                        ? 'text-slate-900 bg-slate-100 dark:text-white dark:bg-slate-800 font-semibold shadow-inner'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-900'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-slate-500 dark:text-slate-400" />
                    <span>{item.label}</span>
                    {item.highlight && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
                    )}
                  </button>
                );
              })}
            </nav>

            {/* Zone 3: Actions (Theme Toggle, Upload CTA & Cache Freshness) */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Theme Toggle Button (Light/Dark) */}
              <button
                onClick={toggleTheme}
                title={theme === 'dark' ? 'लाइट थीम सक्रिय करें (Switch to Light Mode)' : 'डार्क थीम सक्रिय करें (Switch to Dark Mode)'}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-amber-500 dark:hover:text-amber-400 transition-colors cursor-pointer"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-slate-700" />
                )}
              </button>

              {/* Freshness Indicator */}
              <button
                onClick={onRefreshClick}
                title={
                  mode === 'live'
                    ? `लाइव डेटाबेस · ${sync?.total ?? 0} प्रविष्टियाँ · हर 1 घंटे में ताज़ा (ETag + सर्वर कैश से सस्ता)`
                    : mode === 'offline'
                    ? 'डेटाबेस से संपर्क नहीं — सहेजी गई प्रति दिखाई जा रही है। क्लिक कर पुनः प्रयास करें।'
                    : 'कोई डेटाबेस नहीं जुड़ा — डेटा केवल इसी ब्राउज़र में।'
                }
                className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
              >
                <span className={`w-1.5 h-1.5 rounded-full ${dotClass} ${loading ? 'animate-pulse' : ''}`} />
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className="font-mono tabular-nums">{formatRefreshTime(lastRefresh)}</span>
                {liveCount > 0 && (
                  <span className="font-semibold text-slate-600 dark:text-slate-300 tabular-nums">· {liveCount}</span>
                )}
                {sync?.pending ? (
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">+{sync.pending}</span>
                ) : null}
              </button>

              {/* Upload CTA */}
              <button
                onClick={() => onTabChange('upload')}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shadow-sm transition-all cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-amber-400 text-slate-950 font-bold'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                }`}
              >
                <Upload className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">उत्तर कुंजी पेस्ट करें</span>
                <span className="sm:hidden">पेस्ट करें</span>
              </button>

              {/* Admin Link */}
              <button
                onClick={() => onTabChange('admin')}
                title="प्रशासक पैनल (Admin Panel)"
                className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-slate-200 dark:bg-slate-800 text-amber-600 dark:text-amber-400 border-amber-500/40'
                    : 'bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-800 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Shield className="w-4 h-4" />
              </button>

              {/* Mobile Menu Toggle Button */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 lg:hidden rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:text-black dark:hover:text-white cursor-pointer"
                aria-label="Toggle navigation menu"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Slideout Navigation */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 px-4 pt-3 pb-5 space-y-1">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-850 text-xs text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                अंतिम अपडेट: <span className="font-mono text-slate-800 dark:text-slate-300">{formatRefreshTime(lastRefresh)}</span>
              </span>
              <button 
                onClick={() => { onRefreshClick(); setMobileMenuOpen(false); }}
                className="text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
              >
                रिफ्रेश करें
              </button>
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    onTabChange(item.id as NavTab);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-left cursor-pointer ${
                    isActive
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    <span>{item.label}</span>
                  </div>
                  {item.highlight && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      उपलब्ध
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {/* Sticky Bottom Thumb Bar for Mobile Devices */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-950/95 backdrop-blur-lg border-t border-slate-200 dark:border-slate-800 px-2 py-1.5 flex items-center justify-around shadow-md">
        <button
          onClick={() => onTabChange('dashboard')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'dashboard' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>डैशबोर्ड</span>
        </button>

        <button
          onClick={() => onTabChange('shifts')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'shifts' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>शिफ्ट्स</span>
        </button>

        <button
          onClick={() => onTabChange('upload')}
          className="flex flex-col items-center gap-0.5 -mt-3 py-1 px-3 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 text-slate-950 font-bold shadow-lg shadow-amber-500/20 cursor-pointer"
        >
          <Upload className="w-4 h-4" />
          <span className="text-[10px]">पेस्ट करें</span>
        </button>

        <button
          onClick={() => onTabChange('leaderboard')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'leaderboard' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <Trophy className="w-4 h-4" />
          <span>लीडरबोर्ड</span>
        </button>

        <button
          onClick={() => onTabChange('my-rank')}
          className={`flex flex-col items-center gap-0.5 py-1 px-2 rounded-lg text-[10px] font-medium transition-colors cursor-pointer ${
            activeTab === 'my-rank' ? 'text-amber-600 dark:text-amber-400 font-semibold' : 'text-slate-600 dark:text-slate-400'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>मेरी रैंक</span>
        </button>
      </nav>
    </>
  );
};

