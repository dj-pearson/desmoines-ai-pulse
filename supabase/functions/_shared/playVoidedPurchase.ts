/**
 * Confirming a Play voided-purchase notification with Google before acting on
 * it (WEB-SEC-058).
 *
 * play-rtdn-webhook's subscriptionNotification branch re-reads state from the
 * Play Developer API, but the voidedPurchaseNotification branch revoked the
 * matching user_subscriptions row on the message's word. The OIDC check
 * (WEB-SEC-057) was then the only thing between a forged message and a paying
 * subscriber losing their entitlement. Now the token has to appear in
 * purchases.voidedpurchases.list before anything is revoked.
 *
 * Kept free of remote imports so the Deno test runs without the network.
 */

/**
 * A failure talking to Google that is worth retrying (network error, timeout,
 * 5xx, 408, 429). The webhook answers non-2xx and Pub/Sub redelivers.
 */
export class TransientPlayApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientPlayApiError';
  }
}

/** HTTP statuses from Google that are worth retrying. */
export function isTransientHttpStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 408;
}

/** One entry of purchases.voidedpurchases.list. */
export interface VoidedPurchaseEntry {
  kind?: string;
  purchaseToken?: string;
  orderId?: string;
  purchaseTimeMillis?: string;
  voidedTimeMillis?: string;
  voidedSource?: number;
  voidedReason?: number;
  refundType?: number;
}

interface VoidedPurchasesListResponse {
  voidedPurchases?: VoidedPurchaseEntry[];
  tokenPagination?: { nextPageToken?: string };
}

export type VoidCheck =
  | { confirmed: true; entry: VoidedPurchaseEntry }
  | { confirmed: false; reason: 'not_listed' | 'play_api_error'; detail: string };

const DAY_MS = 24 * 60 * 60 * 1000;
// Play rejects a startTime more than 30 days back. Stay a minute inside it.
const MAX_LOOKBACK_MS = 30 * DAY_MS - 60 * 1000;

/**
 * The oldest voidedTimeMillis to ask for. A day before the notification's
 * eventTimeMillis, clamped to what Play accepts. The event time comes from the
 * message itself, so a forger can only narrow the window; that can hide a real
 * void, never invent one.
 */
export function voidedLookupStartMs(eventTimeMillis: string | undefined, nowMs: number): number {
  const floor = nowMs - MAX_LOOKBACK_MS;
  const event = Number(eventTimeMillis);
  if (!eventTimeMillis || !Number.isFinite(event)) return floor;
  return Math.min(nowMs, Math.max(floor, event - DAY_MS));
}

export interface ConfirmVoidOptions {
  fetchFn: (url: string, init?: RequestInit) => Promise<Response>;
  apiBase: string;
  accessToken: string;
  packageName: string;
  purchaseToken: string;
  eventTimeMillis?: string;
  nowMs: number;
  maxPages?: number;
}

/**
 * Ask Play whether purchaseToken was voided. Throws TransientPlayApiError on a
 * retryable failure; every other outcome is a VoidCheck.
 */
