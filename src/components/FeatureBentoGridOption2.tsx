import React from 'react';
import { Navigation, Bell, CreditCard, Gift, Zap, ArrowUpRight } from 'lucide-react';

export const FeatureBentoGridOption2: React.FC = () => {
  return (
    <section id="features" className="py-28 bg-slate-900 text-white relative">
      <div className="absolute top-1/2 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="text-center max-w-3xl mx-auto mb-20 space-y-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 text-xs font-bold border border-blue-400/30">
            <Zap className="w-3.5 h-3.5" />
            <span>IPASSCARE CORE INNOVATION</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            압도적인 기술력의 차이.<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-300">
              IPASSCARE 핵심 4대 솔루션.
            </span>
          </h2>
          <p className="text-slate-400 text-base sm:text-lg">
            단순 위치 알림을 넘어 원비 수납, 출결, 마일리지 포인트 리워드까지 하나로 완성합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          <div className="md:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-8 sm:p-10 relative overflow-hidden group hover:border-blue-500/50 transition-all shadow-2xl">
            <div className="absolute -top-10 -right-10 w-60 h-60 bg-blue-500/10 rounded-full blur-2xl group-hover:scale-125 transition-transform" />
            
            <div className="relative z-10 flex flex-col justify-between h-full space-y-8">
              <div className="space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-600/20 border border-blue-500/30 text-blue-400 flex items-center justify-center font-bold">
                  <Navigation className="w-7 h-7" />
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                  실시간 GPS 셔틀 관제 & 도착 알림톡
                </h3>
                <p className="text-slate-300 text-sm sm:text-base max-w-lg leading-relaxed">
                  고가의 차량 단말기 없이 기사님 휴대전화 GPS 기반으로 실시간 동선과 속도를 지도에 표시하고, 정류장 도착 전에 카카오 알림톡을 발송합니다.
                </p>
              </div>

              <div className="bg-slate-950/80 border border-slate-800 p-4 rounded-2xl flex items-center justify-between text-xs text-slate-300">
                <div className="flex items-center gap-3">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                  <span className="font-bold text-white">스마트 셔틀 1호차</span>
                </div>
                <div className="text-blue-400 font-extrabold">래미안 101동 (3분 후 도착예정)</div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-8 flex flex-col justify-between group hover:border-emerald-500/50 transition-all shadow-2xl">
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-bold">
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-extrabold text-white">
                원터치 안심 출결
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                학원 입구 태블릿 키패드로 학생 번호 입력 시 0.1초 만에 학부모 휴대전화로 등하원 알림 전송.
              </p>
            </div>

            <div className="mt-8 bg-emerald-950/50 border border-emerald-800/60 p-4 rounded-2xl text-xs text-emerald-300">
              <div className="font-bold mb-1">카카오 알림톡 전송</div>
              <div className="text-[10px] text-slate-300">"김지후 학생 등원 완료 (15:30)"</div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-8 flex flex-col justify-between group hover:border-indigo-500/50 transition-all shadow-2xl">
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center font-bold">
                <CreditCard className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-extrabold text-white">
                KSPay 원비 결제 & 세트 분할
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                미납 원비 청구서 모바일 일괄 전송 및 PG 수납. 결합 수강권 구매 시 수강권과 셔틀권이 원생 계정에 자동 분할 지급됩니다.
              </p>
            </div>

            <div className="mt-8 pt-4 border-t border-slate-800 flex justify-between items-center text-xs font-bold text-indigo-400">
              <span>수납 회수율 85% 상승</span>
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>

          <div className="md:col-span-2 bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-8 sm:p-10 relative overflow-hidden group hover:border-amber-500/50 transition-all shadow-2xl">
            <div className="space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-600/20 border border-amber-500/30 text-amber-400 flex items-center justify-center font-bold">
                <Gift className="w-7 h-7" />
              </div>
              <h3 className="text-2xl sm:text-3xl font-extrabold text-white">
                VOG SPORTS 제휴 쇼핑몰 포인트 전환 & 다단계 추천
              </h3>
              <p className="text-slate-300 text-sm sm:text-base max-w-xl leading-relaxed">
                원비 결제 마일리지 포인트를 VOG SPORTS / 영카트 쇼핑몰에서 1:1 현금처럼 사용하거나 출금 가능. 학부모 지인 추천 시 1대/2대/3대 자동 포인트 정산으로 학원 신규 유입 증대.
              </p>
            </div>

            <div className="mt-8 bg-amber-950/40 border border-amber-800/60 p-4 rounded-2xl flex items-center justify-between text-xs text-amber-300">
              <span className="font-bold">보유 포인트 쇼핑몰 1:1 현금성 전환</span>
              <span className="font-extrabold text-white bg-amber-600 px-3 py-1 rounded-xl">24,500 P</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
