import { useHealth } from "@/lib/health-context";
import { useSubstances } from "@/lib/use-substances";
import { useActionLog } from "@/lib/use-action-log";
import { runDiagnosis } from "@/lib/diagnosis-engine";
import { Sparkles, Heart, Moon, Activity, Check, Watch, ArrowRight } from "lucide-react";
import { useMemo } from "react";

function humanizeTitle(title: string): string {
  if (!title) return "Your body is in a calm, steady baseline.";
  const t = title.toLowerCase();
  if (t.includes("inflam") || t.includes("crp")) return "Your body shows signs of stress and inflammation.";
  if (t.includes("ldl") || t.includes("apob") || t.includes("cardio")) return "Your heart and vessels need a little care right now.";
  if (t.includes("sleep") || t.includes("hrv") || t.includes("recovery")) return "Your recovery is running below your usual rhythm.";
  if (t.includes("glucose") || t.includes("insulin") || t.includes("hba1c") || t.includes("metabolic")) return "Your metabolism could use a gentle reset.";
  if (t.includes("hormone") || t.includes("testosterone") || t.includes("thyroid")) return "Your hormonal balance is asking for a closer look.";
  return title;
}

function softenWhy(why: string): string {
  return why
    .replace(/risk of/gi, "chance of")
    .replace(/elevated/gi, "slightly raised")
    .replace(/severe/gi, "notable");
}

export default function InsightsScreen() {
  const { profile, longevityScore } = useHealth();
  const { substances } = useSubstances();
  const { getTodayCompleted, completeAction } = useActionLog();
  const diagnosis = useMemo(() => runDiagnosis(profile, substances), [profile, substances]);
  const completed = getTodayCompleted();

  const fixes = diagnosis.fixes.slice(0, 3);

  // Live signals — placeholder values until a wearable is paired.
  const signals = [
    { label: "Sleep",     value: profile.avg_sleep_hours ? `${profile.avg_sleep_hours}h` : "—", Icon: Moon,     tone: "text-violet-400" },
    { label: "Recovery",  value: profile.hrv_ms ? `${profile.hrv_ms} ms` : "—",                Icon: Activity, tone: "text-emerald-400" },
    { label: "Heart",     value: profile.resting_hr ? `${profile.resting_hr} bpm` : "—",      Icon: Heart,    tone: "text-rose-400" },
  ];

  const recovered = (profile.hrv_ms ?? 0) > 50 && (profile.avg_sleep_hours ?? 0) >= 7;

  return (
    <div className="space-y-8 pb-24 animate-fade-in">
      <header className="pt-2">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1">
          <Sparkles className="w-3 h-3" />
          Insights
        </div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          What your body is saying
        </h1>
      </header>

      {/* Hero insight */}
      <div className="rounded-3xl p-6 bg-card/60 border border-border/40 backdrop-blur-xl">
        <div className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-2">
          Today
        </div>
        <p className="text-[20px] leading-snug font-medium text-foreground tracking-tight">
          {humanizeTitle(diagnosis.title)}
        </p>
        <p className="text-[13px] text-muted-foreground mt-3 leading-relaxed">
          {diagnosis.explanation || "Your data is steady. Keep doing what's working — sleep, movement, and steady meals."}
        </p>
      </div>

      {/* What to do next */}
      {fixes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
            What to do next
          </h2>
          {fixes.map((fix, i) => {
            const id = `fix-${i}-${fix.action.slice(0, 20).replace(/\s/g, "-")}`;
            const done = completed.includes(id);
            return (
              <div
                key={id}
                className={`rounded-3xl p-5 bg-card/60 border border-border/40 backdrop-blur-xl flex items-start gap-4 transition-opacity ${done ? "opacity-60" : ""}`}
              >
                <div className="flex-1 min-w-0">
                  <p className={`text-[15px] font-medium text-foreground ${done ? "line-through text-muted-foreground" : ""}`}>
                    {fix.action}
                  </p>
                  <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed">
                    {softenWhy(fix.why)}
                  </p>
                  {fix.impact && (
                    <p className="text-[11.5px] text-primary mt-2">{fix.impact}</p>
                  )}
                </div>
                <button
                  onClick={() => completeAction(id, fix.action)}
                  className={`w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-all ${
                    done
                      ? "bg-primary/15 border-primary/30 text-primary"
                      : "border-border hover:border-primary/40 hover:bg-primary/5 text-muted-foreground"
                  }`}
                  aria-label={done ? "Mark as not done" : "Mark as done"}
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </section>
      )}

      {/* Live signals */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
            Live signals
          </h2>
          <span className="text-[10.5px] text-muted-foreground/70 inline-flex items-center gap-1">
            <Watch className="w-3 h-3" /> from connected devices
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          {signals.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl p-4 bg-card/60 border border-border/40 backdrop-blur-xl"
            >
              <s.Icon className={`w-4 h-4 ${s.tone} mb-2`} />
              <div className="text-[18px] font-semibold text-foreground tracking-tight">
                {s.value}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
        <div className="rounded-2xl p-4 bg-card/40 border border-border/30 text-[12.5px] text-muted-foreground leading-relaxed flex items-start gap-2">
          <ArrowRight className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
          <span>
            {recovered
              ? "You look well-recovered today — a good day to push a little."
              : "You are not fully recovered today — prioritize rest and gentle movement."}
          </span>
        </div>
      </section>

      <p className="text-center text-[10.5px] text-muted-foreground/70 pt-1">
        AI-assisted insight — please confirm anything clinical with a licensed doctor.
      </p>
    </div>
  );
}