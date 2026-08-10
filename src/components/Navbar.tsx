import React, { useState, useEffect } from 'react';
import { Bus, PhoneCall, ChevronRight, Menu, X } from 'lucide-react';

interface NavbarProps {
  onOpenInquiry: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenInquiry }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'glass-header shadow-sm py-3' : 'bg-white/80 backdrop-blur-md py-4 border-b border-slate-100'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          
          {/* Brand Logo - Fixed Horizontal No Wrap */}
          <a href="#" className="flex items-center gap-3 text-decoration-none shrink-0 group">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl gradient-bg-primary text-white shadow-md shadow-blue-500/20 group-hover:scale-105 transition-transform">
              <Bus className="w-5 h-5" />
            </div>
            <div className="flex flex-col whitespace-nowrap">
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-slate-900 leading-none">
                  IPASSCARE
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-extrabold leading-none">
                  아이패스케어
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold tracking-wider mt-1">
                GROUND CORPORATION
              </span>
            </div>
          </a>

          {/* Desktop Nav Links - Horizontal & Clean Whitespace No Wrap */}
          <nav className="hidden lg:flex items-center gap-7 shrink-0">
            <a href="#features" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              주요 기능
            </a>
            <a href="#roles" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              대상별 안내
            </a>
            <a href="#calculator" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap flex items-center gap-1.5">
              <span>도입 효과 계산기</span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">HOT</span>
            </a>
            <a href="#manuals" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              사용법 매뉴얼
            </a>
            <a href="#groundcorp" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              기업 소개
            </a>
            <a href="#faq" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              자주 묻는 질문
            </a>
          </nav>

          {/* Right Actions */}
          <div className="hidden sm:flex items-center gap-4 shrink-0">
            <a 
              href="tel:1544-7984" 
              className="hidden xl:flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-blue-600 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              <PhoneCall className="w-3.5 h-3.5 text-blue-600" />
              <span>1544-7984</span>
            </a>
            <button 
              onClick={onOpenInquiry}
              className="btn-primary text-sm shadow-blue-500/20 whitespace-nowrap px-5 py-2.5"
            >
              <span>무료 도입 상담</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button 
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100 focus:outline-none"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white/95 backdrop-blur-xl border-t border-slate-200/80 px-5 pt-4 pb-6 mt-2 space-y-4 shadow-xl">
          <nav className="flex flex-col space-y-3">
            <a 
              href="#features" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-bold text-slate-800 hover:text-blue-600 px-2 py-1.5 rounded-md hover:bg-slate-50"
            >
              주요 기능
            </a>
            <a 
              href="#roles" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-bold text-slate-800 hover:text-blue-600 px-2 py-1.5 rounded-md hover:bg-slate-50"
            >
              대상별 안내 (학부모/학원장/기사님)
            </a>
            <a 
              href="#calculator" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-bold text-slate-800 hover:text-blue-600 px-2 py-1.5 rounded-md hover:bg-slate-50 flex items-center justify-between"
            >
              <span>도입 효과 계산기</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">HOT</span>
            </a>
            <a 
              href="#manuals" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-semibold text-slate-800 hover:text-blue-600 px-2 py-1.5 rounded-md hover:bg-slate-50"
            >
              사용법 매뉴얼 영상
            </a>
            <a 
              href="#groundcorp" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-semibold text-slate-800 hover:text-blue-600 px-2 py-1.5 rounded-md hover:bg-slate-50"
            >
              (주)그라운드코퍼레이션 소개
            </a>
            <a 
              href="#faq" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-semibold text-slate-800 hover:text-blue-600 px-2 py-1.5 rounded-md hover:bg-slate-50"
            >
              자주 묻는 질문
            </a>
          </nav>
          <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
            <button 
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenInquiry();
              }}
              className="btn-primary w-full justify-center text-sm"
            >
              <span>무료 도입 상담 신청하기</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
