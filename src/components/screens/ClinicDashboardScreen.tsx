import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { extractTextFromFile } from "@/lib/pdf-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

type Priority = "high" | "medium" | "low";
type Status = "pending" | "analyzing" | "ready" | "reviewed" | "error";

interface ClinicCase {
  id: string;
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
  created_at: string;
  reviewed_at: string | null;
}

const PRIORITY_ORDER: Priority[] = ["high", "medium", "low"];

const priorityMeta: Record<Priority, { label: string; icon: React.ElementType; tone: string; ring: string }> = {
  high: {
    label: "High priority",
    icon: AlertOctagon,
    tone: "text-destructive",
    ring: "border-destructive/40 bg-destructive/5",
  },
  medium: {
    label: "Medium priority",
    icon: AlertTriangle,
    tone: "text-amber-500",
    ring: "border-amber-500/30 bg-amber-500/5",
  },
  low: {
    label: "Low priority",
    icon: CheckCircle2,
    tone: "text-primary",
    ring: "border-primary/30 bg-primary/5",
  },
};

export default function ClinicDashboardScreen() {
  const [cases, setCases] = useState<ClinicCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  /* ── Load session + cases ─────────────────────────────────────── */
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

  /* ── Realtime updates ─────────────────────────────────────────── */
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

  const counts = useMemo(() => {
    const pending = cases.filter((c) => c.status !== "reviewed");
    return {
      total: pending.length,
      high: pending.filter((c) => c.priority === "high").length,
      medium: pending.filter((c) => c.priority === "medium").length,
      low: pending.filter((c) => c.priority === "low").length,
    };
  }, [cases]);

  const grouped = useMemo(() => {
    const g: Record<Priority, ClinicCase[]> = { high: [], medium: [], low: [] };
    for (const c of cases) {
      if (c.status === "reviewed") continue;
      g[c.priority].push(c);
    }
    return g;
  }, [cases]);

  const reviewed = useMemo(() => cases.filter((c) => c.status === "reviewed"), [cases]);

  /* ── Upload + triage ──────────────────────────────────────────── */
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
      try {
        // Upload original
        const up = await supabase.storage.from("medical-documents").upload(filePath, file);
        if (up.error) throw up.error;

        // Insert pending row
        const { data: row, error: insErr } = await supabase
          .from("clinic_cases")
          .insert({
            user_id: userId,
            file_name: file.name,
            file_path: filePath,
            mime_type: file.type || null,
            status: "analyzing",
            priority: "medium",
            case_type: "document",
          })
          .select()
          .single();
        if (insErr || !row) throw insErr ?? new Error("Insert failed");

        // Extract text / image
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
            raw_ai: result as unknown as Json,
          })
          .eq("id", row.id);
      } catch (e) {
        console.error("triage failed", e);
        toast.error(`Failed to process ${file.name}`, {
          description: e instanceof Error ? e.message : undefined,
        });
        // Best-effort error mark — find latest row matching this file
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

  const markReviewed = async (id: string) => {
    await supabase
      .from("clinic_cases")
      .update({ status: "reviewed", reviewed_at: new Date().toISOString() })
      .eq("id", id);
    setActiveId(null);
    toast.success("Marked as reviewed");
  };

  const deleteCase = async (id: string) => {
    await supabase.from("clinic_cases").delete().eq("id", id);
    setActiveId(null);
  };

  const active = activeId ? cases.find((c) => c.id === activeId) ?? null : null;

  /* ── Render ───────────────────────────────────────────────────── */
  return (
    <div className="pb-32">
      {/* Header */}
      <header className="mb-6">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
          Clinic dashboard
        </p>
        <h1 className="text-3xl font-bold text-foreground tracking-tight">
          Diagnostic backlog
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          {loading ? "Loading…" : (
            <>
              <span className="text-foreground font-semibold">{counts.total}</span>
              {" cases pending — "}
              <span className="text-destructive font-semibold">{counts.high}</span>
              {" high priority"}
            </>
          )}
        </p>
      </header>

      {/* Counts */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        <CountTile label="High" value={counts.high} tone="destructive" />
        <CountTile label="Medium" value={counts.medium} tone="amber" />
        <CountTile label="Low" value={counts.low} tone="primary" />
      </div>

      {/* Upload */}
      <div className="mb-6">
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
              <><Upload className="w-4 h-4" /> Add cases (PDF, image, scan)</>
            )}
          </span>
        </label>
      </div>

      {/* Lists */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : counts.total === 0 ? (
        <EmptyState />
      ) : (
        <div className="space-y-6">
          {PRIORITY_ORDER.map((p) =>
            grouped[p].length === 0 ? null : (
              <PriorityGroup
                key={p}
                priority={p}
                items={grouped[p]}
                onOpen={(id) => setActiveId(id)}
              />
            ),
          )}
        </div>
      )}

      {reviewed.length > 0 && (
        <details className="mt-8 group">
          <summary className="cursor-pointer text-xs uppercase tracking-wider text-muted-foreground select-none">
            Reviewed ({reviewed.length})
          </summary>
          <ul className="mt-3 space-y-1.5">
            {reviewed.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between text-xs text-muted-foreground p-2 rounded-md hover:bg-card cursor-pointer"
                onClick={() => setActiveId(c.id)}
              >
                <span className="truncate">{c.case_type} · {c.file_name}</span>
                <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Detail sheet */}
      <Sheet open={!!active} onOpenChange={(o) => !o && setActiveId(null)}>
        <SheetContent side="bottom" className="h-[85vh] overflow-y-auto p-0">
          {active && (
            <CaseDetail
              c={active}
              onClose={() => setActiveId(null)}
              onReviewed={() => markReviewed(active.id)}
              onDelete={() => deleteCase(active.id)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* ── Subcomponents ──────────────────────────────────────────────── */

function CountTile({ label, value, tone }: { label: string; value: number; tone: "destructive" | "amber" | "primary" }) {
  const toneCls =
    tone === "destructive"
      ? "text-destructive"
      : tone === "amber"
      ? "text-amber-500"
      : "text-primary";
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${toneCls}`}>{value}</p>
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
        <h2 className="text-xs uppercase tracking-wider font-semibold text-foreground">
          {meta.label}
        </h2>
        <span className="text-xs text-muted-foreground">· {items.length}</span>
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
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-foreground">
                    {c.case_type}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    · {c.file_name}
                  </span>
                </div>
                {c.status === "analyzing" ? (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" /> analyzing
                  </Badge>
                ) : c.status === "error" ? (
                  <Badge variant="destructive" className="text-[10px]">error</Badge>
                ) : c.urgency_label ? (
                  <Badge variant="outline" className={`text-[10px] ${meta.tone} border-current/40`}>
                    {c.urgency_label}
                  </Badge>
                ) : null}
              </div>
              <p className="text-sm text-foreground leading-snug">
                {c.insight ?? (c.status === "analyzing" ? "Generating AI-assisted insight…" : "Awaiting review")}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="text-center py-16 px-6">
      <div className="w-12 h-12 rounded-full bg-primary/10 mx-auto mb-3 flex items-center justify-center">
        <Plus className="w-5 h-5 text-primary" />
      </div>
      <h3 className="text-base font-semibold text-foreground">Backlog is clear</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Add a case to start triage.
      </p>
    </div>
  );
}

function CaseDetail({
  c,
  onClose,
  onReviewed,
  onDelete,
}: {
  c: ClinicCase;
  onClose: () => void;
  onReviewed: () => void;
  onDelete: () => void;
}) {
  const meta = priorityMeta[c.priority];
  const Icon = meta.icon;
  const [docUrl, setDocUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!c.file_path) return;
      const { data } = await supabase.storage
        .from("medical-documents")
        .createSignedUrl(c.file_path, 600);
      if (!cancelled) setDocUrl(data?.signedUrl ?? null);
    })();
    return () => { cancelled = true; };
  }, [c.file_path]);

  return (
    <div className="px-5 py-4">
      <SheetHeader className="px-0 mb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${meta.tone}`} />
              <span className={`text-[11px] uppercase tracking-wider font-semibold ${meta.tone}`}>
                {meta.label}
              </span>
              {c.urgency_label && (
                <Badge variant="outline" className="text-[10px]">
                  {c.urgency_label}
                </Badge>
              )}
            </div>
            <SheetTitle className="text-xl">{c.case_type}</SheetTitle>
            <SheetDescription className="truncate">{c.file_name}</SheetDescription>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-md hover:bg-card text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </SheetHeader>

      {c.status === "analyzing" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Generating AI-assisted insight…
        </div>
      ) : c.status === "error" ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          Could not process this file. Try re-uploading.
        </div>
      ) : (
        <div className="space-y-5">
          <Section label="AI-assisted insight">
            <p className="text-base font-semibold text-foreground leading-snug">
              {c.insight ?? "—"}
            </p>
          </Section>
          {c.explanation && (
            <Section label="Explanation">
              <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap">
                {c.explanation}
              </p>
            </Section>
          )}
          {c.recommendation && (
            <Section label="Suggested review">
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
                <p className="text-sm text-foreground leading-relaxed">{c.recommendation}</p>
              </div>
            </Section>
          )}
        </div>
      )}

      {docUrl && (
        <Section label="Uploaded document" className="mt-6">
          <a
            href={docUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <FileText className="w-4 h-4" /> Open original
          </a>
        </Section>
      )}

      <div className="flex items-center gap-2 mt-8 sticky bottom-0 bg-background pt-4 pb-2 -mx-5 px-5 border-t border-border/30">
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="w-4 h-4" />
          Remove
        </Button>
        <div className="flex-1" />
        {c.status !== "reviewed" && (
          <Button variant="vitalis" size="sm" onClick={onReviewed} disabled={c.status === "analyzing"}>
            <CheckCircle2 className="w-4 h-4" />
            Mark reviewed
          </Button>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground mt-4 text-center">
        AI-assisted insight only — not a diagnosis. Final judgment rests with the clinician.
      </p>
    </div>
  );
}

function Section({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
        {label}
      </p>
      {children}
    </div>
  );
}