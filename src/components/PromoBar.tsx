/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Send, Globe, MessageSquareText, Sparkles, ExternalLink } from 'lucide-react';
import { PROMO_LINKS } from './promoLinks';

const ICONS = {
  send: Send,
  globe: Globe,
  chat: MessageSquareText,
} as const;

/**
 * Premium community announcement banner shown at the top of every page.
 * Provides instant access to TopperView Telegram, MP Sipyq, and Owner support.
 */
export function PromoBar() {
  return (
    <div className="relative w-full border-b border-amber-500/20 bg-gradient-to-r from-slate-950 via-slate-900 to-amber-950/90 text-slate-100 shadow-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-2 sm:px-6">
        {/* Left Badge: Live / Official Notice */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="flex h-2 w-2 relative">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
          </span>
          <span className="hidden items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-amber-300 md:inline-flex">
            <Sparkles className="h-3 w-3" />
            MPESB G2SG4 कम्युनिटी हब
          </span>
          <span className="text-[11px] font-bold text-amber-300 md:hidden">
            कम्युनिटी
          </span>
        </div>

        {/* Links: horizontal scroll on mobile, flex-wrap centered on tablet/desktop */}
        <div className="flex flex-1 items-center justify-end gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-2.5">
          {PROMO_LINKS.map((link) => {
            const Icon = ICONS[link.icon];
            return (
              <a
                key={link.key}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                title={link.note}
                className="group shrink-0 inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-slate-800/80 px-3 py-1 text-[11px] font-semibold text-slate-200 shadow-sm transition-all hover:scale-[1.02] hover:border-amber-400 hover:bg-slate-800 hover:text-white hover:shadow-amber-500/10 sm:text-xs"
              >
                <Icon className="h-3.5 w-3.5 text-amber-400 transition-transform group-hover:scale-110" />
                <span>{link.label}</span>
                <ExternalLink className="h-3 w-3 text-slate-400 opacity-60 transition group-hover:opacity-100" />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
