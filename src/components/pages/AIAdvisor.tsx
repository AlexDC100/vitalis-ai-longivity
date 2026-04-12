import { useState, useRef, useEffect } from "react";
import { useHealth } from "@/lib/health-context";
import { ChatMessage } from "@/lib/types";
import { Send, Camera, Globe, Stethoscope, Upload, FileText, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";
import { useToast } from "@/hooks/use-toast";
import { extractTextFromFile } from "@/lib/pdf-utils";

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

const quickPrompts = [
  "Analyze my longevity score",
  "Review my blood markers",
  "Optimize my sleep",
  "Cardiovascular risk",
  "Best supplements for me",
  "Improve my VO2 max",
  "Reduce inflammation",
  "Hormonal health",
];

export default function AIAdvisor() {
  const { profile, longevityScore, biologicalAge, chronologicalAge, userId, setProfile } = useHealth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: `I'm your personal Longevity AI — combining the expertise of preventive medicine physicians, cardiologists, and metabolic specialists. I have your complete health blueprint open.\n\n**Your current status:**\n- Longevity Score: **${longevityScore}/100**\n- Biological Age: **${biologicalAge}** (vs ${chronologicalAge} chronological)\n\nEvery answer is grounded in your biomarkers and history — not generic advice. You can also **upload a lab report** (PDF/text) and I'll extract your biomarkers automatically.\n\nWhat would you like to explore?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    const userMsg: ChatMessage = { id: Date.now().toString(), role: "user", content: text, timestamp: new Date() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    const systemPrompt = `You are Vitalis AI, a longevity medicine advisor. The user's health data: Longevity Score ${longevityScore}/100, Bio Age ${biologicalAge} vs chrono ${chronologicalAge}, HRV ${profile.hrv_ms}ms, VO2max ${profile.vo2_max}, BP ${profile.bp_systolic}/${profile.bp_diastolic}, Glucose ${profile.fasting_glucose}, HbA1c ${profile.hba1c}, LDL ${profile.ldl}, HDL ${profile.hdl}, hsCRP ${profile.hscrp}, Sleep ${profile.avg_sleep_hours}h quality ${profile.sleep_quality}/100. Provide personalized, evidence-based advice referencing their actual values. Be concise but thorough. Format with markdown.`;

    try {
      const allMessages = [
        ...messages.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ];

      const resp = await fetch(CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ messages: allMessages, systemPrompt }),
      });

      if (!resp.ok || !resp.body) throw new Error("Failed to start stream");

      // Stream SSE response
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = "";
      let assistantContent = "";
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf("\n")) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || line.trim() === "") continue;
          if (!line.startsWith("data: ")) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === "[DONE]") { streamDone = true; break; }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              assistantContent += content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last.id.startsWith("stream-")) {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantContent } : m);
                }
                return [...prev, { id: "stream-" + Date.now(), role: "assistant", content: assistantContent, timestamp: new Date() }];
              });
            }
          } catch {
            textBuffer = line + "\n" + textBuffer;
            break;
          }
        }
      }

      if (!assistantContent) {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: "I couldn't process that request. Please try again.", timestamp: new Date() }]);
      }
    } catch (err) {
      console.error("AI error:", err);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: "Connection error. Please try again.", timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) {
      if (!userId) toast({ title: "Sign in required", description: "Sign in to upload documents", variant: "destructive" });
      return;
    }

    setIsUploading(true);
    const uploadMsg: ChatMessage = { id: "upload-" + Date.now(), role: "user", content: `📄 Uploading: **${file.name}**`, timestamp: new Date() };
    setMessages(prev => [...prev, uploadMsg]);

    try {
      // Upload to storage
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      await supabase.storage.from("medical-documents").upload(filePath, file);

      // Create document record
      const { data: doc } = await supabase
        .from("medical_documents")
        .insert({ user_id: userId, file_name: file.name, file_path: filePath, status: "processing" })
        .select()
        .single();

      const fileContent = await extractTextFromFile(file);

      // Parse document
      const { data: parseResult, error } = await supabase.functions.invoke("parse-document", {
        body: { documentId: doc?.id, fileContent, fileName: file.name },
      });

      if (error) throw error;

      // Refresh profile
      const { data: updatedProfile } = await supabase.from("health_profiles").select("*").eq("user_id", userId).single();
      if (updatedProfile) setProfile(updatedProfile as any);

      const bioCount = Object.keys(parseResult?.biomarkers || {}).length;
      const recCount = parseResult?.recommendations?.length || 0;
      const medCount = parseResult?.medicine_stack?.length || 0;

      let summary = `✅ **Document processed: ${file.name}**\n\n`;
      summary += `**Extracted ${bioCount} biomarkers** and updated your health profile.\n\n`;

      if (recCount > 0) {
        summary += `**📋 ${recCount} Recommendations:**\n`;
        parseResult.recommendations.slice(0, 5).forEach((r: any) => {
          summary += `- **${r.title}** (${r.priority}): ${r.description}\n`;
        });
        summary += "\n";
      }

      if (medCount > 0) {
        summary += `**💊 ${medCount} Suggested Supplements:**\n`;
        parseResult.medicine_stack.slice(0, 5).forEach((m: any) => {
          summary += `- **${m.name}** ${m.dosage} ${m.frequency} — ${m.reason} (${m.evidence_level})\n`;
        });
      }

      summary += "\n*Check Medical Vault for full details. Ask me anything about these results!*";

      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: summary, timestamp: new Date() }]);
    } catch (err: any) {
      console.error("Upload error:", err);
      setMessages(prev => [...prev, { id: Date.now().toString(), role: "assistant", content: `❌ Failed to process document: ${err.message}`, timestamp: new Date() }]);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-2rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
          <Globe className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">Longevity Advisor</h1>
          <p className="text-xs text-muted-foreground">AI + Your Biomarkers · Upload docs for instant analysis</p>
        </div>
        <div className="ml-auto flex gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-secondary border border-border text-[11px] text-muted-foreground">
            <span className="text-primary">✦</span> Personalized to your biomarkers
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                <Globe className="w-4 h-4 text-primary" />
              </div>
            )}
            <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-primary/20 text-foreground border border-primary/20"
                : "bg-card border border-border text-foreground"
            }`}>
              <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed [&_strong]:text-primary [&_p]:mb-2 [&_ul]:mb-2 [&_li]:mb-1">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Globe className="w-4 h-4 text-primary animate-pulse" />
            </div>
            <div className="bg-card border border-border rounded-2xl px-4 py-3">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Quick prompts */}
      <div className="flex flex-wrap gap-2 py-3">
        {quickPrompts.map((p) => (
          <button
            key={p}
            onClick={() => sendMessage(p)}
            className="px-3 py-1.5 rounded-full border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 bg-card border border-border rounded-xl p-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage(input)}
          placeholder="Ask about your health, risks, or upload a report..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-2"
        />
        <input ref={fileInputRef} type="file" accept=".txt,.csv,.pdf,.json,.html,.xml" onChange={handleFileUpload} className="hidden" />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-2 text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
        </button>
        <button onClick={() => sendMessage(input)} disabled={isLoading} className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-1">AI analysis is not a substitute for professional medical advice</p>
    </div>
  );
}
