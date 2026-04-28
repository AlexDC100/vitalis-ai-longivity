import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, Home, AlertTriangle, LogIn } from "lucide-react";
import { toast } from "sonner";

/**
 * A valid share token is the URL-encoded form of base64(18 random bytes) — i.e.
 * exactly 24 chars from the base64 alphabet (URL-safe `-`/`_` accepted, plus
 * optional trailing `=` pad). Validated SYNCHRONOUSLY before any network call.
 */
function isValidShareToken(raw: string | undefined): boolean {
  if (!raw) return false;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { return false; }
  return /^[A-Za-z0-9+/_-]{24}={0,2}$/.test(decoded);
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Cache the absolute `expires_at` in sessionStorage so a page reload can render
 * the "Expires in …" bar instantly. The countdown itself is always derived
 * from the absolute DB timestamp, so it's reload-safe by construction — this
 * cache only avoids the loading flash.
 */
const cacheKey = (token: string) => `vitalis:shared-expiry:${token}`;
function readCachedExpiry(token: string): string | null {
  try { return sessionStorage.getItem(cacheKey(token)); } catch { return null; }
}
function writeCachedExpiry(token: string, isoExpiresAt: string) {
  try { sessionStorage.setItem(cacheKey(token), isoExpiresAt); } catch { /* noop */ }
}
function clearCachedExpiry(token: string) {
  try { sessionStorage.removeItem(cacheKey(token)); } catch { /* noop */ }
}

/**
 * Public viewer for a shared health report.
 * - Selects ONLY the minimal columns (title, html, expires_at) — column-level
 *   grants in the database additionally prevent leakage of user_id/id.
 * - Distinct "Link expired" UI with a clear regenerate path (sign in).
 */
export default function SharedReport() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; html: string; title: string | null; expiresAt: string }
    | { kind: "expired"; expiresAt?: string; title?: string | null }
    | { kind: "missing" }
    | { kind: "invalid" }
    | { kind: "error"; message: string }
  >(() => {
    if (!token) return { kind: "missing" };
    if (!isValidShareToken(token)) return { kind: "invalid" };
    return { kind: "loading" };
  });
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [cachedExpiry, setCachedExpiry] = useState<string | null>(() =>
    token ? readCachedExpiry(token) : null
  );
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!token) { setState({ kind: "missing" }); return; }
    if (!isValidShareToken(token)) { setState({ kind: "invalid" }); return; }
    let cancelled = false;
    (async () => {
      // Use a SECURITY DEFINER RPC so the table itself is not publicly readable.
      // The function only returns a row when the caller supplies the exact token
      // AND the report has not expired — preventing enumeration of all shares.
      const { data: rows, error } = await supabase
        .rpc("get_shared_report", { _token: token });
      const data = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

      if (cancelled) return;
      if (error) {
        // Never leak raw DB errors (table names, RLS messages, UUID parse errors)
        // to anonymous viewers. Log details server/console-side only.
        console.error("[SharedReport] lookup error:", error.message);
        setState({
          kind: "error",
          message: "Something went wrong loading this report. Please try again.",
        });
        return;
      }
      if (!data) { clearCachedExpiry(token); setState({ kind: "missing" }); return; }
      const expired = new Date(data.expires_at).getTime() < Date.now();
      if (expired) {
        clearCachedExpiry(token);
        setState({ kind: "expired", expiresAt: data.expires_at, title: data.title });
        return;
      }
      writeCachedExpiry(token, data.expires_at);
      setCachedExpiry(data.expires_at);
      setState({ kind: "ok", html: data.html, title: data.title, expiresAt: data.expires_at });
    })();
    return () => { cancelled = true; };
  }, [token, refreshNonce]);

  // Track auth state for the "Regenerate share link" sign-in gate.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSignedIn(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setSignedIn(!!session);
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  // Live countdown — only ticks while a valid (not yet expired) report is loaded.
  useEffect(() => {
    // Tick while we have a usable expiry — either the loaded report or the
    // cached expiry shown during reload.
    if (state.kind !== "ok" && !(state.kind === "loading" && cachedExpiry)) return;
    const id = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const exp = state.kind === "ok" ? state.expiresAt : cachedExpiry!;
      if (new Date(exp).getTime() <= t && state.kind === "ok") {
        setState({ kind: "expired", expiresAt: state.expiresAt, title: state.title });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [state, cachedExpiry]);

  const handleRegenerate = (e: React.MouseEvent) => {
    if (signedIn === false) {
      e.preventDefault();
      setShowSignInPrompt(true);
      return;
    }
    // Signed in: confirm + auto-refresh the viewer when the user returns,
    // so a freshly-issued share link's new expiry shows up automatically.
    toast.success("Opening Vitalis to regenerate your link", {
      description: "We'll refresh this view automatically when you return.",
    });
    if (token) clearCachedExpiry(token);
    const onFocus = () => {
      setState({ kind: "loading" });
      setRefreshNonce((n) => n + 1);
      window.removeEventListener("focus", onFocus);
    };
    window.addEventListener("focus", onFocus);
  };

  if (state.kind === "loading") {
    if (cachedExpiry) {
      const remaining = new Date(cachedExpiry).getTime() - now;
      return (
        <div className="w-screen h-screen flex flex-col bg-background">
          <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] border-b border-border/40 bg-secondary/40 text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>Expires in <span className="font-medium tabular-nums">{formatCountdown(remaining)}</span></span>
          </div>
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading report…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading report…</p>
      </div>
    );
  }

  if (state.kind === "invalid") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-semibold mb-1.5">Invalid link</h1>
            <p className="text-sm text-muted-foreground">
              This share link is malformed. Double-check the URL or ask the sender for a fresh one.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full gap-1.5">
            <Link to="/"><Home className="w-3.5 h-3.5" />Open Vitalis</Link>
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "expired") {
    const dateStr = state.expiresAt ? new Date(state.expiresAt).toLocaleString() : "";
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-sm w-full text-center space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-amber-500/10 flex items-center justify-center">
            <Clock className="w-7 h-7 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold mb-1.5">Link expired</h1>
            <p className="text-sm text-muted-foreground">
              {state.title ? `"${state.title}"` : "This shared report"} is no longer available.
            </p>
            {dateStr && (
              <p className="text-[11px] text-muted-foreground/80 mt-1">Expired {dateStr}</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Share links expire after 30 days for privacy. The report owner can generate a new one inside the app.
          </p>
          <Button asChild className="w-full gap-1.5">
            <Link to={signedIn ? "/" : "/"} onClick={handleRegenerate}>
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate share link
            </Link>
          </Button>
          {showSignInPrompt && (
            <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 text-left space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <LogIn className="w-3.5 h-3.5 text-primary" />
                Sign in to regenerate
              </div>
              <p className="text-[11px] text-muted-foreground">
                Only the original report owner can create a new share link. Sign in to your Vitalis account to continue.
              </p>
              <Button asChild size="sm" className="w-full">
                <Link to="/">Sign in</Link>
              </Button>
            </div>
          )}
          <Button asChild variant="outline" className="w-full gap-1.5">
            <Link to="/">
              <Home className="w-3.5 h-3.5" />
              Open Vitalis
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  if (state.kind === "missing" || state.kind === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm space-y-3">
          <h1 className="text-xl font-semibold">Report unavailable</h1>
          <p className="text-sm text-muted-foreground">
            {state.kind === "error"
              ? "Something went wrong loading this report. Please try again."
              : "This report link is invalid or has been removed."}
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/">Open Vitalis</Link>
          </Button>
        </div>
      </div>
    );
  }

  const remaining = new Date(state.expiresAt).getTime() - now;
  const urgent = remaining < 60 * 60 * 1000; // <1h
  return (
    <div className="w-screen h-screen flex flex-col bg-background">
      <div
        className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] border-b border-border/40 ${
          urgent ? "bg-amber-500/10 text-amber-300" : "bg-secondary/40 text-muted-foreground"
        }`}
      >
        <Clock className="w-3 h-3" />
        <span>Expires in <span className="font-medium tabular-nums">{formatCountdown(remaining)}</span></span>
      </div>
      <iframe
        title="Shared health report"
        srcDoc={state.html}
        sandbox="allow-same-origin"
        className="flex-1 w-full border-0 block"
      />
    </div>
  );
}
