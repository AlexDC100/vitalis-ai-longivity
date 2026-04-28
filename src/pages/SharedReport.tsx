import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Clock, RefreshCw, Home } from "lucide-react";

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
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    if (!token) { setState({ kind: "missing" }); return; }
    (async () => {
      const { data, error } = await supabase
        .from("shared_health_reports")
        .select("title, html, expires_at")
        .eq("share_token", token)
        .maybeSingle();

      if (error) { setState({ kind: "error", message: error.message }); return; }
      if (!data) { setState({ kind: "missing" }); return; }
      const expired = new Date(data.expires_at).getTime() < Date.now();
      if (expired) {
        setState({ kind: "expired", expiresAt: data.expires_at, title: data.title });
        return;
      }
      setState({ kind: "ok", html: data.html, title: data.title, expiresAt: data.expires_at });
    })();
  }, [token]);

  if (state.kind === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading report…</p>
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
            <Link to="/">
              <RefreshCw className="w-3.5 h-3.5" />
              Regenerate share link
            </Link>
          </Button>
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
            {state.kind === "error" ? state.message : "This report link is invalid or has been removed."}
          </p>
          <Button asChild variant="outline" className="mt-2">
            <Link to="/">Open Vitalis</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title="Shared health report"
      srcDoc={state.html}
      sandbox="allow-same-origin"
      className="w-screen h-screen border-0 block"
    />
  );
}
