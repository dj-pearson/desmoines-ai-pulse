import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ShareDialog from "@/components/ShareDialog";
import { FAQSection } from "@/components/FAQSection";
import { BackToTop } from "@/components/BackToTop";
import EnhancedPlaygroundSEO from "@/components/EnhancedPlaygroundSEO";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import {
  MapPin,
  Star,
  ArrowLeft,
  Navigation,
  Share2,
  Heart,
  Sparkles,
  Check,
  Info,
  Users,
  Zap,
  ChevronRight,
  TreePine,
  Baby,
  Shield,
} from "lucide-react";
import { useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

export default function PlaygroundDetails() {
  const { slug } = useParams();
  const [imageError, setImageError] = useState(false);

  const {
    data: playground,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["playground", slug],
    queryFn: async () => {
      const { data: playgrounds, error } = await supabase
        .from("playgrounds")
        .select("*");

      if (error) throw error;

      const foundPlayground = playgrounds?.find(
        (p) => createSlug(p.name) === slug
      );
      return foundPlayground || null;
    },
  });

  const { data: relatedPlaygrounds } = useQuery({
    queryKey: ["related-playgrounds", playground?.age_range, playground?.id],
    queryFn: async () => {
      if (!playground) return [];
      const { data, error } = await supabase
        .from("playgrounds")
        .select("*")
        .eq("age_range", playground.age_range)
        .neq("id", playground.id)
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: !!playground?.age_range,
  });

  const { data: nearbyPlaygrounds } = useQuery({
    queryKey: ["nearby-playgrounds", playground?.age_range, playground?.id],
    queryFn: async () => {
      if (!playground) return [];
      const { data, error } = await supabase
        .from("playgrounds")
        .select("*")
        .neq("id", playground.id)
        .neq("age_range", playground.age_range || "")
        .order("rating", { ascending: false })
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: !!playground,
  });

  useDocumentTitle(playground?.name || "Playground Details");

  if (isLoading) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-gray-50">
          <div className="container mx-auto px-4 py-8 max-w-6xl">
            <div className="animate-pulse space-y-6">
              <div className="h-6 w-48 bg-gray-200 rounded" />
              <div className="h-80 bg-gray-200 rounded-3xl" />
              <div className="grid md:grid-cols-4 gap-4">
                <div className="h-24 bg-gray-200 rounded-2xl" />
                <div className="h-24 bg-gray-200 rounded-2xl" />
                <div className="h-24 bg-gray-200 rounded-2xl" />
                <div className="h-24 bg-gray-200 rounded-2xl" />
              </div>
              <div className="h-48 bg-gray-200 rounded-2xl" />
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (error || !playground) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Card className="max-w-md mx-auto text-center shadow-lg rounded-2xl">
            <CardContent className="p-8">
              <TreePine className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Playground Not Found
              </h2>
              <p className="text-gray-600 mb-6">
                The playground you're looking for doesn't exist or has been removed.
              </p>
              <Link to="/playgrounds">
                <Button className="bg-[#2D1B69] hover:bg-[#2D1B69]/90">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Playgrounds
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  const showImage = playground.image_url && !imageError;
  const playgroundSlug = createSlug(playground.name);
  const playgroundUrl = `${BRAND.baseUrl}/playgrounds/${playgroundSlug}`;

  // Generate dynamic FAQ
  const playgroundFaqs = [
    {
      question: `What ages is ${playground.name} suitable for?`,
      answer: playground.age_range
        ? `${playground.name} is designed for ages ${playground.age_range}. The playground features age-appropriate equipment and safe play areas for children in this age group. Always supervise children during play.`
        : `${playground.name} welcomes children of various ages. Visit the park to see the specific equipment available and determine if it's suitable for your child's age group.`,
    },
    {
      question: `Where is ${playground.name} located?`,
      answer: `${playground.name} is located at ${playground.location || BRAND.city + ", " + BRAND.state}. Free parking is typically available at the park. ${playground.latitude ? "You can find directions using the map on this page." : `Visit our playgrounds page for a map of all ${BRAND.city} playgrounds.`}`,
    },
    ...(playground.amenities && playground.amenities.length > 0
      ? [
          {
            question: `What amenities does ${playground.name} have?`,
            answer: `${playground.name} features the following amenities: ${playground.amenities.join(", ")}. The playground is maintained by the ${BRAND.city} Parks & Recreation Department as part of the city's parks system.`,
          },
        ]
      : []),
    ...(playground.rating
      ? [
          {
            question: `What is the rating for ${playground.name}?`,
            answer: `${playground.name} has a rating of ${playground.rating.toFixed(1)} out of 5 stars based on family reviews. ${playground.rating >= 4.5 ? `It's one of the highest-rated playgrounds in ${BRAND.city}.` : playground.rating >= 4.0 ? `It's a highly-rated playground in the ${BRAND.region}.` : `Families appreciate the play experience here.`} ${playground.is_featured ? "It's also featured as an editor's pick on Des Moines AI Pulse." : ""}`,
          },
        ]
      : []),
    {
      question: `Is ${playground.name} free?`,
      answer: `Yes, ${playground.name} is a free public playground in ${BRAND.city}, ${BRAND.state}. It is part of the city's parks system and is open to all visitors during park hours, typically dawn to dusk.`,
    },
  ];

  return (
    <>
      <Header />
      <EnhancedPlaygroundSEO
        playground={playground}
        slug={playgroundSlug}
      />
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl },
          { name: "Playgrounds", url: getCanonicalUrl("/playgrounds") },
          { name: playground.name, url: playgroundUrl },
        ]}
      />

      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Playgrounds", href: "/playgrounds" },
              { label: playground.name },
            ]}
            className="mb-4"
          />

          {/* Top Actions Bar */}
          <div className="flex items-center justify-between mb-6">
            <Link to="/playgrounds">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Playgrounds
              </Button>
            </Link>
            <div className="flex gap-2">
              <ShareDialog
                title={playground.name}
                description={playground.description || `Check out ${playground.name} - playground in Des Moines`}
                url={typeof window !== "undefined" ? window.location.href : ""}
                trigger={
                  <Button variant="outline" size="sm" className="rounded-xl">
                    <Share2 className="h-4 w-4 mr-1.5" />
                    Share
                  </Button>
                }
              />
              <Button variant="outline" size="sm" className="rounded-xl">
                <Heart className="h-4 w-4 mr-1.5" />
                Save
              </Button>
            </div>
          </div>

          {/* Hero Card */}
          <Card className="shadow-xl rounded-3xl overflow-hidden border-0 mb-8">
            {/* Hero Image / Gradient */}
            <div className="relative h-72 md:h-96 overflow-hidden">
              {showImage ? (
                <img
                  src={playground.image_url}
                  alt={`${playground.name} - Playground in ${BRAND.city}, ${BRAND.state}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#2D1B69] via-emerald-700 to-[#DC143C]">
                  <div className="absolute inset-0 opacity-10">
                    <div className="absolute top-10 right-10 w-40 h-40 border-2 border-white/30 rounded-full" />
                    <div className="absolute bottom-10 left-10 w-64 h-64 border border-white/20 rounded-full" />
                  </div>
                </div>
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

              {/* Badges */}
              <div className="absolute top-4 left-4 flex gap-2 z-10">
                {playground.is_featured && (
                  <Badge className="bg-amber-500 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Featured
                  </Badge>
                )}
                <Badge className="bg-emerald-500 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                  Free
                </Badge>
              </div>

              {/* Hero text */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
                <div className="max-w-3xl">
                  <div className="flex items-center gap-2 mb-2">
                    <TreePine className="h-4 w-4 text-white/70" />
                    <span className="text-white/80 text-sm font-medium uppercase tracking-wider">
                      Playground
                    </span>
                  </div>
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight drop-shadow-lg">
                    {playground.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-white/90">
                    {playground.rating && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-semibold">{playground.rating.toFixed(1)}</span>
                      </div>
                    )}
                    {playground.age_range && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <Users className="h-4 w-4" />
                        <span className="text-sm">Ages {playground.age_range}</span>
                      </div>
                    )}
                    {playground.location && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm">{playground.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap gap-3 p-4 md:p-6 bg-gray-50 border-b">
              {playground.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(playground.name + " " + playground.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button className="bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl">
                    <Navigation className="h-4 w-4 mr-2" />
                    Get Directions
                  </Button>
                </a>
              )}
              <ShareDialog
                title={playground.name}
                description={playground.description || `Discover ${playground.name} playground in Des Moines`}
                url={typeof window !== "undefined" ? window.location.href : ""}
              />
            </div>

            <CardContent className="p-6 md:p-10">
              {/* Key Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <Star className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {playground.rating ? playground.rating.toFixed(1) : "N/A"}
                  </div>
                  <div className="text-sm text-gray-600">Rating</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-2xl border border-purple-100">
                  <Baby className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                  <div className="text-lg font-bold text-gray-900 line-clamp-1">
                    {playground.age_range || "All Ages"}
                  </div>
                  <div className="text-sm text-gray-600">Age Range</div>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <Zap className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {playground.amenities?.length || 0}
                  </div>
                  <div className="text-sm text-gray-600">Amenities</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <Shield className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {playground.is_featured ? (
                      <Check className="h-7 w-7 text-blue-500 mx-auto" />
                    ) : (
                      "--"
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {playground.is_featured ? "Editor's Pick" : "Featured"}
                  </div>
                </div>
              </div>

              <Separator className="my-8" />

              {/* Details Grid */}
              <div className="grid md:grid-cols-2 gap-8">
                {/* Location & Access */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-[#2D1B69]" />
                    Location & Access
                  </h2>
                  <div className="space-y-3">
                    {playground.location && (
                      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                        <MapPin className="h-5 w-5 text-gray-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-gray-900 font-medium">{playground.location}</p>
                          <p className="text-sm text-gray-500">{BRAND.city}, {BRAND.state}</p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(playground.name + " " + playground.location)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center text-sm text-[#2D1B69] hover:underline mt-1"
                          >
                            <Navigation className="h-3.5 w-3.5 mr-1" />
                            Get Directions
                          </a>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Admission</span>
                      <Badge className="bg-emerald-100 text-emerald-700 font-medium">Free</Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Hours</span>
                      <span className="text-gray-900 text-sm font-medium">Dawn to Dusk</span>
                    </div>
                  </div>
                </div>

                {/* Playground Details */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <TreePine className="h-5 w-5 text-[#2D1B69]" />
                    Playground Details
                  </h2>
                  <div className="space-y-3">
                    {playground.age_range && (
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                        <span className="text-gray-600">Age Range</span>
                        <Badge variant="secondary" className="bg-[#2D1B69]/10 text-[#2D1B69] font-medium">
                          <Users className="h-3 w-3 mr-1" />
                          Ages {playground.age_range}
                        </Badge>
                      </div>
                    )}
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Rating</span>
                      <div className="flex items-center gap-1.5">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="text-gray-900 font-semibold">
                          {playground.rating ? playground.rating.toFixed(1) : "N/A"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Area</span>
                      <span className="text-gray-900 text-sm font-medium">{BRAND.region}</span>
                    </div>
                    {playground.is_featured && (
                      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                        <div className="flex items-center text-amber-700">
                          <Sparkles className="h-5 w-5 mr-2" />
                          <span className="font-medium">Editor's Pick - Featured Playground</span>
                        </div>
                        <p className="text-sm text-amber-600 mt-1">
                          Selected by our editors for exceptional play experience and family amenities.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* About Section */}
              {playground.description && (
                <>
                  <Separator className="my-8" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                      About {playground.name}
                    </h2>
                    <p className="text-gray-700 leading-relaxed text-lg">
                      {playground.description}
                    </p>
                    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 playground-summary">
                      <p className="text-sm text-gray-700 leading-relaxed" itemProp="description">
                        <strong>{playground.name}</strong> is a public playground
                        located {playground.location ? `at ${playground.location} in` : "in"} {BRAND.city}, {BRAND.state}.
                        {playground.age_range ? ` Designed for ages ${playground.age_range}.` : ""}
                        {playground.rating ? ` Rated ${playground.rating.toFixed(1)} out of 5 stars by families.` : ""}
                        {playground.amenities && playground.amenities.length > 0 ? ` Amenities include ${playground.amenities.join(", ")}.` : ""}
                        {playground.is_featured ? ` This playground is an editor's pick on ${BRAND.name}.` : ""}
                        {` Free admission. Open dawn to dusk.`}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Amenities Section */}
              {playground.amenities && playground.amenities.length > 0 && (
                <>
                  <Separator className="my-8" />
                  <section>
                    <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                      <Zap className="h-5 w-5 text-[#2D1B69]" />
                      Amenities & Features
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {playground.amenities.map((amenity, index) => (
                        <div key={index} className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                          <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                          <span className="text-gray-700 text-sm">{amenity}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {/* Things To Know */}
              <Separator className="my-8" />
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Info className="h-5 w-5 text-[#2D1B69]" />
                  Things To Know
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Where</h3>
                      <p className="text-sm text-gray-600">
                        {playground.location || BRAND.city}, {BRAND.state}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Ages</h3>
                      <p className="text-sm text-gray-600">
                        {playground.age_range ? `Designed for ages ${playground.age_range}` : "All ages welcome"}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Admission</h3>
                      <p className="text-sm text-gray-600">Free - public park</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Hours</h3>
                      <p className="text-sm text-gray-600">Dawn to Dusk, daily</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Area</h3>
                      <p className="text-sm text-gray-600">{BRAND.region}</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Good For</h3>
                      <p className="text-sm text-gray-600">Families, Children, Toddlers, Outdoor Play</p>
                    </div>
                  </div>
                </div>
              </section>
            </CardContent>
          </Card>

          {/* Playground-Specific FAQ */}
          <Card className="shadow-lg rounded-2xl border-0 mb-8 overflow-hidden">
            <FAQSection
              title={`Frequently Asked Questions About ${playground.name}`}
              description={`Common questions about ${playground.name} in ${BRAND.city}, ${BRAND.state}.`}
              faqs={playgroundFaqs}
              showSchema={true}
              className="border-0"
            />
          </Card>

          {/* Related Playgrounds - Same Age Range */}
          {relatedPlaygrounds && relatedPlaygrounds.length > 0 && (
            <section className="mb-8" aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-2xl font-bold text-gray-900 mb-2">
                More Playgrounds for Ages {playground.age_range}
              </h2>
              <p className="text-gray-600 mb-6">
                Explore other playgrounds suitable for the same age group in the {BRAND.region}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {relatedPlaygrounds.map((related) => (
                  <Link
                    key={related.id}
                    to={`/playgrounds/${createSlug(related.name)}`}
                    className="block"
                  >
                    <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden">
                      {related.image_url ? (
                        <div className="aspect-video overflow-hidden">
                          <img
                            src={related.image_url}
                            alt={`${related.name} - Playground in ${BRAND.city}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video bg-gradient-to-br from-[#2D1B69] to-emerald-600 flex items-center justify-center">
                          <TreePine className="h-10 w-10 text-white/50" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-base line-clamp-1 mb-1">{related.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {related.age_range && (
                            <Badge variant="outline" className="text-xs">Ages {related.age_range}</Badge>
                          )}
                          {related.rating && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              <span>{related.rating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Nearby Playgrounds - Different Age Range */}
          {nearbyPlaygrounds && nearbyPlaygrounds.length > 0 && (
            <section className="mb-8" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-2xl font-bold text-gray-900 mb-2">
                Other Popular Playgrounds in {BRAND.city}
              </h2>
              <p className="text-gray-600 mb-6">
                Discover more playgrounds in the {BRAND.region}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {nearbyPlaygrounds.map((nearby) => (
                  <Link
                    key={nearby.id}
                    to={`/playgrounds/${createSlug(nearby.name)}`}
                    className="block"
                  >
                    <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden">
                      {nearby.image_url ? (
                        <div className="aspect-video overflow-hidden">
                          <img
                            src={nearby.image_url}
                            alt={`${nearby.name} - Playground in ${BRAND.city}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video bg-gradient-to-br from-[#2D1B69] to-emerald-600 flex items-center justify-center">
                          <TreePine className="h-10 w-10 text-white/50" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-base line-clamp-1 mb-1">{nearby.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          {nearby.age_range && (
                            <Badge variant="outline" className="text-xs">Ages {nearby.age_range}</Badge>
                          )}
                          {nearby.rating && (
                            <div className="flex items-center gap-1">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              <span>{nearby.rating.toFixed(1)}</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Browse More CTA */}
          <div className="text-center py-8">
            <Link to="/playgrounds">
              <Button size="lg" className="bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl px-8">
                <TreePine className="h-5 w-5 mr-2" />
                Browse All Des Moines Playgrounds
              </Button>
            </Link>
          </div>
        </div>
      </div>
      <Footer />
      <BackToTop />
    </>
  );
}
