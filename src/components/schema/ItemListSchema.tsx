import { Helmet } from "react-helmet-async";

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
  numberOfItems?: number;
}

export default function ItemListSchema({
  name,
  description,
  items,
  itemListOrder = "Ascending",
  numberOfItems,
}: ItemListSchemaProps) {
  const schema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    ...(name && { name }),
    ...(description && { description }),
    itemListOrder: `https://schema.org/ItemListOrder${itemListOrder}`,
    numberOfItems: numberOfItems || items.length,
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
