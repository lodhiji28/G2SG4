/**
 * Outbound e-mail - built for "free tier only" deployments.
 *
 * Providers (set EMAIL_PROVIDER):
 *   console   - no credentials needed; prints the mail to the server log (dev)
 *   brevo     - 300 e-mails/day free, REST API (fetch only, works on Workers)
 *   resend    - 3,000/month (100/day) free, REST API (fetch only)
 *   smtp      - any SMTP relay incl. Brevo SMTP / Gmail app-password (needs the
 *               optional `nodemailer` dependency; Node runtimes only)
 *
 * Guards so a free quota can never be burned accidentally:
 *   - hard daily cap (EMAIL_DAILY_LIMIT, persisted through email_log)
 *   - one e-mail per address per 24h
 *   - never blocks the user's submission: failures are logged, not thrown.
 */

import { randomId, sha256Hex, nowIso } from './util.js';
import { countEmailsSince, logEmail } from './repo.js';

export const EMAIL_KINDS = {
  REPORT: 'rank_report',
  WELCOME: 'welcome',
  ADMIN_ALERT: 'admin_alert',
  TEST: 'test',
};

class RateKeeper {
  constructor() {
    this.sent = new Map(); // address -> timestamp
  }

  allowed(address, windowMs = 24 * 3600_000) {
    const now = Date.now();
    const last = this.sent.get(address);
    if (last && now - last < windowMs) return false;
    this.sent.set(address, now);
    if (this.sent.size > 5000) {
      // keep the map from growing forever on long-lived servers
      for (const [k, v] of this.sent) if (now - v > windowMs) this.sent.delete(k);
    }
    return true;
  }
}

const keeper = new RateKeeper();

export class EmailService {
  /** @param {ReturnType<import('./config.js').createConfig>} cfg */
  constructor(cfg, db) {
    this.cfg = cfg;
    this.db = db;
    this.provider = cfg.emailProvider || 'console';
    this.configured = this.#isConfigured();
  }

