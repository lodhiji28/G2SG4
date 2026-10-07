# AGENTS.md — Rank Mitra (MPESB Group-2 / Sub-Group-4)

> **यह फ़ाइल AI एजेंटों (Google Antigravity, Cursor, Claude Code, Copilot agent) के लिए है।**
> किसी भी बदलाव से पहले यह पूरी फ़ाइल पढ़ें। यहाँ जो लिखा है, वही नियम है — अनुमान न लगाएँ।
> Human docs: [`README.md`](README.md) (उपयोग), [`RANK_MITRA_BLUEPRINT.md`](RANK_MITRA_BLUEPRINT.md) (**spec of record**),
> [`docs/RULEBOOK_CLAUSES.md`](docs/RULEBOOK_CLAUSES.md) (नियम-पुस्तक के क्लॉज़)।

---

## 0. Antigravity को शुरू करने का एक-लाइन प्रॉम्प्ट (user copy-paste करे)

```text
Repo: lodhiji28/G2SG4 (branch main) — Node 20 + Vite/React 19 + TS, backend core/*.js.
सबसे पहले पूरा AGENTS.md पढ़ो और उसके नियम मानो। फिर यह काम करो, एक-एक कर, हर स्टेप के बाद टेस्ट:

1) npm ci && npm run build && npm run test:all — सब हरा हो तो ही आगे बढ़ो।
2) मेरी .env.local में DATABASE_URL डालना है (Supabase session pooler) — मुझसे वही string माँगो,
   खुद कोई key generate/rotate मत करो, कोई credential कभी commit/print मत करो।
3) npm run start चलाकर curl से जाँचो:
   /api/health → {"database":{"ok":true,"driver":"postgres"}}  (नहीं आया तो error समझाओ, DB fallback न बनाओ)
   /api/config → cacheSeconds 3600, adminEnabled true/false
4) npm run verify:paste → RAW 153.5, VERIFIED, 201 rank #1/1 आना चाहिए।
5) Netlify env vars (DATABASE_URL, DB_DRIVER=postgres, EXAM_ID, ADMIN_PASSWORD) में मैं खुद डालूँगा —
   तुम सिर्फ़ netlify.toml, .env.example और यह फ़ाइल सही रखो।
6) कोई भी बदलाव करने से पहले §1 के 8 सुनहरे नियम दोबारा पढ़ो। §12 की TODO लिस्ट में से कोई भी चीज़
   तभी करो जब मैं expressly कहूँ।
7) काम खत्म होने पर: npm run test:all + npm run build + npx tsc --noEmit तीनों clean; फिर commit करके
   push करो और एक छोटी Hindi summary दो (क्या बदला, कौन-सा टेस्ट कितना चला, कोई regression?)।

कभी मत करना: answer key/OMR text store, dummy/seed data, file upload या manual entry UI वापस लाना,
paid service जोड़ना, candidates की कोई ऐसी field जो §1 rule 2 में नहीं है।
```

---

## 1. सुनहरे नियम (Golden rules — इन्हें कभी तोड़ें नहीं)

1. **उत्तर कुंजी / Response Sheet कभी store नहीं।** सवाल-जवाब, option text, OMR फ़ाइल, HTML/MHTML — कुछ भी DB में नहीं। केवल *गिनती*।
2. **Persist होने योग्य केवल यही:** `candidateNamePrivate`, `rollNumber`, `examDate`, `shiftNumber`/`shiftId`, `correct`, `wrong`, `attempted`, `unattempted`, `totalQuestions`, `rawScore`, और user-chosen `category`/`gender`/`qualifications`। (प्रश्न-पैटर्न `STORE_QUESTION_PATTERN=0` default में बंद है।)
3. **सिर्फ़ 3 चीज़ें user बदल सकता है:** श्रेणी, लिंग, योग्यता। बाक़ी सब field **read-only** — कोई edit UI, कोई self-delete button नहीं (blueprint §43)।
4. **एक ही input feature:** ESB पेज को `Ctrl+A` → copy → इस साइट पर **पेस्ट**। file upload / manual entry / `.mhtml` / "Save as Web Page" guide — सब हटा दिए गए हैं। इन्हें दोबारा न जोड़ें।
5. **कोई dummy / seed / demo data कहीं नहीं।** न synthetic peers, न `seedCandidates.ts`, न demo rows, test fixtures भी DB में insert न हों (tests अपना throwaway tmp DB बनाते हैं)।
6. **पद व रिक्तियाँ (vacancy) feature हटा दिया गया है** — `VacanciesView.tsx`, `src/data/vacancies.ts` delete हैं। `types/index.ts` में `VacancyPost` unused पड़ा है, view बनाना मना है।
7. **Egress minimal:** client refresh 1 घंटा (`REFRESH_MS` in `src/App.tsx` = server `CACHE_MAX_AGE` से मिला हुआ), masked public rows only, कोई blob/file नहीं, Supabase से बड़ी static asset कभी सर्व नहीं।
8. **Paid service नहीं।** Email free हो (Brevo 300/day) — `EMAIL_PROVIDER=console` default है।
9. **Blueprint जीतता है:** implementation vs `RANK_MITRA_BLUEPRINT.md` में टकराव हो तो blueprint; कोई feature हटाना/बदलना हो तो blueprint + README में note भी लिखें (⚠ §12, §31/32, §40/41 पहले से हटे हैं)।
10. UI strings **हिन्दी** में, टोन सरल व विद्यार्थी-मैत्री। कोई भी error लाल-आक्रामक नहीं, "आपकी गलती" जैसा भाषा नहीं।

