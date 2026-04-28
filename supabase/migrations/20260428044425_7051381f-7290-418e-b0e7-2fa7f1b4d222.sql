CREATE TABLE public.shared_health_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  share_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(18), 'base64'),
  title TEXT,
  html TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '30 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_shared_health_reports_token ON public.shared_health_reports(share_token);
CREATE INDEX idx_shared_health_reports_user ON public.shared_health_reports(user_id);

ALTER TABLE public.shared_health_reports ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own reports
CREATE POLICY "Owners view their shared reports"
  ON public.shared_health_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Owners create their shared reports"
  ON public.shared_health_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners delete their shared reports"
  ON public.shared_health_reports FOR DELETE
  USING (auth.uid() = user_id);

-- Public read by token (lookup must happen via token filter; expiry enforced in app)
CREATE POLICY "Public can read non-expired shared reports"
  ON public.shared_health_reports FOR SELECT
  TO anon, authenticated
  USING (expires_at > now());