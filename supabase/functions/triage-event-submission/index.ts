/**
 * triage-event-submission (WEB-AUTO-002)
 *
 * Scores a user event submission for completeness + content safety, then:
 *   - score >= 85 & valid future date & no safety flag -> AUTO-APPROVE into events
 *     (source='user_submission'), notify submitter.
 *   - score < 50 OR safety flag                        -> AUTO-REJECT with a
 *     templated reason, notify submitter.
 *   - 50-84                                            -> stays pending with the
 *     score + reasons for the admin queue.
 * Every auto-decision is recorded on the row (auto_decided, quality_score,
 * triage_reasons) and metrics flow through the WEB-AUTO-001 jobRunner.
 *
 * Invoked by the submit flow (owner JWT) or internally (service/API key).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { handleCors, getCorsHeaders } from '../_shared/cors.ts';
import { checkRateLimitPersistent } from '../_shared/rateLimit.ts';
import { runJob } from '../_shared/jobRunner.ts';
import { fetchWithTimeout } from '../_shared/fetchWithTimeout.ts';

const AUTO_APPROVE_THRESHOLD = 85;
const AUTO_REJECT_THRESHOLD = 50;

interface Submission {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  date: string | null;
  venue: string | null;
  location: string | null;
  category: string | null;
  price: string | null;
  image_url: string | null;
  website_url: string | null;
  contact_email: string | null;
  status: string;
}

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/** Deterministic completeness/quality score (0-100) + reasons. */
function scoreCompleteness(s: Submission): { score: number; reasons: string[]; dateValid: boolean } {
  const reasons: string[] = [];
  let score = 0;

  if (s.title && s.title.trim().length >= 5) score += 20; else reasons.push('Title missing or too short');

  const desc = (s.description ?? '').trim();
  if (desc.length >= 120) score += 25;
  else if (desc.length >= 40) { score += 12; reasons.push('Description is short'); }
  else reasons.push('Description missing or too short');

  let dateValid = false;
  if (s.date) {
    const d = new Date(s.date);
    if (!isNaN(d.getTime()) && d.getTime() > Date.now() - 24 * 3600 * 1000) {
      dateValid = true;
      score += 20;
    } else reasons.push('Event date is missing, invalid, or in the past');
  } else reasons.push('Event date is missing');

  if ((s.venue && s.venue.trim()) || (s.location && s.location.trim())) score += 15;
  else reasons.push('No venue or location');

  if (s.category && s.category.trim()) score += 10; else reasons.push('No category');
  if (s.image_url && /^https?:\/\//.test(s.image_url)) score += 5;
  if (s.website_url && /^https?:\/\//.test(s.website_url)) score += 5;

  return { score: Math.min(100, score), reasons, dateValid };
}

/** Claude content-safety check. Fails SAFE-PENDING (no flag) if AI errors. */
async function safetyCheck(s: Submission): Promise<{ safe: boolean; reasons: string[] }> {
  const key = Deno.env.get('ANTHROPIC_API_KEY') || Deno.env.get('CLAUDE_API') || Deno.env.get('CLAUDE_API_KEY');
  if (!key) return { safe: true, reasons: [] };
  try {
    const prompt =
      `You are moderating a community event submission for a family-friendly local events site. ` +
      `Flag it ONLY if it contains hate speech, harassment, explicit sexual content, scams/spam, ` +
      `illegal activity, or is clearly not a real local event. Respond with STRICT JSON: ` +
      `{"safe": boolean, "reasons": string[]}.\n\n` +
      `Title: ${s.title}\nDescription: ${s.description ?? ''}\nVenue: ${s.venue ?? ''}\nCategory: ${s.category ?? ''}`;
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    }, 60_000);
    if (!res.ok) return { safe: true, reasons: [] };
    const data = await res.json();
    const text = data?.content?.[0]?.text ?? '';
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { safe: true, reasons: [] };
    const parsed = JSON.parse(match[0]);
    return { safe: parsed.safe !== false, reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [] };
  } catch (_e) {
    return { safe: true, reasons: [] };
  }
}

