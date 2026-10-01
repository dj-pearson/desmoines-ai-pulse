/**
 * ses-events - Amazon SES bounce, complaint and delivery events, delivered by
 * SNS from the SES configuration set (WP2 of
 * docs/plans/NON_CORE_REVIEW_2026-09.md).
 *
 * Before this, a hard bounce or a spam complaint suppressed nobody, and the
 * next newsletter mailed the same dead address again. SES suspends sending
 * accounts whose bounce rate passes 10% or complaint rate passes 0.5%.
 *
 * Auth: verify_jwt=false; SNS sends no bearer. Every message's SNS signature
 * is verified against a certificate fetched only from
 * https://sns.<topic region>.amazonaws.com/, and the topic must be the one in
 * SES_SNS_TOPIC_ARN (comma-separated if more than one). Unset, every message
 * is refused. See _shared/sesEvents.ts for why both checks are needed.
 *
 * Setup: SNS topic -> HTTPS subscription to
 *   https://<project>.supabase.co/functions/v1/ses-events
 * with raw message delivery OFF. The first POST is a SubscriptionConfirmation,
 * which this function confirms once it verifies.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { verifySnsMessage } from "../_shared/sesEvents.ts";
import { handleSesEvent } from "./handler.ts";

const db = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

// SNS signing certificates rotate rarely; one fetch per isolate is plenty.
const certCache = new Map<string, string>();

Deno.serve((req) =>
  handleSesEvent(req, {
    db,
    allowedTopics: Deno.env.get("SES_SNS_TOPIC_ARN"),
    verifySignature: verifySnsMessage,
    fetchCert: async (url) => {
      const hit = certCache.get(url);
      if (hit) return hit;
      // redirect: "error" - the host check is on this URL, not wherever it points.
      const res = await fetchWithTimeout(url, { redirect: "error" }, 10_000);
      if (!res.ok) throw new Error(`certificate fetch ${res.status}`);
      const pem = await res.text();
      certCache.set(url, pem);
      return pem;
    },
    confirm: async (url) => {
      const res = await fetchWithTimeout(url, { redirect: "error" }, 10_000);
      await res.body?.cancel();
      return res.ok;
    },
  })
);
