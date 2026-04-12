import { useHealth } from "@/lib/health-context";
import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, Zap, Moon, Dumbbell, Pill, Info, X, AlertTriangle, Crown, TrendingDown, Clock, Heart, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ActionItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  priority: "critical" | "high" | "medium";
  category: string;
  lifespanImpact?: string;
  riskReduction?: string;
  timeToBenefit?: string;
}

function InteractiveScoreRing({ score, biologicalAge, chronologicalAge }: { score: number; biologicalAge: number; chronologicalAge: number }) {
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);

  const simulatedScore = Math.max(0, Math.min(100, score + dragOffset));
  const simulatedBioAge = Math.round(biologicalAge - dragOffset * 0.3);
  const pct = simulatedScore / 100;
  const circumference = 2 * Math.PI * 90;
  const strokeDashoffset = circumference * (1 - pct);
  const scoreColor = simulatedScore >= 70 ? "hsl(var(--primary))" : simulatedScore >= 50 ? "hsl(var(--vitalis-warning))" : "hsl(var(--vitalis-danger))";

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true);
    startY.current = e.clientY;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    const delta = (startY.current - e.clientY) / 3;
    setDragOffset(Math.max(-30, Math.min(30, delta)));
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
    setDragOffset(0);
  }, []);

  const ageDiff = chronologicalAge - biologicalAge;
  const ageLabel = ageDiff > 0 ? `${ageDiff}y younger` : ageDiff < 0 ? `${Math.abs(ageDiff)}y older` : "on track";

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-48 h-48 cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
          <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
          <circle
            cx="100" cy="100" r="90" fill="none"
            stroke={scoreColor}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-300"
            style={{ filter: isDragging ? `drop-shadow(0 0 14px ${scoreColor})` : `drop-shadow(0 0 6px ${scoreColor})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold text-foreground tracking-tight">{Math.round(simulatedScore)}</span>
          <span className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-widest">Longevity</span>
        </div>
      </div>

      <div className="mt-1 text-center">
        {isDragging ? (
          <p className="text-sm text-muted-foreground animate-fade-in">Bio age → <span className="font-semibold text-foreground">{simulatedBioAge}</span></p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Bio <span className="font-semibold text-foreground">{biologicalAge}</span> · Actual <span className="font-semibold text-foreground">{chronologicalAge}</span>
            </p>
            <p className={`text-xs font-medium mt-0.5 ${ageDiff > 0 ? "text-primary" : ageDiff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
              {ageLabel}
            </p>
          </>
        )}
        <p className="text-[9px] text-muted-foreground/40 mt-1">drag to simulate</p>
      </div>
    </div>
  );
}

function ActionCard({ action, onSwipe, onHold }: { action: ActionItem; onSwipe: () => void; onHold: () => void }) {
  const [offset, setOffset] = useState(0);
  const startX = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    holdTimer.current = setTimeout(() => onHold(), 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    const delta = e.clientX - startX.current;
    if (delta < 0) setOffset(Math.max(-120, delta));
  };

  const handlePointerUp = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (offset < -80) onSwipe();
    setOffset(0);
  };

  const Icon = action.icon;
  const borderClass = action.priority === "critical" ? "border-destructive/30" : action.priority === "high" ? "border-orange-500/20" : "border-border";
  const iconBg = action.priority === "critical" ? "bg-destructive/10 text-destructive" : action.priority === "high" ? "bg-orange-500/10 text-orange-400" : "bg-primary/10 text-primary";

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 right-0 w-24 bg-primary/20 flex items-center justify-center">
        <span className="text-xs font-semibold text-primary">FIX →</span>
      </div>
      <div
        className={`relative bg-card border ${borderClass} rounded-xl p-3.5 touch-pan-y select-none transition-transform`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground leading-tight">{action.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
            {(action.lifespanImpact || action.riskReduction) && (
              <div className="flex gap-3 mt-1.5">
                {action.lifespanImpact && (
                  <span className="text-[10px] text-primary font-medium flex items-center gap-0.5">
                    <Heart className="w-3 h-3" />{action.lifespanImpact}
                  </span>
                )}
                {action.riskReduction && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Shield className="w-3 h-3" />{action.riskReduction}
                  </span>
                )}
                {action.timeToBenefit && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                    <Clock className="w-3 h-3" />{action.timeToBenefit}
                  </span>
                )}
              </div>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        </div>
      </div>
    </div>
  );
}