---

## 2. क्या-क्या है (repo map)

```
core/config.js      सारे env knobs, EXAM_ID, DB driver auto-detect, cache TTL
core/util.js        validateCandidate() — storage का एकमात्र gate; maskName, rawScore, ETag, claim tokens
core/db/schema.js     30-col candidates + meta(rev), ADDED_COLUMNS, pgSchema(), SCHEMA_VERSION '2'
core/db/index.js    SqliteDriver / PostgresDriver / D1Driver — one open(), query(), write()
core/repo.js        candidate CRUD, rank list, stats, import/export; हर write पर meta.rev++
core/handler.js     सारे /api routes, revision-keyed response cache, ETag/304, ALREADY_SAVED/DUPLICATE, CSV
core/email.js       Brevo/SMTP/Resend/console provider
server.js           Node HTTP server (static dist + /api)
runtime/node-adapter.js  Vite dev proxy / node server का glue
netlify/functions/api.mjs  Functions v2 wrapper (web-standard Request→Response), external node module: pg
netlify.toml        build/publish + /api/* → function (SPA fallback से पहले), no CORS needed
src/lib/parser/index.ts   5 engine paste/file parser (सिर्फ़ पढ़ता है, कभी भंडारण नहीं)
src/lib/{scoring,ranking,profile,storage,repository,api,normalization}/
src/data/{shifts.ts, qualifications.ts}   ← केवल यही दो data फ़ाइलें
src/components/     PasteAnswerKeyView, TopPasteGuide, PromoBar, PromoModal, promoLinks.ts,
                    Navbar, DashboardView, ShiftAnalysisView, ShiftCompareView, LeaderboardView,
                    MyProfileRankView, MethodologyView, AdminView, RawMarksDisclaimer, DataStorageSyncBar
scripts/            dev-all, apply-schema, gen-sql, make-samples, verify-real, verify-paste-e2e, export-sql
tests/              api(24) parser(28) db-migration(4) normalization(5) real-files(6)
samples/real/       आपकी असली फ़ाइलें + 14 fixtures (gitignored — git show b1c338e:"<path>" से निकलेंगी)
```

**gitignored (sandbox reset पर उड़ जाते हैं):** `dist/`, `.env*` (सिवाय `.env.example`), `.data/`, `*.sqlite*`, `samples/`, `node_modules`।
Reset के बाद: `npm ci && npm run build && npm run test:all`।

---

## 3. Commands

| काम | command |
|---|---|
| सब कुछ जाँचना (deploy से पहले अनिवार्य) | `npm run test:all && npx tsc --noEmit && npm run build` |
| API + site साथ में | `npm run dev:all` (Vite :3000 proxy → API :8787) |
| सिर्फ़ API | `npm run start` (SQLite fallback: `.data/rank-mitra.sqlite`) |
| असली फ़ाइल पर verify | `npm run test:real` · `npm run verify:real` |
| paste → score → rank end-to-end | `npm run verify:paste` |
| parser अकेले | `npm run test:parser` |
| prod preview | `npm run build && npm run preview` (port 4173) |
| schema (auto-boot भी है) | `npm run db:setup` · Postgres: `npm run db:setup:pg` · D1: `npm run db:setup:d1` |
| नमूना fixtures दोबारा | `npm run samples` |

