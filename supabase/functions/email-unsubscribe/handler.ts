/**
 * email-unsubscribe request handling, without the Supabase client, so the
 * test drives it with a stub.
 *
 * Two ways in, one token:
 *   POST ?token=...  RFC 8058 one-click. Gmail, Yahoo and Apple Mail send this
 *                    when the reader presses the inbox "Unsubscribe" button;
 *                    the body is "List-Unsubscribe=One-Click" and carries
 *                    nothing we need.
 *   GET  ?token=...  A client that opens the List-Unsubscribe URL in a browser.
 *                    Redirects to the site's /unsubscribe page, which does the
 *                    unsubscribe and shows the result. Supabase serves function
 *                    HTML as text/plain, so the page a person reads has to live
 *                    on the site; doing the work here as well would make that
 *                    page say "you were already unsubscribed".
 *
 * The token is newsletter_subscribers.unsubscribe_token, the same one the
 * /unsubscribe page takes, and the work is the same RPC the page calls
 * (newsletter_unsubscribe_by_token), which since 20261002000002 also writes
 * the email_suppressions row every marketing sender checks. One definition of
 * "unsubscribed", whichever door the reader used.
 *
 * WEB-FEAT-059: an event-reminder email carries ?reminder=<user_event_reminders.id>
 * instead. Same two doors (POST one-click, GET to the page), but the work is
 * cancel_event_reminders_by_token, which deletes that user's unsent reminders
 * for that one event and leaves the newsletter and every other email alone.
 *
 * WEB-FEAT-073: a saved-search alert email carries
 * ?alerts=<saved_searches.id>. Same two doors; the work is
 * disable_event_alerts_by_token, which turns off that user's event alerts
 * (user_email_preferences.event_alerts_enabled) and nothing else.
 */

/** 48 lowercase hex, the shape the RPC validates. */
export const TOKEN_RE = /^[0-9a-f]{48}$/;

/** A user_event_reminders.id: a v4 uuid, lowercase after normalising. */
export const REMINDER_TOKEN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type UnsubscribeRpc = (token: string) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export interface HandlerDeps {
  rpc: UnsubscribeRpc;
  /** cancel_event_reminders_by_token. Same call shape as rpc. */
  cancelReminders?: UnsubscribeRpc;
  /** disable_event_alerts_by_token. Same call shape as rpc. */
  disableAlerts?: UnsubscribeRpc;
  siteUrl: string;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

export async function handleUnsubscribe(req: Request, deps: HandlerDeps): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204 });
  if (req.method !== "POST" && req.method !== "GET") return json(405, { error: "Method not allowed" });

  const url = new URL(req.url);
  if (url.searchParams.has("reminder")) return handleReminder(req, url, deps);
  if (url.searchParams.has("alerts")) return handleAlerts(req, url, deps);
  const token = (url.searchParams.get("token") ?? "").trim().toLowerCase();

  if (req.method === "GET") {
    const page = `${deps.siteUrl.replace(/\/+$/, "")}/unsubscribe?token=${encodeURIComponent(token)}`;
    return new Response(null, { status: 303, headers: { Location: page, "Cache-Control": "no-store" } });
  }

  if (!TOKEN_RE.test(token)) return json(400, { error: "Invalid unsubscribe token" });

  const { data, error } = await deps.rpc(token);
  if (error) {
    console.error("[email-unsubscribe] rpc failed:", error.message);
    // 5xx so the mailbox provider retries.
    return json(503, { error: "Try again later" });
  }

  const row = (Array.isArray(data) ? data[0] : data) as { success?: boolean; already_unsubscribed?: boolean } | null;
  if (!row?.success) return json(404, { error: "Unknown unsubscribe token" });
  return json(200, { ok: true, already_unsubscribed: !!row.already_unsubscribed });
}

async function handleReminder(req: Request, url: URL, deps: HandlerDeps): Promise<Response> {
  const token = (url.searchParams.get("reminder") ?? "").trim().toLowerCase();

  if (req.method === "GET") {
    const page = `${deps.siteUrl.replace(/\/+$/, "")}/unsubscribe?reminder=${encodeURIComponent(token)}`;
    return new Response(null, { status: 303, headers: { Location: page, "Cache-Control": "no-store" } });
  }

  if (!REMINDER_TOKEN_RE.test(token)) return json(400, { error: "Invalid reminder token" });
  if (!deps.cancelReminders) return json(503, { error: "Try again later" });

  const { data, error } = await deps.cancelReminders(token);
  if (error) {
    console.error("[email-unsubscribe] cancel reminders failed:", error.message);
    return json(503, { error: "Try again later" });
  }

  const row = (Array.isArray(data) ? data[0] : data) as { success?: boolean; cancelled?: number } | null;
  if (!row?.success) return json(404, { error: "Unknown reminder token" });
  return json(200, { ok: true, cancelled: Number(row.cancelled ?? 0) });
}

async function handleAlerts(req: Request, url: URL, deps: HandlerDeps): Promise<Response> {
  const token = (url.searchParams.get("alerts") ?? "").trim().toLowerCase();

  if (req.method === "GET") {
    const page = `${deps.siteUrl.replace(/\/+$/, "")}/unsubscribe?alerts=${encodeURIComponent(token)}`;
    return new Response(null, { status: 303, headers: { Location: page, "Cache-Control": "no-store" } });
  }

  // A saved_searches.id has the same uuid shape as a reminder id.
  if (!REMINDER_TOKEN_RE.test(token)) return json(400, { error: "Invalid alerts token" });
  if (!deps.disableAlerts) return json(503, { error: "Try again later" });

  const { data, error } = await deps.disableAlerts(token);
  if (error) {
    console.error("[email-unsubscribe] disable alerts failed:", error.message);
    return json(503, { error: "Try again later" });
  }

  const row = (Array.isArray(data) ? data[0] : data) as { success?: boolean; already_disabled?: boolean } | null;
  if (!row?.success) return json(404, { error: "Unknown alerts token" });
  return json(200, { ok: true, already_disabled: !!row.already_disabled });
}
