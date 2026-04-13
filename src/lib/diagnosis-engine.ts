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

export function runDiagnosis(profile: HealthProfile, substances: SubstanceEntry[]): Diagnosis[] {
  const diagnoses: Diagnosis[] = [];

  // Check cardiovascular risk
  const cvRisk = assessCardiovascular(profile, substances);
  if (cvRisk) diagnoses.push(cvRisk);

  // Check metabolic dysfunction
  const metRisk = assessMetabolic(profile, substances);
  if (metRisk) diagnoses.push(metRisk);

  // Check inflammatory burden
  const inflRisk = assessInflammation(profile, substances);
  if (inflRisk) diagnoses.push(inflRisk);

  // Check recovery failure
  const recRisk = assessRecovery(profile);
  if (recRisk) diagnoses.push(recRisk);

  // Check hormonal imbalance
  const hormRisk = assessHormonal(profile, substances);
  if (hormRisk) diagnoses.push(hormRisk);

  // Sort by severity score
  diagnoses.sort((a, b) => b.riskScore - a.riskScore);
  return diagnoses;
}

function assessCardiovascular(p: HealthProfile, subs: SubstanceEntry[]): Diagnosis | null {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  if (p.bp_systolic > 130) { score += 25; factors.push(`systolic BP ${p.bp_systolic} mmHg (>130)`); }
  else if (p.bp_systolic > 120) { score += 10; factors.push(`systolic BP ${p.bp_systolic} mmHg (elevated)`); }

  if (p.ldl > 130) { score += 20; factors.push(`LDL ${p.ldl} mg/dL (>130)`); }
  else if (p.ldl > 100) { score += 10; factors.push(`LDL ${p.ldl} mg/dL (suboptimal)`); }

  if (p.apob > 90) { score += 20; factors.push(`ApoB ${p.apob} mg/dL (>90)`); }
  if (p.lpa > 50) { score += 15; factors.push(`Lp(a) ${p.lpa} nmol/L (elevated, genetic)`); }
  if (p.triglycerides > 150) { score += 10; factors.push(`Triglycerides ${p.triglycerides} mg/dL (>150)`); }
  if (p.hdl < 40) { score += 15; factors.push(`HDL ${p.hdl} mg/dL (low)`); }
  else if (p.hdl < 50) { score += 5; }

  const onSteroids = subs.some(s => s.category === "steroid" || s.category === "trt");
  if (onSteroids) { score += 10; factors.push("anabolic/TRT use elevates cardiovascular strain"); }

  if (score < 15) return null;

  if (p.ldl > 100) fixes.push({ action: "Target LDL below 100 mg/dL", why: "Each 38 mg/dL LDL reduction cuts CV events ~22%", impact: "-22% cardiovascular events", urgency: "this-week" });
  if (p.bp_systolic > 120) fixes.push({ action: "Lower blood pressure to <120/80", why: "SPRINT trial showed 27% mortality reduction", impact: "-27% all-cause mortality", urgency: "now" });
  if (p.triglycerides > 150) fixes.push({ action: "Reduce triglycerides through diet", why: "High triglycerides accelerate atherosclerosis", impact: "-15% CVD risk", urgency: "this-month" });

  return {
    id: "cardiovascular",
    title: "Cardiovascular Risk Elevated",
    severity: score >= 40 ? "critical" : score >= 25 ? "high" : "moderate",
    category: "Heart & Vessels",
    explanation: factors.join(". ") + ".",
    riskScore: Math.min(score, 100),
    fixes: fixes.slice(0, 3),
    lifeImpact: score >= 40 ? "+5-8 years with intervention" : "+2-4 years with optimization",
  };
}

