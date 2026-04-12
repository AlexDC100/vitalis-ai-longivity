import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { HealthProvider, useHealth } from "@/lib/health-context";
import { NavSection } from "@/lib/types";
import AppSidebar from "@/components/AppSidebar";
import AuthPage from "@/components/AuthPage";
import CommandCenter from "@/components/pages/CommandCenter";
import AIAdvisor from "@/components/pages/AIAdvisor";
import MedicalTeam from "@/components/pages/MedicalTeam";
import HealthBlueprint from "@/components/pages/HealthBlueprint";
import RiskEngine from "@/components/pages/RiskEngine";
import FutureSelf from "@/components/pages/FutureSelf";
import ActionStack from "@/components/pages/ActionStack";
import MedicalVault from "@/components/pages/MedicalVault";
import { Toaster } from "@/components/ui/toaster";

function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { isGuest, setIsGuest } = useHealth();
  const [activeSection, setActiveSection] = useState<NavSection>("command-center");

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) setIsGuest(false);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) setIsGuest(false);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    if (!isGuest) await supabase.auth.signOut();
    setIsGuest(false);
    setSession(null);
  };

  const handleGuestLogin = () => {
    setIsGuest(true);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !isGuest) {
    return <AuthPage onGuestLogin={handleGuestLogin} />;
  }

  const renderPage = () => {
    switch (activeSection) {
      case "command-center": return <CommandCenter />;
      case "ai-advisor": return <AIAdvisor />;
      case "medical-team": return <MedicalTeam />;
      case "health-blueprint": return <HealthBlueprint />;
      case "risk-engine": return <RiskEngine />;
      case "future-self": return <FutureSelf />;
      case "action-stack": return <ActionStack />;
      case "medical-vault": return <MedicalVault />;
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar active={activeSection} onNavigate={setActiveSection} onSignOut={handleSignOut} />
      <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto max-w-5xl">
        {renderPage()}
      </main>
    </div>
  );
}

export default function Index() {
  return (
    <HealthProvider>
      <AppContent />
      <Toaster />
    </HealthProvider>
  );
}
