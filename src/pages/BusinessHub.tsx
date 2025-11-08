import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { BusinessDashboard } from "@/components/BusinessDashboard";
import { BusinessPartnershipApplication } from "@/components/BusinessPartnershipApplication";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessPartnership } from "@/hooks/useBusinessPartnership";
import {
  Building2,
  BarChart3,
  Megaphone,
  Calendar,
  Star,
  Users,
  TrendingUp,
  Rocket,
  CheckCircle,
  ArrowRight,
  Shield,
  Award,
  Target
} from "lucide-react";

export default function BusinessHub() {
  const { user, isLoading: authLoading } = useAuth();
  const { businessProfile, isLoading: profileLoading } = useBusinessPartnership();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "dashboard");

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    return (
      <>
        <Header />
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardHeader>
              <CardTitle className="text-2xl">Business Hub</CardTitle>
              <CardDescription>Sign in to access your business dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-6">
                Join Des Moines Insider to grow your business with powerful tools and local visibility.
              </p>
              <div className="flex flex-col gap-3">
                <Button onClick={() => navigate("/auth")} size="lg">
                  Sign In
                </Button>
                <Button onClick={() => navigate("/auth")} variant="outline">
                  Create Business Account
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
        <Footer />
      </>
    );
  }

  const features = [
    {
      icon: <BarChart3 className="h-5 w-5" />,
      title: "Analytics Dashboard",
      description: "Track views, clicks, and engagement"
    },
    {
      icon: <Star className="h-5 w-5" />,
      title: "Partnership Tiers",
      description: "Choose the plan that fits your needs"
    },
    {
      icon: <Megaphone className="h-5 w-5" />,
      title: "Advertising Campaigns",
      description: "Promote your business effectively"
    },
    {
      icon: <Calendar className="h-5 w-5" />,
      title: "Event Submissions",
      description: "Share your events with the community"
    }
  ];

  return (
    <>
      <SEOHead
        title="Business Hub - Des Moines Insider"
        description="Manage your business presence on Des Moines Insider. Access analytics, create campaigns, and grow your local reach."
        keywords={["business hub", "Des Moines business", "local marketing", "business dashboard"]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Hero Section */}
          <div className="text-center space-y-4 mb-8">
            <div className="flex items-center justify-center gap-2">
              <Building2 className="h-10 w-10 text-primary" />
              <h1 className="text-4xl font-bold">Business Hub</h1>
            </div>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Your central command center for growing your business on Des Moines Insider
            </p>
            {businessProfile && (
              <Badge variant="outline" className="text-sm">
                <Shield className="h-3 w-3 mr-1" />
                Status: {businessProfile.verification_status || "Active"}
              </Badge>
            )}
          </div>

          {/* Quick Stats Row */}
          {businessProfile && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {features.map((feature, index) => (
                <Card key={index} className="text-center hover:shadow-md transition-shadow">
                  <CardContent className="pt-6 pb-4">
                    <div className="flex justify-center mb-2 text-primary">
                      {feature.icon}
                    </div>
                    <h3 className="font-semibold text-sm mb-1">{feature.title}</h3>
                    <p className="text-xs text-muted-foreground">{feature.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Main Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="dashboard" className="flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="partnership" className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                <span className="hidden sm:inline">Partnership</span>
              </TabsTrigger>
              <TabsTrigger value="advertising" className="flex items-center gap-2">
                <Megaphone className="h-4 w-4" />
                <span className="hidden sm:inline">Advertising</span>
              </TabsTrigger>
              <TabsTrigger value="events" className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Events</span>
              </TabsTrigger>
            </TabsList>

            {/* Dashboard Tab */}
            <TabsContent value="dashboard" className="space-y-6">
              {businessProfile ? (
                <BusinessDashboard />
              ) : (
                <Card>
                  <CardHeader>
                    <CardTitle>Welcome to Your Business Hub</CardTitle>
                    <CardDescription>
                      Get started by completing your business profile
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Alert className="mb-6">
                      <Rocket className="h-4 w-4" />
                      <AlertDescription>
                        Create your business profile to unlock analytics, advertising tools, and more!
                      </AlertDescription>
                    </Alert>
                    <Button onClick={() => setActiveTab("partnership")}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Complete Business Profile
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Partnership Tab */}
            <TabsContent value="partnership" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                    Partnership Plans
                  </CardTitle>
                  <CardDescription>
                    Choose the plan that best fits your business needs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <BusinessPartnershipApplication />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Advertising Tab */}
            <TabsContent value="advertising" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Megaphone className="h-5 w-5 text-primary" />
                    Advertising Campaigns
                  </CardTitle>
                  <CardDescription>
                    Reach thousands of local customers with targeted campaigns
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-6">
                      <div className="border rounded-lg p-4">
                        <Target className="h-8 w-8 text-blue-500 mb-3" />
                        <h3 className="font-semibold mb-2">Targeted Reach</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Reach customers based on location, interests, and behavior
                        </p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <TrendingUp className="h-8 w-8 text-green-500 mb-3" />
                        <h3 className="font-semibold mb-2">Performance Tracking</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Monitor clicks, impressions, and conversions in real-time
                        </p>
                      </div>
                      <div className="border rounded-lg p-4">
                        <Award className="h-8 w-8 text-purple-500 mb-3" />
                        <h3 className="font-semibold mb-2">Premium Placement</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Featured spots on homepage and category pages
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button onClick={() => navigate("/advertise")} size="lg">
                        <Rocket className="h-4 w-4 mr-2" />
                        Create Campaign
                      </Button>
                      <Button onClick={() => navigate("/campaigns")} variant="outline" size="lg">
                        View My Campaigns
                      </Button>
                    </div>

                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Pro Tip:</strong> Campaigns typically see 30% higher engagement when paired with our partnership plans
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Events Tab */}
            <TabsContent value="events" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Event Management
                  </CardTitle>
                  <CardDescription>
                    Submit and manage your business events
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="border-2 border-dashed rounded-lg p-6 text-center">
                        <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <h3 className="font-semibold mb-2">Submit New Event</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          Share your upcoming events with the Des Moines community
                        </p>
                        <Button onClick={() => navigate("/dashboard?tab=submit-event")}>
                          <Calendar className="h-4 w-4 mr-2" />
                          Submit Event
                        </Button>
                      </div>

                      <div className="border-2 border-dashed rounded-lg p-6 text-center">
                        <Users className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                        <h3 className="font-semibold mb-2">Track Submissions</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          View status and analytics for your submitted events
                        </p>
                        <Button onClick={() => navigate("/profile?tab=events")} variant="outline">
                          <ArrowRight className="h-4 w-4 mr-2" />
                          View My Events
                        </Button>
                      </div>
                    </div>

                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        Events are typically reviewed and approved within 24-48 hours
                      </AlertDescription>
                    </Alert>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* CTA Footer */}
          <Card className="mt-8 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-primary/20">
            <CardContent className="p-6">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold mb-1">Need Help Getting Started?</h3>
                  <p className="text-sm text-muted-foreground">
                    Our team is here to help you maximize your business presence
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline">
                    Contact Support
                  </Button>
                  <Button onClick={() => navigate("/business-partnership")}>
                    Learn More
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>

        <Footer />
      </div>
    </>
  );
}
