import { useState } from 'react';
import { ArrowRight, Bus, MapPin, BellRing, Calculator } from 'lucide-react';
import { coreServiceFeatures, servicePlans } from '../data/servicePlans';
import { calculateServiceSimulation, simulationDefaults, type SimulationInput } from '../data/serviceSimulation';

export function PricingSection({ onOpenInquiry }: { onOpenInquiry: () => void }) {
  const [input, setInput] = useState<SimulationInput>(simulationDefaults);
  const result = calculateServiceSimulation(input);
  const selectedPlan = servicePlans.find(plan => plan.id === input.planId)!;
  const updateNumber = (key: Exclude<keyof SimulationInput, 'planId'>, value: string, min: number, max: number) => {
    const number = Number(value);
    if (Number.isFinite(number)) setInput(previous => ({ ...previous, [key]: Math.max(min, Math.min(max, number)) }));
  };
  const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;
  const icons = [MapPin, BellRing, Bus];
  return (
    <section id="calculator" className="bg-gradient-to-b from-slate-50 via-blue-50/40 to-white py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto mb-12 max-w-3xl text-center">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full bg-blue-100 px-4 py-1.5 text-sm font-extrabold text-blue-700"><Calculator className="h-4 w-4" />요금제·도입 효과 시뮬레이션</span>
          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">우리 학원에 맞춰 직접 계산해 보세요</h2>
          <p className="mt-4 text-base leading-relaxed text-slate-600">베이직·라이트·프로·엔터프라이즈 요금제를 선택하고<br className="hidden sm:inline" /> 원생 수와 차량 수에 따른 예상 업무 절감 효과를 비교하세요.</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {servicePlans.map(plan => (
            <article key={plan.id} className={`flex flex-col rounded-3xl border p-7 shadow-sm ${plan.id === input.planId ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-100' : 'border-slate-200 bg-white'}`}>
              <h3 className="text-lg font-black text-slate-900">{plan.name}</h3>
              <p className="mt-2 min-h-16 text-sm font-bold text-slate-500">{plan.description}</p>
              <div className="my-7"><span className="text-3xl font-black tracking-tight text-blue-700">{plan.monthlyPrice.toLocaleString('ko-KR')}원</span><span className="ml-1 text-sm text-slate-500">/ 월</span></div>
              <p className="mb-5 text-xs font-bold text-slate-500">VAT 별도</p>
              <button type="button" aria-label={`${plan.name} 선택`} aria-pressed={input.planId === plan.id} onClick={() => setInput(previous => ({ ...previous, planId: plan.id }))} className="btn-primary mt-auto justify-center text-sm">요금제 선택</button>
            </article>
          ))}
        </div>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
            <h3 className="mb-6 text-xl font-extrabold text-slate-900">학원 운영 조건</h3>
            <div className="space-y-6">
              <label className="block text-sm font-bold text-slate-700">현재 재원생 수 <span className="float-right text-blue-600">{input.students}명</span>
                <input aria-label="현재 재원생 수" type="range" min="1" max="300" step="1" value={input.students} onChange={e => updateNumber('students', e.target.value, 1, 300)} className="mt-4 w-full accent-blue-600" />
                <span className="flex justify-between text-xs font-normal text-slate-400"><span>1명</span><span>150명</span><span>300명</span></span>
              </label>
              <label className="block text-sm font-bold text-slate-700">운행 셔틀버스 대수 <span className="float-right text-indigo-600">{input.shuttles}대</span>
                <input aria-label="운행 셔틀버스 대수" type="range" min="0" max="10" step="1" value={input.shuttles} onChange={e => updateNumber('shuttles', e.target.value, 0, 10)} className="mt-4 w-full accent-indigo-600" />
                <span className="flex justify-between text-xs font-normal text-slate-400"><span>미운행</span><span>5대</span><span>10대</span></span>
              </label>
              <label className="block text-sm font-bold text-slate-700">평균 월 수강료 <span className="float-right text-slate-900">{money(input.avgTuition)}</span>
                <input aria-label="평균 월 수강료" type="range" min="0" max="500000" step="10000" value={input.avgTuition} onChange={e => updateNumber('avgTuition', e.target.value, 0, 500000)} className="mt-4 w-full accent-slate-700" />
              </label>
            </div>
            <details className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-extrabold text-blue-700">산출 기준 확인·변경</summary>
              <p className="mt-3 text-xs leading-relaxed text-slate-500">아래 기본값은 설명용 가정이며 실측 통계가 아닙니다. 학원 상황에 맞게 바꿔 보세요. 미납 회수율은 기본 0%이며, 입력하더라도 실제 회수를 보장하지 않습니다.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {([
                  ['minutesPerStudent', '원생 1명당 월 절감 시간(분)', 0, 600],
                  ['hoursPerShuttle', '차량 1대당 월 절감 시간(시간)', 0, 300],
                  ['hourlyValue', '업무시간 환산 시급(원)', 0, 100000],
                  ['recoveryPercent', '미납 회수 가정 비율(%)', 0, 100],
                ] as const).map(([key, label, min, max]) => <label key={key} className="block text-xs font-bold leading-relaxed text-slate-600">{label}<input type="number" min={min} max={max} step="1" value={input[key]} onChange={e => updateNumber(key, e.target.value, min, max)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-base text-slate-900" /></label>)}
              </div>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">월 절감 시간 = 원생 수 × 1명당 절감 분 ÷ 60 + 차량 수 × 1대당 절감 시간<br />업무시간 환산액 = 월 절감 시간 × 환산 시급<br />미납 회수 가정액 = 원생 수 × 평균 월 수강료 × 가정 비율 ÷ 100<br />월 예상 순효과 = 업무시간 환산액 + 미납 회수 가정액 − VAT 포함 월 이용료</p>
            </details>
          </div>
          <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 p-6 text-white shadow-xl sm:p-8" aria-live="polite" aria-atomic="true">
            <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-4"><h3 className="text-lg font-extrabold">예상 시뮬레이션 결과</h3><span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">{selectedPlan.name}</span></div>
            <>
              <dl className="mt-6 space-y-5">
                {[
                  ['월 이용료 (VAT 별도)', money(result.monthlyCost)],
                  ['VAT (10%)', money(result.vatAmount)],
                  ['월 이용료 (VAT 포함)', money(result.monthlyCostIncludingVat)],
                  ['월 예상 업무시간 절감', `${result.savedHours.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}시간`],
                  ['월 업무시간 환산액', money(result.timeValue)],
                  ['월 미납 회수 가정액', money(result.recoveredAmount)],
                ].map(([label, value]) => <div key={label} className="flex flex-wrap items-baseline justify-between gap-2"><dt className="text-sm text-blue-100">{label}</dt><dd className="text-xl font-extrabold">{value}</dd></div>)}
              </dl>
              <div className="mt-7 rounded-2xl bg-white/15 p-5"><div className="text-sm font-bold text-blue-100">월 예상 순효과</div><div data-testid="monthly-net-value" className="mt-2 break-words text-3xl font-black sm:text-4xl">{money(result.monthlyNetValue!)}</div><div className="mt-3 text-sm text-blue-100">연간 환산 {money(result.annualNetValue!)}</div></div>
            </>
            <p className="mt-5 text-xs leading-relaxed text-blue-100">실제 절감 시간·비용·수납 성과를 보장하는 값이 아닙니다. 업무시간의 금액 환산이며 실제 인건비 지출 감소와는 다를 수 있습니다. 차량 대수는 계산 가정에만 반영되며 추가 이용료를 의미하지 않습니다.</p>
            <button type="button" onClick={onOpenInquiry} className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 font-extrabold text-blue-700">도입 상담 신청<ArrowRight className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-x-8 gap-y-3">
          {coreServiceFeatures.map((label, i) => { const Icon = icons[i]; return <span key={label} className="flex items-center gap-2 text-sm font-bold text-slate-700"><Icon className="h-5 w-5 text-indigo-600" />{label}</span>; })}
        </div>
        <p className="mt-5 text-center text-xs leading-relaxed text-slate-500">표시 요금은 VAT 별도이며 시뮬레이션은 VAT 포함 월 이용료를 차감합니다. 엔터프라이즈는 기본 월 이용료 기준이며 커스텀 케어의 세부 범위와 추가 비용은 별도 협의합니다.<br />요금 납부는 자동이체·신용카드 정기결제 등 별도 합의된 방식에 따릅니다.</p>
      </div>
    </section>
  );
}
