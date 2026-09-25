import { useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Leaf, Wheat, Beef, UtensilsCrossed, type LucideIcon } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { FAQSection, type FAQItem } from "@/components/FAQSection";
import RestaurantCard from "@/components/RestaurantCard";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import RelatedContent from "@/components/RelatedContent";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ErrorState } from "@/components/ui/error-state";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import {
  DIETS,
  DIETARY_FETCH_LIMIT,
  dietFromParam,
  dietPath,
  useDietaryRestaurants,
  type Diet,
  type DietId,
} from "@/hooks/useDietaryRestaurants";
import { getCanonicalUrl } from "@/lib/brandConfig";

/**
 * WEB-PERF-023. The query fetches 100 and the grid rendered all of them, which
 * measured 4,985 DOM elements inside #root. 36 is three full rows of the
 * lg:grid-cols-3 grid. The heading still reports the true count, and "Show
 * more" reveals the rest of what was fetched (WP4.12) instead of sending the
 * visitor to the unfiltered hub.
 */
const VISIBLE_RESTAURANTS = 36;

/**
 * One icon per diet, all drawn in the text colour. Halal and kosher used to get
 * a steak (Beef) in blue and purple, which says nothing about either.
 */
const DIET_ICON: Record<DietId, LucideIcon> = {
  vegan: Leaf,
  vegetarian: Leaf,
  "gluten-free": Wheat,
  keto: Beef,
  halal: UtensilsCrossed,
  kosher: UtensilsCrossed,
};

/**
 * The FAQ. It ships as FAQPage JSON-LD, so every answer says only what this
 * page can back: it matches words in a listing and checks nothing else. The
 * statistics, certifications and named "verified" lists that used to be here
 * had no source in the data.
 */
function buildFaqs(diet: Diet | null): FAQItem[] {
  const noun = diet ? diet.label.toLowerCase() : "dietary-friendly";
  return [
    {
      question: `How does this page choose ${noun} restaurants in Des Moines?`,
      answer:
        "It lists Des Moines-area restaurants whose name, cuisine or description mentions the diet, for example \"vegan\" or \"gluten-free\". That is a keyword match on the listing, not a check of the menu or the kitchen, so call ahead before you go.",
      links: [{ label: "All Des Moines restaurants", to: "/restaurants" }],
    },
    {
      question: "Is the gluten-free food on this list safe for celiac disease?",
      answer:
        "A listing can't tell you that. Call ahead, say it's celiac disease rather than a preference, and ask about shared fryers and prep surfaces.",
      links: [{ label: "Gluten-free mentions", to: "/restaurants/dietary/gluten-free" }],
    },
    {
      question: "Where can I find halal food in Des Moines?",
      answer:
        "Start with the halal list on this page, which shows places that mention halal in their listing. Call ahead to ask how the meat is sourced and whether it shares fryers and prep surfaces with other dishes.",
      links: [{ label: "Halal mentions", to: "/restaurants/dietary/halal" }],
    },
    {
      question: "Where can I find kosher food in Des Moines?",
      answer:
        "Start with the kosher list on this page, which shows places that mention kosher in their listing. Call ahead to ask about supervision and whether dishes share fryers and prep surfaces.",
      links: [{ label: "Kosher mentions", to: "/restaurants/dietary/kosher" }],
    },
  ];
}

