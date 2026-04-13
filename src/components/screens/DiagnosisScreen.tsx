import { useState, useEffect } from "react";
import { useHealth } from "@/lib/health-context";
import { runDiagnosis, getOverallRisk, SubstanceEntry, Diagnosis } from "@/lib/diagnosis-engine";
import {
  AlertTriangle, ChevronDown, ChevronUp, Zap, Clock,
  Heart, Flame, Moon, Activity, TrendingUp, Shield
} from "lucide-react";

const SEVERITY_STYLES = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400", badge: "bg-red-500/20 text-red-400" },
  high: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400", badge: "bg-amber-500/20 text-amber-400" },
  moderate: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-400", badge: "bg-yellow-500/20 text-yellow-400" },
  low: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400", badge: "bg-emerald-500/20 text-emerald-400" },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Heart & Vessels": Heart,
  "Metabolism": Flame,
  "Inflammation": Activity,
  "Recovery & Sleep": Moon,
  "Hormones": TrendingUp,
};

const URGENCY_LABELS = {
  "now": { text: "Do now", color: "text-red-400" },
  "this-week": { text: "This week", color: "text-amber-400" },
  "this-month": { text: "This month", color: "text-muted-foreground" },
};

export default function DiagnosisScreen() {
  const { profile } = useHealth();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [substances, setSubstances] = useState<SubstanceEntry[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem("vitalis_substances");
    if (saved) {
      try { setSubstances(JSON.parse(saved)); } catch {}
    }
  }, []);

  const diagnoses = runDiagnosis(profile, substances);
  const overall = getOverallRisk(diagnoses);
  const topDiagnosis = diagnoses[0] || null;

  return (
    <div className="pb-24 space-y-6">
      <div className="pt-2">
        {topDiagnosis ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <div className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider ${SEVERITY_STYLES[topDiagnosis.severity].badge}`}>
                {topDiagnosis.severity}
              </div>
              <span className="text-[11px] text-muted-foreground">{topDiagnosis.category}</span>
            </div>
            <h1 className="text-[28px] font-bold text-foreground leading-tight tracking-tight">
              {topDiagnosis.title}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              {topDiagnosis.explanation}
            </p>
            <div className="flex items-center gap-2 mt-3">
              <TrendingUp className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-primary">{topDiagnosis.lifeImpact}</span>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-vitalis-success" />
              <span className="text-sm font-medium text-vitalis-success">All Clear</span>
            </div>
            <h1 className="text-[28px] font-bold text-foreground leading-tight">
              No Issues Detected
            </h1>
            <p className="text-sm text-muted-foreground">
              Your biomarkers are within optimal ranges. Keep monitoring.
            </p>
          </div>
        )}
      </div>

      {topDiagnosis && topDiagnosis.fixes.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            What to fix
          </h2>
          {topDiagnosis.fixes.map((fix, i) => (
            <div
              key={i}
              className="bg-card border border-border/50 rounded-2xl p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{fix.action}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{fix.why}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pl-10">
                <span className="text-xs font-medium text-primary">{fix.impact}</span>
                <span className={`text-[11px] font-medium ${URGENCY_LABELS[fix.urgency].color}`}>
                  <Clock className="w-3 h-3 inline mr-1" />
                  {URGENCY_LABELS[fix.urgency].text}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {diagnoses.length > 1 && (
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Other issues found
          </h2>
          {diagnoses.slice(1).map((diag) => {
            const isExpanded = expanded === diag.id;
            const styles = SEVERITY_STYLES[diag.severity];
            const Icon = CATEGORY_ICONS[diag.category] || AlertTriangle;

            return (
              <button
                key={diag.id}
                onClick={() => setExpanded(isExpanded ? null : diag.id)}
                className={`w-full text-left bg-card border ${styles.border} rounded-2xl p-4 transition-all`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl ${styles.bg} flex items-center justify-center`}>
                      <Icon className={`w-4.5 h-4.5 ${styles.text}`} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{diag.title}</p>
                      <p className="text-[11px] text-muted-foreground">{diag.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${styles.badge}`}>
                      {diag.riskScore}
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-border/30 space-y-3 animate-fade-in">
                    <p className="text-xs text-muted-foreground">{diag.explanation}</p>
                    {diag.fixes.map((fix, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <Zap className="w-3.5 h-3.5 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-medium text-foreground">{fix.action}</p>
                          <p className="text-[11px] text-primary">{fix.impact}</p>
                        </div>
                      </div>
                    ))}
                    <p className="text-xs font-medium text-primary flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" />
                      {diag.lifeImpact}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {diagnoses.length > 0 && (
        <div className="bg-card border border-border/50 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Risk Overview</span>
            <span className={`text-sm font-bold ${overall.color}`}>{overall.label}</span>
          </div>
          <div className="space-y-2">
            {diagnoses.map((d) => (
              <div key={d.id} className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground w-24 shrink-0 truncate">{d.category}</span>
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      d.severity === "critical" ? "bg-red-500" :
                      d.severity === "high" ? "bg-amber-500" :
                      d.severity === "moderate" ? "bg-yellow-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${d.riskScore}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground w-8 text-right">{d.riskScore}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
