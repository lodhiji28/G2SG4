/**
 * Universal answer-key parser for MPESB (Vyapam) / TCS iON / CBT response
 * sheets — accepts `.html`, `.htm`, `.mhtml`, `.mht` and pasted source.
 *
 * Pipeline:
 *   bytes (decoded by src/lib/upload/readKeyFile) -> unpackMHTML() -> DOM +
 *   regex engines -> QuestionData[] -> score summary.
 *
 * Engines, in priority order:
 *   0. Response-sheet TABLE whose header names the columns (Vyapam "Save as
 *      HTML" gives Q.No / Marked Answer / Correct Answer / Marks). Header
 *      driven, so Hindi and English column labels both work.
 *   1. MPESB cbtexam.in blocks  ("Answer Given by Candidate … Option ID" /
 *      "Correct Answer … Option ID").
 *   2. TCS iON panels (.question-pnl / .menu-tbl / .rightAns / green row bg).
 *   3. Summary-only fallback (reads the printed totals if no per-question
 *      markup survived) so a partially saved file still yields a rank.
 */
import { ParsedAnswerKeyData, QuestionData } from '../../types';
import { calculateRawScore } from '../scoring';
import { EXAM_SHIFTS } from '../../data/shifts';

/* ========================================================================== */
/*  MHTML container                                                          */
/* ========================================================================== */

export interface UnpackResult {
  html: string;
  isMhtml: boolean;
  charset?: string;
  transferEncoding?: string;
  warnings: string[];
}

const MIME_MARKERS = /MIME-Version:|multipart\/related|Content-Transfer-Encoding:|From: <Saved by Blink>/i;

/**
 * Quoted-Printable decoder that survives Hindi + soft line breaks.
 *
 * Chrome wraps saved pages at ~76 chars with "=" + CRLF, so a 3-byte UTF-8
 * sequence can be split across two lines. The fast path therefore rebuilds the
 * raw *byte* stream first and decodes once, instead of decoding each =XX
 * escape in isolation (which produced "à¤°"-style garbage for Devanagari).
 */
export function decodeQuotedPrintable(input: string): string {
  if (!input) return '';
  const clean = input.replace(/=[ \t]*\r?\n/g, '');
  if (!/=[0-9A-Fa-f]{2}/.test(clean)) return clean;

  const bin = clean.replace(/=([0-9A-Fa-f]{2})/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));

  let hasWideChar = false;
  for (let i = 0; i < bin.length; i++) {
    if (bin.charCodeAt(i) > 0xff) {
      hasWideChar = true;
      break;
    }
  }

  if (!hasWideChar) {
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  return decodeQuotedPrintableMixed(clean);
}

/** For documents that mix raw unicode text with =XX escapes. */
function decodeQuotedPrintableMixed(clean: string): string {
  let result = '';
  const byteBuffer: number[] = [];
  const flush = () => {
    if (!byteBuffer.length) return;
    try {
      result += new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(byteBuffer));
    } catch {
      result += byteBuffer.map((b) => String.fromCharCode(b)).join('');
    }
    byteBuffer.length = 0;
  };

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '=' && i + 2 < clean.length && /^[0-9A-Fa-f]{2}$/.test(clean.slice(i + 1, i + 3))) {
      byteBuffer.push(parseInt(clean.slice(i + 1, i + 3), 16));
      i += 2;
      continue;
    }
    if (ch === '=' && i + 1 >= clean.length) continue; // trailing '='
    flush();
    result += ch;
  }
  flush();
  return result;
}

