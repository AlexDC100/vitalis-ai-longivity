import { useHealth } from "@/lib/health-context";
import ScoreRing from "@/components/ScoreRing";
import MetricCard from "@/components/MetricCard";
import { Wifi, WifiOff, Watch, Heart, Activity, Moon, Smartphone } from "lucide-react";

const devices = [
  { name: "Apple Health", icon: Heart, connected: false, color: "text-vitalis-danger" },
  { name: "WHOOP", icon: Activity, connected: true, sync: "2m ago", color: "text-vitalis-warning" },
  { name: "Oura Ring", icon: Moon, connected: false, color: "text-muted-foreground" },
  { name: "Garmin", icon: Watch, connected: false, color: "text-vitalis-info" },
  { name: "Withings", icon: Smartphone, connected: false, color: "text-muted-foreground" },
];

export default function CommandCenter() {
  const { longevityScore, biologicalAge, chronologicalAge, profile, dataCompleteness } = useHealth();
  const connectedCount = devices.filter(d => d.connected).length;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Command Center</h1>
          <p className="text-muted-foreground text-sm">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary border border-border text-xs">
          <Wifi className="w-3.5 h-3.5 text-primary" />
          <span className="text-muted-foreground">{connectedCount} device connected</span>
        </div>
      </div>

      {/* Score */}
      <div className="bg-card border border-border rounded-2xl p-6 md:p-8 flex flex-col items-center">
        <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-6">Longevity Score</p>
        <ScoreRing score={longevityScore} />
        <p className="text-sm text-muted-foreground mt-4">
          {longevityScore >= 80 ? "Excellent trajectory" : longevityScore >= 60 ? "Good trajectory" : "Needs attention"}
        </p>
        <button className="text-xs text-primary hover:underline mt-2">View action plan →</button>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <MetricCard label="Biological Age" value={biologicalAge} trend={`-${chronologicalAge - biologicalAge}y`} sublabel={`vs ${chronologicalAge} actual`} />
        <MetricCard label="Daily Readiness" value={78} unit="/100" sublabel="Moderate training" />
        <MetricCard label="HRV" value={profile.hrv_ms} unit="ms" sublabel="Average" />
        <MetricCard label="Data Quality" value={dataCompleteness} unit="%" sublabel={dataCompleteness < 100 ? "Complete profile →" : "Complete"} highlight={dataCompleteness < 100} />
      </div>

      {/* Devices */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-primary" />
            <h3 className="font-semibold text-foreground">Connected Devices</h3>
          </div>
          <span className="text-xs text-muted-foreground">{connectedCount}/{devices.length} active</span>
        </div>
        <div className="space-y-2">
          {devices.map((d) => {
            const Icon = d.icon;
            return (
              <div key={d.name} className="flex items-center justify-between p-3 rounded-xl bg-secondary/50 border border-border hover:bg-secondary transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg bg-secondary flex items-center justify-center ${d.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{d.name}</p>
                    <p className="text-[11px] text-muted-foreground">{d.connected ? `Synced ${d.sync}` : "Tap to connect"}</p>
                  </div>
                </div>
                {d.connected ? (
                  <Wifi className="w-4 h-4 text-primary" />
                ) : (
                  <WifiOff className="w-4 h-4 text-muted-foreground/40" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
