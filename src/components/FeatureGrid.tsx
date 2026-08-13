import React from 'react';
import { Navigation, Bell, CreditCard, Gift, Zap } from 'lucide-react';

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
            기존 정적인 B2B 시스템과의 격차,<br />
            <span className="gradient-text">아이패스케어 핵심 4대 솔루션</span>
          </h2>
          <p className="text-slate-600 mt-3 text-base sm:text-lg">
            단순 셔틀 조회를 넘어 원비 수납, 출결, 다양한 마일리지 포인트 활용 혜택까지 하나의 앱으로 완성했습니다.
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
                실시간 GPS 셔틀 관제
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                차량의 실시간 위치와 정류장별 예상 도착 시간을 지도에 노출하며, 도착 전 안심 알림을 발송합니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-blue-600 gap-1">
              <span>도착 전 안심 알림 지원</span>
            </div>
          </div>

          <div className="glass-card p-8 flex flex-col justify-between relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full transition-transform group-hover:scale-110 pointer-events-none" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold mb-6 group-hover:scale-110 transition-transform">
                <Bell className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-emerald-600 transition-colors">
                원터치 안심 등하원 출결
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                태블릿 키패드 입력만으로 실시간 출결 완료. 자녀의 등하원 시각을 학부모 스마트폰으로 0.1초 만에 알림 발송합니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-emerald-600 gap-1">
              <span>NFC & 키패드 연동</span>
            </div>
          </div>

          <div className="glass-card p-8 flex flex-col justify-between relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/10 rounded-bl-full transition-transform group-hover:scale-110 pointer-events-none" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold mb-6 group-hover:scale-110 transition-transform">
                <CreditCard className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors">
                수강권 & 원스톱 원비 결제
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                모바일 원비 청구서 일괄 발행 및 간편 수납 지원. 번거로운 전화 독촉 없이 미납 수납율이 획기적으로 상승합니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-indigo-600 gap-1">
              <span>수강권 자동 분할 결제</span>
            </div>
          </div>

          <div className="glass-card p-8 flex flex-col justify-between relative group overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-bl-full transition-transform group-hover:scale-110 pointer-events-none" />
            <div>
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center font-bold mb-6 group-hover:scale-110 transition-transform">
                <Gift className="w-7 h-7" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3 group-hover:text-amber-600 transition-colors">
                어플결제 · 자사몰 · 제휴 쇼핑몰 포인트
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                적립된 포인트를 <strong>어플 내 수강료 바로 차감 결제</strong>에 사용하거나 <strong>자사몰 & VOG SPORTS 제휴 쇼핑몰</strong> 포인트로 1:1 간편 전환하여 사용이 가능합니다.
              </p>
            </div>
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center text-xs font-bold text-amber-600 gap-1">
              <span>3가지 방식의 차원 다른 포인트 사용</span>
            </div>
          </div>

        </div>

      </div>
    </section>
  );
};
