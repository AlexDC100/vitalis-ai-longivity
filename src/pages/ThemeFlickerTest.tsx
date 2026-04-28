import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import VitalisLogo from "@/components/brand/VitalisLogo";

/**
 * Mobile-ready theme flicker test page (DEV-friendly QA route).
 *
 * What it does:
 *  - Loads the app in an iframe N times (default 6 cold loads).
 *  - Each iframe is paused/throttled during boot (we sample the iframe
 *    document's <html> background-color every animation frame from
 *    `iframe.onload` start until 1500ms later).
 *  - For each load, we record the *first* background color the iframe
 *    paints. If it ever differs from the expected theme color (white
 *    in light mode, deep navy in dark mode), that's a flicker — i.e.
 *    the user briefly saw the wrong theme before our boot script ran.
 *  - We test BOTH themes by writing `vitalis.theme` into the iframe's
 *    parent localStorage before each reload (the iframe shares origin).
 *
 * Pass criteria (printed in the panel + assertable in console):
 *  - 0 frames where the iframe background differs from the expected
 *    theme background, across all loads, in both modes.
 *
 * Open at:  /__theme-flicker-test
 */

const DARK_BG = "rgb(10, 15, 26)";       // matches index.html boot script
const LIGHT_BG = "rgb(247, 248, 250)";   // #F7F8FA
const SAMPLES_MS = 1500;
const RUNS_PER_MODE = 3;

type Mode = "dark" | "light";
type RunResult = {
  mode: Mode;
  firstPaintBg: string;
  expectedBg: string;
  flickered: boolean;
  samples: number;
  durationMs: number;
};

function sampleIframeBg(iframe: HTMLIFrameElement): string {
  try {
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) return "";
    return getComputedStyle(doc.documentElement).backgroundColor || "";
  } catch {
    return "";
  }
}

