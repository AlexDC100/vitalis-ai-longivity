/**
 * Lightweight, provider-agnostic analytics.
 *
 * Events are:
 *   1. pushed to `window.dataLayer` (GA4 / GTM auto-pickup if installed)
 *   2. dispatched as a `CustomEvent("vitalis:analytics")` for any custom listener
 *   3. logged to the console in dev for easy debugging
 *
 * To wire a real provider (GA4, PostHog, Segment, etc.) later, just listen
 * to the custom event or initialize the provider in index.html — no code
 * changes needed in the components.
 */

export type AuthMethod = "google" | "apple" | "email";

export type AnalyticsEvent =
  | { name: "auth_sign_in_attempt"; method: AuthMethod }
  | { name: "auth_create_account_attempt"; method: AuthMethod }
  | { name: "auth_success"; method: AuthMethod; mode: "sign_in" | "sign_up" }
  | { name: "auth_error"; method: AuthMethod; mode: "sign_in" | "sign_up"; message?: string }
  | { name: "auth_tab_switch"; to: "sign_in" | "sign_up" }
  | { name: "pricing_preview_view"; plan?: string }
  | { name: "pricing_billing_toggle"; cycle: "monthly" | "annual" }
  | { name: "how_it_works_open" }
  // Password recovery funnel
  | { name: "password_reset_requested" }
  | { name: "password_reset_email_sent" }
  | { name: "password_reset_email_error"; message?: string }
  | { name: "password_reset_token_invalid"; reason?: string }
  | { name: "password_reset_completed" }
  // Booking funnel
  | { name: "booking_sheet_open"; specialty: string; severity: string }
  | { name: "booking_partner_select"; partnerId: string; specialty: string }
  | { name: "booking_click"; partnerId: string; specialty: string; url: string; method: "popup" | "top" | "anchor" }
  | { name: "booking_click_blocked"; partnerId: string; specialty: string; url: string; reason: string }
  | { name: "booking_request_submit"; partnerId: string; specialty: string }
  | { name: "booking_request_success"; partnerId: string; specialty: string }
  | { name: "booking_request_error"; partnerId: string; specialty: string; message?: string };

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function track(event: AnalyticsEvent) {
  if (typeof window === "undefined") return;

  const payload = {
    event: event.name,
    ...event,
    ts: Date.now(),
  };

  // 1. dataLayer push (GA4 / GTM)
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(payload);

  // 2. CustomEvent for arbitrary listeners
  try {
    window.dispatchEvent(new CustomEvent("vitalis:analytics", { detail: payload }));
  } catch {
    /* no-op */
  }

  // 3. Dev log
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.debug("[analytics]", event.name, payload);
  }
}