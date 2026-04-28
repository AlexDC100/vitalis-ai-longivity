
-- Audit log for shared report token lookups
CREATE TABLE IF NOT EXISTS public.share_token_lookups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  token_prefix text NOT NULL,           -- first 6 chars only — never store full token
  outcome text NOT NULL,                -- 'success' | 'not_found' | 'expired'
  ip text NULL,
  user_agent text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_share_token_lookups_created_at
  ON public.share_token_lookups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_share_token_lookups_outcome_created
  ON public.share_token_lookups (outcome, created_at DESC);

ALTER TABLE public.share_token_lookups ENABLE ROW LEVEL SECURITY;

-- No client (anon or authenticated) can read, insert, update, or delete via PostgREST.
-- The audit log is written server-side via SECURITY DEFINER and read via service role only.
CREATE POLICY "No public access to lookup audit"
  ON public.share_token_lookups
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Replace get_shared_report so it audits every lookup and classifies the outcome.
CREATE OR REPLACE FUNCTION public.get_shared_report(_token text)
RETURNS TABLE (
  title text,
  html text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title text;
  v_html text;
  v_expires_at timestamptz;
  v_outcome text;
  v_prefix text;
BEGIN
  v_prefix := COALESCE(left(_token, 6), '');

  SELECT r.title, r.html, r.expires_at
  INTO v_title, v_html, v_expires_at
  FROM public.shared_health_reports r
  WHERE r.share_token = _token
  LIMIT 1;

  IF v_expires_at IS NULL THEN
    v_outcome := 'not_found';
  ELSIF v_expires_at <= now() THEN
    v_outcome := 'expired';
  ELSE
    v_outcome := 'success';
  END IF;

  INSERT INTO public.share_token_lookups (token_prefix, outcome)
  VALUES (v_prefix, v_outcome);

  IF v_outcome = 'success' THEN
    RETURN QUERY SELECT v_title, v_html, v_expires_at;
  END IF;

  RETURN;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;
