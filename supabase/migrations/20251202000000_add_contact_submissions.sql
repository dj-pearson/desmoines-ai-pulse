-- Contact Submissions Table
-- Centralized lead capture and contact form system

-- Create contact_submissions table
CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Contact information
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,

  -- Submission details
  subject TEXT,
  message TEXT NOT NULL,
  inquiry_type TEXT NOT NULL DEFAULT 'general', -- general, support, feedback, business, advertising, partnership, other

  -- Source tracking
  source_page TEXT, -- which page the form was submitted from
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referrer TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'new', -- new, read, in_progress, responded, closed, spam
  priority TEXT DEFAULT 'normal', -- low, normal, high, urgent

  -- Admin handling
  assigned_to UUID REFERENCES auth.users(id),
  admin_notes TEXT,
  responded_at TIMESTAMPTZ,

  -- Optional user link
  user_id UUID REFERENCES auth.users(id),

  -- Metadata
  ip_address INET,
  user_agent TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_contact_submissions_email ON contact_submissions(email);
CREATE INDEX idx_contact_submissions_status ON contact_submissions(status);
CREATE INDEX idx_contact_submissions_inquiry_type ON contact_submissions(inquiry_type);
CREATE INDEX idx_contact_submissions_created_at ON contact_submissions(created_at DESC);
CREATE INDEX idx_contact_submissions_priority ON contact_submissions(priority);

-- Enable RLS
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;

-- Policies:
-- 1. Anyone can insert (submit contact form) - no auth required
CREATE POLICY "Anyone can submit contact form" ON contact_submissions
  FOR INSERT WITH CHECK (true);

-- 2. Authenticated users can view their own submissions
CREATE POLICY "Users can view own submissions" ON contact_submissions
  FOR SELECT USING (auth.uid() = user_id);

-- 3. Admins can view all submissions
CREATE POLICY "Admins can view all submissions" ON contact_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- 4. Admins can update submissions
CREATE POLICY "Admins can update submissions" ON contact_submissions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contact_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_contact_submissions_updated_at
  BEFORE UPDATE ON contact_submissions
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_submissions_updated_at();

-- Add helpful comments
COMMENT ON TABLE contact_submissions IS 'Centralized lead capture and contact form submissions';
COMMENT ON COLUMN contact_submissions.inquiry_type IS 'Type of inquiry: general, support, feedback, business, advertising, partnership, other';
COMMENT ON COLUMN contact_submissions.status IS 'Submission status: new, read, in_progress, responded, closed, spam';
COMMENT ON COLUMN contact_submissions.priority IS 'Priority level: low, normal, high, urgent';
