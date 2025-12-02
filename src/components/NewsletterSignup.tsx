import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { useNewsletterSubscription, NewsletterPreferences } from "@/hooks/useNewsletterSubscription";
import { Mail, CheckCircle, Sparkles, Calendar, Utensils, Tag } from "lucide-react";
import { cn } from "@/lib/utils";

interface NewsletterSignupProps {
  variant?: 'default' | 'compact' | 'hero' | 'footer' | 'modal';
  source?: 'website' | 'popup' | 'footer' | 'checkout' | 'hero';
  showPreferences?: boolean;
  className?: string;
  title?: string;
  description?: string;
  onSuccess?: () => void;
}

export function NewsletterSignup({
  variant = 'default',
  source = 'website',
  showPreferences = false,
  className,
  title,
  description,
  onSuccess,
}: NewsletterSignupProps) {
  const { subscribe, loading } = useNewsletterSubscription();
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [preferences, setPreferences] = useState<NewsletterPreferences>({
    weekly_digest: true,
    event_alerts: true,
    restaurant_updates: true,
    promotions: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const success = await subscribe({
      email,
      firstName: firstName || undefined,
      source,
      preferences: showPreferences ? preferences : undefined,
    });

    if (success) {
      setSubmitted(true);
      setEmail('');
      setFirstName('');
      onSuccess?.();
    }
  };

  const togglePreference = (key: keyof NewsletterPreferences) => {
    setPreferences(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Success state
  if (submitted) {
    return (
      <div className={cn("text-center py-6", className)}>
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-3">
          <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
        </div>
        <h3 className="text-lg font-semibold mb-1">You're In!</h3>
        <p className="text-sm text-muted-foreground">
          Welcome to the Des Moines Insider community. Check your inbox!
        </p>
        <Button
          variant="link"
          onClick={() => setSubmitted(false)}
          className="mt-2 text-sm"
        >
          Subscribe another email
        </Button>
      </div>
    );
  }

  // Compact variant - simple inline form
  if (variant === 'compact') {
    return (
      <form onSubmit={handleSubmit} className={cn("flex gap-2", className)}>
        <Input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="flex-1"
        />
        <Button type="submit" disabled={loading}>
          {loading ? '...' : 'Subscribe'}
        </Button>
      </form>
    );
  }

  // Footer variant - minimal with just email
  if (variant === 'footer') {
    return (
      <div className={cn("space-y-3", className)}>
        <p className="text-sm font-medium">
          {title || "Stay Updated"}
        </p>
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            type="email"
            placeholder="your@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1 bg-background"
          />
          <Button type="submit" disabled={loading} size="sm">
            <Mail className="w-4 h-4" />
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Weekly updates on events, restaurants & more
        </p>
      </div>
    );
  }

  // Hero variant - larger, more prominent
  if (variant === 'hero') {
    return (
      <div className={cn("bg-primary/5 rounded-2xl p-8 text-center", className)}>
        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-7 h-7 text-primary" />
          </div>
        </div>
        <h2 className="text-2xl font-bold mb-2">
          {title || "Get the Inside Scoop"}
        </h2>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          {description || "Join 10,000+ Des Moines locals who get weekly curated events, restaurant discoveries, and exclusive deals."}
        </p>
        <form onSubmit={handleSubmit} className="max-w-md mx-auto space-y-3">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={loading} size="lg">
              {loading ? 'Subscribing...' : 'Subscribe Free'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Free forever. Unsubscribe anytime. No spam.
          </p>
        </form>
      </div>
    );
  }

  // Modal variant - centered with preferences option
  if (variant === 'modal') {
    return (
      <div className={cn("space-y-4", className)}>
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Mail className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-xl font-bold mb-1">
            {title || "Never Miss a Thing"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {description || "Get weekly updates on the best events, restaurants, and hidden gems in Des Moines."}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="text"
              placeholder="First name (optional)"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {showPreferences && (
            <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium">I'm interested in:</p>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={preferences.event_alerts}
                    onCheckedChange={() => togglePreference('event_alerts')}
                  />
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  Event updates
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={preferences.restaurant_updates}
                    onCheckedChange={() => togglePreference('restaurant_updates')}
                  />
                  <Utensils className="w-4 h-4 text-muted-foreground" />
                  Restaurant discoveries
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={preferences.promotions}
                    onCheckedChange={() => togglePreference('promotions')}
                  />
                  <Tag className="w-4 h-4 text-muted-foreground" />
                  Deals & offers
                </label>
              </div>
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Subscribing...' : 'Subscribe'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            We respect your privacy. Unsubscribe anytime.
          </p>
        </form>
      </div>
    );
  }

  // Default variant - Card with full features
  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          {title || "Subscribe to Our Newsletter"}
        </CardTitle>
        <CardDescription>
          {description || "Get weekly curated events, restaurant discoveries, and insider tips delivered to your inbox."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              type="text"
              placeholder="First name (optional)"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
            <Input
              type="email"
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {showPreferences && (
            <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
              <p className="text-sm font-medium mb-2">I want to receive:</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={preferences.weekly_digest}
                    onCheckedChange={() => togglePreference('weekly_digest')}
                  />
                  Weekly digest
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={preferences.event_alerts}
                    onCheckedChange={() => togglePreference('event_alerts')}
                  />
                  Event alerts
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={preferences.restaurant_updates}
                    onCheckedChange={() => togglePreference('restaurant_updates')}
                  />
                  Restaurant updates
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={preferences.promotions}
                    onCheckedChange={() => togglePreference('promotions')}
                  />
                  Deals & promos
                </label>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                'Subscribing...'
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Subscribe
                </>
              )}
            </Button>
          </div>

          <p className="text-xs text-center text-muted-foreground">
            Join 10,000+ subscribers. Free forever. Unsubscribe anytime.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}

export default NewsletterSignup;