function assessMetabolic(p: HealthProfile, subs: SubstanceEntry[]): Diagnosis | null {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  if (p.fasting_glucose > 100) { score += 25; factors.push(`fasting glucose ${p.fasting_glucose} mg/dL (pre-diabetic range)`); }
  else if (p.fasting_glucose > 90) { score += 10; factors.push(`fasting glucose ${p.fasting_glucose} mg/dL (suboptimal)`); }

  if (p.hba1c > 5.7) { score += 30; factors.push(`HbA1c ${p.hba1c}% (pre-diabetic)`); }
  else if (p.hba1c > 5.4) { score += 10; factors.push(`HbA1c ${p.hba1c}% (suboptimal)`); }

  if (p.fasting_insulin > 10) { score += 20; factors.push(`fasting insulin ${p.fasting_insulin} μU/mL (insulin resistant)`); }
  else if (p.fasting_insulin > 6) { score += 8; factors.push(`fasting insulin ${p.fasting_insulin} μU/mL (trending high)`); }

  if (p.body_fat_pct > 25) { score += 15; factors.push(`body fat ${p.body_fat_pct}% (excess visceral fat likely)`); }

  const onGlp1 = subs.some(s => s.category === "glp1");
  if (onGlp1 && score > 0) { score -= 10; factors.push("GLP-1 agonist in use — actively treating"); }

  if (score < 15) return null;

  if (p.fasting_glucose > 90) fixes.push({ action: "Implement time-restricted eating", why: "Reduces fasting glucose by 5-15 mg/dL in 4 weeks", impact: "-40% diabetes risk", urgency: "now" });
  if (p.fasting_insulin > 6) fixes.push({ action: "Add 30 min post-meal walks", why: "Reduces insulin spikes by 30-50%", impact: "-30% insulin resistance", urgency: "this-week" });
  if (p.body_fat_pct > 20) fixes.push({ action: "Target 15% body fat", why: "Visceral fat drives insulin resistance", impact: "-50% metabolic syndrome risk", urgency: "this-month" });

  return {
    id: "metabolic",
    title: "Metabolic Dysfunction",
    severity: score >= 40 ? "critical" : score >= 25 ? "high" : "moderate",
    category: "Metabolism",
    explanation: factors.join(". ") + ".",
    riskScore: Math.min(score, 100),
    fixes: fixes.slice(0, 3),
    lifeImpact: score >= 40 ? "+6-10 years with reversal" : "+2-5 years with optimization",
  };
}

function assessInflammation(p: HealthProfile, subs: SubstanceEntry[]): Diagnosis | null {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  if (p.hscrp > 3) { score += 30; factors.push(`hs-CRP ${p.hscrp} mg/L (high systemic inflammation)`); }
  else if (p.hscrp > 1) { score += 15; factors.push(`hs-CRP ${p.hscrp} mg/L (elevated)`); }

  if (p.homocysteine > 12) { score += 15; factors.push(`homocysteine ${p.homocysteine} μmol/L (>12)`); }

  const onSteroids = subs.some(s => s.category === "steroid");
  if (onSteroids) { score += 10; factors.push("anabolic steroids can elevate inflammatory markers"); }

  if (score < 15) return null;

  if (p.hscrp > 1) fixes.push({ action: "Eliminate seed oils and processed foods", why: "Omega-6 excess drives chronic inflammation", impact: "-40% hs-CRP in 8 weeks", urgency: "now" });
  if (p.homocysteine > 10) fixes.push({ action: "Start methylated B vitamins", why: "Reduces homocysteine, a vascular inflammation driver", impact: "-25% homocysteine levels", urgency: "this-week" });
  fixes.push({ action: "Add 2g EPA/DHA daily", why: "Omega-3s directly inhibit inflammatory pathways", impact: "-30% systemic inflammation", urgency: "this-week" });

  return {
    id: "inflammation",
    title: "Chronic Inflammation",
    severity: score >= 30 ? "high" : "moderate",
    category: "Inflammation",
    explanation: factors.join(". ") + ".",
    riskScore: Math.min(score, 100),
    fixes: fixes.slice(0, 3),
    lifeImpact: "+2-4 years with inflammation control",
  };
}

