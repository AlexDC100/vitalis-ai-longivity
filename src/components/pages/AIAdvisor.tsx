import { useState, useRef, useEffect } from "react";
import { useHealth } from "@/lib/health-context";
import { ChatMessage } from "@/lib/types";
import { Send, Camera, Globe, Stethoscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

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
  const { profile, longevityScore, biologicalAge, chronologicalAge } = useHealth();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "assistant",
      content: `I'm your personal Longevity AI — combining the expertise of preventive medicine physicians, cardiologists, and metabolic specialists. I have your complete health blueprint open.\n\n**Your current status:**\n- Longevity Score: **${longevityScore}/100**\n- Biological Age: **${biologicalAge}** (vs ${chronologicalAge} chronological)\n- Top risk: **Cardiovascular** (46/100)\n\nEvery answer is grounded in your biomarkers and history — not generic advice. You can also **send me a photo** of a skin concern, wound, or visible health issue for an initial AI assessment.\n\nWhat would you like to explore?`,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

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

      const resp = await supabase.functions.invoke("chat", {
        body: { messages: allMessages, systemPrompt },
      });

      if (resp.error) throw resp.error;

      // Handle streaming response
      if (resp.data && typeof resp.data === "string") {
        // Parse SSE
        const lines = resp.data.split("\n");
        let fullContent = "";
        for (const line of lines) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const parsed = JSON.parse(line.slice(6));
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) fullContent += delta;
          } catch {}
        }
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: fullContent || "I apologize, I couldn't process that request. Please try again.", timestamp: new Date() }]);
      } else if (resp.data?.content) {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: resp.data.content, timestamp: new Date() }]);
      } else if (resp.data?.choices) {
        const content = resp.data.choices[0]?.message?.content || "No response";
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content, timestamp: new Date() }]);
      } else {
        setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: "I'll analyze that based on your health profile. Please ensure the AI edge function is configured with your OpenAI API key.", timestamp: new Date() }]);
      }
    } catch (err) {
      console.error("AI error:", err);
      setMessages((prev) => [...prev, { id: Date.now().toString(), role: "assistant", content: "Connection error. Please ensure the chat edge function is deployed and your OpenAI API key is configured.", timestamp: new Date() }]);
    } finally {
      setIsLoading(false);
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
          <p className="text-xs text-muted-foreground">AI + 6 Board-Certified Specialists</p>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="vitalis-outline" size="sm" className="text-xs">
            <Stethoscope className="w-3.5 h-3.5 mr-1" /> Book Doctor
          </Button>
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
          placeholder="Ask about your health, risks, or send a photo for analysis..."
          className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none px-2"
        />
        <button className="p-2 text-muted-foreground hover:text-foreground"><Camera className="w-5 h-5" /></button>
        <button onClick={() => sendMessage(input)} disabled={isLoading} className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/80 disabled:opacity-50">
          <Send className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-1">AI analysis is not a substitute for professional medical advice</p>
    </div>
  );
}
