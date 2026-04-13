import { HealthProfile } from "./types";

export interface Diagnosis {
  id: string;
  title: string;
  severity: "critical" | "high" | "moderate" | "low";
  category: string;
  explanation: string;
  riskScore: number; // 0-100
  fixes: Fix[];
  lifeImpact: string;
  systemScores: Record<string, number>;
}

export interface Fix {
  action: string;
  why: string;
  impact: string;
  urgency: "now" | "this-week" | "this-month";
}

export interface SubstanceEntry {
  name: string;
  category: "medication" | "trt" | "steroid" | "glp1" | "supplement" | "other";
  dose?: string;
  frequency?: string;
}

const SUBSTANCE_CATEGORIES = [
  { id: "medication", label: "Medications", placeholder: "e.g. Metformin 500mg, Lisinopril" },
  { id: "trt", label: "TRT / Hormones", placeholder: "e.g. Testosterone Cypionate 200mg/wk" },
  { id: "steroid", label: "Steroids / PEDs", placeholder: "e.g. Anavar 20mg/day" },
  { id: "glp1", label: "GLP-1 Drugs", placeholder: "e.g. Semaglutide 0.5mg/wk" },
  { id: "supplement", label: "Supplements", placeholder: "e.g. Vitamin D 5000IU, Omega-3" },
  { id: "other", label: "Other", placeholder: "e.g. Caffeine, Nicotine" },
] as const;

export { SUBSTANCE_CATEGORIES };

// ─── Confidence scoring ───────────────────────────────────────────────

const CONFIDENCE_KEYS: (keyof HealthProfile)[] = [
  "bp_systolic", "bp_diastolic", "ldl", "hdl", "triglycerides", "apob",
  "fasting_glucose", "hba1c", "fasting_insulin", "hscrp", "homocysteine",
  "hrv_ms", "resting_hr", "vo2_max", "avg_sleep_hours", "sleep_quality",
  "testosterone", "free_t", "tsh", "vitamin_d", "cortisol",
  "body_fat_pct", "waist_cm", "weight_kg",
];

export function calculateConfidence(profile: HealthProfile): number {
  const filled = CONFIDENCE_KEYS.filter(k => {
    const v = (profile as any)[k];
    return v !== undefined && v !== null && v !== 0 && v !== "";
  }).length;
  return Math.round((filled / CONFIDENCE_KEYS.length) * 100);
}

// ─── System risk assessments (weighted, normalized) ───────────────────

interface SystemResult {
  id: string;
  title: string;
  category: string;
  score: number;
  factors: string[];
  fixes: Fix[];
  lifeImpact: string;
}

