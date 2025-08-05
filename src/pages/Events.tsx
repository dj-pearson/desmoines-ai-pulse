import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, Users, Clock } from "lucide-react";
import eventsHero from "@/assets/events-hero.jpg";

const Events = () => {
  const events = [
    {
      id: 1,
      title: "Tech Conference 2024",
      description: "Join industry leaders for cutting-edge tech discussions and networking opportunities.",
      date: "March 15, 2024",
      time: "9:00 AM - 5:00 PM",
      location: "Convention Center",
      attendees: 500,
      category: "Technology",
      status: "upcoming"
    },
    {
      id: 2,
      title: "Design Workshop",
      description: "Learn modern design principles and hands-on techniques from expert designers.",
      date: "March 22, 2024",
      time: "2:00 PM - 6:00 PM",
      location: "Design Studio",
      attendees: 50,
      category: "Design",
      status: "upcoming"
    },
    {
      id: 3,
      title: "Startup Pitch Night",
      description: "Watch innovative startups present their ideas to investors and industry experts.",
      date: "March 28, 2024",
      time: "7:00 PM - 10:00 PM",
      location: "Innovation Hub",
      attendees: 200,
      category: "Business",
      status: "upcoming"
    },
    {
      id: 4,
      title: "AI & Machine Learning Summit",
      description: "Explore the latest advancements in artificial intelligence and machine learning.",
      date: "April 5, 2024",
      time: "8:00 AM - 6:00 PM",
      location: "Tech Campus",
      attendees: 750,
      category: "Technology",
      status: "upcoming"
    }
  ];

  const categories = ["All", "Technology", "Design", "Business"];

  return (
    <div className="min-h-screen bg-gradient-subtle">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div 
          className="h-96 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${eventsHero})` }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative container mx-auto px-4 h-full flex items-center">
            <div className="text-center text-white max-w-3xl mx-auto">
              <h1 className="text-5xl font-bold mb-6">Discover Amazing Events</h1>
              <p className="text-xl mb-8 opacity-90">
                Connect with like-minded individuals and expand your network at our curated events
              </p>
              <Button variant="hero" size="lg">
                Explore Events
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Filter */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap gap-4 justify-center mb-12">
            {categories.map((category) => (
              <Button
                key={category}
                variant={category === "All" ? "default" : "outline"}
                className="rounded-full"
              >
                {category}
              </Button>
            ))}
          </div>

          {/* Events Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {events.map((event) => (
              <Card key={event.id} className="group hover:shadow-elegant transition-all duration-300 hover:-translate-y-1">
                <CardHeader className="space-y-3">
                  <div className="flex justify-between items-start">
                    <Badge variant="secondary" className="w-fit">
                      {event.category}
                    </Badge>
                    <Badge 
                      variant={event.status === "upcoming" ? "default" : "secondary"}
                      className="capitalize"
                    >
                      {event.status}
                    </Badge>
                  </div>
                  <CardTitle className="line-clamp-2 group-hover:text-primary transition-colors">
                    {event.title}
                  </CardTitle>
                  <CardDescription className="line-clamp-3">
                    {event.description}
                  </CardDescription>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      <span>{event.time}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      <span>{event.location}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>{event.attendees} attendees</span>
                    </div>
                  </div>
                  
                  <Button className="w-full" variant="gradient">
                    Register Now
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-gradient-primary text-white">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">Don't See What You're Looking For?</h2>
          <p className="text-xl mb-8 opacity-90">
            Create your own event and connect with your community
          </p>
          <Button variant="outline" size="lg" className="bg-white text-primary hover:bg-white/90">
            Create Event
          </Button>
        </div>
      </section>
    </div>
  );
};

export default Events;