/**
 * Email Integration for Event Promotion Planner
 * Handles email capture, sequence management, and API calls
 */

import { supabase } from '@/integrations/supabase/client';
import type { EmailCaptureData, ReferralData } from '@/types/event-promotion';

/**
 * Save email capture to database
 */
export async function saveEmailCapture(data: EmailCaptureData): Promise<void> {
  const { error } = await supabase.from('event_promotion_email_captures').insert({
    email: data.email,
    event_name: data.eventName,
    organization_name: data.organizationName,
    event_type: data.eventType,
    event_date: data.eventDate.toISOString().split('T')[0],
    send_reminders: data.sendReminders,
    referral_code: data.referralCode,
  });

  if (error) {
    console.error('Error saving email capture:', error);
    throw new Error('Failed to save email capture');
  }

  // Generate referral code
  const referralCode = generateReferralCode(data.email);
  await createReferral(data.email, referralCode);

  // Trigger email sequence
  if (data.sendReminders) {
    await initializeEmailSequence(data);
  }

  // Send immediate welcome email
  await sendWelcomeEmail(data);
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
    console.error('Error creating referral:', error);
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
    console.error('Error tracking referral usage:', error);
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
    console.error('Error initializing email sequence:', error);
  }
}

/**
 * Send welcome email (immediate)
 */
async function sendWelcomeEmail(data: EmailCaptureData): Promise<void> {
  try {
    // Call your email service API (Resend, SendGrid, etc.)
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: data.email,
        template: 'event-promotion-welcome',
        data: {
          eventName: data.eventName || 'Your Event',
          eventType: data.eventType,
          eventDate: data.eventDate.toISOString(),
        },
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to send email');
    }

    // Update sequence status
    await supabase
      .from('event_promotion_email_sequences')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('email', data.email)
      .eq('sequence_day', 0);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
}

/**
 * Send email via server-side API endpoint
 * Note: API keys are stored securely on the server-side, not in client code
 */
export async function sendEmail(config: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<void> {
  // Use server-side API endpoint to send emails
  // This keeps API keys secure on the server
  const response = await fetch('/api/send-email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: config.to,
      subject: config.subject,
      html: config.html,
      text: config.text,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    console.error('Email send error:', error);
    throw new Error('Failed to send email');
  }
}

/**
 * Generate referral code from email
 */
function generateReferralCode(email: string): string {
  return btoa(email).substring(0, 8).toUpperCase();
}

/**
 * Track email open (webhook)
 */
export async function trackEmailOpen(email: string, emailType: string): Promise<void> {
  await supabase
    .from('event_promotion_email_sequences')
    .update({ opened_at: new Date().toISOString() })
    .eq('email', email)
    .eq('email_type', emailType)
    .is('opened_at', null);
}

/**
 * Track email click (webhook)
 */
export async function trackEmailClick(email: string, emailType: string): Promise<void> {
  await supabase
    .from('event_promotion_email_sequences')
    .update({ clicked_at: new Date().toISOString() })
    .eq('email', email)
    .eq('email_type', emailType)
    .is('clicked_at', null);
}

/**
 * Get pending emails to send (for cron job)
 */
export async function getPendingEmails(): Promise<any[]> {
  const { data, error } = await supabase
    .from('event_promotion_email_sequences')
    .select('*')
    .eq('status', 'pending')
    .lte('sequence_day', Math.floor(Date.now() / (1000 * 60 * 60 * 24)))
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) {
    console.error('Error fetching pending emails:', error);
    return [];
  }

  return data || [];
}

/**
 * Email templates for the 7-day sequence
 */
export const EMAIL_TEMPLATES = {
  immediate_welcome: {
    subject: 'Your Event Promotion Timeline + Critical First Step',
    getHtml: (data: any) => `
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
    getHtml: (data: any) => `
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
