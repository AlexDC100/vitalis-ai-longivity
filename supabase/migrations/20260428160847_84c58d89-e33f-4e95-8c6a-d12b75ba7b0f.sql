-- Reviewer + detected category on clinic_cases
ALTER TABLE public.clinic_cases
  ADD COLUMN IF NOT EXISTS reviewed_by_user_id uuid,
  ADD COLUMN IF NOT EXISTS reviewed_by_email text,
  ADD COLUMN IF NOT EXISTS detected_category text;

-- Notification center
CREATE TABLE IF NOT EXISTS public.clinic_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  case_id uuid,
  case_ref text,
  priority text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamp with time zone,
  delivered_email boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
ON public.clinic_notifications FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own notifications"
ON public.clinic_notifications FOR INSERT
WITH CHECK (auth.uid() = user_id AND user_id IS NOT NULL);

CREATE POLICY "Users update own notifications"
ON public.clinic_notifications FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete own notifications"
ON public.clinic_notifications FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS clinic_notifications_user_unread_idx
  ON public.clinic_notifications (user_id, created_at DESC)
  WHERE read_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.clinic_notifications;