/**
 * End-to-end persistence checks for hospital mode + multi-file upload queue.
 *
 * Verifies that after a refresh OR a tab switch (component remount):
 *   • hospitalMode toggle state is restored from localStorage
 *   • the in-flight upload queue (with per-file status + priority) is
 *     restored from sessionStorage
 *   • the active triage case + per-case chat continue to rehydrate cleanly
 *
 * Runs at both mobile (390×844) and web (1366×768) viewports.
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  LS_HOSPITAL_MODE,
  SS_UPLOAD_QUEUE,
  readHospitalMode,
  writeHospitalMode,
  readUploadQueue,
  writeUploadQueue,
  clearUploadQueue,
  writeActiveCaseId,
  readActiveCaseId,
  writeCaseChat,
  rehydrateActiveCase,
  type RehydratableQueueItem,
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

const TRIAGE: RehydratableCase[] = [
  { id: "case-A", file_name: "blood-panel.pdf", document_type: "Blood Test" },
  { id: "case-B", file_name: "chest-xray.png",  document_type: "X-Ray" },
];

const VIEWPORTS: Array<["mobile" | "web", number, number]> = [
  ["mobile", 390, 844],
  ["web",   1366, 768],
];

describe.each(VIEWPORTS)(
  "Hospital mode + upload queue persistence (%s viewport)",
  (label, width, height) => {
    beforeEach(() => {
      g.localStorage = new MemoryStorage();
      g.sessionStorage = new MemoryStorage();
      g.innerWidth = width;
      g.innerHeight = height;
    });

    it(`[${label}] hospital-mode toggle persists across refresh`, () => {
      expect(readHospitalMode()).toBe(false);
      writeHospitalMode(true);
      // Simulate refresh: only storage survives.
      expect(readHospitalMode()).toBe(true);
      expect(g.localStorage.getItem(LS_HOSPITAL_MODE)).toBe("1");

      writeHospitalMode(false);
      expect(readHospitalMode()).toBe(false);
      expect(g.localStorage.getItem(LS_HOSPITAL_MODE)).toBe("0");
    });

    it(`[${label}] multi-file upload queue with per-file status survives a refresh`, () => {
      const queue: RehydratableQueueItem[] = [
        { id: "q1", fileName: "panel.pdf",   status: "completed", priority: "high" },
        { id: "q2", fileName: "ecg.pdf",     status: "analyzing", priority: null },
        { id: "q3", fileName: "ct-scan.pdf", status: "queued",    priority: null },
        { id: "q4", fileName: "old.pdf",     status: "error",     priority: "low" },
      ];
      writeHospitalMode(true);
      writeUploadQueue(queue);

      // "Refresh" — read back from raw storage layer.
      const restored = readUploadQueue();
      expect(restored).toHaveLength(4);
      expect(restored.map(q => q.status)).toEqual([
        "completed", "analyzing", "queued", "error",
      ]);
      expect(restored.find(q => q.id === "q1")?.priority).toBe("high");
      expect(readHospitalMode()).toBe(true);
    });

    it(`[${label}] selected case + queue both rehydrate together (refresh)`, () => {
      writeHospitalMode(true);
      writeActiveCaseId("case-B");
      writeCaseChat("case-B", [
        { id: "m1", role: "user", content: "Triage this please" },
      ]);
      writeUploadQueue([
        { id: "q1", fileName: "ecg.pdf", status: "analyzing", priority: null },
      ]);

      // Simulated refresh.
      const { activeCaseId, header, chat } = rehydrateActiveCase(TRIAGE);
      expect(readHospitalMode()).toBe(true);
      expect(activeCaseId).toBe("case-B");
      expect(header!.title).toBe("X-Ray · chest-xray.png");
      expect(chat).toHaveLength(1);
      expect(readUploadQueue()).toHaveLength(1);
    });

    it(`[${label}] tab switch (remount) does not lose queue or selected case`, () => {
      writeHospitalMode(true);
      writeActiveCaseId("case-A");
      writeUploadQueue([
        { id: "q1", fileName: "a.pdf", status: "completed", priority: "high" },
        { id: "q2", fileName: "b.pdf", status: "queued",    priority: null  },
      ]);

      // First mount.
      const first = rehydrateActiveCase(TRIAGE);
      expect(first.activeCaseId).toBe("case-A");
      expect(readUploadQueue()).toHaveLength(2);

      // Tab away, tab back — same storage, fresh read.
      const second = rehydrateActiveCase(TRIAGE);
      expect(second.activeCaseId).toBe("case-A");
      expect(second.header!.title).toBe("Blood Test · blood-panel.pdf");
      expect(readUploadQueue().map(q => q.id)).toEqual(["q1", "q2"]);
    });

    it(`[${label}] clearing the queue empties storage but leaves activeCaseId intact`, () => {
      writeActiveCaseId("case-A");
      writeUploadQueue([
        { id: "q1", fileName: "x.pdf", status: "completed", priority: "high" },
      ]);
      clearUploadQueue();
      expect(readUploadQueue()).toEqual([]);
      expect(readActiveCaseId()).toBe("case-A");
    });

    it(`[${label}] locks hospital-mode + queue storage keys (regression guard)`, () => {
      expect(LS_HOSPITAL_MODE).toBe("vitalis.aidoctor.hospitalMode");
      expect(SS_UPLOAD_QUEUE).toBe("vitalis.aidoctor.uploadQueue");
    });
  },
);
