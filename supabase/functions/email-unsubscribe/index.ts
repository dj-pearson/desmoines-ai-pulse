/**
 * email-unsubscribe - the RFC 8058 one-click target named in every marketing
 * email's List-Unsubscribe header (see _shared/emailLayout.ts). The request
 * handling is in ./handler.ts.
 *
 * Auth: verify_jwt=false. A mailbox provider's POST carries no Authorization
 * header; the 48-hex unsubscribe token in the URL is the credential, exactly
 * as it is for the /unsubscribe page. Runs with the ANON key, not the service
 * role: the only thing it does is call newsletter_unsubscribe_by_token, which
 * is SECURITY DEFINER and granted to anon for this purpose, or, for a
 * reminder email's ?reminder= link, cancel_event_reminders_by_token, or, for a
 * saved-search alert's ?alerts= link, disable_event_alerts_by_token, likewise.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getSiteUrl } from "../_shared/siteUrl.ts";
import { handleUnsubscribe } from "./handler.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  { auth: { persistSession: false } },
);

Deno.serve((req) =>
  handleUnsubscribe(req, {
    rpc: async (token) => {
      const { data, error } = await supabase.rpc("newsletter_unsubscribe_by_token", { p_token: token });
      return { data, error };
    },
    cancelReminders: async (token) => {
      const { data, error } = await supabase.rpc("cancel_event_reminders_by_token", { p_token: token });
      return { data, error };
    },
    disableAlerts: async (token) => {
      const { data, error } = await supabase.rpc("disable_event_alerts_by_token", { p_token: token });
      return { data, error };
    },
    siteUrl: getSiteUrl(),
  })
);
