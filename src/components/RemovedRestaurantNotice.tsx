import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ArrowLeft, Utensils } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface RemovedRestaurantNoticeProps {
  name: string;
  /** An admin reading a hidden row (RLS lets them): say how to bring it back. */
  adminView?: boolean;
}

/**
 * WEB-FEAT-103: the page an old link to a hidden restaurant lands on. 200 with
 * noindex, not a 404: the listing existed, and the visitor is told what
 * happened to it rather than that it never was.
 */
export function RemovedRestaurantNotice({ name, adminView = false }: RemovedRestaurantNoticeProps) {
  return (
    <>
      <Helmet>
        <title>{`${name} - listing removed | Des Moines Insider`}</title>
        <meta name="robots" content="noindex, follow" />
      </Helmet>
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center px-4">
        <Card className="max-w-md mx-auto text-center shadow-lg rounded-2xl">
          <CardContent className="p-8">
            <Utensils className="h-16 w-16 text-muted-foreground mx-auto mb-4" aria-hidden="true" />
            <h1 className="text-2xl font-bold text-foreground mb-2">This listing was removed</h1>
            <p className="text-muted-foreground mb-6">
              {name} is no longer listed on Des Moines Insider.
            </p>
            {adminView && (
              <p className="text-sm text-muted-foreground mb-6">
                An admin hid this listing. Unhide it from Admin, Content, Restaurants.
              </p>
            )}
            <Button asChild className="min-h-11 bg-[#2D1B69] hover:bg-[#2D1B69]/90">
              <Link to="/restaurants">
                <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" />
                Browse restaurants
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
