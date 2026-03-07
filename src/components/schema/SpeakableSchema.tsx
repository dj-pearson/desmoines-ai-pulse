import { Helmet } from "react-helmet-async";
import { BRAND } from "@/lib/brandConfig";

interface SpeakableSchemaProps {
  name: string;
  description: string;
  url: string;
  datePublished?: string;
  dateModified?: string;
  speakableCssSelectors?: string[];
}

export default function SpeakableSchema({
  name,
  description,
  url,
  datePublished,
  dateModified,
  speakableCssSelectors = ["[data-speakable]", "h1", "h2", "[role='main'] > p:first-of-type"],
}: SpeakableSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name,
    description,
    url,
    ...(datePublished && { datePublished }),
    ...(dateModified && { dateModified }),
    speakable: {
      "@type": "SpeakableSpecification",
      cssSelector: speakableCssSelectors,
    },
    isPartOf: {
      "@type": "WebSite",
      name: BRAND.name,
      url: BRAND.baseUrl,
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.name,
      url: BRAND.baseUrl,
      logo: {
        "@type": "ImageObject",
        url: `${BRAND.baseUrl}${BRAND.logo}`,
      },
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
