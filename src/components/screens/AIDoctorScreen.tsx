import { useState, useRef, useCallback, useEffect } from "react";
import { useHealth } from "@/lib/health-context";
import { runDiagnosis, SubstanceEntry } from "@/lib/diagnosis-engine";
import { Send, Mic, MicOff, Bot, User, Stethoscope } from "lucide-react";
import ReactMarkdown from "react-markdown";

interface ChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export default function AIDoctorScreen() {
  const { profile, longevityScore, biologicalAge, chronologicalAge } = useHealth();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  // Load substances
  const [substances, setSubstances] = useState<SubstanceEntry[]>([]);
  useEffect(() => {
    const saved = localStorage.getItem("vitalis_substances");
    if (saved) try { setSubstances(JSON.parse(saved)); } catch {}
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const diagnoses = runDiagnosis(profile, substances);
  const topDiagnosis = diagnoses[0];

  const substanceList = substances.length > 0
    ? substances.map(s => `${s.name} (${s.category}${s.dose ? `, ${s.dose}` : ""})`).join(", ")
    : "None reported";

  const diagnosisSummary = diagnoses.length > 0
    ? diagnoses.map(d => `- ${d.title} (${d.severity}, score ${d.riskScore}): ${d.explanation}`).join("\n")
    : "No significant issues detected.";

  const systemPrompt = `You are Vitalis AI Doctor — a clinical-grade health diagnostic AI. You speak like a direct, no-BS longevity physician. Be concise, specific, and actionable. Always reference the user's actual numbers.

PATIENT DATA:
- Age: ${chronologicalAge} | Biological Age: ${biologicalAge}
- BP: ${profile.bp_systolic}/${profile.bp_diastolic} | HR: ${profile.resting_hr} | HRV: ${profile.hrv_ms} | VO2: ${profile.vo2_max}
- LDL: ${profile.ldl} | HDL: ${profile.hdl} | ApoB: ${profile.apob} | TG: ${profile.triglycerides} | Lp(a): ${profile.lpa}
- Glucose: ${profile.fasting_glucose} | HbA1c: ${profile.hba1c} | Insulin: ${profile.fasting_insulin}
- hs-CRP: ${profile.hscrp} | Homocysteine: ${profile.homocysteine}
- Testosterone: ${profile.testosterone} | Cortisol: ${profile.cortisol} | TSH: ${profile.tsh} | Vit D: ${profile.vitamin_d}
- Sleep: ${profile.avg_sleep_hours}h (quality ${profile.sleep_quality}/100) | Body fat: ${profile.body_fat_pct}%

SUBSTANCES: ${substanceList}

CURRENT DIAGNOSES:
${diagnosisSummary}

RULES:
- Answer the specific question asked
- Reference actual biomarker values
- Give clinical reasoning, not generic advice
- If substances interact with findings, flag it
- Use markdown. Keep responses focused.`;

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

      if (!resp.ok || !resp.body) throw new Error("Failed to connect");
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
    } catch {
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: "Connection failed. Please try again." }]);
    } finally {
      setIsStreaming(false);
    }
  }, [messages, isStreaming, systemPrompt]);

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
    "What's my #1 problem right now?",
    "Am I on the right medications?",
    "What labs should I retest?",
    "Give me a 30-day protocol",
  ];

  return (
    <div className="flex flex-col h-full pb-20 -mx-4 -mt-3">
      {/* Header */}
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Stethoscope className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-foreground">AI Doctor</h1>
            <p className="text-[11px] text-muted-foreground">Clinical-grade health intelligence</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center pt-10 space-y-5">
            <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
              <Stethoscope className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-lg font-semibold text-foreground">Ask your AI Doctor</p>
              <p className="text-xs text-muted-foreground max-w-[260px]">
                I see your biomarkers, substances, and diagnoses. Ask me anything about your health.
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
                <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed [&_p]:mb-2 [&_ul]:mb-2 [&_li]:mb-0.5 [&_strong]:text-foreground [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mb-1">
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
          <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center animate-pulse-glow">
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
