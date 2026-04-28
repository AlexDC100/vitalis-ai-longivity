import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useHealth } from "@/lib/health-context";
import { runDiagnosis } from "@/lib/diagnosis-engine";
import { supabase } from "@/integrations/supabase/client";
import { useSubstances } from "@/lib/use-substances";
import {
  Send, Upload, Loader2, FileText, Stethoscope, AlertTriangle, ShieldCheck,
  Activity, Siren, RefreshCw, CheckCircle2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BookingSheet from "@/components/BookingSheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * AI Doctor — focused, single-action experience.
 *
 * Screen states (only one is visible at a time):
 *   IDLE      → centered hero + "Upload your health report" drop area.
 *   ANALYZING → calm progress state.
 *   RESULT    → main issue + 2–3 actions (+ specialist card if HIGH/URGENT).
 *
 * Chat input lives at the very bottom as a minimal field — used for
 * follow-up questions only. No suggestion chips, no clutter.
 */

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

type Severity = "LOW" | "MODERATE" | "HIGH" | "URGENT";
type ScreenState = "idle" | "analyzing" | "result";

const SEVERITY_META: Record<Severity, {
  label: string; tone: string; bg: string; border: string; Icon: React.ElementType; serious: boolean;
}> = {
  LOW:      { label: "Low",      tone: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", Icon: ShieldCheck,    serious: false },
  MODERATE: { label: "Moderate", tone: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/25",   Icon: Activity,       serious: false },
  HIGH:     { label: "High",     tone: "text-orange-400",  bg: "bg-orange-500/10",  border: "border-orange-500/25",  Icon: AlertTriangle,  serious: true  },
  URGENT:   { label: "Urgent",   tone: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/25",     Icon: Siren,          serious: true  },
};

function parseSeverity(content: string): Severity | null {
  const m = content.match(/\[\[SEVERITY:(LOW|MODERATE|HIGH|URGENT)\]\]/i);
  if (m) return m[1].toUpperCase() as Severity;
  const m2 = content.match(/severity[^\n]*?(URGENT|HIGH|MODERATE|LOW)/i);
  return m2 ? (m2[1].toUpperCase() as Severity) : null;
}
function parseSpecialty(content: string): string | null {
  const m = content.match(/\[\[SPECIALTY:([^\]]+)\]\]/i);
  return m ? m[1].trim() : null;
}
function stripTags(content: string): string {
  return content
    .replace(/\[\[SEVERITY:(LOW|MODERATE|HIGH|URGENT)\]\]/gi, "")
    .replace(/\[\[SPECIALTY:[^\]]+\]\]/gi, "")
    .trim();
}

/** Extract the first 1–3 actions from the model's "## 4. Recommended Actions" section. */
function extractActions(md: string): string[] {
  const sec = md.split(/##\s*4\.\s*Recommended Actions/i)[1];
  if (!sec) return [];
  const next = sec.split(/##\s/)[0];
  const lines = next.split("\n").map(l => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const l of lines) {
    const m = l.match(/^(?:\d+\.|[-*])\s+(.*)$/);
    if (m) items.push(m[1].replace(/\*\*/g, "").trim());
    if (items.length >= 3) break;
  }
  return items;
}

/** Extract the "## 1. Summary" paragraph for the headline + explanation. */
function extractSummary(md: string): { title: string; explanation: string } {
  const sec = md.split(/##\s*1\.\s*Summary/i)[1];
  if (!sec) return { title: "Analysis complete", explanation: stripTags(md).slice(0, 240) };
  const text = sec.split(/##\s/)[0].trim();
  const sentences = text.replace(/\n+/g, " ").split(/(?<=[.!?])\s+/);
  return {
    title: sentences[0]?.replace(/\*\*/g, "").trim() || "Analysis complete",
    explanation: sentences.slice(1).join(" ").replace(/\*\*/g, "").trim(),
  };
}

interface ChatMsg { id: string; role: "user" | "assistant"; content: string; }

export default function AIDoctorScreen() {
  const { profile, updateField, longevityScore, biologicalAge, chronologicalAge, userId } = useHealth();
  const { toast } = useToast();
  const { substances } = useSubstances();

  const [screen, setScreen] = useState<ScreenState>("idle");
  const [analyzingLabel, setAnalyzingLabel] = useState("Analyzing your report");
  const [latestResult, setLatestResult] = useState<string>("");        // last full assistant message
  const [chat, setChat] = useState<ChatMsg[]>([]);                     // follow-up Q&A only
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [bookingSheet, setBookingSheet] = useState<{ open: boolean; specialty: string; severity: Severity }>({
    open: false, specialty: "", severity: "MODERATE",
  });
  // Drag state — counter-based so nested children don't flicker the highlight.
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  // Confirmation dialog for tapping a recommended action.
  const [actionConfirm, setActionConfirm] = useState<{ index: number; text: string } | null>(null);
  // Track a snapshot of biomarkers extracted from the most recent upload,
  // used to contextualize follow-up chat questions.
  const [extractedBiomarkers, setExtractedBiomarkers] = useState<Record<string, number>>({});

  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const followUpEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stageRef = useRef<HTMLElement>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => {
    followUpEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat]);

  /**
   * Runtime invariant: the AI Doctor screen must show exactly ONE primary
   * action at a time. Every primary CTA in the JSX is tagged with
   * `data-primary-action`. After every render we count them; in dev we
   * throw, in prod we log and hide the extras to prevent confusion.
   */
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    const primaries = root.querySelectorAll<HTMLElement>("[data-primary-action]");
    if (primaries.length > 1) {
      // eslint-disable-next-line no-console
      console.error(
        `[AIDoctor.invariant] Expected at most 1 primary action on screen "${screen}", found ${primaries.length}. Hiding extras.`,
        Array.from(primaries).map(el => el.getAttribute("aria-label") || el.textContent?.trim() || el.tagName),
      );
      // Defensive: hide everything past the first to keep the UI calm.
      primaries.forEach((el, i) => { if (i > 0) el.style.display = "none"; });
      if (import.meta.env.DEV) {
        // Surface loudly during development so the offending render is fixed.
        throw new Error(`[AIDoctor.invariant] Multiple primary actions on "${screen}"`);
      }
    }
  }, [screen, latestResult, chat.length]);

  // ─── System prompt (preserves the structured response contract) ───
  const diagnosis = useMemo(() => runDiagnosis(profile, substances), [profile, substances]);
  const substanceList = substances.length > 0
    ? substances.map(s => `${s.name} (${s.category}${s.dose ? `, ${s.dose}` : ""})`).join(", ")
    : "None reported";

  const systemPrompt = `You are Vitalis AI Doctor — a longevity medicine assistant. You are NOT a substitute for a licensed physician and must never give a definitive diagnosis. Be clear, decisive, and actionable.

EVERY substantive answer MUST follow this exact structure with these exact ## headers:

## 1. Summary
1–3 sentences in plain language.

## 2. Severity Level
Pick exactly ONE: **LOW**, **MODERATE**, **HIGH**, **URGENT**.

## 3. Key Findings
Max 3 bullet points referencing the patient's actual numbers.

## 4. Recommended Actions
Numbered list of 2–3 concrete next steps.

## 5. Care Recommendation
For LOW/MODERATE: "No specialist visit required at this time."
For HIGH/URGENT: name the doctor TYPE and the timeline. Do not name specific clinics.

At the end, on its own line, append:
[[SEVERITY:LOW|MODERATE|HIGH|URGENT]]
[[SPECIALTY:<doctor type or "none">]]

PATIENT DATA — Age ${chronologicalAge} | Bio age ${biologicalAge} | Sex ${profile.sex || "Unknown"}
BP ${profile.bp_systolic}/${profile.bp_diastolic} | HR ${profile.resting_hr} | HRV ${profile.hrv_ms} | VO2 ${profile.vo2_max}
LDL ${profile.ldl} | HDL ${profile.hdl} | ApoB ${profile.apob} | Lp(a) ${profile.lpa}
Glucose ${profile.fasting_glucose} | HbA1c ${profile.hba1c} | hs-CRP ${profile.hscrp}
Sleep ${profile.avg_sleep_hours}h | Substances: ${substanceList}
Internal diagnosis: ${diagnosis.title} (${diagnosis.severity}, risk ${diagnosis.riskScore}/100)`;

  // ─── Streaming chat call ──────────────────────────────────────────
  const streamChat = useCallback(async (
    history: { role: "user" | "assistant"; content: string }[],
    onToken: (full: string) => void,
  ): Promise<string> => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token;
    if (!accessToken) throw new Error("Not signed in. Please refresh and sign in again.");

    const resp = await fetch(CHAT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
      body: JSON.stringify({ messages: history, systemPrompt }),
      signal: ac.signal,
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
          if (c) { full += c; onToken(full); }
        } catch { /* partial */ }
      }
    }
    return full;
  }, [systemPrompt, toast]);

  // ─── Upload + analyze flow ────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (!userId) {
      toast({ title: "Sign in first", description: "Please sign in to analyze a report.", variant: "destructive" });
      return;
    }
    setScreen("analyzing");
    setAnalyzingLabel(`Reading ${file.name}`);
    try {
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      await supabase.storage.from("medical-documents").upload(filePath, file);
      const { data: doc } = await supabase.from("medical_documents").insert({
        user_id: userId, file_name: file.name, file_path: filePath, status: "processing",
      }).select().single();
      if (!doc) throw new Error("Could not save document");

      setAnalyzingLabel("Extracting biomarkers");
      const { data: result } = await supabase.functions.invoke("parse-document", {
        body: { documentId: doc.id, filePath },
      });
      if (result?.biomarkers) {
        Object.entries(result.biomarkers).forEach(([key, val]) => {
          if (val && typeof val === "number" && val > 0) updateField(key as any, val);
        });
        // Snapshot the biomarkers so follow-up chat questions can be
        // contextualized without re-reading the document.
        const snap: Record<string, number> = {};
        Object.entries(result.biomarkers).forEach(([k, v]) => {
          if (typeof v === "number" && v > 0) snap[k] = v as number;
        });
        setExtractedBiomarkers(snap);
      }
      const extractedCount = result?.biomarkers
        ? Object.keys(result.biomarkers).filter(k => result.biomarkers[k] > 0).length
        : 0;

      setAnalyzingLabel("Asking Vitalis AI Doctor");
      const userText = `I just uploaded "${file.name}". ${extractedCount} biomarkers were extracted. Analyze the new results — what changed, what's concerning, and what I should do next.`;
      let full = "";
      full = await streamChat([{ role: "user", content: userText }], (partial) => {
        setLatestResult(partial);
      });
      setLatestResult(full);
      setScreen("result");
      toast({ title: "Report analyzed", description: `${extractedCount} biomarkers extracted.` });
    } catch (err: any) {
      toast({ title: "Analysis failed", description: err?.message || "Please try again.", variant: "destructive" });
      setScreen("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [userId, updateField, streamChat, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  // ─── Follow-up question (chat at bottom) ──────────────────────────
  const sendFollowUp = useCallback(async () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    const assistantId = `a-${Date.now() + 1}`;
    setChat(prev => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    setIsStreaming(true);
    try {
      // Build a stable context primer so every follow-up automatically
      // references the patient's main issue + extracted biomarkers without
      // showing suggestion chips. The model already has the full patient
      // profile via `systemPrompt`; this primer pins the *current report*.
      const bioLines = Object.entries(extractedBiomarkers)
        .slice(0, 24)
        .map(([k, v]) => `${k}=${v}`)
        .join(", ");
      const currentSummary = latestResult ? extractSummary(stripTags(latestResult)) : null;
      const mainIssueLine = currentSummary?.title ? `Main issue (from latest report): ${currentSummary.title}` : "";
      const primer = [mainIssueLine, bioLines && `Extracted biomarkers: ${bioLines}`]
        .filter(Boolean)
        .join("\n");
      const history = [
        ...(primer ? [{ role: "assistant" as const, content: `CONTEXT (do not repeat verbatim):\n${primer}` }] : []),
        ...(latestResult ? [{ role: "assistant" as const, content: latestResult }] : []),
        ...chat.map(m => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: text },
      ];
      await streamChat(history, (partial) => {
        setChat(prev => prev.map(m => m.id === assistantId ? { ...m, content: partial } : m));
      });
    } catch (err: any) {
      setChat(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: `⚠️ ${err?.message || "Could not reach the AI Doctor."}` }
        : m));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, chat, latestResult, streamChat, extractedBiomarkers]);

  // ─── Derived from result ──────────────────────────────────────────
  const severity = latestResult ? parseSeverity(latestResult) : null;
  const specialty = latestResult ? (parseSpecialty(latestResult) || "General Practitioner") : null;
  const sevMeta = severity ? SEVERITY_META[severity] : null;
  const isSerious = !!sevMeta?.serious;
  const summary = useMemo(() => latestResult ? extractSummary(stripTags(latestResult)) : null, [latestResult]);
  const actions = useMemo(() => latestResult ? extractActions(stripTags(latestResult)) : [], [latestResult]);

  return (
    <div className="min-h-full flex flex-col safe-area-px safe-area-pt safe-area-pb">

      {/* ════════ HEADER ════════ */}
      <header className="text-center pt-2 pb-8 sm:pt-4 sm:pb-12">
        <h1 className="text-[28px] sm:text-4xl font-bold tracking-tight text-foreground">AI Doctor</h1>
        <p className="text-xs sm:text-sm text-muted-foreground mt-1.5">
          {screen === "idle"      && "Upload a report to get a clear next step."}
          {screen === "analyzing" && "Hang tight — your report is being read."}
          {screen === "result"    && "Here's what your latest report tells us."}
        </p>
      </header>

      {/* ════════ MAIN STAGE ════════ */}
      <main ref={stageRef} className="flex-1 flex flex-col items-center justify-start px-1">

        {/* ── IDLE: single primary action ── */}
        {screen === "idle" && (
          <div
            ref={dropRef}
            onDragEnter={(e) => {
              e.preventDefault();
              dragDepthRef.current += 1;
              setIsDragging(true);
            }}
            onDragOver={(e) => { e.preventDefault(); }}
            onDragLeave={() => {
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setIsDragging(false);
            }}
            onDrop={(e) => { dragDepthRef.current = 0; setIsDragging(false); onDrop(e); }}
            className={`w-full max-w-md mx-auto rounded-3xl border-2 border-dashed transition-all duration-200 p-10 sm:p-14 flex flex-col items-center text-center min-h-[280px] ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/60 hover:bg-card/40"
            }`}
            aria-label="Drop your health report here, or use the upload button below"
          >
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-colors ${
              isDragging ? "bg-primary/20" : "bg-primary/10"
            }`}>
              <Upload className={`w-7 h-7 transition-colors ${isDragging ? "text-primary" : "text-primary"}`} />
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-foreground">
              {isDragging ? "Drop to upload" : "Upload your health report"}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 max-w-[260px]">
              PDF, JPG, or PNG. We'll read it, extract your biomarkers, and tell you what matters most.
            </p>
            <button
              type="button"
              data-primary-action
              onClick={() => fileRef.current?.click()}
              className="mt-6 inline-flex items-center justify-center gap-2 min-h-[48px] min-w-[44px] px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:opacity-90 active:scale-95 transition-all"
              aria-label="Choose a health report to upload"
            >
              <Upload className="w-4 h-4" />
              Choose file
            </button>
            <p className="text-[10px] text-muted-foreground/70 mt-3">or drag and drop here</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
            />
          </div>
        )}

        {/* ── ANALYZING: calm progress ── */}
        {screen === "analyzing" && (
          <div className="flex flex-col items-center text-center pt-6 animate-fade-in">
            <div className="relative w-16 h-16 mb-5">
              <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
              <Loader2 className="w-16 h-16 text-primary animate-spin" />
            </div>
            <p className="text-base font-medium text-foreground">{analyzingLabel}</p>
            <p className="text-xs text-muted-foreground mt-1.5">This usually takes 10–20 seconds.</p>
          </div>
        )}

        {/* ── RESULT: main issue + 2–3 actions ── */}
        {screen === "result" && summary && (
          <div className="w-full max-w-md mx-auto space-y-5 animate-fade-in">

            {/* Severity pill */}
            {sevMeta && (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${sevMeta.bg} ${sevMeta.border} mx-auto`}>
                <sevMeta.Icon className={`w-3.5 h-3.5 ${sevMeta.tone}`} />
                <span className={`text-[11px] font-semibold uppercase tracking-wider ${sevMeta.tone}`}>
                  {sevMeta.label} severity
                </span>
              </div>
            )}

            {/* Main health issue */}
            <section className="text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight leading-snug">
                {summary.title}
              </h2>
              {summary.explanation && (
                <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">
                  {summary.explanation}
                </p>
              )}
            </section>

            {/* 2–3 actions */}
            {actions.length > 0 && (
              <section className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground text-center">
                  What to do next
                </p>
                {actions.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setActionConfirm({ index: i, text: a })}
                    className="w-full text-left flex items-start gap-3 bg-card border border-border hover:border-primary/40 rounded-2xl p-3.5 min-h-[60px] active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Action ${i + 1}: ${a}. Tap for details.`}
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0 text-xs font-bold">
                      {i + 1}
                    </div>
                    <p className="text-sm text-foreground leading-relaxed flex-1 pt-0.5">{a}</p>
                  </button>
                ))}
              </section>
            )}

            {/* Specialist card — ONLY when serious */}
            {isSerious && sevMeta && specialty && (
              <section className={`rounded-2xl border ${sevMeta.border} ${sevMeta.bg} p-4 space-y-3 text-center`}>
                <div className="flex items-center justify-center gap-2">
                  <Stethoscope className={`w-4 h-4 ${sevMeta.tone}`} />
                  <p className={`text-xs font-semibold ${sevMeta.tone}`}>
                    {severity === "URGENT" ? "Seek medical care now" : "We recommend a specialist"}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {severity === "URGENT"
                    ? "Your data suggests this needs immediate attention."
                    : <>Recommended: <span className="text-foreground font-medium">{specialty}</span></>}
                </p>
                {severity === "URGENT" ? (
                  <a
                    data-primary-action
                    href="tel:112"
                    className={`flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-3 ${sevMeta.bg} border ${sevMeta.border} rounded-xl ${sevMeta.tone} text-sm font-semibold`}
                  >
                    <Siren className="w-4 h-4" />
                    Call emergency services
                  </a>
                ) : (
                  <button
                    data-primary-action
                    type="button"
                    onClick={() => setBookingSheet({ open: true, specialty, severity: severity! })}
                    className="flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-3 bg-primary text-primary-foreground rounded-xl text-sm font-semibold active:scale-[0.98] transition-transform"
                  >
                    <Stethoscope className="w-4 h-4" />
                    Book consultation
                  </button>
                )}
              </section>
            )}

            {/* Quiet "start over" — single secondary action */}
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => { setLatestResult(""); setChat([]); setScreen("idle"); }}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 text-xs font-medium text-muted-foreground hover:text-foreground active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Upload another report
              </button>
            </div>

            {/* Follow-up Q&A — only renders once the user asks something */}
            {chat.length > 0 && (
              <section className="space-y-3 pt-4 border-t border-border/50">
                {chat.map(m => (
                  <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border border-border text-foreground"
                      }`}
                    >
                      {m.role === "assistant"
                        ? <div className="prose prose-sm prose-invert max-w-none [&_p]:my-1 [&_h2]:text-sm [&_h2]:font-semibold [&_h2]:mt-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripTags(m.content) || "…"}</ReactMarkdown>
                          </div>
                        : m.content}
                    </div>
                  </div>
                ))}
                <div ref={followUpEndRef} />
              </section>
            )}
          </div>
        )}
      </main>

      {/* ════════ CHAT INPUT (always at the bottom) ════════ */}
      <div className="sticky bottom-0 mt-6 pt-3 bg-gradient-to-t from-background via-background to-background/0">
        <form
          onSubmit={(e) => { e.preventDefault(); sendFollowUp(); }}
          className="flex items-center gap-2 max-w-md mx-auto bg-card border border-border rounded-full pl-4 pr-1.5 py-1.5 focus-within:border-primary/60 transition-colors"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={screen === "result" ? "Ask a follow-up question…" : "Ask the AI Doctor…"}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none min-h-[36px]"
            disabled={isStreaming || screen === "analyzing"}
            aria-label="Message AI Doctor"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming || screen === "analyzing"}
            className="w-10 h-10 min-h-[44px] min-w-[44px] -m-1.5 ml-0 rounded-full bg-primary flex items-center justify-center disabled:opacity-30 transition-opacity active:scale-95"
            aria-label="Send message"
          >
            {isStreaming
              ? <Loader2 className="w-4 h-4 text-primary-foreground animate-spin" />
              : <Send className="w-4 h-4 text-primary-foreground" />}
          </button>
        </form>
        <p className="text-[10px] text-center text-muted-foreground/70 mt-2">
          Vitalis AI Doctor is informational only — not a substitute for a licensed physician.
        </p>
      </div>

      <BookingSheet
        open={bookingSheet.open}
        onOpenChange={(open) => setBookingSheet(s => ({ ...s, open }))}
        specialty={bookingSheet.specialty}
        severity={bookingSheet.severity}
      />

      {/* ════════ Action confirmation dialog ════════
          Tapping a recommended action opens this calm modal explaining
          what will happen if they proceed (we ask the AI Doctor for a
          step-by-step plan tailored to that action). The screen state
          NEVER changes back to idle from here — we either stay on the
          result, or just open the chat with a contextual message. */}
      <AlertDialog
        open={!!actionConfirm}
        onOpenChange={(open) => { if (!open) setActionConfirm(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <AlertDialogTitle className="text-base">
                Action {actionConfirm ? actionConfirm.index + 1 : ""}
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-2 text-sm leading-relaxed text-foreground">
              {actionConfirm?.text}
            </AlertDialogDescription>
            <p className="pt-3 text-xs text-muted-foreground">
              We'll ask the AI Doctor for a step-by-step plan tailored to
              your numbers. You can keep reading the result while it answers.
            </p>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Not now</AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={() => {
                if (!actionConfirm) return;
                const text = `Help me actually do this: "${actionConfirm.text}". Give me a concrete 7-day plan with specific doses, timing, and what to track. Reference my actual numbers.`;
                setActionConfirm(null);
                setInput(text);
                // Defer one tick so the input value is in state before send.
                setTimeout(() => sendFollowUp(), 0);
              }}
            >
              Get my plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
