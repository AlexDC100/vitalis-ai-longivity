import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import VitalisLogo from "@/components/brand/VitalisLogo";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileText,
  Loader2,
  Printer,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { downloadCaseReportHtml } from "@/lib/case-report-html";
import { extractTextFromFile } from "@/lib/pdf-utils";
import type { Json } from "@/integrations/supabase/types";

type Priority = "critical" | "high" | "medium" | "low";

interface Row {
  id: string;
  case_ref: string | null;
  case_type: string;
  file_name: string;
  file_path: string | null;
  mime_type: string | null;
  status: string;
  priority: Priority;
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
  detected_category: string | null;
  reviewed_by_user_id: string | null;
  reviewed_by_email: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const meta: Record<Priority, { label: string; icon: React.ElementType; tone: string; window: string }> = {
  critical: { label: "Critical", icon: ShieldAlert, tone: "text-destructive", window: "Immediate review" },
  high: { label: "High", icon: AlertOctagon, tone: "text-amber-500", window: "Within 24–48h" },
  medium: { label: "Medium", icon: AlertTriangle, tone: "text-primary", window: "Routine review" },
  low: { label: "Low", icon: CheckCircle2, tone: "text-muted-foreground", window: "Archive / monitor" },
};

const statusLabel: Record<string, string> = {
  pending: "Uploaded",
  analyzing: "AI processing",
  ready: "Awaiting clinician review",
  reviewed: "Reviewed",
  error: "Processing failed",
};

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      setAuthed(!!user);
      if (!user || !id) {
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("clinic_cases")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("Could not load case");
      } else {
        setRow(data as Row | null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    if (!row?.file_path) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.storage
        .from("medical-documents")
        .createSignedUrl(row.file_path!, 60 * 30);
      if (!cancelled) setDocUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [row?.file_path]);

  if (authed === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted-foreground">Sign-in required to view this case.</p>
          <Button className="mt-4" onClick={() => navigate("/")}>Go to sign in</Button>
        </div>
      </div>
    );
  }

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
          <p className="text-sm text-muted-foreground">Case not found.</p>
          <Button className="mt-4" variant="outline" onClick={() => navigate("/")}>
            Back to queue
          </Button>
        </div>
      </div>
    );
  }

  const m = meta[row.priority];
  const Icon = m.icon;
  const findings: string[] = Array.isArray(row.key_findings)
    ? (row.key_findings as string[]).filter((f): f is string => typeof f === "string")
    : [];
  const conf = typeof row.confidence === "number" ? Math.round(row.confidence * 100) : null;
  const uploadedAt = new Date(row.created_at).toLocaleString();
  const isProcessing = row.status === "analyzing" || row.status === "pending";
  const isError = row.status === "error";

  const markReviewed = async () => {
    await supabase
      .from("clinic_cases")
      .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
      .eq("id", row.id);
    toast.success("Marked as reviewed");
    navigate("/");
  };

  const deleteCase = async () => {
    if (!confirm("Delete this case? This cannot be undone.")) return;
    await supabase.from("clinic_cases").delete().eq("id", row.id);
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 backdrop-blur-md bg-background/85 border-b border-border/50">
        <div className="max-w-3xl mx-auto px-5 h-14 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" /> Queue
          </button>
          <div className="flex items-center gap-2">
            <VitalisLogo variant="icon" size={18} />
            <span className="text-[12px] font-semibold tracking-tight">Vitalis</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border-l border-border/50 pl-2 ml-1">
              Clinic
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-5 py-8 pb-32">
        {/* Title block */}
        <div className="mb-6">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
              {row.case_ref ?? "C-" + row.id.slice(0, 6).toUpperCase()}
            </span>
            <Badge variant="outline" className={`text-[10px] ${m.tone} border-current/40`}>
              <Icon className="w-3 h-3 mr-1" />
              {m.label} · {m.window}
            </Badge>
            {row.urgency_label && (
              <Badge variant="outline" className="text-[10px]">{row.urgency_label}</Badge>
            )}
            {conf !== null && (
              <span className="text-[10px] text-muted-foreground">Confidence {conf}%</span>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            {row.case_type}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> {row.file_name}
          </p>
        </div>

        {/* Case summary */}
        <section className="rounded-xl border border-border bg-card p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
            Case summary
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Document type" value={row.case_type} />
            <Field label="Uploaded" value={uploadedAt} />
            <Field label="Status" value={statusLabel[row.status] ?? row.status} />
            <Field label="Review window" value={m.window} />
          </div>
        </section>

        {/* Processing / error states */}
        {isProcessing && (
          <section className="rounded-xl border border-primary/40 bg-primary/5 p-5 mb-4 flex items-center gap-3">
            <Loader2 className="w-4 h-4 animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold">AI-assisted assessment in progress…</p>
              <p className="text-xs text-muted-foreground">
                Detecting document type, extracting key information and triaging urgency.
              </p>
            </div>
          </section>
        )}
        {isError && (
          <section className="rounded-xl border border-destructive/40 bg-destructive/5 p-5 mb-4">
            <p className="text-sm font-semibold text-destructive">Processing failed</p>
            <p className="text-xs text-muted-foreground mt-1">
              We couldn't generate an AI-assisted assessment for this file. You can delete and re-upload it from the queue.
            </p>
          </section>
        )}

        {/* AI assessment */}
        {!isProcessing && !isError && (
        <section className="rounded-xl border border-border bg-card p-5 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
            AI-assisted assessment
          </p>
          <Field label="Main finding" value={row.insight ?? "—"} />
          <Field label="Why it matters" value={row.explanation ?? "—"} />
          {findings.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Key findings
              </p>
              <ul className="space-y-1">
                {findings.map((f, i) => (
                  <li key={i} className="text-sm flex gap-2">
                    <span className="text-muted-foreground">•</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {row.suspected_area && <Field label="Suspected area of concern" value={row.suspected_area} />}
          {row.suggested_specialist && (
            <Field label="Suggested specialist review" value={row.suggested_specialist} />
          )}
          {row.missing_info && <Field label="Missing information" value={row.missing_info} />}
          {row.recommendation && <Field label="Recommended next step" value={row.recommendation} />}
        </section>
        )}

        {/* Document preview */}
        {row.file_path && (
          <section className="rounded-xl border border-border bg-card p-5 mb-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
              Uploaded document
            </p>
            {docUrl ? (
              row.mime_type?.startsWith("image/") ? (
                <img
                  src={docUrl}
                  alt={row.file_name}
                  className="max-h-[480px] w-full object-contain rounded-lg border border-border bg-background"
                />
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground truncate">{row.file_name}</p>
                  <a
                    href={docUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Open document
                  </a>
                </div>
              )
            ) : (
              <p className="text-sm text-muted-foreground">Loading preview…</p>
            )}
          </section>
        )}

        {/* Disclaimer */}
        <p className="text-[11px] text-muted-foreground border-l-2 border-border pl-3 mb-6">
          AI-assisted review only. This output may include possible findings and is intended to support — not replace — a licensed clinician's diagnostic judgement.
        </p>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to={`/case/${row.id}/report`}>
              <Printer className="w-4 h-4 mr-2" />
              Doctor-ready report
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => downloadCaseReportHtml(row)}
            disabled={isProcessing || isError}
          >
            <Download className="w-4 h-4 mr-2" />
            Download HTML
          </Button>
          {row.status !== "reviewed" ? (
            <Button variant="outline" onClick={markReviewed}>
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Mark reviewed
            </Button>
          ) : (
            <Badge variant="outline" className="h-9 px-3 text-xs">Reviewed</Badge>
          )}
          <Button variant="ghost" onClick={deleteCase} className="text-destructive hover:text-destructive">
            <Trash2 className="w-4 h-4 mr-2" />
            Delete
          </Button>
        </div>
      </main>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-4 last:mb-0">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{value}</p>
    </div>
  );
}
