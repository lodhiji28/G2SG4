import React from 'react';
import { Database, CloudOff, HardDriveDownload, RefreshCw, Wifi, Inbox } from 'lucide-react';
import type { SyncMeta } from '../lib/storage';

interface Props {
  sync: SyncMeta;
  loading?: boolean;
  onRetry: () => void;
  onDismissDuplicates?: () => void;
}

/**
 * One honest line about where the data is coming from right now:
 * live database · cached copy · offline queue.
 */
export const DataStorageSyncBar: React.FC<Props> = ({ sync, loading = false, onRetry }) => {
  const [dismissed, setDismissed] = React.useState(false);
  const pending = sync.pending || 0;
  const offline = sync.mode === 'offline';
  const local = sync.mode === 'local';

  if (local && !pending) {
    return (
      <div className="bg-slate-100 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 px-4 py-1.5 text-[11px] text-slate-600 dark:text-slate-400">
        <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
          <HardDriveDownload className="w-3.5 h-3.5 shrink-0" />
          <span>
            <b>स्थानीय मोड:</b> कोई डेटाबेस नहीं जुड़ा, इसलिए डेटा केवल इसी ब्राउज़र में सहेजा जा रहा है (अन्य
            उम्मीदवारों की रैंक दिखाई नहीं देगी)। लाइव साइट के लिए <code className="font-mono">DATABASE_URL</code> या
            Cloudflare D1 जोड़ें।
          </span>
        </div>
      </div>
    );
  }

  if (!offline && !pending && !sync.lastError) {
    return (
      <div className="bg-emerald-50/70 dark:bg-emerald-950/20 border-b border-emerald-200/70 dark:border-emerald-900/40 px-4 py-1.5 text-[11px] text-emerald-800 dark:text-emerald-300">
        <div className="max-w-7xl mx-auto flex items-center gap-3 flex-wrap">
          <span className="flex items-center gap-1.5 font-semibold">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
            <span>लाइव डेटाबेस से जुड़ा</span>
          </span>
          <span className="text-emerald-700/80 dark:text-emerald-400/80">
            {sync.total} प्रविष्टियाँ · revision #{sync.revision}
            {sync.lastSyncAt ? ` · अंतिम सिंक ${new Date(sync.lastSyncAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
          </span>
          <span className="ml-auto flex items-center gap-1 text-[10px] text-emerald-700/70 dark:text-emerald-400/70">
            <Wifi className="w-3 h-3" /> cached revalidation (ETag)
          </span>
        </div>
      </div>
    );
  }

  if (dismissed && !pending) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/25 border-b border-amber-200 dark:border-amber-900/50 px-4 py-1.5 text-[11px] text-amber-900 dark:text-amber-200">
      <div className="max-w-7xl mx-auto flex items-center gap-2 flex-wrap">
        <CloudOff className="w-3.5 h-3.5 shrink-0" />
        <span>
          {offline
            ? 'डेटाबेस से संपर्क नहीं हो पा रहा — अंतिम सहेजी गई प्रतियाँ दिखाई जा रही हैं।'
            : 'कुछ प्रविष्टियाँ अभी केवल इस ब्राउज़र में हैं।'}
          {pending > 0 && (
            <b className="ml-1 inline-flex items-center gap-1">
              <Inbox className="w-3 h-3" />
              {pending} भेजी नहीं गईं
            </b>
          )}
          {sync.lastError ? <span className="ml-1 text-amber-700/80 dark:text-amber-300/80">({sync.lastError})</span> : null}
        </span>
        <button
          onClick={onRetry}
          className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold cursor-pointer"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          <span>पुनः प्रयास करें</span>
        </button>
        {dismissed === false && offline && (
          <button
            onClick={() => setDismissed(true)}
            className="text-amber-700/70 hover:text-amber-900 dark:hover:text-amber-100 underline cursor-pointer"
          >
            छिपाएँ
          </button>
        )}
      </div>
    </div>
  );
};
