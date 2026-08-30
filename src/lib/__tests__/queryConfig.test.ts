import { describe, it, expect } from 'vitest';
import { shouldRetry, retryDelay } from '@/lib/queryConfig';

/**
 * Retry policy (WEB-PERF-025).
 *
 * The rule this pins: only conditions that can actually change while you wait
 * are worth retrying. 5xx and network failures qualify; 3xx and 4xx do not,
 * except 408 (timeout) and 429 (rate limited).
 *
 * The 3xx case is the reason this file exists. get_active_ads returns HTTP 300
 * (PGRST203 — two function overloads coexist until migration 20260718000001 is
 * applied), and the original guard started at 400, so every ad lookup retried a
 * permanent schema error. Measured on the homepage: 2 placements, 6 requests,
 * all failing.
 */
describe('shouldRetry', () => {
  const err = (status: number) => ({ status });

  // The real shape: Supabase Postgrest errors carry a CODE and no status.
  // A status-only guard never matched them, which is why the homepage kept
  // issuing 6 requests for 2 placements even after 3xx was excluded.
  it('does not retry a Postgrest error by code (no status present)', () => {
    expect(shouldRetry(0, { code: 'PGRST203', message: 'could not choose the best candidate function' })).toBe(false);
    expect(shouldRetry(0, { code: 'PGRST202', message: 'function not found' })).toBe(false);
    expect(shouldRetry(0, { code: 'PGRST204', message: 'column not found' })).toBe(false);
  });

  it('does not retry Postgres schema errors by SQLSTATE', () => {
    expect(shouldRetry(0, { code: '42703', message: 'column does not exist' })).toBe(false);
    expect(shouldRetry(0, { code: '42P01', message: 'relation does not exist' })).toBe(false);
  });

  it('STILL retries connection-class Postgres errors', () => {
    expect(shouldRetry(0, { code: '08006', message: 'connection failure' })).toBe(true);
    expect(shouldRetry(0, { code: '53300', message: 'too many connections' })).toBe(true);
  });

  it('does not retry the HTTP 300 case either', () => {
    expect(shouldRetry(0, err(300))).toBe(false);
  });

  it('does not retry 3xx generally — a redirect surfacing as an error is terminal', () => {
    for (const s of [300, 301, 302, 304, 307, 399]) {
      expect(shouldRetry(0, err(s)), `status ${s}`).toBe(false);
    }
  });

  it('does not retry ordinary client errors', () => {
    for (const s of [400, 401, 403, 404, 422, 499]) {
      expect(shouldRetry(0, err(s)), `status ${s}`).toBe(false);
    }
  });

  it('still retries the two client errors that resolve by waiting', () => {
    expect(shouldRetry(0, err(408))).toBe(true);
    expect(shouldRetry(0, err(429))).toBe(true);
  });

  it('still retries server errors', () => {
    for (const s of [500, 502, 503, 504]) {
      expect(shouldRetry(0, err(s)), `status ${s}`).toBe(true);
    }
  });

  it('still retries errors with no status (network failures)', () => {
    expect(shouldRetry(0, new Error('network down'))).toBe(true);
    expect(shouldRetry(0, undefined)).toBe(true);
    expect(shouldRetry(0, null)).toBe(true);
  });

  it('reads statusCode as well as status', () => {
    expect(shouldRetry(0, { statusCode: 300 })).toBe(false);
    expect(shouldRetry(0, { statusCode: 503 })).toBe(true);
  });

  it('stops retrying once the attempt budget is spent', () => {
    // Retryable status, but the failure count is what ends it.
    expect(shouldRetry(0, err(500))).toBe(true);
    expect(shouldRetry(1, err(500))).toBe(true);
    expect(shouldRetry(2, err(500))).toBe(false);
  });
});

describe('retryDelay', () => {
  it('backs off exponentially and caps', () => {
    expect(retryDelay(0)).toBe(1000);
    expect(retryDelay(1)).toBe(2000);
    expect(retryDelay(2)).toBe(4000);
    expect(retryDelay(20)).toBe(10_000); // capped
  });
});
