import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, Loader2, Check, TrendingUp } from "lucide-react";

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase puts the recovery token in the URL hash and creates a recovery session.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Also check existing session in case the listener already fired.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => subscription.unsubscribe();
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
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast({ title: "Password updated", description: "You're signed in." });
      setTimeout(() => navigate("/"), 1200);
    } catch (err: any) {
      toast({
        title: "Couldn't update password",
        description: err?.message ?? "Please try again.",
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
        </div>
      </div>
    </div>
  );
}