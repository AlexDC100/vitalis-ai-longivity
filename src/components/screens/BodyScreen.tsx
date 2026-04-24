import { useHealth } from "@/lib/health-context";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Upload, FileText, Heart, Brain, Activity, Sparkles,
  ChevronRight, User, Dna, MessageCircle, Send, Bot,
  TrendingUp, TrendingDown, Minus, AlertCircle, Zap, Moon, Wind, Droplets,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import ScoreRing from "@/components/ScoreRing";
import { runDiagnosis, getAllSystemScores, SubstanceEntry } from "@/lib/diagnosis-engine";

const FAMILY_CONDITIONS = [
  "Heart Disease", "Diabetes", "Cancer", "Alzheimer's", "Stroke",
  "High Blood Pressure", "Obesity", "Autoimmune", "None",
];

// 4 systems shown as bars (matches diagnosis engine categories)
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

export default function BodyScreen() {
  const {
    profile, updateField, userId, dataCompleteness,
    longevityScore, biologicalAge, chronologicalAge,
  } = useHealth();

  // Collapsibles — secondary content closed by default for premium hierarchy
  const [showMetrics, setShowMetrics] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showVault, setShowVault] = useState(false);

  // Vault state
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Family history
  const [familyHistory, setFamilyHistory] = useState<string[]>([]);

  // AI Chat
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ─── Load persisted data ───────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem("vitalis_family_history");
    if (saved) setFamilyHistory(JSON.parse(saved));
  }, []);

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

  // ─── Intelligence: systems, diagnosis, trend ───────────────
  const substances = useMemo<SubstanceEntry[]>(() => {
    try { return JSON.parse(localStorage.getItem("vitalis_substances") || "[]"); }
    catch { return []; }
  }, []);

  const diagnosis = useMemo(() => runDiagnosis(profile, substances), [profile, substances]);
  const systemResults = useMemo(() => getAllSystemScores(profile, substances), [profile, substances]);

  // Map system risk (0..) → health score (0-100)
  const systemHealth = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of systemResults) {
      const health = Math.max(0, Math.min(100, 100 - s.score));
      map[s.id] = health;
    }
    return map;
  }, [systemResults]);

  // Trend: compare current longevity score to last snapshot in localStorage
  const [trend, setTrend] = useState<{ direction: "up" | "down" | "flat"; deltaYears: number }>({
    direction: "flat", deltaYears: 0,
  });

  useEffect(() => {
    const key = "vitalis_score_history";
    const raw = localStorage.getItem(key);
    let history: { ts: number; score: number; bioAge: number }[] = [];
    try { history = raw ? JSON.parse(raw) : []; } catch {}

    // Compare against snapshot ~30d old (or oldest)
    const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const past = [...history].reverse().find(h => h.ts <= monthAgo) || history[0];

    if (past) {
      const scoreDelta = longevityScore - past.score;
      const bioDelta = past.bioAge - biologicalAge; // lower bio age = better
      const direction: "up" | "down" | "flat" =
        scoreDelta >= 2 ? "up" : scoreDelta <= -2 ? "down" : "flat";
      setTrend({ direction, deltaYears: Math.round(bioDelta * 10) / 10 });
    }

    // Append fresh snapshot (max once/day)
    const today = new Date().toDateString();
    const lastTs = history[history.length - 1]?.ts;
    const lastDay = lastTs ? new Date(lastTs).toDateString() : null;
    if (lastDay !== today) {
      history.push({ ts: Date.now(), score: longevityScore, bioAge: biologicalAge });
      localStorage.setItem(key, JSON.stringify(history.slice(-90)));
    }
  }, [longevityScore, biologicalAge]);

  // ─── Handlers ───────────────────────────────────────────────
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
        toast.success("Document uploaded — AI is analyzing...");
        try {
          const { error } = await supabase.functions.invoke("parse-document", { body: { documentId: doc.id, filePath } });
          if (error) {
            toast.error("Analysis failed: " + (error.message || "Unknown error"));
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "error" } : d));
          } else {
            toast.success("Analysis complete!");
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "reviewed" } : d));
          }
        } catch {
          toast.error("Analysis failed.");
          setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "error" } : d));
        }
      }
    }
    setUploading(false);
  }, [userId]);

  const toggleFamilyCondition = (condition: string) => {
    setFamilyHistory(prev => {
      const next = condition === "None"
        ? ["None"]
        : prev.includes(condition)
          ? prev.filter(c => c !== condition)
          : [...prev.filter(c => c !== "None"), condition];
      localStorage.setItem("vitalis_family_history", JSON.stringify(next));
      return next;
    });
  };

  const sendChat = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, content: text.trim() };
    const allMessages = [...chatMessages, userMsg];
    setChatMessages(allMessages);
    setChatInput("");
    setChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    const systemPrompt = `You are an elite longevity medicine AI advisor. Patient: ${profile.full_name || "Unknown"}, ${profile.sex || "Unknown"}, Age ~${chronologicalAge}.
Longevity score: ${longevityScore}/100. Bio age: ${biologicalAge}.
Top issue: ${diagnosis.title} (${diagnosis.severity}).
BP ${profile.bp_systolic}/${profile.bp_diastolic}, HRV ${profile.hrv_ms}, VO2 ${profile.vo2_max}.
LDL ${profile.ldl}, ApoB ${profile.apob}, hsCRP ${profile.hscrp}.
Glucose ${profile.fasting_glucose}, HbA1c ${profile.hba1c}.
Be direct, specific, reference actual values. Markdown formatting.`;

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
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
  }, [chatMessages, chatLoading, profile, chronologicalAge, longevityScore, biologicalAge, diagnosis]);

  // ─── Derived view-model ────────────────────────────────────
  const overall = scoreLabel(longevityScore);
  const topFixes = diagnosis.fixes.slice(0, 3);

  const trendMeta =
    trend.direction === "up"   ? { Icon: TrendingUp,   text: "Improving",  tone: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" } :
    trend.direction === "down" ? { Icon: TrendingDown, text: "Declining",  tone: "text-rose-400 bg-rose-400/10 border-rose-400/20" } :
                                 { Icon: Minus,        text: "Stable",     tone: "text-muted-foreground bg-muted border-border" };

  const yearsLine =
    trend.deltaYears > 0 ? `+${trend.deltaYears} years gained this month` :
    trend.deltaYears < 0 ? `${trend.deltaYears} years this month` :
                           "Baseline established";

  return (
    <div className="space-y-8 pb-28 animate-fade-in">

      {/* ══════════ 1. HERO ══════════ */}
      <header className="text-center pt-2 space-y-3">
        <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Your Body</h1>
        <div className="flex items-center justify-center gap-2">
          <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${trendMeta.tone}`}>
            <trendMeta.Icon className="w-3 h-3" />
            {trendMeta.text}
          </span>
          <span className="text-[11px] text-muted-foreground">{yearsLine}</span>
        </div>
      </header>

      {/* ══════════ 2. LONGEVITY SCORE ══════════ */}
      <section className="flex flex-col items-center gap-3">
        <ScoreRing score={longevityScore} size={220} strokeWidth={14} />
        <div className="text-center">
          <p className={`text-base font-semibold ${overall.tone}`}>{overall.label}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Bio age <span className="text-foreground font-medium">{biologicalAge}</span> · Actual {chronologicalAge}
          </p>
        </div>
      </section>

      {/* ══════════ 3. BODY SYSTEMS ══════════ */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between px-1">
          <h2 className="text-sm font-semibold text-foreground">Body systems</h2>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">0–100</span>
        </div>
        <div className="space-y-2.5">
          {SYSTEM_DISPLAY.map(sys => {
            const Icon = sys.icon;
            const score = systemHealth[sys.id] ?? 100;
            const meta = scoreLabel(score);
            return (
              <div key={sys.id} className="bg-card border border-border rounded-xl p-3.5">
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

      {/* ══════════ 4. MAIN ISSUE ══════════ */}
      {diagnosis.riskScore > 0 && (
        <section className="bg-gradient-to-br from-rose-500/10 to-amber-500/5 border border-rose-500/20 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400" />
            <span className="text-[10px] font-semibold text-rose-400 uppercase tracking-wider">Main issue</span>
          </div>
          <h3 className="text-xl font-bold text-foreground tracking-tight">{diagnosis.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{diagnosis.lifeImpact}</p>
        </section>
      )}

      {/* ══════════ 5. ACTIONS ══════════ */}
      {topFixes.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <Zap className="w-3.5 h-3.5 text-primary" />
            <h2 className="text-sm font-semibold text-foreground">What to do</h2>
          </div>
          <div className="space-y-2">
            {topFixes.map((fix, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-3.5 flex items-start gap-3">
                <div className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground leading-snug">{fix.action}</p>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{fix.why}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ══════════ 6. METRICS (secondary, collapsible) ══════════ */}
      <section>
        <button
          onClick={() => setShowMetrics(!showMetrics)}
          className="w-full flex items-center justify-between py-2 px-1 group"
        >
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your metrics</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showMetrics ? "rotate-90" : ""}`} />
        </button>

        {showMetrics && (
          <div className="grid grid-cols-2 gap-2 mt-2 animate-fade-in">
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

      {/* ══════════ Profile (collapsible) ══════════ */}
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
          <div className="mt-2 bg-card border border-border rounded-xl p-3.5 space-y-3 animate-fade-in">
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

      {/* ══════════ Vault (collapsible) ══════════ */}
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
          <div className="mt-2 space-y-2 animate-fade-in">
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
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
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

      {/* ══════════ AI Medical Advisor ══════════ */}
      <section>
        <button
          onClick={() => { setChatOpen(!chatOpen); setTimeout(() => inputRef.current?.focus(), 100); }}
          className="w-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3 hover:border-primary/40 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-foreground">Ask your AI advisor</p>
            <p className="text-[10px] text-muted-foreground">About your labs, risks, or plan</p>
          </div>
          <MessageCircle className={`w-4 h-4 transition-transform ${chatOpen ? "text-primary" : "text-muted-foreground"}`} />
        </button>

        {chatOpen && (
          <div className="mt-2 bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
            <div className="h-72 overflow-y-auto p-3 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Ask about your health data</p>
                  <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                    {["What are my biggest risks?", "Explain my LDL", "Best supplements for me?"].map(q => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q); setTimeout(() => sendChat(q), 50); }}
                        className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                      >{q}</button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                    msg.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-xs prose-invert max-w-none [&_p]:m-0 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
                        <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                      </div>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-3 py-2 rounded-bl-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" />
                      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="border-t border-border p-2 flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) { e.preventDefault(); sendChat(chatInput); } }}
                placeholder="Ask about your health..."
                className="flex-1 text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                disabled={chatLoading}
              />
              <button
                onClick={() => chatInput.trim() && sendChat(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
