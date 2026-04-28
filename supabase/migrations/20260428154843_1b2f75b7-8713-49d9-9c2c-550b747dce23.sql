-- Allow 'critical' priority and add structured AI fields + assignment for diagnostic workflow
ALTER TABLE public.clinic_cases
  ADD COLUMN IF NOT EXISTS suspected_area text,
  ADD COLUMN IF NOT EXISTS confidence numeric,
  ADD COLUMN IF NOT EXISTS suggested_specialist text,
  ADD COLUMN IF NOT EXISTS key_findings jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS missing_info text,
  ADD COLUMN IF NOT EXISTS assigned_doctor text,
  ADD COLUMN IF NOT EXISTS case_ref text;

-- Backfill case_ref for existing rows
UPDATE public.clinic_cases
SET case_ref = 'C-' || upper(substring(replace(id::text,'-','') from 1 for 6))
WHERE case_ref IS NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS clinic_cases_updated_at ON public.clinic_cases;
CREATE TRIGGER clinic_cases_updated_at
BEFORE UPDATE ON public.clinic_cases
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-generate case_ref on insert
CREATE OR REPLACE FUNCTION public.set_clinic_case_ref()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.case_ref IS NULL THEN
    NEW.case_ref := 'C-' || upper(substring(replace(NEW.id::text,'-','') from 1 for 6));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinic_cases_set_ref ON public.clinic_cases;
CREATE TRIGGER clinic_cases_set_ref
BEFORE INSERT ON public.clinic_cases
FOR EACH ROW EXECUTE FUNCTION public.set_clinic_case_ref();