import React, { useState, useEffect } from 'react';
import { Menu, X, QrCode, Smartphone, LogIn, LogOut, ChevronRight, Settings, UserCheck } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface NavbarProps {
  onOpenInquiry: () => void;
  onOpenLogin: () => void;
  userProfile?: { name?: string | null; role?: string } | null;
  onOpenAdminPortal?: () => void;
  onLogout?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenInquiry, onOpenLogin, userProfile, onOpenAdminPortal, onLogout }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrTab, setQrTab] = useState<'ios' | 'android'>('ios');

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isAdminOrCoach = userProfile && ['admin', 'coach'].includes(userProfile.role || '');

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("auto_login_check");
    if (onLogout) onLogout();
  };

  return (
    <header className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${isScrolled ? 'glass-header shadow-sm py-3' : 'bg-white/80 backdrop-blur-md py-4 border-b border-slate-100'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4">
          
          {/* Brand Logo */}
          <a href="#" className="flex items-center gap-3 text-decoration-none shrink-0 group">
            <img 
              src="/i_logo.png" 
              alt="IPASSCARE" 
              className="w-10 h-10 object-contain rounded-xl shadow-xs group-hover:scale-105 transition-transform" 
            />
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

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-7 shrink-0">
            <a href="#features" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              주요 기능
            </a>
            <a href="#roles" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              맞춤 가이드
            </a>
            <a href="#calculator" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap flex items-center gap-1.5">
              <span>도입 효과 계산기</span>
              <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">HOT</span>
            </a>
            <a href="#manuals" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              사용법 매뉴얼
            </a>
            <a href="#faq" className="text-sm font-bold text-slate-700 hover:text-blue-600 transition-colors whitespace-nowrap">
              자주 묻는 질문
            </a>
          </nav>

          {/* Right Actions: QR Popover & Sleek LOGIN / ADMIN Button */}
          <div className="hidden sm:flex items-center gap-3 shrink-0 relative">
            
            {/* Dual QR Code Download Button */}
            <div className="relative">
              <button
                onClick={() => setShowQrModal(!showQrModal)}
                className="hidden xl:flex items-center gap-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-600 px-3 py-2 rounded-xl transition-colors whitespace-nowrap border border-slate-200"
              >
                <QrCode className="w-4 h-4 text-blue-600" />
                <span>QR 앱 다운로드</span>
              </button>

              {/* QR Popover Box */}
              {showQrModal && (
                <div className="absolute right-0 top-12 w-64 bg-white rounded-2xl p-4 shadow-2xl border border-slate-200 z-50 text-center animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 mb-2">
                    <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                      <Smartphone className="w-3.5 h-3.5 text-blue-600" /> 모바일 앱 다운로드
                    </span>
                    <button 
                      onClick={() => setShowQrModal(false)}
                      className="text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex p-1 bg-slate-100 rounded-xl mb-3 text-[10px] font-bold">
                    <button
                      onClick={() => setQrTab('ios')}
                      className={`flex-1 py-1.5 rounded-lg transition-all ${qrTab === 'ios' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      iOS (아이폰)
                    </button>
                    <button
                      onClick={() => setQrTab('android')}
                      className={`flex-1 py-1.5 rounded-lg transition-all ${qrTab === 'android' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'}`}
                    >
                      Android (구글)
                    </button>
                  </div>

                  <div className="w-32 h-32 mx-auto bg-slate-50 border-2 border-dashed border-blue-400 rounded-xl flex flex-col items-center justify-center p-2 mb-2">
                    <QrCode className="w-8 h-8 text-blue-600 mb-1 opacity-70" />
                    <span className="text-[10px] font-extrabold text-blue-600">
                      {qrTab === 'ios' ? 'App Store QR' : 'Google Play QR'}
                    </span>
                  </div>

                  <p className="text-[10px] text-slate-500 font-medium">
                    {qrTab === 'ios' ? '아이폰 카메라인식 용 QR' : '안드로이드 카메라인식 용 QR'}
                  </p>
                </div>
              )}
            </div>

            {/* Logged in state vs Logged out state */}
            {userProfile ? (
              <div className="flex items-center gap-2">
                {/* Staff / Admin get the Admin Portal button */}
                {isAdminOrCoach ? (
                  <button 
                    onClick={onOpenAdminPortal || onOpenLogin}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl shadow-md flex items-center gap-2 border border-slate-700 transition-all hover:scale-105"
                  >
                    <Settings className="w-4 h-4 text-blue-400" />
                    <span>⚙️ 관리자 센터</span>
                  </button>
                ) : (
                  <span className="text-xs font-bold text-slate-700 bg-slate-100 px-3 py-2 rounded-xl flex items-center gap-1.5 border border-slate-200">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{userProfile.name || '회원'}님</span>
                  </span>
                )}

                <button
                  onClick={handleLogout}
                  className="text-xs font-bold text-slate-500 hover:text-slate-900 p-2 rounded-lg"
                  title="로그아웃"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button 
                onClick={onOpenLogin}
                className="btn-primary text-sm shadow-blue-500/20 whitespace-nowrap px-6 py-2.5 flex items-center gap-2"
              >
                <LogIn className="w-4 h-4" />
                <span>로그인</span>
              </button>
            )}
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
              맞춤 가이드 (학부모/학원장/기사님)
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
              href="#faq" 
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-semibold text-slate-800 hover:text-blue-600 px-2 py-1.5 rounded-md hover:bg-slate-50"
            >
              자주 묻는 질문
            </a>
          </nav>
          <div className="pt-2 border-t border-slate-200 flex flex-col gap-2">
            {userProfile ? (
              <div className="space-y-2">
                {isAdminOrCoach && (
                  <button 
                    onClick={() => {
                      setMobileMenuOpen(false);
                      if (onOpenAdminPortal) onOpenAdminPortal();
                    }}
                    className="bg-slate-900 text-white font-extrabold w-full justify-center py-3 rounded-xl text-sm flex items-center gap-2"
                  >
                    <Settings className="w-4 h-4 text-blue-400" />
                    <span>⚙️ 관리자 센터 이동</span>
                  </button>
                )}
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLogout();
                  }}
                  className="w-full text-center text-xs font-bold text-slate-500 py-2"
                >
                  로그아웃
                </button>
              </div>
            ) : (
              <button 
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenLogin();
                }}
                className="btn-primary w-full justify-center text-sm"
              >
                <LogIn className="w-4 h-4" />
                <span>로그인하기</span>
              </button>
            )}

            <button 
              onClick={() => {
                setMobileMenuOpen(false);
                onOpenInquiry();
              }}
              className="btn-secondary w-full justify-center text-sm"
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
