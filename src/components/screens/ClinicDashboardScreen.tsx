import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { extractTextFromFile } from "@/lib/pdf-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertOctagon,
  AlertTriangle,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileSearch,
  FileText,
  Filter,
  Loader2,
  Printer,
  ShieldAlert,
  Sparkles,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { detectCategory } from "@/lib/detect-category";
import { downloadCaseReportHtml } from "@/lib/case-report-html";

type Priority = "critical" | "high" | "medium" | "low";
type Status = "pending" | "analyzing" | "ready" | "reviewed" | "error";

interface ClinicCase {
  id: string;
  case_ref: string | null;
  case_type: string;
  file_name: string;
  file_path: string | null;
  mime_type: string | null;
  status: Status;
  priority: Priority;
  urgency_label: string | null;
  insight: string | null;
  explanation: string | null;
  recommendation: string | null;
  suspected_area: string | null;
  confidence: number | null;
  suggested_specialist: string | null;
  key_findings: Json | null;
  missing_info: string | null;
  assigned_doctor: string | null;
  detected_category: string | null;
  reviewed_by_email: string | null;
  reviewed_by_user_id: string | null;
  created_at: string;
  reviewed_at: string | null;
}

const PRIORITY_ORDER: Priority[] = ["critical", "high", "medium", "low"];

const priorityMeta: Record<
  Priority,
  { label: string; icon: React.ElementType; tone: string; ring: string; window: string }
> = {
  critical: {
    label: "Critical",
    icon: ShieldAlert,
    tone: "text-destructive",
    ring: "border-destructive/50 bg-destructive/5",
    window: "Immediate review",
  },
  high: {
    label: "High",
    icon: AlertOctagon,
    tone: "text-amber-500",
    ring: "border-amber-500/40 bg-amber-500/5",
    window: "Within 24–48h",
  },
  medium: {
    label: "Medium",
    icon: AlertTriangle,
    tone: "text-primary",
    ring: "border-primary/30 bg-primary/5",
    window: "Routine review",
  },
  low: {
    label: "Low",
    icon: CheckCircle2,
    tone: "text-muted-foreground",
    ring: "border-border bg-card",
    window: "Archive / monitor",
  },
};

type Filt = "all" | "awaiting" | "reviewed" | Priority;

