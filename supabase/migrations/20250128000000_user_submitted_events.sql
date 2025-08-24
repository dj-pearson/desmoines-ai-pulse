-- Create user_submitted_events table for user event submissions
CREATE TABLE public.user_submitted_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  date timestamp with time zone,
  start_time text,
  end_time text,
  venue text,
  location text,
  address text,
  price text,
  category text,
  website_url text,
  contact_email text,
  contact_phone text,
  image_url text,
  tags text[],
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision')),
  admin_notes text,
  admin_reviewed_by uuid REFERENCES auth.users(id),
  admin_reviewed_at timestamp with time zone,
  submitted_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_submitted_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view own submissions"
ON public.user_submitted_events
FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own submissions
CREATE POLICY "Users can insert own submissions"
ON public.user_submitted_events
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending submissions
CREATE POLICY "Users can update own pending submissions"
ON public.user_submitted_events
FOR UPDATE
USING (auth.uid() = user_id AND status = 'pending');

-- Admins can view all submissions
CREATE POLICY "Admins can view all submissions"
ON public.user_submitted_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'root_admin')
  )
);

-- Admins can update all submissions (for approval/rejection)
CREATE POLICY "Admins can update all submissions"
ON public.user_submitted_events
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('admin', 'root_admin')
  )
);

-- Create updated_at trigger
CREATE TRIGGER update_user_submitted_events_updated_at
BEFORE UPDATE ON public.user_submitted_events
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_user_submitted_events_user_id ON public.user_submitted_events(user_id);
CREATE INDEX idx_user_submitted_events_status ON public.user_submitted_events(status);
CREATE INDEX idx_user_submitted_events_submitted_at ON public.user_submitted_events(submitted_at);
CREATE INDEX idx_user_submitted_events_date ON public.user_submitted_events(date);
