import { Calendar, MapPin, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useHomepageStats } from "@/hooks/useHomepageStats";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

/**
 * WEB-SEO-016: this section used to be built almost entirely from invented
 * material, removed at the owner's request.
 *
 * What was here:
 *   - Three testimonials attributed to named people who do not exist —
 *     "Sarah M., East Village Resident", "Marcus T., Ankeny", "Jessica L.,
 *     West Des Moines Mom" — each shown with a five-star rating. Fabricated
 *     endorsements attributed to fictional consumers are prohibited under the
 *     FTC endorsement guides (16 CFR 255), the same rule this codebase already
 *     respects with AffiliateDisclosureBanner.
 *   - A "4.8/5 User Rating" tile, with no review system anywhere in the
 *     product to produce it.
 *   - "15,000+ Active Users", which nothing measures.
 *   - "500+ Events Weekly", which was not merely unverifiable but false:
 *     sitemap-events.xml carries 284 upcoming events in total.
 *
 * What replaced it: counts read from the database, so they are true whenever
 * they render, plus the coverage area, which is a fact about the product
 * rather than a claim about its reception. If real testimonials or Google
 * reviews are wired up later they belong here — sourced and attributed.
 */

const NEIGHBORHOODS = [
  "East Village",
  "Valley Junction",
  "Downtown DSM",
  "Ankeny",
  "West Des Moines",
  "Johnston",
];

export function SocialProof() {
  const { eventsToday, restaurantsCount, newThisWeek, isLoading } = useHomepageStats();

  const stats = [
    { value: eventsToday, label: "Events Today", icon: Calendar },
    { value: restaurantsCount, label: "Restaurants Listed", icon: MapPin },
    { value: newThisWeek, label: "Added This Week", icon: Sparkles },
  ];

  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Live counts, straight from the database */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-12">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="text-center p-6 bg-background rounded-xl border"
            >
              <stat.icon className="h-6 w-6 mx-auto mb-2 text-primary" aria-hidden="true" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {isLoading || stat.value === null ? "—" : stat.value.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        <div className="text-center">
          <Badge variant="secondary" className="mb-3">
            <SpriteIcon name="users" className="h-3 w-3 mr-1" aria-hidden="true" />
            Metro Coverage
          </Badge>
          <h2 className="text-3xl font-bold mb-3">Covering the Des Moines Metro</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
            Events, restaurants and things to do across Des Moines and the
            surrounding suburbs — refreshed daily, with every event time in
            Central Time.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {NEIGHBORHOODS.map((neighborhood) => (
              <Badge key={neighborhood} variant="outline" className="text-xs">
                {neighborhood}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default SocialProof;
