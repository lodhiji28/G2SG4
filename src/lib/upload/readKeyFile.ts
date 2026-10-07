/**
 * Answer-key file reader — `.html`, `.htm`, `.mhtml`, `.mht` (and plain text).
 *
 * Why this exists instead of a one-line `FileReader.readAsText`:
 *  1. Vyapam/MPESB response sheets saved from Chrome are **MHTML** — a MIME
 *     multipart archive whose HTML part is quoted-printable encoded. Reading it
 *     as text is fine, but the *kind* must be detected so the parser unpacks it.
 *  2. `readAsText()` silently assumes UTF-8. Older MPESB/TCS pages declare
 *     `charset=windows-1252`/`us-ascii`, which turns Hindi into mojibake and
 *     breaks the "सही उत्तर" regexes. So we read bytes, sniff the declared
 *     charset, decode with it, and verify the result.
 *  3. `.mhtml`/`.mht` MIME types are not registered in every OS, so file
 *     pickers often hand back an empty `file.type`. Extension + content sniffing
 *     is therefore the authority, never `file.type`.
 */

export type AnswerKeyKind = 'MHTML' | 'HTML' | 'PLAIN';

export interface ReadAnswerKeyResult {
  /** Decoded document text (MHTML envelope still intact — the parser unpacks it). */
  content: string;
  fileName: string;
  sizeBytes: number;
  kind: AnswerKeyKind;
  encoding: string;
  warnings: string[];
}

export const SUPPORTED_EXTENSIONS = ['html', 'htm', 'mhtml', 'mht', 'shtml', 'xhtml', 'txt', 'text', 'asc'] as const;

/**
 * Put this on the file input's `accept` attribute. Deliberately NOT a wildcard:
 * extension list + runtime content sniffing is what actually works for .mhtml
 * across platforms (many OSes register no MIME type for it, so the browser
 * hands back an empty `file.type`).
 */
export const ACCEPT_ATTR = SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',');

export const MAX_FILE_BYTES = 40 * 1024 * 1024;
const BIG_FILE_BYTES = 12 * 1024 * 1024;

const MIME_GUESS: Record<string, AnswerKeyKind> = {
  'text/html': 'HTML',
  'application/xhtml+xml': 'HTML',
  'multipart/related': 'MHTML',
  'message/rfc822': 'MHTML',
  'text/plain': 'PLAIN',
};