export function normaliseCharsetLabel(charset?: string): string | null {
  const key = String(charset || '').trim().toLowerCase().replace(/^["']|["';]+$/g, '');
  if (!key) return null;
  if (/^utf-?8$/.test(key)) return 'utf-8';
  if (/^utf-?16/.test(key)) return key.includes('be') ? 'utf-16be' : 'utf-16le';
  if (/^(us-)?ascii$/.test(key)) return 'windows-1252';
  if (/^(iso-)?8859-1$|^latin-?1$|cp1252|windows-1252/.test(key)) return 'windows-1252';
  try {
    new TextDecoder(key);
    return key;
  } catch {
    return null;
  }
}

function decodeBase64Part(body: string, charset?: string): string {
  const clean = body.replace(/[^A-Za-z0-9+/=]/g, '');
  try {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const label = normaliseCharsetLabel(charset) || 'utf-8';
    const text = new TextDecoder(label, { fatal: false }).decode(bytes);
    if (label === 'utf-8' && /\uFFFD/.test(text)) {
      const alt = new TextDecoder('windows-1252', { fatal: false }).decode(bytes);
      if (!/\uFFFD/.test(alt)) return alt;
    }
    return text;
  } catch {
    return '';
  }
}

function splitMimeHeaders(part: string): { headers: Record<string, string>; body: string } {
  const idx = part.search(/\r?\n\r?\n/);
  if (idx === -1) return { headers: {}, body: part };
  const rawHeaders = part.slice(0, idx);
  const body = part.slice(idx).replace(/^\r?\n\r?\n/, '');
  const headers: Record<string, string> = {};
  const unfolded = rawHeaders.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const m = line.match(/^\s*([\w-]+)\s*:\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2].trim();
  }
  return { headers, body };
}

/**
 * Unpacks an MHTML archive into the HTML document that carries the questions.
 * Every MIME part is *scored* instead of taking the first match, because saved
 * pages put CSS/JS/image parts before (or between) the html part.
 */
export function unpackMHTMLDetailed(rawContent: string): UnpackResult {
  const warnings: string[] = [];
  if (!rawContent) return { html: '', isMhtml: false, warnings };

  const headSlice = rawContent.slice(0, 4000);
  if (!MIME_MARKERS.test(headSlice) && !rawContent.includes('boundary=')) {
    // Plain HTML (or a stray quoted-printable blob someone pasted).
    return {
      html: /=3D|=3C|=\r?\n/.test(headSlice) ? decodeQuotedPrintable(rawContent) : rawContent,
      isMhtml: false,
      warnings,
    };
  }

  const boundaryMatch = rawContent.match(/boundary\s*=\s*"?([^"\r\n;]+)"?/i);
  const boundary = boundaryMatch ? boundaryMatch[1].trim() : '';
  const parts: string[] = [];

  if (boundary) {
    for (const chunk of rawContent.split('--' + boundary)) {
      const trimmed = chunk.trim();
      if (trimmed && trimmed !== '--') parts.push(chunk);
    }
  }
  if (!parts.length) parts.push(rawContent);

  let best = '';
  let bestScore = 0;
  for (const part of parts) {
    const probe = part.slice(0, 300000);
    const typeMatch = probe.match(/Content-Type:\s*([^;\r\n]+)/i);
    const type = (typeMatch?.[1] || '').toLowerCase().trim();
    let score = 0;
    if (type === 'text/html' || type === 'application/xhtml+xml') score += 60;
    if (/<html[\s>]|=3Chtml/i.test(probe)) score += 80;
    if (/question|प्रश्न|answer|उत्तर/i.test(probe)) score += 25;
    if (/menu-tbl|questionRowTbl|question-pnl|response.?sheet|rightAns/i.test(probe)) score += 20;
    if (/^image\/|^text\/css$|^font\/|^application\/(x-)?javascript/.test(type)) score -= 500;
    if (score > bestScore) {
      bestScore = score;
      best = part;
    }
  }

  if (!best || bestScore <= 0) {
    const idx = rawContent.search(/<html[\s>]|=3Chtml/i);
    warnings.push('MHTML के अंदर HTML भाग सीधे नहीं मिला — पूरे दस्तावेज़ से निष्कर्षण किया गया।');
    best = idx === -1 ? rawContent : rawContent.slice(Math.max(0, idx - 300));
  }

  const { headers, body } = splitMimeHeaders(best);
  const contentType = headers['content-type'] || '';

  if (/multipart\/alternative/i.test(contentType)) {
    const inner = body
      .split(/--[\w.$-]+/)
      .filter((p) => /text\/html/i.test(p))
      .sort((a, b) => b.length - a.length)[0];
    if (inner) {
      const nested = unpackMHTMLDetailed(`MIME-Version: 1.0\n${inner}`);
      return { ...nested, isMhtml: true, warnings: [...warnings, ...nested.warnings] };
    }
  }

  const encoding = (headers['content-transfer-encoding'] || '').toLowerCase().trim();
  const charset = contentType.match(/charset\s*=\s*"?([\w.-]+)"?/i)?.[1];

  let html = body;
  if (boundary) {
    const end = html.lastIndexOf('--' + boundary);
    if (end > 200) html = html.slice(0, end);
    html = html.replace(/--\s*$/, '');
  }

  if (encoding === 'base64') {
    const decoded = decodeBase64Part(html, charset);
    if (decoded) html = decoded;
    else warnings.push('base64 भाग डीकोड नहीं हो सका — "कोड पेस्ट करें" विकल्प आज़माएँ।');
  } else if (encoding === 'quoted-printable' || /=3D|=[0-9A-F]{2}/.test(html.slice(0, 20000))) {
    html = decodeQuotedPrintable(html);
  }

  return { html, isMhtml: true, charset: charset || undefined, transferEncoding: encoding || undefined, warnings };
}

/** Back-compatible single-value form. */
export function unpackMHTML(rawContent: string): string {
  return unpackMHTMLDetailed(rawContent).html;
}

/* ========================================================================== */
/*  Shift resolution                                                          */
/* ========================================================================== */

export interface ShiftGuess {
  shiftNumber: number;
  confident: boolean;
  reason: 'explicit' | 'date+session' | 'date-only' | 'day-only' | 'fallback';
}

/**
 * Priority: explicit shift/part number → exam date + session → date only →
 * day only → shift 1. Never matches on a bare "am"/"pm" substring (the old
 * pattern matched the "am" inside "Examination").
 */
