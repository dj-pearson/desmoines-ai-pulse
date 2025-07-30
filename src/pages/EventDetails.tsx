import { useParams, Link } from "react-router-dom";
import { useEvents } from "@/hooks/useEvents";
import { RatingSystem } from "@/components/RatingSystem";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import SEOHead from "@/components/SEOHead";
import {
  Calendar,
  MapPin,
  ExternalLink,
  ArrowLeft,
  Sparkles,
  DollarSign,
  Share2,
} from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function EventDetails() {
  const { slug } = useParams<{ slug: string }>();
  const { events, isLoading } = useEvents();

  const createEventSlug = (title: string, date?: string): string => {
    const titleSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    
    if (!date) {
      return titleSlug;
    }

    try {
      const eventDate = new Date(date);
      const year = eventDate.getFullYear();
      const month = String(eventDate.getMonth() + 1).padStart(2, '0');
      const day = String(eventDate.getDate()).padStart(2, '0');
      
      return `${titleSlug}-${year}-${month}-${day}`;
    } catch (error) {
      console.error('Error creating event slug:', error);
      return titleSlug;
    }
  };

  const event = events.find((e) => {
    const dateString = String(e.date);
    const eventSlug = createEventSlug(e.title, dateString);
    return eventSlug === slug;
  });

  const formatEventDate = (date: string | Date) => {
    try {
      return format(new Date(date), "EEEE, MMMM d, yyyy 'at' h:mm a");
    } catch {
      return "Date and time to be announced";
    }
  };

  const handleShare = async () => {
    if (navigator.share && event) {
      try {
        await navigator.share({
          title: event.title,
          text:
            event.enhanced_description ||
            event.original_description ||
            `Join us for ${event.title}`,
          url: window.location.href,
        });
      } catch (error) {
        console.log("Error sharing:", error);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard!");
    }
  };

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

  // Generate comprehensive SEO data
  const seoTitle = `${event.title} - Des Moines Event`;
  const seoDescription =
    event.enhanced_description ||
    event.original_description ||
    `Join us for ${event.title} in Des Moines. ${formatEventDate(event.date)}`;

  const seoKeywords = [
    event.title,
    event.category,
    "event",
    "Des Moines events",
    "Iowa events",
    event.venue || "",
    event.location || "",
    "things to do",
    "activities",
  ].filter(Boolean);

  const eventSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: event.title,
    description: event.enhanced_description || event.original_description,
    startDate: event.date,
    location: {
      "@type": "Place",
      name: event.venue || event.location,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.location,
        addressLocality: "Des Moines",
        addressRegion: "Iowa",
        addressCountry: "US",
      },
    },
    image: event.image_url,
    url: window.location.href,
    eventStatus: isUpcoming
      ? "https://schema.org/EventScheduled"
      : "https://schema.org/EventPostponed",
    organizer: {
      "@type": "Organization",
      name: "Des Moines Insider",
    },
    offers: event.price
      ? {
          "@type": "Offer",
          price: event.price,
          priceCurrency: "USD",
        }
      : undefined,
  };

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Events", url: "/events" },
    { name: event.title, url: `/events/${createEventSlug(event.title, String(event.date))}` },
  ];

  return (
    <>
      <SEOHead
        title={seoTitle}
        description={seoDescription}
        type="event"
        keywords={seoKeywords}
        structuredData={eventSchema}
        url={`/events/${createEventSlug(event.title, String(event.date))}`}
        imageUrl={event.image_url}
        breadcrumbs={breadcrumbs}
        location={{
          name: event.venue || event.location || "Des Moines",
          address: event.location || "Des Moines, IA",
        }}
        publishedTime={event.created_at}
        modifiedTime={event.updated_at}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-8 space-y-8">
          {/* Breadcrumb */}
          <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            <span>/</span>
            <Link to="/events" className="hover:text-foreground">
              Events
            </Link>
            <span>/</span>
            <span className="text-foreground">{event.title}</span>
          </nav>

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
                    <Button variant="outline" size="sm" onClick={handleShare}>
                      <Share2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>

                {event.image_url && (
                  <div className="px-6">
                    <img
                      src={event.image_url}
                      alt={event.title}
                      className="w-full h-64 object-cover rounded-lg"
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
                      <span>{formatEventDate(event.date)}</span>
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
                      {formatEventDate(event.date)}
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

                  <Button
                    variant="outline"
                    onClick={handleShare}
                    className="w-full"
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Share Event
                  </Button>

                  <Button variant="outline" asChild className="w-full">
                    <Link to="/">
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back to Events
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
