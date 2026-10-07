/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Send, Globe, MessageSquareText, X, Sparkles } from 'lucide-react';
import { PROMO_LINKS, PROMO_DISMISS_KEY } from './promoLinks';

const ICONS = {
  send: Send,
  globe: Globe,
  chat: MessageSquareText,
} as const;

interface PromoModalProps {
  /** Forced open by the footer/"दिखाएँ" link even after dismissal. */
  open?: boolean;
  onClose?: () => void;
}

/**
 * First-visit popup with the three community links.
 *
 * Rules that matter:
 *  - appears once per browser (localStorage), never nags again
 *  - closed by ✕, by the button, by Esc or by clicking the dark backdrop
 *  - does NOT block anything: no auto-redirect, no data collection, the app is
 *    fully usable behind it and the user's paste state is untouched
 *  - no autofocus into a link, only the dismiss control is focused, so Enter
 *    never opens a third-party site by accident
 */
export function PromoModal({ open, onClose }: PromoModalProps) {
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false); // drives the enter animation
  const closeRef = useRef<HTMLButtonElement>(null);

  const forced = open === true;

  useEffect(() => {
    if (forced) {
      setVisible(true);
      return;
    }
    let seenBefore = false;
    try {
      seenBefore = window.localStorage.getItem(PROMO_DISMISS_KEY) === '1';
    } catch {
      seenBefore = false; // private mode / storage blocked → show it once
    }
    if (!seenBefore) setVisible(true);
  }, [forced]);

  useEffect(() => {
    if (!visible) return;
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') dismiss();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      setShown(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(PROMO_DISMISS_KEY, '1');
    } catch {
      /* storage disabled — fine, the popup simply shows again */
    }
    onClose?.();
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="promo-title"
    >
      <div
        className={`absolute inset-0 bg-slate-950/70 backdrop-blur-[2px] transition-opacity duration-200 ${
          shown ? 'opacity-100' : 'opacity-0'
        }`}
        onClick={dismiss}
        aria-hidden="true"
      />

      <div
        className={`relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl transition-all duration-200 dark:border-slate-800 dark:bg-slate-900 ${
          shown ? 'translate-y-0 scale-100 opacity-100' : 'translate-y-3 scale-[0.98] opacity-0'
        }`}
      >
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 px-5 pt-5 pb-4 text-white dark:from-slate-800 dark:to-slate-900">
          <button
            ref={closeRef}
            type="button"
            onClick={dismiss}
            aria-label="बंद करें"
            className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
          >
            <X className="h-4 w-4" />
          </button>

          <p className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
            <Sparkles className="h-3 w-3" />
            Rank Mitra
          </p>
          <h2 id="promo-title" className="mt-2 text-lg font-extrabold leading-snug">
            उत्तर कुंजी पेस्ट कीजिए, रैंक तुरंत देखिए
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-slate-300">
            MPESB Group-2 / Sub-Group-4 — मोबाइल, टैबलेट और लैपटॉप सब पर। कोई फ़ाइल
            अपलोड नहीं, कोई रजिस्ट्रेशन नहीं।
          </p>
        </div>

        <div className="space-y-2 px-4 py-4 sm:px-5">
          {PROMO_LINKS.map((link) => {
            const Icon = ICONS[link.icon];
            return (
              <a
                key={link.key}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="group flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 transition-colors hover:border-amber-400 hover:bg-amber-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:border-slate-800 dark:bg-slate-950/60 dark:hover:border-amber-500/60 dark:hover:bg-slate-900"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-amber-300 dark:bg-slate-800">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">
                    {link.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                    {link.note}
                  </span>
                </span>
              </a>
            );
          })}
        </div>

        <div className="border-t border-slate-100 px-4 py-3 dark:border-slate-800 sm:px-5">
          <button
            type="button"
            onClick={dismiss}
            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-400 dark:text-slate-900 dark:hover:bg-amber-300"
          >
            बंद करें और रैंक देखें
          </button>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            यह विंडो एक बार दिखती है · आपका पेस्ट किया हुआ टेक्स्ट सुरक्षित रहता है
          </p>
        </div>
      </div>
    </div>
  );
}