export function determineShiftGuess(dateStr: string, timeStr: string, examNameStr = ''): ShiftGuess {
  const lower = `${timeStr} ${examNameStr} ${dateStr}`.toLowerCase();

  const direct = lower.match(/(?:shift|पारी|session|part)[\s_]*(?:no\.?|number|#|:|-)?\s*(\d{1,2})\b/i);
  if (direct) {
    const n = parseInt(direct[1], 10);
    if (n >= 1 && n <= 22) return { shiftNumber: n, confident: true, reason: 'explicit' };
  }

  const dayMatch = dateStr.match(/(\d{1,2})[-/.](\d{1,2})(?:[-/.](\d{2,4}))?/);
  let targetDay = dayMatch ? parseInt(dayMatch[1], 10) : NaN;
  let targetMonth = dayMatch ? parseInt(dayMatch[2], 10) : NaN;
  const yearRaw = dayMatch?.[3];

  const MONTHS: [RegExp, number][] = [
    [/jan|जनवरी/i, 1],
    [/feb|फरवरी/i, 2],
    [/mar|मार्च/i, 3],
    [/apr|अप्रैल/i, 4],
    [/\bmay\b|मई/i, 5],
    [/jun|जून/i, 6],
    [/jul|जुलाई/i, 7],
    [/aug|अगस्त/i, 8],
    [/sep|सितम्बर|सितंबर/i, 9],
    [/oct|अक्टूबर/i, 10],
    [/nov|नवम्बर/i, 11],
    [/dec|दिसम्बर/i, 12],
  ];
  for (const [rx, month] of MONTHS) if (rx.test(dateStr)) targetMonth = month;

  // dd/mm vs mm/dd: if only one side can be a day, trust it.
  if (dayMatch) {
    const a = parseInt(dayMatch[1], 10);
    const b = parseInt(dayMatch[2], 10);
    if (b > 12 && a <= 12) {
      targetMonth = a;
      targetDay = b;
    }
  }

  let morning = false;
  let afternoon = false;
  for (const t of lower.matchAll(/(\d{1,2})[:.](\d{2})\s*(am|pm)?/g)) {
    const rawHour = parseInt(t[1], 10);
    const suffix = t[3];
    let hour = rawHour;
    if (suffix === 'pm' && rawHour < 12) hour = rawHour + 12;
    if (suffix === 'am' && rawHour === 12) hour = 0;
    if (!suffix && rawHour >= 1 && rawHour <= 6) hour = rawHour + 12; // "2.30" == 14:30
    if (hour >= 6 && hour < 12) morning = true;
    if (hour >= 12 && hour < 21) afternoon = true;
  }
  if (/प्रात|सुबह|\bmorning\b|\ba\.?\s?m\.?/i.test(lower)) morning = true;
  if (/दोपहर|शाम|afternoon|\bp\.?\s?m\.?/i.test(lower)) afternoon = true;

  const matchesDay = (isoDate: string) => {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return false;
    if (!Number.isFinite(targetDay) || !Number.isFinite(targetMonth)) return false;
    if (yearRaw) {
      const yy = parseInt(yearRaw.length === 2 ? `20${yearRaw}` : yearRaw, 10);
      if (Number.isFinite(yy) && d.getFullYear() !== yy) return false;
    }
    return d.getDate() === targetDay && d.getMonth() + 1 === targetMonth;
  };

  const dayKnown = Number.isFinite(targetDay) && Number.isFinite(targetMonth);
  if (dayKnown) {
    for (const shift of EXAM_SHIFTS) {
      if (!matchesDay(shift.date)) continue;
      if (morning && !afternoon && shift.shiftTime === 'Morning') return { shiftNumber: shift.shiftNumber, confident: true, reason: 'date+session' };
      if (afternoon && !morning && shift.shiftTime === 'Afternoon') return { shiftNumber: shift.shiftNumber, confident: true, reason: 'date+session' };
    }
    for (const shift of EXAM_SHIFTS) {
      if (matchesDay(shift.date)) return { shiftNumber: shift.shiftNumber, confident: false, reason: 'date-only' };
    }
  }

  if (Number.isFinite(targetDay)) {
    for (const shift of EXAM_SHIFTS) {
      const d = new Date(shift.date);
      if (d.getDate() !== targetDay) continue;
      if (afternoon && !morning && shift.shiftTime === 'Afternoon') return { shiftNumber: shift.shiftNumber, confident: false, reason: 'day-only' };
      if (morning && !afternoon && shift.shiftTime === 'Morning') return { shiftNumber: shift.shiftNumber, confident: false, reason: 'day-only' };
      return { shiftNumber: shift.shiftNumber, confident: false, reason: 'day-only' };
    }
  }

  return { shiftNumber: 1, confident: false, reason: 'fallback' };
}

/** Numeric form kept for existing callers. */
export function determineShiftNumber(dateStr: string, timeStr: string, examNameStr = ''): number {
  return determineShiftGuess(dateStr, timeStr, examNameStr).shiftNumber;
}

/* ========================================================================== */
/*  Engines                                                                   */
/* ========================================================================== */

const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];

function optionToIndex(value: string): number | null {
  const v = String(value || '').trim();
  if (!v) return null;
  const digits = v.match(/\d+/);
  if (digits) {
    const n = parseInt(digits[0], 10);
    if (n >= 1 && n <= 8) return n;
  }
  const letter = v.match(/[A-Fa-f]/);
  if (letter) return letter[0].toUpperCase().charCodeAt(0) - 64;
  const devanagari = v.match(/[०-९]/);
  if (devanagari) return '०१२३४५६७८९'.indexOf(devanagari[0]);
  return null;
}

function isBlankAnswer(v: string): boolean {
  return !v || /^(--|n\/?a|not\s*attempted|not\s*answered| unanswered|छोड़ा|छोड|कोई\s*नहीं|—|-)$/i.test(v.trim());
}

/** Engine 0 — header-driven response-sheet tables. */
function parseResponseSheetTable(doc: Document): { questions: QuestionData[]; note: string } {
  const out: QuestionData[] = [];
  let note = '';
  const tables = Array.from(doc.querySelectorAll('table'));

  for (const table of tables) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (rows.length < 8) continue;

    const headerCells = Array.from(rows[0].querySelectorAll('td,th')).map((c) =>
      (c.textContent || '').toLowerCase().replace(/\s+/g, ' ').trim()
    );
    if (headerCells.length < 3) continue;

    const find = (...needles: string[]) =>
      headerCells.findIndex((h) => needles.some((n) => h.includes(n)));

    const qCol = find('प्रश्न सं', 'q.no', 'qno', 'question no', 'क्रमांक', 'सं.');
    const markedCol = find('आंकांकित', 'अंकित', 'marked', 'given', 'your answer', 'चुनित', 'उम्मीदवार का उत्तर', 'candidate');
    const keyCol = find('सही उत्तर', 'sahi uttar', 'correct', 'answer key', 'key');
    const marksCol = find('अंक प्राप्त', 'obtained', 'marks');

    if (markedCol === -1 || keyCol === -1) continue;
    const useQCol = qCol >= 0 ? qCol : 0;

    let matched = 0;
    const partial: QuestionData[] = [];
    rows.slice(1).forEach((row, idx) => {
      const cells = Array.from(row.querySelectorAll('td,th')).map((c) => (c.textContent || '').trim());
      if (cells.length < Math.max(markedCol, keyCol) + 1) return;

      const qNoRaw = cells[useQCol]?.replace(/[.)\s]/g, '');
      const qNo = parseInt(qNoRaw, 10);
      if (!Number.isFinite(qNo) || qNo < 1 || qNo > 1000) return;
      if (Math.abs(qNo - (idx + 1)) > 3) return;

      const marked = cells[markedCol] || '';
      const key = cells[keyCol] || '';
      const marksText = marksCol >= 0 ? cells[marksCol] || '' : '';
      const marksNum = parseFloat(marksText.replace(/[^0-9.\-]/g, ''));

      let status: QuestionData['status'];
      if (isBlankAnswer(marked) || /not\s*attempted|नहीं|रिक्त/i.test(marked)) status = 'unattempted';
      else if (Number.isFinite(marksNum) && marksText !== '') status = marksNum > 0 ? 'correct' : marksNum < 0 ? 'wrong' : 'wrong';
      else {
        const m = optionToIndex(marked);
        const k = optionToIndex(key);
        if (m === null || k === null) status = /sahi|correct/i.test(marksText) && marksNum > 0 ? 'correct' : 'wrong';
        else status = m === k ? 'correct' : 'wrong';
      }

      partial.push({
        questionNumber: qNo,
        candidateAnswer: isBlankAnswer(marked) ? 'Not Attempted' : marked.replace(/\s+/g, ' ').slice(0, 40),
        correctAnswer: key ? key.replace(/\s+/g, ' ').slice(0, 40) : undefined,
        status,
        marks: status === 'correct' ? 1 : status === 'wrong' ? -0.25 : 0,
      });
      matched++;
    });

    if (matched >= 8) {
      partial.sort((a, b) => a.questionNumber - b.questionNumber);
      out.length = 0;
      out.push(...partial);
      note = `अनुक्रमांकित उत्तर तालिका से ${matched} प्रश्न पढ़े गए`;
      break;
    }
  }
  return { questions: out, note };
}

