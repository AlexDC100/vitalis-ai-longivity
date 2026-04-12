import { useHealth } from "@/lib/health-context";
import { useState } from "react";
import { TrendingUp, TrendingDown, Calendar, AlertTriangle, Clock, Target, Award } from "lucide-react";

const TIME_HORIZONS = [
  { label: "1Y", years: 1 },
  { label: "5Y", years: 5 },
  { label: "10Y", years: 10 },
];

function projectScore(score: number, years: number, improving: boolean): number {
  const rate = improving ? 1.5 : -2;
  return Math.max(0, Math.min(100, Math.round(score + rate * years)));
}

function projectBioAge(bioAge: number, _chronoAge: number, years: number, improving: boolean): number {
  const ageRate = improving ? 0.7 : 1.3;
  return Math.round(bioAge + ageRate * years);
}

function getWeeklyActionCount(): number {
  try {
    const log = JSON.parse(localStorage.getItem("vitalis_action_log") || "{}");
    const now = new Date();
    let total = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if (log[key]) total += log[key].length;
    }
    return total;
  } catch { return 0; }
}

export default function FutureScreen() {
  const { profile, longevityScore, biologicalAge, chronologicalAge } = useHealth();
  const [selectedHorizon, setSelectedHorizon] = useState(1);
  const [scenario, setScenario] = useState<"current" | "optimized" | "neglect">("current");

  const weeklyActions = getWeeklyActionCount();

  const scenarios = {
    current: {
      label: "Current Path",
      color: "text-foreground",
      borderColor: "border-border",
      bgColor: "bg-card",
      score: projectScore(longevityScore, selectedHorizon, false),
      bioAge: projectBioAge(biologicalAge, chronologicalAge, selectedHorizon, false),
      icon: Clock,
    },
    optimized: {
      label: "Optimized",
      color: "text-primary",
      borderColor: "border-primary/30",
      bgColor: "bg-primary/5",
      score: projectScore(longevityScore + 15, selectedHorizon, true),
      bioAge: projectBioAge(biologicalAge - 3, chronologicalAge, selectedHorizon, true),
      icon: TrendingUp,
    },
    neglect: {
      label: "Neglect",
      color: "text-destructive",
      borderColor: "border-destructive/30",
      bgColor: "bg-destructive/5",
      score: projectScore(longevityScore - 10, selectedHorizon, false),
      bioAge: projectBioAge(biologicalAge + 5, chronologicalAge, selectedHorizon, false),
      icon: TrendingDown,
    },
  };

  const current = scenarios[scenario];
  const futureChronoAge = chronologicalAge + selectedHorizon;

  const risks = [
    {
      label: "Cardiovascular",
      current: Math.round(Math.max(5, (profile.ldl - 70) * 0.3 + (profile.bp_systolic - 110) * 0.2)),
      future: scenario === "optimized"
        ? Math.round(Math.max(2, ((profile.ldl - 70) * 0.3 + (profile.bp_systolic - 110) * 0.2) * 0.6))
        : scenario === "neglect"
        ? Math.round(Math.min(60, ((profile.ldl - 70) * 0.3 + (profile.bp_systolic - 110) * 0.2) * 1.5 + selectedHorizon * 2))
        : Math.round(Math.max(5, (profile.ldl - 70) * 0.3 + (profile.bp_systolic - 110) * 0.2) + selectedHorizon),
    },
    {
      label: "Metabolic",
      current: Math.round(Math.max(3, (profile.fasting_glucose - 72) * 0.4 + (profile.hba1c - 4.8) * 5)),
      future: scenario === "optimized"
        ? Math.round(Math.max(1, ((profile.fasting_glucose - 72) * 0.4) * 0.5))
        : scenario === "neglect"
        ? Math.round(Math.min(50, ((profile.fasting_glucose - 72) * 0.4 + (profile.hba1c - 4.8) * 5) * 1.8 + selectedHorizon * 3))
        : Math.round(Math.max(3, (profile.fasting_glucose - 72) * 0.4 + (profile.hba1c - 4.8) * 5) + selectedHorizon * 0.5),
    },
    {
      label: "Inflammation",
      current: Math.round(Math.max(2, profile.hscrp * 8)),
      future: scenario === "optimized"
        ? Math.round(Math.max(1, profile.hscrp * 3))
        : scenario === "neglect"
        ? Math.round(Math.min(45, profile.hscrp * 15 + selectedHorizon * 2))
        : Math.round(Math.max(2, profile.hscrp * 8) + selectedHorizon * 0.5),
    },
  ];

  const yearsGained = scenario === "optimized" ? `+${Math.round(selectedHorizon * 1.5 + 3)}` : scenario === "neglect" ? `-${Math.round(selectedHorizon * 2 + 2)}` : "0";

  return (
    <div className="space-y-4 pb-24 animate-fade-in">
      <div className="text-center pt-1">
        <h1 className="text-lg font-semibold text-foreground">Your Future</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Trajectory & simulation</p>
      </div>

      {/* Weekly Progress Summary */}
      <div className="bg-primary/5 border border-primary/20 rounded-xl p-3">
        <div className="flex items-center gap-2 mb-2">
          <Award className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-bold text-primary uppercase tracking-wider">This Week's Progress</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-primary">{weeklyActions}</p>
            <p className="text-[9px] text-muted-foreground">Actions done</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">+{(weeklyActions * 0.08).toFixed(1)}</p>
            <p className="text-[9px] text-muted-foreground">Years gained</p>
          </div>
          <div>
            <p className="text-lg font-bold text-foreground">-{Math.round(weeklyActions * 1.2)}%</p>
            <p className="text-[9px] text-muted-foreground">Risk reduced</p>
          </div>
        </div>
      </div>

      {/* Time Slider */}
      <div className="flex justify-center gap-2">
        {TIME_HORIZONS.map(h => (
          <button
            key={h.years}
            onClick={() => setSelectedHorizon(h.years)}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${selectedHorizon === h.years ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {h.label}
          </button>
        ))}
      </div>

      {/* Scenario Selector */}
      <div className="grid grid-cols-3 gap-2">
        {(["optimized", "current", "neglect"] as const).map(s => {
          const sc = scenarios[s];
          const Icon = sc.icon;
          const active = scenario === s;
          return (
            <button
              key={s}
              onClick={() => setScenario(s)}
              className={`rounded-xl p-2.5 text-center border transition-all ${active ? `${sc.bgColor} ${sc.borderColor}` : "bg-card border-border opacity-60"}`}
            >
              <Icon className={`w-4 h-4 mx-auto mb-1 ${active ? sc.color : "text-muted-foreground"}`} />
              <p className={`text-[10px] font-semibold ${active ? sc.color : "text-muted-foreground"}`}>{sc.label}</p>
            </button>
          );
        })}
      </div>

      {/* Projected Score */}
      <div className={`${current.bgColor} border ${current.borderColor} rounded-xl p-4 text-center`}>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Projected in {selectedHorizon}Y</p>
        <p className={`text-4xl font-bold ${current.color}`}>{current.score}</p>
        <div className="flex justify-center gap-4 mt-2">
          <div>
            <p className="text-[9px] text-muted-foreground">Bio Age</p>
            <p className="text-sm font-semibold text-foreground">{current.bioAge}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Actual</p>
            <p className="text-sm font-semibold text-foreground">{futureChronoAge}</p>
          </div>
          <div>
            <p className="text-[9px] text-muted-foreground">Years ±</p>
            <p className={`text-sm font-semibold ${scenario === "optimized" ? "text-primary" : scenario === "neglect" ? "text-destructive" : "text-foreground"}`}>{yearsGained}</p>
          </div>
        </div>
      </div>

      {/* Risk Trajectory */}
      <div>
        <h2 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Risk Trajectory</h2>
        <div className="space-y-2">
          {risks.map(risk => {
            const delta = risk.future - risk.current;
            return (
              <div key={risk.label} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-foreground">{risk.label}</span>
                  <span className={`text-xs font-semibold ${delta < 0 ? "text-primary" : delta > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {delta > 0 ? "+" : ""}{delta}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${risk.future > 30 ? "bg-destructive" : risk.future > 15 ? "bg-amber-500" : "bg-primary"}`}
                        style={{ width: `${Math.min(100, risk.future)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] text-muted-foreground w-8 text-right">{risk.future}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Consequence Warning */}
      {scenario === "neglect" && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-3 animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">What happens if you do nothing</p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                <li>• Bio age → {current.bioAge} ({current.bioAge - futureChronoAge}y older)</li>
                <li>• CVD risk +{risks[0].future - risks[0].current}%</li>
                <li>• ~{Math.abs(parseInt(yearsGained))} years healthspan lost</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {scenario === "optimized" && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 animate-fade-in">
          <div className="flex items-start gap-2">
            <Target className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-foreground mb-1">Following recommendations</p>
              <ul className="text-[10px] text-muted-foreground space-y-0.5">
                <li>• Bio age → {current.bioAge} ({futureChronoAge - current.bioAge}y younger)</li>
                <li>• Gain ~{yearsGained.replace("+", "")} healthy years</li>
                <li>• CVD risk -{Math.abs(risks[0].future - risks[0].current)}%</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Check-in */}
      <div className="bg-card border border-border rounded-xl p-3 flex items-center gap-3">
        <Calendar className="w-4 h-4 text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-xs font-medium text-foreground">Weekly Check-in</p>
          <p className="text-[10px] text-muted-foreground">Track progress every Sunday</p>
        </div>
        <span className="text-[10px] font-medium text-primary">Set reminder →</span>
      </div>
    </div>
  );
}