**उम्मीद:** api 24 pass, parser 28, migration 4, NEP 5, real-files 6 — सब 0 fail। Build: `dist/assets/index-*.js` ≈ 470 kB / gzip ≈ 126 kB। `verify:paste`: `रोल 3001260688994 · BAIJNATH LODHI · 26-09-2026 · Shift 6 · 162/34/196 · RAW 153.5 · VERIFIED` → `201 rank #1/1`, फिर `409 ALREADY_SAVED`, फिर `304/0 bytes`।

---

## 4. Supabase (Postgres) — पूरा सेटअप, स्टेप-बाय-स्टेप

**क्यों Supabase:** user ने project बना लिया है (`psztuvublihxgnrrylkh`)। Free tier: DB 500 MB, **egress 5 GB uncached + 5 GB cached / cycle (org-wide)**, 2 active projects, 7 दिन inactive रहने पर project **pause** (auto-disable paused-state check करें)।

1. Supabase dashboard → *Project Settings → Database → Connection string* → **Session pooler** वाला line copy करें:
   ```
   postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require
   ```
2. ⚠️ **`db.<ref>.supabase.co` (direct) कभी उपयोग न करें** — वह IPv6-only है, Netlify/Lambda IPv4-only है → connection hang (sandbox में `ENETUNREACH` prove हुआ)।
3. ⚠️ Password URL-encode होना चाहिए: `@`→`%40`, `+`→`%2B`, `#`→`%23`, `/`→`%2F`. (`j+3BQ8vXgkKJX@D` → `j%2B3BQ8vXgkKJX%40D`)
4. `.env.local` में `DATABASE_URL=...` डालें। बस। **कोई SQL चलाने की ज़रूरत नहीं** — `PostgresDriver.ensureSchema()` boot पर `CREATE TABLE IF NOT EXISTS` + missing columns अपने-आप चलाता है; फिर भी `npm run db:setup:pg` से generate की गया `db/schema-postgres.sql` कभी भी चलाया जा सकता है (idempotent)।
5. `connectionLimit` pooler के साथ छोटा रखें (Supabase transaction pooler = 15) — `core/db/index.js` में pool config वही रहे।
6. `service_role` / `anon` key इस ऐप को **नहीं** चाहिए (Sirf `DATABASE_URL`)। `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` env keys legacy हैं — इन पर UI निर्भर नहीं।
7. जाँच: `npm run start` → `curl -s localhost:8787/api/health` में `{"database":{"ok":true,"driver":"postgres"}}`.
8. Sandbox/CI से Supabase reachable नहीं होता (egress proxy `github.com`/`npmjs`/`pypi` ही चलाता है) — **यह expected है**, इसे bug न समझें और बार-बार retry न करें। असली handshake केवल user की मशीन या Netlify deploy log में दिखेगा।

### Egress बचत का तंत्र (in code, mat तोड़िए)
- `CACHE_MAX_AGE=3600` + `src/App.tsx` `REFRESH_MS = 60*60*1000`
- `core/handler.js`: **revision-keyed** response cache — `meta.rev` बदलने तक N visitors को 1 DB read; `rev` poll ≤ हर 20 s
- ETag `W/"..."` + `If-None-Match` → `304`, 0 bytes body
- हर write/`PATCH`/admin import पर `invalidateCaches()`
- Public rows masked (`MO RAHUL K****`) ~600 B; list endpoint default 100 rows + `total`/`count`
- Admin CSV export stream, पर केवल admin token से

---

## 5. Netlify deploy (front-end + API एक ही site में)

1. Netlify → *Add new site* → **Import an existing project** → GitHub `lodhiji28/G2SG4` → branch `main`.
2. Build: `npm run build`, publish: `dist` — दोनों `netlify.toml` में हैं; कुछ टाइप न करें।
3. Functions `netlify/functions/api.mjs` से auto-discover होते हैं और `/api/*` redirect (L32) **SPA fallback (L40) से पहले** है → CORS/`VITE_API_BASE` की ज़रूरत नहीं।
4. Site environment variables (Settings → Build & deploy → Environment):
   | key | value |
   |---|---|
   | `DATABASE_URL` | §4 का pooler string |
   | `DB_DRIVER` | `postgres` |
   | `EXAM_ID` | `mpesb-g2sg4-2026` |
   | `ADMIN_PASSWORD` | अपना strong password (न डालें → admin panel design से disabled) |
   | `CACHE_MAX_AGE` | optional, default 3600 |
   | `EMAIL_PROVIDER` | optional; free email के लिए `brevo` |