function assessRecovery(p: HealthProfile): Diagnosis | null {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  if (p.hrv_ms < 30) { score += 25; factors.push(`HRV ${p.hrv_ms} ms (critically low autonomic function)`); }
  else if (p.hrv_ms < 50) { score += 10; factors.push(`HRV ${p.hrv_ms} ms (suboptimal recovery)`); }

  if (p.avg_sleep_hours < 6) { score += 25; factors.push(`${p.avg_sleep_hours}h avg sleep (severe deficit)`); }
  else if (p.avg_sleep_hours < 7) { score += 10; factors.push(`${p.avg_sleep_hours}h avg sleep (insufficient)`); }

  if (p.sleep_quality < 50) { score += 15; factors.push(`sleep quality ${p.sleep_quality}/100 (poor)`); }
  else if (p.sleep_quality < 70) { score += 5; }

  if (p.cortisol > 20) { score += 15; factors.push(`cortisol ${p.cortisol} μg/dL (elevated stress)`); }
  if (p.resting_hr > 75) { score += 10; factors.push(`resting HR ${p.resting_hr} bpm (elevated)`); }

  if (score < 15) return null;

  if (p.avg_sleep_hours < 7) fixes.push({ action: "Prioritize 7-8 hours of sleep", why: "Each hour below 7 increases mortality 13%", impact: "-13% mortality per hour gained", urgency: "now" });
  if (p.hrv_ms < 50) fixes.push({ action: "Start daily HRV training (breathing)", why: "5 min coherence breathing raises HRV 15-20%", impact: "+20% recovery capacity", urgency: "this-week" });
  if (p.cortisol > 18) fixes.push({ action: "Implement cortisol management", why: "Chronic cortisol accelerates aging across all systems", impact: "-3 years biological age", urgency: "this-month" });

  return {
    id: "recovery",
    title: "Recovery Failure",
    severity: score >= 35 ? "high" : "moderate",
    category: "Recovery & Sleep",
    explanation: factors.join(". ") + ".",
    riskScore: Math.min(score, 100),
    fixes: fixes.slice(0, 3),
    lifeImpact: "+2-5 years with recovery optimization",
  };
}

function assessHormonal(p: HealthProfile, subs: SubstanceEntry[]): Diagnosis | null {
  let score = 0;
  const factors: string[] = [];
  const fixes: Fix[] = [];

  const onTRT = subs.some(s => s.category === "trt");

  if (p.testosterone < 300 && !onTRT) { score += 20; factors.push(`testosterone ${p.testosterone} ng/dL (low)`); }
  if (p.tsh > 4) { score += 15; factors.push(`TSH ${p.tsh} mIU/L (hypothyroid range)`); }
  else if (p.tsh < 0.5) { score += 15; factors.push(`TSH ${p.tsh} mIU/L (hyperthyroid range)`); }

  if (p.vitamin_d < 30) { score += 15; factors.push(`vitamin D ${p.vitamin_d} ng/mL (deficient)`); }
  if (p.dhea_s < 200) { score += 10; factors.push(`DHEA-S ${p.dhea_s} μg/dL (low for age)`); }
  if (p.cortisol > 22) { score += 10; factors.push(`cortisol ${p.cortisol} μg/dL (excess)`); }

  if (onTRT) { factors.push("on TRT — monitor estradiol, hematocrit, and PSA"); score += 5; }

  if (score < 15) return null;

  if (p.vitamin_d < 30) fixes.push({ action: "Supplement Vitamin D3 5000 IU/day", why: "Low vitamin D linked to 25% higher mortality", impact: "-25% all-cause mortality risk", urgency: "now" });
  if (p.testosterone < 400 && !onTRT) fixes.push({ action: "Optimize testosterone naturally", why: "Low T accelerates sarcopenia and metabolic decline", impact: "+3-5 years healthspan", urgency: "this-month" });
  if (p.tsh > 3) fixes.push({ action: "Get full thyroid panel", why: "Subclinical hypothyroidism slows all metabolic processes", impact: "Identify treatable cause", urgency: "this-week" });

  return {
    id: "hormonal",
    title: "Hormonal Imbalance",
    severity: score >= 30 ? "high" : "moderate",
    category: "Hormones",
    explanation: factors.join(". ") + ".",
    riskScore: Math.min(score, 100),
    fixes: fixes.slice(0, 3),
    lifeImpact: "+2-4 years with hormonal optimization",
  };
}

export function getOverallRisk(diagnoses: Diagnosis[]): { score: number; label: string; color: string } {
  if (diagnoses.length === 0) return { score: 0, label: "No issues detected", color: "text-vitalis-success" };
  const top = diagnoses[0];
  if (top.severity === "critical") return { score: top.riskScore, label: "Critical", color: "text-vitalis-danger" };
  if (top.severity === "high") return { score: top.riskScore, label: "High Risk", color: "text-vitalis-warning" };
  if (top.severity === "moderate") return { score: top.riskScore, label: "Moderate", color: "text-vitalis-warning" };
  return { score: top.riskScore, label: "Low Risk", color: "text-vitalis-success" };
}
