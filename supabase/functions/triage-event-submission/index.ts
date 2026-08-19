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
import { getAnthropicApiKey, extractClaudeText } from '../_shared/aiConfig.ts';
import {
  AUTO_APPROVE_THRESHOLD,
  AUTO_REJECT_THRESHOLD,
  buildSafetyRequest,
  decideTriage,
  scoreCompleteness,
  type SafetyVerdict,
  type Submission,
} from './logic.ts';

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/**
 * Claude content-safety check. FAILS CLOSED: on a missing key, upstream error,
 * refusal, or unparseable response the verdict is UNDETERMINED (determined:false),
 * and the caller keeps the submission out of the auto-approve path.
 */
async function safetyCheck(s: Submission): Promise<SafetyVerdict> {
  const key = getAnthropicApiKey();
  if (!key) return { safe: false, determined: false, reasons: ['Safety check unavailable (no API key)'] };
  try {
    const { system, userContent } = buildSafetyRequest(s);
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    }, 60_000);
    if (!res.ok) return { safe: false, determined: false, reasons: [`Safety check upstream error (${res.status})`] };
    const data = await res.json();
    const extracted = extractClaudeText(data);
    if (!extracted.ok) return { safe: false, determined: false, reasons: [`Safety check ${extracted.reason}`] };
    const match = extracted.text.match(/\{[\s\S]*\}/);
    if (!match) return { safe: false, determined: false, reasons: ['Safety check returned no JSON'] };
    let parsed: { safe?: unknown; reasons?: unknown };
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return { safe: false, determined: false, reasons: ['Safety check JSON parse failed'] };
    }
    if (typeof parsed.safe !== 'boolean') {
      return { safe: false, determined: false, reasons: ['Safety check returned no boolean verdict'] };
    }
    return {
      safe: parsed.safe,
      determined: true,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons.map(String) : [],
    };
  } catch (_e) {
    return { safe: false, determined: false, reasons: ['Safety check exception'] };
  }
}

/**
 * Pure triage decision. Auto-approve requires a DETERMINED-safe verdict; an
 * undetermined safety result can never auto-approve (fail closed → human queue).
 * A confirmed-unsafe verdict auto-rejects; low quality score auto-rejects.
 */
export function decideTriage(
  score: number,
  dateValid: boolean,
  safety: SafetyVerdict,
): 'approved' | 'rejected' | 'pending' {
  const confirmedUnsafe = safety.determined && !safety.safe;
  if (confirmedUnsafe) return 'rejected';
  if (score < AUTO_REJECT_THRESHOLD) return 'rejected';
  if (score >= AUTO_APPROVE_THRESHOLD && dateValid && safety.determined && safety.safe) return 'approved';
  return 'pending';
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
      // WEB-BE-032: .limit(1) - see moderate-content. A duplicate user_roles
      // row would otherwise make this deny a genuine admin.
      const { data: roleRow } = await supabase.from('user_roles').select('role').eq('user_id', uid).order('created_at', { ascending: false }).limit(1).maybeSingle();
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
    // Surface an undetermined safety verdict in the admin queue too.
    if (!safety.determined) safety.reasons.push('verdict undetermined — routed for human review');
    const allReasons = [...reasons, ...safety.reasons.map((r) => `Safety: ${r}`)];
    // Only a DETERMINED-unsafe verdict is a real content flag; undetermined
    // (AI error/refusal/parse-fail) is NOT a flag but also blocks auto-approve.
    const safetyFlag = safety.determined && !safety.safe;

    const decision = decideTriage(score, dateValid, safety);

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
