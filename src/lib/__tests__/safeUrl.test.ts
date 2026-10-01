import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { safeHttpUrl } from '../safeUrl';

describe('safeHttpUrl', () => {
  it('refuses javascript:, data:, file: and other non-web schemes', () => {
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('  JavaScript:alert(1)')).toBeNull();
    expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHttpUrl('file:///etc/passwd')).toBeNull();
    expect(safeHttpUrl('mailto:owner@example.com')).toBeNull();
    expect(safeHttpUrl('tel:5155550100')).toBeNull();
  });

  it('prefixes https:// on a bare host', () => {
    expect(safeHttpUrl('www.x.com')).toBe('https://www.x.com/');
    expect(safeHttpUrl('nocedsm.com/menu')).toBe('https://nocedsm.com/menu');
  });

  it('keeps http and https URLs', () => {
    expect(safeHttpUrl('https://nocedsm.com')).toBe('https://nocedsm.com/');
    expect(safeHttpUrl('http://example.com/a?b=1')).toBe('http://example.com/a?b=1');
  });

  it('is null for empty, relative or non-string values', () => {
    expect(safeHttpUrl('')).toBeNull();
    expect(safeHttpUrl('   ')).toBeNull();
    expect(safeHttpUrl('/restaurants')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
  });

  it('has no imports, so the Pages middleware can bundle it by relative path', () => {
    const src = readFileSync(join(__dirname, '..', 'safeUrl.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
  });
});
