// Clinic partner registry.
//
// This is structured as an array so we can plug in additional providers
// later (and eventually filter by user location / severity / specialty
// without changing call sites). For now we keep it simple and curated.
//
// IMPORTANT: keep this file free of UI code so it can be reused on the
// server / in tests.

export type Severity = "LOW" | "MODERATE" | "HIGH" | "URGENT";

export interface ClinicPartner {
  id: string;
  name: string;
  /** Where the user lands when they click "Book appointment". */
  bookingUrl: string;
  /** Optional country / region scope — used in the future for location filtering. */
  region?: string;
  /** Severities this partner is appropriate for. */
  severities: Severity[];
  /** Short descriptor shown in the card. */
  description: string;
}

export const CLINIC_PARTNERS: ClinicPartner[] = [
  {
    id: "regina-maria",
    name: "Regina Maria",
    bookingUrl: "https://www.reginamaria.ro/programari",
    region: "RO",
    severities: ["HIGH", "URGENT"],
    description: "Private medical network — book a specialist consultation online.",
  },
];

/**
 * Pick the best partner for a given severity. Returns `null` when no
 * partner is appropriate (e.g. LOW / MODERATE) so callers can decide
 * whether to show a generic "find near you" fallback instead.
 */
export function pickPartner(severity: Severity): ClinicPartner | null {
  return CLINIC_PARTNERS.find(p => p.severities.includes(severity)) ?? null;
}