export default function TodayScreen() {
  const { profile, longevityScore, biologicalAge, chronologicalAge, dataCompleteness, userId } = useHealth();
  const [explainModal, setExplainModal] = useState<{ title: string; content: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [fixModal, setFixModal] = useState<ActionItem | null>(null);
  const [fixPlan, setFixPlan] = useState<string>("");
  const [fixLoading, setFixLoading] = useState(false);
  const [realityCheck, setRealityCheck] = useState<string | null>(null);
  const [realityLoading, setRealityLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("medical_documents")
        .select("recommendations, medicine_stack")
        .eq("status", "reviewed")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]?.recommendations) {
        setRecommendations((data[0].recommendations as any[]).slice(0, 3));
      }
    })();
  }, [userId]);

  const actions: ActionItem[] = recommendations.length > 0
    ? recommendations.map((r: any, i: number) => ({
        id: `rec-${i}`,
        title: r.title,
        description: r.description,
        icon: r.priority === "critical" ? Zap : r.category?.includes("sleep") ? Moon : Pill,
        priority: r.priority || "medium",
        category: r.category || "General",
        lifespanImpact: r.lifespan_impact || "+1.2 years",
        riskReduction: r.risk_reduction || "-15% CVD",
        timeToBenefit: r.time_to_benefit || "4 weeks",
      }))
    : [
        { id: "1", title: "Improve VO2 Max", description: `Currently ${profile.vo2_max} — target 50+ for top longevity`, icon: Dumbbell, priority: "high" as const, category: "Fitness", lifespanImpact: "+2.4 years", riskReduction: "-30% all-cause", timeToBenefit: "12 weeks" },
        { id: "2", title: "Lower ApoB / LDL", description: `LDL ${profile.ldl} mg/dL — target <100 optimal`, icon: Zap, priority: "critical" as const, category: "Cardiovascular", lifespanImpact: "+3.1 years", riskReduction: "-45% CVD risk", timeToBenefit: "8 weeks" },
        { id: "3", title: "Optimize Sleep", description: `${profile.avg_sleep_hours}h avg — target 7.5-8.5h`, icon: Moon, priority: "medium" as const, category: "Recovery", lifespanImpact: "+1.0 years", riskReduction: "-20% neuro risk", timeToBenefit: "2 weeks" },
      ];

  const topAction = actions[0];

  const streamAI = async (prompt: string, onChunk: (text: string) => void) => {
    const { data, error } = await supabase.functions.invoke("chat", {
      body: { messages: [{ role: "user", content: prompt }] }
    });
    if (error) throw error;
    if (data instanceof ReadableStream) {
      const reader = data.getReader();
      const decoder = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) { text += content; onChunk(text); }
          } catch {}
        }
      }
    } else if (typeof data === "string") {
      onChunk(data);
    }
  };

  const handleHold = async (action: ActionItem) => {
    setExplaining(true);
    setExplainModal({ title: action.title, content: "" });
    try {
      await streamAI(
        `In 3 sentences, explain why "${action.title}" is critical for longevity. Context: ${action.description}. Include: expected lifespan impact, risk reduction, and time to see benefit. Be specific with numbers.`,
        (text) => setExplainModal({ title: action.title, content: text })
      );
    } catch {
      setExplainModal({ title: action.title, content: action.description });
    }
    setExplaining(false);
  };

  const handleSwipe = async (action: ActionItem) => {
    setFixModal(action);
    setFixPlan("");
    setFixLoading(true);
    try {
      const profileSummary = `Age ${chronologicalAge}, weight ${profile.weight_kg}kg, height ${profile.height_cm}cm, sleep ${profile.avg_sleep_hours}h, glucose ${profile.fasting_glucose}, LDL ${profile.ldl}, HDL ${profile.hdl}, VO2max ${profile.vo2_max}, HRV ${profile.hrv_ms}`;
      await streamAI(
        `Create a specific, actionable daily plan to address "${action.title}". Patient: ${profileSummary}. Include: 1) Exact steps for today 2) Expected timeline 3) How to measure progress. Consider any medications/supplements they may take. Be concise, 5-7 bullet points max.`,
        (text) => setFixPlan(text)
      );
    } catch {
      setFixPlan("Unable to generate plan. Try again later.");
    }
    setFixLoading(false);
  };

  const handleRealityCheck = async () => {
    setRealityLoading(true);
    setRealityCheck("");
    try {
      const profileSummary = `Age ${chronologicalAge}, bio age ${biologicalAge}, longevity score ${longevityScore}/100, weight ${profile.weight_kg}kg, body fat ${profile.body_fat_pct}%, glucose ${profile.fasting_glucose}, HbA1c ${profile.hba1c}, LDL ${profile.ldl}, ApoB ${profile.apob}, hsCRP ${profile.hscrp}, BP ${profile.bp_systolic}/${profile.bp_diastolic}, VO2max ${profile.vo2_max}, HRV ${profile.hrv_ms}, sleep ${profile.avg_sleep_hours}h quality ${profile.sleep_quality}%`;
      await streamAI(
        `You are a brutally honest longevity physician. Based on this patient's data, tell them the ONE thing they are most likely ignoring that could seriously harm their healthspan. Be direct, specific, evidence-based. Include the risk if they continue ignoring it. Patient: ${profileSummary}`,
        (text) => setRealityCheck(text)
      );
    } catch {
      setRealityCheck("Unable to analyze. Try again later.");
    }
    setRealityLoading(false);
  };

  // Inactivity trajectory
  const yearsLostIfNothing = Math.round((100 - longevityScore) * 0.15 * 10) / 10;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      {/* Greeting */}
      <div className="text-center pt-1">
        <h1 className="text-lg font-semibold text-foreground">{greeting}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">What should you do today?</p>
      </div>

      {/* Score Ring */}
      <InteractiveScoreRing score={longevityScore} biologicalAge={biologicalAge} chronologicalAge={chronologicalAge} />

      {/* Top 1% Action */}
      {topAction && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <Crown className="w-4 h-4 text-primary" />
            <span className="text-[10px] font-bold text-primary uppercase tracking-wider">Top 1% Action</span>
          </div>
          <h3 className="text-sm font-semibold text-foreground">{topAction.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{topAction.description}</p>
          {topAction.lifespanImpact && (
            <p className="text-xs text-primary font-medium mt-1.5">Expected: {topAction.lifespanImpact} healthspan</p>
          )}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "HRV", value: `${profile.hrv_ms}`, unit: "ms", good: profile.hrv_ms >= 50 },
          { label: "Sleep", value: `${profile.avg_sleep_hours}`, unit: "h", good: profile.avg_sleep_hours >= 7 },
          { label: "Glucose", value: `${profile.fasting_glucose}`, unit: "mg/dL", good: profile.fasting_glucose <= 90 },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.good ? "text-primary" : "text-foreground"}`}>
              {s.value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Fear Trajectory */}
      <div className="bg-destructive/5 border border-destructive/15 rounded-xl p-3 flex items-center gap-3">
        <TrendingDown className="w-5 h-5 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground">If you change nothing</p>
          <p className="text-[11px] text-muted-foreground">~{yearsLostIfNothing} years of healthspan at risk</p>
        </div>
      </div>

      {/* Top 3 Actions with ROI */}
      <div>
        <h2 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Today's Focus</h2>
        <div className="space-y-2">
          {actions.slice(0, 3).map((action) => (
            <ActionCard key={action.id} action={action} onSwipe={() => handleSwipe(action)} onHold={() => handleHold(action)} />
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground/40 mt-1.5 text-center">swipe left → action plan · hold → AI explain</p>
      </div>

      {/* Data Confidence */}
      <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Data Confidence</span>
            <span className="text-xs font-semibold text-foreground">{dataCompleteness}%</span>
          </div>
          <div className="w-full h-1 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
          </div>
          <p className="text-[9px] text-muted-foreground/60 mt-1">Upload labs to improve accuracy</p>
        </div>
      </div>

      {/* Reality Check */}
      <button
        onClick={handleRealityCheck}
        disabled={realityLoading}
        className="w-full bg-card border border-destructive/20 rounded-xl p-3 text-left hover:border-destructive/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-xs font-semibold text-foreground">Tell me what I'm ignoring</span>
        </div>
        {realityLoading && <div className="mt-2 w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />}
        {realityCheck && !realityLoading && (
          <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{realityCheck}</p>
        )}
      </button>

      {/* Explain Modal */}
      {explainModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => !explaining && setExplainModal(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">{explainModal.title}</h3>
              <button onClick={() => setExplainModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{explainModal.content}</p>
            {explaining && <div className="mt-2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          </div>
        </div>
      )}

      {/* Fix Modal */}
      {fixModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setFixModal(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md animate-fade-in max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-foreground">Action Plan</h3>
              <button onClick={() => setFixModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <h4 className="text-xs font-semibold text-primary mb-2">{fixModal.title}</h4>
            {fixLoading && <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
            <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{fixPlan}</p>
            <button onClick={() => setFixModal(null)} className="mt-4 w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