export default function ClinicDashboardScreen() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<ClinicCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filt>("awaiting");
  const [unreadCount, setUnreadCount] = useState(0);

  /* Load + realtime */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setLoading(false);
        return;
      }
      setUserId(user.id);
      const { data, error } = await supabase
        .from("clinic_cases")
        .select("*")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("load cases", error);
        toast.error("Could not load cases");
      } else {
        setCases((data ?? []) as ClinicCase[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  /* Unread notifications count */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const load = async () => {
      const { count } = await supabase
        .from("clinic_notifications")
        .select("id", { count: "exact", head: true })
        .is("read_at", null);
      if (!cancelled) setUnreadCount(count ?? 0);
    };
    load();
    const ch = supabase
      .channel(`clinic_notifications_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`clinic_cases_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "clinic_cases", filter: `user_id=eq.${userId}` },
        (payload) => {
          setCases((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as ClinicCase;
              if (prev.some((c) => c.id === row.id)) return prev;
              return [row, ...prev];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as ClinicCase;
              return prev.map((c) => (c.id === row.id ? row : c));
            }
            if (payload.eventType === "DELETE") {
              return prev.filter((c) => c.id !== (payload.old as ClinicCase).id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId]);

  /* Metrics */
  const metrics = useMemo(() => {
    const awaiting = cases.filter((c) => c.status !== "reviewed");
    const reviewed = cases.filter((c) => c.status === "reviewed");
    const aiReviewed = cases.filter((c) => c.status === "ready" || c.status === "reviewed").length;
    const critical = awaiting.filter((c) => c.priority === "critical").length;
    const urgent = awaiting.filter((c) => c.priority === "critical" || c.priority === "high").length;
    return {
      pending: awaiting.length,
      critical,
      urgent,
      aiReviewed,
      reviewedCount: reviewed.length,
      high: awaiting.filter((c) => c.priority === "high").length,
      medium: awaiting.filter((c) => c.priority === "medium").length,
      low: awaiting.filter((c) => c.priority === "low").length,
    };
  }, [cases]);

  /* Filter + group */
  const filtered = useMemo(() => {
    if (filter === "all") return cases;
    if (filter === "awaiting") return cases.filter((c) => c.status !== "reviewed");
    if (filter === "reviewed") return cases.filter((c) => c.status === "reviewed");
    return cases.filter((c) => c.priority === filter && c.status !== "reviewed");
  }, [cases, filter]);

  const grouped = useMemo(() => {
    const g: Record<Priority, ClinicCase[]> = { critical: [], high: [], medium: [], low: [] };
    for (const c of filtered) {
      g[c.priority].push(c);
    }
    return g;
  }, [filtered]);

  /* Upload */
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    if (!userId) {
      toast.error("Sign in required");
      return;
    }
    const list = Array.from(files);
    if (list.length === 0) return;
    setUploading(true);

    for (const file of list) {
      const filePath = `${userId}/clinic/${Date.now()}-${file.name}`;
      const detected = detectCategory(file);
      try {
        const up = await supabase.storage.from("medical-documents").upload(filePath, file);
        if (up.error) throw up.error;

        const { data: row, error: insErr } = await supabase
          .from("clinic_cases")
          .insert({
            user_id: userId,
            file_name: file.name,
            file_path: filePath,
            mime_type: file.type || null,
            status: "analyzing",
            priority: "medium",
            case_type: detected,
            detected_category: detected,
          })
          .select()
          .single();
        if (insErr || !row) throw insErr ?? new Error("Insert failed");

        let payload: { text?: string; base64?: string; mimeType?: string; fileName: string } = {
          fileName: file.name,
        };
        if (file.type.startsWith("image/")) {
          const buf = await file.arrayBuffer();
          const u8 = new Uint8Array(buf);
          let bin = "";
          for (let i = 0; i < u8.length; i += 8192) bin += String.fromCharCode(...u8.slice(i, i + 8192));
          payload = { fileName: file.name, base64: btoa(bin), mimeType: file.type };
        } else {
          const ex = await extractTextFromFile(file);
          payload = {
            fileName: file.name,
            text: ex.text,
            base64: ex.base64,
            mimeType: ex.mimeType,
          };
        }

        const { data: ai, error: aiErr } = await supabase.functions.invoke("clinic-triage", {
          body: payload,
        });
        if (aiErr) throw aiErr;
        if ((ai as any)?.error) throw new Error((ai as any).error);

        const result = ai as {
          case_type: string;
          priority: Priority;
          urgency_label: string;
          insight: string;
          explanation: string;
          recommendation: string;
          suspected_area?: string;
          confidence?: number;
          suggested_specialist?: string;
          key_findings?: string[];
          missing_info?: string;
        };

        await supabase
          .from("clinic_cases")
          .update({
            status: "ready",
            case_type: result.case_type ?? "document",
            priority: PRIORITY_ORDER.includes(result.priority) ? result.priority : "medium",
            urgency_label: result.urgency_label,
            insight: result.insight,
            explanation: result.explanation,
            recommendation: result.recommendation,
            suspected_area: result.suspected_area ?? null,
            confidence: typeof result.confidence === "number" ? result.confidence : null,
            suggested_specialist: result.suggested_specialist ?? null,
            key_findings: (result.key_findings ?? []) as unknown as Json,
            missing_info: result.missing_info ?? null,
            raw_ai: result as unknown as Json,
          })
          .eq("id", row.id);

        const finalPriority: Priority = PRIORITY_ORDER.includes(result.priority)
          ? result.priority
          : "medium";
        if (finalPriority === "critical" || finalPriority === "high") {
          await supabase.from("clinic_notifications").insert({
            user_id: userId,
            case_id: row.id,
            case_ref: row.case_ref,
            priority: finalPriority,
            title:
              finalPriority === "critical"
                ? `Critical case requires immediate review`
                : `High-priority case awaiting review`,
            body: `${result.case_type ?? detected} · ${result.insight ?? "AI-assisted assessment ready."}`,
          });
        }
      } catch (e) {
        console.error("triage failed", e);
        toast.error(`Failed to process ${file.name}`, {
          description: e instanceof Error ? e.message : undefined,
        });
        await supabase
          .from("clinic_cases")
          .update({ status: "error" })
          .eq("user_id", userId)
          .eq("file_path", filePath);
      }
    }

    setUploading(false);
    toast.success("Cases processed");
  }, [userId]);

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    e.target.value = "";
  };

  /* Render */
  return (
    <div className="pb-32">
      {/* Header */}
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          AI Diagnostic Review
        </p>
        <h1 className="text-3xl font-bold tracking-tight">Diagnostic queue</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {loading ? "Loading…" : (
            <>
              <span className="text-foreground font-semibold">{metrics.pending}</span>
              {" cases pending — "}
              <span className="text-destructive font-semibold">{metrics.critical}</span>
              {" critical · "}
              <span className="text-amber-500 font-semibold">{metrics.high}</span>
              {" high priority"}
            </>
          )}
        </p>
      </header>

      {/* Top metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <Metric icon={ClipboardCheck} label="Pending" value={metrics.pending} />
        <Metric icon={ShieldAlert} label="Critical" value={metrics.critical} tone="destructive" />
        <Metric icon={Sparkles} label="AI pre-reviewed" value={metrics.aiReviewed} tone="primary" />
        <Metric icon={Clock} label="Reviewed" value={metrics.reviewedCount} tone="muted" />
      </div>

      {/* Upload */}
      <div className="mb-5">
        <label className="block">
          <input
            type="file"
            multiple
            accept="application/pdf,image/*"
            className="hidden"
            onChange={onPickFiles}
            disabled={uploading}
          />
          <span
            className={`flex items-center justify-center gap-2 w-full h-12 rounded-xl border border-dashed border-primary/40 bg-primary/5 text-primary text-sm font-medium cursor-pointer transition-colors hover:bg-primary/10 ${
              uploading ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
            ) : (
              <><Upload className="w-4 h-4" /> Upload case (PDF, image, scan, lab report)</>
            )}
          </span>
        </label>
      </div>

      {/* AI insights side panel (mobile = top strip) */}
      {(metrics.urgent > 0 || metrics.low > 0) && !loading && (
        <div className="mb-5 rounded-xl border border-border bg-card p-3">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-[11px] uppercase tracking-wider font-semibold">
              Today's AI insights
            </span>
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {metrics.urgent > 0 && (
              <li>• <span className="text-foreground font-medium">{metrics.urgent}</span> case{metrics.urgent === 1 ? "" : "s"} require urgent specialist review</li>
            )}
            {metrics.low > 0 && (
              <li>• <span className="text-foreground font-medium">{metrics.low}</span> low-risk case{metrics.low === 1 ? "" : "s"} can be reviewed later</li>
            )}
          </ul>
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {(["awaiting", "critical", "high", "medium", "low", "reviewed", "all"] as Filt[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 h-7 text-[11px] uppercase tracking-wider rounded-md border transition-colors whitespace-nowrap ${
              filter === f
                ? "bg-primary text-primary-foreground border-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Lists */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="space-y-6">
          {PRIORITY_ORDER.map((p) =>
            grouped[p].length === 0 ? null : (
              <PriorityGroup
                key={p}
                priority={p}
                items={grouped[p]}
                onOpen={(id) => navigate(`/case/${id}`)}
              />
            ),
          )}
        </div>
      )}

      {/* Disclaimer */}
      <p className="mt-10 text-[11px] text-muted-foreground border-t border-border/40 pt-4">
        AI-assisted review only. Final diagnosis must be confirmed by a licensed clinician.
      </p>
    </div>
  );
}

/* ── Subcomponents ──────────────────────────────────────────────── */

function Metric({
  label,
  value,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: number;
  tone?: "default" | "destructive" | "primary" | "muted";
  icon: React.ElementType;
}) {
  const cls =
    tone === "destructive"
      ? "text-destructive"
      : tone === "primary"
      ? "text-primary"
      : tone === "muted"
      ? "text-muted-foreground"
      : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      </div>
      <p className={`text-2xl font-bold ${cls}`}>{value}</p>
    </div>
  );
}

function PriorityGroup({
  priority,
  items,
  onOpen,
}: {
  priority: Priority;
  items: ClinicCase[];
  onOpen: (id: string) => void;
}) {
  const meta = priorityMeta[priority];
  const Icon = meta.icon;
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${meta.tone}`} />
        <h2 className="text-xs uppercase tracking-wider font-semibold">
          {meta.label}
        </h2>
        <span className="text-xs text-muted-foreground">· {items.length} · {meta.window}</span>
      </div>
      <ul className="space-y-2">
        {items.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onOpen(c.id)}
              className={`w-full text-left rounded-xl border p-3.5 transition-colors hover:bg-card/80 ${meta.ring}`}
            >
              <div className="flex items-start justify-between gap-3 mb-1.5">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">
                    {c.case_ref ?? "C-" + c.id.slice(0, 6).toUpperCase()}
                  </span>
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold">
                    {c.case_type}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                    · {c.file_name}
                  </span>
                </div>
                {c.status === "analyzing" ? (
                  <Badge variant="outline" className="text-[10px] gap-1 shrink-0">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> analyzing
                  </Badge>
                ) : c.status === "error" ? (
                  <Badge variant="destructive" className="text-[10px] shrink-0">error</Badge>
                ) : c.urgency_label ? (
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${meta.tone} border-current/40`}>
                    {c.urgency_label}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm leading-snug">
                {c.insight ?? (c.status === "analyzing" ? "Generating AI-assisted assessment…" : "Awaiting review")}
              </p>
              {(c.suspected_area || c.suggested_specialist) && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {c.suspected_area ? <>Area: <span className="text-foreground">{c.suspected_area}</span></> : null}
                  {c.suspected_area && c.suggested_specialist ? " · " : null}
                  {c.suggested_specialist ? <>Suggest: <span className="text-foreground">{c.suggested_specialist}</span></> : null}
                </p>
              )}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState({ filter }: { filter: Filt }) {
  const isFirstRun = filter === "awaiting" || filter === "all";
  return (
    <div className="text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center">
        <ClipboardCheck className="w-5 h-5 text-primary" />
      </div>
      <h3 className="text-base font-semibold">
        {filter === "reviewed"
          ? "No reviewed cases yet"
          : isFirstRun
          ? "No cases yet"
          : "Backlog is clear"}
      </h3>
      <p className="text-sm text-muted-foreground mt-1">
        {filter === "reviewed"
          ? "Cases marked reviewed will appear here."
          : isFirstRun
          ? "Upload your first case to generate an AI-assisted assessment."
          : "No cases match this filter — try “Awaiting” or “All”."}
      </p>
    </div>
  );
}
