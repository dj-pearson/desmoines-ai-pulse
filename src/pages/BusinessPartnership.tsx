import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BusinessPartnershipApplication } from "@/components/BusinessPartnershipApplication";
import { BusinessDashboard } from "@/components/BusinessDashboard";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useAuth } from "@/hooks/useAuth";
import { useBusinessPartnership } from "@/hooks/useBusinessPartnership";
import { 
  Building2, 
  Star, 
  Users, 
  BarChart3, 
  Megaphone,
  CheckCircle,
  ArrowRight,
  Target,
  Globe,
  TrendingUp
} from "lucide-react";

export default function BusinessPartnership() {
  const { user } = useAuth();
  const { businessProfile, advertisingPackages } = useBusinessPartnership();
  const [activeTab, setActiveTab] = useState(businessProfile ? "dashboard" : "overview");

  const features = [
    {
      icon: <Star className="w-6 h-6" />,
      title: "Featured Listings",
      description: "Get priority placement in search results and category listings"
    },
    {
      icon: <Users className="w-6 h-6" />,
      title: "Customer Engagement",
      description: "Connect directly with potential customers through reviews and messaging"
    },
    {
      icon: <BarChart3 className="w-6 h-6" />,
      title: "Analytics & Insights",
      description: "Track your business performance with detailed analytics"
    },
    {
      icon: <Megaphone className="w-6 h-6" />,
      title: "Marketing Tools",
      description: "Promote your business with our advertising and marketing solutions"
    },
    {
      icon: <Target className="w-6 h-6" />,
      title: "Targeted Advertising",
      description: "Reach your ideal customers with targeted advertising campaigns"
    },
    {
      icon: <Globe className="w-6 h-6" />,
      title: "Online Presence",
      description: "Build a strong online presence in the Des Moines community"
    }
  ];

  const benefits = [
    "Increased visibility in local search results",
    "Direct customer communication channels",
    "Detailed business analytics and reporting",
    "Featured placement in relevant categories",
    "Social media integration and promotion",
    "Event promotion and marketing support",
    "Customer review management tools",
    "Priority customer support"
  ];

  return (
    <>
      <SEOHead
        title="Business Partnership - Des Moines Insider"
        description="Partner with Des Moines Insider to grow your business. Get featured listings, customer engagement tools, and powerful analytics to boost your local presence."
        keywords={["business partnership", "Des Moines business", "local marketing", "business advertising", "Iowa business"]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <main className="container mx-auto px-4 py-8">
          <div className="max-w-6xl mx-auto">
            <Breadcrumbs
              className="mb-4"
              items={[
                { label: "Home", href: "/" },
                { label: "Partnership" },
              ]}
            />

            {/* Hero Section */}
            <div className="text-center space-y-4 mb-12">
              <h1 className="text-4xl md:text-6xl font-bold">
                Partner with <span className="text-primary">Des Moines Insider</span>
              </h1>
              <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
                Join our community of local businesses and reach thousands of potential customers 
                in the Des Moines area. Get the tools and visibility you need to grow.
              </p>
              {!user && (
                <div className="flex gap-4 justify-center">
                  <Button size="lg" asChild>
                    <a href="/auth">Get Started Today</a>
                  </Button>
                </div>
              )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="application">Apply</TabsTrigger>
                <TabsTrigger value="dashboard" disabled={!businessProfile}>Dashboard</TabsTrigger>
                <TabsTrigger value="advertising">Advertising</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-12">
                {/* Features Grid */}
                <section>
                  <h2 className="text-3xl font-bold text-center mb-8">Why Partner With Us?</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {features.map((feature, index) => (
                      <Card key={index} className="text-center">
                        <CardContent className="p-6">
                          <div className="flex justify-center mb-4 text-primary">
                            {feature.icon}
                          </div>
                          <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
                          <p className="text-muted-foreground">{feature.description}</p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </section>

                {/* Benefits List */}
                <section className="bg-muted/30 rounded-lg p-8">
                  <h2 className="text-3xl font-bold text-center mb-8">Partnership Benefits</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl mx-auto">
                    {benefits.map((benefit, index) => (
                      <div key={index} className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <span>{benefit}</span>
                      </div>
                    ))}
                  </div>
                </section>

                {/* CTA Section */}
                <section className="text-center space-y-6">
                  <h2 className="text-3xl font-bold">Ready to Grow Your Business?</h2>
                  <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
                    Join hundreds of local businesses already thriving with Des Moines Insider
                  </p>
                  <Button 
                    size="lg" 
                    onClick={() => setActiveTab("application")}
                    className="gap-2"
                  >
                    Start Your Application
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </section>
              </TabsContent>

              <TabsContent value="application">
                <div className="max-w-4xl mx-auto">
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold mb-4">Apply for Partnership</h2>
                    <p className="text-muted-foreground">
                      Choose the partnership tier that best fits your business needs and get started today.
                    </p>
                  </div>
                  <BusinessPartnershipApplication />
                </div>
              </TabsContent>

              <TabsContent value="dashboard">
                <div className="max-w-6xl mx-auto">
                  <div className="text-center mb-8">
                    <h2 className="text-3xl font-bold mb-4">Business Dashboard</h2>
                    <p className="text-muted-foreground">
                      Manage your business profile, track analytics, and monitor your partnership.
                    </p>
                  </div>
                  <BusinessDashboard />
                </div>
              </TabsContent>

              <TabsContent value="advertising" className="space-y-6">
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-bold mb-4">Advertising Packages</h2>
                  <p className="text-muted-foreground">
                    Boost your business visibility with our targeted advertising solutions.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {advertisingPackages.map((pkg) => (
                    <Card key={pkg.id} className="relative">
                      {pkg.package_name === 'Professional' && (
                        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                          <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
                        </div>
                      )}
                      <CardHeader className="text-center">
                        <CardTitle className="text-2xl">{pkg.package_name}</CardTitle>
                        <div className="text-3xl font-bold text-primary">
                          ${pkg.price_monthly}<span className="text-sm font-normal text-muted-foreground">/month</span>
                        </div>
                        {pkg.package_description && (
                          <p className="text-muted-foreground">{pkg.package_description}</p>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <p className="font-medium">Features:</p>
                          {pkg.features.map((feature, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-500" />
                              <span className="text-sm">{feature}</span>
                            </div>
                          ))}
                        </div>
                        <div className="pt-4 border-t">
                          <p className="text-sm text-muted-foreground">
                            Up to {pkg.max_ads_per_month} ads per month
                          </p>
                        </div>
                        <Button className="w-full" disabled={!businessProfile}>
                          {businessProfile ? 'Select Package' : 'Apply for Partnership First'}
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {!businessProfile && (
                  <div className="text-center p-6 bg-muted/30 rounded-lg">
                    <Building2 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-xl font-semibold mb-2">Partnership Required</h3>
                    <p className="text-muted-foreground mb-4">
                      You need to apply for a business partnership before accessing advertising packages.
                    </p>
                    <Button onClick={() => setActiveTab("application")}>
                      Apply for Partnership
                    </Button>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}