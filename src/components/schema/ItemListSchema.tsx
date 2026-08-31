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
 *
 * ON `itemType` (SEO-022). Without it every element is a bare ListItem, which
 * says a page lists *things* and nothing about what kind. /outdoors lists parks
 * and trails and /breweries lists breweries, and a crawler that can read that
 * off the markup does not have to infer it from the copy. Passing it nests a
 * typed node under `item`, which is schema.org's documented shape for a summary
 * page whose entries link elsewhere. Omitting it keeps the original output
 * byte for byte, so the pages already using this component are untouched.
 */

interface ItemListItem {
  name: string;
  url: string;
  position?: number;
  image?: string;
  description?: string;
  /**
   * Extra properties merged into the nested typed node — address, geo, and
   * the like. Ignored unless `itemType` is set, because there is no node to
   * merge them into otherwise.
   */
  itemProps?: Record<string, unknown>;
}

interface ItemListSchemaProps {
  name?: string;
  description?: string;
  items: ItemListItem[];
  itemListOrder?: "Ascending" | "Descending" | "Unordered";
  /** schema.org type of the things listed, e.g. "Place" or "Event". */
  itemType?: string;
}

export default function ItemListSchema({
  name,
  description,
  items,
  itemListOrder = "Ascending",
  itemType,
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
    itemListElement: items.map((item, index) =>
      itemType
        ? {
            "@type": "ListItem",
            position: item.position || index + 1,
            item: {
              "@type": itemType,
              name: item.name,
              url: item.url,
              ...(item.image && { image: item.image }),
              ...(item.description && { description: item.description }),
              ...(item.itemProps ?? {}),
            },
          }
        : {
            "@type": "ListItem",
            position: item.position || index + 1,
            name: item.name,
            url: item.url,
            ...(item.image && { image: item.image }),
            ...(item.description && { description: item.description }),
          },
    ),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </Helmet>
  );
}
