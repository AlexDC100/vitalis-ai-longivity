import { useState, useRef, useEffect, useCallback } from "react";
import { useHealth } from "@/lib/health-context";
import { SubstanceEntry, SUBSTANCE_CATEGORIES } from "@/lib/diagnosis-engine";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubstances } from "@/lib/use-substances";
import {
  Heart, Droplets, Brain, Moon, Dumbbell, Plus, X,
  Upload, FileText, Loader2, ChevronDown, ChevronUp,
  Pill, Syringe, FlaskConical, Activity, AlertCircle, Check,
  Watch, Smartphone, Camera, Scale, Footprints, Wine, Dna
} from "lucide-react";

interface Section {
  id: string;
  label: string;
  icon: React.ElementType;
  fields: { key: string; label: string; unit: string; optimal?: string }[];
}

const SECTIONS: Section[] = [
  {
    id: "cardio", label: "Cardiovascular", icon: Heart,
    fields: [
      { key: "bp_systolic", label: "BP Systolic", unit: "mmHg", optimal: "< 120" },
      { key: "bp_diastolic", label: "BP Diastolic", unit: "mmHg", optimal: "< 80" },
      { key: "resting_hr", label: "Resting HR", unit: "bpm", optimal: "50-65" },
      { key: "hrv_ms", label: "HRV", unit: "ms", optimal: "> 50" },
      { key: "vo2_max", label: "VO2 Max", unit: "ml/kg/min", optimal: "> 45" },
    ],
  },
  {
    id: "lipids", label: "Lipids", icon: Droplets,
    fields: [
      { key: "total_cholesterol", label: "Total Cholesterol", unit: "mg/dL", optimal: "< 200" },
      { key: "ldl", label: "LDL", unit: "mg/dL", optimal: "< 100" },
      { key: "hdl", label: "HDL", unit: "mg/dL", optimal: "> 50" },
      { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", optimal: "< 100" },
      { key: "apob", label: "ApoB", unit: "mg/dL", optimal: "< 90" },
      { key: "lpa", label: "Lp(a)", unit: "nmol/L", optimal: "< 50" },
    ],
  },
  {
    id: "metabolic", label: "Metabolic", icon: Brain,
    fields: [
      { key: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL", optimal: "72-85" },
      { key: "hba1c", label: "HbA1c", unit: "%", optimal: "< 5.4" },
      { key: "fasting_insulin", label: "Fasting Insulin", unit: "μU/mL", optimal: "2-6" },
      { key: "hscrp", label: "hs-CRP", unit: "mg/L", optimal: "< 0.5" },
      { key: "homocysteine", label: "Homocysteine", unit: "μmol/L", optimal: "< 10" },
    ],
  },
  {
    id: "hormones", label: "Hormones", icon: Activity,
    fields: [
      { key: "testosterone", label: "Testosterone", unit: "ng/dL", optimal: "500-900" },
      { key: "free_t", label: "Free T", unit: "pg/mL", optimal: "15-25" },
      { key: "estradiol", label: "Estradiol", unit: "pg/mL", optimal: "20-40" },
      { key: "dhea_s", label: "DHEA-S", unit: "μg/dL", optimal: "300-500" },
      { key: "cortisol", label: "Cortisol", unit: "μg/dL", optimal: "6-18" },
      { key: "tsh", label: "TSH", unit: "mIU/L", optimal: "1-2" },
      { key: "free_t3", label: "Free T3", unit: "pg/mL", optimal: "3-4" },
      { key: "free_t4", label: "Free T4", unit: "ng/dL", optimal: "1.0-1.5" },
      { key: "igf1", label: "IGF-1", unit: "ng/mL", optimal: "150-250" },
      { key: "vitamin_d", label: "Vitamin D", unit: "ng/mL", optimal: "50-80" },
    ],
  },
  {
    id: "body", label: "Body Composition", icon: Dumbbell,
    fields: [
      { key: "height_cm", label: "Height", unit: "cm" },
      { key: "weight_kg", label: "Weight", unit: "kg" },
      { key: "body_fat_pct", label: "Body Fat", unit: "%", optimal: "10-18" },
      { key: "waist_cm", label: "Waist", unit: "cm", optimal: "< 85" },
    ],
  },
  {
    id: "sleep", label: "Sleep & Recovery", icon: Moon,
    fields: [
      { key: "avg_sleep_hours", label: "Avg Sleep", unit: "hours", optimal: "7-9" },
      { key: "sleep_quality", label: "Sleep Quality", unit: "/100", optimal: "> 80" },
      { key: "fev1_pct", label: "FEV1", unit: "%", optimal: "> 95" },
    ],
  },
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  medication: Pill, trt: Syringe, steroid: FlaskConical, glp1: Pill, supplement: Plus, other: Plus,
};

const QUICK_INPUT_FIELDS = [
  { key: "weight_kg", label: "Weight", unit: "kg", icon: Scale },
  { key: "avg_sleep_hours", label: "Sleep", unit: "hours", icon: Moon },
  { key: "resting_hr", label: "Resting HR", unit: "bpm", icon: Heart },
  { key: "hrv_ms", label: "HRV", unit: "ms", icon: Activity },
];

const DEVICE_OPTIONS = [
  { id: "apple_health", name: "Apple Health", icon: Smartphone, formats: ".csv, .xml", description: "Export from Health app → Share → Export All Health Data" },
  { id: "whoop", name: "Whoop", icon: Watch, formats: ".csv", description: "Whoop app → Settings → Data Export → Download CSV" },
  { id: "oura", name: "Oura Ring", icon: Watch, formats: ".csv, .json", description: "Oura app → Settings → Account → Download My Data" },
  { id: "garmin", name: "Garmin", icon: Watch, formats: ".csv, .fit", description: "Garmin Connect → Export/Backup → Export to CSV" },
  { id: "fitbit", name: "Fitbit", icon: Watch, formats: ".csv, .json", description: "Fitbit → Settings → Data Export → Request Data" },
  { id: "screenshot", name: "Screenshot", icon: Camera, formats: ".jpg, .png", description: "Take a screenshot from any health app — AI will extract the data" },
];

function isOutOfRange(key: string, value: number, optimal?: string): boolean {
  if (!optimal || !value || value === 0) return false;
  const v = value;
  if (optimal.startsWith("< ")) return v >= parseFloat(optimal.slice(2));
  if (optimal.startsWith("> ")) return v <= parseFloat(optimal.slice(2));
  if (optimal.includes("-")) {
    const [min, max] = optimal.split("-").map(Number);
    return v < min || v > max;
  }
  return false;
}

interface TodayLogEntry { steps: string; training: string; alcohol: string; }

function TodayLog() {
  const [log, setLog] = useState<TodayLogEntry>(() => {
    const today = new Date().toISOString().slice(0, 10);
    const saved = localStorage.getItem(`vitalis_today_${today}`);
    return saved ? JSON.parse(saved) : { steps: "", training: "", alcohol: "" };
  });
  const saveLog = (updated: TodayLogEntry) => {
    setLog(updated);
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(`vitalis_today_${today}`, JSON.stringify(updated));
  };
  return (
    <div className="bg-card border border-border/50 rounded-2xl p-4 space-y-4">
      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today's Log</span>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Footprints className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">Steps</span>
          </div>
          <input type="text" inputMode="numeric" value={log.steps}
            onChange={e => saveLog({ ...log, steps: e.target.value })} placeholder="—"
            className="w-20 text-right text-sm font-mono bg-secondary/50 rounded-lg px-2 py-1.5 text-foreground outline-none focus:ring-1 focus:ring-primary/50" />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">Training</span>
          </div>
          <div className="flex gap-1">
            {["None", "Light", "Moderate", "Intense"].map(level => (
              <button key={level} onClick={() => saveLog({ ...log, training: level })}
                className={`px-2 py-1 text-[10px] rounded-lg transition-colors ${log.training === level ? "bg-primary/20 text-primary font-semibold" : "bg-secondary/50 text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
                {level}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wine className="w-4 h-4 text-primary" />
            <span className="text-sm text-foreground">Alcohol</span>
          </div>
          <div className="flex gap-1">
            {["None", "1-2", "3-4", "5+"].map(level => (
              <button key={level} onClick={() => saveLog({ ...log, alcohol: level })}
                className={`px-2 py-1 text-[10px] rounded-lg transition-colors ${log.alcohol === level ? "bg-primary/20 text-primary font-semibold" : "bg-secondary/50 text-muted-foreground hover:bg-primary/10 hover:text-primary"}`}>
                {level}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BodyDataScreen() {
  const { profile, updateField, userId } = useHealth();
  const { toast } = useToast();
  const [openSection, setOpenSection] = useState<string | null>("cardio");
  const [tab, setTab] = useState<"quick" | "data" | "substances" | "devices">("quick");
  // Substances now persisted to RLS-protected `user_substances` table.
  const { substances, addSubstance, removeSubstance } = useSubstances();
  const [newSub, setNewSub] = useState({ name: "", category: "supplement" as SubstanceEntry["category"], dose: "" });
  const [uploading, setUploading] = useState(false);
  const [docs, setDocs] = useState<any[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const deviceFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    supabase.from("medical_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setDocs(data); });
  }, [userId]);

  const handleAddSubstance = () => {
    if (!newSub.name.trim()) return;
    void addSubstance({ ...newSub, name: newSub.name.trim() });
    setNewSub({ name: "", category: "supplement", dose: "" });
  };

  const handleRemoveSubstance = (i: number) => {
    void removeSubstance(i);
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

        const { data: refreshed } = await supabase.from("medical_documents").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
        if (refreshed) setDocs(refreshed);

        const extracted = result?.biomarkers ? Object.keys(result.biomarkers).filter(k => result.biomarkers[k] > 0).length : 0;
        toast({ title: "Lab report analyzed", description: `${extracted} biomarkers auto-filled from your report.` });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [userId, updateField, toast]);

  const handleDeviceUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setUploading(true);

    try {
      const filePath = `${userId}/device_${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage.from("medical-documents").upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: doc } = await supabase.from("medical_documents").insert({
        user_id: userId,
        file_name: file.name,
        file_path: filePath,
        status: "processing",
        document_type: "device_export",
      }).select().single();

      if (doc) {
        setDocs(prev => [doc, ...prev]);
        const { data: result } = await supabase.functions.invoke("parse-document", {
          body: { documentId: doc.id, filePath, documentType: "device_export", device: selectedDevice },
        });

        if (result?.biomarkers) {
          Object.entries(result.biomarkers).forEach(([key, val]) => {
            if (val && typeof val === "number" && val > 0) updateField(key as any, val);
          });
        }

        const extracted = result?.biomarkers ? Object.keys(result.biomarkers).filter(k => result.biomarkers[k] > 0).length : 0;
        toast({ title: "Device data imported", description: `${extracted} metrics extracted from ${selectedDevice || "device"} export.` });
      }
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      setSelectedDevice(null);
      if (deviceFileRef.current) deviceFileRef.current.value = "";
    }
  }, [userId, updateField, toast, selectedDevice]);

  const tabs = [
    { id: "quick" as const, label: "Quick Input" },
    { id: "data" as const, label: "Biomarkers" },
    { id: "substances" as const, label: "Substances" },
    { id: "devices" as const, label: "Devices" },
  ];

  return (
    <div className="pb-24 space-y-5">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-foreground">Your Body</h1>
        <p className="text-sm text-muted-foreground mt-1">Data, substances, devices, and lab reports</p>
      </div>

      <div className="flex gap-1 bg-secondary/50 p-1 rounded-xl overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 py-2 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap px-2 ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* QUICK INPUT TAB */}
      {tab === "quick" && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-muted-foreground">
            Log your daily metrics quickly. Data feeds into your diagnosis.
          </p>

          {/* Quick metrics */}
          <div className="grid grid-cols-2 gap-3">
            {QUICK_INPUT_FIELDS.map(field => {
              const Icon = field.icon;
              const val = (profile as any)[field.key];
              const display = val === 0 ? "" : String(val || "");
              return (
                <div key={field.key} className="bg-card border border-border/50 rounded-2xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-xs font-semibold text-foreground">{field.label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={display}
                      onChange={e => {
                        const num = parseFloat(e.target.value);
                        updateField(field.key as any, isNaN(num) ? 0 : num);
                      }}
                      placeholder="—"
                      className="w-full text-2xl font-bold text-foreground bg-transparent outline-none"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">{field.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Quick lifestyle inputs */}
          <TodayLog />

          <input ref={fileRef} type="file" className="hidden" onChange={handleUpload} accept=".pdf,.jpg,.png,.jpeg,.csv,.json" />
        </div>
      )}

      {/* BIOMARKERS TAB */}
      {tab === "data" && (
        <div className="space-y-2 animate-fade-in">
          {SECTIONS.map(section => {
            const Icon = section.icon;
            const isOpen = openSection === section.id;
            const filledCount = section.fields.filter(f => {
              const v = (profile as any)[f.key];
              return v && v !== 0;
            }).length;
            const outOfRangeCount = section.fields.filter(f => {
              const v = (profile as any)[f.key];
              return v && v !== 0 && isOutOfRange(f.key, v, f.optimal);
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
                    {outOfRangeCount > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-red-400">
                        <AlertCircle className="w-3 h-3" /> {outOfRangeCount}
                      </span>
                    )}
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>

                {isOpen && (
                  <div className="px-4 pb-4 space-y-2 border-t border-border/30 pt-3 animate-fade-in">
                    {section.fields.map(f => {
                      const val = (profile as any)[f.key];
                      const display = val === 0 ? "" : String(val || "");
                      const filled = val && val !== 0;
                      const outRange = filled && isOutOfRange(f.key, val, f.optimal);
                      const inRange = filled && !outRange && f.optimal;

                      return (
                        <div key={f.key} className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              {f.label}
                              {outRange && <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />}
                              {inRange && <Check className="w-3 h-3 text-emerald-400 shrink-0" />}
                            </label>
                            {f.optimal && (
                              <span className="text-[9px] text-muted-foreground/60">{f.optimal}</span>
                            )}
                          </div>
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
                              className={`w-20 text-right text-sm font-mono rounded-lg px-2 py-1.5 outline-none focus:ring-1 focus:ring-primary/50 ${
                                outRange
                                  ? "bg-red-500/10 border border-red-500/30 text-red-400"
                                  : inRange
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : "bg-secondary/50 text-foreground"
                              }`}
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
        <div className="space-y-4 animate-fade-in">
          <p className="text-xs text-muted-foreground">
            List everything you take. AI adjusts your diagnosis based on this.
          </p>
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
              onClick={handleAddSubstance}
              disabled={!newSub.name.trim()}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-30 transition-opacity"
            >
              Add
            </button>
          </div>

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
                    <button onClick={() => handleRemoveSubstance(i)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* DEVICES TAB */}
      {tab === "devices" && (
        <div className="space-y-4 animate-fade-in">
          <input ref={deviceFileRef} type="file" className="hidden" onChange={handleDeviceUpload} accept=".csv,.json,.xml,.fit,.jpg,.png,.jpeg" />
          
          <p className="text-xs text-muted-foreground">
            Import data from your wearable or health app. Export the file from your device, then upload it here.
          </p>

          <div className="space-y-2">
            {DEVICE_OPTIONS.map(device => {
              const Icon = device.icon;
              const isSelected = selectedDevice === device.id;
              return (
                <div key={device.id} className="bg-card border border-border/50 rounded-2xl overflow-hidden">
                  <button
                    onClick={() => setSelectedDevice(isSelected ? null : device.id)}
                    className="w-full flex items-center gap-3 p-4 hover:bg-secondary/20 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-foreground">{device.name}</p>
                      <p className="text-[11px] text-muted-foreground">Accepts: {device.formats}</p>
                    </div>
                    <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isSelected ? "rotate-180" : ""}`} />
                  </button>

                  {isSelected && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3 animate-fade-in">
                      <div className="bg-secondary/30 rounded-xl p-3">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          <span className="font-semibold text-foreground">How to export:</span><br />
                          {device.description}
                        </p>
                      </div>
                      <button
                        onClick={() => deviceFileRef.current?.click()}
                        disabled={uploading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-30 transition-opacity"
                      >
                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {uploading ? "Importing..." : "Upload export file"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="bg-secondary/20 border border-border/30 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Dna className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-foreground">Future: Direct API Connections</p>
                <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                  We're working on direct integrations with Apple Health, Whoop, Oura, and more. 
                  For now, file imports work perfectly — your data is processed by AI and auto-fills your profile.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
