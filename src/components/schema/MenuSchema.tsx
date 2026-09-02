import { Helmet } from 'react-helmet-async';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { MenuSection } from '@/hooks/useRestaurantMenu';

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

  // Build Menu schema with sections and items
  const menuSchema = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': menuUrl,
    name: `${restaurantName} Menu`,
    description: `Full menu for ${restaurantName}${cuisine ? `, a ${cuisine} restaurant` : ''} in ${city}, Iowa. Browse ${sections.reduce((sum, s) => sum + s.items.length, 0)} menu items with prices and dietary information.`,
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
        ...(item.price && {
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
        ...(item.dietary_tags.length > 0 && {
          suitableForDiet: item.dietary_tags.map((tag) => {
            switch (tag) {
              case 'vegan': return 'https://schema.org/VeganDiet';
              case 'vegetarian': return 'https://schema.org/VegetarianDiet';
              case 'gluten-free': return 'https://schema.org/GlutenFreeDiet';
              case 'kosher': return 'https://schema.org/KosherDiet';
              case 'halal': return 'https://schema.org/HalalDiet';
              default: return tag;
            }
          }),
        }),
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

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(menuSchema)}</script>
      {itemListSchema && (
        <script type="application/ld+json">{JSON.stringify(itemListSchema)}</script>
      )}
    </Helmet>
  );
}
