
-- 1. Lock down shared_health_reports: drop the public SELECT policy
DROP POLICY IF EXISTS "Public can read non-expired shared reports" ON public.shared_health_reports;

-- 2. Create a SECURITY DEFINER function that returns a report ONLY when the
--    caller supplies the correct share_token and the report has not expired.
--    This prevents enumeration: callers must already know the token.
CREATE OR REPLACE FUNCTION public.get_shared_report(_token text)
RETURNS TABLE (
  title text,
  html text,
  expires_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.title, r.html, r.expires_at
  FROM public.shared_health_reports r
  WHERE r.share_token = _token
    AND r.expires_at > now()
  LIMIT 1;
$$;

-- Allow anon + authenticated to call the function (token acts as the credential)
GRANT EXECUTE ON FUNCTION public.get_shared_report(text) TO anon, authenticated;

-- 3. Tighten consultation_requests insert policy: reject NULL user_id explicitly
DROP POLICY IF EXISTS "Users insert own consultation requests" ON public.consultation_requests;

CREATE POLICY "Users insert own consultation requests"
ON public.consultation_requests
FOR INSERT
TO authenticated
WITH CHECK (user_id IS NOT NULL AND auth.uid() = user_id);
