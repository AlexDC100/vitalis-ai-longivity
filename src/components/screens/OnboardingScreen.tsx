import { useState } from "react";
import { useHealth } from "@/lib/health-context";
import {
  Activity, ChevronRight, ChevronLeft, Heart, Droplets,
  Brain, Moon, Dumbbell, Sparkles, Check
} from "lucide-react";

interface StepField {
  key: string;
  label: string;
  unit: string;
  placeholder: string;
  type?: "text" | "number" | "date" | "select";
  options?: string[];
}

interface Step {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  fields: StepField[];
}

const STEPS: Step[] = [
  {
    id: "basics",
    title: "About You",
    subtitle: "Let's start with the basics",
    icon: Activity,
    color: "from-primary/30 to-primary/10",
    fields: [
      { key: "full_name", label: "Full Name", unit: "", placeholder: "John Doe", type: "text" },
      { key: "date_of_birth", label: "Date of Birth", unit: "", placeholder: "1990-01-01", type: "date" },
      { key: "sex", label: "Sex", unit: "", placeholder: "Select", type: "select", options: ["male", "female"] },
      { key: "height_cm", label: "Height", unit: "cm", placeholder: "175", type: "number" },
      { key: "weight_kg", label: "Weight", unit: "kg", placeholder: "75", type: "number" },
    ],
  },
  {
    id: "cardio",
    title: "Heart & Cardio",
    subtitle: "Your cardiovascular markers",
    icon: Heart,
    color: "from-red-500/20 to-red-500/5",
    fields: [
      { key: "bp_systolic", label: "Blood Pressure (systolic)", unit: "mmHg", placeholder: "120", type: "number" },
      { key: "bp_diastolic", label: "Blood Pressure (diastolic)", unit: "mmHg", placeholder: "80", type: "number" },
      { key: "resting_hr", label: "Resting Heart Rate", unit: "bpm", placeholder: "65", type: "number" },
      { key: "hrv_ms", label: "HRV", unit: "ms", placeholder: "45", type: "number" },
      { key: "vo2_max", label: "VO2 Max", unit: "ml/kg/min", placeholder: "40", type: "number" },
    ],
  },
  {
    id: "lipids",
    title: "Lipids & Inflammation",
    subtitle: "Key metabolic markers",
    icon: Droplets,
    color: "from-amber-500/20 to-amber-500/5",
    fields: [
      { key: "ldl", label: "LDL Cholesterol", unit: "mg/dL", placeholder: "100", type: "number" },
      { key: "hdl", label: "HDL Cholesterol", unit: "mg/dL", placeholder: "60", type: "number" },
      { key: "apob", label: "ApoB", unit: "mg/dL", placeholder: "80", type: "number" },
      { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", placeholder: "100", type: "number" },
      { key: "hscrp", label: "hs-CRP", unit: "mg/L", placeholder: "0.5", type: "number" },
    ],
  },
  {
    id: "metabolic",
    title: "Metabolic Health",
    subtitle: "Glucose & insulin markers",
    icon: Brain,
    color: "from-violet-500/20 to-violet-500/5",
    fields: [
      { key: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL", placeholder: "90", type: "number" },
      { key: "hba1c", label: "HbA1c", unit: "%", placeholder: "5.2", type: "number" },
      { key: "fasting_insulin", label: "Fasting Insulin", unit: "μU/mL", placeholder: "5", type: "number" },
    ],
  },
  {
    id: "lifestyle",
    title: "Sleep & Body",
    subtitle: "Recovery and composition",
    icon: Moon,
    color: "from-blue-500/20 to-blue-500/5",
    fields: [
      { key: "avg_sleep_hours", label: "Avg. Sleep", unit: "hours", placeholder: "7.5", type: "number" },
      { key: "sleep_quality", label: "Sleep Quality", unit: "/100", placeholder: "75", type: "number" },
      { key: "body_fat_pct", label: "Body Fat", unit: "%", placeholder: "18", type: "number" },
    ],
  },
];

export default function OnboardingScreen({ onComplete }: { onComplete: () => void }) {
  const { profile, updateField } = useHealth();
  const [step, setStep] = useState(0);
  const [animDir, setAnimDir] = useState<"left" | "right">("right");

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const filledCount = currentStep.fields.filter(f => {
    const v = (profile as any)[f.key];
    return v && v !== 0 && v !== "" && v !== "0";
  }).length;

  const goNext = () => {
    if (isLast) {
      onComplete();
      return;
    }
    setAnimDir("right");
    setStep(s => s + 1);
  };

  const goBack = () => {
    if (step === 0) return;
    setAnimDir("left");
    setStep(s => s - 1);
  };

  const handleFieldChange = (key: string, value: string, type?: string) => {
    if (type === "number") {
      const num = parseFloat(value);
      updateField(key as any, isNaN(num) ? 0 : num);
    } else {
      updateField(key as any, value);
    }
  };

  const Icon = currentStep.icon;

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-4">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center">
            <Activity className="w-3 h-3 text-primary" />
          </div>
          <span className="text-sm font-bold text-foreground tracking-tight">Vitalis</span>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1 rounded-full flex-1 transition-all duration-500 ${
                i < step ? "bg-primary" : i === step ? "bg-primary/70" : "bg-border/50"
              }`}
            />
          ))}
        </div>

        {/* Step icon & title */}
        <div className="flex items-center gap-4 mb-2">
          <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${currentStep.color} flex items-center justify-center`}>
            <Icon className="w-7 h-7 text-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{currentStep.title}</h1>
            <p className="text-sm text-muted-foreground">{currentStep.subtitle}</p>
          </div>
        </div>

        <p className="text-xs text-muted-foreground mt-1">
          {filledCount}/{currentStep.fields.length} filled · Skip any you don't know
        </p>
      </div>

      {/* Fields */}
      <div className="flex-1 px-6 pb-4 space-y-3 overflow-y-auto">
        {currentStep.fields.map((field, i) => {
          const value = (profile as any)[field.key];
          const displayValue = value === 0 || value === "0" ? "" : String(value || "");

          return (
            <div
              key={field.key}
              className="bg-card border border-border/50 rounded-2xl px-4 py-3 transition-all hover:border-primary/30"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <label className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{field.label}</span>
                {field.unit && (
                  <span className="text-[11px] text-muted-foreground">{field.unit}</span>
                )}
              </label>

              {field.type === "select" ? (
                <div className="flex gap-2 mt-2">
                  {field.options?.map(opt => (
                    <button
                      key={opt}
                      onClick={() => handleFieldChange(field.key, opt)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium capitalize transition-all ${
                        displayValue === opt
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type={field.type === "date" ? "date" : "text"}
                  inputMode={field.type === "number" ? "decimal" : undefined}
                  value={displayValue}
                  onChange={e => handleFieldChange(field.key, e.target.value, field.type)}
                  placeholder={field.placeholder}
                  className="w-full mt-1 bg-transparent text-foreground text-base outline-none placeholder:text-muted-foreground/50"
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="px-6 pb-8 pt-2 flex items-center gap-3">
        {step > 0 && (
          <button
            onClick={goBack}
            className="w-12 h-12 rounded-2xl bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={goNext}
          className="flex-1 h-12 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
        >
          {isLast ? (
            <>
              <Check className="w-4 h-4" />
              Complete Setup
            </>
          ) : (
            <>
              Continue
              <ChevronRight className="w-4 h-4" />
            </>
          )}
        </button>

        {!isLast && (
          <button
            onClick={goNext}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-3"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}
