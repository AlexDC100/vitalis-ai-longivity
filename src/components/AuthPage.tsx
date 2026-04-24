import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import AuthDialog from "@/components/AuthDialog";
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  FileText,
  Hospital,
  Lock,
  PlayCircle,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Upload,
  User,
  Users,
  Watch,
  Zap,
} from "lucide-react";

interface Props {
  onGuestLogin: () => void;
}

export default function AuthPage({ onGuestLogin: _ }: Props) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");

  useEffect(() => {
    track({ name: "pricing_preview_view", plan: "Pro" });
  }, []);

  const openAuth = (mode: "sign_in" | "sign_up") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  const navItems = [
    { label: "Product", href: "#product" },
    { label: "How it works", href: "#how" },
    { label: "Pricing", href: "#pricing" },
    { label: "For Clinics", href: "#audiences" },
    { label: "Security", href: "#security" },
  ];

  const steps = [
    {
      icon: Upload,
      title: "Upload reports",
      desc: "Drop blood panels, imaging, or specialist letters. We extract every biomarker.",
    },
    {
      icon: Watch,
      title: "Connect devices",
      desc: "Sync wearables and lab data through secure CSV / JSON imports.",
    },
    {
      icon: Sparkles,
      title: "AI analyzes",
      desc: "Clinical-grade reasoning across 33+ biomarkers and your full medical history.",
    },
    {
      icon: Zap,
      title: "Clear action plan",
      desc: "Prioritized, evidence-based steps you can act on today.",
    },
  ];

  const audiences = [
    { icon: User, title: "Individuals", desc: "Personal longevity & risk insight." },
    { icon: Building2, title: "Corporations", desc: "Executive health programs at scale." },
    { icon: Stethoscope, title: "Private clinics", desc: "Augment consultations with AI triage." },
    { icon: Hospital, title: "Hospitals", desc: "Decision support for chronic care." },
  ];

  const plans = [
    {
      name: "Free trial",
      price: "$0",
      cadence: "7 days",
      features: ["Upload 1 report", "AI Doctor preview", "Basic risk scoring"],
      highlight: false,
    },
    {
      name: "Essential",
      price: "$20",
      cadence: "/ month",
      features: ["Unlimited reports", "Device integrations", "Longevity score & trends"],
      highlight: false,
    },
    {
      name: "Pro",
      price: "$50",
      cadence: "/ month",
      features: ["Full AI Doctor chat", "Clinical-grade insights", "Priority support"],
      highlight: true,
    },
  ];

  const securityPoints = [
    { icon: Lock, title: "Encrypted end-to-end", desc: "AES-256 at rest, TLS 1.3 in transit." },
    { icon: ShieldCheck, title: "Private by design", desc: "Your data is never sold or used to train public models." },
    { icon: FileText, title: "Medical disclaimer", desc: "Decision support — not a substitute for professional diagnosis." },
  ];

  return (
    <div className="min-h-screen auth-bg relative overflow-hidden">
      <div className="absolute inset-0 auth-grid-pattern pointer-events-none" />

      {/* HEADER */}
      <header className="relative z-30 border-b border-border/40 bg-background/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto flex items-center justify-between px-4 sm:px-6 lg:px-10 h-16">
          {/* Logo */}
          <a href="#" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
              <TrendingUp className="w-4.5 h-4.5 text-primary" />
            </div>
            <span className="text-base font-semibold tracking-tight text-foreground">Vitalis</span>
          </a>

          {/* Nav */}
          <nav className="hidden md:flex items-center gap-7">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Auth */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAuth("sign_in")}
              className="hidden sm:inline-flex items-center px-3.5 h-9 rounded-lg text-[13px] font-semibold text-foreground hover:bg-secondary/60 transition-colors"
            >
              Sign in
            </button>
            <Button
              variant="vitalis"
              onClick={() => openAuth("sign_up")}
              className="h-9 px-4 rounded-lg text-[13px] font-semibold"
            >
              Get started
            </Button>
          </div>
        </div>
      </header>

      <main className="relative">
        {/* HERO */}
        <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pt-14 lg:pt-20 pb-20 lg:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            {/* Copy */}
            <div className="animate-auth-fade">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20 mb-6">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
                  AI Health Intelligence
                </span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.5rem] font-bold tracking-tight text-foreground leading-[1.05]">
                AI-powered health{" "}
                <span className="bg-gradient-to-r from-primary via-primary to-[hsl(var(--vitalis-info))] bg-clip-text text-transparent">
                  intelligence
                </span>{" "}
                for better decisions
              </h1>

              <p className="mt-6 text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl">
                Upload medical reports, connect devices, and turn health data into clear, clinical-grade insights — for individuals, clinics, and hospitals.
              </p>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  variant="vitalis"
                  onClick={() => openAuth("sign_up")}
                  className="h-12 px-6 rounded-xl text-sm font-semibold tracking-wide shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)] hover:shadow-[0_12px_36px_-10px_hsl(var(--primary)/0.8)] hover:-translate-y-0.5 transition-all"
                >
                  Start health assessment
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center h-12 px-5 rounded-xl text-sm font-semibold text-foreground bg-secondary/60 ring-1 ring-border/60 hover:bg-secondary transition-all"
                >
                  <PlayCircle className="w-4 h-4 mr-2 text-primary" />
                  See how it works
                </a>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> HIPAA-grade encryption</span>
                <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> Used by clinical teams</span>
                <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> No data resale</span>
              </div>
            </div>

            {/* Product preview panel */}
            <div className="relative animate-auth-fade">
              <div className="absolute -inset-4 bg-gradient-to-br from-primary/20 via-transparent to-[hsl(var(--vitalis-info))]/15 blur-3xl rounded-[2rem] pointer-events-none" />
              <div className="relative auth-glass rounded-3xl p-5 sm:p-6 ring-1 ring-border/60 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.5)]">
                {/* AI Doctor summary */}
                <div className="flex items-start gap-3 pb-4 border-b border-border/40">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center shrink-0">
                    <Stethoscope className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">AI Doctor</span>
                      <span className="text-[10px] font-semibold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-primary/15 text-primary">Live</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      Reviewed your latest blood panel and 30-day device data. One priority finding.
                    </p>
                  </div>
                </div>

                {/* Risk insight */}
                <div className="mt-4 p-3.5 rounded-2xl bg-[hsl(var(--vitalis-warning)/0.08)] ring-1 ring-[hsl(var(--vitalis-warning)/0.3)]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold tracking-wider uppercase text-[hsl(var(--vitalis-warning))]">Cardiovascular risk</span>
                    <span className="text-xs font-bold text-[hsl(var(--vitalis-warning))]">Elevated</span>
                  </div>
                  <p className="text-sm font-semibold text-foreground mt-1.5">ApoB 112 mg/dL — above optimal range</p>
                  <div className="mt-2.5 h-1.5 rounded-full bg-secondary/80 overflow-hidden">
                    <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[hsl(var(--vitalis-warning))] to-[hsl(var(--vitalis-danger))]" />
                  </div>
                </div>

                {/* Data sources */}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-secondary/50 ring-1 ring-border/50">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] font-semibold text-foreground">Blood panel</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">42 biomarkers parsed</p>
                  </div>
                  <div className="p-3 rounded-xl bg-secondary/50 ring-1 ring-border/50">
                    <div className="flex items-center gap-2">
                      <Activity className="w-3.5 h-3.5 text-primary" />
                      <span className="text-[11px] font-semibold text-foreground">Wearable</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">HRV, sleep, VO₂ synced</p>
                  </div>
                </div>

                {/* Next action */}
                <div className="mt-4 p-3.5 rounded-2xl bg-primary/8 ring-1 ring-primary/25">
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-primary">Next action</span>
                  <p className="text-sm font-semibold text-foreground mt-1">Schedule lipid follow-up & start dietary protocol</p>
                  <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                    Open clinical plan <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-20 lg:py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">How Vitalis works</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              From raw data to a clear plan
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Four steps. Built on clinical evidence and your actual biology.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="auth-glass rounded-2xl p-5 ring-1 ring-border/50 hover:ring-primary/40 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                    <s.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground tracking-wider">0{i + 1}</span>
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* AUDIENCES */}
        <section id="audiences" className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-20 lg:py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Built for</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Trusted across healthcare
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              From individual longevity to enterprise occupational health programs.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {audiences.map((a) => (
              <div
                key={a.title}
                className="auth-glass rounded-2xl p-5 ring-1 ring-border/50 hover:ring-primary/40 transition-all"
              >
                <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center">
                  <a.icon className="w-5 h-5 text-primary" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">{a.title}</h3>
                <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-20 lg:py-24">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Pricing</span>
            <h2 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
              Simple, transparent plans
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Start free. Upgrade when your team is ready.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`auth-glass rounded-2xl p-6 ring-1 transition-all ${
                  p.highlight
                    ? "ring-primary/50 shadow-[0_20px_60px_-20px_hsl(var(--primary)/0.5)] bg-primary/5"
                    : "ring-border/50 hover:ring-primary/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-foreground">{p.name}</h3>
                  {p.highlight && (
                    <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md bg-primary/15 text-primary">
                      Popular
                    </span>
                  )}
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold text-foreground">{p.price}</span>
                  <span className="text-sm text-muted-foreground">{p.cadence}</span>
                </div>
                <ul className="mt-5 space-y-2.5">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={p.highlight ? "vitalis" : "social"}
                  onClick={() => openAuth("sign_up")}
                  className="mt-6 w-full h-11 rounded-xl text-sm font-semibold"
                >
                  {p.price === "$0" ? "Start free trial" : "Get started"}
                </Button>
              </div>
            ))}
          </div>
        </section>

        {/* SECURITY */}
        <section id="security" className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-20 lg:py-24">
          <div className="auth-glass rounded-3xl p-8 sm:p-12 ring-1 ring-border/50">
            <div className="grid lg:grid-cols-3 gap-8 lg:gap-12">
              <div>
                <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Security & privacy</span>
                <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                  Built to clinical-grade standards
                </h2>
                <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
                  Your medical data deserves more than consumer-app security. Vitalis is engineered for institutional trust.
                </p>
              </div>
              <div className="lg:col-span-2 grid sm:grid-cols-3 gap-4">
                {securityPoints.map((s) => (
                  <div key={s.title} className="p-4 rounded-2xl bg-secondary/40 ring-1 ring-border/50">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center">
                      <s.icon className="w-4.5 h-4.5 text-primary" />
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-foreground">{s.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 pb-24">
          <div className="relative overflow-hidden rounded-3xl ring-1 ring-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-8 sm:p-12 text-center">
            <div className="absolute inset-0 auth-grid-pattern opacity-30 pointer-events-none" />
            <div className="relative">
              <Users className="w-8 h-8 text-primary mx-auto" />
              <h2 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Start your first health assessment today
              </h2>
              <p className="mt-3 text-sm text-muted-foreground max-w-xl mx-auto">
                7-day free trial. No credit card required.
              </p>
              <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="vitalis"
                  onClick={() => openAuth("sign_up")}
                  className="h-12 px-6 rounded-xl text-sm font-semibold tracking-wide shadow-[0_10px_30px_-10px_hsl(var(--primary)/0.6)]"
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
                <button
                  onClick={() => openAuth("sign_in")}
                  className="inline-flex items-center justify-center h-12 px-5 rounded-xl text-sm font-semibold text-foreground bg-secondary/60 ring-1 ring-border/60 hover:bg-secondary transition-all"
                >
                  Sign in
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative border-t border-border/40 bg-background/40 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5 text-primary" />
              </div>
              <span className="text-sm font-semibold text-foreground">Vitalis</span>
              <span className="text-xs text-muted-foreground ml-2">© {new Date().getFullYear()} · AI health intelligence</span>
            </div>
            <p className="text-[11px] text-muted-foreground max-w-md text-center sm:text-right">
              Vitalis provides decision support and is not a substitute for professional medical advice, diagnosis, or treatment.
            </p>
          </div>
        </footer>
      </main>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode={authMode} />
    </div>
  );
}