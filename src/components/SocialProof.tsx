import { Star, Users, Calendar, MapPin, Quote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const stats = [
  {
    value: "15,000+",
    label: "Active Users",
    icon: Users,
  },
  {
    value: "500+",
    label: "Events Weekly",
    icon: Calendar,
  },
  {
    value: "200+",
    label: "Local Restaurants",
    icon: MapPin,
  },
  {
    value: "4.8/5",
    label: "User Rating",
    icon: Star,
  },
];

const testimonials = [
  {
    quote: "Finally found my go-to app for discovering what's happening in DSM. The weekend recommendations are spot on!",
    author: "Sarah M.",
    role: "East Village Resident",
    avatar: "SM",
  },
  {
    quote: "As a newcomer to Des Moines, this has been invaluable. Found my favorite coffee shop and three new restaurants in the first week.",
    author: "Marcus T.",
    role: "Ankeny",
    avatar: "MT",
  },
  {
    quote: "The event alerts have helped me never miss a farmers market or festival. My kids love the playground finder too!",
    author: "Jessica L.",
    role: "West Des Moines Mom",
    avatar: "JL",
  },
];

const trustedBy = [
  "East Village",
  "Valley Junction",
  "Downtown DSM",
  "Ankeny",
  "West Des Moines",
  "Johnston",
];

export function SocialProof() {
  return (
    <section className="py-16 bg-muted/30">
      <div className="container mx-auto px-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          {stats.map((stat, idx) => (
            <div
              key={idx}
              className="text-center p-6 bg-background rounded-xl border"
            >
              <stat.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
              <div className="text-3xl font-bold text-foreground mb-1">
                {stat.value}
              </div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Section Header */}
        <div className="text-center mb-10">
          <Badge variant="secondary" className="mb-3">
            <Users className="h-3 w-3 mr-1" />
            Community Favorites
          </Badge>
          <h2 className="text-3xl font-bold mb-3">
            Trusted by Des Moines Locals
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Join thousands of residents who rely on Des Moines Insider to discover
            the best of what our city has to offer.
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-6 mb-10">
          {testimonials.map((testimonial, idx) => (
            <Card key={idx} className="bg-background">
              <CardContent className="pt-6">
                <div className="flex gap-1 mb-4">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className="h-4 w-4 fill-yellow-400 text-yellow-400"
                    />
                  ))}
                </div>
                <Quote className="h-8 w-8 text-primary/20 mb-2" />
                <p className="text-muted-foreground mb-4 italic">
                  "{testimonial.quote}"
                </p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-semibold text-primary text-sm">
                    {testimonial.avatar}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{testimonial.author}</p>
                    <p className="text-xs text-muted-foreground">
                      {testimonial.role}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Trusted Neighborhoods */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-4">
            Loved across Des Moines metro
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {trustedBy.map((neighborhood, idx) => (
              <Badge key={idx} variant="outline" className="text-xs">
                {neighborhood}
              </Badge>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default SocialProof;
