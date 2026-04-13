import { useState, useRef, useCallback, useEffect } from "react";
import { useHealth } from "@/lib/health-context";
import { runDiagnosis, SubstanceEntry } from "@/lib/diagnosis-engine";
import { supabase } from "@/integrations/supabase/client";
import { Send, Mic, Bot, User, Stethoscope, Upload, Loader2 } from "lucide-react";
import { extractTextFromFile } from "@/lib/pdf-utils";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

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

  const [substances, setSubstances] = useState<SubstanceEntry[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem("vitalis_substances");
    if (saved) try { setSubstances(JSON.parse(saved)); } catch {}
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const diagnoses = runDiagnosis(profile, substances);

  const substanceList = substances.length > 0
    ? substances.map(s => `${s.name} (${s.category}${s.dose ? `, ${s.dose}` : ""})`).join(", ")
    : "None reported";

  const diagnosisSummary = diagnoses.length > 0
    ? diagnoses.map(d => `- ${d.title} (${d.severity}, score ${d.riskScore}): ${d.explanation}`).join("\n")
    : "No significant issues detected.";

  const systemPrompt = `You are Vitalis AI Doctor — an elite longevity medicine physician combining the expertise of Dr. Peter Attia, Dr. Andrew Huberman, and Dr. David Sinclair.

PERSONALITY & STYLE:
- Speak like a direct, no-BS longevity physician having a 1-on-1 consultation
- Be conversational but clinically precise — like ChatGPT for health
- Use the patient's actual numbers in every response
- When comparing values, use markdown tables for clarity
- Proactively identify patterns across biomarkers
- Give specific protocols with dosages, timelines, and expected outcomes

PATIENT DATA:
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

CURRENT DIAGNOSES:
${diagnosisSummary}

RESPONSE FORMAT RULES:
- Use **markdown tables** when comparing biomarkers (columns: Biomarker | Your Value | Optimal Range | Status | Action)
- Use **headers** (##) to organize multi-topic responses
- Use **bold** for critical findings and key numbers
- Give numbered action steps with specific protocols
- When asked about medications/supplements: include dosage, timing, expected effect, and monitoring plan
- When interpreting results: explain what each value means clinically, its longevity implications, and the interaction with other markers
- Always end substantive responses with a "Priority Actions" section
- If the patient uploads lab results, create a comprehensive analysis table and interpretation

CLINICAL APPROACH:
- Cross-reference biomarkers — don't analyze in isolation (e.g., insulin + glucose + HbA1c together tell the metabolic story)
- Flag drug-biomarker interactions when substances are present
- Reference landmark trials and studies when making recommendations (SPRINT, REDUCE-IT, etc.)
- Give specific supplement brands/formulations when relevant
- Be aggressive about optimization — this patient wants to live to 120+ in peak condition`;

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;
    const userMsg: ChatMsg = { id: Date.now().toString(), role: "user", content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
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
    } catch (err: any) {
      const errorMsg = err?.message || "Connection failed";
      if (errorMsg.includes("Rate limit")) {
        toast({ title: "Rate limited", description: "Please wait a moment and try again.", variant: "destructive" });
      }
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.id === assistantId && !last.content) {
          return prev.map(m => m.id === assistantId ? { ...m, content: `⚠️ ${errorMsg}. Please try again.` } : m);
        }
        return [...prev, { id: assistantId, role: "assistant", content: `⚠️ ${errorMsg}` }];
      });
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, systemPrompt]);

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setIsUploading(true);

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

        // Build a summary for the chat
        const extractedCount = result?.biomarkers ? Object.keys(result.biomarkers).filter(k => result.biomarkers[k] > 0).length : 0;
        const summaryText = `I just uploaded "${file.name}". ${extractedCount} biomarkers were extracted and my profile has been updated. Please analyze the new results and tell me what changed, what's concerning, and what I should do next. Create a comparison table of my key biomarkers vs optimal ranges.`;
        
        await sendMessage(summaryText);
        toast({ title: "Lab report analyzed", description: `${extractedCount} biomarkers extracted and profile updated.` });
      }
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    } finally {
      setIsUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [userId, updateField, toast, sendMessage]);

  const handleHoldStart = () => {
    holdTimer.current = setTimeout(() => {
      setIsHolding(true);
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return;
      const rec = new SR();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";
      let transcript = "";
      rec.onresult = (e: SpeechRecognitionEvent) => {
        transcript = Array.from(e.results).map(r => r[0].transcript).join("");
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

  const quickPrompts = [
    "What's my #1 health risk right now?",
    "Compare all my biomarkers vs optimal",
    "Give me a 30-day protocol",
    "Interpret my full blood panel",
    "What labs should I retest and when?",
    "Analyze drug interactions with my stack",
  ];

  return (
    <div className="flex flex-col h-full pb-20 -mx-4 -mt-3">
      <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.png,.jpeg" />

      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">AI Doctor</h1>
            <p className="text-[11px] text-muted-foreground">Clinical-grade health intelligence</p>
          </div>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={isUploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
        >
          {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {isUploading ? "Analyzing..." : "Upload labs"}
        </button>
      </div>

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
                I see all your biomarkers, substances, and diagnoses. Ask me anything — I'll give you clinical-grade answers with specific protocols.
              </p>
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

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : ""} animate-fade-in`}>
            {msg.role === "assistant" && (
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                <Bot className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
              msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border border-border/50"
            }`}>
              {msg.role === "assistant" ? (
                <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_ol]:mb-2 [&_li]:mb-0.5 [&_strong]:text-foreground [&_h2]:text-base [&_h2]:font-bold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1 [&_table]:w-full [&_table]:text-[11px] [&_th]:bg-secondary/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:px-2 [&_td]:py-1 [&_td]:border-t [&_td]:border-border/30 [&_code]:bg-secondary/50 [&_code]:px-1 [&_code]:rounded">
                  <ReactMarkdown>{msg.content || "..."}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-[13px] leading-relaxed">{msg.content}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-7 h-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-1">
                <User className="w-4 h-4 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

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

      {/* Input */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-card border border-border/50 rounded-2xl px-3 py-2">
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
            className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-30 transition-all shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
