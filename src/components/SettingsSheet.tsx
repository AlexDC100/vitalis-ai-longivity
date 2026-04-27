import { useEffect, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  User as UserIcon,
  Settings as SettingsIcon,
  Database,
  ShieldCheck,
  LogOut,
  Trash2,
  Download,
  Bell,
  Ruler,
  Moon,
  ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "@/lib/health-context";
import { toast } from "sonner";

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignOut: () => void;
}

type Units = "metric" | "imperial";

const PREF_KEYS = {
  units: "vitalis_pref_units",
  notifications: "vitalis_pref_notifications",
};

export default function SettingsSheet({ open, onOpenChange, onSignOut }: SettingsSheetProps) {
  const { profile, userId } = useHealth();
  const [email, setEmail] = useState<string>("");
  const [units, setUnits] = useState<Units>("metric");
  const [notifications, setNotifications] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
    });
    try {
      const u = localStorage.getItem(PREF_KEYS.units);
      if (u === "metric" || u === "imperial") setUnits(u);
      const n = localStorage.getItem(PREF_KEYS.notifications);
      if (n !== null) setNotifications(n === "true");
    } catch {
      /* ignore */
    }
  }, [open]);

  const saveUnits = (next: Units) => {
    setUnits(next);
    try { localStorage.setItem(PREF_KEYS.units, next); } catch { /* ignore */ }
    toast.success(`Units set to ${next}`);
  };

  const saveNotifications = (next: boolean) => {
    setNotifications(next);
    try { localStorage.setItem(PREF_KEYS.notifications, String(next)); } catch { /* ignore */ }
  };

  const exportData = async () => {
    setBusy(true);
    try {
      const payload = {
        exported_at: new Date().toISOString(),
        email,
        profile,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vitalis-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported");
    } catch {
      toast.error("Export failed");
    } finally {
      setBusy(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!email) return toast.error("No email on file");
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Reset link sent", { description: `Check ${email}` });
  };

  const deleteAllData = async () => {
    if (!userId) return;
    if (!confirm("Delete ALL your health data? This cannot be undone.")) return;
    setBusy(true);
    try {
      await Promise.all([
        supabase.from("medical_documents").delete().eq("user_id", userId),
        supabase.from("user_substances").delete().eq("user_id", userId),
        supabase.from("user_family_history").delete().eq("user_id", userId),
        supabase.from("health_snapshots").delete().eq("user_id", userId),
        supabase.from("intake_sessions").delete().eq("user_id", userId),
        supabase.from("action_completions").delete().eq("user_id", userId),
      ]);
      toast.success("All health data deleted");
    } catch {
      toast.error("Delete failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md overflow-y-auto bg-background border-border/50 p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/30 text-left">
          <SheetTitle className="text-lg font-semibold">Settings</SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            Manage your account, preferences and data.
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-5 space-y-7">
          {/* Account */}
          <Section icon={UserIcon} title="Account">
            <Row label="Email" value={email || "—"} />
            <Row label="User ID" value={userId ? userId.slice(0, 8) + "…" : "—"} mono />
            <Button
              variant="vitalis-outline"
              size="sm"
              className="w-full mt-2"
              onClick={sendPasswordReset}
              disabled={busy || !email}
            >
              Send password reset email
            </Button>
          </Section>

          {/* Preferences */}
          <Section icon={SettingsIcon} title="Preferences">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ruler className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm">Units</Label>
              </div>
              <div className="flex rounded-lg bg-muted/40 p-0.5 text-xs">
                {(["metric", "imperial"] as Units[]).map((u) => (
                  <button
                    key={u}
                    onClick={() => saveUnits(u)}
                    className={`px-3 py-1 rounded-md transition ${
                      units === u
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {u === "metric" ? "kg / cm" : "lb / in"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm" htmlFor="notif-switch">Notifications</Label>
              </div>
              <Switch
                id="notif-switch"
                checked={notifications}
                onCheckedChange={saveNotifications}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Moon className="w-4 h-4 text-muted-foreground" />
                <Label className="text-sm">Theme</Label>
              </div>
              <span className="text-xs text-muted-foreground">Dark (default)</span>
            </div>
          </Section>

          {/* Data */}
          <Section icon={Database} title="Your Data">
            <Button
              variant="vitalis-outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={exportData}
              disabled={busy}
            >
              <Download className="w-4 h-4" />
              Export my data (JSON)
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={deleteAllData}
              disabled={busy}
            >
              <Trash2 className="w-4 h-4" />
              Delete all health data
            </Button>
          </Section>

          {/* Privacy & legal */}
          <Section icon={ShieldCheck} title="Privacy & Safety">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Vitalis stores your medical data securely and never sells it. AI
              outputs are informational only.
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200/90">
              This app does not replace a licensed doctor.
            </div>
            <a
              href="https://vital-is.life"
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
            >
              Privacy policy <ExternalLink className="w-3 h-3" />
            </a>
          </Section>

          {/* Sign out */}
          <div className="pt-2 border-t border-border/30">
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive"
              onClick={() => {
                onOpenChange(false);
                onSignOut();
              }}
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
