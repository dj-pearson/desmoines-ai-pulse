/**
 * The `fetchpriority` image attribute, spelled the way React 18 will pass it
 * through without complaining (WEB-QUAL-012).
 *
 * React 19 knows `fetchPriority` as a DOM prop. React 18.3, which this app is
 * on, does not: it lowercases the unknown prop, passes it to the DOM anyway,
 * and warns "React does not recognize the fetchPriority prop on a DOM element
 * ... spell it as lowercase fetchpriority instead" - once per render, on every
 * page. MEASURED BEFORE CHANGING ANYTHING: the attribute does reach the DOM
 * (2 of 3 images on the home page carry a lowercase fetchpriority, values high
 * and low), so the priority hint works and this is warning noise rather than a
 * broken LCP hint. It is worth clearing anyway: a warning on every route is
 * what hides the next one that matters.
 *
 * Components keep `fetchPriority` in their own props - camelCase is the
 * React-idiomatic spelling for an API - and use this only at the point the
 * value reaches a real <img>.
 *
 * On React 19 this stays correct: `fetchpriority` is still a valid HTML
 * attribute. Switching back to the camelCase prop is a tidy-up for whoever
 * does that upgrade, not a requirement.
 */
export type FetchPriority = 'high' | 'low' | 'auto';

export function fetchPriorityAttr(
  value: FetchPriority | undefined,
): Record<string, string> {
  return value ? { fetchpriority: value } : {};
}