/** Engine 1 — MPESB cbtexam.in block format. */
function parseMpesbBlocks(html: string): QuestionData[] {
  const questions: QuestionData[] = [];
  const blockRx =
    /(?:Answer\s*Given\s*by\s*Candidate|दिया\s*गया\s*उत्तर)[\s:-]*([\s\S]*?)(?:Correct\s*Answer|सही\s*उत्तर)[\s:-]*([\s\S]*?)(?=(?:Answer\s*Given|दिया\s*गया\s*उत्तर|Question\s*No|प्रश्न\s*सं|$))/gi;
  let m: RegExpExecArray | null;
  let index = 1;

  while ((m = blockRx.exec(html)) !== null) {
    const givenBlock = m[1];
    const correctBlock = m[2];

    const notAttempted = /Not\s*Attempted|नहीं\s*दिया|अनुत्तरित/i.test(givenBlock);
    const givenRx =
      givenBlock.match(/(?:Option\s*ID|विकल्प\s*आईडी|Option)\s*[:\s-]+\s*-?\s*(\d+)/i) || givenBlock.match(/Option\s*([1-4])/i);
    const correctRx =
      correctBlock.match(/(?:Option\s*ID|विकल्प\s*आईडी|Option)\s*[:\s-]+\s*-?\s*(\d+)/i) || correctBlock.match(/Option\s*([1-4])/i);

    const givenId = givenRx ? givenRx[1] : null;
    const correctId = correctRx ? correctRx[1] : null;

    let status: QuestionData['status'] = 'unattempted';
    if (notAttempted || !givenId) status = 'unattempted';
    else if (correctId && givenId === correctId) status = 'correct';
    else status = 'wrong';

    questions.push({
      questionNumber: index++,
      candidateAnswer: notAttempted ? 'Not Attempted' : givenId || '--',
      correctAnswer: correctId || undefined,
      status,
      marks: status === 'correct' ? 1 : status === 'wrong' ? -0.25 : 0,
    });

    if (index > 1200) break; // runaway guard on malformed documents
  }
  return questions;
}

/**
 * Engine 2b — the same TCS/ION "Chosen Option … (Right Ans : N)" layout read from
 * **plain text**, i.e. what a browser copy of the page actually contains.
 *
 * The DOM engine above finds the key through `class="rightAns"` / green row
 * styling. Copy-paste has no classes and no styling, so without this fallback a
 * paste from such a sheet would report 0 attempted and then let the summary path
 * invent a per-question distribution. Numbers mirror the DOM engine (+1 / −0.25)
 * so the two paths can never disagree about the same page.
 */
