import { useState } from "react";
import { Link } from "react-router-dom";
import { Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { formatInCentralTime, createEventSlugWithCentralTime } from "@/lib/timezone";
import { createSlug } from "@/lib/slug";
import { NEIGHBORHOOD_MIN_ITEMS, type Neighborhood } from "@/lib/neighborhoods";
import type {
  NeighborhoodAttraction,
  NeighborhoodRestaurant,
} from "@/hooks/useNeighborhoodContent";
import type { Event } from "@/lib/types";

interface NeighborhoodGuideProps {
  neighborhood: Neighborhood;
  events: Event[];
  restaurants: NeighborhoodRestaurant[];
  attractions: NeighborhoodAttraction[];
}

/**
 * The body of a neighborhood guide (WEB-SEO-036).
 *
 * THIS COMPONENT USED TO OWN ITS OWN COPY OF THE NEIGHBORHOOD LIST, keyed by
 * DISPLAY NAME, and it knew seven neighborhoods while the routes prerendered
 * four - only one of which overlapped. The list now lives in
 * src/lib/neighborhoods.ts and arrives as a prop, so there is one inventory.
 *
 * THREE THINGS WERE READING COLUMNS THAT DO NOT EXIST, and nothing caught it
 * because the arrays were hardcoded `[]` so no card ever rendered:
 *     event.start_date        -> the column is `date` / `event_start_utc`
 *     restaurant.cuisine_type -> the column is `cuisine`
 *     attraction.category     -> the column is `type`
 * The "Details", "Visit" and "Learn More" buttons had no href either - they
 * were buttons that did nothing, on cards that never appeared.
 *
 * THE FAQ BLOCK IS GONE. It was a ternary chain with real answers for West Des
 * Moines and Ankeny and, for the other six, sentences like "<name> offers
 * various family-friendly activities including parks, community centers, local
 * events, and seasonal festivals". That is a generated non-answer, and writing
 * six more by hand would be inventing facts about places this repo holds no
 * data on. Removing invented content beats adding more of it; if these pages
 * earn an FAQ later it belongs in <FAQSection>, which SEO-003 made the single
 * emitter of FAQPage schema.
 */
export default function NeighborhoodGuide({
  neighborhood,
  events,
  restaurants,
  attractions,
}: NeighborhoodGuideProps) {
  const [activeTab, setActiveTab] = useState<"events" | "dining" | "attractions">("events");

  const total = events.length + restaurants.length + attractions.length;
  const isThin = total < NEIGHBORHOOD_MIN_ITEMS;

  return (
    <div className="space-y-6">
      {/* WEB-UX-034: this header was `bg-gradient-to-r from-blue-600 to-purple-600`,
          the detector's most-cited tell. The brand surface carries the same
          separation without it. */}
      <div className="bg-primary text-primary-foreground p-6 rounded-lg">
        <div className="flex items-center gap-2 mb-2">
          <SpriteIcon name="map-pin" className="h-6 w-6" />
          <h1 className="text-2xl font-bold">{neighborhood.name} Events &amp; Activities</h1>
        </div>
        <p className="opacity-90 mb-4">{neighborhood.description}</p>

        <div className="flex flex-wrap gap-2">
          {neighborhood.highlights.map((highlight) => (
            <Badge
              key={highlight}
              variant="secondary"
              className="bg-primary-foreground/15 text-primary-foreground border-primary-foreground/25"
            >
              {highlight}
            </Badge>
          ))}
        </div>
      </div>

      {/* Say so when there is little to show, rather than presenting three
          empty tabs as though the neighborhood simply has nothing on. The page
          also noindexes itself at this threshold - see NeighborhoodPage. */}
      {isThin && (
        <Card className="bg-muted/50">
          <CardContent className="p-6">
            <p className="text-sm">
              We're still building out {neighborhood.name}. There{" "}
              {total === 1 ? "is 1 listing" : `are ${total} listings`} here so far.{" "}
              <Link to="/events" className="underline underline-offset-4">
                Browse every event in the metro
              </Link>{" "}
              in the meantime.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Navigation Tabs */}
      <div className="flex space-x-1 bg-muted p-1 rounded-lg">
        <Button
          variant={activeTab === "events" ? "default" : "ghost"}
          onClick={() => setActiveTab("events")}
          className="flex-1"
        >
          <SpriteIcon name="calendar" className="h-4 w-4 mr-2" />
          Events ({events.length})
        </Button>
        <Button
          variant={activeTab === "dining" ? "default" : "ghost"}
          onClick={() => setActiveTab("dining")}
          className="flex-1"
        >
          <SpriteIcon name="users" className="h-4 w-4 mr-2" />
          Dining ({restaurants.length})
        </Button>
        <Button
          variant={activeTab === "attractions" ? "default" : "ghost"}
          onClick={() => setActiveTab("attractions")}
          className="flex-1"
        >
          <Star className="h-4 w-4 mr-2" />
          Attractions ({attractions.length})
        </Button>
      </div>

      {activeTab === "events" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Upcoming Events in {neighborhood.name}</h2>
          {events.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {events.map((event) => (
                <Card key={event.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">
                      <Link
                        to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}
                        className="hover:underline"
                      >
                        {event.title}
                      </Link>
                    </CardTitle>
                    <div className="flex items-center text-sm text-muted-foreground">
                      <SpriteIcon name="calendar" className="h-4 w-4 mr-1" />
                      {formatInCentralTime(event.event_start_utc ?? String(event.date), "MMM d, yyyy")}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {event.original_description && (
                      <p className="text-sm mb-2 line-clamp-2">{event.original_description}</p>
                    )}
                    <div className="flex justify-between items-center">
                      <Badge variant="outline">{event.category}</Badge>
                      <Link to={`/events/${createEventSlugWithCentralTime(event.title, event)}`}>
                        <Button size="sm" variant="outline">
                          Details
                        </Button>
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center p-8">
                <SpriteIcon name="calendar" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No upcoming events listed for {neighborhood.name} right now.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "dining" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Restaurants in {neighborhood.name}</h2>
          {restaurants.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {restaurants.map((restaurant) => {
                const href = `/restaurants/${restaurant.slug ?? createSlug(restaurant.name)}`;
                return (
                  <Card key={restaurant.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        <Link to={href} className="hover:underline">
                          {restaurant.name}
                        </Link>
                      </CardTitle>
                      {restaurant.location && (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <SpriteIcon name="map-pin" className="h-4 w-4 mr-1" />
                          {restaurant.location}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center">
                        <div className="flex gap-2">
                          {restaurant.cuisine && <Badge variant="outline">{restaurant.cuisine}</Badge>}
                          {restaurant.price_range && (
                            <Badge variant="outline">{restaurant.price_range}</Badge>
                          )}
                        </div>
                        <Link to={href}>
                          <Button size="sm" variant="outline">
                            View
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center p-8">
                <SpriteIcon name="users" className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No restaurants listed for {neighborhood.name} yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {activeTab === "attractions" && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Attractions in {neighborhood.name}</h2>
          {attractions.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {attractions.map((attraction) => {
                // attractions has no slug column; AttractionDetails matches on
                // createSlug(name), so the link has to be built the same way.
                const href = `/attractions/${createSlug(attraction.name)}`;
                return (
                  <Card key={attraction.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        <Link to={href} className="hover:underline">
                          {attraction.name}
                        </Link>
                      </CardTitle>
                      {(attraction.location || attraction.address) && (
                        <div className="flex items-center text-sm text-muted-foreground">
                          <SpriteIcon name="map-pin" className="h-4 w-4 mr-1" />
                          {attraction.location ?? attraction.address}
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex justify-between items-center">
                        {attraction.type ? <Badge variant="outline">{attraction.type}</Badge> : <span />}
                        <Link to={href}>
                          <Button size="sm" variant="outline">
                            <span aria-hidden="true">Learn more</span>
                            <span className="sr-only">Learn more about {attraction.name}</span>
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="text-center p-8">
                <Star className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">
                  No attractions listed for {neighborhood.name} yet.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-lg">About {neighborhood.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground leading-relaxed">
            {neighborhood.detailedDescription}
          </p>
          <div>
            <h3 className="text-sm font-semibold mb-1">Best known for</h3>
            <p className="text-sm text-muted-foreground">{neighborhood.bestFor}</p>
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-1">ZIP codes</h3>
            <p className="text-sm text-muted-foreground">{neighborhood.zipCodes.join(", ")}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
