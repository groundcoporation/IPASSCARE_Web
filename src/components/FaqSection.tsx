import React, { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp } from 'lucide-react';

interface FaqItem {
  q: string;
  a: React.ReactNode;
}

const FAQS: FaqItem[] = [
  {
    q: '아이패스케어 도입 시 기존 셔틀버스에 별도 단말기를 설치해야 하나요?',
    a: (
      <span>
        아닙니다! 아이패스케어는 기사님의 스마트폰 앱 GPS를 활용하므로 고가의 별도 단말기나 하드웨어 설치비가 전혀 들지 않고,<br className="hidden sm:inline" />
        앱 설치 후 바로 간편하게 운행하실 수 있습니다.
      </span>
    )
  },
  {
    q: '학원 원비 결제 수납 수수료 및 수납 절차는 어떻게 되나요?',
    a: (
      <span>
        아이패스케어 어플 결제망을 통해 안전하게 수납되며, 매월 수강생 학부모 앱으로 이용권 청구서가 일괄 발송됩니다.<br className="hidden sm:inline" />
        학부모는 스마트폰 앱에서 1초 만에 간편 결제를 진행할 수 있습니다.
      </span>
    )
  },
  {
    q: '요금제와 전용 단말기 제공 조건은 어떻게 되나요?',
    a: (
      <span>
        Basic (베이직)은 원생 30명 이하·차량 1대, Lite (라이트)는 원생 50명 이하·차량 1대 운영 학원에 권장하며 전용 단말기(태블릿)는 미포함입니다.<br />
        Pro (프로)는 원생 50명 초과·차량 1대 이상 운영 학원에 권장하며 전용 단말기(태블릿)는 미포함입니다.<br />
        Enterprise (엔터프라이즈)는 원생 50명 초과·차량 3대 이상 운영 학원에 권장하며 전용 단말기(태블릿)를 제공합니다.<br />
        월 이용료는 각각 39,900원, 69,900원, 99,000원, 119,900원입니다.<br />
        모든 요금은 VAT 별도입니다. 자동이체·신용카드 정기결제 등 별도 합의된 방식으로 납부합니다.
      </span>
    )
  },
  {
    q: '학원 입구 태블릿 키패드 출결 장비는 어떤 기기를 써야 하나요?',
    a: (
      <span>
        안드로이드 기반의 태블릿(7인치 이상) 기기를 모두 지원합니다.<br className="hidden sm:inline" />
        구글 플레이스토어에서 아이패스케어 출결 전용 앱을 무료로 다운로드받아 1분 만에 간편하게 세팅할 수 있습니다.
      </span>
    )
  },
  {
    q: '도입 신청 후 실제 학원에서 사용하기까지 얼마나 걸리나요?',
    a: (
      <span>
        기본 학원 등록과 원생 및 셔틀 노선 세팅은 약 10~20분 내에 완료됩니다.<br className="hidden sm:inline" />
        전담 매니저가 유선 통화 및 동영상 매뉴얼을 통해 초기 설정을 1:1로 친절히 밀착 지원해 드립니다.
      </span>
    )
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
                      <span className="leading-relaxed break-keep">{faq.a}</span>
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
