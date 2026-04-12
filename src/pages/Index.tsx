import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { HealthProvider, useHealth } from "@/lib/health-context";
import { AppScreen } from "@/lib/types";
import AuthPage from "@/components/AuthPage";
import DashboardScreen from "@/components/screens/DashboardScreen";
import AICoachScreen from "@/components/screens/AICoachScreen";
import BodyScreen from "@/components/screens/BodyScreen";
import FutureScreen from "@/components/screens/FutureScreen";
import OnboardingScreen from "@/components/screens/OnboardingScreen";
import { Toaster } from "@/components/ui/toaster";
import { Crosshair, Sparkles, User, TrendingUp, Activity } from "lucide-react";

function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { isGuest, setIsGuest, setUserId, dataCompleteness } = useHealth();
  const [screen, setScreen] = useState<AppScreen>("focus");
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const startX = useRef(0);
  const swiping = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) { setIsGuest(false); setUserId(session.user.id); } else { setUserId(null); }
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) { setIsGuest(false); setUserId(session.user.id); }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Check onboarding status after session is ready
  useEffect(() => {
    if (!session) return;
    const key = `vitalis_onboarded_${session.user.id}`;
    if (localStorage.getItem(key) === "true") {
      setOnboarded(true);
    } else {
      const t = setTimeout(() => {
        setOnboarded(dataCompleteness > 0 || localStorage.getItem(key) === "true");
      }, 800);
      return () => clearTimeout(t);
    }
  }, [session, dataCompleteness]);

  const handleSignOut = async () => {
    if (!isGuest) await supabase.auth.signOut();
    setIsGuest(false);
    setSession(null);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (screen === "ai") return;
    startX.current = e.touches[0].clientX;
    swiping.current = true;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swiping.current || screen === "ai") return;
    const delta = e.changedTouches[0].clientX - startX.current;
    const swipeScreens: AppScreen[] = ["focus", "body", "future"];
    const idx = swipeScreens.indexOf(screen);
    if (idx === -1) return;
    if (delta < -60 && idx < 2) setScreen(swipeScreens[idx + 1]);
    if (delta > 60 && idx > 0) setScreen(swipeScreens[idx - 1]);
    swiping.current = false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthPage onGuestLogin={() => {}} />;
  }

  if (onboarded === false) {
    return (
      <OnboardingScreen
        onComplete={() => {
          if (session) localStorage.setItem(`vitalis_onboarded_${session.user.id}`, "true");
          setOnboarded(true);
        }}
      />
    );
  }

  if (onboarded === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const renderScreen = () => {
    switch (screen) {
      case "focus": return <DashboardScreen />;
      case "ai": return <AICoachScreen />;
      case "body": return <BodyScreen />;
      case "future": return <FutureScreen />;
    }
  };

  const navItems: { id: AppScreen; label: string; icon: React.ElementType }[] = [
    { id: "focus", label: "Focus", icon: Crosshair },
    { id: "body", label: "Body", icon: User },
    { id: "future", label: "Future", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto relative">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
            <Activity className="w-3 h-3 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">Vitalis</span>
        </div>
        <button onClick={handleSignOut} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
          Sign out
        </button>
      </div>

      {/* Screen Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-y-auto px-4 pt-3"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {renderScreen()}
      </div>

      {/* Bottom Navigation — AI-First */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border/50 z-40">
        <div className="max-w-lg mx-auto flex items-end justify-around px-4 pt-1 pb-2 relative">
          {/* Left: Focus */}
          <NavButton
            icon={navItems[0].icon}
            label={navItems[0].label}
            active={screen === "focus"}
            onClick={() => setScreen("focus")}
          />

          {/* Center: AI Button — elevated & glowing */}
          <div className="flex flex-col items-center -mt-5">
            <button
              onClick={() => setScreen("ai")}
              className={`relative w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${
                screen === "ai"
                  ? "bg-primary shadow-[0_0_24px_hsl(174,72%,46%,0.5)] scale-105"
                  : "bg-gradient-to-br from-primary to-primary/70 shadow-[0_0_16px_hsl(174,72%,46%,0.3)] hover:scale-105"
              }`}
            >
              {/* Glow ring */}
              <div className="absolute inset-0 rounded-2xl animate-pulse-glow" />
              <Sparkles className={`w-6 h-6 relative z-10 ${screen === "ai" ? "text-primary-foreground" : "text-primary-foreground"}`} />
            </button>
            <span className={`text-[10px] font-semibold mt-1 ${screen === "ai" ? "text-primary" : "text-muted-foreground"}`}>AI</span>
          </div>

          {/* Right side: Body & Future */}
          <NavButton
            icon={navItems[1].icon}
            label={navItems[1].label}
            active={screen === "body"}
            onClick={() => setScreen("body")}
          />
          <NavButton
            icon={navItems[2].icon}
            label={navItems[2].label}
            active={screen === "future"}
            onClick={() => setScreen("future")}
          />
        </div>
      </div>
    </div>
  );
}

function NavButton({ icon: Icon, label, active, onClick }: {
  icon: React.ElementType; label: string; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-5 py-1 rounded-lg transition-all ${active ? "text-primary" : "text-muted-foreground"}`}
    >
      <Icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
      <span className={`text-[10px] font-medium ${active ? "text-primary" : ""}`}>{label}</span>
      {active && <div className="w-1 h-1 rounded-full bg-primary" />}
    </button>
  );
}

export default function Index() {
  return (
    <HealthProvider>
      <AppShell />
      <Toaster />
    </HealthProvider>
  );
}
