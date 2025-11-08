import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import SeasonalContent from "@/components/SeasonalContent";
import { FAQSection } from "@/components/FAQSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MapPin, Calendar, Star, Utensils, Car, Bed } from "lucide-react";

export default function IowaStateFairPage() {
  
  const stateFairSchema = {
    "@context": "https://schema.org",
    "@type": "Event",
    "name": "Iowa State Fair 2024",
    "description": "Iowa's premier annual event featuring agriculture, entertainment, food, and attractions at the Iowa State Fairgrounds in Des Moines",
    "startDate": "2024-08-08",
    "endDate": "2024-08-18", 
    "location": {
      "@type": "Place",
      "name": "Iowa State Fairgrounds",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "3000 E Grand Ave",
        "addressLocality": "Des Moines",
        "addressRegion": "Iowa",
        "addressCountry": "US",
        "postalCode": "50317"
      },
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": "41.5868",
        "longitude": "-93.6250"
      }
    },
    "organizer": {
      "@type": "Organization", 
      "name": "Iowa State Fair",
      "url": "https://www.iowastatefair.org"
    },
    "offers": {
      "@type": "Offer",
      "url": "https://www.iowastatefair.org/admission/",
      "priceCurrency": "USD",
      "price": "15.00",
      "availability": "https://schema.org/InStock"
    }
  };

  const businessDirectorySchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Iowa State Fair Business Directory",
    "description": "Complete guide to restaurants, hotels, services, and attractions near Iowa State Fair",
    "numberOfItems": 4,
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "item": {
          "@type": "Service",
          "name": "Restaurants Near Iowa State Fair",
          "description": "Dining options beyond fair food stands"
        }
      },
      {
        "@type": "ListItem", 
        "position": 2,
        "item": {
          "@type": "Service",
          "name": "Iowa State Fair Parking Services", 
          "description": "Convenient parking solutions for fair visitors"
        }
      },
      {
        "@type": "ListItem",
        "position": 3,
        "item": {
          "@type": "Service",
          "name": "Hotels Near Iowa State Fair",
          "description": "Accommodations during fair dates"
        }
      },
      {
        "@type": "ListItem",
        "position": 4, 
        "item": {
          "@type": "Service",
          "name": "Iowa State Fair Transportation",
          "description": "Getting to and from the fairgrounds"
        }
      }
    ]
  };

  return (
    <div className="min-h-screen bg-background">
      <SEOHead 
        title="Iowa State Fair 2024: Complete Des Moines Business & Dining Guide"
        description="Complete guide to Iowa State Fair 2024 including restaurants near fairgrounds, parking, hotels, and local services. Discover dining options beyond fair food stands in Des Moines."
        keywords={[
          "Iowa State Fair",
          "Iowa State Fair restaurants", 
          "restaurants near Iowa State Fair",
          "Iowa State Fair dining guide",
          "Iowa State Fair parking",
          "Iowa State Fair hotels",
          "Des Moines Iowa State Fair",
          "Iowa State Fair 2024",
          "Iowa State Fair services"
        ]}
        structuredData={[stateFairSchema, businessDirectorySchema]}
        type="event"
      />
      
      <Header />

      {/* Hero Section */}
      <section className="relative bg-gradient-to-br from-yellow-600 via-orange-600 to-red-600 overflow-hidden min-h-[400px]">
        <div className="absolute inset-0 bg-black/20"></div>
        <div className="relative container mx-auto px-4 py-16 md:py-24 text-center">
          <div className="flex justify-center mb-4">
            <Badge className="bg-white/20 text-white text-lg px-4 py-2">
              10,000+ Monthly Searches
            </Badge>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 tracking-tight">
            Iowa State Fair 2024
          </h1>
          <p className="text-xl md:text-2xl text-white/90 mb-8 max-w-3xl mx-auto">
            Complete business guide to Iowa's premier event - restaurants, parking, hotels, and local services
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto text-white">
            <div className="flex items-center gap-2 justify-center">
              <Calendar className="h-5 w-5" />
              <span>August 8-18, 2024</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <MapPin className="h-5 w-5" />
              <span>Des Moines, Iowa</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <Star className="h-5 w-5" />
              <span>11 Days</span>
            </div>
          </div>
        </div>
      </section>

      <main className="container mx-auto px-4 py-8">
        
        {/* TL;DR Section for AI Search Optimization */}
        <Card className="mb-8 bg-blue-50">
          <CardContent className="p-6">
            <h2 className="text-2xl font-bold mb-4">TL;DR: Iowa State Fair 2024 Business Guide</h2>
            <p className="text-lg leading-relaxed">
              The Iowa State Fair runs August 8-18, 2024, at the Iowa State Fairgrounds in Des Moines, 
              attracting 1+ million visitors. Beyond 250+ fair food vendors, Des Moines area restaurants, 
              hotels, and parking services experience peak demand. This guide helps visitors find 
              dining options beyond food stands, convenient parking, nearby accommodations, and local services 
              during Iowa's largest annual event.
            </p>
          </CardContent>
        </Card>

        {/* Business Categories */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          
          {/* Restaurants */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Utensils className="h-5 w-5 text-orange-600" />
                Restaurants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h4 className="font-semibold mb-2">Restaurants Near Iowa State Fair</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Discover Des Moines dining options beyond fair food stands. Local restaurants 
                offer air conditioning, full service, and diverse cuisines during fair season.
              </p>
              <div className="space-y-2">
                <div className="text-sm">• Full-service restaurants with AC</div>
                <div className="text-sm">• Family-friendly dining options</div>
                <div className="text-sm">• Late-night dining availability</div>
                <div className="text-sm">• Delivery to nearby hotels</div>
              </div>
            </CardContent>
          </Card>

          {/* Parking */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Car className="h-5 w-5 text-blue-600" />
                Parking
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h4 className="font-semibold mb-2">Iowa State Fair Parking</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Official fairgrounds parking fills quickly. Private parking lots and 
                shuttle services offer convenient alternatives throughout Des Moines.
              </p>
              <div className="space-y-2">
                <div className="text-sm">• Official fairgrounds lots</div>
                <div className="text-sm">• Private parking alternatives</div>
                <div className="text-sm">• Shuttle service locations</div>
                <div className="text-sm">• Advance reservation options</div>
              </div>
            </CardContent>
          </Card>

          {/* Hotels */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Bed className="h-5 w-5 text-green-600" />
                Hotels
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h4 className="font-semibold mb-2">Hotels Near Iowa State Fair</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Des Moines area hotels book quickly during fair dates. Reserve early 
                for best rates and availability at properties near the fairgrounds.
              </p>
              <div className="space-y-2">
                <div className="text-sm">• Properties within 5 miles</div>
                <div className="text-sm">• Shuttle service availability</div>
                <div className="text-sm">• Family-friendly amenities</div>
                <div className="text-sm">• Book early for best rates</div>
              </div>
            </CardContent>
          </Card>

          {/* Services */}
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <Star className="h-5 w-5 text-purple-600" />
                Services
              </CardTitle>
            </CardHeader>
            <CardContent>
              <h4 className="font-semibold mb-2">Local Services</h4>
              <p className="text-sm text-muted-foreground mb-4">
                Essential services for State Fair visitors including transportation, 
                childcare, medical services, and tourist information in Des Moines.
              </p>
              <div className="space-y-2">
                <div className="text-sm">• Transportation options</div>
                <div className="text-sm">• Medical and urgent care</div>
                <div className="text-sm">• Tourist information centers</div>
                <div className="text-sm">• Pet boarding services</div>
              </div>
            </CardContent>
          </Card>
          
        </div>

        {/* Seasonal Content Component */}
        <SeasonalContent />

        {/* Comprehensive FAQ Section */}
        <Card className="mt-12">
          <CardHeader>
            <CardTitle>Iowa State Fair: Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">What are the best restaurants near Iowa State Fair?</h4>
              <p className="text-sm text-gray-700">
                Des Moines offers numerous restaurant options within 5 miles of the fairgrounds, 
                providing air-conditioned dining with full service menus. Popular choices include 
                family restaurants along Grand Avenue, ethnic cuisine in the Drake neighborhood, 
                and chain restaurants with reliable service during busy fair season.
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">Where can I find parking for Iowa State Fair?</h4>
              <p className="text-sm text-gray-700">
                Official fairgrounds parking ($10-15 per day) fills early each day. Alternative 
                options include private lots along Grand Avenue, residential parking permits in 
                nearby neighborhoods, and park-and-ride shuttle services from downtown Des Moines. 
                Arrive early or consider rideshare services during peak hours.
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">When is RAGBRAI coming through Des Moines?</h4>
              <p className="text-sm text-gray-700">
                RAGBRAI typically ends in Des Moines during the last week of July, one week before 
                the Iowa State Fair begins. The 30,000+ cyclists create additional demand for local 
                restaurants, bike shops, and services. Many businesses offer special promotions 
                during both RAGBRAI and State Fair seasons.
              </p>
            </div>

            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="font-semibold mb-2">What hotels are closest to Iowa State Fair?</h4>
              <p className="text-sm text-gray-700">
                Several hotels within 3 miles offer shuttle services to the fairgrounds, including 
                properties along I-235 and I-35. Downtown Des Moines hotels (5-7 miles) provide 
                more dining and entertainment options. Book 3-6 months in advance as rooms fill 
                quickly and prices increase significantly during fair dates.
              </p>
            </div>

          </CardContent>
        </Card>

        {/* Local Authority Content */}
        <Card className="mt-8 bg-green-50">
          <CardContent className="p-8">
            <h3 className="text-2xl font-semibold mb-4">Iowa State Fair: Economic Impact on Des Moines</h3>
            <div className="prose prose-lg max-w-none">
              <p className="mb-4">
                The Iowa State Fair generates over $230 million in economic impact for the Des Moines metro area 
                annually, making it Iowa's largest tourism event. With 1+ million visitors over 11 days, 
                local businesses from restaurants to hotels experience their busiest period of the year.
              </p>
              
              <h4 className="text-xl font-semibold mb-3">Business Opportunities During State Fair</h4>
              <p className="mb-4">
                Des Moines area restaurants report 200-400% increased business during fair dates, 
                particularly establishments offering air conditioning and full-service dining as 
                alternatives to fair food vendors. Hotels achieve near 100% occupancy rates, 
                with many requiring minimum 3-night stays during peak fair weekend dates.
              </p>
              
              <p className="mb-6">
                <strong>Local expertise you can trust:</strong> Des Moines Insider has covered Iowa State Fair 
                business impacts for 5+ years, tracking restaurant availability, parking costs, hotel rates, 
                and service demand to help visitors plan successful fair experiences while supporting local businesses.
              </p>
              
              <div className="bg-white p-6 rounded-lg">
                <h5 className="font-semibold mb-3">Iowa State Fair by the Numbers:</h5>
                <ul className="list-disc list-inside space-y-2">
                  <li><strong>1+ million visitors</strong> over 11-day period</li>
                  <li><strong>$230 million</strong> economic impact on Des Moines metro</li>
                  <li><strong>250+ food vendors</strong> on fairgrounds</li>
                  <li><strong>200-400% business increase</strong> for nearby restaurants</li>
                  <li><strong>100% hotel occupancy</strong> during peak weekend dates</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

      </main>

      {/* FAQ Section for SEO and Featured Snippets */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <FAQSection
            title="Iowa State Fair - Frequently Asked Questions"
            description="Common questions about attending the Iowa State Fair in Des Moines, Iowa."
            faqs={[
              {
                question: "When is the Iowa State Fair?",
                answer: "The Iowa State Fair runs for 11 days in August, typically starting the second Thursday and ending the Sunday before Labor Day. The 2024 dates are August 8-18. The fair attracts over 1 million visitors annually, making it one of the largest and oldest state fairs in America, celebrating Iowa's agricultural heritage since 1854. Hours are typically 8 AM to midnight daily, with varying attraction schedules. Purchase tickets online in advance for discounts and to skip lines during peak attendance times, especially weekends."
              },
              {
                question: "How much does Iowa State Fair admission cost?",
                answer: "Iowa State Fair general admission typically costs $15 for adults (ages 12+) with advance purchase online offering savings. Children 11 and under receive free admission. Multi-day passes and season passes provide better value for frequent visitors. Parking costs extra ($15-25 depending on location). Special deals include Kids' Day (August weekday with reduced admission), Senior Day (discounted for 65+), and group rates for 20+ people. Prices may change yearly, so check the official Iowa State Fair website for current rates and online discount codes."
              },
              {
                question: "Where is the Iowa State Fairgrounds located?",
                answer: "The Iowa State Fairgrounds is located at 3000 E Grand Ave, Des Moines, Iowa 50317, just east of downtown Des Moines near the I-35/I-80/I-235 interchange. The 400-acre facility is easily accessible from all directions. From downtown Des Moines, it's a 10-minute drive or 20-minute bus ride via DART public transit. The fairgrounds are coordinates 41.5868°N, 93.6250°W. Multiple parking options exist on-site and nearby with shuttle services during the fair. Consider hotels in East Des Moines, Altoona, or downtown for closest proximity."
              },
              {
                question: "What are the must-see attractions at the Iowa State Fair?",
                answer: "Must-see Iowa State Fair attractions include the famous Butter Cow sculpture (iconic Iowa tradition), Varied Industries Building (shopping and exhibits), Agriculture Building (livestock shows and rural culture), Grandstand concerts (major touring artists), midway rides and games (thrill rides and family fun), food stands offering 250+ options (try corn dogs, pork chops, and unique fried foods), livestock competitions (showcasing Iowa agriculture), Big Blue Bug (giant slide landmark), and free entertainment on multiple stages. Arrive early to see morning livestock shows and beat afternoon crowds."
              },
              {
                question: "Where can I find restaurants near the Iowa State Fair?",
                answer: "Restaurants near Iowa State Fairgrounds include numerous options along University Avenue, Hubbell Avenue, and E Grand Avenue within 1-2 miles. Popular choices feature Jethro's BBQ (casual BBQ with large portions), Zombie Burger (creative burgers), Fong's Pizza (unique pizza combinations), Machine Shed (country cooking), and various chains like Chili's, Applebee's, and Olive Garden. Downtown Des Moines (10 minutes away) offers upscale dining. Many restaurants see 200-400% business increases during the fair with extended hours. Make reservations or expect waits during peak evening times. Des Moines Insider provides real-time restaurant availability and recommendations."
              },
              {
                question: "What hotels are closest to the Iowa State Fair?",
                answer: "Hotels near Iowa State Fairgrounds include Best Western Plus Des Moines West (2 miles), Quality Inn & Suites Event Center (adjacent to fairgrounds), Holiday Inn Des Moines Downtown (6 miles), and numerous options in Altoona (5 miles). During the fair, hotels within 10 miles reach 100% occupancy, especially weekends. Book 6-12 months in advance for best rates and availability. Prices increase significantly during fair dates. Consider hotels in Ankeny, West Des Moines, or downtown Des Moines for more options. Many hotels offer shuttle services to fairgrounds during the fair. Check for package deals including admission tickets."
              },
              {
                question: "How do I get to the Iowa State Fair?",
                answer: "Transportation to Iowa State Fair includes personal vehicles (multiple parking lots available $15-25), DART public buses (special fair routes and increased service from downtown and Park & Ride locations), rideshare services (Uber/Lyft with designated drop-off areas), taxis, hotel shuttles (many area hotels provide free shuttles during the fair), and walking/biking (bike parking available). Traffic is heaviest 10 AM-2 PM and 5 PM-8 PM, especially weekends. Arrive before 9 AM or after 2 PM for easier parking. Consider Park & Ride lots with shuttle service to avoid fairgrounds parking congestion and save money."
              },
              {
                question: "What is the economic impact of Iowa State Fair on Des Moines?",
                answer: "The Iowa State Fair generates approximately $230 million annual economic impact on the Des Moines metro area. Benefits include 1+ million visitors over 11 days spending on admission, food, lodging, restaurants, shopping, and transportation; 100% hotel occupancy during peak dates; 200-400% business increases for nearby restaurants; thousands of temporary jobs created; increased sales tax revenue for local governments; national media exposure for Des Moines; and year-round fairgrounds use for events and shows. The fair is Des Moines' largest annual event and a major economic driver for Iowa's capital city, supporting tourism and hospitality industries."
              }
            ]}
            showSchema={true}
            className="border-0 shadow-lg"
          />
        </div>
      </section>

      <Footer />
    </div>
  );
}