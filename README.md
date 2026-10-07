# Rank Mitra — MPESB Group-2 Sub-Group-4 रैंक व शिफ्ट विश्लेषण

**एक ही feature:** MPESB की Response Sheet पेज को पूरा select करके पेस्ट करें → 2 सेकंड में आपका स्कोर,
रैंक और पूरा लीडरबोर्ड। फ़ाइल अपलोड (`.html`/`.mhtml`) और manual entry के विकल्प हटा दिए गए हैं — **सिर्फ़ पेस्ट**।  
(लैपटॉप पर सेव की हुई Response Sheet खुली हो तो उस पेज को select करके पेस्ट करना भी चल जाता है।)

**जुड़ें / संपर्क:** [Telegram चैनल — TopperView](https://t.me/TopperView) · [MP Sipyq — आंसर की व टूल](https://mpsipyq.netlify.app/) · [ओनर से संपर्क करें](https://t.me/LODHIJI27)

* browser में ही पढ़ा जाता है: **नाम · रोल नंबर · तारीख/शिफ्ट · सही · गलत · प्रयासित · अनुत्तरित** (59 kB का पूरा पेज ~15 ms में)
* server पर केवल यही सात संख्याएँ + **श्रेणी, लिंग, योग्यता** (जिन्हें उम्मीदवार स्वयं चुनता है) जाती हैं
* **पेस्ट की गई उत्तर कुंजी कभी संचित नहीं होती** — न DB में, न disk पर, न screenshot, न उत्तर-क्रम (answer pattern)
* 22 शिफ्ट्स की तुलना, category/gender rank व percentile उन्हीं संख्याओं से बनता है

---

> 🤖 **AI एजेंट (Google Antigravity / Cursor / Copilot agent) के लिए पूरा मैनुअल — नियम, Supabase,
> Netlify, env, API contract, parser के जाल, टेस्ट और TODO:** [`AGENTS.md`](AGENTS.md)
> कोई भी कोड बदलने से पहले वह फ़ाइल पढ़ें।

## 1 · चलाना (local)

```bash
npm install
npm run dev          # Vite UI  -> http://localhost:3000  (/api :8787 पर proxy)
npm run dev:all      # UI + API दोनों एक साथ
npm run build        # -> dist/   (Netlify यही folder deploy करेगा)
npm test             # 61 checks: parser(28) · API(24) · DB-migration(4) · NEP(5)
npm run test:all     # वही, segment-wise output के साथ
npm run test:real    # असली Response Sheet/MHTML + पेस्ट-फ़ॉर्मेट पर acceptance जाँच
npm run verify:real  # असली फ़ाइलों का विश्लेषण प्रिंट करें
npm run verify:paste # पूरा flow प्रिंट करें: पेस्ट → 14 ms → 201 → रैंक → ALREADY_SAVED → 304
npm run samples      # टेस्ट fixtures दोबारा बनाएँ (samples/, git में नहीं)
```

शून्य कॉन्फ़िग पर बैकएंड लोकल **SQLite फ़ाइल** (`.data/rank-mitra.sqlite`, `node:sqlite`) पर चलता है —
कोई DB इंस्टॉल करने की ज़रूरत नहीं।

---

## 2 · Deploy — Netlify पर site **और** API, एक ही जगह (अनुशंसित)

`netlify.toml` + `netlify/functions/api.mjs` पहले से हैं: वही `core/handler.js` जो local Node server
चलाता है, Netlify Function बनकर उसी domain पर `/api/*` serve करता है। इसलिए **CORS नहीं, दूसरा host
नहीं, `VITE_API_BASE` नहीं** — और free tier पर 100 GB site egress + 300 K function invocation/month।

| Netlify settings | मान |
|---|---|
| Build command | `npm run build` |
| Publish directory | `dist` |
| Node version (env) | `22` |
| Env: `DATABASE_URL` | Supabase/Neon का **session-pooler** string (नीचे §3) |
| Env: `ADMIN_PASSWORD` | optional — न सेट करने पर admin पैनल बंद रहता है (यही सुरक्षित default है) |
| Env: `CACHE_MAX_AGE` | `3600` (default) — UI के 1-घंटे refresh से मेल खाता है |

```bash
npm ci && npm run build && npm test          # हरा हो
# फिर repo connect करें (Netlify → Add new site → Import an existing project)
# env vars:  netlify env:set DATABASE_URL "postgresql://…"   (या UI में)
```

⚠️ **ZIP-drop से केवल site जाएगा, API नहीं** — Netlify Functions को source repo चाहिए।
`dist/` को अकेला Drag-Drop करने पर UI चलेगा पर submissions उस browser तक सीमित रहेंगी
(ऐप अपने-आप local mode में चला जाता है — warning के साथ)। इसलिए repo connect कीजिए।

### API को दूसरे host पर रखना (Netlify सिर्फ़ site के लिए)

`dist/index.html` में यह लाइन है — उसे खोलकर पूरा URL लिख दें, rebuild की ज़रूरत नहीं:

```html
<script>window.__RANK_MITRA_API__ = 'https://rank-mitra-api.YOUR-NAME.workers.dev/api';</script>
```

(या build से पहले `VITE_API_BASE=...` env दें। दोनों में से कोई एक — file edit ज़्यादा quick है।)

---

## 3 · Backend + Database कहाँ रखें

एक ही कोडबेस, तीन तरीके — `core/handler.js` कोई standard `Request → Response` फ़ंक्शन है,
हर एडॉप्टर (`api/`, `worker/`, `server.js`) बस उसे लपेटता है।

### ✅ विकल्प: Cloudflare Workers + D1 (पूरा मुफ़्त, egress मीटर नहीं)

> **अब जो चयनित है:** Netlify (site + function) + **Supabase Postgres** — §2 और §8 देखें। Supabase पर
> egress बचाने के लिए जो किया गया है: 1-घंटा client refresh, `CACHE_MAX_AGE=3600`, revision-keyed server
> cache (हर visitor के लिए DB read नहीं), ETag 304, masked 617-byte public rows, DB में कोई फ़ाइल/blob नहीं।
> भीड़ ज़्यादा होगी और egress का बोझ शून्य चाहिए, तो Yही code base D1 पर चल जाता है (नीचे)।

आपका Supabase free tier **egress** की वजह से खत्म हुआ था (13.1 GB / 5 GB, organization-स्तर पर गिना जाता है)।
Cloudflare D1 मुफ़्त में देता है: **5 GB storage, 5 मिलियन row-reads/दिन, 1 लाख writes/दिन** और —
सबसे ज़रूरी — **D1 के egress/bandwidth का कोई चार्ज ही नहीं**। Workers free: 1 लाख requests/दिन, 10 ms CPU।

```bash
npm i -D wrangler
npx wrangler login
npx wrangler d1 create rank-mitra-db          # binding का नाम wrangler.toml से मिलाएँ
npm run db:setup:d1                      # db/schema-d1.sql लागू करें (टेबल+इंडेक्स)
npx wrangler secret put AUTH_SECRET            # फिर: npx wrangler secret put ADMIN_PASSWORD
npm run deploy:cf                              # Worker + static assets एक साथ
```

`wrangler.toml` तैयार है; assets `dist/` से serve होते हैं और `/api/*` Worker को जाता है —
एक ही origin, CORS की चिंता नहीं। (नोट: 1 Sep 2026 से daily free-cap पार होने पर D1 throttle नहीं,
00:00 UTC तक hard-stop करता है — इसलिए response छोटे + ETag/304 रखे गए हैं।)

### विकल्प A: Vercel (frontend) + Neon Postgres (database)

```bash
# Neon → project बनाकर "pooled" connection string लें
npm run db:setup            # DATABASE_URL पर PostgreSQL स्कीमा (या `npm run db:setup:pg`)
# Vercel: Framework = Vite, Build = `npm run build`, Output = dist
# Env: DATABASE_URL, ADMIN_PASSWORD, AUTH_SECRET, EMAIL_PROVIDER, BREVO_API_KEY, ALLOWED_ORIGINS
```

`api/[...path].js` + `vercel.json` तैयार हैं। Neon free: **0.5 GB storage, ~100 CU-hours/माह, 5 GB egress/माह**,
scale-to-zero। 500 candidate × ~150 B ≈ 75 KB प्रति पेज — egress महीनों तक नहीं छुएगा, फिर भी cap है इसलिए
`CACHE_MAX_AGE=1800` + ETag on है।

### विकल्प B: अपना Docker/Node server (Render/Railway/VPS/पूरा नियंत्रण चाहिए तो)

```bash
npm start                    # node server.js — static + API + local SQLite
# या
docker build -t rank-mitra . && docker run -p 8787:8787 --env-file .env.local \
  -v $PWD/.data:/app/.data rank-mitra
# Render: render.yaml commit कर दें (free Postgres 90-दिन का ट्रायल, फिर $7)
```

### ❓ Google Sheets को database बनाया जा सकता है?

**लिखने के लिए हाँ-नहीं, पढ़ने के लिए नहीं — यहाँ के लिए ठीक नहीं।** 2026 की official quotas:

| कोटा | मान |
|---|---|
| Sheets API read | **300 अनुरोध/मिनट प्रति Cloud project**, **60/मिनट प्रति user** |
| Sheets API write | वही — 300/मिनट project, 60/मिनट user |
|超限 पर | `429 RESOURCE_EXHAUSTED` (और Google ने कहा है कि 2026 के बाद overrun पर Cloud billing लगेगी) |
| Apps Script (backend बनाना हो) | 6 मिनट/execution, **30 simultaneous/उपयोगकर्ता**, trigger runtime 90 मिनट/दिन (consumer) |

इस ऐप के लिए अनुवाद:

* हर visitor का dashboard = **पूरी sheet का एक read** (कोई index/column-projection नहीं, filter कोड में करना है)।
* एक submission = 1 append + duplicate-रोक के लिए roll-column का read → result-day पर 500 submissions/10 मिनट = **~1,000 अनुरोध/10 मिनट → 300/मिनट की दीवार, 429।**
* Service account एक ही identity है, इसलिए व्यवहार में **60/मिनट** की सीमा पहले टूटेगी — यही सबसे बड़ा surprise है।
* कोई transaction/UNIQUE नहीं → blueprint **#14.1 race-condition protection** यहाँ दे नहीं सकता। Two students same roll डालें तो दोनों चले जाएँगे।
* latency ~300-900 ms बनाम D1 का ~5 ms। और sheet private रखनी है तो OAuth token browser में नहीं जा सकता → **फिर एक proxy/Worker चाहिए ही** — जो पहले से बना है।
* भरोसा: कोई row-level access control, कोई audit, कोई rollback नहीं; एक गलत manual edit पूरी ranking बदल देगी।

**Sheets कहाँ बढ़िया है (और बना हुआ है):** admin का data view, import/export format। `GET /api/admin/export?format=csv` की CSV सीधे Google Sheets में खुल जाती है, और `POST /api/admin/import` उही format वापस ले लेता है — यानी „Sheet में खोलो, edit करो, import करो“ वाला manual रिव्यू फ़्लो आज ही चल जाएगा। (`roll_number` immutability के कारण scores सुधारने के लिए row हटाने/दोबारा import करनी होगी — admin को यह अधिकार है, नियम #43 के अनुसार student को नहीं।)

तुम ज़िद करो तो **Apps Script Web App + Sheets** का पूरा backend भी लिख दे सकता हूँ (~1-1.5 घंटा, कोई Cloudflare account नहीं, पूरी तरह मुफ़्त) — शर्त यह है कि result-day की भीड़ पर 429 और duplicate की थोड़ी गुंजाइश तुम स्वीकार करो। मेरी सलाह: पढ़ने वाला रास्ता D1 पर रहे, Sheets सिर्फ़ backup/review के लिए।

### ❌ Firebase — इस ऐप के लिए सही नहीं (गणित दीजिए)

* Spark (मुफ़्त) plan पर **Cloud Functions नहीं चलते** (Blaze/कार्ड ज़रूरी) — यानी अपना `/api` वहीँ नहीं रख सकते।
* Firestore free: **50,000 doc-reads/दिन**। लीडरबोर्ड = हर यूज़र हर 30 मिनट में पूरी सूची पढ़ता है।
  300 candidate × 200 visitor/दिन = **60,000 reads — एक दिन का budget खत्म।** (यह वही गलती है जो Supabase पर हुई।)
* Realtime Database मुफ़्त 10 GB download देता है, पर rules में "हर कोई लिख सके, कोई पढ़ न सके" जैसी
  शर्तें (claim token, duplicate रोक, rate limit, admin clear) नहीं लिखी जा सकतीं → डेटा बिगड़ेगा।
* निष्कर्ष: Firebase केवल **तब** ठीक है जब आप Blaze कार्ड जोड़ें और per-user docs पढ़ें; पूरे टूर्नामेंट-स्टाइल
  रैंकिंग के लिए Cloudflare D1/Neon ही सस्ता और सुरक्षित है।

### ❓ GitHub पर website + database?

* **कोड** GitHub पर डालिए (private repo रखें जब तक URL सार्वजनिक न करना हो) — और `gh`/Actions से deploy भी हो जाएगा।
* **GitHub Pages** static front-end चला सकता है (यही `dist/`), पर वहाँ **कोई database/सर्वर नहीं** चलता —
  GitHub के पास कोई managed DB नहीं है। इसलिए Pages + Cloudflare Worker (API+D1) का जोड़ बनता है, Netlify + Worker की तरह।
* **उम्मीदवारों का डेटा कभी git में commit मत कीजिए।** उसीलिए `.gitignore` में `.data/`, `*.sqlite*`,
  `.env*` और `samples/` पहले से हैं।

---

## 4 · Email (मुफ़्त में)

रिपोर्ट व अलर्ट `EMAIL_PROVIDER` से जाते हैं; default `console` है (कुछ नहीं भेजता, log छापता है) —
इसलिए deploy कभी fail नहीं होगा।

| प्रदाता | मुफ़्त कोटा | नोट |
|---|---|---|
| **Brevo** ✅ | **300 email/दिन** (~9,000/माह), कार्ड नहीं | REST API, free plan पर Brevo की छोटी branding |
| Resend | 3,000/माह (100/दिन) | एक custom domain फ़्री |
| Mailtrap | 4,000/माह | डेवलपर-टेस्टिंग के लिए अच्छा |
| SMTP2GO | 1,000/माह | सीधा SMTP |
| Gmail SMTP | 100/दिन | app-password से, अस्थायी जुगाड़ के लिए ठीक |
| AWS SES | $0.10/1000 (सिर्फ़ EC2/Lambda से free) | स्केल पर सस्ता, सेटअप लंबा |

```bash
# Brevo: https://www.brevo.com → SMTP & API → API key
EMAIL_PROVIDER=brevo
BREVO_API_KEY=xkeysib-...
EMAIL_FROM="Rank Mitra <alerts@yourdomain.in>"   # Brevo पर verified sender चाहिए
EMAIL_DAILY_LIMIT=200                            # accidentally quota न जले
```

`worker/` व `api/` दोनों में `fetch`-आधारित भेजना है, इसलिए `nodemailer` optional है (सिर्फ़ `EMAIL_PROVIDER=smtp` पर)।

---

## 5 · Env vars (पूरी सूची `.env.example` में)

| वैरिएबल | default | काम |
|---|---|---|
| `EXAM_ID` | `mpesb-g2sg4-2026` | एक (exam, roll) = एक row; नए exam पर बदलें |
| `DB_DRIVER` | `auto` | `d1` → `postgres` (DATABASE_URL) → local `sqlite` |
| `DATABASE_URL` | — | Postgres/Neon/Supabase connection string |
| `D1_BINDING` | `RANK_MITRA_DB` | wrangler.toml से मेल खाना चाहिए |
| `CACHE_MAX_AGE` | `1800` | 30-मिनट cache + ETag revalidation |
| `SUBMIT_RATE_PER_HOUR` | `20` | प्रति IP submissions |
| `ALLOWED_ORIGINS` | `*` | Netlify + Worker अलग hosts हों तो Netlify origin लिखें |
| `ADMIN_PASSWORD` | खाली | खाली = सारा admin पैनल व endpoints **बंद** |
| `AUTH_SECRET` | — | admin token sign करने के लिए (32-byte random) |
| `ADMIN_TOKEN_TTL_HOURS` | `12` | session घंटों में |
| `STORE_QUESTION_PATTERN` | `0` | `0` = प्रति-प्रश्न पैटर्न DB में नहीं जाता (privacy default) |
| `EMAIL_PROVIDER` | `console` | `brevo` / `resend` / `smtp` / `console` |
| `SERVE_STATIC` | `1` | `dist/` को API के साथ serve करना |

---

## 6 · API (संक्षेप)

```
GET    /api/health                      DB driver, revision, email provider
GET    /api/config                      exam id, scoring rules, limits
GET    /api/candidates?limit&shift&category&gender&q&updated_since
                                        केवल public कॉलम; ETag/304; 150 B/row
POST   /api/candidates                  201 + claimToken · 409 duplicate · 422 · 429
GET|PATCH /api/candidates/:roll         PATCH सिर्फ़ profile (स्कोर/शिफ्ट immutable)
DELETE /api/candidates/:roll            owner (claim token) या admin
GET    /api/stats                       server-side GROUP BY aggregates
POST   /api/rank/batch                  ranks एक साथ
POST   /api/admin/login → /audit /clear /import /export /email-test /revoke-claim
POST   /api/email/report
```

गोपनीयता: नाम publicly `RAHUL K****` दिखता है, `answer_pattern`/`file_name`/`file_bytes`
सर्वर कभी नहीं सहेजता (`STORE_QUESTION_PATTERN=1` तक ही pattern रहेगा), claim token का केवल SHA-256 hash DB में जाता है।

---

## 6b · Source traceability

`docs/RULEBOOK_CLAUSES.md` — नियमपुस्तिका (145 पृष्ठ PDF) से लिए गए scoring व NEP-normalisation प्रावधान, और वे app के किस file में बैठे हैं। `npm run verify:real` उम्मीदवार की असली saved response sheet पर parser जाँचता है (फ़ाइलें `samples/real/` में, git-ignored)।

---

## 7 · टेस्ट

```bash
npm run test:parser   # 28 checks — हर container एक ही विश्लेषण दे:
                      # .html · .mhtml(quoted-printable) · .mht(base64) · UTF-16+BOM · cp1252
                      # और **पेस्ट किए गए दो रूप**: सादा text, तथा चिपका हुआ markdown-रूपांतर
                      # (`**` wrap, `&amp;`, label से value चिपका हुआ — "Roll Number3001260688994Name…")
                      # 200 प्रश्न, 142 सही / 31 गलत / 27 छोड़े, rawScore 134.25, shift निर्णय,
                      # PDF/image/zip पर हिन्दी निर्देशांक, empty file पर साफ़ त्रुटि
npm run test          # 61 checks कुल: + 24 API end-to-end (ALREADY_SAVED बनाम DUPLICATE, claim token,
                      # score/shift immutability, ETag/304, revision-keyed server cache + invalidation,
                      # rate limit, admin auth, CSV export/import round-trip + header-drift guard,
                      # data minimisation — answer pattern व फ़ाइल DB में NULL), 4 DB-migration, 5 NEP
npm run test:real     # उम्मीदवार की असली फ़ाइल + उसी का पेस्ट-रूप: 153.5 RAW, VERIFIED, 0 warnings,
                      # और 50 kB पेस्ट पढ़ने का समय-बजट (< 1.5 s)
```

---

## 8 · Deploy check-list (15 मिनट)

1. `npm ci && npm run build && npm test` — 61 checks हरे होने चाहिए।
2. **Supabase**: project → Settings → Database → **Session pooler** की connection string copy करें
   (`aws-0-<region>.pooler.supabase.com:5432`)। `db.<ref>.supabase.co` **मत** लें — वह IPv6-only है और
   serverless उससे connect नहीं कर पाता (hang)।
3. Netlify: repo connect → env में `DATABASE_URL` → deploy। **कoi SQL चलाने की ज़रूरत नहीं** — API boot पर
   `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE … ADD COLUMN IF NOT EXISTS` अपने-आप चलाता है
   (`core/db/index.js → ensureSchema`)। वैसे review के लिए SQL `db/schema.sql` में committed है।
4. पुराना DB migrate करना हो तो: `npm run db:sql` (Postgres) / `npx wrangler d1 execute … --file=db/migrations-d1.sql` (D1)।
5. `ADMIN_PASSWORD` सेट करें (नहीं तो admin पैनल बंद रहेगा — यही सुरक्षित default है)।
6. ई-मेल चाहिए तो ही: Brevo (300/day free) → `EMAIL_PROVIDER=brevo` + `BREVO_API_KEY` → admin पैनल से test।
   उम्मीदवार अब अपना ई-मेल नहीं देता, इसलिए यह केवल admin-अलर्ट/रिपोर्ट के लिए है।
7. **एक बार खुद जाँचें**: site खोलें → ESB पेज से पूरा पेज copy → paste → गिनती दिखे (≈15 ms) → save →
   रैंक दिखे → वही पेस्ट दोबारा करें → “पहले से सेव है” सूचना आए → 1 घंटे बाद refresh पर Network में 304 दिखे।
8. 🔴 **सुरक्षा**: जो DB password / `sb_secret_…` / service_role key chat में भेजी गई थीं, उन्हें deploy के बाद
   **rotate/revoke** कर दें। इस ऐप को केवल server-side `DATABASE_URL` चाहिए — publishable/anon key browser
   में कभी नहीं जाती (सारा read/write `/api` proxy से होता है), इसलिए service_role key का कोई उपयोग यहाँ नहीं है।
