import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useHealth } from "@/lib/health-context";
import { runDiagnosis } from "@/lib/diagnosis-engine";
import { supabase } from "@/integrations/supabase/client";
import { useSubstances } from "@/lib/use-substances";
import {
  Send, Upload, Loader2, FileText, Stethoscope, AlertTriangle, ShieldCheck,
  Activity, Siren, RefreshCw, CheckCircle2, Download, ClipboardList,
  Check, MessageSquare, Hospital, ChevronDown, X, Clock, AlertCircle,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import BookingSheet from "@/components/BookingSheet";
import { downloadAIDoctorReport } from "@/lib/ai-doctor-report";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import AIDoctorTapAuditPanel from "@/components/AIDoctorTapAuditPanel";
import { downloadCaseSummary } from "@/lib/case-summary";

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

/** Extract bullet items from "## 3. Key Findings". */
function extractKeyFindings(md: string): string[] {
  const sec = md.split(/##\s*3\.\s*Key Findings/i)[1];
  if (!sec) return [];
  const next = sec.split(/##\s/)[0];
  const lines = next.split("\n").map(l => l.trim()).filter(Boolean);
  const items: string[] = [];
  for (const l of lines) {
    const m = l.match(/^(?:\d+\.|[-*])\s+(.*)$/);
    if (m) items.push(m[1].replace(/\*\*/g, "").trim());
    if (items.length >= 5) break;
  }
  return items;
}

interface ChatMsg { id: string; role: "user" | "assistant"; content: string; }

/** Session-storage keys to persist upload context across navigation. */
const SS_FILENAME = "vitalis.aidoctor.fileName";
const SS_BIOMARKERS = "vitalis.aidoctor.biomarkers";
const SS_RESULT = "vitalis.aidoctor.latestResult";
const SS_SCREEN = "vitalis.aidoctor.screen";

// ─── Triage / case-priority types ─────────────────────────────────
type Priority = "HIGH" | "MEDIUM" | "LOW";
interface TriageCase {
  id: string;
  file_name: string;
  document_type: string;
  main_finding: string;
  clinical_insight: string;
  priority: Priority;
  review_window: string;
  created_at: string;
  reviewed_at: string | null;
}
const SS_HOSPITAL_MODE = "vitalis.aidoctor.hospitalMode";
const LS_UPLOAD_CONSENT = "vitalis.aidoctor.uploadConsent.v1";
const LS_ACTIVE_CASE = "vitalis.aidoctor.activeCaseId";
/** Per-case chat storage key. Lets users switch between cases without losing
 *  the conversation they had with the AI Doctor for each case. */
const caseChatKey = (caseId: string) => `vitalis.aidoctor.chat.${caseId}`;
const PRIORITY_META: Record<Priority, { label: string; tone: string; bg: string; border: string; dot: string; window: string }> = {
  HIGH:   { label: "High",   tone: "text-red-400",     bg: "bg-red-500/10",     border: "border-red-500/25",     dot: "bg-red-400",     window: "Review within 24–48h" },
  MEDIUM: { label: "Medium", tone: "text-amber-400",   bg: "bg-amber-500/10",   border: "border-amber-500/25",   dot: "bg-amber-400",   window: "Routine review" },
  LOW:    { label: "Low",    tone: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", dot: "bg-emerald-400", window: "Stable" },
};

// ─── Multi-file upload queue (hospital mode) ──────────────────────
type QueueStatus = "queued" | "analyzing" | "completed" | "error";
interface QueueItem {
  id: string;
  file: File;
  status: QueueStatus;
  priority?: Priority;
  error?: string;
  caseId?: string;       // medical_documents.id once known
  mainFinding?: string;
}

export default function AIDoctorScreen() {
  const { profile, updateField, longevityScore, biologicalAge, chronologicalAge, userId } = useHealth();
  const { toast } = useToast();
  const { substances } = useSubstances();

  const [screen, setScreen] = useState<ScreenState>(() => {
    if (typeof window === "undefined") return "idle";
    const s = sessionStorage.getItem(SS_SCREEN) as ScreenState | null;
    return s === "result" ? "result" : "idle"; // never restore "analyzing"
  });
  const [analyzingLabel, setAnalyzingLabel] = useState("Analyzing your report");
  const [latestResult, setLatestResult] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(SS_RESULT) || "";
  });
  const [lastFileName, setLastFileName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(SS_FILENAME) || "";
  });
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
  const [extractedBiomarkers, setExtractedBiomarkers] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(sessionStorage.getItem(SS_BIOMARKERS) || "{}"); } catch { return {}; }
  });
  // Latest case priority + clinical insight from the parse-document call.
  const [latestCase, setLatestCase] = useState<{
    main_finding: string;
    clinical_insight: string;
    priority: Priority;
    review_window: string;
    document_type: string;
  } | null>(null);
  // Triage list — all of the user's processed documents, sorted by priority.
  // Only surfaced when the user has 2+ uploads (hospital backlog use case).
  const [triage, setTriage] = useState<TriageCase[]>([]);
  const [hospitalMode, setHospitalMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(SS_HOSPITAL_MODE) === "1";
  });
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(LS_ACTIVE_CASE); } catch { return null; }
  });
  // Multi-file upload queue (hospital mode). Visible inline above the triage list.
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SS_HOSPITAL_MODE, hospitalMode ? "1" : "0"); } catch { /* ignore */ }
  }, [hospitalMode]);

  // Persist activeCaseId so AI discussion resumes across reloads.
  useEffect(() => {
    try {
      if (activeCaseId) localStorage.setItem(LS_ACTIVE_CASE, activeCaseId);
      else localStorage.removeItem(LS_ACTIVE_CASE);
    } catch { /* ignore */ }
  }, [activeCaseId]);

  // Persist the chat associated with the active case so switching cases
  // (and reloads) preserve the conversation thread per-case.
  useEffect(() => {
    if (!activeCaseId) return;
    try {
      sessionStorage.setItem(caseChatKey(activeCaseId), JSON.stringify(chat));
    } catch { /* quota — ignore */ }
  }, [chat, activeCaseId]);

  /** Mark a triage case as reviewed (or undo). Optimistic + persisted. */
  const handleMarkReviewed = useCallback(async (caseId: string, undo = false) => {
    if (!userId) return;
    setReviewingId(caseId);
    const ts = undo ? null : new Date().toISOString();
    // Optimistic update
    setTriage(prev => prev.map(c => c.id === caseId ? { ...c, reviewed_at: ts } : c));
    const { error } = await supabase
      .from("medical_documents")
      .update({ reviewed_at: ts })
      .eq("id", caseId)
      .eq("user_id", userId);
    setReviewingId(null);
    if (error) {
      // Revert on failure.
      setTriage(prev => prev.map(c => c.id === caseId ? { ...c, reviewed_at: undo ? ts : null } : c));
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: undo ? "Marked as pending" : "Marked as reviewed",
      description: undo ? "Case returned to the queue." : "Case removed from the active queue.",
    });
  }, [userId, toast]);

  /** Continue the AI discussion using a triage case as context. */
  const handleDiscussCase = useCallback((c: TriageCase) => {
    // Save the current case's chat before switching so the user doesn't
    // lose their conversation. Each case keeps its own thread.
    if (activeCaseId && activeCaseId !== c.id) {
      try { sessionStorage.setItem(caseChatKey(activeCaseId), JSON.stringify(chat)); } catch { /* ignore */ }
    }
    setActiveCaseId(c.id);
    setLatestCase({
      main_finding: c.main_finding,
      clinical_insight: c.clinical_insight,
      priority: c.priority,
      review_window: c.review_window,
      document_type: c.document_type,
    });
    setLastFileName(c.file_name);
    // Try to restore an existing chat for this case; otherwise prime a fresh one.
    let saved: ChatMsg[] = [];
    try {
      const raw = sessionStorage.getItem(caseChatKey(c.id));
      if (raw) saved = JSON.parse(raw) as ChatMsg[];
    } catch { /* ignore */ }
    setChat(saved);
    setScreen("result");
    if (saved.length === 0) {
      const primer = `Continue the discussion about my "${c.document_type}" case (${c.file_name}). Main finding: ${c.main_finding || "n/a"}. Clinical insight: ${c.clinical_insight || "n/a"}. Priority: ${c.priority} — ${c.review_window}. Help me understand what to do next.`;
      setTimeout(() => sendFollowUpRef.current?.(primer), 50);
    }
  }, [activeCaseId, chat]);

  // Forward-ref pattern so handleDiscussCase (defined early) can call sendFollowUp (defined later).
  const sendFollowUpRef = useRef<((text: string) => void) | null>(null);

  // Load triage list whenever we land on result/idle (after an upload completes).
  const loadTriage = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("medical_documents")
      .select("id, file_name, document_type, extracted_data, created_at, status, reviewed_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error || !data) return;
    const cases: TriageCase[] = data
      .filter((d: any) => d.status === "reviewed" && d.extracted_data)
      .map((d: any) => {
        const ed = d.extracted_data || {};
        const cp = ed.case_priority || {};
        const lvl = (cp.level || ed.urgency || "LOW").toString().toUpperCase() as Priority;
        const safe: Priority = lvl === "HIGH" || lvl === "MEDIUM" ? lvl : "LOW";
        return {
          id: d.id,
          file_name: d.file_name,
          document_type: d.document_type || "General",
          main_finding: ed.main_finding || "",
          clinical_insight: ed.clinical_insight || "",
          priority: safe,
          review_window: cp.review_window || PRIORITY_META[safe].window,
          created_at: d.created_at,
          reviewed_at: d.reviewed_at || null,
        };
      });
    setTriage(cases);
  }, [userId]);

  useEffect(() => { void loadTriage(); }, [loadTriage]);

  // Rehydrate the active case after triage loads (page refresh / reopen).
  // We restore the case context (latestCase, lastFileName) and the per-case
  // chat so the AI discussion resumes exactly where the user left off.
  const didRehydrateRef = useRef(false);
  useEffect(() => {
    if (didRehydrateRef.current) return;
    if (!activeCaseId || triage.length === 0) return;
    const c = triage.find(t => t.id === activeCaseId);
    if (!c) return;
    didRehydrateRef.current = true;
    setLatestCase({
      main_finding: c.main_finding,
      clinical_insight: c.clinical_insight,
      priority: c.priority,
      review_window: c.review_window,
      document_type: c.document_type,
    });
    setLastFileName(c.file_name);
    try {
      const raw = sessionStorage.getItem(caseChatKey(c.id));
      if (raw) setChat(JSON.parse(raw) as ChatMsg[]);
    } catch { /* ignore */ }
  }, [activeCaseId, triage]);

  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const followUpEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stageRef = useRef<HTMLElement>(null);

  useEffect(() => () => { abortRef.current?.abort(); }, []);
  useEffect(() => {
    followUpEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chat]);

  // ─── Persist upload context across navigation ─────────────────────
  // Snapshot of file name + biomarkers + latest result is saved to
  // sessionStorage so the user can navigate away (Body, Diagnosis) and
  // come back without re-uploading. Cleared on "Upload another report".
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (latestResult) sessionStorage.setItem(SS_RESULT, latestResult);
      else sessionStorage.removeItem(SS_RESULT);
      sessionStorage.setItem(SS_BIOMARKERS, JSON.stringify(extractedBiomarkers));
      if (lastFileName) sessionStorage.setItem(SS_FILENAME, lastFileName);
      else sessionStorage.removeItem(SS_FILENAME);
      sessionStorage.setItem(SS_SCREEN, screen);
    } catch { /* quota / private mode — ignore */ }
  }, [latestResult, extractedBiomarkers, lastFileName, screen]);

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

  /**
   * Mobile-friendly tap-target audit. Scans every interactive control
   * inside the AI Doctor stage and logs any element whose rendered
   * bounding box is smaller than 44×44 CSS pixels — the iOS Human
   * Interface Guidelines minimum. Logs a CSS selector and the box so
   * each offender can be located quickly during QA.
   *
   * Re-runs on every screen-state / result / chat change because the
   * subtree changes shape between idle/analyzing/result.
   */
  useEffect(() => {
    const root = stageRef.current;
    if (!root) return;
    // Defer one frame so freshly-mounted nodes have layout.
    const raf = requestAnimationFrame(() => {
      const SELECTOR = 'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';
      const nodes = Array.from(root.querySelectorAll<HTMLElement>(SELECTOR));
      const offenders: { selector: string; w: number; h: number; box: DOMRect; el: HTMLElement }[] = [];
      for (const el of nodes) {
        // Skip hidden / off-screen controls — they aren't tappable.
        const cs = window.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
        const box = el.getBoundingClientRect();
        if (box.width === 0 && box.height === 0) continue;
        if (box.width < 44 || box.height < 44) {
          // Build a short, debuggable selector path.
          const id = el.id ? `#${el.id}` : "";
          const cls = el.className && typeof el.className === "string"
            ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
            : "";
          const label =
            el.getAttribute("aria-label") ||
            el.getAttribute("title") ||
            el.textContent?.trim().slice(0, 30) ||
            "";
          const selector = `${el.tagName.toLowerCase()}${id}${cls}${label ? ` [${label}]` : ""}`;
          offenders.push({
            selector,
            w: Math.round(box.width),
            h: Math.round(box.height),
            box,
            el,
          });
        }
      }
      if (offenders.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(
          `[AIDoctor.tapAudit] ${offenders.length} control(s) below 44×44 on screen "${screen}":`,
          offenders.map(o => ({ selector: o.selector, width: o.w, height: o.h, box: o.box })),
        );
      } else if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.log(`[AIDoctor.tapAudit] PASS ✅ all controls ≥ 44×44 on screen "${screen}"`);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [screen, latestResult, chat.length]);

  /**
   * Dev-only test harness: rapidly cycles the screen state machine to
   * verify the single-primary-action invariant under fast updates.
   * Triggered by `?aidoctor-test=1` in the URL or
   * `localStorage.aidoctor_test = "1"`. Logs PASS/FAIL to the console.
   */
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const enabled =
      new URLSearchParams(window.location.search).get("aidoctor-test") === "1" ||
      localStorage.getItem("aidoctor_test") === "1";
    if (!enabled) return;
    let cancelled = false;
    const states: ScreenState[] = ["idle", "analyzing", "result", "idle", "result", "analyzing", "idle"];
    let i = 0;
    let violations = 0;
    const tick = () => {
      if (cancelled) return;
      setScreen(states[i % states.length]);
      i++;
      requestAnimationFrame(() => {
        const root = stageRef.current;
        const count = root?.querySelectorAll("[data-primary-action]").length ?? 0;
        if (count > 1) {
          violations++;
          // eslint-disable-next-line no-console
          console.error(`[AIDoctor.testHarness] step ${i} state=${states[(i - 1) % states.length]} primaries=${count}`);
        }
        if (i < 60) setTimeout(tick, 16);
        else {
          // eslint-disable-next-line no-console
          console.log(
            `[AIDoctor.testHarness] ${violations === 0 ? "PASS ✅" : `FAIL ❌ (${violations} violations)`} after ${i} rapid state updates`,
          );
        }
      });
    };
    setTimeout(tick, 500);
    return () => { cancelled = true; };
  }, []);

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
  const handleFile = useCallback(async (file: File, opts?: { batch?: boolean; queueId?: string }) => {
    const batch = !!opts?.batch;
    const qid = opts?.queueId;
    if (!userId) {
      toast({ title: "Sign in first", description: "Please sign in to analyze a report.", variant: "destructive" });
      return;
    }
    if (!batch) {
      setScreen("analyzing");
      setAnalyzingLabel(`Reading ${file.name}`);
    } else if (qid) {
      setUploadQueue(prev => prev.map(q => q.id === qid ? { ...q, status: "analyzing" } : q));
    }
    try {
      const filePath = `${userId}/${Date.now()}_${file.name}`;
      await supabase.storage.from("medical-documents").upload(filePath, file);
      const { data: doc } = await supabase.from("medical_documents").insert({
        user_id: userId, file_name: file.name, file_path: filePath, status: "processing",
      }).select().single();
      if (!doc) throw new Error("Could not save document");

      if (!batch) setAnalyzingLabel("Extracting biomarkers");
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
        if (!batch) setExtractedBiomarkers(snap);
      }
      // Capture case priority / clinical insight from the multi-modality parser.
      let detectedPriority: Priority = "LOW";
      if (result) {
        const cp = result.case_priority || {};
        const lvl = (cp.level || result.urgency || "LOW").toString().toUpperCase() as Priority;
        const safe: Priority = lvl === "HIGH" || lvl === "MEDIUM" ? lvl : "LOW";
        detectedPriority = safe;
        if (!batch) {
          setLatestCase({
            main_finding: result.main_finding || "",
            clinical_insight: result.clinical_insight || "",
            priority: safe,
            review_window: cp.review_window || PRIORITY_META[safe].window,
            document_type: result.document_type || "General",
          });
        }
      }
      if (!batch) setLastFileName(file.name);
      const extractedCount = result?.biomarkers
        ? Object.keys(result.biomarkers).filter(k => result.biomarkers[k] > 0).length
        : 0;

      if (!batch) {
        setAnalyzingLabel("Asking Vitalis AI Doctor");
        const userText = `I just uploaded "${file.name}". ${extractedCount} biomarkers were extracted. Analyze the new results — what changed, what's concerning, and what I should do next.`;
        let full = "";
        full = await streamChat([{ role: "user", content: userText }], (partial) => {
          setLatestResult(partial);
        });
        setLatestResult(full);
        setScreen("result");
        toast({ title: "Report analyzed", description: `${extractedCount} biomarkers extracted.` });
      } else if (qid) {
        setUploadQueue(prev => prev.map(q => q.id === qid ? {
          ...q,
          status: "completed",
          priority: detectedPriority,
          caseId: doc.id,
          mainFinding: result?.main_finding || "",
        } : q));
      }
      // Refresh the triage list so the new case appears.
      void loadTriage();
    } catch (err: any) {
      if (batch && qid) {
        setUploadQueue(prev => prev.map(q => q.id === qid ? { ...q, status: "error", error: err?.message || "Failed" } : q));
      } else {
        toast({ title: "Analysis failed", description: err?.message || "Please try again.", variant: "destructive" });
        setScreen("idle");
      }
    } finally {
      if (!batch && fileRef.current) fileRef.current.value = "";
    }
  }, [userId, updateField, streamChat, toast, loadTriage]);

  /** Enqueue multiple files (hospital mode) and process them sequentially.
   *  Each file gets its own status row (queued → analyzing → completed/error)
   *  and, once parsed, the queue auto-sorts pending items by detected priority. */
  const enqueueFiles = useCallback(async (files: File[]) => {
    if (!userId) {
      toast({ title: "Sign in first", description: "Please sign in to analyze reports.", variant: "destructive" });
      return;
    }
    if (files.length === 0) return;
    const items: QueueItem[] = files.map(f => ({
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file: f,
      status: "queued",
    }));
    setUploadQueue(prev => [...prev, ...items]);
    if (isBatchProcessing) return; // a worker is already draining the queue
    setIsBatchProcessing(true);
    try {
      // Process one at a time to keep server load low and progress easy to follow.
      // We re-read the queue each tick so newly-added files are picked up.
      // Priority-aware ordering: pending items already analyzed once will be
      // visible in the triage list (priority known); for the queue itself we
      // process FIFO since we don't know priority before parsing.
      while (true) {
        const next = await new Promise<QueueItem | null>(resolve => {
          setUploadQueue(prev => {
            const n = prev.find(q => q.status === "queued") || null;
            resolve(n);
            return prev;
          });
        });
        if (!next) break;
        await handleFile(next.file, { batch: true, queueId: next.id });
      }
      toast({ title: "Batch complete", description: `${items.length} file(s) processed. Sorted by priority.` });
    } finally {
      setIsBatchProcessing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [userId, handleFile, toast, isBatchProcessing]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;
    if (hospitalMode && files.length > 1) {
      requestFilesWithConsent(files);
    } else {
      requestFileWithConsent(files[0]);
    }
  }, []); // handlers defined below; refs keep deps stable

  // ─── Pre-upload consent / disclaimer ──────────────────────────────
  // Required acknowledgment before any medical file is analyzed. Stored
  // in localStorage so we don't nag returning users on the same device.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[] | null>(null);
  const [pendingPickerAfterConsent, setPendingPickerAfterConsent] = useState(false);
  const hasConsented = useCallback(() => {
    try { return localStorage.getItem(LS_UPLOAD_CONSENT) === "1"; } catch { return false; }
  }, []);
  const recordConsent = useCallback(() => {
    try { localStorage.setItem(LS_UPLOAD_CONSENT, "1"); } catch { /* ignore */ }
  }, []);
  /** Gate any upload (drop, file picker, or programmatic) behind consent. */
  const requestFileWithConsent = useCallback((file: File) => {
    if (hasConsented()) { void handleFile(file); return; }
    setPendingFile(file);
  }, [hasConsented, handleFile]);
  /** Gate a multi-file batch (hospital mode) behind consent. */
  const requestFilesWithConsent = useCallback((files: File[]) => {
    if (hasConsented()) { void enqueueFiles(files); return; }
    setPendingFiles(files);
  }, [hasConsented, enqueueFiles]);
  /** Gate the file picker itself — opening the chooser requires consent. */
  const openFilePicker = useCallback(() => {
    if (hasConsented()) { fileRef.current?.click(); return; }
    setPendingPickerAfterConsent(true);
  }, [hasConsented]);

  // ─── Follow-up question (chat at bottom) ──────────────────────────
  const sendFollowUp = useCallback(async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || isStreaming) return;
    // Guardrail: must have an extracted biomarker snapshot OR a parsed
    // main issue from a prior result before chatting. Otherwise the AI
    // has no patient context and replies are generic.
    const hasBiomarkers = Object.keys(extractedBiomarkers).length > 0;
    const hasResult = !!latestResult;
    if (!hasBiomarkers && !hasResult) {
      toast({
        title: "Upload a report first",
        description: "The AI Doctor needs your biomarkers before it can answer questions.",
        variant: "destructive",
      });
      if (screen !== "analyzing") {
        setScreen("idle");
        setTimeout(() => {
          const btn = stageRef.current?.querySelector<HTMLButtonElement>("[data-primary-action]");
          btn?.focus();
        }, 50);
      }
      return;
    }
    const userMsg: ChatMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    const assistantId = `a-${Date.now() + 1}`;
    setChat(prev => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    if (!override) setInput("");
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
      toast({ title: "Answer ready", description: "The AI Doctor finished responding." });
    } catch (err: any) {
      setChat(prev => prev.map(m => m.id === assistantId
        ? { ...m, content: `⚠️ ${err?.message || "Could not reach the AI Doctor."}` }
        : m));
    } finally {
      setIsStreaming(false);
    }
  }, [input, isStreaming, chat, latestResult, streamChat, extractedBiomarkers, screen, toast]);

  // Expose sendFollowUp through a ref so triage actions defined earlier can call it.
  useEffect(() => { sendFollowUpRef.current = (t: string) => { void sendFollowUp(t); }; }, [sendFollowUp]);

  // ─── Derived from result ──────────────────────────────────────────
  const severity = latestResult ? parseSeverity(latestResult) : null;
  const specialty = latestResult ? (parseSpecialty(latestResult) || "General Practitioner") : null;
  const sevMeta = severity ? SEVERITY_META[severity] : null;
  const isSerious = !!sevMeta?.serious;
  const summary = useMemo(() => latestResult ? extractSummary(stripTags(latestResult)) : null, [latestResult]);
  const actions = useMemo(() => latestResult ? extractActions(stripTags(latestResult)) : [], [latestResult]);
  const findings = useMemo(() => latestResult ? extractKeyFindings(stripTags(latestResult)) : [], [latestResult]);

  const handleDownloadReport = useCallback(() => {
    try {
      downloadAIDoctorReport({ profile, substances });
      toast({ title: "Report downloaded", description: "Your full health report was saved." });
    } catch (err: any) {
      toast({ title: "Download failed", description: err?.message || "Please try again.", variant: "destructive" });
    }
  }, [profile, substances, toast]);

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
      <main
        ref={stageRef}
        data-aidoctor-stage="true"
        className="flex-1 flex flex-col items-center justify-start px-1"
      >

        {/* ── IDLE: single primary action ── */}
        {screen === "idle" && (
          <div
            ref={dropRef}
            role="button"
            tabIndex={0}
            aria-describedby="aidoctor-drop-instructions"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                openFilePicker();
              }
            }}
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
            className={`w-full max-w-md mx-auto rounded-3xl border-2 border-dashed transition-all duration-200 p-10 sm:p-14 flex flex-col items-center text-center min-h-[280px] focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/40 ${
              isDragging
                ? "border-primary bg-primary/5 scale-[1.01]"
                : "border-border hover:border-primary/60 hover:bg-card/40"
            }`}
            aria-label="Drop your health report here, or press Enter to choose a file"
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
              Blood tests, MRI/CT/X-ray, ECG, or radiology PDFs. We'll read it, flag what matters, and assign a case priority.
            </p>
            <button
              type="button"
              data-primary-action
              onClick={openFilePicker}
              className="mt-6 inline-flex items-center justify-center gap-2 min-h-[48px] min-w-[44px] px-6 py-3 rounded-full bg-primary text-primary-foreground text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:opacity-90 active:scale-95 transition-all"
              aria-label="Choose a health report to upload"
            >
              <Upload className="w-4 h-4" />
              Choose file
            </button>
            <p className="text-[10px] text-muted-foreground/70 mt-3">or drag and drop here</p>
            <p id="aidoctor-drop-instructions" className="sr-only">
              Drop a PDF, JPG, or PNG health report onto this area, or press Enter or Space to open the file picker. Keyboard users can also use the Choose file button below.
            </p>
            {lastFileName && (
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                Last uploaded: {lastFileName}
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.dcm,image/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) requestFileWithConsent(f); }}
            />
          </div>
        )}

        {/* ── Triage list (visible on idle when ≥2 processed cases exist) ──
            Hospital mode: groups by priority, dims reviewed cases, and
            highlights the FIRST pending item in the queue (the next thing
            the clinician should look at). Personal mode: simple flat list. */}
        {screen === "idle" && triage.length >= 2 && (() => {
          const pending = triage.filter(c => !c.reviewed_at);
          const reviewed = triage.filter(c => !!c.reviewed_at);
          const orderedPending = (["HIGH", "MEDIUM", "LOW"] as Priority[])
            .flatMap(lvl => pending.filter(c => c.priority === lvl));
          const firstPendingId = orderedPending[0]?.id ?? null;

          const renderRow = (c: TriageCase) => {
            const meta = PRIORITY_META[c.priority];
            const isReviewed = !!c.reviewed_at;
            const isFirst = hospitalMode && c.id === firstPendingId;
            return (
              <li
                key={c.id}
                className={`rounded-2xl border p-3 transition-all ${
                  isReviewed
                    ? "border-border bg-card/40 opacity-60"
                    : isFirst
                      ? `${meta.border} ${meta.bg} ring-2 ring-primary/40 shadow-lg`
                      : `${meta.border} ${meta.bg}`
                }`}
              >
                <div className="flex items-start gap-3">
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${isReviewed ? "bg-muted" : meta.dot}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground truncate">
                        {c.document_type} · <span className="text-muted-foreground">{c.file_name}</span>
                      </p>
                      <span className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${isReviewed ? "text-muted-foreground" : meta.tone}`}>
                        {isReviewed ? "Reviewed" : meta.label}
                      </span>
                    </div>
                    {c.main_finding && (
                      <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">
                        {c.main_finding}
                      </p>
                    )}
                    {!isReviewed && (
                      <p className={`text-[10px] mt-1 ${meta.tone}`}>
                        {isFirst ? `Next up · ${c.review_window}` : c.review_window}
                      </p>
                    )}
                  </div>
                </div>
                {/* Per-row actions */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/40">
                  <button
                    type="button"
                    onClick={() => handleDiscussCase(c)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg bg-primary/10 hover:bg-primary/15 text-primary text-[11px] font-medium transition-colors"
                    aria-label={`Discuss ${c.file_name} with the AI Doctor`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Discuss
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadCaseSummary({
                      file_name: c.file_name,
                      document_type: c.document_type,
                      main_finding: c.main_finding,
                      clinical_insight: c.clinical_insight,
                      priority: c.priority,
                      review_window: c.review_window,
                      reviewed_at: c.reviewed_at,
                      created_at: c.created_at,
                    })}
                    className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-border hover:bg-muted/40 text-foreground text-[11px] font-medium transition-colors"
                    aria-label={`Download summary for ${c.file_name}`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Summary
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === c.id}
                    onClick={() => handleMarkReviewed(c.id, isReviewed)}
                    className={`inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg text-[11px] font-medium transition-colors disabled:opacity-50 ${
                      isReviewed
                        ? "border border-border hover:bg-muted/40 text-muted-foreground"
                        : "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400"
                    }`}
                    aria-label={isReviewed ? `Mark ${c.file_name} as pending` : `Mark ${c.file_name} as reviewed`}
                  >
                    {reviewingId === c.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Check className="w-3.5 h-3.5" />}
                    {isReviewed ? "Undo" : "Reviewed"}
                  </button>
                </div>
              </li>
            );
          };

          return (
            <section className="w-full max-w-md mx-auto mt-8 animate-fade-in">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-semibold text-foreground">
                    {hospitalMode ? "Review queue" : "Case priority"}
                  </h3>
                </div>
                {/* Hospital mode toggle — minimal */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={hospitalMode}
                  onClick={() => setHospitalMode(v => !v)}
                  className={`inline-flex items-center gap-1.5 min-h-[32px] px-2.5 rounded-full border text-[10px] font-medium uppercase tracking-wider transition-colors ${
                    hospitalMode
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  aria-label={hospitalMode ? "Disable hospital mode" : "Enable hospital mode"}
                >
                  <Hospital className="w-3 h-3" />
                  Hospital mode
                </button>
              </div>

              {hospitalMode ? (
                <>
                  {orderedPending.length > 0 && (
                    <ul className="space-y-2">
                      {(["HIGH", "MEDIUM", "LOW"] as Priority[]).map(lvl => {
                        const rows = pending.filter(c => c.priority === lvl);
                        if (rows.length === 0) return null;
                        return (
                          <li key={lvl} className="space-y-2">
                            <p className={`text-[10px] font-semibold uppercase tracking-wider px-1 ${PRIORITY_META[lvl].tone}`}>
                              {PRIORITY_META[lvl].label} · {rows.length}
                            </p>
                            <ul className="space-y-2">{rows.map(renderRow)}</ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  {reviewed.length > 0 && (
                    <details className="mt-4">
                      <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none px-1">
                        Reviewed ({reviewed.length})
                      </summary>
                      <ul className="space-y-2 mt-2">{reviewed.map(renderRow)}</ul>
                    </details>
                  )}
                  {orderedPending.length === 0 && reviewed.length > 0 && (
                    <p className="text-xs text-center text-muted-foreground py-6">
                      Queue clear. All cases reviewed.
                    </p>
                  )}
                </>
              ) : (
                <ul className="space-y-2">
                  {(["HIGH", "MEDIUM", "LOW"] as Priority[]).flatMap(lvl =>
                    triage.filter(c => c.priority === lvl).map(renderRow)
                  )}
                </ul>
              )}

              <p className="text-[10px] text-center text-muted-foreground/70 mt-3 px-2">
                AI-assisted triage. Does not replace a licensed physician.
              </p>
            </section>
          );
        })()}

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
                {latestCase?.main_finding || summary.title}
              </h2>
              {summary.explanation && (
                <p className="text-sm text-muted-foreground mt-2.5 leading-relaxed">
                  {summary.explanation}
                </p>
              )}
            </section>

            {/* Case priority + clinical insight (multi-modality triage) */}
            {latestCase && (latestCase.main_finding || latestCase.clinical_insight) && (
              <section className={`rounded-2xl border ${PRIORITY_META[latestCase.priority].border} ${PRIORITY_META[latestCase.priority].bg} p-4 space-y-2`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className={`w-4 h-4 ${PRIORITY_META[latestCase.priority].tone}`} />
                    <p className="text-xs font-semibold text-foreground">Case priority</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${PRIORITY_META[latestCase.priority].tone}`}>
                    {PRIORITY_META[latestCase.priority].label} · {latestCase.review_window}
                  </span>
                </div>
                {latestCase.clinical_insight && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {latestCase.clinical_insight}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground/70 italic pt-1">
                  AI-assisted analysis. Does not replace a licensed physician.
                </p>
                <button
                  type="button"
                  onClick={() => downloadCaseSummary({
                    file_name: lastFileName || "case",
                    document_type: latestCase.document_type,
                    main_finding: latestCase.main_finding,
                    clinical_insight: latestCase.clinical_insight,
                    priority: latestCase.priority,
                    review_window: latestCase.review_window,
                    created_at: new Date().toISOString(),
                  })}
                  className="w-full inline-flex items-center justify-center gap-1.5 mt-2 min-h-[40px] px-3 rounded-lg border border-border bg-background/40 hover:bg-background/70 text-foreground text-[11px] font-medium transition-colors"
                  aria-label="Download case summary PDF"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download summary
                </button>
              </section>
            )}

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

            {/* ── Structured report + download ── */}
            <section className="rounded-2xl border border-border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-semibold text-foreground">Your report</h3>
              </div>
              {findings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Key biomarkers
                  </p>
                  <ul className="space-y-1.5">
                    {findings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-xs text-foreground leading-relaxed">
                        <span className="text-primary mt-0.5">•</span>
                        <span className="flex-1">{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sevMeta && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Risk level</span>
                  <span className={`font-semibold ${sevMeta.tone}`}>{sevMeta.label}</span>
                </div>
              )}
              <button
                type="button"
                onClick={handleDownloadReport}
                className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-muted/50 text-sm font-medium text-foreground active:scale-[0.99] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label="Download full health report"
              >
                <Download className="w-4 h-4" />
                Download report
              </button>
            </section>

            {/* Quiet "start over" — single secondary action */}
            <div className="flex justify-center pt-1">
              <button
                type="button"
                onClick={() => {
                  setLatestResult("");
                  setChat([]);
                  setExtractedBiomarkers({});
                  setLastFileName("");
                  setLatestCase(null);
                  setActiveCaseId(null);
                  setScreen("idle");
                  try {
                    sessionStorage.removeItem(SS_RESULT);
                    sessionStorage.removeItem(SS_BIOMARKERS);
                    sessionStorage.removeItem(SS_FILENAME);
                    sessionStorage.removeItem(SS_SCREEN);
                  } catch { /* ignore */ }
                }}
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
          onSubmit={(e) => { e.preventDefault(); void sendFollowUp(); }}
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
                const idx = actionConfirm.index + 1;
                setActionConfirm(null);
                toast({
                  title: `Action ${idx} confirmed`,
                  description: "Generating your tailored 7-day plan…",
                });
                // Pass directly to avoid stale-closure issues with `input` state.
                sendFollowUp(text);
              }}
            >
              Get my plan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ════════ Pre-upload consent / disclaimer ════════
          Required acknowledgment before any medical file is analyzed.
          Persists in localStorage so returning users on the same device
          aren't prompted again. Cancel restores the idle state cleanly. */}
      <AlertDialog
        open={!!pendingFile || pendingPickerAfterConsent}
        onOpenChange={(open) => {
          if (!open) { setPendingFile(null); setPendingPickerAfterConsent(false); }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <AlertDialogTitle className="text-base">Before we analyze your file</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="pt-2 text-sm leading-relaxed text-foreground space-y-2">
              <span className="block">
                Vitalis uses AI to read and summarize your medical document.
                The output is <span className="font-semibold">AI-assisted analysis</span> and
                does <span className="font-semibold">not replace a licensed physician</span>.
              </span>
              <span className="block text-muted-foreground text-xs">
                Your file is uploaded to your private storage and processed
                securely. Do not upload files for anyone else without their permission.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              className="min-h-[44px]"
              onClick={() => { setPendingFile(null); setPendingPickerAfterConsent(false); }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="min-h-[44px]"
              onClick={() => {
                recordConsent();
                const f = pendingFile;
                const openPicker = pendingPickerAfterConsent;
                setPendingFile(null);
                setPendingPickerAfterConsent(false);
                if (f) void handleFile(f);
                else if (openPicker) setTimeout(() => fileRef.current?.click(), 0);
              }}
            >
              I understand — continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AIDoctorTapAuditPanel />
    </div>
  );
}
