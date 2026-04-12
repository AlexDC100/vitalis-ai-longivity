import { useHealth } from "@/lib/health-context";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  TrendingUp, TrendingDown, ChevronRight, Moon, Pill, Footprints,
  Heart, Shield, AlertTriangle, Zap, Award, ArrowRight, X, Check
} from "lucide-react";

// --- Action log utilities (shared with TodayScreen) ---
function getActionLog(): Record<string, string[]> {
  try { return JSON.parse(localStorage.getItem("vitalis_action_log") || "{}"); } catch { return {}; }
}
function logAction(actionId: string) {
  const log = getActionLog();
  const today = new Date().toISOString().slice(0, 10);
  if (!log[today]) log[today] = [];
  if (!log[today].includes(actionId)) log[today].push(actionId);
  localStorage.setItem("vitalis_action_log", JSON.stringify(log));
}
function getTodayCompleted(): string[] {
  const log = getActionLog();
  return log[new Date().toISOString().slice(0, 10)] || [];
}
function getWeeklyProgress(): { daysActive: number; actionsCompleted: number } {
  const log = getActionLog();
  const now = new Date();
  let daysActive = 0, actionsCompleted = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    if (log[key]?.length) { daysActive++; actionsCompleted += log[key].length; }
  }
  return { daysActive, actionsCompleted };
}

interface ActionItem {
  id: string;
  title: string;
  subtitle: string;
  impact: string;
  icon: React.ElementType;
  color: string;
}

interface RiskItem {
  title: string;
  subtitle: string;
  severity: number;
  icon: React.ElementType;
}

function buildActions(profile: any): ActionItem[] {
  const actions: ActionItem[] = [];

  if (profile.avg_sleep_hours < 7) {
    actions.push({ id: "sleep", title: "Fix sleep timing", subtitle: `${profile.avg_sleep_hours}h → 7-8h target`, impact: "+2.1 years", icon: Moon, color: "from-indigo-500/20 to-indigo-600/5" });
  }
  if (profile.ldl > 100) {
    actions.push({ id: "ldl", title: "Reduce LDL cholesterol", subtitle: `${profile.ldl} mg/dL → <100 target`, impact: "+1.8 years", icon: Shield, color: "from-rose-500/20 to-rose-600/5" });
  }
  if (profile.vo2_max < 45) {
    actions.push({ id: "cardio", title: "Zone 2 cardio session", subtitle: `VO₂ Max ${profile.vo2_max} → 45+ target`, impact: "+1.5 years", icon: Heart, color: "from-emerald-500/20 to-emerald-600/5" });
  }
  if (profile.hrv_ms < 50) {
    actions.push({ id: "hrv", title: "Improve HRV recovery", subtitle: `${profile.hrv_ms}ms → 60ms+ target`, impact: "+1.2 years", icon: Zap, color: "from-amber-500/20 to-amber-600/5" });
  }
  if (profile.vitamin_d < 40) {
    actions.push({ id: "vitd", title: "Take Vitamin D", subtitle: `${profile.vitamin_d} ng/mL → 40-60 target`, impact: "+0.8 years", icon: Pill, color: "from-yellow-500/20 to-yellow-600/5" });
  }
  if (profile.body_fat_pct > 18) {
    actions.push({ id: "steps", title: "Walk 8,000+ steps", subtitle: "Daily movement goal", impact: "+1.0 years", icon: Footprints, color: "from-cyan-500/20 to-cyan-600/5" });
  }

  // Default actions if none triggered
  if (actions.length === 0) {
    actions.push(
      { id: "maintain", title: "Maintain routine", subtitle: "All markers on track", impact: "Sustain", icon: Award, color: "from-primary/20 to-primary/5" },
    );
  }

  return actions.slice(0, 3);
}

