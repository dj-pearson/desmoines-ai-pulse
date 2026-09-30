import { BRAND, getCanonicalUrl } from '@/lib/brandConfig';

/**
 * A CollectionPage node for a hub whose content can be empty.
 *
 * The prerender's strict gate refuses to publish a hub page that carries no
 * JSON-LD, because that is how it tells "this page rendered as itself" from
 * the SPA shell. /deals only emitted JSON-LD when it had deals, and /map and
 * /itineraries never did, so all three failed the production build whenever
 * their lists were empty. This node describes the page itself, which is true
 * whether or not the list has anything in it.
 */
export function collectionPageJsonLd(page: { name: string; description: string; path: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: page.name,
    description: page.description,
    url: getCanonicalUrl(page.path),
    isPartOf: { '@type': 'WebSite', name: BRAND.name, url: BRAND.baseUrl },
  };
}
