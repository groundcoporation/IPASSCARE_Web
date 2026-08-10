import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { FeatureGrid } from './components/FeatureGrid';
import { RoleTabSwitcher } from './components/RoleTabSwitcher';
import { RoiCalculator } from './components/RoiCalculator';
import { VideoManualCenter } from './components/VideoManualCenter';
import { GroundCorpSection } from './components/GroundCorpSection';
import { FaqSection } from './components/FaqSection';
import { InquiryFormSection } from './components/InquiryFormSection';
import { Footer } from './components/Footer';
import { FloatingKakaoWidget } from './components/FloatingKakaoWidget';

export function App() {
  const handleScrollToInquiry = () => {
    const el = document.getElementById('inquiry');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-500 selection:text-white relative">
      {/* Top Glassmorphic Navigation */}
      <Navbar onOpenInquiry={handleScrollToInquiry} />

      {/* Main Page Content (Logical Top-to-Bottom Flow) */}
      <main>
        {/* 1. Hero Section */}
        <HeroSection onOpenInquiry={handleScrollToInquiry} />

        {/* 2. Key 4 Features Grid */}
        <FeatureGrid />

        {/* 3. Role-based Interactive Demo Switcher */}
        <RoleTabSwitcher onOpenInquiry={handleScrollToInquiry} />

        {/* 4. Real-time ROI Calculator */}
        <RoiCalculator onOpenInquiry={handleScrollToInquiry} />

        {/* 5. Video Manual Center */}
        <VideoManualCenter />

        {/* 6. Corporate Trust & Synergy (Ground Corporation) */}
        <GroundCorpSection />

        {/* 7. FAQ Section */}
        <FaqSection />

        {/* 8. B2B Consultation Inquiry Form */}
        <InquiryFormSection />
      </main>

      {/* Page Footer */}
      <Footer />

      {/* Official Floating Kakao Channel / Inquiry Floating Widget */}
      <FloatingKakaoWidget onOpenInquiry={handleScrollToInquiry} />
    </div>
  );
}

export default App;
