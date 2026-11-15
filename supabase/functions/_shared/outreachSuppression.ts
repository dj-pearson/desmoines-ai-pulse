/**
 * Outreach opt-out matching (AOS-PROSPECT-009).
 *
 * crm_leads.contact_email keeps whatever casing the lead source gave it
 * ("Owner@Biz.com"), while every writer of outreach_suppression stores the
 * address lowercased (outreach-reply, outreach_unsubscribe_by_token). Two
 * exact comparisons sat across that gap:
 *
 *   - the senders' suppression check (`email.eq.${email}`), so a prospect who
 *     opted out was mailed again by any lead row that spelled the address with
 *     a capital letter (a re-import, a second lead for the same business);
 *   - outreach-reply's lead lookup (`.eq("contact_email", lowercased)`), which
 *     found no lead for a mixed-case address and returned "no matching lead"
 *     BEFORE writing the suppression row, so an "unsubscribe" reply from that
 *     prospect halted nothing and suppressed nothing.
 *
 * Everything here compares lowercased addresses and quotes filter values, so a
 * comma or parenthesis in a scraped address cannot change the filter.
 */

// deno-lint-ignore no-explicit-any
type Client = any;

export function normalizeOutreachEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** A PostgREST filter value in double quotes, so `,` `.` `(` `)` stay literal. */
function quoted(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/**
 * The `or` filter for the suppression check: this address, or its domain.
 * Lowercased, because the list is.
 */
export function outreachSuppressionFilter(email: string): string {
  const address = normalizeOutreachEmail(email);
  const domain = address.split("@")[1] ?? "";
  return `email.eq.${quoted(address)},domain.eq.${quoted(domain)}`;
}

/**
 * True when the address (or its domain) is on outreach_suppression.
 * FAILS CLOSED: an error answers "suppressed", because false means send, and a
 * suppression list is the one place where "could not check" must mean "do not
 * send" (WEB-BE-032 AC2).
 */
export async function isOutreachSuppressed(supabase: Client, email: string, tag: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("outreach_suppression")
    .select("id")
    .or(outreachSuppressionFilter(email))
    .limit(1);
  if (error) {
    console.warn(`[${tag}] suppression check failed for ${email}; treating as suppressed: ${error.message}`);
    return true;
  }
  return (data ?? []).length > 0;
}

/**
 * The `ilike` pattern that matches exactly this address in any casing.
 * Null when the address holds `*`, which PostgREST reads as a wildcard in
 * like/ilike and which no escape here can make literal; the caller then falls
 * back to an exact match rather than risk halting somebody else's lead.
 */
export function exactIlikePattern(email: string): string | null {
  if (email.includes("*")) return null;
  return email.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** Every crm_leads id whose contact_email is this address, in any casing. */
export async function findLeadIdsByEmail(supabase: Client, email: string): Promise<string[]> {
  const address = normalizeOutreachEmail(email);
  if (!address) return [];
  const pattern = exactIlikePattern(address);
  const query = supabase.from("crm_leads").select("id");
  const { data, error } = await (pattern === null
    ? query.eq("contact_email", address)
    : query.ilike("contact_email", pattern)
  ).limit(50);
  if (error) throw new Error(`crm_leads lookup failed: ${error.message}`);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

/**
 * Put an address on outreach_suppression, lowercased, unless it is already
 * there. Returns false when it was already listed.
 */
export async function recordOutreachOptOut(supabase: Client, email: string, reason: string): Promise<boolean> {
  const address = normalizeOutreachEmail(email);
  if (!address.includes("@")) return false;
  const { data, error } = await supabase
    .from("outreach_suppression")
    .select("id")
    .eq("email", address)
    .limit(1);
  if (error) throw new Error(`outreach_suppression read failed: ${error.message}`);
  if ((data ?? []).length > 0) return false;
  const { error: insertError } = await supabase.from("outreach_suppression").insert({ email: address, reason });
  if (insertError) throw new Error(`outreach_suppression insert failed: ${insertError.message}`);
  return true;
}
