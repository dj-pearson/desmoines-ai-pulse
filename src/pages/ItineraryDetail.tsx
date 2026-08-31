import { useParams, Link } from 'react-router-dom';
import { RouteCanonical } from "@/components/RouteCanonical";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useItinerary, getDurationLabel, getThemeLabel } from '@/hooks/useItineraries';
import type { ItineraryStop } from '@/hooks/useItineraries';
import TouristTripSchema from '@/components/schema/TouristTripSchema';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Printer, ArrowLeft, Lightbulb, UtensilsCrossed, Landmark, CalendarPlus } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

function stopIcon(entityType: string) {
  switch (entityType) {
    case 'restaurant': return <UtensilsCrossed className="h-4 w-4" />;
    case 'attraction': return <Landmark className="h-4 w-4" />;
    default: return <SpriteIcon name="map-pin" className="h-4 w-4" />;
  }
}

function generateICS(title: string, stops: ItineraryStop[]): string {
  const today = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${today.getFullYear()}${pad(today.getMonth() + 1)}${pad(today.getDate())}`;

  let ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Des Moines Insider//Itinerary//EN',
    `X-WR-CALNAME:${title}`,
  ];

  for (const stop of stops) {
    const timeParts = stop.time_suggestion?.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!timeParts) continue;
    let hour = parseInt(timeParts[1], 10);
    const min = timeParts[2];
    const ampm = timeParts[3].toUpperCase();
    if (ampm === 'PM' && hour !== 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    const startTime = `${pad(hour)}${min}00`;
    const endHour = hour + 1;
    const endTime = `${pad(endHour)}${min}00`;

    ics.push(
      'BEGIN:VEVENT',
      `DTSTART:${dateStr}T${startTime}`,
      `DTEND:${dateStr}T${endTime}`,
      `SUMMARY:${stop.name}`,
      `DESCRIPTION:${stop.description}${stop.tips ? '\\nTip: ' + stop.tips : ''}`,
      'END:VEVENT',
    );
  }

  ics.push('END:VCALENDAR');
  return ics.join('\r\n');
}

function downloadICS(title: string, stops: ItineraryStop[]) {
  const content = generateICS(title, stops);
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function ItineraryDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { data: itinerary, isLoading } = useItinerary(slug || '');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/itineraries/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-6 w-96" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-lg" />
          ))}
        </div>
        <Footer />
      </div>
    );
  }

  if (!itinerary) {
    return (
      <div className="min-h-screen bg-background">
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Itinerary Not Found</h1>
          <p className="text-muted-foreground mb-6">The itinerary you are looking for does not exist.</p>
          <Link to="/itineraries">
            <Button><ArrowLeft className="h-4 w-4 mr-2" /> Back to Itineraries</Button>
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  const siteUrl = import.meta.env.VITE_SITE_URL || 'https://desmoinesinsider.com';
  const pageUrl = `${siteUrl}/itineraries/${itinerary.slug}`;
  const stops: ItineraryStop[] = Array.isArray(itinerary.stops) ? itinerary.stops : [];

  return (
    <>
      <Helmet>
        <title>{itinerary.seo_title || itinerary.title} | Des Moines Insider</title>
        <meta name="description" content={itinerary.seo_description || itinerary.description || ''} />
        <meta property="og:title" content={itinerary.seo_title || itinerary.title} />
        <meta property="og:description" content={itinerary.seo_description || itinerary.description || ''} />
        <meta property="og:url" content={pageUrl} />
        <meta property="og:type" content="website" />
      </Helmet>

      <TouristTripSchema
        name={itinerary.title}
        description={itinerary.description || ''}
        url={pageUrl}
        itinerary={stops.map((s) => ({ name: s.name, description: s.description }))}
      />

      <div className="min-h-screen bg-background">
        {/* Hide header/footer in print */}
        <div className="print:hidden">
          <Header />
        </div>

        <div className="container mx-auto px-4 py-8">
          {/* Back link (screen only) */}
          <div className="print:hidden mb-6">
            <Link to="/itineraries" className="text-sm text-muted-foreground hover:text-primary inline-flex items-center gap-1">
              <ArrowLeft className="h-4 w-4" /> All Itineraries
            </Link>
          </div>

          {/* Hero */}
          <div className="mb-8">
            {/* Print header */}
            <div className="hidden print:block mb-4">
              <p className="text-sm text-muted-foreground">Des Moines Insider — desmoinesinsider.com</p>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold mb-3">{itinerary.title}</h1>
            {itinerary.description && (
              <p className="text-lg text-muted-foreground mb-4 max-w-3xl">{itinerary.description}</p>
            )}
            <div className="flex items-center gap-3 flex-wrap mb-6">
              <Badge variant="secondary">
                <SpriteIcon name="clock" className="h-3 w-3 mr-1" />
                {getDurationLabel(itinerary.duration)}
              </Badge>
              <Badge variant="outline">{getThemeLabel(itinerary.theme)}</Badge>
              <Badge variant="outline">{stops.length} stops</Badge>
            </div>

            {/* Action buttons (screen only) */}
            <div className="flex items-center gap-3 print:hidden">
              <Button variant="outline" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-2" /> Print Checklist
              </Button>
              <Button variant="outline" onClick={() => downloadICS(itinerary.title, stops)}>
                <CalendarPlus className="h-4 w-4 mr-2" /> Add All to Calendar
              </Button>
            </div>
          </div>

          {/* Stops */}
          <div className="space-y-4 max-w-3xl">
            {stops
              .sort((a, b) => a.order - b.order)
              .map((stop, idx) => (
                <Card key={idx} className="print:shadow-none print:border print:break-inside-avoid">
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Step number / checkbox */}
                      <div className="flex-shrink-0">
                        {/* Print: checkbox, Screen: number */}
                        <div className="hidden print:block w-5 h-5 border-2 border-gray-400 rounded mt-1" />
                        <div className="print:hidden w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-sm">
                          {stop.order}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {stopIcon(stop.entity_type)}
                          <h3 className="font-semibold text-lg">{stop.name}</h3>
                        </div>

                        {stop.time_suggestion && (
                          <p className="text-sm text-muted-foreground mb-2">
                            <SpriteIcon name="clock" className="h-3 w-3 inline mr-1" />
                            {stop.time_suggestion}
                          </p>
                        )}

                        <p className="text-sm mb-2">{stop.description}</p>

                        {stop.tips && (
                          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-md p-3 text-sm">
                            <Lightbulb className="h-4 w-4 inline mr-1 text-amber-600" />
                            <span className="font-medium">Insider Tip:</span> {stop.tips}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
          </div>
        </div>

        <div className="print:hidden">
          <Footer />
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          body { font-size: 12pt; }
          .print\\:hidden { display: none !important; }
          .hidden.print\\:block { display: block !important; }
          nav, footer, .print\\:hidden { display: none !important; }
        }
      `}</style>
    </>
  );
}
