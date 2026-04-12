import { Archive, Upload, FileText, Calendar, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface LabReport {
  id: string;
  name: string;
  date: string;
  type: string;
  provider: string;
  status: "reviewed" | "pending" | "new";
}

const mockReports: LabReport[] = [
  { id: "1", name: "Complete Blood Panel", date: "2026-03-15", type: "Blood Work", provider: "Quest Diagnostics", status: "reviewed" },
  { id: "2", name: "Lipid Panel - Advanced", date: "2026-03-15", type: "Blood Work", provider: "Quest Diagnostics", status: "reviewed" },
  { id: "3", name: "Hormonal Panel", date: "2026-02-20", type: "Hormones", provider: "LabCorp", status: "reviewed" },
  { id: "4", name: "DEXA Body Composition", date: "2026-02-10", type: "Imaging", provider: "University Hospital", status: "pending" },
  { id: "5", name: "VO2 Max Assessment", date: "2026-01-28", type: "Fitness", provider: "Performance Lab", status: "reviewed" },
  { id: "6", name: "Coronary Calcium Score", date: "2025-12-05", type: "Imaging", provider: "Radiology Center", status: "reviewed" },
  { id: "7", name: "Genetic Panel (APOE)", date: "2025-11-15", type: "Genetics", provider: "23andMe Clinical", status: "new" },
];

export default function MedicalVault() {
  const [filter, setFilter] = useState("all");

  const types = ["all", ...new Set(mockReports.map(r => r.type))];
  const filtered = filter === "all" ? mockReports : mockReports.filter(r => r.type === filter);

  const statusStyle = (s: string) =>
    s === "reviewed" ? "bg-vitalis-success/15 text-vitalis-success" :
    s === "new" ? "bg-primary/15 text-primary" :
    "bg-vitalis-warning/15 text-vitalis-warning";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Archive className="w-6 h-6 text-primary" />
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">Medical Vault</h1>
          </div>
          <p className="text-sm text-muted-foreground">Labs, reports & medical documents</p>
        </div>
        <Button variant="vitalis">
          <Upload className="w-4 h-4 mr-1" /> Upload Report
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {types.map((t) => (
          <button
            key={t}
            onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === t ? "bg-primary/15 text-primary border-primary/30" : "bg-secondary text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {t === "all" ? "All" : t}
          </button>
        ))}
      </div>

      {/* Reports */}
      <div className="space-y-3">
        {filtered.map((report) => (
          <div key={report.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-4 hover:border-primary/20 transition-colors">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-foreground truncate">{report.name}</h3>
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Calendar className="w-3 h-3" /> {new Date(report.date).toLocaleDateString()}
                </span>
                <span className="text-[11px] text-muted-foreground">{report.provider}</span>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${statusStyle(report.status)}`}>
              {report.status.toUpperCase()}
            </span>
            <button className="p-2 text-muted-foreground hover:text-foreground">
              <Download className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
