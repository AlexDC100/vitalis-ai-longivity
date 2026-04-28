import { useState } from "react";
import { Button } from "@/components/ui/button";
import AuthDialog from "@/components/AuthDialog";
import VitalisLogo from "@/components/brand/VitalisLogo";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  FileText,
  Hospital,
  Layers,
  Microscope,
  ShieldCheck,
  Stethoscope,
  Upload,
  Users,
  Workflow,
  Zap,
  AlertOctagon,
  AlertTriangle,
} from "lucide-react";

interface Props {
  onGuestLogin: () => void;
}

/**
 * Hospital landing page (logged-out view).
 * Positions Vitalis as AI diagnostic workflow support for clinics & hospitals.
 */
export default function AuthPage({ onGuestLogin: _ }: Props) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_up");

  const open = (mode: "sign_in" | "sign_up") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} initialMode={authMode} />

      {/* ── Top bar ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-background/80 border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <VitalisLogo variant="icon" size={22} title="Vitalis" />
            <span className="text-[15px] font-bold tracking-tight">Vitalis</span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground border-l border-border/50 pl-2.5 ml-1">
              Clinic
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-sm"
              onClick={() => open("sign_in")}
            >
              Sign in
            </Button>
            <Button size="sm" className="text-sm" onClick={() => open("sign_up")}>
              Upload a test case
            </Button>
          </div>
        </div>
      </header>

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-border/40">
        <div
          className="absolute inset-0 -z-10 opacity-[0.35]"
          style={{
            background:
              "radial-gradient(900px 500px at 15% 10%, hsl(174 72% 46% / 0.18), transparent 60%), radial-gradient(700px 400px at 85% 0%, hsl(210 72% 56% / 0.12), transparent 60%)",
          }}
        />
        <div className="max-w-6xl mx-auto px-5 pt-16 pb-20 lg:pt-24 lg:pb-28">
          <div className="grid lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
            {/* Copy */}
            <div>
              <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-border bg-card text-[11px] uppercase tracking-wider text-muted-foreground mb-5">
                <Hospital className="w-3 h-3" />
                For hospitals · clinics · radiology centers
              </div>
              <h1 className="text-[34px] sm:text-[44px] lg:text-[52px] font-bold leading-[1.05] tracking-tight">
                AI-assisted diagnostic review for{" "}
                <span className="text-brand-gradient">overloaded medical teams</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground max-w-xl leading-relaxed">
                Upload scans, lab reports, and clinical documents. Vitalis helps
                pre-review cases, flag urgent findings, and organize your
                diagnostic backlog before doctor review.
              </p>
              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Button size="lg" className="h-11 px-5" onClick={() => open("sign_up")}>
                  Upload a test case <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
                <a
                  href="#workflow"
                  className="h-11 px-5 inline-flex items-center text-sm font-medium text-foreground border border-border rounded-md hover:bg-card transition-colors"
                >
                  See hospital workflow
                </a>
              </div>
              <p className="mt-5 text-xs text-muted-foreground inline-flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                AI-assisted review only. Final diagnosis must be confirmed by a licensed clinician.
              </p>
            </div>

            {/* Hero preview — mock hospital queue */}
            <div className="relative">
              <div className="rounded-2xl border border-border bg-card/70 backdrop-blur-sm shadow-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    <span className="text-[13px] font-semibold">Diagnostic queue</span>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    Live
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3">
                  <PreviewMetric label="Pending" value="42" />
                  <PreviewMetric label="High priority" value="7" tone="warn" />
                  <PreviewMetric label="AI pre-reviewed" value="18" tone="primary" />
                  <PreviewMetric label="Urgent specialist" value="5" tone="danger" />
                </div>
                <div className="px-3 pb-3 space-y-2">
                  <PreviewCase
                    refId="C-A91D4F"
                    type="ECG"
                    insight="Possible ST elevation, anterior leads"
                    tone="critical"
                    label="Immediate review"
                  />
                  <PreviewCase
                    refId="C-7F30B1"
                    type="Chest CT"
                    insight="Left lower lobe nodule, follow-up imaging suggested"
                    tone="high"
                    label="Within 24h"
                  />
                  <PreviewCase
                    refId="C-2E08AA"
                    type="Blood panel"
                    insight="Mild liver enzyme elevation, clinical correlation"
                    tone="medium"
                    label="Routine"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Audiences strip ─────────────────────────────────────── */}
      <section className="border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 py-8 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          {[
            { icon: Hospital, label: "Hospitals" },
            { icon: Stethoscope, label: "Clinics" },
            { icon: Microscope, label: "Radiology centers" },
            { icon: Users, label: "Diagnostic labs" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Icon className="w-4 h-4" />
              <span>{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Workflow ────────────────────────────────────────────── */}
      <section id="workflow" className="border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="max-w-2xl">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Hospital workflow
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              From upload to doctor-ready summary in minutes
            </h2>
            <p className="mt-4 text-muted-foreground">
              A focused workflow built for diagnostic teams handling high case volume.
            </p>
          </div>

          <div className="mt-10 grid md:grid-cols-5 gap-3">
            {[
              { n: "1", title: "Upload case", icon: Upload, body: "PDF, image, or scan placeholder. Drag & drop or mobile capture." },
              { n: "2", title: "AI pre-review", icon: Zap, body: "Detected document type, suspected area, key findings, missing info." },
              { n: "3", title: "Priority score", icon: AlertOctagon, body: "Critical, High, Medium, or Low — with recommended review window." },
              { n: "4", title: "Doctor-ready summary", icon: FileText, body: "Structured assessment with disclaimer, ready for clinician sign-off." },
              { n: "5", title: "Export report", icon: ClipboardList, body: "Printable HTML report. Save as PDF in one click." },
            ].map(({ n, title, body, icon: Icon }) => (
              <div key={n} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-6 h-6 rounded-md bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center">
                    {n}
                  </span>
                  <Icon className="w-4 h-4 text-muted-foreground" />
                </div>
                <h3 className="text-sm font-semibold mb-1">{title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Supported uploads ──────────────────────────────────── */}
      <section className="border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 py-16">
          <div className="grid md:grid-cols-[1fr_1.2fr] gap-10 items-start">
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Supported uploads
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Built for the documents your team already handles
              </h2>
              <p className="mt-4 text-sm text-muted-foreground">
                We accept the formats that flow through diagnostic queues every day.
                For DICOM-native parsing, contact us — Phase 1 simulates the scan-review
                workflow realistically using extracted text and report imagery.
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                "CT scans",
                "MRI scans",
                "X-rays",
                "Ultrasound reports",
                "ECG reports",
                "Blood tests",
                "Pathology reports",
                "Radiology PDFs",
                "Doctor notes",
              ].map((t) => (
                <div
                  key={t}
                  className="rounded-lg border border-border bg-card px-3 py-2.5 text-xs flex items-center gap-2"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Outcomes ────────────────────────────────────────────── */}
      <section className="border-b border-border/40">
        <div className="max-w-6xl mx-auto px-5 py-20">
          <div className="text-center max-w-2xl mx-auto">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Outcomes
            </p>
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
              Reduce backlog. Surface urgency. Sign off faster.
            </h2>
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-4">
            {[
              {
                icon: Layers,
                title: "Backlog reduction",
                body: "Group cases by urgency and clear the routine queue automatically.",
              },
              {
                icon: AlertTriangle,
                title: "Urgent case flagging",
                body: "Critical findings rise to the top with recommended review windows.",
              },
              {
                icon: Workflow,
                title: "Doctor-ready handoff",
                body: "Each case ships with a structured assessment and a printable report.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border border-border bg-card p-5">
                <Icon className="w-5 h-5 text-primary mb-3" />
                <h3 className="text-base font-semibold mb-1.5">{title}</h3>
                <p className="text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ──────────────────────────────────────────── */}
      <section className="border-b border-border/40">
        <div className="max-w-3xl mx-auto px-5 py-20 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Try it with a real case
          </h2>
          <p className="mt-4 text-muted-foreground">
            Upload one scan or report and see how the AI-assisted pre-review and
            triage works for your team.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Button size="lg" className="h-11 px-6" onClick={() => open("sign_up")}>
              Upload a test case <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-11 px-6"
              onClick={() => open("sign_in")}
            >
              Sign in
            </Button>
          </div>
        </div>
      </section>

      <footer className="py-8">
        <div className="max-w-6xl mx-auto px-5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <VitalisLogo variant="icon" size={16} />
            <span>Vitalis Clinic · {new Date().getFullYear()}</span>
          </div>
          <p className="text-center sm:text-right max-w-md">
            AI-assisted review only. Not a medical device. Final diagnosis must
            be confirmed by a licensed clinician.
          </p>
        </div>
      </footer>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "muted" | "primary" | "warn" | "danger";
}) {
  const cls =
    tone === "danger"
      ? "text-destructive"
      : tone === "warn"
      ? "text-amber-500"
      : tone === "primary"
      ? "text-primary"
      : "text-foreground";
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-2.5">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${cls}`}>{value}</p>
    </div>
  );
}

function PreviewCase({
  refId,
  type,
  insight,
  tone,
  label,
}: {
  refId: string;
  type: string;
  insight: string;
  tone: "critical" | "high" | "medium";
  label: string;
}) {
  const ring =
    tone === "critical"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "high"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-border bg-background/60";
  const text =
    tone === "critical" ? "text-destructive" : tone === "high" ? "text-amber-500" : "text-muted-foreground";
  return (
    <div className={`rounded-lg border p-2.5 ${ring}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider font-semibold">
          {refId} · {type}
        </span>
        <span className={`text-[10px] font-medium ${text}`}>{label}</span>
      </div>
      <p className="text-[12px] text-foreground leading-snug">{insight}</p>
    </div>
  );
}
