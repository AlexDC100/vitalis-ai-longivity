import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { track } from "@/lib/analytics";
import { useToast } from "@/hooks/use-toast";
import {
  Mail,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
} from "lucide-react";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultMode?: "sign_in" | "sign_up";
}

export default function AuthDialog({ open, onOpenChange, defaultMode = "sign_in" }: AuthDialogProps) {
  const [isSignUp, setIsSignUp] = useState(defaultMode === "sign_up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<"google" | "apple" | null>(null);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [lastError, setLastError] = useState<{
    method: "email" | "google" | "apple";
    mode: "sign_in" | "sign_up";
    message: string;
  } | null>(null);
  const { toast } = useToast();

  // Sync default mode whenever the dialog is opened by the parent.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setIsSignUp(defaultMode === "sign_up");
      setForgotMode(false);
      setResetSent(false);
      setLastError(null);
    }
    onOpenChange(next);
  };

  const handleAuth = async () => {
    if (!email || !password) return;
    if (loading || socialLoading) return;
    setLoading(true);
    setLastError(null);
    const mode = isSignUp ? "sign_up" : "sign_in";
    track(
      isSignUp
        ? { name: "auth_create_account_attempt", method: "email" }
        : { name: "auth_sign_in_attempt", method: "email" }
    );
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        track({ name: "auth_success", method: "email", mode: "sign_up" });
        toast({ title: "Account created!", description: "Check your email to verify." });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        track({ name: "auth_success", method: "email", mode: "sign_in" });
      }
    } catch (err: any) {
      const message = err?.message ?? "Something went wrong. Please try again.";
      track({ name: "auth_error", method: "email", mode, message });
      setLastError({ method: "email", mode, message });
      toast({
        title: mode === "sign_up" ? "Couldn't create account" : "Sign in failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: "google" | "apple") => {
    if (socialLoading || loading) return;
    const mode = isSignUp ? "sign_up" : "sign_in";
    track(
      isSignUp
        ? { name: "auth_create_account_attempt", method: provider }
        : { name: "auth_sign_in_attempt", method: provider }
    );
    setSocialLoading(provider);
    setLastError(null);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin,
      });
      if (result.error) {
        const raw = result.error.message ?? "";
        const canceled = /cancel|denied|closed|user.*aborted/i.test(raw);
        const message = canceled
          ? `${provider === "google" ? "Google" : "Apple"} sign-in was canceled. You can try again.`
          : raw || `${provider === "google" ? "Google" : "Apple"} sign-in failed. Please try again.`;
        track({ name: "auth_error", method: provider, mode, message });
        setLastError({ method: provider, mode, message });
        toast({
          title: canceled ? "Sign-in canceled" : "Sign-in failed",
          description: message,
          variant: "destructive",
        });
        setSocialLoading(null);
        return;
      }
      if (!result.redirected) {
        setSocialLoading(null);
      }
    } catch (err: any) {
      const message = err?.message ?? "Network error. Check your connection and try again.";
      track({ name: "auth_error", method: provider, mode, message });
      setLastError({ method: provider, mode, message });
      toast({
        title: "Sign-in failed",
        description: message,
        variant: "destructive",
      });
      setSocialLoading(null);
    }
  };

  const retryLastAuth = () => {
    if (!lastError) return;
    if (lastError.method === "email") handleAuth();
    else handleSocial(lastError.method);
  };

  const handleForgotPassword = async () => {
    if (!email) {
      toast({
        title: "Enter your email",
        description: "Type the email tied to your account first.",
        variant: "destructive",
      });
      return;
    }
    if (resetLoading) return;
    setResetLoading(true);
    track({ name: "password_reset_requested" });
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      track({ name: "password_reset_email_sent" });
      setResetSent(true);
      toast({ title: "Check your inbox", description: "We sent a secure link to reset your password." });
    } catch (err: any) {
      const message = err?.message ?? "Please try again.";
      track({ name: "password_reset_email_error", message });
      toast({
        title: "Couldn't send reset email",
        description: message,
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md p-0 border-border/60 bg-card/95 backdrop-blur-2xl rounded-3xl overflow-hidden">
        <div className="p-6 sm:p-8">
          <DialogTitle className="text-2xl font-bold tracking-tight text-foreground">
            {forgotMode ? "Reset password" : isSignUp ? "Create your account" : "Sign in to Longevity AI"}
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-1.5">
            {forgotMode
              ? "We'll email you a secure link to set a new password."
              : isSignUp
              ? "Start your AI health intelligence journey."
              : "Continue to your health intelligence dashboard."}
          </DialogDescription>

          {!forgotMode && (
            <div className="flex rounded-xl bg-secondary/60 p-1 mt-6 ring-1 ring-border/50">
              <button
                onClick={() => {
                  setIsSignUp(false);
                  track({ name: "auth_tab_switch", to: "sign_in" });
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  !isSignUp
                    ? "bg-primary text-primary-foreground shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.6)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sign in
              </button>
              <button
                onClick={() => {
                  setIsSignUp(true);
                  track({ name: "auth_tab_switch", to: "sign_up" });
                }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${
                  isSignUp
                    ? "bg-primary text-primary-foreground shadow-[0_4px_20px_-6px_hsl(var(--primary)/0.6)]"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Get started
              </button>
            </div>
          )}

          {!forgotMode && (
            <div className="space-y-2.5 mt-5">
              <Button
                variant="social"
                className="w-full h-11 rounded-xl text-sm font-medium hover:bg-secondary/80 hover:ring-1 hover:ring-primary/30 transition-all"
                onClick={() => handleSocial("google")}
                disabled={socialLoading !== null || loading}
              >
                {socialLoading === "google" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                )}
                {socialLoading === "google" ? "Redirecting…" : "Continue with Google"}
              </Button>
              <Button
                variant="social"
                className="w-full h-11 rounded-xl text-sm font-medium hover:bg-secondary/80 hover:ring-1 hover:ring-primary/30 transition-all"
                onClick={() => handleSocial("apple")}
                disabled={socialLoading !== null || loading}
              >
                {socialLoading === "apple" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
                )}
                {socialLoading === "apple" ? "Redirecting…" : "Continue with Apple"}
              </Button>
            </div>
          )}

          {!forgotMode && (
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-border/60" />
              <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">or use email</span>
              <div className="flex-1 h-px bg-border/60" />
            </div>
          )}

          <div className={`space-y-3 ${forgotMode ? "mt-6" : ""}`}>
            <div className="relative group">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (lastError) setLastError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && forgotMode) handleForgotPassword();
                }}
                className="w-full h-11 pl-10 pr-4 rounded-xl bg-secondary/60 ring-1 ring-border/50 text-foreground placeholder:text-muted-foreground text-sm focus:ring-2 focus:ring-primary/60 focus:bg-secondary outline-none transition-all"
              />
            </div>
            {!forgotMode && (
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (lastError) setLastError(null);
                  }}
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
            )}

            {!forgotMode && !isSignUp && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setForgotMode(true);
                    setResetSent(false);
                  }}
                  className="text-xs font-semibold text-primary hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {!forgotMode && lastError && (
              <div role="alert" className="flex items-start gap-3 p-3 rounded-xl bg-destructive/10 ring-1 ring-destructive/30 animate-auth-fade">
                <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-destructive">
                    {lastError.method === "email"
                      ? lastError.mode === "sign_up"
                        ? "Couldn't create account"
                        : "Sign in failed"
                      : `${lastError.method === "google" ? "Google" : "Apple"} sign-in failed`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 break-words">{lastError.message}</p>
                </div>
                <button
                  type="button"
                  onClick={retryLastAuth}
                  disabled={loading || socialLoading !== null}
                  className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-primary/15 ring-1 ring-primary/30 text-[11px] font-semibold text-primary hover:bg-primary/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading || socialLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Retry
                </button>
              </div>
            )}

            {forgotMode ? (
              <Button
                variant="vitalis"
                className="w-full h-12 rounded-xl text-sm font-semibold tracking-wide shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_36px_-10px_hsl(var(--primary)/0.8)] hover:-translate-y-0.5 transition-all"
                onClick={handleForgotPassword}
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Sending link…</span>
                ) : resetSent ? (
                  "Resend reset link"
                ) : (
                  "Send reset link"
                )}
              </Button>
            ) : (
              <Button
                variant="vitalis"
                className="w-full h-12 rounded-xl text-sm font-semibold tracking-wide shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_36px_-10px_hsl(var(--primary)/0.8)] hover:-translate-y-0.5 transition-all"
                onClick={handleAuth}
                disabled={loading || socialLoading !== null}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Please wait…</span>
                ) : isSignUp ? (
                  "Create account"
                ) : (
                  "Sign in"
                )}
              </Button>
            )}
          </div>

          {forgotMode ? (
            <button
              type="button"
              onClick={() => {
                setForgotMode(false);
                setResetSent(false);
              }}
              className="mt-6 mx-auto flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to sign in
            </button>
          ) : (
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {isSignUp ? "Already have an account? " : "New to Longevity AI? "}
              <button onClick={() => setIsSignUp(!isSignUp)} className="text-primary font-semibold hover:underline">
                {isSignUp ? "Sign in" : "Create an account"}
              </button>
            </p>
          )}

          <div className="mt-5 flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <ShieldCheck className="w-3 h-3 text-primary" />
            HIPAA-grade encryption · Private by design
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}