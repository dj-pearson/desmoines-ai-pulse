import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Star, Eye, Target } from "lucide-react";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { useCampaigns } from "@/hooks/useCampaigns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

const PLACEMENT_OPTIONS = [
  {
    type: "top_banner" as const,
    name: "Top Banner",
    description: "Premium placement at the top of every page",
    dailyCost: 10,
    icon: Star,
    features: ["Maximum visibility", "Mobile & desktop", "All pages"],
    assetRequirements: {
      desktop: "728x90px or 970x250px",
      mobile: "320x50px or 300x100px",
      formats: ["JPG", "PNG", "WebP"],
      maxFileSize: "2MB",
      animationType: "Static images only"
    },
    specifications: [
      "High-resolution images (300 DPI recommended)",
      "Clear, readable text even at small sizes",
      "Strong call-to-action button",
      "Brand logo prominently displayed"
    ]
  },
  {
    type: "featured_spot" as const,
    name: "Featured Spot",
    description: "Highlighted placement in search results and event listings",
    dailyCost: 5,
    icon: Eye,
    features: ["1st or 2nd position", "Event listings", "High engagement"],
    assetRequirements: {
      desktop: "300x250px or 336x280px",
      mobile: "300x250px (responsive)",
      formats: ["JPG", "PNG", "WebP"],
      maxFileSize: "1.5MB",
      animationType: "Static or subtle animation (GIF up to 5 seconds)"
    },
    specifications: [
      "Eye-catching visuals with local appeal",
      "Clear business name and offering",
      "High contrast for mobile readability",
      "Include location or Des Moines reference"
    ]
  },
  {
    type: "below_fold" as const,
    name: "Below the Fold",
    description: "Cost-effective placement integrated within content areas",
    dailyCost: 5,
    icon: Target,
    features: ["Content integration", "Targeted audience", "Great value"],
    assetRequirements: {
      desktop: "300x250px or 250x250px",
      mobile: "300x250px (responsive)",
      formats: ["JPG", "PNG", "WebP"],
      maxFileSize: "1MB",
      animationType: "Static images preferred"
    },
    specifications: [
      "Native advertising style preferred",
      "Blend with editorial content design",
      "Focus on value proposition",
      "Local Des Moines imagery encouraged"
    ]
  },
];

