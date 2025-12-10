-- ============================================================================
-- CRM Infrastructure Migration
-- Created: 2025-12-09
-- Description: Comprehensive CRM system for Des Moines AI Pulse
-- Features: Contacts, Communication History, Segmentation, Lead Scoring,
--           Sales Pipeline, Activity Timeline
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Contact status enum
CREATE TYPE crm_contact_status AS ENUM (
  'lead',
  'prospect',
  'customer',
  'churned',
  'inactive'
);

-- Contact source enum
CREATE TYPE crm_contact_source AS ENUM (
  'website',
  'referral',
  'social_media',
  'advertising',
  'event',
  'cold_outreach',
  'partnership',
  'organic',
  'other'
);

-- Communication channel enum
CREATE TYPE crm_communication_channel AS ENUM (
  'email',
  'phone',
  'sms',
  'in_app',
  'social_media',
  'meeting',
  'live_chat',
  'other'
);

-- Communication direction enum
CREATE TYPE crm_communication_direction AS ENUM (
  'inbound',
  'outbound'
);

-- Deal status enum
CREATE TYPE crm_deal_status AS ENUM (
  'open',
  'won',
  'lost',
  'stalled'
);

-- Activity type enum
CREATE TYPE crm_activity_type AS ENUM (
  'note',
  'call',
  'email',
  'meeting',
  'task',
  'deal_created',
  'deal_updated',
  'deal_won',
  'deal_lost',
  'status_change',
  'segment_added',
  'segment_removed',
  'score_updated',
  'profile_updated',
  'subscription_change',
  'login',
  'page_view',
  'event_interaction',
  'restaurant_interaction',
  'attraction_interaction',
  'search',
  'favorite',
  'rating',
  'review',
  'share',
  'other'
);

-- Segment type enum
CREATE TYPE crm_segment_type AS ENUM (
  'static',
  'dynamic'
);

-- ============================================================================
-- CORE CRM TABLES
-- ============================================================================

-- Pipeline Stages (configurable sales pipeline)
CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  stage_order INTEGER NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#6366f1',
  is_default BOOLEAN DEFAULT false,
  win_probability INTEGER DEFAULT 0 CHECK (win_probability >= 0 AND win_probability <= 100),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create default pipeline stages
INSERT INTO crm_pipeline_stages (name, description, stage_order, color, is_default, win_probability) VALUES
  ('Lead', 'Initial contact or inquiry', 1, '#6b7280', true, 10),
  ('Qualified', 'Lead has been qualified as a potential customer', 2, '#3b82f6', false, 25),
  ('Proposal', 'Proposal or quote sent', 3, '#8b5cf6', false, 50),
  ('Negotiation', 'In active negotiation', 4, '#f59e0b', false, 75),
  ('Closed Won', 'Deal successfully closed', 5, '#22c55e', false, 100),
  ('Closed Lost', 'Deal lost or abandoned', 6, '#ef4444', false, 0)
ON CONFLICT DO NOTHING;

