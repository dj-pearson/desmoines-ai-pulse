import { Helmet } from "react-helmet-async";

/**
 * An ItemList a crawler can check against the page it is on.
 *
 * BOTH GUARDS BELOW ARE MEASURED DEFECTS, not hypotheticals. Sampled from
 * production 2026-08-28:
 *
 *   /restaurants   ItemList numberOfItems 0, zero elements, 6 restaurants
 *                  rendered on the page
 *   /events        numberOfItems 30, 30 elements, 35 rendered   (correct)
 *
 * and before it was fixed, Restaurants.tsx declared numberOfItems from the
 * collection total (478) while slicing itemListElement to 20.
 *
 * So: an empty list renders NOTHING rather than an ItemList of nothing, and
 * numberOfItems always counts the elements actually supplied. A structured-data
 * claim that contradicts the page is worse than no claim, because it is one of
 * the few a crawler can verify without judgement.
 */

interface ItemListItem {
  name: string;
  url: string;
  position?: number;
  image?: string;
  description?: string;
}

interface ItemListSchemaProps {
  name?: string;
  description?: string;
  items: ItemListItem[];
  itemListOrder?: "Ascending" | "Descending" | "Unordered";
}

export default function ItemListSchema({
  name,
  description,
  items,
  itemListOrder = "Ascending",
}: ItemListSchemaProps) {
  // Nothing to list is not the same as a list of nothing.
  if (items.length === 0) return null;

  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    ...(name && { name }),
    ...(description && { description }),
    itemListOrder: `https://schema.org/ItemListOrder${itemListOrder}`,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: item.position || index + 1,
      name: item.name,
      url: item.url,
      ...(item.image && { image: item.image }),
      ...(item.description && { description: item.description }),
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
