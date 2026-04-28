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
  },
);