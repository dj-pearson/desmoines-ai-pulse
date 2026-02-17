import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useHotel } from "@/hooks/useHotels";
import HotelSchema from "@/components/schema/HotelSchema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Building2,
  MapPin,
  Phone,
  Globe,
  Mail,
  Star,
  Clock,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import AffiliateDisclosureBanner from "@/components/AffiliateDisclosureBanner";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
  const { hotel, isLoading, error } = useHotel(slug);

  useDocumentTitle(hotel ? `${hotel.name} - Stay in Des Moines` : "Hotel Details");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
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

  if (error || !hotel) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <Header />
        <div className="flex items-center justify-center flex-1 py-24">
          <div className="text-center">
            <Building2 className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-2xl font-bold mb-2">Hotel Not Found</h1>
            <p className="text-muted-foreground mb-6">
              The hotel you're looking for doesn't exist or has been removed.
            </p>
            <Link to="/stay">
              <Button>Browse All Hotels</Button>
            </Link>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const bookUrl = hotel.affiliate_url || hotel.website;
  const fullAddress = [hotel.address, hotel.city, hotel.state, hotel.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <Helmet>
        <title>{hotel.name} - Hotels in {hotel.city}, {hotel.state} | Des Moines Insider</title>
        <meta
          name="description"
          content={hotel.short_description || `${hotel.name} in ${hotel.area || hotel.city}. ${hotel.price_range ? `Price range: ${hotel.price_range}.` : ""} Book your stay in Des Moines.`}
        />
        <link rel="canonical" href={`/stay/${hotel.slug}`} />
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
        image={hotel.image_url || undefined}
        priceRange={hotel.price_range || undefined}
        starRating={hotel.star_rating || undefined}
        checkInTime={hotel.check_in_time || undefined}
        checkOutTime={hotel.check_out_time || undefined}
      />

      <div className="min-h-screen bg-background pb-24">
        <Header />

        {/* Breadcrumbs */}
        <div className="container mx-auto px-4 py-4">
          <nav className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-foreground">Home</Link>
            <ChevronRight className="h-3 w-3" />
            <Link to="/stay" className="hover:text-foreground">Hotels</Link>
            <ChevronRight className="h-3 w-3" />
            <span className="text-foreground font-medium truncate">{hotel.name}</span>
          </nav>
        </div>

        {/* Back button */}
        <div className="container mx-auto px-4 mb-4">
          <Link to="/stay">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Hotels
            </Button>
          </Link>
        </div>

        {/* Affiliate disclosure - FTC compliance */}
        <div className="container mx-auto px-4 mb-4">
          <AffiliateDisclosureBanner />
        </div>

        {/* Hero image */}
        <div className="container mx-auto px-4 mb-8">
          <div className="relative h-64 md:h-96 rounded-xl overflow-hidden">
            {hotel.image_url ? (
              <img
                src={hotel.image_url}
                alt={hotel.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#1a0f3c] via-[#2D1B69] to-[#DC143C] flex items-center justify-center">
                <Building2 className="h-20 w-20 text-white/50" />
              </div>
            )}
            {hotel.is_featured && (
              <Badge className="absolute top-4 left-4 bg-amber-500 text-white border-0">
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

                {hotel.star_rating && (
                  <div className="flex items-center gap-2 mb-3">
                    <StarRating rating={hotel.star_rating} />
                    <span className="text-sm text-muted-foreground">{hotel.star_rating} stars</span>
                  </div>
                )}

                {hotel.hotel_type && (
                  <Badge variant="secondary" className="mb-4">{hotel.hotel_type}</Badge>
                )}
              </div>

              {/* Description */}
              {hotel.description && (
                <section>
                  <h2 className="text-xl font-semibold mb-3">About This Hotel</h2>
                  <p className="text-muted-foreground leading-relaxed whitespace-pre-line">
                    {hotel.description}
                  </p>
                </section>
              )}

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

              {/* Gallery */}
              {hotel.gallery_urls && hotel.gallery_urls.length > 0 && (
                <section>
                  <h2 className="text-xl font-semibold mb-3">Photos</h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {hotel.gallery_urls.map((url, index) => (
                      <div key={index} className="aspect-video rounded-lg overflow-hidden">
                        <img
                          src={url}
                          alt={`${hotel.name} photo ${index + 1}`}
                          className="w-full h-full object-cover"
                          loading="lazy"
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
                  {hotel.avg_nightly_rate && (
                    <div className="mb-4">
                      <span className="text-3xl font-bold">${hotel.avg_nightly_rate}</span>
                      <span className="text-muted-foreground">/night</span>
                      <p className="text-xs text-muted-foreground mt-1">Average nightly rate</p>
                    </div>
                  )}
                  {bookUrl && (
                    <a
                      href={bookUrl}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                      className="block"
                    >
                      <Button className="w-full h-12 text-base" size="lg">
                        Book Now
                        <ExternalLink className="h-4 w-4 ml-2" />
                      </Button>
                    </a>
                  )}
                  {hotel.affiliate_provider && (
                    <p className="text-xs text-muted-foreground text-center mt-2">
                      via {hotel.affiliate_provider}
                    </p>
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
                    <MapPin className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm">{hotel.address}</p>
                      <p className="text-sm text-muted-foreground">
                        {hotel.city}, {hotel.state} {hotel.zip}
                      </p>
                      {hotel.area && (
                        <Badge variant="outline" className="mt-1 text-xs">{hotel.area}</Badge>
                      )}
                    </div>
                  </div>

                  {/* Phone */}
                  {hotel.phone && (
                    <a
                      href={`tel:${hotel.phone}`}
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
                  {hotel.website && (
                    <a
                      href={hotel.website}
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
                      <Clock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <div className="text-sm">
                        {hotel.check_in_time && <p>Check-in: {hotel.check_in_time}</p>}
                        {hotel.check_out_time && <p>Check-out: {hotel.check_out_time}</p>}
                      </div>
                    </div>
                  )}

                  {/* Rooms */}
                  {hotel.total_rooms && (
                    <div className="flex items-center gap-3 text-sm">
                      <Building2 className="h-5 w-5 text-primary flex-shrink-0" />
                      {hotel.total_rooms} rooms
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </>
  );
}
