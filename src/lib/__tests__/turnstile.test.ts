import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * WEB-SEC-029. The property that makes this shippable ahead of the owner's
 * dashboard action is that it is INERT with no site key configured.
 *
 * Turnstile enforcement in Supabase is project-wide, so the day it is switched
 * on, every client that does not send a token is rejected - including the
 * shipped iOS and Android binaries. The web code therefore has to land first
 * and change nothing, and "changes nothing" is a claim worth a test rather
 * than a comment.
 */

const ORIGINAL = import.meta.env.VITE_TURNSTILE_SITE_KEY;

async function freshModule() {
  vi.resetModules();
  return await import('../turnstile');
}

beforeEach(() => {
  document.head.innerHTML = '';
  delete (window as { turnstile?: unknown }).turnstile;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete import.meta.env.VITE_TURNSTILE_SITE_KEY;
  else import.meta.env.VITE_TURNSTILE_SITE_KEY = ORIGINAL;
});

describe('turnstile configuration', () => {
  it('is disabled when no site key is set', async () => {
    delete import.meta.env.VITE_TURNSTILE_SITE_KEY;
    const { isTurnstileEnabled, getTurnstileSiteKey } = await freshModule();
    expect(isTurnstileEnabled()).toBe(false);
    expect(getTurnstileSiteKey()).toBeNull();
  });

  it('treats a blank or whitespace key as unset', async () => {
    // A key set to "" in a CI environment file must not half-enable this.
    import.meta.env.VITE_TURNSTILE_SITE_KEY = '   ';
    const { isTurnstileEnabled } = await freshModule();
    expect(isTurnstileEnabled()).toBe(false);
  });

  it('is enabled, and trims, when a key is set', async () => {
    import.meta.env.VITE_TURNSTILE_SITE_KEY = '  1x00000000000000000000AA  ';
    const { isTurnstileEnabled, getTurnstileSiteKey } = await freshModule();
    expect(isTurnstileEnabled()).toBe(true);
    expect(getTurnstileSiteKey()).toBe('1x00000000000000000000AA');
  });
});

describe('script loading', () => {
  it('injects nothing until asked, and only once', async () => {
    const { loadTurnstile, TURNSTILE_SCRIPT_SRC } = await freshModule();
    expect(document.querySelectorAll('script').length).toBe(0);

    void loadTurnstile();
    void loadTurnstile();

    const scripts = document.querySelectorAll(`script[src="${TURNSTILE_SCRIPT_SRC}"]`);
    expect(scripts.length).toBe(1);
    // Third-party script on one route, so it must not block the others.
    expect((scripts[0] as HTMLScriptElement).async).toBe(true);
  });

  it('resolves null when the script fails, rather than rejecting', async () => {
    // FAIL OPEN. A blocked script must not break the form: enforcement is
    // server-side, and a client-side block only stops the honest visitor
    // behind a strict ad blocker.
    const { loadTurnstile, TURNSTILE_SCRIPT_SRC } = await freshModule();
    const pending = loadTurnstile();
    const script = document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)!;
    script.dispatchEvent(new Event('error'));
    await expect(pending).resolves.toBeNull();
  });

  it('resolves the global api once the script loads', async () => {
    const { loadTurnstile, TURNSTILE_SCRIPT_SRC } = await freshModule();
    const pending = loadTurnstile();
    const api = { render: vi.fn(), reset: vi.fn(), remove: vi.fn() };
    (window as { turnstile?: unknown }).turnstile = api;
    document.querySelector(`script[src="${TURNSTILE_SCRIPT_SRC}"]`)!.dispatchEvent(new Event('load'));
    await expect(pending).resolves.toBe(api);
  });
});
