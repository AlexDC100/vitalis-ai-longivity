ALTER TABLE public.clinic_cases
  ADD COLUMN IF NOT EXISTS last_regenerated_at timestamptz;