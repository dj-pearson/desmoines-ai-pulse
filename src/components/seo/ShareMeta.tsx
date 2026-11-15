import { Helmet } from "react-helmet-async";
import { getCanonicalUrl } from "@/lib/brandConfig";

interface ShareMetaProps {
  /** The page's own <title> text, used as-is. */
  title: string;
  /** The page's own meta description, used as-is. */
  description: string;
  /** Site-relative path of this page, the same one RouteCanonical is given. */
  path: string;
}

/**
 * Open Graph and Twitter text for a detail page that writes its own Helmet
 * instead of mounting SEOHead (WEB-SEO-071).
 *
 * index.html marks its og:title, og:description, twitter:title and
 * twitter:description with data-rh, so react-helmet-async deletes them the
 * moment a page renders any meta of its own. A page that wrote only <title>
 * and a description therefore shipped with no og:title, no og:url and no
 * twitter text at all: venue, team, trail, hotels-near-venue and event-series
 * pages, every one of them sitemapped. A share or a link unfurl had to guess.
 *
 * Why not SEOHead: it also stamps the downtown geo.position on every page
 * (wrong for a Waukee trail, see WEB-SEO-050), an Organization node and a
 * second canonical next to RouteCanonical. These pages already have their
 * canonical and their JSON-LD; they were missing only this.
 *
 * ONLY the four data-rh tags plus og:url. og:type, og:site_name, og:image,
 * twitter:card and twitter:image in the shell carry no data-rh, so Helmet
 * leaves them in place; emitting any of them here would put two in the head,
 * and scrapers read the first, which is the shell's. Their shell values
 * (website, the brand name, the brand card) are right for these pages.
 */
export function ShareMeta({ title, description, path }: ShareMetaProps) {
  const url = getCanonicalUrl(path);
  return (
    <Helmet>
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}

export default ShareMeta;
