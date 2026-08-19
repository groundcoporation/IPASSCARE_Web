import { useState } from 'react';
import {
  ArrowLeft,
  Bell,
  Bus,
  CalendarClock,
  ChevronRight,
  CircleUserRound,
  Images,
  ShoppingBag,
  TicketCheck,
  TicketPlus,
  UserPlus,
  BadgeCheck,
  CheckCircle2,
  MapPin,
  ShoppingCart,
  X,
} from 'lucide-react';

type MockupScreen = 'home' | 'pickup' | 'realtime' | 'attendance' | 'purchase' | 'passes';

const quickMenus = [
  { label: '수업 시간표', icon: CalendarClock, color: '#FF4B4B', bg: '#FFF0F0', screen: 'home' as const },
  { label: '이용권 구매', icon: TicketPlus, color: '#FF9F43', bg: '#FFF5EA', screen: 'purchase' as const },
  { label: '이용권 확인', icon: TicketCheck, color: '#EAB308', bg: '#FFFBE6', screen: 'passes' as const },
  { label: '쇼핑몰', icon: ShoppingBag, color: '#6BCB77', bg: '#EFFAF1' },
  { label: '갤러리', icon: Images, color: '#4D96FF', bg: '#EEF5FF' },
  { label: '픽업', icon: Bus, color: '#3D56B2', bg: '#F0F2FB', screen: 'pickup' as const },
  { label: '출석확인', icon: BadgeCheck, color: '#917FB3', bg: '#F6F1FA', screen: 'attendance' as const },
  { label: '추천하기', icon: UserPlus, color: '#FF2D55', bg: '#FFF0F3' },
];

