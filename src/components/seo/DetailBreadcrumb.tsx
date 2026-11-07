import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { toJsonLd } from "@/lib/jsonLd";
import { breadcrumbListItems, withHome, type Crumb } from "@/lib/breadcrumbTrail";
import { cn } from "@/lib/utils";

interface DetailBreadcrumbProps {
  /** Ancestors then the current page, without Home (it is added). */
  crumbs: Crumb[];
  className?: string;
}

/**
 * WEB-SEO-048. The visible breadcrumb and its BreadcrumbList, from one list.
 *
 * Venue, trail, team, guide and hotels-near-venue pages each drew a breadcrumb
 * nav and published no BreadcrumbList, so the hierarchy a reader saw never
 * reached a search result or an AI answer. Rendering both from the same
 * `crumbs` is what keeps them equal; a schema written beside a hand-built nav
 * drifts the first time someone edits one of them.
 *
 * The last crumb is the current page: plain text with aria-current, and still
 * an `item` URL in the schema.
 *
 * This component writes the BreadcrumbList node itself rather than wrapping
 * BreadcrumbListSchema, because check-duplicate-schema discovers emitters by
 * the literal @type in a file that imports react-helmet-async. A wrapper would
 * be invisible to it, and a page mounting this beside SEOHead breadcrumbs
 * would ship two trails unflagged.
 */
export function DetailBreadcrumb({ crumbs, className }: DetailBreadcrumbProps) {
  const trail = withHome(crumbs);
  const schema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbListItems(trail),
  };
  const last = trail.length - 1;

  return (
    <>
      <Helmet>
        <script type="application/ld+json">{toJsonLd(schema)}</script>
      </Helmet>
      <nav aria-label="Breadcrumb" className={cn("text-sm text-muted-foreground", className)}>
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {trail.map((crumb, i) => (
            <Fragment key={crumb.path}>
              {i > 0 && (
                <li aria-hidden="true" className="select-none">
                  /
                </li>
              )}
              <li className="min-w-0">
                {i === last ? (
                  <span aria-current="page">{crumb.name}</span>
                ) : (
                  <Link to={crumb.path} className="hover:text-primary">
                    {crumb.name}
                  </Link>
                )}
              </li>
            </Fragment>
          ))}
        </ol>
      </nav>
    </>
  );
}
