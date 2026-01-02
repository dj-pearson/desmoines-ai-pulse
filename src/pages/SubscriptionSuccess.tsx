import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useSubscription } from "@/hooks/useSubscription";
import { CheckCircle, Sparkles, Crown, ArrowRight, Loader2 } from "lucide-react";

export default function SubscriptionSuccess() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshSubscription, tier, subscription, isLoading } = useSubscription();
  const [verifying, setVerifying] = useState(true);

  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    // Refresh subscription data to get the updated tier
    const verifySubscription = async () => {
      // Give the webhook a moment to process
      await new Promise((resolve) => setTimeout(resolve, 2000));
      refreshSubscription();
      setVerifying(false);
    };

    verifySubscription();
  }, [refreshSubscription]);

  const tierConfig = {
    insider: {
      name: "Insider",
      icon: Sparkles,
      color: "text-blue-600",
      bgColor: "bg-blue-100",
      features: [
        "Unlimited favorites",
        "Early access to hot events",
        "Advanced search filters",
        "Daily personalized digest",
        "Ad-free experience",
        "Priority support",
      ],
    },
    vip: {
      name: "VIP",
      icon: Crown,
      color: "text-amber-600",
      bgColor: "bg-amber-100",
      features: [
        "Everything in Insider",
        "Exclusive VIP-only events",
        "Restaurant reservation help",
        "SMS alerts for your interests",
        "Monthly local business perks",
        "Concierge support",
      ],
    },
  };

  const currentTierConfig = tier !== "free" ? tierConfig[tier as "insider" | "vip"] : null;
  const TierIcon = currentTierConfig?.icon || Sparkles;

  if (verifying || isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-16">
          <div className="max-w-lg mx-auto text-center">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary mb-4" />
            <h1 className="text-2xl font-bold mb-2">Verifying your subscription...</h1>
            <p className="text-muted-foreground">
              Please wait while we confirm your payment.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Welcome to {currentTierConfig?.name || "Premium"}! - Des Moines Insider</title>
        <meta
          name="description"
          content="Your subscription is now active. Start exploring exclusive Des Moines experiences."
        />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-16">
          <div className="max-w-2xl mx-auto">
            {/* Success Header */}
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 mb-6">
                <CheckCircle className="h-10 w-10 text-green-600" />
              </div>
              <h1 className="text-3xl md:text-4xl font-bold mb-4">
                Welcome to {currentTierConfig?.name || "Premium"}!
              </h1>
              <p className="text-xl text-muted-foreground">
                Your subscription is now active. Let's explore Des Moines together!
              </p>
            </div>

            {/* Subscription Details Card */}
            <Card className="mb-8">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${currentTierConfig?.bgColor || "bg-primary/10"}`}
                    >
                      <TierIcon
                        className={`h-6 w-6 ${currentTierConfig?.color || "text-primary"}`}
                      />
                    </div>
                    <div>
                      <CardTitle>{currentTierConfig?.name || "Premium"} Member</CardTitle>
                      <CardDescription>
                        Your benefits are now active
                      </CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary" className="bg-green-100 text-green-800">
                    Active
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <h4 className="font-semibold mb-3">Your Benefits:</h4>
                <ul className="grid md:grid-cols-2 gap-2">
                  {(currentTierConfig?.features || []).map((feature, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-sm">
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>

                {subscription?.current_period_end && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-sm text-muted-foreground">
                      Next billing date:{" "}
                      <span className="font-medium">
                        {new Date(subscription.current_period_end).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })}
                      </span>
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Get Started</CardTitle>
                <CardDescription>
                  Make the most of your membership
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Button
                    variant="default"
                    className="w-full justify-between"
                    onClick={() => navigate("/events")}
                  >
                    Browse Events
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => navigate("/restaurants")}
                  >
                    Discover Restaurants
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => navigate("/trip-planner")}
                  >
                    Plan Your Trip
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full justify-between"
                    onClick={() => navigate("/profile")}
                  >
                    Set Preferences
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Help Section */}
            <div className="text-center mt-8">
              <p className="text-sm text-muted-foreground">
                Questions about your subscription?{" "}
                <a href="/contact" className="text-primary hover:underline">
                  Contact Support
                </a>
              </p>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
