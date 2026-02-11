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
import EnhancedAttractionSEO from "@/components/EnhancedAttractionSEO";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import {
  MapPin,
  Star,
  ExternalLink,
  ArrowLeft,
  Navigation,
  Share2,
  Heart,
  Sparkles,
  Globe,
  Check,
  Info,
  Camera,
  Landmark,
  ChevronRight,
  Compass,
  Clock,
  Ticket,
  TreePine,
} from "lucide-react";
import { useState } from "react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const createSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

export default function AttractionDetails() {
  const { slug } = useParams();
  const [imageError, setImageError] = useState(false);

  const {
    data: attraction,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["attraction", slug],
    queryFn: async () => {
      const { data: attractions, error } = await supabase
        .from("attractions")
        .select("*");

      if (error) throw error;

      const foundAttraction = attractions?.find(
        (a) => createSlug(a.name) === slug
      );
      return foundAttraction || null;
    },
  });

  const { data: relatedAttractions } = useQuery({
    queryKey: ["related-attractions", attraction?.type, attraction?.id],
    queryFn: async () => {
      if (!attraction) return [];
      const { data, error } = await supabase
        .from("attractions")
        .select("*")
        .eq("type", attraction.type)
        .neq("id", attraction.id)
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: !!attraction,
  });

  const { data: nearbyAttractions } = useQuery({
    queryKey: ["nearby-attractions", attraction?.type, attraction?.id],
    queryFn: async () => {
      if (!attraction) return [];
      const { data, error } = await supabase
        .from("attractions")
        .select("*")
        .neq("id", attraction.id)
        .neq("type", attraction.type)
        .order("rating", { ascending: false })
        .limit(4);

      if (error) throw error;
      return data || [];
    },
    enabled: !!attraction,
  });

  useDocumentTitle(attraction?.name || "Attraction Details");

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

  if (error || !attraction) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <Card className="max-w-md mx-auto text-center shadow-lg rounded-2xl">
            <CardContent className="p-8">
              <Landmark className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Attraction Not Found
              </h2>
              <p className="text-gray-600 mb-6">
                The attraction you're looking for doesn't exist or has been removed.
              </p>
              <Link to="/attractions">
                <Button className="bg-[#2D1B69] hover:bg-[#2D1B69]/90">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Attractions
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  const showImage = attraction.image_url && !imageError;
  const attractionSlug = createSlug(attraction.name);
  const attractionUrl = `${BRAND.baseUrl}/attractions/${attractionSlug}`;

  // Generate dynamic FAQ
  const attractionFaqs = [
    {
      question: `What is ${attraction.name}?`,
      answer: `${attraction.name} is a ${attraction.type?.toLowerCase()} attraction located in ${BRAND.city}, ${BRAND.state}. ${attraction.description ? attraction.description.slice(0, 250) : `It's one of the popular ${attraction.type?.toLowerCase()} destinations in the ${BRAND.region}.`}`,
    },
    {
      question: `Where is ${attraction.name} located?`,
      answer: `${attraction.name} is located at ${attraction.location || BRAND.city + ", " + BRAND.state}. ${attraction.latitude ? "You can find directions using the map on this page." : `Visit our attractions page for a map of all ${BRAND.city} attractions.`}`,
    },
    ...(attraction.rating
      ? [
          {
            question: `What is the rating for ${attraction.name}?`,
            answer: `${attraction.name} has a rating of ${attraction.rating.toFixed(1)} out of 5 stars based on visitor reviews. ${attraction.rating >= 4.5 ? `It's one of the highest-rated attractions in ${BRAND.city}.` : attraction.rating >= 4.0 ? `It's a highly-rated attraction in the ${BRAND.region}.` : `Visitors appreciate its unique ${attraction.type?.toLowerCase()} experience.`} ${attraction.is_featured ? "It's also featured as an editor's pick on Des Moines AI Pulse." : ""}`,
          },
        ]
      : []),
    {
      question: `How do I get to ${attraction.name}?`,
      answer: `${attraction.name} is located ${attraction.location ? `at ${attraction.location}` : ""} in ${BRAND.city}, ${BRAND.state}. The area is easily accessible by car via I-235 and I-80/I-35. Downtown parking is available in public garages and street parking. DART public transit routes also serve the area.`,
    },
    {
      question: `Is ${attraction.name} good for families?`,
      answer: `${attraction.name} is a ${attraction.type?.toLowerCase()} that welcomes visitors of all ages. ${BRAND.city} is known for its family-friendly attractions and ${attraction.name} is popular among families visiting the area. Check the official website for specific age recommendations and family amenities.`,
    },
  ];

  return (
    <>
      <Header />
      <EnhancedAttractionSEO
        attraction={attraction}
        slug={attractionSlug}
      />
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: BRAND.baseUrl },
          { name: "Attractions", url: getCanonicalUrl("/attractions") },
          { name: attraction.type, url: getCanonicalUrl(`/attractions?type=${encodeURIComponent(attraction.type)}`) },
          { name: attraction.name, url: attractionUrl },
        ]}
      />

      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto px-4 py-6 max-w-6xl">
          {/* Breadcrumb Navigation */}
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Attractions", href: "/attractions" },
              { label: attraction.type, href: `/attractions?type=${encodeURIComponent(attraction.type)}` },
              { label: attraction.name },
            ]}
            className="mb-4"
          />

          {/* Top Actions Bar */}
          <div className="flex items-center justify-between mb-6">
            <Link to="/attractions">
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-gray-900 -ml-2">
                <ArrowLeft className="h-4 w-4 mr-1" />
                All Attractions
              </Button>
            </Link>
            <div className="flex gap-2">
              <ShareDialog
                title={attraction.name}
                description={attraction.description || `Check out ${attraction.name} - ${attraction.type} in Des Moines`}
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
                  src={attraction.image_url}
                  alt={`${attraction.name} - ${attraction.type} in ${BRAND.city}, ${BRAND.state}`}
                  className="absolute inset-0 w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  onError={() => setImageError(true)}
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-[#2D1B69] via-[#5B2D8E] to-[#DC143C]">
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
                {attraction.is_featured && (
                  <Badge className="bg-amber-500 text-white border-0 shadow-lg text-sm font-semibold px-3 py-1">
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Featured
                  </Badge>
                )}
              </div>

              {/* Hero text */}
              <div className="absolute bottom-0 left-0 right-0 p-6 md:p-10 z-10">
                <div className="max-w-3xl">
                  {attraction.type && (
                    <div className="flex items-center gap-2 mb-2">
                      <Landmark className="h-4 w-4 text-white/70" />
                      <span className="text-white/80 text-sm font-medium uppercase tracking-wider">
                        {attraction.type}
                      </span>
                    </div>
                  )}
                  <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight drop-shadow-lg">
                    {attraction.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-3 text-white/90">
                    {attraction.rating && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="font-semibold">{attraction.rating.toFixed(1)}</span>
                      </div>
                    )}
                    {attraction.location && (
                      <div className="flex items-center gap-1.5 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1">
                        <MapPin className="h-4 w-4" />
                        <span className="text-sm">{attraction.location}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions Bar */}
            <div className="flex flex-wrap gap-3 p-4 md:p-6 bg-gray-50 border-b">
              {attraction.website && (
                <a href={attraction.website} target="_blank" rel="noopener noreferrer">
                  <Button className="bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl">
                    <Globe className="h-4 w-4 mr-2" />
                    Visit Website
                  </Button>
                </a>
              )}
              {attraction.location && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(attraction.name + " " + attraction.location)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="outline" className="rounded-xl">
                    <Navigation className="h-4 w-4 mr-2" />
                    Directions
                  </Button>
                </a>
              )}
              <ShareDialog
                title={attraction.name}
                description={attraction.description || `Discover ${attraction.name} in Des Moines`}
                url={typeof window !== "undefined" ? window.location.href : ""}
              />
            </div>

            <CardContent className="p-6 md:p-10">
              {/* Key Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="text-center p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <Star className="h-6 w-6 text-amber-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {attraction.rating ? attraction.rating.toFixed(1) : "N/A"}
                  </div>
                  <div className="text-sm text-gray-600">Rating</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-2xl border border-purple-100">
                  <Landmark className="h-6 w-6 text-purple-500 mx-auto mb-2" />
                  <div className="text-lg font-bold text-gray-900 line-clamp-1">
                    {attraction.type}
                  </div>
                  <div className="text-sm text-gray-600">Category</div>
                </div>
                <div className="text-center p-4 bg-blue-50 rounded-2xl border border-blue-100">
                  <MapPin className="h-6 w-6 text-blue-500 mx-auto mb-2" />
                  <div className="text-lg font-bold text-gray-900 line-clamp-1">
                    {BRAND.city}
                  </div>
                  <div className="text-sm text-gray-600">Location</div>
                </div>
                <div className="text-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                  <Compass className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
                  <div className="text-2xl font-bold text-gray-900">
                    {attraction.is_featured ? (
                      <Check className="h-7 w-7 text-emerald-500 mx-auto" />
                    ) : (
                      "--"
                    )}
                  </div>
                  <div className="text-sm text-gray-600">
                    {attraction.is_featured ? "Editor's Pick" : "Featured"}
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
                    {attraction.location && (
                      <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-xl">
                        <MapPin className="h-5 w-5 text-gray-500 mt-0.5 shrink-0" />
                        <div>
                          <p className="text-gray-900 font-medium">{attraction.location}</p>
                          <p className="text-sm text-gray-500">{BRAND.city}, {BRAND.state}</p>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(attraction.name + " " + attraction.location)}`}
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
                    {attraction.website && (
                      <a
                        href={attraction.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-3 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                      >
                        <ExternalLink className="h-5 w-5 text-gray-500 shrink-0" />
                        <span className="text-[#2D1B69] hover:underline">Visit Website</span>
                      </a>
                    )}
                  </div>
                </div>

                {/* Attraction Details */}
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Landmark className="h-5 w-5 text-[#2D1B69]" />
                    Attraction Details
                  </h2>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Type</span>
                      <Badge variant="secondary" className="bg-[#2D1B69]/10 text-[#2D1B69] font-medium">
                        {attraction.type}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Rating</span>
                      <div className="flex items-center gap-1.5">
                        <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                        <span className="text-gray-900 font-semibold">
                          {attraction.rating ? attraction.rating.toFixed(1) : "N/A"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                      <span className="text-gray-600">Area</span>
                      <span className="text-gray-900 text-sm font-medium">{BRAND.region}</span>
                    </div>
                    {attraction.is_featured && (
                      <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
                        <div className="flex items-center text-amber-700">
                          <Sparkles className="h-5 w-5 mr-2" />
                          <span className="font-medium">Editor's Pick - Featured Attraction</span>
                        </div>
                        <p className="text-sm text-amber-600 mt-1">
                          Selected by our editors for exceptional visitor experience and local significance.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* About Section */}
              {attraction.description && (
                <>
                  <Separator className="my-8" />
                  <div>
                    <h2 className="text-xl font-bold text-gray-900 mb-4">
                      About {attraction.name}
                    </h2>
                    <p className="text-gray-700 leading-relaxed text-lg">
                      {attraction.description}
                    </p>
                    {/* AI-friendly summary paragraph */}
                    <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-100 attraction-summary">
                      <p className="text-sm text-gray-700 leading-relaxed" itemProp="description">
                        <strong>{attraction.name}</strong> is a {attraction.type?.toLowerCase()} attraction
                        located {attraction.location ? `at ${attraction.location} in` : "in"} {BRAND.city}, {BRAND.state}.
                        {attraction.rating ? ` Rated ${attraction.rating.toFixed(1)} out of 5 stars by visitors.` : ""}
                        {attraction.is_featured ? ` This attraction is an editor's pick on ${BRAND.name}.` : ""}
                        {` Part of the vibrant ${BRAND.region} tourism scene, ${attraction.name} is a must-visit destination for locals and tourists alike.`}
                      </p>
                    </div>
                  </div>
                </>
              )}

              {/* Things To Know - Featured Snippet Optimized */}
              <Separator className="my-8" />
              <section>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Info className="h-5 w-5 text-[#2D1B69]" />
                  Things To Know
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">What</h3>
                      <p className="text-sm text-gray-600">{attraction.type} attraction</p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Where</h3>
                      <p className="text-sm text-gray-600">
                        {attraction.location || BRAND.city}, {BRAND.state}
                      </p>
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Area</h3>
                      <p className="text-sm text-gray-600">{BRAND.region}</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Rating</h3>
                      <p className="text-sm text-gray-600">
                        {attraction.rating ? `${attraction.rating.toFixed(1)} out of 5 stars` : "Not yet rated"}
                      </p>
                    </div>
                    {attraction.website && (
                      <div>
                        <h3 className="font-semibold text-sm text-gray-900">More Info</h3>
                        <a
                          href={attraction.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#2D1B69] hover:underline inline-flex items-center gap-1"
                        >
                          Official Website
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    <div>
                      <h3 className="font-semibold text-sm text-gray-900">Good For</h3>
                      <p className="text-sm text-gray-600">Families, Couples, Solo Travelers, Groups</p>
                    </div>
                  </div>
                </div>
              </section>
            </CardContent>
          </Card>

          {/* Attraction-Specific FAQ */}
          <Card className="shadow-lg rounded-2xl border-0 mb-8 overflow-hidden">
            <FAQSection
              title={`Frequently Asked Questions About ${attraction.name}`}
              description={`Common questions about ${attraction.name} in ${BRAND.city}, ${BRAND.state}.`}
              faqs={attractionFaqs}
              showSchema={true}
              className="border-0"
            />
          </Card>

          {/* Related Attractions - Same Type */}
          {relatedAttractions && relatedAttractions.length > 0 && (
            <section className="mb-8" aria-labelledby="related-heading">
              <h2 id="related-heading" className="text-2xl font-bold text-gray-900 mb-2">
                More {attraction.type} Attractions in {BRAND.city}
              </h2>
              <p className="text-gray-600 mb-6">
                Explore other {attraction.type?.toLowerCase()} attractions in the {BRAND.region}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {relatedAttractions.map((related) => (
                  <Link
                    key={related.id}
                    to={`/attractions/${createSlug(related.name)}`}
                    className="block"
                  >
                    <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden">
                      {related.image_url ? (
                        <div className="aspect-video overflow-hidden">
                          <img
                            src={related.image_url}
                            alt={`${related.name} - ${related.type} in ${BRAND.city}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video bg-gradient-to-br from-[#2D1B69] to-[#DC143C] flex items-center justify-center">
                          <Landmark className="h-10 w-10 text-white/50" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-base line-clamp-1 mb-1">{related.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Badge variant="outline" className="text-xs">{related.type}</Badge>
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

          {/* Nearby Attractions - Different Type */}
          {nearbyAttractions && nearbyAttractions.length > 0 && (
            <section className="mb-8" aria-labelledby="nearby-heading">
              <h2 id="nearby-heading" className="text-2xl font-bold text-gray-900 mb-2">
                Other Popular Attractions in {BRAND.city}
              </h2>
              <p className="text-gray-600 mb-6">
                Discover more things to do in the {BRAND.region}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {nearbyAttractions.map((nearby) => (
                  <Link
                    key={nearby.id}
                    to={`/attractions/${createSlug(nearby.name)}`}
                    className="block"
                  >
                    <Card className="h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1 rounded-2xl overflow-hidden">
                      {nearby.image_url ? (
                        <div className="aspect-video overflow-hidden">
                          <img
                            src={nearby.image_url}
                            alt={`${nearby.name} - ${nearby.type} in ${BRAND.city}`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className="aspect-video bg-gradient-to-br from-[#2D1B69] to-[#DC143C] flex items-center justify-center">
                          <Landmark className="h-10 w-10 text-white/50" />
                        </div>
                      )}
                      <CardContent className="p-4">
                        <h3 className="font-semibold text-base line-clamp-1 mb-1">{nearby.name}</h3>
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <Badge variant="outline" className="text-xs">{nearby.type}</Badge>
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
            <Link to="/attractions">
              <Button size="lg" className="bg-[#2D1B69] hover:bg-[#2D1B69]/90 text-white rounded-xl px-8">
                <Landmark className="h-5 w-5 mr-2" />
                Browse All Des Moines Attractions
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
