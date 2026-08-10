import React, { useState } from 'react';
import { Calculator, Clock, TrendingUp, ArrowRight } from 'lucide-react';

interface RoiCalculatorProps {
  onOpenInquiry: () => void;
}

export const RoiCalculator: React.FC<RoiCalculatorProps> = ({ onOpenInquiry }) => {
  const [students, setStudents] = useState<number>(120);
  const [shuttles, setShuttles] = useState<number>(3);
  const [tuition, setTuition] = useState<number>(22);

  const savedAdminHoursMonth = Math.round(students * 0.35 + shuttles * 6);
  const annualTimeCostSavings = Math.round(savedAdminHoursMonth * 15000 * 12);
  const annualUnpaidRecoveryValue = Math.round(students * (tuition * 10000) * 0.06 * 12);
  const totalAnnualBenefit = annualTimeCostSavings + annualUnpaidRecoveryValue;

  return (
    <section id="calculator" className="py-24 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-white relative overflow-hidden">
      <div className="absolute top-1/2 left-10 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-bold mb-3">
            <Calculator className="w-3.5 h-3.5" />
            <span>학원 규모별 실시간 도입 효과 시뮬레이터</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            아이패스케어 도입 시<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-sky-400">
              우리 학원이 얻게 되는 기대 절감 효과
            </span>
          </h2>
          <p className="text-slate-400 mt-3 text-base sm:text-lg">
            슬라이더를 움직여 현재 학원 규모를 입력하면, 월간 절감 행정 시간과 수납 회수액이 실시간 계산됩니다.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-slate-800/80 backdrop-blur-xl border border-slate-700/80 rounded-3xl p-6 sm:p-10 lg:p-12 shadow-2xl">
          
          <div className="lg:col-span-6 space-y-8">
            
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <label className="font-bold text-slate-200">학원 수강 원생 수</label>
                <span className="text-lg font-extrabold text-blue-400 bg-blue-950/80 border border-blue-800 px-3 py-1 rounded-xl">
                  {students} 명
                </span>
              </div>
              <input
                type="range"
                min="20"
                max="500"
                step="10"
                value={students}
                onChange={(e) => setStudents(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>20명 (소형)</span>
                <span>250명 (중형)</span>
                <span>500명 이상 (대형)</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <label className="font-bold text-slate-200">운행 셔틀 차량 대수</label>
                <span className="text-lg font-extrabold text-indigo-400 bg-indigo-950/80 border border-indigo-800 px-3 py-1 rounded-xl">
                  {shuttles} 대
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                step="1"
                value={shuttles}
                onChange={(e) => setShuttles(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>1대</span>
                <span>5대</span>
                <span>10대 이상</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <label className="font-bold text-slate-200">월 평균 원생 1인 수강료</label>
                <span className="text-lg font-extrabold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-3 py-1 rounded-xl">
                  {tuition} 만원
                </span>
              </div>
              <input
                type="range"
                min="10"
                max="60"
                step="2"
                value={tuition}
                onChange={(e) => setTuition(Number(e.target.value))}
                className="w-full cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>10만원</span>
                <span>35만원</span>
                <span>60만원</span>
              </div>
            </div>

          </div>

          <div className="lg:col-span-6 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 border border-blue-500/30 rounded-2xl p-6 sm:p-8 space-y-6">
            
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <span className="text-xs font-bold text-blue-300 tracking-wider">실시간 연간 경제적 기대 효과</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-300 font-bold px-2.5 py-0.5 rounded-full border border-emerald-500/30">
                수납률 +8.5% 증가 포함
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              
              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Clock className="w-4 h-4 text-blue-400" />
                  <span>월간 절감 행정 시간</span>
                </div>
                <div className="text-2xl font-extrabold text-white">
                  약 <span className="text-blue-400">{savedAdminHoursMonth}</span> 시간
                </div>
                <div className="text-[10px] text-slate-400 mt-1">셔틀 확인 & 출결 전화 미발생</div>
              </div>

              <div className="bg-slate-800/80 p-4 rounded-xl border border-slate-700/60">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span>연간 미납 원비 회수 기대액</span>
                </div>
                <div className="text-2xl font-extrabold text-white">
                  <span className="text-emerald-400">{(annualUnpaidRecoveryValue / 10000).toLocaleString()}</span> 만원
                </div>
                <div className="text-[10px] text-slate-400 mt-1">카카오 알림톡 스마트 결제 수납</div>
              </div>

            </div>

            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 rounded-2xl text-center space-y-1 shadow-xl">
              <div className="text-xs text-blue-100 font-medium">연간 총 예상 절감 및 수익 개선 가치</div>
              <div className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                약 {(totalAnnualBenefit / 10000).toLocaleString()} 만원 / 년
              </div>
              <div className="text-[11px] text-blue-200 font-medium">
                (행정 인건비 절감액 + 미납 원비 회수액 종합 추산)
              </div>
            </div>

            <button 
              onClick={onOpenInquiry}
              className="w-full btn-primary text-base justify-center py-4 shadow-blue-500/40"
            >
              <span>우리 학원 맞춤견적서 무료 신청</span>
              <ArrowRight className="w-5 h-5" />
            </button>

          </div>

        </div>

      </div>
    </section>
  );
};
