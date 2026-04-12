
-- Create health profiles table
CREATE TABLE public.health_profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT DEFAULT '',
  date_of_birth DATE,
  sex TEXT DEFAULT '',
  height_cm NUMERIC DEFAULT 0,
  weight_kg NUMERIC DEFAULT 0,
  body_fat_pct NUMERIC DEFAULT 0,
  waist_cm NUMERIC DEFAULT 0,
  bp_systolic NUMERIC DEFAULT 0,
  bp_diastolic NUMERIC DEFAULT 0,
  hrv_ms NUMERIC DEFAULT 0,
  resting_hr NUMERIC DEFAULT 0,
  vo2_max NUMERIC DEFAULT 0,
  avg_sleep_hours NUMERIC DEFAULT 0,
  sleep_quality NUMERIC DEFAULT 0,
  fev1_pct NUMERIC DEFAULT 0,
  fasting_glucose NUMERIC DEFAULT 0,
  hba1c NUMERIC DEFAULT 0,
  fasting_insulin NUMERIC DEFAULT 0,
  total_cholesterol NUMERIC DEFAULT 0,
  ldl NUMERIC DEFAULT 0,
  hdl NUMERIC DEFAULT 0,
  triglycerides NUMERIC DEFAULT 0,
  apob NUMERIC DEFAULT 0,
  lpa NUMERIC DEFAULT 0,
  hscrp NUMERIC DEFAULT 0,
  homocysteine NUMERIC DEFAULT 0,
  vitamin_d NUMERIC DEFAULT 0,
  testosterone NUMERIC DEFAULT 0,
  free_t NUMERIC DEFAULT 0,
  estradiol NUMERIC DEFAULT 0,
  dhea_s NUMERIC DEFAULT 0,
  cortisol NUMERIC DEFAULT 0,
  tsh NUMERIC DEFAULT 0,
  free_t3 NUMERIC DEFAULT 0,
  free_t4 NUMERIC DEFAULT 0,
  igf1 NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.health_profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own health profile"
  ON public.health_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own health profile"
  ON public.health_profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own health profile"
  ON public.health_profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own health profile"
  ON public.health_profiles FOR DELETE
  USING (auth.uid() = user_id);

-- Timestamp trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_health_profiles_updated_at
  BEFORE UPDATE ON public.health_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
