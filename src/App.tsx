import { useState } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { HeroSectionOption2 } from './components/HeroSectionOption2';
import { RoleTabSwitcher } from './components/RoleTabSwitcher';
import { FeatureGrid } from './components/FeatureGrid';
import { FeatureBentoGridOption2 } from './components/FeatureBentoGridOption2';
import { RoiCalculator } from './components/RoiCalculator';
import { VideoManualCenter } from './components/VideoManualCenter';
import { GroundCorpSection } from './components/GroundCorpSection';
import { InquiryFormSection } from './components/InquiryFormSection';
import { FaqSection } from './components/FaqSection';
import { Footer } from './components/Footer';
import { Sparkles, Layers } from 'lucide-react';

export function App() {
  // Option 1 set as the primary active design choice as requested by the user
  const [designOption, setDesignOption] = useState<'option1' | 'option2'>('option1');

  const handleScrollToInquiry = () => {
    const el = document.getElementById('inquiry');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-500 selection:text-white relative">
      
      {/* Design Option Floating Switcher Bar */}
      <div className="fixed bottom-6 right-6 z-50 bg-slate-900/90 text-white p-2 rounded-2xl shadow-2xl border border-slate-700 backdrop-blur-md flex items-center gap-2">
        <div className="text-[11px] font-bold px-2 text-slate-400 flex items-center gap-1 hidden sm:flex">
          <Layers className="w-3.5 h-3.5 text-blue-400" />
          <span>디자인 모드:</span>
        </div>
        
        <button
          onClick={() => setDesignOption('option1')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            designOption === 'option1'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          1안 (스탠다드 ★)
        </button>

        <button
          onClick={() => setDesignOption('option2')}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
            designOption === 'option2'
              ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5 text-blue-300" />
          <span>2안 (애플 브랜딩)</span>
        </button>
      </div>

      {/* Top Glassmorphic Navigation */}
      <Navbar onOpenInquiry={handleScrollToInquiry} />

      {/* Main Page Content */}
      <main>
        {/* Render Option 1 (Default) vs Option 2 */}
        {designOption === 'option1' ? (
          <>
            <HeroSection onOpenInquiry={handleScrollToInquiry} />
            <RoleTabSwitcher onOpenInquiry={handleScrollToInquiry} />
            <FeatureGrid />
          </>
        ) : (
          <>
            <HeroSectionOption2 onOpenInquiry={handleScrollToInquiry} />
            <RoleTabSwitcher onOpenInquiry={handleScrollToInquiry} />
            <FeatureBentoGridOption2 />
          </>
        )}

        {/* Real-time ROI Calculator */}
        <RoiCalculator onOpenInquiry={handleScrollToInquiry} />

        {/* Video Manual Center */}
        <VideoManualCenter />

        {/* Corporate Trust & Synergy (Ground Corporation) */}
        <GroundCorpSection />

        {/* B2B Consultation Inquiry Form */}
        <InquiryFormSection />

        {/* FAQ Section */}
        <FaqSection />
      </main>

      {/* Page Footer */}
      <Footer />
    </div>
  );
}

export default App;
