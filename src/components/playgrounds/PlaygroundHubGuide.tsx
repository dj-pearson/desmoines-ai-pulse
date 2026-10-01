import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import ItemListSchema from "@/components/schema/ItemListSchema";
import { getCanonicalUrl } from "@/lib/brandConfig";
import {
  PLAYGROUND_GUIDE_ANCHORS,
  PLAYGROUND_SELECTION_RULE,
  type PlaygroundHubRow,
  type PlaygroundHubSections,
  type PlaygroundPick,
} from "@/lib/playgroundHub";
import { suburbFromLocation } from "@/lib/playgroundMeta";
import { createSlug } from "@/lib/slug";

interface PlaygroundHubGuideProps {
  sections: PlaygroundHubSections<PlaygroundHubRow>;
}

function hrefOf(row: PlaygroundHubRow): string {
  // createSlug(name), the same function the cards and the main ItemList use,
  // so the three cannot point at different URLs for one playground.
  return `/playgrounds/${createSlug(row.name)}`;
}

function schemaItems(picks: PlaygroundPick[]) {
  return picks.map((p) => ({ name: p.row.name, url: getCanonicalUrl(hrefOf(p.row)) }));
}

interface PickListProps {
  picks: PlaygroundPick[];
  ordered: boolean;
  /** Ranked lists show the count the rule ranks on, so the rule is checkable. */
  showCount: boolean;
  testId: string;
}

function PickList({ picks, ordered, showCount, testId }: PickListProps) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className="divide-y divide-border" data-picks={testId}>
      {picks.map((p, i) => {
        const city = suburbFromLocation(p.row.location);
        const facts = [
          city,
          p.reason,
          showCount && !/amenities listed$/.test(p.reason)
            ? `${p.featureCount} amenities listed`
            : null,
        ].filter((f): f is string => Boolean(f));
        return (
          <li key={p.row.id}>
            <Link
              to={hrefOf(p.row)}
              className="group flex min-h-11 items-baseline gap-3 py-3 text-foreground"
            >
              {ordered && (
                <span className="w-5 shrink-0 text-sm tabular-nums text-muted-foreground" aria-hidden="true">
                  {i + 1}.
                </span>
              )}
              <span className="min-w-0">
                <span className="block font-semibold underline-offset-4 group-hover:text-primary group-hover:underline">
                  {p.row.name}
                </span>
                <span className="block text-sm text-muted-foreground">{facts.join(" · ")}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </Tag>
  );
}

/**
 * The hub's lead sections (SEO-042): best by age and splash pads, each built
 * by src/lib/playgroundHub.ts from the rows. There is no indoor section, on
 * purpose: no column says a place is indoors (see that file's header).
 */
export function PlaygroundHubGuide({ sections }: PlaygroundHubGuideProps) {
  const { toddlers, allAges, splashPads } = sections;
  const { hash } = useLocation();
  const hasAgeLists = toddlers.length > 0 || allAges.length > 0;

  // React Router does not scroll to a hash on navigation, and these sections
  // only exist once the rows are in, so a link from /events/kids to
  // /playgrounds#splash-pads would otherwise land at the top.
  useEffect(() => {
    const id = hash.replace(/^#/, "");
    if (id !== PLAYGROUND_GUIDE_ANCHORS.byAge && id !== PLAYGROUND_GUIDE_ANCHORS.splashPads) return;
    document.getElementById(id)?.scrollIntoView();
  }, [hash, hasAgeLists, splashPads.length]);

  if (!hasAgeLists && splashPads.length === 0) return null;

  return (
    <div className="mb-8 space-y-10" data-playground-guide>
      <ItemListSchema
        name="Best Des Moines playgrounds for toddlers and preschoolers"
        description={PLAYGROUND_SELECTION_RULE}
        items={schemaItems(toddlers)}
      />
      <ItemListSchema
        name="Best Des Moines playgrounds for all ages"
        description={PLAYGROUND_SELECTION_RULE}
        items={schemaItems(allAges)}
      />
      <ItemListSchema
        name="Splash pads and spraygrounds in the Des Moines metro"
        itemListOrder="Unordered"
        items={schemaItems(splashPads)}
      />

      {hasAgeLists && (
        <section
          id={PLAYGROUND_GUIDE_ANCHORS.byAge}
          aria-labelledby="best-by-age-heading"
          className="scroll-mt-20"
        >
          <h2 id="best-by-age-heading" className="text-xl md:text-2xl font-bold text-foreground">
            Best playgrounds by age
          </h2>
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground" data-selection-rule>
            How these are picked: {PLAYGROUND_SELECTION_RULE}
          </p>
          <div className="mt-4 grid gap-x-10 gap-y-6 md:grid-cols-2">
            {toddlers.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-foreground">Toddlers and preschoolers</h3>
                <p className="text-sm text-muted-foreground">
                  Listings with toddler equipment or a preschool age range.
                </p>
                <PickList picks={toddlers} ordered showCount testId="toddlers" />
              </div>
            )}
            {allAges.length > 0 && (
              <div>
                <h3 className="text-base font-semibold text-foreground">All ages</h3>
                <p className="text-sm text-muted-foreground">
                  Listings whose age range is all ages.
                </p>
                <PickList picks={allAges} ordered showCount testId="all-ages" />
              </div>
            )}
          </div>
        </section>
      )}

      {splashPads.length > 0 && (
        <section
          id={PLAYGROUND_GUIDE_ANCHORS.splashPads}
          aria-labelledby="splash-pads-heading"
          className="scroll-mt-20"
        >
          <h2 id="splash-pads-heading" className="text-xl md:text-2xl font-bold text-foreground">
            Splash pads and spraygrounds
          </h2>
          {/* No season dates: no row stores them and none were fetched from a
              city page, so the page sends parents to the operator rather than
              print a date it cannot back. */}
          <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
            {splashPads.length} {splashPads.length === 1 ? "playground lists" : "playgrounds list"} a
            splash pad or sprayground, shown with what the listing says. Opening dates and hours
            aren't in our listings and water features close for the season, so check the park's
            page with the city that runs it before you go.
          </p>
          <div className="mt-2 max-w-2xl">
            <PickList picks={splashPads} ordered={false} showCount={false} testId="splash" />
          </div>
        </section>
      )}
    </div>
  );
}
