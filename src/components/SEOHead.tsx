import { Helmet } from "react-helmet-async";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { toJsonLd } from "@/lib/jsonLd";

interface SEOHeadProps {
  title: string;
  description: string;
  type?: "website" | "article" | "business" | "event" | "restaurant";
  imageUrl?: string;
  url?: string;
  keywords?: string[];
  structuredData?: object;
  alternateUrls?: { [key: string]: string };
  canonicalUrl?: string;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
  location?: {
    name: string;
    address: string;
    latitude?: number;
    longitude?: number;
  };
  breadcrumbs?: Array<{ name: string; url: string }>;
  /** Emit robots noindex, nofollow instead of the default index directive. */
  noindex?: boolean;
  /**
   * Explicit robots directive; wins over `noindex` when set. For a thin or
   * filtered listing that should stay out of the index while its links are
   * still followed, pass "noindex, follow". Existing `noindex` callers keep
   * "noindex, nofollow".
   */
  robots?: SEORobotsDirective;
}

export type SEORobotsDirective =
  | "noindex, follow"
  | "noindex, nofollow"
  | "index, follow";

const DEFAULT_ROBOTS =
  "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1";

export default function SEOHead({
  title,
  description,
  type = "website",
  imageUrl,
  url,
  keywords = [],
  structuredData,
  alternateUrls,
  canonicalUrl,
  author = BRAND.name,
  publishedTime,
  modifiedTime,
  location,
  breadcrumbs,
  noindex = false,
  robots,
}: SEOHeadProps) {
  const baseUrl = BRAND.baseUrl;

  // Canonical and og:url must ALWAYS be built on the production origin, never
  // on whatever host happens to be serving. The old fallback was
  // `window.location.href`, which is correct in a browser but wrong everywhere
  // else that runs this code — and the prerenderer runs it against a local
  // static server, so five routes shipped with
  // `<link rel="canonical" href="http://127.0.0.1:4178/...">` baked into
  // production HTML. A canonical pointing at an unreachable host is worse than
  // none: it tells crawlers the real URL is a duplicate of somewhere they
  // cannot fetch.
  //
  // Deriving from pathname (not href) also drops the query string, which is
  // what a canonical wants — otherwise every filtered/search permutation
  // declares itself a separate canonical URL.
  const fullUrl = url
    ? getCanonicalUrl(url)
    : typeof window !== 'undefined'
      ? getCanonicalUrl(window.location.pathname)
      : baseUrl;
  const defaultImage = `${baseUrl}${BRAND.ogImage}`;
  const image = imageUrl || defaultImage;

  // Enhanced title with branding
  const enhancedTitle = title.includes(BRAND.name)
    ? title
    : `${title} | ${BRAND.name}`;

  // Generate comprehensive keywords
  const defaultKeywords = [
    BRAND.city,
    BRAND.state,
    "local guide",
    BRAND.name,
    `${BRAND.state} attractions`,
    `${BRAND.city} events`,
  ];
  const allKeywords = [...keywords, ...defaultKeywords].join(", ");

  // Generate breadcrumb structured data
  const breadcrumbSchema = breadcrumbs
    ? {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: breadcrumbs.map((crumb, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: crumb.name,
          item: `${baseUrl}${crumb.url}`,
        })),
      }
    : null;

  // Generate location structured data
  const locationSchema = location
    ? {
        "@context": "https://schema.org",
        "@type": "Place",
        name: location.name,
        address: {
          "@type": "PostalAddress",
          streetAddress: location.address,
          addressLocality: BRAND.city,
          addressRegion: BRAND.state,
          addressCountry: BRAND.country,
        },
        ...(location.latitude &&
          location.longitude && {
            geo: {
              "@type": "GeoCoordinates",
              latitude: location.latitude,
              longitude: location.longitude,
            },
          }),
      }
    : null;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{enhancedTitle}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={allKeywords} />
      <meta name="author" content={author} />
      <meta
        name="robots"
        content={
          robots === "index, follow"
            ? DEFAULT_ROBOTS
            : robots ?? (noindex ? "noindex, nofollow" : DEFAULT_ROBOTS)
        }
      />

      {/* Canonical URL */}
      <link rel="canonical" href={canonicalUrl || fullUrl} />

      {/* Open Graph Tags */}
      <meta property="og:title" content={enhancedTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:image" content={image} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:locale" content="en_US" />
      <meta property="og:site_name" content={BRAND.name} />

      {/* Article specific tags */}
      {type === "article" && (
        <>
          {publishedTime && (
            <meta property="article:published_time" content={publishedTime} />
          )}
          {modifiedTime && (
            <meta property="article:modified_time" content={modifiedTime} />
          )}
          <meta property="article:author" content={author} />
          <meta property="article:section" content="Local Guide" />
          {keywords.map((keyword) => (
            <meta key={keyword} property="article:tag" content={keyword} />
          ))}
        </>
      )}

      {/* Twitter Card Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={enhancedTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      <meta name="twitter:image:alt" content={title} />
      <meta name="twitter:site" content={BRAND.twitter} />
      <meta name="twitter:creator" content={BRAND.twitter} />

      {/* Geographic Meta Tags */}
      <meta name="geo.region" content={`US-${BRAND.stateAbbr}`} />
      <meta name="geo.placename" content={BRAND.city} />
      <meta name="geo.position" content="41.5868;-93.6250" />
      <meta name="ICBM" content="41.5868, -93.6250" />

      {/* Mobile Optimization. NO viewport meta and NO font preconnects here
          (WP5 item 9, docs/page-plans/home.md): index.html owns both. Helmet
          appends, so a second viewport meta without viewport-fit=cover could
          win and push content under the notch, and the preconnects were
          duplicates of the ones index.html already caps at four. */}
      <meta name="format-detection" content="telephone=yes" />
      <meta name="format-detection" content="address=yes" />
      <meta name="mobile-web-app-capable" content="yes" />

      {/* Alternate URLs for different languages/regions */}
      {alternateUrls &&
        Object.entries(alternateUrls).map(([lang, url]) => (
          <link key={lang} rel="alternate" hrefLang={lang} href={url} />
        ))}

      {/* Structured Data */}
      {breadcrumbSchema && (
        <script type="application/ld+json">
          {toJsonLd(breadcrumbSchema)}
        </script>
      )}

      {locationSchema && (
        <script type="application/ld+json">
          {toJsonLd(locationSchema)}
        </script>
      )}

      {structuredData && (
        <script type="application/ld+json">
          {toJsonLd(structuredData)}
        </script>
      )}

      {/* Default Organization Structured Data */}
      <script type="application/ld+json">
        {toJsonLd({
          "@context": "https://schema.org",
          "@type": "Organization",
          "@id": `${baseUrl}/#organization`,
          "name": BRAND.name,
          "url": baseUrl,
          "logo": {
            "@type": "ImageObject",
            "url": `${baseUrl}${BRAND.logo}`
          },
          // WEB-SEO-023: this asserted Facebook, X and Instagram profiles on the
          // OLD brand's handle, under the new brand's name. sameAs is a
          // machine-readable identity claim, so the property is OMITTED rather
          // than emitted empty until BRAND.social has real URLs in it.
          ...(BRAND.social.length > 0 ? { sameAs: [...BRAND.social] } : {}),
        })}
      </script>

      {/* WEB-SEO-029: the WebSite node used to be emitted HERE, on all 30 pages
          that mount SEOHead, with a SearchAction target of
          /events?search={search_term_string} - a parameter EventsPage does not
          read (it reads 'q'). Two problems in one node: a sitelinks search box
          would have landed on an unfiltered list, and a WebSite node repeated
          on every page contradicts the one Index.tsx publishes. WebSite
          describes the SITE, so it belongs on the home page once. It now lives
          only in Index.tsx, pointing at /search?q=, which SearchResults.tsx
          honours. Do not re-add it here. */}

      {/* Additional Meta for Search Engines */}
      {/* WEB-QUAL-007: theme-color lives in index.html as a light/dark pair.
          Helmet APPENDS rather than replaces, so emitting one here put a second
          (and differently-coloured) theme-color in the DOM on every route.
          msapplication-TileColor stays - it is the Windows tile, a real solid
          brand colour rather than a match for the page background. */}
      <meta name="msapplication-TileColor" content={BRAND.themeColor} />
      <meta name="application-name" content={BRAND.name} />
      <meta name="apple-mobile-web-app-title" content={BRAND.shortName} />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    </Helmet>
  );
}
