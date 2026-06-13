import React, { useState } from 'react';
import { createLogger } from '@/lib/logger';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

const log = createLogger('TripPlanner');
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import SEOHead from "@/components/SEOHead";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useTripPlanner, TripPlan, TripPreferences } from "@/hooks/useTripPlanner";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { format, addDays, differenceInDays } from "date-fns";
import { EmailCaptureModal } from "@/components/EmailCaptureModal";
import { FAQSection } from "@/components/FAQSection";
import { useSubscription } from "@/hooks/useSubscription";
import { PremiumGate } from "@/components/PremiumGate";
import { PaywallModal } from "@/components/PaywallModal";
import { AIDisclosureNotice } from "@/components/AIDisclosureBadge";
import { ItineraryDays } from "@/components/trip/ItineraryDays";
import { TripCalendarMenu } from "@/components/trip/TripCalendarMenu";
import { TripShareDialog } from "@/components/trip/TripShareDialog";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import {
  Calendar,
  Clock,
  DollarSign,
  Users,
  Sparkles,
  ArrowRight,
  Trash2,
  Share2,
  Check,
  Lightbulb,
  Utensils,
  Music,
  TreePine,
  Palette,
  Baby,
  Loader2,
  AlertCircle,
  Download,
  Crown,
} from "lucide-react";

