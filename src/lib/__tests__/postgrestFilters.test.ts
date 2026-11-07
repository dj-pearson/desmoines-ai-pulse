// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sanitizePostgrestPattern } from '@/lib/postgrestPattern';
import { checkSource, run } from '../../../scripts/check-postgrest-filters.mjs';

/**
 * A search for "Bar, Grill" in `.or(`name.ilike.%${q}%,...`)` made PostgREST
 * answer 400 "failed to parse logic tree" on ten search boxes. These cover the
 * sanitizer and the guard that keeps the unsanitized shape from coming back.
 */
describe('sanitizePostgrestPattern', () => {
  it('removes the characters that end or group an or() clause', () => {
    for (const input of ['Bar, Grill', 'Bar (Grill)', 'a,b(c)d*e']) {
      const out = sanitizePostgrestPattern(input);
      expect(out, input).not.toMatch(/[,()*]/);
    }
    expect(sanitizePostgrestPattern('Bar, Grill')).toBe('Bar Grill');
    expect(sanitizePostgrestPattern('Ankeny, IA')).toBe('Ankeny IA');
  });

  it('keeps apostrophes so "Casey\'s Center" still matches', () => {
    expect(sanitizePostgrestPattern("Casey's Center")).toBe("Casey's Center");
  });

  it('escapes LIKE wildcards and sanitizes punctuation-only input to empty', () => {
    expect(sanitizePostgrestPattern('50% off')).toBe('50\\% off');
    expect(sanitizePostgrestPattern(',()')).toBe('');
  });
});

describe('check-postgrest-filters', () => {
  it('flags a raw value in an or() ilike pattern', () => {
    const src = `
      function f(search: string) {
        return q.or(\`name.ilike.%\${search}%,email.ilike.%\${search}%\`);
      }`;
    const problems = checkSource(src);
    expect(problems).toHaveLength(2);
    expect(problems[0]).toMatchObject({ line: 3, expression: 'search' });
  });

  it('flags member expressions and the * wildcard form', () => {
    const src = `const a = \`name.ilike.%\${filters.search}%\`; const b = \`title.ilike.*\${x}*\`;`;
    expect(checkSource(src).map((p: { expression: string }) => p.expression)).toEqual([
      'filters.search',
      'x',
    ]);
  });

  it('accepts a direct sanitizer call', () => {
    const src = 'const s = `name.ilike.%${sanitizePostgrestPattern(q)}%`;';
    expect(checkSource(src)).toEqual([]);
  });

  it('accepts a variable assigned from the sanitizer in the same function', () => {
    const src = `
      function f(search?: string) {
        const safe = search ? sanitizePostgrestPattern(search) : '';
        if (safe) q.or(\`name.ilike.%\${safe}%\`);
      }`;
    expect(checkSource(src)).toEqual([]);
  });

  it('does not accept a same-named variable from another function', () => {
    const src = `
      function a(x: string) { const safe = sanitizePostgrestPattern(x); return safe; }
      function b(safe: string) { return \`name.ilike.%\${safe}%\`; }`;
    expect(checkSource(src)).toHaveLength(1);
  });

  it('accepts a callback parameter iterating over sanitized values', () => {
    const src = `
      function f(terms: string[]) {
        const safe = terms.map((t) => sanitizePostgrestPattern(t));
        return safe.map((t) => \`name.ilike.%\${t}%\`).join(',');
      }`;
    expect(checkSource(src)).toEqual([]);
  });

  it('accepts a postgrest-safe annotation with a reason, and not a bare one', () => {
    const ok = `
      // postgrest-safe: fixed keyword list
      const c = KEYWORDS.map((k) => \`name.ilike.%\${k}%\`);`;
    expect(checkSource(ok)).toEqual([]);
    const bare = `
      // postgrest-safe:
      const c = KEYWORDS.map((k) => \`name.ilike.%\${k}%\`);`;
    expect(checkSource(bare)).toHaveLength(1);
  });

  it('ignores value positions and the .ilike() method form', () => {
    const src = `
      q.or(\`user_id.eq.\${user.id},end_date.gte.\${nowIso}\`);
      q.ilike('name', \`%\${term}%\`);`;
    expect(checkSource(src)).toEqual([]);
  });

  it('finds nothing unsanitized in src/', () => {
    const { files, findings } = run('src');
    expect(files).toBeGreaterThan(100);
    expect(findings).toEqual([]);
  });
});
