import React from 'react';
import { Phone, MapPin, ExternalLink, ShieldCheck, FileText } from 'lucide-react';
import iLogo from '/src/assets/i_logo.png';

export const Footer: React.FC = () => {
  return (
    <footer className="bg-slate-950 text-slate-400 py-16 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-800">
          
          {/* Col 1 & 2: Brand & Corporate Info */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <img src={iLogo} alt="IPASSCARE" className="w-10 h-10 object-contain rounded-xl bg-white p-0.5" />
              <div className="flex flex-col">
                <span className="text-xl font-extrabold text-white">IPASSCARE <span className="text-xs text-blue-400">아이패스케어</span></span>
                <span className="text-[10px] text-slate-500 font-bold tracking-wider">BY (주)그라운드코퍼레이션</span>
              </div>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed max-w-sm">
              아이패스케어(IPASSCARE)는 실시간 셔틀 GPS 관제, 안심 출결, 모바일 원비 수납, VOG SPORTS 마일리지 포인트 전환까지 포함된 통합 학원 케어 플랫폼입니다.
            </p>

            <div className="pt-2 text-xs text-slate-300 space-y-1.5 font-medium">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                <span><strong>(주)그라운드코퍼레이션</strong> | 대표이사: 김강태</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-400 shrink-0" />
                <span>고객센터/연락처: 010-7563-2520</span>
              </div>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <span>경기도 시흥시 서울대학로278번길 61, 서영베니스스퀘어 7층 711~713호</span>
              </div>
            </div>
          </div>

          {/* Col 3: Quick Nav Links */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white tracking-wider">주요 바로가기</h4>
            <ul className="space-y-2 text-xs">
              <li><a href="#features" className="hover:text-white transition-colors">주요 4대 기능</a></li>
              <li><a href="#roles" className="hover:text-white transition-colors">학부모/학원장/기사님 가이드</a></li>
              <li><a href="#calculator" className="hover:text-white transition-colors">실시간 ROI 계산기</a></li>
              <li><a href="#manuals" className="hover:text-white transition-colors">사용법 동영상 매뉴얼</a></li>
            </ul>
          </div>

          {/* Col 4: Corporate & Legal Terms */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white tracking-wider">법적 고지 & 약관</h4>
            <ul className="space-y-2 text-xs">
              <li>
                <a 
                  href="https://www.groundcorporation.com/" 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="hover:text-white transition-colors flex items-center gap-1 text-slate-300 font-bold"
                >
                  <span>(주)그라운드코퍼레이션 홈페이지</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
              </li>
              <li>
                <a 
                  href="https://docs.google.com/document/d/1w8fZDkcwXM6GATj6cAqmPHRny08w8KikLdFSuogXpmw/edit?tab=t.0" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>서비스 이용약관</span>
                </a>
              </li>
              <li>
                <a 
                  href="https://docs.google.com/document/d/1plQT2VJIrK8nxG1m3huj3LuUsCKea-dl37HEEBOhnJw/edit?tab=t.0" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors flex items-center gap-1"
                >
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>개인정보 처리방침</span>
                </a>
              </li>
              <li><a href="#inquiry" className="hover:text-white transition-colors">B2B 무료 도입 문의</a></li>
            </ul>
          </div>

          {/* Col 5: Mobile App Store Downloads */}
          <div className="space-y-3">
            <h4 className="text-sm font-bold text-white tracking-wider">모바일 앱 다운로드</h4>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              구글 플레이스토어 및 애플 앱스토어에서 <strong>아이패스케어</strong> 공식 앱을 만난 보세요.
            </p>
            <div className="flex flex-col gap-2 pt-1">
              <a 
                href="https://play.google.com/store/apps/details?id=com.goundcorp.ipasscare"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition-colors group"
              >
                <span>Google Play 에서 다운로드</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 ml-auto" />
              </a>
              <a 
                href="https://apps.apple.com/kr/app/ipasscare/id6785789500"
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-blue-500 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-2 transition-colors group"
              >
                <span>App Store 에서 다운로드</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400 ml-auto" />
              </a>
            </div>
          </div>

        </div>

        {/* Bottom Legal Business Registration Bar */}
        <div className="pt-8 space-y-3 text-xs text-slate-500 border-t border-slate-900">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px] leading-relaxed">
            <div><strong>상호명:</strong> (주)그라운드코퍼레이션</div>
            <div><strong>대표자:</strong> 김강태</div>
            <div><strong>사업자등록번호:</strong> 441-86-03857</div>
            <div><strong>통신판매업신고:</strong> 제 2026-경기시흥-1097 호</div>
            <div><strong>구매안전(에스크로):</strong> 03-260507-0003</div>
            <div className="md:col-span-2"><strong>주소:</strong> 경기도 시흥시 서울대학로278번길 61, 서영베니스스퀘어 7층 711~713호</div>
            <div><strong>연락처:</strong> 010-7563-2520</div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between text-[11px] text-slate-500 pt-3 border-t border-slate-900/80 gap-2">
            <div>
              &copy; 2026 (주)그라운드코퍼레이션 (Ground Corporation). All rights reserved. IPASSCARE™
            </div>
            <div className="flex gap-4">
              <a 
                href="https://docs.google.com/document/d/1w8fZDkcwXM6GATj6cAqmPHRny08w8KikLdFSuogXpmw/edit?tab=t.0" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-slate-300"
              >
                이용약관
              </a>
              <a 
                href="https://docs.google.com/document/d/1plQT2VJIrK8nxG1m3huj3LuUsCKea-dl37HEEBOhnJw/edit?tab=t.0" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-slate-300 font-medium"
              >
                개인정보처리방침
              </a>
            </div>
          </div>

        </div>

      </div>
    </footer>
  );
};
