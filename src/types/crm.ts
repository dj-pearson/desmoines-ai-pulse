// ============================================================================
// CRM Type Definitions
// ============================================================================

// Enums matching database types
export type CrmContactStatus = 'lead' | 'prospect' | 'customer' | 'churned' | 'inactive';
export type CrmContactSource = 'website' | 'referral' | 'social_media' | 'advertising' | 'event' | 'cold_outreach' | 'partnership' | 'organic' | 'other';
export type CrmCommunicationChannel = 'email' | 'phone' | 'sms' | 'in_app' | 'social_media' | 'meeting' | 'live_chat' | 'other';
export type CrmCommunicationDirection = 'inbound' | 'outbound';
export type CrmDealStatus = 'open' | 'won' | 'lost' | 'stalled';
export type CrmActivityType =
  | 'note' | 'call' | 'email' | 'meeting' | 'task'
  | 'deal_created' | 'deal_updated' | 'deal_won' | 'deal_lost'
  | 'status_change' | 'segment_added' | 'segment_removed'
  | 'score_updated' | 'profile_updated' | 'subscription_change'
  | 'login' | 'page_view' | 'event_interaction' | 'restaurant_interaction'
  | 'attraction_interaction' | 'search' | 'favorite' | 'rating' | 'review' | 'share' | 'other';
export type CrmSegmentType = 'static' | 'dynamic';
export type CrmTaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type CrmTaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

// ============================================================================
// Core CRM Types
// ============================================================================

export interface CrmPipelineStage {
  id: string;
  name: string;
  description: string | null;
  stage_order: number;
  color: string;
  is_default: boolean;
  win_probability: number;
  created_at: string;
  updated_at: string;
}

