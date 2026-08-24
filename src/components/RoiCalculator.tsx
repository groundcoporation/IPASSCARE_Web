import React, { useState, useEffect } from 'react';
import { Calculator, ArrowRight, DollarSign, Clock, ShieldCheck, Sparkles, X, HelpCircle } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface RoiCalculatorProps {
  onOpenInquiry: () => void;
}

export const RoiCalculator: React.FC<RoiCalculatorProps> = ({ onOpenInquiry }) => {
  const [students, setStudents] = useState<number>(80);
  const [shuttles, setShuttles] = useState<number>(2);
  const [avgTuition, setAvgTuition] = useState<number>(180000);
  const [selectedPlan, setSelectedPlan] = useState<'lite' | 'pro'>('pro');
  const [showFormulaGuide, setShowFormulaGuide] = useState<boolean>(false);

  // DB dynamic price settings
  const [litePrice, setLitePrice] = useState<number>(99000);
  const [proPrice, setProPrice] = useState<number>(118000);

  // Fetch pricing from Supabase DB (web_settings)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from('web_settings')
          .select('lite_monthly_price, pro_monthly_price')
          .eq('id', 'default')
          .single();

        if (data && !error) {
          if (data.lite_monthly_price) setLitePrice(Number(data.lite_monthly_price));
          if (data.pro_monthly_price) setProPrice(Number(data.pro_monthly_price));
        }
      } catch (err) {
        console.warn('Supabase web_settings load fallback to defaults', err);
      }
    };
    fetchSettings();
  }, []);

  // Lock background body scroll when modal is open
  useEffect(() => {
    if (showFormulaGuide) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showFormulaGuide]);

  // ROI Calculations
  const monthlyPackageCost = selectedPlan === 'lite' ? litePrice : proPrice;
  const savedAdminHours = Math.round((students * 0.45) + (shuttles * 12));
  const savedAdminCost = Math.round(savedAdminHours * 12000); // 12,000 KRW hourly wage equivalent
  const recoveredUnpaidTuition = Math.round(students * avgTuition * 0.05); // 5% unpaid recovery rate
  
  const totalMonthlyBenefit = savedAdminCost + recoveredUnpaidTuition;
  const netMonthlyProfit = totalMonthlyBenefit - monthlyPackageCost;
  const netAnnualProfit = netMonthlyProfit * 12;

  return (
    <section id="calculator" className="py-24 bg-gradient-to-b from-slate-50 via-blue-50/40 to-white relative overflow-hidden">
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-blue-100/90 border border-blue-200 text-blue-700 text-xs sm:text-sm font-extrabold mb-3">
            <Calculator className="w-4 h-4 text-blue-600" />
            <span>실시간 정교 시뮬레이터</span>
          </div>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-slate-900 tracking-tight">
            우리 학원이 얻게 되는<br />
            <span className="gradient-text">기대 절감 효과 시뮬레이션</span>
          </h2>
          <p className="text-slate-600 mt-3 text-base sm:text-lg">
            Lite (월 99,000원) / Pro (월 118,000원) 요금제와 학원 규모를 선택하시면,<br className="hidden sm:inline" /> 절감되는 행정 시간과 수납 회수액을 실시간 계산해 드립니다.
          </p>
        </div>

        {/* 2-Column Grid Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* Left Inputs Card */}
          <div className="lg:col-span-6 glass-card p-6 sm:p-8 flex flex-col justify-between space-y-6">
            
            {/* Plan Selection Tabs */}
            <div>
              <label className="block text-sm font-black text-slate-900 mb-2.5">
                1. 패키지 요금제 선택
              </label>
              <div className="grid grid-cols-2 gap-3 p-1.5 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setSelectedPlan('lite')}
                  className={`py-3 px-4 rounded-xl font-extrabold text-xs sm:text-sm transition-all flex flex-col items-center gap-0.5 ${
                    selectedPlan === 'lite'
                      ? 'bg-white text-blue-600 shadow-md border border-blue-200 scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="font-black text-sm">Lite (라이트)</span>
                  <span className="text-[11px] font-extrabold text-slate-500">월 {litePrice.toLocaleString()}원</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedPlan('pro')}
                  className={`py-3 px-4 rounded-xl font-extrabold text-xs sm:text-sm transition-all flex flex-col items-center gap-0.5 relative ${
                    selectedPlan === 'pro'
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20 scale-[1.02]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <span className="absolute -top-2.5 bg-amber-400 text-slate-950 text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                    인기 추천 (삼성 패드 포함)
                  </span>
                  <span className="font-black text-sm">Pro (프로)</span>
                  <span className={`text-[11px] font-extrabold ${selectedPlan === 'pro' ? 'text-blue-100' : 'text-slate-500'}`}>월 {proPrice.toLocaleString()}원</span>
                </button>
              </div>
              <div className="text-[11px] text-slate-500 mt-2 pl-1 font-medium">
                {selectedPlan === 'pro' ? '★ Pro 요금제: 삼성 ALL 모델 전용 태블릿 1대 제공 (3년 약정 만기 시 소유권 이전)' : '★ Lite 요금제: 기존 보유 기기 활용 전용 단말기 미포함'}
              </div>
            </div>

            {/* Slider 1: Students */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                <span>2. 현재 재원생 수</span>
                <span className="text-base font-extrabold text-blue-600 bg-blue-50 px-3 py-1 rounded-lg border border-blue-100">
                  {students} 명
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="300"
                step="5"
                value={students}
                onChange={(e) => setStudents(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>20명</span>
                <span>150명</span>
                <span>300명+</span>
              </div>
            </div>

            {/* Slider 2: Shuttles */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                <span>3. 운행 셔틀버스 대수</span>
                <span className="text-base font-extrabold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                  {shuttles} 대
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                step="1"
                value={shuttles}
                onChange={(e) => setShuttles(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>미운행</span>
                <span>5대</span>
                <span>10대</span>
              </div>
            </div>

            {/* Slider 3: Tuition */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm font-bold text-slate-800">
                <span>4. 평균 월 수강료</span>
                <span className="text-base font-extrabold text-slate-900 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                  {(avgTuition / 10000).toFixed(0)} 만원
                </span>
              </div>
              <input
                type="range"
                min="100000"
                max="500000"
                step="10000"
                value={avgTuition}
                onChange={(e) => setAvgTuition(Number(e.target.value))}
                className="w-full h-2.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-800"
              />
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>10만원</span>
                <span>30만원</span>
                <span>50만원</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-start gap-2 text-xs text-slate-500 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div>실제 학원 운영 고정비 단가 수식 기반 산출 데이터입니다.</div>
                  <div className="text-[11px] text-slate-400 font-normal mt-0.5">(※ 이해를 돕기 위한 참고용 예상 시뮬레이션 수치)</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowFormulaGuide(true)}
                className="text-xs font-extrabold text-blue-600 hover:text-blue-800 flex items-center gap-1 underline underline-offset-2 shrink-0 ml-2"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>산출 기준 안내</span>
              </button>
            </div>

          </div>

          {/* Right Results Card */}
          <div className="lg:col-span-6 gradient-bg-primary rounded-3xl p-6 sm:p-10 text-white flex flex-col justify-between shadow-2xl shadow-blue-600/30 relative overflow-hidden">
            
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl pointer-events-none" />

            <div className="space-y-6 relative z-10">
              
              <div className="flex items-center justify-between border-b border-white/20 pb-4">
                <span className="text-xs font-extrabold tracking-wider text-blue-100 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                  아이패스케어 도입 시 기대 시뮬레이션
                </span>
                <span className="text-xs bg-white/20 px-3 py-1 rounded-full font-bold">
                  {selectedPlan === 'lite' ? 'Lite 요금제 적용' : 'Pro 요금제 적용'}
                </span>
              </div>

              {/* Stat 1: Saved Admin Time */}
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <Clock className="w-5 h-5 text-amber-300" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-100 font-medium">월간 절감 행정 시간</div>
                    <div className="text-sm text-slate-200 font-bold">출결/셔틀/원비 재결제 알림 자동화</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-black text-amber-300">약 {savedAdminHours} 시간</div>
                  <div className="text-[10px] text-blue-100 font-semibold">(월 {savedAdminCost.toLocaleString()}원 상당)</div>
                </div>
              </div>

              {/* Stat 2: Unpaid Tuition Recovery */}
              <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/15 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                    <DollarSign className="w-5 h-5 text-emerald-300" />
                  </div>
                  <div>
                    <div className="text-xs text-blue-100 font-medium">월간 미납 원비 회수 기대액</div>
                    <div className="text-sm text-slate-200 font-bold">앱 내 이용권 팝업 청구 및 원스톱 간편 결제</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl sm:text-2xl font-black text-emerald-300">월 {recoveredUnpaidTuition.toLocaleString()} 원</div>
                  <div className="text-[10px] text-blue-100 font-semibold">미납률 대폭 감소 효과</div>
                </div>
              </div>

              {/* Total Financial Summary Box */}
              <div className="bg-slate-900/90 backdrop-blur-md p-5 rounded-2xl border border-slate-700/80 space-y-2">
                <div className="flex justify-between items-center text-xs text-slate-300 font-medium">
                  <span>선택 요금제 월 비용</span>
                  <span className="font-bold text-red-300">- {monthlyPackageCost.toLocaleString()} 원</span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                  <span className="text-sm font-extrabold text-white">연간 총 순 가치 이익 (ROI)</span>
                  <div className="text-right">
                    <div className="text-2xl sm:text-3xl font-black text-amber-400">
                      + {(netAnnualProfit / 10000).toFixed(0)} 만원 / 년
                    </div>
                    <div className="text-[10px] text-slate-400">(월 순이익: +{netMonthlyProfit.toLocaleString()}원)</div>
                  </div>
                </div>
              </div>

            </div>

            <div className="pt-6 relative z-10">
              <button
                onClick={onOpenInquiry}
                className="w-full bg-white hover:bg-slate-100 text-blue-600 font-black text-base py-4 rounded-2xl shadow-xl flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
              >
                <span>우리 학원 전용 도입 견적 상담받기</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

          </div>

        </div>

      </div>

      {/* Formula Guide Modal Popup */}
      {showFormulaGuide && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setShowFormulaGuide(false)}
        >
          <div 
            className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 space-y-5 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Calculator className="w-4 h-4" />
                </div>
                <h3 className="text-lg font-black text-slate-900">시뮬레이터 산출 공식 기준</h3>
              </div>
              <button 
                onClick={() => setShowFormulaGuide(false)}
                className="p-2 rounded-full bg-slate-100 text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-slate-600">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                <span className="font-black text-slate-900 block text-xs text-blue-600">1. 행정 업무 절감 시간 (시간/월)</span>
                <p className="leading-relaxed">
                  • 원생 1명당 월 0.45시간 (약 27분) 절감<br />
                  • 셔틀버스 1대당 월 12시간 절감<br />
                  <span className="font-mono text-[11px] text-slate-400">수식: (원생 수 × 0.45시간) + (셔틀 수 × 12시간)</span>
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                <span className="font-black text-slate-900 block text-xs text-emerald-600">2. 인건비 절감 환산액 (원/월)</span>
                <p className="leading-relaxed">
                  • 절감된 업무 시간을 실무 최저시급 수준으로 환산<br />
                  <span className="font-mono text-[11px] text-slate-400">수식: 절감 행정 시간 × 시급 12,000원</span>
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-1.5">
                <span className="font-black text-slate-900 block text-xs text-indigo-600">3. 미납 원비 회수 기대액 (원/월)</span>
                <p className="leading-relaxed">
                  • 어플 팝업 청구 및 원스톱 수납 도입 시 회수율 5% 상승<br />
                  <span className="font-mono text-[11px] text-slate-400">수식: (원생 수 × 평균 수강료) × 5% (0.05)</span>
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100 space-y-1.5 text-blue-950">
                <span className="font-black block text-xs text-blue-700">4. 연간 총 순 가치 이익 (ROI)</span>
                <p className="leading-relaxed font-medium">
                  <span className="font-mono text-[11px]">수식: [(인건비 절감액 + 미납 회수액) - 아이패스케어 선택 요금] × 12개월</span>
                </p>
              </div>
            </div>

            <div className="pt-2">
              <button 
                onClick={() => setShowFormulaGuide(false)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl text-xs transition-colors"
              >
                확인 및 닫기
              </button>
            </div>
          </div>
        </div>
      )}

    </section>
  );
};

export default RoiCalculator;
