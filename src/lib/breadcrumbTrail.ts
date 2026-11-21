import { getCanonicalUrl } from "@/lib/brandConfig";

/**
 * One breadcrumb: the label a reader sees and the site path it links to.
 * The visible trail and the BreadcrumbList JSON-LD are both built from the
 * same list (WEB-SEO-048), so they cannot describe different hierarchies.
 */
export interface Crumb {
  name: string;
  path: string;
}

export const HOME_CRUMB: Crumb = { name: "Home", path: "/" };

/** The trail with Home first, added only when the caller left it out. */
export function withHome(crumbs: readonly Crumb[]): Crumb[] {
  return crumbs[0]?.path === "/" ? [...crumbs] : [HOME_CRUMB, ...crumbs];
}

export interface BreadcrumbListItem {
  "@type": "ListItem";
  position: number;
  name: string;
  item: string;
}

/**
 * itemListElement for a BreadcrumbList. Every item carries an absolute URL on
 * the brand domain; a relative or empty `item` makes Google drop the whole
 * trail, not just the bad entry.
 */
export function breadcrumbListItems(crumbs: readonly Crumb[]): BreadcrumbListItem[] {
  return withHome(crumbs).map((crumb, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: crumb.name,
    item: getCanonicalUrl(crumb.path),
  }));
}
