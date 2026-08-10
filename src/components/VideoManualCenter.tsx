import React, { useState } from 'react';
import { Play, Video, X } from 'lucide-react';

interface VideoManual {
  id: string;
  category: 'parent' | 'admin' | 'driver';
  categoryLabel: string;
  title: string;
  duration: string;
  description: string;
  steps: string[];
  thumbnailBg: string;
}

const MANUAL_DATA: VideoManual[] = [
  {
    id: 'm1',
    category: 'parent',
    categoryLabel: '학부모 매뉴얼',
    title: '셔틀 실시간 위치 조회 및 도착 알림톡 설정 가이드',
    duration: '2분 15초',
    description: '스마트폰 앱에서 셔틀버스의 현재 위치를 확인하고, 승하차 1분 전 알림톡 수신을 설정하는 방법입니다.',
    steps: [
      '앱 실행 후 메인 화면의 [셔틀 위치 지도] 터치',
      '자녀가 탑승하는 노선 차량(예: 1호차) 선택',
      '도착 전 알림(1분 전 / 3분 전) 푸시 알림 켜기'
    ],
    thumbnailBg: 'from-blue-600 to-indigo-700'
  },
  {
    id: 'm2',
    category: 'parent',
    categoryLabel: '학부모 매뉴얼',
    title: '모바일 원비 청구서 조회 및 KSPay 원스톱 간편 결제',
    duration: '1분 40초',
    description: '학원에서 발송한 청구서를 앱에서 확인하고 신용카드 및 모바일 뱅킹으로 안전하게 결제하는 방법입니다.',
    steps: [
      '앱 하단 [이용권/결제] 탭 클릭',
      '미납 청구서의 [즉시 수납하기] 버튼 터치',
      'KSPay 결제창에서 원하는 결제 수단 선택 후 결제 완료'
    ],
    thumbnailBg: 'from-indigo-600 to-purple-700'
  },
  {
    id: 'm3',
    category: 'parent',
    categoryLabel: '학부모 매뉴얼',
    title: '적립 포인트 조회 및 VOG SPORTS 제휴 쇼핑몰 전환',
    duration: '2분 05초',
    description: '결제 및 추천 이벤트로 적립된 마일리지 포인트를 쇼핑몰 포인트로 1:1 전환하는 상세 과정입니다.',
    steps: [
      '마이페이지 > [포인트 관리] 메뉴 진입',
      '전환할 포인트 금액 입력 후 [쇼핑몰 포인트 전환] 터치',
      'VOG SPORTS / 영카트 쇼핑몰 결제 시 즉시 현금처럼 사용'
    ],
    thumbnailBg: 'from-emerald-600 to-teal-700'
  },
  {
    id: 'm4',
    category: 'admin',
    categoryLabel: '학원장 매뉴얼',
    title: '학원 원생 등록 및 미납 청구서 카카오톡 일괄 발송',
    duration: '3분 10초',
    description: '관리자 대시보드에서 신규 원생을 등록하고 수강 청구서를 일괄 발송하여 원비 미납을 예방합니다.',
    steps: [
      '관리자 대시보드 > [청구/정산] 메뉴 이동',
      '이번 달 발송 대상 수강생 선택 후 [청구서 작성]',
      '[카카오 알림톡 일괄 발송] 버튼 클릭 시 학부모 전송'
    ],
    thumbnailBg: 'from-slate-800 to-slate-950'
  },
  {
    id: 'm5',
    category: 'admin',
    categoryLabel: '학원장 매뉴얼',
    title: '태블릿 입구 출결 키패드 세팅 및 등하원 메시지 문구 설정',
    duration: '2분 45초',
    description: '학원 입구 태블릿PC에 키패드 앱을 설치하고, 학원명 문구가 담긴 출결 알림톡을 설정합니다.',
    steps: [
      '태블릿에 아이패스케어 키패드 앱 설치',
      '학원 인증키 입력 후 관리자 계정 로그인',
      '등원/하원 기본 메시지 템플릿 지정 후 완료'
    ],
    thumbnailBg: 'from-blue-700 to-slate-900'
  },
  {
    id: 'm6',
    category: 'driver',
    categoryLabel: '기사님 매뉴얼',
    title: '셔틀 운행 시작/종료 및 정류장별 승하차 원생 체크',
    duration: '1분 50초',
    description: '기사님 전용 앱에서 차량 운행을 시작하고 정류장 도착 시 학생 승하차를 수동 또는 NFC로 기록합니다.',
    steps: [
      '운행 출발 시 기사님 앱의 [운행 시작] 큰 버튼 터치',
      '정류장 도착 후 목록에서 탑승한 원생 [체크] 클릭',
      '운행 마친 후 [운행 종료] 클릭 시 안심 로그 기록 완료'
    ],
    thumbnailBg: 'from-amber-600 to-orange-700'
  }
];