function buildTopRisk(profile: any): RiskItem | null {
  const risks: RiskItem[] = [];
  if (profile.ldl > 100 || profile.bp_systolic > 130 || profile.apob > 80) {
    const severity = Math.min(100, ((profile.ldl - 70) / 80) * 50 + ((profile.bp_systolic - 110) / 40) * 30 + ((profile.apob - 60) / 40) * 20);
    risks.push({ title: "Cardiovascular risk elevated", subtitle: `LDL ${profile.ldl} · BP ${profile.bp_systolic}/${profile.bp_diastolic} · ApoB ${profile.apob}`, severity: Math.round(Math.max(20, severity)), icon: Heart });
  }
  if (profile.fasting_glucose > 95 || profile.hba1c > 5.4) {
    risks.push({ title: "Metabolic health needs attention", subtitle: `Glucose ${profile.fasting_glucose} · HbA1c ${profile.hba1c}`, severity: 45, icon: Zap });
  }
  if (profile.hscrp > 1.5) {
    risks.push({ title: "Inflammation elevated", subtitle: `hs-CRP ${profile.hscrp} mg/L`, severity: 55, icon: AlertTriangle });
  }
  return risks.sort((a, b) => b.severity - a.severity)[0] || null;
}

// --- Swipeable Action Card ---
function ActionCard({ action, completed, onComplete }: { action: ActionItem; completed: boolean; onComplete: () => void }) {
  const startX = useRef(0);
  const [offsetX, setOffsetX] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const Icon = action.icon;

  const handleTouchStart = (e: React.TouchEvent) => { startX.current = e.touches[0].clientX; };
  const handleTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setOffsetX(Math.max(-120, dx));
  };
  const handleTouchEnd = () => {
    if (offsetX < -60 && !completed) {
      setSwiped(true);
      onComplete();
    }
    setOffsetX(0);
  };

  const isDone = completed || swiped;

  return (
    <div className="relative overflow-hidden rounded-2xl">
      {/* Swipe reveal */}
      <div className="absolute inset-0 flex items-center justify-end pr-6 bg-[hsl(var(--vitalis-success))]/20 rounded-2xl">
        <Check className="w-6 h-6 text-[hsl(var(--vitalis-success))]" />
      </div>
      <div
        className={`relative bg-gradient-to-r ${action.color} border border-border/50 rounded-2xl p-5 transition-all duration-300 ${isDone ? "opacity-50" : ""}`}
        style={{ transform: `translateX(${offsetX}px)` }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start gap-4">
          <div className={`w-11 h-11 rounded-xl bg-background/40 backdrop-blur flex items-center justify-center shrink-0 ${isDone ? "bg-[hsl(var(--vitalis-success))]/20" : ""}`}>
            {isDone ? <Check className="w-5 h-5 text-[hsl(var(--vitalis-success))]" /> : <Icon className="w-5 h-5 text-foreground" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-[15px] font-semibold text-foreground ${isDone ? "line-through opacity-60" : ""}`}>{action.title}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{action.subtitle}</p>
          </div>
          <div className="flex flex-col items-end shrink-0">
            <span className="text-xs font-bold text-primary">{action.impact}</span>
            {!isDone && <span className="text-[9px] text-muted-foreground mt-0.5">← swipe</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Dashboard ---
export default function DashboardScreen() {
  const { profile, longevityScore, biologicalAge, chronologicalAge } = useHealth();
  const [completedActions, setCompletedActions] = useState<string[]>(getTodayCompleted());
  const [riskExpanded, setRiskExpanded] = useState(false);
  const [weeklyDelta, setWeeklyDelta] = useState<number | null>(null);

  // Load weekly score delta from documents
  useEffect(() => {
    if (!profile.user_id) return;
    supabase
      .from("medical_documents")
      .select("extracted_data")
      .eq("user_id", profile.user_id)
      .eq("status", "reviewed")
      .order("created_at", { ascending: false })
      .limit(2)
      .then(({ data }) => {
        if (data && data.length >= 2) {
          const latest = (data[0] as any).extracted_data?.health_scores?.overall_longevity;
          const prev = (data[1] as any).extracted_data?.health_scores?.overall_longevity;
          if (latest != null && prev != null) setWeeklyDelta(latest - prev);
        }
      });
  }, [profile.user_id]);

  const actions = buildActions(profile);
  const topRisk = buildTopRisk(profile);
  const weekly = getWeeklyProgress();
  const ageDelta = chronologicalAge - biologicalAge;
  const yearsGained = Math.max(0, ageDelta * 0.8).toFixed(1);

  const handleComplete = useCallback((id: string) => {
    logAction(id);
    setCompletedActions(prev => [...prev, id]);
  }, []);

  // Score status
  const scoreStatus = weeklyDelta != null
    ? weeklyDelta > 0 ? "Improving" : weeklyDelta < 0 ? "Declining" : "Stable"
    : weekly.daysActive >= 5 ? "Improving" : weekly.daysActive >= 3 ? "Stable" : "Needs focus";
  const scoreStatusColor = scoreStatus === "Improving"
    ? "text-[hsl(var(--vitalis-success))]"
    : scoreStatus === "Declining" ? "text-[hsl(var(--vitalis-danger))]"
    : "text-muted-foreground";

  return (
    <div className="animate-fade-in space-y-8 pb-28 pt-2">

      {/* 1. SCORE HERO */}
      <div className="flex flex-col items-center pt-4">
        {/* Large score ring */}
        <div className="relative">
          <svg width={180} height={180} className="-rotate-90">
            <circle cx={90} cy={90} r={76} fill="none" stroke="hsl(var(--border))" strokeWidth={10} opacity={0.3} />
            <circle
              cx={90} cy={90} r={76} fill="none"
              stroke="url(#scoreGrad)" strokeWidth={10}
              strokeDasharray={2 * Math.PI * 76}
              strokeDashoffset={2 * Math.PI * 76 * (1 - longevityScore / 100)}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-out"
              style={{ filter: "drop-shadow(0 0 12px hsl(174 72% 46% / 0.4))" }}
            />
            <defs>
              <linearGradient id="scoreGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="hsl(174, 72%, 56%)" />
                <stop offset="100%" stopColor="hsl(174, 72%, 36%)" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-5xl font-extrabold text-foreground tracking-tight">{longevityScore}</span>
            <span className="text-[11px] text-muted-foreground mt-1">Longevity Score</span>
          </div>
        </div>

        {/* Status pills */}
        <div className="flex items-center gap-3 mt-5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/50">
            {weeklyDelta != null && weeklyDelta !== 0 ? (
              weeklyDelta > 0
                ? <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--vitalis-success))]" />
                : <TrendingDown className="w-3.5 h-3.5 text-[hsl(var(--vitalis-danger))]" />
            ) : null}
            <span className={`text-xs font-medium ${scoreStatusColor}`}>
              {weeklyDelta != null && weeklyDelta !== 0 ? `${weeklyDelta > 0 ? "+" : ""}${weeklyDelta} pts` : scoreStatus}
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-card border border-border/50">
            <span className="text-xs text-muted-foreground">Bio Age</span>
            <span className="text-xs font-bold text-foreground">{biologicalAge}</span>
            {ageDelta > 0 && (
              <span className="text-[10px] font-medium text-[hsl(var(--vitalis-success))]">-{ageDelta}y</span>
            )}
          </div>
        </div>
      </div>

      {/* 2. TODAY'S ACTIONS */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-lg font-bold text-foreground">Today's Actions</h2>
          <span className="text-xs text-muted-foreground">
            {completedActions.length}/{actions.length} done
          </span>
        </div>
        {actions.map(action => (
          <ActionCard
            key={action.id}
            action={action}
            completed={completedActions.includes(action.id)}
            onComplete={() => handleComplete(action.id)}
          />
        ))}
      </div>

      {/* 3. BIGGEST RISK */}
      {topRisk && (
        <div className="space-y-2">
          <h2 className="text-lg font-bold text-foreground px-1">Biggest Risk</h2>
          <button
            onClick={() => setRiskExpanded(!riskExpanded)}
            className="w-full text-left"
          >
            <div className={`bg-[hsl(var(--vitalis-danger))]/5 border border-[hsl(var(--vitalis-danger))]/15 rounded-2xl p-5 transition-all duration-300 ${riskExpanded ? "" : "hover:border-[hsl(var(--vitalis-danger))]/30"}`}>
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-[hsl(var(--vitalis-danger))]/10 flex items-center justify-center shrink-0">
                  <topRisk.icon className="w-5 h-5 text-[hsl(var(--vitalis-danger))]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-foreground">{topRisk.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{topRisk.subtitle}</p>
                </div>
                <ChevronRight className={`w-5 h-5 text-muted-foreground transition-transform duration-300 shrink-0 ${riskExpanded ? "rotate-90" : ""}`} />
              </div>

              {/* Risk severity bar */}
              <div className="mt-4">
                <div className="flex justify-between mb-1.5">
                  <span className="text-[10px] text-muted-foreground">Risk Level</span>
                  <span className="text-[10px] font-medium text-[hsl(var(--vitalis-danger))]">{topRisk.severity}%</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[hsl(var(--vitalis-warning))] to-[hsl(var(--vitalis-danger))] transition-all duration-1000"
                    style={{ width: `${topRisk.severity}%` }}
                  />
                </div>
              </div>

              {/* Expanded fix plan */}
              {riskExpanded && (
                <div className="mt-4 pt-4 border-t border-[hsl(var(--vitalis-danger))]/10 space-y-3 animate-fade-in">
                  <p className="text-xs font-semibold text-foreground">Priority fix plan:</p>
                  {profile.ldl > 100 && (
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-[hsl(var(--vitalis-danger))]/10 flex items-center justify-center mt-0.5 shrink-0">
                        <span className="text-[10px] font-bold text-[hsl(var(--vitalis-danger))]">1</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Escalate statin therapy — LDL {profile.ldl} mg/dL needs to reach &lt;70 mg/dL</p>
                    </div>
                  )}
                  {profile.bp_systolic > 120 && (
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-[hsl(var(--vitalis-warning))]/10 flex items-center justify-center mt-0.5 shrink-0">
                        <span className="text-[10px] font-bold text-[hsl(var(--vitalis-warning))]">2</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Optimize blood pressure — {profile.bp_systolic}/{profile.bp_diastolic} mmHg → target &lt;120/80</p>
                    </div>
                  )}
                  {profile.apob > 80 && (
                    <div className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-[hsl(var(--vitalis-warning))]/10 flex items-center justify-center mt-0.5 shrink-0">
                        <span className="text-[10px] font-bold text-[hsl(var(--vitalis-warning))]">3</span>
                      </div>
                      <p className="text-xs text-muted-foreground">Reduce ApoB — {profile.apob} mg/dL → target &lt;80 mg/dL with diet + medication</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </button>
        </div>
      )}

      {/* 4. PROGRESS */}
      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground px-1">Your Progress</h2>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col items-center">
            <span className="text-2xl font-extrabold text-primary">{yearsGained}</span>
            <span className="text-[10px] text-muted-foreground mt-1 text-center">Years gained</span>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col items-center">
            <span className="text-2xl font-extrabold text-foreground">{weekly.daysActive}</span>
            <span className="text-[10px] text-muted-foreground mt-1 text-center">Active days</span>
          </div>
          <div className="bg-card border border-border/50 rounded-2xl p-4 flex flex-col items-center">
            <span className="text-2xl font-extrabold text-foreground">{weekly.actionsCompleted}</span>
            <span className="text-[10px] text-muted-foreground mt-1 text-center">Actions done</span>
          </div>
        </div>

        {/* Weekly streak bar */}
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-foreground">This week</span>
            <span className="text-[10px] text-muted-foreground">{weekly.daysActive}/7 days</span>
          </div>
          <div className="flex gap-1.5">
            {Array.from({ length: 7 }).map((_, i) => {
              const d = new Date(); d.setDate(d.getDate() - (6 - i));
              const key = d.toISOString().slice(0, 10);
              const log = getActionLog();
              const active = (log[key]?.length || 0) > 0;
              const isToday = i === 6;
              return (
                <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className={`w-full h-8 rounded-lg transition-all ${active ? "bg-primary/30 border border-primary/40" : "bg-secondary/50 border border-border/30"} ${isToday ? "ring-1 ring-primary/50" : ""}`} />
                  <span className="text-[9px] text-muted-foreground">
                    {d.toLocaleDateString("en-US", { weekday: "narrow" })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
