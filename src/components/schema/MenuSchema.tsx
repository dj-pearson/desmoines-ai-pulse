import { Helmet } from 'react-helmet-async';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { toJsonLd } from '@/lib/jsonLd';
import { MenuSection } from '@/hooks/useRestaurantMenu';
import { isMenuStale } from '@/lib/menuAge';

interface MenuSchemaProps {
  restaurantName: string;
  restaurantSlug: string;
  restaurantDescription?: string;
  city?: string;
  cuisine?: string;
  sections: MenuSection[];
  capturedAt?: string;
}

/**
 * Schema.org Menu structured data for "[restaurant] + menu" search queries.
 * Outputs both a Menu schema and individual MenuSection/MenuItem schemas
 * to maximize visibility in search results.
 */
export function MenuSchema({
  restaurantName,
  restaurantSlug,
  restaurantDescription,
  city = 'Des Moines',
  cuisine,
  sections,
  capturedAt,
}: MenuSchemaProps) {
  // WEB-SEO-023. These were hard-coded to the OLD brand domain, so the Menu's
  // @id, its url and its mainEntityOfPage all identified a host this site does
  // not serve -- on every restaurant page that has a menu. @id is how a crawler
  // reconciles one entity across pages; pointing it at another origin is not a
  // broken link, it is a different entity.
  const restaurantUrl = getCanonicalUrl(`/restaurants/${restaurantSlug}`);
  const menuUrl = `${restaurantUrl}#menu`;

  // WEB-BE-071. Past MENU_STALE_AFTER_DAYS the page collapses the menu behind a
  // link to the restaurant's own, and the structured data stops stating prices:
  // an Offer is a claim that the dish costs this today. Names stay, so the
  // Menu entity is not emptied, but no item carries an offers block.
  const publishPrices = !isMenuStale(capturedAt);

  // Build Menu schema with sections and items
  const menuSchema = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': menuUrl,
    name: `${restaurantName} Menu`,
    description: `Full menu for ${restaurantName}${cuisine ? `, a ${cuisine} restaurant` : ''} in ${city}, Iowa. Browse ${sections.reduce((sum, s) => sum + s.items.length, 0)} menu items${publishPrices ? ' with prices' : ''}.`,
    url: menuUrl,
    mainEntityOfPage: restaurantUrl,
    ...(capturedAt && { dateModified: capturedAt }),
    inLanguage: 'en-US',
    hasMenuSection: sections.map((section) => ({
      '@type': 'MenuSection',
      name: section.name,
      numberOfItems: section.items.length,
      hasMenuItem: section.items.map((item) => ({
        '@type': 'MenuItem',
        name: item.item_name,
        ...(item.item_description && { description: item.item_description }),
        ...(publishPrices && item.price && {
          offers: {
            '@type': 'Offer',
            price: item.price_numeric || item.price,
            priceCurrency: 'USD',
            ...(item.price && { priceSpecification: {
              '@type': 'PriceSpecification',
              price: item.price_numeric || item.price,
              priceCurrency: 'USD',
            }}),
          },
        }),
        // No suitableForDiet (WEB-BE-072). dietary_tags are what a scraper read
        // off the restaurant's menu, and they were partly inferred from dish
        // text. Publishing them as GlutenFreeDiet makes this site the one
        // asserting a dish is safe for someone with celiac disease, to search
        // engines that show it with no "confirm with the restaurant" beside it.
        // The page shows the badges with that caveat; the structured data does
        // not carry them at all.
      })),
    })),
  };

  // Supplementary ItemList schema for menu items (helps with rich snippets)
  const popularItems = sections
    .flatMap((s) => s.items)
    .filter((item) => item.is_popular)
    .slice(0, 10);

  const itemListSchema = popularItems.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Popular Menu Items at ${restaurantName}`,
    description: `Most popular dishes at ${restaurantName} in ${city}, Iowa`,
    url: menuUrl,
    numberOfItems: popularItems.length,
    itemListElement: popularItems.map((item, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: item.item_name,
      ...(item.item_description && { description: item.item_description }),
    })),
  } : null;

  // item_name and item_description are scraped or AI-extracted. toJsonLd
  // escapes "<", so a closing script tag in a description cannot end the block.
  return (
    <Helmet>
      <script type="application/ld+json">{toJsonLd(menuSchema)}</script>
      {itemListSchema && (
        <script type="application/ld+json">{toJsonLd(itemListSchema)}</script>
      )}
    </Helmet>
  );
}
