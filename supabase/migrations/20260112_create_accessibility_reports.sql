-- Create accessibility_reports table for tracking accessibility issues
CREATE TABLE IF NOT EXISTS public.accessibility_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    url TEXT NOT NULL,
    description TEXT NOT NULL,
    issue_type TEXT NOT NULL CHECK (issue_type IN (
        'keyboard_navigation',
        'screen_reader',
        'color_contrast',
        'text_size',
        'focus_indicator',
        'form_labels',
        'image_alt_text',
        'video_captions',
        'other'
    )),
    assistive_technology TEXT,
    browser TEXT,
    reporter_email TEXT,
    reporter_name TEXT,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
        'new',
        'investigating',
        'resolved',
        'wont_fix'
    )),
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create index for faster queries by status
CREATE INDEX IF NOT EXISTS idx_accessibility_reports_status ON public.accessibility_reports(status);

-- Create index for faster queries by issue type
CREATE INDEX IF NOT EXISTS idx_accessibility_reports_issue_type ON public.accessibility_reports(issue_type);

-- Create index for faster queries by created date
CREATE INDEX IF NOT EXISTS idx_accessibility_reports_created_at ON public.accessibility_reports(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.accessibility_reports ENABLE ROW LEVEL SECURITY;

-- Allow anyone to create reports (public submission)
CREATE POLICY "Anyone can submit accessibility reports"
    ON public.accessibility_reports
    FOR INSERT
    WITH CHECK (true);

-- Only admins can view reports
CREATE POLICY "Admins can view accessibility reports"
    ON public.accessibility_reports
    FOR SELECT
    USING (
        auth.jwt() ->> 'role' = 'admin' OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Only admins can update reports
CREATE POLICY "Admins can update accessibility reports"
    ON public.accessibility_reports
    FOR UPDATE
    USING (
        auth.jwt() ->> 'role' = 'admin' OR
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_accessibility_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_accessibility_reports_updated_at
    BEFORE UPDATE ON public.accessibility_reports
    FOR EACH ROW
    EXECUTE FUNCTION update_accessibility_reports_updated_at();

-- Add comment to table
COMMENT ON TABLE public.accessibility_reports IS 'Stores accessibility issue reports from users for ADA compliance tracking';
