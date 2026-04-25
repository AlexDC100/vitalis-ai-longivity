import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { HealthProvider, useHealth } from "@/lib/health-context";
import AuthPage from "@/components/AuthPage";
import { track } from "@/lib/analytics";
import IntakeChatScreen from "@/components/screens/IntakeChatScreen";
import DiagnosisScreen from "@/components/screens/DiagnosisScreen";
import BodyScreen from "@/components/screens/BodyScreen";
import AIDoctorScreen from "@/components/screens/AIDoctorScreen";
import { Toaster } from "@/components/ui/toaster";
import { AlertTriangle, Stethoscope, User, Command as CommandIcon } from "lucide-react";
import CommandPalette, { type PaletteAction } from "@/components/CommandPalette";
import { toast } from "sonner";

type Screen = "diagnosis" | "body" | "doctor";

const SCREEN_STORAGE_KEY = "vitalis_last_screen";
const isScreen = (v: unknown): v is Screen =>
  v === "diagnosis" || v === "body" || v === "doctor";

function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { setIsGuest, setUserId, dataCompleteness } = useHealth();
  const [screen, setScreen] = useState<Screen>(() => {
    if (typeof window === "undefined") return "diagnosis";
    const saved = window.localStorage.getItem(SCREEN_STORAGE_KEY);
    return isScreen(saved) ? saved : "diagnosis";
  });
  const [slideDir, setSlideDir] = useState<"left" | "right">("left");
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const prevScreenRef = useRef<Screen>(screen);

  const screenOrder: Screen[] = ["diagnosis", "body", "doctor"];

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) { setIsGuest(false); setUserId(s.user.id); } else { setUserId(null); }
      setLoading(false);

      // Fire a single, reliable success event covering email + OAuth flows.
      if (event === "SIGNED_IN" && s) {
        const provider = (s.user.app_metadata?.provider ?? "email") as
          | "google"
          | "apple"
          | "email";
        track({
          name: "auth_success",
          method: provider === "google" || provider === "apple" ? provider : "email",
          mode: "sign_in",
        });
      }
    });
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) { setIsGuest(false); setUserId(s.user.id); }
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

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

  const switchScreen = (next: Screen) => {
    const prevIdx = screenOrder.indexOf(prevScreenRef.current);
    const nextIdx = screenOrder.indexOf(next);
    setSlideDir(nextIdx >= prevIdx ? "left" : "right");
    prevScreenRef.current = next;
    setScreen(next);
    try {
      window.localStorage.setItem(SCREEN_STORAGE_KEY, next);
    } catch {
      /* ignore storage errors (private mode, quota) */
    }
  };

  const handlePaletteAction = async (action: PaletteAction) => {
    switch (action) {
      case "upload-document":
        switchScreen("doctor");
        toast.info("Upload a document", {
          description: "Use the upload button in the chat to attach a PDF.",
        });
        break;
      case "start-ai-chat":
        switchScreen("doctor");
        toast.success("AI Doctor ready", {
          description: "Ask anything about your health data.",
        });
        break;
      case "continue-chat":
        switchScreen("doctor");
        toast.info("Resuming chat");
        break;
      case "extract-biomarkers":
        switchScreen("doctor");
        toast.info("Extract biomarkers", {
          description: "Upload a lab report — values will auto-fill your Body screen.",
        });
        break;
      case "refresh-diagnosis":
        switchScreen("diagnosis");
        toast.success("Diagnosis re-check started", {
          description: "Re-running analysis on your latest data.",
        });
        break;
      case "sign-out":
        await supabase.auth.signOut();
        setSession(null);
        toast.success("Signed out", { description: "See you soon." });
        break;
    }
  };

  if (loading || onboarded === null && session) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <AuthPage onGuestLogin={() => {}} />;

  if (onboarded === false) {
    return (
      <IntakeChatScreen
        onComplete={() => {
          if (session) localStorage.setItem(`vitalis_onboarded_${session.user.id}`, "true");
          setOnboarded(true);
        }}
      />
    );
  }

  const navItems: { id: Screen; label: string; icon: React.ElementType }[] = [
    { id: "diagnosis", label: "Diagnosis", icon: AlertTriangle },
    { id: "body", label: "Body", icon: User },
    { id: "doctor", label: "AI Doctor", icon: Stethoscope },
  ];

  const animClass = slideDir === "left" ? "animate-slide-left" : "animate-slide-right";

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto relative">
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNavigate={switchScreen}
        currentScreen={screen}
        onAction={handlePaletteAction}
      />
      {/* Top Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/30">
        <span className="text-base font-bold text-foreground tracking-tight">Vitalis</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setPaletteOpen(true)}
            className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md border border-border/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            aria-label="Open command palette"
          >
            <span>Jump to…</span>
            <kbd className="text-[10px] font-mono bg-muted/50 px-1 rounded">⌘K</kbd>
          </button>
          <button
            onClick={async () => { await supabase.auth.signOut(); setSession(null); }}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Screen */}
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <div key={screen} className={animClass}>
          {screen === "diagnosis" && <DiagnosisScreen />}
          {screen === "body" && <BodyScreen />}
          {screen === "doctor" && <AIDoctorScreen />}
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur-md border-t border-border/30 z-40">
        <div className="max-w-lg mx-auto flex items-center justify-around px-4 py-2">
          {navItems.map(item => {
            const active = screen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => switchScreen(item.id)}
                className={`flex flex-col items-center gap-1 px-6 py-1.5 rounded-xl transition-all ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-[10px] font-semibold">{item.label}</span>
                {active && <div className="w-1 h-1 rounded-full bg-primary" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Mobile floating palette trigger */}
      <button
        onClick={() => setPaletteOpen(true)}
        className="sm:hidden fixed bottom-20 right-4 z-50 w-11 h-11 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center active:scale-95 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Open command palette"
      >
        <CommandIcon className="w-5 h-5" />
      </button>
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
