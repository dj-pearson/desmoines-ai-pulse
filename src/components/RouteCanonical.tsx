import { Helmet } from "react-helmet-async";
import { getCanonicalUrl } from "@/lib/brandConfig";

interface RouteCanonicalProps {
  /** Site-relative path, e.g. `/restaurants/bonchon`. Built from route params. */
  path: string;
}

/**
 * The canonical tag for a detail page, emitted from the ROUTE rather than from
 * loaded data.
 *
 * SEO-028. Every detail page put its canonical inside <SEOHead>, which renders
 * only after the entity resolves. The `if (isLoading)` branch above it returns a
 * skeleton with no canonical at all. That is fine in a browser, where the fetch
 * finishes and Helmet fills the head in. It is not fine under prerendering: the
 * capture can land while the fetch is still in flight, the page has no canonical,
 * and the strict prerender gate correctly refuses to publish it - so the page
 * ships as an SPA shell instead.
 *
 * SEO-027 measured what that costs. A clean build refused 7 of the top 100
 * entity pages for `no canonical`, including /restaurants/bonchon, the
 * highest-impression URL on the site at 10,473. An idle run of the same tree
 * rendered 100/100. So the pages that drop are not the broken ones, they are
 * whichever ones happened to be in flight when the machine was busiest - and the
 * busier the build, the more of them there are.
 *
 * The slug is a route param. It is known synchronously, before any request is
 * made, so the canonical never needs to wait for anything.
 *
 * THE RULE IS ONE CANONICAL PER RENDER, not "only in the loading branch".
 * On a detail page those are the same instruction: SEOHead emits a canonical
 * once the entity resolves, so this belongs in the early-returning loading
 * branch where SEOHead cannot also be mounted. On a page whose only head block
 * is route-derived - /best-of/:category, which had no canonical at all and so
 * inherited the SPA shell's (WEB-SEO-035) - render it unconditionally.
 * Last-one-wins in react-helmet-async means two of these on one page is a
 * coin toss, not a duplicate tag, which is why the count matters and the
 * placement only follows from it.
 */
export function RouteCanonical({ path }: RouteCanonicalProps) {
  // A missing param would produce ".../restaurants/undefined" and assert a
  // canonical for a URL that does not exist. Emitting nothing is the safer
  // failure: the gate then refuses the page, which is the current behaviour.
  if (!path || path.includes("undefined") || path.endsWith("/")) return null;

  return (
    <Helmet>
      <link rel="canonical" href={getCanonicalUrl(path)} />
    </Helmet>
  );
}

export default RouteCanonical;
