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
  formatInCentralTime,
  hasSpecificTime,
} from "@/lib/timezone";
import {
  Calendar,
  MapPin,
  ExternalLink,
  ArrowLeft,
  Sparkles,
  DollarSign,
  CalendarPlus,
  Clock,
  Tag,
  Info,
  ChevronRight,
  Navigation,
  Ticket,
  Users,
} from "lucide-react";
import { downloadICS, getGoogleCalendarUrl } from "@/lib/calendar";
import { FavoriteButton } from "@/components/FavoriteButton";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";

export default function EventDetails() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { events, isLoading } = useEvents();

  const event = events.find((e) => {
    const eventSlug = createEventSlugWithCentralTime(e.title, e);
    return eventSlug === slug;
  });

  const relatedEvents = event
    ? events
        .filter((e) =>
          e.id !== event.id &&
          e.category === event.category &&
          new Date(e.date) >= new Date()
        )
        .slice(0, 3)
    : [];

  // Nearby events (different category, same timeframe)
  const nearbyEvents = event
    ? events
        .filter((e) =>
          e.id !== event.id &&
          e.category !== event.category &&
          new Date(e.date) >= new Date()
        )
        .slice(0, 3)
    : [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-6 bg-muted rounded w-1/4" />
            <div className="h-72 md:h-96 bg-muted rounded-2xl" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 space-y-4">
                <div className="h-10 bg-muted rounded w-3/4" />
                <div className="h-6 bg-muted rounded w-1/2" />
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                  <div className="h-4 bg-muted rounded w-4/6" />
                </div>
              </div>
              <div className="space-y-4">
                <div className="h-48 bg-muted rounded-xl" />
                <div className="h-32 bg-muted rounded-xl" />
              </div>
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
          title="Event Not Found - Des Moines Events"
          description="The event you're looking for could not be found. Browse all upcoming events in Des Moines, Iowa."
          type="website"
        />
        <div className="min-h-screen bg-background">
          <Header />
          <main className="container mx-auto px-4 py-16">
            <div className="text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto">
                <Calendar className="h-8 w-8 text-muted-foreground" />
              </div>
              <h1 className="text-2xl font-bold">Event Not Found</h1>
              <p className="text-muted-foreground">
                This event may have ended or been removed. Browse our latest events to find something new.
              </p>
              <div className="flex gap-3 justify-center">
                <Button onClick={() => navigate("/events")} variant="default">
                  Browse Events
                </Button>
                <Button onClick={() => navigate("/")} variant="outline">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </div>
            </div>
          </main>
          <Footer />
        </div>
      </>
    );
  }

  const eventDate = new Date(event.date);
  const isUpcoming = eventDate >= new Date();
  const eventSlug = createEventSlugWithCentralTime(event.title, event);
  const eventUrl = `${BRAND.baseUrl}/events/${eventSlug}`;
  const isFree = !event.price || event.price.toLowerCase().includes('free') || event.price === '$0';
  const showTime = hasSpecificTime(event);
  const dateSource = event.event_start_utc || event.event_start_local || event.date;

  // Get formatted date parts for the hero display
  const fullDate = formatEventDate(event);
  const dayOfWeek = formatInCentralTime(dateSource, 'EEEE');
  const monthDay = formatInCentralTime(dateSource, 'MMMM d, yyyy');
  const timeStr = showTime ? formatInCentralTime(dateSource, 'h:mm a') : null;

  // Determine days until event for urgency
  const daysUntil = Math.ceil((eventDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const urgencyLabel = daysUntil === 0 ? "Today" : daysUntil === 1 ? "Tomorrow" : daysUntil <= 7 ? `In ${daysUntil} days` : null;

  return (
    <>
      <EnhancedEventSEO
        event={event}
        isUpcoming={isUpcoming}
        viewMode="detail"
      />

      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl },
          { name: "Events", url: getCanonicalUrl('/events') },
          { name: event.title, url: eventUrl },
        ]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        {/* Hero Image Section */}
        {event.image_url && (
          <div className="relative h-64 md:h-80 lg:h-96 overflow-hidden bg-slate-900">
            <img
              src={event.image_url}
              alt={`${event.title} - ${event.category} event in ${event.city || 'Des Moines'}, Iowa`}
              className="w-full h-full object-cover opacity-60"
              loading="eager"
              decoding="async"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                target.parentElement!.style.display = 'none';
              }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
          </div>
        )}

        <main className="container mx-auto px-4">
          {/* Content starts overlapping hero image */}
          <div className={event.image_url ? '-mt-32 relative z-10' : 'pt-8'}>
            {/* Breadcrumbs */}
            <Breadcrumbs
              items={[
                { label: "Home", href: "/" },
                { label: "Events", href: "/events" },
                { label: event.category, href: `/events?category=${encodeURIComponent(event.category)}` },
                { label: event.title }
              ]}
            />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-4">
              {/* Main Content Column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Event Header Card */}
                <article className="bg-card rounded-2xl shadow-lg border overflow-hidden" itemScope itemType="https://schema.org/Event">
                  <div className="p-6 md:p-8">
                    {/* Badges Row */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {isUpcoming && urgencyLabel && (
                        <Badge className={`${daysUntil === 0 ? 'bg-red-500' : daysUntil <= 2 ? 'bg-orange-500' : 'bg-indigo-500'} text-white border-0`}>
                          {urgencyLabel}
                        </Badge>
                      )}
                      {!isUpcoming && (
                        <Badge variant="secondary">Past Event</Badge>
                      )}
                      <Badge variant="outline">{event.category}</Badge>
                      {event.is_featured && (
                        <Badge className="bg-amber-500 text-white border-0">
                          <Sparkles className="h-3 w-3 mr-1" />
                          Featured
                        </Badge>
                      )}
                      {isFree && (
                        <Badge className="bg-emerald-500 text-white border-0">Free Event</Badge>
                      )}
                    </div>

                    {/* Title */}
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-foreground mb-4 leading-tight" itemProp="name">
                      {event.title}
                    </h1>

                    {/* Key Details Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Calendar className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">{dayOfWeek}</p>
                          <p className="text-sm text-muted-foreground" itemProp="startDate" content={event.event_start_utc || (typeof event.date === 'string' ? event.date : event.date.toISOString())}>
                            {monthDay}
                          </p>
                          {timeStr && (
                            <p className="text-sm text-muted-foreground">{timeStr} CT</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <MapPin className="h-5 w-5 text-primary" />
                        </div>
                        <div itemProp="location" itemScope itemType="https://schema.org/Place">
                          {event.venue && (
                            <p className="font-semibold text-foreground text-sm" itemProp="name">{event.venue}</p>
                          )}
                          <p className="text-sm text-muted-foreground" itemProp="address">{event.location}</p>
                          {event.city && (
                            <p className="text-sm text-muted-foreground">{event.city}, Iowa</p>
                          )}
                        </div>
                      </div>

                      {event.price && (
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                          <div className="p-2 rounded-lg bg-primary/10">
                            <Ticket className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground text-sm">Admission</p>
                            <p className="text-sm text-muted-foreground" itemProp="offers" itemScope itemType="https://schema.org/Offer">
                              <span itemProp="price" content={event.price.replace(/[^0-9.]/g, '') || '0'}>{event.price}</span>
                              <meta itemProp="priceCurrency" content="USD" />
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Tag className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground text-sm">Category</p>
                          <Link
                            to={`/events?category=${encodeURIComponent(event.category)}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {event.category} Events
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* Quick Actions Row */}
                    <div className="flex flex-wrap gap-2 pb-2">
                      {event.source_url && (
                        <Button asChild size="sm">
                          <a href={event.source_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Official Page
                          </a>
                        </Button>
                      )}
                      {isUpcoming && (
                        <Button variant="outline" size="sm" onClick={() => downloadICS(event)}>
                          <CalendarPlus className="h-4 w-4 mr-2" />
                          Add to Calendar
                        </Button>
                      )}
                      <FavoriteButton eventId={event.id} size="sm" variant="outline" />
                      <ShareDialog
                        title={event.title}
                        description={event.enhanced_description || event.original_description || `Check out ${event.title} in Des Moines`}
                        url={window.location.href}
                      />
                    </div>
                  </div>
                </article>

                {/* About This Event - SEO Rich Content */}
                <section className="bg-card rounded-2xl shadow-sm border p-6 md:p-8">
                  <h2 className="text-xl font-bold mb-4">About This Event</h2>
                  <div className="prose prose-slate max-w-none" itemProp="description">
                    <p className="text-muted-foreground leading-relaxed text-base">
                      {event.enhanced_description || event.original_description || `Join us for ${event.title}, a ${event.category.toLowerCase()} event happening in ${event.city || 'Des Moines'}, Iowa.`}
                    </p>
                  </div>

                  {/* AI Writeup Section */}
                  {event.ai_writeup && (
                    <div className="mt-6 pt-6 border-t">
                      <AIWriteup
                        writeup={event.ai_writeup}
                        generatedAt={event.writeup_generated_at}
                        prompt={event.writeup_prompt_used}
                      />
                    </div>
                  )}
                </section>

                {/* Things To Know - Optimized for Featured Snippets */}
                <section className="bg-card rounded-2xl shadow-sm border p-6 md:p-8">
                  <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    Things To Know
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">When</h3>
                        <p className="text-sm text-muted-foreground">{fullDate}</p>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">Where</h3>
                        <p className="text-sm text-muted-foreground">
                          {event.venue ? `${event.venue}, ` : ''}{event.location}
                          {event.city ? `, ${event.city}, Iowa` : ', Des Moines, Iowa'}
                        </p>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">Price</h3>
                        <p className="text-sm text-muted-foreground">
                          {isFree ? 'Free admission' : event.price || 'Contact venue for pricing'}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">Category</h3>
                        <p className="text-sm text-muted-foreground">{event.category}</p>
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm text-foreground">Area</h3>
                        <p className="text-sm text-muted-foreground">{event.city || 'Des Moines'}, Iowa (Greater Des Moines Area)</p>
                      </div>
                      {event.source_url && (
                        <div>
                          <h3 className="font-semibold text-sm text-foreground">More Info</h3>
                          <a
                            href={event.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                          >
                            Official Event Page
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* Community Features */}
                <EventCheckIn eventId={event.id} eventTitle={event.title} />
                <EventPhotoUpload eventId={event.id} />
                <RatingSystem contentType="event" contentId={event.id} showReviews={true} />
              </div>

              {/* Sidebar */}
              <aside className="space-y-5">
                {/* Map Card */}
                {event.latitude && event.longitude && (
                  <Card className="overflow-hidden shadow-sm">
                    <div className="h-48 overflow-hidden">
                      <iframe
                        src={`https://www.openstreetmap.org/export/embed.html?bbox=${event.longitude - 0.01},${event.latitude - 0.01},${event.longitude + 0.01},${event.latitude + 0.01}&marker=${event.latitude},${event.longitude}&layer=mapnik`}
                        className="w-full h-full border-0"
                        title={`Map showing ${event.venue || event.location}`}
                        loading="lazy"
                      />
                    </div>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium mb-2">{event.venue || event.location}</p>
                      <Button asChild variant="outline" size="sm" className="w-full">
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${event.latitude},${event.longitude}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Navigation className="h-4 w-4 mr-2" />
                          Get Directions
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                )}

                {/* Event Reminders */}
                {isUpcoming && <EventReminderSettings eventId={event.id} />}

                {/* Explore More Links - Internal Linking for SEO */}
                <Card className="shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Explore Des Moines Events</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 p-4 pt-0">
                    <Link
                      to="/events/today"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        Events Today
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link
                      to="/events/this-weekend"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        This Weekend
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link
                      to="/events/free"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Ticket className="h-4 w-4 text-muted-foreground" />
                        Free Events
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link
                      to={`/events?category=${encodeURIComponent(event.category)}`}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        More {event.category}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                    <Link
                      to="/events"
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors text-sm"
                    >
                      <span className="flex items-center gap-2">
                        <ArrowLeft className="h-4 w-4 text-muted-foreground" />
                        All Events
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </CardContent>
                </Card>
              </aside>
            </div>

            {/* Related Events Section */}
            {relatedEvents.length > 0 && (
              <section className="mt-12 pt-8 border-t">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">More {event.category} Events</h2>
                    <p className="text-sm text-muted-foreground mt-1">Similar events happening in Des Moines</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate(`/events?category=${encodeURIComponent(event.category)}`)}
                  >
                    View All
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
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

            {/* More Events in Des Moines - Additional Internal Links */}
            {nearbyEvents.length > 0 && (
              <section className="mt-12 pt-8 border-t pb-8">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold">More Events in Des Moines</h2>
                    <p className="text-sm text-muted-foreground mt-1">Discover other upcoming activities</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => navigate('/events')}>
                    Browse All
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {nearbyEvents.map((nearbyEvent) => (
                    <EventCard
                      key={nearbyEvent.id}
                      event={nearbyEvent}
                      onViewDetails={() => {
                        navigate(`/events/${createEventSlugWithCentralTime(nearbyEvent.title, nearbyEvent)}`);
                      }}
                    />
                  ))}
                </div>
              </section>
            )}
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
