-- Intake sessions table for AI-driven longevity onboarding
CREATE TABLE public.intake_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  section TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  extracted_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.intake_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own intake sessions"
  ON public.intake_sessions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own intake sessions"
  ON public.intake_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intake sessions"
  ON public.intake_sessions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own intake sessions"
  ON public.intake_sessions FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_intake_sessions_user_id ON public.intake_sessions(user_id);
CREATE INDEX idx_intake_sessions_user_section ON public.intake_sessions(user_id, section);

CREATE TRIGGER update_intake_sessions_updated_at
  BEFORE UPDATE ON public.intake_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();