function assessCardiovascular(p: HealthProfile, subs: SubstanceEntry[]): SystemResult {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  // BP — strongest mortality signal
  if (p.bp_systolic > 140) { score += 30; factors.push(`Systolic BP ${p.bp_systolic} mmHg — Stage 2 hypertension`); }
  else if (p.bp_systolic > 130) { score += 20; factors.push(`Systolic BP ${p.bp_systolic} mmHg — Stage 1 hypertension`); }
  else if (p.bp_systolic > 120) { score += 8; factors.push(`Systolic BP ${p.bp_systolic} mmHg — elevated`); }

  if (p.bp_diastolic > 90) { score += 15; factors.push(`Diastolic BP ${p.bp_diastolic} mmHg — high`); }
  else if (p.bp_diastolic > 80) { score += 8; factors.push(`Diastolic BP ${p.bp_diastolic} mmHg — elevated`); }

  // Lipids — cumulative ApoB-driven atherogenic burden
  if (p.ldl > 160) { score += 25; factors.push(`LDL ${p.ldl} mg/dL — very high atherogenic load`); }
  else if (p.ldl > 130) { score += 18; factors.push(`LDL ${p.ldl} mg/dL — elevated atherogenic risk`); }
  else if (p.ldl > 100) { score += 8; factors.push(`LDL ${p.ldl} mg/dL — suboptimal for longevity`); }

  if (p.apob > 120) { score += 20; factors.push(`ApoB ${p.apob} mg/dL — high particle count`); }
  else if (p.apob > 90) { score += 12; factors.push(`ApoB ${p.apob} mg/dL — above optimal`); }

  if (p.lpa > 75) { score += 18; factors.push(`Lp(a) ${p.lpa} nmol/L — high genetic risk (non-modifiable)`); }
  else if (p.lpa > 50) { score += 10; factors.push(`Lp(a) ${p.lpa} nmol/L — elevated genetic risk`); }

  if (p.hdl < 40) { score += 12; factors.push(`HDL ${p.hdl} mg/dL — critically low protective cholesterol`); }
  else if (p.hdl < 50) { score += 5; }

  if (p.triglycerides > 200) { score += 12; factors.push(`Triglycerides ${p.triglycerides} mg/dL — high`); }
  else if (p.triglycerides > 150) { score += 6; factors.push(`Triglycerides ${p.triglycerides} mg/dL — elevated`); }

  // Substance adjustments
  const onSteroids = subs.some(s => s.category === "steroid" || s.category === "trt");
  if (onSteroids) { score += 12; factors.push("Exogenous androgens increase cardiovascular strain and hematocrit"); }

  // Generate fixes ranked by impact
  if (p.ldl > 100) fixes.push({ action: `Target LDL below ${p.ldl > 160 ? '70' : '100'} mg/dL`, why: "Each 38 mg/dL LDL reduction cuts cardiovascular events by ~22%. Cumulative LDL exposure drives plaque formation.", impact: "-22% cardiovascular events", urgency: "this-week" });
  if (p.bp_systolic > 120) fixes.push({ action: "Lower blood pressure to <120/80", why: "SPRINT trial: intensive BP control reduced mortality 27%. Every 10 mmHg reduction in systolic cuts stroke risk 40%.", impact: "-27% all-cause mortality", urgency: "now" });
  if (p.triglycerides > 150 || p.hdl < 40) fixes.push({ action: "Optimize lipid ratios with diet and exercise", why: "High TG/low HDL ratio is the strongest predictor of insulin-resistant atherogenic dyslipidemia.", impact: "-15-20% CVD risk", urgency: "this-month" });
  if (p.apob > 90 && fixes.length < 3) fixes.push({ action: "Reduce ApoB particle count below 80 mg/dL", why: "ApoB is a better predictor of cardiovascular events than LDL-C. Each atherogenic particle damages the endothelium.", impact: "-30% plaque progression", urgency: "this-week" });

  return {
    id: "cardiovascular",
    title: "Cardiovascular Risk Elevated",
    category: "Heart & Vessels",
    score: Math.min(score, 100),
    factors,
    fixes: fixes.slice(0, 3),
    lifeImpact: score >= 40 ? "+5-8 years with aggressive intervention" : score >= 20 ? "+3-5 years with optimization" : "+1-2 years with fine-tuning",
  };
}

