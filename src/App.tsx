import { useState, useEffect, useCallback } from 'react';
import { Navbar } from './components/Navbar';
import { HeroSection } from './components/HeroSection';
import { IntroVideoSection } from './components/IntroVideoSection';
import { FeatureGrid } from './components/FeatureGrid';
import { RoleTabSwitcher } from './components/RoleTabSwitcher';
import { RoiCalculator } from './components/RoiCalculator';
import { VideoManualCenter } from './components/VideoManualCenter';
import { GroundCorpSection } from './components/GroundCorpSection';
import { FaqSection } from './components/FaqSection';
import { InquiryFormSection } from './components/InquiryFormSection';
import { Footer } from './components/Footer';
import { FloatingKakaoWidget } from './components/FloatingKakaoWidget';
import { AdminPage } from './components/admin/AdminPage';
import { supabase } from './lib/supabaseClient';

export function App() {
  const [currentView, setCurrentView] = useState<'main' | 'admin'>('main');
  const [loggedInProfile, setLoggedInProfile] = useState<{ id: string; name: string | null; role: string; branch_id: string | null } | null>(null);

  // Initial user session check on app start (Runs ONCE on mount)
  useEffect(() => {
    document.title = "아이패스케어 - (주)그라운드코퍼레이션 통합 안심 케어 플랫폼";
    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user) {
          const { data } = await supabase.from("users").select("id,name,role,branch_id").eq("id", auth.user.id).maybeSingle();
          if (data) {
            setLoggedInProfile(data);
          }
        }
      } catch (err) {
        console.warn("App session check warning", err);
      }
    })();
  }, []);

  // Check URL query param ?admin=true or pathname /admin
  useEffect(() => {
    const handleCheckUrl = () => {
      const isAdminRoute = window.location.pathname.includes('/admin') || window.location.search.includes('admin=true');
      if (isAdminRoute) {
        setCurrentView('admin');
      }
    };
    handleCheckUrl();
    window.addEventListener('popstate', handleCheckUrl);
    return () => window.removeEventListener('popstate', handleCheckUrl);
  }, []);

  const handleScrollToInquiry = useCallback(() => {
    const el = document.getElementById('inquiry');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  const handleOpenAdmin = useCallback(() => {
    setCurrentView('admin');
    window.history.pushState({}, '', '/admin');
  }, []);

  const handleLoginSuccess = useCallback((profile: any) => {
    setLoggedInProfile(profile);
  }, []);

  const handleBackToSite = useCallback(() => {
    setCurrentView('main');
    window.history.pushState({}, '', '/');
  }, []);

  // If Admin View: Render Full-Screen Dedicated Admin Portal Page (Pass initialProfile to eliminate flicker!)
  if (currentView === 'admin') {
    return (
      <AdminPage 
        initialProfile={loggedInProfile}
        onBackToSite={handleBackToSite} 
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 selection:bg-blue-500 selection:text-white relative">
      {/* Top Glassmorphic Navigation with Login & Admin Center Buttons */}
      <Navbar 
        onOpenInquiry={handleScrollToInquiry} 
        onOpenLogin={handleOpenAdmin}
        userProfile={loggedInProfile}
        onOpenAdminPortal={handleOpenAdmin}
        onLogout={() => setLoggedInProfile(null)}
      />

      {/* Main Page Content */}
      <main>
        {/* 1. Hero Section */}
        <HeroSection onOpenInquiry={handleScrollToInquiry} />

        {/* Product introduction video */}
        <IntroVideoSection />

        {/* 2. Key 4 Features Grid */}
        <FeatureGrid />

        {/* 3. Role-based Interactive Demo Switcher */}
        <RoleTabSwitcher onOpenInquiry={handleScrollToInquiry} />

        {/* 4. Real-time ROI Calculator (Lite 99,000 / Pro 118,000 Rates Integrated) */}
        <RoiCalculator onOpenInquiry={handleScrollToInquiry} />

        {/* 5. Video Manual Center (Restricted Access Permission Support) */}
        <VideoManualCenter 
          userProfile={loggedInProfile} 
          onOpenLogin={() => setCurrentView('admin')} 
        />

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
