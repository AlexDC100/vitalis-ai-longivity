import { useState, useRef, useCallback, useEffect } from "react";
import { useHealth } from "@/lib/health-context";
import { runDiagnosis } from "@/lib/diagnosis-engine";
import { supabase } from "@/integrations/supabase/client";
import { useSubstances } from "@/lib/use-substances";
import { Send, Mic, Bot, User, Stethoscope, Upload, Loader2, Calendar, ExternalLink, MapPin, Paperclip, AlertTriangle, ShieldCheck, Activity, Siren, CalendarCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { pickPartner } from "@/lib/clinic-partners";
import AIDoctorTestMode from "@/components/AIDoctorTestMode";

interface ChatMsg {
  id: string;
  role: "user" | "assistant" | "action";
  content: string;
  actionType?: "booking" | "upload-success" | "care";
  actionData?: any;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

type Severity = "LOW" | "MODERATE" | "HIGH" | "URGENT";

const SEVERITY_META: Record<Severity, {
  label: string; tagline: string; bg: string; border: string; text: string; icon: React.ElementType;
}> = {
  LOW:      { label: "Low", tagline: "Monitor — no action needed now",
              bg: "bg-emerald-500/10", border: "border-emerald-500/25", text: "text-emerald-400", icon: ShieldCheck },
  MODERATE: { label: "Moderate", tagline: "Improve lifestyle factors",
              bg: "bg-amber-500/10", border: "border-amber-500/25", text: "text-amber-400", icon: Activity },
  HIGH:     { label: "High", tagline: "Consult a doctor soon",
              bg: "bg-orange-500/10", border: "border-orange-500/25", text: "text-orange-400", icon: AlertTriangle },
  URGENT:   { label: "Urgent", tagline: "Seek medical care immediately",
              bg: "bg-red-500/10", border: "border-red-500/25", text: "text-red-400", icon: Siren },
};

function parseSeverity(content: string): Severity | null {
  // Look for explicit machine-readable tag the model is instructed to emit.
  const m = content.match(/\[\[SEVERITY:(LOW|MODERATE|HIGH|URGENT)\]\]/i);
  if (m) return m[1].toUpperCase() as Severity;
  // Fallback: scan a "Severity Level" line in the markdown
  const m2 = content.match(/severity[^\n]*?(URGENT|HIGH|MODERATE|LOW)/i);
  return m2 ? (m2[1].toUpperCase() as Severity) : null;
}

function parseSpecialty(content: string): string | null {
  const m = content.match(/\[\[SPECIALTY:([^\]]+)\]\]/i);
  return m ? m[1].trim() : null;
}

// Strip the machine-readable tags before rendering markdown
function stripTags(content: string): string {
  return content
    .replace(/\[\[SEVERITY:(LOW|MODERATE|HIGH|URGENT)\]\]/gi, "")
    .replace(/\[\[SPECIALTY:[^\]]+\]\]/gi, "")
    .trim();
}

