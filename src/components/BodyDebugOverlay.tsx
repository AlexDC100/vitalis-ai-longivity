import { useEffect, useMemo, useState, useCallback } from "react";
import { X, Crosshair, Activity } from "lucide-react";

/**
 * Visual debug overlay for the Body screen.
 *
 * Provides:
 *   • Hit-area outlines for every interactive control (`html.body-debug` adds
 *     a red border + size badge via `index.css`).
 *   • Runtime audit that scans `containerRef` and reports controls smaller
 *     than 44×44 in the on-screen list.
 *   • Mini "Loading performance" panel reading `performance.measure` entries
 *     produced by BodyScreen (`body:tfc:longevity`, `body:tfc:metrics`,
 *     `body:tfc:profile`, `body:tfc:labs`).
 *
 * Toggled from BodyScreen via the `useBodyDebug()` hook.
 */

interface Offender {
  selector: string;
  width: number;
  height: number;
  text: string;
}

interface PerfRow { name: string; duration: number; }

const TARGET_PX = 44;
const TRACKED_NAMES = ["body:tfc:longevity", "body:tfc:metrics", "body:tfc:profile", "body:tfc:labs"] as const;

function describeEl(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id ? `#${(el as HTMLElement).id}` : "";
  const cls = (el as HTMLElement).className?.toString?.().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
  return `${tag}${id}${cls ? "." + cls : ""}`;
}

function elText(el: Element): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return aria;
  const txt = (el.textContent || "").trim().replace(/\s+/g, " ");
  return txt.length > 32 ? txt.slice(0, 32) + "…" : txt || "(no label)";
}

export function BodyDebugOverlay({
  containerRef,
  onClose,
}: {
  containerRef: React.RefObject<HTMLElement>;
  onClose: () => void;
}) {
  const [offenders, setOffenders] = useState<Offender[]>([]);
  const [perf, setPerf] = useState<PerfRow[]>([]);
  const [auditCount, setAuditCount] = useState(0);

  const runAudit = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const found: Offender[] = [];
    const nodes = root.querySelectorAll<HTMLElement>(
      'button, a[href], input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])',
    );
    nodes.forEach(el => {
      // Skip elements that are visually hidden (e.g. screen-reader only)
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return;
      if (rect.width < TARGET_PX || rect.height < TARGET_PX) {
        found.push({
          selector: describeEl(el),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          text: elText(el),
        });
      }
    });
    setOffenders(found);
    setAuditCount(nodes.length);
    // Also surface in the console overlay for record-keeping.
    if (found.length === 0) {
      // eslint-disable-next-line no-console
      console.info(`[BodyScreen.audit] ✓ All ${nodes.length} controls meet the ${TARGET_PX}×${TARGET_PX}px minimum`);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`[BodyScreen.audit] ✗ ${found.length}/${nodes.length} controls below ${TARGET_PX}×${TARGET_PX}px`, found);
    }
  }, [containerRef]);

  const refreshPerf = useCallback(() => {
    try {
      const rows: PerfRow[] = [];
      for (const name of TRACKED_NAMES) {
        const entries = performance.getEntriesByName(name, "measure");
        const last = entries[entries.length - 1];
        if (last) rows.push({ name: name.replace("body:tfc:", ""), duration: Math.round(last.duration) });
      }
      setPerf(rows);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    runAudit();
    refreshPerf();
    const id = setInterval(() => { runAudit(); refreshPerf(); }, 1500);
    return () => clearInterval(id);
  }, [runAudit, refreshPerf]);

  const maxBar = useMemo(() => Math.max(50, ...perf.map(p => p.duration)), [perf]);

  return (
    <div
      className="fixed left-2 right-2 bottom-24 z-[60] max-w-md mx-auto rounded-2xl border border-border bg-background/95 backdrop-blur-md shadow-xl text-foreground text-[11px] overflow-hidden"
      role="region"
      aria-label="Body screen debug overlay"
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/40">
        <div className="flex items-center gap-1.5 font-semibold uppercase tracking-wider text-[10px]">
          <Crosshair className="w-3 h-3 text-primary" /> Body debug
        </div>
        <button
          onClick={onClose}
          className="min-h-[44px] min-w-[44px] -m-2 p-2 flex items-center justify-center text-muted-foreground hover:text-foreground"
          aria-label="Close debug overlay"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-3 space-y-3 max-h-[40vh] overflow-y-auto">
        {/* Loading performance panel */}
        <section>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Activity className="w-3 h-3 text-primary" />
            <span className="font-semibold text-[10px] uppercase tracking-wider">Loading performance · time-to-first-content</span>
          </div>
          {perf.length === 0 ? (
            <p className="text-muted-foreground">No measures yet — interact with the page or retry scoring.</p>
          ) : (
            <ul className="space-y-1">
              {perf.map(p => (
                <li key={p.name} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 capitalize">{p.name}</span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(100, (p.duration / maxBar) * 100)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right tabular-nums text-muted-foreground">{p.duration}ms</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Hit-target audit */}
        <section>
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-semibold text-[10px] uppercase tracking-wider">
              Hit-target audit · {TARGET_PX}×{TARGET_PX}px
            </span>
            <span className={offenders.length === 0 ? "text-emerald-400" : "text-rose-400"}>
              {offenders.length === 0 ? `✓ all ${auditCount} pass` : `✗ ${offenders.length} fail`}
            </span>
          </div>
          {offenders.length === 0 ? (
            <p className="text-muted-foreground">All clickable controls meet the minimum tap size.</p>
          ) : (
            <ul className="space-y-1">
              {offenders.map((o, i) => (
                <li key={i} className="flex items-center gap-2 p-1.5 rounded bg-rose-500/10 border border-rose-500/20">
                  <span className="font-mono text-rose-400 tabular-nums shrink-0">{o.width}×{o.height}</span>
                  <span className="truncate flex-1 text-muted-foreground" title={o.text}>{o.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
