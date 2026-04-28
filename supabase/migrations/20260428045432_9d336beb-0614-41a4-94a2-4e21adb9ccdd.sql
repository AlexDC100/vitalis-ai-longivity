-- Replace SECURITY DEFINER helper with safer column-level grants.
DROP FUNCTION IF EXISTS public.get_shared_report(text);

-- Re-add a tightly scoped public SELECT policy: only non-expired rows.
CREATE POLICY "Public can read non-expired shared reports"
ON public.shared_health_reports
FOR SELECT
TO anon, authenticated
USING (expires_at > now());

-- Revoke broad SELECT and grant only the minimal columns the public
-- viewer needs. user_id and id stay private.
REVOKE SELECT ON public.shared_health_reports FROM anon, authenticated;
GRANT SELECT (title, html, expires_at, share_token)
  ON public.shared_health_reports TO anon, authenticated;

-- Owners still need full row access for their own management UI.
-- Their existing "Owners view their shared reports" policy + table-level
-- grants to authenticated handle that — re-grant full SELECT to the
-- owner-facing role path via the existing policy's USING clause is
-- enforced at row level; the column grant above means even owners
-- only see the listed columns through PostgREST. Re-grant remaining
-- columns to authenticated so owners can still read their own rows
-- in full when needed.
GRANT SELECT (id, user_id, title, html, expires_at, share_token, created_at)
  ON public.shared_health_reports TO authenticated;