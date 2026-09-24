/**
 * Serialise a value for an inline <script type="application/ld+json"> block.
 *
 * A bare JSON.stringify is not safe there. The HTML parser ends a script
 * element at the first "</script" it sees, whatever the JSON around it says, so
 * a string value holding "</script><script>..." breaks out and runs. Event
 * pages feed AI-written geo_faq text into FAQSection, which put that one row
 * away from an injection (WP5 item 7, docs/page-plans/home.md).
 *
 * Escaping "<" and ">" as < / > keeps the JSON identical to a parser
 * while leaving the HTML parser nothing to match. U+2028 and U+2029 are valid
 * inside a JSON string but are line terminators in older JS engines, so they
 * are escaped too. "&" is escaped for the same reason React escapes it in text.
 *
 * scripts/__tests__/json-ld-escape.test.mjs fails if an ld+json script in src/
 * is fed a bare JSON.stringify again.
 */
export function toJsonLd(value: unknown): string {
  // JSON.stringify(undefined) is undefined, not a string.
  return (JSON.stringify(value) ?? "null")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
