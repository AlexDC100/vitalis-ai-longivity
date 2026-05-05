import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Send, Sparkles, Check, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "@/lib/health-context";
import type { HealthProfile } from "@/lib/types";
import { toast } from "@/hooks/use-toast";

type Section = "basics" | "cardio" | "lipids" | "metabolic" | "lifestyle";

type Msg = { role: "user" | "assistant"; content: string };

const SECTIONS: { id: Section; title: string; subtitle: string; opener: string }[] = [
  {
    id: "basics",
    title: "About you",
    subtitle: "Identity & body composition",
    opener:
      "Hi — I'm Longevity AI. I'll guide you through a quick longevity intake. To start, what's your name?",
  },
  {
    id: "cardio",
    title: "Heart & cardio",
    subtitle: "Blood pressure, HR, HRV, VO₂ max",
    opener: "Now your heart. Do you know your typical resting blood pressure?",
  },
  {
    id: "lipids",
    title: "Lipids & inflammation",
    subtitle: "Cholesterol panel, ApoB, hs-CRP",
    opener: "Do you have a recent lipid panel? If so, let's start with total cholesterol.",
  },
  {
    id: "metabolic",
    title: "Metabolic & hormones",
    subtitle: "Glucose, HbA1c, thyroid, sex hormones",
    opener: "Next, metabolism. Do you have a fasting glucose value?",
  },
  {
    id: "lifestyle",
    title: "Sleep & recovery",
    subtitle: "Sleep duration, quality, lung function",
    opener: "Almost done. On a typical night, how many hours of sleep do you get?",
  },
];

