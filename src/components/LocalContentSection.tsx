import { Calendar, MapPin, Users, Sparkles, TrendingUp, Heart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

interface LocalContentSectionProps {
  className?: string;
}

export default function LocalContentSection({ className }: LocalContentSectionProps) {
  
  const localGuides = [
    {
      title: "This Weekend in Des Moines",
      description: "The best family-friendly events, farmers markets, and activities happening this weekend in Des Moines metro area.",
      icon: Calendar,
      color: "text-blue-600",
      badge: "Updated Daily",
      keywords: "weekend events Des Moines, things to do this weekend Des Moines Iowa",
      link: "/weekend"
    },
    {
      title: "New Des Moines Restaurant Openings",
      description: "Latest restaurant openings, food trucks, and dining experiences across Des Moines and surrounding suburbs.",
      icon: Heart,
      color: "text-red-600", 
      badge: "Fresh Finds",
      keywords: "new restaurants Des Moines, Des Moines food openings, dining Des Moines Iowa",
      link: "/restaurants"
    },
    {
      title: "Family Activities Des Moines",
      description: "Kid-friendly events, playgrounds, and family attractions in Des Moines, Ankeny, West Des Moines, and beyond.",
      icon: Users,
      color: "text-green-600",
      badge: "Family Guide",
      keywords: "family activities Des Moines, kid friendly events Des Moines, children activities Iowa",
      link: "/playgrounds"
    },
    {
      title: "Des Moines Neighborhoods Guide",
      description: "Explore East Village, West Des Moines, Ankeny, and other metro neighborhoods with local events and dining.",
      icon: MapPin,
      color: "text-purple-600",
      badge: "Local Insider",
      keywords: "Des Moines neighborhoods, East Village events, West Des Moines dining, Ankeny activities",
      link: "/neighborhoods"
    }
  ];

  const trendingSearches = [
    "Des Moines farmers market this Saturday",
    "Best kid-friendly restaurants West Des Moines", 
    "Things to do in Ankeny this weekend",
    "East Village Des Moines nightlife",
    "Family activities Des Moines winter",
    "New restaurants downtown Des Moines",
    "Des Moines Public Schools holiday events",
    "Indoor playgrounds Des Moines metro"
  ];

  const seasonalContent = [
    {
      season: "This Season",
      title: "Winter Activities in Des Moines",
      items: [
        "Indoor playgrounds during Iowa winter",
        "Holiday events Des Moines metro area", 
        "Cozy restaurants for date night Des Moines",
        "Family winter activities Central Iowa"
      ]
    }
  ];

  return (
    <div className={`space-y-8 ${className}`}>
      {/* Local Guides Section */}
      <div className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-gray-900">
            Your Complete Des Moines Local Guide
          </h2>
          <p className="text-lg text-gray-600 max-w-3xl mx-auto">
            Discover what's happening in Des Moines, Iowa with our AI-powered local insights. 
            From weekend events to new restaurant openings, we've got Des Moines covered.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {localGuides.map((guide, index) => {
            const IconComponent = guide.icon;
            return (
              <Card key={index} className="hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <IconComponent className={`h-8 w-8 ${guide.color}`} />
                    <Badge variant="secondary" className="text-xs">{guide.badge}</Badge>
                  </div>
                  <CardTitle className="text-lg">{guide.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-600 mb-4">{guide.description}</p>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link to={guide.link}>
                      Explore Guide
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Trending Local Searches */}
      <Card className="bg-gradient-to-r from-blue-50 to-purple-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-6 w-6 text-blue-600" />
            What Des Moines Locals Are Searching For
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-3">
            {trendingSearches.map((search, index) => (
              <div 
                key={index} 
                className="flex items-center gap-2 p-3 bg-white rounded-lg hover:shadow-md transition-shadow cursor-pointer"
              >
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-sm font-medium text-gray-700">{search}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Seasonal Content */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-yellow-500" />
            Seasonal Des Moines Activities
          </CardTitle>
        </CardHeader>
        <CardContent>
          {seasonalContent.map((content, index) => (
            <div key={index} className="space-y-3">
              <h4 className="font-semibold text-lg text-gray-800">{content.title}</h4>
              <div className="grid md:grid-cols-2 gap-2">
                {content.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex items-center gap-2 text-sm text-gray-600">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    {item}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Local SEO Rich Content */}
      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <h3 className="text-xl font-semibold mb-4 text-gray-900">
            Des Moines, Iowa: Your Local Event & Dining Destination
          </h3>
          <div className="prose prose-sm max-w-none text-gray-700 space-y-4">
            <p>
              <strong>Des Moines Insider</strong> is your trusted source for discovering the best events, 
              restaurants, and activities in Des Moines, Iowa and the surrounding metro area. Whether you're 
              looking for family-friendly weekend activities, the latest restaurant openings in West Des Moines, 
              or cultural events in the East Village, we provide comprehensive local coverage.
            </p>
            <p>
              Our coverage includes <strong>downtown Des Moines</strong>, the trendy <strong>East Village</strong> 
              district, family-friendly <strong>West Des Moines</strong> and <strong>Ankeny</strong>, 
              plus <strong>Urbandale</strong>, <strong>Johnston</strong>, <strong>Clive</strong>, and 
              <strong>Waukee</strong>. From the famous Saturday morning farmers market to Science Center of Iowa, 
              from Jordan Creek Town Center to Gray's Lake Trail, we help you discover what makes Des Moines special.
            </p>
            <p>
              <strong>Local expertise you can trust:</strong> We track over 800 monthly events across Central Iowa, 
              maintain a database of 300+ Des Moines area restaurants, and provide real-time updates on new openings, 
              seasonal attractions, and community happenings throughout the Des Moines metropolitan area.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