Deno.serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const origin = req.headers.get('origin') || undefined;
  const corsHeaders = getCorsHeaders(origin);

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders);

  const url = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(url, serviceKey);

  let submissionId: string;
  try {
    ({ submissionId } = await req.json());
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders);
  }
  if (!submissionId) return json({ error: 'submissionId is required' }, 400, corsHeaders);

  // AuthZ: service/API key, OR the submission owner, OR an admin.
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = req.headers.get('X-API-Key') || req.headers.get('x-api-key');
  const isInternal =
    (apiKey && apiKey === Deno.env.get('EDGE_FUNCTION_API_KEY')) ||
    (bearer && bearer === serviceKey);

  const { data: submission, error: subErr } = await supabase
    .from('user_submitted_events')
    .select('*')
    .eq('id', submissionId)
    .maybeSingle<Submission>();
  if (subErr || !submission) return json({ error: 'Submission not found' }, 404, corsHeaders);

  if (!isInternal) {
    if (!bearer) return json({ error: 'Authentication required' }, 401, corsHeaders);
    const { data: userRes } = await supabase.auth.getUser(bearer);
    const uid = userRes?.user?.id;
    if (!uid) return json({ error: 'Invalid token' }, 401, corsHeaders);
    if (uid !== submission.user_id) {
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', uid).maybeSingle();
      if (!roleRow || !['admin', 'root_admin'].includes(roleRow.role)) {
        return json({ error: 'Not authorized for this submission' }, 403, corsHeaders);
      }
    }
    // Bound Claude cost per submitter.
    const rl = await checkRateLimitPersistent(req, { endpoint: 'triage-event-submission', userId: uid, windowMs: 60_000, max: 10 });
    if (!rl.success && rl.response) return rl.response;
  }

  // Only triage pending submissions (idempotent).
  if (submission.status !== 'pending') {
    return json({ skipped: true, reason: `Submission status is ${submission.status}` }, 200, corsHeaders);
  }

  const result = await runJob('triage-event-submission', async (ctx) => {
    const { score, reasons, dateValid } = scoreCompleteness(submission);
    const safety = await safetyCheck(submission);
    const allReasons = [...reasons, ...safety.reasons.map((r) => `Safety: ${r}`)];
    const safetyFlag = !safety.safe;

    let decision: 'approved' | 'rejected' | 'pending';
    if (safetyFlag || score < AUTO_REJECT_THRESHOLD) decision = 'rejected';
    else if (score >= AUTO_APPROVE_THRESHOLD && dateValid) decision = 'approved';
    else decision = 'pending';

    // Persist score + reasons on the submission regardless of outcome.
    const patch: Record<string, unknown> = {
      quality_score: score,
      triage_reasons: allReasons,
      triaged_at: new Date().toISOString(),
    };

    if (decision === 'approved') {
      const { error: insErr } = await supabase.from('events').insert({
        title: submission.title,
        date: submission.date,
        location: submission.location || submission.venue || 'Des Moines, IA',
        category: submission.category || 'Community',
        venue: submission.venue,
        original_description: submission.description,
        price: submission.price,
        image_url: submission.image_url,
        source_url: submission.website_url,
        source: 'user_submission',
      });
      if (insErr) throw new Error(`events insert: ${insErr.message}`);
      patch.status = 'approved';
      patch.auto_decided = true;
    } else if (decision === 'rejected') {
      patch.status = 'rejected';
      patch.auto_decided = true;
      patch.admin_notes = safetyFlag
        ? 'Automatically declined: the submission did not pass our content guidelines.'
        : 'Automatically declined: the submission was missing key details (date, venue, or a clear description). You are welcome to resubmit with more information.';
    }
    // pending: leave status, just store score + reasons for the admin queue.

    await supabase.from('user_submitted_events').update(patch).eq('id', submission.id);

    ctx.processed(1);
    ctx.meta({ decision, score, safetyFlag, submissionId: submission.id });

    // Notify the submitter on an auto-decision (best-effort).
    if (decision !== 'pending' && submission.contact_email) {
      try {
        await supabase.functions.invoke('notify-event-submission', {
          body: {
            notificationType: decision === 'approved' ? 'event_approved' : 'event_rejected',
            eventId: submission.id,
            eventTitle: submission.title,
            eventDate: submission.date ? new Date(submission.date).toLocaleDateString() : undefined,
            eventVenue: submission.venue || undefined,
            eventCategory: submission.category || undefined,
            submitterEmail: submission.contact_email,
            adminNotes: typeof patch.admin_notes === 'string' ? patch.admin_notes : undefined,
          },
        });
      } catch (e) {
        console.error('[triage] notify failed:', e);
      }
    }

    return { decision, score, reasons: allReasons };
  });

  if (!result.ok) return json({ error: result.error }, 500, corsHeaders);
  return json({ success: true, ...result.result }, 200, corsHeaders);
});
