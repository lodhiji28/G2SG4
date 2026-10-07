import React, { useMemo, useState } from 'react';
import { BookOpen, Calculator, ShieldCheck, CheckCircle2, AlertTriangle, FileCode, Database } from 'lucide-react';
import { RawMarksDisclaimer } from './RawMarksDisclaimer';
import { computeNep, type PercentileDefinition } from '../lib/normalization';
import type { CandidateRecord } from '../types';

interface Props {
  candidates?: CandidateRecord[];
}

export const MethodologyView: React.FC<Props> = ({ candidates = [] }) => {
  const [nepOpen, setNepOpen] = useState(false);
  const [def, setDef] = useState<PercentileDefinition>('equi');

  // Board-style NEP preview (#72) — shown, but never used for the live ranking.
  const nep = useMemo(() => {
    const rows = candidates
      .filter((c) => c.rawScore > 0)
      .map((c) => ({
        rollNumber: c.rollNumber,
        shiftNumber: c.shiftNumber,
        rawScore: c.rawScore,
        maxMarksForShift: Math.max(1, c.totalQuestions || 200),
      }));
    if (rows.length < 2) return null;
    return computeNep(rows, { definition: def, maxMarks: 200 });
  }, [candidates, def]);
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-16 transition-colors">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-amber-500 dark:text-amber-400" />
          <span>रैंक व स्कोर गणना पद्धति (Scoring Methodology)</span>
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          MPESB Group-2 Sub-Group-4 परीक्षा के लिए गणितीय सूत्र, नियम और डेटा नीतियां
        </p>
      </div>

      <RawMarksDisclaimer />

      {/* 0. How to produce the file this tool can read */}
      {/*
       * The old page explained how to save the ESB page as .html/.mhtml and upload
       * it. There is no upload any more — one feature, one instruction — so the
       * text below replaces it (and is the same wording used at the top of the site).
       */}
      <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/30">
        <h3 className="mb-1 text-sm font-bold text-amber-950 dark:text-amber-100">उत्तर कुंजी देने का केवल एक ही तरीका</h3>
        <ol className="list-decimal space-y-0.5 pl-5 text-xs leading-relaxed text-amber-900 dark:text-amber-200">
          <li>
            ESB के <b>Response Sheet / उत्तर कुंजी</b> पेज पर जाएँ (जिसमें आपके सभी प्रश्न, दिया गया उत्तर और सही
            उत्तर हों)।
          </li>
          <li>
            पूरा पेज सेलेक्ट करें — लैपटॉप/PC पर <span className="font-mono font-bold">Ctrl + A</span>, मोबाइल/टेबलेट
            पर अंगुली दबाकर <b>सभी चुनें (Select all)</b>।
          </li>
          <li>
            कॉपी करें (<span className="font-mono font-bold">Ctrl + C</span> / <b>कॉपी</b>) और इस साइट के “उत्तर कुंजी
            पेस्ट करें” बॉक्स में पेस्ट करें (<span className="font-mono font-bold">Ctrl + V</span>) — गिनती अपने आप
            निकल आती है।
          </li>
        </ol>
        <p className="mt-2 text-[11px] font-medium text-amber-900 dark:text-amber-200">
          किसी भी प्रकार की फ़ाइल सेव करने, अपलोड करने या मेल करने की ज़रूरत नहीं है, और फ़ाइल/पेस्ट की गई सामग्री
          कहीं सहेजी नहीं जाती।
        </p>
      </div>

      {/* 1. Raw Score Formula Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 font-semibold text-sm">
          <Calculator className="w-5 h-5" />
          <span>रॉ स्कोर (Raw Score) का गणना सूत्र</span>
        </div>

        <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 rounded-xl font-mono text-center space-y-2">
          <div className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
            Raw Score = (Correct × 1.0) − (Wrong × 0.25)
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 font-sans">
            प्रत्येक सही उत्तर हेतु <strong>+1.0 अंक</strong> तथा प्रत्येक गलत उत्तर हेतु <strong>-0.25 अंक</strong> (1/4 नेगेटिव मार्किंग)। अनुत्तरित (Unattempted) प्रश्नों पर कोई अंक नहीं काटा जाता।
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-2">
          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-emerald-700 dark:text-emerald-400 font-bold block mb-1">सही प्रश्न (Correct)</span>
            <span className="text-slate-700 dark:text-slate-300">प्रत्येक प्रश्न पर 1.0 अंक जोड़ा जाता है।</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-rose-700 dark:text-rose-400 font-bold block mb-1">गलत प्रश्न (Wrong)</span>
            <span className="text-slate-700 dark:text-slate-300">प्रत्येक गलत प्रश्न पर 0.25 अंक घटाया जाता है।</span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 font-bold block mb-1">अनुत्तरित (Unattempted)</span>
            <span className="text-slate-700 dark:text-slate-300">शून्य (0) अंक — कोई अंक नहीं कटता।</span>
          </div>
        </div>
      </div>

      {/* 2. Why No Normalization in Phase 1 (Blueprint #3) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-semibold text-sm">
          <AlertTriangle className="w-5 h-5" />
          <span>फेज-1 में Normalization क्यों नहीं है? (No Normalization Rule)</span>
        </div>

        <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
          <p>
            ब्लूप्रिंट के मुख्य सिद्धांत (Core Principle - Raw Data First) के अनुसार वर्तमान चरण में:
          </p>
          <ul className="list-disc pl-5 space-y-1.5 text-slate-700 dark:text-slate-300">
            <li>कोई काल्पनिक नॉर्मलाइज्ड अंक (Normalized Marks) नहीं निकाले गए हैं।</li>
            <li>किसी शिफ्ट को कृत्रिम रूप से स्केल या एडजस्ट नहीं किया गया है।</li>
            <li>सभी रैंक व आंकड़े केवल <strong>सत्यापित रॉ मार्क्स (Raw Marks)</strong> पर आधारित हैं।</li>
          </ul>
          <p className="bg-slate-50 dark:bg-slate-950 p-3 rounded-lg border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
            भविष्य में, जब सभी 22 शिफ्ट्स से पर्याप्त नमूना (Statistical Sample Size) प्राप्त हो जाएगा, तब आधिकारिक Normalised Equi-Percentile (NEP) स्केलिंग पद्धति के अनुसार विश्लेषण जोड़ा जा सकेगा।
          </p>
        </div>
      </div>

      {/* 3. Competition Ranking & Tie-Breaker (Blueprint #38) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-semibold text-sm">
          <CheckCircle2 className="w-5 h-5" />
          <span>रैंकिंग प्रणाली व टाई-ब्रेकिंग (Competition Ranking: 1, 2, 2, 4)</span>
        </div>

        <div className="text-xs text-slate-700 dark:text-slate-300 space-y-2 leading-relaxed">
          <p>
            Rank Mitra मानक <strong>प्रतियोगिता रैंकिंग (Standard Competition Ranking)</strong> का उपयोग करता है:
          </p>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 font-mono text-slate-800 dark:text-slate-200">
            यदि दो या अधिक अभ्यर्थियों के रॉ अंक समान (Tie) होते हैं, तो उन्हें समान रैंक प्रदान की जाती है और अगले स्थान को तदनुसार आगे बढ़ाया जाता है (उदा. 1, 2, 2, 4)।
          </div>
          <p>
            बिना आधिकारिक जन्मतिथि व अन्य टाई-ब्रेकर नियमों के किसी भी अभ्यर्थी को कृत्रिम रूप से ऊपर या नीचे नहीं दिखाया जाता।
          </p>
        </div>
      </div>

      {/* 4. Privacy Guarantee (Blueprint #16 & #63) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-semibold text-sm">
          <ShieldCheck className="w-5 h-5" />
          <span>गोपनीयता व डेटा सुरक्षा नीति (Privacy-Preserving Architecture)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-semibold text-slate-900 dark:text-white block">1. कोई फ़ाइल संचयन नहीं</span>
            <p className="text-slate-600 dark:text-slate-400">
              पेस्ट की गई सामग्री (और यदि कोई फ़ाइल दी जाए तो वह भी) सर्वर पर संचित (Persist) नहीं की जाती — न अपलोड होती है, न डिस्क पर लिखी जाती है। पार्सिंग क्लाइंट-साइड ब्राउज़र में ही संपन्न होती है।
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1">
            <span className="font-semibold text-slate-900 dark:text-white block">2. नाम का मास्किंग</span>
            <p className="text-slate-600 dark:text-slate-400">
              सार्वजनिक लीडरबोर्ड में उम्मीदवार का पूरा नाम प्रदर्शित नहीं किया जाता (उदा. "RAHUL K****") तथा रोल नंबर पूरी तरह गोपनीय रहता है।
            </p>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-1 sm:col-span-2">
            <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 block">
              <Database className="w-3.5 h-3.5 text-cyan-500" />
              3. डेटाबेस में बस यही सहेजा जाता है
            </span>
            <p className="text-slate-600 dark:text-slate-400">
              उम्मीदवार का नाम, रोल नंबर, परीक्षा की तारीख व शिफ्ट, कुल प्रश्न, सही, गलत, कुल प्रयास व अनुत्तरित
              (और उनसे बनी रॉ स्कोर/शुद्धता) — इतना ही। प्रत्येक प्रश्न का उत्तर, प्रश्न-वार पैटर्न, फ़ाइल का नाम या
              फ़ाइल की कोई प्रति डेटाबेस में नहीं रखी जाती; ई-मेल पता तभी जुड़ता है जब आप रिपोर्ट mangें।
              श्रेणी/लिंग/योग्यता केवल श्रेणीवार रैंक व चयन-संभावना के लिए, और वे भी आप स्वयं संपादित कर सकते हैं।
            </p>
          </div>
        </div>
      </div>

      {/* 4b. Normalisation preview — what the board's own NEP formula does (#3.2, #72) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-4 h-4 text-cyan-500" />
              <span>आधिकारिक NEP Normalisation — पूर्वालोचन (Phase-2, अभी लागू नहीं)</span>
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-2xl">
              नियमपुस्तिका के मूल्यांकन अनुबंध में मंडल ने एक से अधिक शिफ्ट वाले आयोजन में स्कोर के
              <b> Normalisation का प्रावधान सुरक्षित</b> रखा है — <i>Normalised Equi-Percentile (NEP)</i> तकनीक,
              समिति अनुशंसा (आदेश क्र. 11-80/2013/08/पी-2/625/2025, दि. 24/01/2025) अनुसार। यह प्लेटफ़ॉर्म
              <b> अभी केवल RAW अंक</b> दिखाता है; नीचे का पूरा गणित केवल यह दिखाने के लिए है कि शिफ्ट-कठिनाई का असर
              आधिकारिक सूत्र में कैसे समायोजित होता है।
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNepOpen((v) => !v)}
            className="px-3 py-1.5 rounded-lg border border-cyan-300 dark:border-cyan-500/30 text-cyan-700 dark:text-cyan-400 text-[11px] font-semibold hover:bg-cyan-50 dark:hover:bg-cyan-500/10 cursor-pointer"
          >
            {nepOpen ? 'छिपाएँ' : 'NEP तुलना दिखाएँ'}
          </button>
        </div>

        {nepOpen && (
          nep ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span className="text-slate-500">Percentile परिभाषा (नियमपुस्तिका में ties की गिनती स्पष्ट नहीं — इसलिए चुन सकते हैं):</span>
                {(['equi', 'lessOrEqual', 'strictlyLess'] as PercentileDefinition[]).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDef(d)}
                    className={`px-2 py-0.5 rounded border cursor-pointer ${def === d ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-semibold' : 'border-slate-300 dark:border-slate-700 text-slate-500'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono">
                  <thead className="text-left text-slate-500 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-1.5 pr-3 font-sans">शिफ्ट</th>
                      <th className="py-1.5 pr-3 font-sans">उम्मीदवार</th>
                      <th className="py-1.5 pr-3 font-sans">RAW औसत</th>
                      <th className="py-1.5 pr-3 font-sans">NEP T-औसत</th>
                      <th className="py-1.5 font-sans">अंतर</th>
                    </tr>
                  </thead>
                  <tbody>
                    {nep.byShift.map((row) => (
                      <tr key={row.shiftNumber} className="border-b border-slate-100 dark:border-slate-800/60">
                        <td className="py-1.5 pr-3">शिफ्ट {row.shiftNumber}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{row.size}</td>
                        <td className="py-1.5 pr-3 tabular-nums">{row.rawMean}</td>
                        <td className="py-1.5 pr-3 tabular-nums text-cyan-700 dark:text-cyan-400">{row.tMean}</td>
                        <td className="py-1.5 tabular-nums text-slate-500">
                          {Number((row.tMean - 100).toFixed(2)) > 0 ? '+' : ''}
                          {Number((row.tMean - (nep.byShift.reduce((a, b) => a + b.tMean, 0) / nep.byShift.length)).toFixed(2))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">
                सूत्र (नियमपुस्तिका अनुसार, दशमलव 6 तक): P<sub>ij</sub> = शिफ्ट के भीतर percentile →
                Z<sub>ij</sub> = ROUND(NORMSINV(P<sub>ij</sub> − 0.005), 6) →
                T<sub>ij</sub> = AM + ASD × Z<sub>ij</sub>, जहाँ AM = (पत्र के अधिकतम अंक)/2 तथा ASD = (अधिकतम अंक)/10।
                समायोजित अंतिम स्कोर = T<sub>ij</sub> + (शारीरिक/साक्षात्कार अंक, यदि कोई हो)। Tie-break: पहले समानुपातिक अंक,
                फिर मंडल की प्रचलित पद्धति। <b>आधिकारिक मेरिट सूची से इसकी तुलना न करें</b> — ties की गिनती व प्रत्येक
                पत्र का अधिकतम अंक बोर्ड के पास ही पूर्णतः प्रकाशित होता है।
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              तुलना दिखाने के लिए कम-से-कम दो सबमिशन चाहिए (अभी {candidates.length})।
            </p>
          )
        )}
      </div>

      {/* 5. Official Source Citation (Blueprint #93) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 shadow-xs text-xs">
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-300 font-semibold text-sm">
          <FileCode className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span>आधिकारिक स्रोत (Official Sources)</span>
        </div>
        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
          इस प्लेटफॉर्म पर कोई पद-सूची, वेतनमान या श्रेणीवार रिक्तियां प्रदर्शित नहीं की जातीं (उम्मीदवारों की सहमति से यह अनुभाग हटा दिया गया है)। यहाँ दिखने वाली शैक्षणिक योग्यताओं की सूची केवल लीडरबोर्ड फ़िल्टर के लिए टैग है — इसका मतलब पात्रता का दावा नहीं। स्कोरिंग व सामान्य नियमों का संदर्भ म.प्र. कर्मचारी चयन मंडल, भोपाल (MPESB) द्वारा जारी <strong>"समूह-02 उपसमूह-04 संयुक्त भर्ती परीक्षा-2026 परीक्षा संचालन एवं भर्ती नियमपुस्तिका"</strong> (145 पृष्ठ) से लिया गया है। स्कोरिंग नियम (+1 / −0.25) उसी पुस्तिका के <b>अनुबंध 3.8 मूल्यांकन पद्धति</b> से लिया गया है, और NEP Normalisation का सूत्र मूल्यांकन/चयन अनुबंध (पृष्ठ ~131, मंडल आदेश क्र. 11-80/2013/08/पी-2/625/2025 दिनांक 24/01/2025) से — दोनों का पाठ इसी रिपॉज़िटरी की <code className="font-mono">.pdf</code> प्रति में है। उत्तर कुंजी व अंकों का कोई आधिकारिक स्रोत यहाँ संशोधित नहीं होता; प्रत्येक पंक्ति उम्मीदवार द्वारा सहेजी गई अपनी Response Sheet से आती है।
        </p>
      </div>
    </div>
  );
};
