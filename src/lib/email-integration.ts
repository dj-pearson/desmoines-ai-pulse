/**
 * Email capture for the Event Promotion Planner (WEB-QUAL-013).
 *
 * THIS MODULE RECORDS, IT DOES NOT SEND. EmailCaptureModal asks for an address
 * under an explicit agreement "to receive emails about your event promotion",
 * and EventPromotionPlanner had the one call that would have stored it
 * COMMENTED OUT - `// await saveEmailCapture(data)`. So a visitor handed over
 * their address to unlock the timeline and nothing kept it.
 *
 * The send half is deleted rather than wired: sendEmail() POSTed to
 * `/api/send-email`, a route this stack does not serve (Cloudflare Pages plus
 * Supabase edge functions - there is no /api), and switching on a seven-email
 * drip with no unsubscribe and no sender would be worse than the silence it
 * replaced. initializeEmailSequence still QUEUES the rows, which is the state a
 * sender would read when one exists.
 *
 * What the modal promises and this does not yet deliver is recorded in
 * WEB-QUAL-013's notes. It is the same shape as WEB-FEAT-019's newsletter gap
 * and wants its own story, not a line in a dead-code cleanup.
 */

import { supabase } from '@/integrations/supabase/client';
import type { EmailCaptureData } from '@/types/event-promotion';
import { createLogger } from '@/lib/logger';

const logger = createLogger('emailIntegration');

/**
 * Save email capture to database
 */
export async function saveEmailCapture(data: EmailCaptureData): Promise<void> {
  const { error } = await supabase.from('event_promotion_email_captures').insert({
    email: data.email,
    event_name: data.eventName,
    organization_name: data.organizationName,
    event_type: data.eventType,
    event_date: data.eventDate.toISOString().split('T')[0] ?? '',
    send_reminders: data.sendReminders,
    referral_code: data.referralCode,
  });

  if (error) {
    logger.error('saveEmailCapture', 'Error saving email capture', { error: String(error) });
    throw new Error('Failed to save email capture');
  }

  // Generate referral code
  const referralCode = generateReferralCode(data.email);
  await createReferral(data.email, referralCode);

  // Queue the sequence rows when they asked for reminders. Nothing sends them
  // yet; they are the work list for whoever builds the sender.
  if (data.sendReminders) {
    await initializeEmailSequence(data);
  }
}

/**
 * Create a referral code
 */
async function createReferral(email: string, code: string): Promise<void> {
  const { error } = await supabase.from('event_promotion_referrals').insert({
    referral_code: code,
    referrer_email: email,
  });

  if (error && !error.message.includes('duplicate')) {
    logger.error('createReferral', 'Error creating referral', { error: String(error) });
  }
}

/**
 * Track referral usage
 */
export async function trackReferralUsage(code: string, referredEmail: string): Promise<void> {
  const { error } = await supabase
    .from('event_promotion_referrals')
    .update({
      referred_email: referredEmail,
      used: true,
      used_at: new Date().toISOString(),
    })
    .eq('referral_code', code)
    .is('used', false);

  if (error) {
    logger.error('trackReferralUsage', 'Error tracking referral usage', { error: String(error) });
  }
}

/**
 * Initialize email sequence for user
 */
async function initializeEmailSequence(data: EmailCaptureData): Promise<void> {
  const emailSequence = [
    { day: 0, type: 'immediate_welcome' },
    { day: 1, type: 'channel_focus' },
    { day: 2, type: 'timing_tips' },
    { day: 3, type: 'case_study' },
    { day: 5, type: 'milestone_check' },
    { day: 6, type: 'free_vs_paid' },
    { day: 7, type: 'final_call' },
  ];

  const records = emailSequence.map((seq) => ({
    email: data.email,
    sequence_day: seq.day,
    email_type: seq.type,
    status: 'pending',
  }));

  const { error } = await supabase.from('event_promotion_email_sequences').insert(records);

  if (error) {
    logger.error('initializeEmailSequence', 'Error initializing email sequence', { error: String(error) });
  }
}

/**
 * Generate referral code from email
 */
function generateReferralCode(email: string): string {
  return btoa(email).substring(0, 8).toUpperCase();
}




/**
 * Email templates for the 7-day sequence
 */
export const EMAIL_TEMPLATES = {
  immediate_welcome: {
    subject: 'Your Event Promotion Timeline + Critical First Step',
    getHtml: (_data: any) => `
      <h1>Your Event Promotion Playbook is Ready! 🎉</h1>
      <p>Hi there,</p>
      <p>Thanks for using our Event Promotion Timeline Generator! Your customized 8-week plan is attached as a PDF.</p>
      <h2>Your Critical First Step (Do This Today)</h2>
      <p><strong>Create your event hashtag</strong></p>
      <ul>
        <li>Make it unique and memorable</li>
        <li>Keep it short (under 20 characters)</li>
        <li>Include location or year (e.g., #DSM2024Festival)</li>
      </ul>
      <p>This hashtag will be your campaign's thread across all platforms.</p>
      <h3>Want to Reach 50K+ Des Moines Locals Automatically?</h3>
      <p><a href="https://desmoinesinsider.com/advertise">List your event on DesMoinesInsider.com →</a></p>
      <p>Best,<br>The DesMoinesInsider Team</p>
    `,
  },
  channel_focus: {
    subject: 'The promotion channel everyone ignores (but shouldn\'t)',
    getHtml: (_data: any) => `
      <h1>Day 1: Master This Often-Overlooked Channel</h1>
      <p>Most event organizers focus only on social media. But here's what they miss:</p>
      <h2>Email Marketing for Events</h2>
      <p>Email has 10x better conversion than social posts. Here's why:</p>
      <ul>
        <li>Direct access to interested people</li>
        <li>No algorithm to fight</li>
        <li>Personal connection</li>
      </ul>
      <h3>How to Build Your Event Email List:</h3>
      <ol>
        <li>Create a simple landing page</li>
        <li>Offer early bird pricing for subscribers</li>
        <li>Add signup form to all promotional materials</li>
      </ol>
      <p><strong>Pro Tip:</strong> List your event on DesMoinesInsider to tap into our 50K+ subscriber base instantly.</p>
      <p><a href="https://desmoinesinsider.com/advertise">List Your Event Now →</a></p>
    `,
  },
  // Add more templates for days 2-7...
};
