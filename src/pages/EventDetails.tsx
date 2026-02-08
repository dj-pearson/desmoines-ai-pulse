import { useParams, Link, useNavigate } from "react-router-dom";
import { useEvents } from "@/hooks/useEvents";
import { RatingSystem } from "@/components/RatingSystem";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ShareDialog from "@/components/ShareDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import SEOHead from "@/components/SEOHead";
import EnhancedEventSEO from "@/components/EnhancedEventSEO";
import AIWriteup from "@/components/AIWriteup";
import { EventPhotoUpload } from "@/components/EventPhotoUpload";
import { EventCheckIn } from "@/components/EventCheckIn";
import EventCard from "@/components/EventCard";
import { EventReminderSettings } from "@/components/EventReminderSettings";
import {
  createEventSlugWithCentralTime,
  formatEventDate,
} from "@/lib/timezone";
import {
  Calendar,
  MapPin,
  ExternalLink,
  ArrowLeft,
  Sparkles,
  DollarSign,
  CalendarPlus,
} from "lucide-react";
import { downloadICS, getGoogleCalendarUrl } from "@/lib/calendar";
import { FavoriteButton } from "@/components/FavoriteButton";
import { BRAND } from "@/lib/brandConfig";

export default function EventDetails() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { events, isLoading } = useEvents();

  const event = events.find((e) => {
    const eventSlug = createEventSlugWithCentralTime(e.title, e);
    return eventSlug === slug;
  });

  // Find related events (same category, upcoming, exclude current event)
  const relatedEvents = event
    ? events
        .filter((e) =>
          e.id !== event.id &&
          e.category === event.category &&
          new Date(e.date) >= new Date()
        )
        .slice(0, 3) // Show up to 3 related events
    : [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-1/3"></div>
            <div className="h-64 bg-muted rounded"></div>
            <div className="space-y-3">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded w-2/3"></div>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!event) {
    return (
      <>
        <SEOHead
          title="Event Not Found - Des Moines Insider"
          description="The event you're looking for could not be found."
          type="website"
        />
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto px-4 py-8">
            <div className="text-center space-y-4">
              <h1 className="text-2xl font-bold">Event Not Found</h1>
              <p className="text-muted-foreground">
                The event you're looking for doesn't exist or has been removed.
              </p>
              <Link to="/">
                <Button>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Home
                </Button>
              </Link>
            </div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  const eventDate = new Date(event.date);
  const isUpcoming = eventDate >= new Date();

  // Enhanced Google Events Schema with all required fields
  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.enhanced_description || event.original_description || event.title,
    startDate: event.event_start_utc || event.date,
    endDate: event.event_start_utc 
      ? new Date(new Date(event.event_start_utc).getTime() + 3 * 60 * 60 * 1000).toISOString() // Add 3 hours if no end date
      : new Date(new Date(event.date).getTime() + 3 * 60 * 60 * 1000).toISOString(),
    location: {
      "@type": "Place",
      name: event.venue || event.location || "Des Moines, Iowa",
      address: {
        "@type": "PostalAddress",
        streetAddress: event.location || "",
        addressLocality: event.city || "Des Moines",
        addressRegion: "Iowa",
        addressCountry: "US",
        postalCode: "50309"
      },
      ...(event.latitude && event.longitude && {
        geo: {
          "@type": "GeoCoordinates",
          latitude: event.latitude,
          longitude: event.longitude
        }
      })
    },
    image: event.image_url || `${BRAND.baseUrl}/default-event-image.jpg`,
    url: window.location.href,
    eventStatus: isUpcoming
      ? "https://schema.org/EventScheduled"
      : "https://schema.org/EventPostponed",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    organizer: {
      "@type": "Organization",
      name: BRAND.name,
      url: BRAND.baseUrl,
      logo: `${BRAND.baseUrl}${BRAND.logo}`
    },
    publisher: {
      "@type": "Organization",
      name: BRAND.name,
      url: BRAND.baseUrl
    },
    offers: event.price && event.price.toLowerCase() !== 'free'
      ? {
          "@type": "Offer",
          price: event.price.replace(/[^0-9.]/g, '') || "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: event.source_url || window.location.href,
          validFrom: new Date().toISOString()
        }
      : {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          availability: "https://schema.org/InStock",
          url: event.source_url || window.location.href
        },
    performer: event.venue ? {
      "@type": "Organization",
      name: event.venue
    } : undefined,
    keywords: [
      event.category,
      "Des Moines events",
      "Iowa events",
      event.venue || "",
      event.location || ""
    ].filter(Boolean).join(", "),
    about: [
      {
        "@type": "Thing",
        name: event.category
      },
      {
        "@type": "Place",
        name: "Des Moines, Iowa"
      }
    ],
    isAccessibleForFree: !event.price || event.price.toLowerCase().includes('free'),
    inLanguage: "en-US"
  };

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Events", url: "/events" },
    {
      name: event.title,
      url: `/events/${createEventSlugWithCentralTime(event.title, event)}`,
    },
  ];

  return (
    <>
      <EnhancedEventSEO 
        event={event}
        isUpcoming={isUpcoming}
        viewMode="detail"
      />

      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-8 space-y-8">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Events", href: "/events" },
              { label: event.title }
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Event Header */}
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={isUpcoming ? "default" : "secondary"}>
                          {isUpcoming ? "Upcoming" : "Past Event"}
                        </Badge>
                        <Badge variant="secondary">{event.category}</Badge>
                        {event.is_featured && (
                          <Badge className="bg-primary">Featured</Badge>
                        )}
                        {event.is_enhanced && (
                          <Badge
                            variant="outline"
                            className="border-primary text-primary"
                          >
                            <Sparkles className="h-3 w-3 mr-1" />
                            AI Enhanced
                          </Badge>
                        )}
                      </div>
                      <h1 className="text-3xl font-bold">{event.title}</h1>
                    </div>
                    <div className="flex items-center gap-2">
                      <FavoriteButton eventId={event.id} size="default" variant="outline" />
                      <ShareDialog
                        title={event.title}
                        description={event.enhanced_description || event.original_description || `Join us for ${event.title}`}
                        url={window.location.href}
                      />
                    </div>
                  </div>
                </CardHeader>

                {event.image_url && (
                  <div className="px-6">
                    <img
                      src={event.image_url}
                      alt={event.title}
                      className="w-full h-64 object-cover rounded-lg"
                      loading="lazy"
                      decoding="async"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                      }}
                    />
                  </div>
                )}

                <CardContent className="space-y-4">
                  {/* Event Details */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center text-muted-foreground">
                      <Calendar className="h-5 w-5 mr-2 flex-shrink-0" />
                      <span>{formatEventDate(event)}</span>
                    </div>

                    <div className="flex items-center text-muted-foreground">
                      <MapPin className="h-5 w-5 mr-2 flex-shrink-0" />
                      <span>{event.location}</span>
                    </div>

                    {event.venue && (
                      <div className="md:col-span-2">
                        <span className="font-medium">Venue: </span>
                        <span className="text-muted-foreground">
                          {event.venue}
                        </span>
                      </div>
                    )}

                    {event.price && (
                      <div className="flex items-center text-muted-foreground">
                        <DollarSign className="h-5 w-5 mr-2 flex-shrink-0" />
                        <span>{event.price}</span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  <div className="space-y-2">
                    <h3 className="font-semibold">About This Event</h3>
                    <p className="text-muted-foreground leading-relaxed">
                      {event.enhanced_description || event.original_description}
                    </p>
                  </div>

                  {/* Action Buttons */}
                  {event.source_url && (
                    <div className="pt-4">
                      <Button asChild>
                        <a
                          href={event.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center"
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          View Original Event
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* AI Writeup Section */}
              {event.ai_writeup && (
                <AIWriteup
                  writeup={event.ai_writeup}
                  generatedAt={event.writeup_generated_at}
                  prompt={event.writeup_prompt_used}
                  className="mt-8"
                />
              )}

              {/* Community Features */}
              <EventCheckIn 
                eventId={event.id} 
                eventTitle={event.title} 
              />
              
              <EventPhotoUpload 
                eventId={event.id} 
              />

              {/* Rating System */}
              <RatingSystem
                contentType="event"
                contentId={event.id}
                showReviews={true}
              />
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Info */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <span className="font-medium">Category</span>
                    <p className="text-muted-foreground">{event.category}</p>
                  </div>

                  <div>
                    <span className="font-medium">Date</span>
                    <p className="text-muted-foreground">
                      {formatEventDate(event)}
                    </p>
                  </div>

                  <div>
                    <span className="font-medium">Location</span>
                    <p className="text-muted-foreground">{event.location}</p>
                  </div>

                  {event.venue && (
                    <div>
                      <span className="font-medium">Venue</span>
                      <p className="text-muted-foreground">{event.venue}</p>
                    </div>
                  )}

                  {event.price && (
                    <div>
                      <span className="font-medium">Price</span>
                      <p className="text-muted-foreground">{event.price}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {event.source_url && (
                    <Button asChild className="w-full">
                      <a
                        href={event.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Visit Official Page
                      </a>
                    </Button>
                  )}

                  <ShareDialog
                    title={event.title}
                    description={event.enhanced_description || event.original_description || `Join us for ${event.title}`}
                    url={window.location.href}
                    className="w-full"
                  />

                  {/* Add to Calendar */}
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => downloadICS(event)}
                  >
                    <CalendarPlus className="h-4 w-4 mr-2" />
                    Add to Calendar
                  </Button>

                  <Button variant="outline" asChild className="w-full">
                    <Link to="/">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Events
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              {/* Event Reminders */}
              {isUpcoming && (
                <EventReminderSettings eventId={event.id} />
              )}

              {/* Location & Map */}
              {(event.latitude && event.longitude) && (
                <Card>
                  <CardHeader>
                    <CardTitle>Location</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {/* Embedded Map */}
                    <div className="h-48 rounded-lg overflow-hidden border">
                      <iframe
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${event.longitude - 0.01},${event.latitude - 0.01},${event.longitude + 0.01},${event.latitude + 0.01}&marker=${event.latitude},${event.longitude}&layer=mapnik`}
                        className="w-full h-full border-0"
                        title={`Map showing ${event.venue || event.location}`}
                        loading="lazy"
                      />
                    </div>

                    {/* Get Directions Button */}
                    <Button asChild variant="outline" className="w-full">
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <MapPin className="h-4 w-4 mr-2" />
                        Get Directions
                      </a>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* Related Events Section */}
          {relatedEvents.length > 0 && (
            <section className="mt-12 pt-12 border-t">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Related Events</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/events?category=${encodeURIComponent(event.category)}`)}
                >
                  View All {event.category}
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {relatedEvents.map((relatedEvent) => (
                  <EventCard
                    key={relatedEvent.id}
                    event={relatedEvent}
                    onViewDetails={() => {
                      navigate(`/events/${createEventSlugWithCentralTime(relatedEvent.title, relatedEvent)}`);
                    }}
                  />
                ))}
              </div>
            </section>
          )}
        </main>

        <Footer />
      </div>
    </>
  );
}