function assessMetabolic(p: HealthProfile, subs: SubstanceEntry[]): SystemResult {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  if (p.fasting_glucose > 125) { score += 35; factors.push(`Fasting glucose ${p.fasting_glucose} mg/dL — diabetic range`); }
  else if (p.fasting_glucose > 100) { score += 22; factors.push(`Fasting glucose ${p.fasting_glucose} mg/dL — pre-diabetic`); }
  else if (p.fasting_glucose > 90) { score += 8; factors.push(`Fasting glucose ${p.fasting_glucose} mg/dL — suboptimal`); }
  else if (p.fasting_glucose > 0 && p.fasting_glucose < 65) { score += 12; factors.push(`Fasting glucose ${p.fasting_glucose} mg/dL — low, possible over-suppression`); }

  if (p.hba1c > 6.5) { score += 35; factors.push(`HbA1c ${p.hba1c}% — diabetic`); }
  else if (p.hba1c > 5.7) { score += 22; factors.push(`HbA1c ${p.hba1c}% — pre-diabetic`); }
  else if (p.hba1c > 5.4) { score += 8; factors.push(`HbA1c ${p.hba1c}% — trending high`); }

  if (p.fasting_insulin > 15) { score += 25; factors.push(`Fasting insulin ${p.fasting_insulin} μU/mL — significant insulin resistance`); }
  else if (p.fasting_insulin > 10) { score += 15; factors.push(`Fasting insulin ${p.fasting_insulin} μU/mL — early insulin resistance`); }
  else if (p.fasting_insulin > 6) { score += 5; factors.push(`Fasting insulin ${p.fasting_insulin} μU/mL — trending high`); }

  if (p.body_fat_pct > 30) { score += 18; factors.push(`Body fat ${p.body_fat_pct}% — metabolically obese`); }
  else if (p.body_fat_pct > 25) { score += 12; factors.push(`Body fat ${p.body_fat_pct}% — excess visceral fat likely`); }
  else if (p.body_fat_pct > 20) { score += 5; factors.push(`Body fat ${p.body_fat_pct}% — suboptimal`); }

  if (p.waist_cm > 102) { score += 15; factors.push(`Waist ${p.waist_cm} cm — high visceral fat risk`); }
  else if (p.waist_cm > 90) { score += 8; factors.push(`Waist ${p.waist_cm} cm — above optimal`); }

  const onGlp1 = subs.some(s => s.category === "glp1");
  if (onGlp1 && score > 0) { score = Math.max(0, score - 12); factors.push("GLP-1 agonist in use — actively treating metabolic dysfunction"); }

  if (p.fasting_glucose > 90 || p.hba1c > 5.4) fixes.push({ action: "Implement time-restricted eating (16:8)", why: "Reduces fasting glucose 5-15 mg/dL in 4 weeks. Activates AMPK and improves insulin sensitivity.", impact: "-40% diabetes progression risk", urgency: "now" });
  if (p.fasting_insulin > 6) fixes.push({ action: "Add 30-min post-meal walks", why: "Reduces postprandial insulin spikes 30-50%. GLUT4 translocation clears glucose without insulin.", impact: "-30% insulin resistance", urgency: "this-week" });
  if (p.body_fat_pct > 20 || p.waist_cm > 90) fixes.push({ action: `Target ${p.body_fat_pct > 25 ? '18' : '15'}% body fat`, why: "Visceral fat is an endocrine organ producing inflammatory cytokines that drive insulin resistance.", impact: "-50% metabolic syndrome risk", urgency: "this-month" });

  return {
    id: "metabolic",
    title: "Metabolic Dysfunction",
    category: "Metabolism",
    score: Math.min(score, 100),
    factors,
    fixes: fixes.slice(0, 3),
    lifeImpact: score >= 40 ? "+6-10 years with metabolic reversal" : score >= 20 ? "+3-5 years with optimization" : "+1-2 years with fine-tuning",
  };
}

function assessInflammation(p: HealthProfile, subs: SubstanceEntry[]): SystemResult {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  if (p.hscrp > 5) { score += 35; factors.push(`hs-CRP ${p.hscrp} mg/L — severe systemic inflammation`); }
  else if (p.hscrp > 3) { score += 25; factors.push(`hs-CRP ${p.hscrp} mg/L — high cardiovascular inflammatory risk`); }
  else if (p.hscrp > 1) { score += 12; factors.push(`hs-CRP ${p.hscrp} mg/L — moderate inflammation`); }

  if (p.homocysteine > 15) { score += 18; factors.push(`Homocysteine ${p.homocysteine} μmol/L — high vascular inflammation`); }
  else if (p.homocysteine > 12) { score += 10; factors.push(`Homocysteine ${p.homocysteine} μmol/L — elevated`); }
  else if (p.homocysteine > 10) { score += 4; factors.push(`Homocysteine ${p.homocysteine} μmol/L — suboptimal`); }

  const onSteroids = subs.some(s => s.category === "steroid");
  if (onSteroids) { score += 8; factors.push("Anabolic steroids can elevate inflammatory markers via hepatic stress"); }

  if (p.hscrp > 1) fixes.push({ action: "Eliminate processed seed oils and refined carbs", why: "Omega-6:3 imbalance drives NF-κB inflammatory cascade. Processed foods are the #1 source.", impact: "-40% hs-CRP in 8 weeks", urgency: "now" });
  if (p.homocysteine > 10) fixes.push({ action: "Start methylated B-vitamins (B9, B12, B6)", why: "Homocysteine is a direct vascular toxin. Methylation support reduces levels 25-35%.", impact: "-25% homocysteine", urgency: "this-week" });
  if (score > 0) fixes.push({ action: "Add 2g EPA/DHA daily (high-quality fish oil)", why: "EPA directly inhibits COX-2 and resolvin pathways, reducing systemic inflammation.", impact: "-30% inflammatory markers", urgency: "this-week" });

  return {
    id: "inflammation",
    title: "Chronic Inflammation",
    category: "Inflammation",
    score: Math.min(score, 100),
    factors,
    fixes: fixes.slice(0, 3),
    lifeImpact: score >= 30 ? "+3-5 years with inflammation control" : "+1-3 years with optimization",
  };
}