5. ❌ **`dist` folder drag-drop करके deploy न करें** — function और `netlify.toml` नहीं जाएँगे, API 404 होगा और site सिर्फ़ local-storage mode में चलेगा। हमेशा **git से deploy** (`dist/` gitignored है, जान-बूझकर)।
6. Deploy के बाद 60 सेकंड की जाँच:
   - `/api/health` → `database.ok:true, driver:"postgres"`
   - पेस्ट → 201, रैंक दिखे; दूसरे device से वही पेस्ट → हरा "पहले से सेव है" notice
   - DevTools Network: refresh पर `/api/candidates` **304, 0 B**, `cache-control: public, max-age=3600, s-maxage=3600, stale-while-revalidate=3600`
7. Custom domain जोड़ें तो Netlify → Domain management; blueprint §88 के अनुसार domain का उल्लेख README/Methodology में करें।

**Fallback:** Supabase pause/egress की समस्या आए तो `DB_DRIVER=d1` + Cloudflare Workers (`wrangler.toml`, `db/schema-d1.sql`) तैयार है — D1 free में egress charge नहीं। इसे switch करने के लिए सिर्फ़ deploy target बदलता है, कोई code change नहीं।

---

## 6. `/api` contract (सबसे ज़्यादा यही बिगड़ता है)

| route | method | नोट |
|---|---|---|
| `/api/health` | GET | DB + driver + exam |
| `/api/config` | GET | `cacheSeconds`, `adminEnabled`, refresh hints |
| `/api/candidates` | GET | masked list, `total`/`count`/`revision`, ETag |
| `/api/candidates` | POST | **body FLAT** (`candidateNamePrivate`, `rollNumber`, `examDate`, `shiftNumber`, `correct`, `wrong`, …) → 201 `{ok, created, candidate, claimToken, rank, stats, message}` |
| `/api/candidates/:roll` | GET | `{ok, candidate, rank[, answerPattern, email]}` |
| `/api/candidates/:roll` | PATCH | header `x-claim-token`; केवल category/gender/qualifications allow होते हैं |
| `/api/candidates/:roll` | DELETE | student के लिए **403** (self-delete §43 से हटा); admin token से ही |
| `/api/stats` | GET | summary + per-shift aggregates |
| `/api/admin/login` | POST | `ADMIN_PASSWORD` → `x-admin-token` (TTL `ADMIN_TOKEN_TTL_HOURS`) |
| `/api/admin/export` `/import` `/clear` `/audit` `/revoke-claim` `/email-test` | — | admin token अनिवार्य; `clear` को body में ठीक `"DELETE ALL"` चाहिए |

Duplicate semantics (`core/handler.js` ~L300-380):
- वही roll + वही `correct/wrong/rawScore/shiftNumber` → **409 `code:"ALREADY_SAVED"`, `alreadySaved:true`** (polite Hindi, कोई overwrite नहीं, `existing` साथ)।
- वही roll पर अलग गिनती → **409 `code:"DUPLICATE"`** (संभावित typo/धोखा)।
- क्लाइंट दोनों को `result.duplicate` में मैप करता है → UI में हरा notice (`PasteAnswerKeyView.tsx`)।
- `ALREADY_SAVED` string browser bundle में जान-बूझकर नहीं है (सिर्फ़ server-side)।
- Rate limit: `SUBMIT_RATE_PER_HOUR=20` per IP (tests में flood के बाद POST 429 देता है — test लिखते समय याद रखें)।

---

## 7. Parser — paste की असलियत (यहाँ सबसे ज़्यादा bug आए)

