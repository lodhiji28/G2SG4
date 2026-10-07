/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Send, Globe, MessageSquareText } from 'lucide-react';
import { PROMO_LINKS } from './promoLinks';

const ICONS = {
  send: Send,
  globe: Globe,
  chat: MessageSquareText,
} as const;

/**
 * Thin community strip shown on every page, above the paste guide.
 * Three links only — Telegram channel, MP Sipyq, contact the owner.
 *
 * It is deliberately light: no fixed height, no z-index war with the sticky
 * header, and on small screens it just scrolls sideways instead of wrapping
 * into three tall rows.
 */
export function PromoBar() {
  return (
    <div className="w-full bg-slate-900 text-slate-100 dark:bg-black border-b border-slate-800">
      <div className="w-full px-3 py-1.5 flex items-center gap-2 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:justify-center sm:flex-wrap sm:whitespace-normal">
        <span className="shrink-0 text-[11px] font-bold tracking-wide text-amber-300 sm:hidden">
          जुड़ें
        </span>
        {PROMO_LINKS.map((link) => {
          const Icon = ICONS[link.icon];
          return (
            <a
              key={link.key}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              title={link.note}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:border-amber-400/60 hover:text-white px-2.5 py-1 text-[11px] sm:text-xs font-semibold transition-colors"
            >
              <Icon className="h-3.5 w-3.5 text-amber-300" />
              {link.short}
            </a>
          );
        })}
      </div>
    </div>
  );
}
