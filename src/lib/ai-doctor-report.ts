import type { HealthProfile } from "./types";
import {
  runDiagnosis,
  getAllSystemScores,
  type SubstanceEntry,
} from "./diagnosis-engine";

/**
 * AI Doctor Report — a richer, "Claude-style" health report.
 *
 * Produces a clean, easy-to-read HTML report with:
 *   - Identity + headline diagnosis
 *   - "Your value vs normal" comparison table for every biomarker
 *   - Underlying issues grouped by body system, plain-language explanations
 *   - Recommended specialist (which doctor to see) per finding
 *   - Lifestyle + retest plan
 *
 * Self-contained HTML (inline CSS, no external assets) so the user can
 * save / print / email it.
 */

const escapeHtml = (s: unknown): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

type Direction = "higher" | "lower" | "range";
type Status = "missing" | "optimal" | "suboptimal" | "critical";

interface BiomarkerDef {
  key: keyof HealthProfile;
  label: string;
  unit: string;
  normal: [number, number];   // accepted "normal" range
  optimal: [number, number];  // longevity-optimal range
  direction: Direction;
  /** Which medical specialty handles this when out of range. */
  specialist: string;
  /** Plain-language description of what this marker means. */
  meaning: string;
  /** Plain-language description of risk if abnormal. */
  risk: string;
  /** Threshold past which we flag as critical (optional). */
  critical?: (v: number) => boolean;
  group: "Cardiovascular" | "Lipids" | "Metabolic" | "Inflammation" | "Hormones" | "Recovery" | "Body";
}

