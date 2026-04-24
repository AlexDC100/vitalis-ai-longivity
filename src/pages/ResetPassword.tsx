import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Lock,
  Eye,
  EyeOff,
  Loader2,
  Check,
  TrendingUp,
  AlertCircle,
  ArrowLeft,
} from "lucide-react";
import { track } from "@/lib/analytics";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [tokenError, setTokenError] = useState<{
    title: string;
    description: string;
  } | null>(null);

  // Supabase puts the recovery token in the URL hash (#access_token=…&type=recovery)
  // and creates a recovery session via onAuthStateChange.
  useEffect(() => {
    // 1. Surface explicit error params from the URL hash (Supabase puts them there
    //    when the link is invalid/expired/already used).
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const errParam = params.get("error") ?? params.get("error_code");
    const errDesc = params.get("error_description");

    if (errParam) {
      const isExpired = /expired|otp_expired/i.test(errParam) || /expired/i.test(errDesc ?? "");
      const reason = isExpired ? "expired" : errParam;
      track({ name: "password_reset_token_invalid", reason });
      setTokenError(
        isExpired
          ? {
              title: "This reset link has expired",
              description:
                "Reset links are valid for a limited time. Request a new one and try again.",
            }
          : {
              title: "This reset link is invalid",
              description:
                errDesc?.replace(/\+/g, " ") ??
                "The link may have already been used or was tampered with. Request a fresh one.",
            }
      );
      return;
    }

    // 2. Wait for a real recovery session. If none arrives within a short
    //    window, treat the link as invalid (e.g. opened directly without a token).
    let resolved = false;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        resolved = true;
        setReady(true);
      }
    });

    // Also check existing session in case the listener already fired.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        resolved = true;
        setReady(true);
      }
    });

    const timeout = setTimeout(() => {
      if (!resolved) {
        track({ name: "password_reset_token_invalid", reason: "no_session" });
        setTokenError({
          title: "We couldn't verify this reset link",
          description:
            "The link is missing or invalid. Open the most recent email we sent, or request a new reset link.",
        });
      }
    }, 2500);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const handleUpdate = async () => {
    if (password.length < 8) {
      toast({
        title: "Password too short",
        description: "Use at least 8 characters.",
        variant: "destructive",
      });
      return;
    }
    if (password !== confirm) {
      toast({
        title: "Passwords don't match",
        description: "Re-enter the same password in both fields.",
        variant: "destructive",
      });
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      track({ name: "password_reset_completed" });
      setDone(true);
      toast({ title: "Password updated", description: "You're signed in." });
      setTimeout(() => navigate("/"), 1200);
    } catch (err: any) {
      const message = err?.message ?? "Please try again.";
      // Supabase returns "Auth session missing" / "JWT expired" if the recovery
      // session lapsed before submission — surface as token error.
      if (/session|jwt|expired|token/i.test(message)) {
        track({ name: "password_reset_token_invalid", reason: "session_expired" });
        setTokenError({
          title: "Your reset session expired",
          description: "Request a new reset link and try again — it only takes a moment.",
        });
        return;
      }
      toast({
        title: "Couldn't update password",
        description: message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen auth-bg relative overflow-hidden flex items-center justify-center px-6">
      <div className="absolute inset-0 auth-grid-pattern pointer-events-none" />
      <div className="relative w-full max-w-md animate-auth-fade">
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="w-10 h-10 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-primary" />
          </div>
          <span className="text-base font-semibold tracking-tight text-foreground">Vitalis</span>
        </div>

        <div className="auth-glass rounded-3xl p-7 sm:p-9">
          {tokenError ? (
            <div className="flex flex-col items-center text-center py-2">
              <div className="w-12 h-12 rounded-full bg-destructive/15 ring-1 ring-destructive/30 flex items-center justify-center mb-4">
                <AlertCircle className="w-6 h-6 text-destructive" />
              </div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">
                {tokenError.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-2 max-w-xs">
                {tokenError.description}
              </p>
              <Button
                variant="vitalis"
                className="mt-6 w-full h-12 rounded-xl text-sm font-semibold tracking-wide shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_36px_-10px_hsl(var(--primary)/0.8)] hover:-translate-y-0.5 transition-all"
                onClick={() => navigate("/")}
              >
                Request a new reset link
              </Button>
              <Link
                to="/"
                className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to sign in
              </Link>
            </div>
          ) : (
          <>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              Set a new password
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">
              Pick something strong — at least 8 characters.
            </p>

            {!ready ? (
            <div className="mt-8 flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-primary animate-spin" />
            </div>
          ) : done ? (
            <div className="mt-8 flex flex-col items-center justify-center gap-3 py-6 text-center">
              <div className="w-12 h-12 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                <Check className="w-6 h-6 text-primary" />
              </div>
              <p className="text-sm text-foreground font-medium">Password updated</p>
              <p className="text-xs text-muted-foreground">Redirecting…</p>
            </div>
          ) : (
            <div className="mt-7 space-y-3">
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="New password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              <div className="relative group">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Confirm new password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
                  className="w-full h-11 pl-10 pr-4 rounded-xl bg-secondary/60 ring-1 ring-border/50 text-foreground placeholder:text-muted-foreground text-sm focus:ring-2 focus:ring-primary/60 focus:bg-secondary outline-none transition-all"
                />
              </div>
              <Button
                variant="vitalis"
                className="w-full h-12 rounded-xl text-sm font-semibold tracking-wide shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_36px_-10px_hsl(var(--primary)/0.8)] hover:-translate-y-0.5 transition-all"
                onClick={handleUpdate}
                disabled={loading}
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Updating…
                  </span>
                ) : (
                  "Update password"
                )}
              </Button>
            </div>
            )}
          </>
          )}
        </div>
      </div>
    </div>
  );
}