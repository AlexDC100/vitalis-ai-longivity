/**
 * Rehydration contract for the AI Doctor active case + per-case chat.
 *
 * The AI Doctor screen persists two things so that the user's discussion
 * survives refreshes (web) and tab switches (mobile/desktop):
 *
 *   1. The currently selected triage case id  → localStorage   (LS_ACTIVE_CASE)
 *   2. The per-case chat thread                → sessionStorage (caseChatKey)
 *
 * This module is the single source of truth for those keys and the
 * read/write helpers. Both `AIDoctorScreen` and the e2e tests use it,
 * so any drift is caught immediately.
 */

export const LS_ACTIVE_CASE = "vitalis.aidoctor.activeCaseId";
export const caseChatKey = (caseId: string) => `vitalis.aidoctor.chat.${caseId}`;

/**
 * Hospital-mode + multi-file upload queue persistence keys.
 *
 * The production AIDoctorScreen persists `hospitalMode` to localStorage and
 * (optionally) the in-flight upload queue to sessionStorage so that a refresh
 * or tab switch in hospital mode does not silently lose batch state.
 * The helpers below are also the single source of truth for tests.
 */
export const LS_HOSPITAL_MODE = "vitalis.aidoctor.hospitalMode";
export const SS_UPLOAD_QUEUE = "vitalis.aidoctor.uploadQueue";

export type QueueStatus = "queued" | "analyzing" | "completed" | "error";
export interface RehydratableQueueItem {
  id: string;
  fileName: string;
  status: QueueStatus;
  priority?: "high" | "medium" | "low" | null;
}

export interface RehydratableChatMsg {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface RehydratableCase {
  id: string;
  file_name: string;
  document_type: string;
}

/** Safe localStorage / sessionStorage accessors (never throw in SSR). */
const safeLocal = (): Storage | null => {
  try { return typeof localStorage !== "undefined" ? localStorage : null; } catch { return null; }
};
const safeSession = (): Storage | null => {
  try { return typeof sessionStorage !== "undefined" ? sessionStorage : null; } catch { return null; }
};

export function readActiveCaseId(): string | null {
  return safeLocal()?.getItem(LS_ACTIVE_CASE) ?? null;
}

export function writeActiveCaseId(id: string | null): void {
  const ls = safeLocal();
  if (!ls) return;
  if (id) ls.setItem(LS_ACTIVE_CASE, id);
  else ls.removeItem(LS_ACTIVE_CASE);
}

export function readCaseChat(caseId: string): RehydratableChatMsg[] {
  const raw = safeSession()?.getItem(caseChatKey(caseId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RehydratableChatMsg[]) : [];
  } catch {
    return [];
  }
}

export function writeCaseChat(caseId: string, chat: RehydratableChatMsg[]): void {
  try { safeSession()?.setItem(caseChatKey(caseId), JSON.stringify(chat)); } catch { /* quota */ }
}

/**
 * Resolve what the chat header should display, given a list of triage cases
 * and the currently active case id. Returns `null` when nothing should render.
 */
export function resolveChatHeader(
  triage: RehydratableCase[],
  activeCaseId: string | null,
): { active: RehydratableCase; title: string } | null {
  if (!activeCaseId) return null;
  const active = triage.find(c => c.id === activeCaseId);
  if (!active) return null;
  return { active, title: `${active.document_type} · ${active.file_name}` };
}

/**
 * Switch the active case: persists the outgoing case's chat, swaps the
 * activeCaseId, and rehydrates the incoming case's chat thread. Returns
 * the chat thread to load for the new case.
 */
export function switchActiveCase(params: {
  fromCaseId: string | null;
  toCaseId: string;
  fromChat: RehydratableChatMsg[];
}): RehydratableChatMsg[] {
  const { fromCaseId, toCaseId, fromChat } = params;
  if (fromCaseId && fromCaseId !== toCaseId) {
    writeCaseChat(fromCaseId, fromChat);
  }
  writeActiveCaseId(toCaseId);
  return readCaseChat(toCaseId);
}

/**
 * Simulate the full "page refresh" rehydration sequence used by the screen:
 * read activeCaseId from localStorage, find the matching case, and load
 * its persisted chat thread.
 */
export function rehydrateActiveCase(triage: RehydratableCase[]): {
  activeCaseId: string | null;
  header: ReturnType<typeof resolveChatHeader>;
  chat: RehydratableChatMsg[];
} {
  const activeCaseId = readActiveCaseId();
  const header = resolveChatHeader(triage, activeCaseId);
  const chat = activeCaseId ? readCaseChat(activeCaseId) : [];
  return { activeCaseId, header, chat };
}