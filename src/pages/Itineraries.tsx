import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useItineraries, getThemeLabel, getDurationLabel } from '@/hooks/useItineraries';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Heart, Users, Palette, Dumbbell, Utensils, Compass } from "lucide-react";
import { getCanonicalUrl } from '@/lib/brandConfig';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const THEME_ICONS: Record<string, typeof Heart> = {
  romance: Heart,
  family: Users,
  adventure: Dumbbell,
  'food-drink': Utensils,
  'arts-culture': Palette,
  sports: Dumbbell,
  general: Compass,
};

const THEME_ORDER = ['general', 'romance', 'family', 'food-drink', 'arts-culture', 'adventure', 'sports'];

export default function Itineraries() {
  const { data: itineraries, isLoading } = useItineraries();

  const groupedByTheme = itineraries?.reduce<Record<string, typeof itineraries>>((acc, it) => {
    if (!acc[it.theme]) acc[it.theme] = [];
    acc[it.theme].push(it);
    return acc;
  }, {});

  const sortedThemes = groupedByTheme
    ? THEME_ORDER.filter((t) => groupedByTheme[t])
    : [];

  return (
    <>
      <Helmet>
        <title>Curated Itineraries — Des Moines Trip Plans | Des Moines Insider</title>
        <meta name="description" content="Browse curated Des Moines itineraries for weekends, date days, family fun, food tours, and art walks. Printable checklists included." />
        {/* WEB-SEO-002: sitemapped and prerendered, but had no canonical. */}
        <link rel="canonical" href={getCanonicalUrl('/itineraries')} />
        {/* WEB-SEO-002: these pages set only title/description, so index.html's
            static og: and twitter: tags were the only ones shipping — pinned to the
            homepage on every route. Emitting them here lets the static copies be
            marked data-rh and replaced rather than duplicated. */}
        <meta property="og:title" content="Curated Itineraries — Des Moines Trip Plans | Des Moines Insider" />
        <meta property="og:description" content="Browse curated Des Moines itineraries for weekends, date days, family fun, food tours, and art walks. Printable checklists included." />
        <meta property="og:url" content={getCanonicalUrl('/itineraries')} />
        <meta name="twitter:title" content="Curated Itineraries — Des Moines Trip Plans | Des Moines Insider" />
        <meta name="twitter:description" content="Browse curated Des Moines itineraries for weekends, date days, family fun, food tours, and art walks. Printable checklists included." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <SpriteIcon name="map-pin" className="h-5 w-5" />
              <span className="font-semibold">Curated by Locals</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Des Moines Itineraries
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Pre-built trip plans so you can browse, pick, and go.
              Every itinerary includes insider tips and a printable checklist.
            </p>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 rounded-lg" />
              ))}
            </div>
          ) : (
            sortedThemes.map((theme) => {
              const items = groupedByTheme![theme];
              const Icon = THEME_ICONS[theme] || Compass;
              return (
                <section key={theme} className="mb-10">
                  <div className="flex items-center gap-2 mb-4">
                    <Icon className="h-5 w-5 text-primary" />
                    <h2 className="text-2xl font-bold">{getThemeLabel(theme)}</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {items.map((it) => (
                      <Link key={it.id} to={`/itineraries/${it.slug}`}>
                        <Card className="hover:border-primary transition-colors h-full">
                          {it.cover_image && (
                            <div className="h-40 overflow-hidden rounded-t-lg">
                              <img
                                src={it.cover_image}
                                alt={it.title}
                                className="w-full h-full object-cover"
                                loading="lazy"
                              />
                            </div>
                          )}
                          <CardContent className="p-5">
                            <h3 className="text-lg font-semibold mb-2">{it.title}</h3>
                            {it.description && (
                              <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                                {it.description}
                              </p>
                            )}
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant="secondary">
                                <SpriteIcon name="clock" className="h-3 w-3 mr-1" />
                                {getDurationLabel(it.duration)}
                              </Badge>
                              <Badge variant="outline">
                                {it.stops?.length || 0} stops
                              </Badge>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </section>
              );
            })
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
