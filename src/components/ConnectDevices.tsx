import { useEffect, useState } from "react";
import {
  Watch, Activity, Heart, Plus, Check, Bluetooth, Shield, Lock, Info,
  TrendingUp, Moon, Zap, Sparkles, MessageCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

type Device = {
  id: string;
  name: string;
  tagline: string;
  Icon: typeof Watch;
  accent: string;
};

const DEVICES: Device[] = [
  { id: "apple_watch", name: "Apple Watch", tagline: "Heart rate · ECG · Activity",     Icon: Watch,    accent: "from-zinc-200 to-zinc-400" },
  { id: "whoop",       name: "WHOOP",       tagline: "Recovery · Strain · Sleep",       Icon: Activity, accent: "from-amber-300 to-rose-400" },
  { id: "oura",        name: "Oura Ring",   tagline: "Sleep · Readiness · Temperature", Icon: Heart,    accent: "from-violet-300 to-violet-500" },
  { id: "garmin",      name: "Garmin",      tagline: "VO₂ max · Training load",         Icon: Activity, accent: "from-sky-300 to-sky-500" },
  { id: "fitbit",      name: "Fitbit",      tagline: "Steps · HR · Sleep stages",       Icon: Heart,    accent: "from-emerald-300 to-emerald-500" },
  { id: "cgm",         name: "CGM",         tagline: "Continuous glucose · trends",     Icon: Activity, accent: "from-rose-300 to-orange-400" },
];

const CONSENT_KEY = "vitalis_devices_consent_v1";
const SHARE_KEY = "vitalis_devices_share_ai_v1";
const CONNECTED_KEY = "vitalis_devices_connected_v1";

// Simulated insight data — replaced by real device APIs once wired up.
const SIMULATED_INSIGHTS = {
  readiness: 82,
  recovery: 71,
  sleepHours: 7.4,
  hrv: 58,
  restingHR: 54,
  trend: "+6% recovery vs 7-day avg",
};

// Dispatched on the window so AIDoctorScreen can pick it up and route to chat.
function askAI(question: string) {
  window.dispatchEvent(new CustomEvent("vitalis:ask-ai", { detail: { question } }));
  toast.success("Sent to AI Doctor", { description: "Switch to AI Doctor to see the answer." });
}

export default function ConnectDevices() {
  const [connected, setConnected] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(false);
  const [shareWithAI, setShareWithAI] = useState(true);
  const [consentOpen, setConsentOpen] = useState(false);
  const [pendingDevice, setPendingDevice] = useState<Device | null>(null);

  // Hydrate prefs
  useEffect(() => {
    try {
      setConsentGiven(localStorage.getItem(CONSENT_KEY) === "true");
      setShareWithAI(localStorage.getItem(SHARE_KEY) !== "false");
      const raw = localStorage.getItem(CONNECTED_KEY);
      if (raw) setConnected(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CONNECTED_KEY, JSON.stringify(connected)); } catch {}
  }, [connected]);

  const persistShare = (v: boolean) => {
    setShareWithAI(v);
    try { localStorage.setItem(SHARE_KEY, String(v)); } catch {}
    toast.success(v ? "AI can use device data" : "AI access paused", {
      description: v
        ? "Recovery, sleep and HRV will inform your AI answers."
        : "Your AI Doctor will not read connected device data until you re-enable.",
    });
  };

  const acceptConsent = () => {
    try { localStorage.setItem(CONSENT_KEY, "true"); } catch {}
    setConsentGiven(true);
    setConsentOpen(false);
    if (pendingDevice) startPairing(pendingDevice);
    setPendingDevice(null);
  };

  const startPairing = (d: Device) => {
    setPending(d.id);
    setTimeout(() => {
      setConnected((p) => ({ ...p, [d.id]: true }));
      setPending(null);
      toast.success(`${d.name} connected · syncing data…`);
    }, 900);
  };

  const toggle = (d: Device) => {
    if (connected[d.id]) {
      setConnected((p) => ({ ...p, [d.id]: false }));
      toast.success(`${d.name} disconnected`);
      return;
    }
    if (!consentGiven) {
      setPendingDevice(d);
      setConsentOpen(true);
      return;
    }
    startPairing(d);
  };

  const anyConnected = Object.values(connected).some(Boolean);

  return (
    <>
      {/* Privacy + consent header */}
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

        {/* Privacy toggle */}
        <div className="flex items-center gap-3 bg-card/80 backdrop-blur-xl border border-border/60 rounded-2xl p-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Use my device data with AI</p>
            <p className="text-[11px] text-muted-foreground leading-snug">
              {shareWithAI
                ? "AI can reference your recovery, sleep & HRV when answering."
                : "AI cannot read device data until you re-enable."}
            </p>
          </div>
          <Switch checked={shareWithAI} onCheckedChange={persistShare} aria-label="Share device data with AI" />
        </div>

        {/* Device grid */}
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
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -top-8 -right-8 w-24 h-24 rounded-full bg-gradient-to-br ${d.accent} opacity-[0.08] blur-2xl transition-opacity ${
                    isOn ? "opacity-30" : "group-hover:opacity-20"
                  }`}
                />
                <div className="relative flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ring-1 transition-colors ${
                    isOn ? "bg-primary/15 ring-primary/30 text-primary" : "bg-secondary/60 ring-border/60 text-foreground"
                  }`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] font-semibold text-foreground truncate block">{d.name}</span>
                    <p className="text-[10.5px] text-muted-foreground leading-snug mt-0.5 line-clamp-2">{d.tagline}</p>
                  </div>
                </div>
                <div className="relative mt-3 flex items-center justify-between">
                  <span className={`text-[10px] font-semibold tracking-wide uppercase ${isOn ? "text-primary" : "text-muted-foreground"}`}>
                    {isPending ? "Pairing…" : isOn ? "Connected" : "Connect"}
                  </span>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center transition-all ${
                    isOn ? "bg-primary text-primary-foreground" : "bg-secondary/60 text-muted-foreground group-hover:text-foreground"
                  }`}>
                    {isOn ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-2 text-[10px] text-muted-foreground/80 leading-snug px-1 pt-1">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" />
          <p>
            Encrypted end-to-end. Educational summary only — not a substitute for medical advice.
            Final diagnosis must be confirmed by a licensed clinician.
          </p>
        </div>
      </section>

      {/* Insights summary — only when at least one device is connected and sharing is on */}
      {anyConnected && (
        <DeviceInsights shareWithAI={shareWithAI} />
      )}

      {/* Consent dialog */}
      <Dialog open={consentOpen} onOpenChange={setConsentOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-2">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle>Connect {pendingDevice?.name ?? "your device"}</DialogTitle>
            <DialogDescription className="leading-relaxed">
              We'll read health metrics (heart rate, sleep, recovery, activity) over an encrypted
              connection. Data is stored to your private account only. You can disconnect or revoke
              AI access anytime.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-[12px] text-muted-foreground">
            <p className="flex items-start gap-2"><Check className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" /> End-to-end encrypted in transit and at rest.</p>
            <p className="flex items-start gap-2"><Check className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" /> Never sold, never shared with third parties.</p>
            <p className="flex items-start gap-2"><Check className="w-3.5 h-3.5 mt-0.5 text-primary shrink-0" /> AI access is opt-in and can be paused with one tap.</p>
            <p className="flex items-start gap-2"><Info className="w-3.5 h-3.5 mt-0.5 text-amber-400 shrink-0" /> Educational only — not a medical diagnosis.</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <Button variant="ghost" onClick={() => { setConsentOpen(false); setPendingDevice(null); }}>
              Cancel
            </Button>
            <Button onClick={acceptConsent}>I agree — continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Device insights panel: readiness / recovery / trends + ask AI shortcuts. */
function DeviceInsights({ shareWithAI }: { shareWithAI: boolean }) {
  const i = SIMULATED_INSIGHTS;
  const cards = [
    { Icon: Sparkles, label: "Readiness", value: `${i.readiness}`, suffix: "/100", tone: "text-emerald-400", q: `My readiness score today is ${i.readiness}/100. What does this mean and what should I do today?` },
    { Icon: Zap,      label: "Recovery",  value: `${i.recovery}`,  suffix: "%",     tone: "text-primary",     q: `My recovery is ${i.recovery}% (HRV ${i.hrv} ms, RHR ${i.restingHR} bpm). Should I train hard today or rest?` },
    { Icon: Moon,     label: "Sleep",     value: `${i.sleepHours}`, suffix: "h",    tone: "text-violet-400",  q: `I slept ${i.sleepHours}h last night. How does this affect my recovery and longevity?` },
    { Icon: TrendingUp, label: "Trend",   value: i.trend,           suffix: "",     tone: "text-amber-400",   q: `My 7-day trend shows ${i.trend}. Explain what's driving this and how I can keep improving.` },
  ];

  return (
    <section className="space-y-2.5 sm:space-y-3 animate-[fade-in_0.5s_ease-out_0.3s_both]">
      <div className="flex items-baseline justify-between px-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <h2 className="text-sm font-semibold text-foreground">Connected insights</h2>
        </div>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Today</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => {
          const Icon = c.Icon;
          return (
            <div key={c.label} className="bg-card/80 backdrop-blur-xl border border-border/60 rounded-2xl p-3">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Icon className={`w-3 h-3 ${c.tone}`} />
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{c.label}</span>
              </div>
              <div className="flex items-baseline gap-1 mb-2">
                <span className={`text-lg font-bold tabular-nums ${c.tone}`}>{c.value}</span>
                {c.suffix && <span className="text-[11px] text-muted-foreground">{c.suffix}</span>}
              </div>
              <button
                onClick={() => askAI(c.q)}
                disabled={!shareWithAI}
                className="w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-full text-[10.5px] font-medium border border-border/60 text-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <MessageCircle className="w-3 h-3" />
                Ask AI
              </button>
            </div>
          );
        })}
      </div>

      {!shareWithAI && (
        <p className="text-[10px] text-amber-400/90 text-center">
          AI access is paused — enable the toggle above to ask about these metrics.
        </p>
      )}
    </section>
  );
}
