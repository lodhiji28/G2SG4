/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Send, Globe, MessageSquareText, MessageCircle, X, ExternalLink, Sparkles } from 'lucide-react';
import { PROMO_LINKS } from './promoLinks';

const ICONS = {
  send: Send,
  globe: Globe,
  chat: MessageSquareText,
} as const;

/**
 * Floating side community widget.
 * Sits unobtrusively on the screen edge and expands into a premium popup card on click.
 */
export function FloatingCommunityWidget() {
  const [isOpen, setIsOpen] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {/* Floating launcher badge on the bottom-right */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-expanded={isOpen}
          aria-label="कम्युनिटी व सहायता संपर्क खोलें"
          className="group relative flex items-center gap-2 rounded-full border border-amber-400/40 bg-gradient-to-r from-slate-900 via-amber-950 to-slate-900 px-3.5 py-2.5 text-white shadow-xl shadow-amber-950/30 transition-all hover:scale-105 hover:border-amber-400 hover:shadow-amber-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {/* Animated pulse ring */}
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
          </span>

          <MessageCircle className="h-4 w-4 text-amber-300 transition-transform group-hover:rotate-12" />
          <span className="text-xs font-bold tracking-tight text-amber-100 sm:inline">
            कम्युनिटी हब
          </span>
        </button>
      </div>

      {/* Floating popup card */}
      {isOpen && (
        <div className="fixed bottom-20 right-5 z-50 w-[calc(100vw-2.5rem)] max-w-sm animate-in fade-in slide-in-from-bottom-4 duration-200">
          <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-slate-900/95 p-4 text-slate-100 shadow-2xl shadow-black/60 backdrop-blur-md dark:border-amber-500/30 dark:bg-slate-950/95">
            {/* Header */}
            <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="grid h-7 w-7 place-items-center rounded-lg bg-amber-500/20 text-amber-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">MPESB G2SG4 कम्युनिटी</h3>
                  <p className="text-[10px] text-slate-400">अपडेट्स, PYQ और सीधा सहयोग</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="बंद करें"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Links list */}
            <div className="space-y-2">
              {PROMO_LINKS.map((link) => {
                const Icon = ICONS[link.icon];
                return (
                  <a
                    key={link.key}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="group flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-800/60 p-2.5 transition hover:border-amber-500/50 hover:bg-slate-800 hover:shadow-md"
                  >
                    <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-100 group-hover:text-amber-300">
                          {link.label}
                        </span>
                        <ExternalLink className="h-3 w-3 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-amber-400" />
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[10.5px] text-slate-400">
                        {link.note}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>

            <div className="mt-3 border-t border-slate-800/80 pt-2 text-center text-[10px] text-slate-400">
              सभी लिंक सुरक्षित व निःशुल्क हैं · निष्पक्ष छात्र मंच
            </div>
          </div>
        </div>
      )}
    </>
  );
}