function parseChosenOptionBlocks(text: string): QuestionData[] {
  const questions: QuestionData[] = [];

  /* Split before every "Q12." / "Question 12:" style heading without losing it. */
  const parts = text.split(/(?=\n\s*(?:Q|Question)\s*\d{1,4}\s*[.):]\s*)/i);

  for (const part of parts) {
    if (!/(?:Chosen\s*Option|Given\s*(?:Answer|Option)|Candidate\s*Option)/i.test(part)) continue;

    const heading = part.match(/^\s*(?:Q|Question)\s*(\d{1,4})\s*[.):]/i);
    if (!heading) continue;

    const chosenMatch = part.match(
      /(?:Chosen\s*Option|Given\s*(?:Answer|Option)|Candidate\s*Option)[\s:]+(?:(\d{1,4})|([A-Da-d])(?![a-zA-Z]))|--/i
    );
    const asOptionNumber = (v: string | null | undefined): string | null => {
      if (!v) return null;
      const t = String(v).trim();
      if (/^\d+$/.test(t)) return t;
      const letter = t.toUpperCase();
      if (/^[A-D]$/.test(letter)) return String(letter.charCodeAt(0) - 64);
      return null;
    };
    const notAnswered = /Chosen\s*Option[\s:]*--|Not\s*Attempted|अनुत्तरित/i.test(part);

    const rightMatch =
      part.match(/(?:Right|Correct)\s*(?:Ans|Answer)[^\d\n]{0,14}(\d{1,4})/i) ||
      part.match(/(?:सही|Right)\s*(?:विकल्प|Option)[^\d\n]{0,10}(\d{1,4})/i);

    const given = asOptionNumber(chosenMatch?.[1] ?? chosenMatch?.[2]);
    const correctNumber = asOptionNumber(rightMatch?.[1]);

    let status: QuestionData['status'] = 'unattempted';
    if (notAnswered || !given) {
      status = 'unattempted';
    } else if (correctNumber) {
      status = correctNumber === given ? 'correct' : 'wrong';
    } else {
      /* The key is missing for this question — never guess it right by accident. */
      status = 'wrong';
    }

    questions.push({
      questionNumber: parseInt(heading[1], 10) || questions.length + 1,
      candidateAnswer: notAnswered ? 'Not Attempted' : given || '--',
      correctAnswer: correctNumber || undefined,
      status,
      marks: status === 'correct' ? 1 : status === 'wrong' ? -0.25 : 0,
    });

    if (questions.length > 1500) break; // runaway guard
  }

  /* The engine is only trustworthy if it read a real run of questions. */
  if (questions.length < 20) return [];
  return questions.sort((a, b) => a.questionNumber - b.questionNumber).map((q, i) => ({ ...q, questionNumber: i + 1 }));
}

/** Engine 2 — TCS iON panels. */
function parseTcsPanels(doc: Document): QuestionData[] {
  const questions: QuestionData[] = [];
  const selector = '.question-pnl, .questionPnl, .section-cnt, table.question, div.question, .questionRowTbl';
  const matched = Array.from(doc.querySelectorAll(selector));
  if (!matched.length) return questions;

  // The selector list matches both a question panel and the option table nested
  // inside it — keep only the outermost node per question, or every question
  // would be counted twice (200 questions => 400 rows).
  const panels = matched.filter(
    (el) => !matched.some((other) => other !== el && typeof other.contains === 'function' && other.contains(el))
  );

  panels.forEach((panel, qIdx) => {
    const pText = panel.textContent || '';

    let chosenOption: string | null = null;
    const chosenMatch = pText.match(
      /(?:Chosen\s*Option|Given\s*Answer|Candidate\s*Option|दिया\s*गया\s*विकल्प)[\s:]*([0-9]+|--|[A-Da-d])/i
    );
    if (chosenMatch) chosenOption = chosenMatch[1].trim();

    const isNotAnswered =
      pText.includes('Not Answered') || pText.includes('नॉट आंसर्ड') || pText.includes('Not Attempted') || !chosenOption || chosenOption === '--';

    let correctOptionIndex = -1;
    const optionRows = panel.querySelectorAll('.questionRowTbl tr, tr.questionRow, .option-tbl tr, table tr');
    optionRows.forEach((row, oIdx) => {
      const hasRightClass =
        row.classList.contains('rightAns') ||
        row.querySelector('.rightAns') !== null ||
        row.querySelector('img[src*="correct"], img[src*="tick"], img[src*="right"]') !== null;
      const styleAttr = row.getAttribute('style') || '';
      const isGreenBg = /#71C387|green|#5cb85c|rgb\(113,\s*195,\s*135\)|#dff0d8/i.test(styleAttr);
      if (hasRightClass || isGreenBg) correctOptionIndex = oIdx + 1;
    });

    if (correctOptionIndex === -1) {
      const correctTextMatch = pText.match(/(?:Right\s*Option|Correct\s*Option|सही\s*विकल्प)[\s:]*([1-4]|[A-D])/i);
      if (correctTextMatch) {
        const val = correctTextMatch[1];
        correctOptionIndex = /^\d$/.test(val) ? parseInt(val, 10) : val.toUpperCase().charCodeAt(0) - 64;
      }
    }

    let status: QuestionData['status'] = 'unattempted';
    if (!isNotAnswered && chosenOption) {
      const chosenNum = optionToIndex(chosenOption);
      if (correctOptionIndex !== -1 && chosenNum !== null) status = chosenNum === correctOptionIndex ? 'correct' : 'wrong';
      else status = pText.includes('Right Answer') ? 'correct' : pText.includes('Correct') ? 'correct' : 'wrong';
    }

    questions.push({
      questionNumber: qIdx + 1,
      candidateAnswer: chosenOption || '--',
      correctAnswer: correctOptionIndex !== -1 ? String(correctOptionIndex) : undefined,
      status,
      marks: status === 'correct' ? 1 : status === 'wrong' ? -0.25 : 0,
    });
  });

  return questions;
}

/* ========================================================================== */
/*  Public parser                                                             */
/* ========================================================================== */

