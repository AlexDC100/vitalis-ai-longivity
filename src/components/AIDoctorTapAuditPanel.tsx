import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bug, Download, RefreshCw, X } from "lucide-react";

/**
 * Dev-only floating panel that audits tap-target sizes inside the AI
 * Doctor stage and lets you download a JSON report. Activated by:
 *   - URL: `?aidoctor-audit=1`
 *   - or:  localStorage["aidoctor_audit"] = "1"
 *
 * Renders nothing in production builds.
 *
 * The panel scans every interactive control inside the element matching
 * `targetSelector` (defaults to the AI Doctor stage). Anything below
 * 44×44 CSS px is reported with a CSS-ish selector and bounding box.
 */

export type TapAuditEntry = {
  selector: string;
  width: number;
  height: number;
  x: number;
  y: number;
  text: string;
  tag: string;
  ariaLabel: string | null;
};

const SELECTOR =
  'button, a[href], input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';

function describe(el: HTMLElement): string {
  const id = el.id ? `#${el.id}` : "";
  const cls =
    typeof el.className === "string" && el.className.trim()
      ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
      : "";
  const label =
    el.getAttribute("aria-label") ||
    el.getAttribute("title") ||
    el.textContent?.trim().slice(0, 30) ||
    "";
  return `${el.tagName.toLowerCase()}${id}${cls}${label ? ` [${label}]` : ""}`;
}

function audit(scope: ParentNode): TapAuditEntry[] {
  const out: TapAuditEntry[] = [];
  const nodes = Array.from(scope.querySelectorAll<HTMLElement>(SELECTOR));
  for (const el of nodes) {
    const cs = window.getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 && box.height === 0) continue;
    if (box.width < 44 || box.height < 44) {
      out.push({
        selector: describe(el),
        width: Math.round(box.width),
        height: Math.round(box.height),
        x: Math.round(box.x),
        y: Math.round(box.y),
        text: el.textContent?.trim().slice(0, 60) ?? "",
        tag: el.tagName.toLowerCase(),
        ariaLabel: el.getAttribute("aria-label"),
      });
    }
  }
  return out;
}

function isEnabled(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    if (new URLSearchParams(window.location.search).get("aidoctor-audit") === "1") return true;
    if (localStorage.getItem("aidoctor_audit") === "1") return true;
  } catch {
    /* ignore */
  }
  return false;
}

export default function AIDoctorTapAuditPanel({
  targetSelector = '[data-aidoctor-stage="true"]',
}: { targetSelector?: string }) {
  const [enabled] = useState(isEnabled);
  const [open, setOpen] = useState(true);
  const [entries, setEntries] = useState<TapAuditEntry[]>([]);
  const [runAt, setRunAt] = useState<number>(() => Date.now());
  const intervalRef = useRef<number | null>(null);

  const run = useCallback(() => {
    const stage = document.querySelector(targetSelector);
    if (!stage) return;
    setEntries(audit(stage));
    setRunAt(Date.now());
  }, [targetSelector]);

  useEffect(() => {
    if (!enabled) return;
    // Initial pass after first paint, then re-poll every 1.5s while open
    // — cheap, dev-only, and catches DOM updates from screen-state
    // transitions without needing a MutationObserver per node.
    const raf = requestAnimationFrame(run);
    intervalRef.current = window.setInterval(run, 1500);
    return () => {
      cancelAnimationFrame(raf);
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [enabled, run]);

  const download = useCallback(() => {
    const payload = {
      generatedAt: new Date().toISOString(),
      url: window.location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio },
      userAgent: navigator.userAgent,
      threshold: { width: 44, height: 44 },
      offenderCount: entries.length,
      offenders: entries,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `aidoctor-tap-audit-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, [entries]);

  const summary = useMemo(() => {
    if (entries.length === 0) return "All clear ✅";
    return `${entries.length} offender${entries.length === 1 ? "" : "s"}`;
  }, [entries]);

  if (!enabled) return null;

  return (
    <div
      role="region"
      aria-label="AI Doctor tap-target audit"
      className="fixed bottom-24 right-3 z-[60] w-72 max-w-[90vw] rounded-xl border border-border bg-card text-card-foreground shadow-card"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Bug className="w-4 h-4 text-primary shrink-0" />
          <span className="text-[12px] font-semibold truncate">Tap audit · {summary}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={run}
            aria-label="Re-run audit"
            title="Re-run audit"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={download}
            aria-label="Download JSON report"
            title="Download JSON"
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse panel" : "Expand panel"}
            title={open ? "Collapse" : "Expand"}
            className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <X className={`w-3.5 h-3.5 transition-transform ${open ? "" : "rotate-45"}`} />
          </button>
        </div>
      </div>
      {open && (
        <div className="px-3 py-2 max-h-64 overflow-y-auto">
          {entries.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              All interactive controls in the AI Doctor stage meet 44×44 px.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {entries.map((e, i) => (
                <li key={i} className="text-[11px] leading-snug rounded-md bg-muted/40 px-2 py-1.5">
                  <div className="font-mono truncate text-foreground">{e.selector}</div>
                  <div className="text-muted-foreground">
                    {e.width}×{e.height}px @ ({e.x}, {e.y})
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[10px] text-muted-foreground/70">
            Last run {new Date(runAt).toLocaleTimeString()} · threshold 44×44
          </p>
        </div>
      )}
    </div>
  );
}