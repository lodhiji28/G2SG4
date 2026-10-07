/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * The three community links that appear in both the persistent banner
 * (PromoBar) and the first-visit popup (PromoModal).
 *
 * Kept in ONE place so a link is never half-updated.
 */
export const PROMO_LINKS = [
  {
    key: 'telegram',
    label: 'Telegram चैनल — TopperView',
    short: 'Telegram चैनल',
    note: 'नोटिफ़िकेशन, आंसर की और अपडेट यहीं मिलेंगे',
    url: 'https://t.me/TopperView',
    icon: 'send' as const,
  },
  {
    key: 'website',
    label: 'MP Sipyq — आंसर की व टूल',
    short: 'MP Sipyq',
    note: 'सभी परीक्षाओं की आंसर की, ओएमआर और रैंक टूल',
    url: 'https://mpsipyq.netlify.app/',
    icon: 'globe' as const,
  },
  {
    key: 'owner',
    label: 'ओनर से संपर्क करें',
    short: 'संपर्क करें',
    note: 'कोई समस्या या सुझाव? सीधे मैसेज भेजें',
    url: 'https://t.me/LODHIJI27',
    icon: 'chat' as const,
  },
] as const;

export type PromoLink = (typeof PROMO_LINKS)[number];

/** localStorage key that remembers the popup was closed. */
export const PROMO_DISMISS_KEY = 'rankmitra.promo.dismissed.v1';