export default function AIDoctorScreen() {
  const { profile, updateField, longevityScore, biologicalAge, chronologicalAge, userId } = useHealth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Substances now sourced from RLS-protected `user_substances` table
  // (was previously `localStorage["vitalis_substances"]`).
  const { substances } = useSubstances();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const diagnosis = runDiagnosis(profile, substances);
  const isHighRisk = diagnosis.severity === "critical" || diagnosis.severity === "high";

  const substanceList = substances.length > 0
    ? substances.map(s => `${s.name} (${s.category}${s.dose ? `, ${s.dose}` : ""})`).join(", ")
    : "None reported";

  const diagnosisSummary = `Primary diagnosis: ${diagnosis.title} (${diagnosis.severity}, risk score ${diagnosis.riskScore}/100)
Explanation: ${diagnosis.explanation}
Top fixes: ${diagnosis.fixes.map(f => f.action).join("; ")}
Expected impact: ${diagnosis.lifeImpact}`;

  const systemPrompt = `You are Vitalis AI Doctor — a longevity medicine assistant. You are NOT a substitute for a licensed physician and must never give a definitive diagnosis. Be clear, decisive, and actionable — never vague.

========================
MANDATORY RESPONSE FORMAT
========================
EVERY substantive answer MUST follow this exact structure, in this exact order, using these exact ## headers:

## 1. Summary
1–3 sentences in plain language. What is likely going on, based on the data?

## 2. Severity Level
Pick exactly ONE of: **LOW**, **MODERATE**, **HIGH**, **URGENT**.
Definitions:
- LOW — monitor, no action needed now
- MODERATE — improve lifestyle factors
- HIGH — consult a doctor soon
- URGENT — seek medical care immediately (or call emergency services if symptoms suggest acute danger)
State the chosen level in **bold** and add a one-line justification.

## 3. Key Findings
A bulleted list of MAX 3 issues, each one short line. Reference the patient's actual numbers when relevant.

## 4. Recommended Actions
A numbered list of concrete next steps. Mix:
- lifestyle changes (specific, with dose/duration)
- follow-up tests (which biomarker, when to retest)
- doctor consultation (only when truly indicated)

## 5. Care Recommendation
- If severity is LOW or MODERATE: a single line such as "No specialist visit required at this time."
- If severity is HIGH or URGENT: name the TYPE of doctor (e.g., cardiologist, endocrinologist, GP, emergency care) and the general action ("book an appointment within X days" or "go to emergency care now"). Do NOT name specific hospitals or clinics.

At the very end of your response, on its own line, append two machine-readable tags:
[[SEVERITY:LOW|MODERATE|HIGH|URGENT]]
[[SPECIALTY:<doctor type or "none">]]
(Replace with the chosen value. These tags are required so the UI can render the right card. Do not wrap them in code blocks.)

========================
SAFETY RULES
========================
- Never give a definitive diagnosis — use phrases like "the data suggests" or "this pattern is consistent with".
- Always include a brief disclaimer in the Summary or Care Recommendation when severity is HIGH or URGENT, e.g. "This is not a medical diagnosis — please confirm with a licensed physician."
- If symptoms suggest a true emergency (chest pain with shortness of breath, signs of stroke, suicidal ideation, severe allergic reaction, etc.), severity MUST be URGENT and the action MUST be "seek emergency care now / call your local emergency number".
- Do NOT recommend specific brand-name hospitals or clinics. Speak generically (e.g. "a reputable cardiology clinic in your area").

========================
STYLE
========================
- Be scannable in 5 seconds. Short sentences. No filler.
- Use markdown tables ONLY when comparing 3+ biomarkers vs optimal ranges; otherwise prefer bullets.
- Always reference the patient's actual numbers when discussing them.
- Avoid hedging language like "you might want to consider possibly". Be decisive.

========================
PATIENT DATA
========================
- Name: ${profile.full_name || "Patient"} | Age: ${chronologicalAge} | Biological Age: ${biologicalAge} | Sex: ${profile.sex || "Unknown"}
- Height: ${profile.height_cm}cm | Weight: ${profile.weight_kg}kg | Body Fat: ${profile.body_fat_pct}% | Waist: ${profile.waist_cm}cm

CARDIOVASCULAR:
- BP: ${profile.bp_systolic}/${profile.bp_diastolic} mmHg | Resting HR: ${profile.resting_hr} bpm | HRV: ${profile.hrv_ms} ms | VO2 Max: ${profile.vo2_max} ml/kg/min

LIPIDS:
- Total Cholesterol: ${profile.total_cholesterol} | LDL: ${profile.ldl} | HDL: ${profile.hdl} | Triglycerides: ${profile.triglycerides}
- ApoB: ${profile.apob} mg/dL | Lp(a): ${profile.lpa} nmol/L

METABOLIC:
- Fasting Glucose: ${profile.fasting_glucose} mg/dL | HbA1c: ${profile.hba1c}% | Fasting Insulin: ${profile.fasting_insulin} μU/mL
- hs-CRP: ${profile.hscrp} mg/L | Homocysteine: ${profile.homocysteine} μmol/L

HORMONES:
- Testosterone: ${profile.testosterone} ng/dL | Free T: ${profile.free_t} pg/mL | Estradiol: ${profile.estradiol} pg/mL
- DHEA-S: ${profile.dhea_s} μg/dL | Cortisol: ${profile.cortisol} μg/dL
- TSH: ${profile.tsh} mIU/L | Free T3: ${profile.free_t3} pg/mL | Free T4: ${profile.free_t4} ng/dL
- IGF-1: ${profile.igf1} ng/mL | Vitamin D: ${profile.vitamin_d} ng/mL

SLEEP & RECOVERY:
- Avg Sleep: ${profile.avg_sleep_hours}h | Sleep Quality: ${profile.sleep_quality}/100 | FEV1: ${profile.fev1_pct}%

SUBSTANCES: ${substanceList}

CURRENT INTERNAL DIAGNOSIS (for your context — synthesize, don't quote verbatim):
${diagnosisSummary}`;

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const userMsg: ChatMsg = { id: Date.now().toString(), role: "user", content: text.trim() };
    const allMessages = [...messages.filter(m => m.role !== "action"), userMsg];
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    let assistantContent = "";
    const assistantId = (Date.now() + 1).toString();

    try {
      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({
          messages: allMessages.map(m => ({ role: m.role, content: m.content })),
          systemPrompt,
        }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => null);
        if (resp.status === 429) toast({ title: "Rate limited", description: "Please wait a moment and try again.", variant: "destructive" });
        else if (resp.status === 402) toast({ title: "Credits exhausted", description: "Please add funds in Settings > Workspace > Usage.", variant: "destructive" });
        throw new Error(errData?.error || `Error ${resp.status}`);
      }
      if (!resp.body) throw new Error("No response body");

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: assistantContent } : m));
            }
          } catch {}
        }
      }

      // After AI response, parse the severity tag emitted by the model.
      // If HIGH or URGENT, inject a generic Care Recommendation card.
      const severity = parseSeverity(assistantContent);
      const specialty = parseSpecialty(assistantContent) || "General Practitioner";
      if (severity === "HIGH" || severity === "URGENT") {
        const careAction: ChatMsg = {
          id: `care-${Date.now()}`,
          role: "action",
          content: "",
          actionType: "care",
          actionData: { severity, specialty },
        };
        setMessages(prev => [...prev, careAction]);
      }
    } catch (err: any) {
      const errorMsg = err?.message || "Connection failed";
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.id === assistantId && !last.content) {
          return prev.map(m => m.id === assistantId ? { ...m, content: `⚠️ ${errorMsg}` } : m);
        }
        return [...prev, { id: assistantId, role: "assistant", content: `⚠️ ${errorMsg}` }];
      });
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, systemPrompt, toast]);

  /**
   * Test-mode helper: sends a prompt through the same edge function with
   * the same systemPrompt as the real chat, but does NOT mutate the
   * visible message list. Returns the full assistant text (including the
   * hidden [[SEVERITY:...]] tags) so the test panel can validate it.
   */
  const runTestPrompt = useCallback(async (prompt: string): Promise<string> => {
    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: prompt }],
        systemPrompt,
      }),
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => null);
      throw new Error(errData?.error || `Error ${resp.status}`);
    }
    if (!resp.body) throw new Error("No response body");

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf("\n")) !== -1) {
        let line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (!line.startsWith("data: ")) continue;
        const json = line.slice(6).trim();
        if (json === "[DONE]") return full;
        try {
          const parsed = JSON.parse(json);
          const c = parsed.choices?.[0]?.delta?.content;
          if (c) full += c;
        } catch { /* partial chunk, ignore */ }
      }
    }
    return full;
  }, [systemPrompt]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setIsUploading(true);

    // Show upload message in chat
    const uploadingMsg: ChatMsg = {
      id: `uploading-${Date.now()}`,
      role: "action",
      content: `Analyzing **${file.name}**...`,
      actionType: "upload-success",
    };
    setMessages(prev => [...prev, uploadingMsg]);

    try {
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      await supabase.storage.from("medical-documents").upload(filePath, file);

      const { data: doc } = await supabase.from("medical_documents").insert({
        user_id: userId, file_name: file.name, file_path: filePath, status: "processing",
      }).select().single();

      if (doc) {
        const { data: result } = await supabase.functions.invoke("parse-document", {
          body: { documentId: doc.id, filePath },
        });

        if (result?.biomarkers) {
          Object.entries(result.biomarkers).forEach(([key, val]) => {
            if (val && typeof val === "number" && val > 0) updateField(key as any, val);
          });
        }

        const extractedCount = result?.biomarkers ? Object.keys(result.biomarkers).filter(k => result.biomarkers[k] > 0).length : 0;

        // Replace uploading message with success
        setMessages(prev => prev.map(m => m.id === uploadingMsg.id ? {
          ...m,
          content: `✅ **${file.name}** analyzed — ${extractedCount} biomarkers extracted and profile updated.`,
        } : m));

        // Auto-ask AI to analyze
        const summaryText = `I just uploaded "${file.name}". ${extractedCount} biomarkers were extracted and my profile has been updated. Please analyze the new results and tell me what changed, what's concerning, and what I should do next. Create a comparison table of my key biomarkers vs optimal ranges.`;
        await sendMessage(summaryText);
        toast({ title: "Lab report analyzed", description: `${extractedCount} biomarkers extracted.` });
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === uploadingMsg.id ? {
        ...m, content: `❌ Failed to process **${file?.name}**: ${err.message}`,
      } : m));
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [userId, updateField, toast, sendMessage]);

  const handleHoldStart = () => {
    holdTimer.current = setTimeout(() => {
      setIsHolding(true);
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      let transcript = "";
      rec.onresult = (e: any) => {
        transcript = Array.from(e.results).map((r: any) => r[0].transcript).join("");
        setInput(transcript);
      };
      rec.onerror = () => setIsHolding(false);
      rec.start();
      recognitionRef.current = rec;
    }, 300);
  };

  const handleHoldEnd = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    if (recognitionRef.current) { recognitionRef.current.stop(); recognitionRef.current = null; }
    if (isHolding) {
      setIsHolding(false);
      if (input.trim()) setTimeout(() => sendMessage(input), 100);
    }
  };

  const handleBookSpecialist = () => {
    sendMessage("Based on my data, what type of specialist should I see, and how soon? Be specific and practical.");
  };

  const quickPrompts = [
    "What's my #1 health risk right now?",
    "Compare all my biomarkers vs optimal",
    "Give me a 30-day protocol",
    "What labs should I retest and when?",
  ];

  // Render generic Care Recommendation card (no hard-coded providers).
  // Uses the severity + specialty parsed from the model's response and
  // links to a generic Google Maps search so the user can find a real
  // provider near them.
  const renderCareCard = (msg: ChatMsg) => {
    const data = msg.actionData as { severity: Severity; specialty: string };
    const meta = SEVERITY_META[data.severity];
    const Icon = meta.icon;
    const isUrgent = data.severity === "URGENT";
    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.specialty + " near me")}`;
    // Pick a partner clinic (extensible via src/lib/clinic-partners.ts).
    // null when severity isn't HIGH/URGENT — shouldn't happen here since
    // we only inject the card on HIGH/URGENT — but stay defensive.
    const partner = pickPartner(data.severity);
    return (
      <div className="flex gap-2.5 animate-fade-in">
        <div className={`w-7 h-7 rounded-lg ${meta.bg} flex items-center justify-center shrink-0 mt-1`}>
          <Icon className={`w-4 h-4 ${meta.text}`} />
        </div>
        <div className="max-w-[85%] w-full">
          <div className={`bg-card border ${meta.border} rounded-2xl px-4 py-3 space-y-3`}>
            <div>
              <p className={`text-xs font-semibold ${meta.text} mb-0.5`}>
                {isUrgent ? "Urgent care recommended" : "Book a medical consultation"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {isUrgent
                  ? "Your data suggests this may need immediate medical attention."
                  : <>This may require professional medical attention. Recommended specialist:&nbsp;
                      <span className="text-foreground font-medium">{data.specialty}</span>.
                    </>}
              </p>
            </div>

            {isUrgent ? (
              <a
                href="tel:112"
                className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 ${meta.bg} border ${meta.border} rounded-xl ${meta.text} text-xs font-semibold hover:opacity-90 transition-opacity`}
              >
                <Siren className="w-4 h-4" />
                Call emergency services now
              </a>
            ) : (
              <>
                {partner && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <CalendarCheck className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{partner.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{partner.description}</p>
                      </div>
                    </div>
                    <a
                      href={partner.bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 w-full px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      Book appointment
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                )}
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2.5 p-2.5 bg-secondary/40 border border-border/30 rounded-xl hover:bg-secondary/60 hover:border-primary/30 transition-all group"
                >
                  <MapPin className="w-4 h-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      Or find a {data.specialty} near you
                    </p>
                    <p className="text-[10px] text-muted-foreground">Opens map search — choose a reputable clinic in your area</p>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary shrink-0" />
                </a>
              </>
            )}

            <p className="text-[10px] text-muted-foreground italic">
              This app does not replace a licensed doctor.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Render upload status in chat
  const renderUploadAction = (msg: ChatMsg) => (
    <div className="flex gap-2.5 animate-fade-in">
      <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
        {isUploading ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <Upload className="w-4 h-4 text-primary" />}
      </div>
      <div className="max-w-[85%] bg-card border border-primary/20 rounded-2xl px-4 py-3">
        <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed [&_strong]:text-foreground">
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full pb-20 -mx-4 -mt-3">
      <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.png,.jpeg" />

      {/* Minimal header */}
      <div className="px-5 pt-4 pb-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Stethoscope className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-foreground">AI Doctor</h1>
          <p className="text-[11px] text-muted-foreground">Clinical-grade health intelligence</p>
        </div>
      </div>

      {/* Persistent safety disclaimer */}
      <div className="mx-4 mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20">
        <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <p className="text-[10.5px] leading-tight text-muted-foreground">
          <span className="text-amber-400/90 font-medium">This app does not replace a licensed doctor.</span>
          {" "}Use AI guidance to inform your decisions, not replace professional care.
        </p>
      </div>

      {/* Test mode — verify mandatory 5-block structure */}
      <AIDoctorTestMode runPrompt={runTestPrompt} />

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-8 space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Stethoscope className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-lg font-semibold text-foreground">Your AI Doctor</p>
              <p className="text-xs text-muted-foreground max-w-[280px]">
                Ask me anything about your health. I'll analyze your biomarkers and give you specific protocols.
              </p>
            </div>

            {/* Smart contextual actions — integrated in chat */}
            <div className="w-full max-w-sm space-y-2">
              {isHighRisk && (
                <button
                  onClick={handleBookSpecialist}
                  className="w-full flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl hover:bg-red-500/15 transition-colors text-left"
                >
                  <Calendar className="w-5 h-5 text-red-400 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-400">Ask about a specialist</p>
                    <p className="text-[11px] text-muted-foreground">{diagnosis.severity} risk — let me find you the right doctor</p>
                  </div>
                </button>
              )}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full flex items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-2xl hover:bg-primary/10 transition-colors text-left"
              >
                <Upload className="w-5 h-5 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Upload lab results</p>
                  <p className="text-[11px] text-muted-foreground">PDF or photo — I'll extract and analyze everything</p>
                </div>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
              {quickPrompts.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  className="text-left text-xs px-3 py-2.5 rounded-xl bg-card border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => {
          if (msg.role === "action" && msg.actionType === "care") return <div key={msg.id}>{renderCareCard(msg)}</div>;
          if (msg.role === "action") return <div key={msg.id}>{renderUploadAction(msg)}</div>;

          // For assistant messages, parse severity inline so we can render
          // a compact, color-coded badge above the structured response.
          const severity = msg.role === "assistant" ? parseSeverity(msg.content) : null;
          const cleanContent = msg.role === "assistant" ? stripTags(msg.content) : msg.content;
          const sevMeta = severity ? SEVERITY_META[severity] : null;
          const SevIcon = sevMeta?.icon;

          return (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""} animate-fade-in`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] ${msg.role === "user" ? "" : "w-full"}`}>
                {sevMeta && SevIcon && (
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full ${sevMeta.bg} border ${sevMeta.border} mb-1.5`}>
                    <SevIcon className={`w-3 h-3 ${sevMeta.text}`} />
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${sevMeta.text}`}>
                      {sevMeta.label}
                    </span>
                    <span className="text-[10px] text-muted-foreground">· {sevMeta.tagline}</span>
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === "user" ? "bg-primary text-primary-foreground inline-block" : "bg-card border border-border/50"
                }`}>
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-foreground [&_h2]:text-sm [&_h2]:font-bold [&_h2]:mb-1.5 [&_h2]:mt-3 [&_h2]:text-foreground [&_h2:first-child]:mt-0 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_table]:w-full [&_table]:text-[11px] [&_th]:bg-secondary/50 [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-semibold [&_th]:border-b [&_th]:border-border/50 [&_td]:px-2 [&_td]:py-1.5 [&_td]:border-t [&_td]:border-border/30 [&_code]:bg-secondary/50 [&_code]:px-1 [&_code]:rounded [&_table]:border [&_table]:border-border/30 [&_table]:rounded-lg [&_table]:overflow-hidden">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleanContent || "..."}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="text-[13px] leading-relaxed">{cleanContent}</p>
                  )}
                </div>
              </div>
              {msg.role === "user" && (
                <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
                  <User className="w-4 h-4 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}

        {isStreaming && messages[messages.length - 1]?.content === "" && (
          <div className="flex gap-2.5 animate-fade-in">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <Bot className="w-4 h-4 text-primary" />
            </div>
            <div className="bg-card border border-border/50 rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Voice overlay */}
      {isHolding && (
        <div className="absolute inset-0 bg-background/90 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-fade-in">
          <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
            <Mic className="w-10 h-10 text-primary" />
          </div>
          <p className="text-foreground font-semibold mt-4">Listening...</p>
          <p className="text-xs text-muted-foreground mt-1">Release to send</p>
        </div>
      )}

      {/* Input bar with integrated upload */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-card border border-border/50 rounded-2xl px-3 py-2">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isUploading}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors shrink-0"
            title="Upload lab report"
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
          </button>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage(input)}
            placeholder="Ask your AI Doctor..."
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            disabled={isStreaming}
          />
          <button
            onTouchStart={handleHoldStart}
            onTouchEnd={handleHoldEnd}
            onMouseDown={handleHoldStart}
            onMouseUp={handleHoldEnd}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
          >
            <Mic className="w-4 h-4" />
          </button>
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || isStreaming}
            className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center disabled:opacity-30 transition-opacity shrink-0"
          >
            <Send className="w-4 h-4 text-primary-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}
