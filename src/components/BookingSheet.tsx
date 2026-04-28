import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarCheck, ExternalLink, Loader2, CheckCircle2, ChevronRight, Copy, Check, AlertTriangle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CLINIC_PARTNERS, type ClinicPartner, type Severity } from "@/lib/clinic-partners";
import { track } from "@/lib/analytics";
import { supabase } from "@/integrations/supabase/client";
import { describeBookingError } from "@/lib/booking-errors";

/**
 * Mobile-friendly in-app booking flow.
 *
 * - Step 1: Pick a partner and either open the deep-link in a new tab, or
 *   request that we contact them.
 * - Step 2: Validated request form (zod). Persists to `consultation_requests`.
 * - Step 3: Confirmation state.
 *
 * The `Sheet` component renders as a bottom sheet on small viewports and a
 * side sheet on desktop, so a single component covers both.
 */

export interface BookingSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  specialty: string;
  severity: Severity;
  /** Pre-select a partner — defaults to the first one. */
  defaultPartnerId?: string;
  /** Optional list of partners to display; defaults to all configured. */
  partners?: ClinicPartner[];
}

const requestSchema = z.object({
  fullName: z.string().trim().min(2, "Please enter your full name").max(100),
  email: z.string().trim().email("Enter a valid email").max(255),
  phone: z
    .string()
    .trim()
    .max(40)
    .regex(/^[+\d\s().-]{6,}$/, "Enter a valid phone number")
    .optional()
    .or(z.literal("")),
  preferredTime: z.string().trim().max(120).optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional().or(z.literal("")),
});

type Step = "choose" | "form" | "confirmed" | "blocked";

/** How long the submit button stays locked after a successful submit. */
const SUBMIT_LOCK_SECONDS = 60;
/** Look for prior identical requests in the last N minutes when deduping. */
const DEDUPE_WINDOW_MIN = 60;
/** localStorage key — keyed per partner+specialty+email below. */
const LOCK_KEY_PREFIX = "vitalis_booking_lock_";

const normalizeEmail = (e: string) => e.trim().toLowerCase();
const lockKey = (partnerId: string, specialty: string, email: string) =>
  `${LOCK_KEY_PREFIX}${partnerId}::${specialty}::${normalizeEmail(email)}`;

