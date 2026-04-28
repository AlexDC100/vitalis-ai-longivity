/**
 * Build a self-contained, printable HTML doctor-ready report for a clinic case
 * and trigger a browser download. Mirrors the structure of CaseReport.tsx
 * (case summary → urgency triage → AI assessment → key findings → next step
 * → disclaimer) so the downloaded artefact is interchangeable with the
 * in-app printable view.
 */

type Priority = "critical" | "high" | "medium" | "low";

export interface CaseReportInput {
  id: string;
  case_ref: string | null;
  case_type: string;
  file_name: string;
  status: string;
  priority: Priority;
  urgency_label: string | null;
  insight: string | null;
  explanation: string | null;
  recommendation: string | null;
  suspected_area: string | null;
  confidence: number | null;
  suggested_specialist: string | null;
  key_findings: unknown;
  missing_info: string | null;
  created_at: string;
  detected_category?: string | null;
  reviewed_at?: string | null;
  reviewed_by_email?: string | null;
  reviewed_by_name?: string | null;
}

const REVIEW_WINDOW: Record<Priority, string> = {
  critical: "Immediate review",
  high: "Within 24–48h",
  medium: "Routine review",
  low: "Archive / monitor",
};

function esc(s: string | null | undefined): string {
  if (s == null) return "—";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCaseReportHtml(row: CaseReportInput): string {
  const ref = row.case_ref ?? "C-" + row.id.slice(0, 6).toUpperCase();
  const created = new Date(row.created_at).toLocaleString();
  const conf =
    typeof row.confidence === "number" ? `${Math.round(row.confidence * 100)}%` : "—";
  const findings: string[] = Array.isArray(row.key_findings)
    ? (row.key_findings as unknown[]).filter(
        (f): f is string => typeof f === "string",
      )
    : [];
  const reviewedAt = row.reviewed_at ? new Date(row.reviewed_at).toLocaleString() : null;
  const reviewerName = row.reviewed_by_name?.trim() || null;
  const reviewerEmail = row.reviewed_by_email?.trim() || null;
  const reviewerDisplay = reviewerName ?? reviewerEmail ?? "Clinician";
  const reviewerExtra = reviewerName && reviewerEmail ? ` (${esc(reviewerEmail)})` : "";
  const reviewerLine = reviewedAt
    ? `<section class="block"><h3>Clinician review history</h3><p>Marked reviewed by <strong>${esc(reviewerDisplay)}</strong>${reviewerExtra} on ${esc(reviewedAt)}.</p></section>`
    : "";

  const sections: string[] = [];
  const section = (label: string, value: string | null) => {
    if (!value) return;
    sections.push(
      `<section class="block"><h3>${esc(label)}</h3><p>${esc(value)}</p></section>`,
    );
  };
  section("Main finding", row.insight);
  section("Why it matters", row.explanation);
  if (findings.length) {
    sections.push(
      `<section class="block"><h3>Key findings</h3><ul>${findings
        .map((f) => `<li>${esc(f)}</li>`)
        .join("")}</ul></section>`,
    );
  }
  section("Suspected area", row.suspected_area);
  section("Suggested specialist review", row.suggested_specialist);
  section("Missing information", row.missing_info);
  section("Recommended next step", row.recommendation);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Vitalis Clinic — ${esc(ref)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
         margin: 0; background: #fff; color: #0f172a; }
  main { max-width: 780px; margin: 0 auto; padding: 32px; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
           border-bottom: 1px solid rgba(15,23,42,.15); padding-bottom: 16px; margin-bottom: 24px; }
  .brand { font-weight: 700; letter-spacing: -0.01em; }
  .brand small { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
                 color: rgba(15,23,42,.55); font-weight: 500; }
  .ref { text-align: right; }
  .ref small { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
               color: rgba(15,23,42,.55); }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
  .sub { color: rgba(15,23,42,.65); font-size: 14px; margin: 0 0 24px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;
          border: 1px solid rgba(15,23,42,.18); border-radius: 8px; padding: 14px; margin: 16px 0 8px; }
  .grid div small { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
                    color: rgba(15,23,42,.55); margin-bottom: 2px; }
  .grid div p { margin: 0; font-size: 14px; font-weight: 600; }
  .summary { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 24px; margin: 0 0 24px;
             padding: 14px; border: 1px solid rgba(15,23,42,.12); border-radius: 8px; }
  .summary div small { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
                       color: rgba(15,23,42,.55); margin-bottom: 2px; }
  .summary div p { margin: 0; font-size: 13px; }
  .block { margin-top: 22px; }
  .block h3 { font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
              color: rgba(15,23,42,.55); margin: 0 0 6px; font-weight: 600; }
  .block p, .block li { font-size: 14px; line-height: 1.55; margin: 0; }
  .block ul { margin: 0; padding-left: 20px; }
  .signoff { display: grid; grid-template-columns: 1fr 1fr; gap: 24px;
             border-top: 1px solid rgba(15,23,42,.15); padding-top: 20px; margin-top: 36px; }
  .signoff div small { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .12em;
                       color: rgba(15,23,42,.55); margin-bottom: 4px; }
  .signoff div .line { height: 36px; border-bottom: 1px solid rgba(15,23,42,.35); }
  .signoff div .hint { font-size: 10px; color: rgba(15,23,42,.55); margin-top: 4px; }
  .disclaimer { margin-top: 28px; font-size: 11px; color: rgba(15,23,42,.65);
                border-left: 2px solid rgba(15,23,42,.25); padding-left: 12px; }
  .disclaimer strong { color: #0f172a; }
  @media print { body { background: #fff; } main { padding: 0; max-width: none; } }
</style>
</head>
<body>
  <main>
    <header>
      <div class="brand">Vitalis Clinic<small>AI Diagnostic Review</small></div>
      <div class="ref"><small>Case reference</small><strong>${esc(ref)}</strong>
        <div style="font-size:11px;color:rgba(15,23,42,.55);margin-top:4px;">${esc(created)}</div>
      </div>
    </header>

    <h1>Doctor-ready summary</h1>
    <p class="sub">${esc(row.case_type)} · ${esc(row.file_name)}</p>

    <section class="summary">
      <div><small>Document type</small><p>${esc(row.case_type)}</p></div>
      <div><small>Detected category</small><p>${esc(row.detected_category ?? "—")}</p></div>
      <div><small>Uploaded</small><p>${esc(created)}</p></div>
      <div><small>Status</small><p>${esc(row.status)}</p></div>
      <div><small>Review window</small><p>${esc(REVIEW_WINDOW[row.priority])}</p></div>
    </section>

    <div class="grid">
      <div><small>Priority</small><p>${esc(row.priority.toUpperCase())}</p></div>
      <div><small>Urgency</small><p>${esc(row.urgency_label ?? REVIEW_WINDOW[row.priority])}</p></div>
      <div><small>Confidence</small><p>${esc(conf)}</p></div>
    </div>

    ${sections.join("\n")}
    ${reviewerLine}

    <div class="signoff">
      <div><small>Reviewing clinician</small><div class="line"></div><div class="hint">Name &amp; signature</div></div>
      <div><small>Date of review</small><div class="line"></div></div>
    </div>

    <p class="disclaimer">
      <strong>AI-assisted review only.</strong> Final diagnosis must be confirmed by a licensed clinician.
      Vitalis is not a medical device. Output may include possible findings; clinical confirmation is
      required before any treatment decision.
    </p>
  </main>
</body>
</html>`;
}

export function downloadCaseReportHtml(row: CaseReportInput): void {
  const html = buildCaseReportHtml(row);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ref = row.case_ref ?? "C-" + row.id.slice(0, 6).toUpperCase();
  a.href = url;
  a.download = `vitalis-${ref}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}