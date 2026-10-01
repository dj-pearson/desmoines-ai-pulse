import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openExternalUrl, toSafeExternalUrl } from '@/lib/capacitorUtils';

/**
 * openExternalUrl is the one place scraped `source_url` values and advertiser
 * `link_url` values leave the site. Before this guard it handed any string to
 * window.open / Browser.open, so a `javascript:` link from a scraper or a
 * creative ran in our origin on click (Home plan WP4).
 */

const REFUSED: Array<[unknown, string]> = [
  ['javascript:alert(1)', 'javascript'],
  ['  JavaScript:alert(1)', 'javascript, mixed case and padded'],
  ['data:text/html,<script>alert(1)</script>', 'data'],
  ['vbscript:msgbox(1)', 'vbscript'],
  ['file:///etc/passwd', 'file'],
  ['intent://scan/#Intent;scheme=zxing;end', 'android intent'],
  ['mailto:someone@example.com', 'mailto'],
  ['/events/123', 'relative path'],
  ['//evil.example', 'protocol-relative'],
  ['not a url', 'garbage'],
  ['', 'empty'],
  ['   ', 'whitespace'],
  [null, 'null'],
  [undefined, 'undefined'],
  [42, 'number'],
];

const ALLOWED: Array<[string, string]> = [
  ['https://www.catchdesmoines.com/event/x', 'https://www.catchdesmoines.com/event/x'],
  ['http://example.com', 'http://example.com/'],
  ['  https://example.com/a?b=1  ', 'https://example.com/a?b=1'],
];

describe('toSafeExternalUrl', () => {
  it.each(REFUSED)('refuses %s (%s)', (input) => {
    expect(toSafeExternalUrl(input)).toBeNull();
  });

  it.each(ALLOWED)('allows %s', (input, expected) => {
    expect(toSafeExternalUrl(input)).toBe(expected);
  });
});

describe('openExternalUrl', () => {
  let openSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
  });

  afterEach(() => {
    openSpy.mockRestore();
    delete window.Capacitor;
  });

  it('returns false and opens nothing for javascript:alert(1)', async () => {
    await expect(openExternalUrl('javascript:alert(1)')).resolves.toBe(false);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('does not hand a refused URL to the Capacitor Browser plugin', async () => {
    const browserOpen = vi.fn().mockResolvedValue(undefined);
    window.Capacitor = {
      isNativePlatform: () => true,
      getPlatform: () => 'ios',
      Plugins: { Browser: { open: browserOpen, close: vi.fn() } },
    };
    await expect(openExternalUrl('data:text/html,x')).resolves.toBe(false);
    expect(browserOpen).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('opens an https URL in a new tab without opener', async () => {
    await expect(openExternalUrl('https://example.com/x')).resolves.toBe(true);
    expect(openSpy).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer');
  });
});
