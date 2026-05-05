import { useHealth } from "@/lib/health-context";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSubstances } from "@/lib/use-substances";
import { useFamilyHistory } from "@/lib/use-family-history";
import {
  Upload, FileText, Heart, Brain, Activity, Sparkles,
  ChevronRight, User, Dna, MessageCircle, Send, Bot,
  TrendingUp, TrendingDown, Minus, AlertCircle, Zap, Moon, Wind, Droplets,
  Check, Circle, RefreshCw, Loader2, Watch, Plus,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
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

export default function BodyScreen() {
  const {
    profile, updateField, userId, dataCompleteness,
    longevityScore, biologicalAge, chronologicalAge,
  } = useHealth();

  // Collapsibles
  const [showMetrics, setShowMetrics] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showVault, setShowVault] = useState(false);

  // Vault state
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("medical_documents")
        .select("id, file_name, status, created_at, document_type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(5);
      if (data) setDocuments(data);
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
      setInsightsError(e?.message || "Network error");
    } finally {
      setInsightsLoading(false);
    }
  }, [userId, profile, longevityScore, biologicalAge, chronologicalAge, systemHealth, completions]);

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

  // ─── Chat ──────────────────────────────────────────────────
  const sendChat = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, content: text.trim() };
    const allMessages = [...chatMessages, userMsg];
    setChatMessages(allMessages);
    setChatInput("");
    setChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    const mainIssue = insights?.main_issue?.title ?? fallbackDiagnosis.title;
    const systemPrompt = `You are an elite longevity medicine AI advisor. Patient: ${profile.full_name || "Unknown"}, ${profile.sex || "Unknown"}, age ~${chronologicalAge}.
Longevity score: ${longevityScore}/100. Bio age: ${biologicalAge}.
Top issue: ${mainIssue}.
BP ${profile.bp_systolic}/${profile.bp_diastolic}, HRV ${profile.hrv_ms}, VO2 ${profile.vo2_max}.
LDL ${profile.ldl}, ApoB ${profile.apob}, hsCRP ${profile.hscrp}.
Glucose ${profile.fasting_glucose}, HbA1c ${profile.hba1c}.
Be direct, specific, reference actual values. Markdown formatting.`;

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const { data: { session } } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("Not signed in");

      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages: allMessages, systemPrompt }),
      });
      if (!resp.ok) { toast.error("AI request failed"); setChatLoading(false); return; }
      const reader = resp.body?.getReader(); if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let assistantContent = ""; let buffer = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, nl); buffer = buffer.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim(); if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setChatMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                return [...prev, { role: "assistant", content: assistantContent }];
              });
              chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch {}
        }
      }
    } catch { toast.error("Failed to reach AI advisor"); }
    setChatLoading(false);
  }, [chatMessages, chatLoading, profile, chronologicalAge, longevityScore, biologicalAge, insights, fallbackDiagnosis]);

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
    <div className="space-y-7 sm:space-y-8 pb-28 animate-fade-in">

      {/* ══════════ 1. HERO ══════════ */}
      <header className="text-center pt-1 sm:pt-2 space-y-2.5 sm:space-y-3 animate-[fade-in_0.5s_ease-out]">
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
      <section className="flex flex-col items-center gap-3 animate-[scale-in_0.4s_ease-out_0.1s_both]">
        <div className="sm:hidden"><ScoreRing score={longevityScore} size={184} strokeWidth={12} /></div>
        <div className="hidden sm:block"><ScoreRing score={longevityScore} size={220} strokeWidth={14} /></div>
        <div className="text-center">
          <p className={`text-base font-semibold ${overall.tone}`}>{overall.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Bio age <span className="text-foreground font-medium">{biologicalAge}</span> · Actual {chronologicalAge}
          </p>
        </div>
      </section>

      {/* ══════════ 3. BODY SYSTEMS ══════════ */}
      <section className="space-y-2.5 sm:space-y-3 animate-[fade-in_0.5s_ease-out_0.2s_both]">
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
                className="bg-card border border-border rounded-xl p-3 sm:p-3.5 animate-[fade-in_0.4s_ease-out_both]"
                style={{ animationDelay: `${0.25 + i * 0.07}s` }}
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

      {/* ══════════ 3.5 CONNECT DEVICES ══════════ */}
      <ConnectDevices />

      {/* ══════════ 4. MAIN ISSUE (AI) ══════════ */}
      {displayedIssue ? (
        <section className="bg-gradient-to-br from-rose-500/10 to-amber-500/5 border border-rose-500/20 rounded-2xl p-4 sm:p-5 space-y-2 animate-[fade-in_0.5s_ease-out]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400" />
              <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Main issue</span>
              {insights && <span className="text-[9px] text-muted-foreground">· AI</span>}
            </div>
            <button
              onClick={fetchInsights}
              disabled={insightsLoading}
              className="text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
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
        <section className="bg-card border border-border rounded-2xl p-5 flex items-center gap-3 animate-pulse">
          <Loader2 className="w-4 h-4 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Analyzing your data with AI…</p>
        </section>
      ) : null}

      {/* ══════════ 5. ACTIONS ══════════ */}
      {displayedActions && displayedActions.length > 0 && (
        <section className="space-y-2.5 sm:space-y-3 animate-[fade-in_0.5s_ease-out]">
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
                  className={`w-full text-left bg-card border rounded-xl p-3 sm:p-3.5 flex items-start gap-3 transition-all active:scale-[0.99] ${
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
          className="w-full flex items-center justify-between py-2 px-1"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your metrics</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showMetrics ? "rotate-90" : ""}`} />
        </button>

        {showMetrics && (
          <div className="grid grid-cols-2 gap-2 mt-2 animate-[fade-in_0.3s_ease-out]">
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
                <div key={m.key} className="bg-card border border-border rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Icon className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{m.label}</span>
                  </div>
                  <input
                    type="number"
                    value={val || ""}
                    onChange={(e) => updateField(m.key as any, parseFloat(e.target.value) || 0)}
                    className="w-full text-base font-semibold tabular-nums bg-transparent text-foreground focus:outline-none"
                    placeholder="—"
                  />
                  {m.unit && <span className="text-[10px] text-muted-foreground">{m.unit}</span>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ══════════ Profile ══════════ */}
      <section>
        <button
          onClick={() => setShowProfile(!showProfile)}
          className="w-full flex items-center justify-between py-2 px-1"
        >
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Profile & history</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showProfile ? "rotate-90" : ""}`} />
        </button>

        {showProfile && (
          <div className="mt-2 bg-card border border-border rounded-xl p-3.5 space-y-3 animate-[fade-in_0.3s_ease-out]">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Age</label>
                <input
                  type="number"
                  value={chronologicalAge || ""}
                  onChange={(e) => {
                    const age = parseInt(e.target.value) || 30;
                    updateField("date_of_birth", `${new Date().getFullYear() - age}-01-01`);
                  }}
                  className="w-full text-sm font-mono bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary mt-1"
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Sex</label>
                <select
                  value={profile.sex || ""}
                  onChange={(e) => updateField("sex", e.target.value)}
                  className="w-full text-sm bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary mt-1"
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
              <div className="flex flex-wrap gap-1">
                {FAMILY_CONDITIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => toggleFamilyCondition(c)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
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
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ══════════ Vault ══════════ */}
      <section>
        <button
          onClick={() => setShowVault(!showVault)}
          className="w-full flex items-center justify-between py-2 px-1"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Lab reports {documents.length > 0 && `· ${documents.length}`}
            </span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showVault ? "rotate-90" : ""}`} />
        </button>

        {showVault && (
          <div className="mt-2 space-y-2 animate-[fade-in_0.3s_ease-out]">
            <div
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
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

            {documents.map(doc => (
              <div key={doc.id} className="bg-card border border-border rounded-lg p-2.5 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${doc.status === "reviewed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {doc.status === "reviewed" ? "Analyzed" : "New"}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

    </div>
  );
}
