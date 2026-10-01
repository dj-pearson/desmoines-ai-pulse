import { useEffect } from "react";

const SUFFIX = " | Des Moines Insider";

/**
 * Set document.title on a page that has NO head component.
 *
 * WEB-SEO-028. Two things about this hook were wrong, and the first one is why
 * the second went unnoticed for so long.
 *
 * IT MUST NOT SHARE A PAGE WITH A HELMET TITLE. Seven pages called it while
 * also rendering SEOHead or LocalSEO, and the hook won: measured on the built
 * site, /neighborhoods/ankeny shipped <title>"Ankeny Guide"</title> beside
 * og:title "Ankeny Events, Restaurants & Attractions", and /events/ankeny
 * shipped "Events in Ankeny" beside "Ankeny Events - Things To Do". One page,
 * two titles, going to different consumers - Google reads the first, every
 * social and AI crawler reads the second. Which one a prerender captures comes
 * down to effect-versus-render ordering. scripts/check-document-title.mjs now
 * fails the build on that pairing; the seven call sites are gone.
 *
 * IT NO LONGER RESTORES THE PREVIOUS TITLE ON UNMOUNT. The cleanup used to
 * write back whatever document.title held when the effect ran. In a router
 * there is nothing to restore to: React can unmount the outgoing page AFTER
 * the incoming one has set its title, so the cleanup overwrites the new page's
 * title with the old page's. The next page always sets its own, and the ones
 * that do not have no title to be restored to either.
 *
 * Use it on pages with no head component - admin screens, auth callbacks,
 * dashboards. A page a crawler should read wants SEOHead instead, which sets
 * the canonical, the description and the OG set as well as the title.
 */
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title}${SUFFIX}`;
  }, [title]);
}