export async function confirmVoidedPurchase(opts: ConfirmVoidOptions): Promise<VoidCheck> {
  const maxPages = opts.maxPages ?? 10;
  const startTime = voidedLookupStartMs(opts.eventTimeMillis, opts.nowMs);
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const params = new URLSearchParams({
      startTime: String(startTime),
      // type=1 includes subscriptions; the default 0 lists one-time products only.
      type: '1',
      maxResults: '1000',
    });
    if (pageToken) params.set('token', pageToken);
    const url = `${opts.apiBase}/applications/${encodeURIComponent(opts.packageName)}` +
      `/purchases/voidedpurchases?${params.toString()}`;

    let res: Response;
    try {
      res = await opts.fetchFn(url, { headers: { Authorization: `Bearer ${opts.accessToken}` } });
    } catch (err) {
      throw new TransientPlayApiError(
        `Play voidedpurchases.list unreachable: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (res.status !== 200) {
      const body = await res.text().catch(() => '');
      if (isTransientHttpStatus(res.status)) {
        throw new TransientPlayApiError(
          `Play voidedpurchases.list transient failure: status=${res.status}, body=${body}`,
        );
      }
      return {
        confirmed: false,
        reason: 'play_api_error',
        detail: `voidedpurchases.list status=${res.status}, body=${body}`,
      };
    }

    let data: VoidedPurchasesListResponse;
    try {
      data = (await res.json()) as VoidedPurchasesListResponse;
    } catch {
      return { confirmed: false, reason: 'play_api_error', detail: 'voidedpurchases.list body was not JSON' };
    }

    const entry = (data.voidedPurchases ?? []).find((v) => v.purchaseToken === opts.purchaseToken);
    if (entry) return { confirmed: true, entry };

    pageToken = data.tokenPagination?.nextPageToken;
    if (!pageToken) {
      return {
        confirmed: false,
        reason: 'not_listed',
        detail: `token not in voidedpurchases.list since ${new Date(startTime).toISOString()}`,
      };
    }
  }

  return {
    confirmed: false,
    reason: 'not_listed',
    detail: `token not found in the first ${maxPages} pages of voidedpurchases.list`,
  };
}

export interface PlayRtdnLogRow {
  message_id: string;
  notification_type: string;
  purchase_token: string;
  user_subscription_id: string | null;
  processed_at: string;
  status: 'applied' | 'no_match' | 'void_unconfirmed';
  error_message?: string | null;
}

export interface VoidedPurchaseDeps {
  /** Returns the Android row for the token, or null. Throws on a lookup error. */
  findSubscription: (purchaseToken: string) => Promise<{ id: string } | null>;
  /** Asks Google. May throw TransientPlayApiError, or any Error for a permanent failure. */
  confirmVoid: () => Promise<VoidCheck>;
  /** Cancels the row. Throws on failure. */
  revoke: (subscriptionId: string) => Promise<void>;
  writeLog: (row: PlayRtdnLogRow) => Promise<void>;
  now: () => Date;
}

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/**
 * The voidedPurchaseNotification branch. A lookup or revoke error propagates
 * (the caller answers 500, nothing logged, Pub/Sub redelivers). A transient
 * Play failure answers 503 with nothing logged, for the same reason. Revokes
 * only when Google lists the token as voided.
 */
export async function processVoidedPurchase(
  input: { messageId: string; purchaseToken: string },
  deps: VoidedPurchaseDeps,
): Promise<WebhookResult> {
  const subRow = await deps.findSubscription(input.purchaseToken);

  const log = (status: PlayRtdnLogRow['status'], errorMessage: string | null) =>
    deps.writeLog({
      message_id: input.messageId,
      notification_type: 'VOIDED_PURCHASE',
      purchase_token: input.purchaseToken,
      user_subscription_id: subRow?.id ?? null,
      processed_at: deps.now().toISOString(),
      status,
      error_message: errorMessage,
    });

  if (!subRow) {
    // Nothing to revoke, so nothing worth a Play API call.
    await log('no_match', null);
    return { status: 200, body: { ok: true } };
  }

  let check: VoidCheck;
  try {
    check = await deps.confirmVoid();
  } catch (err) {
    if (err instanceof TransientPlayApiError) {
      return { status: 503, body: { error: 'Upstream temporarily unavailable, retry', retry: true } };
    }
    // Permanent (bad credentials, 4xx from the token endpoint). Redelivery will
    // not fix it; the next validate-android-receipt call reconciles the row.
    check = {
      confirmed: false,
      reason: 'play_api_error',
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (!check.confirmed) {
    await log('void_unconfirmed', `${check.reason}: ${check.detail}`);
    return { status: 200, body: { ok: true, revoked: false } };
  }

  await deps.revoke(subRow.id);
  await log('applied', null);
  return { status: 200, body: { ok: true, revoked: true } };
}
