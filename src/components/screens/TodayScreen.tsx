import { useHealth } from "@/lib/health-context";
import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, Zap, Moon, Dumbbell, Pill, X, AlertTriangle, Crown, TrendingDown, Clock, Heart, Shield, Check, Flame, Award, TrendingUp } from "lucide-react";
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

// --- Streak & action log stored in localStorage ---
function getActionLog(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem("vitalis_action_log") || "{}"); } catch { return {}; }
}
function logAction(actionId: string) {
  const log = getActionLog();
  const today = new Date().toISOString().slice(0, 10);
  if (!log[today]) log[today] = [];
  if (!log[today].includes(actionId)) log[today].push(actionId);
  localStorage.setItem("vitalis_action_log", JSON.stringify(log));
  return log;
}
function getStreak(): number {
  const log = getActionLog();
  let streak = 0;
  const d = new Date();
  while (true) {
    const key = d.toISOString().slice(0, 10);
    if (log[key] && log[key].length > 0) { streak++; d.setDate(d.getDate() - 1); } else break;
  }
  return streak;
}
function getTodayCompleted(): string[] {
  const log = getActionLog();
  return log[new Date().toISOString().slice(0, 10)] || [];
}
function getYesterdayMissed(actions: ActionItem[]): string[] {
  const log = getActionLog();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const key = yesterday.toISOString().slice(0, 10);
  const done = log[key] || [];
  return actions.filter(a => !done.includes(a.id)).map(a => a.title);
}
function getWeeklyProgress(): { actionsCompleted: number; totalPossible: number; daysActive: number } {
  const log = getActionLog();
  const now = new Date();
  let actionsCompleted = 0;
  let daysActive = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (log[key] && log[key].length > 0) { actionsCompleted += log[key].length; daysActive++; }
  }
  return { actionsCompleted, totalPossible: 21, daysActive };
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
    setDragOffset(Math.max(-30, Math.min(30, (startY.current - e.clientY) / 3)));
  }, [isDragging]);
  const handlePointerUp = useCallback(() => { setIsDragging(false); setDragOffset(0); }, []);

  const ageDiff = chronologicalAge - biologicalAge;
  const ageLabel = ageDiff > 0 ? `${ageDiff}y younger` : ageDiff < 0 ? `${Math.abs(ageDiff)}y older` : "on track";

  return (
    <div className="flex flex-col items-center">
      <div
        className="relative w-44 h-44 cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
          <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(var(--muted))" strokeWidth="5" />
          <circle cx="100" cy="100" r="90" fill="none" stroke={scoreColor} strokeWidth="5" strokeLinecap="round"
            strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} className="transition-all duration-300"
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
            <p className="text-sm text-muted-foreground">Bio <span className="font-semibold text-foreground">{biologicalAge}</span> · Actual <span className="font-semibold text-foreground">{chronologicalAge}</span></p>
            <p className={`text-xs font-medium mt-0.5 ${ageDiff > 0 ? "text-primary" : ageDiff < 0 ? "text-destructive" : "text-muted-foreground"}`}>{ageLabel}</p>
          </>
        )}
      </div>
    </div>
  );
}

