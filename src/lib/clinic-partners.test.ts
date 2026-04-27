// @vitest-environment node
import { describe, it, expect } from "vitest";
import { CLINIC_PARTNERS } from "./clinic-partners";

/**
 * The booking buttons rely on `buildBookingUrl(specialty)` returning a URL
 * where the specialty is correctly URL-encoded as a query parameter. If
 * encoding is wrong, partners receive garbled or unsafe input — so we
 * gate the booking UI on these tests passing.
 */

const SPECIALTIES = [
  "Cardiologist",
  "Endocrinolog & Diabetolog",
  "Medic ORL",
  "Specialist <script>alert(1)</script>",
  "Café Médecin",
];

describe("clinic partners deep-link encoding", () => {
  for (const partnerId of ["regina-maria", "sanador"] as const) {
    const partner = CLINIC_PARTNERS.find(p => p.id === partnerId)!;

    it(`${partnerId} is configured with a buildBookingUrl`, () => {
      expect(partner).toBeDefined();
      expect(typeof partner.buildBookingUrl).toBe("function");
    });

    for (const specialty of SPECIALTIES) {
      it(`${partnerId} encodes "${specialty}" safely`, () => {
        const url = partner.buildBookingUrl!(specialty);
        const parsed = new URL(url);

        // Round-trips: the decoded query value must equal the original specialty.
        const value = parsed.searchParams.get("specialitate");
        expect(value).toBe(specialty);

        // Must not contain raw spaces or unsafe chars in the raw URL string.
        const raw = url.split("?")[1] ?? "";
        expect(raw).not.toMatch(/[ <>"]/);
        expect(raw).toContain("specialitate=");
        expect(raw).toContain(encodeURIComponent(specialty));
      });
    }
  }
});