export default function ThemeFlickerTest() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [results, setResults] = useState<RunResult[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string>("Idle");

  const expectedFor = useCallback((m: Mode) => (m === "dark" ? DARK_BG : LIGHT_BG), []);

  const runOne = useCallback(
    (mode: Mode): Promise<RunResult> =>
      new Promise((resolve) => {
        const iframe = iframeRef.current!;
        // Seed the theme into shared-origin localStorage so the
        // iframe's pre-React boot script picks it up.
        try {
          localStorage.setItem("vitalis.theme", mode);
        } catch {
          /* ignore */
        }

        const expected = expectedFor(mode);
        const samples: string[] = [];
        let firstPaintBg = "";
        const start = performance.now();

        const onLoad = () => {
          // Sample every animation frame for SAMPLES_MS.
          const tick = () => {
            const bg = sampleIframeBg(iframe);
            if (bg) {
              if (!firstPaintBg) firstPaintBg = bg;
              samples.push(bg);
            }
            if (performance.now() - start < SAMPLES_MS) {
              requestAnimationFrame(tick);
            } else {
              const flickered = samples.some((s) => s && s !== expected);
              iframe.removeEventListener("load", onLoad);
              resolve({
                mode,
                firstPaintBg: firstPaintBg || "(no sample)",
                expectedBg: expected,
                flickered,
                samples: samples.length,
                durationMs: Math.round(performance.now() - start),
              });
            }
          };
          requestAnimationFrame(tick);
        };

        iframe.addEventListener("load", onLoad);
        // Cache-bust to force a *cold* load each time, simulating
        // hard refresh on a slow device.
        iframe.src = `/?__themeFlickerProbe=${mode}&t=${Date.now()}`;
      }),
    [expectedFor],
  );

  const runAll = useCallback(async () => {
    setRunning(true);
    setResults([]);
    const all: RunResult[] = [];
    const order: Mode[] = [];
    for (let i = 0; i < RUNS_PER_MODE; i++) order.push("dark", "light");
    for (let i = 0; i < order.length; i++) {
      setProgress(`Run ${i + 1}/${order.length} — ${order[i]} mode`);
      // eslint-disable-next-line no-await-in-loop
      const r = await runOne(order[i]);
      all.push(r);
      setResults([...all]);
    }
    setProgress("Complete");
    setRunning(false);
    // eslint-disable-next-line no-console
    console.log(
      "[theme-flicker-test] summary:",
      all,
      all.every((r) => !r.flickered) ? "PASS ✅" : "FAIL ❌",
    );
  }, [runOne]);

  // Also watch the *current* page for any post-mount theme change that
  // would cause flicker — paranoia check during interactive sessions.
  useEffect(() => {
    let last = getComputedStyle(document.documentElement).backgroundColor;
    const t = window.setInterval(() => {
      const now = getComputedStyle(document.documentElement).backgroundColor;
      if (now !== last) {
        // eslint-disable-next-line no-console
        console.warn(`[theme-flicker-test] live bg changed ${last} → ${now}`);
        last = now;
      }
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  const summary = useMemo(() => {
    if (results.length === 0) return null;
    const failed = results.filter((r) => r.flickered).length;
    return { total: results.length, failed, passed: results.length - failed };
  }, [results]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between gap-3 px-6 py-4 border-b border-border/40">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-80 transition-opacity">
          <VitalisLogo variant="icon" size={22} title="Vitalis" />
          <span className="text-[15px] font-bold tracking-tight">Vitalis</span>
        </Link>
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Theme flicker test
        </span>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <section className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight">Theme bootstrap flicker test</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Reloads the app cold {RUNS_PER_MODE * 2} times ({RUNS_PER_MODE} per
            mode) and samples the iframe's document background on every animation
            frame for {SAMPLES_MS}&nbsp;ms. A "flicker" is any sampled background
            that differs from the expected theme background — i.e. the user
            briefly saw the wrong theme before our pre-React boot script applied
            <code className="mx-1 px-1 rounded bg-muted text-[12px]">.dark</code>
            /<code className="mx-1 px-1 rounded bg-muted text-[12px]">.light</code>.
          </p>
        </section>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={runAll}
            disabled={running}
            className="inline-flex items-center justify-center h-11 px-5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold shadow-card hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {running ? "Running…" : "Run flicker test"}
          </button>
          <span className="text-[12px] text-muted-foreground">{progress}</span>
        </div>

        {summary && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm ${
              summary.failed === 0
                ? "border-primary/30 bg-primary/5 text-foreground"
                : "border-destructive/40 bg-destructive/10 text-foreground"
            }`}
          >
            <div className="font-semibold">
              {summary.failed === 0 ? "PASS ✅" : "FAIL ❌"} —{" "}
              {summary.passed}/{summary.total} runs flicker-free
            </div>
            <div className="text-[12px] text-muted-foreground mt-1">
              Expected backgrounds: dark = {DARK_BG}, light = {LIGHT_BG}
            </div>
          </div>
        )}

        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map((r, i) => (
              <li
                key={i}
                className="rounded-lg border border-border bg-card text-card-foreground px-3 py-2 text-[12px]"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    #{i + 1} · {r.mode}
                  </span>
                  <span
                    className={
                      r.flickered
                        ? "text-destructive font-semibold"
                        : "text-primary font-semibold"
                    }
                  >
                    {r.flickered ? "FLICKER" : "OK"}
                  </span>
                </div>
                <div className="text-muted-foreground mt-1">
                  first paint: {r.firstPaintBg} · expected: {r.expectedBg} ·{" "}
                  {r.samples} samples · {r.durationMs}ms
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-xl border border-border overflow-hidden">
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wider text-muted-foreground border-b border-border/60 bg-muted/40">
            Probe iframe
          </div>
          <iframe
            ref={iframeRef}
            title="Vitalis flicker probe"
            className="w-full h-[420px] bg-background"
          />
        </div>
      </div>
    </div>
  );
}