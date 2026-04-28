-- Clinic cases: per-user diagnostic backlog for hospital/clinic dashboard
CREATE TABLE public.clinic_cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_type TEXT NOT NULL DEFAULT 'document',
  file_name TEXT NOT NULL,
  file_path TEXT,
  mime_type TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority TEXT NOT NULL DEFAULT 'medium',
  urgency_label TEXT,
  insight TEXT,
  explanation TEXT,
  recommendation TEXT,
  raw_ai JSONB DEFAULT '{}'::jsonb,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT clinic_cases_priority_chk CHECK (priority IN ('high','medium','low')),
  CONSTRAINT clinic_cases_status_chk CHECK (status IN ('pending','analyzing','ready','reviewed','error'))
);

CREATE INDEX idx_clinic_cases_user_priority ON public.clinic_cases(user_id, priority, created_at DESC);

ALTER TABLE public.clinic_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own clinic cases" ON public.clinic_cases
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own clinic cases" ON public.clinic_cases
  FOR INSERT WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);
CREATE POLICY "Users update own clinic cases" ON public.clinic_cases
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own clinic cases" ON public.clinic_cases
  FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER trg_clinic_cases_updated_at
  BEFORE UPDATE ON public.clinic_cases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();