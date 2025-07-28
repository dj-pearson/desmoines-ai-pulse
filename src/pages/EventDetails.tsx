import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Calendar, MapPin, ExternalLink, Tag, Clock, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Helmet } from "react-helmet-async";

export default function EventDetails() {
  const { slug } = useParams();

  const { data: event, isLoading, error } = useQuery({
    queryKey: ["event", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("id", slug)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const { data: relatedEvents } = useQuery({
    queryKey: ["related-events", event?.category, event?.id],
    queryFn: async () => {
      if (!event) return [];
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("category", event.category)
        .neq("id", event.id)
        .gte("date", new Date().toISOString().split('T')[0])
        .order("date", { ascending: true })
        .limit(3);

      if (error) throw error;
      return data;
    },
    enabled: !!event,
  });

  const handleShare = async () => {
    if (navigator.share && event) {
      try {
        await navigator.share({
          title: event.title,
          text: event.enhanced_description || event.original_description,
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
        <div className="container mx-auto px-4 py-8">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-muted rounded w-3/4"></div>
            <div className="h-64 bg-muted rounded"></div>
            <div className="space-y-2">
              <div className="h-4 bg-muted rounded"></div>
              <div className="h-4 bg-muted rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-destructive">Event Not Found</h1>
          <p className="text-muted-foreground">The event you're looking for doesn't exist.</p>
          <Button asChild>
            <Link to="/">Return Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  const eventDate = new Date(event.date);
  const isUpcoming = eventDate >= new Date();

  return (
    <>
      <Helmet>
        <title>{event.title} - Des Moines Events</title>
        <meta name="description" content={event.enhanced_description || event.original_description || `Join us for ${event.title} in Des Moines`} />
        <meta property="og:title" content={event.title} />
        <meta property="og:description" content={event.enhanced_description || event.original_description || `Join us for ${event.title} in Des Moines`} />
        <meta property="og:type" content="event" />
        <meta property="og:url" content={window.location.href} />
        {event.image_url && <meta property="og:image" content={event.image_url} />}
        <script type="application/ld+json">
          {JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Event",
            name: event.title,
            description: event.enhanced_description || event.original_description,
            startDate: event.date,
            location: {
              "@type": "Place",
              name: event.venue || event.location,
              address: event.location,
            },
            image: event.image_url,
            url: window.location.href,
            eventStatus: isUpcoming ? "https://schema.org/EventScheduled" : "https://schema.org/EventPostponed",
          })}
        </script>
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Breadcrumb */}
        <div className="border-b">
          <div className="container mx-auto px-4 py-3">
            <nav className="flex items-center space-x-2 text-sm text-muted-foreground">
              <Link to="/" className="hover:text-primary transition-colors">Home</Link>
              <span>/</span>
              <Link to="/events" className="hover:text-primary transition-colors">Events</Link>
              <span>/</span>
              <Link to={`/events/category/${event.category.toLowerCase()}`} className="hover:text-primary transition-colors">{event.category}</Link>
              <span>/</span>
              <span className="text-foreground">{event.title}</span>
            </nav>
          </div>
        </div>

        <div className="container mx-auto px-4 py-8">
          <div className="grid lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Header */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <h1 className="text-3xl md:text-4xl font-bold leading-tight">{event.title}</h1>
                  <Button variant="outline" size="sm" onClick={handleShare}>
                    <Share2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="flex items-center gap-4 text-muted-foreground">
                  <Badge variant={isUpcoming ? "default" : "secondary"}>
                    {isUpcoming ? "Upcoming" : "Past Event"}
                  </Badge>
                  <Badge variant="outline">
                    <Tag className="h-3 w-3 mr-1" />
                    {event.category}
                  </Badge>
                </div>
              </div>

              {/* Event Image */}
              {event.image_url && (
                <div className="aspect-video rounded-lg overflow-hidden">
                  <img 
                    src={event.image_url} 
                    alt={event.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              {/* Description */}
              <Card>
                <CardContent className="p-6">
                  <h2 className="text-xl font-semibold mb-4">About This Event</h2>
                  <div className="prose prose-sm max-w-none text-muted-foreground">
                    {event.enhanced_description || event.original_description || "No description available."}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Event Details */}
              <Card>
                <CardContent className="p-6 space-y-4">
                  <h3 className="font-semibold text-lg">Event Details</h3>
                  
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <Calendar className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Date & Time</p>
                        <p className="text-sm text-muted-foreground">
                          {format(eventDate, "EEEE, MMMM d, yyyy")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(eventDate, "h:mm a")}
                        </p>
                      </div>
                    </div>

                    {event.venue && (
                      <div className="flex items-start gap-3">
                        <MapPin className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="font-medium">Venue</p>
                          <p className="text-sm text-muted-foreground">{event.venue}</p>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start gap-3">
                      <MapPin className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Location</p>
                        <p className="text-sm text-muted-foreground">{event.location}</p>
                      </div>
                    </div>

                    {event.price && (
                      <div className="flex items-start gap-3">
                        <Tag className="h-5 w-5 text-primary mt-0.5" />
                        <div>
                          <p className="font-medium">Price</p>
                          <p className="text-sm text-muted-foreground">{event.price}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {event.source_url && (
                    <div className="pt-4">
                      <Button asChild className="w-full">
                        <a href={event.source_url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-4 w-4 mr-2" />
                          More Information
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Related Events */}
              {relatedEvents && relatedEvents.length > 0 && (
                <Card>
                  <CardContent className="p-6">
                    <h3 className="font-semibold text-lg mb-4">Related Events</h3>
                    <div className="space-y-3">
                      {relatedEvents.map((relatedEvent) => (
                        <Link 
                          key={relatedEvent.id}
                          to={`/events/${relatedEvent.id}`}
                          className="block p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                        >
                          <h4 className="font-medium text-sm line-clamp-2">{relatedEvent.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {format(new Date(relatedEvent.date), "MMM d, yyyy")}
                          </p>
                        </Link>
                      ))}
                    </div>
                    <Button asChild variant="outline" className="w-full mt-4">
                      <Link to={`/events/category/${event.category.toLowerCase()}`}>
                        View All {event.category} Events
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}