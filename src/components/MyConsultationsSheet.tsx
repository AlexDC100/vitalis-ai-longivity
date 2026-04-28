import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar,
  Loader2,
  RefreshCw,
  CalendarCheck,
  Phone,
  Clock,
  Inbox,
  CheckCircle2,
  XCircle,
  Hourglass,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CLINIC_PARTNERS } from "@/lib/clinic-partners";
import { describeBookingError } from "@/lib/booking-errors";
import { toast } from "sonner";

/**
 * Mobile-friendly consultation history view.
 *
 * Pulls from `consultation_requests` (RLS-scoped to the signed-in user) and
 * groups them by status. Read-only — users can't currently update or delete
 * a request from the client (no UPDATE/DELETE RLS policy), which matches the
 * intent of an audit log of submissions.
 */

interface ConsultationRequest {
  id: string;
  created_at: string;
  partner_id: string;
  specialty: string;
  severity: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  preferred_time: string | null;
  notes: string | null;
  status: string;
}

interface MyConsultationsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_META: Record<
  string,
  { label: string; tone: string; Icon: typeof Hourglass }
> = {
  pending: { label: "Pending", tone: "bg-amber-500/15 text-amber-300 border-amber-500/30", Icon: Hourglass },
  contacted: { label: "Contacted", tone: "bg-sky-500/15 text-sky-300 border-sky-500/30", Icon: Phone },
  scheduled: { label: "Scheduled", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CalendarCheck },
  completed: { label: "Completed", tone: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: CheckCircle2 },
  cancelled: { label: "Cancelled", tone: "bg-muted/40 text-muted-foreground border-border/40", Icon: XCircle },
};

function partnerName(id: string): string {
  return CLINIC_PARTNERS.find((p) => p.id === id)?.name ?? id;
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export default function MyConsultationsSheet({
  open,
  onOpenChange,
}: MyConsultationsSheetProps) {
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState<ConsultationRequest[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("consultation_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRequests((data ?? []) as ConsultationRequest[]);
    } catch (err) {
      const friendly = describeBookingError(err);
      toast.error(friendly.title, { description: friendly.description });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto bg-background border-border/50 p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 text-left">
          <div className="flex items-start justify-between gap-2">
            <div>
              <SheetTitle className="text-lg font-semibold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-primary" />
                My Consultations
              </SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground">
                Submitted requests and their current status.
              </SheetDescription>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={load}
              disabled={loading}
              aria-label="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </SheetHeader>

        <div className="px-4 py-4 space-y-3">
          {loading && requests.length === 0 && (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {!loading && requests.length === 0 && (
            <div className="flex flex-col items-center text-center py-12 px-4 gap-2 text-muted-foreground">
              <div className="w-12 h-12 rounded-full bg-muted/30 flex items-center justify-center">
                <Inbox className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-foreground">No requests yet</p>
              <p className="text-xs">
                When you book a specialist from the AI Doctor screen, your requests
                appear here.
              </p>
            </div>
          )}

          {requests.map((r) => {
            const meta = STATUS_META[r.status] ?? STATUS_META.pending;
            const StatusIcon = meta.Icon;
            return (
              <article
                key={r.id}
                className="rounded-xl border border-border/40 bg-card/60 p-4 space-y-2.5"
              >
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {r.specialty}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      with {partnerName(r.partner_id)}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className={`${meta.tone} text-[10px] uppercase tracking-wide font-medium gap-1 shrink-0`}
                  >
                    <StatusIcon className="w-3 h-3" />
                    {meta.label}
                  </Badge>
                </header>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>Submitted {fmtDate(r.created_at)}</span>
                  </div>
                  {r.preferred_time && (
                    <div className="flex items-center gap-1.5">
                      <CalendarCheck className="w-3 h-3 shrink-0" />
                      <span>Preferred: {r.preferred_time}</span>
                    </div>
                  )}
                  {r.phone && (
                    <div className="flex items-center gap-1.5">
                      <Phone className="w-3 h-3 shrink-0" />
                      <span>{r.phone}</span>
                    </div>
                  )}
                </div>

                {r.notes && (
                  <p className="text-xs text-foreground/80 bg-muted/20 rounded-md px-2.5 py-1.5">
                    {r.notes}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}