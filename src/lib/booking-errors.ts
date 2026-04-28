/**
 * Maps Supabase / PostgREST / RLS error shapes to friendly toast messages
 * for the booking + consultation request flow.
 *
 * Supabase errors come in a few flavors:
 *  - PostgrestError: { code, message, details, hint }
 *  - AuthError:      { status, name, message }
 *  - FunctionsError: { name, message, context }
 *  - Plain Error or string
 *
 * Codes we handle explicitly:
 *  - 42501          insufficient_privilege  → RLS denied
 *  - PGRST301       JWT missing/invalid     → not signed in
 *  - 23505          unique_violation        → duplicate request
 *  - 23502/23503    not-null / fk           → missing data
 *  - 22P02          invalid_text_representation
 *  - "Failed to fetch" / network            → offline
 */

export interface FriendlyError {
  title: string;
  description: string;
  /** Short token used for analytics — not shown to the user. */
  reason: string;
}

interface MaybeError {
  message?: string;
  code?: string;
  status?: number;
  details?: string;
  hint?: string;
  name?: string;
}

function asErr(err: unknown): MaybeError {
  if (!err) return {};
  if (typeof err === "string") return { message: err };
  if (err instanceof Error) return { message: err.message, name: err.name };
  return err as MaybeError;
}

export function describeBookingError(err: unknown): FriendlyError {
  const e = asErr(err);
  const msg = (e.message ?? "").toLowerCase();
  const code = e.code ?? "";

  // Network / offline
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("load failed") ||
    e.name === "TypeError"
  ) {
    return {
      title: "You appear to be offline",
      description:
        "We couldn't reach our servers. Check your connection and try again.",
      reason: "network",
    };
  }

  // RLS / permission errors
  if (code === "42501" || msg.includes("row-level security") || msg.includes("permission denied")) {
    return {
      title: "Sign in required",
      description:
        "You need to be signed in to submit a consultation request. Please sign in and try again.",
      reason: "rls",
    };
  }

  // Missing/invalid JWT
  if (
    code === "PGRST301" ||
    e.status === 401 ||
    msg.includes("jwt") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid token")
  ) {
    return {
      title: "Your session expired",
      description: "Please sign in again to submit your request.",
      reason: "auth",
    };
  }

  // Duplicate row
  if (code === "23505" || msg.includes("duplicate key") || msg.includes("unique constraint")) {
    return {
      title: "You already requested this",
      description:
        "It looks like you already submitted a matching request recently. Check your existing consultations.",
      reason: "duplicate",
    };
  }

  // Missing required field
  if (code === "23502" || msg.includes("not-null") || msg.includes("violates not-null")) {
    return {
      title: "Missing information",
      description: "A required field was empty. Double-check the form and try again.",
      reason: "missing_field",
    };
  }

  // Bad value
  if (code === "22P02" || msg.includes("invalid input syntax")) {
    return {
      title: "Couldn't validate your details",
      description: "One of the fields contains an invalid value. Please review and resubmit.",
      reason: "invalid_value",
    };
  }

  // Server / Edge function timeouts
  if (e.status === 504 || msg.includes("timeout") || msg.includes("timed out")) {
    return {
      title: "The server took too long to respond",
      description: "Please try again in a moment.",
      reason: "timeout",
    };
  }

  // 5xx
  if (typeof e.status === "number" && e.status >= 500) {
    return {
      title: "Something went wrong on our end",
      description: "We've been notified. Please try again shortly.",
      reason: "server_5xx",
    };
  }

  // Fallback — show the original message but framed politely
  return {
    title: "Couldn't submit request",
    description: e.message
      ? e.message
      : "An unexpected error occurred. Please try again.",
    reason: "unknown",
  };
}