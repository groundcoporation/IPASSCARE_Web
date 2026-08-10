import React from 'react';
import { Bus, Phone, ExternalLink, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 py-16 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800">
          
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl gradient-bg-primary text-white flex items-center justify-center font-bold">
                <Bus className="w-6 h-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-extrabold text-white">IPASSCARE <span className="text-xs text-blue-400">아이패스케어</span></span>
                <span className="text-[10px] text-slate-500 font-medium tracking-wider">BY GROUND CORPORATION</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              아이패스케어(IPASSCARE)는 실시간 셔틀 GPS 관제, 안심 출결, KSPay 모바일 수강권 수납, VOG SPORTS 포인트 전환까지 포함된 대한민국 1등 통합 학원 케어 플랫폼입니다.
            </p>

            <div className="pt-2 text-xs text-slate-300 space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400" />
                <span>운영법인: (주)그라운드코퍼레이션 (Ground Corporation)</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-400" />
                <span>도입 문의 전화: 1544-7984 (평일 09:00 ~ 18:00)</span>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white tracking-wider">서비스 안내</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#features" className="hover:text-white transition-colors">주요 4대 기능</a></li>
              <li><a href="#roles" className="hover:text-white transition-colors">학부모/학원장/기사님 가이드</a></li>
              <li><a href="#calculator" className="hover:text-white transition-colors">실시간 ROI 계산기</a></li>
              <li><a href="#manuals" className="hover:text-white transition-colors">사용법 동영상 매뉴얼</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white tracking-wider">법인 정보</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a 
                  href="https://www.groundcorporation.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-white transition-colors flex items-center gap-1"
                >
                  <span>(주)그라운드코퍼레이션</span>
                  <ExternalLink className="w-3 h-3 text-slate-500" />
                </a>
              </li>
              <li><a href="#inquiry" className="hover:text-white transition-colors">B2B 제휴 및 도입 문의</a></li>
              <li><a href="#" className="hover:text-white transition-colors">개인정보 처리방침</a></li>
              <li><a href="#" className="hover:text-white transition-colors">서비스 이용약관</a></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white tracking-wider">모바일 앱 다운로드</h4>
            <p className="text-[11px] text-slate-400">구글 플레이스토어 및 애플 앱스토어에서 아이패스케어를 검색하세요.</p>
            <div className="flex flex-col gap-2 pt-1">
              <a href="#" className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white text-xs font-bold flex items-center gap-2 transition-colors">
                <span>Google Play 에서 다운로드</span>
              </a>
              <a href="#" className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-white text-xs font-bold flex items-center gap-2 transition-colors">
                <span>App Store 에서 다운로드</span>
              </a>
            </div>
          </div>

        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-4">
          <div>
            &copy; 2026 GROUND CORPORATION. All rights reserved. IPASSCARE™ is a registered product of Ground Corp.
          </div>
          <div className="flex gap-4">
            <a href="#" className="hover:text-slate-400">이용약관</a>
            <a href="#" className="hover:text-slate-400 font-bold text-slate-300">개인정보처리방침</a>
          </div>
        </div>

      </div>
    </footer>
  );
};
