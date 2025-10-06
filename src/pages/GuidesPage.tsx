import { Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";
import { FAQSection } from "@/components/FAQSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Calendar, 
  Clock, 
  Users, 
  Heart,
  Coffee,
  Utensils,
  Camera,
  Star,
  Umbrella,
  Sun,
  Snowflake
} from "lucide-react";
import OptimizedImage from "@/components/OptimizedImage";

const guides = [
  {
    id: "rainy-day-des-moines",
    title: "Rainy Day Things To Do in Des Moines",
    description: "Indoor activities, covered attractions, and cozy spots perfect for wet weather days",
    category: "Weather",
    icon: Umbrella,
    tags: ["Indoor", "Family-Friendly", "All Ages"],
    image: "/api/placeholder/400/250",
    slug: "/guides/rainy-day-des-moines"
  },
  {
    id: "date-night-des-moines",
    title: "Best Date Night Spots in Des Moines",
    description: "Romantic restaurants, intimate venues, and memorable experiences for couples",
    category: "Romance",
    icon: Heart,
    tags: ["Adults", "Evening", "Romantic"],
    image: "/api/placeholder/400/250",
    slug: "/guides/date-night-des-moines"
  },
  {
    id: "summer-activities-des-moines",
    title: "Summer Activities in Des Moines",
    description: "Outdoor festivals, parks, pools, and warm weather fun across the metro",
    category: "Seasonal",
    icon: Sun,
    tags: ["Outdoor", "Family", "Summer"],
    image: "/api/placeholder/400/250",
    slug: "/guides/summer-activities-des-moines"
  },
  {
    id: "free-things-des-moines",
    title: "Free Things To Do in Des Moines",
    description: "Budget-friendly activities, free events, and no-cost attractions for everyone",
    category: "Budget",
    icon: Star,
    tags: ["Free", "Budget", "All Ages"],
    image: "/api/placeholder/400/250",
    slug: "/guides/free-things-des-moines"
  },
  {
    id: "family-fun-des-moines",
    title: "Family Fun in Des Moines",
    description: "Kid-friendly activities, playgrounds, and attractions perfect for families",
    category: "Family",
    icon: Users,
    tags: ["Kids", "Family", "Playgrounds"],
    image: "/api/placeholder/400/250",
    slug: "/guides/family-fun-des-moines"
  },
  {
    id: "best-brunch-des-moines",
    title: "Best Brunch Spots in Des Moines",
    description: "Weekend brunch destinations, bottomless mimosas, and morning favorites",
    category: "Food",
    icon: Coffee,
    tags: ["Brunch", "Weekend", "Food"],
    image: "/api/placeholder/400/250",
    slug: "/guides/best-brunch-des-moines"
  },
  {
    id: "photography-spots-des-moines",
    title: "Best Photography Spots in Des Moines",
    description: "Instagram-worthy locations, scenic views, and picture-perfect backdrops",
    category: "Photography",
    icon: Camera,
    tags: ["Photography", "Scenic", "Instagram"],
    image: "/api/placeholder/400/250",
    slug: "/guides/photography-spots-des-moines"
  },
  {
    id: "winter-activities-des-moines",
    title: "Winter Activities in Des Moines",
    description: "Cold weather fun, holiday events, and cozy indoor experiences",
    category: "Seasonal",
    icon: Snowflake,
    tags: ["Winter", "Holiday", "Indoor"],
    image: "/api/placeholder/400/250",
    slug: "/guides/winter-activities-des-moines"
  }
];

const categories = ["All", "Seasonal", "Food", "Family", "Weather", "Romance", "Budget", "Photography"];

