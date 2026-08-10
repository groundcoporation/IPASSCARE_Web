import React, { useState, useEffect } from 'react';
import { Bus, Bell, CreditCard, ArrowRight, MapPin, Sparkles, Navigation, CheckCircle2, ChevronRight } from 'lucide-react';

interface HeroSectionOption2Props {
  onOpenInquiry: () => void;
}

export const HeroSectionOption2: React.FC<HeroSectionOption2Props> = ({ onOpenInquiry }) => {
  const [activeTab, setActiveTab] = useState<'shuttle' | 'attendance' | 'payment'>('shuttle');

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveTab((prev) => {
        if (prev === 'shuttle') return 'attendance';
        if (prev === 'attendance') return 'payment';
        return 'shuttle';
      });
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  return (
    <section className="relative pt-36 pb-28 overflow-hidden bg-slate-950 text-white">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-gradient-to-b from-blue-600/25 via-indigo-600/15 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-sky-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="text-center max-w-4xl mx-auto space-y-6">
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 backdrop-blur-md border border-white/15 text-blue-300 text-xs sm:text-sm font-bold shadow-2xl">
            <Sparkles className="w-4 h-4 text-blue-400" />
            <span className="tracking-wide">IPASSCARE BRAND ESSENCE</span>
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white leading-[1.1]">
            학원 안심 케어의 새로운 기준.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-300">
              IPASSCARE.
            </span>
          </h1>

          <p className="text-base sm:text-xl text-slate-300 max-w-2xl mx-auto font-normal leading-relaxed">
            실시간 GPS 셔틀 관제부터 원터치 키패드 출결, KSPay 원비 수납, VOG SPORTS 쇼핑몰 마일리지 혜택까지. 학원과 학부모를 가장 완벽하게 연결하는 대표 솔루션.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <button 
              onClick={onOpenInquiry}
              className="btn-primary text-base sm:text-lg px-9 py-4 shadow-xl shadow-blue-500/30 rounded-2xl"
            >
              <span>무료 도입 상담 신청</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <a 
              href="#roles"
              className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/20 text-white font-bold text-base transition-all flex items-center gap-2"
            >
              <span>맞춤 기능 시연 보기</span>
              <ChevronRight className="w-5 h-5 text-slate-400" />
            </a>
          </div>

          <div className="pt-10 flex flex-wrap justify-center gap-8 text-center sm:text-left border-t border-slate-800/80 max-w-3xl mx-auto">
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-blue-400">99.8%</div>
              <div className="text-xs text-slate-400 font-medium">등하원 알림 신뢰도</div>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden sm:block" />
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-indigo-400">85%↓</div>
              <div className="text-xs text-slate-400 font-medium">원비 미납률 감소</div>
            </div>
            <div className="w-px h-10 bg-slate-800 hidden sm:block" />
            <div>
              <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">500+</div>
              <div className="text-xs text-slate-400 font-medium">전국 도입 학원 수</div>
            </div>
          </div>

        </div>

        <div className="mt-16 flex flex-col items-center">
          
          <div className="inline-flex p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md mb-8 shadow-2xl">
            <button
              onClick={() => setActiveTab('shuttle')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-2 ${
                activeTab === 'shuttle'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Navigation className="w-4 h-4" />
              <span>실시간 셔틀 GPS</span>
            </button>
            <button
              onClick={() => setActiveTab('attendance')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-2 ${
                activeTab === 'attendance'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bell className="w-4 h-4" />
              <span>안심 키패드 출결</span>
            </button>
            <button
              onClick={() => setActiveTab('payment')}
              className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center gap-2 ${
                activeTab === 'payment'
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>원비 수납 & 포인트</span>
            </button>
          </div>

          <div className="relative group">
            <div className="absolute -inset-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-[50px] blur-xl opacity-30 group-hover:opacity-50 transition-opacity pointer-events-none" />

            <div className="w-[320px] sm:w-[360px] h-[640px] bg-slate-900 rounded-[48px] p-3 shadow-2xl border-4 border-slate-800 relative overflow-hidden">
              
              <div className="w-28 h-6 bg-black rounded-full absolute top-4 left-1/2 -translate-x-1/2 z-40 flex items-center justify-end px-3">
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
              </div>

              <div className="w-full h-full bg-slate-50 text-slate-900 rounded-[38px] overflow-hidden flex flex-col justify-between pt-10">
                
                <div className="bg-slate-900 text-white p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg gradient-bg-primary flex items-center justify-center font-black text-xs text-white">
                      <Bus className="w-4 h-4" />
                    </div>
                    <span className="font-black text-xs tracking-wider">IPASSCARE</span>
                  </div>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-bold border border-blue-400/30">
                    정성을 다하는 스포츠
                  </span>
                </div>

                <div className="flex-1 p-4 bg-slate-100 flex flex-col justify-between overflow-y-auto space-y-3">
                  
                  {activeTab === 'shuttle' && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      <div className="bg-white p-3.5 rounded-2xl shadow-md border border-slate-200">
                        <div className="flex justify-between items-center text-xs mb-2">
                          <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            스마트 셔틀 (1호차)
                          </span>
                          <span className="text-[10px] bg-blue-100 text-blue-700 font-extrabold px-2 py-0.5 rounded-full">
                            운행 중
                          </span>
                        </div>

                        <div className="relative w-full h-40 bg-blue-50/90 rounded-xl overflow-hidden border border-blue-200 flex items-center justify-center">
                          <div className="absolute inset-0 opacity-25 bg-[radial-gradient(#2563eb_1.5px,transparent_1.5px)] [background-size:14px_14px]" />
                          <div className="absolute w-full h-3 bg-slate-300 top-1/2 -translate-y-1/2" />
                          <div className="absolute h-full w-3 bg-slate-300 left-1/3" />

                          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center animate-bounce">
                            <div className="bg-blue-600 text-white p-2 rounded-full shadow-lg border-2 border-white">
                              <Bus className="w-5 h-5" />
                            </div>
                            <span className="text-[9px] font-extrabold bg-slate-900 text-white px-2 py-0.5 rounded shadow mt-1">시속 32km</span>
                          </div>

                          <div className="absolute bottom-2 left-2 right-2 bg-white/95 backdrop-blur p-2 rounded-lg text-[10px] flex justify-between items-center text-slate-900 font-extrabold shadow-sm">
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-red-500" /> 래미안 101동 앞
                            </span>
                            <span className="text-blue-600">3분 후 도착</span>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-3 rounded-2xl shadow-sm border border-slate-200 text-xs">
                        <div className="font-extrabold text-slate-900 mb-1">승하차 실시간 로그</div>
                        <div className="flex justify-between text-[10px] text-slate-600 bg-slate-50 p-2 rounded-lg">
                          <span>김지후 (학원 출발)</span>
                          <span className="text-emerald-600 font-bold">15:20 승차</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'attendance' && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      <div className="bg-white p-4 rounded-2xl shadow-md border border-slate-200 text-center">
                        <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-600 mx-auto flex items-center justify-center mb-2">
                          <Bell className="w-6 h-6" />
                        </div>
                        <div className="text-xs font-bold text-slate-900">학원 입구 원터치 키패드</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">학생 번호 4자리 입력 즉시 전송</div>

                        <div className="mt-4 bg-slate-100 p-3 rounded-xl flex items-center justify-center gap-3 border border-slate-200">
                          <span className="text-lg font-black text-slate-900 tracking-widest">1 5 3 0</span>
                          <span className="text-[10px] bg-blue-600 text-white px-2.5 py-1 rounded font-bold">확인</span>
                        </div>
                      </div>

                      <div className="bg-amber-100/90 border border-amber-200 p-3 rounded-2xl text-[11px] text-amber-950 font-medium">
                        <div className="font-bold flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-4 h-4" /> 카카오 알림톡 전송 완료
                        </div>
                        <div className="mt-1 text-[10px] text-slate-800">
                          "[아이패스케어] 김지후 학생이 15:30에 정성을 다하는 아카데미에 안심 등원하였습니다."
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === 'payment' && (
                    <div className="space-y-3 animate-in fade-in duration-300">
                      <div className="bg-gradient-to-br from-slate-900 to-blue-950 text-white p-4 rounded-2xl shadow-md">
                        <div className="text-[10px] text-slate-300">수강권 & 셔틀 결합 패스</div>
                        <div className="text-xs font-black text-white mt-1">2026년 8월 통합 이용권</div>
                        <div className="text-base font-black text-blue-400 mt-2">잔여 12 회 / 16 회</div>
                      </div>

                      <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-slate-900">8월 수강료 (KSPay)</div>
                          <div className="text-[10px] text-slate-500">모바일 원스톱 수납</div>
                        </div>
                        <span className="text-emerald-600 font-extrabold bg-emerald-50 px-2.5 py-1 rounded-full text-[10px]">
                          결제 완료
                        </span>
                      </div>

                      <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-slate-900">VOG SPORTS 마일리지</div>
                          <div className="text-[10px] text-indigo-600 font-bold">24,500 P 적립중</div>
                        </div>
                        <span className="text-xs text-blue-600 font-bold underline cursor-pointer">
                          쇼핑몰 전환
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="text-center text-[10px] text-slate-400 font-medium pt-1">
                    아이패스케어 모바일 앱 실제 구동 화면
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
