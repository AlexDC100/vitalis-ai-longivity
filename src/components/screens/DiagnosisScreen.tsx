import { useState, useEffect, useRef, useCallback } from "react";
import { useHealth } from "@/lib/health-context";
import { useSubstances } from "@/lib/use-substances";
import { useActionLog } from "@/lib/use-action-log";
import {
  runDiagnosis, getOverallRisk, getAllSystemScores,
  calculateConfidence, diffDiagnosis,
  Diagnosis, DiagnosisChange,
} from "@/lib/diagnosis-engine";
import {
  AlertTriangle, Zap, Clock, TrendingUp, Shield,
  Heart, Flame, Moon, Activity, ChevronRight,
  ArrowUpRight, ArrowDownRight, Sparkles, Info, Check,
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
  const { substances } = useSubstances();
  const { getTodayCompleted, completeAction } = useActionLog();
  const [changes, setChanges] = useState<DiagnosisChange[]>([]);
  const prevDiagRef = useRef<Diagnosis | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Today's completed actions come from the RLS-protected `action_completions` table.
  const completedFixes = getTodayCompleted();

  const completeFix = useCallback(
    (fixId: string, label: string) => {
      void completeAction(fixId, label);
      setFeedbackMsg(`✓ ${label}`);
      setTimeout(() => setFeedbackMsg(null), 2500);
    },
    [completeAction],
  );

  const diagnosis = runDiagnosis(profile, substances);
  const overall = getOverallRisk(diagnosis);
  const confidence = calculateConfidence(profile);
  const systems = getAllSystemScores(profile, substances);
  const styles = SEVERITY_STYLES[diagnosis.severity];

  // Track changes — kept in-memory only (previous version persisted full
  // diagnosis in localStorage, which leaked sensitive medical data).
  useEffect(() => {
    if (prevDiagRef.current) {
      const diff = diffDiagnosis(prevDiagRef.current, diagnosis);
      if (diff.length > 0) setChanges(diff);
    }
    prevDiagRef.current = diagnosis;
  }, [diagnosis.id, diagnosis.riskScore, diagnosis.severity]);

  const hasProblem = diagnosis.riskScore > 0;

  return (
    <div className="pb-24 space-y-6">
      {/* What Changed? Banner */}
      {changes.length > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 space-y-2 animate-fade-in">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-primary uppercase tracking-wider">What changed</span>
            <button
              onClick={() => setChanges([])}
              className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
            >
              Dismiss
            </button>
          </div>
          {changes.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              {c.type === "improved" || c.type === "resolved" ? (
                <ArrowDownRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <ArrowUpRight className="w-3.5 h-3.5 text-red-400 shrink-0" />
              )}
              <span className="text-xs text-foreground">{c.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Feedback Toast */}
      {feedbackMsg && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-primary text-primary-foreground px-4 py-2 rounded-full text-xs font-semibold shadow-lg animate-fade-in flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" />
          {feedbackMsg}
        </div>
      )}

      {/* Main Diagnosis */}
      <div className="pt-1">
        {hasProblem ? (
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-3">
              <div className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold uppercase tracking-wider ${styles.badge}`}>
                {diagnosis.severity}
              </div>
              <span className="text-[11px] text-muted-foreground">{diagnosis.category}</span>
            </div>

            <h1 className="text-[28px] font-bold text-foreground leading-tight tracking-tight">
              {diagnosis.title}
            </h1>

            <p className="text-sm text-muted-foreground leading-relaxed mt-2">
              {diagnosis.explanation}
            </p>

            <div className="flex items-center gap-4 mt-3">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-medium text-primary">{diagnosis.lifeImpact}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">All Clear</span>
            </div>
            <h1 className="text-[28px] font-bold text-foreground leading-tight">
              No Issues Detected
            </h1>
            <p className="text-sm text-muted-foreground">
              Your biomarkers are within optimal ranges. Continue monitoring.
            </p>
          </div>
        )}
      </div>

      {/* Confidence Score */}
      <div className="flex items-center gap-3 bg-card border border-border/50 rounded-2xl p-4">
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Diagnosis Confidence</span>
            <span className={`text-sm font-bold ${confidence >= 80 ? 'text-emerald-400' : confidence >= 50 ? 'text-amber-400' : 'text-red-400'}`}>
              {confidence}%
            </span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                confidence >= 80 ? 'bg-emerald-500' : confidence >= 50 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${confidence}%` }}
            />
          </div>
          {confidence < 70 && (
            <div className="flex items-center gap-1.5 mt-2">
              <Info className="w-3 h-3 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                Upload labs to improve accuracy
              </span>
            </div>
          )}
        </div>
      </div>

      {/* What to Fix — max 3 actions */}
      {hasProblem && diagnosis.fixes.length > 0 && (
        <div className="space-y-2.5">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            What to fix
          </h2>
          {diagnosis.fixes.map((fix, i) => {
            const fixId = `fix-${i}-${fix.action.slice(0, 20).replace(/\s/g, '-')}`;
            const isDone = completedFixes.includes(fixId);
            return (
            <div
              key={i}
              className={`bg-card border border-border/50 rounded-2xl p-4 space-y-2 transition-opacity ${isDone ? "opacity-50" : ""}`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isDone ? "bg-primary/20" : "bg-primary/10"}`}>
                  {isDone ? <Check className="w-4 h-4 text-primary" /> : <Zap className="w-4 h-4 text-primary" />}
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-semibold ${isDone ? "line-through text-muted-foreground" : "text-foreground"}`}>{fix.action}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{fix.why}</p>
                </div>
                {!isDone && (
                  <button
                    onClick={() => completeFix(fixId, fix.action)}
                    className="w-7 h-7 rounded-full border border-border flex items-center justify-center shrink-0 hover:bg-primary/10 hover:border-primary/30 transition-colors mt-0.5"
                  >
                    <Check className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between pl-10">
                <span className="text-xs font-medium text-primary">{fix.impact}</span>
                <span className={`text-[11px] font-medium ${URGENCY_LABELS[fix.urgency].color}`}>
                  <Clock className="w-3 h-3 inline mr-1" />
                  {URGENCY_LABELS[fix.urgency].text}
                </span>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {/* System Risk Overview */}
      <div className="bg-card border border-border/50 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">System Risk Map</span>
          <span className={`text-sm font-bold ${overall.color}`}>{overall.label}</span>
        </div>
        <div className="space-y-2.5">
          {systems.map((sys) => {
            const Icon = CATEGORY_ICONS[sys.category] || AlertTriangle;
            const isTop = sys.id === diagnosis.id;
            const barColor =
              sys.score >= 45 ? "bg-red-500" :
              sys.score >= 25 ? "bg-amber-500" :
              sys.score >= 10 ? "bg-yellow-500" : "bg-emerald-500";

            return (
              <div key={sys.id} className={`flex items-center gap-3 ${isTop ? 'opacity-100' : 'opacity-60'}`}>
                <Icon className={`w-3.5 h-3.5 shrink-0 ${isTop ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-[11px] text-muted-foreground w-24 shrink-0 truncate">{sys.category}</span>
                <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barColor}`}
                    style={{ width: `${Math.max(sys.score, 2)}%` }}
                  />
                </div>
                <span className="text-[11px] font-mono text-muted-foreground w-6 text-right">{sys.score}</span>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
