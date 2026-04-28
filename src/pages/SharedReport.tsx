import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Public viewer for a shared health report. Anyone with the link can
 * view it (RLS allows SELECT on non-expired rows). Renders the stored
 * HTML inside a sandboxed iframe so styles cannot escape.
 */
export default function SharedReport() {
  const { token } = useParams<{ token: string }>();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Missing share token."); return; }
    (async () => {
      const { data, error } = await supabase
        .from("shared_health_reports")
        .select("html, expires_at")
        .eq("share_token", token)
        .maybeSingle();
      if (error || !data) { setError("This report link is invalid or has expired."); return; }
      if (new Date(data.expires_at) < new Date()) { setError("This report link has expired."); return; }
      setHtml(data.html);
    })();
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-xl font-semibold mb-2">Report unavailable</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Loading report…</p>
      </div>
    );
  }

  return (
    <iframe
      title="Shared health report"
      srcDoc={html}
      sandbox="allow-same-origin"
      className="w-screen h-screen border-0 block"
    />
  );
}