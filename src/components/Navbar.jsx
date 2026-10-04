import React, { useState } from 'react';
import { Globe, ChevronDown, Menu, X, Sparkles, BookOpen, Compass, HelpCircle, ShieldCheck } from 'lucide-react';
import { getUIText } from '../data/uiTranslations';

export default function Navbar({ 
  currentLanguage, 
  onOpenLanguageModal, 
  currentPage, 
  onNavigate,
  onStartOnboarding 
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const langId = currentLanguage?.id || 'en';

  const handleNavClick = (pageId) => {
    onNavigate(pageId);
    setMobileMenuOpen(false);
  };

  return (
    <header className="relative z-30 w-full px-4 sm:px-8 lg:px-14 py-4 sm:py-5 flex items-center justify-between">
      {/* 1. Utthan Logo with leaf motif */}
      <button 
        onClick={() => handleNavClick('landing')}
        className="flex flex-col items-start text-left group focus:outline-none"
        aria-label="Utthan Home"
      >
        <div className="flex items-center gap-0.5">
          <div className="relative">
            <span className="font-serif-heading text-2xl sm:text-3xl lg:text-[34px] font-bold text-[#134e40] tracking-tight leading-none">
              Utthan
            </span>
            {/* Stylized green leaf resting over the 'U' */}
            <svg 
              className="absolute -top-2.5 -left-1.5 w-4 h-4 sm:w-5 sm:h-5 text-[#2a8570] transform -rotate-12 transition-transform duration-300 group-hover:rotate-0" 
              viewBox="0 0 24 24" 
              fill="currentColor"
            >
              <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z" />
            </svg>
          </div>
        </div>
        {/* Native script subtitle */}
        <span 
          className="text-xs sm:text-[13px] font-medium tracking-widest text-[#134e40] -mt-0.5 pl-0.5"
        >
          {currentLanguage?.id === 'bn' ? 'উত্থান' : currentLanguage?.id === 'ta' ? 'உத்தான்' : currentLanguage?.id === 'te' ? 'ఉత్థాన్' : 'उत्थान'}
        </span>
      </button>

      {/* 2. Desktop Navigation (>= 1024px) */}
      <nav className="hidden lg:flex items-center gap-7 text-[#263238]">
        <button 
          onClick={() => handleNavClick('how-to-use')}
          className={`text-[15px] font-medium transition-colors hover:text-[#134e40] ${
            currentPage === 'how-to-use' ? 'text-[#134e40] font-semibold underline underline-offset-8 decoration-2' : 'text-[#37474F]'
          }`}
        >
          {getUIText('nav', 'about', langId)}
        </button>

        <button 
          onClick={() => handleNavClick('opportunities')}
          className={`text-[15px] font-medium transition-colors hover:text-[#134e40] ${
            currentPage === 'opportunities' || currentPage === 'details' ? 'text-[#134e40] font-semibold underline underline-offset-8 decoration-2' : 'text-[#37474F]'
          }`}
        >
          {getUIText('nav', 'opportunities', langId)}
        </button>

        <button 
          onClick={() => handleNavClick('action-path')}
          className={`text-[15px] font-medium transition-colors hover:text-[#134e40] ${
            currentPage === 'action-path' ? 'text-[#134e40] font-semibold underline underline-offset-8 decoration-2' : 'text-[#37474F]'
          }`}
        >
          {getUIText('nav', 'myPathway', langId)}
        </button>

        <button 
          onClick={() => handleNavClick('how-to-use')}
          className={`text-[15px] font-medium transition-colors hover:text-[#134e40] ${
            currentPage === 'how-to-use' ? 'text-[#134e40] font-semibold' : 'text-[#37474F]'
          }`}
        >
          {getUIText('nav', 'help', langId)}
        </button>

        <button 
          onClick={() => handleNavClick('admin')}
          className={`text-[13px] tracking-wide uppercase px-2.5 py-1 rounded border border-[#b8ded6] transition-colors hover:bg-[#dbeef5] ${
            currentPage === 'admin' ? 'bg-[#134e40] text-white border-[#134e40]' : 'text-[#134e40]'
          }`}
        >
          {getUIText('nav', 'adminPortal', langId)}
        </button>

        {/* Language Selector Pill */}
        <button
          onClick={onOpenLanguageModal}
          className="flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-[#cbd5e1] bg-[#FAF7F0]/90 hover:bg-white transition-all shadow-sm text-sm font-medium text-[#263238] active:scale-95"
          aria-label="Change Language"
        >
          <Globe className="w-4 h-4 text-[#134e40]" />
          <span>{currentLanguage.name}</span>
          <ChevronDown className="w-3.5 h-3.5 text-[#718078]" />
        </button>

        {/* Primary CTA: Get Started */}
        <button
          onClick={onStartOnboarding}
          className="px-5 py-2 rounded-full bg-[#134e40] hover:bg-[#0d3b30] text-[#FAF7F0] text-sm font-medium transition-all shadow-sm active:scale-95 hover:shadow-md"
        >
          {getUIText('nav', 'getStarted', langId)}
        </button>
      </nav>

      {/* 3. Mobile / Tablet Navigation Header Elements (< 1024px) */}
      <div className="flex lg:hidden items-center gap-2 sm:gap-3">
        {/* Language selector pill */}
        <button
          onClick={onOpenLanguageModal}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#cbd5e1] bg-[#FAF7F0]/90 text-xs sm:text-sm font-medium text-[#263238] shadow-sm active:scale-95"
          aria-label="Select Language"
        >
          <Globe className="w-3.5 h-3.5 text-[#134e40]" />
          <span>{currentLanguage.name}</span>
          <ChevronDown className="w-3 h-3 text-[#718078]" />
        </button>

        {/* Hamburger Menu Toggle */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg text-[#134e40] hover:bg-[#dbeef5]/50 transition-colors focus:outline-none"
          aria-label={mobileMenuOpen ? 'Close Menu' : 'Open Menu'}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* 4. Mobile Slide-out / Dropdown Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-x-0 top-[70px] z-50 bg-[#FAF7F0]/98 backdrop-blur-md border-b border-[#b8ded6] p-6 shadow-xl animate-in slide-in-from-top duration-200">
          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleNavClick('landing')}
              className="text-left py-2.5 px-3 rounded-lg font-medium text-base text-[#134e40] hover:bg-[#dbeef5]"
            >
              {getUIText('nav', 'home', langId)}
            </button>
            <button
              onClick={() => handleNavClick('conversation')}
              className="text-left py-2.5 px-3 rounded-lg font-medium text-base text-[#134e40] hover:bg-[#dbeef5] flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4 text-[#e69943]" />
              {getUIText('nav', 'aiAssistant', langId)}
            </button>
            <button
              onClick={() => handleNavClick('opportunities')}
              className="text-left py-2.5 px-3 rounded-lg font-medium text-base text-[#134e40] hover:bg-[#dbeef5] flex items-center gap-2"
            >
              <Compass className="w-4 h-4 text-[#134e40]" />
              {getUIText('nav', 'opportunities', langId)}
            </button>
            <button
              onClick={() => handleNavClick('profile')}
              className="text-left py-2.5 px-3 rounded-lg font-medium text-base text-[#134e40] hover:bg-[#dbeef5]"
            >
              {getUIText('nav', 'myProfile', langId)}
            </button>
            <button
              onClick={() => handleNavClick('action-path')}
              className="text-left py-2.5 px-3 rounded-lg font-medium text-base text-[#134e40] hover:bg-[#dbeef5]"
            >
              {getUIText('nav', 'myPathway', langId)}
            </button>
            <button
              onClick={() => handleNavClick('how-to-use')}
              className="text-left py-2.5 px-3 rounded-lg font-medium text-base text-[#134e40] hover:bg-[#dbeef5] flex items-center gap-2"
            >
              <BookOpen className="w-4 h-4 text-[#718078]" />
              {getUIText('nav', 'help', langId)}
            </button>
            <button
              onClick={() => handleNavClick('admin')}
              className="text-left py-2.5 px-3 rounded-lg font-medium text-base text-[#134e40] hover:bg-[#dbeef5] flex items-center gap-2"
            >
              <ShieldCheck className="w-4 h-4 text-[#134e40]" />
              {getUIText('nav', 'adminPortal', langId)}
            </button>

            <div className="pt-3 border-t border-[#b8ded6] flex flex-col gap-2">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenLanguageModal();
                }}
                className="w-full py-2.5 px-4 rounded-full border border-[#134e40] text-[#134e40] font-medium text-sm flex items-center justify-center gap-2"
              >
                <Globe className="w-4 h-4" />
                {getUIText('nav', 'changeLanguage', langId)} ({currentLanguage.nativeName})
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  onStartOnboarding();
                }}
                className="w-full py-3 rounded-full bg-[#134e40] text-[#FAF7F0] font-medium text-sm text-center shadow-md active:scale-95"
              >
                {getUIText('nav', 'getStarted', langId)}
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