const BIOMARKERS: BiomarkerDef[] = [
  // Cardiovascular
  { key: "bp_systolic", label: "Blood Pressure (systolic)", unit: "mmHg", normal: [90, 130], optimal: [100, 120], direction: "range", specialist: "Cardiologist", meaning: "Pressure in arteries when the heart beats.", risk: "Sustained high BP damages arteries and raises stroke / heart-attack risk.", critical: v => v >= 160, group: "Cardiovascular" },
  { key: "bp_diastolic", label: "Blood Pressure (diastolic)", unit: "mmHg", normal: [60, 85], optimal: [60, 80], direction: "range", specialist: "Cardiologist", meaning: "Pressure between beats.", risk: "Elevated diastolic pressure indicates chronic vascular stress.", critical: v => v >= 100, group: "Cardiovascular" },
  { key: "resting_hr", label: "Resting Heart Rate", unit: "bpm", normal: [50, 90], optimal: [50, 70], direction: "lower", specialist: "Cardiologist", meaning: "How hard your heart works at rest.", risk: "Higher resting HR is linked to lower cardiovascular fitness and higher mortality.", group: "Cardiovascular" },
  { key: "hrv_ms", label: "HRV (RMSSD)", unit: "ms", normal: [30, 100], optimal: [50, 100], direction: "higher", specialist: "Cardiologist / Sleep Specialist", meaning: "Variation between heartbeats — a proxy for nervous-system recovery.", risk: "Low HRV indicates poor recovery, chronic stress, or overtraining.", group: "Cardiovascular" },
  { key: "vo2_max", label: "VO₂ Max", unit: "ml/kg/min", normal: [30, 60], optimal: [40, 80], direction: "higher", specialist: "Sports Medicine / Cardiologist", meaning: "Maximum oxygen your body can use — strongest single predictor of longevity.", risk: "Low VO₂ max ~doubles all-cause mortality vs. fit individuals.", group: "Cardiovascular" },

  // Lipids
  { key: "ldl", label: "LDL Cholesterol", unit: "mg/dL", normal: [0, 130], optimal: [0, 100], direction: "lower", specialist: "Cardiologist / Lipidologist", meaning: "'Bad' cholesterol — drives plaque build-up.", risk: "Elevated LDL is the primary driver of atherosclerosis.", critical: v => v >= 190, group: "Lipids" },
  { key: "hdl", label: "HDL Cholesterol", unit: "mg/dL", normal: [40, 90], optimal: [50, 90], direction: "higher", specialist: "Cardiologist", meaning: "'Good' cholesterol — clears LDL from arteries.", risk: "Low HDL increases cardiovascular risk.", group: "Lipids" },
  { key: "triglycerides", label: "Triglycerides", unit: "mg/dL", normal: [0, 150], optimal: [0, 100], direction: "lower", specialist: "Cardiologist / Endocrinologist", meaning: "Blood fats stored from excess calories.", risk: "High triglycerides signal insulin resistance and pancreatitis risk.", critical: v => v >= 500, group: "Lipids" },
  { key: "apob", label: "ApoB", unit: "mg/dL", normal: [0, 100], optimal: [0, 80], direction: "lower", specialist: "Lipidologist / Cardiologist", meaning: "Counts every atherogenic particle — best lipid risk marker.", risk: "Elevated ApoB is the strongest predictor of heart attack risk.", group: "Lipids" },
  { key: "lpa", label: "Lp(a)", unit: "nmol/L", normal: [0, 75], optimal: [0, 50], direction: "lower", specialist: "Lipidologist / Cardiologist", meaning: "Genetically determined particle that accelerates plaque.", risk: "High Lp(a) doubles lifetime cardiovascular risk.", group: "Lipids" },

  // Inflammation
  { key: "hscrp", label: "hs-CRP", unit: "mg/L", normal: [0, 3], optimal: [0, 1], direction: "lower", specialist: "Internal Medicine / Rheumatologist", meaning: "Marker of systemic inflammation.", risk: "Chronic inflammation drives heart disease, cancer, and aging.", critical: v => v >= 10, group: "Inflammation" },
  { key: "homocysteine", label: "Homocysteine", unit: "µmol/L", normal: [0, 12], optimal: [0, 9], direction: "lower", specialist: "Internal Medicine / Cardiologist", meaning: "Amino acid that damages vessels when elevated.", risk: "Linked to stroke, dementia, and heart disease.", group: "Inflammation" },

  // Metabolic
  { key: "fasting_glucose", label: "Fasting Glucose", unit: "mg/dL", normal: [70, 100], optimal: [70, 90], direction: "range", specialist: "Endocrinologist", meaning: "Blood sugar after fasting.", risk: "High fasting glucose signals pre-diabetes / diabetes.", critical: v => v >= 126, group: "Metabolic" },
  { key: "hba1c", label: "HbA1c", unit: "%", normal: [4, 5.7], optimal: [4.5, 5.4], direction: "lower", specialist: "Endocrinologist", meaning: "3-month average blood sugar.", risk: "Above 5.7% = pre-diabetes; ≥6.5% = diabetes.", critical: v => v >= 6.5, group: "Metabolic" },
  { key: "fasting_insulin", label: "Fasting Insulin", unit: "µIU/mL", normal: [2, 10], optimal: [2, 6], direction: "lower", specialist: "Endocrinologist", meaning: "How hard the pancreas is working.", risk: "High fasting insulin = insulin resistance, even before glucose rises.", group: "Metabolic" },

  // Hormones
  { key: "vitamin_d", label: "Vitamin D (25-OH)", unit: "ng/mL", normal: [30, 80], optimal: [50, 80], direction: "higher", specialist: "Endocrinologist / GP", meaning: "Hormone affecting bone, immunity, and mood.", risk: "Deficiency is linked to fatigue, immune issues, and mortality.", critical: v => v > 0 && v < 20, group: "Hormones" },
  { key: "testosterone", label: "Testosterone (total)", unit: "ng/dL", normal: [300, 1000], optimal: [600, 1000], direction: "higher", specialist: "Endocrinologist / Andrologist", meaning: "Primary male hormone — also vital in women at low levels.", risk: "Low T causes fatigue, low libido, muscle loss, and metabolic issues.", group: "Hormones" },
  { key: "free_t", label: "Free Testosterone", unit: "pg/mL", normal: [9, 30], optimal: [15, 30], direction: "higher", specialist: "Endocrinologist", meaning: "Bio-available testosterone.", risk: "Better predictor of symptoms than total T.", group: "Hormones" },
  { key: "tsh", label: "TSH", unit: "mIU/L", normal: [0.4, 4.0], optimal: [1, 2.5], direction: "range", specialist: "Endocrinologist", meaning: "Pituitary signal to the thyroid.", risk: "High TSH = under-active thyroid; low TSH = over-active.", group: "Hormones" },
  { key: "cortisol", label: "Morning Cortisol", unit: "µg/dL", normal: [5, 23], optimal: [6, 18], direction: "range", specialist: "Endocrinologist", meaning: "Primary stress hormone.", risk: "Chronically high cortisol drives weight gain, insulin resistance, and burnout.", group: "Hormones" },

  // Recovery
  { key: "avg_sleep_hours", label: "Avg Sleep", unit: "hrs", normal: [6, 9], optimal: [7, 9], direction: "higher", specialist: "Sleep Specialist", meaning: "Foundation of recovery, hormones, and brain health.", risk: "<6h doubles cardiovascular and cognitive decline risk.", group: "Recovery" },

  // Body composition
  { key: "body_fat_pct", label: "Body Fat", unit: "%", normal: [10, 25], optimal: [10, 18], direction: "lower", specialist: "Endocrinologist / Nutritionist", meaning: "Total body fat percentage.", risk: "Excess body fat (especially visceral) drives metabolic disease.", group: "Body" },
];

