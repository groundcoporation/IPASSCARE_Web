import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface FaqItem {
  q: string;
  a: string;
}

const FAQS: FaqItem[] = [
  {
    q: '아이패스케어 도입 시 기존 셔틀버스에 별도 단말기를 설치해야 하나요?',
    a: '아닙니다! 아이패스케어는 기사님의 기존 스마트폰 앱 GPS를 활용하므로 고가의 별도 단말기나 하드웨어 설치비가 전혀 들지 않습니다. 앱 설치 후 바로 운행이 가능합니다.'
  },
  {
    q: '학원 원비 결제 수납 수수료 및 수납 절차는 어떻게 되나요?',
    a: '학원 명의의 정식 PG 결제망을 통해 안전하게 수납되며, 매월 미납된 수강생 학부모 어플로 이용권 청구서가 일괄 발송됩니다. 학부모는 앱에서 모바일 간편 결제로 1초 만에 결제할 수 있습니다.'
  },
  {
    q: '마일리지 포인트는 어떻게 적립되고 사용할 수 있나요?',
    a: '원비 수납 및 신규 회원 추천 시 회원 추천 적립 정책에 따라 마일리지 포인트가 자동 적립됩니다. 학부모는 적립된 포인트를 아이패스케어 앱에서 포인트 전환을 통해 간편하게 전환하여 어플 수강료 결제, 자사몰, 제휴 스포츠용품 쇼핑몰(영카트)에서 1:1 현금처럼 사용하실 수 있습니다.'
  },
  {
    q: '학원 입구 태블릿 키패드 출결 장비는 어떤 기기를 써야 하나요?',
    a: '안드로이드 또는 안드로이드 기반의 저가형 태블릿(7인치 이상)이면 어떤 기기든 지원합니다. 아이패스케어 출결 키패드 전용 앱을 구글 플레이스토어에서 무료 다운로드하여 1분 만에 세팅할 수 있습니다.'
  },
  {
    q: '도입 신청 후 실제 학원에서 사용하기까지 얼마나 걸리나요?',
    a: '기본 학원 등록 및 원생/셔틀 노선 세팅은 약 10~20분 내에 완료됩니다. 전담 매니저가 유선 및 매뉴얼 동영상으로 초기 세팅을 1:1 밀착 지원해 드립니다.'
  }
];

export const FaqSection: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-24 bg-white relative">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold mb-3">
            <HelpCircle className="w-3.5 h-3.5" />
            <span>자주 묻는 질문</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            궁금하신 점을 빠르게 해결해 드립니다
          </h2>
          <p className="text-slate-600 mt-2 text-sm sm:text-base">
            아이패스케어 도입 및 서비스 관련 대표적인 질문 모음입니다.
          </p>
        </div>

        {/* Accordions */}
        <div className="space-y-4">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div 
                key={idx}
                className="glass-card overflow-hidden border border-slate-200/80 transition-all"
              >
                <button
                  onClick={() => toggle(idx)}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 font-bold text-slate-900 text-base sm:text-lg hover:text-blue-600 transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-blue-600 font-extrabold">Q.</span>
                    {faq.q}
                  </span>
                  {isOpen ? (
                    <ChevronUp className="w-5 h-5 text-blue-600 shrink-0" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 pt-0 text-slate-600 text-sm leading-relaxed border-t border-slate-100 bg-slate-50/50 animate-in fade-in duration-200">
                    <div className="pt-4 flex items-start gap-3">
                      <span className="text-indigo-600 font-extrabold text-base">A.</span>
                      <span>{faq.a}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </div>
    </section>
  );
};
