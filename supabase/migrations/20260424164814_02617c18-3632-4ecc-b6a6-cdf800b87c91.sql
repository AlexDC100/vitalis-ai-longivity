-- Daily longevity snapshots
CREATE TABLE public.health_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score NUMERIC NOT NULL,
  bio_age NUMERIC NOT NULL,
  chrono_age NUMERIC NOT NULL,
  main_issue TEXT,
  risk_score NUMERIC,
  severity TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX idx_health_snapshots_user_date
  ON public.health_snapshots(user_id, snapshot_date DESC);

ALTER TABLE public.health_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snapshots"
  ON public.health_snapshots FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own snapshots"
  ON public.health_snapshots FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own snapshots"
  ON public.health_snapshots FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own snapshots"
  ON public.health_snapshots FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_health_snapshots_updated_at
  BEFORE UPDATE ON public.health_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Action check-ins
CREATE TABLE public.action_completions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  fix_key TEXT NOT NULL,
  action_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, fix_key)
);

CREATE INDEX idx_action_completions_user
  ON public.action_completions(user_id, updated_at DESC);

ALTER TABLE public.action_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own completions"
  ON public.action_completions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own completions"
  ON public.action_completions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own completions"
  ON public.action_completions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own completions"
  ON public.action_completions FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER update_action_completions_updated_at
  BEFORE UPDATE ON public.action_completions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();