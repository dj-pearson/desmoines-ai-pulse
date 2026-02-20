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
import { useTripPlanner, TripPlan, TripPlanItem, TripPreferences } from "@/hooks/useTripPlanner";
import { useAuth } from "@/hooks/useAuth";
import { Link, useNavigate } from "react-router-dom";
import { format, addDays, differenceInDays } from "date-fns";
import {
  Calendar,
  MapPin,
  Clock,
  DollarSign,
  Users,
  Sparkles,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  Trash2,
  Edit2,
  Share2,
  Copy,
  Check,
  Plus,
  Lightbulb,
  Utensils,
  Music,
  TreePine,
  Palette,
  Baby,
  Car,
  Coffee,
  Loader2,
  ExternalLink,
  AlertCircle,
  Download,
} from "lucide-react";

export default function TripPlanner() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const {
    tripPlans,
    isLoadingTrips,
    selectedTrip,
    setSelectedTrip,
    fetchTripDetails,
    generateItinerary,
    isGenerating,
    updateTrip,
    deleteTrip,
    shareTrip,
    getItemsByDay,
    interests,
    budgetOptions,
    paceOptions,
  } = useTripPlanner();

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
  const [expandedDays, setExpandedDays] = useState<Record<number, boolean>>({});

  const numDays = differenceInDays(new Date(endDate), new Date(startDate)) + 1;

  const handleGenerateItinerary = async () => {
    if (!user) {
      navigate('/auth?redirect=/trip-planner');
      return;
    }

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
    } catch (error) {
      log.error('generateItinerary', 'Error generating itinerary', { error });
    }
  };

  const handleViewTrip = async (trip: TripPlan) => {
    const fullTrip = await fetchTripDetails(trip.id);
    if (fullTrip) {
      setSelectedTrip(fullTrip);
    }
  };

  const toggleDay = (day: number) => {
    setExpandedDays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const getItemIcon = (itemType: string) => {
    switch (itemType) {
      case 'event': return <Music className="h-4 w-4" />;
      case 'restaurant': return <Utensils className="h-4 w-4" />;
      case 'attraction': return <MapPin className="h-4 w-4" />;
      case 'transport': return <Car className="h-4 w-4" />;
      case 'break': return <Coffee className="h-4 w-4" />;
      default: return <Calendar className="h-4 w-4" />;
    }
  };

  const getItemTypeColor = (itemType: string) => {
    switch (itemType) {
      case 'event': return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'restaurant': return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200';
      case 'attraction': return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'transport': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'break': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      default: return 'bg-gray-100 text-gray-800';
    }
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
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => shareTrip(selectedTrip.id)}>
                            <Share2 className="h-4 w-4 mr-1" />
                            Share
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

                  {/* Itinerary Days */}
                  {selectedTrip.items && selectedTrip.items.length > 0 ? (
                    <div className="space-y-4">
                      {Object.entries(getItemsByDay(selectedTrip.items)).map(([day, items]) => {
                        const dayNum = parseInt(day);
                        const dayDate = addDays(new Date(selectedTrip.start_date), dayNum - 1);
                        const isExpanded = expandedDays[dayNum] !== false;

                        return (
                          <Card key={day}>
                            <CardHeader
                              className="cursor-pointer"
                              onClick={() => toggleDay(dayNum)}
                            >
                              <div className="flex items-center justify-between">
                                <CardTitle className="text-lg flex items-center gap-2">
                                  {isExpanded ? (
                                    <ChevronDown className="h-5 w-5" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5" />
                                  )}
                                  Day {day}: {format(dayDate, 'EEEE, MMMM d')}
                                </CardTitle>
                                <Badge variant="secondary">
                                  {items.length} {items.length === 1 ? 'activity' : 'activities'}
                                </Badge>
                              </div>
                            </CardHeader>
                            {isExpanded && (
                              <CardContent>
                                <div className="space-y-4">
                                  {items
                                    .sort((a, b) => a.order_index - b.order_index)
                                    .map((item, idx) => (
                                      <div
                                        key={item.item_id}
                                        className="flex gap-4 p-4 rounded-lg border bg-card"
                                      >
                                        <div className="flex flex-col items-center">
                                          <div className={`p-2 rounded-full ${getItemTypeColor(item.item_type)}`}>
                                            {getItemIcon(item.item_type)}
                                          </div>
                                          {idx < items.length - 1 && (
                                            <div className="w-px h-full bg-border mt-2" />
                                          )}
                                        </div>
                                        <div className="flex-1 space-y-2">
                                          <div className="flex items-start justify-between">
                                            <div>
                                              <h4 className="font-medium">{item.title}</h4>
                                              {item.start_time && (
                                                <p className="text-sm text-muted-foreground flex items-center gap-1">
                                                  <Clock className="h-3 w-3" />
                                                  {item.start_time}
                                                  {item.end_time && ` - ${item.end_time}`}
                                                  {item.duration_minutes && (
                                                    <span className="text-xs">
                                                      ({item.duration_minutes} min)
                                                    </span>
                                                  )}
                                                </p>
                                              )}
                                            </div>
                                            {item.estimated_cost && (
                                              <Badge variant="outline">
                                                {item.estimated_cost}
                                              </Badge>
                                            )}
                                          </div>
                                          {item.location && (
                                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                              <MapPin className="h-3 w-3" />
                                              {item.location}
                                            </p>
                                          )}
                                          {item.description && (
                                            <p className="text-sm">{item.description}</p>
                                          )}
                                          {item.ai_reason && (
                                            <p className="text-sm text-primary/80 italic flex items-start gap-1">
                                              <Lightbulb className="h-3 w-3 mt-0.5 shrink-0" />
                                              {item.ai_reason}
                                            </p>
                                          )}
                                          {item.notes && (
                                            <p className="text-sm text-muted-foreground bg-muted p-2 rounded">
                                              {item.notes}
                                            </p>
                                          )}
                                          {item.content_details && (
                                            <Link
                                              to={`/${item.content_details.type}s/${item.content_details.id}`}
                                              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                                            >
                                              View details
                                              <ExternalLink className="h-3 w-3" />
                                            </Link>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                </div>
                              </CardContent>
                            )}
                          </Card>
                        );
                      })}
                    </div>
                  ) : (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        No itinerary items found. Try generating a new itinerary.
                      </AlertDescription>
                    </Alert>
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
        </div>

        <Footer />
      </div>
    </>
  );
}
