import React, { useState, useEffect } from 'react';
import { Play, Video, X, Lock, KeyRound } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface VideoManual {
  id: string;
  category: 'parent' | 'admin' | 'driver';
  categoryLabel: string;
  title: string;
  duration: string;
  description: string;
  steps: string[];
  thumbnailBg: string;
  youtubeUrl?: string;
  youtubeId?: string;
  isRestricted?: boolean;
  accessLevel?: 'public' | 'staff';
}

interface VideoManualCenterProps {
  userProfile?: { name?: string | null; role?: string } | null;
  onOpenLogin?: () => void;
}

function extractYoutubeId(url?: string): string | null {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : null;
}

const STATIC_MANUAL_DATA: VideoManual[] = [
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
    thumbnailBg: 'from-blue-600 to-indigo-700',
    youtubeId: 'dQw4w9WgXcQ'
  },
  {
    id: 'm2',
    category: 'parent',
    categoryLabel: '학부모 매뉴얼',
    title: '모바일 원비 청구서 조회 및 원스톱 간편 결제',
    duration: '1분 40초',
    description: '학원에서 발송한 청구서를 앱에서 확인하고 신용카드 및 모바일 뱅킹으로 안전하게 결제하는 방법입니다.',
    steps: [
      '앱 하단 [이용권/결제] 탭 클릭',
      '미납 청구서의 [즉시 수납하기] 버튼 터치',
      '모바일 결제창에서 원하는 결제 수단 선택 후 결제 완료'
    ],
    thumbnailBg: 'from-indigo-600 to-purple-700',
    youtubeId: 'dQw4w9WgXcQ'
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
    thumbnailBg: 'from-emerald-600 to-teal-700',
    youtubeId: 'dQw4w9WgXcQ'
  },
  {
    id: 'm4',
    category: 'admin',
    categoryLabel: '학원장 매뉴얼',
    title: '학원 원생 등록 및 이용권 청구서 어플 일괄 발송',
    duration: '3분 10초',
    description: '관리자 대시보드에서 신규 원생을 등록하고 수강 청구서를 어플로 일괄 발송하여 정산 수납을 진행합니다.',
    steps: [
      '관리자 대시보드 > [청구/정산] 메뉴 이동',
      '이번 달 발송 대상 수강생 선택 후 [청구서 작성]',
      '[어플 내 이용권 청구서 일괄 발송] 버튼 클릭 시 학부모 전송'
    ],
    thumbnailBg: 'from-slate-800 to-slate-950',
    youtubeId: 'dQw4w9WgXcQ'
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
    thumbnailBg: 'from-blue-700 to-slate-900',
    youtubeId: 'dQw4w9WgXcQ'
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
    thumbnailBg: 'from-amber-600 to-orange-700',
    youtubeId: 'dQw4w9WgXcQ'
  }
];

