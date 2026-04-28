-- Add reviewer name and delivered_in_app columns
ALTER TABLE public.clinic_cases
  ADD COLUMN IF NOT EXISTS reviewed_by_name text;

ALTER TABLE public.clinic_notifications
  ADD COLUMN IF NOT EXISTS delivered_in_app boolean NOT NULL DEFAULT true;

-- Case event timeline
CREATE TABLE IF NOT EXISTS public.clinic_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  case_id uuid NOT NULL,
  event_type text NOT NULL, -- 'uploaded' | 'status_changed' | 'ai_regenerated' | 'ai_failed' | 'reviewed'
  from_status text,
  to_status text,
  actor_email text,
  actor_name text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinic_case_events_case ON public.clinic_case_events(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clinic_case_events_user ON public.clinic_case_events(user_id);

ALTER TABLE public.clinic_case_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own case events"
  ON public.clinic_case_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own case events"
  ON public.clinic_case_events FOR INSERT
  WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

CREATE POLICY "Users delete own case events"
  ON public.clinic_case_events FOR DELETE
  USING (auth.uid() = user_id);