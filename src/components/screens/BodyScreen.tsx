import { useHealth } from "@/lib/health-context";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, FileText, Heart, Brain, Wind, Droplets, Activity, ChevronRight, User, Dna, MessageCircle, Send, Bot, X } from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";

const FAMILY_CONDITIONS = [
  "Heart Disease", "Diabetes", "Cancer", "Alzheimer's", "Stroke",
  "High Blood Pressure", "Obesity", "Autoimmune", "None"
];

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
  const [familyHistory, setFamilyHistory] = useState<string[]>([]);
  const [showProfile, setShowProfile] = useState(true);

  // AI Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  

  // Load family history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("vitalis_family_history");
    if (saved) setFamilyHistory(JSON.parse(saved));
  }, []);

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
        toast.error("Upload failed: " + uploadError.message);
        continue;
      }
      const { data: doc } = await supabase
        .from("medical_documents")
        .insert({ user_id: userId, file_name: file.name, file_path: filePath, document_type: "lab_report", status: "new" })
        .select()
        .single();
      if (doc) {
        setDocuments(prev => [doc, ...prev]);
        toast.success("Document uploaded — AI is analyzing...");
        
        // Call parse-document and update UI when done
        try {
          const { data, error } = await supabase.functions.invoke("parse-document", { 
            body: { documentId: doc.id, filePath } 
          });
          if (error) {
            toast.error("Analysis failed: " + (error.message || "Unknown error"));
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "error" } : d));
          } else {
            toast.success("Analysis complete! Your health data has been updated.");
            setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "reviewed" } : d));
          }
        } catch (err) {
          toast.error("Analysis failed. Please try again.");
          setDocuments(prev => prev.map(d => d.id === doc.id ? { ...d, status: "error" } : d));
        }
      }
    }
    setUploading(false);
  }, [userId]);

  const toggleFamilyCondition = (condition: string) => {
    setFamilyHistory(prev => {
      const next = condition === "None"
        ? ["None"]
        : prev.includes(condition)
          ? prev.filter(c => c !== condition)
          : [...prev.filter(c => c !== "None"), condition];
      localStorage.setItem("vitalis_family_history", JSON.stringify(next));
      return next;
    });
  };

  const sendChat = useCallback(async (text: string) => {
    if (!text.trim() || chatLoading) return;
    const userMsg = { role: "user" as const, content: text.trim() };
    const allMessages = [...chatMessages, userMsg];
    setChatMessages(allMessages);
    setChatInput("");
    setChatLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);

    // Build system prompt with user's health context
    const systemPrompt = `You are an elite longevity medicine AI advisor (combining expertise of Dr. Peter Attia, Dr. Andrew Huberman, Dr. David Sinclair). You have access to this patient's data:

Patient: ${profile.full_name || "Unknown"}, ${profile.sex || "Unknown"}, Age ~${profile.date_of_birth ? new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() : "unknown"}
Weight: ${profile.weight_kg}kg, Height: ${profile.height_cm}cm, Body Fat: ${profile.body_fat_pct}%, Waist: ${profile.waist_cm}cm
BP: ${profile.bp_systolic}/${profile.bp_diastolic}, HR: ${profile.resting_hr}bpm, HRV: ${profile.hrv_ms}ms, VO2max: ${profile.vo2_max}
Glucose: ${profile.fasting_glucose}mg/dL, HbA1c: ${profile.hba1c}%, Insulin: ${profile.fasting_insulin}
Cholesterol: Total ${profile.total_cholesterol}, LDL ${profile.ldl}, HDL ${profile.hdl}, Trig ${profile.triglycerides}, ApoB ${profile.apob}, Lp(a) ${profile.lpa}
Inflammation: hsCRP ${profile.hscrp}, Homocysteine ${profile.homocysteine}
Hormones: Testosterone ${profile.testosterone}, Free T ${profile.free_t}, Cortisol ${profile.cortisol}, TSH ${profile.tsh}
Sleep: ${profile.avg_sleep_hours}h, Quality: ${profile.sleep_quality}/100
Vitamin D: ${profile.vitamin_d}

Be direct, specific, and reference their actual values. Use markdown formatting. Keep responses concise but thorough. Flag anything suboptimal aggressively — this patient wants to live to 120+.`;

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, systemPrompt }),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        toast.error(err.error || "AI request failed");
        setChatLoading(false);
        return;
      }

      // Stream response
      const reader = resp.body?.getReader();
      if (!reader) throw new Error("No stream");
      const decoder = new TextDecoder();
      let assistantContent = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let newlineIdx: number;
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setChatMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant") {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { role: "assistant", content: assistantContent }];
              });
              chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }
          } catch {}
        }
      }
    } catch (e) {
      toast.error("Failed to reach AI advisor");
    }
    setChatLoading(false);
  }, [chatMessages, chatLoading, profile]);

  const system = BODY_SYSTEMS.find(s => s.id === selectedSystem);

  const chronoAge = profile.date_of_birth ? new Date().getFullYear() - new Date(profile.date_of_birth).getFullYear() : 0;

  return (
    <div className="space-y-5 pb-24 animate-fade-in">
      <div className="text-center pt-1">
        <h1 className="text-lg font-semibold text-foreground">Your Body</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Health data & medical vault</p>
      </div>

      {/* Quick Profile Section */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowProfile(!showProfile)}
          className="w-full flex items-center justify-between p-3"
        >
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">Quick Profile</span>
          </div>
          <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${showProfile ? "rotate-90" : ""}`} />
        </button>

        {showProfile && (
          <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3 animate-fade-in">
            {/* Basic Info Row */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Age</label>
                <div className="flex items-center gap-1 mt-0.5">
                  <input
                    type="number"
                    value={chronoAge || ""}
                    onChange={(e) => {
                      const age = parseInt(e.target.value) || 30;
                      const year = new Date().getFullYear() - age;
                      updateField("date_of_birth", `${year}-01-01`);
                    }}
                    className="w-full text-sm font-mono bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary"
                    placeholder="33"
                    min={1}
                    max={120}
                  />
                  <span className="text-[10px] text-muted-foreground">yrs</span>
                </div>
              </div>
              <div>
                <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Sex</label>
                <select
                  value={profile.sex || ""}
                  onChange={(e) => updateField("sex", e.target.value)}
                  className="w-full text-sm bg-muted border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:border-primary mt-0.5 appearance-none"
                >
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
              </div>
            </div>

            {/* Body Measurements */}
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { key: "weight_kg", label: "Weight", unit: "kg", placeholder: "84" },
                { key: "height_cm", label: "Height", unit: "cm", placeholder: "180" },
                { key: "body_fat_pct", label: "Body Fat", unit: "%", placeholder: "18" },
                { key: "waist_cm", label: "Waist", unit: "cm", placeholder: "86" },
              ].map(f => (
                <div key={f.key}>
                  <label className="text-[8px] text-muted-foreground uppercase">{f.label}</label>
                  <input
                    type="number"
                    value={(profile as any)[f.key] || ""}
                    onChange={(e) => updateField(f.key as any, parseFloat(e.target.value) || 0)}
                    className="w-full text-xs font-mono bg-muted border border-border rounded-lg px-1.5 py-1 text-foreground focus:outline-none focus:border-primary mt-0.5"
                    placeholder={f.placeholder}
                  />
                  <span className="text-[8px] text-muted-foreground">{f.unit}</span>
                </div>
              ))}
            </div>

            {/* Family History */}
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Dna className="w-3 h-3 text-muted-foreground" />
                <label className="text-[9px] text-muted-foreground uppercase tracking-wider">Family History</label>
              </div>
              <div className="flex flex-wrap gap-1">
                {FAMILY_CONDITIONS.map(condition => (
                  <button
                    key={condition}
                    onClick={() => toggleFamilyCondition(condition)}
                    className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                      familyHistory.includes(condition)
                        ? "bg-primary/10 border-primary/30 text-primary font-medium"
                        : "bg-muted border-border text-muted-foreground"
                    }`}
                  >
                    {condition}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Data Gravity */}
      <div className="bg-card border border-border rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Model Accuracy</span>
          <span className="text-xs font-bold text-primary">{dataCompleteness}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${dataCompleteness}%` }} />
        </div>
        <p className="text-[9px] text-muted-foreground/60 mt-1">
          {dataCompleteness < 50 ? "Add more data to improve predictions" : dataCompleteness < 80 ? "Upload labs to reach 90%+ accuracy" : "Your model is highly accurate"}
        </p>
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

      {/* Medical Vault */}
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

      {/* AI Medical Advisor Chat */}
      <div>
        <button
          onClick={() => { setChatOpen(!chatOpen); setTimeout(() => inputRef.current?.focus(), 100); }}
          className="w-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 rounded-xl p-3 flex items-center gap-3 hover:border-primary/40 transition-all"
        >
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-foreground">AI Medical Advisor</p>
            <p className="text-[10px] text-muted-foreground">Ask about your labs, risks, or health plan</p>
          </div>
          <MessageCircle className={`w-4 h-4 transition-transform ${chatOpen ? "text-primary" : "text-muted-foreground"}`} />
        </button>

        {chatOpen && (
          <div className="mt-2 bg-card border border-border rounded-xl overflow-hidden animate-fade-in">
            {/* Messages */}
            <div className="h-72 overflow-y-auto p-3 space-y-3">
              {chatMessages.length === 0 && (
                <div className="text-center py-8">
                  <Bot className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Ask me anything about your health data</p>
                  <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                    {["What are my biggest risks?", "Explain my LDL levels", "What supplements should I take?"].map(q => (
                      <button
                        key={q}
                        onClick={() => { setChatInput(q); setTimeout(() => sendChat(q), 50); }}
                        className="text-[10px] px-2 py-1 rounded-full bg-muted border border-border text-muted-foreground hover:border-primary/30 hover:text-primary transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-muted text-foreground rounded-bl-sm"
                  }`}>
                    {msg.role === "assistant" ? (
                      <div className="prose prose-xs prose-invert max-w-none [&_p]:m-0 [&_ul]:my-1 [&_li]:my-0.5 [&_strong]:text-primary">
                        <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                      </div>
                    ) : msg.content}
                  </div>
                </div>
              ))}
              {chatLoading && chatMessages[chatMessages.length - 1]?.role !== "assistant" && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-xl px-3 py-2 rounded-bl-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                      <div className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="border-t border-border p-2 flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) { e.preventDefault(); sendChat(chatInput); } }}
                placeholder="Ask about your health..."
                className="flex-1 text-xs bg-muted border border-border rounded-lg px-3 py-2 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary"
                disabled={chatLoading}
              />
              <button
                onClick={() => chatInput.trim() && sendChat(chatInput)}
                disabled={chatLoading || !chatInput.trim()}
                className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
