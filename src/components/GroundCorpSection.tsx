import React from 'react';
import { Building2, Globe, ShieldCheck, Trophy, HeartHandshake, ExternalLink } from 'lucide-react';

export const GroundCorpSection: React.FC = () => {
  return (
    <section id="groundcorp" className="py-24 bg-white border-t border-b border-slate-200/80 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
          
          {/* Left Text Box */}
          <div className="lg:col-span-6 space-y-6">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold border border-blue-200">
              <Building2 className="w-4 h-4 text-blue-600" />
              <span>운영 법인 기업 소개</span>
            </div>

            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
              대한민국 교육 혁신을 이끄는<br />
              <span className="gradient-text">(주)그라운드코퍼레이션</span>
            </h2>

            <p className="text-slate-600 text-base leading-relaxed">
              아이패스케어(IPASSCARE)는 교육, 시설, 브랜드를 잇는 대표 비즈니스 그룹<br className="hidden sm:inline" /> <strong>(주)그라운드코퍼레이션(Ground Corporation)</strong>의 학원 안심 케어 올인원 플랫폼입니다.
            </p>

            <p className="text-slate-600 text-sm leading-relaxed">
              단순 학원 관리를 넘어, 제휴 스포츠 용품 쇼핑몰(VOG SPORTS) 마일리지 적립 혜택과<br className="hidden sm:inline" /> 아카데미 네트워크를 결합하여 학원과 학부모 모두에게 실질적인 리워드 가치를 제공합니다.
            </p>

            {/* Core Values Bullets */}
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="flex items-center gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
                <Trophy className="w-5 h-5 text-blue-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800">교육 IT 솔루션 비즈니스</span>
              </div>
              <div className="flex items-center gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
                <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800">안심 케어 솔루션</span>
              </div>
              <div className="flex items-center gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
                <HeartHandshake className="w-5 h-5 text-emerald-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800">VOG SPORTS 마일리지</span>
              </div>
              <div className="flex items-center gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200/60">
                <Globe className="w-5 h-5 text-sky-600 shrink-0" />
                <span className="text-xs font-bold text-slate-800">검증된 학원 전문 케어 인프라</span>
              </div>
            </div>

            <div className="pt-2">
              <a 
                href="https://www.groundcorporation.com/" 
                target="_blank" 
                rel="noopener noreferrer"
                className="btn-secondary text-xs sm:text-sm"
              >
                <span>그라운드코퍼레이션 공식 홈페이지 방문</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>

          </div>

          {/* Right Visual Card (Fixed CSS: Deep Premium Dark Gradient with High-Contrast Text) */}
          <div className="lg:col-span-6">
            <div className="rounded-3xl p-8 sm:p-10 bg-slate-950 border border-slate-800 text-white relative overflow-hidden shadow-2xl space-y-6">
              
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

              <div className="relative z-10 space-y-6">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black tracking-widest text-blue-400">GROUND CORPORATION</span>
                  <span className="text-[10px] px-3 py-1 rounded-full bg-blue-500/20 text-blue-300 font-extrabold border border-blue-400/30">
                    CORPORATE ECOSYSTEM
                  </span>
                </div>

                <h3 className="text-xl sm:text-2xl font-black text-white leading-snug">
                  "안전한 셔틀 케어부터 수강료 수납, 스포츠 혜택까지 하나로 연결되는 세상"
                </h3>

                <div className="space-y-3.5 pt-2 text-xs">
                  <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-sm text-white">아이패스케어 (IPASSCARE)</div>
                      <div className="text-xs text-slate-400 mt-0.5">학원 통합 등하원 & 셔틀 GPS & 수강권 결제 앱</div>
                    </div>
                    <span className="text-blue-400 font-black text-sm shrink-0 ml-2">Main Service</span>
                  </div>

                  <div className="p-4 bg-slate-900/90 rounded-2xl border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-black text-sm text-white">VOG SPORTS 몰 / 영카트</div>
                      <div className="text-xs text-slate-400 mt-0.5">학부모 및 원생 마일리지 제휴 스포츠 쇼핑몰</div>
                    </div>
                    <span className="text-emerald-400 font-black text-sm shrink-0 ml-2">Reward Partner</span>
                  </div>
                </div>

                <div className="pt-2 text-center text-xs font-medium text-slate-400 border-t border-slate-900">
                  (주)그라운드코퍼레이션은 믿을 수 있는 투명함과 정직함으로 학원의 성장을 도웁니다.
                </div>

              </div>

            </div>
          </div>

        </div>

      </div>
    </section>
  );
};

export default GroundCorpSection;
