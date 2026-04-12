import { useHealth } from "@/lib/health-context";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, Heart, Brain, Wind, Droplets, Activity, ChevronRight, X, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const BODY_SYSTEMS = [
  { id: "heart", label: "Heart", icon: Heart, fields: ["bp_systolic", "bp_diastolic", "resting_hr", "hrv_ms"], color: "text-red-400" },
  { id: "metabolic", label: "Metabolic", icon: Droplets, fields: ["fasting_glucose", "hba1c", "fasting_insulin"], color: "text-amber-400" },
  { id: "lipids", label: "Lipids", icon: Activity, fields: ["ldl", "hdl", "triglycerides", "apob", "lpa"], color: "text-blue-400" },
  { id: "brain", label: "Brain & Sleep", icon: Brain, fields: ["avg_sleep_hours", "sleep_quality"], color: "text-purple-400" },
  { id: "lungs", label: "Fitness", icon: Wind, fields: ["vo2_max", "fev1_pct"], color: "text-emerald-400" },
];

const FIELD_LABELS: Record<string, { label: string; unit: string; optimal: string }> = {
  bp_systolic: { label: "Systolic BP", unit: "mmHg", optimal: "<120" },
  bp_diastolic: { label: "Diastolic BP", unit: "mmHg", optimal: "<80" },
  resting_hr: { label: "Resting HR", unit: "bpm", optimal: "50-60" },
  hrv_ms: { label: "HRV", unit: "ms", optimal: ">60" },
  fasting_glucose: { label: "Fasting Glucose", unit: "mg/dL", optimal: "72-85" },
  hba1c: { label: "HbA1c", unit: "%", optimal: "<5.2" },
  fasting_insulin: { label: "Fasting Insulin", unit: "μIU/mL", optimal: "<5" },
  ldl: { label: "LDL", unit: "mg/dL", optimal: "<100" },
  hdl: { label: "HDL", unit: "mg/dL", optimal: ">60" },
  triglycerides: { label: "Triglycerides", unit: "mg/dL", optimal: "<100" },
  apob: { label: "ApoB", unit: "mg/dL", optimal: "<80" },
  lpa: { label: "Lp(a)", unit: "nmol/L", optimal: "<30" },
  avg_sleep_hours: { label: "Sleep Duration", unit: "hours", optimal: "7.5-8.5" },
  sleep_quality: { label: "Sleep Quality", unit: "%", optimal: ">80" },
  vo2_max: { label: "VO2 Max", unit: "ml/kg/min", optimal: ">50" },
  fev1_pct: { label: "FEV1", unit: "%", optimal: ">95" },
};

export default function BodyScreen() {
  const { profile, updateField, userId, dataCompleteness } = useHealth();
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null);
  const [documents, setDocuments] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("medical_documents")
        .select("id, file_name, status, created_at, document_type")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (data) setDocuments(data);
    })();
  }, [userId]);

  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || !userId) return;
    setUploading(true);
    for (const file of Array.from(files)) {
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage.from("medical-documents").upload(filePath, file);
      if (uploadError) {
        toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
        continue;
      }
      const { data: doc } = await supabase
        .from("medical_documents")
        .insert({ user_id: userId, file_name: file.name, file_path: filePath, document_type: "lab_report", status: "new" })
        .select()
        .single();

      if (doc) {
        setDocuments(prev => [doc, ...prev]);
        // Trigger parsing
        supabase.functions.invoke("parse-document", { body: { documentId: doc.id, filePath } }).catch(() => {});
        toast({ title: "Document uploaded", description: "AI is analyzing your document..." });
      }
    }
    setUploading(false);
  }, [userId, toast]);

  const system = BODY_SYSTEMS.find(s => s.id === selectedSystem);

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <div className="text-center pt-1">
        <h1 className="text-lg font-semibold text-foreground">Your Body</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Health data & medical vault</p>
      </div>

      {/* Profile Summary */}
      <div className="bg-card border border-border rounded-xl p-3 grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Weight", value: `${profile.weight_kg}`, unit: "kg" },
          { label: "Height", value: `${profile.height_cm}`, unit: "cm" },
          { label: "Body Fat", value: `${profile.body_fat_pct}`, unit: "%" },
          { label: "Waist", value: `${profile.waist_cm}`, unit: "cm" },
        ].map(s => (
          <div key={s.label}>
            <p className="text-[9px] text-muted-foreground uppercase">{s.label}</p>
            <p className="text-sm font-bold text-foreground">{s.value}<span className="text-[9px] text-muted-foreground ml-0.5">{s.unit}</span></p>
          </div>
        ))}
      </div>

      {/* Data Completeness */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
        </div>
        <span className="text-xs font-semibold text-foreground">{dataCompleteness}%</span>
      </div>

      {/* Body Systems */}
      <div>
        <h2 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Systems</h2>
        <div className="space-y-1.5">
          {BODY_SYSTEMS.map(sys => {
            const Icon = sys.icon;
            const filledCount = sys.fields.filter(f => (profile as any)[f] > 0).length;
            const total = sys.fields.length;
            return (
              <button
                key={sys.id}
                onClick={() => setSelectedSystem(selectedSystem === sys.id ? null : sys.id)}
                className="w-full bg-card border border-border rounded-xl p-3 flex items-center gap-3 hover:border-primary/30 transition-colors text-left"
              >
                <Icon className={`w-5 h-5 ${sys.color} shrink-0`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{sys.label}</p>
                  <p className="text-[10px] text-muted-foreground">{filledCount}/{total} markers</p>
                </div>
                <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${selectedSystem === sys.id ? "rotate-90" : ""}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded System Detail */}
      {system && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground">{system.label} Markers</h3>
          {system.fields.map(field => {
            const meta = FIELD_LABELS[field];
            const value = (profile as any)[field];
            return (
              <div key={field} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-xs text-foreground font-medium">{meta?.label || field}</p>
                  <p className="text-[10px] text-muted-foreground">Optimal: {meta?.optimal || "—"}</p>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={value || ""}
                    onChange={(e) => updateField(field as any, parseFloat(e.target.value) || 0)}
                    className="w-20 text-right text-sm font-mono bg-muted border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:border-primary"
                    placeholder="—"
                  />
                  <span className="text-[10px] text-muted-foreground w-12">{meta?.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Medical Vault - Drag & Drop */}
      <div>
        <h2 className="text-xs font-semibold text-foreground mb-2 uppercase tracking-wider">Medical Vault</h2>
        <div
          className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors cursor-pointer ${dragOver ? "border-primary bg-primary/5" : "border-border"}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFileUpload(e.dataTransfer.files); }}
          onClick={() => { const input = document.createElement("input"); input.type = "file"; input.accept = ".pdf,.jpg,.png"; input.multiple = true; input.onchange = (e) => handleFileUpload((e.target as HTMLInputElement).files); input.click(); }}
        >
          {uploading ? (
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          ) : (
            <>
              <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Drop lab reports here or tap to upload</p>
              <p className="text-[10px] text-muted-foreground/50 mt-1">PDF, JPG, PNG</p>
            </>
          )}
        </div>

        {/* Document List */}
        {documents.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {documents.slice(0, 5).map(doc => (
              <div key={doc.id} className="bg-card border border-border rounded-lg p-2.5 flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{doc.file_name}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(doc.created_at).toLocaleDateString()}</p>
                </div>
                <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full ${doc.status === "reviewed" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                  {doc.status === "reviewed" ? "Analyzed" : doc.status === "processing" ? "Processing..." : "New"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