const faqData = [
  {
    question: "What types of guides do you offer for Des Moines?",
    answer: "We offer comprehensive guides covering seasonal activities, dining, family fun, weather-specific recommendations, romantic date ideas, budget-friendly options, and photography spots. Each guide is updated regularly with current information and local insights."
  },
  {
    question: "Are these guides updated regularly?",
    answer: "Yes! Our guides are updated monthly or seasonally depending on the topic. Event-based guides are updated weekly, while restaurant and attraction guides are updated as new places open or information changes."
  },
  {
    question: "Do you include suburbs in your Des Moines guides?",
    answer: "Absolutely! Our guides cover the greater Des Moines metro area including West Des Moines, Ankeny, Urbandale, Johnston, Altoona, Clive, and Windsor Heights."
  },
  {
    question: "Can I suggest additions to your guides?",
    answer: "We'd love your suggestions! You can contact us through our website or social media channels. We especially appreciate recommendations from locals who know hidden gems and new spots to explore."
  }
];

export default function GuidesPage() {
  const pageTitle = "Des Moines Local Guides - Best Activities, Dining & Attractions";
  const pageDescription = "Comprehensive guides to the best of Des Moines. Find seasonal activities, dining recommendations, family fun, date night spots, and local insider tips for Des Moines and suburbs.";
  
  const breadcrumbs = [
    { name: "Guides", url: "/guides" }
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <EnhancedLocalSEO
        pageTitle={pageTitle}
        pageDescription={pageDescription}
        canonicalUrl="https://desmoinesinsider.com/guides"
        pageType="website"
        breadcrumbs={breadcrumbs}
        faqData={faqData}
      />

      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* Hero Section */}
        <div className="mb-12">
          <div className="text-center max-w-4xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              Des Moines Local Guides
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Discover the best of Des Moines with our comprehensive local guides. 
              From seasonal activities to hidden gems, we've got your next adventure covered.
            </p>
            
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{guides.length}</div>
                <div className="text-sm text-muted-foreground">Local Guides</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">5+</div>
                <div className="text-sm text-muted-foreground">Metro Areas</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">Weekly</div>
                <div className="text-sm text-muted-foreground">Updates</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">Local</div>
                <div className="text-sm text-muted-foreground">Expertise</div>
              </div>
            </div>
          </div>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          {categories.map((category) => (
            <Badge 
              key={category} 
              variant="secondary" 
              className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
            >
              {category}
            </Badge>
          ))}
        </div>

        {/* Guides Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {guides.map((guide) => {
            const IconComponent = guide.icon;
            return (
              <Card key={guide.id} className="overflow-hidden hover:shadow-lg transition-shadow">
                <div className="aspect-video relative">
                  <img
                    src={guide.image}
                    alt={guide.title}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute top-4 left-4">
                    <Badge variant="secondary" className="bg-background/90 backdrop-blur">
                      <IconComponent className="h-3 w-3 mr-1" />
                      {guide.category}
                    </Badge>
                  </div>
                </div>
                
                <CardHeader>
                  <CardTitle className="text-xl">{guide.title}</CardTitle>
                  <p className="text-muted-foreground">{guide.description}</p>
                </CardHeader>
                
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {guide.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  
                  <Link 
                    to={guide.slug}
                    className="inline-block w-full text-center bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors"
                  >
                    Read Guide
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Popular Links */}
        <Card className="mb-12">
          <CardHeader>
            <CardTitle className="text-2xl">Quick Access</CardTitle>
            <p className="text-muted-foreground">
              Looking for something specific? Jump to our most popular sections.
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Link 
                to="/events/today" 
                className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Clock className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold">Today's Events</h3>
                  <p className="text-sm text-muted-foreground">See what's happening right now</p>
                </div>
              </Link>
              
              <Link 
                to="/events/this-weekend" 
                className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Calendar className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold">This Weekend</h3>
                  <p className="text-sm text-muted-foreground">Weekend activities and events</p>
                </div>
              </Link>
              
              <Link 
                to="/restaurants" 
                className="flex items-center gap-3 p-4 rounded-lg border hover:bg-muted/50 transition-colors"
              >
                <Utensils className="h-6 w-6 text-primary" />
                <div>
                  <h3 className="font-semibold">Restaurant Guide</h3>
                  <p className="text-sm text-muted-foreground">Best places to eat in Des Moines</p>
                </div>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* FAQ Section */}
        <FAQSection 
          faqs={faqData}
          title="Guide Questions"
          description="Common questions about our Des Moines local guides and recommendations"
        />
      </main>

      <Footer />
    </div>
  );
}