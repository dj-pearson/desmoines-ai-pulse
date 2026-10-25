import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import { Helmet } from "react-helmet-async";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Home, Search } from "lucide-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { createLogger } from '@/lib/logger';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

const log = createLogger('NotFound');

/**
 * The catch-all route, and PseoRoutePage's answer for an unknown or
 * unpublished path. It renders the site header and footer so someone who
 * lands here from a dead link still has the nav and search, and its heading
 * is the page's one h1 (CardTitle is an h3, which left the page without one).
 */
const NotFound = () => {
  const location = useLocation();
  const isEventPath = location.pathname.includes('/events/');
  useDocumentTitle("Page Not Found");

  useEffect(() => {
    log.warn('navigation', '404 Error: User attempted to access non-existent route', { pathname: location.pathname });
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet>
        <meta name="robots" content="noindex, follow" />
        <meta name="googlebot" content="noindex, follow" />
      </Helmet>
      <Header />
      <div className="flex-1 flex items-center justify-center p-4 py-12">
      <Card className="max-w-2xl w-full text-center">
        <CardHeader>
          <h1 className="flex flex-col items-center gap-3 mb-2 tracking-tight">
            <span className="text-6xl font-bold leading-none">404</span>
            <span className="text-2xl font-semibold">
              {isEventPath ? "Event not found" : "Page not found"}
            </span>
          </h1>
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

          <div className="flex flex-col sm:flex-row flex-wrap gap-4 justify-center items-center">
            <Button asChild variant="default">
              <Link to="/">
                <Home className="w-4 h-4 mr-2" />
                Back to Home
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link to="/search">
                <Search className="w-4 h-4 mr-2" aria-hidden="true" />
                Search the site
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link to="/events">
                <SpriteIcon name="calendar" className="w-4 h-4 mr-2" />
                Browse Events
              </Link>
            </Button>

            <Button asChild variant="outline">
              <Link to="/restaurants">
                <SpriteIcon name="map-pin" className="w-4 h-4 mr-2" />
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
      <Footer />
    </div>
  );
};

export default NotFound;
