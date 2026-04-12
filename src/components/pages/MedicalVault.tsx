import { Archive, Upload, FileText, Calendar, Download, Loader2, Pill, Lightbulb, AlertTriangle, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "@/lib/health-context";
import { useToast } from "@/hooks/use-toast";

interface MedicalDocument {
  id: string;
  file_name: string;
  file_path: string;
  document_type: string;
  provider: string;
  status: string;
  extracted_data: Record<string, number>;
  recommendations: Array<{ title: string; description: string; priority: string; category: string }>;
  medicine_stack: Array<{ name: string; dosage: string; frequency: string; reason: string; evidence_level: string }>;
  created_at: string;
}

export default function MedicalVault() {
  const [documents, setDocuments] = useState<MedicalDocument[]>([]);
  const [filter, setFilter] = useState("all");
  const [uploading, setUploading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<MedicalDocument | null>(null);
  const [tab, setTab] = useState<"docs" | "recommendations" | "stack">("docs");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { userId, setProfile, profile } = useHealth();
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
      // Upload file to storage
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("medical-documents")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      // Create document record
      const { data: doc, error: insertError } = await supabase
        .from("medical_documents")
        .insert({
          user_id: userId,
          file_name: file.name,
          file_path: filePath,
          status: "processing",
        })
        .select()
        .single();
      if (insertError) throw insertError;

      // Read file content as text
      const fileContent = await file.text();

      // Call parse-document edge function
      const { data: parseResult, error: parseError } = await supabase.functions.invoke("parse-document", {
        body: { documentId: doc.id, fileContent, fileName: file.name },
      });

      if (parseError) throw parseError;

      // Reload profile to reflect updated biomarkers
      const { data: updatedProfile } = await supabase
        .from("health_profiles")
        .select("*")
        .eq("user_id", userId)
        .single();
      if (updatedProfile) {
        setProfile(updatedProfile as any);
      }

      toast({ title: "Document processed!", description: `Extracted ${Object.keys(parseResult?.biomarkers || {}).length} biomarkers and ${parseResult?.recommendations?.length || 0} recommendations.` });
      await loadDocuments();
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

  // Aggregate all recommendations and medicine stack
  const allRecommendations = documents.flatMap(d => (d.recommendations as any[] || []).map(r => ({ ...r, source: d.file_name })));
  const allMedicineStack = documents.flatMap(d => (d.medicine_stack as any[] || []).map(m => ({ ...m, source: d.file_name })));

  const statusStyle = (s: string) =>
    s === "reviewed" ? "bg-vitalis-success/15 text-vitalis-success" :
    s === "processing" ? "bg-vitalis-warning/15 text-vitalis-warning" :
    "bg-primary/15 text-primary";

  const priorityStyle = (p: string) =>
    p === "high" ? "text-destructive" : p === "medium" ? "text-vitalis-warning" : "text-muted-foreground";

  const evidenceStyle = (e: string) =>
    e === "strong" ? "bg-vitalis-success/15 text-vitalis-success" :
    e === "moderate" ? "bg-vitalis-warning/15 text-vitalis-warning" :
    "bg-primary/15 text-primary";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-6 h-6 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Medical Vault</h1>
          </div>
          <p className="text-sm text-muted-foreground">Upload labs & reports — AI extracts biomarkers and updates your profile</p>
        </div>
        <div>
          <input ref={fileInputRef} type="file" accept=".txt,.csv,.pdf,.json,.html,.xml" onChange={handleUpload} className="hidden" />
          <Button variant="vitalis" onClick={() => fileInputRef.current?.click()} disabled={uploading || !userId}>
            {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
            {uploading ? "Processing..." : "Upload Report"}
          </Button>
        </div>
      </div>

      {!userId && (
        <div className="bg-vitalis-warning/10 border border-vitalis-warning/20 rounded-xl p-4 text-sm text-vitalis-warning">
          Sign in to upload and store medical documents.
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-secondary rounded-lg p-1">
        {[
          { id: "docs" as const, label: "Documents", icon: FileText, count: documents.length },
          { id: "recommendations" as const, label: "Recommendations", icon: Lightbulb, count: allRecommendations.length },
          { id: "stack" as const, label: "Medicine Stack", icon: Pill, count: allMedicineStack.length },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${
              tab === t.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            {t.count > 0 && <span className="bg-primary/15 text-primary px-1.5 rounded-full text-[10px]">{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Documents tab */}
      {tab === "docs" && (
        <>
          <div className="flex flex-wrap gap-2">
            {types.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  filter === t ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                }`}
              >
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
                <div
                  key={doc.id}
                  onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                  className={`bg-card border rounded-xl p-4 cursor-pointer transition-colors ${
                    selectedDoc?.id === doc.id ? "border-primary/40" : "border-border hover:border-primary/20"
                  }`}
                >
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
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle(doc.status)}`}>
                      {doc.status.toUpperCase()}
                    </span>
                  </div>

                  {/* Expanded details */}
                  {selectedDoc?.id === doc.id && (
                    <div className="mt-4 space-y-4 border-t border-border pt-4">
                      {/* Extracted biomarkers */}
                      {doc.extracted_data && Object.keys(doc.extracted_data).length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Extracted Biomarkers</h4>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {Object.entries(doc.extracted_data).map(([key, val]) => (
                              <div key={key} className="bg-secondary rounded-lg px-3 py-2">
                                <span className="text-[10px] text-muted-foreground uppercase">{key.replace(/_/g, " ")}</span>
                                <p className="text-sm font-semibold text-foreground">{String(val)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Document recommendations */}
                      {(doc.recommendations as any[])?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Recommendations</h4>
                          <div className="space-y-2">
                            {(doc.recommendations as any[]).map((rec: any, i: number) => (
                              <div key={i} className="bg-secondary rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className={`w-3 h-3 ${priorityStyle(rec.priority)}`} />
                                  <span className="text-xs font-semibold text-foreground">{rec.title}</span>
                                  <span className="text-[10px] text-muted-foreground ml-auto">{rec.category}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1">{rec.description}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Document medicine stack */}
                      {(doc.medicine_stack as any[])?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Suggested Supplements</h4>
                          <div className="space-y-2">
                            {(doc.medicine_stack as any[]).map((med: any, i: number) => (
                              <div key={i} className="bg-secondary rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <Pill className="w-3 h-3 text-primary" />
                                  <span className="text-xs font-semibold text-foreground">{med.name}</span>
                                  <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${evidenceStyle(med.evidence_level)}`}>
                                    {med.evidence_level}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-1">{med.dosage} · {med.frequency}</p>
                                <p className="text-[11px] text-muted-foreground">{med.reason}</p>
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
        <div className="space-y-3">
          {allRecommendations.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Upload lab reports to get personalized recommendations.</p>
            </div>
          ) : (
            <>
              {["high", "medium", "low"].map(priority => {
                const items = allRecommendations.filter(r => r.priority === priority);
                if (items.length === 0) return null;
                return (
                  <div key={priority}>
                    <h3 className={`text-xs font-semibold uppercase mb-2 ${priorityStyle(priority)}`}>
                      {priority} priority
                    </h3>
                    <div className="space-y-2">
                      {items.map((rec, i) => (
                        <div key={i} className="bg-card border border-border rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-1">
                            {priority === "high" ? <AlertTriangle className="w-4 h-4 text-destructive" /> :
                             priority === "medium" ? <Clock className="w-4 h-4 text-vitalis-warning" /> :
                             <CheckCircle className="w-4 h-4 text-muted-foreground" />}
                            <h4 className="text-sm font-semibold text-foreground">{rec.title}</h4>
                            <span className="ml-auto text-[10px] bg-secondary px-2 py-0.5 rounded-full text-muted-foreground">{rec.category}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{rec.description}</p>
                          <p className="text-[10px] text-muted-foreground/60 mt-1">From: {rec.source}</p>
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
            allMedicineStack.map((med, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Pill className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-foreground">{med.name}</h4>
                    <p className="text-xs text-muted-foreground">{med.dosage} · {med.frequency}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${evidenceStyle(med.evidence_level)}`}>
                    {med.evidence_level}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">{med.reason}</p>
                <p className="text-[10px] text-muted-foreground/60 mt-1">From: {med.source}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
