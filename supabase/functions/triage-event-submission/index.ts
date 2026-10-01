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
import { getAnthropicApiKey, extractClaudeText, buildLightweightClaudeRequest } from '../_shared/aiConfig.ts';
// decideTriage is the tested copy in logic.ts. This file used to declare its
// own as well, and `deno run --no-check` ran the local one, so logic.test.ts
// pinned a function the endpoint never called.
import {
  buildSafetyRequest,
  buildTriagePatch,
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
    // WEB-BE-041. The model was 'claude-3-haiku-20240307', which is RETIRED -
    // the call 404s, and because this check fails closed, every submission has
    // been coming back undetermined and staying out of the auto-approve path.
    // A safety gate that always says "I could not tell" is not a safety gate.
    //
    // buildLightweightClaudeRequest is the Haiku-tier equivalent of the
    // buildClaudeRequest route AC2 asks for: the id comes from the ai_config
    // row with a non-retired fallback, so the next model change is one row
    // rather than three files. `system` is spread back on because that helper
    // returns only model/max_tokens/temperature/messages.
    const base = await buildLightweightClaudeRequest(
      [{ role: 'user', content: userContent }],
      {
        supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
        supabaseKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        customMaxTokens: 300,
      },
    );
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ ...base, system }),
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
    // Surface an undetermined safety verdict in the admin queue too.
    if (!safety.determined) safety.reasons.push('verdict undetermined — routed for human review');
    const allReasons = [...reasons, ...safety.reasons.map((r) => `Safety: ${r}`)];
    // Only a DETERMINED-unsafe verdict is a real content flag; undetermined
    // (AI error/refusal/parse-fail) is NOT a flag but also blocks auto-approve.
    const safetyFlag = safety.determined && !safety.safe;

    const proposed = decideTriage(score, dateValid, safety);

    let publishError: string | null = null;
    if (proposed === 'approved') {
      // WEB-ADS-008: ONE publisher, shared with the human approve button. The
      // mapping of submission to events row lives in publish_submission
      // (20260920000001) and both paths call it.
      const { error } = await supabase.rpc('publish_submission', {
        p_submission_id: submission.id,
      });
      if (error) {
        // Not thrown (business plan WP4 item 8): the score and reasons are
        // still saved and the row waits for a human. See buildTriagePatch.
        publishError = error.message;
        console.error('[triage] publish_submission failed; leaving pending:', error.message);
      }
    }

    const { decision, patch } = buildTriagePatch({
      decision: proposed,
      score,
      reasons: allReasons,
      safetyFlag,
      publishError,
    });

    // Checked: a failed write here means the admin queue has no score and the
    // submitter is about to be told about a decision the row does not record.
    const { error: patchError } = await supabase
      .from('user_submitted_events')
      .update(patch)
      .eq('id', submission.id);
    if (patchError) throw new Error(`saving triage result: ${patchError.message}`);

    ctx.processed(1);
    ctx.meta({ decision, score, safetyFlag, submissionId: submission.id, publishError });

    // Notify the submitter on an auto-decision (best-effort). Only the type and
    // the id: notify-event-submission reads the recipient, title and notes from
    // the row it was just given, and falls back to the owner's account email
    // when the submission has no contact_email.
    if (decision !== 'pending') {
      try {
        const { error: notifyError } = await supabase.functions.invoke('notify-event-submission', {
          body: {
            notificationType: decision === 'approved' ? 'event_approved' : 'event_rejected',
            eventId: submission.id,
          },
        });
        if (notifyError) console.error('[triage] notify failed:', notifyError.message);
      } catch (e) {
        console.error('[triage] notify failed:', e);
      }
    }

    const savedReasons = Array.isArray(patch.triage_reasons) ? patch.triage_reasons : allReasons;
    return { decision, score, reasons: savedReasons };
  });

  if (!result.ok) return json({ error: result.error }, 500, corsHeaders);
  return json({ success: true, ...result.result }, 200, corsHeaders);
});
