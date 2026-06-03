import { describe, it, expect } from 'vitest';
import { SecurityUtils } from '../securityUtils';

/**
 * PROD-SEC-008 — rich HTML sanitization for database-sourced content rendered
 * via dangerouslySetInnerHTML (newsletter bodies, feedback message threads).
 * Must strip active content (scripts, event handlers, javascript: URLs, style)
 * while preserving normal formatting (headings, images, lists, links).
 */
describe('SecurityUtils.sanitizeRichHTML', () => {
  it('removes <script> tags', () => {
    const out = SecurityUtils.sanitizeRichHTML('<p>hi</p><script>alert(1)</script>');
    expect(out).toContain('hi');
    expect(out.toLowerCase()).not.toContain('<script');
  });

  it('strips inline event-handler attributes (onerror) but keeps the element', () => {
    const out = SecurityUtils.sanitizeRichHTML('<img src="x" onerror="alert(1)">');
    expect(out.toLowerCase()).toContain('<img');
    expect(out.toLowerCase()).not.toContain('onerror');
  });

  it('neutralizes javascript: URLs in links', () => {
    const out = SecurityUtils.sanitizeRichHTML('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('forbids <style> blocks', () => {
    const out = SecurityUtils.sanitizeRichHTML('<style>body{display:none}</style><p>ok</p>');
    expect(out.toLowerCase()).not.toContain('<style');
    expect(out).toContain('ok');
  });

  it('preserves common rich formatting (headings, images, lists, links)', () => {
    const input =
      '<h2>Title</h2><strong>bold</strong><ul><li>a</li></ul>' +
      '<img src="https://cdn.example.com/x.png" alt="x"><a href="https://example.com">link</a>';
    const out = SecurityUtils.sanitizeRichHTML(input);
    expect(out.toLowerCase()).toContain('<h2');
    expect(out.toLowerCase()).toContain('<strong');
    expect(out.toLowerCase()).toContain('<li');
    expect(out.toLowerCase()).toContain('<img');
    expect(out).toContain('https://example.com');
  });
});
