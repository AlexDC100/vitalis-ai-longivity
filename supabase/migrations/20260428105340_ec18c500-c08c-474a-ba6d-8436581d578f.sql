ALTER TABLE public.medical_documents
ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_medical_documents_user_reviewed
ON public.medical_documents(user_id, reviewed_at);