import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import {
  TrendingUp,
  Mail,
  Lock,
  Eye,
  EyeOff,
  FileText,
  Activity,
  Stethoscope,
  LineChart,
  Check,
  Sparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onGuestLogin: () => void;
}

export default function AuthPage({ onGuestLogin }: Props) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fire once when the pricing preview is rendered (left column on lg+).
  useEffect(() => {
    track({ name: "pricing_preview_view", plan: "Pro" });
  }, []);

  const handleAuth = async () => {
    if (!email || !password) return;
    setLoading(true);
    const mode = isSignUp ? "sign_up" : "sign_in";
    track(
      isSignUp
        ? { name: "auth_create_account_attempt", method: "email" }
        : { name: "auth_sign_in_attempt", method: "email" }
    );
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        track({ name: "auth_success", method: "email", mode: "sign_up" });
        toast({ title: "Account created!", description: "Check your email to verify." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        track({ name: "auth_success", method: "email", mode: "sign_in" });
      }
    } catch (err: any) {
      track({ name: "auth_error", method: "email", mode, message: err?.message });
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: "google" | "apple") => {
    const mode = isSignUp ? "sign_up" : "sign_in";
    track(
      isSignUp
        ? { name: "auth_create_account_attempt", method: provider }
        : { name: "auth_sign_in_attempt", method: provider }
    );
    const result = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      track({ name: "auth_error", method: provider, mode, message: result.error.message });
      toast({ title: "Error", description: result.error.message, variant: "destructive" });
    }
    // Note: on success the browser redirects; the final `auth_success`
    // event fires from the auth-state listener below (covers OAuth too).
  };

  const features = [
    { icon: FileText, label: "Upload health documents" },
    { icon: Activity, label: "Connect devices" },
    { icon: Stethoscope, label: "AI doctor explanations" },
    { icon: LineChart, label: "Track your health" },
  ];

  const plans = [
    { name: "Free trial", price: "$0", note: "7 days", highlight: false },
    { name: "Starter", price: "$20", note: "/ month", highlight: false },
    { name: "Pro", price: "$50", note: "/ month", highlight: true },
  ];

  return (
    <div className="min-h-screen auth-bg relative overflow-hidden">
      <div className="absolute inset-0 auth-grid-pattern pointer-events-none" />

      <div className="relative min-h-screen w-full flex flex-col lg:grid lg:grid-cols-2">
        {/* LEFT — Product story */}
        <section className="flex flex-col justify-center px-6 sm:px-10 lg:px-16 xl:px-24 pt-12 lg:pt-0 pb-8 lg:pb-0 animate-auth-fade">
          <div className="max-w-xl">
            {/* Brand */}
            <div className="flex items-center gap-3 mb-10">
              <div className="w-10 h-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <span className="text-base font-semibold tracking-tight text-foreground">Vitalis</span>
            </div>

            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20 mb-6">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
                AI Health Platform
              </span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-foreground leading-[1.05]">
              Your AI Doctor
              <br />
              <span className="bg-gradient-to-r from-primary via-primary to-[hsl(var(--vitalis-info))] bg-clip-text text-transparent">
                for everyday health
              </span>{" "}
              <span className="text-foreground">decisions</span>
            </h1>

            {/* Subtext */}
            <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-lg">
              Upload reports, connect devices, and get clear medical insights in minutes — built around your biology, not a generic chart.
            </p>

            {/* Features */}
            <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg">
              {features.map((f) => (
                <li
                  key={f.label}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl bg-card/40 ring-1 ring-border/50 backdrop-blur-sm"
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                    <f.icon className="w-4 h-4 text-primary" />
                  </div>
                  <span className="text-sm font-medium text-foreground">{f.label}</span>
                </li>
              ))}
            </ul>

            {/* Pricing preview */}
            <div className="mt-10 hidden sm:block">
              <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase mb-3">
                Simple pricing
              </p>
              <div className="flex flex-wrap gap-2.5">
                {plans.map((p) => (
                  <div
                    key={p.name}
                    className={`px-4 py-2.5 rounded-xl ring-1 transition-all ${
                      p.highlight
                        ? "bg-primary/10 ring-primary/40 shadow-[0_0_30px_-10px_hsl(var(--primary)/0.5)]"
                        : "bg-card/40 ring-border/50"
                    }`}
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className={`text-base font-bold ${p.highlight ? "text-primary" : "text-foreground"}`}>
                        {p.price}
                      </span>
                      <span className="text-[11px] text-muted-foreground">{p.note}</span>
                    </div>
                    <p className={`text-[11px] mt-0.5 ${p.highlight ? "text-primary/90 font-semibold" : "text-muted-foreground"}`}>
                      {p.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT — Login card */}
        <section className="flex items-center justify-center px-6 sm:px-10 lg:px-12 pb-12 lg:pb-0 animate-auth-fade">
          <div className="w-full max-w-md">
            <div className="auth-glass rounded-3xl p-7 sm:p-9">
              {/* Header */}
              <div className="mb-7">
                <h2 className="text-2xl font-bold text-foreground tracking-tight">
                  {isSignUp ? "Create your account" : "Welcome back"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {isSignUp ? "Start your longevity journey today." : "Sign in to continue to Vitalis."}
                </p>
              </div>

              {/* Tabs */}
              <div className="flex rounded-xl bg-secondary/60 p-1 mb-6 ring-1 ring-border/50">
                <button
                  onClick={() => {
                    setIsSignUp(false);
                    track({ name: "auth_tab_switch", to: "sign_in" });
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    !isSignUp
                      ? "bg-primary text-primary-foreground shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.6)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Sign In
                </button>
                <button
                  onClick={() => {
                    setIsSignUp(true);
                    track({ name: "auth_tab_switch", to: "sign_up" });
                  }}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                    isSignUp
                      ? "bg-primary text-primary-foreground shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.6)]"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Social */}
              <div className="space-y-2.5">
                <Button
                  variant="social"
                  className="w-full h-11 rounded-xl text-sm font-medium hover:bg-secondary/80 hover:ring-1 hover:ring-primary/30 transition-all"
                  onClick={() => handleSocial("google")}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                  Continue with Google
                </Button>
                <Button
                  variant="social"
                  className="w-full h-11 rounded-xl text-sm font-medium hover:bg-secondary/80 hover:ring-1 hover:ring-primary/30 transition-all"
                  onClick={() => handleSocial("apple")}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                  Continue with Apple
                </Button>
              </div>

              {/* Divider */}
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-border/60" />
                <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                  or use email
                </span>
                <div className="flex-1 h-px bg-border/60" />
              </div>

              {/* Email form */}
              <div className="space-y-3">
                <div className="relative group">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-xl bg-secondary/60 ring-1 ring-border/50 text-foreground placeholder:text-muted-foreground text-sm focus:ring-2 focus:ring-primary/60 focus:bg-secondary outline-none transition-all"
                  />
                </div>
                <div className="relative group">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAuth()}
                    className="w-full h-11 pl-10 pr-10 rounded-xl bg-secondary/60 ring-1 ring-border/50 text-foreground placeholder:text-muted-foreground text-sm focus:ring-2 focus:ring-primary/60 focus:bg-secondary outline-none transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                <Button
                  variant="vitalis"
                  className="w-full h-12 rounded-xl text-sm font-semibold tracking-wide shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_36px_-10px_hsl(var(--primary)/0.8)] hover:-translate-y-0.5 transition-all"
                  onClick={handleAuth}
                  disabled={loading}
                >
                  {loading ? "Please wait…" : isSignUp ? "Create Account" : "Sign In"}
                </Button>
              </div>

              {/* Footer link */}
              <p className="mt-6 text-center text-xs text-muted-foreground">
                {isSignUp ? "Already have an account? " : "New to Vitalis? "}
                <button
                  onClick={() => setIsSignUp(!isSignUp)}
                  className="text-primary font-semibold hover:underline"
                >
                  {isSignUp ? "Sign in" : "Create an account"}
                </button>
              </p>
            </div>

            {/* Trust strip */}
            <div className="flex items-center justify-center gap-4 mt-5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> HIPAA-grade</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> Encrypted</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> No spam</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
