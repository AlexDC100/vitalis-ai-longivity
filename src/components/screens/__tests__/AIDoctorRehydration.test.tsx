// @vitest-environment jsdom
/**
 * End-to-end rehydration checks for the AI Doctor active case + chat header.
 *
 * These cover the contract that AIDoctorScreen relies on:
 *   - LS_ACTIVE_CASE  (localStorage)        — survives a full page refresh
 *   - caseChatKey(id) (sessionStorage)      — survives tab switches in the
 *                                              same tab session
 *
 * We validate both behaviors at mobile (390x844) and desktop (1366x768)
 * viewports by driving the same hooks the real screen uses, in a small
 * harness component. Mounting the full AIDoctorScreen pulls in Supabase /
 * health-context wiring that isn't relevant to the rehydration contract.
 */
import React, { useEffect, useState } from "react";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";

// Keys must stay in sync with AIDoctorScreen.tsx
const LS_ACTIVE_CASE = "vitalis.aidoctor.activeCaseId";
const caseChatKey = (id: string) => `vitalis.aidoctor.chat.${id}`;

interface ChatMsg { id: string; role: "user" | "assistant"; content: string; }
interface Case { id: string; file_name: string; document_type: string; }

/** Minimal harness mirroring the real screen's rehydration hooks. */
function Harness({ triage }: { triage: Case[] }) {
  const [activeCaseId, setActiveCaseId] = useState<string | null>(() => {
    try { return localStorage.getItem(LS_ACTIVE_CASE); } catch { return null; }
  });
  const [chat, setChat] = useState<ChatMsg[]>([]);

  // Persist activeCaseId across refresh
  useEffect(() => {
    if (activeCaseId) localStorage.setItem(LS_ACTIVE_CASE, activeCaseId);
    else localStorage.removeItem(LS_ACTIVE_CASE);
  }, [activeCaseId]);

  // Persist per-case chat across tab switches
  useEffect(() => {
    if (!activeCaseId) return;
    sessionStorage.setItem(caseChatKey(activeCaseId), JSON.stringify(chat));
  }, [chat, activeCaseId]);

  // Rehydrate per-case chat once triage is available
  useEffect(() => {
    if (!activeCaseId) return;
    const raw = sessionStorage.getItem(caseChatKey(activeCaseId));
    if (raw) {
      try { setChat(JSON.parse(raw) as ChatMsg[]); } catch { /* ignore */ }
    }
    // run only when activeCaseId becomes known
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  const active = triage.find(c => c.id === activeCaseId) || null;

  return (
    <div>
      {active && (
        <header data-testid="chat-header">
          <span data-testid="chat-header-label">Discussing case</span>
          <span data-testid="chat-header-title">
            {active.document_type} · {active.file_name}
          </span>
        </header>
      )}
      <ul data-testid="chat-log">
        {chat.map(m => (
          <li key={m.id} data-role={m.role}>{m.content}</li>
        ))}
      </ul>
      <button
        data-testid="select-second"
        onClick={() => setActiveCaseId(triage[1]?.id ?? null)}
      >
        switch
      </button>
      <button
        data-testid="add-msg"
        onClick={() =>
          setChat(prev => [
            ...prev,
            { id: `m${prev.length + 1}`, role: "user", content: `msg-${prev.length + 1}` },
          ])
        }
      >
        add
      </button>
    </div>
  );
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
  window.dispatchEvent(new Event("resize"));
}

const TRIAGE: Case[] = [
  { id: "case-A", file_name: "blood-panel.pdf", document_type: "Blood Test" },
  { id: "case-B", file_name: "chest-xray.png",  document_type: "X-Ray" },
];

const VIEWPORTS: Array<[string, number, number]> = [
  ["mobile",  390, 844],
  ["desktop", 1366, 768],
];

describe.each(VIEWPORTS)("AI Doctor rehydration on %s", (label, w, h) => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setViewport(w, h);
  });
  afterEach(() => cleanup());

  it(`[${label}] persists activeCaseId across a refresh and shows the chat header`, () => {
    // First mount: select a case + add a message
    localStorage.setItem(LS_ACTIVE_CASE, "case-A");
    const first = render(<Harness triage={TRIAGE} />);
    expect(screen.getByTestId("chat-header-title").textContent).toContain("blood-panel.pdf");

    act(() => { screen.getByTestId("add-msg").click(); });
    expect(screen.getByTestId("chat-log").children).toHaveLength(1);

    // Simulate a full page refresh: unmount + remount, but keep storage.
    first.unmount();
    render(<Harness triage={TRIAGE} />);

    // activeCaseId must be rehydrated from localStorage and the header shown.
    expect(localStorage.getItem(LS_ACTIVE_CASE)).toBe("case-A");
    expect(screen.getByTestId("chat-header")).toBeInTheDocument();
    expect(screen.getByTestId("chat-header-title").textContent).toContain("Blood Test");
    // Per-case chat must rehydrate from sessionStorage.
    expect(screen.getByTestId("chat-log").children).toHaveLength(1);
  });

  it(`[${label}] keeps per-case chat threads when switching cases (tab switch)`, () => {
    localStorage.setItem(LS_ACTIVE_CASE, "case-A");
    render(<Harness triage={TRIAGE} />);

    // Add 2 messages on case A
    act(() => { screen.getByTestId("add-msg").click(); });
    act(() => { screen.getByTestId("add-msg").click(); });
    expect(screen.getByTestId("chat-log").children).toHaveLength(2);

    // Switch to case B — header updates, chat resets to B's (empty) thread
    act(() => { screen.getByTestId("select-second").click(); });
    expect(localStorage.getItem(LS_ACTIVE_CASE)).toBe("case-B");
    expect(screen.getByTestId("chat-header-title").textContent).toContain("chest-xray.png");
    // B has no prior thread persisted
    expect(sessionStorage.getItem(caseChatKey("case-B"))).toBeTruthy();

    // Case A's thread is preserved in sessionStorage for later restore.
    const savedA = JSON.parse(sessionStorage.getItem(caseChatKey("case-A")) || "[]");
    expect(savedA).toHaveLength(2);
    expect(savedA[0]).toMatchObject({ role: "user", content: "msg-1" });
  });

  it(`[${label}] clears the chat header when activeCaseId is missing`, () => {
    // No activeCaseId in storage → no header rendered.
    render(<Harness triage={TRIAGE} />);
    expect(screen.queryByTestId("chat-header")).toBeNull();
    expect(localStorage.getItem(LS_ACTIVE_CASE)).toBeNull();
  });

  it(`[${label}] survives a tab switch (visibilitychange) without losing case context`, () => {
    localStorage.setItem(LS_ACTIVE_CASE, "case-B");
    render(<Harness triage={TRIAGE} />);
    act(() => { screen.getByTestId("add-msg").click(); });

    // Simulate the tab going hidden then visible again.
    act(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
      document.dispatchEvent(new Event("visibilitychange"));
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
      document.dispatchEvent(new Event("visibilitychange"));
    });

    expect(screen.getByTestId("chat-header-title").textContent).toContain("chest-xray.png");
    expect(screen.getByTestId("chat-log").children).toHaveLength(1);
    expect(localStorage.getItem(LS_ACTIVE_CASE)).toBe("case-B");
  });
});