- एंट्री point: `new AnswerKeyParser().parse(text, label)` → result **FLAT** है: `out.correct`, `out.wrong`, `out.attempted`, `out.unattempted`, `out.rawScore`, `out.sourceFormat`, `out.shiftId`, `out.warnings`, identity fields। **`out.summary` / `out.detectedFormat`不存在 — इन्हें न ढूँढ़ें।**
- 5 engine: MPESB block, MPESB glued-markdown, TCS `TCS_ION_TEXT`, tabular HTML, summary-line fallback।
- असली चिपकी text में **label और value के बीच कोई separator नहीं** होता (`Roll Number3003260664568`), `**bold**` markers और `&amp;` बचे रहते हैं, glued table cells जुड़े होते हैं। identity regex में quantifier `{0,50}` है — इसे `{1,50}` न करें, markdown strip हटाना crash/identity-fail वापस लाएगा।
- Response Sheet markdown shape: `Section A` / `Question ID:-` / `Answer Given by Candidate:-, Option ID : -N` या `Not Attempted` / `Correct Answer :-Option ID :- N`। Option text खाली हो सकता है।
- Shift number 1-22; **Shift 6 = 02:30 afternoon slot** (evening parity bug पहले fix हो चुका है)।
- `.mhtml` bytes quoted-printable MIME में होते हैं — कोई browser वैसा paste नहीं करता। fixtures हमेशा `.html` से derive करें, `.mhtml` से नहीं।
- linkedom tagless text पर `documentElement === null` देता है — null-check ज़रूरी है।
- Parse fail होने पर message दो रास्ते बताता है: फिर से `Ctrl+A` → copy → पेस्ट, **या** केवल printed summary line (`Correct 162 / Wrong 34 / Unattempted 4`) पेस्ट करें (summary engine उसे स्वीकार करता है)।

---

## 8. Scoring / ranking

- §3.8 के अनुसार **RAW = `correct − 0.25 × wrong`**; tie-break: अधिक `correct`, फिर कम `wrong`, फिर roll। `core/util.js` `rawScore` वही formula।
- Ranking हमेशा **RAW पर** (blueprint §3)। NEP percentile normalization (`tests/normalization.test.mjs`, `src/lib/normalization`) §72 का **preview** है, रैंक बदलती नहीं; सूत्र: `Zij = ROUND(NORMSINV(Pij − 0.005), 6)`, `Tij = AM + ASD × Zij`, `AM = max/2`, `ASD = max/10`।
- सबमिट से पहले displayed RAW और entered RAW बराबर होने चाहिए (UI में जाँच)।

---

## 9. Telegram banner + first-visit popup (आपका माँगा हुआ)

- सारे links **एक ही जगह**: `src/components/promoLinks.ts` — `PROMO_LINKS` array। कोई link कहीं और hard-code न करें।
  - `https://t.me/TopperView` (चैनल) · `https://mpsipyq.netlify.app/` (साइट) · `https://t.me/LODHIJI27` (ओनर)
- `src/components/PromoBar.tsx` — हर पेज पर, header से ऊपर, पतली strip (mobile पर horizontal scroll)।
- `src/components/PromoModal.tsx` — पहली visit पर popup; `localStorage['rankmitra.promo.dismissed.v1'] === '1'` होने पर दोबारा नहीं। बंद: ✕ / button / Esc / backdrop। Body scroll lock, `role="dialog"`, `aria-modal`।
- दोनों `src/App.tsx` में render हैं; footer में भी यही 3 links `PROMO_LINKS.map` से आते हैं।
- नियम: links पर `target="_blank" rel="noopener noreferrer nofollow"`; popup कभी data नहीं भेजता, कोई analytics नहीं, पेस्ट state छूता नहीं; z-index `100` (sticky header 40 से ऊपर)।

---

## 10. योग्यता selector (11 §11.2 का जवाब)

`src/data/qualifications.ts` में ~110 items / 8 groups (10वीं-12वीं, ITI, डिप्लोमा, ग्रेजुएशन, पोस्ट-ग्रेज, Teaching, Other)। **यह filter tag list है, eligibility दावा नहीं** — नियम-पुस्तक की per-post Hindi requirement lines extract नहीं हो सकलीं (no Unicode CMap, OCR उपलब्ध नहीं), इसलिए UI में disclaimer छपा है। किसी भी AI को इसे "board-verified" बोलना मना है। Blueprint §11.2 कहता है कि सूची notification PDF से आनी चाहिए — यदि कोई PDF से verify कर ले तो `qualifications.ts` + disclaimer दोनों अपडेट करे।

---

## 11. नए features जोड़ते समय checklist

