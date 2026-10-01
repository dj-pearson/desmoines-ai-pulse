/**
 * Reading what create-campaign-checkout and the campaign RPCs refused, so a
 * page can say something an advertiser can act on instead of supabase-js's
 * "Edge Function returned a non-2xx status code".
 */
import { BUSINESS_CONTACT_EMAIL } from "@/lib/businessCopy";

export type CheckoutFailure =
  | { kind: "verify_email" }
  | { kind: "price_changed"; currentTotal: number }
  | { kind: "not_payable" }
  | { kind: "error"; message: string };

const GENERIC_CHECKOUT_MESSAGE = "Checkout didn't start. Try again in a minute.";

interface CheckoutErrorBody {
  error?: unknown;
  code?: unknown;
  message?: unknown;
  currentTotal?: unknown;
}

function responseOf(err: unknown): Response | null {
  const ctx = (err as { context?: unknown } | null)?.context;
  if (ctx && typeof (ctx as Response).json === "function") return ctx as Response;
  return null;
}

async function readBody(res: Response): Promise<CheckoutErrorBody | null> {
  try {
    const target = typeof res.clone === "function" ? res.clone() : res;
    const body: unknown = await target.json();
    return body && typeof body === "object" ? (body as CheckoutErrorBody) : null;
  } catch {
    return null;
  }
}

/**
 * Classify a create-campaign-checkout failure. `err` is what
 * `supabase.functions.invoke` returned (or what createCheckoutSession threw):
 * a FunctionsHttpError carries the Response in `context`.
 *
 * - 403 `email_verification_required` (index.ts:118-126)
 * - 409 `PRICE_CHANGED` with the server's `currentTotal` (index.ts:295-307)
 * - 400 "not in a payable state" (index.ts:149-157)
 */
export async function readCheckoutFailure(err: unknown): Promise<CheckoutFailure> {
  const res = responseOf(err);
  if (res) {
    const body = await readBody(res);
    const status = typeof res.status === "number" ? res.status : 0;
    const errorText = typeof body?.error === "string" ? body.error : "";

    if (body?.code === "email_verification_required" || (status === 403 && /verif/i.test(errorText))) {
      return { kind: "verify_email" };
    }
    if (errorText === "PRICE_CHANGED") {
      const currentTotal = Number(body?.currentTotal);
      if (Number.isFinite(currentTotal)) return { kind: "price_changed", currentTotal };
    }
    if (/not in a payable state/i.test(errorText)) {
      return { kind: "not_payable" };
    }
    if (errorText && errorText !== "PRICE_CHANGED") return { kind: "error", message: errorText };
    if (typeof body?.message === "string" && body.message) {
      return { kind: "error", message: body.message };
    }
    return { kind: "error", message: GENERIC_CHECKOUT_MESSAGE };
  }

  const message = err instanceof Error ? err.message : "";
  if (message && !/non-2xx status code/i.test(message)) return { kind: "error", message };
  return { kind: "error", message: GENERIC_CHECKOUT_MESSAGE };
}

/** Shown when a campaign RPC isn't applied yet (PGRST202). */
export const RPC_NOT_AVAILABLE_MESSAGE = `This isn't switched on yet. Email ${BUSINESS_CONTACT_EMAIL} and we'll do it by hand.`;

/** "cancel_campaign: a draft campaign cannot be cancelled here" -> "A draft campaign cannot be cancelled here." */
function tidyRefusal(text: string): string {
  const stripped = text.replace(/^[a-z_][a-z0-9_]*:\s*/, "").trim();
  if (!stripped) return text;
  const capped = stripped.charAt(0).toUpperCase() + stripped.slice(1);
  return /[.!?]$/.test(capped) ? capped : `${capped}.`;
}

/**
 * What to tell an advertiser when cancel_campaign, set_campaign_paused,
 * request_campaign_refund or a similar RPC fails. A function that isn't in
 * the schema cache (PGRST202, not applied yet) gets the email fallback; the
 * RPCs' own RAISE EXCEPTION text is passed through without its prefix.
 *
 * useCampaigns rethrows these as `new Error(rpcError.message)`, which drops
 * the code, so the PostgREST message is matched as well.
 */
export function campaignRpcMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  const message =
    typeof (err as { message?: unknown } | null)?.message === "string"
      ? ((err as { message: string }).message)
      : typeof err === "string"
        ? err
        : "";

  if (code === "PGRST202" || /could not find the function/i.test(message)) {
    return RPC_NOT_AVAILABLE_MESSAGE;
  }
  if (message) return tidyRefusal(message);
  return `That didn't go through. Try again, or email ${BUSINESS_CONTACT_EMAIL}.`;
}