function ListSkeleton() {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading restaurants">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="animate-pulse">
          <div className="h-48 bg-muted rounded-xl mb-4" />
          <div className="h-4 bg-muted rounded w-3/4 mb-2" />
          <div className="h-4 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}

/** The six diets as plain links, shown when no diet is chosen. */
function DietEntryPoints() {
  return (
    <section aria-labelledby="diet-entry-heading" className="mb-10">
      <h2 id="diet-entry-heading" className="text-2xl font-bold mb-4">
        Choose a diet
      </h2>
      <ul className="divide-y rounded-xl border max-w-2xl">
        {DIETS.map((diet) => {
          const Icon = DIET_ICON[diet.id];
          return (
            <li key={diet.id} className="relative flex items-center gap-3 px-4 py-3 hover:bg-muted/50 focus-within:bg-muted/50">
              <Icon className="h-5 w-5 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="flex-1 min-w-0">
                <Link
                  to={dietPath(diet)}
                  className="font-semibold after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {diet.label}
                </Link>
                <span className="block text-sm text-muted-foreground">
                  Places whose listing mentions {diet.keywords.map((k) => `"${k}"`).join(" or ")}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * /restaurants/dietary and /restaurants/dietary/:diet (WP4.13).
 *
 * Each diet has its own self-canonical path. The old `?diet=` form
 * replace-navigates to that path, so shared links and anything still building
 * the query string land on the one URL; keep that for at least one release.
 * An unknown diet in the path goes to the index rather than rendering a page
 * called "undefined".
 */
export default function DietaryRestaurants() {
  const { diet: dietSlug } = useParams<{ diet?: string }>();
  const [searchParams] = useSearchParams();
  const legacy = dietSlug ? null : dietFromParam(searchParams.get("diet"));
  const unknownPath = dietSlug !== undefined && dietFromParam(dietSlug) === null;
  // Derived from the URL on every render, so Back and Forward move the list
  // and the h1 together.
  const selected = dietSlug ? dietFromParam(dietSlug) : null;
  const { data: restaurants = [], isLoading, isError, error, refetch } = useDietaryRestaurants(selected);
  const navigate = useNavigate();
  // Which diet the "Show more" was pressed for. Keyed on the diet so moving to
  // another diet starts collapsed again without an effect.
  const [expandedFor, setExpandedFor] = useState<DietId | null>(null);

  if (legacy) return <Navigate to={dietPath(legacy)} replace />;
  if (unknownPath) return <Navigate to="/restaurants/dietary" replace />;

  // A push, not a replace: each choice is a history entry.
  const chooseDiet = (id: DietId) => navigate(`/restaurants/dietary/${id}`);
  const clearDiet = () => navigate("/restaurants/dietary");

  const label = selected?.label;
  const pageTitle = selected
    ? `${label} Restaurants in Des Moines | Des Moines Insider`
    : "Dietary-Friendly Restaurants | Des Moines Insider";
  const pageDescription = selected
    ? `Des Moines restaurants whose listing mentions ${label.toLowerCase()} options. We match the words, so call ahead to confirm.`
    : "Des Moines restaurants whose listing mentions vegan, vegetarian, gluten-free, keto, halal or kosher options.";

  const breadcrumbs = [
    { name: "Restaurants", url: "/restaurants" },
    { name: "Dietary Options", url: "/restaurants/dietary" },
    ...(selected ? [{ name: label, url: dietPath(selected) }] : []),
  ];
  const faqs = buildFaqs(selected);
  const expanded = selected !== null && expandedFor === selected.id;
  const shown = expanded ? restaurants : restaurants.slice(0, VISIBLE_RESTAURANTS);
  const hidden = restaurants.length - shown.length;
  // "first 100" only when the fetch came back full: then there may be more
  // rows than we read, and the number is a floor, not a count.
  const hitLimit = restaurants.length >= DIETARY_FETCH_LIMIT;
  const countLabel = hitLimit ? `first ${DIETARY_FETCH_LIMIT}` : String(restaurants.length);

  return (
    <div className="min-h-screen bg-background">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl={getCanonicalUrl(selected ? dietPath(selected) : "/restaurants/dietary")}
        pageType="website"
        breadcrumbs={breadcrumbs}
        keywords={[
          "vegan restaurants Des Moines",
          "vegetarian Des Moines",
          "gluten free dining Des Moines",
          "keto restaurants Des Moines",
          "halal food Des Moines",
          "kosher Des Moines",
          "dietary restrictions Des Moines",
        ]}
      />

      <Header />

      <div className="container mx-auto px-4 py-8">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Restaurants", href: "/restaurants" },
            ...(selected
              ? [{ label: "Dietary Options", href: "/restaurants/dietary" }, { label: selected.label }]
              : [{ label: "Dietary Options" }]),
          ]}
          className="mb-4"
        />

        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-3">
            {selected ? `${label} Restaurants in Des Moines` : "Dietary-Friendly Restaurants in Des Moines"}
          </h1>
          <p className="flex items-center gap-1 text-muted-foreground mb-4">
            <SpriteIcon name="map-pin" className="h-4 w-4" aria-hidden="true" />
            <span>Des Moines metro</span>
          </p>
          <p className="text-lg text-muted-foreground max-w-prose">
            {selected
              ? `Restaurants whose name, cuisine or description mentions ${label.toLowerCase()}. We match the words in the listing and don't check menus, so call ahead, especially for an allergy.`
              : "Pick a diet to see Des Moines restaurants whose listing mentions it. We match the words in the listing and don't check menus, so call ahead, especially for an allergy."}{" "}
            Hungry now? See{" "}
            <Link to="/restaurants/open-now" className="text-primary hover:underline font-semibold">
              restaurants open now
            </Link>
            .
          </p>
        </div>

        {selected ? (
          <>
            <div className="mb-8">
              <h2 className="sr-only">Change diet</h2>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Diet">
                {DIETS.map((diet) => {
                  const Icon = DIET_ICON[diet.id];
                  const pressed = diet.id === selected.id;
                  return (
                    <Button
                      key={diet.id}
                      type="button"
                      onClick={() => chooseDiet(diet.id)}
                      variant={pressed ? "default" : "outline"}
                      aria-pressed={pressed}
                      className="min-h-11"
                    >
                      <Icon className="h-4 w-4 mr-2" aria-hidden="true" />
                      {diet.label}
                    </Button>
                  );
                })}
                <Button type="button" onClick={clearDiet} variant="ghost" className="min-h-11">
                  All diets
                </Button>
              </div>
            </div>

            <section aria-label={`Restaurants that mention ${label.toLowerCase()}`}>
              {isError ? (
                <ErrorState error={error} onRetry={() => void refetch()} />
              ) : isLoading ? (
                <ListSkeleton />
              ) : restaurants.length > 0 ? (
                <>
                  <h2 className="text-2xl font-bold mb-2">
                    Mentions {label.toLowerCase()} ({countLabel})
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Mentioned in the name, cuisine or description. Not a menu check.
                  </p>
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {shown.map((restaurant, index) => (
                      <div key={restaurant.id} className="content-auto">
                        <RestaurantCard restaurant={restaurant} priority={index < 3} />
                      </div>
                    ))}
                  </div>
                  {restaurants.length > VISIBLE_RESTAURANTS && (
                    <div className="mt-8 text-center" data-dietary-more>
                      <p className="text-muted-foreground mb-3">
                        Showing {shown.length} of {countLabel} that mention {label.toLowerCase()}.
                        {expanded && hitLimit ? " There may be more we didn't load." : ""}
                      </p>
                      {hidden > 0 ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          onClick={() => setExpandedFor(selected.id)}
                        >
                          Show {hidden} more
                        </Button>
                      ) : (
                        <Button asChild variant="outline" className="min-h-11">
                          <Link to="/restaurants">Browse all restaurants</Link>
                        </Button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <Card>
                  <CardContent className="pt-6 text-center">
                    <h2 className="text-lg font-semibold mb-2">
                      No listing mentions {label.toLowerCase()} yet
                    </h2>
                    <p className="text-muted-foreground mb-4">
                      That's about our listings, not Des Moines. Places often serve more than their description says.
                    </p>
                    <Button asChild variant="outline">
                      <Link to="/restaurants">Browse all restaurants</Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </section>
          </>
        ) : (
          <DietEntryPoints />
        )}

        <section aria-labelledby="dietary-tips-heading" className="mt-10">
          <h2 id="dietary-tips-heading" className="text-xl font-semibold mb-4">
            Before you go
          </h2>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl">
            <div>
              <h3 className="font-semibold mb-2">Call ahead</h3>
              <p className="text-sm text-muted-foreground">
                For an allergy or a strict diet, call before you visit and ask about shared fryers, prep surfaces and
                ingredients. Browse{" "}
                <Link to="/restaurants" className="text-primary hover:underline font-semibold">
                  all Des Moines restaurants
                </Link>{" "}
                for phone numbers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Say what you need</h3>
              <p className="text-sm text-muted-foreground">
                "I have celiac disease" gets a different answer from "I'm avoiding gluten". Be specific about what you
                can't eat and how serious it is.
              </p>
            </div>
            <div>
              <h3 className="font-semibold mb-2">Read the menu</h3>
              <p className="text-sm text-muted-foreground">
                This list is built from words in each listing. A place's own menu is the better source for what it
                serves today.
              </p>
            </div>
          </div>
        </section>

        {/* SEO-003: the FAQ is rendered here, and FAQSection emits the one
            FAQPage block. EnhancedLocalSEO no longer emits one. */}
        <FAQSection faqs={faqs} />

        <RelatedContent currentPath="/restaurants/dietary" title="Explore More Des Moines Dining" />
      </div>

      <Footer />
    </div>
  );
}
