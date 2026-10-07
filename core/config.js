/**
 * Central runtime configuration.
 *
 * Works in every target this project supports:
 *   - Node (local dev, `node server.js`, Docker, Render, Railway, Fly)
 *   - Vercel Serverless Functions (api/*.js)
 *   - Cloudflare Workers (worker/index.js -> env bindings)
 *
 * Every value has a safe default so the app boots with ZERO configuration
 * (sqlite file on disk + console e-mail). Real credentials only matter when
 * you go live.
 */

const DEFAULTS = {
  EXAM_ID: 'mpesb-g2sg4-2026',
  DB_DRIVER: 'auto',
  SQLITE_PATH: '.data/rank-mitra.sqlite',
  D1_BINDING: 'RANK_MITRA_DB',
  // 1 hour, matching the SPA's own 60-minute refresh (src/App.tsx → REFRESH_MS).
  // Chosen for free-tier hosting: every poll of the leaderboard is a database
  // read plus an egress billable response, so the cache window is the single
  // biggest lever on cost. Freshness is not hurt: a submission bumps the
  // revision, and the revision is re-checked every 20 s (see core/handler.js).
  CACHE_MAX_AGE: '3600',
  SUBMIT_RATE_PER_HOUR: '20',
  ADMIN_TOKEN_TTL_HOURS: '12',
  EMAIL_PROVIDER: 'console',
  EMAIL_DAILY_LIMIT: '200',
  EMAIL_MAX_RECIPIENTS_PER_SUBMIT: '1',
  LOG_LEVEL: 'info',
  SERVE_STATIC: '1',
  PORT: '8787',
};

/** Read one config value across Node env / Workers env. */
function read(env, key) {
  const fromEnv = env && env[key];
  if (fromEnv !== undefined && fromEnv !== null && String(fromEnv).trim() !== '') {
    return String(fromEnv).trim();
  }
  return DEFAULTS[key];
}

function int(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * @param {Record<string, string|undefined>} env process.env or Workers env
 */
export function createConfig(env = {}) {
  const cfg = {
    examId: read(env, 'EXAM_ID'),
    dbDriver: read(env, 'DB_DRIVER').toLowerCase(),
    databaseUrl: read(env, 'DATABASE_URL') || '',
    /** Supabase exposes the same Postgres connection string, so it is supported natively. */
    supabaseUrl: read(env, 'SUPABASE_URL') || '',
    supabaseServiceKey: read(env, 'SUPABASE_SERVICE_ROLE_KEY') || '',
    sqlitePath: read(env, 'SQLITE_PATH'),
    d1Binding: read(env, 'D1_BINDING'),
    d1BindingAlt: 'DB',
    cacheMaxAge: int(read(env, 'CACHE_MAX_AGE'), 3600),
    // Blueprint #43: students get no self-service delete. Set ALLOW_SELF_DELETE=1
  // to let the claim-token owner remove their own row.
  allowSelfDelete: int(read(env, 'ALLOW_SELF_DELETE'), 0) === 1,
  // Keep the per-question 0/1/2 pattern in the DB? Default off (see core/util.js).
  storeQuestionPattern: int(read(env, 'STORE_QUESTION_PATTERN'), 0) === 1,
  submitRatePerHour: int(read(env, 'SUBMIT_RATE_PER_HOUR'), 20),
    adminPassword: read(env, 'ADMIN_PASSWORD') || 'LODHIJI2027BN',
    authSecret: read(env, 'AUTH_SECRET') || read(env, 'ADMIN_PASSWORD') || 'rank-mitra-dev-secret',
    adminTokenTtlHours: int(read(env, 'ADMIN_TOKEN_TTL_HOURS'), 12),
    emailProvider: read(env, 'EMAIL_PROVIDER').toLowerCase(),
    emailDailyLimit: int(read(env, 'EMAIL_DAILY_LIMIT'), 200),
    emailFrom: read(env, 'EMAIL_FROM') || 'Rank Mitra <no-reply@rankmitra.local>',
    adminEmail: read(env, 'ADMIN_EMAIL') || '',
    brevoApiKey: read(env, 'BREVO_API_KEY') || '',
    brevoKeyId: read(env, 'BREVO_SMTP_KEY_ID') || 'xkeysib',
    resendApiKey: read(env, 'RESEND_API_KEY') || '',
    smtpUrl: read(env, 'SMTP_URL') || '',
    smtpHost: read(env, 'SMTP_HOST') || '',
    smtpPort: int(read(env, 'SMTP_PORT'), 587),
    smtpSecure: read(env, 'SMTP_SECURE') === '1' || read(env, 'SMTP_SECURE') === 'true',
    smtpUser: read(env, 'SMTP_USER') || '',
    smtpPass: read(env, 'SMTP_PASS') || '',
    allowedOrigins: (read(env, 'ALLOWED_ORIGINS') || '*').split(',').map((s) => s.trim()).filter(Boolean),
    serveStatic: read(env, 'SERVE_STATIC') !== '0',
    distDir: read(env, 'DIST_DIR') || 'dist',
    siteUrl: (read(env, 'SITE_URL') || read(env, 'APP_URL') || '').replace(/\/$/, ''),
    logLevel: read(env, 'LOG_LEVEL'),
    port: int(read(env, 'PORT'), 8787),
  };

  cfg.isProduction = !!cfg.siteUrl;
  return cfg;
}

export { DEFAULTS };
