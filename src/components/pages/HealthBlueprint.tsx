import { useHealth } from "@/lib/health-context";
import { Button } from "@/components/ui/button";
import { Save, ChevronDown, ChevronUp, Activity, Heart, Brain, Flame, Shield, TrendingUp, AlertTriangle, CheckCircle, Clock, Zap, Target, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface FieldDef {
  key: keyof ReturnType<typeof useHealth>["profile"];
  label: string;
  unit?: string;
  hint?: string;
  type?: string;
}

interface Section {
  title: string;
  subtitle: string;
  badge?: string;
  fields: FieldDef[];
}

interface BiomarkerAnalysis {
  key: string;
  value: number;
  status: "optimal" | "suboptimal" | "warning" | "critical";
  optimal_range: string;
  interpretation: string;
  longevity_impact: number;
  improvement_potential: string;
}

interface HealthScores {
  overall_longevity: number;
  metabolic_health: number;
  cardiovascular_risk: number;
  hormonal_balance: number;
  inflammation_index: number;
  biological_age_estimate: number;
  projected_healthspan_years: number;
  top_risk_factors: string[];
}

interface Recommendation {
  title: string;
  description: string;
  priority: string;
  category: string;
  expected_impact?: string;
  timeline?: string;
}

interface MedicineItem {
  name: string;
  dosage: string;
  frequency: string;
  reason: string;
  priority: number;
}

const sections: Section[] = [
  {
    title: "Identity & Basic Metrics",
    subtitle: "Core biometric data",
    fields: [
      { key: "full_name", label: "Full Name", type: "text" },
      { key: "date_of_birth", label: "Date of Birth", type: "date" },
      { key: "sex", label: "Sex", type: "text" },
      { key: "height_cm", label: "Height", unit: "cm" },
      { key: "weight_kg", label: "Weight", unit: "kg" },
      { key: "body_fat_pct", label: "Body Fat", unit: "%" },
      { key: "waist_cm", label: "Waist Circumference", unit: "cm" },
      { key: "bp_systolic", label: "BP Systolic", unit: "mmHg" },
      { key: "bp_diastolic", label: "BP Diastolic", unit: "mmHg" },
    ],
  },
  {
    title: "Biometrics & Performance",
    subtitle: "HRV, fitness, and recovery data",
    fields: [
      { key: "hrv_ms", label: "HRV", unit: "ms", hint: "Heart rate variability — key recovery metric" },
      { key: "resting_hr", label: "Resting Heart Rate", unit: "bpm" },
      { key: "vo2_max", label: "VO2 Max", unit: "ml/kg/min", hint: "Strongest predictor of longevity" },
      { key: "avg_sleep_hours", label: "Avg Sleep", unit: "hours/night" },
      { key: "sleep_quality", label: "Sleep Quality", unit: "0-100 score" },
      { key: "fev1_pct", label: "FEV1", unit: "% of predicted", hint: "Lung function test" },
    ],
  },
  {
    title: "Blood Work — Metabolic",
    subtitle: "Glucose, insulin, and metabolic markers",
    badge: "HIGH IMPACT",
    fields: [
      { key: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL", hint: "Optimal: 70-90" },
      { key: "hba1c", label: "HbA1c", unit: "%", hint: "3-month glucose average. Optimal < 5.4%" },
      { key: "fasting_insulin", label: "Fasting Insulin", unit: "μIU/mL", hint: "Optimal < 6 μIU/mL" },
    ],
  },
  {
    title: "Blood Work — Lipids",
    subtitle: "Cardiovascular lipid panel",
    badge: "HIGH IMPACT",
    fields: [
      { key: "total_cholesterol", label: "Total Cholesterol", unit: "mg/dL" },
      { key: "ldl", label: "LDL", unit: "mg/dL", hint: "Optimal < 100" },
      { key: "hdl", label: "HDL", unit: "mg/dL", hint: "Optimal > 60" },
      { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", hint: "Optimal < 100" },
      { key: "apob", label: "ApoB", unit: "mg/dL", hint: "Best single CVD marker" },
      { key: "lpa", label: "Lp(a)", unit: "nmol/L", hint: "Genetic risk marker" },
    ],
  },
  {
    title: "Inflammation & Cellular",
    subtitle: "Systemic inflammation markers",
    fields: [
      { key: "hscrp", label: "hsCRP", unit: "mg/L", hint: "Optimal < 1.0" },
      { key: "homocysteine", label: "Homocysteine", unit: "μmol/L", hint: "Optimal < 8" },
      { key: "vitamin_d", label: "Vitamin D", unit: "ng/mL", hint: "Optimal 40-60" },
    ],
  },
  {
    title: "Hormones",
    subtitle: "Endocrine & hormone panel",
    fields: [
      { key: "testosterone", label: "Testosterone", unit: "ng/dL" },
      { key: "free_t", label: "Free T", unit: "pg/mL" },
      { key: "estradiol", label: "Estradiol", unit: "pg/mL" },
      { key: "dhea_s", label: "DHEA-S", unit: "μg/dL" },
      { key: "cortisol", label: "Cortisol", unit: "μg/dL" },
      { key: "tsh", label: "TSH", unit: "mIU/L" },
      { key: "free_t3", label: "Free T3", unit: "pg/mL" },
      { key: "free_t4", label: "Free T4", unit: "ng/dL" },
      { key: "igf1", label: "IGF-1", unit: "ng/mL" },
    ],
  },
];

const statusColor = (s: string) => {
  switch (s) {
    case "optimal": return "text-emerald-400 bg-emerald-400/10 border-emerald-400/30";
    case "suboptimal": return "text-amber-400 bg-amber-400/10 border-amber-400/30";
    case "warning": return "text-orange-400 bg-orange-400/10 border-orange-400/30";
    case "critical": return "text-red-400 bg-red-400/10 border-red-400/30";
    default: return "text-muted-foreground bg-muted border-border";
  }
};

const statusIcon = (s: string) => {
  switch (s) {
    case "optimal": return <CheckCircle className="w-3.5 h-3.5" />;
    case "suboptimal": return <Clock className="w-3.5 h-3.5" />;
    case "warning": return <AlertTriangle className="w-3.5 h-3.5" />;
    case "critical": return <AlertTriangle className="w-3.5 h-3.5" />;
    default: return null;
  }
};

const priorityColor = (p: string) => {
  switch (p) {
    case "critical": return "bg-red-500/20 text-red-400 border-red-500/30";
    case "high": return "bg-orange-500/20 text-orange-400 border-orange-500/30";
    case "medium": return "bg-amber-500/20 text-amber-400 border-amber-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
};

function ScoreGauge({ label, value, icon: Icon }: { label: string; value: number; icon: React.ElementType }) {
  const color = value >= 70 ? "text-emerald-400" : value >= 50 ? "text-amber-400" : "text-red-400";
  const bgColor = value >= 70 ? "bg-emerald-400" : value >= 50 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="bg-secondary/50 rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${color}`}>{value}<span className="text-sm font-normal text-muted-foreground">/100</span></div>
      <div className="w-full h-1.5 rounded-full bg-muted mt-2">
        <div className={`h-full rounded-full ${bgColor} transition-all`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export default function HealthBlueprint() {
  const { profile, updateField, dataCompleteness, userId } = useHealth();
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0]));
  const [activeTab, setActiveTab] = useState<"profile" | "insights" | "actions">("insights");
  const [loading, setLoading] = useState(true);
  const [healthScores, setHealthScores] = useState<HealthScores | null>(null);
  const [biomarkerAnalysis, setBiomarkerAnalysis] = useState<BiomarkerAnalysis[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [medicineStack, setMedicineStack] = useState<MedicineItem[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) { setLoading(false); return; }
    loadDocumentInsights();
  }, [userId]);

  const loadDocumentInsights = async () => {
    setLoading(true);
    try {
      const { data: docs } = await supabase
        .from("medical_documents")
        .select("extracted_data, recommendations, medicine_stack")
        .eq("status", "reviewed")
        .order("created_at", { ascending: false })
        .limit(5);

      if (docs && docs.length > 0) {
        // Merge insights from the most recent reviewed document
        const latest = docs[0];
        const ed = latest.extracted_data as any;
        if (ed?.health_scores) setHealthScores(ed.health_scores);
        if (ed?.biomarker_analysis) setBiomarkerAnalysis(ed.biomarker_analysis);
        if (Array.isArray(latest.recommendations) && latest.recommendations.length > 0) {
          setRecommendations(latest.recommendations as unknown as Recommendation[]);
        }
        if (Array.isArray(latest.medicine_stack) && latest.medicine_stack.length > 0) {
          setMedicineStack(latest.medicine_stack as unknown as MedicineItem[]);
        }
      }
    } catch (e) {
      console.error("Failed to load document insights:", e);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (i: number) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const handleSave = () => {
    toast({ title: "Changes saved", description: "Your health blueprint has been updated." });
  };

  const tabs = [
    { id: "insights" as const, label: "Health Insights", icon: Activity },
    { id: "actions" as const, label: "Actions & Stack", icon: Target },
    { id: "profile" as const, label: "Edit Profile", icon: Shield },
  ];

  const hasInsights = healthScores || biomarkerAnalysis.length > 0;

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Health Blueprint</h1>
          <p className="text-sm text-muted-foreground">
            {hasInsights ? "AI-powered analysis from your lab reports" : "Your complete health profile"} — {dataCompleteness}% complete
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
            </div>
            <span className="text-sm font-medium text-foreground">{dataCompleteness}%</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl border border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all flex-1 justify-center ${
              activeTab === tab.id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            }`}
          >
            <tab.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : activeTab === "insights" ? (
        <InsightsTab healthScores={healthScores} biomarkerAnalysis={biomarkerAnalysis} />
      ) : activeTab === "actions" ? (
        <ActionsTab recommendations={recommendations} medicineStack={medicineStack} />
      ) : (
        <ProfileTab
          sections={sections}
          profile={profile}
          updateField={updateField}
          openSections={openSections}
          toggle={toggle}
          handleSave={handleSave}
        />
      )}
    </div>
  );
}

/* ─── INSIGHTS TAB ─── */
function InsightsTab({ healthScores, biomarkerAnalysis }: { healthScores: HealthScores | null; biomarkerAnalysis: BiomarkerAnalysis[] }) {
  if (!healthScores && biomarkerAnalysis.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-2xl">
        <Activity className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No analysis yet</h3>
        <p className="text-sm text-muted-foreground">Upload a lab report in the Medical Vault to see your health insights here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Health Scores */}
      {healthScores && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <ScoreGauge label="Longevity" value={healthScores.overall_longevity} icon={TrendingUp} />
            <ScoreGauge label="Metabolic" value={healthScores.metabolic_health} icon={Zap} />
            <ScoreGauge label="Cardiovascular" value={healthScores.cardiovascular_risk} icon={Heart} />
            <ScoreGauge label="Inflammation" value={healthScores.inflammation_index} icon={Flame} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <span className="text-xs text-muted-foreground">Biological Age</span>
              <div className="text-2xl font-bold text-foreground mt-1">{healthScores.biological_age_estimate}<span className="text-sm font-normal text-muted-foreground"> yrs</span></div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <span className="text-xs text-muted-foreground">Projected Healthspan</span>
              <div className="text-2xl font-bold text-primary mt-1">{healthScores.projected_healthspan_years}<span className="text-sm font-normal text-muted-foreground"> yrs</span></div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4 col-span-2 md:col-span-1">
              <span className="text-xs text-muted-foreground">Hormonal Balance</span>
              <div className="text-2xl font-bold text-foreground mt-1">{healthScores.hormonal_balance}<span className="text-sm font-normal text-muted-foreground">/100</span></div>
            </div>
          </div>

          {healthScores.top_risk_factors?.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
              <h3 className="text-sm font-semibold text-red-400 flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4" /> Top Risk Factors
              </h3>
              <div className="flex flex-wrap gap-2">
                {healthScores.top_risk_factors.map((rf, i) => (
                  <span key={i} className="px-2.5 py-1 text-xs rounded-full bg-red-500/10 text-red-400 border border-red-500/20">{rf}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Biomarker Analysis */}
      {biomarkerAnalysis.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">Biomarker Analysis</h3>
            <p className="text-xs text-muted-foreground">{biomarkerAnalysis.length} markers analyzed against longevity-optimal ranges</p>
          </div>
          <div className="divide-y divide-border">
            {biomarkerAnalysis.map((b, i) => (
              <div key={i} className="p-4 hover:bg-secondary/20 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${statusColor(b.status)}`}>
                        {statusIcon(b.status)} {b.status.toUpperCase()}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{b.key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}</span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-lg font-bold text-foreground">{b.value}</span>
                      <span className="text-xs text-muted-foreground">optimal: {b.optimal_range}</span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{b.interpretation}</p>
                    {b.improvement_potential && (
                      <p className="text-xs text-primary mt-1 flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> {b.improvement_potential}
                      </p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] text-muted-foreground">Longevity Impact</div>
                    <div className={`text-lg font-bold ${b.longevity_impact >= 7 ? "text-red-400" : b.longevity_impact >= 4 ? "text-amber-400" : "text-emerald-400"}`}>
                      {b.longevity_impact}/10
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ACTIONS TAB ─── */
function ActionsTab({ recommendations, medicineStack }: { recommendations: Recommendation[]; medicineStack: MedicineItem[] }) {
  if (recommendations.length === 0 && medicineStack.length === 0) {
    return (
      <div className="text-center py-16 bg-card border border-border rounded-2xl">
        <Target className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold text-foreground mb-1">No recommendations yet</h3>
        <p className="text-sm text-muted-foreground">Upload a lab report to get personalized action items and supplement recommendations.</p>
      </div>
    );
  }

  const sorted = [...recommendations].sort((a, b) => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
  });

  return (
    <div className="space-y-5">
      {/* Recommendations */}
      {sorted.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">Action Items</h3>
            <p className="text-xs text-muted-foreground">{sorted.length} recommendations based on your biomarkers</p>
          </div>
          <div className="divide-y divide-border">
            {sorted.map((r, i) => (
              <div key={i} className="p-4">
                <div className="flex items-start gap-3">
                  <span className={`mt-0.5 shrink-0 inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded-full border ${priorityColor(r.priority)}`}>
                    {r.priority.toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">{r.title}</h4>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{r.description}</p>
                    <div className="flex items-center gap-3 mt-2">
                      {r.category && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{r.category}</span>
                      )}
                      {r.timeline && (
                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {r.timeline}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Medicine Stack */}
      {medicineStack.length > 0 && (
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-base font-semibold text-foreground">Supplement & Medicine Stack</h3>
            <p className="text-xs text-muted-foreground">{medicineStack.length} evidence-based recommendations</p>
          </div>
          <div className="divide-y divide-border">
            {medicineStack.map((m, i) => (
              <div key={i} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-semibold text-foreground">{m.name}</h4>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-primary font-medium">{m.dosage}</span>
                      {m.frequency && <span className="text-xs text-muted-foreground">• {m.frequency}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{m.reason}</p>
                  </div>
                  {m.priority && (
                    <span className="text-xs font-bold text-muted-foreground">#{m.priority}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── PROFILE TAB ─── */
function ProfileTab({
  sections, profile, updateField, openSections, toggle, handleSave
}: {
  sections: Section[];
  profile: any;
  updateField: (key: any, value: any) => void;
  openSections: Set<number>;
  toggle: (i: number) => void;
  handleSave: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="vitalis" onClick={handleSave}>
          <Save className="w-4 h-4 mr-1" /> Save Changes
        </Button>
      </div>
      {sections.map((section, idx) => (
        <div key={idx} className="bg-card border border-border rounded-2xl overflow-hidden">
          <button onClick={() => toggle(idx)} className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
                {section.badge && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-primary/20 text-primary">{section.badge}</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{section.subtitle}</p>
            </div>
            {openSections.has(idx) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
          {openSections.has(idx) && (
            <div className="px-5 pb-5 grid grid-cols-2 md:grid-cols-3 gap-3">
              {section.fields.map((f) => (
                <div key={f.key} className="space-y-1">
                  <label className="text-[11px] text-muted-foreground flex items-center gap-1">
                    {f.label} {f.unit && <span className="text-muted-foreground/60">({f.unit})</span>}
                  </label>
                  <input
                    type={f.type === "date" ? "date" : f.type === "text" ? "text" : "number"}
                    value={(profile as any)[f.key]}
                    onChange={(e) => updateField(f.key, f.type === "text" || f.type === "date" ? e.target.value : Number(e.target.value))}
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-foreground text-lg font-semibold focus:ring-1 focus:ring-primary focus:border-primary outline-none transition-all"
                  />
                  {f.hint && <p className="text-[10px] text-muted-foreground">{f.hint}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