export interface ParseMeta {
  fileKind?: 'MHTML' | 'HTML' | 'PLAIN';
  encoding?: string;
  sizeBytes?: number;
  warnings?: string[];
}

/** `doc.body.textContent` without letting a partial document throw. */
function safeBodyText(doc: any): string {
  try {
    const t = doc?.body?.textContent;
    if (typeof t === 'string' && t.trim()) return t;
  } catch {
    /* linkedom throws when documentElement is missing */
  }
  try {
    const t = doc?.documentElement?.textContent;
    if (typeof t === 'string' && t.trim()) return t;
  } catch {}
  return '';
}

/**
 * Tag stripper for the paste path that keeps the *line structure* of the page.
 * A browser copy already flattened the table, but block-level ends still carry
 * the row breaks the identity lines ("Roll Number 3001260688994") rely on.
 */
function stripTagsForText(markup: string): string {
  return markup
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!(?:--)[\s\S]*?-->/g, ' ')
    .replace(/<\/(?:div|p|tr|li|ul|ol|table|h[1-6]|section|article|br|dt|dd|blockquote|pre)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    // Emphasis markers from a copy that passed through a note app / chat /
    // markdown viewer. They are noise for every pattern below, and "**Roll
    // Number**3001…" style wrapping used to hide the label from the reader.
    .replace(/\*\*|__|~~|\+\+|==+/g, '')
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class AnswerKeyParser {
  /**
   * @param rawContent decoded document text (HTML *or* an MHTML archive)
   * @param fileName   used for roll-number / name fallbacks
   */
  public parse(rawContent: string, fileName = '', meta: ParseMeta = {}): ParsedAnswerKeyData {
    if (!rawContent || rawContent.trim().length === 0) {
      throw new Error(
        'पेस्ट किया गया हिस्सा खाली है। ESB के Response Sheet पेज पर पूरा पेज सेलेक्ट करके (Ctrl+A / सभी चुनें) कॉपी करें और यहाँ पेस्ट करें।'
      );
    }
    const warnings: string[] = [...(meta.warnings || [])];

    /* 1. container */
    const unpacked = unpackMHTMLDetailed(rawContent);
    const html = unpacked.html || rawContent;
    warnings.push(...unpacked.warnings);

    /* 2. DOM — optional.
     *
     * The primary input path in this app is *pasted text* (candidate selects all
     * on the ESB response-sheet page and copies it), which arrives as plain text
     * with no tags at all. Feeding that to DOMParser is not only wasted work, some
     * implementations (linkedom) hand back a document whose `body` getter throws.
     * So: sniff for HTML first, and only then build a DOM, and never trust
     * `body` without a guard. Text-only content goes straight to the raw-text
     * engines (MPESB blocks / summary lines), which is what they are for.
     */
    const looksLikeMarkup = /<\s*(?:!?doctype|html|body|head|table|thead|tbody|tr|td|th|div|p|span|font|br|a|b|i|u|img|meta|title|script|style|li|ul|ol|h[1-6]|section|article|center|pre|b)[\s>/]/i.test(
      html.slice(0, 20000)
    );

    let doc: Document | null = null;
    let allText = '';
    if (looksLikeMarkup && typeof DOMParser !== 'undefined') {
      try {
        const candidateDoc = new DOMParser().parseFromString(html, 'text/html') as Document;
        const body = safeBodyText(candidateDoc);
        if (candidateDoc && body.trim().length) {
          doc = candidateDoc;
          allText = body;
        }
      } catch {
        doc = null;
      }
    }

    if (!allText.trim()) {
      allText = stripTagsForText(html);
      if (doc && !looksLikeMarkup) doc = null;
    }
    if (!doc && looksLikeMarkup) {
      warnings.push('इस वातावरण में DOM उपलब्ध नहीं — केवल टेक्स्ट आधारित पहचान चली।');
    }

    /* 3. candidate identity */
    let candidateName = '';
    let rollNumber = '';
    let examDate = '';
    let testTime = '';
    let examinationName = '';

    if (doc) {
      doc.querySelectorAll('tr').forEach((row) => {
        const cells = row.querySelectorAll('td, th');
        if (cells.length < 2) return;
        for (let i = 0; i < cells.length - 1; i++) {
          const label = (cells[i].textContent || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const val = (cells[i + 1].textContent || '').trim();

          if (
            !rollNumber &&
            (label.includes('roll number') ||
              label.includes('roll no') ||
              label.includes('अनुक्रमांक') ||
              label.includes('participant id') ||
              label.includes('application no') ||
              label.includes('पंजीयन'))
          ) {
            const digitMatch = val.match(/(\d{6,20})/);
            if (digitMatch) rollNumber = digitMatch[1];
          }

          if (
            !candidateName &&
            !label.includes('examination') &&
            !label.includes('exam') &&
            !label.includes('center') &&
            (label.includes('name of the candidate') ||
              label.includes('candidate name') ||
              label.includes('participant name') ||
              label.includes('परीक्षार्थी का नाम') ||
              label.includes('अभ्यर्थी का नाम') ||
              label === 'name' ||
              label === 'नाम')
          ) {
            const cleanVal = val.replace(/^[:\s-]+/, '').trim();
            if (cleanVal.length >= 2 && !/^(roll|exam|date|shift|test)/i.test(cleanVal)) candidateName = cleanVal;
          }

          if (
            !examinationName &&
            (label.includes('examination name') || label.includes('exam name') || label.includes('subject') || label.includes('विषय'))
          ) {
            examinationName = val;
          }

          if (
            !examDate &&
            (label.includes('exam date') ||
              label.includes('test date') ||
              label.includes('परीक्षा दिनांक') ||
              label.includes('दिनांक'))
          ) {
            const dMatch = val.match(/(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/);
            if (dMatch) examDate = dMatch[1];
            const tMatch = val.match(/(\d{1,2}[:.]\d{2}(?:\s*[AaPp][Mm])?)/);
            if (tMatch) testTime = tMatch[1];
          }

          if (
            !testTime &&
            (label.includes('test time') || label.includes('exam time') || label.includes('समय') || label.includes('shift'))
          ) {
            testTime = val;
          }
        }
      });
    }

    if (!rollNumber) {
      const rollMatch =
        html.match(/<td[^>]*>\s*Roll\s*(?:Number|No\.?)[\s\S]*?<\/td>\s*<td[^>]*>[\s\S]*?(\d{6,20})/i) ||
        allText.match(/(?:Roll\s*(?:Number|No\.?)|Participant\s*ID|अनुक्रमांक|Application\s*No\.?)[^\d]{0,50}(\d{6,20})/i) ||
        allText.match(/\b(2\d{7,11})\b/) ||
        allText.match(/\b(3\d{9,13})\b/);
      if (rollMatch) rollNumber = rollMatch[1].trim();
    }

    if (!rollNumber && fileName) {
      const fromName = fileName.match(/(\d{8,15})/);
      if (fromName) {
        rollNumber = fromName[1];
        warnings.push('रोल नंबर फ़ाइल के नाम से लिया गया — कृपया जाँच लें।');
      }
    }

    if (!candidateName) {
      const nameMatch =
        html.match(/<td[^>]*>\s*Name\s*(?:of\s*the\s*Candidate)?\s*<\/td>\s*<td[^>]*>\s*([^<]+)\s*<\/td>/i) ||
        allText.match(
          /(?:Name\s*of\s*the\s*Candidate|Candidate\s*Name|परीक्षार्थी\s*का\s*नाम|अभ्यर्थी\s*का\s*नाम)[:.\s-]*([A-Za-zऀ-ॿ][A-Za-zऀ-ॿ\s.']{2,35}?)(?=\s*(?:Roll|Father|Exam|Date|Test|Shift|Subject|\n|\r|$))/i
        );
      if (nameMatch) {
        const clean = nameMatch[1].trim();
        if (clean.length >= 2 && !/^(roll|exam|date|test)/i.test(clean)) candidateName = clean;
      }
    }

    if (!examDate) {
      const dateMatch = allText.match(
        /(?:Exam\s*Date|Test\s*Date|परीक्षा\s*दिनांक|दिनांक)[^\d]{1,50}(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})/i
      );
      if (dateMatch) examDate = dateMatch[1].trim();
    }

    if (!testTime) {
      /*
       * A printed "Shift / पारी" line is the *best* shift evidence there is, and in
       * the DOM path the same value is already picked up from its table cell. Do
       * the equivalent for a paste, where there are no cells — otherwise the very
       * same page would be "explicit shift 2" as a file but a mere guess as text.
       */
      const shiftLine = allText.match(/(?:^|\n)\s*(?:Shift|पारी|Session)\s*(?:No\.?|Number|#)?\s*[:.\t ]+([^\n]{1,40})/i);
      if (shiftLine) testTime = shiftLine[1].trim();
    }

    if (!testTime) {
      const timeMatch = allText.match(/(\d{1,2}[:.]\d{2}\s*(?:[AaPp]\.?[Mm]\.?)?)/);
      if (timeMatch) testTime = timeMatch[1].trim();
    }

    if (!examinationName) {
      const exMatch = allText.match(
        /(?:Examination\s*Name|Exam\s*Name|परीक्षा\s*का\s*नाम)[:.\s-]*([\s\S]{2,120}?)(?=\s*(?:Exam\s*Date|Test\s*Date|परीक्षा\s*दिनांक|Marking|Section|\n|$))/i
      );
      if (exMatch) examinationName = exMatch[1].trim();
    }

    /* 4. shift */
    const guess = determineShiftGuess(examDate || '', testTime, examinationName);
    if (!examDate) {
      warnings.push('पेस्ट की गई सामग्री में परीक्षा की तारीख नहीं मिली — शिफ्ट तारीख+समय से तय होती है, इसलिए नीचे ज़रूर जाँच लें।');
    }
    if (!guess.confident) {
      const label =
        guess.reason === 'date-only'
          ? 'उसी दिन की दूसरी पारी भी संभव है'
          : guess.reason === 'day-only'
          ? 'दिनांक अधूरा था'
          : 'शिफ्ट स्वतः नहीं पहचानी जा सकी';
      warnings.push(`शिफ्ट ${guess.shiftNumber} अनुमानित है (${label}) — कृपया नीचे पुष्टि करें।`);
    }

    /* 5. questions */
    let questions: QuestionData[] = [];
    let engine = '';

    if (doc) {
      const sheet = parseResponseSheetTable(doc);
      if (sheet.questions.length) {
        questions = sheet.questions;
        engine = 'RESPONSE_SHEET_TABLE';
      }
    }

    if (!questions.length) {
      const mpesb = parseMpesbBlocks(html);
      if (mpesb.length) {
        questions = mpesb;
        engine = 'MPESB_BLOCKS';
      }
    }

    if (!questions.length && doc) {
      const tcs = parseTcsPanels(doc);
      if (tcs.length) {
        questions = tcs;
        engine = 'TCS_ION_PANELS';
      }
    }

    if (!questions.length) {
      const tcsText = parseChosenOptionBlocks(allText);
      if (tcsText.length) {
        questions = tcsText;
        engine = 'TCS_ION_TEXT';
      }
    }

    /* 6. summary fallback */
    let detectedCorrect = 0;
    let detectedWrong = 0;
    let detectedTotal = 200;

    // `\s*` (not `+`): textContent glues the label to its value — "Correct142".
    const summaryMatch =
      allText.match(/(?:Correct|सही\s*उत्तर)[\s:.,-]*(\d{1,3})[\s\S]{0,80}?(?:Wrong|Incorrect|गलत\s*उत्तर)[\s:.,-]*(\d{1,3})/i) ||
      allText.match(/Total\s*Questions[\s:.,-]*(\d{2,3})[\s\S]{0,80}?Attempted[\s:.,-]*(\d{1,3})[\s\S]{0,80}?Correct[\s:.,-]*(\d{1,3})/i);

    if (!questions.length && summaryMatch) {
      if (summaryMatch.length === 3) {
        detectedCorrect = parseInt(summaryMatch[1], 10);
        detectedWrong = parseInt(summaryMatch[2], 10);
      } else if (summaryMatch.length === 4) {
        detectedTotal = parseInt(summaryMatch[1], 10);
        detectedCorrect = parseInt(summaryMatch[3], 10);
        const attempted = parseInt(summaryMatch[2], 10);
        detectedWrong = Math.max(0, attempted - detectedCorrect);
      }
      for (let i = 1; i <= detectedTotal; i++) {
        let status: QuestionData['status'] = 'unattempted';
        if (i <= detectedCorrect) status = 'correct';
        else if (i <= detectedCorrect + detectedWrong) status = 'wrong';
        questions.push({
          questionNumber: i,
          candidateAnswer: status === 'correct' ? 'Option 1' : status === 'wrong' ? 'Option 2' : 'Not Attempted',
          correctAnswer: 'Option 1',
          status,
          marks: status === 'correct' ? 1 : status === 'wrong' ? -0.25 : 0,
        });
      }
      engine = 'SUMMARY_ONLY';
      warnings.push('प्रत्येक प्रश्न का विवरण नहीं मिला — कुल सही/गलत संख्या से गणना की गई है। नीचे संख्याएँ ज़रूर जाँच लें।');
    }

    const totalQuestions = questions.length > 0 ? questions.length : 200;
    const correct = questions.filter((q) => q.status === 'correct').length;
    const wrong = questions.filter((q) => q.status === 'wrong').length;
    const unattempted = Math.max(0, totalQuestions - correct - wrong);
    const scoreData = calculateRawScore(correct, wrong, totalQuestions);
    const hasCandidateInfo = Boolean(rollNumber && rollNumber.length >= 6);

    if (!questions.length) {
      warnings.push(
        'प्रश्न स्वतः नहीं पढ़े जा सके। नीचे सही/गलत संख्या भरकर पुष्टि करें, या ब्राउज़र में पेज खोलकर Ctrl+U → पूरा सोर्स पेस्ट करें।'
      );
    }

    const answerPattern = questions
      .map((q) => (q.status === 'correct' ? '1' : q.status === 'wrong' ? '2' : '0'))
      .join('');

    return {
      candidateName: candidateName || cleanNameFromFile(fileName) || 'परीक्षार्थी',
      rollNumber: rollNumber || '',
      examDate: examDate || '',
      shiftNumber: guess.shiftNumber,
      shiftId: `shift-${String(guess.shiftNumber).padStart(2, '0')}`,
      totalQuestions,
      attempted: correct + wrong,
      unattempted,
      correct,
      wrong,
      rawScore: scoreData.rawScore,
      accuracy: scoreData.accuracy,
      confidence: hasCandidateInfo && questions.length > 0 ? 'VERIFIED' : 'WARNING',
      questions,
      answerPattern: answerPattern.length === totalQuestions ? answerPattern : '',
      sourceFormat: describeFormat(rawContent, engine, unpacked.isMhtml, meta, hasCandidateInfo, !looksLikeMarkup),
      fileKind: meta.fileKind || (unpacked.isMhtml ? 'MHTML' : 'HTML'),
      encoding: meta.encoding || unpacked.charset,
      fileName: fileName || undefined,
      fileBytes: meta.sizeBytes,
      notes: questions.length === 0 ? warnings[0] : undefined,
      warnings,
    };
  }
}

function cleanNameFromFile(fileName: string): string {
  if (!fileName) return '';
  return fileName
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(mhtml|html|answer|key|response|sheet|vyapam|mpesb|cbtexam|candidate|roll)\b/gi, '')
    .replace(/\d{6,}/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
    .slice(0, 60);
}

function describeFormat(
  rawContent: string,
  engine: string,
  isMhtml: boolean,
  meta: ParseMeta,
  hasInfo: boolean,
  plainText = false
): string {
  /*
   * `plainText` wins over the caller's fileKind guess: the main input path in this
   * app is text copied off the ESB page, and labelling that "HTML" in the audit
   * trail would be misleading.
   */
  const container = plainText || meta.fileKind === 'PLAIN' ? 'PASTED_TEXT' : isMhtml || meta.fileKind === 'MHTML' ? 'MHTML' : 'HTML';
  const source = /cbtexam\.in/i.test(rawContent)
    ? 'MPESB_CBT'
    : /vyapam/i.test(rawContent)
    ? 'VYAPAM'
    : /\btcs\b|tcsion|ion\.co|question-pnl|rightAns/i.test(rawContent)
    ? 'TCS_ION'
    : 'GENERIC';
  return `${source}_${container}_${engine || (hasInfo ? 'MANUAL' : 'EMPTY')}`.slice(0, 40);
}

export { OPTION_LETTERS };
