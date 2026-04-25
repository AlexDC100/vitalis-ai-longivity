-- Sensitive medical data: substances (meds, supplements, PEDs, etc.)
CREATE TABLE public.user_substances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  dose TEXT,
  frequency TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_substances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own substances"
ON public.user_substances FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own substances"
ON public.user_substances FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own substances"
ON public.user_substances FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own substances"
ON public.user_substances FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_user_substances_user_id ON public.user_substances(user_id);

CREATE TRIGGER update_user_substances_updated_at
BEFORE UPDATE ON public.user_substances
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Sensitive medical data: family history (conditions affecting blood relatives)
CREATE TABLE public.user_family_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  condition TEXT NOT NULL,
  relatives TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_family_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own family history"
ON public.user_family_history FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create own family history"
ON public.user_family_history FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own family history"
ON public.user_family_history FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own family history"
ON public.user_family_history FOR DELETE
USING (auth.uid() = user_id);

CREATE INDEX idx_user_family_history_user_id ON public.user_family_history(user_id);

CREATE TRIGGER update_user_family_history_updated_at
BEFORE UPDATE ON public.user_family_history
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();