import React, { useState, useEffect } from 'react';
import { Bus, Bell, CreditCard, Play, ArrowRight, MapPin, Sparkles, ChevronDown, CheckCircle, Navigation } from 'lucide-react';

interface HeroSectionProps {
  onOpenInquiry: () => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ onOpenInquiry }) => {
  const [activeSimScreen, setActiveSimScreen] = useState<'shuttle' | 'attendance' | 'payment'>('shuttle');

  // Auto cycle screen demo
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveSimScreen((prev) => {
        if (prev === 'shuttle') return 'attendance';
        if (prev === 'attendance') return 'payment';
        return 'shuttle';
      });
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  return (
    <section className="relative pt-32 pb-20 md:pt-36 md:pb-24 overflow-hidden bg-gradient-to-b from-blue-50/70 via-slate-50 to-white">
      {/* Background Ambient Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-400/15 rounded-full blur-3xl pointer-events-none animate-glow" />
      <div className="absolute top-1/3 right-10 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          
          {/* Left Hero Text */}
          <div className="lg:col-span-7 flex flex-col items-center lg:items-start text-center lg:text-left space-y-6">
            
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-100/90 border border-blue-200 text-blue-700 text-xs sm:text-sm font-extrabold shadow-sm backdrop-blur-md">
              <Sparkles className="w-4 h-4 text-blue-600 animate-pulse" />
              <span>전국 500+ 학원이 신뢰하는 대한민국 No.1 학원 케어 플랫폼</span>
            </div>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.25]">
              우리 아이 <span className="gradient-text">안전 셔틀</span>부터<br />
              <span className="relative inline-block">
                원비 결제·포인트 혜택
                <svg className="absolute -bottom-2 left-0 w-full h-3 text-blue-400/40" viewBox="0 0 100 20" preserveAspectRatio="none">
                  <path d="M0,15 Q50,0 100,15" fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
                </svg>
              </span>까지
            </h1>

            <p className="text-base sm:text-lg text-slate-600 max-w-2xl font-medium leading-relaxed">
              실시간 GPS 셔틀 관제, 원터치 출결 알림, KSPay 원비 결제, 그리고 VOG SPORTS 제휴 쇼핑몰 포인트 전환까지! 아이패스케어(IPASSCARE) 모바일 앱으로 구현한 올인원 학원 안심 솔루션을 경험해 보세요.
            </p>

            <div className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto pt-2">
              <button 
                onClick={onOpenInquiry}
                className="btn-primary text-base sm:text-lg px-8 py-4 w-full sm:w-auto justify-center shadow-blue-600/30"
              >
                <span>무료 도입 상담 신청</span>
                <ArrowRight className="w-5 h-5" />
              </button>
              <a 
                href="#manuals"
                className="btn-secondary text-base sm:text-lg px-8 py-4 w-full sm:w-auto justify-center"
              >
                <Play className="w-5 h-5 fill-blue-600 text-blue-600" />
                <span>사용법 동영상 보기</span>
              </a>
            </div>

            {/* Key Trust Highlights */}
            <div className="pt-6 border-t border-slate-200/80 w-full grid grid-cols-3 gap-4 text-center sm:text-left">
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-blue-600">99.8%</div>
                <div className="text-xs sm:text-sm text-slate-500 font-bold">등하원 알림 신뢰도</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-indigo-600">85%↓</div>
                <div className="text-xs sm:text-sm text-slate-500 font-bold">원비 미납률 감소</div>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-slate-800">500+</div>
                <div className="text-xs sm:text-sm text-slate-500 font-bold">도입 학원 수</div>
              </div>
            </div>

          </div>

          {/* Right Smartphone Authentic Mobile App UI Showcase (Clean & Uncluttered) */}
          <div className="lg:col-span-5 flex justify-center relative">
            
            {/* Ambient Backlight */}
            <div className="absolute w-72 h-72 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full blur-2xl opacity-20 animate-pulse pointer-events-none" />

            {/* Smartphone Device Frame */}
            <div className="phone-mockup-container">
              <div className="phone-mockup">
                <div className="phone-notch"></div>
                
                {/* Authentic IPASSCARE Mobile App UI */}
                <div className="phone-screen">
                  
                  {/* Real App Header Bar */}
                  <div className="bg-slate-900 text-white p-3 pt-7 flex items-center justify-between border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md gradient-bg-primary flex items-center justify-center">
                        <Bus className="w-3.5 h-3.5 text-white" />
                      </div>
                      <span className="text-xs font-black tracking-wider text-white">IPASSCARE</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-slate-800 px-2 py-1 rounded-full border border-slate-700 text-[10px]">
                      <span className="text-slate-300 font-bold">정성을 다하는 스포츠</span>
                      <ChevronDown className="w-3 h-3 text-slate-400" />
                    </div>
                    <div className="relative">
                      <Bell className="w-4 h-4 text-slate-300" />
                      <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500" />
                    </div>
                  </div>

                  {/* Child Selector Pill Header */}
                  <div className="bg-blue-600 text-white px-3 py-2 flex items-center justify-between text-[11px] font-bold">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span>자녀: 김지후 (초등 3학년)</span>
                    </div>
                    <span className="text-[9px] bg-white/20 px-1.5 py-0.5 rounded font-semibold">자녀 관리</span>
                  </div>

                  {/* App Screen Tab Selector inside Phone */}
                  <div className="flex border-b border-slate-200 bg-white text-[11px] font-bold text-slate-600">
                    <button 
                      onClick={() => setActiveSimScreen('shuttle')}
                      className={`flex-1 py-2.5 text-center flex items-center justify-center gap-1 border-b-2 transition-colors ${activeSimScreen === 'shuttle' ? 'border-blue-600 text-blue-600 font-extrabold bg-blue-50/50' : 'border-transparent hover:text-slate-900'}`}
                    >
                      <Navigation className="w-3 h-3" />
                      <span>셔틀 지도</span>
                    </button>
                    <button 
                      onClick={() => setActiveSimScreen('attendance')}
                      className={`flex-1 py-2.5 text-center flex items-center justify-center gap-1 border-b-2 transition-colors ${activeSimScreen === 'attendance' ? 'border-blue-600 text-blue-600 font-extrabold bg-blue-50/50' : 'border-transparent hover:text-slate-900'}`}
                    >
                      <Bell className="w-3 h-3" />
                      <span>등하원</span>
                    </button>
                    <button 
                      onClick={() => setActiveSimScreen('payment')}
                      className={`flex-1 py-2.5 text-center flex items-center justify-center gap-1 border-b-2 transition-colors ${activeSimScreen === 'payment' ? 'border-blue-600 text-blue-600 font-extrabold bg-blue-50/50' : 'border-transparent hover:text-slate-900'}`}
                    >
                      <CreditCard className="w-3 h-3" />
                      <span>이용권/결제</span>
                    </button>
                  </div>

                  {/* Screen Content Body */}
                  <div className="flex-1 p-3.5 bg-slate-100 flex flex-col justify-between overflow-y-auto space-y-3">
                    
                    {/* Screen 1: Realtime Shuttle Map */}
                    {activeSimScreen === 'shuttle' && (
                      <div className="space-y-2.5 animate-in fade-in duration-300">
                        {/* Shuttle Vehicle Card */}
                        <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200">
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="font-extrabold text-slate-800 flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                              스마트 셔틀 (1호차)
                            </span>
                            <span className="text-[10px] text-blue-600 font-bold bg-blue-100 px-2 py-0.5 rounded-full">운행 중</span>
                          </div>

                          {/* Map View */}
                          <div className="relative w-full h-36 bg-blue-50 rounded-xl overflow-hidden border border-blue-200 flex items-center justify-center">
                            <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#2563eb_1.5px,transparent_1.5px)] [background-size:14px_14px]" />
                            <div className="absolute w-full h-2.5 bg-slate-300 top-1/2 -translate-y-1/2" />
                            <div className="absolute h-full w-2.5 bg-slate-300 left-1/3" />
                            
                            {/* Animated Bus Marker */}
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-bounce">
                              <div className="bg-blue-600 text-white p-2 rounded-full shadow-lg border-2 border-white">
                                <Bus className="w-5 h-5" />
                              </div>
                              <span className="text-[9px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded shadow mt-1">시속 32km</span>
                            </div>

                            <div className="absolute bottom-2 left-2 right-2 bg-white/95 backdrop-blur p-2 rounded-lg text-[10px] flex justify-between items-center text-slate-800 font-bold shadow-sm">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-red-500" /> 래미안 101동 정류장
                              </span>
                              <span className="text-blue-600 font-extrabold">3분 후 도착</span>
                            </div>
                          </div>
                        </div>

                        {/* Ride Timeline Log */}
                        <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-slate-800">승하차 실시간 타임라인</div>
                          <div className="space-y-1 text-[10px]">
                            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <span className="font-semibold text-slate-700">김지후 (학원 출발)</span>
                              <span className="text-emerald-600 font-extrabold">15:20 승차 완료</span>
                            </div>
                            <div className="flex items-center justify-between bg-slate-50 p-2 rounded-lg border border-slate-100">
                              <span className="font-semibold text-slate-700">박민서 (래미안 하차)</span>
                              <span className="text-blue-600 font-bold">15:28 하차 예정</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen 2: Keypad Attendance */}
                    {activeSimScreen === 'attendance' && (
                      <div className="space-y-2.5 animate-in fade-in duration-300">
                        <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 text-center">
                          <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 mx-auto flex items-center justify-center mb-1.5">
                            <Bell className="w-5 h-5" />
                          </div>
                          <div className="text-xs font-bold text-slate-800">태블릿 입구 출결 키패드</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">학생 고유 4자리 출결 번호 입력</div>

                          <div className="mt-3 bg-slate-100 p-2.5 rounded-xl flex items-center justify-center gap-2 border border-slate-200">
                            <span className="text-base font-black text-slate-900 tracking-widest">● ● ● ●</span>
                            <span className="text-[10px] bg-blue-600 text-white px-2 py-1 rounded font-bold">출결 확인</span>
                          </div>
                        </div>

                        {/* Kakao Notification Bubble */}
                        <div className="bg-amber-100/90 border border-amber-200 p-3 rounded-2xl text-slate-900 text-[11px] shadow-sm">
                          <div className="font-bold flex items-center gap-1 text-amber-900">
                            <CheckCircle className="w-4 h-4 text-emerald-600" /> 카카오 알림톡 자동 전송
                          </div>
                          <div className="mt-1 text-[10px] text-amber-950 font-medium leading-relaxed">
                            "[아이패스케어] 김지후 학생이 15:30에 정성을 다하는 아카데미에 안전 등원하였습니다."
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Screen 3: Passes & KSPay & Points */}
                    {activeSimScreen === 'payment' && (
                      <div className="space-y-2.5 animate-in fade-in duration-300">
                        {/* Active Pass Card */}
                        <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-3.5 rounded-2xl shadow-sm">
                          <div className="text-[10px] text-slate-300">보유 이용권</div>
                          <div className="text-xs font-extrabold text-white mt-0.5">2026년 8월 수강권 (셔틀 포함)</div>
                          <div className="text-sm font-black text-blue-400 mt-2">잔여 12 회 / 16 회</div>
                        </div>

                        {/* KSPay Payment Card */}
                        <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 space-y-1.5">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-bold text-slate-800">8월 수강료 청구서</span>
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded">KSPay 결제완료</span>
                          </div>
                          <div className="text-xs font-extrabold text-slate-900">180,000 원</div>
                        </div>

                        {/* Points Card */}
                        <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
                          <div>
                            <div className="text-[10px] text-slate-500">VOG SPORTS 마일리지</div>
                            <div className="text-xs font-bold text-slate-800">적립 보유 포인트</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs font-extrabold text-indigo-600">24,500 P</div>
                            <div className="text-[9px] text-blue-600 font-bold underline cursor-pointer">쇼핑몰 전환</div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Bottom Status Tip inside Phone */}
                    <div className="pt-1 text-center text-[10px] text-slate-400 font-medium">
                      탭을 클릭하면 실시간 모바일 앱 화면이 변경됩니다
                    </div>

                  </div>
                </div>

              </div>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
};
