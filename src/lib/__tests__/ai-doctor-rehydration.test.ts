/**
 * End-to-end rehydration checks for the AI Doctor active case + chat header.
 *
 * We exercise the same persistence helpers the real `AIDoctorScreen` uses
 * (LS_ACTIVE_CASE in localStorage, per-case chat in sessionStorage) to
 * verify that:
 *
 *   • A page refresh restores `activeCaseId` and the chat header
 *   • A tab switch (component remount) restores per-case chat
 *   • Switching cases preserves each case's own thread
 *   • Missing / unknown active case ids never render a header
 *
 * The rehydration contract is viewport-independent, but the suite runs
 * twice — once at a mobile viewport (390×844) and once at a desktop
 * viewport (1366×768) — to satisfy the "mobile and web" coverage
 * requirement and to catch any future viewport-dependent regressions.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  LS_ACTIVE_CASE,
  caseChatKey,
  readActiveCaseId,
  writeActiveCaseId,
  readCaseChat,
  writeCaseChat,
  resolveChatHeader,
  switchActiveCase,
  rehydrateActiveCase,
  type RehydratableCase,
  type RehydratableChatMsg,
} from "../ai-doctor-rehydration";

// ─── Minimal Storage polyfill (vitest runs in node-env) ────────────────
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  key(i: number) { return Array.from(this.map.keys())[i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
}

const g = globalThis as unknown as {
  localStorage: Storage;
  sessionStorage: Storage;
  innerWidth: number;
  innerHeight: number;
};

function setViewport(width: number, height: number) {
  g.innerWidth = width;
  g.innerHeight = height;
}

const TRIAGE: RehydratableCase[] = [
  { id: "case-A", file_name: "blood-panel.pdf", document_type: "Blood Test" },
  { id: "case-B", file_name: "chest-xray.png",  document_type: "X-Ray" },
];

const VIEWPORTS: Array<["mobile" | "web", number, number]> = [
  ["mobile", 390, 844],
  ["web",   1366, 768],
];

describe.each(VIEWPORTS)(
  "AI Doctor rehydration (%s viewport)",
  (label, width, height) => {
    beforeEach(() => {
      g.localStorage = new MemoryStorage();
      g.sessionStorage = new MemoryStorage();
      setViewport(width, height);
    });

    it(`[${label} ${width}×${height}] persists activeCaseId across a refresh`, () => {
      writeActiveCaseId("case-A");
      writeCaseChat("case-A", [
        { id: "m1", role: "user", content: "What does this mean?" },
      ]);

      // Simulate a refresh — fresh "mount" reading from the same storage.
      const { activeCaseId, header, chat } = rehydrateActiveCase(TRIAGE);

      expect(activeCaseId).toBe("case-A");
      expect(header).not.toBeNull();
      expect(header!.title).toBe("Blood Test · blood-panel.pdf");
      expect(chat).toHaveLength(1);
      expect(chat[0]).toMatchObject({ role: "user", content: "What does this mean?" });
    });

    it(`[${label} ${width}×${height}] keeps per-case chat threads when switching cases`, () => {
      writeActiveCaseId("case-A");
      const aChat: RehydratableChatMsg[] = [
        { id: "m1", role: "user", content: "msg-1" },
        { id: "m2", role: "assistant", content: "msg-2" },
      ];
      writeCaseChat("case-A", aChat);

      // Switch to case B.
      const newChat = switchActiveCase({
        fromCaseId: "case-A",
        toCaseId: "case-B",
        fromChat: aChat,
      });

      expect(readActiveCaseId()).toBe("case-B");
      // Case B has no prior thread → empty.
      expect(newChat).toEqual([]);
      // Case A's thread is preserved.
      expect(readCaseChat("case-A")).toHaveLength(2);

      // Header now reflects case B.
      const header = resolveChatHeader(TRIAGE, readActiveCaseId());
      expect(header!.title).toBe("X-Ray · chest-xray.png");
    });

    it(`[${label} ${width}×${height}] hides the chat header when no activeCaseId is stored`, () => {
      const { activeCaseId, header, chat } = rehydrateActiveCase(TRIAGE);
      expect(activeCaseId).toBeNull();
      expect(header).toBeNull();
      expect(chat).toEqual([]);
    });

    it(`[${label} ${width}×${height}] hides the chat header when activeCaseId points to an unknown case`, () => {
      writeActiveCaseId("case-DELETED");
      const { activeCaseId, header } = rehydrateActiveCase(TRIAGE);
      expect(activeCaseId).toBe("case-DELETED"); // id is preserved …
      expect(header).toBeNull();                 // … but no header renders.
    });

    it(`[${label} ${width}×${height}] survives a tab switch (remount) without losing case context`, () => {
      writeActiveCaseId("case-B");
      writeCaseChat("case-B", [
        { id: "m1", role: "user", content: "Is this urgent?" },
      ]);

      // First "mount" (tab visible)
      const first = rehydrateActiveCase(TRIAGE);
      expect(first.header!.title).toContain("chest-xray.png");
      expect(first.chat).toHaveLength(1);

      // Tab switches away then back → component remounts but storage is intact.
      const second = rehydrateActiveCase(TRIAGE);
      expect(second.activeCaseId).toBe("case-B");
      expect(second.header!.title).toBe("X-Ray · chest-xray.png");
      expect(second.chat).toHaveLength(1);
      expect(second.chat[0].content).toBe("Is this urgent?");
    });

    it(`[${label} ${width}×${height}] uses the storage keys the production screen depends on`, () => {
      // Guard: drift between this module and AIDoctorScreen would break
      // rehydration silently. Lock the key names.
      expect(LS_ACTIVE_CASE).toBe("vitalis.aidoctor.activeCaseId");
      expect(caseChatKey("xyz")).toBe("vitalis.aidoctor.chat.xyz");
    });

    it(`[${label} ${width}×${height}] switching cases updates the header label and loads the correct per-case chat after a refresh`, () => {
      // Seed two distinct chat threads on disk.
      writeActiveCaseId("case-A");
      writeCaseChat("case-A", [
        { id: "a1", role: "user", content: "Question about blood panel" },
        { id: "a2", role: "assistant", content: "Here is what I see…" },
      ]);
      writeCaseChat("case-B", [
        { id: "b1", role: "user", content: "Is the X-ray clear?" },
      ]);

      // Initial mount → A is active.
      const first = rehydrateActiveCase(TRIAGE);
      expect(first.header!.title).toBe("Blood Test · blood-panel.pdf");
      expect(first.chat.map(m => m.id)).toEqual(["a1", "a2"]);

      // User switches to B (carrying their A draft into storage).
      switchActiveCase({
        fromCaseId: "case-A",
        toCaseId: "case-B",
        fromChat: first.chat,
      });

      // Simulate a hard refresh — fresh rehydration from disk only.
      const afterRefresh = rehydrateActiveCase(TRIAGE);
      expect(afterRefresh.activeCaseId).toBe("case-B");
      expect(afterRefresh.header!.title).toBe("X-Ray · chest-xray.png");
      expect(afterRefresh.chat.map(m => m.id)).toEqual(["b1"]);

      // And A's thread is still independently intact.
      expect(readCaseChat("case-A").map(m => m.id)).toEqual(["a1", "a2"]);
    });

    it(`[${label} ${width}×${height}] never crashes when activeCaseId is missing or unknown and hides the header`, () => {
      // 1) No id stored.
      let result = rehydrateActiveCase(TRIAGE);
      expect(() => resolveChatHeader(TRIAGE, result.activeCaseId)).not.toThrow();
      expect(result.header).toBeNull();
      expect(result.chat).toEqual([]);

      // 2) Unknown id stored.
      writeActiveCaseId("does-not-exist");
      result = rehydrateActiveCase(TRIAGE);
      expect(result.header).toBeNull();
      expect(result.chat).toEqual([]);

      // 3) Garbage chat payload — must not throw.
      g.sessionStorage.setItem(caseChatKey("does-not-exist"), "{not json");
      expect(() => readCaseChat("does-not-exist")).not.toThrow();
      expect(readCaseChat("does-not-exist")).toEqual([]);

      // 4) Empty triage list (e.g. account just signed in) — header stays null.
      expect(resolveChatHeader([], "case-A")).toBeNull();
    });

    it(`[${label} ${width}×${height}] locks every storage key name to prevent silent rehydration regressions`, () => {
      // If any of these literals change, rehydration silently breaks for
      // existing users. Force a deliberate, reviewed update.
      expect(LS_ACTIVE_CASE).toBe("vitalis.aidoctor.activeCaseId");
      expect(caseChatKey("case-A")).toBe("vitalis.aidoctor.chat.case-A");
      expect(caseChatKey("anything-else")).toBe("vitalis.aidoctor.chat.anything-else");

      // Round-trip via the real Storage API to catch any helper drift.
      writeActiveCaseId("case-A");
      expect(g.localStorage.getItem("vitalis.aidoctor.activeCaseId")).toBe("case-A");

      writeCaseChat("case-A", [{ id: "x", role: "user", content: "hi" }]);
      const raw = g.sessionStorage.getItem("vitalis.aidoctor.chat.case-A");
      expect(raw).not.toBeNull();
      expect(JSON.parse(raw!)).toEqual([{ id: "x", role: "user", content: "hi" }]);
    });
  },
);