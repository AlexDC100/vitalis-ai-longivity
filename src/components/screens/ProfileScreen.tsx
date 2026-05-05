import { useEffect, useState } from "react";
import { useHealth } from "@/lib/health-context";
import { supabase } from "@/integrations/supabase/client";
import ConnectDevices from "@/components/ConnectDevices";
import { User, Mail, LogOut, Settings as SettingsIcon, ShieldCheck, ChevronRight } from "lucide-react";

interface Props {
  onOpenSettings: () => void;
  onSignOut: () => void;
}

export default function ProfileScreen({ onOpenSettings, onSignOut }: Props) {
  const { profile, longevityScore, biologicalAge, chronologicalAge, dataCompleteness } = useHealth();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data?.user?.email ?? ""));
  }, []);

  const initials = (profile.full_name || email || "U")
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="space-y-8 pb-24 animate-fade-in">
      <header className="pt-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground/80 mb-1">
          Profile
        </div>
        <h1 className="text-[26px] font-semibold tracking-tight text-foreground">
          You
        </h1>
      </header>

      {/* Identity card */}
      <div className="rounded-3xl p-6 bg-card/60 border border-border/40 backdrop-blur-xl flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/5 border border-primary/20 flex items-center justify-center text-foreground font-semibold tracking-tight">
          {initials || <User className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-medium text-foreground truncate">
            {profile.full_name || "Your name"}
          </div>
          <div className="text-[12px] text-muted-foreground truncate inline-flex items-center gap-1">
            <Mail className="w-3 h-3" /> {email || "—"}
          </div>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: "Score",       value: longevityScore },
          { label: "Biological",  value: biologicalAge },
          { label: "Profile",     value: `${dataCompleteness}%` },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl p-4 bg-card/60 border border-border/40 backdrop-blur-xl text-center">
            <div className="text-[20px] font-semibold text-foreground tracking-tight">{s.value}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Connect devices */}
      <section className="space-y-3">
        <h2 className="text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground/80">
          Connected devices
        </h2>
        <ConnectDevices />
      </section>

      {/* Actions */}
      <section className="rounded-3xl bg-card/60 border border-border/40 backdrop-blur-xl divide-y divide-border/30 overflow-hidden">
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <SettingsIcon className="w-4 h-4 text-muted-foreground" />
          <span className="flex-1 text-[14px] text-foreground">Settings</span>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
        <div className="flex items-center gap-3 px-5 py-4">
          <ShieldCheck className="w-4 h-4 text-muted-foreground" />
          <div className="flex-1">
            <div className="text-[14px] text-foreground">Privacy</div>
            <div className="text-[11.5px] text-muted-foreground">Your data is encrypted and only used with your consent.</div>
          </div>
        </div>
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/30 transition-colors"
        >
          <LogOut className="w-4 h-4 text-muted-foreground" />
          <span className="flex-1 text-[14px] text-foreground">Sign out</span>
        </button>
      </section>

      <p className="text-center text-[10.5px] text-muted-foreground/70 pt-1">
        Vitalis · your private longevity companion.
      </p>
    </div>
  );
}