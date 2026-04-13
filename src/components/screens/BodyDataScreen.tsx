import { useState, useRef, useEffect, useCallback } from "react";
import { useHealth } from "@/lib/health-context";
import { SubstanceEntry, SUBSTANCE_CATEGORIES } from "@/lib/diagnosis-engine";
import { supabase } from "@/integrations/supabase/client";
import { extractTextFromFile } from "@/lib/pdf-utils";
import { useToast } from "@/hooks/use-toast";
import {
  Heart, Droplets, Brain, Moon, Dumbbell, Plus, X,
  Upload, FileText, Check, Loader2, ChevronDown, ChevronUp,
  Pill, Syringe, FlaskConical, Activity
} from "lucide-react";

interface Section {
  id: string;
  label: string;
  icon: React.ElementType;
  fields: { key: string; label: string; unit: string }[];
}

const SECTIONS: Section[] = [
  {
    id: "cardio", label: "Cardiovascular", icon: Heart,
    fields: [
      { key: "bp_systolic", label: "BP Systolic", unit: "mmHg" },
      { key: "bp_diastolic", label: "BP Diastolic", unit: "mmHg" },
      { key: "resting_hr", label: "Resting HR", unit: "bpm" },
      { key: "hrv_ms", label: "HRV", unit: "ms" },
      { key: "vo2_max", label: "VO2 Max", unit: "ml/kg/min" },
    ],
  },
  {
    id: "lipids", label: "Lipids", icon: Droplets,
    fields: [
      { key: "total_cholesterol", label: "Total Cholesterol", unit: "mg/dL" },
      { key: "ldl", label: "LDL", unit: "mg/dL" },
      { key: "hdl", label: "HDL", unit: "mg/dL" },
      { key: "triglycerides", label: "Triglycerides", unit: "mg/dL" },
      { key: "apob", label: "ApoB", unit: "mg/dL" },
      { key: "lpa", label: "Lp(a)", unit: "nmol/L" },
    ],
  },
  {
    id: "metabolic", label: "Metabolic", icon: Brain,
    fields: [
      { key: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL" },
      { key: "hba1c", label: "HbA1c", unit: "%" },
      { key: "fasting_insulin", label: "Fasting Insulin", unit: "μU/mL" },
      { key: "hscrp", label: "hs-CRP", unit: "mg/L" },
      { key: "homocysteine", label: "Homocysteine", unit: "μmol/L" },
    ],
  },
  {
    id: "hormones", label: "Hormones", icon: Activity,
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
      { key: "vitamin_d", label: "Vitamin D", unit: "ng/mL" },
    ],
  },
  {
    id: "body", label: "Body Composition", icon: Dumbbell,
    fields: [
      { key: "height_cm", label: "Height", unit: "cm" },
      { key: "weight_kg", label: "Weight", unit: "kg" },
      { key: "body_fat_pct", label: "Body Fat", unit: "%" },
      { key: "waist_cm", label: "Waist", unit: "cm" },
    ],
  },
  {
    id: "sleep", label: "Sleep & Recovery", icon: Moon,
    fields: [
      { key: "avg_sleep_hours", label: "Avg Sleep", unit: "hours" },
      { key: "sleep_quality", label: "Sleep Quality", unit: "/100" },
      { key: "fev1_pct", label: "FEV1", unit: "%" },
    ],
  },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  medication: Pill,
  trt: Syringe,
  steroid: FlaskConical,
  glp1: Pill,
  supplement: Plus,
  other: Plus,
};

