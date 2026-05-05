import { useHealth } from "@/lib/health-context";
import { useSubstances } from "@/lib/use-substances";
import { runDiagnosis, getAllSystemScores } from "@/lib/diagnosis-engine";
import ScoreRing from "@/components/ScoreRing";
import { Heart, Moon, Activity, Droplets, Sparkles, ArrowRight, Sun } from "lucide-react";
import { useMemo } from "react";

const SYSTEM_META: Record<string, { label: string; Icon: any; tone: string }> = {
  cardiovascular: { label: "Cardiovascular", Icon: Heart,    tone: "text-rose-400" },
  metabolic:      { label: "Metabolic",      Icon: Droplets, tone: "text-amber-400" },
  recovery:       { label: "Recovery",       Icon: Moon,     tone: "text-violet-400" },
  hormonal:       { label: "Hormonal",       Icon: Sparkles, tone: "text-emerald-400" },
};

function humanInsight(title: string): string {
  if (!title) return "Your body is in a steady, calm baseline.";
  const t = title.toLowerCase();
  if (t.includes("cardio") || t.includes("ldl") || t.includes("apob") || t.includes("blood pressure"))
    return "Your cardiovascular system needs attention.";
  if (t.includes("inflam") || t.includes("crp"))
    return "Your body shows signs of stress and inflammation.";
  if (t.includes("sleep") || t.includes("recovery") || t.includes("hrv"))
    return "Your recovery is running below your baseline.";
  if (t.includes("glucose") || t.includes("insulin") || t.includes("metabolic") || t.includes("hba1c"))
    return "Your metabolism could use a gentle reset.";
  if (t.includes("hormone") || t.includes("testosterone") || t.includes("thyroid"))
    return "Your hormonal balance is asking for a closer look.";
  return "One area of your health is asking for attention.";
}

function timeOfDayGreeting(name?: string) {
  const hr = new Date().getHours();
  const greet = hr < 12 ? "Good morning" : hr < 18 ? "Good afternoon" : "Good evening";
  return name ? `${greet}, ${name.split(" ")[0]}` : greet;
}

interface Props {
  onGoBody: () => void;
  onGoDoctor: () => void;
  onGoInsights: () => void;
}

export default function HomeScreen({ onGoBody, onGoDoctor, onGoInsights }: Props) {
  const { profile, longevityScore, biologicalAge, chronologicalAge } = useHealth();
  const { substances } = useSubstances();

  const diagnosis = useMemo(() => runDiagnosis(profile, substances), [profile, substances]);
  const systems = useMemo(() => getAllSystemScores(profile, substances).slice(0, 4), [profile, substances]);

  const insight = humanInsight(diagnosis.title);
  const firstFix = diagnosis.fixes[0];
  const suggestion = firstFix
    ? firstFix.action
    : "Keep your sleep and movement steady today.";

  return (
    <div className="space-y-8 pb-24 animate-fade-in">
      {/* Greeting */}
      <div className="pt-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1">
          <Sun className="w-3 h-3" />
          Your health today
        </div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground leading-tight">
          {timeOfDayGreeting(profile.full_name)}
        </h1>
      </div>

      {/* Score ring */}
      <div className="flex flex-col items-center pt-2">
        <div className="relative">
          <div className="absolute inset-0 -m-6 rounded-full bg-primary/10 blur-2xl" />
          <ScoreRing score={Math.max(0, Math.min(100, longevityScore))} size={220} strokeWidth={10} />
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          Biological age <span className="text-foreground font-medium">{biologicalAge}</span>
          <span className="mx-2 text-border">·</span>
          Actual age <span className="text-foreground font-medium">{chronologicalAge}</span>
        </p>
      </div>

      {/* One key insight */}
      <button
        onClick={onGoInsights}
        className="w-full text-left rounded-3xl p-6 bg-card/60 border border-border/40 backdrop-blur-xl hover:border-primary/30 transition-all group"
      >
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-2">
          Today's insight
        </div>
        <p className="text-[19px] leading-snug font-medium text-foreground tracking-tight">
          {insight}
        </p>
        <div className="mt-3 inline-flex items-center gap-1 text-[12px] text-primary group-hover:gap-2 transition-all">
          See what it means <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </button>

      {/* Suggested action */}
      <button
        onClick={onGoDoctor}
        className="w-full text-left rounded-3xl p-6 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border border-primary/20 hover:border-primary/40 transition-all group"
      >
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-primary/80 mb-2">
          What to do next
        </div>
        <p className="text-[17px] leading-snug font-medium text-foreground tracking-tight">
          {suggestion}
        </p>
        <div className="mt-3 inline-flex items-center gap-1 text-[12px] text-primary group-hover:gap-2 transition-all">
          Ask your AI doctor <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </button>

      {/* Systems strip */}
      <button
        onClick={onGoBody}
        className="w-full text-left rounded-3xl p-5 bg-card/60 border border-border/40 backdrop-blur-xl hover:border-primary/30 transition-all"
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
            Body systems
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
        </div>
        <div className="space-y-3">
          {systems.map((s) => {
            const meta = SYSTEM_META[s.id] ?? { label: s.id, Icon: Activity, tone: "text-muted-foreground" };
            const health = Math.max(2, 100 - s.score);
            const barTone =
              health >= 75 ? "bg-emerald-400" :
              health >= 55 ? "bg-primary" :
              health >= 35 ? "bg-amber-400" : "bg-rose-400";
            return (
              <div key={s.id} className="flex items-center gap-3">
                <meta.Icon className={`w-4 h-4 shrink-0 ${meta.tone}`} />
                <span className="text-[12.5px] text-foreground w-28 shrink-0">{meta.label}</span>
                <div className="flex-1 h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${barTone}`}
                    style={{ width: `${health}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </button>

      <p className="text-center text-[10.5px] text-muted-foreground/70 pt-1">
        AI guidance — not a substitute for a licensed doctor.
      </p>
    </div>
  );
}