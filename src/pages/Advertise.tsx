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
  },
  {
    type: "featured_spot" as const,
    name: "Featured Spot",
    description: "Highlighted placement in search results",
    dailyCost: 5,
    icon: Eye,
    features: ["1st or 2nd position", "Event listings", "High engagement"],
  },
  {
    type: "below_fold" as const,
    name: "Below the Fold",
    description: "Cost-effective placement in content areas",
    dailyCost: 5,
    icon: Target,
    features: ["Content integration", "Targeted audience", "Great value"],
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

  if (!user) {
    return (
      <div className="container mx-auto px-4 py-8">
        <Card className="max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Login Required</CardTitle>
            <CardDescription>
              Please log in to create advertising campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/auth")} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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

      const checkoutUrl = await createCheckoutSession(campaign.id);
      window.open(checkoutUrl, '_blank');
      
      toast({
        title: "Campaign Created!",
        description: "Redirecting to payment...",
      });
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

                <Button
                  onClick={handleCreateCampaign}
                  disabled={isLoading || selectedPlacements.length === 0}
                  className="w-full"
                  size="lg"
                >
                  {isLoading ? "Creating..." : "Create Campaign & Pay"}
                </Button>

                <p className="text-xs text-muted-foreground text-center">
                  After payment, you'll be able to upload your creative assets and manage your campaign.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
          </div>
        </div>
      </section>
    </div>
  );
}