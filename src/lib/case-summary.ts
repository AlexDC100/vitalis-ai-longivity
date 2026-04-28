/**
 * Case Summary download — a single, self-contained HTML file the user can
 * save / print as PDF for a triaged case. Includes the headline finding,
 * clinical insight, urgency / case priority, and the AI-assistance
 * disclaimer mandated for the hospital workflow.
 *
 * Triggers a print-friendly HTML download via a Blob. Browsers render this
 * with their built-in "Save as PDF" when the user prints — no extra deps.
 */

const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

export type CasePriority = "HIGH" | "MEDIUM" | "LOW";

export interface CaseSummaryInput {
  file_name: string;
  document_type: string;
  main_finding: string;
  clinical_insight: string;
  priority: CasePriority;
  review_window: string;
  reviewed_at?: string | null;
  created_at?: string;
}

const PRIORITY_COLOR: Record<CasePriority, string> = {
  HIGH: "#ef4444",
  MEDIUM: "#f59e0b",
  LOW: "#10b981",
};

function buildHtml(c: CaseSummaryInput): string {
  const created = c.created_at ? new Date(c.created_at).toLocaleString() : "";
  const reviewed = c.reviewed_at ? new Date(c.reviewed_at).toLocaleString() : "";
  const accent = PRIORITY_COLOR[c.priority];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Vitalis Case Summary — ${escapeHtml(c.file_name)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 40px; line-height: 1.55; }
  .sheet { max-width: 720px; margin: 0 auto; background: #fff; border-radius: 16px; padding: 40px; box-shadow: 0 1px 3px rgba(0,0,0,.05); }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .muted { color: #64748b; font-size: 12px; }
  .priority { display: inline-flex; align-items: center; gap: 8px; padding: 6px 12px; border-radius: 999px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: ${accent}; background: ${accent}15; border: 1px solid ${accent}40; margin-top: 16px; }
  .priority .dot { width: 8px; height: 8px; border-radius: 50%; background: ${accent}; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: #475569; margin: 28px 0 8px; }
  .finding { font-size: 18px; font-weight: 600; line-height: 1.4; }
  .insight { font-size: 14px; color: #334155; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin-top: 8px; font-size: 13px; }
  .meta div span { color: #64748b; display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
  .disclaimer { margin-top: 32px; padding: 14px 16px; border-left: 3px solid ${accent}; background: #f1f5f9; border-radius: 6px; font-size: 12px; color: #475569; font-style: italic; }
  .footer { margin-top: 28px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  @media print { body { background: #fff; padding: 0; } .sheet { box-shadow: none; border-radius: 0; } }
</style>
</head>
<body>
  <div class="sheet">
    <h1>Case Summary</h1>
    <div class="muted">${escapeHtml(c.document_type)} · ${escapeHtml(c.file_name)}</div>
    <div class="priority"><span class="dot"></span>${escapeHtml(c.priority)} priority · ${escapeHtml(c.review_window)}</div>

    <h2>Main finding</h2>
    <p class="finding">${escapeHtml(c.main_finding) || "—"}</p>

    <h2>Clinical insight</h2>
    <p class="insight">${escapeHtml(c.clinical_insight) || "—"}</p>

    <h2>Case metadata</h2>
    <div class="meta">
      <div><span>Urgency</span>${escapeHtml(c.priority)}</div>
      <div><span>Review window</span>${escapeHtml(c.review_window)}</div>
      ${created ? `<div><span>Uploaded</span>${escapeHtml(created)}</div>` : ""}
      ${reviewed ? `<div><span>Reviewed</span>${escapeHtml(reviewed)}</div>` : ""}
    </div>

    <div class="disclaimer">
      This is AI-assisted analysis and does not replace a licensed physician.
      All clinical decisions remain the responsibility of the treating clinician.
    </div>

    <div class="footer">
      <span>Vitalis · AI-assisted triage</span>
      <span>Generated ${escapeHtml(new Date().toLocaleString())}</span>
    </div>
  </div>
  <script>setTimeout(function(){ try { window.print(); } catch(e){} }, 300);</script>
</body>
</html>`;
}

export function downloadCaseSummary(c: CaseSummaryInput) {
  const html = buildHtml(c);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  // Open in a new tab so the user can immediately Save as PDF (auto-prints).
  const w = window.open(url, "_blank", "noopener");
  // Fallback: also offer a download link if popups are blocked.
  if (!w) {
    const a = document.createElement("a");
    a.href = url;
    const safe = c.file_name.replace(/\.[^.]+$/, "").replace(/[^a-z0-9-_]/gi, "_");
    a.download = `vitalis-case-${safe || "summary"}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}