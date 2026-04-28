import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import VitalisLogo from "@/components/brand/VitalisLogo";
import NotificationBell from "@/components/NotificationBell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileText,
  History,
  Loader2,
  Printer,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  UserCheck,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { downloadCaseReportHtml } from "@/lib/case-report-html";
import { extractTextFromFile } from "@/lib/pdf-utils";
import type { Json } from "@/integrations/supabase/types";

type Priority = "critical" | "high" | "medium" | "low";

const REGEN_COOLDOWN_MS = 30_000;

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
  reviewed_by_name: string | null;
  created_at: string;
  reviewed_at: string | null;
  last_regenerated_at: string | null;
}

interface CaseEvent {
  id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  actor_email: string | null;
  actor_name: string | null;
  note: string | null;
  created_at: string;
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
  const [confirmRegenOpen, setConfirmRegenOpen] = useState(false);
  const [lastRegenAt, setLastRegenAt] = useState<number>(0);
  const [now, setNow] = useState<number>(Date.now());
  const [events, setEvents] = useState<CaseEvent[]>([]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

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

  // Load case timeline + realtime
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("clinic_case_events")
        .select("id,event_type,from_status,to_status,actor_email,actor_name,note,created_at")
        .eq("case_id", id)
        .order("created_at", { ascending: true });
      if (!cancelled) setEvents((data ?? []) as CaseEvent[]);
    };
    load();
    const ch = supabase
      .channel(`case_events_${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clinic_case_events", filter: `case_id=eq.${id}` },
        () => load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [id]);

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
  // Cooldown source of truth = server timestamp (persists across refreshes).
  // Local lastRegenAt covers the window between click and DB round-trip.
  const serverRegenMs = row.last_regenerated_at ? new Date(row.last_regenerated_at).getTime() : 0;
  const effectiveRegenAt = Math.max(serverRegenMs, lastRegenAt);
  const cooldownLeft = effectiveRegenAt > 0
    ? Math.max(0, REGEN_COOLDOWN_MS - (now - effectiveRegenAt))
    : 0;
  const cooldownSec = Math.ceil(cooldownLeft / 1000);
  const onCooldown = cooldownLeft > 0;

  const userDisplayName = (
    u: { user_metadata?: Record<string, unknown> } | null,
  ): string | null => {
    if (!u) return null;
    const md = (u.user_metadata ?? {}) as Record<string, unknown>;
    return (
      (md.full_name as string) ||
      (md.name as string) ||
      (md.display_name as string) ||
      null
    );
  };

  const markReviewed = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const name = userDisplayName(user);
    await supabase
      .from("clinic_cases")
      .update({
        status: "reviewed",
        reviewed_at: new Date().toISOString(),
        reviewed_by_user_id: user?.id ?? null,
        reviewed_by_email: user?.email ?? null,
        reviewed_by_name: name,
      })
      .eq("id", row.id);
    if (user?.id) {
      await supabase.from("clinic_case_events").insert({
        user_id: user.id,
        case_id: row.id,
        event_type: "reviewed",
        from_status: row.status,
        to_status: "reviewed",
        actor_email: user.email ?? null,
        actor_name: name,
        note: "Marked as clinician-reviewed",
      });
    }
    toast.success("Marked as reviewed");
    navigate("/");
  };

  const deleteCase = async () => {
    if (!confirm("Delete this case? This cannot be undone.")) return;
    await supabase.from("clinic_cases").delete().eq("id", row.id);
    navigate("/");
  };

  const regenerate = async () => {
    if (!row.file_path) {
      toast.error("Original file not found");
      return;
    }
    if (onCooldown) {
      toast.error(`Please wait ${cooldownSec}s before retrying`);
      return;
    }
    setRegenerating(true);
    const startedAt = new Date();
    setLastRegenAt(startedAt.getTime());
    const { data: { user } } = await supabase.auth.getUser();
    const actorName = userDisplayName(user);
    try {
      await supabase
        .from("clinic_cases")
        .update({
          status: "analyzing",
          last_regenerated_at: startedAt.toISOString(),
        })
        .eq("id", row.id);
      // Reflect locally so cooldown survives a refresh even before realtime fires
      setRow((prev) => prev ? { ...prev, last_regenerated_at: startedAt.toISOString(), status: "analyzing" } : prev);
      if (user?.id) {
        await supabase.from("clinic_case_events").insert({
          user_id: user.id,
          case_id: row.id,
          event_type: "ai_regenerated",
          from_status: row.status,
          to_status: "analyzing",
          actor_email: user.email ?? null,
          actor_name: actorName,
          note: "Clinician requested AI regeneration",
        });
      }
      const { data: blob, error: dlErr } = await supabase.storage
        .from("medical-documents")
        .download(row.file_path);
      if (dlErr || !blob) throw dlErr ?? new Error("Could not download original file");
      const file = new File([blob], row.file_name, { type: row.mime_type ?? blob.type });

      let payload: { text?: string; base64?: string; mimeType?: string; fileName: string } = {
        fileName: file.name,
      };
      if ((file.type || "").startsWith("image/")) {
        const buf = await file.arrayBuffer();
        const u8 = new Uint8Array(buf);
        let bin = "";
        for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.slice(i, i + 8192));
        payload = { fileName: file.name, base64: btoa(bin), mimeType: file.type };
      } else {
        const ex = await extractTextFromFile(file);
        payload = { fileName: file.name, text: ex.text, base64: ex.base64, mimeType: ex.mimeType };
      }

      const { data: ai, error: aiErr } = await supabase.functions.invoke("clinic-triage", {
        body: payload,
      });
      if (aiErr) throw aiErr;
      if ((ai as { error?: string })?.error) throw new Error((ai as { error: string }).error);

      const r = ai as Record<string, unknown>;
      const validPriorities = ["critical", "high", "medium", "low"] as const;
      const newPriority = validPriorities.includes(r.priority as Priority)
        ? (r.priority as Priority)
        : "medium";

      const { data: updated } = await supabase
        .from("clinic_cases")
        .update({
          status: "ready",
          case_type: (r.case_type as string) ?? row.case_type,
          priority: newPriority,
          urgency_label: r.urgency_label as string ?? null,
          insight: r.insight as string ?? null,
          explanation: r.explanation as string ?? null,
          recommendation: r.recommendation as string ?? null,
          suspected_area: (r.suspected_area as string) ?? null,
          confidence: typeof r.confidence === "number" ? r.confidence : null,
          suggested_specialist: (r.suggested_specialist as string) ?? null,
          key_findings: ((r.key_findings as string[]) ?? []) as unknown as Json,
          missing_info: (r.missing_info as string) ?? null,
          raw_ai: r as unknown as Json,
        })
        .eq("id", row.id)
        .select()
        .single();
      if (updated) setRow(updated as Row);
      if (user?.id) {
        await supabase.from("clinic_case_events").insert({
          user_id: user.id,
          case_id: row.id,
          event_type: "status_changed",
          from_status: "analyzing",
          to_status: "ready",
          actor_email: user.email ?? null,
          actor_name: actorName,
          note: `Re-triaged as ${newPriority}`,
        });
      }
      toast.success("AI assessment regenerated");
    } catch (e) {
      console.error("regenerate failed", e);
      await supabase.from("clinic_cases").update({ status: "error" }).eq("id", row.id);
      if (user?.id) {
        await supabase.from("clinic_case_events").insert({
          user_id: user.id,
          case_id: row.id,
          event_type: "ai_failed",
          to_status: "error",
          actor_email: user.email ?? null,
          actor_name: actorName,
          note: e instanceof Error ? e.message : "Regeneration failed",
        });
      }
      toast.error("Regeneration failed", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setRegenerating(false);
    }
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
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <VitalisLogo variant="icon" size={18} />
              <span className="text-[12px] font-semibold tracking-tight">Vitalis</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground border-l border-border/50 pl-2 ml-1">
                Clinic
              </span>
            </div>
            <NotificationBell size="sm" />
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
              We couldn't generate an AI-assisted assessment for this file. You can regenerate the assessment or delete and re-upload it from the queue.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setConfirmRegenOpen(true)}
              disabled={regenerating || onCooldown}
            >
              {regenerating ? (
                <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" /> Regenerating…</>
              ) : onCooldown ? (
                <><Clock className="w-3.5 h-3.5 mr-2" /> Retry in {cooldownSec}s</>
              ) : (
                <><RefreshCw className="w-3.5 h-3.5 mr-2" /> Regenerate AI assessment</>
              )}
            </Button>
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

        {/* Clinician review history */}
        {row.reviewed_at && (
          <section className="rounded-xl border border-border bg-card p-5 mb-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
              Clinician review history
            </p>
            <div className="flex items-start gap-2.5 text-sm">
              <UserCheck className="w-4 h-4 mt-0.5 text-primary" />
              <div>
                <p>
                  Marked reviewed by{" "}
                  <span className="font-semibold">
                    {row.reviewed_by_name ?? row.reviewed_by_email ?? "Clinician"}
                  </span>
                  {row.reviewed_by_name && row.reviewed_by_email && (
                    <span className="text-muted-foreground"> · {row.reviewed_by_email}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(row.reviewed_at).toLocaleString()}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Case timeline */}
        <section className="rounded-xl border border-border bg-card p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Case timeline
            </p>
            <span className="text-[10px] text-muted-foreground">{events.length} event{events.length === 1 ? "" : "s"}</span>
          </div>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground">No timeline events yet.</p>
          ) : (
            <ol className="relative pl-4 border-l border-border/60 space-y-4">
              {events.map((ev) => {
                const I =
                  ev.event_type === "uploaded" ? Upload :
                  ev.event_type === "ai_regenerated" ? RefreshCw :
                  ev.event_type === "ai_failed" ? XCircle :
                  ev.event_type === "reviewed" ? UserCheck :
                  CheckCircle2;
                const tone =
                  ev.event_type === "ai_failed" ? "text-destructive" :
                  ev.event_type === "reviewed" ? "text-primary" :
                  ev.event_type === "ai_regenerated" ? "text-amber-500" :
                  "text-muted-foreground";
                const label =
                  ev.event_type === "uploaded" ? "Case uploaded" :
                  ev.event_type === "ai_regenerated" ? "AI regeneration requested" :
                  ev.event_type === "ai_failed" ? "AI processing failed" :
                  ev.event_type === "reviewed" ? "Clinician marked reviewed" :
                  ev.from_status && ev.to_status ? `Status: ${ev.from_status} → ${ev.to_status}` : "Status change";
                const actor = ev.actor_name ?? ev.actor_email;
                return (
                  <li key={ev.id} className="relative">
                    <span className="absolute -left-[21px] top-1 w-3.5 h-3.5 rounded-full bg-card border border-border flex items-center justify-center">
                      <I className={`w-2.5 h-2.5 ${tone}`} />
                    </span>
                    <p className="text-sm">
                      <span className="font-medium">{label}</span>
                      {actor && <span className="text-muted-foreground"> · {actor}</span>}
                    </p>
                    {ev.note && <p className="text-xs text-muted-foreground mt-0.5">{ev.note}</p>}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(ev.created_at).toLocaleString()}
                    </p>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

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
          {!isProcessing && (
            <Button
              variant="outline"
              onClick={() => setConfirmRegenOpen(true)}
              disabled={regenerating || !row.file_path || onCooldown}
            >
              {regenerating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Regenerating…</>
              ) : onCooldown ? (
                <><Clock className="w-4 h-4 mr-2" /> Retry in {cooldownSec}s</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" /> Regenerate AI assessment</>
              )}
            </Button>
          )}
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

      <AlertDialog open={confirmRegenOpen} onOpenChange={setConfirmRegenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate AI assessment?</AlertDialogTitle>
            <AlertDialogDescription>
              This re-runs AI-assisted triage on the original file and overwrites the current assessment, priority, and key findings. The previous assessment cannot be restored. After regenerating you'll need to wait {Math.round(REGEN_COOLDOWN_MS / 1000)}s before retrying again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRegenOpen(false);
                regenerate();
              }}
            >
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