  #isConfigured() {
    const c = this.cfg;
    if (this.provider === 'console') return true;
    if (this.provider === 'brevo') return Boolean(c.brevoApiKey);
    if (this.provider === 'resend') return Boolean(c.resendApiKey);
    if (this.provider === 'smtp') return Boolean(c.smtpUrl || c.smtpHost);
    return false;
  }

  get status() {
    return {
      provider: this.provider,
      configured: this.configured,
      from: this.cfg.emailFrom,
      dailyLimit: this.cfg.emailDailyLimit,
      adminNotify: Boolean(this.cfg.adminEmail),
    };
  }

  /** @returns {Promise<{sent:number}>} */
  async #dailyCount() {
    if (!this.db) return { sent: 0 };
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const sent = await countEmailsSince(this.db, since).catch(() => 0);
    return { sent };
  }

  async #log(entry) {
    if (!this.db) return;
    await logEmail(this.db, entry).catch(() => {});
  }

  /**
   * @param {{to:string, subject:string, html:string, text:string, kind:string}} msg
   */
  async send(msg) {
    const to = String(msg.to || '').trim().toLowerCase();
    if (!to) return { ok: false, skipped: 'no-recipient' };

    if (!keeper.allowed(to)) {
      return { ok: false, skipped: 'already-sent-to-this-address-in-last-24h' };
    }

    const { sent } = await this.#dailyCount();
    if (sent >= this.cfg.emailDailyLimit) {
      return { ok: false, skipped: `daily-limit (${this.cfg.emailDailyLimit}) reached` };
    }

    const payload = {
      id: randomId('mail-'),
      to,
      subject: msg.subject,
      html: msg.html,
      text: msg.text,
      kind: msg.kind || 'generic',
    };

    let result = { ok: false, error: 'unknown provider' };
    try {
      switch (this.provider) {
        case 'brevo':
          result = await this.#sendBrevo(payload);
          break;
        case 'resend':
          result = await this.#sendResend(payload);
          break;
        case 'smtp':
          result = await this.#sendSmtp(payload);
          break;
        case 'console':
        default:
          console.info(
            `\n=== [EMAIL console mode] to: ${payload.to} | ${payload.subject} ===\n${payload.text}\n`
          );
          result = { ok: true, mocked: true };
          break;
      }
    } catch (e) {
      result = { ok: false, error: e.message };
    }

    await this.#log({
      id: payload.id,
      kind: payload.kind,
      toHash: await sha256Hex(to).then((h) => h.slice(0, 16)),
      status: result.ok ? 'sent' : 'failed',
      error: result.error || result.skipped || '',
      createdAt: nowIso(),
    });

    if (!result.ok) console.warn(`[email] ${payload.kind} -> ${to} failed: ${result.error || result.skipped}`);
    return result;
  }

  async #sendBrevo(p) {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': this.cfg.brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: 'Rank Mitra', email: extractEmail(this.cfg.emailFrom) },
        to: [{ email: p.to }],
        subject: p.subject,
        htmlContent: p.html,
        textContent: p.text,
      }),
    });
    if (!res.ok) return { ok: false, error: `Brevo ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, id: (await res.json().catch(() => ({})))?.messageId };
  }

  async #sendResend(p) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.cfg.resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: this.cfg.emailFrom, to: [p.to], subject: p.subject, html: p.html, text: p.text }),
    });
    if (!res.ok) return { ok: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true, id: (await res.json().catch(() => ({})))?.id };
  }

  async #sendSmtp(p) {
    const mod = await importMaybe('nodemailer');
    const nodemailer = mod && (mod.createTransport ? mod : mod.default);
    if (!nodemailer) return { ok: false, error: 'nodemailer is not installed (npm i nodemailer)' };
    const transporter = this.cfg.smtpUrl
      ? nodemailer.createTransport(this.cfg.smtpUrl)
      : nodemailer.createTransport({
          host: this.cfg.smtpHost,
          port: this.cfg.smtpPort,
          secure: this.cfg.smtpSecure,
          auth: this.cfg.smtpUser ? { user: this.cfg.smtpUser, pass: this.cfg.smtpPass } : undefined,
        });
    const info = await transporter.sendMail({
      from: this.cfg.emailFrom,
      to: p.to,
      subject: p.subject,
      text: p.text,
      html: p.html,
    });
    return { ok: true, id: info.messageId };
  }
}

const importMaybe = async (name) => {
  try {
    return await import(/* @vite-ignore */ name);
  } catch {
    return null;
  }
};

function extractEmail(fromHeader) {
  const m = String(fromHeader).match(/[\w.+-]+@[\w.-]+\.\w+/);
  return m ? m[0] : fromHeader;
}

/* ------------------------------------------------------------- templates -- */

const BRAND = `Rank Mitra — MPESB Group-2 / Sub-Group-4`;

function shell(title, bodyHtml) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:'Segoe UI',Roboto,Arial,sans-serif;color:#0f172a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:22px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden">
        <tr><td style="background:#0f172a;color:#fbbf24;padding:16px 20px;font-size:15px;font-weight:700">
          ${escapeHtml(BRAND)}
        </td></tr>
        <tr><td style="padding:20px;font-size:14px;line-height:1.6">${bodyHtml}</td></tr>
        <tr><td style="padding:14px 20px;background:#f8fafc;color:#64748b;font-size:11px;border-top:1px solid #e2e8f0">
          यह ई-मेल Rank Mitra के स्वतंत्र विश्लेषण मंच से भेजा गया है। आधिकारिक उत्तर कुंजी / अंतिम उत्तर कुंजी केवल Vyapam (MPESB) वेबसाइट पर उपलब्ध होती है।
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function kv(rows) {
  return `<table role="presentation" width="100%" cellpadding="6" cellspacing="0" style="font-size:13px;border-collapse:collapse">
${rows
  .map(
    ([k, v]) =>
      `<tr><td style="border-bottom:1px solid #e2e8f0;color:#475569">${escapeHtml(k)}</td>
       <td style="border-bottom:1px solid #e2e8f0;text-align:right;font-weight:700">${escapeHtml(v)}</td></tr>`
  )
  .join('')}
</table>`;
}

/** Candidate's personal analysis report. */
export function renderRankReport({ candidate, rank, shift, percentileNote }) {
  const text = [
    `नमस्ते ${candidate.candidateNamePrivate || candidate.candidateNamePublic},`,
    ``,
    `आपकी MPESB Group-2 Sub-Group-4 उत्तर कुंजी का विश्लेषण पूरा हो गया है।`,
    ``,
    `रोल नंबर: ${candidate.rollNumber}`,
    `शिफ्ट: ${shift}`,
    `कुल प्रश्न: ${candidate.totalQuestions}`,
    `प्रयास किए: ${candidate.attempted}  (सही ${candidate.correct} / गलत ${candidate.wrong} / बिना उत्तर ${candidate.unattempted})`,
    `रॉ स्कोर: ${candidate.rawScore}  (सही +1, गलत -0.25)`,
    `शुद्धता: ${candidate.accuracy}%`,
    ``,
    rank
      ? `रैंक (प्लेटफॉर्म डेटा के आधार पर)\nसभी उम्मीदवार: #${rank.overallRank} / ${rank.totalCandidates}\n${candidate.category} श्रेणी: #${rank.categoryRank} / ${rank.totalCategoryCandidates}\n${candidate.gender}: #${rank.genderRank} / ${rank.totalGenderCandidates}\n${candidate.shiftNumber} नंबर शिफ्ट: #${rank.shiftRank} / ${rank.totalShiftCandidates}\npercentile: ${rank.percentile}`
      : `अभी पर्याप्त डेटा न होने के कारण रैंक की गणना नहीं हो सकी।`,
    ``,
    percentileNote || '',
    ``,
    `यह अनुमानित विश्लेषण है - आधिकारिक परिणाम से इसकी तुलना न करें।`,
  ]
    .filter((l) => l !== undefined)
    .join('\n');

  const html = shell(
    'आपकी Answer Key विश्लेषण रिपोर्ट — Rank Mitra',
    `<p>नमस्ते <b>${escapeHtml(candidate.candidateNamePrivate || candidate.candidateNamePublic)}</b>,</p>
     <p>आपकी उत्तर कुंजी सफलतापूर्वक विश्लेषित हो गई है।</p>
     ${kv([
       ['रोल नंबर', candidate.rollNumber],
       ['शिफ्ट', shift],
       ['प्रयास किए', `${candidate.attempted} / ${candidate.totalQuestions}`],
       ['सही उत्तर', String(candidate.correct)],
       ['गलत उत्तर', String(candidate.wrong)],
       ['बिना उत्तर', String(candidate.unattempted)],
       ['रॉ स्कोर', String(candidate.rawScore)],
       ['शुद्धता', `${candidate.accuracy}%`],
     ])}
     ${
       rank
         ? `<h3 style="font-size:14px;margin:18px 0 6px">रैंक & percentile</h3>${kv([
             ['समग्र रैंक', `#${rank.overallRank} / ${rank.totalCandidates}`],
             [`${candidate.category} श्रेणी रैंक`, `#${rank.categoryRank} / ${rank.totalCategoryCandidates}`],
             [`${candidate.gender} रैंक`, `#${rank.genderRank} / ${rank.totalGenderCandidates}`],
             [`शिफ्ट ${candidate.shiftNumber} रैंक`, `#${rank.shiftRank} / ${rank.totalShiftCandidates}`],
             ['percentile', String(rank.percentile)],
           ])}`
         : ''
     }
     ${percentileNote ? `<p style="margin-top:14px;color:#475569">${escapeHtml(percentileNote)}</p>` : ''}`
  );

  return { subject: `आपकी रैंक विश्लेषण रिपोर्ट — रॉ स्कोर ${candidate.rawScore}`, html, text };
}

/** Admin notification for a new submission. */
export function renderAdminAlert(candidate, total) {
  const text = `नई प्रविष्टि: ${candidate.rollNumber} | शिफ्ट ${candidate.shiftNumber} | स्कोर ${candidate.rawScore} | ${candidate.correct} सही / ${candidate.wrong} गलत | कुल प्रविष्टियाँ: ${total}`;
  const html = shell('नई उत्तर कुंजी प्रविष्टि', `<p>${escapeHtml(text)}</p>`);
  return { subject: `[Rank Mitra] नई प्रविष्टि ${candidate.rollNumber}`, html, text };
}

export function renderTestEmail(target) {
  const text = `Rank Mitra ई-मेल सेटिंग सही काम कर रही है। (${target})`;
  const html = shell('ई-मेल परीक्षण', `<p>${escapeHtml(text)}</p>`);
  return { subject: 'Rank Mitra — ई-मेल सेटअप सत्यापित', html, text };
}
