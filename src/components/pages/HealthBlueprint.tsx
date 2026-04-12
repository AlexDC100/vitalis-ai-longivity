import { useHealth } from "@/lib/health-context";
import { Button } from "@/components/ui/button";
import { Save, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

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

export default function HealthBlueprint() {
  const { profile, updateField, dataCompleteness } = useHealth();
  const [openSections, setOpenSections] = useState<Set<number>>(new Set([0, 1, 2]));
  const { toast } = useToast();

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

  return (
    <div className="animate-fade-in space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Health Blueprint</h1>
          <p className="text-sm text-muted-foreground">Your complete health profile — {dataCompleteness}% complete</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 rounded-full bg-muted">
              <div className="h-full rounded-full bg-vitalis-success transition-all" style={{ width: `${dataCompleteness}%` }} />
            </div>
            <span className="text-sm font-medium text-foreground">{dataCompleteness}%</span>
          </div>
          <Button variant="vitalis" onClick={handleSave}>
            <Save className="w-4 h-4 mr-1" /> Save Changes
          </Button>
        </div>
      </div>

      {sections.map((section, idx) => (
        <div key={idx} className="bg-card border border-border rounded-2xl overflow-hidden">
          <button onClick={() => toggle(idx)} className="w-full flex items-center justify-between p-5 text-left hover:bg-secondary/30 transition-colors">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-foreground">{section.title}</h2>
                {section.badge && (
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-vitalis-success/20 text-vitalis-success">{section.badge}</span>
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
