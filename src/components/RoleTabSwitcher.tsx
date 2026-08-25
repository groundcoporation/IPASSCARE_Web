import React, { useState } from 'react';
import { Users, Shield, Car, MapPin, BellRing, Wallet, Smartphone, LineChart, Sparkles, CheckCircle2 } from 'lucide-react';

interface RoleTabSwitcherProps {
  onOpenInquiry?: () => void;
}

export const RoleTabSwitcher: React.FC<RoleTabSwitcherProps> = () => {
  const [activeRole, setActiveRole] = useState<'parent' | 'admin' | 'driver'>('parent');

  return (
    <section id="roles" className="py-20 bg-slate-50 relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-3">
            <Users className="w-3.5 h-3.5" />
            <span>맞춤형 서비스 안내</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            누가 사용해도 쉽고 안전한<br />
            <span className="gradient-text">3대 맞춤형 가이드</span>
          </h2>
          <p className="text-slate-600 mt-3 text-base sm:text-lg">
            학부모, 학원장, 기사님까지 모두를 위한<br className="hidden sm:inline" /> 최고 수준의 편의 기능과 직관적인 인터페이스를 제공합니다.
          </p>
        </div>

        <div className="flex justify-center mb-12">
          <div className="inline-flex p-1.5 bg-white rounded-2xl shadow-md border border-slate-200/80 max-w-xl w-full">
            <button
              onClick={() => setActiveRole('parent')}
              className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
                activeRole === 'parent'
                  ? 'gradient-bg-primary text-white shadow-lg shadow-blue-500/25 scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>학부모용</span>
            </button>
            
            <button
              onClick={() => setActiveRole('admin')}
              className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
                activeRole === 'admin'
                  ? 'gradient-bg-primary text-white shadow-lg shadow-blue-500/25 scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>학원장용</span>
            </button>

            <button
              onClick={() => setActiveRole('driver')}
              className={`flex-1 py-3.5 px-4 rounded-xl font-bold text-sm sm:text-base transition-all flex items-center justify-center gap-2 ${
                activeRole === 'driver'
                  ? 'gradient-bg-primary text-white shadow-lg shadow-blue-500/25 scale-[1.02]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Car className="w-4 h-4" />
              <span>기사님용</span>
            </button>
          </div>
        </div>

        <div className="glass-card p-6 sm:p-10 lg:p-12 relative overflow-hidden">
          
          {activeRole === 'parent' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-300">
              
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-block px-3 py-1 rounded-md bg-blue-50 text-blue-600 font-bold text-xs">
                  학부모 (Parents)
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  "아이 등하원 걱정 끝, 셔틀 위치 확인부터 원비 결제까지 한 손에"
                </h3>
                <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                  바쁜 일상 속에서도 자녀의 학원 출발, 셔틀 탑승, 등원 완료 소식을<br className="hidden sm:inline" /> 카카오 알림톡과 실시간 지도로 빠르게 확인할 수 있습니다.
                </p>

                <div className="space-y-4 pt-2">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-blue-100 text-blue-600 font-bold shrink-0 mt-0.5">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">실시간 셔틀 GPS 트래킹 & 도착 사전 알림</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">차량의 현재 위치와 속도, 예상 도착 시간을 정류장 도착 전에 실시간으로 확인합니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 font-bold shrink-0 mt-0.5">
                      <BellRing className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">원터치 등하원 안심 알림톡</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">학원 입구 태블릿 키패드 출결 시 학부모 휴대전화로 즉시 등하원 알림을 전송합니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 font-bold shrink-0 mt-0.5">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">수강권 간편 결제 & 포인트 전환 혜택</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">모바일 원비를 앱에서 간편 수납하고, 적립된 포인트를 어플 결제 차감 및 제휴 쇼핑몰에서 활용합니다.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="font-bold text-sm text-slate-800">학부모 안심 대시보드</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-600 font-bold">김지후 학부모님</span>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-700">셔틀버스러닝 (1호차)</span>
                      <span className="text-emerald-600 font-bold">정상 운행 중</span>
                    </div>
                    <div className="text-xs text-slate-500">현재 위치: 현대아파트 102동 앞 정류장</div>
                    <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                      <div className="bg-blue-600 h-full w-[70%]" />
                    </div>
                    <div className="text-[11px] text-right font-bold text-blue-600">도착 예정: 2분 후</div>
                  </div>

                  <div className="bg-emerald-50/80 p-4 rounded-2xl border border-emerald-100 space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-emerald-800">
                      <span>오늘의 출결 상태</span>
                      <span className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">출석 완료</span>
                    </div>
                    <div className="text-xs text-emerald-700 pt-1">
                      15:30 정성을 다하는 아카데미 등원 처리되었습니다.
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-2xl shadow-sm flex items-center justify-between">
                    <div>
                      <div className="text-[11px] text-blue-100">보유 마일리지</div>
                      <div className="text-lg font-black text-white">24,500 P</div>
                    </div>
                    <span className="bg-white/20 text-white text-xs font-bold px-3 py-1.5 rounded-xl hover:bg-white/30 cursor-pointer">
                      앱 내 전환
                    </span>
                  </div>

                </div>
              </div>

            </div>
          )}

          {activeRole === 'admin' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-300">
              
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-block px-3 py-1 rounded-md bg-indigo-50 text-indigo-600 font-bold text-xs">
                  학원장 / 관리자 (Directors)
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  "학원 행정 업무 시간 단축, 미납 원비 자동 회수로 수납율 급증"
                </h3>
                <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                  원생 출결 관리, 미납 청구서 일괄 발행, 셔틀 노선 지정 및 정산까지<br className="hidden sm:inline" /> 학원 운영에 필요한 모든 기능을 하나의 통합 관리자 대시보드에서 처리하세요.
                </p>

                <div className="space-y-4 pt-2">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-indigo-100 text-indigo-600 font-bold shrink-0 mt-0.5">
                      <LineChart className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">원비 청구서 스마트 일괄 발행 & 수납 연동</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">매월 이용권 청구서를 원클릭으로 학부모 어플에 일괄 발송하여 편리한 수납을 진행합니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-blue-100 text-blue-600 font-bold shrink-0 mt-0.5">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">수강권 & 셔틀권 개별 독립 관리</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">학원 수업 수강권과 셔틀 전용 이용권이 원생 계정에 각각 독립적으로 안전하게 발급 및 차감 관리됩니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-amber-100 text-amber-600 font-bold shrink-0 mt-0.5">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">지인 추천 포인트 리워드 솔루션</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">기존 학부모가 학원을 지인에게 추천 시 포인트 적립 혜택이 부여되어 신규 수강생 유입을 지속 유도합니다.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full max-w-sm bg-slate-900 text-white rounded-3xl p-6 shadow-xl space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="font-bold text-sm text-slate-200">학원 통합 관리 시스템</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-blue-500 text-white font-bold">ADMIN</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700">
                      <div className="text-[10px] text-slate-400">이번 달 원비 수납율</div>
                      <div className="text-xl font-extrabold text-blue-400 mt-1">94.8 %</div>
                    </div>
                    <div className="bg-slate-800 p-3 rounded-2xl border border-slate-700">
                      <div className="text-[10px] text-slate-400">오늘 재원생 출석율</div>
                      <div className="text-xl font-extrabold text-emerald-400 mt-1">98.2 %</div>
                    </div>
                  </div>

                  <div className="bg-slate-800/90 p-3.5 rounded-2xl border border-slate-700 space-y-2">
                    <div className="flex justify-between text-xs font-bold text-slate-200">
                      <span>이용권 청구서 일괄발행 (8월분)</span>
                      <span className="text-blue-400 text-[10px]">128건 발송준비</span>
                    </div>
                    <div className="w-full bg-blue-600 text-white py-2 rounded-xl text-center font-bold text-xs hover:bg-blue-500 cursor-pointer shadow-lg shadow-blue-500/20">
                      어플 내 이용권 청구서 일괄 발송 (1 클릭)
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

          {activeRole === 'driver' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center animate-in fade-in duration-300">
              
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-block px-3 py-1 rounded-md bg-emerald-50 text-emerald-600 font-bold text-xs">
                  셔틀 기사님 (Drivers)
                </div>
                <h3 className="text-2xl sm:text-3xl font-bold text-slate-900">
                  "버튼 한 번으로 운행 시작, 탑승 체크부터 복잡한 동선 관리까지 쉽게"
                </h3>
                <p className="text-slate-600 text-sm sm:text-base leading-relaxed">
                  운행 중 복잡한 휴대전화 조작 없이,<br className="hidden sm:inline" /> 정류장별 탑승 예정 학생을 확인하고 안전하게 승하차를 처리할 수 있습니다.
                </p>

                <div className="space-y-4 pt-2">
                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-emerald-100 text-emerald-600 font-bold shrink-0 mt-0.5">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">원터치 운행 시작 & 노선 가이드</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">앱 실행 후 버튼 한 번만 터치하면 실시간 위치 수신이 시작되어 학부모 지도로 연동됩니다.</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3.5">
                    <div className="p-2 rounded-xl bg-blue-100 text-blue-600 font-bold shrink-0 mt-0.5">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-base">정류장별 탑승/하차 원생 체크</h4>
                      <p className="text-slate-500 text-xs sm:text-sm">정류장 도착 시 미탑승 학생을 바로 확인하고 수동 클릭 또는 NFC로 즉각 승하차 기록 완료.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-5 flex justify-center">
                <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <span className="font-bold text-sm text-slate-800">기사님 전용 대시보드</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">1호차 기사님</span>
                  </div>

                  <div className="bg-emerald-600 text-white p-4 rounded-2xl text-center space-y-1">
                    <div className="text-xs text-emerald-100">현재 운행 상태</div>
                    <div className="text-lg font-black">셔틀 운행 중 (노선 A)</div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-xs font-bold text-slate-700">다음 정류장 탑승 원생 (3명)</div>
                    <div className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between text-xs border border-slate-200/60">
                      <span>김지후 (래미안 101동)</span>
                      <button className="px-2.5 py-1 bg-emerald-500 text-white rounded-md font-bold text-[10px]">
                        탑승 체크
                      </button>
                    </div>
                    <div className="bg-slate-50 p-2.5 rounded-xl flex items-center justify-between text-xs border border-slate-200/60">
                      <span>박민서 (래미안 102동)</span>
                      <button className="px-2.5 py-1 bg-emerald-500 text-white rounded-md font-bold text-[10px]">
                        탑승 체크
                      </button>
                    </div>
                  </div>

                </div>
              </div>

            </div>
          )}

        </div>

      </div>
    </section>
  );
};