-- CRM Contacts (unified contact record)
CREATE TABLE IF NOT EXISTS crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Link to existing user if applicable
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,

  -- Contact information
  email TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  company TEXT,
  job_title TEXT,

  -- Location
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'USA',

  -- CRM specific
  status crm_contact_status DEFAULT 'lead',
  source crm_contact_source DEFAULT 'website',
  lead_score INTEGER DEFAULT 0 CHECK (lead_score >= 0 AND lead_score <= 100),
  lifetime_value DECIMAL(12,2) DEFAULT 0,

  -- Owner/Assignment
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Additional data
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',
  notes TEXT,

  -- Social profiles
  social_profiles JSONB DEFAULT '{}',

  -- Engagement metrics (cached for performance)
  total_interactions INTEGER DEFAULT 0,
  last_interaction_at TIMESTAMPTZ,
  last_email_opened_at TIMESTAMPTZ,
  last_email_clicked_at TIMESTAMPTZ,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_email CHECK (email IS NULL OR email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_crm_contacts_email ON crm_contacts(email);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_user_id ON crm_contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts(status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_source ON crm_contacts(source);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_assigned_to ON crm_contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_lead_score ON crm_contacts(lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_created_at ON crm_contacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tags ON crm_contacts USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_search ON crm_contacts USING GIN(
  to_tsvector('english', coalesce(first_name, '') || ' ' || coalesce(last_name, '') || ' ' || coalesce(email, '') || ' ' || coalesce(company, ''))
);

-- ============================================================================
-- COMMUNICATION HISTORY
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,

  -- Communication details
  channel crm_communication_channel NOT NULL,
  direction crm_communication_direction NOT NULL,
  subject TEXT,
  content TEXT,
  summary TEXT, -- AI-generated summary

  -- Email specific
  email_message_id TEXT, -- External email ID for threading
  email_thread_id TEXT,
  email_status TEXT, -- sent, delivered, opened, clicked, bounced

  -- Call specific
  call_duration_seconds INTEGER,
  call_recording_url TEXT,

  -- Meeting specific
  meeting_url TEXT,
  meeting_attendees JSONB DEFAULT '[]',
  meeting_notes TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Tracking
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_at TIMESTAMPTZ DEFAULT now(),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_communications_contact_id ON crm_communications(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_communications_channel ON crm_communications(channel);
CREATE INDEX IF NOT EXISTS idx_crm_communications_sent_at ON crm_communications(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_communications_email_thread ON crm_communications(email_thread_id);

-- ============================================================================
-- CUSTOMER SEGMENTATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  segment_type crm_segment_type DEFAULT 'static',

  -- Dynamic segment rules (for auto-population)
  rules JSONB DEFAULT '{}',
  -- Example rules structure:
  -- {
  --   "operator": "AND",
  --   "conditions": [
  --     { "field": "lead_score", "operator": ">=", "value": 50 },
  --     { "field": "status", "operator": "=", "value": "customer" }
  --   ]
  -- }

  -- Cached count for performance
  contact_count INTEGER DEFAULT 0,

  -- Visual
  color TEXT DEFAULT '#6366f1',
  icon TEXT DEFAULT 'users',

  -- Ownership
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_segments_name ON crm_segments(name);
CREATE INDEX IF NOT EXISTS idx_crm_segments_type ON crm_segments(segment_type);

-- Contact-Segment junction table (for static segments)
CREATE TABLE IF NOT EXISTS crm_contact_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  segment_id UUID NOT NULL REFERENCES crm_segments(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(contact_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_contact_segments_contact ON crm_contact_segments(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_contact_segments_segment ON crm_contact_segments(segment_id);

-- ============================================================================
-- LEAD SCORING
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_lead_score_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Rule definition
  event_type TEXT NOT NULL, -- e.g., 'page_view', 'email_open', 'form_submit'
  condition JSONB DEFAULT '{}',
  -- Example: { "page_path": "/pricing" } or { "email_campaign": "newsletter" }

  score_change INTEGER NOT NULL, -- Can be positive or negative
  max_applications INTEGER, -- Limit how many times this rule can be applied

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create default lead scoring rules
INSERT INTO crm_lead_score_rules (name, description, event_type, condition, score_change, is_active) VALUES
  ('Website Visit', 'Points for visiting the website', 'page_view', '{}', 1, true),
  ('Event Page View', 'Points for viewing event details', 'page_view', '{"page_type": "event"}', 2, true),
  ('Restaurant Page View', 'Points for viewing restaurant details', 'page_view', '{"page_type": "restaurant"}', 2, true),
  ('Added Favorite', 'Points for favoriting content', 'favorite', '{}', 5, true),
  ('Left Rating', 'Points for rating content', 'rating', '{}', 10, true),
  ('Left Review', 'Points for writing a review', 'review', '{}', 15, true),
  ('Email Open', 'Points for opening email', 'email_open', '{}', 3, true),
  ('Email Click', 'Points for clicking email link', 'email_click', '{}', 5, true),
  ('Search Performed', 'Points for using search', 'search', '{}', 2, true),
  ('Trip Planner Use', 'Points for using AI trip planner', 'feature_use', '{"feature": "trip_planner"}', 10, true),
  ('Subscription Upgrade', 'Points for upgrading subscription', 'subscription_change', '{"direction": "upgrade"}', 25, true),
  ('Profile Complete', 'Points for completing profile', 'profile_complete', '{}', 15, true),
  ('Inactive 30 Days', 'Penalty for inactivity', 'inactivity', '{"days": 30}', -10, true),
  ('Inactive 60 Days', 'Penalty for longer inactivity', 'inactivity', '{"days": 60}', -20, true)
ON CONFLICT DO NOTHING;

-- Lead score history (audit trail)
CREATE TABLE IF NOT EXISTS crm_lead_score_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES crm_lead_score_rules(id) ON DELETE SET NULL,

  previous_score INTEGER NOT NULL,
  score_change INTEGER NOT NULL,
  new_score INTEGER NOT NULL,

  reason TEXT,
  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_score_history_contact ON crm_lead_score_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_lead_score_history_created ON crm_lead_score_history(created_at DESC);

-- ============================================================================
-- SALES PIPELINE / DEALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,

  -- Deal info
  title TEXT NOT NULL,
  description TEXT,
  value DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',

  -- Pipeline
  stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE RESTRICT,
  status crm_deal_status DEFAULT 'open',

  -- Probability and forecasting
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  actual_close_date DATE,

  -- Ownership
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Loss/Win reason
  close_reason TEXT,
  competitor TEXT,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  custom_fields JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_deals_contact_id ON crm_deals(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage_id ON crm_deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_status ON crm_deals(status);
CREATE INDEX IF NOT EXISTS idx_crm_deals_assigned_to ON crm_deals(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_deals_expected_close ON crm_deals(expected_close_date);
CREATE INDEX IF NOT EXISTS idx_crm_deals_value ON crm_deals(value DESC);

-- Deal stage history (for pipeline velocity tracking)
CREATE TABLE IF NOT EXISTS crm_deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES crm_deals(id) ON DELETE CASCADE,

  from_stage_id UUID REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL,
  to_stage_id UUID NOT NULL REFERENCES crm_pipeline_stages(id) ON DELETE CASCADE,

  changed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_deal_stage_history_deal ON crm_deal_stage_history(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_stage_history_changed ON crm_deal_stage_history(changed_at DESC);

-- ============================================================================
-- ACTIVITY TIMELINE
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,

  -- Activity details
  activity_type crm_activity_type NOT NULL,
  title TEXT NOT NULL,
  description TEXT,

  -- Reference to related entities
  related_entity_type TEXT, -- 'event', 'restaurant', 'attraction', 'email', etc.
  related_entity_id TEXT,

  -- Metadata
  metadata JSONB DEFAULT '{}',

  -- Who performed the activity
  performed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  is_system_generated BOOLEAN DEFAULT false,

  -- Timestamps
  performed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_activities_contact_id ON crm_activities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_deal_id ON crm_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_activities_type ON crm_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_crm_activities_performed_at ON crm_activities(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_activities_related ON crm_activities(related_entity_type, related_entity_id);

-- ============================================================================
-- CRM NOTES
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES crm_contacts(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,

  content TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,

  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_contact_id ON crm_notes(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_deal_id ON crm_notes(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_notes_pinned ON crm_notes(is_pinned, created_at DESC);

-- ============================================================================
-- CRM TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  deal_id UUID REFERENCES crm_deals(id) ON DELETE SET NULL,

  title TEXT NOT NULL,
  description TEXT,

  due_date TIMESTAMPTZ,
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),

  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_contact_id ON crm_tasks(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_deal_id ON crm_tasks(deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assigned_to ON crm_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_due_date ON crm_tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_crm_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers to all CRM tables
CREATE TRIGGER update_crm_contacts_updated_at
  BEFORE UPDATE ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

CREATE TRIGGER update_crm_communications_updated_at
  BEFORE UPDATE ON crm_communications
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

CREATE TRIGGER update_crm_segments_updated_at
  BEFORE UPDATE ON crm_segments
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

CREATE TRIGGER update_crm_deals_updated_at
  BEFORE UPDATE ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

CREATE TRIGGER update_crm_notes_updated_at
  BEFORE UPDATE ON crm_notes
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

CREATE TRIGGER update_crm_tasks_updated_at
  BEFORE UPDATE ON crm_tasks
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

CREATE TRIGGER update_crm_pipeline_stages_updated_at
  BEFORE UPDATE ON crm_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

CREATE TRIGGER update_crm_lead_score_rules_updated_at
  BEFORE UPDATE ON crm_lead_score_rules
  FOR EACH ROW EXECUTE FUNCTION update_crm_updated_at();

-- Update contact interaction count
CREATE OR REPLACE FUNCTION update_contact_interaction_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE crm_contacts
    SET total_interactions = total_interactions + 1,
        last_interaction_at = now()
    WHERE id = NEW.contact_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE crm_contacts
    SET total_interactions = GREATEST(0, total_interactions - 1)
    WHERE id = OLD.contact_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_contact_communications_count
  AFTER INSERT OR DELETE ON crm_communications
  FOR EACH ROW EXECUTE FUNCTION update_contact_interaction_count();

-- Update segment contact count
CREATE OR REPLACE FUNCTION update_segment_contact_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE crm_segments SET contact_count = contact_count + 1 WHERE id = NEW.segment_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE crm_segments SET contact_count = GREATEST(0, contact_count - 1) WHERE id = OLD.segment_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_segment_count
  AFTER INSERT OR DELETE ON crm_contact_segments
  FOR EACH ROW EXECUTE FUNCTION update_segment_contact_count();

-- Track deal stage changes
CREATE OR REPLACE FUNCTION track_deal_stage_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    INSERT INTO crm_deal_stage_history (deal_id, from_stage_id, to_stage_id)
    VALUES (NEW.id, OLD.stage_id, NEW.stage_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_deal_stage
  AFTER UPDATE OF stage_id ON crm_deals
  FOR EACH ROW EXECUTE FUNCTION track_deal_stage_change();

-- Record lead score changes
CREATE OR REPLACE FUNCTION track_lead_score_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.lead_score IS DISTINCT FROM NEW.lead_score THEN
    INSERT INTO crm_lead_score_history (contact_id, previous_score, score_change, new_score, reason)
    VALUES (NEW.id, OLD.lead_score, NEW.lead_score - OLD.lead_score, NEW.lead_score, 'Manual update');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER track_lead_score
  AFTER UPDATE OF lead_score ON crm_contacts
  FOR EACH ROW EXECUTE FUNCTION track_lead_score_change();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contact_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_score_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_lead_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_deal_stage_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_tasks ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user is admin or moderator
CREATE OR REPLACE FUNCTION is_crm_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND user_role IN ('admin', 'root_admin', 'moderator')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pipeline Stages: Readable by all authenticated, writable by admins
CREATE POLICY "Pipeline stages readable by authenticated users"
  ON crm_pipeline_stages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Pipeline stages writable by admins"
  ON crm_pipeline_stages FOR ALL
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());

-- Contacts: Admins can access all, users can see their own contact record
CREATE POLICY "Contacts accessible by admins"
  ON crm_contacts FOR ALL
  TO authenticated
  USING (is_crm_admin() OR user_id = auth.uid())
  WITH CHECK (is_crm_admin());

-- Communications: Admin access only
CREATE POLICY "Communications accessible by admins"
  ON crm_communications FOR ALL
  TO authenticated
  USING (is_crm_admin() OR EXISTS (
    SELECT 1 FROM crm_contacts WHERE id = crm_communications.contact_id AND user_id = auth.uid()
  ))
  WITH CHECK (is_crm_admin());

-- Segments: Admin access only
CREATE POLICY "Segments accessible by admins"
  ON crm_segments FOR ALL
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());

CREATE POLICY "Contact segments accessible by admins"
  ON crm_contact_segments FOR ALL
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());

-- Lead Score Rules: Readable by all, writable by admins
CREATE POLICY "Lead score rules readable by authenticated"
  ON crm_lead_score_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Lead score rules writable by admins"
  ON crm_lead_score_rules FOR ALL
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());

-- Lead Score History: Admin access only
CREATE POLICY "Lead score history accessible by admins"
  ON crm_lead_score_history FOR ALL
  TO authenticated
  USING (is_crm_admin() OR EXISTS (
    SELECT 1 FROM crm_contacts WHERE id = crm_lead_score_history.contact_id AND user_id = auth.uid()
  ))
  WITH CHECK (is_crm_admin());

-- Deals: Admin access only
CREATE POLICY "Deals accessible by admins"
  ON crm_deals FOR ALL
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());

CREATE POLICY "Deal stage history accessible by admins"
  ON crm_deal_stage_history FOR ALL
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());

-- Activities: Users can see their own, admins can see all
CREATE POLICY "Activities accessible by admins and owners"
  ON crm_activities FOR ALL
  TO authenticated
  USING (is_crm_admin() OR EXISTS (
    SELECT 1 FROM crm_contacts WHERE id = crm_activities.contact_id AND user_id = auth.uid()
  ))
  WITH CHECK (is_crm_admin());

-- Notes: Admin access only
CREATE POLICY "Notes accessible by admins"
  ON crm_notes FOR ALL
  TO authenticated
  USING (is_crm_admin())
  WITH CHECK (is_crm_admin());

-- Tasks: Admins and assigned users
CREATE POLICY "Tasks accessible by admins and assigned users"
  ON crm_tasks FOR ALL
  TO authenticated
  USING (is_crm_admin() OR assigned_to = auth.uid() OR created_by = auth.uid())
  WITH CHECK (is_crm_admin() OR assigned_to = auth.uid() OR created_by = auth.uid());

-- ============================================================================
-- FUNCTIONS FOR CRM OPERATIONS
-- ============================================================================

-- Function to sync user to CRM contact
CREATE OR REPLACE FUNCTION sync_user_to_crm_contact(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_contact_id UUID;
  v_profile RECORD;
BEGIN
  -- Get profile data
  SELECT * INTO v_profile FROM profiles WHERE id = p_user_id;

  IF v_profile IS NULL THEN
    RETURN NULL;
  END IF;

  -- Check if contact exists
  SELECT id INTO v_contact_id FROM crm_contacts WHERE user_id = p_user_id;

  IF v_contact_id IS NOT NULL THEN
    -- Update existing contact
    UPDATE crm_contacts SET
      email = v_profile.email,
      first_name = v_profile.first_name,
      last_name = v_profile.last_name,
      phone = v_profile.phone,
      profile_id = v_profile.id,
      updated_at = now()
    WHERE id = v_contact_id;
  ELSE
    -- Create new contact
    INSERT INTO crm_contacts (user_id, profile_id, email, first_name, last_name, phone, source, status)
    VALUES (p_user_id, v_profile.id, v_profile.email, v_profile.first_name, v_profile.last_name, v_profile.phone, 'website', 'lead')
    RETURNING id INTO v_contact_id;
  END IF;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update lead score
CREATE OR REPLACE FUNCTION update_lead_score(
  p_contact_id UUID,
  p_score_change INTEGER,
  p_rule_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_current_score INTEGER;
  v_new_score INTEGER;
BEGIN
  SELECT lead_score INTO v_current_score FROM crm_contacts WHERE id = p_contact_id;

  IF v_current_score IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate new score (bounded 0-100)
  v_new_score := GREATEST(0, LEAST(100, v_current_score + p_score_change));

  -- Update contact score
  UPDATE crm_contacts SET lead_score = v_new_score WHERE id = p_contact_id;

  -- Record in history
  INSERT INTO crm_lead_score_history (contact_id, rule_id, previous_score, score_change, new_score, reason)
  VALUES (p_contact_id, p_rule_id, v_current_score, p_score_change, v_new_score, p_reason);

  RETURN v_new_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to add activity
CREATE OR REPLACE FUNCTION add_crm_activity(
  p_contact_id UUID,
  p_activity_type crm_activity_type,
  p_title TEXT,
  p_description TEXT DEFAULT NULL,
  p_deal_id UUID DEFAULT NULL,
  p_related_entity_type TEXT DEFAULT NULL,
  p_related_entity_id TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_activity_id UUID;
BEGIN
  INSERT INTO crm_activities (
    contact_id, deal_id, activity_type, title, description,
    related_entity_type, related_entity_id, metadata,
    performed_by, is_system_generated
  ) VALUES (
    p_contact_id, p_deal_id, p_activity_type, p_title, p_description,
    p_related_entity_type, p_related_entity_id, p_metadata,
    auth.uid(), auth.uid() IS NULL
  )
  RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to evaluate dynamic segment rules
CREATE OR REPLACE FUNCTION evaluate_segment_rules(p_segment_id UUID)
RETURNS TABLE(contact_id UUID) AS $$
DECLARE
  v_rules JSONB;
BEGIN
  SELECT rules INTO v_rules FROM crm_segments WHERE id = p_segment_id;

  -- Basic implementation - can be extended for complex rules
  RETURN QUERY
  SELECT c.id FROM crm_contacts c
  WHERE
    -- Lead score condition
    (v_rules->'conditions' IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_rules->'conditions') cond
      WHERE cond->>'field' = 'lead_score'
    ) OR c.lead_score >= COALESCE((
      SELECT (cond->>'value')::INTEGER
      FROM jsonb_array_elements(v_rules->'conditions') cond
      WHERE cond->>'field' = 'lead_score' AND cond->>'operator' = '>='
      LIMIT 1
    ), 0))
    AND
    -- Status condition
    (v_rules->'conditions' IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_rules->'conditions') cond
      WHERE cond->>'field' = 'status'
    ) OR c.status::TEXT = COALESCE((
      SELECT cond->>'value'
      FROM jsonb_array_elements(v_rules->'conditions') cond
      WHERE cond->>'field' = 'status' AND cond->>'operator' = '='
      LIMIT 1
    ), c.status::TEXT))
    AND
    -- Source condition
    (v_rules->'conditions' IS NULL OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_rules->'conditions') cond
      WHERE cond->>'field' = 'source'
    ) OR c.source::TEXT = COALESCE((
      SELECT cond->>'value'
      FROM jsonb_array_elements(v_rules->'conditions') cond
      WHERE cond->>'field' = 'source' AND cond->>'operator' = '='
      LIMIT 1
    ), c.source::TEXT));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Contact summary view with aggregated data
CREATE OR REPLACE VIEW crm_contact_summary AS
SELECT
  c.*,
  p.user_role,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'open') as open_deals_count,
  COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'won') as won_deals_count,
  SUM(d.value) FILTER (WHERE d.status = 'won') as total_deal_value,
  COUNT(DISTINCT cm.id) as communications_count,
  COUNT(DISTINCT a.id) as activities_count,
  array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) as segment_names
FROM crm_contacts c
LEFT JOIN profiles p ON c.profile_id = p.id
LEFT JOIN crm_deals d ON c.id = d.contact_id
LEFT JOIN crm_communications cm ON c.id = cm.contact_id
LEFT JOIN crm_activities a ON c.id = a.contact_id
LEFT JOIN crm_contact_segments cs ON c.id = cs.contact_id
LEFT JOIN crm_segments s ON cs.segment_id = s.id
GROUP BY c.id, p.user_role;

-- Deal pipeline view
CREATE OR REPLACE VIEW crm_deal_pipeline AS
SELECT
  d.*,
  ps.name as stage_name,
  ps.stage_order,
  ps.color as stage_color,
  ps.win_probability as stage_probability,
  c.email as contact_email,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  c.company as contact_company,
  u.email as assigned_to_email
FROM crm_deals d
JOIN crm_pipeline_stages ps ON d.stage_id = ps.id
JOIN crm_contacts c ON d.contact_id = c.id
LEFT JOIN auth.users u ON d.assigned_to = u.id;

-- Activity feed view
CREATE OR REPLACE VIEW crm_activity_feed AS
SELECT
  a.*,
  c.email as contact_email,
  c.first_name as contact_first_name,
  c.last_name as contact_last_name,
  u.email as performed_by_email
FROM crm_activities a
JOIN crm_contacts c ON a.contact_id = c.id
LEFT JOIN auth.users u ON a.performed_by = u.id
ORDER BY a.performed_at DESC;

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE crm_contacts IS 'Central CRM contact records - may or may not be linked to registered users';
COMMENT ON TABLE crm_communications IS 'History of all communications with contacts (emails, calls, meetings)';
COMMENT ON TABLE crm_segments IS 'Customer segments for grouping and targeting';
COMMENT ON TABLE crm_deals IS 'Sales opportunities and deals in the pipeline';
COMMENT ON TABLE crm_activities IS 'Timeline of all activities related to contacts';
COMMENT ON TABLE crm_tasks IS 'Tasks and follow-ups for CRM users';
COMMENT ON TABLE crm_notes IS 'Internal notes on contacts and deals';
COMMENT ON TABLE crm_lead_score_rules IS 'Rules for automatic lead scoring';
COMMENT ON TABLE crm_pipeline_stages IS 'Configurable sales pipeline stages';

COMMENT ON FUNCTION sync_user_to_crm_contact IS 'Syncs a user profile to a CRM contact record';
COMMENT ON FUNCTION update_lead_score IS 'Updates lead score with history tracking';
COMMENT ON FUNCTION add_crm_activity IS 'Adds an activity to a contact timeline';
