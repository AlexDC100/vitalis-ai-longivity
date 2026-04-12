import { useHealth } from "@/lib/health-context";
import { Shield, AlertTriangle, CheckCircle, Info } from "lucide-react";

interface RiskItem {
  name: string;
  score: number;
  factors: string[];
  status: "low" | "moderate" | "high";
}

export default function RiskEngine() {
  const { profile } = useHealth();

  const risks: RiskItem[] = [
    {
      name: "Cardiovascular Disease",
      score: profile.ldl > 130 || profile.bp_systolic > 130 ? 72 : profile.ldl > 100 ? 46 : 25,
      factors: [`LDL: ${profile.ldl}`, `BP: ${profile.bp_systolic}/${profile.bp_diastolic}`, `hsCRP: ${profile.hscrp}`, `ApoB: ${profile.apob}`],
      status: profile.ldl > 130 ? "high" : profile.ldl > 100 ? "moderate" : "low",
    },
    {
      name: "Type 2 Diabetes",
      score: profile.fasting_glucose > 100 || profile.hba1c > 5.6 ? 58 : profile.fasting_glucose > 90 ? 35 : 18,
      factors: [`Glucose: ${profile.fasting_glucose}`, `HbA1c: ${profile.hba1c}`, `Insulin: ${profile.fasting_insulin}`],
      status: profile.fasting_glucose > 100 ? "high" : profile.fasting_glucose > 90 ? "moderate" : "low",
    },
    {
      name: "Metabolic Syndrome",
      score: profile.waist_cm > 102 || profile.triglycerides > 150 ? 55 : 28,
      factors: [`Waist: ${profile.waist_cm}cm`, `Triglycerides: ${profile.triglycerides}`, `HDL: ${profile.hdl}`],
      status: profile.waist_cm > 102 ? "high" : profile.waist_cm > 94 ? "moderate" : "low",
    },
    {
      name: "Cognitive Decline",
      score: profile.homocysteine > 12 ? 42 : 22,
      factors: [`Homocysteine: ${profile.homocysteine}`, `Sleep: ${profile.avg_sleep_hours}h`, `HRV: ${profile.hrv_ms}ms`],
      status: profile.homocysteine > 12 ? "moderate" : "low",
    },
    {
      name: "Hormonal Imbalance",
      score: profile.testosterone < 400 || profile.cortisol > 20 ? 48 : 20,
      factors: [`Testosterone: ${profile.testosterone}`, `Cortisol: ${profile.cortisol}`, `TSH: ${profile.tsh}`],
      status: profile.testosterone < 400 ? "moderate" : "low",
    },
    {
      name: "Chronic Inflammation",
      score: profile.hscrp > 3 ? 65 : profile.hscrp > 1 ? 40 : 15,
      factors: [`hsCRP: ${profile.hscrp}`, `Homocysteine: ${profile.homocysteine}`, `Vitamin D: ${profile.vitamin_d}`],
      status: profile.hscrp > 3 ? "high" : profile.hscrp > 1 ? "moderate" : "low",
    },
  ];

  const statusColor = (s: string) =>
    s === "high" ? "text-vitalis-danger bg-vitalis-danger/10 border-vitalis-danger/30" :
    s === "moderate" ? "text-vitalis-warning bg-vitalis-warning/10 border-vitalis-warning/30" :
    "text-vitalis-success bg-vitalis-success/10 border-vitalis-success/30";

  const StatusIcon = (s: string) =>
    s === "high" ? AlertTriangle : s === "moderate" ? Info : CheckCircle;

  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" />
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Risk Engine</h1>
        </div>
        <p className="text-sm text-muted-foreground">Disease risk assessment based on your biomarkers</p>
      </div>

      <div className="grid gap-4">
        {risks.sort((a, b) => b.score - a.score).map((risk) => {
          const Icon = StatusIcon(risk.status);
          return (
            <div key={risk.name} className="bg-card border border-border rounded-xl p-5 hover:border-primary/20 transition-colors">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${risk.status === "high" ? "text-vitalis-danger" : risk.status === "moderate" ? "text-vitalis-warning" : "text-vitalis-success"}`} />
                  <h3 className="font-semibold text-foreground">{risk.name}</h3>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${statusColor(risk.status)}`}>
                  {risk.status.toUpperCase()} — {risk.score}/100
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-muted mb-3">
                <div className={`h-full rounded-full transition-all ${
                  risk.status === "high" ? "bg-vitalis-danger" : risk.status === "moderate" ? "bg-vitalis-warning" : "bg-vitalis-success"
                }`} style={{ width: `${risk.score}%` }} />
              </div>
              <div className="flex flex-wrap gap-2">
                {risk.factors.map((f) => (
                  <span key={f} className="px-2 py-1 rounded bg-secondary text-[11px] text-muted-foreground border border-border">{f}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
