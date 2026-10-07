#!/usr/bin/env node
/**
 * Generates realistic MPESB/TCS answer-key fixtures under ./samples so the
 * parser can be tested for BOTH .html and .mhtml (and .mht base64) containers.
 *
 *   npm run samples
 *
 * Every sample encodes the SAME candidate + the SAME 200-question sheet
 * (142 correct / 31 wrong / 27 unattempted, shift 2), so the test can assert
 * that the container format never changes the analysis.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const outDir = path.join(root, 'samples');
mkdirSync(outDir, { recursive: true });

const CAND = {
  roll: '2612345678',
  name: 'RAKESH KUMAR SHARMA',
  date: '23/09/2026',
  time: '02:30',
  shiftText: 'Afternoon',
  total: 200,
  correct: 142,
  wrong: 31,
};

/* deterministic pseudo-random so fixtures never drift */
let seed = 20260923;
function rnd() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

/** status per question index: 1 correct, 2 wrong, 0 unattempted (shuffled) */
const statuses = (() => {
  const list = [
    ...Array(CAND.correct).fill(1),
    ...Array(CAND.wrong).fill(2),
    ...Array(CAND.total - CAND.correct - CAND.wrong).fill(0),
  ];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
})();

const QUESTIONS = statuses.map((st, i) => {
  const given = st === 0 ? null : st === 1 ? Math.floor(rnd() * 4) + 1 : ((Math.floor(rnd() * 3) + 1) % 4) + 1;
  const correct = st === 1 ? given : ((given ?? 0) % 4) + 1;
  return {
    no: i + 1,
    subject: ['सामान्य ज्ञान', 'गणित', 'रीजनिंग', 'सामान्य विज्ञान', 'मार्गदर्शन'][i % 5],
    text: `प्रश्न ${i + 1}: मध्य प्रदेश से संबंधित सामान्य अध्ययन प्रश्न क्रमांक ${i + 1} का सही विकल्प चुनिए।`,
    given,
    correct,
    status: st,
  };
});

/* ----------------------------------------------------------------- html ---- */

/** MPESB / Vyapam "Response Sheet" — the table you actually get on Save-As. */
function mpesbResponseSheetTable() {
  const rows = QUESTIONS.map(
    (q) => `        <tr>
          <td align="center">${q.no}.</td>
          <td>${q.subject}</td>
          <td class="Que">${escapeHtml(q.text)}</td>
          <td align="center">${q.given ?? '—'}</td>
          <td align="center">${q.correct}</td>
          <td align="center">${q.status === 1 ? '1.00' : q.status === 2 ? '-0.25' : '0.00'}</td>
        </tr>`
  ).join('\n');

  return `<!DOCTYPE html>
<html lang="hi">
<head>
<meta charset="utf-8">
<title>उत्तर मापकी / Answer Key Response Sheet - MPESB</title>
<link rel="stylesheet" href="https://vyapamcg.cgmonline.in/css/style.css">
</head>
<body>
  <table class="menu-tbl" width="100%" border="1" cellpadding="4" cellspacing="0">
    <tr><td colspan="2" align="center"><b>व्यावसायिक परीक्षा मंडल, मध्य प्रदेश</b></td></tr>
    <tr><td>परीक्षार्थी का नाम / Name of the Candidate</td><td>${CAND.name}</td></tr>
    <tr><td>अनुक्रमांक / Roll Number</td><td>${CAND.roll}</td></tr>
    <tr><td>परीक्षा का नाम / Examination Name</td><td>Group-2 Sub Group-4 (सहायक सत्र न्यायाधीश ग्रेड-III)</td></tr>
    <tr><td>दिनांक / Exam Date</td><td>${CAND.date}</td></tr>
    <tr><td>समय / Test Time</td><td>${CAND.time} ${CAND.shiftText}</td></tr>
    <tr><td>शिफ्ट / Shift</td><td>Shift 2</td></tr>
  </table>

  <table class="menu-tbl" border="1" cellpadding="4" cellspacing="0" width="100%">
    <tr>
      <th>प्रश्न सं. / Q.No</th>
      <th>विषय</th>
      <th>प्रश्न / Question</th>
      <th>आंकांकित उत्तर / Marked Answer</th>
      <th>सही उत्तर / Correct Answer</th>
      <th>अंक / Marks</th>
    </tr>
${rows}
  </table>

  <table border="1" cellpadding="4">
    <tr><td>Total Questions</td><td>${CAND.total}</td></tr>
    <tr><td>Attempted</td><td>${CAND.correct + CAND.wrong}</td></tr>
    <tr><td>Correct</td><td>${CAND.correct}</td></tr>
    <tr><td>Wrong</td><td>${CAND.wrong}</td></tr>
  </table>
  <p>source: https://cbtexam.in/cet/student/response-sheet</p>
</body>
</html>
`;
}