function statusFor(value: number, b: BiomarkerDef): Status {
  if (!value || value === 0) return "missing";
  if (b.critical && b.critical(value)) return "critical";
  const [lo, hi] = b.optimal;
  if (b.direction === "range") return value >= lo && value <= hi ? "optimal" : "suboptimal";
  if (b.direction === "higher") return value >= lo ? "optimal" : "suboptimal";
  return value <= hi ? "optimal" : "suboptimal";
}

const STATUS_STYLES: Record<Status, { bg: string; color: string; label: string }> = {
  optimal: { bg: "#0f3823", color: "#34d399", label: "Optimal" },
  suboptimal: { bg: "#3a2a14", color: "#fbbf24", label: "Out of optimal" },
  critical: { bg: "#3a1414", color: "#f87171", label: "Critical" },
  missing: { bg: "#1f2937", color: "#9ca3af", label: "No data" },
};

function calculateAge(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000));
}

function calculateBMI(p: HealthProfile): number | null {
  if (!p.weight_kg || !p.height_cm) return null;
  const m = p.height_cm / 100;
  return Math.round((p.weight_kg / (m * m)) * 10) / 10;
}

export interface AIDoctorReportInput {
  profile: HealthProfile;
  substances: SubstanceEntry[];
  email?: string;
}

interface UnderlyingIssue {
  marker: BiomarkerDef;
  value: number;
  status: Exclude<Status, "optimal" | "missing">;
}