function assessRecovery(p: HealthProfile): SystemResult {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  if (p.hrv_ms > 0 && p.hrv_ms < 20) { score += 30; factors.push(`HRV ${p.hrv_ms} ms — critically low autonomic function, high mortality risk`); }
  else if (p.hrv_ms < 30) { score += 20; factors.push(`HRV ${p.hrv_ms} ms — severely impaired recovery`); }
  else if (p.hrv_ms < 50) { score += 10; factors.push(`HRV ${p.hrv_ms} ms — suboptimal autonomic regulation`); }

  if (p.avg_sleep_hours > 0 && p.avg_sleep_hours < 5) { score += 30; factors.push(`${p.avg_sleep_hours}h avg sleep — severe deprivation, accelerated aging`); }
  else if (p.avg_sleep_hours < 6) { score += 22; factors.push(`${p.avg_sleep_hours}h avg sleep — significant deficit`); }
  else if (p.avg_sleep_hours < 7) { score += 10; factors.push(`${p.avg_sleep_hours}h avg sleep — insufficient for recovery`); }

  if (p.sleep_quality > 0 && p.sleep_quality < 40) { score += 15; factors.push(`Sleep quality ${p.sleep_quality}/100 — poor architecture`); }
  else if (p.sleep_quality < 60) { score += 8; factors.push(`Sleep quality ${p.sleep_quality}/100 — impaired`); }

  if (p.cortisol > 25) { score += 18; factors.push(`Cortisol ${p.cortisol} μg/dL — chronically elevated stress`); }
  else if (p.cortisol > 20) { score += 10; factors.push(`Cortisol ${p.cortisol} μg/dL — elevated stress response`); }

  if (p.resting_hr > 80) { score += 12; factors.push(`Resting HR ${p.resting_hr} bpm — elevated sympathetic tone`); }
  else if (p.resting_hr > 70) { score += 5; factors.push(`Resting HR ${p.resting_hr} bpm — above optimal`); }

  if (p.vo2_max > 0 && p.vo2_max < 30) { score += 15; factors.push(`VO2 Max ${p.vo2_max} — poor cardiorespiratory fitness`); }
  else if (p.vo2_max < 40) { score += 8; factors.push(`VO2 Max ${p.vo2_max} — below optimal`); }

  if (p.avg_sleep_hours < 7) fixes.push({ action: "Prioritize 7-8 hours of sleep nightly", why: "Each hour below 7 increases all-cause mortality 13%. Sleep is when glymphatic clearance removes brain waste.", impact: "-13% mortality per hour gained", urgency: "now" });
  if (p.hrv_ms > 0 && p.hrv_ms < 50) fixes.push({ action: "Daily HRV training — 5 min coherence breathing", why: "Vagal tone training increases HRV 15-25% in 8 weeks. Higher HRV = better stress resilience and longevity.", impact: "+20% recovery capacity", urgency: "this-week" });
  if (p.vo2_max < 45) fixes.push({ action: "Add 150 min/week Zone 2 + 1-2 HIIT sessions", why: "VO2 Max is the single strongest predictor of all-cause mortality. Moving from bottom to top quartile = 5x mortality reduction.", impact: "+5-8 years lifespan", urgency: "this-month" });
  if (p.cortisol > 20 && fixes.length < 3) fixes.push({ action: "Implement cortisol management protocol", why: "Chronic cortisol accelerates telomere shortening, impairs immune function, and drives visceral fat deposition.", impact: "-3 years biological age", urgency: "this-month" });

  return {
    id: "recovery",
    title: "Recovery Failure",
    category: "Recovery & Sleep",
    score: Math.min(score, 100),
    factors,
    fixes: fixes.slice(0, 3),
    lifeImpact: score >= 35 ? "+4-7 years with recovery optimization" : score >= 15 ? "+2-4 years with improvement" : "+1-2 years with fine-tuning",
  };
}

