import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { RoleTabSwitcher } from './components/RoleTabSwitcher';
import { FeatureGrid } from './components/FeatureGrid';
import { RoiCalculator } from './components/RoiCalculator';
import { VideoManualCenter } from './components/VideoManualCenter';
import { GroundCorpSection } from './components/GroundCorpSection';
import { InquiryFormSection } from './components/InquiryFormSection';
import { FaqSection } from './components/FaqSection';
import { Footer } from './components/Footer';

export function App() {
  const handleScrollToInquiry = () => {
    const el = document.getElementById('inquiry');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-500 selection:text-white">
      {/* Top Glassmorphic Navigation */}
      <Navbar onOpenInquiry={handleScrollToInquiry} />

      {/* Main Page Content (1안 Official Final Production Design) */}
      <main>
        {/* 1. Hero Section */}
        <HeroSection onOpenInquiry={handleScrollToInquiry} />

        {/* 2. Role-based Interactive Demo Switcher */}
        <RoleTabSwitcher onOpenInquiry={handleScrollToInquiry} />

        {/* 3. Key 4 Features Grid */}
        <FeatureGrid />

        {/* 4. Real-time ROI Calculator */}
        <RoiCalculator onOpenInquiry={handleScrollToInquiry} />

        {/* 5. Video Manual Center */}
        <VideoManualCenter />

        {/* 6. Corporate Trust & Synergy (Ground Corporation) */}
        <GroundCorpSection />

        {/* 7. B2B Consultation Inquiry Form */}
        <InquiryFormSection />

        {/* 8. FAQ Section */}
        <FaqSection />
      </main>

      {/* Page Footer */}
      <Footer />
    </div>
  );
}

export default App;
