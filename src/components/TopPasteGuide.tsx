/**
 * The one-line instruction that sits ABOVE the header, because it is the first
 * thing every visitor needs — and the only thing this site can be used for.
 *
 * Deliberately tiny and server-independent: no images, no modal, no tour. It
 * collapses to a single line on phones and expands on tap.
 */
import React, { useState } from 'react';
import { ClipboardList, ChevronDown, ChevronUp } from 'lucide-react';

export const TopPasteGuide: React.FC<{ onGoPaste: () => void }> = ({ onGoPaste }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="w-full bg-slate-900 text-slate-100 dark:bg-black">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[11.5px] sm:px-6 lg:px-8 sm:text-xs">
        <span className="inline-flex items-center gap-1.5 font-bold text-amber-400">
          <ClipboardList className="h-3.5 w-3.5" />
          तरीका
        </span>
        <span className="font-medium">
          ESB के <b className="text-white">Response Sheet</b> पेज पर जाकर{' '}
          <b className="text-white">पूरा पेज सेलेक्ट</b> करें → <b className="text-white">कॉपी</b> → यहाँ{' '}
          <b className="text-white">पेस्ट</b> करें। बस — इसी से रैंक बनेगी।
        </span>
        <span className="hidden text-slate-400 md:inline">
          (लैपटॉप/PC: <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono">Ctrl</kbd>+{' '}
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono">A</kbd> फिर{' '}
          <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono">C</kbd> · मोबाइल: अंगुली दबाकर{' '}
          <b className="text-slate-200">सभी चुनें → कॉपी</b>)
        </span>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            विस्तार से
          </button>
          <button
            type="button"
            onClick={onGoPaste}
            className="rounded-lg bg-amber-500 px-3 py-1 text-[11.5px] font-extrabold text-slate-950 shadow-sm transition hover:bg-amber-400 sm:text-xs"
          >
            उत्तर कुंजी पेस्ट करें
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-slate-800 bg-slate-950/60">
          <div className="mx-auto grid max-w-7xl gap-3 px-4 py-4 text-[11.5px] sm:grid-cols-3 sm:px-6 lg:px-8">
            {[
              {
                n: '1',
                t: 'अपना Response Sheet पेज खोलें',
                d: 'ESB की जिस पेज पर आपके सभी प्रश्न, “Answer Given by Candidate” और “Correct Answer” दिख रहे हैं। (आपकी उत्तर-कुंजी/प्रश्न-पत्र पेज)',
              },
              {
                n: '2',
                t: 'पूरा पेज सेलेक्ट करें',
                d: 'लैपटॉप/PC: पेज पर कहीं क्लिक करके Ctrl + A · मोबाइल/टेबलेट: स्क्रीन पर अंगुली दबाकर रखें → “सभी चुनें / Select all”',
              },
              {
                n: '3',
                t: 'कॉपी करके यहाँ पेस्ट करें',
                d: 'लैपटॉप/PC: Ctrl + C, फिर इस साइट पर आकर Ctrl + V · मोबाइल: लंबा दबाकर “कॉपी”, फिर बॉक्स में “पेस्ट”। पेस्ट होते ही गिनती अपने आप निकल आएगी।',
              },
            ].map((s) => (
              <div key={s.n} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="grid h-5 w-5 place-items-center rounded-full bg-amber-500 text-[11px] font-black text-slate-950">
                    {s.n}
                  </span>
                  <span className="font-bold text-white">{s.t}</span>
                </div>
                <p className="leading-relaxed text-slate-400">{s.d}</p>
              </div>
            ))}
            <p className="text-[11px] leading-relaxed text-slate-400 sm:col-span-3">
              फ़ाइल सेव करने, अपलोड करने या ई-मेल करने की ज़रूरत <b className="text-slate-200">नहीं</b> है। पेस्ट की गई
              सामग्री आपके ब्राउज़र से बाहर नहीं जाती — सर्वर पर केवल नाम, रोल नंबर, शिफ्ट-तारीख और सही/गलत/प्रयासित/
              अनुत्तीर्ण की संख्याएँ सेव होती हैं (साथ में केवल श्रेणी, लिंग व योग्यता, जिन्हें आप बदल सकते हैं)।
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default TopPasteGuide;