1. `core/util.js` → `validateCandidate()` में field add करें (यही storage gate है)।
2. `core/db/schema.js` → `PUBLIC_COLS`/`ADDED_COLUMNS` + `pgSchema()`; पुराना DB upgrade `CREATE TABLE IF NOT EXISTS` से नहीं होता।
3. `core/handler.js` → CSV `CSV_HEADERS` (~L650, अभी **17** columns) और row builder दोनों एक साथ; test `api.test.mjs` parity माँगता है।
4. `src/lib/api.ts` + `PasteAnswerKeyView`/`MyProfileRankView` में UI; हिन्दी labels।
5. `tests/api.test.mjs` में assertion जोड़ें और `npm run test:all` चलाएँ।
6. `npm run build` — bundle में कोई secret/test string न जाए (grep करके देखें)।

---

## 12. खुला काम / TODO (user expressly कहे तभी करें)

| # | काम | acceptance |
|---|---|---|
| 1 | **Netlify + Supabase live handshake** (user का DB env) | `/api/health` पर `driver:"postgres"`, दूसरे device से रैंक दिखे |
| 2 | `post_preferences` column legacy है; `src/lib/profile/index.ts` के `postPreferenceCompetition`/`isEligibleFor` dead code | या तो हटाएँ या blueprint §12 note के साथ रखें — decision user का |
| 3 | Blueprint §12/§31-32/§40-41/§8/§11 हटाए/बदले गए | README + blueprint में ⚠ note अभी लिखना बाक़ी |
| 4 | §86/§24: list JSON में full roll number join key के रूप में जाता है | disclose-or-change decision user का |
| 5 | `EMAIL_PROVIDER=console` default | Brevo (300/day free) चालू करना हो तो `BREVO_API_KEY` + `EMAIL_FROM` + `admin/email-test` |
| 6 | NEP normalization preview के अलावा apply नहीं होती | §72 से आगे बढ़ाना = policy change, user की हाँ ज़रूरी |
| 7 | Supabase project 7 दिन idle पर pause | keep-alive: सप्ताह में एक `GET /api/health` ping (Netlify build या GitHub Action) |

---

## 13. Known pitfalls (पैसा-वक़्त बर्बाद करने वाले रास्ते)

- **Stale `server.js`** पुराना code/data serve करता है (`EADDRINUSE` चुपचाप) → `ss -lntp | grep 8787` देखकर `kill <pid>`। `pkill -f node` कभी न चलएँ।
- `git show HEAD:<path> > <path>` से untracked file **खाली** हो जाती है (redirect पहले चलता है) — restore का सही तरीका `git show <sha>:<path>` → नई फ़ाइल में।
- `git commit -m` + हिन्दी/उद्धरण = shell quoting टूटती है → `git commit -q -F - <<'MSG'`.
- Python से TSX patch करना भोलापन है — हर batch के बाद `npx tsc --noEmit`; replaced string को grep से verify करें (silent miss होता है)।
- `grep | paste -sd+ | bc` हिन्दी patterns पर 0 दिखा सकता है → `grep -c -- "<pattern>" dist/assets/*.js`.
- `tests/api.test.mjs` एक ही shared DB, sequential: writers से पहले count assert न करें; `admin/import` claim token rotate करता है; `admin/clear` सब खाली; `db.close()` के बाद कोई assert नहीं; revision bump `PATCH` से करें (POST rate-limit से बचने के लिए)।
- `new pg.Pool().options` से DSN inspect न करें — `pg-connection-string` का `parse()` इस्तेमाल करें (`sslmode=require` warning ignore करें; `core/db` पहले से `ssl:{rejectUnauthorized:false}` सेट करता है)।
- Sandbox में `pip install` → `--break-system-packages --target /tmp/pylibs`; PDF tooling preinstalled नहीं; `raw.githubusercontent.com` block है, >1 MB file `git show <sha>:"<path>"` से लें।

---

## 14. Git/shipping

- Arena session branch: `arena/88e5cb7c-g2sg4` (PR #1 → `main`)। Push सिर्फ़ इसी branch पर; `main` तक लाने का तरीक़ा = PR merge।
- Commit से पहले `git check-ignore` से पुष्टि करें कि `.env.local`, `.data/`, `dist/`, `samples/` stage नहीं हो रहे।
- Push के बाद: `npm run test:all` का आख़िरी नतीजा + build size user को Hindi में बताएँ।