export interface CrmContact {
  id: string;
  user_id: string | null;
  profile_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  company: string | null;
  job_title: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  country: string;
  status: CrmContactStatus;
  source: CrmContactSource;
  lead_score: number;
  lifetime_value: number;
  assigned_to: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  notes: string | null;
  social_profiles: Record<string, string>;
  total_interactions: number;
  last_interaction_at: string | null;
  last_email_opened_at: string | null;
  last_email_clicked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmContactInput {
  user_id?: string | null;
  profile_id?: string | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  company?: string | null;
  job_title?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string;
  status?: CrmContactStatus;
  source?: CrmContactSource;
  lead_score?: number;
  lifetime_value?: number;
  assigned_to?: string | null;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
  notes?: string | null;
  social_profiles?: Record<string, string>;
}

export interface CrmCommunication {
  id: string;
  contact_id: string;
  channel: CrmCommunicationChannel;
  direction: CrmCommunicationDirection;
  subject: string | null;
  content: string | null;
  summary: string | null;
  email_message_id: string | null;
  email_thread_id: string | null;
  email_status: string | null;
  call_duration_seconds: number | null;
  call_recording_url: string | null;
  meeting_url: string | null;
  meeting_attendees: Array<{ name: string; email: string }>;
  meeting_notes: string | null;
  metadata: Record<string, unknown>;
  sent_by: string | null;
  sent_at: string;
  created_at: string;
  updated_at: string;
}

export interface CrmCommunicationInput {
  contact_id: string;
  channel: CrmCommunicationChannel;
  direction: CrmCommunicationDirection;
  subject?: string | null;
  content?: string | null;
  summary?: string | null;
  email_message_id?: string | null;
  email_thread_id?: string | null;
  email_status?: string | null;
  call_duration_seconds?: number | null;
  call_recording_url?: string | null;
  meeting_url?: string | null;
  meeting_attendees?: Array<{ name: string; email: string }>;
  meeting_notes?: string | null;
  metadata?: Record<string, unknown>;
  sent_by?: string | null;
  sent_at?: string;
}

export interface CrmSegment {
  id: string;
  name: string;
  description: string | null;
  segment_type: CrmSegmentType;
  rules: CrmSegmentRules;
  contact_count: number;
  color: string;
  icon: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmSegmentRules {
  operator?: 'AND' | 'OR';
  conditions?: CrmSegmentCondition[];
}

export interface CrmSegmentCondition {
  field: string;
  operator: '=' | '!=' | '>' | '>=' | '<' | '<=' | 'contains' | 'not_contains' | 'in' | 'not_in';
  value: string | number | string[] | number[];
}

export interface CrmSegmentInput {
  name: string;
  description?: string | null;
  segment_type?: CrmSegmentType;
  rules?: CrmSegmentRules;
  color?: string;
  icon?: string;
}

export interface CrmContactSegment {
  id: string;
  contact_id: string;
  segment_id: string;
  added_by: string | null;
  added_at: string;
}

export interface CrmLeadScoreRule {
  id: string;
  name: string;
  description: string | null;
  event_type: string;
  condition: Record<string, unknown>;
  score_change: number;
  max_applications: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CrmLeadScoreHistory {
  id: string;
  contact_id: string;
  rule_id: string | null;
  previous_score: number;
  score_change: number;
  new_score: number;
  reason: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface CrmDeal {
  id: string;
  contact_id: string;
  title: string;
  description: string | null;
  value: number;
  currency: string;
  stage_id: string;
  status: CrmDealStatus;
  probability: number;
  expected_close_date: string | null;
  actual_close_date: string | null;
  assigned_to: string | null;
  close_reason: string | null;
  competitor: string | null;
  tags: string[];
  custom_fields: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CrmDealInput {
  contact_id: string;
  title: string;
  description?: string | null;
  value?: number;
  currency?: string;
  stage_id: string;
  status?: CrmDealStatus;
  probability?: number;
  expected_close_date?: string | null;
  assigned_to?: string | null;
  tags?: string[];
  custom_fields?: Record<string, unknown>;
}

export interface CrmDealStageHistory {
  id: string;
  deal_id: string;
  from_stage_id: string | null;
  to_stage_id: string;
  changed_by: string | null;
  changed_at: string;
}

export interface CrmActivity {
  id: string;
  contact_id: string;
  deal_id: string | null;
  activity_type: CrmActivityType;
  title: string;
  description: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
  performed_by: string | null;
  is_system_generated: boolean;
  performed_at: string;
  created_at: string;
}

export interface CrmActivityInput {
  contact_id: string;
  deal_id?: string | null;
  activity_type: CrmActivityType;
  title: string;
  description?: string | null;
  related_entity_type?: string | null;
  related_entity_id?: string | null;
  metadata?: Record<string, unknown>;
}

export interface CrmNote {
  id: string;
  contact_id: string;
  deal_id: string | null;
  content: string;
  is_pinned: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmNoteInput {
  contact_id: string;
  deal_id?: string | null;
  content: string;
  is_pinned?: boolean;
}

export interface CrmTask {
  id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: CrmTaskPriority;
  status: CrmTaskStatus;
  assigned_to: string | null;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface CrmTaskInput {
  contact_id?: string | null;
  deal_id?: string | null;
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: CrmTaskPriority;
  status?: CrmTaskStatus;
  assigned_to?: string | null;
}

// ============================================================================
// View Types (with joined data)
// ============================================================================

export interface CrmContactSummary extends CrmContact {
  user_role: string | null;
  open_deals_count: number;
  won_deals_count: number;
  total_deal_value: number | null;
  communications_count: number;
  activities_count: number;
  segment_names: string[] | null;
}

export interface CrmDealPipeline extends CrmDeal {
  stage_name: string;
  stage_order: number;
  stage_color: string;
  stage_probability: number;
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  contact_company: string | null;
  assigned_to_email: string | null;
}

export interface CrmActivityFeed extends CrmActivity {
  contact_email: string | null;
  contact_first_name: string | null;
  contact_last_name: string | null;
  performed_by_email: string | null;
}

// ============================================================================
// Filter & Query Types
// ============================================================================

export interface CrmContactFilters {
  search?: string;
  status?: CrmContactStatus | CrmContactStatus[];
  source?: CrmContactSource | CrmContactSource[];
  assigned_to?: string;
  segment_id?: string;
  min_lead_score?: number;
  max_lead_score?: number;
  tags?: string[];
  created_after?: string;
  created_before?: string;
  has_deals?: boolean;
  sort_by?: 'created_at' | 'updated_at' | 'lead_score' | 'first_name' | 'last_name' | 'company';
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface CrmDealFilters {
  search?: string;
  status?: CrmDealStatus | CrmDealStatus[];
  stage_id?: string | string[];
  assigned_to?: string;
  contact_id?: string;
  min_value?: number;
  max_value?: number;
  expected_close_after?: string;
  expected_close_before?: string;
  sort_by?: 'created_at' | 'updated_at' | 'value' | 'expected_close_date' | 'probability';
  sort_order?: 'asc' | 'desc';
  page?: number;
  per_page?: number;
}

export interface CrmCommunicationFilters {
  contact_id?: string;
  channel?: CrmCommunicationChannel | CrmCommunicationChannel[];
  direction?: CrmCommunicationDirection;
  sent_after?: string;
  sent_before?: string;
  sent_by?: string;
  page?: number;
  per_page?: number;
}

export interface CrmActivityFilters {
  contact_id?: string;
  deal_id?: string;
  activity_type?: CrmActivityType | CrmActivityType[];
  performed_by?: string;
  is_system_generated?: boolean;
  after?: string;
  before?: string;
  page?: number;
  per_page?: number;
}

// ============================================================================
// Dashboard & Analytics Types
// ============================================================================

export interface CrmDashboardStats {
  total_contacts: number;
  contacts_by_status: Record<CrmContactStatus, number>;
  contacts_by_source: Record<CrmContactSource, number>;
  new_contacts_this_month: number;
  new_contacts_last_month: number;

  total_deals: number;
  deals_by_status: Record<CrmDealStatus, number>;
  deals_by_stage: Array<{ stage_id: string; stage_name: string; count: number; value: number }>;
  total_pipeline_value: number;
  won_deals_this_month: number;
  won_deals_value_this_month: number;

  average_lead_score: number;
  top_segments: Array<{ segment_id: string; segment_name: string; count: number }>;

  recent_activities: CrmActivityFeed[];
  upcoming_tasks: CrmTask[];
  overdue_tasks: CrmTask[];
}

export interface CrmPipelineMetrics {
  stage_id: string;
  stage_name: string;
  stage_order: number;
  stage_color: string;
  deal_count: number;
  total_value: number;
  average_value: number;
  win_rate: number;
  average_days_in_stage: number;
}

export interface CrmLeadScoreDistribution {
  range: string; // e.g., "0-20", "21-40", etc.
  count: number;
  percentage: number;
}