export function BookingSheet({
  open,
  onOpenChange,
  specialty,
  severity,
  defaultPartnerId,
  partners = CLINIC_PARTNERS,
}: BookingSheetProps) {
  const [step, setStep] = useState<Step>("choose");
  const [partnerId, setPartnerId] = useState<string>(defaultPartnerId ?? partners[0]?.id);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "", preferredTime: "", notes: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof typeof form, string>>>({});
  const [blockedInfo, setBlockedInfo] = useState<{ partner: ClinicPartner; url: string; reason: string } | null>(null);
  const [copied, setCopied] = useState(false);
  /** Seconds remaining on submit lock; 0 means unlocked. */
  const [lockSeconds, setLockSeconds] = useState(0);

  const partner = partners.find(p => p.id === partnerId) ?? partners[0];

  useEffect(() => {
    if (open) {
      setStep("choose");
      setErrors({});
      track({ name: "booking_sheet_open", specialty, severity });
    }
  }, [open, specialty, severity]);

  // Hydrate email from current session if available
  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email && !form.email) {
        setForm(f => ({ ...f, email: data.user!.email! }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /** Recompute the remaining lock seconds for the current partner+specialty+email. */
  useEffect(() => {
    if (!partner || !form.email) {
      setLockSeconds(0);
      return;
    }
    const key = lockKey(partner.id, specialty, form.email);
    const tick = () => {
      try {
        const until = Number(localStorage.getItem(key) ?? 0);
        const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
        setLockSeconds(remaining);
      } catch {
        setLockSeconds(0);
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [partner, specialty, form.email]);

  const buildUrl = (p: ClinicPartner) =>
    p.buildBookingUrl ? p.buildBookingUrl(specialty) : p.bookingUrl;

  const openDeepLink = (p: ClinicPartner) => {
    const url = buildUrl(p);
    track({ name: "booking_partner_select", partnerId: p.id, specialty });
    try {
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (win) {
        track({ name: "booking_click", partnerId: p.id, specialty, url, method: "popup" });
        return;
      }
      // Popup blocked (common inside iframes) — escape to top
      if (window.top && window.top !== window.self) {
        window.top.location.href = url;
        track({ name: "booking_click", partnerId: p.id, specialty, url, method: "top" });
        return;
      }
      // Last resort: same-tab navigation
      window.location.href = url;
      track({ name: "booking_click", partnerId: p.id, specialty, url, method: "anchor" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      track({ name: "booking_click_blocked", partnerId: p.id, specialty, url, reason: message });
      toast.error("Couldn't open the booking page", {
        description: `${p.name} link was blocked. Showing copy fallback.`,
      });
      showBlockedFallback(p, url, message);
    }
  };

  const showBlockedFallback = (p: ClinicPartner, url: string, reason: string) => {
    setBlockedInfo({ partner: p, url, reason });
    setCopied(false);
    setStep("blocked");
  };

  const copyUrl = async (url: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopied(true);
      track({ name: "booking_url_copy", url });
      toast.success("Link copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error("Couldn't copy link", { description: message });
    }
  };

  const submitRequest = async () => {
    if (!partner) return;

    // Throttle: prevent re-submits within SUBMIT_LOCK_SECONDS
    if (lockSeconds > 0) {
      track({
        name: "booking_request_throttled",
        partnerId: partner.id,
        specialty,
        remaining_ms: lockSeconds * 1000,
      });
      toast.error("Please wait before submitting again", {
        description: `You can submit another ${specialty} request in ${lockSeconds}s.`,
      });
      return;
    }

    const parsed = requestSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof typeof form;
        if (!fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    track({ name: "booking_request_submit", partnerId: partner.id, specialty });
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const normalizedEmail = normalizeEmail(parsed.data.email);

      // Dedupe — look for an identical pending request in the recent window.
      const sinceIso = new Date(Date.now() - DEDUPE_WINDOW_MIN * 60_000).toISOString();
      const { data: existing, error: dupErr } = await supabase
        .from("consultation_requests")
        .select("id, created_at")
        .eq("partner_id", partner.id)
        .eq("specialty", specialty)
        .eq("email", normalizedEmail)
        .gte("created_at", sinceIso)
        .limit(1);
      if (dupErr) throw dupErr;
      if (existing && existing.length > 0) {
        track({ name: "booking_request_duplicate", partnerId: partner.id, specialty });
        toast.error("Looks like a duplicate", {
          description: `You already submitted this ${specialty} request to ${partner.name} in the last hour.`,
        });
        // Engage the lock so the button is visibly disabled.
        try {
          localStorage.setItem(
            lockKey(partner.id, specialty, parsed.data.email),
            String(Date.now() + SUBMIT_LOCK_SECONDS * 1000),
          );
        } catch {
          /* ignore */
        }
        setLockSeconds(SUBMIT_LOCK_SECONDS);
        setStep("confirmed");
        return;
      }

      const { error } = await supabase.from("consultation_requests").insert({
        user_id: userRes.user?.id ?? null,
        partner_id: partner.id,
        specialty,
        severity,
        full_name: parsed.data.fullName,
        email: normalizedEmail,
        phone: parsed.data.phone || null,
        preferred_time: parsed.data.preferredTime || null,
        notes: parsed.data.notes || null,
      });
      if (error) throw error;

      // Engage the 60s lock for this partner+specialty+email combo.
      try {
        localStorage.setItem(
          lockKey(partner.id, specialty, parsed.data.email),
          String(Date.now() + SUBMIT_LOCK_SECONDS * 1000),
        );
      } catch {
        /* ignore */
      }
      setLockSeconds(SUBMIT_LOCK_SECONDS);

      track({ name: "booking_request_success", partnerId: partner.id, specialty });
      setStep("confirmed");
    } catch (err) {
      const friendly = describeBookingError(err);
      track({
        name: "booking_request_error",
        partnerId: partner.id,
        specialty,
        message: `${friendly.reason}: ${friendly.description}`,
      });
      toast.error(friendly.title, { description: friendly.description });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="rounded-t-2xl max-h-[92vh] overflow-y-auto sm:max-w-lg sm:mx-auto"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-2">
            <CalendarCheck className="w-5 h-5 text-primary" />
            Book a {specialty}
          </SheetTitle>
          <SheetDescription>
            {step === "confirmed"
              ? "Your request was received."
              : "Open a partner's booking page or request a callback."}
          </SheetDescription>
        </SheetHeader>

        {step === "choose" && (
          <div className="space-y-3 mt-4">
            {partners.map(p => {
              const url = buildUrl(p);
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-border/40 bg-card/50 p-3 space-y-2"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <CalendarCheck className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => openDeepLink(p)}
                    >
                      Open booking <ExternalLink className="w-3.5 h-3.5 ml-1.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="flex-1"
                      onClick={() => {
                        setPartnerId(p.id);
                        track({ name: "booking_partner_select", partnerId: p.id, specialty });
                        setStep("form");
                      }}
                    >
                      Request callback <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground break-all">{url}</p>
                </div>
              );
            })}
          </div>
        )}

        {step === "form" && partner && (
          <div className="space-y-3 mt-4">
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-foreground">
              Requesting <span className="font-semibold">{specialty}</span> consultation with{" "}
              <span className="font-semibold">{partner.name}</span>.
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bk-name">Full name</Label>
              <Input
                id="bk-name"
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                aria-invalid={!!errors.fullName}
                maxLength={100}
              />
              {errors.fullName && <p className="text-xs text-destructive">{errors.fullName}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bk-email">Email</Label>
              <Input
                id="bk-email"
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                aria-invalid={!!errors.email}
                maxLength={255}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bk-phone">Phone (optional)</Label>
              <Input
                id="bk-phone"
                type="tel"
                inputMode="tel"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                aria-invalid={!!errors.phone}
                maxLength={40}
              />
              {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bk-time">Preferred time (optional)</Label>
              <Input
                id="bk-time"
                value={form.preferredTime}
                onChange={e => setForm({ ...form, preferredTime: e.target.value })}
                placeholder="e.g. Weekdays after 5pm"
                maxLength={120}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bk-notes">Notes (optional)</Label>
              <Textarea
                id="bk-notes"
                rows={3}
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                maxLength={1000}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep("choose")} disabled={submitting}>
                Back
              </Button>
              <Button className="flex-1" onClick={submitRequest} disabled={submitting}>
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit request"}
              </Button>
            </div>
          </div>
        )}

        {step === "confirmed" && partner && (
          <div className="mt-6 flex flex-col items-center text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <p className="text-base font-semibold text-foreground">Request sent</p>
              <p className="text-xs text-muted-foreground mt-1">
                We've logged your {specialty} consultation request with {partner.name}.
                You'll receive a confirmation at {form.email}.
              </p>
            </div>
            <Button className="w-full mt-2" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        )}

        {step === "blocked" && blockedInfo && (
          <div className="space-y-4 mt-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-foreground">
                <p className="font-semibold">Link couldn't open automatically</p>
                <p className="text-muted-foreground mt-1">
                  Your browser blocked the popup to {blockedInfo.partner.name}. Copy the link below
                  and paste it into a new tab, or try opening it again.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bk-url">Booking URL</Label>
              <Textarea
                id="bk-url"
                readOnly
                value={blockedInfo.url}
                rows={3}
                className="font-mono text-xs break-all"
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => copyUrl(blockedInfo.url)}
              >
                {copied ? (
                  <><Check className="w-4 h-4 mr-1.5" /> Copied</>
                ) : (
                  <><Copy className="w-4 h-4 mr-1.5" /> Copy link</>
                )}
              </Button>
              <Button
                className="flex-1"
                asChild
              >
                <a
                  href={blockedInfo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track({ name: "booking_click", partnerId: blockedInfo.partner.id, specialty, url: blockedInfo.url, method: "anchor_fallback" })}
                >
                  Try opening <ExternalLink className="w-4 h-4 ml-1.5" />
                </a>
              </Button>
            </div>

            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setStep("choose")}>
                Back
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setPartnerId(blockedInfo.partner.id);
                  setStep("form");
                }}
              >
                Request callback instead
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

export default BookingSheet;