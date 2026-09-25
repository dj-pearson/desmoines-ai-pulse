import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";
import { toJsonLd } from "@/lib/jsonLd";

interface SpeakableSchemaProps {
  name: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  speakableCssSelectors?: string[];
  /** What the page is about, e.g. a schema.org City node. */
  about?: Record<string, unknown>;
}

export default function SpeakableSchema({
  name,
  description,
  url,
  datePublished,
  dateModified,
  speakableCssSelectors = ["[data-speakable]", "h1", "h2", "[role='main'] > p:first-of-type"],
  about,
}: SpeakableSchemaProps) {
  // One graph, not three strangers (WP5 item 8, docs/page-plans/home.md).
  // The publisher and the site are REFERENCES by @id to the nodes SEOHead
  // (Organization, every page) and the home page (WebSite) publish, not
  // fresh inline copies a parser has to guess are the same entity.
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name,
    description,
    url,
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    ...(about && { about }),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: speakableCssSelectors,
    },
    isPartOf: {
      "@type": "WebSite",
      "@id": `${BRAND.baseUrl}/#website`,
      name: BRAND.name,
      url: BRAND.baseUrl,
    },
    publisher: { "@id": `${BRAND.baseUrl}/#organization` },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{toJsonLd(schema)}</script>
    </Helmet>
  );
}
