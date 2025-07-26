import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Calendar, MapPin } from "lucide-react";

interface RestaurantOpening {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  cuisine: string | null;
  openingDate: string | null;
  status: 'opening_soon' | 'newly_opened' | 'announced';
  sourceUrl: string | null;
  createdAt: string;
}

const statusConfig = {
  opening_soon: { label: "Opening Soon", color: "bg-yellow-500" },
  newly_opened: { label: "Newly Opened", color: "bg-green-500" },
  announced: { label: "Announced", color: "bg-blue-500" }
};

export function RestaurantOpenings() {
  const { data: openings = [], isLoading } = useQuery<RestaurantOpening[]>({
    queryKey: ["/api/restaurant-openings"],
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">New Restaurant Openings</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="h-48 animate-pulse">
              <div className="p-6">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded mb-2"></div>
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded mt-4"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (openings.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold">New Restaurant Openings</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">
              No restaurant openings tracked yet. Check back soon for the latest restaurant news!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">New Restaurant Openings</h2>
        <p className="text-sm text-muted-foreground">
          Latest restaurant news from local sources
        </p>
      </div>
      
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {openings.map((opening) => (
          <Card key={opening.id} className="hover:shadow-lg transition-shadow duration-200">
            <CardHeader className="space-y-3">
              <div className="flex items-start justify-between">
                <CardTitle className="text-lg leading-tight">{opening.name}</CardTitle>
                <Badge 
                  variant="secondary" 
                  className={`${statusConfig[opening.status].color} text-white text-xs`}
                >
                  {statusConfig[opening.status].label}
                </Badge>
              </div>
              
              <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                {opening.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    <span>{opening.location}</span>
                  </div>
                )}
                
                {opening.cuisine && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-xs bg-secondary px-2 py-1 rounded">
                      {opening.cuisine}
                    </span>
                  </div>
                )}
                
                {opening.openingDate && (
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>{new Date(opening.openingDate).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
            </CardHeader>
            
            <CardContent className="space-y-4">
              {opening.description && (
                <CardDescription className="text-sm line-clamp-3">
                  {opening.description}
                </CardDescription>
              )}
              
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Added {new Date(opening.createdAt).toLocaleDateString()}
                </span>
                
                {opening.sourceUrl && (
                  <a
                    href={opening.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
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