export function extensionOf(name: string): string {
  const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

export function isSupportedFileName(name: string): boolean {
  const ext = extensionOf(name);
  return ext === '' ? true : (SUPPORTED_EXTENSIONS as readonly string[]).includes(ext);
}

/** Extension > declared MIME > content sniffing. Throws with a Hindi message when clearly unsupported. */
export function classifyFile(file: File | { name: string; type?: string; size?: number }): {
  kind: AnswerKeyKind;
  supported: boolean;
} {
  const ext = extensionOf(file.name);
  const byMime = MIME_GUESS[(file.type || '').toLowerCase().split(';')[0].trim()];

  if (ext === 'mhtml' || ext === 'mht') return { kind: 'MHTML', supported: true };
  if (ext === 'html' || ext === 'htm' || ext === 'shtml' || ext === 'xhtml') return { kind: 'HTML', supported: true };
  if (ext === 'txt' || ext === 'text' || ext === 'asc') return { kind: 'PLAIN', supported: true };
  if (byMime) return { kind: byMime, supported: true };
  if (!ext) return { kind: 'HTML', supported: true };

  const blocked: Record<string, string> = {
    pdf: 'यह PDF फ़ाइल है। ब्राउज़र में उत्तर कुंजी खोलें → Ctrl+S → "Webpage, Complete (HTML)" से सेव करें, या पेज का सोर्स (Ctrl+U) कॉपी करके "कोड पेस्ट करें" टैब में डालें।',
    doc: 'Word फ़ाइल समर्थित नहीं है। कृपया मूल .html / .mhtml फ़ाइल अपलोड करें।',
    docx: 'Word फ़ाइल समर्थित नहीं है। कृपया मूल .html / .mhtml फ़ाइल अपलोड करें।',
    jpg: 'छवि (फ़ोटो/स्क्रीनशॉट) से डेटा नहीं निकाला जा सकता। कृपया Vyapam से डाउनलोड की गई .html या .mhtml फ़ाइल चुनें।',
    jpeg: 'छवि (फ़ोटो/स्क्रीनशॉट) से डेटा नहीं निकाला जा सकता। कृपया .html या .mhtml फ़ाइल चुनें।',
    png: 'छवि से डेटा नहीं निकाला जा सकता। कृपया .html या .mhtml फ़ाइल चुनें।',
    zip: 'ज़िप फ़ाइल संपीड़ित होती है — भीतर की .html/.mhtml फ़ाइल निकालकर अपलोड करें।',
    rar: 'संपीड़ित फ़ाइल है — भीतर की .html/.mhtml फ़ाइल निकालकर अपलोड करें।',
    csv: 'CSV के लिए Admin पैनल का "डेटा आयात करें" विकल्प उपयोग करें (उम्मीदवार सूची एक साथ)।',
    xlsx: 'Excel फ़ाइल के लिए Admin पैनल का आयात विकल्प उपयोग करें (CSV में सेव करके)।',
  };
  if (blocked[ext]) throw new Error(blocked[ext]);
  return { kind: 'HTML', supported: false };
}

/* ------------------------------------------------------------------ read --- */

export async function readAnswerKeyFile(file: File): Promise<ReadAnswerKeyResult> {
  const { kind, supported } = classifyFile(file);
  const warnings: string[] = [];

  if (!supported) {
    throw new Error(`"${file.name}" समर्थित फ़ाइल प्रकार नहीं है। .html, .htm, .mhtml, .mht या .txt फ़ाइल चुनें।`);
  }
  if (!file.size) throw new Error('फ़ाइल खाली है (0 बाइट)। कृपया सही फ़ाइल चुनें।');
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`फ़ाइल बहुत बड़ी है (${(file.size / 1024 / 1024).toFixed(1)} MB)। अधिकतम ${MAX_FILE_BYTES / 1024 / 1024} MB।`);
  }
  if (file.size > BIG_FILE_BYTES) {
    warnings.push('फ़ाइल बड़ी है — पार्स करने में कुछ सेकंड लग सकते हैं।');
  }

  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Reject obvious binaries before decoding (magic bytes, not extensions).
  assertNotBinary(bytes, file.name);

  const { text, encoding, suspicious } = decodeHtmlBytes(bytes);
  if (suspicious) warnings.push(`फ़ाइल की एन्कोडिंग (${encoding}) अस्पष्ट थी — बेहतर परिणाम के लिए txt/कोड पेस्ट विकल्प आज़माएँ।`);

  const sniffedKind = detectKindFromText(text);
  if (sniffedKind === 'MHTML' && kind !== 'MHTML') {
    warnings.push('फ़ाइल का एक्सटेंशन .html है पर भीतर MHTML (माइम) डेटा है — स्वचालित रूप से ठीक किया गया।');
  }
  if (kind === 'MHTML' && sniffedKind !== 'MHTML') {
    warnings.push('MHTML हाइलाइट नहीं मिला — फ़ाइल को सीधे HTML के रूप में पढ़ा जाएगा।');
  }

  if (!/<html|<!doctype|question|प्रश्न|=3C/i.test(text)) {
    warnings.push('फ़ाइल में उत्तर कुंजी जैसी सामग्री नहीं मिली — कृपया संख्याएँ खुद जाँचकर पुष्टि करें।');
  }

  return {
    content: text,
    fileName: file.name,
    sizeBytes: file.size,
    kind: sniffedKind,
    encoding,
    warnings,
  };
}

/* --------------------------------------------------------------- decoding -- */

const UTF8_FATAL = 'utf-8';
const LABELS: Record<string, string> = {
  'utf8': 'utf-8',
  'us-ascii': 'windows-1252',
  'ascii': 'windows-1252',
  'iso-8859-1': 'windows-1252',
  'latin1': 'windows-1252',
  'latin-1': 'windows-1252',
  'windows-1252': 'windows-1252',
  'cp1252': 'windows-1252',
  'utf-16': 'utf-16le',
  'x-utf-16le': 'utf-16le',
};

function normalizeLabel(label: string): string | null {
  const key = String(label || '').trim().toLowerCase();
  if (!key) return null;
  if (LABELS[key]) return LABELS[key];
  if (/^utf-?8$/.test(key)) return 'utf-8';
  if (/^utf-?16/.test(key)) return key.includes('be') ? 'utf-16be' : 'utf-16le';
  if (/^(iso-)?8859-(1|2|9|15)$/.test(key)) return 'windows-1252';
  try {
    new TextDecoder(key);
    return key;
  } catch {
    return null;
  }
}

function toReplacementCount(text: string): number {
  const m = text.match(/\uFFFD/g);
  return m ? m.length : 0;
}

function decode(bytes: Uint8Array, label: string, fatal = false): string {
  try {
    return new TextDecoder(label, { fatal, ignoreBOM: true }).decode(bytes);
  } catch {
    return '';
  }
}

