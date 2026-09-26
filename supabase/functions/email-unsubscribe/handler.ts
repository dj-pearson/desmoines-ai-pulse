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
 */

/** 48 lowercase hex, the shape the RPC validates. */
export const TOKEN_RE = /^[0-9a-f]{48}$/;

export type UnsubscribeRpc = (token: string) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

export interface HandlerDeps {
  rpc: UnsubscribeRpc;
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
