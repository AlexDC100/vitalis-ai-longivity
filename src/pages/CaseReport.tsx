import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import VitalisLogo from "@/components/brand/VitalisLogo";
import { ArrowLeft, Loader2, Printer } from "lucide-react";

interface Row {
  id: string;
  case_ref: string | null;
  case_type: string;
  file_name: string;
  status: string;
  priority: "critical" | "high" | "medium" | "low";
  urgency_label: string | null;
  insight: string | null;
  explanation: string | null;
  recommendation: string | null;
  suspected_area: string | null;
  confidence: number | null;
  suggested_specialist: string | null;
  key_findings: unknown;
  missing_info: string | null;
  assigned_doctor: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const priorityWindow: Record<Row["priority"], string> = {
  critical: "Immediate review",
  high: "Within 24–48h",
  medium: "Routine review",
  low: "Archive / monitor",
};

export default function CaseReport() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user || !id) {
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("clinic_cases")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (!cancelled) {
        setRow(data as Row | null);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!row) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted-foreground">Case not found or not accessible.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/")}>
            Back to queue
          </Button>
        </div>
      </div>
    );
  }

  const findings: string[] = Array.isArray(row.key_findings)
    ? (row.key_findings as string[]).filter((f): f is string => typeof f === "string")
    : [];
  const conf = typeof row.confidence === "number" ? Math.round(row.confidence * 100) : null;
  const created = new Date(row.created_at).toLocaleString();

  return (
    <div className="min-h-screen bg-background">
      {/* Toolbar — hidden on print */}
      <header className="sticky top-0 z-20 backdrop-blur-md bg-background/85 border-b border-border/50 print:hidden">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/case/${row.id}`}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to case
            </Link>
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" /> Print / Save as PDF
          </Button>
        </div>
      </header>

      {/* Printable report */}
      <main className="max-w-3xl mx-auto px-6 sm:px-10 py-10 print:py-0 print:max-w-none">
        <div className="bg-card border border-border rounded-xl p-8 sm:p-12 print:bg-white print:text-black print:border-0 print:rounded-none print:shadow-none">
          {/* Letterhead */}
          <div className="flex items-start justify-between border-b border-border pb-5 mb-6 print:border-black/30">
            <div className="flex items-center gap-2.5">
              <VitalisLogo variant="icon" size={22} title="Vitalis" />
              <div>
                <p className="text-[15px] font-bold tracking-tight leading-tight">Vitalis Clinic</p>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground print:text-black/60">
                  AI Diagnostic Review
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground print:text-black/60">
                Case reference
              </p>
              <p className="text-sm font-semibold">
                {row.case_ref ?? "C-" + row.id.slice(0, 6).toUpperCase()}
              </p>
              <p className="text-[10px] text-muted-foreground mt-1 print:text-black/60">{created}</p>
            </div>
          </div>

          {/* Header summary */}
          <h1 className="text-2xl font-bold tracking-tight mb-1">Doctor-ready summary</h1>
          <p className="text-sm text-muted-foreground print:text-black/70">
            {row.case_type} · {row.file_name}
          </p>

          {/* Priority block */}
          <div className="mt-6 grid grid-cols-3 gap-4 border border-border rounded-lg p-4 print:border-black/30">
            <KV label="Priority" value={row.priority.toUpperCase()} />
            <KV label="Review window" value={priorityWindow[row.priority]} />
            <KV label="Confidence" value={conf !== null ? `${conf}%` : "—"} />
          </div>

          {/* Sections */}
          <ReportSection label="Main finding" value={row.insight ?? "—"} />
          <ReportSection label="Why it matters" value={row.explanation ?? "—"} />
          {findings.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 print:text-black/60">
                Key findings
              </p>
              <ul className="space-y-1.5">
                {findings.map((f, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground print:text-black/60">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {row.suspected_area && <ReportSection label="Suspected area" value={row.suspected_area} />}
          {row.suggested_specialist && (
            <ReportSection label="Suggested specialist review" value={row.suggested_specialist} />
          )}
          {row.missing_info && <ReportSection label="Missing information" value={row.missing_info} />}
          {row.recommendation && (
            <ReportSection label="Recommended next step" value={row.recommendation} />
          )}

          {/* Sign-off */}
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-border pt-6 print:border-black/30">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 print:text-black/60">
                Reviewing clinician
              </p>
              <div className="h-10 border-b border-border print:border-black/40" />
              <p className="text-[10px] text-muted-foreground mt-1 print:text-black/60">Name &amp; signature</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 print:text-black/60">
                Date of review
              </p>
              <div className="h-10 border-b border-border print:border-black/40" />
            </div>
          </div>

          {/* Disclaimer */}
          <p className="mt-8 text-[11px] text-muted-foreground border-l-2 border-border pl-3 print:text-black/70 print:border-black/40">
            <strong className="text-foreground print:text-black">AI-assisted review only.</strong> Final diagnosis must be confirmed by a licensed clinician. Vitalis is not a medical device. Output may include possible findings; clinical confirmation is required before any treatment decision.
          </p>
        </div>
      </main>

      {/* Print styles */}
      <style>{`
        @media print {
          @page { margin: 16mm; }
          html, body { background: #fff !important; color: #000 !important; }
        }
      `}</style>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 print:text-black/60">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

function ReportSection({ label, value }: { label: string; value: string }) {
  return (
    <div className="mt-6">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5 print:text-black/60">
        {label}
      </p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}