export function AppHomeMockup() {
  const [screen, setScreen] = useState<MockupScreen>('home');

  return (
    <div className="phone-mockup-container relative z-10" aria-label="아이패스케어 실제 앱 홈 화면 미리보기">
      <div className="phone-mockup">
        <div className="phone-notch" />

        <div className="phone-screen bg-white text-slate-900">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 pb-3 pt-8">
            {screen === 'home' ? (
              <span className="text-[18px] font-black tracking-[-0.06em] text-[#111827]">
                IPASS<span className="text-[#4F46E5]">CARE</span>
              </span>
            ) : (
              <button type="button" onClick={() => setScreen('home')} className="flex items-center gap-2 text-[13px] font-extrabold text-slate-900">
                {screen === 'purchase' ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                {screen === 'pickup' ? '셔틀 관제' : screen === 'realtime' ? '실시간 셔틀 위치' : screen === 'attendance' ? '출석 및 동선 확인' : screen === 'purchase' ? '시흥본점 이용권' : '내 이용권 확인'}
              </button>
            )}
            {screen === 'home' ? (
            <div className="flex items-center gap-2.5">
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-slate-50">
                <Bell className="h-4 w-4 text-slate-800" />
                <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-red-500" />
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-50">
                <CircleUserRound className="h-[18px] w-[18px] text-slate-800" />
              </span>
            </div>
            ) : screen === 'passes' ? (
              <button type="button" onClick={() => setScreen('purchase')} className="text-[10px] font-extrabold text-[#4F46E5]">이용권 구매</button>
            ) : <span className="w-4" />}
          </div>

          {screen === 'home' ? (
          <div className="flex-1 overflow-hidden px-5 py-5">
            <div className="mb-5">
              <h3 className="text-[21px] font-black tracking-tight text-[#111827]">김지후 학부모님</h3>
              <p className="mt-0.5 text-[12px] font-medium text-slate-400">오늘의 일정을 확인하세요.</p>
            </div>

            <div className="relative h-[132px] overflow-hidden rounded-2xl bg-gradient-to-br from-[#eaf4ff] via-[#dbeafe] to-[#c7d2fe] shadow-sm">
              <div className="absolute -right-6 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-white/40" />
              <div className="absolute right-7 top-8 flex h-14 w-14 items-center justify-center rounded-full bg-white/80 shadow-md">
                <Bus className="h-8 w-8 text-[#3D56B2]" />
              </div>
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white/95 to-white/35 p-4 pt-8">
                <span className="inline-flex rounded bg-[#3D56B2] px-2 py-1 text-[8px] font-extrabold tracking-wide text-white">
                  학원 가는 셔틀에 탑승했어요 🚌
                </span>
                <div className="mt-1 text-[17px] font-black tracking-tight text-[#111827]">08.19 WED 15:30</div>
                <div className="text-[11px] font-bold text-slate-700">축구 초등부 | 김지후 학생</div>
                <div className="mt-0.5 text-[9px] font-medium text-slate-500">시흥본점</div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-2xl border border-indigo-100 bg-indigo-50 px-3.5 py-3">
              <div className="min-w-0">
                <span className="rounded bg-indigo-500 px-1.5 py-0.5 text-[7px] font-black text-white">EVENT</span>
                <div className="mt-1 text-[10.5px] font-extrabold text-slate-800">매일 출석체크 하고 포인트 받기</div>
                <div className="mt-0.5 truncate text-[8px] font-medium text-slate-500">'아이패스케어' 한글을 한 자씩 모아보세요!</div>
              </div>
              <div className="ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm">📅</div>
            </div>

            <div className="mt-5 grid grid-cols-4 gap-x-1 gap-y-4">
              {quickMenus.map(({ label, icon: Icon, color, bg, ...menu }) => (
                <button
                  type="button"
                  key={label}
                  onClick={() => menu.screen && setScreen(menu.screen)}
                  className={`flex min-w-0 flex-col items-center ${menu.screen ? 'cursor-pointer transition-transform hover:scale-105 active:scale-95' : 'cursor-default'}`}
                  aria-label={`${label} 화면 보기`}
                >
                  <div className="flex h-11 w-11 items-center justify-center rounded-[15px]" style={{ backgroundColor: bg }}>
                    <Icon className="h-[21px] w-[21px]" style={{ color }} strokeWidth={2} />
                  </div>
                  <span className="mt-1.5 whitespace-nowrap text-[8.5px] font-extrabold tracking-tight" style={{ color }}>
                    {label}
                  </span>
                </button>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
              <div>
                <div className="text-[10px] font-extrabold text-slate-800">공지사항</div>
                <div className="mt-0.5 text-[8px] text-slate-400">아이패스케어 새로운 소식을 확인하세요.</div>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            </div>
          </div>
          ) : screen === 'pickup' ? (
            <div className="flex-1 bg-[#F8FAFC] px-4 py-4">
              <div className="mb-3 flex items-start rounded-[14px] border border-[#E0E7FF] bg-[#EEF2FF] p-3">
                <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#4F46E5]" />
                <div className="ml-2"><div className="text-[9px] font-extrabold text-[#3730A3]">관리자가 지정한 승하차 위치입니다</div><div className="mt-1 text-[7.5px] leading-relaxed text-[#6366F1]">위치 변경이 필요하면 운행 시작 전에 관리자에게 문의해 주세요.</div></div>
              </div>
              <div className="rounded-[18px] border border-indigo-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-500" /><span className="text-[9px] font-extrabold text-slate-600">실시간 운행 중</span></div>
                <div className="mt-2 text-[15px] font-black text-[#111827]">셔틀버스가 이동 중입니다</div>
                <button type="button" onClick={() => setScreen('realtime')} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#6366F1] py-3 text-[10px] font-extrabold text-white shadow-sm">실시간 위치 확인하기 <MapPin className="h-4 w-4" /></button>
              </div>
              <div className="mb-2 mt-5 text-[11px] font-black text-[#111827]">자녀별 승하차 정보</div>
              <div className="rounded-[18px] bg-white p-4 shadow-sm">
                <div className="mb-3 text-[13px] font-black text-[#111827]">김지후</div>
                <div className="flex items-start gap-3"><Bus className="h-4 w-4 shrink-0 text-[#6366F1]" /><div><div className="text-[8px] font-bold text-slate-400">등원 승차</div><div className="mt-0.5 text-[9px] font-bold text-slate-700">래미안 101동 정류장 · 정문 앞</div></div></div>
                <div className="mt-4 flex items-start gap-3"><MapPin className="h-4 w-4 shrink-0 text-[#10B981]" /><div><div className="text-[8px] font-bold text-slate-400">하원 하차</div><div className="mt-0.5 text-[9px] font-bold text-slate-700">래미안 101동 정류장 · 정문 앞</div></div></div>
              </div>
            </div>
          ) : screen === 'realtime' ? (
            <div className="relative flex-1 overflow-hidden bg-[#eaf4ff]">
                <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#93c5fd_1px,transparent_1px)] [background-size:13px_13px]" />
                <div className="absolute left-0 top-1/2 h-3 w-full -translate-y-1/2 rotate-[-10deg] bg-white shadow-sm" />
                <div className="absolute left-1/3 top-0 h-full w-3 rotate-[8deg] bg-white shadow-sm" />
                <div className="absolute left-[48%] top-[42%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-[#3D56B2] shadow-xl"><Bus className="h-6 w-6 text-white" /></span>
                  <span className="mt-1 rounded-full bg-slate-900 px-2 py-1 text-[8px] font-bold text-white">차량 위치</span>
                </div>
                <div className="absolute left-3 right-3 top-3 rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur">
                  <div className="text-[10px] font-black text-slate-900">축구 초등부 셔틀 (운행중)</div><div className="mt-1 flex items-center gap-1 text-[8px] font-bold text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 실시간 위치 갱신</div>
                </div>
                <div className="absolute bottom-4 left-3 right-3 rounded-xl bg-white/95 p-3 shadow-lg backdrop-blur">
                  <div className="flex items-center gap-2 text-[10px] font-extrabold text-slate-900"><MapPin className="h-4 w-4 text-[#6366F1]" /> 김지후 · 래미안 101동 정류장</div>
                  <div className="mt-1 text-[8px] text-slate-500">셔틀버스가 이동 중입니다</div>
                </div>
            </div>
          ) : screen === 'purchase' ? (
            <div className="relative flex-1 overflow-hidden bg-[#F8FAFC]">
              <div className="flex gap-5 overflow-hidden border-b border-slate-100 bg-white px-4 py-3">
                {['정규 수업', '방학 특강', '셔틀 GPS'].map((category, index) => <button type="button" key={category} className={`shrink-0 text-[9px] font-extrabold ${index === 0 ? 'text-[#4F46E5]' : 'text-slate-400'}`}>{category}</button>)}
              </div>
              <div className="p-4 pb-20">
                <div className="mb-3 rounded-2xl bg-gradient-to-r from-[#EEF2FF] to-[#E0E7FF] p-3">
                  <div className="text-[8px] font-black text-[#4F46E5]">IPASSCARE MEMBERSHIP</div>
                  <div className="mt-1 text-[12px] font-black text-[#1E293B]">아이의 성장을 위한 맞춤 이용권</div>
                  <div className="mt-1 text-[7.5px] text-slate-500">원하는 횟수를 선택하고 장바구니에 담아주세요.</div>
                </div>
                <div className="rounded-2xl border-2 border-[#6366F1] bg-white p-4 shadow-sm">
                  <div className="text-[13px] font-extrabold text-[#1E293B]">축구 정규 수업 이용권</div>
                  <div className="mt-1 text-[8px] text-slate-400">주 2회 정규 클래스 수강권</div>
                  <div className="mt-4 flex gap-2"><span className="rounded-full bg-[#6366F1] px-3 py-1.5 text-[8px] font-extrabold text-white">8회</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[8px] font-bold text-slate-500">12회</span><span className="rounded-full bg-slate-100 px-3 py-1.5 text-[8px] font-bold text-slate-500">16회</span></div>
                  <div className="mt-4 flex items-center justify-between"><span className="text-[18px] font-black text-[#111827]">180,000원</span><button type="button" className="rounded-xl bg-[#4F46E5] px-3 py-2 text-[8px] font-extrabold text-white">장바구니 담기</button></div>
                </div>
                <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm"><div className="text-[13px] font-extrabold text-[#1E293B]">주말 집중 클래스</div><div className="mt-1 text-[8px] text-slate-400">토요일 집중 훈련 프로그램</div><div className="mt-4 flex items-center justify-between"><span className="text-[16px] font-black text-[#111827]">120,000원</span><button type="button" className="rounded-xl bg-[#4F46E5] px-3 py-2 text-[8px] font-extrabold text-white">장바구니 담기</button></div></div>
                <div className="mt-4 rounded-xl bg-slate-100 p-3"><div className="text-[9px] font-extrabold text-slate-700">📌 꼭 확인해주세요!</div><div className="mt-2 text-[7px] leading-relaxed text-slate-500">• 다자녀의 경우 자녀 수만큼 이용권을 각각 구매해 주세요.<br />• 카드사 할인 및 할부는 결제창에서 확인 가능합니다.</div></div>
              </div>
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between border-t border-slate-200 bg-white px-4 py-3 shadow-[0_-6px_16px_rgba(15,23,42,0.08)]"><div className="flex items-center gap-2"><ShoppingCart className="h-4 w-4 text-slate-400" /><span className="text-[9px] font-extrabold text-slate-500">상품을 선택해주세요</span></div><span className="rounded-xl bg-slate-200 px-3 py-2 text-[8px] font-extrabold text-slate-400">주문서 확인</span></div>
            </div>
          ) : screen === 'attendance' ? (
            <div className="flex-1 bg-white">
              <div className="flex items-center justify-between bg-[#F8FAFC] px-3 py-2.5">
                <button type="button" className="px-2 text-lg font-bold text-[#6366F1]">‹</button>
                <div className="flex items-center rounded-full bg-white px-3 py-2 shadow-sm"><CalendarClock className="mr-1.5 h-3.5 w-3.5 text-[#6366F1]" /><span className="text-[10px] font-extrabold text-[#1E293B]">2026년 8월 19일 (수)</span><span className="ml-1 text-[8px] text-slate-400">▼</span></div>
                <button type="button" className="px-2 text-lg font-bold text-[#6366F1]">›</button>
              </div>
              <div className="flex border-b border-slate-100 px-5 py-3"><span className="rounded-full bg-[#111827] px-4 py-2 text-[9px] font-extrabold text-white">김지후</span></div>
              <div className="px-6 py-6">
                {[['오후 3:12', '셔틀버스 승차', Bus], ['오후 3:30', '센터 등원', CheckCircle2], ['오후 5:05', '센터 하원', BadgeCheck], ['오후 5:22', '셔틀버스 하차', MapPin]].map(([time, label, Icon], index) => {
                  const TimelineIcon = Icon as typeof Bus;
                  return <div key={label as string} className="relative flex min-h-[72px]"><div className="mr-4 flex flex-col items-center"><span className="relative z-10 flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF2FF]"><TimelineIcon className="h-4 w-4 text-[#6366F1]" /></span>{index < 3 && <span className="absolute left-[17px] top-9 h-[44px] w-0.5 bg-slate-200" />}</div><div className="pt-1"><div className="text-[8px] font-bold text-slate-400">{time as string}</div><div className="mt-1 text-[12px] font-extrabold text-[#1E293B]">{label as string}</div></div></div>;
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 bg-[#F8FAFC]">
              <div className="flex border-b border-slate-100 bg-white">
                {['사용가능', '사용완료', '기한만료'].map((tab, index) => <button type="button" key={tab} className={`flex-1 py-3 text-[9px] font-extrabold ${index === 0 ? 'border-b-[3px] border-[#4F46E5] text-[#4F46E5]' : 'text-slate-400'}`}>{tab}</button>)}
              </div>
              <div className="p-4">
                <div className="rounded-[20px] bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between"><span className="rounded-lg bg-[#EEF2FF] px-2.5 py-1 text-[8px] font-extrabold text-[#4F46E5]">김지후</span><span className="text-[12px] font-black text-[#111827]">12 / 16회</span></div>
                  <div className="mt-3 text-[13px] font-extrabold text-[#334155]">2026년 8월 정규 수강권</div>
                  <div className="mt-4 flex rounded-xl bg-slate-50 py-3"><div className="flex-1 text-center"><div className="text-[8px] font-bold text-slate-400">예정된 수업</div><div className="mt-1 text-[15px] font-black text-slate-800">2<span className="text-[8px]">회</span></div></div><div className="w-px bg-slate-200" /><div className="flex-1 text-center"><div className="text-[8px] font-bold text-slate-400">예약 가능</div><div className="mt-1 text-[15px] font-black text-slate-800">10<span className="text-[8px]">회</span></div></div></div>
                  <div className="mt-3 flex items-start gap-1.5 text-[7.5px] leading-relaxed text-slate-500"><span className="text-[#64748B]">ⓘ</span><span>이용권은 예약할 때 확보되며, 실제 등원 처리 시 1회 차감됩니다.</span></div>
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3"><span className="text-[7.5px] text-slate-400">이용 기간: 2026.08.01 ~ 2026.08.31</span><span className="rounded-lg bg-[#4F46E5] px-2.5 py-1.5 text-[8px] font-extrabold text-white">예약 일정</span></div>
                </div>
                <div className="mt-3 rounded-[20px] bg-white p-4 shadow-sm"><div className="flex items-center justify-between"><span className="rounded-lg bg-[#EEF2FF] px-2.5 py-1 text-[8px] font-extrabold text-[#4F46E5]">김지후</span><span className="text-[11px] font-black text-[#111827]">12일 남음</span></div><div className="mt-3 text-[13px] font-extrabold text-[#334155]">셔틀 GPS 정기권 (셔틀)</div><div className="mt-5 border-t border-slate-100 pt-3 text-[7.5px] text-slate-400">이용 기간: 2026.08.01 ~ 2026.08.31</div></div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
