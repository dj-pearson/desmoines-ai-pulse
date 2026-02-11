import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Home, Calendar, MapPin, Search } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

const NotFound = () => {
  const location = useLocation();
  const isEventPath = location.pathname.includes('/events/');
  useDocumentTitle("Page Not Found");

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="max-w-2xl w-full text-center">
        <CardHeader>
          <CardTitle className="text-6xl font-bold mb-2">404</CardTitle>
          <CardDescription className="text-xl">
            {isEventPath 
              ? "This event could not be found. It may have been moved or removed after the event date passed."
              : "Oops! The page you're looking for doesn't exist."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-muted-foreground">
            {isEventPath 
              ? "Don't worry! There are plenty of other exciting events happening in Des Moines."
              : "Let's get you back on track with some helpful links."
            }
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Button asChild variant="default">
              <Link to="/">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>
            
            <Button asChild variant="outline">
              <Link to="/events">
                <Calendar className="w-4 h-4 mr-2" />
                Browse Events
              </Link>
            </Button>
            
            <Button asChild variant="outline">
              <Link to="/restaurants">
                <MapPin className="w-4 h-4 mr-2" />
                Find Restaurants
              </Link>
            </Button>
          </div>

          {isEventPath && (
            <div className="mt-8 p-4 bg-muted rounded-lg">
              <p className="text-sm text-muted-foreground">
                <strong>Looking for a specific event?</strong> Try searching for similar events or check our current listings. 
                Events are automatically archived after they've passed to keep our listings current.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default NotFound;
