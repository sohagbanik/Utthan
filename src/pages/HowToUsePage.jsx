import React from 'react';
import { Globe, Mic, BrainCircuit, Compass, CheckCircle2, ArrowRight } from 'lucide-react';
import { getUIText } from '../data/uiTranslations';

export default function HowToUsePage({ onStartOnboarding, currentLanguage }) {
  const langId = currentLanguage?.id || 'en';

  const steps = [
    {
      num: '1',
      icon: <Globe className="w-8 h-8 text-[#134e40]" />,
      title: getUIText('howToUse', 'step1Title', langId),
      desc: getUIText('howToUse', 'step1Desc', langId),
    },
    {
      num: '2',
      icon: <Mic className="w-8 h-8 text-[#134e40]" />,
      title: getUIText('howToUse', 'step2Title', langId),
      desc: getUIText('howToUse', 'step2Desc', langId),
    },
    {
      num: '3',
      icon: <BrainCircuit className="w-8 h-8 text-[#e69943]" />,
      title: getUIText('howToUse', 'step3Title', langId),
      desc: getUIText('howToUse', 'step3Desc', langId),
    },
    {
      num: '4',
      icon: <Compass className="w-8 h-8 text-[#134e40]" />,
      title: getUIText('howToUse', 'step4Title', langId),
      desc: getUIText('howToUse', 'step4Desc', langId),
    },
    {
      num: '5',
      icon: <CheckCircle2 className="w-8 h-8 text-emerald-600" />,
      title: getUIText('howToUse', 'step5Title', langId),
      desc: getUIText('howToUse', 'step5Desc', langId),
    }
  ];

  return (
    <div className="relative z-20 flex-1 px-4 sm:px-6 lg:px-12 py-8 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="font-serif-heading text-3xl sm:text-4xl lg:text-5xl font-bold text-[#134e40] mb-3">
          {getUIText('howToUse', 'pageTitle', langId)}
        </h1>
        <p className="text-sm sm:text-base text-[#37474F] max-w-xl mx-auto">
          {getUIText('howToUse', 'pageSubtitle', langId)}
        </p>
      </div>

      {/* 5 Visual Cards Grid */}
      <div className="space-y-4 mb-10">
        {steps.map((s) => (
          <div
            key={s.num}
            className="bg-white/95 rounded-2xl p-5 sm:p-6 border border-[#b8ded6] flex items-start gap-4 sm:gap-6 shadow-sm hover:shadow-md transition-all"
          >
            {/* Step Number Badge */}
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#DCECDF] text-[#134e40] font-serif-heading text-xl sm:text-2xl font-bold flex items-center justify-center shrink-0 border border-[#b8ded6]">
              {s.num}
            </div>

            {/* Content */}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base sm:text-lg font-bold text-[#134e40]">
                  {s.title}
                </h3>
              </div>
              <p className="text-xs sm:text-sm text-[#37474F] leading-relaxed">
                {s.desc}
              </p>
            </div>

            {/* Icon */}
            <div className="hidden sm:block p-3 rounded-xl bg-[#FAF7F0] border border-[#cbd5e1] shrink-0">
              {s.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom CTA */}
      <div className="text-center">
        <button
          onClick={onStartOnboarding}
          className="px-8 py-3.5 rounded-full bg-[#134e40] hover:bg-[#0d3b30] text-white font-semibold text-base inline-flex items-center gap-2 shadow-lg active:scale-95 transition-all"
        >
          <span>{getUIText('howToUse', 'getStartedNow', langId)}</span>
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
