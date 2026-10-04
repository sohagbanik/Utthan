import React, { useState, useRef } from 'react';
import VoiceButton from '../components/VoiceButton';
import { Keyboard, ArrowRight, Mic, Sparkles, AlertCircle } from 'lucide-react';
import { createSpeechRecognizer } from '../services/aiService';
import { getUIText } from '../data/uiTranslations';

export default function LandingPage({ 
  currentLanguage, 
  onStartVoice, 
  onStartText, 
  onNavigate 
}) {
  const [micState, setMicState] = useState('idle'); // 'idle' | 'listening' | 'processing'
  const [showTypeInput, setShowTypeInput] = useState(false);
  const [typedText, setTypedText] = useState('');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [micError, setMicError] = useState('');
  const activeRecognizer = useRef(null);

  const handleMicClick = () => {
    // Launch voice assistant starting with Step 0: Language Input (Voice or Click)
    onStartVoice();
  };

  const simulateVoiceInput = () => {
    setMicState('listening');
    const sample = currentLanguage.sampleVoicePrompt || "I want to learn solar panel maintenance and apply for stipend.";
    setLiveTranscript(sample);
    setTimeout(() => {
      setMicState('processing');
      setTimeout(() => {
        onStartText(sample);
      }, 1000);
    }, 2500);
  };

  const handleTypeSubmit = (e) => {
    e.preventDefault();
    if (typedText.trim()) {
      onStartText(typedText);
    } else {
      onStartText();
    }
  };

  return (
    <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-4 sm:px-6 lg:px-8 py-6 sm:py-10 text-center select-none max-w-4xl mx-auto min-h-[calc(100vh-140px)]">
      {/* 1. Primary Editorial Heading */}
      <h1 className="font-serif-heading text-4xl sm:text-5xl md:text-6xl lg:text-[70px] font-bold text-[#134e40] leading-[1.08] tracking-tight mb-4 sm:mb-5 max-w-2xl whitespace-pre-line">
        {currentLanguage.heroHeading || "Tell Us\nAbout Yourself."}
      </h1>

      {/* 2. Explanatory Subtext */}
      <p className="text-base sm:text-lg md:text-xl text-[#37474F] max-w-xl sm:max-w-2xl font-normal leading-relaxed mb-6 sm:mb-8 px-2">
        {currentLanguage.heroSubtext || "Speak in your own language. Utthan will help you discover opportunities, skills and the right path forward."}
      </p>

      {/* Mic Status Banner */}
      {micState === 'listening' && (
        <div className="mb-4 px-5 py-2.5 rounded-full bg-white/95 border-2 border-[#134e40] shadow-md flex items-center gap-3 animate-pulse max-w-md mx-auto">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
          <span className="text-sm font-semibold text-[#134e40]">
            {liveTranscript ? `"${liveTranscript}"` : `Listening in ${currentLanguage.nativeName}... Speak now!`}
          </span>
        </div>
      )}

      {/* Mic Error Banner */}
      {micError && (
        <div className="mb-4 px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2 max-w-md mx-auto">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
          <span>{micError}</span>
        </div>
      )}

      {/* Language Preference & Speak Badge */}
      <button
        onClick={() => onNavigate('conversation')}
        className="mb-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/95 border border-[#b8ded6] hover:border-[#134e40] shadow-sm text-xs sm:text-sm font-semibold text-[#134e40] hover:bg-white transition-all active:scale-95 group"
      >
        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
        <span>🌐 {currentLanguage.name} ({currentLanguage.nativeName}) — {getUIText('landing', 'tapToChangeLang', currentLanguage?.id || 'en')}</span>
      </button>

      {/* 3. Primary Microphone Interaction Button */}
      <div className="mb-6 sm:mb-8">
        <VoiceButton
          state={micState}
          onClick={handleMicClick}
          label={currentLanguage.tapToSpeak || "Tap to Speak"}
        />
      </div>

      {/* 4. Secondary Action: "or type instead" */}
      <div className="flex flex-col items-center gap-3">
        {!showTypeInput ? (
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowTypeInput(true)}
              className="group flex items-center gap-2 text-sm sm:text-base font-medium text-[#134e40] hover:text-[#0d3b30] underline underline-offset-4 decoration-[#134e40]/40 hover:decoration-[#134e40] transition-all active:scale-95 focus:outline-none"
            >
              <svg 
                className="w-4 h-4 sm:w-5 sm:h-5 text-[#134e40]" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <line x1="6" y1="8" x2="6.01" y2="8" strokeWidth="2.5" />
                <line x1="10" y1="8" x2="10.01" y2="8" strokeWidth="2.5" />
                <line x1="14" y1="8" x2="14.01" y2="8" strokeWidth="2.5" />
                <line x1="18" y1="8" x2="18.01" y2="8" strokeWidth="2.5" />
                <line x1="6" y1="12" x2="6.01" y2="12" strokeWidth="2.5" />
                <line x1="18" y1="12" x2="18.01" y2="12" strokeWidth="2.5" />
                <line x1="7" y1="16" x2="17" y2="16" />
              </svg>
              <span>{currentLanguage.typeInstead || "or type instead"}</span>
            </button>

            <span className="text-gray-300">•</span>

            {/* Quick 1-Click Voice Test Button */}
            <button
              onClick={() => simulateVoiceInput()}
              className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 hover:bg-emerald-100 text-[#134e40] border border-[#b8ded6] transition-colors"
              title="Test with sample voice query"
            >
              🎙️ {getUIText('landing', 'quickVoiceDemo', currentLanguage?.id || 'en')}
            </button>
          </div>
        ) : (
          <form 
            onSubmit={handleTypeSubmit}
            className="w-full max-w-md sm:max-w-lg mt-2 p-2 bg-white/95 rounded-full border-2 border-[#134e40]/60 shadow-lg flex items-center gap-2 animate-in fade-in duration-200"
          >
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={currentLanguage.promptPlaceholder || "Tell me about your work, skills, or what you wish to learn..."}
              className="flex-1 bg-transparent px-4 py-1.5 text-sm sm:text-base text-[#263238] focus:outline-none placeholder-[#718078]"
              autoFocus
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#134e40] hover:bg-[#0d3b30] text-white rounded-full text-sm font-medium flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <span>{getUIText('landing', 'askAi', currentLanguage?.id || 'en')}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>

      {/* Quick Discovery Pills for Rural Users */}
      <div className="mt-12 sm:mt-16 flex flex-wrap justify-center items-center gap-2 sm:gap-3 text-xs sm:text-sm text-[#52796f]">
        <span className="text-[#718078]">{getUIText('landing', 'popularPathways', currentLanguage?.id || 'en')}</span>
        <button 
          onClick={() => onStartText("Solar Rooftop Technician training with stipend")} 
          className="px-3 py-1 rounded-full bg-white/70 hover:bg-white border border-[#b8ded6] transition-colors"
        >
          {getUIText('landing', 'solar', currentLanguage?.id || 'en')}
        </button>
        <button 
          onClick={() => onStartText("Handloom and weaving training programs")} 
          className="px-3 py-1 rounded-full bg-white/70 hover:bg-white border border-[#b8ded6] transition-colors"
        >
          {getUIText('landing', 'handloom', currentLanguage?.id || 'en')}
        </button>
        <button 
          onClick={() => onStartText("Kisan Drone Pilot training and subsidy")} 
          className="px-3 py-1 rounded-full bg-white/70 hover:bg-white border border-[#b8ded6] transition-colors"
        >
          {getUIText('landing', 'drone', currentLanguage?.id || 'en')}
        </button>
      </div>
    </main>
  );
}
