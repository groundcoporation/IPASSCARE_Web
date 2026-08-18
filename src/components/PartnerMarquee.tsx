import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

interface Partner {
  id?: string;
  name: string;
  logo_url: string;
  display_order?: number;
  is_visible?: boolean;
  color?: string;
  bgColor?: string;
  borderColor?: string;
  badgeText?: string;
}

export const PartnerMarquee: React.FC = () => {
  const [partnersList, setPartnersList] = useState<Partner[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .from('web_partner_logos')
          .select('*')
          .eq('is_visible', true)
          .order('display_order', { ascending: true });
        
        if (data) {
          setPartnersList(data);
        }
      } catch (err) {
        console.warn('Partner logos fetch error:', err);
      }
    })();
  }, []);

  // If there are no partner logos registered or active, do not render the banner at all!
  if (partnersList.length === 0) {
    return null;
  }

  // Activate rolling scroll animation only when there are 5 or more unique partner logos
  const isScrollable = partnersList.length >= 5;
  
  // Ensure we have at least 18 items in the rolling loop for smooth infinite scrolling if scrollable
  const repeatCount = isScrollable ? Math.max(4, Math.ceil(18 / (partnersList.length || 1))) : 1;
  const extendedPartners = isScrollable ? Array(repeatCount).fill(partnersList).flat() : partnersList;

  return (
    <section className="py-1.5 pt-3 bg-transparent overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-center gap-3">
        
        {/* Refined Trust Label */}
        <div className="flex items-center gap-1.5 shrink-0 text-slate-400 font-semibold text-xs select-none">
          <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0" />
          <span>함께하는 안심 케어 도입 교육원</span>
          <span className="text-slate-300 ml-0.5">➔</span>
        </div>

        {/* Logos Container */}
        <div className="overflow-hidden relative py-0.5 max-w-full">
          <div className={`${isScrollable ? 'animate-marquee flex' : 'flex justify-center sm:justify-start'} items-center gap-5`}>
            {extendedPartners.map((partner, index) => (
              <div 
                key={index} 
                className="flex items-center gap-2 shrink-0 hover:opacity-85 hover:scale-105 transition-all cursor-pointer py-1"
              >
                {partner.logo_url ? (
                  // Real uploaded image logo (Clean & borderless)
                  <div className="flex items-center gap-2 bg-white/80 border border-slate-200/60 rounded-xl px-3 py-1.5 shadow-xs">
                    <img 
                      src={partner.logo_url} 
                      alt={partner.name} 
                      className="h-5.5 object-contain"
                      onError={(e) => {
                        (e.target as HTMLElement).style.display = 'none';
                      }}
                    />
                    <span className="text-xs font-black text-slate-700 tracking-tight">
                      {partner.name}
                    </span>
                  </div>
                ) : (
                  // Default text badges display (Subtle & clean)
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200/60 bg-white/80 shadow-xs`}>
                    <span className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 ${partner.color || 'text-slate-700'}`}>
                      {partner.badgeText || 'PARTNER'}
                    </span>
                    <span className="text-xs font-black text-slate-800 tracking-tight">
                      {partner.name}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Edge Blur Gradients (Only shown when scrolling animation is active) */}
      {isScrollable && (
        <>
          <div className="absolute top-0 bottom-0 left-0 w-16 bg-gradient-to-r from-white to-transparent pointer-events-none z-10 hidden md:block" />
          <div className="absolute top-0 bottom-0 right-0 w-16 bg-gradient-to-l from-white to-transparent pointer-events-none z-10 hidden md:block" />
        </>
      )}
    </section>
  );
};
