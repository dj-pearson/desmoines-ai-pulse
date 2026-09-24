import { Link } from "react-router-dom";
import { NEIGHBORHOODS } from "@/lib/neighborhoods";

/**
 * The home page's neighborhood strip. The export keeps its old name so the
 * mount in Index.tsx does not move (WP5 item 10, docs/page-plans/home.md).
 *
 * WEB-SEO-016 removed invented testimonials, a 4.8/5 rating and user counts
 * from this section. What was left was a third copy of the hero's live counts
 * and six static badges naming areas, two of which ("Downtown DSM",
 * "Valley Junction") had no page to go to. Both are gone:
 *
 *   - The counts live in the hero only.
 *   - Every chip is a link to /neighborhoods/<slug>, generated from
 *     NEIGHBORHOODS, so the strip cannot name an area the site has no page
 *     for. scripts/check-neighborhood-inventory.mjs keeps that list honest.
 *
 * Per-area "tonight" counts are a follow-up once the Tonight rail's events
 * can be shared (P2).
 */
export function SocialProof() {
  return (
    <section aria-labelledby="home-neighborhoods-heading" className="py-12 bg-muted/40">
      <div className="container mx-auto px-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 mb-4">
          <h2 id="home-neighborhoods-heading" className="text-2xl font-bold">
            Explore by neighborhood
          </h2>
          <Link
            to="/neighborhoods"
            className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 hover:no-underline"
          >
            All neighborhoods
          </Link>
        </div>
        <p className="max-w-prose text-muted-foreground mb-5">
          Events, places to eat and things to do, area by area across the metro.
        </p>
        <ul className="flex flex-wrap gap-2">
          {NEIGHBORHOODS.map((n) => (
            <li key={n.slug}>
              <Link
                to={`/neighborhoods/${n.slug}`}
                className="inline-flex min-h-11 items-center rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {n.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default SocialProof;
