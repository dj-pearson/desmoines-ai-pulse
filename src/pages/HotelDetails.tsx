import { useParams, Link } from "react-router-dom";
import { RouteCanonical } from "@/components/RouteCanonical";
import { ErrorState } from "@/components/ui/error-state";
import { Helmet } from "react-helmet-async";
import { useHotel } from "@/hooks/useHotels";
import HotelSchema from "@/components/schema/HotelSchema";
import { NearbyVenues } from "@/components/venues/NearbyVenues";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Globe, Mail, Star, ChevronRight, ArrowLeft, Navigation } from "lucide-react";
import AffiliateDisclosureBanner from "@/components/AffiliateDisclosureBanner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { LazyLocationMap } from "@/components/LazyLocationMap";
import { getDirectionsUrl } from "@/lib/directions";
import { FavoriteButton } from "@/components/FavoriteButton";
import { OpenStatusChip } from "@/components/OpenStatusChip";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import { BreadcrumbListSchema } from "@/components/schema/BreadcrumbListSchema";
import { BRAND, getCanonicalUrl } from "@/lib/brandConfig";
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { OptimizedImage } from "@/components/OptimizedImage";
import { STATUS_BADGE } from "@/lib/categoryStyles";
import { AFFILIATE_DISCLOSURE, hotelClassStars, hotelRateLabel, resolveBooking, safeWebUrl } from "@/lib/hotelBooking";
import { telHref } from "@/lib/reservations";
import { FAQSection } from "@/components/FAQSection";
import { readGeoFaq } from "@/lib/restaurantMeta";
import { HotelNearbyEvents } from "@/components/hotels/HotelNearbyEvents";

function StarRating({ rating }: { rating: number }) {
  const stars = [];
  const fullStars = Math.floor(rating);
  const hasHalf = rating % 1 >= 0.5;

  for (let i = 0; i < fullStars; i++) {
    stars.push(<Star key={i} className="h-5 w-5 fill-yellow-400 text-yellow-400" />);
  }
  if (hasHalf) {
    stars.push(<Star key="half" className="h-5 w-5 fill-yellow-400/50 text-yellow-400" />);
  }
  for (let i = stars.length; i < 5; i++) {
    stars.push(<Star key={`empty-${i}`} className="h-5 w-5 text-gray-300" />);
  }

  return <div className="flex items-center gap-0.5">{stars}</div>;
}

