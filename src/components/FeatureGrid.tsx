import React from 'react';
import { Navigation, Bell, Bus, NotebookPen, Zap } from 'lucide-react';

export const FeatureGrid: React.FC = () => {
  return (
    <section id="features" className="py-24 bg-white relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-3">
            <Zap className="w-3.5 h-3.5" />
            <span>차별화된 핵심 경쟁력</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            아이의 이동은 안심하게,<br />
            <span className="gradient-text">학원 운영은 더 편리하게</span>
          </h2>
          <p className="text-slate-600 mt-3 text-base sm:text-lg">
            실시간 차량 위치·승하차 알림·운행 관리가 핵심입니다.<br className="hidden sm:inline" /> 학습·상담일지로 학원 생활의 기록도 함께 확인하세요.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          
          <div className="glass-card p-8 flex flex-col justify-between relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-bl-full transition-transform group-hover:scale-110 pointer-events-none" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold mb-6 group-hover:scale-110 transition-transform">
                <Navigation className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">
                실시간 차량 위치
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                운행 중인 셔틀의 현재 위치를 지도에서 확인하세요.<br className="hidden sm:inline" /> 차량이 어디쯤 왔는지 앱에서 살펴볼 수 있습니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-blue-600 gap-1">
              <span>운행 중인 셔틀을 지도에서 확인</span>
            </div>
          </div>

          <div className="glass-card p-8 flex flex-col justify-between relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full transition-transform group-hover:scale-110 pointer-events-none" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold mb-6 group-hover:scale-110 transition-transform">
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors">
                승하차 알림
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                자녀의 셔틀 승차·하차 소식을 앱 알림으로 확인하세요.<br className="hidden sm:inline" /> 등하원 기록까지 함께 확인해 안심을 더합니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-emerald-600 gap-1">
              <span>이동 소식과 출결 기록 확인</span>
            </div>
          </div>

          <div className="glass-card p-8 flex flex-col justify-between relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full transition-transform group-hover:scale-110 pointer-events-none" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mb-6 group-hover:scale-110 transition-transform">
                <Bus className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
                운행 관리
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                셔틀 노선과 탑승 원생, 운행 현황을 확인하세요.<br className="hidden sm:inline" /> 기사님과 학원의 셔틀 관리 업무를 연결합니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-indigo-600 gap-1">
              <span>노선·탑승 원생·운행 현황 관리</span>
            </div>
          </div>

          <div className="glass-card p-8 flex flex-col justify-between relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-bl-full transition-transform group-hover:scale-110 pointer-events-none" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold mb-6 group-hover:scale-110 transition-transform">
                <NotebookPen className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-amber-600 transition-colors">
                학습·상담일지
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                아이의 학습 내용과 상담 기록을 한눈에 확인하세요.<br className="hidden sm:inline" /> 학습일지와 상담일지를 구분해 필요한 기록을 찾아볼 수 있습니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-amber-600 gap-1">
              <span>학원 생활의 기록을 한곳에서 확인</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
