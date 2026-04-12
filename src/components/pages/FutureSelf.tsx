import { useHealth } from "@/lib/health-context";
import { TrendingUp, Zap, ArrowRight } from "lucide-react";
import { useState } from "react";

export default function FutureSelf() {
  const { profile, longevityScore, biologicalAge, chronologicalAge } = useHealth();
  const [yearsAhead, setYearsAhead] = useState(10);

  const projections = [
    { scenario: "Current Path", scoreChange: -5, ageChange: yearsAhead + 2, risk: "CVD risk increases 15%", color: "text-vitalis-warning" },
    { scenario: "Optimized Path", scoreChange: +12, ageChange: yearsAhead - 3, risk: "CVD risk decreases 30%", color: "text-vitalis-success" },
    { scenario: "Aggressive Optimization", scoreChange: +22, ageChange: yearsAhead - 7, risk: "All-cause mortality -40%", color: "text-primary" },
  ];

  const interventions = [
    { action: "Increase VO2 Max to 50+", impact: "+8 pts", difficulty: "High", timeframe: "6-12 months" },
    { action: "Lower LDL to <100", impact: "+5 pts", difficulty: "Medium", timeframe: "3-6 months" },
    { action: "Improve sleep to 7.5h+", impact: "+4 pts", difficulty: "Medium", timeframe: "1-3 months" },
    { action: "Reduce hsCRP to <1.0", impact: "+4 pts", difficulty: "Medium", timeframe: "3-6 months" },
    { action: "Increase HRV to 60+", impact: "+3 pts", difficulty: "High", timeframe: "6-12 months" },
  ];

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Future Self</h1>
        </div>
        <p className="text-sm text-muted-foreground">Trajectory simulator — see your health future</p>
      </div>

      {/* Timeline slider */}
      <div className="bg-card border border-border rounded-xl p-5">
        <label className="text-sm font-medium text-foreground block mb-3">Projection Timeline: {yearsAhead} years</label>
        <input
          type="range" min={1} max={30} value={yearsAhead}
          onChange={(e) => setYearsAhead(Number(e.target.value))}
          className="w-full accent-primary"
        />
        <div className="flex justify-between text-xs text-muted-foreground mt-1">
          <span>1 year</span><span>30 years</span>
        </div>
      </div>

      {/* Projections */}
      <div className="grid gap-4 md:grid-cols-3">
        {projections.map((p) => (
          <div key={p.scenario} className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-colors">
            <h3 className={`text-sm font-semibold mb-3 ${p.color}`}>{p.scenario}</h3>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Longevity Score</p>
                <p className="text-2xl font-bold text-foreground">{longevityScore + p.scoreChange}<span className="text-sm ml-1 text-muted-foreground">/100</span></p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Biological Age in {yearsAhead}y</p>
                <p className="text-lg font-semibold text-foreground">{biologicalAge + p.ageChange}</p>
              </div>
              <p className="text-xs text-muted-foreground border-t border-border pt-2">{p.risk}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Key interventions */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="font-semibold text-foreground mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4 text-primary" /> Key Interventions to Optimize
        </h3>
        <div className="space-y-3">
          {interventions.map((item, i) => (
            <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-primary w-6">{i + 1}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{item.action}</p>
                  <p className="text-[11px] text-muted-foreground">{item.timeframe} • {item.difficulty} difficulty</p>
                </div>
              </div>
              <span className="text-sm font-bold text-vitalis-success">{item.impact}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