export default function HotelDetails() {
  const { slug } = useParams<{ slug: string }>();
  const { hotel, isLoading, error, refetch } = useHotel(slug);

  // WEB-FEAT-012 resolved the booking link once so its call sites could not
  // drift; it then drifted anyway (`??` here, `||` further down). plan-stay
  // WP2 item 4 moves the decision into resolveBooking(): http(s) only, the
  // affiliate link first and labelled with its provider, the website second
  // and not marked sponsored. Every link below reads this one value.
  const booking = resolveBooking(hotel);


  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        {/* SEO-028: the canonical cannot wait for the fetch. See RouteCanonical. */}
        <RouteCanonical path={`/stay/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-48 mb-4" />
          <Skeleton className="h-64 w-full rounded-lg mb-6" />
          <Skeleton className="h-6 w-3/4 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  /**
   * WEB-SEO-040. THIS BRANCH USED TO READ `if (error || !hotel)`, so a failed
   * fetch and a missing row produced the same page - "Hotel Not Found" plus a
   * noindex. A transient PostgREST error on a real hotel page therefore asked
   * Google to drop it. The two answers are separated now; the retry state
   * carries no robots meta at all, because the page is fine and saying nothing
   * leaves whatever is indexed alone.
   */
  if (error) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <RouteCanonical path={`/stay/${slug}`} />
        <Header />
        <div className="container mx-auto px-4 py-16">
          <ErrorState error={error} onRetry={() => void refetch()} />
        </div>
        <Footer />
      </div>
    );
  }

  if (!hotel) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <Helmet>
          <meta name="robots" content="noindex, follow" />
          <meta name="googlebot" content="noindex, follow" />
        </Helmet>
        <Header />
        <div className="flex items-center justify-center flex-1 py-24">
          <div className="text-center">
            <SpriteIcon name="building-2" className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Hotel Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The hotel you're looking for doesn't exist or has been removed.
            </p>
            <Button asChild className="min-h-11">
              <Link to="/stay">Browse All Hotels</Link>
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Row text is not trusted as an href (WP2 item 3). The hotel's own site is
  // what OpenStatusChip links to, never the affiliate URL.
  const websiteUrl = safeWebUrl(hotel.website);
  const phoneHref = telHref(hotel.phone);
  const rateLabel = hotelRateLabel(hotel.avg_nightly_rate);
  const fullAddress = [hotel.address, hotel.city, hotel.state, hotel.zip]
    .filter(Boolean)
    .join(", ");
  // Pass-2 WP2 item 13: only a curated class prints as stars, never a Google
  // review average and never a literal 0.
  const classStars = hotelClassStars(hotel);
  const totalRooms = hotel.total_rooms != null && hotel.total_rooms > 0 ? hotel.total_rooms : null;

  // Pass-2 WP2 item 12: the row's own SEO and GEO fields, when an editor set them.
  const seoTitle = hotel.seo_title?.trim() || `${hotel.name} - Hotels in ${hotel.city}, ${hotel.state}`;
  const seoDescription =
    hotel.seo_description?.trim() ||
    hotel.short_description ||
    `${hotel.name} in ${hotel.area || hotel.city}.${hotel.price_range ? ` Price range: ${hotel.price_range}.` : ""} Book your stay in Des Moines.`;
  const keyFacts = (hotel.geo_key_facts ?? []).map((f) => f.trim()).filter(Boolean);
  const geoSummary = hotel.geo_summary?.trim() || null;
  const faqs = readGeoFaq(hotel.geo_faq);
  const imageUrl = hotel.image_url
    ? hotel.image_url.startsWith("/")
      ? getCanonicalUrl(hotel.image_url)
      : hotel.image_url
    : undefined;

  return (
    <>
      <Helmet>
        <title>{`${seoTitle} | Des Moines Insider`}</title>
        <meta name="description" content={seoDescription} />
        <link rel="canonical" href={getCanonicalUrl(`/stay/${hotel.slug}`)} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDescription} />
        {/* WEB-SEO-034: was a RELATIVE path when a hotel has no image. Every
            social crawler resolves og:image against nothing and shows no
            preview image; the spec requires an absolute URL. */}
        <meta property="og:image" content={getCanonicalUrl(hotel.image_url || BRAND.ogImage)} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={`${hotel.name} - Hotel in ${hotel.city}, ${hotel.state}`} />
        <meta property="og:url" content={getCanonicalUrl(`/stay/${hotel.slug}`)} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:image" content={getCanonicalUrl(hotel.image_url || BRAND.ogImage)} />
      </Helmet>

      <HotelSchema
        name={hotel.name}
        description={hotel.description || undefined}
        address={{
          street: hotel.address,
          city: hotel.city,
          state: hotel.state,
          zip: hotel.zip || undefined,
        }}
        phone={hotel.phone || undefined}
        website={hotel.website || undefined}
        image={imageUrl}
        priceRange={hotel.price_range || undefined}
        starRating={hotel.star_rating}
        googlePlaceId={hotel.google_place_id}
        checkInTime={hotel.check_in_time}
        checkOutTime={hotel.check_out_time}
        pageUrl={getCanonicalUrl(`/stay/${hotel.slug}`)}
        latitude={hotel.latitude}
        longitude={hotel.longitude}
        amenities={hotel.amenities}
      />
      {/* WEB-SEO-034. These pointed at /hotels and /hotels/<slug>. The routes are
          /stay and /stay/:slug and there is no redirect, so every breadcrumb on
          every hotel page named a URL that does not exist. A BreadcrumbList
          whose items 404 is not a partial win -- Google drops the whole trail,
          so the page loses the breadcrumb display it was emitting for. */}
      <BreadcrumbListSchema
        items={[
          { name: "Home", url: getCanonicalUrl("/") },
          { name: "Hotels", url: getCanonicalUrl("/stay") },
          { name: hotel.name, url: getCanonicalUrl(`/stay/${hotel.slug}`) },
        ]}
      />

      <div className="min-h-screen bg-background pb-24">
        <Header />

        {/* Breadcrumbs */}
        <div className="container mx-auto px-4 py-4">
          <nav aria-label="Breadcrumb">
            <ol className="flex items-center gap-2 text-sm text-muted-foreground">
              <li><Link to="/" className="hover:text-foreground">Home</Link></li>
              <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
              <li><Link to="/stay" className="hover:text-foreground">Hotels</Link></li>
              <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
              <li className="min-w-0">
                <span aria-current="page" className="block text-foreground font-medium truncate">{hotel.name}</span>
              </li>
            </ol>
          </nav>
        </div>

        {/* Back button */}
        <div className="container mx-auto px-4 mb-4">
          <Button asChild variant="ghost" size="sm" className="min-h-11">
            <Link to="/stay">
              <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
              Back to Hotels
            </Link>
          </Button>
        </div>

        {/* Affiliate disclosure - FTC compliance */}
        <div className="container mx-auto px-4 mb-4">
          <AffiliateDisclosureBanner />
        </div>

        {/* Hero image */}
        <div className="container mx-auto px-4 mb-8">
          <div className="relative h-64 md:h-96 rounded-xl overflow-hidden">
            {hotel.image_url ? (
              <OptimizedImage
                src={hotel.image_url}
                alt={hotel.name}
                priority
                sizes="(max-width: 768px) 100vw, 1024px"
                containerClassName="absolute inset-0"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center">
                <SpriteIcon name="building-2" className="h-20 w-20 text-muted-foreground" />
              </div>
            )}
            {hotel.is_featured && (
              <Badge className={`absolute top-4 left-4 ${STATUS_BADGE.featured} border-0`}>
                Featured Hotel
              </Badge>
            )}
          </div>
        </div>

        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main content */}
            <div className="lg:col-span-2 space-y-8">
              {/* Hotel header */}
              <div>
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h1 className="text-2xl md:text-3xl font-bold">{hotel.name}</h1>
                  {hotel.price_range && (
                    <Badge variant="outline" className="text-lg px-3 py-1 flex-shrink-0">
                      {hotel.price_range}
                    </Badge>
                  )}
                </div>

                {(hotel.chain_name || hotel.brand_parent) && (
                  <p className="text-muted-foreground mb-2">
                    {hotel.chain_name || hotel.brand_parent}
                    {hotel.chain_name && hotel.brand_parent && hotel.chain_name !== hotel.brand_parent && (
                      <span className="text-muted-foreground/60"> by {hotel.brand_parent}</span>
                    )}
                  </p>
                )}

                {classStars !== null && (
                  <div className="flex items-center gap-2 mb-3">
                    <StarRating rating={classStars} />
                    <span className="text-sm text-muted-foreground">{classStars}-star hotel</span>
                  </div>
                )}

                {hotel.hotel_type && (
                  <Badge variant="secondary" className="mb-4">{hotel.hotel_type}</Badge>
                )}

                {/*
                  WEB-UX-010 AC1 names HotelDetails explicitly ("and HotelDetails
                  if present") and it is present - routed at /stay/:slug - but it
                  shipped with no save control of any kind, not even the dead
                  static button the other three detail pages had. "hotel" was
                  already a first-class content type in useContentFavorites and
                  lib/guestFavorites, so the type existed with no way to reach it.
                */}
                <FavoriteButton
                  contentType="hotel"
                  contentId={hotel.id}
                  variant="outline"
                  size="sm"
                  showText
                  itemName={hotel.name}
                  className="rounded-xl"
                />
              </div>

              {/* Description */}
              {(hotel.description || geoSummary || keyFacts.length > 0) && (
                <section>
                  <h2 className="text-xl font-semibold mb-3">About This Hotel</h2>
                  {hotel.description && (
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-line max-w-prose">
                      {hotel.description}
                    </p>
                  )}
                  {geoSummary && geoSummary !== hotel.description?.trim() && (
                    <p className="mt-3 text-muted-foreground leading-relaxed max-w-prose">{geoSummary}</p>
                  )}
                  {keyFacts.length > 0 && (
                    <ul className="mt-4 list-disc pl-5 space-y-1 text-muted-foreground max-w-prose">
                      {keyFacts.map((fact) => (
                        <li key={fact}>{fact}</li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {/* Pass-2 WP2 item 7: this week's events within a mile. Renders
                  nothing without coordinates (D9) or during prerender. */}
              <HotelNearbyEvents
                hotelName={hotel.name}
                latitude={hotel.latitude}
                longitude={hotel.longitude}
              />

              {/* Amenities */}
              {hotel.amenities && hotel.amenities.length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold mb-3">Amenities</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {hotel.amenities.map((amenity) => (
                      <div key={amenity} className="flex items-center gap-2 text-sm">
                        <div className="h-2 w-2 rounded-full bg-primary" />
                        {amenity}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* FAQSection renders the questions and emits the FAQPage block
                  (through toJsonLd) in one place, so the schema can't outlive
                  the visible copy (SEO-003, faq-single-emitter.test.mjs). */}
              {faqs.length > 0 && (
                <FAQSection faqs={faqs} title={`Questions about ${hotel.name}`} />
              )}

              {/* Gallery */}
              {hotel.gallery_urls && hotel.gallery_urls.length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold mb-3">Photos</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {hotel.gallery_urls.map((url, index) => (
                      <div key={index} className="aspect-video rounded-lg overflow-hidden">
                        <OptimizedImage
                          src={url}
                          alt={`${hotel.name} photo ${index + 1}`}
                          className="object-cover"
                          containerClassName="w-full h-full"
                          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        />
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Book Now card */}
              <Card className="border-primary/20">
                <CardContent className="p-6">
                  {/* WP2 item 5: a seeded figure nothing refreshes, worded as
                      typical. Display only; the booking site sets the price. */}
                  <p className="mb-4 text-sm text-muted-foreground">
                    {rateLabel ?? "Check the hotel for current rates"}
                  </p>
                  {booking && (
                    <Button asChild className="w-full h-12 text-base" size="lg">
                      <a
                        href={booking.href}
                        target="_blank"
                        rel={booking.rel}
                      >
                        {booking.label}
                        <SpriteIcon name="external-link" className="h-4 w-4 ml-2" />
                        <span className="sr-only"> (opens in a new tab)</span>
                      </a>
                    </Button>
                  )}
                  {booking?.isAffiliate && (
                    <p className="text-xs text-muted-foreground mt-2">{AFFILIATE_DISCLOSURE}</p>
                  )}
                </CardContent>
              </Card>

              {/* Contact info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Hotel Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Address */}
                  <div className="flex items-start gap-3">
                    <SpriteIcon name="map-pin" className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm">{hotel.address}</p>
                      <p className="text-sm text-muted-foreground">
                        {hotel.city}, {hotel.state} {hotel.zip}
                      </p>
                      {hotel.area && (
                        <Badge variant="outline" className="mt-1 text-xs">{hotel.area}</Badge>
                      )}
                      <a
                        href={getDirectionsUrl({
                          latitude: hotel.latitude,
                          longitude: hotel.longitude,
                          address: fullAddress,
                        })}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm text-primary hover:underline mt-1"
                      >
                        <Navigation className="h-3.5 w-3.5 mr-1" />
                        Directions
                      </a>
                      <div className="mt-2">
                        <OpenStatusChip
                          hours={null}
                          website={websiteUrl}
                          fallbackLabel="Check hotel site for hours & check-in"
                        />
                      </div>
                    </div>
                  </div>

                  {hotel.latitude && hotel.longitude && (
                    <div className="overflow-hidden rounded-lg">
                      <LazyLocationMap
                        latitude={hotel.latitude}
                        longitude={hotel.longitude}
                        venue={hotel.name}
                        location={fullAddress}
                        className="h-48 w-full"
                      />
                    </div>
                  )}

                  {/* SEO-013: the reciprocal half - which event venues are
                      close, linking to what is on at each. */}
                  <NearbyVenues latitude={hotel.latitude} longitude={hotel.longitude} placeName={hotel.name} />

                  {/* Phone */}
                  {hotel.phone && phoneHref && (
                    <a
                      href={phoneHref}
                      className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                    >
                      <Phone className="h-5 w-5 text-primary flex-shrink-0" />
                      {hotel.phone}
                    </a>
                  )}

                  {/* Email */}
                  {hotel.email && (
                    <a
                      href={`mailto:${hotel.email}`}
                      className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                    >
                      <Mail className="h-5 w-5 text-primary flex-shrink-0" />
                      {hotel.email}
                    </a>
                  )}

                  {/* Website */}
                  {websiteUrl && (
                    <a
                      href={websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 text-sm hover:text-primary transition-colors"
                    >
                      <Globe className="h-5 w-5 text-primary flex-shrink-0" />
                      Visit Website
                    </a>
                  )}

                  {/* Check in/out */}
                  {(hotel.check_in_time || hotel.check_out_time) && (
                    <div className="flex items-start gap-3">
                      <SpriteIcon name="clock" className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        {hotel.check_in_time && <p>Check-in: {hotel.check_in_time}</p>}
                        {hotel.check_out_time && <p>Check-out: {hotel.check_out_time}</p>}
                      </div>
                    </div>
                  )}

                  {/* Rooms */}
                  {totalRooms !== null && (
                    <div className="flex items-center gap-3 text-sm">
                      <SpriteIcon name="building-2" className="h-5 w-5 text-primary flex-shrink-0" />
                      {totalRooms} rooms
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Footer />
      </div>

      <StickyMobileCTA
        variant="hotel"
        primaryAction={
          booking
            ? {
                label: booking.label,
                href: booking.href,
                icon: "external",
                isExternal: true,
                rel: booking.rel,
              }
            : phoneHref
            ? {
                label: "Call to Book",
                href: phoneHref,
                icon: "phone",
              }
            : {
                // No booking link or phone — still give a working action.
                label: "Find Rooms",
                href: `https://www.google.com/search?q=${encodeURIComponent(
                  `${hotel.name} ${hotel.city ?? "Des Moines"} hotel booking`
                )}`,
                icon: "external",
                isExternal: true,
              }
        }
        secondaryAction={
          hotel.latitude && hotel.longitude
            ? {
                label: "Directions",
                href: getDirectionsUrl({
                  latitude: hotel.latitude,
                  longitude: hotel.longitude,
                  address: fullAddress,
                }),
                icon: "directions",
                isExternal: true,
              }
            : phoneHref
            ? { label: "Call", href: phoneHref, icon: "phone" }
            : undefined
        }
      />
    </>
  );
}
