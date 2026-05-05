import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import AuthDialog from "@/components/AuthDialog";
import brandLogo from "@/assets/longevity-ai-logo.png";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  ChevronDown,
  Download,
  FileText,
  Hospital,
  Lock,
  Menu,
  PlayCircle,
  Shield,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  TrendingUp,
  Upload,
  User,
  Users,
  Watch,
  Heart,
  X,
  Zap,
  Loader2,
} from "lucide-react";

interface Props {
  onGuestLogin: () => void;
}

export default function AuthPage({ onGuestLogin: _ }: Props) {
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign_in" | "sign_up">("sign_in");
  const [howOpen, setHowOpen] = useState(false);
  const [howStep, setHowStep] = useState(0);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    const hash = window.location.hash.replace("#", "");
    return hash || "";
  });
  const [reducedMotion, setReducedMotion] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement | null>(null);
  const mobilePanelRef = useRef<HTMLDivElement | null>(null);
  // Tracks the element that triggered the mobile menu so we can restore focus to it on close.
  const menuOpenerRef = useRef<HTMLElement | null>(null);
  // Distinguishes "opening" transitions from re-renders so we only autofocus on open.
  const wasMobileNavOpenRef = useRef(false);

  const closeMobileNav = (opener?: HTMLElement | null) => {
    if (opener) menuOpenerRef.current = opener;
    setMobileNavOpen(false);
  };

  const openMobileNav = (opener: HTMLElement | null) => {
    menuOpenerRef.current = opener;
    setMobileNavOpen(true);
  };

  // prefers-reduced-motion live tracking
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Lock body scroll while mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileNavOpen]);

  // Track scroll for header shrink + debounced auto-close of mobile nav.
  // The auto-close only fires when scrolling has settled OR the cumulative
  // distance crosses a threshold — preventing accidental closes from micro-scrolls.
  useEffect(() => {
    let lastY = window.scrollY;
    let openAnchorY = window.scrollY;
    let settleTimer: number | null = null;
    const DISTANCE_THRESHOLD = 80; // px
    const SETTLE_MS = 140;

    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);

      setMobileNavOpen((open) => {
        if (!open) {
          openAnchorY = y;
          return open;
        }
        // Crossed the distance threshold from where the menu opened — close immediately.
        if (Math.abs(y - openAnchorY) > DISTANCE_THRESHOLD) {
          return false;
        }
        // Otherwise debounce: only close once scrolling has settled.
        if (settleTimer !== null) window.clearTimeout(settleTimer);
        settleTimer = window.setTimeout(() => {
          if (Math.abs(window.scrollY - openAnchorY) > 24) {
            setMobileNavOpen(false);
          }
        }, SETTLE_MS);
        return open;
      });

      lastY = y;
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, []);

  // Reset the scroll anchor whenever the menu opens so the threshold is measured
  // from the open position, not from page load.
  useEffect(() => {
    if (mobileNavOpen) {
      // no-op; openAnchorY is updated on the next scroll tick via `open=false` branch above.
    }
  }, [mobileNavOpen]);

  // Close the mobile nav on hash route changes (e.g., user taps a section link).
  useEffect(() => {
    const onHashChange = () => {
      const id = window.location.hash.replace("#", "");
      if (id) setActiveSection(id);
      setMobileNavOpen(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Scroll-spy: highlight the nav link of the section currently in view
  useEffect(() => {
    const ids = ["product", "how", "mobile", "devices", "pricing", "audiences"];
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;
    // Honor an initial hash so the active link persists on first paint.
    const initialHash = window.location.hash.replace("#", "");
    if (initialHash && ids.includes(initialHash)) {
      setActiveSection(initialHash);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-40% 0px -50% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    sections.forEach((s) => observer.observe(s));
    return () => observer.disconnect();
  }, []);

  // Focus trap + Esc to close + return focus to the element that opened the menu.
  useEffect(() => {
    const wasOpen = wasMobileNavOpenRef.current;
    wasMobileNavOpenRef.current = mobileNavOpen;

    if (!mobileNavOpen) {
      // Restore focus only on the open->closed transition, to the original opener
      // (falling back to the hamburger if we don't have one).
      if (wasOpen) {
        const target = menuOpenerRef.current ?? hamburgerRef.current;
        // Defer to allow any click handler / focus shifts to settle.
        requestAnimationFrame(() => target?.focus?.());
        menuOpenerRef.current = null;
      }
      return;
    }

    const panel = mobilePanelRef.current;
    if (!panel) return;

    const getFocusable = () =>
      Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("data-focus-skip"));

    // Move focus into the panel only on the closed->open transition.
    if (!wasOpen) {
      const focusables = getFocusable();
      focusables[0]?.focus();
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setMobileNavOpen(false);
        return;
      }
      if (e.key !== "Tab") return;
      const items = getFocusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    track({ name: "pricing_preview_view", plan: "Pro" });
  }, []);

  // Walkthrough auto-advance
  useEffect(() => {
    if (!howOpen) return;
    const id = setInterval(() => {
      setHowStep((s) => (s + 1) % 4);
    }, 2200);
    return () => clearInterval(id);
  }, [howOpen]);

  const openHow = () => {
    setHowStep(0);
    setHowOpen(true);
    track({ name: "how_it_works_open" });
  };

  const openAuth = (mode: "sign_in" | "sign_up") => {
    setAuthMode(mode);
    setAuthOpen(true);
  };

  // ---- Devices onboarding (landing) ----
  type LandingDevice = { id: string; name: string; tagline: string; accent: string; Icon: typeof Watch };
  const landingDevices: LandingDevice[] = [
    { id: "apple_watch", name: "Apple Watch", tagline: "Heart · ECG · Activity",     accent: "from-zinc-200 to-zinc-400",   Icon: Watch },
    { id: "whoop",       name: "WHOOP",       tagline: "Recovery · Strain · Sleep", accent: "from-amber-300 to-rose-400",  Icon: Activity },
    { id: "oura",        name: "Oura Ring",   tagline: "Sleep · Readiness",          accent: "from-violet-300 to-violet-500", Icon: Heart },
    { id: "garmin",      name: "Garmin",      tagline: "VO₂ · Training load",        accent: "from-sky-300 to-sky-500",      Icon: Activity },
  ];

  const CONSENT_KEY = "vitalis_devices_consent_v1";
  const SHARE_KEY = "vitalis_devices_share_ai_v1";
  const CONNECTED_KEY = "vitalis_devices_connected_v1";

  const [landingConnected, setLandingConnected] = useState<Record<string, boolean>>({});
  const [landingPending, setLandingPending] = useState<string | null>(null);
  const [landingConsentGiven, setLandingConsentGiven] = useState(false);
  const [landingShareAI, setLandingShareAI] = useState(true);
  const [landingConsentOpen, setLandingConsentOpen] = useState(false);
  const [landingPendingDevice, setLandingPendingDevice] = useState<LandingDevice | null>(null);

  useEffect(() => {
    try {
      setLandingConsentGiven(localStorage.getItem(CONSENT_KEY) === "true");
      setLandingShareAI(localStorage.getItem(SHARE_KEY) !== "false");
      const raw = localStorage.getItem(CONNECTED_KEY);
      if (raw) setLandingConnected(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem(CONNECTED_KEY, JSON.stringify(landingConnected)); } catch {}
  }, [landingConnected]);

  const persistLandingShare = (v: boolean) => {
    setLandingShareAI(v);
    try { localStorage.setItem(SHARE_KEY, String(v)); } catch {}
    toast.success(v ? "AI can use your device data" : "AI access paused", {
      description: v
        ? "Recovery, sleep and HRV will inform your AI answers."
        : "Your AI Doctor will not read device data until you re-enable.",
    });
  };

  const startLandingPair = (d: LandingDevice) => {
    setLandingPending(d.id);
    setTimeout(() => {
      setLandingConnected((p) => ({ ...p, [d.id]: true }));
      setLandingPending(null);
      toast.success(`${d.name} connected`, { description: "Syncing health data securely." });
    }, 900);
  };

  const acceptLandingConsent = () => {
    try { localStorage.setItem(CONSENT_KEY, "true"); } catch {}
    setLandingConsentGiven(true);
    setLandingConsentOpen(false);
    if (landingPendingDevice) startLandingPair(landingPendingDevice);
    setLandingPendingDevice(null);
  };

  const toggleLandingDevice = (d: LandingDevice) => {
    if (landingConnected[d.id]) {
      setLandingConnected((p) => ({ ...p, [d.id]: false }));
      toast.success(`${d.name} disconnected`);
      return;
    }
    if (!landingConsentGiven) {
      setLandingPendingDevice(d);
      setLandingConsentOpen(true);
      return;
    }
    startLandingPair(d);
  };

  // ---- iPhone mock interactive chat ----
  type ChatMsg = { id: number; role: "user" | "ai"; text: string; quickReplies?: string[]; report?: boolean };
  const initialChat: ChatMsg[] = [
    { id: 1, role: "user", text: "My HRV dropped to 38ms last night. Should I rest today?" },
    { id: 2, role: "ai",   text: "Yes — your HRV is 24% below your 30-day baseline and recovery is 52%. A light mobility day will serve you better than training hard." },
    { id: 3, role: "ai",   text: "Want me to draft a recovery plan you can download?", quickReplies: ["Yes, draft it", "Show data"] },
  ];
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(initialChat);
  const [chatTyping, setChatTyping] = useState(false);
  const [reportReady, setReportReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages, chatTyping]);

  const handleQuickReply = (msgId: number, reply: string) => {
    // remove quickReplies from clicked message + push user reply
    setChatMessages((prev) => {
      const cleaned = prev.map((m) => (m.id === msgId ? { ...m, quickReplies: undefined } : m));
      return [...cleaned, { id: Date.now(), role: "user", text: reply }];
    });
    setChatTyping(true);

    setTimeout(() => {
      setChatTyping(false);
      if (reply === "Yes, draft it") {
        setChatMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "ai",
            text: "Done — a 24h recovery plan with sleep, nutrition and gentle movement is ready.",
            report: true,
          },
        ]);
        setReportReady(true);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            id: Date.now() + 1,
            role: "ai",
            text: "HRV 38ms (baseline 50). Recovery 52%. Sleep 6h12m (-1h vs avg). RHR +6 bpm.",
            quickReplies: ["Draft recovery plan"],
          },
        ]);
      }
    }, 900);
  };

  const handleDownloadDemo = () => {
    setDownloading(true);
    const md = `# Vitalis — Recovery Plan (Demo)\n\nGenerated: ${new Date().toLocaleString()}\n\n## Snapshot\n- HRV: 38 ms (24% below 30-day baseline)\n- Recovery: 52%\n- Sleep: 6h12m\n- Resting HR: +6 bpm vs avg\n\n## Recommendation\nLight mobility day. Avoid high-intensity training.\n\n## 24h Plan\n- Morning: 10 min mobility + sunlight exposure\n- Hydration: 2.5–3 L water + electrolytes\n- Nutrition: protein-forward meals, reduce alcohol & late caffeine\n- Evening: device-free 60 min before bed, target 8h sleep\n\n---\n*AI-assisted summary only. Not a medical diagnosis.*\n`;
    setTimeout(() => {
      const blob = new Blob([md], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "vitalis-recovery-plan.md";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloading(false);
      toast.success("Report downloaded", { description: "Sign up to generate full clinical reports." });
    }, 600);
  };

  const resetChatDemo = () => {
    setChatMessages(initialChat);
    setReportReady(false);
  };

  const navItems = [
    { label: "Product", href: "#product" },
    { label: "How it works", href: "#how" },
    { label: "Mobile", href: "#mobile" },
    { label: "Devices", href: "#devices" },
    { label: "Pricing", href: "#pricing" },
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
    {
      icon: User,
      title: "Individuals",
      desc: "Personal longevity & risk insight.",
      outcomes: [
        "Identify your #1 health risk in under 5 minutes from existing labs.",
        "Track biological age and longevity score trajectory month over month.",
      ],
      compliance: "GDPR-aligned. Personal data export and full account deletion at any time.",
    },
    {
      icon: Building2,
      title: "Corporations",
      desc: "Executive health programs at scale.",
      outcomes: [
        "Roll out executive health screening across leadership with aggregated risk dashboards.",
        "Reduce sick leave with proactive metabolic and cardiovascular intervention plans.",
      ],
      compliance: "SSO-ready, role-based access. Aggregated reporting only — no individual data shared with employers.",
    },
    {
      icon: Stethoscope,
      title: "Private clinics",
      desc: "Augment consultations with AI triage.",
      outcomes: [
        "Pre-consultation summaries cut intake time per patient by up to 40%.",
        "Standardized longevity protocols with auditable AI reasoning per recommendation.",
      ],
      compliance: "HIPAA-grade encryption, BAA available. Clinician override on every AI suggestion.",
    },
    {
      icon: Hospital,
      title: "Hospitals",
      desc: "Decision support for chronic care.",
      outcomes: [
        "Continuous risk stratification for chronic disease cohorts (cardio, metabolic, renal).",
        "Integrates with existing lab and EHR data via secure import pipelines.",
      ],
      compliance: "HIPAA + ISO 27001 controls. Data residency options for EU/US deployments.",
    },
  ];

  const annualDiscount = 0.2; // 20% off annual
  const formatPrice = (monthly: number) => {
    if (monthly === 0) return { price: "$0", cadence: "/ 7 days", note: "Free trial · no card required" };
    if (billing === "monthly") {
      return { price: `$${monthly}`, cadence: "/ month", note: "Billed monthly" };
    }
    const annualPerMonth = Math.round(monthly * (1 - annualDiscount));
    const annualTotal = annualPerMonth * 12;
    return {
      price: `$${annualPerMonth}`,
      cadence: "/ month",
      note: `$${annualTotal} billed annually · save 20%`,
    };
  };

  const plans = [
    {
      name: "Free",
      monthly: 0,
      features: [
        "Upload up to 2 reports / month",
        "Basic AI Doctor preview",
        "Basic risk scoring",
        "Limited longevity insights",
      ],
      highlight: false,
    },
    {
      name: "Pro",
      monthly: 10,
      features: [
        "Unlimited reports & uploads",
        "Advanced AI features (full AI Doctor chat)",
        "Clinical-grade insights & trends",
        "Device integrations",
        "Priority support",
      ],
      highlight: true,
    },
  ];

  return (
    <div className="min-h-screen auth-bg relative overflow-hidden">
      <div className="absolute inset-0 auth-grid-pattern pointer-events-none" />

      {/* HEADER */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-xl ${
          reducedMotion ? "" : "transition-[background-color,border-color,box-shadow] duration-300 ease-out"
        } ${
          scrolled
            ? "bg-background/95 border-border/70 shadow-[0_4px_24px_-12px_hsl(var(--background)/0.9)]"
            : "bg-background/80 border-border/50"
        }`}
      >
        <div
          className={`max-w-7xl mx-auto flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-10 ${
            reducedMotion ? "" : "transition-[height] duration-300 ease-out"
          } ${
            scrolled ? "h-12 md:h-14" : "h-14 md:h-16"
          }`}
        >
          {/* Logo */}
          <a href="#" className="flex items-center gap-2 sm:gap-2.5 min-w-0" aria-label="Longevity AI home">
            <img
              src={brandLogo}
              alt=""
              width={36}
              height={36}
              className={`shrink-0 object-contain drop-shadow-[0_0_12px_hsl(var(--primary)/0.4)] ${
                reducedMotion ? "" : "transition-[width,height] duration-300 ease-out"
              } ${scrolled ? "w-7 h-7" : "w-8 h-8 sm:w-9 sm:h-9"}`}
            />
            <span className="text-[15px] sm:text-base font-semibold tracking-tight text-foreground truncate">
              Longevity <span className="text-primary">AI</span>
            </span>
          </a>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {navItems.map((item) => {
              const id = item.href.replace("#", "");
              const isActive = activeSection === id;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  className={`text-[13.5px] font-medium transition-colors ${
                    isActive
                      ? "text-primary"
                      : "text-foreground/80 hover:text-foreground"
                  }`}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          {/* Right side actions */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => openAuth("sign_in")}
              className="hidden md:inline-flex items-center px-3.5 h-9 rounded-lg text-[13px] font-semibold text-foreground hover:bg-secondary/60 transition-colors"
            >
              Sign in
            </button>
            <Button
              variant="vitalis"
              onClick={() => openAuth("sign_up")}
              className="h-9 px-3 sm:px-4 rounded-lg text-[13px] font-semibold"
            >
              Get started
            </Button>
            {/* Mobile menu toggle */}
            <button
              ref={hamburgerRef}
              type="button"
              aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
              aria-haspopup="menu"
              aria-expanded={mobileNavOpen}
              aria-controls={mobileNavOpen ? "mobile-nav-panel" : undefined}
              onClick={(e) => {
                if (mobileNavOpen) {
                  closeMobileNav(e.currentTarget);
                } else {
                  openMobileNav(e.currentTarget);
                }
              }}
              className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg text-foreground hover:bg-secondary/60 transition-colors"
            >
              {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav panel */}
        <div
          id="mobile-nav-panel"
          ref={mobilePanelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Main menu"
          aria-labelledby={undefined}
          aria-hidden={!mobileNavOpen}
          className={`md:hidden overflow-hidden border-t border-border/40 bg-background/95 backdrop-blur-xl origin-top transform-gpu will-change-[transform,opacity,max-height] ${
            reducedMotion
              ? "transition-none"
              : "transition-[max-height,opacity,transform] duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          } ${
            mobileNavOpen
              ? "max-h-[480px] opacity-100 scale-y-100 pointer-events-auto"
              : `max-h-0 opacity-0 pointer-events-none ${reducedMotion ? "scale-y-100" : "scale-y-95"}`
          }`}
        >
          <nav className="px-4 sm:px-6 py-3 flex flex-col">
            {navItems.map((item) => {
              const id = item.href.replace("#", "");
              const isActive = activeSection === id;
              return (
                <a
                  key={item.label}
                  href={item.href}
                  aria-current={isActive ? "true" : undefined}
                  tabIndex={mobileNavOpen ? 0 : -1}
                  onClick={(e) => {
                    setActiveSection(id);
                    closeMobileNav(e.currentTarget);
                  }}
                  className={`group relative flex items-center justify-between py-3 pl-3 pr-2 -mx-1 rounded-lg text-[15px] font-medium border-b border-border/30 last:border-b-0 transition-colors ${
                    isActive
                      ? "text-foreground bg-primary/10"
                      : "text-foreground/85 hover:text-foreground hover:bg-secondary/40"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`block w-1 h-5 rounded-full transition-colors ${
                        isActive ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                    {item.label}
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </a>
              );
            })}
            <button
              tabIndex={mobileNavOpen ? 0 : -1}
              onClick={(e) => {
                closeMobileNav(e.currentTarget);
                openAuth("sign_in");
              }}
              className="mt-3 inline-flex items-center justify-center h-11 rounded-lg text-[14px] font-semibold text-foreground bg-secondary/60 hover:bg-secondary transition-colors"
            >
              Sign in
            </button>
          </nav>
        </div>
      </header>

      <main className="relative">
        {/* HERO — Apple-like, centered, generous whitespace */}
        <section className="relative max-w-5xl mx-auto px-5 sm:px-6 lg:px-10 pt-20 sm:pt-28 lg:pt-36 pb-20 sm:pb-28 lg:pb-32 text-center">
          <div className="animate-auth-fade">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20 mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-primary" />
              <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">
                AI Health Intelligence
              </span>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.05] text-foreground max-w-[18ch] mx-auto">
              Health that <span className="text-muted-foreground">thinks ahead.</span>
            </h1>

            <p className="mt-6 sm:mt-7 text-lg sm:text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto font-light">
              Vitalis turns your medical reports and device data into a calm, daily plan — with clinical-grade reasoning behind every insight.
            </p>

            <div className="mt-9 sm:mt-10 flex flex-col sm:flex-row gap-3 justify-center">
              <Button
                variant="vitalis"
                onClick={() => openAuth("sign_up")}
                className="h-12 w-full sm:w-auto px-7 rounded-full text-sm font-semibold tracking-wide hover:-translate-y-0.5 transition-all"
              >
                Get started
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
              <a
                href="#how"
                onClick={(e) => { e.preventDefault(); openHow(); }}
                className="inline-flex items-center justify-center h-12 w-full sm:w-auto px-6 rounded-full text-sm font-semibold text-foreground bg-secondary/60 ring-1 ring-border/60 hover:bg-secondary transition-all"
              >
                <PlayCircle className="w-4 h-4 mr-2 text-primary" />
                See how it works
              </a>
            </div>
          </div>

          {/* Product preview — single hero card */}
          <div className="relative mt-16 sm:mt-20 max-w-3xl mx-auto animate-auth-fade">
            <div className="absolute -inset-8 bg-gradient-to-br from-primary/15 via-transparent to-[hsl(var(--vitalis-info))]/10 blur-3xl rounded-[2rem] pointer-events-none" />
            <div className="relative auth-glass rounded-3xl p-5 sm:p-7 ring-1 ring-border/60 shadow-[0_40px_100px_-30px_rgba(0,0,0,0.6)] text-left">
              <div className="flex items-start gap-3 pb-4 border-b border-border/40">
                <div className="w-9 h-9 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center shrink-0">
                  <Stethoscope className="w-4 h-4 text-primary" />
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

              <div className="mt-4 p-4 rounded-2xl bg-[hsl(var(--vitalis-warning)/0.08)] ring-1 ring-[hsl(var(--vitalis-warning)/0.3)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-semibold tracking-wider uppercase text-[hsl(var(--vitalis-warning))]">Cardiovascular</span>
                  <span className="text-xs font-bold text-[hsl(var(--vitalis-warning))]">Elevated</span>
                </div>
                <p className="text-sm font-semibold text-foreground mt-1.5">ApoB 112 mg/dL — above optimal range</p>
                <div className="mt-2.5 h-1 rounded-full bg-secondary/80 overflow-hidden">
                  <div className="h-full w-[72%] rounded-full bg-gradient-to-r from-[hsl(var(--vitalis-warning))] to-[hsl(var(--vitalis-danger))]" />
                </div>
              </div>

              <div className="mt-4 p-4 rounded-2xl bg-primary/8 ring-1 ring-primary/25">
                <span className="text-[10px] font-semibold tracking-wider uppercase text-primary">Next action</span>
                <p className="text-sm font-semibold text-foreground mt-1">Schedule lipid follow-up & start dietary protocol</p>
              </div>
            </div>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> HIPAA-grade encryption</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> Used by clinical teams</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> No data resale</span>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="relative max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-20 sm:py-28 lg:py-32 border-t border-border/40">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight text-foreground">
              From raw data to a <span className="text-muted-foreground">clear plan.</span>
            </h2>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground font-light">
              Four steps. Built on clinical evidence and your actual biology.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {steps.map((s, i) => (
              <div
                key={s.title}
                className="auth-glass rounded-2xl p-4 sm:p-5 ring-1 ring-border/50 hover:ring-primary/40 transition-all"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                    <s.icon className="w-4.5 h-4.5 text-primary" />
                  </div>
                  <span className="text-[11px] font-semibold text-muted-foreground tracking-wider">0{i + 1}</span>
                </div>
                <h3 className="mt-3 sm:mt-4 text-[15px] sm:text-base font-semibold text-foreground">{s.title}</h3>
                <p className="mt-1.5 text-[13px] sm:text-sm text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* MOBILE APP PREVIEW */}
        <section id="mobile" className="relative max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-20 sm:py-28 lg:py-32 border-t border-border/40">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20 mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">iPhone</span>
              </div>
              <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight text-foreground">
                Your AI doctor, <span className="text-muted-foreground">in your pocket.</span>
              </h2>
              <p className="mt-5 text-base sm:text-lg text-muted-foreground font-light leading-relaxed">
                A calm, native-feeling iOS experience. Ask anything, get clinical-grade reasoning, download a structured report — anytime.
              </p>
              <ul className="mt-7 space-y-3">
                {[
                  "Conversational AI Doctor with full medical context",
                  "Live readiness, recovery & sleep from your wearables",
                  "One-tap downloadable reports for every answer",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px] text-foreground/90">
                    <Check className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8">
                <Button
                  variant="vitalis"
                  onClick={() => openAuth("sign_up")}
                  className="h-11 px-6 rounded-full text-sm font-semibold"
                >
                  Try it free
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>

            {/* iPhone mockup */}
            <div className="relative flex justify-center">
              <div className="absolute -inset-10 bg-gradient-to-br from-primary/20 via-transparent to-[hsl(var(--vitalis-info))]/15 blur-3xl rounded-[3rem] pointer-events-none" />
              <div className="relative w-[300px] sm:w-[330px] aspect-[9/19.5] rounded-[3rem] bg-gradient-to-b from-zinc-900 to-black p-3 ring-1 ring-white/10 shadow-[0_50px_120px_-30px_rgba(0,0,0,0.8)]">
                {/* Notch */}
                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 rounded-full bg-black z-10" />
                {/* Screen */}
                <div className="relative w-full h-full rounded-[2.4rem] bg-background overflow-hidden flex flex-col">
                  {/* Status */}
                  <div className="flex items-center justify-between px-6 pt-3 pb-2 text-[10px] text-foreground/80 font-semibold">
                    <span>9:41</span>
                    <span className="flex items-center gap-1">
                      <span className="w-3 h-2 rounded-sm bg-foreground/70" />
                      <span className="w-3 h-2 rounded-sm bg-foreground/70" />
                    </span>
                  </div>
                  {/* Header */}
                  <div className="px-5 pt-4 pb-3 border-b border-border/40">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center">
                        <Stethoscope className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <div>
                        <div className="text-[12px] font-semibold text-foreground">AI Doctor</div>
                        <div className="text-[9px] text-primary uppercase tracking-wider">Online</div>
                      </div>
                    </div>
                  </div>
                  {/* Chat */}
                  <div className="flex-1 overflow-hidden px-4 py-3 space-y-2.5">
                    <div className="max-w-[80%] ml-auto bg-primary text-primary-foreground text-[11px] rounded-2xl rounded-tr-sm px-3 py-2 leading-snug">
                      My HRV dropped to 38ms last night. Should I rest today?
                    </div>
                    <div className="max-w-[85%] bg-secondary/70 text-foreground text-[11px] rounded-2xl rounded-tl-sm px-3 py-2 leading-snug">
                      Yes — your HRV is 24% below your 30‑day baseline and recovery is 52%. A light mobility day will serve you better than training hard.
                    </div>
                    <div className="max-w-[85%] bg-secondary/70 text-foreground text-[11px] rounded-2xl rounded-tl-sm px-3 py-2 leading-snug">
                      Want me to draft a recovery plan you can download?
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <span className="text-[9.5px] px-2 py-1 rounded-full bg-primary/15 text-primary border border-primary/30">Yes, draft it</span>
                      <span className="text-[9.5px] px-2 py-1 rounded-full bg-secondary/70 text-foreground/80 border border-border/50">Show data</span>
                    </div>
                  </div>
                  {/* Input */}
                  <div className="px-4 pb-5">
                    <div className="flex items-center gap-2 px-3 h-9 rounded-full bg-secondary/60 ring-1 ring-border/60">
                      <span className="text-[11px] text-muted-foreground flex-1">Ask anything…</span>
                      <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <ArrowRight className="w-3 h-3 text-primary-foreground" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* DEVICES */}
        <section id="devices" className="relative max-w-6xl mx-auto px-5 sm:px-6 lg:px-10 py-20 sm:py-28 lg:py-32 border-t border-border/40">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 ring-1 ring-primary/20 mb-5">
              <Watch className="w-3 h-3 text-primary" />
              <span className="text-[11px] font-semibold tracking-[0.18em] text-primary uppercase">Wearables</span>
            </div>
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight text-foreground">
              One tap to <span className="text-muted-foreground">connect everything.</span>
            </h2>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground font-light">
              Apple Watch, WHOOP, Oura, Garmin and more — synced privately, ready for AI.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 max-w-5xl mx-auto">
            {[
              { name: "Apple Watch", tagline: "Heart · ECG · Activity", accent: "from-zinc-200 to-zinc-400" },
              { name: "WHOOP",       tagline: "Recovery · Strain · Sleep", accent: "from-amber-300 to-rose-400" },
              { name: "Oura Ring",   tagline: "Sleep · Readiness", accent: "from-violet-300 to-violet-500" },
              { name: "Garmin",      tagline: "VO₂ · Training load", accent: "from-sky-300 to-sky-500" },
            ].map((d) => (
              <div
                key={d.name}
                className="group relative overflow-hidden auth-glass rounded-2xl p-5 ring-1 ring-border/50 hover:ring-primary/40 transition-all"
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${d.accent} opacity-[0.10] blur-2xl group-hover:opacity-25 transition-opacity`}
                />
                <div className="relative flex items-center justify-between mb-4">
                  <div className="w-10 h-10 rounded-xl bg-secondary/60 ring-1 ring-border/60 flex items-center justify-center text-foreground">
                    <Watch className="w-4.5 h-4.5" />
                  </div>
                  <div className="w-7 h-7 rounded-full bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center text-primary">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                </div>
                <div className="relative">
                  <div className="text-[14px] font-semibold text-foreground">{d.name}</div>
                  <div className="text-[11.5px] text-muted-foreground mt-1">{d.tagline}</div>
                </div>
                <div className="relative mt-4 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-primary">
                  Connect
                  <ChevronRight className="w-3 h-3" />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><Lock className="w-3 h-3 text-primary" /> End-to-end encrypted</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> Opt-in AI access</span>
            <span className="flex items-center gap-1.5"><Check className="w-3 h-3 text-primary" /> Disconnect anytime</span>
          </div>
        </section>

        {/* AUDIENCES */}
        <section id="audiences" className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-20 sm:py-28 lg:py-32 border-t border-border/40">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight text-foreground">
              Built for <span className="text-muted-foreground">healthcare.</span>
            </h2>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground font-light">
              From individuals to multi-site hospital networks.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {audiences.map((a) => (
              <div
                key={a.title}
                className="auth-glass rounded-2xl ring-1 ring-border/50 hover:ring-primary/30 transition-all p-6"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/25 flex items-center justify-center shrink-0">
                    <a.icon className="w-5 h-5 text-primary" />
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{a.title}</h3>
                </div>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">{a.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-10 py-20 sm:py-28 lg:py-32 border-t border-border/40">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight text-foreground">
              Simple, <span className="text-muted-foreground">transparent.</span>
            </h2>
            <p className="mt-5 text-base sm:text-lg text-muted-foreground font-light">
              Start free. Upgrade when you're ready.
            </p>

            {/* Billing toggle */}
            <div className="mt-7 inline-flex items-center p-1 rounded-full bg-secondary/60 ring-1 ring-border/60">
              <button
                onClick={() => { setBilling("monthly"); track({ name: "pricing_billing_toggle", cycle: "monthly" }); }}
                className={`px-4 h-8 rounded-full text-xs font-semibold transition-all ${
                  billing === "monthly" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => { setBilling("annual"); track({ name: "pricing_billing_toggle", cycle: "annual" }); }}
                className={`px-4 h-8 rounded-full text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  billing === "annual" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Annual
                <span className="text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md bg-primary/15 text-primary">
                  -20%
                </span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {plans.map((p) => {
              const pricing = formatPrice(p.monthly);
              return (
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
                  <span className="text-3xl font-bold text-white">{pricing.price}</span>
                  <span className="text-sm text-white/70">{pricing.cadence}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground min-h-[16px]">{pricing.note}</p>
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
                  {p.monthly === 0 ? "Start free trial" : "Get started"}
                </Button>
              </div>
            );})}
          </div>
        </section>

        {/* CTA */}
        <section className="relative max-w-5xl mx-auto px-5 sm:px-6 lg:px-10 py-24 sm:py-32 text-center border-t border-border/40">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight leading-tight text-foreground">
            Start today.
          </h2>
          <p className="mt-5 text-base sm:text-lg text-muted-foreground font-light max-w-xl mx-auto">
            7-day free trial. No credit card required.
          </p>
          <div className="mt-9 flex flex-col sm:flex-row gap-3 justify-center">
                <Button
                  variant="vitalis"
                  onClick={() => openAuth("sign_up")}
                  className="h-12 w-full sm:w-auto px-7 rounded-full text-sm font-semibold tracking-wide"
                >
                  Start free trial
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
                <button
                  onClick={() => openAuth("sign_in")}
                  className="inline-flex items-center justify-center h-12 w-full sm:w-auto px-6 rounded-full text-sm font-semibold text-foreground bg-secondary/60 ring-1 ring-border/60 hover:bg-secondary transition-all"
                >
                  Sign in
                </button>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="relative border-t border-border/60 bg-card/95 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-10 py-10 flex flex-col sm:flex-row items-center justify-between gap-5">
            <div className="flex items-center gap-3">
              <img
                src={brandLogo}
                alt=""
                width={32}
                height={32}
                loading="lazy"
                className="w-8 h-8 object-contain drop-shadow-[0_0_10px_hsl(var(--primary)/0.35)]"
              />
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-foreground leading-tight">
                  Longevity <span className="text-primary">AI</span>
                </span>
                <span className="text-[11px] text-muted-foreground leading-tight">
                  © {new Date().getFullYear()} · AI health intelligence
                </span>
              </div>
            </div>
            <div className="flex flex-col sm:items-end gap-2">
              <p className="text-[11px] text-muted-foreground max-w-md text-center sm:text-right">
                Decision support tool — not a substitute for professional medical advice.
              </p>
            </div>
          </div>
        </footer>
      </main>

      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} defaultMode={authMode} />

      {/* HOW IT WORKS WALKTHROUGH */}
      <Dialog open={howOpen} onOpenChange={setHowOpen}>
        <DialogContent className="max-w-2xl auth-glass border-border/60 p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle className="text-xl font-semibold tracking-tight">See how Longevity AI works</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              A 4-step walkthrough — from raw data to a clear action plan.
            </DialogDescription>
          </DialogHeader>

          {/* Stage */}
          <div className="relative mx-6 mt-2 mb-4 h-56 rounded-2xl bg-gradient-to-br from-secondary/60 to-background ring-1 ring-border/50 overflow-hidden">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const active = howStep === i;
              return (
                <div
                  key={s.title}
                  className={`absolute inset-0 flex flex-col items-center justify-center px-6 transition-all duration-500 ${
                    active ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
                  }`}
                >
                  <div className="w-16 h-16 rounded-2xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center animate-pulse-glow">
                    <Icon className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="mt-5 text-lg font-semibold text-foreground">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground text-center max-w-sm leading-relaxed">{s.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Stepper */}
          <div className="px-6 pb-6">
            <div className="grid grid-cols-4 gap-2">
              {steps.map((s, i) => {
                const active = howStep === i;
                const done = howStep > i;
                return (
                  <button
                    key={s.title}
                    onClick={() => setHowStep(i)}
                    className={`group flex flex-col items-start gap-1.5 p-2.5 rounded-xl ring-1 transition-all ${
                      active
                        ? "ring-primary/50 bg-primary/10"
                        : done
                        ? "ring-border/50 bg-secondary/40"
                        : "ring-border/40 hover:ring-border/70"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 w-full">
                      <span className={`text-[10px] font-bold tracking-wider ${active ? "text-primary" : "text-muted-foreground"}`}>
                        0{i + 1}
                      </span>
                      {done && <Check className="w-3 h-3 text-primary ml-auto" />}
                    </div>
                    <span className={`text-[11px] font-semibold ${active ? "text-foreground" : "text-muted-foreground"} text-left leading-tight`}>
                      {s.title}
                    </span>
                    <div className={`h-0.5 w-full rounded-full overflow-hidden bg-border/40`}>
                      <div
                        className={`h-full bg-primary transition-all ${
                          active ? "w-full duration-[2200ms] ease-linear" : done ? "w-full" : "w-0"
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3">
              <p className="text-[11px] text-muted-foreground">
                Step {howStep + 1} of 4 · auto-advancing
              </p>
              <Button
                variant="vitalis"
                onClick={() => { setHowOpen(false); openAuth("sign_up"); }}
                className="h-10 px-4 rounded-xl text-sm font-semibold"
              >
                Start free trial <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}