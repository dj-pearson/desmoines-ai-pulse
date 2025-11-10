/**
 * Event Promotion Timeline Generator - Type Definitions
 */

export type EventType =
  | 'concert'
  | 'festival'
  | 'fundraiser'
  | 'sports'
  | 'community'
  | 'business'
  | 'family';

export type BudgetRange = '$0' | '$0-$100' | '$100-$500' | '$500-$1000' | '$1000+';

export type SocialFollowing = '0-500' | '500-2K' | '2K-10K' | '10K+';

export type PromotionChannel =
  | 'social'
  | 'email'
  | 'print'
  | 'radio'
  | 'partnerships'
  | 'seo'
  | 'community'
  | 'paid-ads';

export interface EventFormData {
  eventType: EventType;
  eventDate: Date;
  expectedAttendance: number;
  budget: BudgetRange;
  socialFollowing: SocialFollowing;
  eventName?: string;
  organizationName?: string;
}

export interface TimelineTask {
  id: string;
  week: number;
  daysOut: number;
  title: string;
  description: string;
  channel: PromotionChannel;
  completed: boolean;
  priority: 'high' | 'medium' | 'low';
  estimatedTime: string;
}

export interface WeeklyMilestone {
  week: number;
  daysOut: number;
  title: string;
  description: string;
  tasks: TimelineTask[];
  ticketSalesGoal?: string;
}

export interface ChannelRecommendation {
  channel: PromotionChannel;
  priority: number;
  budgetAllocation: number;
  reasoning: string;
  postingFrequency: string;
  platforms?: string[];
}

export interface BudgetAllocation {
  channel: PromotionChannel;
  amount: number;
  percentage: number;
  description: string;
}

export interface PromotionTimeline {
  eventData: EventFormData;
  weeks: WeeklyMilestone[];
  channels: ChannelRecommendation[];
  budget: BudgetAllocation[];
  totalWeeks: number;
  startDate: Date;
  unlocked: boolean;
}

export interface EmailCaptureData {
  email: string;
  eventName?: string;
  organizationName?: string;
  eventType: EventType;
  eventDate: Date;
  sendReminders: boolean;
  referralCode?: string;
}

export interface AnalyticsEvent {
  eventType:
    | 'tool_started'
    | 'wizard_step_completed'
    | 'timeline_generated'
    | 'email_captured'
    | 'pdf_downloaded'
    | 'timeline_task_checked'
    | 'social_shared'
    | 'listing_clicked'
    | 'referral_generated';
  data?: Record<string, any>;
  timestamp: Date;
}

export interface ReferralData {
  code: string;
  referrerEmail: string;
  referredEmail?: string;
  used: boolean;
  createdAt: Date;
}