function ActionCard({ action, completed, onComplete, onSwipe, onHold }: {
  action: ActionItem; completed: boolean; onComplete: () => void; onSwipe: () => void; onHold: () => void;
}) {
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
  const borderClass = completed ? "border-primary/30" : action.priority === "critical" ? "border-destructive/30" : action.priority === "high" ? "border-orange-500/20" : "border-border";
  const iconBg = completed ? "bg-primary/20 text-primary" : action.priority === "critical" ? "bg-destructive/10 text-destructive" : action.priority === "high" ? "bg-orange-500/10 text-orange-400" : "bg-primary/10 text-primary";

  return (
    <div className="relative overflow-hidden rounded-xl">
      <div className="absolute inset-y-0 right-0 w-24 bg-primary/20 flex items-center justify-center">
        <span className="text-xs font-semibold text-primary">FIX →</span>
      </div>
      <div
        className={`relative bg-card border ${borderClass} rounded-xl p-3 touch-pan-y select-none transition-transform ${completed ? "opacity-60" : ""}`}
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${iconBg}`}>
            {completed ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className={`text-sm font-semibold leading-tight ${completed ? "line-through text-muted-foreground" : "text-foreground"}`}>{action.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
            {!completed && (action.lifespanImpact || action.riskReduction) && (
              <div className="flex gap-3 mt-1.5">
                {action.lifespanImpact && <span className="text-[10px] text-primary font-medium flex items-center gap-0.5"><Heart className="w-3 h-3" />{action.lifespanImpact}</span>}
                {action.riskReduction && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Shield className="w-3 h-3" />{action.riskReduction}</span>}
                {action.timeToBenefit && <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Clock className="w-3 h-3" />{action.timeToBenefit}</span>}
              </div>
            )}
          </div>
          {!completed && (
            <button onClick={(e) => { e.stopPropagation(); onComplete(); }}
              className="w-7 h-7 rounded-full border border-border flex items-center justify-center shrink-0 hover:bg-primary/10 hover:border-primary/30 transition-colors mt-0.5">
              <Check className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
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
  const [fixPlan, setFixPlan] = useState("");
  const [fixLoading, setFixLoading] = useState(false);
  const [realityCheck, setRealityCheck] = useState<string | null>(null);
  const [realityLoading, setRealityLoading] = useState(false);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [completedActions, setCompletedActions] = useState<string[]>(getTodayCompleted());
  const [streak, setStreak] = useState(getStreak());
  const [dopamineFeedback, setDopamineFeedback] = useState<string | null>(null);

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
  const missedYesterday = getYesterdayMissed(actions);
  const weekly = getWeeklyProgress();

  const handleComplete = (action: ActionItem) => {
    logAction(action.id);
    setCompletedActions(prev => [...prev, action.id]);
    setStreak(getStreak());
    // Dopamine feedback
    const impact = action.lifespanImpact || "+0.3 years";
    setDopamineFeedback(`✓ ${action.title} — ${impact} gained today`);
    setTimeout(() => setDopamineFeedback(null), 3000);
  };

  const streamAI = async (prompt: string, onChunk: (text: string) => void) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
      body: JSON.stringify({ messages: [{ role: "user", content: prompt }] }),
    });
    if (!resp.ok || !resp.body) throw new Error("AI request failed");
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
        try {
          const parsed = JSON.parse(line.slice(6));
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) { text += content; onChunk(text); }
        } catch {}
      }
    }
    if (!text) onChunk("Unable to generate response.");
  };

  const handleHold = async (action: ActionItem) => {
    setExplaining(true);
    setExplainModal({ title: action.title, content: "" });
    try {
      await streamAI(
        `In 3 sentences, explain why "${action.title}" is critical for longevity. Context: ${action.description}. Include: expected lifespan impact, risk reduction, time to benefit. Be specific.`,
        (text) => setExplainModal({ title: action.title, content: text })
      );
    } catch { setExplainModal({ title: action.title, content: action.description }); }
    setExplaining(false);
  };

  const handleSwipe = async (action: ActionItem) => {
    setFixModal(action);
    setFixPlan("");
    setFixLoading(true);
    try {
      const ps = `Age ${chronologicalAge}, weight ${profile.weight_kg}kg, height ${profile.height_cm}cm, sleep ${profile.avg_sleep_hours}h, glucose ${profile.fasting_glucose}, LDL ${profile.ldl}, HDL ${profile.hdl}, VO2max ${profile.vo2_max}, HRV ${profile.hrv_ms}`;
      await streamAI(
        `Create a specific daily plan to address "${action.title}". Patient: ${ps}. Include: 1) Exact steps for today 2) Expected timeline 3) How to measure progress. 5-7 bullet points max.`,
        (text) => setFixPlan(text)
      );
    } catch { setFixPlan("Unable to generate plan."); }
    setFixLoading(false);
  };

  const handleRealityCheck = async () => {
    setRealityLoading(true);
    setRealityCheck("");
    try {
      const ps = `Age ${chronologicalAge}, bio age ${biologicalAge}, score ${longevityScore}/100, weight ${profile.weight_kg}kg, fat ${profile.body_fat_pct}%, glucose ${profile.fasting_glucose}, HbA1c ${profile.hba1c}, LDL ${profile.ldl}, ApoB ${profile.apob}, hsCRP ${profile.hscrp}, BP ${profile.bp_systolic}/${profile.bp_diastolic}, VO2max ${profile.vo2_max}, HRV ${profile.hrv_ms}, sleep ${profile.avg_sleep_hours}h`;
      await streamAI(
        `You are a brutally honest longevity physician. Tell this patient the ONE thing they are most likely ignoring that could seriously harm their healthspan. Be direct, specific. Include risk. Patient: ${ps}`,
        (text) => setRealityCheck(text)
      );
    } catch { setRealityCheck("Unable to analyze."); }
    setRealityLoading(false);
  };

  const yearsLostIfNothing = Math.round((100 - longevityScore) * 0.15 * 10) / 10;
  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";
  const allDone = actions.every(a => completedActions.includes(a.id));

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      {/* Dopamine Feedback Toast */}
      {dopamineFeedback && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-full text-xs font-semibold shadow-lg animate-fade-in flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          {dopamineFeedback}
        </div>
      )}

      {/* Identity + Greeting */}
      <div className="text-center pt-1">
        <h1 className="text-lg font-semibold text-foreground">{greeting}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {allDone ? "All actions completed. You're optimizing." : "What should you do today?"}
        </p>
      </div>

      {/* Streak + Score Row */}
      <div className="flex items-center justify-center gap-4">
        {streak > 0 && (
          <div className="flex items-center gap-1 bg-primary/10 border border-primary/20 rounded-full px-3 py-1">
            <Flame className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-bold text-primary">{streak}d streak</span>
          </div>
        )}
        {weekly.daysActive >= 5 && (
          <div className="flex items-center gap-1 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-bold text-amber-400">Consistent</span>
          </div>
        )}
      </div>

      {/* Score Ring */}
      <InteractiveScoreRing score={longevityScore} biologicalAge={biologicalAge} chronologicalAge={chronologicalAge} />

      {/* Accountability — Missed Actions */}
      {missedYesterday.length > 0 && !allDone && (
        <div className="bg-amber-500/5 border border-amber-500/15 rounded-xl p-2.5 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-foreground">Yesterday you missed: {missedYesterday.slice(0, 2).join(", ")}</p>
            <p className="text-[10px] text-muted-foreground">Your plan is slipping. Take action today.</p>
          </div>
        </div>
      )}

      {/* Top 1% Action */}
      {topAction && !completedActions.includes(topAction.id) && (
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mb-1">
              <Crown className="w-4 h-4 text-primary" />
              <span className="text-[10px] font-bold text-primary uppercase tracking-wider">If you do ONE thing today</span>
            </div>
            <button onClick={() => handleComplete(topAction)}
              className="w-6 h-6 rounded-full border border-primary/30 flex items-center justify-center hover:bg-primary/20 transition-colors">
              <Check className="w-3 h-3 text-primary" />
            </button>
          </div>
          <h3 className="text-sm font-semibold text-foreground">{topAction.title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{topAction.description}</p>
          {topAction.lifespanImpact && <p className="text-xs text-primary font-medium mt-1">Expected: {topAction.lifespanImpact} healthspan</p>}
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "HRV", value: `${profile.hrv_ms}`, unit: "ms", good: profile.hrv_ms >= 50 },
          { label: "Sleep", value: `${profile.avg_sleep_hours}`, unit: "h", good: profile.avg_sleep_hours >= 7 },
          { label: "Glucose", value: `${profile.fasting_glucose}`, unit: "mg/dL", good: profile.fasting_glucose <= 90 },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-2 text-center">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className={`text-lg font-bold mt-0.5 ${s.good ? "text-primary" : "text-foreground"}`}>
              {s.value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{s.unit}</span>
            </p>
          </div>
        ))}
      </div>

      {/* Fear Engine */}
      <div className="bg-destructive/5 border border-destructive/15 rounded-xl p-2.5 flex items-center gap-3">
        <TrendingDown className="w-4 h-4 text-destructive shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-foreground">If nothing changes → ~{yearsLostIfNothing}y healthspan at risk</p>
        </div>
      </div>

      {/* Today's Focus — Completable Actions */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-semibold text-foreground uppercase tracking-wider">Today's Focus</h2>
          <span className="text-[10px] text-muted-foreground">{completedActions.length}/{actions.length} done</span>
        </div>
        <div className="space-y-2">
          {actions.slice(0, 3).map((action) => (
            <ActionCard
              key={action.id}
              action={action}
              completed={completedActions.includes(action.id)}
              onComplete={() => handleComplete(action)}
              onSwipe={() => handleSwipe(action)}
              onHold={() => handleHold(action)}
            />
          ))}
        </div>
        <p className="text-[9px] text-muted-foreground/40 mt-1.5 text-center">swipe left → plan · hold → explain · ✓ → complete</p>
      </div>

      {/* Weekly Progress */}
      <div className="bg-card border border-border rounded-xl p-3">
        <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">This Week</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-primary">{weekly.actionsCompleted}</p>
            <p className="text-[9px] text-muted-foreground">Actions taken</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">{weekly.daysActive}/7</p>
            <p className="text-[9px] text-muted-foreground">Days active</p>
          </div>
          <div>
            <p className="text-lg font-bold text-primary">+{(weekly.actionsCompleted * 0.08).toFixed(1)}</p>
            <p className="text-[9px] text-muted-foreground">Years gained</p>
          </div>
        </div>
      </div>

      {/* 7-Day History Timeline */}
      <div className="bg-card border border-border rounded-xl p-3">
        <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">7-Day History</h3>
        <div className="flex items-end justify-between gap-1">
          {(() => {
            const log = getActionLog();
            const days: { label: string; count: number; isToday: boolean }[] = [];
            for (let i = 6; i >= 0; i--) {
              const d = new Date();
              d.setDate(d.getDate() - i);
              const key = d.toISOString().slice(0, 10);
              const dayLabel = d.toLocaleDateString("en", { weekday: "short" }).slice(0, 2);
              days.push({ label: dayLabel, count: (log[key] || []).length, isToday: i === 0 });
            }
            const maxCount = Math.max(...days.map(d => d.count), 1);
            return days.map((day, idx) => (
              <div key={idx} className="flex flex-col items-center flex-1 gap-1">
                <div className="w-full flex items-end justify-center" style={{ height: 48 }}>
                  <div
                    className={`w-full max-w-[28px] rounded-t-md transition-all ${
                      day.count > 0
                        ? day.isToday ? "bg-primary" : "bg-primary/60"
                        : "bg-muted"
                    }`}
                    style={{ height: day.count > 0 ? Math.max(8, (day.count / maxCount) * 48) : 4 }}
                  />
                </div>
                <span className={`text-[9px] ${day.isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                  {day.label}
                </span>
                {day.count > 0 && (
                  <span className="text-[8px] text-muted-foreground">{day.count}</span>
                )}
              </div>
            ));
          })()}
        </div>
      </div>

      {/* Monthly Heatmap */}
      <div className="bg-card border border-border rounded-xl p-3">
        <h3 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Monthly Activity</h3>
        {(() => {
          const log = getActionLog();
          const now = new Date();
          const year = now.getFullYear();
          const month = now.getMonth();
          const daysInMonth = new Date(year, month + 1, 0).getDate();
          const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
          const monthName = now.toLocaleDateString("en", { month: "long" });

          // Build cells: blanks for offset + each day
          const cells: { day: number; count: number }[] = [];
          for (let i = 0; i < firstDow; i++) cells.push({ day: 0, count: 0 });
          for (let d = 1; d <= daysInMonth; d++) {
            const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            cells.push({ day: d, count: (log[key] || []).length });
          }
          const maxC = Math.max(...cells.map(c => c.count), 1);
          const today = now.getDate();

          return (
            <>
              <p className="text-[9px] text-muted-foreground mb-1.5">{monthName} {year}</p>
              <div className="grid grid-cols-7 gap-[3px]">
                {["S","M","T","W","T","F","S"].map((d, i) => (
                  <span key={i} className="text-[7px] text-muted-foreground/50 text-center">{d}</span>
                ))}
                {cells.map((cell, i) => {
                  if (cell.day === 0) return <div key={`b${i}`} />;
                  const intensity = cell.count === 0 ? 0 : Math.ceil((cell.count / maxC) * 4);
                  const bg = intensity === 0
                    ? "bg-muted/50"
                    : intensity === 1
                    ? "bg-primary/20"
                    : intensity === 2
                    ? "bg-primary/40"
                    : intensity === 3
                    ? "bg-primary/60"
                    : "bg-primary";
                  const isToday = cell.day === today;
                  return (
                    <div
                      key={cell.day}
                      className={`aspect-square rounded-sm ${bg} ${isToday ? "ring-1 ring-primary" : ""}`}
                      title={`${monthName} ${cell.day}: ${cell.count} actions`}
                    />
                  );
                })}
              </div>
              <div className="flex items-center justify-end gap-1 mt-2">
                <span className="text-[7px] text-muted-foreground">Less</span>
                {["bg-muted/50", "bg-primary/20", "bg-primary/40", "bg-primary/60", "bg-primary"].map((c, i) => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-sm ${c}`} />
                ))}
                <span className="text-[7px] text-muted-foreground">More</span>
              </div>
            </>
          );
        })()}
      </div>

      {/* Data Gravity */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Model Accuracy</span>
          <span className="text-xs font-bold text-primary">{dataCompleteness}%</span>
        </div>
        <div className="w-full h-1 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
        </div>
        <p className="text-[9px] text-muted-foreground/60 mt-1">
          {dataCompleteness < 50 ? "Add data to unlock accurate predictions" : dataCompleteness < 80 ? "Upload labs to reach 90%+ accuracy" : "Your model is highly accurate"}
        </p>
      </div>

      {/* Reality Check */}
      <button onClick={handleRealityCheck} disabled={realityLoading}
        className="w-full bg-card border border-destructive/20 rounded-xl p-3 text-left hover:border-destructive/40 transition-colors">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive" />
          <span className="text-xs font-semibold text-foreground">Tell me what I'm ignoring</span>
        </div>
        {realityLoading && <div className="mt-2 w-4 h-4 border-2 border-destructive border-t-transparent rounded-full animate-spin" />}
        {realityCheck && !realityLoading && <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{realityCheck}</p>}
      </button>

      {/* Identity Shift */}
      {streak >= 3 && (
        <div className="text-center py-2">
          <p className="text-[10px] text-primary/60 italic">You are someone who optimizes their health.</p>
        </div>
      )}

      {/* Modals */}
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
            <button onClick={() => setFixModal(null)} className="mt-4 w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold">Got it</button>
          </div>
        </div>
      )}
    </div>
  );
}
