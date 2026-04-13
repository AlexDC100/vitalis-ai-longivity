export interface HealthProfile {
  id?: string;
  user_id?: string;
  full_name: string;
  date_of_birth: string;
  sex: string;
  height_cm: number;
  weight_kg: number;
  body_fat_pct: number;
  waist_cm: number;
  bp_systolic: number;
  bp_diastolic: number;
  hrv_ms: number;
  resting_hr: number;
  vo2_max: number;
  avg_sleep_hours: number;
  sleep_quality: number;
  fev1_pct: number;
  fasting_glucose: number;
  hba1c: number;
  fasting_insulin: number;
  total_cholesterol: number;
  ldl: number;
  hdl: number;
  triglycerides: number;
  apob: number;
  lpa: number;
  hscrp: number;
  homocysteine: number;
  vitamin_d: number;
  testosterone: number;
  free_t: number;
  estradiol: number;
  dhea_s: number;
  cortisol: number;
  tsh: number;
  free_t3: number;
  free_t4: number;
  igf1: number;
  created_at?: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

export type AppScreen = "diagnosis" | "body" | "doctor";

// Keep old type for compatibility
export type NavSection =
  | "command-center"
  | "ai-advisor"
  | "medical-team"
  | "health-blueprint"
  | "risk-engine"
  | "future-self"
  | "action-stack"
  | "medical-vault";

export const defaultHealthProfile: HealthProfile = {
  full_name: "Alex Morgan",
  date_of_birth: "1988-04-15",
  sex: "Male",
  height_cm: 182,
  weight_kg: 86,
  body_fat_pct: 19.5,
  waist_cm: 91,
  bp_systolic: 128,
  bp_diastolic: 82,
  hrv_ms: 48,
  resting_hr: 62,
  vo2_max: 42,
  avg_sleep_hours: 6.8,
  sleep_quality: 65,
  fev1_pct: 92,
  fasting_glucose: 98,
  hba1c: 5.4,
  fasting_insulin: 9,
  total_cholesterol: 210,
  ldl: 130,
  hdl: 55,
  triglycerides: 120,
  apob: 95,
  lpa: 25,
  hscrp: 1.8,
  homocysteine: 10,
  vitamin_d: 35,
  testosterone: 520,
  free_t: 12,
  estradiol: 28,
  dhea_s: 350,
  cortisol: 15,
  tsh: 2.1,
  free_t3: 3.2,
  free_t4: 1.2,
  igf1: 180,
};

export function calculateLongevityScore(p: HealthProfile): number {
  let score = 50;
  if (p.bp_systolic <= 120) score += 5; else if (p.bp_systolic <= 130) score += 3; else score -= 2;
  if (p.hdl >= 60) score += 4; else if (p.hdl >= 50) score += 2;
  if (p.ldl <= 100) score += 4; else if (p.ldl <= 130) score += 2; else score -= 2;
  if (p.hscrp < 1) score += 4; else if (p.hscrp < 2) score += 2; else score -= 2;
  if (p.fasting_glucose <= 90) score += 4; else if (p.fasting_glucose <= 100) score += 2; else score -= 3;
  if (p.hba1c <= 5.2) score += 4; else if (p.hba1c <= 5.6) score += 2; else score -= 3;
  if (p.vo2_max >= 50) score += 5; else if (p.vo2_max >= 40) score += 3; else score += 1;
  if (p.hrv_ms >= 60) score += 4; else if (p.hrv_ms >= 40) score += 2;
  if (p.avg_sleep_hours >= 7 && p.avg_sleep_hours <= 9) score += 3; else score -= 1;
  if (p.sleep_quality >= 80) score += 3; else if (p.sleep_quality >= 60) score += 1;
  if (p.body_fat_pct <= 15) score += 3; else if (p.body_fat_pct <= 20) score += 1; else score -= 1;
  return Math.max(0, Math.min(100, score));
}

export function calculateBiologicalAge(p: HealthProfile): number {
  const chronoAge = new Date().getFullYear() - new Date(p.date_of_birth).getFullYear();
  let offset = 0;
  if (p.vo2_max >= 50) offset -= 3; else if (p.vo2_max < 35) offset += 3;
  if (p.hrv_ms >= 60) offset -= 2; else if (p.hrv_ms < 30) offset += 3;
  if (p.hscrp < 1) offset -= 1; else if (p.hscrp > 3) offset += 2;
  if (p.fasting_glucose > 100) offset += 1;
  if (p.sleep_quality >= 80) offset -= 1; else if (p.sleep_quality < 50) offset += 2;
  return chronoAge + offset;
}