export const VideoManualCenter: React.FC<VideoManualCenterProps> = ({ userProfile, onOpenLogin }) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'parent' | 'admin' | 'driver'>('all');
  const [selectedManual, setSelectedManual] = useState<VideoManual | null>(null);
  const [restrictedNoticeManual, setRestrictedNoticeManual] = useState<VideoManual | null>(null);
  const [manualsList, setManualsList] = useState<VideoManual[]>(STATIC_MANUAL_DATA);

  const isStaffUser = userProfile && ['admin', 'coach'].includes(userProfile.role || '');

  // Fetch registered dynamic videos from Supabase DB
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('web_manual_videos').select('*').eq('is_visible', true).order('created_at', { ascending: false });
        if (data && data.length > 0) {
          const dbManuals: VideoManual[] = data.map((item: any) => ({
            id: item.id,
            category: item.category,
            categoryLabel: item.category_label || (item.category === 'parent' ? '학부모 매뉴얼' : item.category === 'admin' ? '학원장 매뉴얼' : '기사님 매뉴얼'),
            title: item.title,
            duration: item.duration || '유튜브 가이드',
            description: item.description,
            steps: (() => {
              if (Array.isArray(item.steps)) return item.steps;
              if (typeof item.steps === 'string') {
                try {
                  const parsed = JSON.parse(item.steps);
                  if (Array.isArray(parsed)) return parsed;
                } catch {}
                return item.steps.split('\n').map((s: string) => s.trim()).filter(Boolean);
              }
              return ['동영상 설명 참고'];
            })(),
            thumbnailBg: item.thumbnail_bg || 'from-blue-600 to-indigo-700',
            youtubeUrl: item.youtube_url,
            youtubeId: item.youtube_id || extractYoutubeId(item.youtube_url) || undefined,
            isRestricted: item.is_restricted || item.access_level === 'staff',
            accessLevel: item.access_level || (item.is_restricted ? 'staff' : 'public')
          }));
          // When dynamic DB videos exist, replace sample videos with DB registered videos!
          setManualsList(dbManuals);
        }
      } catch (err) {
        console.warn('Manual videos fetch fallback to static', err);
      }
    })();
  }, []);

  // Lock background body scroll when video modal is open
  useEffect(() => {
    if (selectedManual || restrictedNoticeManual) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedManual, restrictedNoticeManual]);

  const filteredManuals = activeCategory === 'all' 
    ? manualsList 
    : manualsList.filter(m => m.category === activeCategory);

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
            전체 보기 ({manualsList.length})
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
          {filteredManuals.map((manual) => {
            const ytId = manual.youtubeId || extractYoutubeId(manual.youtubeUrl);
            const isLocked = manual.isRestricted && !isStaffUser;

            return (
              <div 
                key={manual.id}
                className="glass-card overflow-hidden flex flex-col justify-between group cursor-pointer relative"
                onClick={() => {
                  if (isLocked) {
                    setRestrictedNoticeManual(manual);
                  } else {
                    setSelectedManual(manual);
                  }
                }}
              >
                <div>
                  <div className={`relative h-48 bg-gradient-to-br ${manual.thumbnailBg} p-6 flex flex-col justify-between text-white overflow-hidden`}>
                    
                    {/* Render Real YouTube Thumbnail Image if YouTube ID exists */}
                    {ytId && (
                      <img 
                        src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`} 
                        alt={manual.title}
                        className="absolute inset-0 w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                      />
                    )}

                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" />

                    <div className="flex justify-between items-center z-10">
                      <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-black/40 backdrop-blur">
                        {manual.categoryLabel}
                      </span>

                      {/* Lock Badge if Restricted & User is Not Staff */}
                      {isLocked ? (
                        <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-md bg-amber-500/90 text-white backdrop-blur flex items-center gap-1 shadow-md">
                          <Lock className="w-3 h-3" /> 코치/관리자 전용
                        </span>
                      ) : (
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-black/50 backdrop-blur">
                          ⏱️ {manual.duration}
                        </span>
                      )}
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center z-10">
                      {isLocked ? (
                        <div className="w-14 h-14 rounded-full bg-amber-500 text-white flex items-center justify-center group-hover:scale-110 transition-all shadow-2xl">
                          <Lock className="w-7 h-7" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-red-600 text-white flex items-center justify-center group-hover:scale-110 transition-all shadow-2xl">
                          <Play className="w-7 h-7 fill-current ml-1" />
                        </div>
                      )}
                    </div>

                    <div className="z-10 text-[11px] text-slate-100 font-bold drop-shadow">
                      {isLocked ? '🔒 관리자 로그인 후 시청 가능' : '클릭 시 영상 재생 & 상세 가이드 보기'}
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

                <div className={`px-6 py-4 border-t flex items-center justify-between text-xs font-bold ${isLocked ? 'bg-amber-50/70 border-amber-100 text-amber-700' : 'bg-slate-50 border-slate-100 text-blue-600'}`}>
                  <span>{isLocked ? '🔒 코치/관리자 권한 가이드' : `단계별 주요 설명 (${manual.steps.length}단계)`}</span>
                  <span className="group-hover:translate-x-1 transition-transform">{isLocked ? '로그인 필요 🔒' : '영상 재생 \u2192'}</span>
                </div>
              </div>
            );
          })}
        </div>

      </div>

      {selectedManual && (() => {
        const ytId = selectedManual.youtubeId || extractYoutubeId(selectedManual.youtubeUrl);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-200" onClick={() => setSelectedManual(null)}>
            <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-100 relative max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              
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

              {/* Real YouTube Embed Video Player inside website Modal */}
              <div className="bg-black aspect-video relative flex items-center justify-center text-white">
                {ytId ? (
                  <iframe
                    src={`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1`}
                    title={selectedManual.title}
                    className="w-full h-full border-0"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <div className="text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-full bg-blue-600/90 text-white flex items-center justify-center mx-auto shadow-xl animate-pulse">
                      <Play className="w-8 h-8 fill-current ml-1" />
                    </div>
                    <div className="text-sm font-bold">{selectedManual.title}</div>
                    <div className="text-xs text-slate-400">
                      (공식 매뉴얼 고화질 동영상 가이드 재생중)
                    </div>
                  </div>
                )}
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
        );
      })()}

      {/* Restricted Permission Notice Modal */}
      {restrictedNoticeManual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 text-center space-y-5 relative">
            <button 
              onClick={() => setRestrictedNoticeManual(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-2"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto shadow-md">
              <Lock className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <div className="inline-block px-3 py-1 rounded-full bg-amber-50 text-amber-700 text-xs font-bold border border-amber-200">
                코치 / 관리자 전용 가이드
              </div>
              <h3 className="text-xl font-extrabold text-slate-900">
                권한 제한 동영상 매뉴얼입니다
              </h3>
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed pt-1">
                <strong>[{restrictedNoticeManual.title}]</strong> 영상은 학원 세팅 및 지점 전용 관리자 가이드입니다.<br />
                코치/관리자 계정으로 로그인 후 시청하실 수 있습니다.
              </p>
            </div>

            <div className="pt-2 flex flex-col gap-2">
              {onOpenLogin && (
                <button
                  onClick={() => {
                    setRestrictedNoticeManual(null);
                    onOpenLogin();
                  }}
                  className="btn-primary w-full justify-center text-sm py-3 shadow-lg"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>🔑 관리자 계정으로 로그인하기</span>
                </button>
              )}
              <button
                onClick={() => setRestrictedNoticeManual(null)}
                className="text-xs font-bold text-slate-500 hover:text-slate-800 py-2"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};