export default function TripPlanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    tripPlans,
    isLoadingTrips,
    tripsError,
    refetchTrips,
    selectedTrip,
    setSelectedTrip,
    fetchTripDetails,
    generateItinerary,
    isGenerating,
    deleteTrip,
    shareTrip,
    isSharing,
    reorderItems,
    getTripQuota,
    getItemsByDay,
    interests,
    budgetOptions,
    paceOptions,
  } = useTripPlanner();
  const { tier } = useSubscription();

  // Form state
  const [startDate, setStartDate] = useState(format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(addDays(new Date(), 9), 'yyyy-MM-dd'));
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [budget, setBudget] = useState<'budget' | 'moderate' | 'splurge' | 'any'>('moderate');
  const [pace, setPace] = useState<'relaxed' | 'moderate' | 'packed'>('moderate');
  const [groupSize, setGroupSize] = useState(2);
  const [hasChildren, setHasChildren] = useState(false);
  const [childAges, setChildAges] = useState<string>('');
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([]);
  const [accessibilityNeeds, setAccessibilityNeeds] = useState<string[]>([]);
  const [showEmailCapture, setShowEmailCapture] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [generationError, setGenerationError] = useState<unknown>(null);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [shareDialog, setShareDialog] = useState<{ url: string; title: string } | null>(null);

  const numDays = differenceInDays(new Date(endDate), new Date(startDate)) + 1;

  // Quota meter — mirrors the server-side monthly count (Insider 5 / VIP unlimited).
  const quota = getTripQuota(tier);
  // Insider at their monthly cap should upsell to VIP rather than just fail.
  const atQuotaLimit = quota.atLimit;

  const handleGenerateItinerary = async () => {
    if (!user) {
      navigate('/auth?redirect=/trip-planner');
      return;
    }

    // Out of monthly generations — surface the contextual paywall (upgrade to VIP).
    if (atQuotaLimit) {
      setPaywallOpen(true);
      return;
    }

    setGenerationError(null);
    const preferences: TripPreferences = {
      interests: selectedInterests,
      budget,
      pace,
      groupSize,
      hasChildren,
      childAges: hasChildren && childAges ? childAges.split(',').map(a => parseInt(a.trim())).filter(a => !isNaN(a)) : [],
      dietaryRestrictions,
      accessibilityNeeds,
    };

    try {
      await generateItinerary({ startDate, endDate, preferences });
      // Show email capture after successful generation
      setShowEmailCapture(true);
    } catch (error) {
      log.error('generateItinerary', 'Error generating itinerary', { error });
      // A quota/upgrade response from the server opens the paywall instead of an
      // error card; everything else surfaces as a retryable generation error.
      const code = (error as { code?: string })?.code;
      if (code === 'quota_exceeded' || code === 'upgrade_required') {
        setPaywallOpen(true);
      } else {
        setGenerationError(error);
      }
    }
  };

  const handleViewTrip = async (trip: TripPlan) => {
    const fullTrip = await fetchTripDetails(trip.id);
    if (fullTrip) {
      setSelectedTrip(fullTrip);
    }
  };

  // Make the trip public (if needed) and open the share dialog (copy + native share).
  const handleShare = async () => {
    if (!selectedTrip) return;
    try {
      let code = selectedTrip.share_code;
      if (!selectedTrip.is_public || !code) {
        code = await shareTrip(selectedTrip.id);
        setSelectedTrip({ ...selectedTrip, is_public: true, share_code: code });
      }
      if (!code) return;
      setShareDialog({
        url: `${window.location.origin}/trips/shared/${code}`,
        title: selectedTrip.title,
      });
    } catch (error) {
      log.error('handleShare', 'Failed to share trip', { error });
    }
  };

  // Move an itinerary item up/down within its day, persisting the new order.
  // Applies an optimistic local update; the hook reverts on persist failure.
  const handleMoveItem = async (item: TripPlanItem, direction: 'up' | 'down') => {
    if (!selectedTrip?.items) return;
    const dayItems = selectedTrip.items
      .filter((i) => i.day_number === item.day_number)
      .sort((a, b) => a.order_index - b.order_index);
    const idx = dayItems.findIndex((i) => i.item_id === item.item_id);
    const swapWith = direction === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapWith < 0 || swapWith >= dayItems.length) return;

    // Swap order_index between the two adjacent items.
    const a = dayItems[idx];
    const b = dayItems[swapWith];
    const updates = [
      { item_id: a.item_id, order_index: b.order_index },
      { item_id: b.item_id, order_index: a.order_index },
    ];
    const updatedItems = selectedTrip.items.map((i) => {
      const u = updates.find((x) => x.item_id === i.item_id);
      return u ? { ...i, order_index: u.order_index } : i;
    });
    setSelectedTrip({ ...selectedTrip, items: updatedItems });
    setReordering(true);
    try {
      await reorderItems({ items: updates });
    } finally {
      setReordering(false);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const interestIcons: Record<string, React.ReactNode> = {
    music: <Music className="h-4 w-4" />,
    food: <Utensils className="h-4 w-4" />,
    outdoors: <TreePine className="h-4 w-4" />,
    arts: <Palette className="h-4 w-4" />,
    family: <Baby className="h-4 w-4" />,
  };

  return (
    <>
      <SEOHead
        title="AI Trip Planner - Des Moines Insider"
        description="Plan your perfect Des Moines trip with our AI-powered itinerary builder. Get personalized multi-day plans based on your interests, budget, and pace."
        keywords={["Des Moines trip planner", "itinerary builder", "AI travel planner", "Des Moines vacation", "Iowa trip planning"]}
      />

      <div className="min-h-screen bg-background">
        <Header />

        <div className="container mx-auto px-4 py-8">
          <Breadcrumbs
            className="mb-4"
            items={[
              { label: "Home", href: "/" },
              { label: "Trip Planner" },
            ]}
          />

          {/* Page Header */}
          <div className="text-center space-y-4 mb-8">
            <div className="flex items-center justify-center gap-2">
              <Sparkles className="h-8 w-8 text-primary" />
              <h1 className="text-3xl md:text-4xl font-bold">AI Trip Planner</h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Let our AI create a personalized Des Moines itinerary just for you. Tell us your dates,
              interests, and preferences, and we'll plan the perfect trip.
            </p>
          </div>

          {/* AI transparency notice (EU AI Act Art. 50, Colorado AI Act, CA AB 2013) */}
          <div className="max-w-3xl mx-auto mb-6">
            <AIDisclosureNotice title="How your itinerary is generated">
              <p className="text-muted-foreground leading-snug">
                Your itinerary is generated by an AI model using public information
                about Des Moines events, restaurants, and attractions plus the
                preferences you share below. AI output may be inaccurate or
                incomplete — please confirm hours, prices, and reservations with
                each venue before you go. Nothing here is a paid endorsement
                unless clearly labeled as such.
              </p>
            </AIDisclosureNotice>
          </div>

          <PremiumGate
            feature="trip_planner"
            requiredTier="insider"
            mode="lock"
            title="AI Trip Planner"
            description="Plan your perfect Des Moines trip with AI-powered itineraries. Insider members get 5 trips/month, VIP gets unlimited."
          >
          <Tabs defaultValue={selectedTrip ? "itinerary" : "plan"} className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 max-w-md mx-auto">
              <TabsTrigger value="plan">Plan Trip</TabsTrigger>
              <TabsTrigger value="itinerary" disabled={!selectedTrip}>
                Itinerary
              </TabsTrigger>
              <TabsTrigger value="my-trips">My Trips</TabsTrigger>
            </TabsList>

            {/* Plan Trip Tab */}
            <TabsContent value="plan" className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Date Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Calendar className="h-5 w-5" />
                      Trip Dates
                    </CardTitle>
                    <CardDescription>When are you visiting Des Moines?</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="start-date">Start Date</Label>
                        <Input
                          id="start-date"
                          type="date"
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                          min={format(new Date(), 'yyyy-MM-dd')}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="end-date">End Date</Label>
                        <Input
                          id="end-date"
                          type="date"
                          value={endDate}
                          onChange={(e) => setEndDate(e.target.value)}
                          min={startDate}
                        />
                      </div>
                    </div>
                    {numDays > 0 && (
                      <p className="text-sm text-muted-foreground">
                        {numDays} day{numDays !== 1 ? 's' : ''} trip
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Group Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Who's Going?
                    </CardTitle>
                    <CardDescription>Tell us about your group</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="group-size">Group Size</Label>
                      <Select value={groupSize.toString()} onValueChange={(v) => setGroupSize(parseInt(v))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 10, 15, 20].map(n => (
                            <SelectItem key={n} value={n.toString()}>
                              {n} {n === 1 ? 'person' : 'people'}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="has-children"
                        checked={hasChildren}
                        onCheckedChange={(checked) => setHasChildren(checked === true)}
                      />
                      <Label htmlFor="has-children">Traveling with children</Label>
                    </div>

                    {hasChildren && (
                      <div className="space-y-2">
                        <Label htmlFor="child-ages">Children's ages (comma-separated)</Label>
                        <Input
                          id="child-ages"
                          placeholder="e.g., 5, 8, 12"
                          value={childAges}
                          onChange={(e) => setChildAges(e.target.value)}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Interests */}
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      Your Interests
                    </CardTitle>
                    <CardDescription>What kind of activities do you enjoy?</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {interests.map((interest) => (
                        <Button
                          key={interest.value}
                          variant={selectedInterests.includes(interest.value) ? "default" : "outline"}
                          size="sm"
                          onClick={() => toggleInterest(interest.value)}
                          className="gap-2"
                        >
                          {interestIcons[interest.value] || <Sparkles className="h-4 w-4" />}
                          {interest.label}
                        </Button>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Budget */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <DollarSign className="h-5 w-5" />
                      Budget
                    </CardTitle>
                    <CardDescription>What's your spending comfort level?</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {budgetOptions.map((option) => (
                      <div
                        key={option.value}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          budget === option.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setBudget(option.value as any)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{option.label}</span>
                          {budget === option.value && <Check className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                {/* Pace */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Trip Pace
                    </CardTitle>
                    <CardDescription>How packed do you want your days?</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {paceOptions.map((option) => (
                      <div
                        key={option.value}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          pace === option.value
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:border-primary/50'
                        }`}
                        onClick={() => setPace(option.value as any)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{option.label}</span>
                          {pace === option.value && <Check className="h-4 w-4 text-primary" />}
                        </div>
                        <p className="text-sm text-muted-foreground">{option.description}</p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>

              {/* Monthly quota meter (Insider 5 / VIP unlimited) */}
              {user && (
                <Card>
                  <CardContent className="pt-6">
                    {quota.isUnlimited ? (
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <Crown className="h-5 w-5 text-purple-500" />
                          <span className="font-medium">Unlimited AI trips</span>
                        </div>
                        <Badge className="bg-gradient-to-r from-purple-500 to-pink-500">VIP</Badge>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium">AI trips this month</span>
                          <span className="text-muted-foreground">
                            {quota.used} / {quota.limit} used
                          </span>
                        </div>
                        <Progress
                          value={quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0}
                          aria-label={`${quota.used} of ${quota.limit} monthly AI trips used`}
                        />
                        {atQuotaLimit ? (
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
                            <p className="text-sm text-muted-foreground">
                              You've used all {quota.limit} trips included this month.
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setPaywallOpen(true)}
                              className="gap-1"
                            >
                              <Crown className="h-4 w-4 text-purple-500" />
                              Upgrade to VIP
                            </Button>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            {quota.remaining === 'unlimited' ? '' : `${quota.remaining} remaining this month`}
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Generation failure (WEB-UX-002 error state, retryable) */}
              {generationError ? (
                <ErrorState
                  error={generationError}
                  onRetry={handleGenerateItinerary}
                  title="Couldn't generate your itinerary"
                  description="The AI planner had trouble building your trip. This is usually temporary — please try again."
                  retryLabel="Try again"
                />
              ) : null}

              {/* Generate Button */}
              <Card className="border-primary/50 bg-gradient-to-r from-primary/5 to-primary/10">
                <CardContent className="pt-6">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-center md:text-left">
                      <h3 className="text-lg font-semibold">Ready to plan your trip?</h3>
                      <p className="text-sm text-muted-foreground">
                        Our AI will create a personalized {numDays}-day itinerary based on your preferences.
                      </p>
                    </div>
                    <Button
                      size="lg"
                      onClick={handleGenerateItinerary}
                      disabled={isGenerating || numDays < 1}
                      className="gap-2 min-w-[200px]"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="h-5 w-5 animate-spin" />
                          Generating...
                        </>
                      ) : atQuotaLimit ? (
                        <>
                          <Crown className="h-5 w-5" />
                          Upgrade for more trips
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-5 w-5" />
                          Generate Itinerary
                        </>
                      )}
                    </Button>
                  </div>
                  {!user && (
                    <Alert className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        <Link to="/auth?redirect=/trip-planner" className="underline">
                          Sign in
                        </Link>{' '}
                        to save your itinerary and access it later.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Itinerary Tab */}
            <TabsContent value="itinerary">
              {selectedTrip ? (
                <div className="space-y-6">
                  {/* Trip Header */}
                  <Card>
                    <CardHeader>
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div>
                          <CardTitle className="text-2xl">{selectedTrip.title}</CardTitle>
                          <CardDescription className="mt-2">
                            {selectedTrip.description}
                          </CardDescription>
                          <div className="flex flex-wrap gap-2 mt-4">
                            <Badge variant="outline">
                              <Calendar className="h-3 w-3 mr-1" />
                              {format(new Date(selectedTrip.start_date), 'MMM d')} -{' '}
                              {format(new Date(selectedTrip.end_date), 'MMM d, yyyy')}
                            </Badge>
                            {selectedTrip.total_estimated_cost && (
                              <Badge variant="outline">
                                <DollarSign className="h-3 w-3 mr-1" />
                                {selectedTrip.total_estimated_cost}
                              </Badge>
                            )}
                            {selectedTrip.ai_generated && (
                              <Badge className="bg-gradient-to-r from-purple-500 to-pink-500">
                                <Sparkles className="h-3 w-3 mr-1" />
                                AI Generated
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {selectedTrip.items && selectedTrip.items.length > 0 && (
                            <TripCalendarMenu trip={selectedTrip} items={selectedTrip.items} />
                          )}
                          <Button variant="outline" size="sm" onClick={handleShare} disabled={isSharing}>
                            <Share2 className="h-4 w-4 mr-1" />
                            {isSharing ? 'Sharing…' : 'Share'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => deleteTrip(selectedTrip.id).then(() => setSelectedTrip(null))}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                  </Card>

                  {/* Itinerary Days (reorderable) + lazy map preview */}
                  <ItineraryDays
                    trip={selectedTrip}
                    items={selectedTrip.items || []}
                    getItemsByDay={getItemsByDay}
                    editable
                    onMoveItem={handleMoveItem}
                    reordering={reordering}
                  />
                  {selectedTrip.items && selectedTrip.items.length > 0 && (
                    <p className="text-xs text-muted-foreground text-center">
                      Use the arrows on each activity to reorder your day. Changes save automatically.
                    </p>
                  )}

                  {/* Tips and Packing List */}
                  {(selectedTrip.tips || selectedTrip.packingList) && (
                    <div className="grid md:grid-cols-2 gap-6">
                      {selectedTrip.tips && selectedTrip.tips.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Lightbulb className="h-5 w-5" />
                              Trip Tips
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-2">
                              {selectedTrip.tips.map((tip, idx) => (
                                <li key={idx} className="flex items-start gap-2 text-sm">
                                  <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                                  {tip}
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                      {selectedTrip.packingList && selectedTrip.packingList.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                              <Download className="h-5 w-5" />
                              Packing List
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <ul className="space-y-2">
                              {selectedTrip.packingList.map((item, idx) => (
                                <li key={idx} className="flex items-center gap-2 text-sm">
                                  <Checkbox id={`pack-${idx}`} />
                                  <label htmlFor={`pack-${idx}`}>{item}</label>
                                </li>
                              ))}
                            </ul>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <Card className="text-center py-12">
                  <CardContent>
                    <Sparkles className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No itinerary selected</h3>
                    <p className="text-muted-foreground mb-4">
                      Generate a new itinerary or select one from your saved trips.
                    </p>
                    <Button onClick={() => document.querySelector('[value="plan"]')?.click()}>
                      Plan a Trip
                    </Button>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* My Trips Tab */}
            <TabsContent value="my-trips">
              {!user ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Sign in to see your trips</h3>
                    <p className="text-muted-foreground mb-4">
                      Create an account to save and manage your itineraries.
                    </p>
                    <Button asChild>
                      <Link to="/auth?redirect=/trip-planner">Sign In</Link>
                    </Button>
                  </CardContent>
                </Card>
              ) : isLoadingTrips ? (
                <div className="space-y-4">
                  {[1, 2, 3].map(i => (
                    <Card key={i}>
                      <CardContent className="p-6">
                        <Skeleton className="h-6 w-48 mb-2" />
                        <Skeleton className="h-4 w-full mb-4" />
                        <Skeleton className="h-4 w-32" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : tripsError ? (
                <ErrorState error={tripsError} onRetry={() => refetchTrips()} resourceLabel="your trips" />
              ) : tripPlans.length === 0 ? (
                <Card className="text-center py-12">
                  <CardContent>
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">No trips yet</h3>
                    <p className="text-muted-foreground mb-4">
                      Start planning your first Des Moines adventure!
                    </p>
                    <Button onClick={() => document.querySelector('[value="plan"]')?.click()}>
                      Plan Your First Trip
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tripPlans.map(trip => (
                    <Card
                      key={trip.id}
                      className="cursor-pointer hover:shadow-lg transition-shadow"
                      onClick={() => handleViewTrip(trip)}
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <CardTitle className="text-lg line-clamp-1">{trip.title}</CardTitle>
                          {trip.ai_generated && (
                            <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 shrink-0">
                              <Sparkles className="h-3 w-3" />
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="line-clamp-2">
                          {trip.description}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(trip.start_date), 'MMM d')} -{' '}
                            {format(new Date(trip.end_date), 'MMM d')}
                          </span>
                          {trip.total_estimated_cost && (
                            <span className="flex items-center gap-1">
                              <DollarSign className="h-3 w-3" />
                              {trip.total_estimated_cost}
                            </span>
                          )}
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-between">
                        <Badge variant="secondary">{trip.status}</Badge>
                        <Button size="sm" variant="ghost">
                          View <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
          </PremiumGate>
        </div>

        {/* FAQ Section */}
        <section className="py-16 bg-muted/30" aria-labelledby="trip-faq-heading">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
            <FAQSection
              title="AI Trip Planner - Frequently Asked Questions"
              description="Common questions about planning your Des Moines trip with our AI assistant."
              faqs={[
                {
                  question: "How does the AI Trip Planner work?",
                  answer: "Our AI Trip Planner uses advanced AI to create personalized Des Moines itineraries based on your preferences, travel dates, group size, and interests. Simply tell us what you enjoy and we'll suggest the best restaurants, events, attractions, and activities for your visit."
                },
                {
                  question: "Is the AI Trip Planner free to use?",
                  answer: "The AI Trip Planner is available to Insider subscribers ($4.99/month) with 5 trips per month, and VIP subscribers ($12.99/month) with unlimited trips. Start with a 7-day free trial to try it out! Premium subscribers also get detailed time-block scheduling and restaurant reservation suggestions."
                },
                {
                  question: "What is the best time to visit Des Moines?",
                  answer: "Des Moines is great year-round! Summer (June-August) offers the Iowa State Fair, outdoor festivals, and farmers markets. Fall (September-October) features beautiful foliage and harvest festivals. Spring brings the Drake Relays and blooming botanical gardens. Winter has holiday markets, indoor attractions, and cozy dining experiences."
                },
                {
                  question: "How many days should I plan for a Des Moines trip?",
                  answer: "A 2-3 day trip covers the highlights: downtown dining, Pappajohn Sculpture Park, Science Center of Iowa, and the East Village. For a deeper experience including day trips to nearby attractions like Adventureland or the Bridges of Madison County, plan 4-5 days."
                },
                {
                  question: "Can I customize my AI-generated itinerary?",
                  answer: "Absolutely! After the AI generates your itinerary, you can swap activities, adjust timing, add your own stops, and save multiple versions. The itinerary is fully editable and can be exported to your calendar or printed as a checklist."
                }
              ]}
              showSchema={true}
              className="border-0 shadow-lg"
            />
          </div>
        </section>

        <Footer />
        <EmailCaptureModal
          open={showEmailCapture}
          onOpenChange={setShowEmailCapture}
          source="trip_planner"
        />
        {/* Contextual paywall — Insider at their monthly cap upsells to VIP. */}
        <PaywallModal
          open={paywallOpen}
          onOpenChange={setPaywallOpen}
          context="trip_planner"
          requiredTier="vip"
        />
        {shareDialog && (
          <TripShareDialog
            open={!!shareDialog}
            onOpenChange={(open) => !open && setShareDialog(null)}
            url={shareDialog.url}
            title={shareDialog.title}
          />
        )}
      </div>
    </>
  );
}