export default function BodyDataScreen() {
  const { profile, updateField, userId } = useHealth();
  const { toast } = useToast();
  const [openSection, setOpenSection] = useState<string | null>("cardio");
  const [tab, setTab] = useState<"data" | "substances" | "vault">("data");
  const [substances, setSubstances] = useState<SubstanceEntry[]>([]);
  const [newSub, setNewSub] = useState({ name: "", category: "supplement" as SubstanceEntry["category"], dose: "" });
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<any[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("vitalis_substances");
    if (saved) try { setSubstances(JSON.parse(saved)); } catch {}
  }, []);

  useEffect(() => {
    if (!userId) return;
    supabase.from("medical_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setDocs(data); });
  }, [userId]);

  const saveSubstances = (subs: SubstanceEntry[]) => {
    setSubstances(subs);
    localStorage.setItem("vitalis_substances", JSON.stringify(subs));
  };

  const addSubstance = () => {
    if (!newSub.name.trim()) return;
    saveSubstances([...substances, { ...newSub, name: newSub.name.trim() }]);
    setNewSub({ name: "", category: "supplement", dose: "" });
  };

  const removeSubstance = (i: number) => {
    saveSubstances(substances.filter((_, idx) => idx !== i));
  };

  const handleUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);

    try {
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("medical-documents").upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: doc } = await supabase.from("medical_documents").insert({
        user_id: userId, file_name: file.name, file_path: filePath, status: "processing",
      }).select().single();

      if (doc) {
        setDocs(prev => [doc, ...prev]);
        const { data: result } = await supabase.functions.invoke("parse-document", {
          body: { documentId: doc.id, filePath },
        });

        if (result?.biomarkers) {
          Object.entries(result.biomarkers).forEach(([key, val]) => {
            if (val && typeof val === "number" && val > 0) updateField(key as any, val);
          });
        }

        // Reload docs
        const { data: refreshed } = await supabase.from("medical_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
        if (refreshed) setDocs(refreshed);

        toast({ title: "Lab report analyzed", description: "Your biomarkers have been updated." });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [userId, updateField, toast]);

  const tabs = [
    { id: "data" as const, label: "Biomarkers" },
    { id: "substances" as const, label: "Substances" },
    { id: "vault" as const, label: "Documents" },
  ];

  return (
    <div className="pb-24 space-y-5">
      {/* Header */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">Your Body</h1>
        <p className="text-sm text-muted-foreground mt-1">Data, substances, and lab reports</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* BIOMARKERS TAB */}
      {tab === "data" && (
        <div className="space-y-2">
          {/* Upload CTA */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl p-4 hover:bg-primary/15 transition-colors"
          >
            {uploading ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Upload className="w-5 h-5 text-primary" />}
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{uploading ? "Analyzing..." : "Upload lab report"}</p>
              <p className="text-[11px] text-muted-foreground">AI extracts and fills your biomarkers</p>
            </div>
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.png,.jpeg" />

          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isOpen = openSection === section.id;
            const filledCount = section.fields.filter(f => {
              const v = (profile as any)[f.key];
              return v && v !== 0;
            }).length;

            return (
              <div key={section.id} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                <button
                  onClick={() => setOpenSection(isOpen ? null : section.id)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-sm font-semibold text-foreground">{section.label}</span>
                    <span className="text-[11px] text-muted-foreground">{filledCount}/{section.fields.length}</span>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3 animate-fade-in">
                    {section.fields.map(f => {
                      const val = (profile as any)[f.key];
                      const display = val === 0 ? "" : String(val || "");
                      return (
                        <div key={f.key} className="flex items-center justify-between gap-3">
                          <label className="text-xs text-muted-foreground flex-1">{f.label}</label>
                          <div className="flex items-center gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={display}
                              onChange={e => {
                                const num = parseFloat(e.target.value);
                                updateField(f.key as any, isNaN(num) ? 0 : num);
                              }}
                              placeholder="—"
                              className="w-20 text-right text-sm font-mono bg-secondary/50 rounded-lg px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary/50"
                            />
                            <span className="text-[10px] text-muted-foreground w-12 text-right">{f.unit}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* SUBSTANCES TAB */}
      {tab === "substances" && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            List everything you take. AI adjusts your diagnosis based on this.
          </p>

          {/* Add new */}
          <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-3">
            <input
              value={newSub.name}
              onChange={e => setNewSub({ ...newSub, name: e.target.value })}
              placeholder="Substance name"
              className="w-full bg-secondary/50 rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary/50"
            />
            <div className="flex gap-2">
              <select
                value={newSub.category}
                onChange={e => setNewSub({ ...newSub, category: e.target.value as any })}
                className="flex-1 bg-secondary/50 rounded-xl px-3 py-2 text-sm text-foreground outline-none"
              >
                {SUBSTANCE_CATEGORIES.map(c => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
              <input
                value={newSub.dose}
                onChange={e => setNewSub({ ...newSub, dose: e.target.value })}
                placeholder="Dose"
                className="w-24 bg-secondary/50 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>
            <button
              onClick={addSubstance}
              disabled={!newSub.name.trim()}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-30 transition-opacity"
            >
              Add
            </button>
          </div>

          {/* List */}
          {substances.length === 0 ? (
            <div className="text-center py-8">
              <Pill className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No substances added yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {substances.map((sub, i) => {
                const Icon = CATEGORY_ICONS[sub.category] || Plus;
                return (
                  <div key={i} className="flex items-center gap-3 bg-card border border-border/50 rounded-2xl p-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{sub.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {SUBSTANCE_CATEGORIES.find(c => c.id === sub.category)?.label}
                        {sub.dose ? ` · ${sub.dose}` : ""}
                      </p>
                    </div>
                    <button onClick={() => removeSubstance(i)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {tab === "vault" && (
        <div className="space-y-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full flex items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl p-4"
          >
            {uploading ? <Loader2 className="w-5 h-5 text-primary animate-spin" /> : <Upload className="w-5 h-5 text-primary" />}
            <div className="text-left">
              <p className="text-sm font-semibold text-foreground">{uploading ? "Processing..." : "Upload document"}</p>
              <p className="text-[11px] text-muted-foreground">PDF, image — AI analyzes automatically</p>
            </div>
          </button>

          {docs.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No documents uploaded</p>
            </div>
          ) : (
            docs.map(doc => (
              <div key={doc.id} className="bg-card border border-border/50 rounded-2xl p-4">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{doc.file_name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(doc.created_at).toLocaleDateString()} ·{" "}
                      <span className={doc.status === "reviewed" ? "text-vitalis-success" : doc.status === "processing" ? "text-vitalis-warning" : "text-muted-foreground"}>
                        {doc.status}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