/** Legacy cbtexam.in block layout (Engine 1). */
const optionId = (qNo, opt) => String(1000000000 + qNo * 10 + opt);

function mpesbBlockFormat() {
  const blocks = QUESTIONS.map((q) => {
    const given =
      q.status === 0
        ? `Answer Given by Candidate:- Not Attempted`
        : `Answer Given by Candidate:- (${q.given}) विकल्प ${q.given}<br>Option ID : -${optionId(q.no, q.given)}`;
    return `  <div class="question-block">
    <p>Question No. ${q.no} &nbsp; ${escapeHtml(q.text)}</p>
    <p>${given}</p>
    <p>Correct Answer :- (${q.correct})<br>Option ID :- ${optionId(q.no, q.correct)}</p>
  </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>cbtexam.in - Answer Key</title></head>
<body>
<table><tr><td>Roll Number</td><td>${CAND.roll}</td></tr>
<tr><td>Name of the Candidate</td><td>${CAND.name}</td></tr>
<tr><td>Exam Date</td><td>${CAND.date}</td></tr>
<tr><td>Test Time</td><td>${CAND.time} PM</td></tr>
<tr><td>Examination Name</td><td>MPESB Group 2 Sub Group 4</td></tr></table>
${blocks}
</body></html>`;
}

/** TCS iON panel layout (Engine 2). */
function tcsIondFormat() {
  const panels = QUESTIONS.map((q) => {
    const optionRows = [1, 2, 3, 4]
      .map((opt) => {
        const isCorrect = opt === q.correct;
        const cls = isCorrect ? ' class="rightAns"' : '';
        /*
         * Real TCS iON sheets print the key as visible text, not only as a CSS
         * class — that is what makes a copy/paste of the page analysable at all.
         * A fixture that hid it in markup alone would "work" only for saved files.
         */
        const label = isCorrect ? `Option ${opt} &nbsp;<span class="ans">(Right Ans : ${opt})</span>` : `Option ${opt}`;
        return `        <tr${cls}><td>${label}</td></tr>`;
      })
      .join('\n');
    return `  <div class="question-pnl">
    <div class="section-cnt">Q${q.no}. ${escapeHtml(q.text)}</div>
    <div>Chosen Option: ${q.given ?? '--'}</div>
    <table class="questionRowTbl">
${optionRows}
    </table>
  </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>TCS iON Response Sheet</title></head>
<body>
<table><tr><td>Participant ID</td><td>${CAND.roll}</td></tr>
<tr><td>Candidate Name</td><td>${CAND.name}</td></tr>
<tr><td>Exam Date</td><td>${CAND.date}</td></tr>
<tr><td>Shift</td><td>Shift 2</td></tr></table>
${panels}
</body></html>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ------------------------------------------------------------------ MHTML --- */

/** RFC 2045 quoted-printable with 76-char soft-wrapped lines. */
function encodeQuotedPrintable(text, maxLen = 76) {
  const bytes = new TextEncoder().encode(text);
  const lines = [];
  let line = '';
  const flush = () => {
    lines.push(line);
    line = '';
  };

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];

    if (b === 0x0d) continue; // CR of a CRLF pair — the LF does the breaking
    if (b === 0x0a) {
      // a line must never end in a raw space/tab: encode it
      line = line.replace(/[ \t]+$/, (m) => [...m].map((c) => '=' + c.charCodeAt(0).toString(16).toUpperCase()).join(''));
      flush();
      continue;
    }

    let token;
    if (b === 0x09) token = '\t';
    if (b === 0x20) token = ' ';
    else if (b >= 0x21 && b <= 0x7e && b !== 0x3d) token = String.fromCharCode(b);
    else token = '=' + b.toString(16).toUpperCase().padStart(2, '0');

    // -1 so a trailing '=' (soft break) still fits inside maxLen
    if (line.length + token.length > maxLen - 1) {
      if (/[ \t]$/.test(line)) line = line.slice(0, -1) + (line.endsWith('\t') ? '=09' : '=20');
      flush();
    }
    line += token;
  }
  if (line) flush();
  return lines.join('\r\n');
}

/** Chrome "Save as -> Webpage, Single file (.mhtml)" envelope. */
function toMhtml(html, { boundary, withImage = true, withCss = true } = {}) {
  const parts = [];
  parts.push(
    `From: <Saved by Blink>\r\nSnapshot-Content-Location: https://vyapamcg.cgmonline.in/AnswerKey/Print.aspx\r\nSubject: =?utf-8?Q?MPESB?= =?utf-8?Q?_=E0=A4=89=E0=A4=A4?= =?utf-8?Q?=E0=A4=A4?= =?utf-8?Q?_=E0=A4=95=E0=A5=81=E0=A4=83=E0=A4=9C?= =?utf-8?Q?=E0=A5=80?=\r\nDate: Wed, 23 Sep 2026 18:05:12 +0530\r\nMIME-Version: 1.0\r\nContent-Type: multipart/related;\r\n\ttype=text/html;\r\n\tboundary="${boundary}"`
  );
  parts.push(
    `\r\n--${boundary}\r\nContent-Type: text/html; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n${encodeQuotedPrintable(html)}`
  );
  if (withCss) {
    parts.push(
      `\r\n--${boundary}\r\nContent-Type: text/css; charset="utf-8"\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nbody{font-family:Segoe UI;margin:0}\r\n.menu-tbl{border-collapse:collapse;width:100%}\r\n.Que{font-size:12px}`
    );
  }
  if (withImage) {
    parts.push(
      `\r\n--${boundary}\r\nContent-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-ID: <logo>\r\n\r\niVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==`
    );
  }
  parts.push(`\r\n--${boundary}--\r\n`);
  return parts.join('');
}

/** Old-style single-file .mht with a base64 HTML part. */
function toMhtBase64(html, boundary) {
  const b64 = Buffer.from(html, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  return `MIME-Version: 1.0\r\nContent-Type: multipart/related; boundary="${boundary}"; type="text/html"\r\n\r\n--${boundary}\r\nContent-Location: https://cbtexam.in/ResponseSheet.aspx\r\nContent-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64}\r\n--${boundary}--\r\n`;
}

/* ----------------------------------------------------------------- write ---- */

const sheet = mpesbResponseSheetTable();
const blocks = mpesbBlockFormat();
const tcs = tcsIondFormat();

const files = {
  'mpesb-response-sheet.html': sheet,
  'mpesb-response-sheet.mhtml': toMhtml(sheet, { boundary: '----=_NextPart_000_0A1F_1DDF0A9B.C8A4FACE' }),
  'mpesb-response-sheet-base64.mht': toMhtBase64(sheet, 'bnd_1B0A_9F2C'),
  'mpesb-cbt-blocks.html': blocks,
  'mpesb-cbt-blocks.mhtml': toMhtml(blocks, { boundary: '----=_NextPart_001_0B2E', withImage: false }),
  'tcs-ion-panels.html': tcs,
  'tcs-ion-panels.mhtml': toMhtml(tcs, { boundary: '----=_NextPart_002_TCS1' }),
};

// Summary-only file: per-question markup lost (e.g. print-to-text), totals kept.
files['summary-only.html'] = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>
<table>
<tr><td>Roll Number</td><td>${CAND.roll}</td></tr>
<tr><td>Name of the Candidate</td><td>${CAND.name}</td></tr>
<tr><td>Exam Date</td><td>${CAND.date}</td></tr>
<tr><td>Test Time</td><td>02:30 PM</td></tr>
<tr><td>Total Questions</td><td>200</td></tr>
<tr><td>Attempted</td><td>${CAND.correct + CAND.wrong}</td></tr>
<tr><td>Correct</td><td>${CAND.correct}</td></tr>
<tr><td>Wrong</td><td>${CAND.wrong}</td></tr>
</table></body></html>`;

// Latin-1 declared charset with a non-UTF-8 body (charset sniffing test).
const latinHtml = `<!DOCTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=windows-1252"><title>MPESB</title></head>
<body><table>
<tr><td>Roll Number</td><td>2698765432</td></tr>
<tr><td>Name of the Candidate</td><td>SUNITA DEVI RATHORE</td></tr>
<tr><td>Exam Date</td><td>24/09/2026</td></tr>
<tr><td>Test Time</td><td>09:00 AM</td></tr>
<tr><td>Shift</td><td>Shift 3</td></tr>
<tr><td>Remarks</td><td>Gräberstraße — éàü windows-1252 bytes</td></tr>
</table></body></html>`;
// windows-1252 is a single-byte codepage: write it byte-accurately.
const cp1252 = new Uint8Array(
  [...latinHtml].map((ch) => {
    const code = ch.codePointAt(0);
    const map = { 'ä': 0xe4, 'ö': 0xf6, 'ü': 0xfc, 'é': 0xe9, 'à': 0xe0, '—': 0x97, '‘': 0x91, '’': 0x92 };
    if (map[ch] !== undefined) return map[ch];
    return code < 0x100 ? code : 0x3f;
  })
);
writeFileSync(path.join(outDir, 'windows1252-declared.html'), Buffer.from(cp1252));

// UTF-16LE + BOM (some print-to-file / Notepad "Unicode" saves).
const bom = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(files['summary-only.html'], 'utf16le')]);
writeFileSync(path.join(outDir, 'summary-only-utf16.html'), bom);

/*
 * The paste path. This app no longer asks anyone to save a file: the candidate
 * selects all on the ESB page (Ctrl+A) and pastes. A browser copy arrives as
 * visible text with no markup — so generate exactly that shape and let the test
 * suite prove it analyses identically to the saved .html.
 */
const toPastedText = (markup) =>
  markup
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!(?:--)[\s\S]*?-->/g, ' ')
    /* A browser copies a table with TABS between cells and a NEWLINE at the end of
     * each row; block-level ends become line breaks. Chrome/Firefox/Safari all
     * behave this way, and it is why "label<tab>value" lines survive the trip. */
    .replace(/<\/(?:td|th)>/gi, '\t')
    .replace(/<\/(?:div|p|tr|li|ul|ol|table|h[1-6]|section|article|pre|blockquote|dt|dd|center)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ ]+/g, ' ')
    .replace(/ ?\t+ ?/g, '\t')
    .replace(/\t+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/*
 * …and the *real* shape one of our reference candidates produced: the copy went
 * through a markdown-flavoured viewer, so every line is wrapped in `**`, table
 * cells are GLUED to their label with no separator at all
 * ("Roll Number3001260688994Name of the Candidate…"), and `&` is still the
 * encoded `&amp;`. This is the nastiest input the app has to survive, so it is a
 * fixture and a test rather than a story in a README.
 */
const toGluedMarkdownPaste = (markup) => {
  const lines = toPastedText(markup)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  /* glue the identity block into one run, exactly like the observed paste */
  const out = [];
  let i = 0;
  out.push('=== PLEASE DO NOT REFRESH THIS PAGE...');
  out.push('');
  out.push('++**ESB G2 SG4 CRT 2026 26 SEP SH2(Candidate Response Sheet)**++');
  out.push('');
  const idIdx = lines.findIndex((l) => /Roll\s*Number/i.test(l));
  if (idIdx >= 0) {
    const idLines = lines
      .slice(idIdx, idIdx + 6)
      .join('')
      .replace(/\s+/g, ' ')
      /* the nasty part of a real copy: label and value are glued, because the
       * cells were separate <td>s and the viewer dropped the separator */
      .replace(/([A-Za-z])\s+(\d{2,})/g, '$1$2')
      .replace(/(Number|Name|Date|Time|Shift|Candidate|ID)\s+/g, '$1')
      .replace(/&/g, '&amp;');
    out.push('**' + idLines + '**');
    i = idIdx + 6;
  }
  out.push('');
  let section = 'A';
  for (; i < lines.length; i++) {
    const l = lines[i].replace(/\s+/g, ' ');
    if (!l) continue;
    if (/^Question\s/i.test(l)) {
      out.push(`  **Section : Section ${section},**    ${l}**`);
      out.push('');
      continue;
    }
    if (/^(?:Answer\sGiven|Correct\sAnswer|Option\sID|Chosen|Options)/i.test(l)) {
      out.push(`  **${l}**  `);
      continue;
    }
    out.push(`  **${l}**  `);
  }
  return out.join('\n');
};

files['mpesb-paste-text.txt'] = toPastedText(files['mpesb-response-sheet.html']);
files['mpesb-paste-glued-markdown.txt'] = toGluedMarkdownPaste(files['mpesb-response-sheet.html']);
files['cbt-blocks-paste-text.txt'] = toPastedText(files['mpesb-cbt-blocks.html']);
files['tcs-paste-text.txt'] = toPastedText(files['tcs-ion-panels.html']);

for (const [name, content] of Object.entries(files)) {
  writeFileSync(path.join(outDir, name), content);
}

// A PDF header file so the "wrong file type" path is testable too.
writeFileSync(path.join(outDir, 'not-an-answer-key.pdf'), Buffer.from('%PDF-1.7\n%\xc7\xec\x8f\xa2\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n', 'latin1'));

const manifest = {
  candidate: { rollNumber: CAND.roll, name: CAND.name, examDate: CAND.date, shiftNumber: 2 },
  expected: {
    totalQuestions: CAND.total,
    correct: CAND.correct,
    wrong: CAND.wrong,
    attempted: CAND.correct + CAND.wrong,
    unattempted: CAND.total - CAND.correct - CAND.wrong,
    rawScore: Number((CAND.correct - CAND.wrong * 0.25).toFixed(2)),
    accuracy: Number(((CAND.correct / (CAND.correct + CAND.wrong)) * 100).toFixed(2)),
  },
  files: Object.keys(files).concat(['windows1252-declared.html', 'summary-only-utf16.html']),
};
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`✔ ${Object.keys(files).length + 2} fixtures written to samples/ (html · mhtml · mht · utf16 · cp1252 · pasted-text)`);
console.log('  expected score:', manifest.expected.rawScore, '(correct', CAND.correct, '/ wrong', CAND.wrong, ')');
