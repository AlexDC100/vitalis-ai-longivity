interface Props {
  label: string;
  value: string | number;
  unit?: string;
  sublabel?: string;
  highlight?: boolean;
  trend?: string;
}

export default function MetricCard({ label, value, unit, sublabel, highlight, trend }: Props) {
  return (
    <div className={`rounded-xl p-4 border transition-colors ${highlight ? "bg-primary/5 border-primary/30" : "bg-card border-border"}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">{label}</p>
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold text-foreground">{value}</span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        {trend && <span className="text-xs text-primary ml-1">↗ {trend}</span>}
      </div>
      {sublabel && <p className="text-xs text-muted-foreground mt-1">{sublabel}</p>}
    </div>
  );
}
