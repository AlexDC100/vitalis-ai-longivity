import { useState } from "react";
import { Watch, Activity, Heart, Plus, Check, Bluetooth } from "lucide-react";
import { toast } from "sonner";

type Device = {
  id: string;
  name: string;
  tagline: string;
  Icon: typeof Watch;
  accent: string; // tailwind gradient
};

const DEVICES: Device[] = [
  { id: "apple_watch", name: "Apple Watch",   tagline: "Heart rate · ECG · Activity",        Icon: Watch,    accent: "from-zinc-200 to-zinc-400" },
  { id: "whoop",       name: "WHOOP",         tagline: "Recovery · Strain · Sleep",          Icon: Activity, accent: "from-amber-300 to-rose-400" },
  { id: "oura",        name: "Oura Ring",     tagline: "Sleep · Readiness · Temperature",    Icon: Heart,    accent: "from-violet-300 to-violet-500" },
  { id: "garmin",      name: "Garmin",        tagline: "VO₂ max · Training load",            Icon: Activity, accent: "from-sky-300 to-sky-500" },
  { id: "fitbit",      name: "Fitbit",        tagline: "Steps · HR · Sleep stages",          Icon: Heart,    accent: "from-emerald-300 to-emerald-500" },
  { id: "cgm",         name: "CGM",           tagline: "Continuous glucose · trends",        Icon: Activity, accent: "from-rose-300 to-orange-400" },
];

export default function ConnectDevices() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);

  const toggle = (d: Device) => {
    if (connected[d.id]) {
      setConnected((p) => ({ ...p, [d.id]: false }));
      toast.success(`${d.name} disconnected`);
      return;
    }
    setPending(d.id);
    // Simulated pairing — real OAuth/SDK can be wired in later
    setTimeout(() => {
      setConnected((p) => ({ ...p, [d.id]: true }));
      setPending(null);
      toast.success(`${d.name} connected · syncing data…`);
    }, 900);
  };

  const anyConnected = Object.values(connected).some(Boolean);

  return (
    <section className="space-y-2.5 sm:space-y-3 animate-[fade-in_0.5s_ease-out_0.25s_both]">
      <div className="flex items-baseline justify-between px-1">
        <div className="flex items-center gap-2">
          <Bluetooth className="w-3.5 h-3.5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Connect devices</h2>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
          {anyConnected ? "Synced" : "Tap to pair"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
        {DEVICES.map((d) => {
          const isOn = !!connected[d.id];
          const isPending = pending === d.id;
          const Icon = d.Icon;
          return (
            <button
              key={d.id}
              onClick={() => toggle(d)}
              disabled={isPending}
              className={`group relative overflow-hidden rounded-2xl p-3.5 text-left transition-all active:scale-[0.985] border backdrop-blur-xl ${
                isOn
                  ? "border-primary/40 bg-primary/[0.06] shadow-[0_8px_30px_-12px_hsl(var(--primary)/0.5)]"
                  : "border-border/60 bg-card/80 hover:border-primary/30 hover:bg-card"
              }`}
            >
              {/* Subtle gradient halo */}
              <div
                aria-hidden
                className={`pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${d.accent} opacity-[0.08] blur-2xl transition-opacity ${
                  isOn ? "opacity-30" : "group-hover:opacity-20"
                }`}
              />

              <div className="relative flex items-start gap-3">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1 transition-colors ${
                    isOn
                      ? "bg-primary/15 ring-primary/30 text-primary"
                      : "bg-secondary/60 ring-border/60 text-foreground"
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-foreground truncate">{d.name}</span>
                  </div>
                  <p className="text-[10.5px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">
                    {d.tagline}
                  </p>
                </div>
              </div>

              <div className="relative mt-3 flex items-center justify-between">
                <span
                  className={`text-[10px] font-semibold tracking-wide uppercase ${
                    isOn ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {isPending ? "Pairing…" : isOn ? "Connected" : "Connect"}
                </span>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    isOn
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground group-hover:text-foreground"
                  }`}
                >
                  {isOn ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground/70 text-center pt-1">
        Pair securely over Bluetooth or your account. Data is encrypted end-to-end.
      </p>
    </section>
  );
}