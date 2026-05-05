import type { HealthProfile } from "./types";
import {
  runDiagnosis,
  getAllSystemScores,
  type SubstanceEntry,
} from "./diagnosis-engine";

/**
 * Standalone HTML health report generator.
 *
 * Produces a single-file, styled, printable HTML document with:
 *   - Identity block (name, age, sex, BMI)
 *   - Top diagnosis + recommended actions
 *   - System scores
 *   - Biomarker table (highlighted by status)
 *   - Active substances
 *
 * The HTML is fully inline (no external CSS / fonts / scripts) so users
 * can save/print/email it as-is.
 */

const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

interface BiomarkerRange {
  key: keyof HealthProfile;
  label: string;
  unit: string;
  /** Optimal range [min, max]; values outside are flagged. */
  optimal: [number, number];
  /** Higher-is-better, lower-is-better, or in-range. */
  direction: "higher" | "lower" | "range";
}

/**
 * Curated optimal-longevity reference ranges. Values mirror those used
 * in the diagnosis engine. Kept inline here to avoid coupling to internal
 * scoring weights.
 */
const BIOMARKERS: BiomarkerRange[] = [
  { key: "bp_systolic", label: "Blood Pressure (systolic)", unit: "mmHg", optimal: [100, 120], direction: "range" },
  { key: "bp_diastolic", label: "Blood Pressure (diastolic)", unit: "mmHg", optimal: [60, 80], direction: "range" },
  { key: "resting_hr", label: "Resting Heart Rate", unit: "bpm", optimal: [50, 70], direction: "lower" },
  { key: "hrv_ms", label: "HRV", unit: "ms", optimal: [50, 100], direction: "higher" },
  { key: "vo2_max", label: "VO₂ Max", unit: "ml/kg/min", optimal: [40, 80], direction: "higher" },
  { key: "ldl", label: "LDL Cholesterol", unit: "mg/dL", optimal: [0, 100], direction: "lower" },
  { key: "hdl", label: "HDL Cholesterol", unit: "mg/dL", optimal: [50, 90], direction: "higher" },
  { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", optimal: [0, 100], direction: "lower" },
  { key: "apob", label: "ApoB", unit: "mg/dL", optimal: [0, 80], direction: "lower" },
  { key: "lpa", label: "Lp(a)", unit: "nmol/L", optimal: [0, 50], direction: "lower" },
  { key: "hscrp", label: "hs-CRP", unit: "mg/L", optimal: [0, 1], direction: "lower" },
  { key: "homocysteine", label: "Homocysteine", unit: "µmol/L", optimal: [0, 9], direction: "lower" },
  { key: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL", optimal: [70, 90], direction: "range" },
  { key: "hba1c", label: "HbA1c", unit: "%", optimal: [4.5, 5.4], direction: "lower" },
  { key: "fasting_insulin", label: "Fasting Insulin", unit: "µIU/mL", optimal: [2, 6], direction: "lower" },
  { key: "vitamin_d", label: "Vitamin D", unit: "ng/mL", optimal: [50, 80], direction: "higher" },
  { key: "testosterone", label: "Testosterone", unit: "ng/dL", optimal: [600, 1000], direction: "higher" },
  { key: "free_t", label: "Free Testosterone", unit: "pg/mL", optimal: [15, 30], direction: "higher" },
  { key: "tsh", label: "TSH", unit: "mIU/L", optimal: [1, 2.5], direction: "range" },
  { key: "cortisol", label: "Cortisol", unit: "µg/dL", optimal: [6, 18], direction: "range" },
  { key: "avg_sleep_hours", label: "Avg Sleep", unit: "hrs", optimal: [7, 9], direction: "higher" },
  { key: "body_fat_pct", label: "Body Fat", unit: "%", optimal: [10, 18], direction: "lower" },
];

type Status = "missing" | "optimal" | "suboptimal";

function statusFor(value: number, b: BiomarkerRange): Status {
  if (!value || value === 0) return "missing";
  const [lo, hi] = b.optimal;
  if (b.direction === "range") return value >= lo && value <= hi ? "optimal" : "suboptimal";
  if (b.direction === "higher") return value >= lo ? "optimal" : "suboptimal";
  return value <= hi ? "optimal" : "suboptimal";
}

const STATUS_STYLES: Record<Status, { bg: string; color: string; label: string }> = {
  optimal: { bg: "#0f3823", color: "#34d399", label: "Optimal" },
  suboptimal: { bg: "#3a1414", color: "#f87171", label: "Suboptimal" },
  missing: { bg: "#1f2937", color: "#9ca3af", label: "No data" },
};

function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const diff = Date.now() - d.getTime();
  return Math.floor(diff / (365.25 * 24 * 3600 * 1000));
}

function calculateBMI(p: HealthProfile): number | null {
  if (!p.weight_kg || !p.height_cm) return null;
  const m = p.height_cm / 100;
  return Math.round((p.weight_kg / (m * m)) * 10) / 10;
}

export interface HealthReportInput {
  profile: HealthProfile;
  substances: SubstanceEntry[];
  email?: string;
}

export function generateHealthReportHtml({
  profile,
  substances,
  email,
}: HealthReportInput): string {
  const diagnosis = runDiagnosis(profile, substances);
  const systems = getAllSystemScores(profile, substances);
  const age = calculateAge(profile.date_of_birth);
  const bmi = calculateBMI(profile);
  const generatedAt = new Date().toLocaleString();

  const biomarkerRows = BIOMARKERS.map((b) => {
    const value = Number(profile[b.key] ?? 0);
    const s = statusFor(value, b);
    const style = STATUS_STYLES[s];
    const display = value === 0 ? "—" : value;
    return `
      <tr>
        <td>${escapeHtml(b.label)}</td>
        <td style="text-align:right;font-variant-numeric:tabular-nums">
          <strong>${escapeHtml(display)}</strong>
          <span style="color:#6b7280;font-weight:400;margin-left:4px">${escapeHtml(b.unit)}</span>
        </td>
        <td style="text-align:right;color:#6b7280">${escapeHtml(b.optimal[0])}–${escapeHtml(b.optimal[1])}</td>
        <td style="text-align:right">
          <span style="background:${style.bg};color:${style.color};padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600;letter-spacing:.02em;text-transform:uppercase">
            ${escapeHtml(style.label)}
          </span>
        </td>
      </tr>`;
  }).join("");

  const fixesHtml = diagnosis.fixes.length
    ? diagnosis.fixes
        .map(
          (f) => `
        <li style="margin-bottom:14px;list-style:none">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <span style="background:#1e3a8a;color:#93c5fd;font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;text-transform:uppercase">${escapeHtml(f.urgency)}</span>
            <strong style="font-size:14px">${escapeHtml(f.action)}</strong>
          </div>
          <p style="color:#9ca3af;font-size:13px;margin:4px 0 2px;line-height:1.5">${escapeHtml(f.why)}</p>
          <p style="color:#34d399;font-size:12px;margin:2px 0">→ ${escapeHtml(f.impact)}</p>
        </li>`,
        )
        .join("")
    : `<li style="color:#9ca3af;list-style:none">No specific recommendations — keep up your current routine.</li>`;

  const systemsHtml = systems
    .map((s) => {
      const tone = s.score >= 45 ? "#f87171" : s.score >= 25 ? "#fbbf24" : s.score >= 10 ? "#facc15" : "#34d399";
      const pct = Math.min(100, s.score);
      return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
          <span style="color:#e5e7eb">${escapeHtml(s.title)}</span>
          <span style="color:${tone};font-weight:600">${escapeHtml(s.score)}/100</span>
        </div>
        <div style="background:#1f2937;height:6px;border-radius:3px;overflow:hidden">
          <div style="background:${tone};height:100%;width:${pct}%"></div>
        </div>
      </div>`;
    })
    .join("");

  const substanceList = substances.length
    ? `<ul style="list-style:none;padding:0;margin:0">
        ${substances
          .map(
            (s) => `
          <li style="padding:10px 14px;border:1px solid #1f2937;border-radius:10px;margin-bottom:8px">
            <strong>${escapeHtml(s.name)}</strong>
            <span style="color:#6b7280;font-size:12px;margin-left:6px">${escapeHtml(s.category)}</span>
            ${s.dose ? `<div style="color:#9ca3af;font-size:12px;margin-top:2px">${escapeHtml(s.dose)}${s.frequency ? ` · ${escapeHtml(s.frequency)}` : ""}</div>` : ""}
          </li>`,
          )
          .join("")}
      </ul>`
    : `<p style="color:#6b7280;font-size:13px">None recorded.</p>`;

  const severityColor =
    diagnosis.severity === "critical" ? "#f87171" :
    diagnosis.severity === "high" ? "#fbbf24" :
    diagnosis.severity === "moderate" ? "#facc15" : "#34d399";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Longevity AI Health Report — ${escapeHtml(profile.full_name || "User")}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0a0b;color:#e5e7eb;line-height:1.5;-webkit-font-smoothing:antialiased}
  .page{max-width:840px;margin:0 auto;padding:48px 32px}
  .hero{padding:32px;border-radius:24px;background:linear-gradient(135deg,#0f172a,#1e1b4b);border:1px solid #1e293b;margin-bottom:24px}
  .hero h1{margin:0 0 4px;font-size:28px;font-weight:700;letter-spacing:-.02em}
  .hero p{margin:0;color:#94a3b8;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:20px}
  .grid div{padding:14px;background:rgba(255,255,255,.04);border-radius:12px;border:1px solid rgba(255,255,255,.06)}
  .grid label{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
  .grid strong{font-size:18px;color:#f3f4f6}
  .section{margin-top:32px;padding:24px;border-radius:20px;background:#111114;border:1px solid #1f1f23}
  .section h2{margin:0 0 16px;font-size:18px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
  .section h2 .dot{width:8px;height:8px;border-radius:50%;background:#3b82f6}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-weight:500;color:#6b7280;padding:8px 12px;border-bottom:1px solid #1f2937;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
  td{padding:10px 12px;border-bottom:1px solid #161620}
  tr:last-child td{border-bottom:none}
  .severity-pill{display:inline-block;padding:6px 14px;border-radius:999px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;background:${severityColor}22;color:${severityColor};border:1px solid ${severityColor}55;margin-bottom:12px}
  .footer{margin-top:32px;padding-top:20px;border-top:1px solid #1f1f23;color:#4b5563;font-size:11px;text-align:center}
  .footer a{color:#6b7280;text-decoration:none}
  @media print{body{background:#fff;color:#111}.section,.hero{background:#fff;border-color:#e5e7eb;color:#111}.hero h1,.section h2,.grid strong{color:#111}.grid div{background:#f9fafb}td,th{border-color:#e5e7eb}}
</style>
</head>
<body>
<div class="page">

  <div class="hero">
    <h1>Longevity AI Health Report</h1>
    <p>Generated ${escapeHtml(generatedAt)}${email ? ` · ${escapeHtml(email)}` : ""}</p>
    <div class="grid">
      <div><label>Name</label><strong>${escapeHtml(profile.full_name || "—")}</strong></div>
      <div><label>Age</label><strong>${age ?? "—"}</strong></div>
      <div><label>Sex</label><strong>${escapeHtml(profile.sex || "—")}</strong></div>
      <div><label>BMI</label><strong>${bmi ?? "—"}</strong></div>
    </div>
  </div>

  <div class="section">
    <h2><span class="dot" style="background:${severityColor}"></span> Top Diagnosis</h2>
    <span class="severity-pill">${escapeHtml(diagnosis.severity)} · risk ${escapeHtml(diagnosis.riskScore)}/100</span>
    <h3 style="margin:0 0 6px;font-size:20px;font-weight:600">${escapeHtml(diagnosis.title)}</h3>
    <p style="color:#9ca3af;margin:0 0 8px;font-size:13px">${escapeHtml(diagnosis.category)}</p>
    <p style="color:#d1d5db;font-size:14px;line-height:1.6">${escapeHtml(diagnosis.explanation)}</p>
    <p style="color:#34d399;font-size:13px;margin-top:8px">Life impact: ${escapeHtml(diagnosis.lifeImpact)}</p>
  </div>

  <div class="section">
    <h2><span class="dot"></span> Recommended Actions</h2>
    <ul style="padding:0;margin:0">${fixesHtml}</ul>
  </div>

  <div class="section">
    <h2><span class="dot"></span> System Scores</h2>
    ${systemsHtml}
  </div>

  <div class="section">
    <h2><span class="dot"></span> Biomarkers</h2>
    <table>
      <thead>
        <tr><th>Marker</th><th style="text-align:right">Value</th><th style="text-align:right">Optimal</th><th style="text-align:right">Status</th></tr>
      </thead>
      <tbody>${biomarkerRows}</tbody>
    </table>
  </div>

  <div class="section">
    <h2><span class="dot"></span> Active Substances</h2>
    ${substanceList}
  </div>

  <div class="footer">
    Vitalis · Educational summary only · Not a substitute for medical advice.<br>
    <a href="https://vital-is.life">vital-is.life</a>
  </div>

</div>
</body>
</html>`;
}

/** Trigger a browser download of the report. */
export function downloadHealthReport(input: HealthReportInput): void {
  const html = generateHealthReportHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `vitalis-health-report-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}