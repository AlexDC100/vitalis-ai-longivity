import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { HealthProvider } from "@/lib/health-context";
import AuthPage from "@/components/AuthPage";
import { track } from "@/lib/analytics";
import ClinicDashboardScreen from "@/components/screens/ClinicDashboardScreen";
import { Toaster } from "@/components/ui/toaster";
import SettingsSheet from "@/components/SettingsSheet";
import HeaderMenu from "@/components/HeaderMenu";
import VitalisLogo from "@/components/brand/VitalisLogo";
import { toast } from "sonner";

function AppShell() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Sensitive client-side keys that must be wiped on sign-out so the next
  // clinician on a shared device cannot see the previous user's data.
  const SENSITIVE_LOCAL_KEYS = [
    "vitalis_substances",
    "vitalis_family_history",
    "vitalis_prev_diagnosis",
    "vitalis_action_log",
    "vitalis_last_screen",
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
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearSensitiveLocalData();
    setSession(null);
    toast.success("Signed out", { description: "See you soon." });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <AuthPage onGuestLogin={() => {}} />;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-2xl mx-auto relative">
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSignOut={signOut}
      />
      {/* Top Bar — Vitalis logo + clinic label + overflow menu */}
      <div
        className="flex items-center justify-between py-3 border-b border-border/30"
        style={{
          paddingLeft: "max(1.5rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <VitalisLogo variant="icon" size={22} title="Vitalis" />
          <span className="text-[15px] font-bold text-foreground tracking-tight">Vitalis</span>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground border-l border-border/50 pl-2.5 ml-1">
            AI Diagnostic Review
          </span>
        </div>
        <HeaderMenu
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenPreferences={() => setSettingsOpen(true)}
          onOpenQuickActions={() => setSettingsOpen(true)}
          onSignOut={signOut}
        />
      </div>

      {/* Single screen — the clinic dashboard IS the app */}
      <div className="flex-1 overflow-y-auto px-4 pt-6">
        <ClinicDashboardScreen />
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