export default function IntakeChatScreen({ onComplete }: { onComplete: () => void }) {
  const { updateField, userId } = useHealth();
  const [sectionIdx, setSectionIdx] = useState(0);
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: SECTIONS[0].opener },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const section = SECTIONS[sectionIdx];
  const isLast = sectionIdx === SECTIONS.length - 1;
  const progress = ((sectionIdx + 1) / SECTIONS.length) * 100;

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  // Ensure an in-progress session row exists for the current section
  const ensureSession = async (sectionId: Section, transcript: Msg[]) => {
    if (!userId) return null;
    if (sessionId) return sessionId;
    const { data, error } = await supabase
      .from("intake_sessions")
      .insert({
        user_id: userId,
        section: sectionId,
        status: "in_progress",
        transcript: transcript as unknown as never,
        extracted_fields: {},
      })
      .select("id")
      .single();
    if (error) {
      console.error("intake_sessions insert failed", error);
      return null;
    }
    setSessionId(data.id);
    return data.id as string;
  };

  const finalizeSection = async (
    sectionId: Section,
    transcript: Msg[],
    extracted: Record<string, unknown>,
  ) => {
    if (!userId) return;
    // Persist the milestone — full transcript + extracted snapshot for this section.
    let id = sessionId;
    if (!id) id = await ensureSession(sectionId, transcript);
    if (!id) return;
    const { error } = await supabase
      .from("intake_sessions")
      .update({
        status: "completed",
        transcript: transcript as unknown as never,
        extracted_fields: JSON.parse(JSON.stringify(extracted)) as never,
        completed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) console.error("intake_sessions update failed", error);
  };

  const advanceSection = async () => {
    if (isLast) {
      onComplete();
      return;
    }
    setTransitioning(true);
    const next = SECTIONS[sectionIdx + 1];
    setTimeout(() => {
      setSessionId(null);
      setSectionIdx((i) => i + 1);
      setMessages([{ role: "assistant", content: next.opener }]);
      setTransitioning(false);
    }, 450);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");

    const userMsg: Msg = { role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setSending(true);

    // Open a session row on first user message of the section
    await ensureSession(section.id, nextMessages);

    try {
      const { data, error } = await supabase.functions.invoke("intake-chat", {
        body: { messages: nextMessages, section: section.id },
      });

      if (error) throw error;
      if (!data) throw new Error("Empty response");
      if ((data as any).error) throw new Error((data as any).error);

      const { extracted, reply, section_complete } = data as {
        extracted: Record<string, unknown>;
        reply: string;
        section_complete: boolean;
      };

      // Apply structured fields → auto-syncs to health_profiles via context
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(extracted || {})) {
        if (v === null || v === undefined || v === "") continue;
        cleaned[k] = v;
        updateField(k as keyof HealthProfile, v as never);
      }

      const assistantMsg: Msg = {
        role: "assistant",
        content: reply || "Got it.",
      };
      const finalMessages = [...nextMessages, assistantMsg];
      setMessages(finalMessages);

      if (section_complete) {
        await finalizeSection(section.id, finalMessages, cleaned);
        await advanceSection();
      }
    } catch (e: any) {
      const msg = e?.message || "Something went wrong";
      toast({
        title:
          msg.includes("Rate") ? "Slow down a moment" :
          msg.includes("Payment") ? "AI credits exhausted" :
          "Couldn't reach the AI",
        description: msg,
        variant: "destructive",
      });
      // Roll back the user message so they can retry
      setMessages(messages);
      setInput(text);
    } finally {
      setSending(false);
    }
  };

  const skipSection = async () => {
    if (sending) return;
    await finalizeSection(section.id, messages, {});
    await advanceSection();
  };

  const sectionList = useMemo(
    () =>
      SECTIONS.map((s, i) => ({
        ...s,
        state: i < sectionIdx ? "done" : i === sectionIdx ? "active" : "todo",
      })),
    [sectionIdx],
  );

  return (
    <div className="min-h-screen bg-background flex flex-col max-w-lg mx-auto">
      {/* Header */}
      <div className="px-6 pt-8 pb-4 border-b border-border/30">
        <div className="flex items-center gap-2 mb-5">
          <Logo size={20} />
          <span className="ml-auto text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Step {sectionIdx + 1} / {SECTIONS.length}
          </span>
        </div>

        <div className="h-1 bg-border/40 rounded-full overflow-hidden mb-5">
          <div
            className="h-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/5 flex items-center justify-center shrink-0">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground leading-tight">{section.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{section.subtitle}</p>
          </div>
        </div>
      </div>

      {/* Section pills */}
      <div className="px-6 py-3 flex gap-1.5 overflow-x-auto no-scrollbar">
        {sectionList.map((s) => (
          <span
            key={s.id}
            className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-medium ${
              s.state === "done"
                ? "bg-primary/15 text-primary"
                : s.state === "active"
                ? "bg-foreground/90 text-background"
                : "bg-secondary/50 text-muted-foreground"
            }`}
          >
            {s.state === "done" && <Check className="w-3 h-3" />}
            {s.title}
          </span>
        ))}
      </div>

      {/* Chat */}
      <div
        ref={scrollRef}
        className={`flex-1 overflow-y-auto px-4 pb-4 space-y-3 transition-opacity duration-300 ${
          transitioning ? "opacity-0" : "opacity-100"
        }`}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex ${m.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-[14px] leading-relaxed ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "bg-secondary/60 text-foreground rounded-bl-md"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-secondary/60 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-pulse" />
              <span
                className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-pulse"
                style={{ animationDelay: "120ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-muted-foreground/70 animate-pulse"
                style={{ animationDelay: "240ms" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="px-4 pb-6 pt-2 border-t border-border/30 bg-background/95 backdrop-blur">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your answer…"
            disabled={sending || transitioning}
            className="flex-1 h-12 px-4 rounded-2xl bg-secondary/60 text-foreground text-[14px] outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/60 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!input.trim() || sending || transitioning}
            aria-label="Send"
            className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <div className="flex items-center justify-between mt-2 px-1">
          <button
            onClick={skipSection}
            disabled={sending || transitioning}
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Skip this section
          </button>
          {isLast ? (
            <button
              onClick={() => {
                void finalizeSection(section.id, messages, {}).then(onComplete);
              }}
              disabled={sending || transitioning}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:opacity-80 disabled:opacity-50"
            >
              Finish
              <ChevronRight className="w-3 h-3" />
            </button>
          ) : (
            <span className="text-[10px] text-muted-foreground">
              Saved as you go · {SECTIONS.length - sectionIdx - 1} sections left
            </span>
          )}
        </div>
      </div>
    </div>
  );
}