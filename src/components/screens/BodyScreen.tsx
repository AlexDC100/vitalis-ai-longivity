import { useHealth } from "@/lib/health-context";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubstances } from "@/lib/use-substances";
import { useFamilyHistory } from "@/lib/use-family-history";
import {
  Upload, FileText, Heart, Brain, Activity, Sparkles,
  ChevronRight, User, Dna,
  TrendingUp, TrendingDown, Minus, AlertCircle, Zap, Moon, Wind, Droplets,
  Check, Circle, RefreshCw, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import ScoreRing from "@/components/ScoreRing";
import { runDiagnosis, getAllSystemScores } from "@/lib/diagnosis-engine";

const FAMILY_CONDITIONS = [
  "Heart Disease", "Diabetes", "Cancer", "Alzheimer's", "Stroke",
  "High Blood Pressure", "Obesity", "Autoimmune", "None",
];

const SYSTEM_DISPLAY = [
  { id: "cardiovascular", label: "Cardiovascular", icon: Heart, color: "from-rose-500 to-rose-400" },
  { id: "metabolic",      label: "Metabolic",      icon: Droplets, color: "from-amber-500 to-amber-400" },
  { id: "recovery",       label: "Recovery",       icon: Moon,    color: "from-violet-500 to-violet-400" },
  { id: "hormonal",       label: "Hormonal",       icon: Sparkles, color: "from-emerald-500 to-emerald-400" },
];

function scoreLabel(score: number): { label: string; tone: string } {
  if (score >= 85) return { label: "Excellent", tone: "text-emerald-400" };
  if (score >= 70) return { label: "Good",      tone: "text-primary"      };
  if (score >= 55) return { label: "Fair",      tone: "text-amber-400"    };
  return                   { label: "Needs attention", tone: "text-rose-400" };
}

// Stable hash for fix actions so we can de-dupe across AI runs
function hashFix(text: string): string {
  let h = 0;
  for (let i = 0; i < text.length; i++) {
    h = ((h << 5) - h + text.charCodeAt(i)) | 0;
  }
  return `fix_${Math.abs(h).toString(36)}`;
}

interface AIInsights {
  main_issue: {
    title: string;
    explanation: string;
    severity: "critical" | "high" | "moderate" | "low";
    life_impact: string;
    category: string;
  };
  actions: Array<{
    action: string;
    why: string;
    impact: string;
    category: string;
    urgency: "now" | "this-week" | "this-month";
  }>;
}

interface CompletionRow {
  fix_key: string;
  status: "started" | "done";
}

/**
 * Respect prefers-reduced-motion. Used to gate decorative entrance
 * animations & micro-interactions on the Body page so the experience
 * stays comfortable for vestibular-sensitive users.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener?.("change", onChange);
    return () => mq.removeEventListener?.("change", onChange);
  }, []);
  return reduced;
}

/** Inline skeleton block — matches surrounding card padding/radius. */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-muted animate-pulse ${className}`} />;
}

/**
 * Single source of truth for the shared skeleton reveal duration.
 * Metrics, Profile, Labs, and the Longevity Score all wait for this
 * minimum window before flipping to real content so sections never
 * "pop" independently. Set to 0 when prefers-reduced-motion is on.
 */
const SKELETON_MIN_REVEAL_MS = 280;

/** Cooldown before "Retry scoring" can be tapped again, in ms. */
const RETRY_COOLDOWN_MS = 3000;

/**
 * Lightweight debug-mode hook. Enabled when:
 *   - URL has `?debug=1` (or `?bodyDebug=1`), OR
 *   - localStorage has `body_debug=1`
 * Toggling persists to localStorage so it survives reload.
 */
function useBodyDebug(): { enabled: boolean; toggle: () => void } {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("debug") === "1" || sp.get("bodyDebug") === "1") return true;
      return window.localStorage.getItem("body_debug") === "1";
    } catch { return false; }
  });
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("body-debug", enabled);
    return () => { document.documentElement.classList.remove("body-debug"); };
  }, [enabled]);
  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { window.localStorage.setItem("body_debug", next ? "1" : "0"); } catch {}
      return next;
    });
  }, []);
  return { enabled, toggle };
}

export default function BodyScreen() {
  const {
    profile, updateField, userId, dataCompleteness,
    longevityScore, biologicalAge, chronologicalAge,
  } = useHealth();

  // Collapsibles
  const [showMetrics, setShowMetrics] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showVault, setShowVault] = useState(false);

  // Respect prefers-reduced-motion across all decorative effects.
  const reduceMotion = useReducedMotion();
  const fadeIn = reduceMotion ? "" : "animate-fade-in";
  const fadeInDelayed = (cls: string) => (reduceMotion ? "" : cls);
  const press = reduceMotion ? "" : "active:scale-[0.985]";
  const pressTight = reduceMotion ? "" : "active:scale-95";

  // ─── Debug overlay (hit-area outlines + perf panel + audit) ───
  const debug = useBodyDebug();
  const rootRef = useRef<HTMLDivElement>(null);

  // Vault state
  const [documents, setDocuments] = useState<any[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  /**
   * Shared reveal gate for Metrics, Profile, and Lab reports skeletons.
   * We wait until ALL underlying queries (auth/userId + documents) have
   * resolved AND a minimum reveal window has elapsed before flipping
   * `sectionsReady` to true. This keeps section reveals synchronized so
   * they don't pop in independently as each query resolves.
   */
  const [sectionsReady, setSectionsReady] = useState(false);
  // Bump to force the shared skeleton gate to re-arm (used by "Retry scoring").
  const [revealNonce, setRevealNonce] = useState(0);
  // Timestamp of last retry tap, used for cooldown disable state.
  const [lastRetryAt, setLastRetryAt] = useState(0);
  const [, forceCooldownTick] = useState(0);
  // While cooldown is active, drive a 250ms ticker so the disabled UI updates.
  useEffect(() => {
    if (!lastRetryAt) return;
    const id = setInterval(() => forceCooldownTick(t => t + 1), 250);
    return () => clearInterval(id);
  }, [lastRetryAt]);
  const cooldownRemainingMs = Math.max(0, RETRY_COOLDOWN_MS - (Date.now() - lastRetryAt));
  const retryDisabled = cooldownRemainingMs > 0 || !sectionsReady;

  // ─── In-flight request lifecycle ──────────────────────────────
  // Single AbortController shared with the active fetchInsights call.
  // We abort it on unmount and on each new retry so navigation away/back
  // never produces stale state writes.
  const insightsAbortRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      insightsAbortRef.current?.abort();
      insightsAbortRef.current = null;
    };
  }, []);

  // Mark when the skeleton phase started, so we can measure time-to-first-content.
  const skeletonStartedAtRef = useRef<number>(performance.now());
  useEffect(() => {
    setSectionsReady(false);
    skeletonStartedAtRef.current = performance.now();
    try { performance.mark?.("body:sections-skeleton-start"); } catch {}
    const minRevealMs = reduceMotion ? 0 : SKELETON_MIN_REVEAL_MS;
    const t = setTimeout(() => {
      if (!isMountedRef.current) return;
      if (userId !== undefined && !documentsLoading) {
        setSectionsReady(true);
        const elapsed = Math.round(performance.now() - skeletonStartedAtRef.current);
        // Instrument: time-to-first-content for the synchronized section reveal.
        // eslint-disable-next-line no-console
        console.info("[BodyScreen.metrics] sections.tfc", {
          minRevealMs,
          elapsedMs: elapsed,
          sections: ["longevity", "metrics", "profile", "labs"],
        });
        try {
          performance.mark?.("body:sections-ready");
          // Per-section measures so the in-app perf panel can chart them.
          for (const name of ["longevity", "metrics", "profile", "labs"]) {
            performance.measure?.(
              `body:tfc:${name}`,
              "body:sections-skeleton-start",
              "body:sections-ready",
            );
          }
          performance.measure?.(
            "body:sections-skeleton",
            "body:sections-skeleton-start",
            "body:sections-ready",
          );
        } catch { /* noop */ }
      }
    }, minRevealMs);
    return () => clearTimeout(t);
  }, [userId, documentsLoading, reduceMotion, revealNonce]);

  /**
   * "Retry scoring" — re-arms the shared skeleton gate (so the Longevity
   * Score and the synchronized sections all show their loading state)
   * and re-fetches AI insights. The skeleton stays visible until the new
   * result is ready (gate flips back to true after `SKELETON_MIN_REVEAL_MS`
   * once data settles).
   */
  const retryScoring = useCallback(() => {
    // Cooldown guard — prevent rapid repeated recomputes while skeleton is active.
    if (Date.now() - lastRetryAt < RETRY_COOLDOWN_MS) return;
    setLastRetryAt(Date.now());
    // Cancel any in-flight insights request so a fresh one wins.
    insightsAbortRef.current?.abort();
    insightsAbortRef.current = null;
    setSectionsReady(false);
    setRevealNonce(n => n + 1);
    // Re-fetch AI insights in parallel — the score itself is derived from
    // `profile` synchronously, so the recompute happens on next render.
    if (userId) fetchInsightsRef.current?.();
  }, [userId, lastRetryAt]);
  // Forward-ref hack: fetchInsights is declared below. Wired via ref so we
  // can reference it without re-ordering the entire file.
  const fetchInsightsRef = useRef<(() => void) | null>(null);

  // Family history (RLS-protected `user_family_history` table)
  const { conditions: familyHistory, toggleCondition } = useFamilyHistory();

  // AI insights
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  // Fix completions (DB-backed)
  const [completions, setCompletions] = useState<Record<string, CompletionRow>>({});

  // Trend (DB-backed)
  const [trend, setTrend] = useState<{
    direction: "up" | "down" | "flat";
    deltaYears: number;
    deltaScore: number;
    hasHistory: boolean;
  }>({ direction: "flat", deltaYears: 0, deltaScore: 0, hasHistory: false });

  // AI Chat

  // ─── Fallback diagnosis (used until AI returns) ────────────
  // Substances now come from RLS-protected `user_substances` table.
  const { substances } = useSubstances();

  const fallbackDiagnosis = useMemo(() => runDiagnosis(profile, substances), [profile, substances]);
  const systemResults = useMemo(() => getAllSystemScores(profile, substances), [profile, substances]);

  const systemHealth = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of systemResults) map[s.id] = Math.max(0, Math.min(100, 100 - s.score));
    return map;
  }, [systemResults]);

  // ─── Load documents ────────────────────────────────────────
  useEffect(() => {
    if (!userId) { setDocumentsLoading(false); return; }
    setDocumentsLoading(true);
    (async () => {
      const { data } = await supabase
        .from("medical_documents")
        .select("id, file_name, status, created_at, document_type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setDocuments(data);
      setDocumentsLoading(false);
    })();
  }, [userId]);

  // ─── Load completions ──────────────────────────────────────
  const loadCompletions = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("action_completions")
      .select("fix_key, status")
      .eq("user_id", userId);
    if (data) {
      const map: Record<string, CompletionRow> = {};
      for (const row of data) map[row.fix_key] = row as CompletionRow;
      setCompletions(map);
    }
  }, [userId]);

  useEffect(() => { loadCompletions(); }, [loadCompletions]);

  // ─── Load + compute 30-day trend from DB ───────────────────
  const loadTrend = useCallback(async () => {
    if (!userId) return;
    const since = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data } = await supabase
      .from("health_snapshots")
      .select("snapshot_date, score, bio_age")
      .eq("user_id", userId)
      .gte("snapshot_date", since)
      .order("snapshot_date", { ascending: true });

    if (!data || data.length === 0) {
      setTrend({ direction: "flat", deltaYears: 0, deltaScore: 0, hasHistory: false });
      return;
    }

    // Find the snapshot closest to 30 days ago (or oldest available)
    const target = Date.now() - 30 * 24 * 60 * 60 * 1000;
    let baseline = data[0];
    for (const row of data) {
      if (new Date(row.snapshot_date).getTime() <= target) baseline = row;
    }

    const deltaScore = longevityScore - Number(baseline.score);
    const deltaYears = Math.round((Number(baseline.bio_age) - biologicalAge) * 10) / 10;
    const direction: "up" | "down" | "flat" =
      deltaScore >= 2 ? "up" : deltaScore <= -2 ? "down" : "flat";

    setTrend({ direction, deltaYears, deltaScore, hasHistory: data.length > 1 });
  }, [userId, longevityScore, biologicalAge]);

  // ─── Save today's snapshot (once/day) ──────────────────────
  useEffect(() => {
    if (!userId) return;
    const today = new Date().toISOString().slice(0, 10);
    (async () => {
      await supabase.from("health_snapshots").upsert(
        {
          user_id: userId,
          snapshot_date: today,
          score: longevityScore,
          bio_age: biologicalAge,
          chrono_age: chronologicalAge,
          main_issue: insights?.main_issue?.title ?? fallbackDiagnosis.title,
          risk_score: fallbackDiagnosis.riskScore,
          severity: insights?.main_issue?.severity ?? fallbackDiagnosis.severity,
        },
        { onConflict: "user_id,snapshot_date" }
      );
      loadTrend();
    })();
  }, [userId, longevityScore, biologicalAge, chronologicalAge, insights, fallbackDiagnosis, loadTrend]);

  // ─── Fetch AI insights ─────────────────────────────────────
  const fetchInsights = useCallback(async () => {
    if (!userId) return;
    // Abort any prior call & arm a fresh controller.
    insightsAbortRef.current?.abort();
    const ac = new AbortController();
    insightsAbortRef.current = ac;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const completedFixes = Object.values(completions)
        .filter(c => c.status === "done")
        .map(c => c.fix_key);

      const { data, error } = await supabase.functions.invoke("body-insights", {
        body: {
          profile,
          longevityScore,
          biologicalAge,
          chronologicalAge,
          systemScores: systemHealth,
          completedFixes,
        },
      });

      // If we were aborted (unmount or new retry), discard this result.
      if (ac.signal.aborted || !isMountedRef.current) return;

      if (error) {
        const msg = error.message || "Failed to generate insights";
        setInsightsError(msg);
        toast.error(msg);
      } else if (data?.error) {
        setInsightsError(data.error);
        toast.error(data.error);
      } else if (data?.main_issue && Array.isArray(data?.actions)) {
        setInsights(data as AIInsights);
      } else {
        setInsightsError("Unexpected AI response");
      }
    } catch (e: any) {
      if (ac.signal.aborted || !isMountedRef.current) return;
      setInsightsError(e?.message || "Network error");
    } finally {
      if (isMountedRef.current && insightsAbortRef.current === ac) {
        setInsightsLoading(false);
        insightsAbortRef.current = null;
      }
    }
  }, [userId, profile, longevityScore, biologicalAge, chronologicalAge, systemHealth, completions]);
  useEffect(() => { fetchInsightsRef.current = fetchInsights; }, [fetchInsights]);

  // Auto-fetch insights once on mount when we have a user + meaningful data
  const insightsFetchedRef = useRef(false);
  useEffect(() => {
    if (!userId || insightsFetchedRef.current) return;
    if (dataCompleteness < 10) return; // not enough data yet
    insightsFetchedRef.current = true;
    fetchInsights();
  }, [userId, dataCompleteness, fetchInsights]);

  // ─── Fix check-in flow ─────────────────────────────────────
  const toggleFixStatus = useCallback(async (action: string) => {
    if (!userId) { toast.error("Sign in to track actions"); return; }
    const fixKey = hashFix(action);
    const current = completions[fixKey];
    const nextStatus: "started" | "done" =
      !current ? "started" : current.status === "started" ? "done" : "started";

    // Optimistic
    setCompletions(prev => ({ ...prev, [fixKey]: { fix_key: fixKey, status: nextStatus } }));

    const payload: any = {
      user_id: userId,
      fix_key: fixKey,
      action_text: action,
      status: nextStatus,
    };
    if (nextStatus === "done") payload.completed_at = new Date().toISOString();

    const { error } = await supabase
      .from("action_completions")
      .upsert(payload, { onConflict: "user_id,fix_key" });

    if (error) {
      toast.error("Failed to save");
      loadCompletions();
      return;
    }

    if (nextStatus === "done") {
      toast.success("Done — refreshing insights");
      // After completing a fix, re-run AI to surface what's next
      setTimeout(() => fetchInsights(), 400);
    } else {
      toast.success("Marked started");
    }
  }, [userId, completions, loadCompletions, fetchInsights]);

  // ─── Document upload ───────────────────────────────────────
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || !userId) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("medical-documents").upload(filePath, file);
      if (uploadError) { toast.error("Upload failed: " + uploadError.message); continue; }
      const { data: doc } = await supabase
        .from("medical_documents")
        .insert({ user_id: userId, file_name: file.name, file_path: filePath, document_type: "lab_report", status: "new" })
        .select().single();
      if (doc) {
        setDocuments(prev => [doc, ...prev]);
        toast.success("Uploaded — AI is analyzing...");
        try {
          const { error } = await supabase.functions.invoke("parse-document", { body: { documentId: doc.id, filePath } });
          if (error) {
            toast.error("Analysis failed: " + (error.message || "Unknown error"));
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "error" } : d));
          } else {
            toast.success("Analysis complete!");
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "reviewed" } : d));
            // Re-run insights with new data
            setTimeout(() => fetchInsights(), 600);
          }
        } catch {
          toast.error("Analysis failed.");
          setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "error" } : d));
        }
      }
    }
    setUploading(false);
  }, [userId, fetchInsights]);

  const toggleFamilyCondition = (condition: string) => {
    void toggleCondition(condition);
  };

  // ─── Derived ───────────────────────────────────────────────
  const overall = scoreLabel(longevityScore);

  // Use AI when available, otherwise fall back to local engine
  const displayedIssue = insights?.main_issue
    ? {
        title: insights.main_issue.title,
        explanation: insights.main_issue.explanation,
        lifeImpact: insights.main_issue.life_impact,
        severity: insights.main_issue.severity,
      }
    : fallbackDiagnosis.riskScore > 0
      ? {
          title: fallbackDiagnosis.title,
          explanation: fallbackDiagnosis.explanation,
          lifeImpact: fallbackDiagnosis.lifeImpact,
          severity: fallbackDiagnosis.severity,
        }
      : null;

  const displayedActions = insights?.actions
    ?? fallbackDiagnosis.fixes.slice(0, 3).map(f => ({
      action: f.action, why: f.why, impact: f.impact,
      category: "lifestyle", urgency: f.urgency,
    }));

  const trendMeta =
    !trend.hasHistory     ? { Icon: Minus,        text: "Baseline",  tone: "text-muted-foreground bg-muted border-border" } :
    trend.direction === "up"   ? { Icon: TrendingUp,   text: "Improving", tone: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" } :
    trend.direction === "down" ? { Icon: TrendingDown, text: "Declining", tone: "text-rose-400 bg-rose-400/10 border-rose-400/20" } :
                                 { Icon: Minus,        text: "Stable",    tone: "text-muted-foreground bg-muted border-border" };

  const yearsLine = !trend.hasHistory
    ? "Baseline established · check back in a week"
    : trend.deltaYears > 0 ? `+${trend.deltaYears} years gained over 30 days` :
      trend.deltaYears < 0 ? `${trend.deltaYears} years over 30 days` :
                             `Score ${trend.deltaScore >= 0 ? "+" : ""}${trend.deltaScore} pts over 30 days`;

  return (
    <div ref={rootRef} className={`space-y-7 sm:space-y-8 safe-area-px safe-area-pt safe-area-pb ${fadeIn}`}>

      {/* ══════════ 1. HERO ══════════ */}
      <header className={`text-center space-y-2.5 sm:space-y-3 ${fadeInDelayed("animate-[fade-in_0.5s_ease-out]")}`}>
        <h1 className="text-[28px] leading-tight sm:text-4xl font-bold text-foreground tracking-tight">Your Body</h1>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 px-4">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${trendMeta.tone}`}>
            <trendMeta.Icon className="w-3 h-3" />
            {trendMeta.text}
          </span>
          <span className="text-[11px] text-muted-foreground text-center">{yearsLine}</span>
        </div>
      </header>

      {/* ══════════ 2. LONGEVITY SCORE ══════════ */}
      {!userId || !sectionsReady ? (
        <section
          className="flex flex-col items-center gap-3"
          aria-busy="true"
          aria-label="Computing your longevity score"
        >
          {/* Ring placeholder — matches ScoreRing footprint to prevent layout shift */}
          <div className="sm:hidden">
            <Skeleton className="rounded-full w-[184px] h-[184px]" />
          </div>
          <div className="hidden sm:block">
            <Skeleton className="rounded-full w-[220px] h-[220px]" />
          </div>
          <div className="flex flex-col items-center gap-1.5">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-2.5 w-40" />
          </div>
          <span className="sr-only">Loading longevity score</span>
          {userId && (
            <button
              type="button"
              onClick={retryScoring}
              className={`mt-1 inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-4 py-2.5 rounded-full text-xs font-medium text-muted-foreground hover:text-foreground border border-border bg-card ${pressTight} transition-colors`}
              aria-label="Retry computing longevity score"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry scoring
            </button>
          )}
        </section>
      ) : (
        <section className={`flex flex-col items-center gap-3 ${fadeInDelayed("animate-[scale-in_0.4s_ease-out_0.1s_both] [will-change:transform]")}`}>
          <div className="sm:hidden"><ScoreRing score={longevityScore} size={184} strokeWidth={12} /></div>
          <div className="hidden sm:block"><ScoreRing score={longevityScore} size={220} strokeWidth={14} /></div>
          <div className="text-center">
            <p className={`text-base font-semibold ${overall.tone}`}>{overall.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Bio age <span className="text-foreground font-medium">{biologicalAge}</span> · Actual {chronologicalAge}
            </p>
          </div>
        </section>
      )}

      {/* ══════════ 3. BODY SYSTEMS ══════════ */}
      <section className={`space-y-2.5 sm:space-y-3 ${fadeInDelayed("animate-[fade-in_0.5s_ease-out_0.2s_both]")}`}>
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-foreground">Body systems</h2>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">0–100</span>
        </div>
        <div className="space-y-2 sm:space-y-2.5">
          {SYSTEM_DISPLAY.map((sys, i) => {
            const Icon = sys.icon;
            const score = systemHealth[sys.id] ?? 100;
            const meta = scoreLabel(score);
            return (
              <div
                key={sys.id}
                className={`bg-card border border-border rounded-xl p-3 sm:p-3.5 ${fadeInDelayed("animate-[fade-in_0.4s_ease-out_both]")}`}
                style={reduceMotion ? undefined : { animationDelay: `${0.25 + i * 0.07}s` }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground flex-1">{sys.label}</span>
                  <span className={`text-base font-bold tabular-nums ${meta.tone}`}>{score}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${sys.color} transition-[width] duration-1000 ease-out`}
                    style={{ width: `${score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ══════════ 4. MAIN ISSUE (AI) ══════════ */}
      {displayedIssue ? (
        <section className={`bg-gradient-to-br from-rose-500/10 to-amber-500/5 border border-rose-500/20 rounded-2xl p-4 sm:p-5 space-y-2 ${fadeInDelayed("animate-[fade-in_0.5s_ease-out]")}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Main issue</span>
              {insights && <span className="text-[9px] text-muted-foreground">· AI</span>}
            </div>
            <button
              onClick={fetchInsights}
              disabled={insightsLoading}
              className="min-h-[44px] min-w-[44px] -m-2 p-2 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-95 disabled:opacity-50 transition-all"
              aria-label="Refresh insights"
            >
              {insightsLoading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <RefreshCw className="w-3.5 h-3.5" />}
            </button>
          </div>
          <h3 className="text-lg sm:text-xl font-bold text-foreground tracking-tight leading-tight">{displayedIssue.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{displayedIssue.lifeImpact || displayedIssue.explanation}</p>
          {insightsError && (
            <p className="text-[10px] text-rose-400 mt-1">{insightsError} · Showing local analysis</p>
          )}
        </section>
      ) : insightsLoading ? (
        // Skeleton — hints at the layout of the upcoming "Main issue" card
        // so the transition feels instant when it arrives.
        <section className="bg-card border border-border rounded-2xl p-4 sm:p-5 space-y-3 animate-[fade-in_0.3s_ease-out]">
          <div className="flex items-center gap-2">
            <div className="h-3 w-20 rounded-full bg-muted animate-pulse" />
            <Loader2 className="w-3 h-3 text-primary animate-spin" />
          </div>
          <div className="h-5 w-3/4 rounded-md bg-muted animate-pulse" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-full rounded-full bg-muted animate-pulse" />
            <div className="h-2.5 w-5/6 rounded-full bg-muted animate-pulse" />
          </div>
        </section>
      ) : null}

      {/* ══════════ 5. ACTIONS ══════════ */}
      {displayedActions && displayedActions.length > 0 && (
        <section className={`space-y-2.5 sm:space-y-3 ${fadeInDelayed("animate-[fade-in_0.5s_ease-out]")}`}>
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <h2 className="text-sm font-semibold text-foreground">What to do</h2>
            </div>
            <span className="text-[10px] text-muted-foreground">Tap to start · tap again to mark done</span>
          </div>
          <div className="space-y-2">
            {displayedActions.map((fix, i) => {
              const fixKey = hashFix(fix.action);
              const status = completions[fixKey]?.status; // undefined | 'started' | 'done'
              const isDone = status === "done";
              const isStarted = status === "started";
              return (
                <button
                  key={fixKey}
                  onClick={() => toggleFixStatus(fix.action)}
                  className={`w-full min-h-[64px] text-left bg-card border rounded-xl p-3 sm:p-3.5 flex items-start gap-3 transition-all duration-200 ease-out ${press} ${reduceMotion ? "" : "hover:-translate-y-px"} ${
                    isDone     ? "border-emerald-500/30 bg-emerald-500/5"
                    : isStarted ? "border-primary/40 bg-primary/5"
                    :             "border-border hover:border-primary/30"
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                    isDone     ? "bg-emerald-500 text-background"
                    : isStarted ? "bg-primary/30 text-primary border border-primary"
                    :             "bg-primary/15 text-primary"
                  }`}>
                    {isDone ? <Check className="w-3.5 h-3.5" />
                      : isStarted ? <Circle className="w-2.5 h-2.5 fill-current" />
                      : <span className="text-[11px] font-bold">{i + 1}</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-snug ${isDone ? "text-muted-foreground line-through" : "text-foreground"}`}>
                      {fix.action}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{fix.why}</p>
                    {(isStarted || isDone) && (
                      <p className={`text-[10px] mt-1 font-medium ${isDone ? "text-emerald-400" : "text-primary"}`}>
                        {isDone ? "✓ Done" : "● In progress"}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* ══════════ 6. METRICS ══════════ */}
      <section>
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          className={`w-full min-h-[44px] flex items-center justify-between py-2.5 px-2 rounded-lg ${pressTight} active:bg-muted/40 transition-colors`}
          aria-expanded={showMetrics}
        >
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your metrics</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ease-out ${showMetrics ? "rotate-90" : ""}`} aria-hidden />
        </button>

        <div
          className={`grid ${reduceMotion ? "" : "transition-[grid-template-rows,opacity] duration-300 ease-out"} ${
            showMetrics ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            {!sectionsReady ? (
              <div
                className="grid grid-cols-2 gap-2"
                role="status"
                aria-busy="true"
                aria-live="polite"
                aria-label="Loading your metrics"
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-lg p-2.5 min-h-[72px] space-y-1.5">
                    <Skeleton className="h-2.5 w-12" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
                <span className="sr-only">Loading metrics</span>
              </div>
            ) : (
            <div className="grid grid-cols-2 gap-2">
            {[
              { key: "weight_kg",        label: "Weight",   unit: "kg",  icon: User },
              { key: "resting_hr",       label: "Resting HR", unit: "bpm", icon: Heart },
              { key: "hrv_ms",           label: "HRV",      unit: "ms",  icon: Activity },
              { key: "avg_sleep_hours",  label: "Sleep",    unit: "h",   icon: Moon },
              { key: "vo2_max",          label: "VO₂ max",  unit: "",    icon: Wind },
              { key: "body_fat_pct",     label: "Body fat", unit: "%",   icon: User },
            ].map(m => {
              const Icon = m.icon;
              const val = (profile as any)[m.key];
              return (
                <label key={m.key} className="bg-card border border-border rounded-lg p-2.5 min-h-[72px] flex flex-col justify-center transition-colors hover:border-primary/30 focus-within:border-primary/50 cursor-text">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</span>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={val || ""}
                    onChange={(e) => updateField(m.key as any, parseFloat(e.target.value) || 0)}
                    className="w-full text-base font-semibold tabular-nums bg-transparent text-foreground focus:outline-none min-h-[28px]"
                    placeholder="—"
                  />
                  {m.unit && <span className="text-[10px] text-muted-foreground">{m.unit}</span>}
                </label>
              );
            })}
            </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════ Profile ══════════ */}
      <section>
        <button
          onClick={() => setShowProfile(!showProfile)}
          className={`w-full min-h-[44px] flex items-center justify-between py-2.5 px-2 rounded-lg ${pressTight} active:bg-muted/40 transition-colors`}
          aria-expanded={showProfile}
        >
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Profile & history</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ease-out ${showProfile ? "rotate-90" : ""}`} aria-hidden />
        </button>

        <div
          className={`grid ${reduceMotion ? "" : "transition-[grid-template-rows,opacity] duration-300 ease-out"} ${
            showProfile ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            {!sectionsReady ? (
              <div
                className="bg-card border border-border rounded-xl p-3.5 space-y-3"
                role="status"
                aria-busy="true"
                aria-live="polite"
                aria-label="Loading your profile and family history"
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-8 w-full" /></div>
                  <div className="space-y-1.5"><Skeleton className="h-2.5 w-10" /><Skeleton className="h-8 w-full" /></div>
                </div>
                <div className="space-y-1.5"><Skeleton className="h-2.5 w-24" />
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-6 w-16 rounded-full" />)}
                  </div>
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
                <span className="sr-only">Loading profile</span>
              </div>
            ) : (
            <div className="bg-card border border-border rounded-xl p-3.5 space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Age</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={chronologicalAge || ""}
                  onChange={(e) => {
                    const age = parseInt(e.target.value) || 30;
                    updateField("date_of_birth", `${new Date().getFullYear() - age}-01-01`);
                  }}
                  className="w-full text-sm font-mono bg-muted border border-border rounded-lg px-2 py-2.5 min-h-[44px] text-foreground focus:outline-none focus:border-primary mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Sex</label>
                <select
                  value={profile.sex || ""}
                  onChange={(e) => updateField("sex", e.target.value)}
                  className="w-full text-sm bg-muted border border-border rounded-lg px-2 py-2.5 min-h-[44px] text-foreground focus:outline-none focus:border-primary mt-1"
                >
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Dna className="w-3 h-3 text-muted-foreground" />
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Family history</label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {FAMILY_CONDITIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleFamilyCondition(c)}
                    className={`text-xs min-h-[44px] px-3.5 py-2 rounded-full border transition-all duration-200 ${pressTight} ${
                      familyHistory.includes(c)
                        ? "bg-primary/10 border-primary/30 text-primary font-medium"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >{c}</button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Model accuracy</span>
                <span className="text-xs font-bold text-primary tabular-nums">{dataCompleteness}%</span>
              </div>
              <div className="w-full h-1 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${dataCompleteness}%` }} />
              </div>
            </div>
            </div>
            )}
          </div>
        </div>
      </section>

      {/* ══════════ Vault ══════════ */}
      <section>
        <button
          onClick={() => setShowVault(!showVault)}
          className={`w-full min-h-[44px] flex items-center justify-between py-2.5 px-2 rounded-lg ${pressTight} active:bg-muted/40 transition-colors`}
          aria-expanded={showVault}
        >
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Lab reports {documents.length > 0 && `· ${documents.length}`}
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ease-out ${showVault ? "rotate-90" : ""}`} aria-hidden />
        </button>

        <div
          className={`grid ${reduceMotion ? "" : "transition-[grid-template-rows,opacity] duration-300 ease-out"} ${
            showVault ? "grid-rows-[1fr] opacity-100 mt-2" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden space-y-2">
            <div
              role="button"
              tabIndex={0}
              className={`border-2 border-dashed rounded-xl p-5 min-h-[88px] text-center transition-all duration-200 cursor-pointer ${press} ${dragOver && !reduceMotion ? "border-primary bg-primary/5 scale-[1.01]" : dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file"; input.accept = ".pdf,.jpg,.png"; input.multiple = true;
                input.onchange = (e) => handleFileUpload((e.target as HTMLInputElement).files);
                input.click();
              }}
            >
              {uploading ? (
                <Loader2 className="w-5 h-5 text-primary animate-spin mx-auto" />
              ) : (
                <>
                  <Upload className="w-5 h-5 text-muted-foreground mx-auto mb-1.5" />
                  <p className="text-xs text-muted-foreground">Upload lab reports</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">PDF, JPG, PNG</p>
                </>
              )}
            </div>

            {!sectionsReady && (
              <div
                className="space-y-2"
                role="status"
                aria-busy="true"
                aria-live="polite"
                aria-label="Loading your lab reports"
              >
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-card border border-border rounded-lg p-2.5 min-h-[52px] flex items-center gap-2">
                    <Skeleton className="w-4 h-4 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-2/3" />
                      <Skeleton className="h-2 w-1/3" />
                    </div>
                    <Skeleton className="h-4 w-12 rounded-full" />
                  </div>
                ))}
                <span className="sr-only">Loading lab reports</span>
              </div>
            )}
            {sectionsReady && documents.map(doc => (
              <div key={doc.id} className="bg-card border border-border rounded-lg p-2.5 min-h-[52px] flex items-center gap-2 transition-colors hover:border-primary/30">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${doc.status === "reviewed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {doc.status === "reviewed" ? "Analyzed" : "New"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