/** BOM → declared charset → strict UTF-8 → windows-1252 fallback. */
export function decodeHtmlBytes(bytes: Uint8Array): { text: string; encoding: string; suspicious: boolean } {
  // 1. Byte order marks win over everything.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: decode(bytes.subarray(3), 'utf-8'), encoding: 'utf-8 (BOM)', suspicious: false };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: decode(bytes.subarray(2), 'utf-16le'), encoding: 'utf-16le (BOM)', suspicious: false };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { text: decode(bytes.subarray(2), 'utf-16be'), encoding: 'utf-16be (BOM)', suspicious: false };
  }

  // 2. Declared charset in <meta> or the MHTML Content-Type header.
  const head = decode(bytes.subarray(0, Math.min(bytes.length, 16384)), 'windows-1252');
  const declared =
    head.match(/<meta[^>]+charset\s*=\s*["']?\s*([\w.-]+)/i)?.[1] ||
    head.match(/charset\s*=\s*["']?\s*([\w.-]+)/i)?.[1];

  if (declared) {
    const label = normalizeLabel(declared);
    if (label) {
      const text = decode(bytes, label);
      if (text && toReplacementCount(text) === 0) {
        return { text, encoding: label, suspicious: false };
      }
    }
  }

  // 3. Strict UTF-8, then the lenient variants — pick whichever is cleanest.
  const utf8Strict = decode(bytes, UTF8_FATAL, true);
  if (utf8Strict) return { text: utf8Strict, encoding: 'utf-8', suspicious: false };

  const utf8Lenient = decode(bytes, 'utf-8');
  const cp1252 = decode(bytes, 'windows-1252');
  const utf8Bad = toReplacementCount(utf8Lenient);
  const cpBad = toReplacementCount(cp1252);

  if (cp1252 && utf8Bad > 0 && cpBad < utf8Bad) return { text: cp1252, encoding: 'windows-1252', suspicious: false };
  if (utf8Lenient) {
    return { text: utf8Lenient, encoding: 'utf-8', suspicious: utf8Bad > 0 };
  }
  return { text: cp1252, encoding: 'windows-1252', suspicious: true };
}

function assertNotBinary(bytes: Uint8Array, name: string) {
  const head = bytes.subarray(0, 8);
  const hex = Array.from(head, (b) => b.toString(16).padStart(2, '0')).join('');
  const signatures: [string, string][] = [
    ['255044462d312e', 'यह PDF फ़ाइल है। ब्राउज़र में उत्तर कुंजी खोलकर Ctrl+S → "Webpage, Complete" से सेव करें या सोर्स कोड पेस्ट करें।'],
    ['504b0304', 'यह एक ज़िप/Office फ़ाइल है। भीतर की .html/.mhtml फ़ाइल निकालकर अपलोड करें।'],
    ['ffd8ffe0', 'यह JPEG छवि है — फ़ोटो/स्क्रीनशॉट से विश्लेषण संभव नहीं है। मूल .mhtml/.html फ़ाइल चुनें।'],
    ['ffd8ffe1', 'यह JPEG छवि है — मूल .mhtml/.html फ़ाइल चुनें।'],
    ['89504e470d0a1a0a', 'यह PNG छवि है — मूल .mhtml/.html फ़ाइल चुनें।'],
    ['474946383961', 'यह GIF छवि है — मूल .mhtml/.html फ़ाइल चुनें।'],
    ['526172211a070100', 'यह RAR अकाइव है — भीतर की फ़ाइल निकालें।'],
  ];
  for (const [magic, message] of signatures) {
    if (hex.startsWith(magic)) throw new Error(`${name}: ${message}`);
  }
  // NUL bytes in the first 4 KB usually mean "not a text document". Legitimate
  // UTF-16 markup also has NULs, so only reject when UTF-16 decoding does not
  // produce markup either.
  const probe = bytes.subarray(0, Math.min(bytes.length, 4096));
  let nulls = 0;
  for (let i = 0; i < probe.length; i++) if (probe[i] === 0x00) nulls++;
  if (nulls / probe.length > 0.05) {
    const asUtf16 = decode(probe, 'utf-16le').toLowerCase();
    if (!asUtf16.includes('<html') && !asUtf16.includes('<!doctype') && !asUtf16.includes('mime-version')) {
      throw new Error(`${name}: यह बाइनरी फ़ाइल प्रतीत होती है। कृपया .html या .mhtml टेक्स्ट फ़ाइल चुनें।`);
    }
  }
}

export function detectKindFromText(text: string): AnswerKeyKind {
  if (!text) return 'HTML';
  const head = text.slice(0, 4000);
  if (/MIME-Version:|multipart\/related|Content-Transfer-Encoding:|From: <Saved by Blink>/i.test(head)) return 'MHTML';
  if (/=3C(html|!doctype)|=20[A-Za-z]+=3D/i.test(head)) return 'MHTML';
  if (/<!doctype html|<html[\s>]/i.test(head)) return 'HTML';
  return 'PLAIN';
}

/** Human label for the UI badge next to a file name. */
export function kindLabel(kind: AnswerKeyKind): string {
  return kind === 'MHTML' ? 'MHTML (Chrome सहेजी गई)' : kind === 'HTML' ? 'HTML' : 'टेक्स्ट';
}