function assessHormonal(p: HealthProfile, subs: SubstanceEntry[]): SystemResult {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];
  const onTRT = subs.some(s => s.category === "trt");

  // Vitamin D — most impactful single marker
  if (p.vitamin_d > 0 && p.vitamin_d < 20) { score += 22; factors.push(`Vitamin D ${p.vitamin_d} ng/mL — deficient, linked to 25% higher all-cause mortality`); }
  else if (p.vitamin_d < 30) { score += 12; factors.push(`Vitamin D ${p.vitamin_d} ng/mL — insufficient for optimal immune and hormonal function`); }

  // Testosterone
  if (!onTRT) {
    if (p.testosterone > 0 && p.testosterone < 250) { score += 22; factors.push(`Testosterone ${p.testosterone} ng/dL — clinically low, sarcopenia and metabolic decline risk`); }
    else if (p.testosterone < 400) { score += 12; factors.push(`Testosterone ${p.testosterone} ng/dL — suboptimal for longevity`); }
  } else {
    // On TRT — different interpretation
    if (p.estradiol > 50) { score += 10; factors.push(`Estradiol ${p.estradiol} pg/mL — high aromatization on TRT, needs management`); }
    factors.push("On TRT — monitor estradiol, hematocrit, PSA, and lipid impact");
    score += 5;
  }

  // Thyroid
  if (p.tsh > 4.5) { score += 18; factors.push(`TSH ${p.tsh} mIU/L — hypothyroid range, metabolic slowdown`); }
  else if (p.tsh > 3) { score += 8; factors.push(`TSH ${p.tsh} mIU/L — subclinical hypothyroid territory`); }
  else if (p.tsh > 0 && p.tsh < 0.4) { score += 15; factors.push(`TSH ${p.tsh} mIU/L — hyperthyroid range`); }

  if (p.dhea_s > 0 && p.dhea_s < 150) { score += 12; factors.push(`DHEA-S ${p.dhea_s} μg/dL — low, accelerated aging marker`); }
  else if (p.dhea_s < 250) { score += 5; factors.push(`DHEA-S ${p.dhea_s} μg/dL — below optimal`); }

  if (p.igf1 > 0 && p.igf1 < 100) { score += 8; factors.push(`IGF-1 ${p.igf1} ng/mL — low growth signaling`); }
  if (p.cortisol > 22) { score += 8; factors.push(`Cortisol ${p.cortisol} μg/dL — excess cortisol suppresses DHEA and testosterone`); }

  if (p.vitamin_d < 30) fixes.push({ action: "Supplement Vitamin D3 5000 IU/day + K2", why: "Low vitamin D is linked to 25% higher all-cause mortality and impairs 200+ gene expressions.", impact: "-25% mortality risk", urgency: "now" });
  if (!onTRT && p.testosterone < 400 && p.testosterone > 0) fixes.push({ action: "Optimize testosterone naturally first", why: "Sleep, heavy resistance training, body fat reduction, and stress management can raise T 20-40%.", impact: "+3-5 years healthspan", urgency: "this-month" });
  if (p.tsh > 3) fixes.push({ action: "Get comprehensive thyroid panel (FT3, FT4, antibodies)", why: "Subclinical hypothyroidism affects every metabolic process and accelerates aging.", impact: "Identify treatable cause", urgency: "this-week" });
  if (p.dhea_s < 200 && fixes.length < 3) fixes.push({ action: "Consider DHEA supplementation 25-50mg/day", why: "DHEA-S declines 2-3% per year after 25. Low levels correlate with increased cardiovascular mortality.", impact: "+2 years healthspan", urgency: "this-month" });

  return {
    id: "hormonal",
    title: "Hormonal Imbalance",
    category: "Hormones",
    score: Math.min(score, 100),
    factors,
    fixes: fixes.slice(0, 3),
    lifeImpact: score >= 30 ? "+3-5 years with hormonal optimization" : "+1-3 years with correction",
  };
}

