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
import { AlertTriangle, Stethoscope, User, Settings as SettingsIcon } from "lucide-react";
import CommandPalette, { type PaletteAction } from "@/components/CommandPalette";
import SettingsSheet from "@/components/SettingsSheet";
import Logo from "@/components/Logo";
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prevScreenRef = useRef<Screen>(screen);

  const screenOrder: Screen[] = ["doctor", "body", "diagnosis"];

  // Sensitive client-side keys that must be wiped on sign-out so the next
  // user on a shared device cannot see the previous user's medical data.
  const SENSITIVE_LOCAL_KEYS = [
    "vitalis_substances",
    "vitalis_family_history",
    "vitalis_prev_diagnosis",
    "vitalis_action_log",
  ];
  const clearSensitiveLocalData = () => {
    try {
      for (const k of SENSITIVE_LOCAL_KEYS) localStorage.removeItem(k);
    } catch {
      /* ignore storage errors */
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s) { setIsGuest(false); setUserId(s.user.id); } else { setUserId(null); }
      setLoading(false);

      if (event === "SIGNED_OUT") {
        clearSensitiveLocalData();
      }

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

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSensitiveLocalData();
    setSession(null);
    toast.success("Signed out", { description: "See you soon." });
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
      case "open-settings":
        setSettingsOpen(true);
        break;
      case "sign-out":
        await signOut();
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
    { id: "doctor", label: "AI Doctor", icon: Stethoscope },
    { id: "body", label: "Body", icon: User },
    { id: "diagnosis", label: "Diagnosis", icon: AlertTriangle },
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
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSignOut={signOut}
      />
      {/* Top Bar */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/20 backdrop-blur-md bg-background/80 sticky top-0 z-30">
        <Logo size={22} />
        <button
          onClick={() => setSettingsOpen(true)}
          className="inline-flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon className="w-[18px] h-[18px]" />
        </button>
      </div>

      {/* Screen */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-24">
        <div key={screen} className={animClass}>
          {screen === "diagnosis" && <DiagnosisScreen />}
          {screen === "body" && <BodyScreen />}
          {screen === "doctor" && <AIDoctorScreen />}
        </div>
      </div>

      {/* Bottom Nav */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-lg mx-auto px-4 pb-3 pt-2">
          <div className="flex items-center justify-between bg-card/80 backdrop-blur-xl border border-border/40 rounded-full shadow-[0_8px_30px_-12px_rgba(0,0,0,0.6)] px-2 py-1.5">
            {navItems.map(item => {
              const active = screen === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => switchScreen(item.id)}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ease-out ${
                    active
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label={item.label}
                  aria-current={active ? "page" : undefined}
                >
                  <item.icon className="w-[18px] h-[18px]" strokeWidth={active ? 2.4 : 2} />
                  {active && (
                    <span className="text-[12px] font-semibold tracking-tight">{item.label}</span>
                  )}
                </button>
              );
            })}
          </div>
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
