import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { HealthProvider, useHealth } from "@/lib/health-context";
import { AppScreen } from "@/lib/types";
import AuthPage from "@/components/AuthPage";
import TodayScreen from "@/components/screens/TodayScreen";
import BodyScreen from "@/components/screens/BodyScreen";
import FutureScreen from "@/components/screens/FutureScreen";
import { Toaster } from "@/components/ui/toaster";
import { Activity, User, TrendingUp } from "lucide-react";

const SCREENS: { id: AppScreen; label: string; icon: React.ElementType }[] = [
  { id: "today", label: "Today", icon: Activity },
  { id: "body", label: "Body", icon: User },
  { id: "future", label: "Future", icon: TrendingUp },
];

function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { isGuest, setIsGuest, setUserId } = useHealth();
  const [screen, setScreen] = useState<AppScreen>("today");

  // Swipe navigation
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

  const handleSignOut = async () => {
    if (!isGuest) await supabase.auth.signOut();
    setIsGuest(false);
    setSession(null);
  };

  const handleGuestLogin = () => {
    setIsGuest(true);
    setLoading(false);
  };

  // Swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    swiping.current = true;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (!swiping.current) return;
    const delta = e.changedTouches[0].clientX - startX.current;
    const screenOrder: AppScreen[] = ["today", "body", "future"];
    const idx = screenOrder.indexOf(screen);
    if (delta < -60 && idx < 2) setScreen(screenOrder[idx + 1]);
    if (delta > 60 && idx > 0) setScreen(screenOrder[idx - 1]);
    swiping.current = false;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session && !isGuest) {
    return <AuthPage onGuestLogin={handleGuestLogin} />;
  }

  const renderScreen = () => {
    switch (screen) {
      case "today": return <TodayScreen />;
      case "body": return <BodyScreen />;
      case "future": return <FutureScreen />;
    }
  };

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

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border/50 z-40">
        <div className="max-w-lg mx-auto flex items-center justify-around py-2">
          {SCREENS.map(s => {
            const Icon = s.icon;
            const active = screen === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setScreen(s.id)}
                className={`flex flex-col items-center gap-0.5 px-6 py-1 rounded-lg transition-all ${active ? "text-primary" : "text-muted-foreground"}`}
              >
                <Icon className={`w-5 h-5 ${active ? "text-primary" : ""}`} />
                <span className={`text-[10px] font-medium ${active ? "text-primary" : ""}`}>{s.label}</span>
                {active && <div className="w-1 h-1 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>
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
