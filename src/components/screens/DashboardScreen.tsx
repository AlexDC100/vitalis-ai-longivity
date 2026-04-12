import { useHealth } from "@/lib/health-context";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import ScoreRing from "@/components/ScoreRing";
import {
  AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Activity,
  Heart, Droplets, Brain, Flame, Shield, FileText, ArrowRight, Minus
} from "lucide-react";

interface BiomarkerRange {
  key: keyof typeof BIOMARKER_META;
  label: string;
  unit: string;
  optimalLow: number;
  optimalHigh: number;
  category: string;
  icon: React.ElementType;
}

const BIOMARKER_META: Record<string, BiomarkerRange> = {
  bp_systolic: { key: "bp_systolic", label: "Blood Pressure (Sys)", unit: "mmHg", optimalLow: 90, optimalHigh: 120, category: "Cardiovascular", icon: Heart },
  bp_diastolic: { key: "bp_diastolic", label: "Blood Pressure (Dia)", unit: "mmHg", optimalLow: 60, optimalHigh: 80, category: "Cardiovascular", icon: Heart },
  resting_hr: { key: "resting_hr", label: "Resting Heart Rate", unit: "bpm", optimalLow: 50, optimalHigh: 70, category: "Cardiovascular", icon: Heart },
  hrv_ms: { key: "hrv_ms", label: "HRV", unit: "ms", optimalLow: 40, optimalHigh: 100, category: "Cardiovascular", icon: Activity },
  vo2_max: { key: "vo2_max", label: "VO₂ Max", unit: "ml/kg/min", optimalLow: 40, optimalHigh: 60, category: "Fitness", icon: Activity },
  fasting_glucose: { key: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL", optimalLow: 70, optimalHigh: 95, category: "Metabolic", icon: Droplets },
  hba1c: { key: "hba1c", label: "HbA1c", unit: "%", optimalLow: 4.0, optimalHigh: 5.4, category: "Metabolic", icon: Droplets },
  fasting_insulin: { key: "fasting_insulin", label: "Fasting Insulin", unit: "μIU/mL", optimalLow: 2, optimalHigh: 8, category: "Metabolic", icon: Droplets },
  total_cholesterol: { key: "total_cholesterol", label: "Total Cholesterol", unit: "mg/dL", optimalLow: 150, optimalHigh: 200, category: "Lipids", icon: Shield },
  ldl: { key: "ldl", label: "LDL", unit: "mg/dL", optimalLow: 50, optimalHigh: 100, category: "Lipids", icon: Shield },
  hdl: { key: "hdl", label: "HDL", unit: "mg/dL", optimalLow: 50, optimalHigh: 90, category: "Lipids", icon: Shield },
  triglycerides: { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", optimalLow: 40, optimalHigh: 100, category: "Lipids", icon: Shield },
  apob: { key: "apob", label: "ApoB", unit: "mg/dL", optimalLow: 40, optimalHigh: 80, category: "Lipids", icon: Shield },
  hscrp: { key: "hscrp", label: "hs-CRP", unit: "mg/L", optimalLow: 0, optimalHigh: 1.0, category: "Inflammation", icon: Flame },
  homocysteine: { key: "homocysteine", label: "Homocysteine", unit: "μmol/L", optimalLow: 5, optimalHigh: 9, category: "Inflammation", icon: Flame },
  vitamin_d: { key: "vitamin_d", label: "Vitamin D", unit: "ng/mL", optimalLow: 40, optimalHigh: 80, category: "Hormones", icon: Brain },
  testosterone: { key: "testosterone", label: "Testosterone", unit: "ng/dL", optimalLow: 500, optimalHigh: 900, category: "Hormones", icon: Brain },
  tsh: { key: "tsh", label: "TSH", unit: "mIU/L", optimalLow: 0.5, optimalHigh: 2.5, category: "Hormones", icon: Brain },
  cortisol: { key: "cortisol", label: "Cortisol", unit: "μg/dL", optimalLow: 6, optimalHigh: 18, category: "Hormones", icon: Brain },
  avg_sleep_hours: { key: "avg_sleep_hours", label: "Sleep Duration", unit: "hrs", optimalLow: 7, optimalHigh: 9, category: "Lifestyle", icon: Activity },
  sleep_quality: { key: "sleep_quality", label: "Sleep Quality", unit: "/100", optimalLow: 75, optimalHigh: 100, category: "Lifestyle", icon: Activity },
  body_fat_pct: { key: "body_fat_pct", label: "Body Fat", unit: "%", optimalLow: 10, optimalHigh: 18, category: "Body Composition", icon: Activity },
  waist_cm: { key: "waist_cm", label: "Waist", unit: "cm", optimalLow: 70, optimalHigh: 90, category: "Body Composition", icon: Activity },
};

type BiomarkerStatus = "optimal" | "borderline" | "high" | "low";

function getStatus(value: number, meta: BiomarkerRange): BiomarkerStatus {
  if (value === 0) return "optimal"; // no data
  if (value >= meta.optimalLow && value <= meta.optimalHigh) return "optimal";
  const rangeMid = (meta.optimalHigh - meta.optimalLow) / 2;
  if (value < meta.optimalLow) {
    return value < meta.optimalLow - rangeMid ? "low" : "borderline";
  }
  return value > meta.optimalHigh + rangeMid ? "high" : "borderline";
}

const statusConfig = {
  optimal: { color: "text-[hsl(var(--vitalis-success))]", bg: "bg-[hsl(var(--vitalis-success))]/10", border: "border-[hsl(var(--vitalis-success))]/20", icon: CheckCircle, label: "Optimal" },
  borderline: { color: "text-[hsl(var(--vitalis-warning))]", bg: "bg-[hsl(var(--vitalis-warning))]/10", border: "border-[hsl(var(--vitalis-warning))]/20", icon: Minus, label: "Borderline" },
  high: { color: "text-[hsl(var(--vitalis-danger))]", bg: "bg-[hsl(var(--vitalis-danger))]/10", border: "border-[hsl(var(--vitalis-danger))]/20", icon: TrendingUp, label: "High" },
  low: { color: "text-[hsl(var(--vitalis-danger))]", bg: "bg-[hsl(var(--vitalis-danger))]/10", border: "border-[hsl(var(--vitalis-danger))]/20", icon: TrendingDown, label: "Low" },
};

interface DocumentResult {
  id: string;
  file_name: string;
  created_at: string;
  status: string;
  extracted_data: any;
}

export default function DashboardScreen() {
  const { profile, longevityScore, biologicalAge, chronologicalAge, dataCompleteness } = useHealth();
  const [documents, setDocuments] = useState<DocumentResult[]>([]);
  const [filter, setFilter] = useState<"all" | "flagged">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");

  useEffect(() => {
    if (!profile.user_id) return;
    supabase
      .from("medical_documents")
      .select("id, file_name, created_at, status, extracted_data")
      .eq("user_id", profile.user_id)
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data }) => {
        if (data) setDocuments(data as DocumentResult[]);
      });
  }, [profile.user_id]);

  // Build biomarker list with statuses
  const biomarkers = Object.entries(BIOMARKER_META).map(([key, meta]) => {
    const value = (profile as any)[key] as number;
    const status = getStatus(value, meta);
    return { ...meta, value, status, key };
  }).filter(b => b.value !== 0); // hide empty

  const categories = ["All", ...Array.from(new Set(biomarkers.map(b => b.category)))];

  const filtered = biomarkers
    .filter(b => filter === "all" || b.status !== "optimal")
    .filter(b => categoryFilter === "All" || b.category === categoryFilter);

  const optimalCount = biomarkers.filter(b => b.status === "optimal").length;
  const flaggedCount = biomarkers.filter(b => b.status !== "optimal").length;

  const ageDelta = chronologicalAge - biologicalAge;

  return (
    <div className="animate-fade-in space-y-5 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-foreground">Health Dashboard</h1>
        <p className="text-xs text-muted-foreground">
          {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </p>
      </div>

      {/* Top Summary Cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 flex flex-col items-center">
          <ScoreRing score={longevityScore} size={80} />
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-2">Longevity Score</p>
        </div>
        <div className="space-y-2">
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bio Age</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{biologicalAge}</span>
              <span className={`text-xs font-medium ${ageDelta > 0 ? "text-[hsl(var(--vitalis-success))]" : "text-[hsl(var(--vitalis-danger))]"}`}>
                {ageDelta > 0 ? `${ageDelta}y younger` : `${Math.abs(ageDelta)}y older`}
              </span>
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Data Quality</p>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground">{dataCompleteness}%</span>
            </div>
            <div className="w-full h-1 bg-secondary rounded-full mt-1.5">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${dataCompleteness}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Status Overview */}
      <div className="flex gap-2">
        <div className="flex-1 bg-[hsl(var(--vitalis-success))]/10 border border-[hsl(var(--vitalis-success))]/20 rounded-xl p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-[hsl(var(--vitalis-success))]" />
          <div>
            <p className="text-lg font-bold text-foreground">{optimalCount}</p>
            <p className="text-[10px] text-muted-foreground">Optimal</p>
          </div>
        </div>
        <div className="flex-1 bg-[hsl(var(--vitalis-danger))]/10 border border-[hsl(var(--vitalis-danger))]/20 rounded-xl p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-[hsl(var(--vitalis-danger))]" />
          <div>
            <p className="text-lg font-bold text-foreground">{flaggedCount}</p>
            <p className="text-[10px] text-muted-foreground">Flagged</p>
          </div>
        </div>
        <div className="flex-1 bg-primary/10 border border-primary/20 rounded-xl p-3 flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" />
          <div>
            <p className="text-lg font-bold text-foreground">{documents.length}</p>
            <p className="text-[10px] text-muted-foreground">Reports</p>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "all" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            All Biomarkers
          </button>
          <button
            onClick={() => setFilter("flagged")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === "flagged" ? "bg-[hsl(var(--vitalis-danger))] text-foreground" : "bg-secondary text-muted-foreground"}`}
          >
            ⚠ Flagged ({flaggedCount})
          </button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {categories.map(c => (
            <button
              key={c}
              onClick={() => setCategoryFilter(c)}
              className={`whitespace-nowrap px-2.5 py-1 rounded-md text-[10px] font-medium transition-colors ${categoryFilter === c ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Biomarker List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {filter === "flagged" ? "🎉 All biomarkers are in optimal range!" : "No biomarker data yet. Upload a lab report."}
          </div>
        )}
        {filtered.map(b => {
          const cfg = statusConfig[b.status];
          const StatusIcon = cfg.icon;
          const BioIcon = b.icon;
          // Position indicator on range bar
          const rangeSpan = b.optimalHigh - b.optimalLow;
          const barMin = b.optimalLow - rangeSpan * 0.5;
          const barMax = b.optimalHigh + rangeSpan * 0.5;
          const pct = Math.max(0, Math.min(100, ((b.value - barMin) / (barMax - barMin)) * 100));
          const optStart = ((b.optimalLow - barMin) / (barMax - barMin)) * 100;
          const optWidth = ((b.optimalHigh - b.optimalLow) / (barMax - barMin)) * 100;

          return (
            <div key={b.key} className={`bg-card border ${b.status !== "optimal" ? cfg.border : "border-border"} rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <BioIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                  <span className="text-sm font-medium text-foreground">{b.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold text-foreground">{b.value}</span>
                  <span className="text-[10px] text-muted-foreground">{b.unit}</span>
                  <StatusIcon className={`w-3.5 h-3.5 ${cfg.color}`} />
                </div>
              </div>
              {/* Range bar */}
              <div className="relative h-2 bg-secondary rounded-full overflow-visible">
                <div
                  className="absolute h-full bg-[hsl(var(--vitalis-success))]/30 rounded-full"
                  style={{ left: `${optStart}%`, width: `${optWidth}%` }}
                />
                <div
                  className={`absolute w-2.5 h-2.5 rounded-full border-2 border-card top-1/2 -translate-y-1/2 -translate-x-1/2 ${b.status === "optimal" ? "bg-[hsl(var(--vitalis-success))]" : "bg-[hsl(var(--vitalis-danger))]"}`}
                  style={{ left: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[9px] text-muted-foreground">{b.optimalLow}</span>
                <span className="text-[9px] text-muted-foreground">Optimal range</span>
                <span className="text-[9px] text-muted-foreground">{b.optimalHigh}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Recent Test Uploads */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            Recent Lab Reports
          </h2>
          {documents.slice(0, 5).map(doc => (
            <div key={doc.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(doc.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </p>
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${doc.status === "reviewed" ? "bg-[hsl(var(--vitalis-success))]/10 text-[hsl(var(--vitalis-success))]" : "bg-[hsl(var(--vitalis-warning))]/10 text-[hsl(var(--vitalis-warning))]"}`}>
                {doc.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