// ─── Main diagnosis runner ─────────────────────────────────────────

export function runDiagnosis(profile: HealthProfile, substances: SubstanceEntry[]): Diagnosis {
  const systems = [
    assessCardiovascular(profile, substances),
    assessMetabolic(profile, substances),
    assessInflammation(profile, substances),
    assessRecovery(profile),
    assessHormonal(profile, substances),
  ];

  // Build system scores map
  const systemScores: Record<string, number> = {};
  systems.forEach(s => { systemScores[s.category] = s.score; });

  // Select ONLY the highest-risk system
  systems.sort((a, b) => b.score - a.score);
  const top = systems[0];

  const severity: Diagnosis["severity"] =
    top.score >= 45 ? "critical" :
    top.score >= 25 ? "high" :
    top.score >= 10 ? "moderate" : "low";

  return {
    id: top.id,
    title: top.title,
    severity,
    category: top.category,
    explanation: top.factors.length > 0
      ? top.factors.join(". ") + "."
      : "All markers in this system are within acceptable ranges.",
    riskScore: top.score,
    fixes: top.fixes,
    lifeImpact: top.lifeImpact,
    systemScores,
  };
}

// Get all system scores for risk overview
export function getAllSystemScores(profile: HealthProfile, substances: SubstanceEntry[]): SystemResult[] {
  return [
    assessCardiovascular(profile, substances),
    assessMetabolic(profile, substances),
    assessInflammation(profile, substances),
    assessRecovery(profile),
    assessHormonal(profile, substances),
  ].sort((a, b) => b.score - a.score);
}

export function getOverallRisk(diagnosis: Diagnosis): { score: number; label: string; color: string } {
  if (diagnosis.riskScore === 0) return { score: 0, label: "No issues detected", color: "text-vitalis-success" };
  if (diagnosis.severity === "critical") return { score: diagnosis.riskScore, label: "Critical", color: "text-red-400" };
  if (diagnosis.severity === "high") return { score: diagnosis.riskScore, label: "High Risk", color: "text-amber-400" };
  if (diagnosis.severity === "moderate") return { score: diagnosis.riskScore, label: "Moderate", color: "text-yellow-400" };
  return { score: diagnosis.riskScore, label: "Low Risk", color: "text-emerald-400" };
}

// ─── "What changed?" diff engine ──────────────────────────────────

export interface DiagnosisChange {
  type: "improved" | "worsened" | "new_problem" | "resolved";
  description: string;
}

export function diffDiagnosis(prev: Diagnosis | null, next: Diagnosis): DiagnosisChange[] {
  const changes: DiagnosisChange[] = [];

  if (!prev) {
    if (next.riskScore > 0) changes.push({ type: "new_problem", description: `Identified: ${next.title}` });
    return changes;
  }

  // Problem changed entirely
  if (prev.id !== next.id) {
    changes.push({ type: "resolved", description: `${prev.title} is no longer your top risk` });
    changes.push({ type: "new_problem", description: `New top risk: ${next.title}` });
    return changes;
  }

  // Same problem, score changed
  const delta = next.riskScore - prev.riskScore;
  if (delta <= -10) changes.push({ type: "improved", description: `${next.title} risk dropped ${Math.abs(delta)} points` });
  else if (delta >= 10) changes.push({ type: "worsened", description: `${next.title} risk increased ${delta} points` });

  // Severity change
  const sevOrder = { low: 0, moderate: 1, high: 2, critical: 3 };
  if (sevOrder[next.severity] < sevOrder[prev.severity]) {
    changes.push({ type: "improved", description: `Severity downgraded from ${prev.severity} to ${next.severity}` });
  } else if (sevOrder[next.severity] > sevOrder[prev.severity]) {
    changes.push({ type: "worsened", description: `Severity upgraded to ${next.severity}` });
  }

  return changes;
}
