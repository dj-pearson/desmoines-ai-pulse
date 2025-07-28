-- Create table for domain highlights
CREATE TABLE public.domain_highlights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.domain_highlights ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Admin users can manage domain highlights"
ON public.domain_highlights
FOR ALL
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));

CREATE POLICY "Admin users can view domain highlights"
ON public.domain_highlights
FOR SELECT
USING (user_has_role_or_higher(auth.uid(), 'admin'::user_role));