/**
 * HTML escaping utility for edge functions that generate HTML content
 * (email templates, webhook payloads, etc.)
 *
 * Prevents XSS by converting dangerous characters to their HTML entity equivalents.
 */

/**
 * Escape a string for safe inclusion in HTML content.
 * Converts &, <, >, ", and ' to HTML entities.
 */
export function escapeHtml(text: string | null | undefined): string {
  if (text == null) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Escape a string for safe use in an HTML attribute value.
 * Same as escapeHtml but also escapes backticks.
 */
export function escapeHtmlAttr(text: string | null | undefined): string {
  if (text == null) return '';
  return escapeHtml(text).replace(/`/g, '&#x60;');
}