export function generateAIDoctorReportHtml({
  profile,
  substances,
  email,
}: AIDoctorReportInput): string {
  const diagnosis = runDiagnosis(profile, substances);
  const systems = getAllSystemScores(profile, substances);
  const age = calculateAge(profile.date_of_birth);
  const bmi = calculateBMI(profile);
  const generatedAt = new Date().toLocaleString();

  // Identify underlying issues (suboptimal + critical biomarkers)
  const issues: UnderlyingIssue[] = [];
  for (const m of BIOMARKERS) {
    const v = Number(profile[m.key] ?? 0);
    const s = statusFor(v, m);
    if (s === "suboptimal" || s === "critical") {
      issues.push({ marker: m, value: v, status: s });
    }
  }
  // Sort: critical first, then by group
  issues.sort((a, b) => (a.status === b.status ? 0 : a.status === "critical" ? -1 : 1));

  // Group issues by group for "underlying issues" section
  const issuesByGroup = issues.reduce<Record<string, UnderlyingIssue[]>>((acc, it) => {
    (acc[it.marker.group] ||= []).push(it);
    return acc;
  }, {});

  // Unique specialists
  const specialists = new Map<string, { reasons: string[]; severity: "critical" | "elevated" }>();
  for (const it of issues) {
    const cur = specialists.get(it.marker.specialist) || { reasons: [], severity: "elevated" as const };
    cur.reasons.push(`${it.marker.label} (${it.value} ${it.marker.unit})`);
    if (it.status === "critical") cur.severity = "critical";
    specialists.set(it.marker.specialist, cur);
  }

  // Comparison table rows: every marker with data, normal vs your value vs optimal
  const compRows = BIOMARKERS.map(b => {
    const v = Number(profile[b.key] ?? 0);
    const s = statusFor(v, b);
    const style = STATUS_STYLES[s];
    const display = v === 0 ? "—" : v;
    return `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #161620">
          <div style="font-weight:500">${escapeHtml(b.label)}</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px">${escapeHtml(b.group)}</div>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #161620;text-align:right;color:#9ca3af;font-variant-numeric:tabular-nums">
          ${escapeHtml(b.normal[0])}–${escapeHtml(b.normal[1])} ${escapeHtml(b.unit)}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #161620;text-align:right;color:#34d399;font-variant-numeric:tabular-nums">
          ${escapeHtml(b.optimal[0])}–${escapeHtml(b.optimal[1])}
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #161620;text-align:right;font-variant-numeric:tabular-nums">
          <strong style="color:${style.color}">${escapeHtml(display)}</strong>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #161620;text-align:right">
          <span style="background:${style.bg};color:${style.color};padding:3px 10px;border-radius:999px;font-size:10.5px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;white-space:nowrap">
            ${escapeHtml(style.label)}
          </span>
        </td>
      </tr>`;
  }).join("");

  const issuesHtml = Object.keys(issuesByGroup).length
    ? Object.entries(issuesByGroup)
        .map(([group, items]) => `
          <div style="margin-bottom:20px">
            <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px">${escapeHtml(group)}</div>
            ${items.map(it => {
              const style = STATUS_STYLES[it.status];
              return `
                <div style="padding:14px 16px;border:1px solid #1f1f23;border-left:3px solid ${style.color};border-radius:12px;margin-bottom:10px;background:#0f0f12">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:8px;flex-wrap:wrap">
                    <strong style="font-size:14px">${escapeHtml(it.marker.label)}</strong>
                    <span style="background:${style.bg};color:${style.color};padding:3px 10px;border-radius:999px;font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.03em">
                      ${escapeHtml(style.label)}
                    </span>
                  </div>
                  <div style="display:flex;gap:18px;font-size:12px;margin-bottom:10px;flex-wrap:wrap">
                    <span style="color:#9ca3af">Your value: <strong style="color:${style.color}">${escapeHtml(it.value)} ${escapeHtml(it.marker.unit)}</strong></span>
                    <span style="color:#9ca3af">Normal: <strong style="color:#e5e7eb">${escapeHtml(it.marker.normal[0])}–${escapeHtml(it.marker.normal[1])}</strong></span>
                    <span style="color:#9ca3af">Optimal: <strong style="color:#34d399">${escapeHtml(it.marker.optimal[0])}–${escapeHtml(it.marker.optimal[1])}</strong></span>
                  </div>
                  <p style="margin:0 0 6px;color:#d1d5db;font-size:13px;line-height:1.55">${escapeHtml(it.marker.meaning)}</p>
                  <p style="margin:0 0 6px;color:#9ca3af;font-size:12.5px;line-height:1.55"><strong style="color:#f87171">Why it matters:</strong> ${escapeHtml(it.marker.risk)}</p>
                  <p style="margin:0;color:#93c5fd;font-size:12.5px"><strong>See:</strong> ${escapeHtml(it.marker.specialist)}</p>
                </div>`;
            }).join("")}
          </div>`)
        .join("")
    : `<p style="color:#9ca3af;font-size:13px">No abnormal markers detected — everything in your dataset is within optimal ranges.</p>`;

  const specialistsHtml = specialists.size
    ? `<div style="display:grid;gap:10px">
        ${[...specialists.entries()].map(([name, info]) => {
          const tone = info.severity === "critical" ? "#f87171" : "#fbbf24";
          const bg = info.severity === "critical" ? "#3a1414" : "#3a2a14";
          return `
            <div style="padding:14px 16px;border:1px solid #1f1f23;border-radius:12px;background:#0f0f12">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:10px;flex-wrap:wrap">
                <strong style="font-size:14px">${escapeHtml(name)}</strong>
                <span style="background:${bg};color:${tone};padding:3px 10px;border-radius:999px;font-size:10.5px;font-weight:600;text-transform:uppercase">
                  ${info.severity === "critical" ? "Book within days" : "Book within weeks"}
                </span>
              </div>
              <p style="margin:0;color:#9ca3af;font-size:12.5px;line-height:1.5">For: ${escapeHtml(info.reasons.join(", "))}</p>
            </div>`;
        }).join("")}
      </div>`
    : `<p style="color:#9ca3af;font-size:13px">No specialist visit indicated by current data. Continue routine yearly check-ups with your GP.</p>`;

  const fixesHtml = diagnosis.fixes.length
    ? diagnosis.fixes.map(f => `
        <li style="margin-bottom:14px;list-style:none">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap">
            <span style="background:#1e3a8a;color:#93c5fd;font-size:10px;font-weight:600;padding:3px 8px;border-radius:6px;text-transform:uppercase">${escapeHtml(f.urgency)}</span>
            <strong style="font-size:14px">${escapeHtml(f.action)}</strong>
          </div>
          <p style="color:#9ca3af;font-size:13px;margin:4px 0 2px;line-height:1.5">${escapeHtml(f.why)}</p>
          <p style="color:#34d399;font-size:12px;margin:2px 0">→ ${escapeHtml(f.impact)}</p>
        </li>`).join("")
    : `<li style="color:#9ca3af;list-style:none">No specific recommendations — keep your current routine.</li>`;

  const severityColor =
    diagnosis.severity === "critical" ? "#f87171" :
    diagnosis.severity === "high" ? "#fbbf24" :
    diagnosis.severity === "moderate" ? "#facc15" : "#34d399";

  const totalIssues = issues.length;
  const criticalIssues = issues.filter(i => i.status === "critical").length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>AI Doctor Report — ${escapeHtml(profile.full_name || "Patient")}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;background:#0a0a0b;color:#e5e7eb;line-height:1.55;-webkit-font-smoothing:antialiased}
  .page{max-width:880px;margin:0 auto;padding:48px 28px}
  .hero{padding:36px 32px;border-radius:24px;background:linear-gradient(135deg,#0f172a 0%,#1e1b4b 100%);border:1px solid #1e293b;margin-bottom:24px;position:relative;overflow:hidden}
  .hero::after{content:"";position:absolute;top:-40px;right:-40px;width:200px;height:200px;background:radial-gradient(circle,${severityColor}33,transparent 70%);pointer-events:none}
  .hero h1{margin:0 0 6px;font-size:30px;font-weight:700;letter-spacing:-.025em}
  .hero .sub{margin:0 0 4px;color:#94a3b8;font-size:13.5px}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-top:22px}
  .grid div{padding:14px;background:rgba(255,255,255,.04);border-radius:14px;border:1px solid rgba(255,255,255,.06)}
  .grid label{display:block;color:#6b7280;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;font-weight:500}
  .grid strong{font-size:18px;color:#f3f4f6;font-weight:600}
  .section{margin-top:28px;padding:26px;border-radius:20px;background:#111114;border:1px solid #1f1f23}
  .section h2{margin:0 0 18px;font-size:18px;font-weight:600;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
  .section h2 .dot{width:8px;height:8px;border-radius:50%;background:#3b82f6}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{text-align:left;font-weight:500;color:#6b7280;padding:10px 12px;border-bottom:1px solid #1f2937;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em}
  .severity-pill{display:inline-block;padding:6px 14px;border-radius:999px;font-size:11.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;background:${severityColor}22;color:${severityColor};border:1px solid ${severityColor}55;margin-bottom:12px}
  .stat-row{display:flex;gap:24px;margin-top:16px;flex-wrap:wrap;font-size:13px}
  .stat-row span{color:#9ca3af}
  .stat-row strong{color:#e5e7eb}
  .footer{margin-top:36px;padding-top:20px;border-top:1px solid #1f1f23;color:#4b5563;font-size:11px;text-align:center;line-height:1.6}
  .footer a{color:#6b7280;text-decoration:none}
  .disclaimer{margin-top:16px;padding:14px 16px;background:rgba(251,191,36,.05);border:1px solid rgba(251,191,36,.2);border-radius:12px;color:#fbbf24;font-size:12px;line-height:1.55}
  @media print{body{background:#fff;color:#111}.section,.hero{background:#fff;border-color:#e5e7eb;color:#111}.hero h1,.section h2,.grid strong{color:#111}.grid div{background:#f9fafb}.hero::after{display:none}td,th{border-color:#e5e7eb}}
</style>
</head>
<body>
<div class="page">

  <div class="hero">
    <h1>AI Doctor Report</h1>
    <p class="sub">Comprehensive health analysis · ${escapeHtml(generatedAt)}${email ? ` · ${escapeHtml(email)}` : ""}</p>
    <div class="grid">
      <div><label>Patient</label><strong>${escapeHtml(profile.full_name || "—")}</strong></div>
      <div><label>Age</label><strong>${age ?? "—"}</strong></div>
      <div><label>Sex</label><strong>${escapeHtml(profile.sex || "—")}</strong></div>
      <div><label>BMI</label><strong>${bmi ?? "—"}</strong></div>
    </div>
  </div>

  <div class="section">
    <h2><span class="dot" style="background:${severityColor}"></span> Headline Diagnosis</h2>
    <span class="severity-pill">${escapeHtml(diagnosis.severity)} · risk ${escapeHtml(diagnosis.riskScore)}/100</span>
    <h3 style="margin:0 0 6px;font-size:20px;font-weight:600">${escapeHtml(diagnosis.title)}</h3>
    <p style="color:#9ca3af;margin:0 0 10px;font-size:13px">${escapeHtml(diagnosis.category)}</p>
    <p style="color:#d1d5db;font-size:14px;line-height:1.65">${escapeHtml(diagnosis.explanation)}</p>
    <p style="color:#34d399;font-size:13px;margin-top:10px">Life impact: ${escapeHtml(diagnosis.lifeImpact)}</p>
    <div class="stat-row">
      <span>Issues found: <strong>${totalIssues}</strong></span>
      <span>Critical markers: <strong style="color:${criticalIssues > 0 ? "#f87171" : "#34d399"}">${criticalIssues}</strong></span>
      <span>Top system: <strong>${escapeHtml(systems[0]?.title || "—")}</strong></span>
    </div>
  </div>

  <div class="section">
    <h2><span class="dot"></span> Underlying Issues — Plain Language</h2>
    ${issuesHtml}
  </div>

  <div class="section">
    <h2><span class="dot"></span> Which Doctor To See</h2>
    ${specialistsHtml}
  </div>

  <div class="section">
    <h2><span class="dot"></span> Your Values vs Normal vs Optimal</h2>
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Marker</th>
            <th style="text-align:right">Normal</th>
            <th style="text-align:right">Optimal</th>
            <th style="text-align:right">Your Value</th>
            <th style="text-align:right">Status</th>
          </tr>
        </thead>
        <tbody>${compRows}</tbody>
      </table>
    </div>
  </div>

  <div class="section">
    <h2><span class="dot"></span> Recommended Actions</h2>
    <ul style="padding:0;margin:0">${fixesHtml}</ul>
  </div>

  <div class="disclaimer">
    <strong>Important:</strong> This report is an educational summary generated by Vitalis AI. It is not a medical diagnosis and does not replace consultation with a licensed physician. Always discuss results with a qualified healthcare provider before changing medications, supplements, or treatment plans.
  </div>

  <div class="footer">
    Vitalis AI Doctor · Generated ${escapeHtml(generatedAt)}<br>
    <a href="https://vital-is.life">vital-is.life</a>
  </div>

</div>
</body>
</html>`;
}

/** Trigger a browser download of the AI Doctor report. */
export function downloadAIDoctorReport(input: AIDoctorReportInput): void {
  const html = generateAIDoctorReportHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `vitalis-ai-doctor-report-${stamp}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Open the report in a new tab for in-app preview. */
export function previewAIDoctorReport(input: AIDoctorReportInput): void {
  const html = generateAIDoctorReportHtml(input);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}