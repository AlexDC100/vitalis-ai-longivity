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
import { Input } from "@/components/ui/input";
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
  KeyRound,
  Mail,
  AlertTriangle,
  Lock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useHealth } from "@/lib/health-context";
import { toast } from "sonner";
import JSZip from "jszip";
import { downloadHealthReport } from "@/lib/health-report";
import { useSubstances } from "@/lib/use-substances";
import MyConsultationsSheet from "@/components/MyConsultationsSheet";
import { FileText, Calendar } from "lucide-react";

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

interface PrivacySettings {
  keep_snapshots: boolean;
  keep_documents: boolean;
  retention_days: number;
}

const DEFAULT_PRIVACY: PrivacySettings = {
  keep_snapshots: true,
  keep_documents: true,
  retention_days: 0,
};

const RETENTION_OPTIONS = [
  { label: "Forever", value: 0 },
  { label: "1 year", value: 365 },
  { label: "6 months", value: 180 },
  { label: "30 days", value: 30 },
];

// Tables to include in CSV export
const EXPORT_TABLES = [
  "health_profiles",
  "health_snapshots",
  "medical_documents",
  "user_substances",
  "user_family_history",
  "intake_sessions",
  "action_completions",
  "user_privacy_settings",
] as const;

function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set()),
  );
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    cols.join(","),
    ...rows.map((r) => cols.map((c) => escape(r[c])).join(",")),
  ].join("\n");
}

