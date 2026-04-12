import { useHealth } from "@/lib/health-context";
import { Layers, ArrowUp, ArrowDown, Minus, ExternalLink } from "lucide-react";

interface Intervention {
  name: string;
  category: string;
  impact: number;
  evidence: string;
  status: "not-started" | "in-progress" | "completed";
  description: string;
}

export default function ActionStack() {
  const { profile } = useHealth();

  const interventions: Intervention[] = [
    { name: "Zone 2 Cardio Training", category: "Exercise", impact: 9.2, evidence: "Strong", status: "in-progress", description: "4x/week 45min sessions at 60-70% max HR to improve VO2 max" },
    { name: "Statin or PCSK9 Evaluation", category: "Medication", impact: 8.8, evidence: "Strong", status: "not-started", description: "LDL is elevated at " + profile.ldl + " — discuss with doctor" },
    { name: "Sleep Optimization Protocol", category: "Lifestyle", impact: 7.5, evidence: "Strong", status: "not-started", description: "Target 7.5-8.5h sleep, improve quality from " + profile.sleep_quality + "/100" },
    { name: "Anti-inflammatory Diet", category: "Nutrition", impact: 7.2, evidence: "Moderate", status: "in-progress", description: "Reduce hsCRP from " + profile.hscrp + " to <1.0 mg/L" },
    { name: "Omega-3 Supplementation", category: "Supplement", impact: 6.8, evidence: "Strong", status: "completed", description: "2g EPA+DHA daily for cardiovascular and inflammation" },
    { name: "Vitamin D Optimization", category: "Supplement", impact: 6.2, evidence: "Moderate", status: "not-started", description: "Current: " + profile.vitamin_d + " ng/mL — target 40-60" },
    { name: "Strength Training", category: "Exercise", impact: 8.0, evidence: "Strong", status: "in-progress", description: "3x/week resistance training for muscle mass and metabolic health" },
    { name: "Continuous Glucose Monitor", category: "Monitoring", impact: 5.5, evidence: "Moderate", status: "not-started", description: "Track glucose responses with fasting glucose at " + profile.fasting_glucose },
    { name: "Meditation / Stress Management", category: "Lifestyle", impact: 5.0, evidence: "Moderate", status: "not-started", description: "Improve HRV from " + profile.hrv_ms + "ms, reduce cortisol" },
  ].sort((a, b) => b.impact - a.impact);

  const statusStyle = (s: string) =>
    s === "completed" ? "bg-vitalis-success/15 text-vitalis-success border-vitalis-success/30" :
    s === "in-progress" ? "bg-primary/15 text-primary border-primary/30" :
    "bg-secondary text-muted-foreground border-border";

  const categoryColor = (c: string) =>
    c === "Exercise" ? "text-vitalis-success" :
    c === "Medication" ? "text-vitalis-danger" :
    c === "Nutrition" ? "text-vitalis-warning" :
    c === "Supplement" ? "text-vitalis-info" :
    c === "Lifestyle" ? "text-primary" : "text-muted-foreground";

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Layers className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Action Stack</h1>
        </div>
        <p className="text-sm text-muted-foreground">Ranked interventions by impact on your longevity</p>
      </div>

      <div className="space-y-3">
        {interventions.map((item, i) => (
          <div key={i} className="bg-card border border-border rounded-xl p-4 hover:border-primary/20 transition-colors">
            <div className="flex items-start gap-4">
              <div className="flex flex-col items-center gap-1">
                <span className="text-lg font-bold text-primary">#{i + 1}</span>
                <span className="text-xs text-muted-foreground">{item.impact}/10</span>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                  <span className={`text-[10px] font-semibold ${categoryColor(item.category)}`}>{item.category}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{item.description}</p>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusStyle(item.status)}`}>
                    {item.status.replace("-", " ").toUpperCase()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Evidence: {item.evidence}</span>
                </div>
              </div>
              <div className="w-16 h-2 rounded-full bg-muted flex-shrink-0 mt-2">
                <div className="h-full rounded-full bg-primary" style={{ width: `${item.impact * 10}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