export default function Advertise() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { createCampaign, createCheckoutSession, isLoading } = useCampaigns();
  
  const [campaignName, setCampaignName] = useState("");
  const [selectedPlacements, setSelectedPlacements] = useState<
    Array<{ type: string; days: number }>
  >([]);
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();

  // Allow viewing the page without login - only require login at checkout
  const handlePlacementToggle = (type: string, checked: boolean) => {
    if (checked) {
      setSelectedPlacements([...selectedPlacements, { type, days: 7 }]);
    } else {
      setSelectedPlacements(selectedPlacements.filter(p => p.type !== type));
    }
  };

  const handleDaysChange = (type: string, days: number) => {
    setSelectedPlacements(
      selectedPlacements.map(p =>
        p.type === type ? { ...p, days } : p
      )
    );
  };

  const calculateTotalCost = () => {
    return selectedPlacements.reduce((total, placement) => {
      const option = PLACEMENT_OPTIONS.find(opt => opt.type === placement.type);
      return total + (option?.dailyCost || 0) * placement.days;
    }, 0);
  };

  const handleCreateCampaign = async () => {
    // Check if user is logged in first
    if (!user) {
      toast({
        title: "Login Required",
        description: "Please log in or create an account to continue.",
        variant: "destructive",
      });
      // Redirect to auth page with return URL
      navigate("/auth?redirect=/advertise");
      return;
    }

    if (!campaignName || selectedPlacements.length === 0 || !startDate || !endDate) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    try {
      const campaign = await createCampaign({
        name: campaignName,
        placements: selectedPlacements.map(p => ({
          placement_type: p.type as any,
          days_count: p.days,
        })),
        start_date: format(startDate, "yyyy-MM-dd"),
        end_date: format(endDate, "yyyy-MM-dd"),
      });

      toast({
        title: "Campaign Created!",
        description: "Redirecting to secure payment...",
      });

      // Navigate to Stripe checkout in same tab (better UX, no popup blockers)
      const checkoutUrl = await createCheckoutSession(campaign.id);
      window.location.href = checkoutUrl;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create campaign. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* SEO Headers */}
      <Helmet>
        <title>Advertise with Des Moines Insider - Reach Local Audiences</title>
        <meta name="description" content="Advertise your business with Des Moines Insider. Reach thousands of locals looking for events, restaurants, and attractions in Des Moines, Iowa." />
        <meta name="keywords" content="Des Moines advertising, local marketing, Iowa business promotion, event advertising" />
        <meta property="og:title" content="Advertise with Des Moines Insider" />
        <meta property="og:description" content="Reach thousands of locals looking for events, restaurants, and attractions in Des Moines" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://desmoinesinsider.com/advertise" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Advertise with Des Moines Insider" />
        <meta name="twitter:description" content="Reach thousands of locals looking for events, restaurants, and attractions in Des Moines" />
      </Helmet>

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-secondary/10 py-16">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-bold mb-6 text-foreground">
              Advertise with Des Moines Insider
            </h1>
            <p className="text-muted-foreground text-xl md:text-2xl mb-8 leading-relaxed">
              Reach thousands of locals looking for events, restaurants, and attractions in Des Moines
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-card p-6 rounded-lg border">
                <div className="text-3xl font-bold text-primary mb-2">50K+</div>
                <div className="text-sm text-muted-foreground">Monthly Visitors</div>
              </div>
              <div className="bg-card p-6 rounded-lg border">
                <div className="text-3xl font-bold text-primary mb-2">15K+</div>
                <div className="text-sm text-muted-foreground">Newsletter Subscribers</div>
              </div>
              <div className="bg-card p-6 rounded-lg border">
                <div className="text-3xl font-bold text-primary mb-2">95%</div>
                <div className="text-sm text-muted-foreground">Local Audience</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <section className="py-12">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Campaign Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="campaign-name">Campaign Name</Label>
                  <Input
                    id="campaign-name"
                    value={campaignName}
                    onChange={(e) => setCampaignName(e.target.value)}
                    placeholder="My Awesome Campaign"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !startDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {startDate ? format(startDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={setStartDate}
                          disabled={(date) => date < new Date()}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <Label>End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "w-full justify-start text-left font-normal",
                            !endDate && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {endDate ? format(endDate, "PPP") : "Pick a date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={setEndDate}
                          disabled={(date) => date < (startDate || new Date())}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ad Placements</CardTitle>
                <CardDescription>
                  Choose where you want your ads to appear
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {PLACEMENT_OPTIONS.map((option) => {
                  const Icon = option.icon;
                  const isSelected = selectedPlacements.some(p => p.type === option.type);
                  const selectedPlacement = selectedPlacements.find(p => p.type === option.type);

                  return (
                    <div key={option.type} className="border rounded-lg p-4">
                      <div className="flex items-start space-x-3">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={(checked) =>
                            handlePlacementToggle(option.type, checked as boolean)
                          }
                        />
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Icon className="h-5 w-5 text-primary" />
                            <h3 className="font-semibold">{option.name}</h3>
                            <span className="text-sm text-muted-foreground">
                              ${option.dailyCost}/day
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {option.description}
                          </p>
                          <div className="flex flex-wrap gap-1 mb-3">
                            {option.features.map((feature) => (
                              <span
                                key={feature}
                                className="text-xs bg-muted px-2 py-1 rounded"
                              >
                                {feature}
                              </span>
                            ))}
                           </div>
                           
                           {/* Asset Requirements */}
                           <div className="bg-muted/50 p-3 rounded-md mb-3 text-xs space-y-1">
                             <h4 className="font-semibold text-sm mb-2">Asset Requirements:</h4>
                             <div className="grid grid-cols-2 gap-2">
                               <div>
                                 <span className="font-medium">Desktop:</span> {option.assetRequirements.desktop}
                               </div>
                               <div>
                                 <span className="font-medium">Mobile:</span> {option.assetRequirements.mobile}
                               </div>
                             </div>
                             <div>
                               <span className="font-medium">Formats:</span> {option.assetRequirements.formats.join(", ")}
                             </div>
                             <div>
                               <span className="font-medium">Max Size:</span> {option.assetRequirements.maxFileSize}
                             </div>
                             <div>
                               <span className="font-medium">Animation:</span> {option.assetRequirements.animationType}
                             </div>
                           </div>

                           {/* Design Specifications */}
                           <div className="space-y-1">
                             <h4 className="font-semibold text-xs">Design Guidelines:</h4>
                             <ul className="text-xs text-muted-foreground space-y-0.5">
                               {option.specifications.map((spec, index) => (
                                 <li key={index} className="flex items-start">
                                   <span className="text-primary mr-1">•</span>
                                   {spec}
                                 </li>
                               ))}
                             </ul>
                           </div>
                          {isSelected && (
                            <div className="flex items-center space-x-2">
                              <Label htmlFor={`days-${option.type}`} className="text-sm">
                                Days:
                              </Label>
                              <Input
                                id={`days-${option.type}`}
                                type="number"
                                min="1"
                                max="365"
                                value={selectedPlacement?.days || 7}
                                onChange={(e) =>
                                  handleDaysChange(option.type, parseInt(e.target.value) || 1)
                                }
                                className="w-20"
                              />
                              <span className="text-sm text-muted-foreground">
                                = ${(selectedPlacement?.days || 7) * option.dailyCost}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          <div>
            <Card className="sticky top-8">
              <CardHeader>
                <CardTitle>Campaign Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Campaign Name:</span>
                    <span>{campaignName || "Not set"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Start Date:</span>
                    <span>{startDate ? format(startDate, "MMM dd, yyyy") : "Not set"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>End Date:</span>
                    <span>{endDate ? format(endDate, "MMM dd, yyyy") : "Not set"}</span>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-2">Selected Placements:</h4>
                  {selectedPlacements.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No placements selected</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedPlacements.map((placement) => {
                        const option = PLACEMENT_OPTIONS.find(opt => opt.type === placement.type);
                        return (
                          <div key={placement.type} className="flex justify-between text-sm">
                            <span>
                              {option?.name} ({placement.days} days)
                            </span>
                            <span>${(option?.dailyCost || 0) * placement.days}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <div className="flex justify-between font-semibold text-lg">
                    <span>Total Cost:</span>
                    <span>${calculateTotalCost()}</span>
                  </div>
                </div>

                {!user && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                    <p className="text-sm text-blue-900">
                      <strong>Note:</strong> You'll need to log in or create a free account to complete your purchase.
                    </p>
                  </div>
                )}

                <Button
                  onClick={handleCreateCampaign}
                  disabled={isLoading || selectedPlacements.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? "Creating..." : user ? "Create Campaign & Pay" : "Continue to Login"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  {user ? "After payment, you'll be able to upload your creative assets and manage your campaign." : "Creating an account is free and takes less than 2 minutes."}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
          </div>
        </div>
      </section>

      {/* Additional Information Sections */}
      <section className="py-12 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-8">
            
            {/* Asset Upload Process */}
            <Card>
              <CardHeader>
                <CardTitle>Asset Upload & Approval Process</CardTitle>
                <CardDescription>What happens after you create your campaign</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="text-center p-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-primary font-bold">1</span>
                    </div>
                    <h4 className="font-semibold mb-2">Payment & Setup</h4>
                    <p className="text-sm text-muted-foreground">Complete payment and receive campaign dashboard access within 5 minutes.</p>
                  </div>
                  <div className="text-center p-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-primary font-bold">2</span>
                    </div>
                    <h4 className="font-semibold mb-2">Upload Assets</h4>
                    <p className="text-sm text-muted-foreground">Upload your creative assets and provide ad copy, URLs, and targeting preferences.</p>
                  </div>
                  <div className="text-center p-4">
                    <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <span className="text-primary font-bold">3</span>
                    </div>
                    <h4 className="font-semibold mb-2">Review & Launch</h4>
                    <p className="text-sm text-muted-foreground">Our team reviews (24 hours) and launches your campaign on the scheduled start date.</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Technical Requirements */}
            <Card>
              <CardHeader>
                <CardTitle>Technical Requirements & Best Practices</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">File Requirements:</h4>
                    <ul className="text-sm space-y-2">
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        RGB color space (not CMYK)
                      </li>
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        72 DPI for web (300 DPI for print-quality assets)
                      </li>
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        No embedded fonts or special effects
                      </li>
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        All text must be readable at actual display size
                      </li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Content Guidelines:</h4>
                    <ul className="text-sm space-y-2">
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        Family-friendly content only
                      </li>
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        Des Moines area businesses preferred
                      </li>
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        Clear, honest messaging (no misleading claims)
                      </li>
                      <li className="flex items-start">
                        <span className="text-primary mr-2">•</span>
                        Include valid landing page URL
                      </li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Performance Tracking */}
            <Card>
              <CardHeader>
                <CardTitle>Campaign Performance & Analytics</CardTitle>
                <CardDescription>Track your advertising success</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-4 gap-4 text-center">
                  <div className="p-3">
                    <h4 className="font-semibold text-primary mb-1">Impressions</h4>
                    <p className="text-xs text-muted-foreground">Total ad views</p>
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-primary mb-1">Clicks</h4>
                    <p className="text-xs text-muted-foreground">Ad interactions</p>
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-primary mb-1">CTR</h4>
                    <p className="text-xs text-muted-foreground">Click-through rate</p>
                  </div>
                  <div className="p-3">
                    <h4 className="font-semibold text-primary mb-1">Demographics</h4>
                    <p className="text-xs text-muted-foreground">Audience insights</p>
                  </div>
                </div>
                <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm">
                    <strong>Real-time Dashboard:</strong> Access detailed analytics 24/7 through your campaign dashboard. 
                    Reports are updated every hour and include geographic data, device types, and engagement metrics.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Contact & Support */}
            <Card>
              <CardHeader>
                <CardTitle>Support & Contact</CardTitle>
                <CardDescription>Questions about advertising with Des Moines Insider?</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-semibold mb-3">Campaign Support:</h4>
                    <div className="space-y-2 text-sm">
                      <p><strong>Response Time:</strong> Within 4 business hours</p>
                      <p><strong>Phone:</strong> (515) 555-0123</p>
                      <p><strong>Email:</strong> advertising@desmoinesinsider.com</p>
                      <p><strong>Hours:</strong> Mon-Fri 8AM-6PM CST</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3">Custom Solutions:</h4>
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>Need a larger campaign or custom placement? Our team can create specialized advertising packages for:</p>
                      <ul className="mt-2 space-y-1">
                        <li>• Event sponsorships</li>
                        <li>• Newsletter placements</li>
                        <li>• Social media packages</li>
                        <li>• Multi-month campaigns</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      </section>
    </div>
  );
}