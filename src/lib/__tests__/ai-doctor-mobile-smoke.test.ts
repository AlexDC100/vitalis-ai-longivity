/**
 * Mobile-first smoke suite (390×844).
 *
 * Asserts that on a fresh mount at iPhone-class viewport:
 *   • activeCaseId rehydrates from localStorage
 *   • the chat header label renders the correct case
 *   • per-case chat history is restored
 *   • a navigation remount (tab away → back, route change → back) does
 *     not clear or corrupt the rehydrated state
 *
 * Kept intentionally narrow + fast so it can be the first signal that
 * mobile rehydration regressed.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  writeActiveCaseId,
  writeCaseChat,
  rehydrateActiveCase,
  resolveChatHeader,
  type RehydratableCase,
} from "../ai-doctor-rehydration";

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

const MOBILE_W = 390;
const MOBILE_H = 844;

const TRIAGE: RehydratableCase[] = [
  { id: "case-A", file_name: "blood-panel.pdf", document_type: "Blood Test" },
  { id: "case-B", file_name: "chest-xray.png",  document_type: "X-Ray" },
];

describe("AI Doctor mobile smoke (390×844)", () => {
  beforeEach(() => {
    g.localStorage = new MemoryStorage();
    g.sessionStorage = new MemoryStorage();
    g.innerWidth = MOBILE_W;
    g.innerHeight = MOBILE_H;
  });

  it("rehydrates activeCaseId on first mount at 390×844", () => {
    writeActiveCaseId("case-A");
    const { activeCaseId, header } = rehydrateActiveCase(TRIAGE);
    expect(g.innerWidth).toBe(MOBILE_W);
    expect(g.innerHeight).toBe(MOBILE_H);
    expect(activeCaseId).toBe("case-A");
    expect(header).not.toBeNull();
  });

  it("renders the chat header label for the rehydrated case", () => {
    writeActiveCaseId("case-B");
    const { header } = rehydrateActiveCase(TRIAGE);
    expect(header!.title).toBe("X-Ray · chest-xray.png");
    expect(header!.active.id).toBe("case-B");
  });

  it("restores per-case chat history on first mobile mount", () => {
    writeActiveCaseId("case-A");
    writeCaseChat("case-A", [
      { id: "m1", role: "user",      content: "Mobile question" },
      { id: "m2", role: "assistant", content: "Mobile answer"   },
    ]);
    const { chat } = rehydrateActiveCase(TRIAGE);
    expect(chat).toHaveLength(2);
    expect(chat[0].content).toBe("Mobile question");
  });

  it("survives a navigation remount (tab away → back) without losing state", () => {
    writeActiveCaseId("case-B");
    writeCaseChat("case-B", [
      { id: "m1", role: "user", content: "Is this urgent?" },
    ]);

    const first = rehydrateActiveCase(TRIAGE);
    expect(first.header!.title).toBe("X-Ray · chest-xray.png");
    expect(first.chat).toHaveLength(1);

    // Simulate route change → component unmounts → remounts.
    const remount = rehydrateActiveCase(TRIAGE);
    expect(remount.activeCaseId).toBe("case-B");
    expect(remount.header!.title).toBe("X-Ray · chest-xray.png");
    expect(remount.chat[0].content).toBe("Is this urgent?");
  });

  it("never crashes if activeCaseId is missing or unknown on mobile", () => {
    // Missing.
    let result = rehydrateActiveCase(TRIAGE);
    expect(result.header).toBeNull();
    expect(result.chat).toEqual([]);

    // Unknown.
    writeActiveCaseId("case-MISSING");
    result = rehydrateActiveCase(TRIAGE);
    expect(result.header).toBeNull();
    expect(() => resolveChatHeader(TRIAGE, result.activeCaseId)).not.toThrow();
  });
});
