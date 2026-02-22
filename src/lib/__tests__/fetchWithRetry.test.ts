import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWithRetry } from '../fetchWithRetry';

// Mock fetch globally
const originalFetch = globalThis.fetch;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.useRealTimers();
});

describe('fetchWithRetry', () => {
  it('returns successful response on first attempt', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const response = await fetchWithRetry('https://api.example.com/data');
    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on 500 server error and succeeds', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('Server Error', { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await fetchWithRetry('https://api.example.com/data', undefined, {
      maxRetries: 3,
      baseDelay: 10, // Use short delays for tests
    });

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry on 400 client error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Bad Request', { status: 400 })
    );

    const response = await fetchWithRetry('https://api.example.com/data', undefined, {
      maxRetries: 3,
      baseDelay: 10,
    });

    expect(response.status).toBe(400);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('does NOT retry on 404 not found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Not Found', { status: 404 })
    );

    const response = await fetchWithRetry('https://api.example.com/data', undefined, {
      maxRetries: 3,
      baseDelay: 10,
    });

    expect(response.status).toBe(404);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries on network error (TypeError)', async () => {
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await fetchWithRetry('https://api.example.com/data', undefined, {
      maxRetries: 3,
      baseDelay: 10,
    });

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws after all retries are exhausted on network error', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(
      fetchWithRetry('https://api.example.com/data', undefined, {
        maxRetries: 2,
        baseDelay: 10,
      })
    ).rejects.toThrow('Failed to fetch');

    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('returns final 500 response after max retries', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response('Server Error', { status: 500 })
    );

    const response = await fetchWithRetry('https://api.example.com/data', undefined, {
      maxRetries: 2,
      baseDelay: 10,
    });

    expect(response.status).toBe(500);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('retries on 502 and 503 status codes', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response('Bad Gateway', { status: 502 }))
      .mockResolvedValueOnce(new Response('Service Unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await fetchWithRetry('https://api.example.com/data', undefined, {
      maxRetries: 3,
      baseDelay: 10,
    });

    expect(response.status).toBe(200);
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
  });
});
