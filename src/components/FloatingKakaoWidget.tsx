import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';

interface FloatingKakaoWidgetProps {
  onOpenInquiry: () => void;
}

export const FloatingKakaoWidget: React.FC<FloatingKakaoWidgetProps> = ({ onOpenInquiry }) => {
  const [showTooltip, setShowTooltip] = useState(true);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2 animate-in fade-in duration-300">
      
      {/* Speech Bubble Tooltip */}
      {showTooltip && (
        <div className="relative bg-slate-900 text-white text-xs font-bold px-3.5 py-2 rounded-2xl shadow-xl border border-slate-800 flex items-center gap-2 max-w-xs">
          <span>💬 실시간 카카오톡 도입 상담</span>
          <button 
            onClick={() => setShowTooltip(false)}
            className="text-slate-400 hover:text-white p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <div className="absolute -bottom-1.5 right-6 w-3 h-3 bg-slate-900 rotate-45 border-r border-b border-slate-800" />
        </div>
      )}

      {/* Floating Action Button (Kakao Yellow + Slate) */}
      <button
        onClick={onOpenInquiry}
        className="group flex items-center gap-2 bg-[#FEE500] hover:bg-[#FADA00] text-[#191919] font-extrabold px-4 py-3 rounded-full shadow-lg shadow-yellow-500/20 hover:scale-105 transition-all cursor-pointer border border-yellow-400/80"
        title="카카오톡 1:1 상담하기"
      >
        <div className="w-7 h-7 rounded-full bg-[#191919] text-[#FEE500] flex items-center justify-center font-black">
          <MessageCircle className="w-4 h-4 fill-[#FEE500]" />
        </div>
        <span className="text-xs sm:text-sm font-black tracking-tight">카톡 1:1 상담</span>
      </button>

    </div>
  );
};
