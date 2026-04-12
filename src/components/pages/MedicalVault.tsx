import { Archive, Upload, FileText, Calendar, Loader2, Pill, Lightbulb, AlertTriangle, CheckCircle, Clock, Activity, Heart, Brain, Flame, TrendingUp, Shield, Zap, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "@/lib/health-context";
import { useToast } from "@/hooks/use-toast";
import { extractTextFromFile } from "@/lib/pdf-utils";

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

interface LifestyleProtocol {
  morning_routine?: string[];
  exercise_protocol?: { type: string; frequency: string; duration: string; intensity: string };
  nutrition_guidelines?: string[];
  sleep_protocol?: string[];
  stress_management?: string[];
}

interface Recommendation {
  title: string;
  description: string;
  priority: string;
  category: string;
  expected_impact?: string;
  timeline?: string;
  evidence_level?: string;
}

interface MedicineItem {
  name: string;
  dosage: string;
  frequency: string;
  reason: string;
  evidence_level: string;
  expected_effect?: string;
  interactions?: string;
  priority?: number;
}

interface MedicalDocument {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  provider: string;
  status: string;
  extracted_data: {
    biomarkers?: Record<string, number>;
    biomarker_analysis?: BiomarkerAnalysis[];
    health_scores?: HealthScores;
    lifestyle_protocol?: LifestyleProtocol;
  };
  recommendations: Recommendation[];
  medicine_stack: MedicineItem[];
  created_at: string;
}

export default function MedicalVault() {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<MedicalDocument | null>(null);
  const [tab, setTab] = useState<"docs" | "scores" | "biomarkers" | "recommendations" | "stack" | "protocol">("docs");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userId, setProfile } = useHealth();
  const { toast } = useToast();

  useEffect(() => {
    if (!userId) return;
    loadDocuments();
  }, [userId]);

  const loadDocuments = async () => {
    const { data } = await supabase
      .from("medical_documents")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDocuments(data as unknown as MedicalDocument[]);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(true);
    try {
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("medical-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data: doc, error: insertError } = await supabase
        .from("medical_documents")
        .insert({ user_id: userId, file_name: file.name, file_path: filePath, status: "processing" })
        .select()
        .single();
      if (insertError) throw insertError;

      const extracted = await extractTextFromFile(file);

      const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-document", {
        body: {
          documentId: doc.id,
          fileContent: extracted.text,
          fileName: file.name,
          fileBase64: extracted.base64,
          mimeType: extracted.mimeType,
        },
      });

      if (parseError) throw parseError;

      const { data: updatedProfile } = await supabase
        .from("health_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (updatedProfile) setProfile(updatedProfile as any);

      const bioCount = Object.keys(parseResult?.biomarkers || {}).length;
      const recCount = parseResult?.recommendations?.length || 0;
      const medCount = parseResult?.medicine_stack?.length || 0;

      toast({
        title: "🧬 Analysis Complete!",
        description: `Extracted ${bioCount} biomarkers, ${recCount} recommendations, ${medCount} supplements. Your profile has been updated.`,
      });

      await loadDocuments();
      setTab("scores");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const types = ["all", ...new Set(documents.map(r => r.document_type).filter(Boolean))];
  const filtered = filter === "all" ? documents : documents.filter(r => r.document_type === filter);

  // Aggregate from all documents
  const latestDoc = documents[0];
  const healthScores = latestDoc?.extracted_data?.health_scores;
  const biomarkerAnalyses = documents.flatMap(d => d.extracted_data?.biomarker_analysis || []);
  const allRecommendations = documents.flatMap(d => (d.recommendations as any[] || []).map(r => ({ ...r, source: d.file_name })));
  const allMedicineStack = documents.flatMap(d => (d.medicine_stack as any[] || []).map(m => ({ ...m, source: d.file_name })));
  const lifestyleProtocol = latestDoc?.extracted_data?.lifestyle_protocol;

  const statusColor = (s: string) =>
    s === "optimal" ? "text-emerald-400 bg-emerald-500/15" :
    s === "suboptimal" ? "text-amber-400 bg-amber-500/15" :
    s === "warning" ? "text-orange-400 bg-orange-500/15" :
    "text-red-400 bg-red-500/15";

  const priorityIcon = (p: string) =>
    p === "critical" ? <Flame className="w-4 h-4 text-red-400" /> :
    p === "high" ? <AlertTriangle className="w-4 h-4 text-orange-400" /> :
    p === "medium" ? <Clock className="w-4 h-4 text-amber-400" /> :
    <CheckCircle className="w-4 h-4 text-muted-foreground" />;

  const evidenceBadge = (e: string) =>
    e === "strong" ? "bg-emerald-500/15 text-emerald-400" :
    e === "moderate" ? "bg-amber-500/15 text-amber-400" :
    "bg-primary/15 text-primary";

  const scoreColor = (v: number) =>
    v >= 80 ? "text-emerald-400" : v >= 60 ? "text-amber-400" : v >= 40 ? "text-orange-400" : "text-red-400";

  const scoreGradient = (v: number) =>
    v >= 80 ? "from-emerald-500/20 to-emerald-500/5" :
    v >= 60 ? "from-amber-500/20 to-amber-500/5" :
    v >= 40 ? "from-orange-500/20 to-orange-500/5" :
    "from-red-500/20 to-red-500/5";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-6 h-6 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Medical Vault</h1>
          </div>
          <p className="text-sm text-muted-foreground">AI-powered lab analysis · Longevity medicine insights</p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".txt,.csv,.pdf,.json,.html,.xml" onChange={handleUpload} className="hidden" />
          <Button variant="vitalis" onClick={() => fileInputRef.current?.click()} disabled={uploading || !userId}>
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            {uploading ? "Analyzing..." : "Upload Report"}
          </Button>
        </div>
      </div>

      {!userId && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-sm text-amber-400">
          Sign in to upload and store medical documents.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-lg p-1 overflow-x-auto">
        {[
          { id: "docs" as const, label: "Documents", icon: FileText, count: documents.length },
          { id: "scores" as const, label: "Health Scores", icon: Activity, count: healthScores ? 1 : 0 },
          { id: "biomarkers" as const, label: "Biomarkers", icon: Target, count: biomarkerAnalyses.length },
          { id: "recommendations" as const, label: "Actions", icon: Lightbulb, count: allRecommendations.length },
          { id: "stack" as const, label: "Stack", icon: Pill, count: allMedicineStack.length },
          { id: "protocol" as const, label: "Protocol", icon: Zap, count: lifestyleProtocol ? 1 : 0 },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count > 0 && <span className="bg-primary/15 text-primary px-1.5 rounded-full text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Health Scores Dashboard */}
      {tab === "scores" && (
        <div className="space-y-4">
          {!healthScores ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Upload a lab report to see your health scores.</p>
            </div>
          ) : (
            <>
              {/* Main score */}
              <div className="bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20 rounded-2xl p-6 text-center">
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Overall Longevity Score</p>
                <div className={`text-6xl font-black ${scoreColor(healthScores.overall_longevity)}`}>
                  {healthScores.overall_longevity}
                </div>
                <p className="text-sm text-muted-foreground mt-1">/100</p>
                <div className="flex items-center justify-center gap-4 mt-4 flex-wrap">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Bio Age</p>
                    <p className="text-lg font-bold text-foreground">{healthScores.biological_age_estimate}</p>
                  </div>
                  <div className="w-px h-8 bg-border" />
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Healthspan</p>
                    <p className="text-lg font-bold text-emerald-400">{healthScores.projected_healthspan_years}+ yrs</p>
                  </div>
                </div>
              </div>

              {/* Sub-scores */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Metabolic", value: healthScores.metabolic_health, icon: Activity },
                  { label: "Cardiovascular", value: healthScores.cardiovascular_risk, icon: Heart },
                  { label: "Hormonal", value: healthScores.hormonal_balance, icon: Brain },
                  { label: "Inflammation", value: healthScores.inflammation_index, icon: Shield },
                ].map(s => (
                  <div key={s.label} className={`bg-gradient-to-br ${scoreGradient(s.value)} border border-border rounded-xl p-4`}>
                    <div className="flex items-center gap-2 mb-2">
                      <s.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">{s.label}</span>
                    </div>
                    <div className={`text-2xl font-bold ${scoreColor(s.value)}`}>{s.value}<span className="text-sm text-muted-foreground">/100</span></div>
                  </div>
                ))}
              </div>

              {/* Risk factors */}
              {healthScores.top_risk_factors?.length > 0 && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-red-400 uppercase mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Top Risk Factors
                  </h3>
                  <div className="space-y-1">
                    {healthScores.top_risk_factors.map((r, i) => (
                      <p key={i} className="text-sm text-foreground">• {r}</p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Biomarker Analysis */}
      {tab === "biomarkers" && (
        <div className="space-y-3">
          {biomarkerAnalyses.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Upload lab reports to see detailed biomarker analysis.</p>
            </div>
          ) : (
            <>
              {["critical", "warning", "suboptimal", "optimal"].map(status => {
                const items = biomarkerAnalyses.filter(b => b.status === status);
                if (items.length === 0) return null;
                return (
                  <div key={status}>
                    <h3 className={`text-xs font-semibold uppercase mb-2 ${
                      status === "critical" ? "text-red-400" :
                      status === "warning" ? "text-orange-400" :
                      status === "suboptimal" ? "text-amber-400" :
                      "text-emerald-400"
                    }`}>
                      {status} ({items.length})
                    </h3>
                    <div className="space-y-2">
                      {items.map((b, i) => (
                        <div key={i} className="bg-card border border-border rounded-xl p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusColor(b.status)}`}>
                                {b.status.toUpperCase()}
                              </span>
                              <h4 className="text-sm font-semibold text-foreground">{b.key.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</h4>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-lg font-bold text-foreground">{b.value}</span>
                              <span className="text-[10px] text-muted-foreground">optimal: {b.optimal_range}</span>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{b.interpretation}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                              <TrendingUp className="w-3 h-3 text-primary" />
                              <span className="text-[11px] text-primary">{b.improvement_potential}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">Longevity impact:</span>
                              <span className={`text-xs font-bold ${b.longevity_impact >= 7 ? "text-red-400" : b.longevity_impact >= 4 ? "text-amber-400" : "text-muted-foreground"}`}>
                                {b.longevity_impact}/10
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Documents tab */}
      {tab === "docs" && (
        <>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button key={t} onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === t ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                }`}>
                {t === "all" ? "All" : t}
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No documents yet. Upload a lab report to get started.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((doc) => (
                <div key={doc.id} onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                  className={`bg-card border rounded-xl p-4 cursor-pointer transition-colors ${
                    selectedDoc?.id === doc.id ? "border-primary/40" : "border-border hover:border-primary/20"
                  }`}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground truncate">{doc.file_name}</h3>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Calendar className="w-3 h-3" /> {new Date(doc.created_at).toLocaleDateString()}
                        </span>
                        {doc.provider && <span className="text-[11px] text-muted-foreground">{doc.provider}</span>}
                        {doc.document_type && <span className="text-[11px] text-muted-foreground">{doc.document_type}</span>}
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                      doc.status === "reviewed" ? "bg-emerald-500/15 text-emerald-400" :
                      doc.status === "processing" ? "bg-amber-500/15 text-amber-400" :
                      "bg-primary/15 text-primary"
                    }`}>
                      {doc.status.toUpperCase()}
                    </span>
                  </div>

                  {selectedDoc?.id === doc.id && (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      {doc.extracted_data?.biomarkers && Object.keys(doc.extracted_data.biomarkers).length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Extracted Biomarkers</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.entries(doc.extracted_data.biomarkers).map(([key, val]) => (
                              <div key={key} className="bg-secondary rounded-lg px-3 py-2">
                                <span className="text-[10px] text-muted-foreground uppercase">{key.replace(/_/g, " ")}</span>
                                <p className="text-sm font-semibold text-foreground">{String(val)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Recommendations tab */}
      {tab === "recommendations" && (
        <div className="space-y-4">
          {allRecommendations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Upload lab reports to get personalized longevity recommendations.</p>
            </div>
          ) : (
            <>
              {["critical", "high", "medium", "low"].map(priority => {
                const items = allRecommendations.filter(r => r.priority === priority);
                if (items.length === 0) return null;
                return (
                  <div key={priority}>
                    <h3 className={`text-xs font-semibold uppercase mb-2 flex items-center gap-1.5 ${
                      priority === "critical" ? "text-red-400" :
                      priority === "high" ? "text-orange-400" :
                      priority === "medium" ? "text-amber-400" :
                      "text-muted-foreground"
                    }`}>
                      {priorityIcon(priority)} {priority} priority ({items.length})
                    </h3>
                    <div className="space-y-2">
                      {items.map((rec, i) => (
                        <div key={i} className="bg-card border border-border rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="text-sm font-semibold text-foreground flex-1">{rec.title}</h4>
                            <span className="text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{rec.category}</span>
                            {rec.evidence_level && (
                              <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${evidenceBadge(rec.evidence_level)}`}>
                                {rec.evidence_level}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mb-2">{rec.description}</p>
                          {(rec.expected_impact || rec.timeline) && (
                            <div className="flex gap-4 text-[11px]">
                              {rec.expected_impact && <span className="text-primary">📈 {rec.expected_impact}</span>}
                              {rec.timeline && <span className="text-muted-foreground">⏱ {rec.timeline}</span>}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Medicine Stack tab */}
      {tab === "stack" && (
        <div className="space-y-3">
          {allMedicineStack.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Pill className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Upload lab reports to get a personalized supplement stack.</p>
            </div>
          ) : (
            allMedicineStack.sort((a, b) => (a.priority || 99) - (b.priority || 99)).map((med, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Pill className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-foreground">{med.name}</h4>
                      {med.priority && <span className="text-[9px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">#{med.priority}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{med.dosage} · {med.frequency}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${evidenceBadge(med.evidence_level)}`}>
                    {med.evidence_level}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{med.reason}</p>
                {med.expected_effect && <p className="text-[11px] text-primary mt-1">📈 {med.expected_effect}</p>}
                {med.interactions && <p className="text-[11px] text-amber-400 mt-1">⚠️ {med.interactions}</p>}
              </div>
            ))
          )}
        </div>
      )}

      {/* Lifestyle Protocol tab */}
      {tab === "protocol" && (
        <div className="space-y-4">
          {!lifestyleProtocol ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Upload lab reports to get a personalized daily protocol.</p>
            </div>
          ) : (
            <>
              {lifestyleProtocol.morning_routine?.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-amber-400 uppercase mb-2 flex items-center gap-1.5">
                    ☀️ Morning Routine
                  </h3>
                  <div className="space-y-1.5">
                    {lifestyleProtocol.morning_routine.map((item, i) => (
                      <p key={i} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span> {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {lifestyleProtocol.exercise_protocol && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-emerald-400 uppercase mb-2 flex items-center gap-1.5">
                    🏋️ Exercise Protocol
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(lifestyleProtocol.exercise_protocol).map(([key, val]) => (
                      <div key={key} className="bg-secondary rounded-lg px-3 py-2">
                        <span className="text-[10px] text-muted-foreground uppercase">{key.replace(/_/g, " ")}</span>
                        <p className="text-sm font-semibold text-foreground">{val}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lifestyleProtocol.nutrition_guidelines?.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-green-400 uppercase mb-2 flex items-center gap-1.5">
                    🥗 Nutrition Guidelines
                  </h3>
                  <div className="space-y-1.5">
                    {lifestyleProtocol.nutrition_guidelines.map((item, i) => (
                      <p key={i} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span> {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {lifestyleProtocol.sleep_protocol?.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-blue-400 uppercase mb-2 flex items-center gap-1.5">
                    🌙 Sleep Protocol
                  </h3>
                  <div className="space-y-1.5">
                    {lifestyleProtocol.sleep_protocol.map((item, i) => (
                      <p key={i} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span> {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {lifestyleProtocol.stress_management?.length > 0 && (
                <div className="bg-card border border-border rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-purple-400 uppercase mb-2 flex items-center gap-1.5">
                    🧘 Stress Management
                  </h3>
                  <div className="space-y-1.5">
                    {lifestyleProtocol.stress_management.map((item, i) => (
                      <p key={i} className="text-sm text-foreground flex items-start gap-2">
                        <span className="text-primary mt-0.5">•</span> {item}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
