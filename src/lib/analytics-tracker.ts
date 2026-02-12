/**
 * Analytics Tracking for Event Promotion Planner
 * Tracks user interactions and conversions
 */

import type { AnalyticsEvent } from '@/types/event-promotion';
import { createLogger } from '@/lib/logger';

const log = createLogger('AnalyticsTracker');

/**
 * Track an analytics event
 */
export function trackEvent(event: AnalyticsEvent): void {
  // Store event locally
  const events = getStoredEvents();
  events.push(event);

  try {
    localStorage.setItem('epp_analytics', JSON.stringify(events));
  } catch (error) {
    log.error('Failed to store analytics event', { action: 'store_event', metadata: { error } });
  }

  // Send to analytics service (implement as needed)
  sendToAnalytics(event);
}

/**
 * Track tool started
 */
export function trackToolStarted(): void {
  trackEvent({
    eventType: 'tool_started',
    timestamp: new Date(),
  });
}

/**
 * Track wizard step completed
 */
export function trackWizardStep(step: number, data?: Record<string, any>): void {
  trackEvent({
    eventType: 'wizard_step_completed',
    data: { step, ...data },
    timestamp: new Date(),
  });
}

/**
 * Track timeline generated
 */
export function trackTimelineGenerated(eventType: string, eventDate: Date): void {
  trackEvent({
    eventType: 'timeline_generated',
    data: { eventType, eventDate: eventDate.toISOString() },
    timestamp: new Date(),
  });
}

/**
 * Track email captured
 */
export function trackEmailCaptured(email: string, sendReminders: boolean): void {
  trackEvent({
    eventType: 'email_captured',
    data: { emailHash: hashEmail(email), sendReminders },
    timestamp: new Date(),
  });
}

/**
 * Track PDF downloaded
 */
export function trackPDFDownloaded(unlocked: boolean): void {
  trackEvent({
    eventType: 'pdf_downloaded',
    data: { unlocked },
    timestamp: new Date(),
  });
}

/**
 * Track timeline task checked
 */
export function trackTaskChecked(taskId: string, completed: boolean): void {
  trackEvent({
    eventType: 'timeline_task_checked',
    data: { taskId, completed },
    timestamp: new Date(),
  });
}

/**
 * Track social share
 */
export function trackSocialShare(platform: string): void {
  trackEvent({
    eventType: 'social_shared',
    data: { platform },
    timestamp: new Date(),
  });
}

/**
 * Track listing CTA clicked
 */
export function trackListingClicked(source: string): void {
  trackEvent({
    eventType: 'listing_clicked',
    data: { source },
    timestamp: new Date(),
  });
}

/**
 * Track referral code generated
 */
export function trackReferralGenerated(code: string): void {
  trackEvent({
    eventType: 'referral_generated',
    data: { code },
    timestamp: new Date(),
  });
}

/**
 * Get stored analytics events
 */
function getStoredEvents(): AnalyticsEvent[] {
  try {
    const stored = localStorage.getItem('epp_analytics');
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    log.error('Failed to retrieve analytics events', { action: 'retrieve_events', metadata: { error } });
    return [];
  }
}

/**
 * Send event to analytics service
 */
function sendToAnalytics(event: AnalyticsEvent): void {
  // Implement integration with your analytics service
  // Examples: Google Analytics, Mixpanel, Segment, etc.

  // For Google Analytics 4:
  if (typeof window !== 'undefined' && (window as any).gtag) {
    (window as any).gtag('event', event.eventType, {
      ...event.data,
      timestamp: event.timestamp.toISOString(),
    });
  }

  // Log in development (logger handles dev/prod filtering)
  log.debug('Analytics Event', { action: 'send', metadata: { event } });

  // Send to backend API for storage
  fetch('/api/analytics/event-promotion-planner', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  }).catch((error) => {
    log.error('Failed to send analytics event', { action: 'send_event', metadata: { error } });
  });
}

/**
 * Simple email hashing for privacy
 */
function hashEmail(email: string): string {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

/**
 * Get analytics summary
 */
export function getAnalyticsSummary(): {
  totalEvents: number;
  eventsByType: Record<string, number>;
  lastEventTime?: Date;
} {
  const events = getStoredEvents();
  const eventsByType: Record<string, number> = {};

  events.forEach((event) => {
    eventsByType[event.eventType] = (eventsByType[event.eventType] || 0) + 1;
  });

  return {
    totalEvents: events.length,
    eventsByType,
    lastEventTime: events.length > 0 ? new Date(events[events.length - 1].timestamp) : undefined,
  };
}

/**
 * Clear analytics data (for privacy/GDPR compliance)
 */
export function clearAnalytics(): void {
  try {
    localStorage.removeItem('epp_analytics');
  } catch (error) {
    log.error('Failed to clear analytics data', { action: 'clear_analytics', metadata: { error } });
  }
}
