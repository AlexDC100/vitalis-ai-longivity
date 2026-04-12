import { useHealth } from "@/lib/health-context";
import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronRight, Zap, Moon, Dumbbell, Pill, Info, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface ActionItem {
  id: string;
  title: string;
  description: string;
  icon: React.ElementType;
  priority: "critical" | "high" | "medium";
  category: string;
  swiped: boolean;
}

function InteractiveScoreRing({ score, biologicalAge, chronologicalAge }: { score: number; biologicalAge: number; chronologicalAge: number }) {
  const canvasRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="flex flex-col items-center">
      <div
        ref={canvasRef}
        className="relative w-52 h-52 cursor-grab active:cursor-grabbing select-none touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
          <circle cx="100" cy="100" r="90" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
          <circle
            cx="100" cy="100" r="90" fill="none"
            stroke={scoreColor}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-all duration-300"
            style={{ filter: isDragging ? `drop-shadow(0 0 12px ${scoreColor})` : `drop-shadow(0 0 6px ${scoreColor})` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-5xl font-bold text-foreground tracking-tight">{Math.round(simulatedScore)}</span>
          <span className="text-xs text-muted-foreground mt-1">LONGEVITY</span>
        </div>
      </div>

      {isDragging && (
        <div className="mt-2 text-center animate-fade-in">
          <p className="text-xs text-muted-foreground">Simulated biological age</p>
          <p className="text-lg font-bold text-foreground">{simulatedBioAge} <span className="text-xs text-muted-foreground font-normal">vs {chronologicalAge} actual</span></p>
        </div>
      )}

      {!isDragging && (
        <div className="mt-2 text-center">
          <p className="text-sm text-muted-foreground">Bio age <span className="font-semibold text-foreground">{biologicalAge}</span> · Actual <span className="font-semibold text-foreground">{chronologicalAge}</span></p>
          <p className="text-[10px] text-muted-foreground/60 mt-1">Drag up/down to simulate</p>
        </div>
      )}
    </div>
  );
}

function SwipeableAction({ action, onSwipe, onHold }: { action: ActionItem; onSwipe: () => void; onHold: () => void }) {
  const [offset, setOffset] = useState(0);
  const [holding, setHolding] = useState(false);
  const startX = useRef(0);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handlePointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    holdTimer.current = setTimeout(() => {
      setHolding(true);
      onHold();
    }, 500);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    const delta = e.clientX - startX.current;
    if (delta < 0) setOffset(Math.max(-120, delta));
  };

  const handlePointerUp = () => {
    if (holdTimer.current) { clearTimeout(holdTimer.current); holdTimer.current = null; }
    if (offset < -80) { onSwipe(); }
    setOffset(0);
    setHolding(false);
  };

  const Icon = action.icon;
  const priorityColor = action.priority === "critical" ? "bg-destructive/10 text-destructive border-destructive/20" :
    action.priority === "high" ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
    "bg-primary/10 text-primary border-primary/20";

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Swipe reveal */}
      <div className="absolute inset-y-0 right-0 w-24 bg-primary/20 flex items-center justify-center rounded-r-xl">
        <span className="text-xs font-semibold text-primary">FIX →</span>
      </div>

      <div
        className="relative bg-card border border-border rounded-xl p-4 touch-pan-y select-none transition-transform"
        style={{ transform: `translateX(${offset}px)` }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${priorityColor}`}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-foreground">{action.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{action.description}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
        </div>
        <p className="text-[9px] text-muted-foreground/50 mt-2">← swipe to fix · hold to explain</p>
      </div>
    </div>
  );
}

export default function TodayScreen() {
  const { profile, longevityScore, biologicalAge, chronologicalAge, dataCompleteness, userId } = useHealth();
  const [explainModal, setExplainModal] = useState<{ title: string; content: string } | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [fixModal, setFixModal] = useState<ActionItem | null>(null);
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("medical_documents")
        .select("recommendations")
        .eq("status", "reviewed")
        .order("created_at", { ascending: false })
        .limit(1);
      if (data?.[0]?.recommendations) {
        setRecommendations((data[0].recommendations as any[]).slice(0, 3));
      }
    })();
  }, [userId]);

  // Build top 3 actions from recommendations or profile
  const actions: ActionItem[] = recommendations.length > 0
    ? recommendations.map((r: any, i: number) => ({
        id: `rec-${i}`,
        title: r.title,
        description: r.description,
        icon: r.priority === "high" || r.priority === "critical" ? Zap : r.category?.includes("sleep") ? Moon : Pill,
        priority: r.priority || "medium",
        category: r.category || "General",
        swiped: false,
      }))
    : [
        { id: "1", title: "Improve VO2 Max", description: `Currently ${profile.vo2_max} ml/kg/min — target 50+ for longevity`, icon: Dumbbell, priority: "high" as const, category: "Fitness", swiped: false },
        { id: "2", title: "Lower LDL Cholesterol", description: `LDL at ${profile.ldl} mg/dL — target <100 for optimal cardiovascular health`, icon: Zap, priority: "critical" as const, category: "Cardiovascular", swiped: false },
        { id: "3", title: "Sleep Optimization", description: `${profile.avg_sleep_hours}h avg — aim for 7.5-8.5h with quality score >80`, icon: Moon, priority: "medium" as const, category: "Recovery", swiped: false },
      ];

  const handleHold = async (action: ActionItem) => {
    setExplaining(true);
    setExplainModal({ title: action.title, content: "Loading AI explanation..." });
    try {
      const { data, error } = await supabase.functions.invoke("chat", {
        body: {
          messages: [{
            role: "user",
            content: `In 2-3 sentences, explain why "${action.title}" matters for longevity. Context: ${action.description}. Be specific and actionable.`
          }]
        }
      });
      if (error) throw error;

      // Handle streaming response
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
              if (content) { text += content; setExplainModal({ title: action.title, content: text }); }
            } catch {}
          }
        }
      } else if (typeof data === "string") {
        setExplainModal({ title: action.title, content: data });
      }
    } catch {
      setExplainModal({ title: action.title, content: action.description });
    }
    setExplaining(false);
  };

  const handleSwipe = (action: ActionItem) => {
    setFixModal(action);
  };

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="animate-fade-in space-y-6 pb-20">
      {/* Greeting */}
      <div className="text-center pt-2">
        <h1 className="text-xl font-semibold text-foreground">{greeting}</h1>
        <p className="text-sm text-muted-foreground mt-1">Here's what matters today</p>
      </div>

      {/* Interactive Score */}
      <InteractiveScoreRing score={longevityScore} biologicalAge={biologicalAge} chronologicalAge={chronologicalAge} />

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "HRV", value: `${profile.hrv_ms}`, unit: "ms", good: profile.hrv_ms >= 50 },
          { label: "Sleep", value: `${profile.avg_sleep_hours}`, unit: "h", good: profile.avg_sleep_hours >= 7 },
          { label: "Glucose", value: `${profile.fasting_glucose}`, unit: "mg/dL", good: profile.fasting_glucose <= 90 },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{s.label}</p>
            <p className={`text-xl font-bold mt-0.5 ${s.good ? "text-primary" : "text-foreground"}`}>{s.value}<span className="text-xs font-normal text-muted-foreground ml-0.5">{s.unit}</span></p>
          </div>
        ))}
      </div>

      {/* Data Confidence */}
      <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Data Confidence</span>
            <span className="text-xs font-semibold text-foreground">{dataCompleteness}%</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
          </div>
        </div>
        <Info className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>

      {/* Top 3 Actions */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-3">Today's Focus</h2>
        <div className="space-y-2">
          {actions.slice(0, 3).map((action) => (
            <SwipeableAction
              key={action.id}
              action={action}
              onSwipe={() => handleSwipe(action)}
              onHold={() => handleHold(action)}
            />
          ))}
        </div>
      </div>

      {/* Explain Modal */}
      {explainModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => !explaining && setExplainModal(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-foreground">{explainModal.title}</h3>
              <button onClick={() => setExplainModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{explainModal.content}</p>
            {explaining && <div className="mt-2 w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
          </div>
        </div>
      )}

      {/* Fix Modal */}
      {fixModal && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={() => setFixModal(null)}>
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-md animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-foreground">Action Plan</h3>
              <button onClick={() => setFixModal(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
            </div>
            <h4 className="text-sm font-semibold text-primary mb-2">{fixModal.title}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed">{fixModal.description}</p>
            <button onClick={() => setFixModal(null)} className="mt-4 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold">
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