export const VideoManualCenter: React.FC = () => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'parent' | 'admin' | 'driver'>('all');
  const [selectedManual, setSelectedManual] = useState<VideoManual | null>(null);

  const filteredManuals = activeCategory === 'all' 
    ? MANUAL_DATA 
    : MANUAL_DATA.filter(m => m.category === activeCategory);

  return (
    <section id="manuals" className="py-24 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-3">
            <Video className="w-3.5 h-3.5" />
            <span>비디오 가이드 센터</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            영상으로 보는 쉽게 따라 하는<br />
            <span className="gradient-text">아이패스케어 매뉴얼 센터</span>
          </h2>
          <p className="text-slate-600 mt-3 text-base sm:text-lg">
            학부모, 학원장, 기사님별 필수 사용법을 1~2분 분량의 짧고 명확한 영상으로 확인하세요.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mb-12">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeCategory === 'all'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            전체 보기 ({MANUAL_DATA.length})
          </button>
          <button
            onClick={() => setActiveCategory('parent')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeCategory === 'parent'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            학부모 매뉴얼
          </button>
          <button
            onClick={() => setActiveCategory('admin')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeCategory === 'admin'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            학원장 매뉴얼
          </button>
          <button
            onClick={() => setActiveCategory('driver')}
            className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
              activeCategory === 'driver'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/25'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            기사님 매뉴얼
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredManuals.map((manual) => (
            <div 
              key={manual.id}
              className="glass-card overflow-hidden flex flex-col justify-between group cursor-pointer"
              onClick={() => setSelectedManual(manual)}
            >
              <div>
                <div className={`relative h-48 bg-gradient-to-br ${manual.thumbnailBg} p-6 flex flex-col justify-between text-white overflow-hidden`}>
                  <div className="flex justify-between items-center z-10">
                    <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-black/30 backdrop-blur">
                      {manual.categoryLabel}
                    </span>
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-white/20">
                      ⏱️ {manual.duration}
                    </span>
                  </div>

                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="w-14 h-14 rounded-full bg-white/25 backdrop-blur-md border border-white/40 flex items-center justify-center group-hover:scale-110 group-hover:bg-white text-white group-hover:text-blue-600 transition-all shadow-xl">
                      <Play className="w-7 h-7 fill-current ml-1" />
                    </div>
                  </div>

                  <div className="z-10 text-[11px] text-slate-200 font-medium">
                    클릭 시 재생 & 상세 설명 보기
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="text-lg font-bold text-slate-900 line-clamp-2 mb-2 group-hover:text-blue-600 transition-colors">
                    {manual.title}
                  </h3>
                  <p className="text-slate-600 text-xs leading-relaxed line-clamp-2">
                    {manual.description}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-blue-600">
                <span>단계별 주요 설명 ({manual.steps.length}단계)</span>
                <span className="group-hover:translate-x-1 transition-transform">영상 재생 &rarr;</span>
              </div>
            </div>
          ))}
        </div>

      </div>

      {selectedManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-100 relative max-h-[90vh] flex flex-col">
            
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-blue-400">{selectedManual.categoryLabel}</span>
                <h3 className="text-lg font-bold text-white mt-0.5">{selectedManual.title}</h3>
              </div>
              <button 
                onClick={() => setSelectedManual(null)}
                className="p-2 rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black aspect-video relative flex items-center justify-center text-white">
              <div className="text-center p-6 space-y-3">
                <div className="w-16 h-16 rounded-full bg-blue-600/90 text-white flex items-center justify-center mx-auto shadow-xl animate-pulse">
                  <Play className="w-8 h-8 fill-current ml-1" />
                </div>
                <div className="text-sm font-bold">{selectedManual.title}</div>
                <div className="text-xs text-slate-400">
                  (공식 매뉴얼 고화질 동영상 가이드 재생중)
                </div>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              <div className="text-xs font-bold text-slate-400 tracking-wider">주요 순서 및 핵심 절차 요약</div>
              <div className="space-y-2.5">
                {selectedManual.steps.map((step, idx) => (
                  <div key={idx} className="flex items-start gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100 text-sm">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span className="text-slate-800 font-medium">{step}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <span className="text-xs text-slate-500 font-medium">아이패스케어 고객지원팀 1544-7984</span>
              <button 
                onClick={() => setSelectedManual(null)}
                className="btn-primary text-xs py-2.5 px-5"
              >
                확인 완료
              </button>
            </div>

          </div>
        </div>
      )}

    </section>
  );
};
