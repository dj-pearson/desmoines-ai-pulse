import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle, Sparkles, Calendar, Heart, ArrowRight } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function AuthVerified() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [countdown, setCountdown] = useState(10);
  useDocumentTitle("Email Verified");

  useEffect(() => {
    // Auto-redirect after 10 seconds
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          navigate("/");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [navigate]);

  const handleExploreNow = () => {
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/10 to-accent/10 flex flex-col">
      <Header />

      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center space-y-4 pb-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-4">
                <CheckCircle className="h-16 w-16 text-green-600" />
              </div>
            </div>
            <CardTitle className="text-3xl font-bold">
              Email Verified! 🎉
            </CardTitle>
            <CardDescription className="text-lg">
              {user?.email && `Welcome, ${user.email.split('@')[0]}! `}
              Your account is now active and ready to use.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8">
            {/* What's Next Section */}
            <div className="bg-primary/5 rounded-lg p-6 space-y-4">
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                What You Can Do Now
              </h3>

              <div className="grid gap-4">
                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 mt-1">
                    <Heart className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Save Your Favorites</h4>
                    <p className="text-sm text-muted-foreground">
                      Click the heart icon on any event to save it to your favorites
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 mt-1">
                    <Calendar className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Get Personalized Recommendations</h4>
                    <p className="text-sm text-muted-foreground">
                      We'll show you events based on your interests and location
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="rounded-full bg-primary/10 p-2 mt-1">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-medium">Add Events to Your Calendar</h4>
                    <p className="text-sm text-muted-foreground">
                      Download .ics files to add events to Google, Apple, or Outlook calendars
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Personalization Info */}
            {user?.user_metadata && (
              <div className="border rounded-lg p-4 space-y-3">
                <h3 className="font-semibold">Your Preferences</h3>

                {user.user_metadata.location && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Location:</span>
                    <span className="font-medium">{user.user_metadata.location}</span>
                  </div>
                )}

                {user.user_metadata.interests && user.user_metadata.interests.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-sm text-muted-foreground">Interests:</span>
                    <div className="flex flex-wrap gap-2">
                      {user.user_metadata.interests.map((interest: string) => (
                        <span
                          key={interest}
                          className="px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium"
                        >
                          {interest}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                onClick={handleExploreNow}
                className="w-full h-12 text-lg"
                size="lg"
              >
                Start Exploring Events
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Redirecting automatically in {countdown} second{countdown !== 1 ? 's' : ''}...
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Footer />
    </div>
  );
}
