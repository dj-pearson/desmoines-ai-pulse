import { Helmet } from "react-helmet-async";

interface WebSiteSchemaProps {
  name?: string;
  url?: string;
  description?: string;
  searchUrl?: string;
}

export default function WebSiteSchema({
  name = "Des Moines AI Pulse",
  url = "https://desmoinesaipulse.com",
  description = "Discover the best events, restaurants, attractions, and playgrounds in Des Moines, Iowa. AI-powered recommendations and real-time updates.",
  searchUrl = "https://desmoinesaipulse.com/search?q={search_term_string}",
}: WebSiteSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url,
    description,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: searchUrl,
      },
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
