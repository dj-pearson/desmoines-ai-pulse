import { Helmet } from "react-helmet-async";

export interface BreadcrumbItem {
  name: string;
  url: string;
}

interface BreadcrumbListSchemaProps {
  items: BreadcrumbItem[];
}

/**
 * BreadcrumbList Structured Data Component
 *
 * Displays breadcrumb navigation in search results as rich snippets.
 * Increases CTR by 10-30% and helps search engines understand site hierarchy.
 *
 * @example
 * <BreadcrumbListSchema
 *   items={[
 *     { name: "Home", url: "https://desmoinesinsider.com" },
 *     { name: "Events", url: "https://desmoinesinsider.com/events" },
 *     { name: "Weekend Events", url: "https://desmoinesinsider.com/events/weekend" }
 *   ]}
 * />
 */
export const BreadcrumbListSchema = ({ items }: BreadcrumbListSchemaProps) => {
  // Don't render if less than 2 items (need at least Home + current page)
  if (!items || items.length < 2) {
    return null;
  }

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": items.map((item, index) => ({
      "@type": "ListItem",
      "position": index + 1,
      "name": item.name,
      "item": item.url
    }))
  };

  return (
    <Helmet>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbSchema)}
      </script>
    </Helmet>
  );
};

/**
 * Hook to generate breadcrumb items based on current path
 *
 * @param pathname - Current window.location.pathname
 * @param customItems - Optional custom breadcrumb items
 * @returns Array of breadcrumb items
 */
export const useBreadcrumbs = (
  pathname: string,
  customItems?: BreadcrumbItem[]
): BreadcrumbItem[] => {
  const baseUrl = "https://desmoinesinsider.com";

  // If custom items provided, use those
  if (customItems && customItems.length > 0) {
    return [
      { name: "Home", url: baseUrl },
      ...customItems
    ];
  }

  // Auto-generate from pathname
  const breadcrumbs: BreadcrumbItem[] = [
    { name: "Home", url: baseUrl }
  ];

  const pathParts = pathname.split('/').filter(part => part.length > 0);

  let currentPath = '';
  pathParts.forEach((part, index) => {
    currentPath += `/${part}`;

    // Convert path part to readable name
    const name = part
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    breadcrumbs.push({
      name,
      url: `${baseUrl}${currentPath}`
    });
  });

  return breadcrumbs;
};