export default function SettingsSheet({
  open,
  onOpenChange,
  onSignOut,
}: SettingsSheetProps) {
  const { profile, userId } = useHealth();
  const { substances } = useSubstances();
  const [email, setEmail] = useState<string>("");
  const [units, setUnits] = useState<Units>("metric");
  const [notifications, setNotifications] = useState<boolean>(true);
  const [busy, setBusy] = useState(false);
  const [showConsultations, setShowConsultations] = useState(false);

  // Change password
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");

  // Update email
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  // Privacy
  const [privacy, setPrivacy] = useState<PrivacySettings>(DEFAULT_PRIVACY);

  // ------- Data: HTML health report export -------
  const exportHtmlReport = () => {
    try {
      downloadHealthReport({ profile, substances, email });
      toast.success("HTML report downloaded", {
        description: "Open it in any browser or print to PDF.",
      });
    } catch (e) {
      toast.error("Couldn't generate report", {
        description: (e as Error).message,
      });
    }
  };

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
    if (userId) {
      supabase
        .from("user_privacy_settings")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle()
        .then(({ data }) => {
          if (data) {
            setPrivacy({
              keep_snapshots: data.keep_snapshots,
              keep_documents: data.keep_documents,
              retention_days: data.retention_days,
            });
          }
        });
    }
  }, [open, userId]);

  const saveUnits = (next: Units) => {
    setUnits(next);
    try {
      localStorage.setItem(PREF_KEYS.units, next);
    } catch {
      /* ignore */
    }
    toast.success(`Units set to ${next}`);
  };

  const saveNotifications = (next: boolean) => {
    setNotifications(next);
    try {
      localStorage.setItem(PREF_KEYS.notifications, String(next));
    } catch {
      /* ignore */
    }
  };

  // ------- Account: Change password -------
  const submitPasswordChange = async () => {
    if (!email) return toast.error("No email on file");
    if (newPw.length < 8)
      return toast.error("New password must be at least 8 characters");
    if (newPw !== confirmPw) return toast.error("Passwords do not match");
    if (newPw === currentPw)
      return toast.error("New password must be different");

    setBusy(true);
    // Re-verify current password
    const { error: verifyErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPw,
    });
    if (verifyErr) {
      setBusy(false);
      return toast.error("Current password is incorrect");
    }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated");
    setCurrentPw("");
    setNewPw("");
    setConfirmPw("");
    setShowPwForm(false);
  };

  // ------- Account: Update email -------
  const submitEmailChange = async () => {
    const trimmed = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
      return toast.error("Enter a valid email");
    if (trimmed === email.toLowerCase())
      return toast.error("That's already your email");

    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email: trimmed },
      { emailRedirectTo: window.location.origin },
    );
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Verification sent", {
      description: `Check ${trimmed} to confirm the change.`,
    });
    setNewEmail("");
    setShowEmailForm(false);
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

  // ------- Data: ZIP export (JSON + CSV per table) -------
  const exportData = async () => {
    if (!userId) return;
    setBusy(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("vitalis-export")!;

      const summary: Record<string, unknown> = {
        exported_at: new Date().toISOString(),
        email,
        user_id: userId,
        profile,
      };
      folder.file("summary.json", JSON.stringify(summary, null, 2));

      const csvFolder = folder.folder("csv")!;
      const jsonFolder = folder.folder("json")!;

      for (const table of EXPORT_TABLES) {
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("user_id", userId);
        if (error) continue;
        const rows = data ?? [];
        jsonFolder.file(`${table}.json`, JSON.stringify(rows, null, 2));
        csvFolder.file(`${table}.csv`, rowsToCsv(rows));
      }

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vitalis-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export ready", { description: "Downloaded as ZIP." });
    } catch (e) {
      toast.error("Export failed", {
        description: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  // ------- Data: delete data only -------
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

  // ------- Data: Delete entire account -------
  const deleteAccount = async () => {
    if (!userId) return;
    const phrase = prompt(
      'This will PERMANENTLY delete your account and all data.\n\nType "DELETE" to confirm.',
    );
    if (phrase !== "DELETE") return;
    setBusy(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const { error } = await supabase.functions.invoke("delete-account", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (error) throw error;

      toast.success("Account deleted");
      await supabase.auth.signOut();
      onOpenChange(false);
      onSignOut();
    } catch (e) {
      toast.error("Could not delete account", {
        description: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  // ------- Privacy controls -------
  const updatePrivacy = async (patch: Partial<PrivacySettings>) => {
    if (!userId) return;
    const next = { ...privacy, ...patch };
    setPrivacy(next);
    const { error } = await supabase.from("user_privacy_settings").upsert(
      {
        user_id: userId,
        ...next,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) {
      toast.error("Couldn't save privacy settings");
      return;
    }
    // Apply destructive toggles immediately
    if (patch.keep_snapshots === false) {
      await supabase.from("health_snapshots").delete().eq("user_id", userId);
      toast.success("Snapshots cleared and disabled");
    }
    if (patch.keep_documents === false) {
      await supabase.from("medical_documents").delete().eq("user_id", userId);
      toast.success("Document history cleared and disabled");
    }
    if (patch.retention_days !== undefined && patch.retention_days > 0) {
      const cutoff = new Date(
        Date.now() - patch.retention_days * 24 * 60 * 60 * 1000,
      ).toISOString();
      await Promise.all([
        supabase
          .from("health_snapshots")
          .delete()
          .eq("user_id", userId)
          .lt("created_at", cutoff),
        supabase
          .from("medical_documents")
          .delete()
          .eq("user_id", userId)
          .lt("created_at", cutoff),
      ]);
      toast.success(
        `Retention set: data older than ${patch.retention_days} days removed`,
      );
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
            <Row
              label="User ID"
              value={userId ? userId.slice(0, 8) + "…" : "—"}
              mono
            />

            {/* Change password */}
            {!showPwForm ? (
              <Button
                variant="vitalis-outline"
                size="sm"
                className="w-full justify-start gap-2 mt-2"
                onClick={() => setShowPwForm(true)}
                disabled={busy}
              >
                <KeyRound className="w-4 h-4" />
                Change password
              </Button>
            ) : (
              <div className="space-y-2 mt-2 p-3 rounded-lg border border-border/40 bg-muted/20">
                <Label className="text-xs">Current password</Label>
                <Input
                  type="password"
                  value={currentPw}
                  autoComplete="current-password"
                  onChange={(e) => setCurrentPw(e.target.value)}
                />
                <Label className="text-xs">New password (min 8 chars)</Label>
                <Input
                  type="password"
                  value={newPw}
                  autoComplete="new-password"
                  onChange={(e) => setNewPw(e.target.value)}
                />
                <Label className="text-xs">Confirm new password</Label>
                <Input
                  type="password"
                  value={confirmPw}
                  autoComplete="new-password"
                  onChange={(e) => setConfirmPw(e.target.value)}
                />
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="vitalis"
                    className="flex-1"
                    onClick={submitPasswordChange}
                    disabled={busy}
                  >
                    Update password
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowPwForm(false);
                      setCurrentPw("");
                      setNewPw("");
                      setConfirmPw("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Update email */}
            {!showEmailForm ? (
              <Button
                variant="vitalis-outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => setShowEmailForm(true)}
                disabled={busy}
              >
                <Mail className="w-4 h-4" />
                Change email
              </Button>
            ) : (
              <div className="space-y-2 p-3 rounded-lg border border-border/40 bg-muted/20">
                <Label className="text-xs">New email address</Label>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  We'll send a verification link to the new address. Your email
                  changes only after you click that link.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="vitalis"
                    className="flex-1"
                    onClick={submitEmailChange}
                    disabled={busy}
                  >
                    Send verification
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setShowEmailForm(false);
                      setNewEmail("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs text-muted-foreground"
              onClick={sendPasswordReset}
              disabled={busy || !email}
            >
              <Lock className="w-3.5 h-3.5" />
              Forgot current password? Send reset email
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
                <Label className="text-sm" htmlFor="notif-switch">
                  Notifications
                </Label>
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
              <span className="text-xs text-muted-foreground">
                Dark (default)
              </span>
            </div>
          </Section>

          {/* Data */}
          <Section icon={Database} title="Your Data">
            <Button
              variant="vitalis-outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={exportHtmlReport}
              disabled={busy}
            >
              <FileText className="w-4 h-4" />
              Export HTML health report
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
              A printable summary of your diagnosis, biomarkers, and
              recommended actions.
            </p>

            <Button
              variant="vitalis-outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => setShowConsultations(true)}
              disabled={busy}
            >
              <Calendar className="w-4 h-4" />
              My consultation requests
            </Button>

            <Button
              variant="vitalis-outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={exportData}
              disabled={busy}
            >
              <Download className="w-4 h-4" />
              Export everything (.zip — JSON + CSV)
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
              Includes your profile, snapshots, documents, substances, family
              history, intake sessions and action log.
            </p>

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

            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-destructive/60 text-destructive hover:bg-destructive/15"
              onClick={deleteAccount}
              disabled={busy}
            >
              <AlertTriangle className="w-4 h-4" />
              Delete my account permanently
            </Button>
            <p className="text-[11px] text-muted-foreground leading-relaxed -mt-1">
              Removes your login and every record we hold for you. This cannot
              be undone.
            </p>
          </Section>

          {/* Privacy controls */}
          <Section icon={ShieldCheck} title="Privacy Controls">
            <div className="flex items-center justify-between">
              <div className="pr-4">
                <Label className="text-sm">Keep health snapshots</Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Trend history for your scores. Disabling clears existing
                  snapshots.
                </p>
              </div>
              <Switch
                checked={privacy.keep_snapshots}
                onCheckedChange={(v) => updatePrivacy({ keep_snapshots: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="pr-4">
                <Label className="text-sm">Keep document history</Label>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Uploaded labs and reports. Disabling clears stored documents.
                </p>
              </div>
              <Switch
                checked={privacy.keep_documents}
                onCheckedChange={(v) => updatePrivacy({ keep_documents: v })}
              />
            </div>

            <div>
              <Label className="text-sm">Auto-delete data older than</Label>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {RETENTION_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => updatePrivacy({ retention_days: o.value })}
                    className={`px-3 py-1 rounded-md text-xs transition ${
                      privacy.retention_days === o.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted/40 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

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

    <MyConsultationsSheet
      open={showConsultations}
      onOpenChange={setShowConsultations}
    />
    </>
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

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </span>
    </div>
  );
}
