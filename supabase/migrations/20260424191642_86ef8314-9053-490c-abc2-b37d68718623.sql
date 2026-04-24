CREATE POLICY "Users can update own medical documents storage"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'medical-documents' AND (auth.uid())::text = (storage.foldername(name))[1])
WITH CHECK (bucket_id = 'medical-documents' AND (auth.uid())::text = (storage.foldername(name))[1]);