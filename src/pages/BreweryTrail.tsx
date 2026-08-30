import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useBreweries, useBreweryCheckins, useCheckinMutation } from '@/hooks/useBreweryTrail';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Beer, CheckCircle2, Circle, Star, Trophy } from "lucide-react";
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SpriteIcon } from "@/components/ui/SpriteIcon";

export default function BreweryTrail() {
  const { user } = useAuth();
  const { data: breweries, isLoading } = useBreweries();
  const { data: checkins } = useBreweryCheckins();
  const checkinMutation = useCheckinMutation();
  const [checkinBreweryId, setCheckinBreweryId] = useState<string | null>(null);
  const [beerName, setBeerName] = useState('');
  const [rating, setRating] = useState(0);

  const checkedInIds = new Set(checkins?.map((c) => c.restaurant_id) || []);
  const totalBreweries = breweries?.length || 0;
  const visitedCount = checkedInIds.size;
  const progress = totalBreweries > 0 ? Math.round((visitedCount / totalBreweries) * 100) : 0;

  const handleCheckin = async () => {
    if (!checkinBreweryId) return;
    try {
      await checkinMutation.mutateAsync({
        restaurantId: checkinBreweryId,
        beerName: beerName || undefined,
        rating: rating > 0 ? rating : undefined,
      });
      toast.success('Checked in! +40 XP');
      setCheckinBreweryId(null);
      setBeerName('');
      setRating(0);
    } catch {
      toast.error('Failed to check in. Are you logged in?');
    }
  };

  return (
    <>
      <Helmet>
        <title>Des Moines Brewery Trail — Craft Beer Passport | Des Moines Insider</title>
        <meta name="description" content="Explore the Des Moines craft beer scene with our Brewery Trail. Visit local breweries, check in, earn rewards, and complete the trail." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-amber-500/10 text-amber-600 dark:text-amber-400 px-4 py-2 rounded-full mb-4">
              <Beer className="h-5 w-5" />
              <span className="font-semibold">Craft Beer Trail</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Des Moines Brewery Trail
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Explore Des Moines&apos; thriving craft beer scene. Check in at local breweries, track your progress, and earn rewards for completing the trail.
            </p>
          </div>

          {/* Progress / Passport */}
          {user && (
            <Card className="mb-10 border-amber-500/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-amber-500" />
                    <h2 className="text-xl font-bold">Your Brewery Passport</h2>
                  </div>
                  <Badge variant="outline" className="text-lg px-3 py-1">
                    {visitedCount} / {totalBreweries}
                  </Badge>
                </div>
                <div className="w-full bg-muted rounded-full h-4 mb-2">
                  <div
                    className="bg-amber-500 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  {progress === 100
                    ? 'You completed the trail! You are a Des Moines Brewmaster!'
                    : `${progress}% complete — visit ${totalBreweries - visitedCount} more to complete the trail`}
                </p>
              </CardContent>
            </Card>
          )}

          {/* Brewery Grid */}
          <section>
            <h2 className="text-2xl font-bold mb-4">Breweries on the Trail</h2>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 9 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-lg" />
                ))}
              </div>
            ) : breweries && breweries.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {breweries.map((brewery) => {
                  const isCheckedIn = checkedInIds.has(brewery.id);
                  const checkin = checkins?.find((c) => c.restaurant_id === brewery.id);
                  return (
                    <Card key={brewery.id} className={`transition-colors h-full ${isCheckedIn ? 'border-amber-500/50 bg-amber-500/5' : 'hover:border-primary'}`}>
                      {brewery.image_url && (
                        <div className="h-40 overflow-hidden rounded-t-lg relative">
                          <img src={brewery.image_url} alt={brewery.name} className="w-full h-full object-cover" loading="lazy" />
                          {isCheckedIn && (
                            <div className="absolute top-2 right-2">
                              <Badge className="bg-amber-500 text-white">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Visited
                              </Badge>
                            </div>
                          )}
                        </div>
                      )}
                      <CardContent className="p-5">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h3 className="text-lg font-semibold">{brewery.name}</h3>
                            {brewery.location && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <SpriteIcon name="map-pin" className="h-3 w-3" /> {brewery.location}
                              </p>
                            )}
                          </div>
                          {isCheckedIn ? (
                            <CheckCircle2 className="h-6 w-6 text-amber-500 flex-shrink-0" />
                          ) : (
                            <Circle className="h-6 w-6 text-muted-foreground/30 flex-shrink-0" />
                          )}
                        </div>

                        {checkin?.beer_name && (
                          <p className="text-sm text-muted-foreground mb-1">
                            <Beer className="h-3 w-3 inline mr-1" />
                            {checkin.beer_name}
                          </p>
                        )}
                        {checkin?.rating && (
                          <div className="flex items-center gap-1 mb-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${i < checkin.rating! ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`}
                              />
                            ))}
                          </div>
                        )}

                        <div className="flex gap-2 mt-3">
                          <Link to={`/restaurants/${brewery.slug || brewery.id}`} className="flex-1">
                            <Button variant="outline" size="sm" className="w-full">View Details</Button>
                          </Link>
                          {user && !isCheckedIn && (
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  size="sm"
                                  className="bg-amber-500 hover:bg-amber-600 text-white"
                                  onClick={() => setCheckinBreweryId(brewery.id)}
                                >
                                  Check In
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Check In at {brewery.name}</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 mt-4">
                                  <div>
                                    <label className="text-sm font-medium mb-1 block">What are you drinking? (optional)</label>
                                    <Input
                                      placeholder="e.g. Des Moines IPA"
                                      value={beerName}
                                      onChange={(e) => setBeerName(e.target.value)}
                                    />
                                  </div>
                                  <div>
                                    <label className="text-sm font-medium mb-1 block">Rating (optional)</label>
                                    <div className="flex gap-1">
                                      {Array.from({ length: 5 }).map((_, i) => (
                                        <button
                                          key={i}
                                          type="button"
                                          onClick={() => setRating(i + 1)}
                                          className="p-1"
                                          aria-label={`Rate ${i + 1} star${i > 0 ? 's' : ''}`}
                                        >
                                          <Star
                                            className={`h-6 w-6 ${i < rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`}
                                          />
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                  <Button
                                    className="w-full bg-amber-500 hover:bg-amber-600 text-white"
                                    onClick={handleCheckin}
                                    disabled={checkinMutation.isPending}
                                  >
                                    {checkinMutation.isPending ? 'Checking in...' : 'Check In (+40 XP)'}
                                  </Button>
                                </div>
                              </DialogContent>
                            </Dialog>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground">No breweries found. Check back soon!</p>
            )}
          </section>

          {!user && (
            <div className="text-center mt-10 p-6 bg-muted/50 rounded-lg">
              <p className="text-muted-foreground mb-3">
                Sign in to track your brewery visits and earn rewards!
              </p>
              <Link to="/auth">
                <Button>Sign In to Start the Trail</Button>
              </Link>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
