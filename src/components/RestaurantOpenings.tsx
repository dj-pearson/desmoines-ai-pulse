import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Calendar, MapPin } from "lucide-react";
import { useRestaurantOpenings } from "@/hooks/useSupabase";

const statusConfig = {
  opening_soon: { label: "Opening Soon", color: "bg-yellow-500" },
  newly_opened: { label: "Newly Opened", color: "bg-green-500" },
  announced: { label: "Announced", color: "bg-blue-500" },
  open: { label: "Open", color: "bg-green-600" },
  closed: { label: "Closed", color: "bg-red-500" }
};

const getStatusConfig = (status: string | undefined) => {
  if (!status || !statusConfig[status as keyof typeof statusConfig]) {
    return { label: "Status Unknown", color: "bg-gray-500" };
  }
  return statusConfig[status as keyof typeof statusConfig];
};

export function RestaurantOpenings() {
  const { data: openings = [], isLoading } = useRestaurantOpenings();

  if (isLoading) {
    return (
      <div className="space-y-4 md:space-y-6">
        <h2 className="text-mobile-title md:text-2xl font-bold">New Restaurant Openings</h2>
        <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-48 md:h-56 animate-pulse">
              <div className="mobile-padding">
                <div className="h-4 bg-muted rounded mb-4"></div>
                <div className="h-3 bg-muted rounded mb-2"></div>
                <div className="h-3 bg-muted rounded mb-2"></div>
                <div className="h-6 bg-muted rounded mt-4"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (openings.length === 0) {
    return (
      <div className="space-y-4 md:space-y-6">
        <h2 className="text-mobile-title md:text-2xl font-bold">New Restaurant Openings</h2>
        <Card className="mobile-padding">
          <CardContent className="pt-6 text-center">
            <p className="text-muted-foreground text-mobile-body">
              No restaurant openings tracked yet. Check back soon for the latest restaurant news!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Mobile-First Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <h2 className="text-mobile-title md:text-2xl font-bold">New Restaurant Openings</h2>
        <p className="text-mobile-caption md:text-sm text-muted-foreground">
          Latest restaurant news from local sources
        </p>
      </div>
      
      {/* Mobile-Optimized Restaurant Grid */}
      <div className="mobile-grid sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {openings.map((opening) => (
          <Card key={opening.id} className="smooth-transition hover:shadow-lg hover:scale-[1.02] touch-target">
            <CardHeader className="space-y-3 mobile-padding">
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-mobile-body md:text-lg leading-tight flex-1 min-w-0">
                  {opening.name}
                </CardTitle>
                <Badge 
                  variant="secondary" 
                  className={`${getStatusConfig(opening.status).color} text-white text-xs flex-shrink-0`}
                >
                  {getStatusConfig(opening.status).label}
                </Badge>
              </div>
              
              {/* Mobile-Optimized Meta Information */}
              <div className="flex flex-col gap-2 text-mobile-caption text-muted-foreground">
                {opening.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate">{opening.location}</span>
                  </div>
                )}
                
                {opening.cuisine && (
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs bg-secondary text-secondary-foreground px-2 py-1 rounded-full">
                      {opening.cuisine}
                    </span>
                  </div>
                )}
                
                {opening.openingDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 flex-shrink-0" />
                    <span>{new Date(opening.openingDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            
            <CardContent className="space-y-3 md:space-y-4 mobile-padding pt-0">
              {opening.description && (
                <CardDescription className="text-mobile-caption leading-relaxed line-clamp-3">
                  {opening.description}
                </CardDescription>
              )}
              
              {/* Mobile-Optimized Footer */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2 border-t border-border/50">
                <span className="text-xs text-muted-foreground">
                  Added {new Date(opening.createdAt).toLocaleDateString()}
                </span>
                
                {opening.sourceUrl && (
                  <a
                    href={opening.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 smooth-transition touch-target self-start"
                  >
                    Read More <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}