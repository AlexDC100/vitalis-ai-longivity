-- Harden public access to shared_health_reports.
-- Replace broad public SELECT (which exposes all columns including user_id)
-- with a security-definer function that returns only the minimal fields
-- needed by the public viewer, looked up by share_token.

DROP POLICY IF EXISTS "Public can read non-expired shared reports" ON public.shared_health_reports;

CREATE OR REPLACE FUNCTION public.get_shared_report(_token text)
RETURNS TABLE (title text, html text, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT title, html, expires_at
  FROM public.shared_health_reports
  WHERE share_token = _token
  LIMIT 1;
$$;

-- Allow anon + authenticated to call the function. It internally enforces
-- token-based lookup so other rows cannot be enumerated.
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;