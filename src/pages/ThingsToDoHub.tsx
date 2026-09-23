/**
 * ThingsToDoHub — Hub page for /things-to-do
 *
 * Serves as the entry point for the entire pSEO "things-to-do" content tree.
 * Lets readers narrow down by area, activity type, audience, or time.
 */

import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { getCanonicalUrl } from '@/lib/brandConfig';
import { Users, Heart, DollarSign, TreePine, Music, Utensils, Camera, Baby, Sunset, CalendarDays, Clock, Snowflake, Sun, Leaf, Flower2, ChevronRight } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { SpriteIcon } from "@/components/ui/SpriteIcon";
import { usePseoPageSlugs } from '@/pseo/hooks/usePseoPage';
import { resolveHubLink, type HubFallback } from '@/lib/hubLinks';

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const areas = [
  { slug: 'downtown', name: 'Downtown', description: 'Skywalk dining, Court Ave nightlife, arts & culture', icon: '🏙️' },
  { slug: 'east-village', fallback: { href: '/neighborhoods/east-village', description: 'East Village guide: events, dining and attractions' }, name: 'East Village', description: "DSM's trendiest neighborhood — boutiques, brunch & bars", icon: '✨' },
  { slug: 'valley-junction', name: 'Valley Junction', description: 'Walkable historic district, antiques & local dining', icon: '🏘️' },
  { slug: 'west-des-moines', fallback: { href: '/neighborhoods/west-des-moines', description: 'West Des Moines guide: events, dining and attractions' }, name: 'West Des Moines', description: 'Jordan Creek, local gems amid the suburbs', icon: '🛍️' },
  { slug: 'ankeny', fallback: { href: '/neighborhoods/ankeny', description: 'Ankeny guide: events, dining and attractions' }, name: 'Ankeny', description: "Iowa's fastest-growing city — always something new", icon: '🚀' },
  { slug: 'drake', name: 'Drake', description: 'Diverse dining, campus energy, hidden gems', icon: '🎓' },
  { slug: 'beaverdale', name: 'Beaverdale', description: 'Neighborhood charm, local favorites, fall festival', icon: '🍂' },
  { slug: 'ingersoll', name: 'Ingersoll', description: 'Restaurant row, coffee shops, walkable corridor', icon: '☕' },
  { slug: 'urbandale', fallback: { href: '/neighborhoods/urbandale', description: 'Urbandale guide: events, dining and attractions' }, name: 'Urbandale', description: 'Living History Farms, parks & local dining', icon: '🌾' },
  { slug: 'waukee', fallback: { href: '/neighborhoods/waukee', description: 'Waukee guide: events, dining and attractions' }, name: 'Waukee', description: 'Kettlestone district, Raccoon River Valley Trail', icon: '🌿' },
  { slug: 'altoona', fallback: { href: '/neighborhoods/altoona', description: 'Altoona guide: events, dining and attractions' }, name: 'Altoona', description: 'Adventureland, Prairie Meadows, local eats', icon: '🎢' },
  { slug: 'sherman-hill', name: 'Sherman Hill', description: 'Victorian architecture, historic walks', icon: '🏛️' },
];

// Eight audiences, eight surface tints with a matching border. The hue is the
// only thing telling two otherwise identical cards apart at a glance, so it
// stays; each tint is a -50 surface in light and a -950/30 in dark, both under
// body text that keeps its own token (WEB-UX-034 AC2).
const audiences = [
  { slug: 'families', fallback: { href: '/events/kids', description: 'Upcoming kids and family events' }, name: 'For Families', description: 'Kid-friendly picks with stroller & age notes', icon: Baby, color: 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800' },
  { slug: 'date-night', fallback: { href: '/events/date-night', description: 'Date night events across the metro' }, name: 'Date Night', description: 'Complete evening itineraries for couples', icon: Heart, color: 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' },
  { slug: 'foodies', fallback: { href: '/restaurants', description: 'The Des Moines restaurant guide' }, name: 'For Foodies', description: 'Dish-specific recs, chef stories, deep cuts', icon: Utensils, color: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800' },
  { slug: 'budget', fallback: { href: '/events/free', description: 'Every free event on the calendar' }, name: 'Budget-Friendly', description: 'Free events, happy hours, cheap eats', icon: DollarSign, color: 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800' },
  { slug: 'tourists', fallback: { href: '/attractions', description: 'Museums, gardens, the zoo and landmarks' }, name: 'For Visitors', description: '48-hour itineraries & must-see essentials', icon: Camera, color: 'bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800' },
  { slug: 'pet-friendly', name: 'Pet-Friendly', description: 'Dog-friendly patios, parks & hotels', icon: TreePine, color: 'bg-teal-50 dark:bg-teal-950/30 border-teal-200 dark:border-teal-800' },
  { slug: 'groups', name: 'For Groups', description: 'Large groups, team building & party venues', icon: Users, color: 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800' },
  { slug: 'couples', name: 'For Couples', description: 'Weekend getaways & shared experiences', icon: Sunset, color: 'bg-pink-50 dark:bg-pink-950/30 border-pink-200 dark:border-pink-800' },
];

const byTime = [
  { slug: 'today', fallback: { href: '/events/today', description: 'Everything on the calendar today' }, name: 'Today', description: "What's happening right now", icon: Clock, badge: 'Live' },
  { slug: 'this-weekend', fallback: { href: '/events/this-weekend', description: 'Friday through Sunday, every event' }, name: 'This Weekend', description: 'Friday–Sunday curated picks', icon: CalendarDays, badge: 'Popular' },
  { slug: 'summer', fallback: { href: '/guides/summer-2026', description: 'The summer guide' }, name: 'This Summer', description: 'Outdoor concerts, State Fair & more', icon: Sun, badge: 'Seasonal' },
  { slug: 'fall', fallback: { href: '/guides/fall-festivals', description: 'The fall festivals guide' }, name: 'Fall', description: 'Apple orchards, pumpkins & foliage', icon: Leaf, badge: 'Seasonal' },
  { slug: 'winter', fallback: { href: '/guides/holiday-lights', description: 'The holiday lights guide' }, name: 'Winter', description: 'Holiday lights, indoor picks & cozy spots', icon: Snowflake, badge: 'Seasonal' },
  { slug: 'spring', name: 'Spring', description: 'Patio season openers & garden blooms', icon: Flower2, badge: 'Seasonal' },
];

const byCategory = [
  { slug: 'live-music', fallback: { href: '/music', description: 'Concerts and live music across the metro' }, name: 'Live Music', icon: Music },
  { slug: 'festivals', fallback: { href: '/guides', description: 'Seasonal and festival guides' }, name: 'Festivals', icon: CalendarDays },
  { slug: 'arts-culture', fallback: { href: '/attractions' }, name: 'Arts & Culture', icon: Camera },
  { slug: 'outdoors', fallback: { href: '/outdoors' }, name: 'Outdoors', icon: TreePine },
  { slug: 'brunch', fallback: { href: '/restaurants' }, name: 'Brunch', icon: Utensils },
  { slug: 'coffee', name: 'Coffee & Cafes', icon: Utensils },
  { slug: 'museums', fallback: { href: '/attractions' }, name: 'Museums', icon: Camera },
  { slug: 'parks', fallback: { href: '/playgrounds' }, name: 'Parks & Nature', icon: TreePine },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ThingsToDoHub() {
  const canonicalUrl = getCanonicalUrl('/things-to-do');

  // SEO-012: link a pSEO page only when it is published. See src/lib/hubLinks.ts.
  const { data: pseoSlugs } = usePseoPageSlugs();
  const published = new Set((pseoSlugs ?? []).map((r) => r.slug));
  const resolve = <T extends { slug: string; description?: string; fallback?: HubFallback }>(items: T[]) =>
    items
      .map((item) => {
        const link = resolveHubLink(`/things-to-do/${item.slug}`, published, item.fallback, item.description);
        return link ? ({ ...item, href: link.href, description: link.description ?? item.description } as T & { href: string }) : null;
      })
      .filter((x): x is T & { href: string } => x !== null);
  const areaLinks = resolve(areas);
  const audienceLinks = resolve(audiences);
  const timeLinks = resolve(byTime);
  const categoryLinks = resolve(byCategory);
  const popularLinks = [
    { href: '/things-to-do/downtown/families', label: 'Family-Friendly Downtown' },
    { href: '/things-to-do/east-village/date-night', label: 'Date Night in East Village' },
    { href: '/things-to-do/this-weekend', label: 'Things to Do This Weekend' },
    { href: '/things-to-do/downtown/budget', label: 'Free Things to Do Downtown' },
    { href: '/things-to-do/ankeny/families', label: 'Family Activities in Ankeny' },
    { href: '/things-to-do/tourists', label: 'First-Time Visitor Guide' },
  ].filter((l) => published.has(l.href));

  // A CollectionPage naming only pages that exist (SEO-012 AC4).
  const collection = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': canonicalUrl,
    name: 'Things to Do in Des Moines',
    url: canonicalUrl,
    hasPart: [...new Set([...areaLinks, ...audienceLinks, ...timeLinks, ...categoryLinks].map((l) => l.href))].map(
      (href) => ({ '@type': 'WebPage', url: getCanonicalUrl(href) }),
    ),
  };

  return (
    <>
      <SEOHead
        title="Things to Do in Des Moines, Iowa | Des Moines Insider"
        description="The best things to do in Des Moines and around it, by neighborhood, activity or occasion: family-friendly, date nights and free events."
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={['things to do des moines', 'des moines activities', 'des moines attractions', 'what to do in des moines']}
        structuredData={collection}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Things to Do', url: '/things-to-do' },
        ]}
      />

      <Header />

      {/* Plain <div>, not <main>: App.tsx already provides the single
          top-level <main id="main-content"> landmark (WCAG 1.3.1). */}
      <div className="min-h-screen bg-background">
        {/* Hero */}
        <section className="bg-gradient-to-br from-primary/10 via-background to-secondary/10 border-b border-border">
          <div className="container mx-auto px-4 py-14 md:py-20">
            <div className="max-w-3xl">
              <div className="flex items-center gap-2 text-sm text-primary font-medium mb-3">
                <SpriteIcon name="map-pin" className="h-4 w-4" aria-hidden="true" />
                Des Moines Metro Area
              </div>
              <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl lg:text-6xl mb-4">
                {/* The space before the <br> is load-bearing: without it the
                    heading's text, which is what a crawler and a screen reader
                    get, is "Things to Do inDes Moines" (the SEO-026 bug on
                    /restaurants, here too). */}
                Things to Do in{" "}<br />
                <span className="text-primary">Des Moines</span>
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl">
                Local-first guides to events, restaurants, attractions, and hidden gems across the
                Des Moines metro. Narrow it down by neighborhood, who you're with, or when you're going.
              </p>
            </div>
          </div>
        </section>

        <div className="container mx-auto px-4 py-12 space-y-16">

          {/* By Area */}
          <section aria-labelledby="by-area-heading">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 id="by-area-heading" className="text-2xl font-bold tracking-tight">Browse by Area</h2>
                <p className="text-muted-foreground mt-1">Pick your neighborhood or suburb</p>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {areaLinks.map((area) => (
                <Link
                  key={area.slug}
                  to={area.href}
                  className="group flex flex-col gap-1.5 p-4 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all duration-200"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl" aria-hidden="true">{area.icon}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                    {area.name}
                  </div>
                  <div className="text-xs text-muted-foreground leading-snug line-clamp-2">
                    {area.description}
                  </div>
                </Link>
              ))}
            </div>
          </section>

          {/* By Audience / Who */}
          <section aria-labelledby="by-audience-heading">
            <div className="mb-6">
              <h2 id="by-audience-heading" className="text-2xl font-bold tracking-tight">Browse by Who's Going</h2>
              <p className="text-muted-foreground mt-1">Curated picks for every group and occasion</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {audienceLinks.map((audience) => {
                const Icon = audience.icon;
                return (
                  <Link
                    key={audience.slug}
                    to={audience.href}
                    className={`group flex flex-col gap-2 p-5 rounded-xl border transition-all duration-200 hover:shadow-md ${audience.color}`}
                  >
                    <div className="flex items-center justify-between">
                      <Icon className="h-5 w-5 text-foreground/70" aria-hidden="true" />
                      <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <div className="font-semibold text-foreground">{audience.name}</div>
                    <div className="text-sm text-muted-foreground leading-snug">{audience.description}</div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* By Time / When */}
          <section aria-labelledby="by-time-heading">
            <div className="mb-6">
              <h2 id="by-time-heading" className="text-2xl font-bold tracking-tight">Browse by When</h2>
              <p className="text-muted-foreground mt-1">Time-based guides for every season and occasion</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              {timeLinks.map((time) => {
                const Icon = time.icon;
                return (
                  <Link
                    key={time.slug}
                    to={time.href}
                    className="group relative flex flex-col items-center gap-2 p-5 rounded-xl border border-border bg-card hover:bg-accent hover:border-primary/40 text-center transition-all duration-200"
                  >
                    {time.badge && (
                      <Badge variant="secondary" className="absolute top-2 right-2 text-[10px] px-1.5 py-0">
                        {time.badge}
                      </Badge>
                    )}
                    <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                    <div className="font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
                      {time.name}
                    </div>
                    <div className="text-xs text-muted-foreground leading-snug">{time.description}</div>
                  </Link>
                );
              })}
            </div>
          </section>

          {/* By Category */}
          <section aria-labelledby="by-category-heading">
            <div className="mb-6">
              <h2 id="by-category-heading" className="text-2xl font-bold tracking-tight">Browse by Activity</h2>
              <p className="text-muted-foreground mt-1">Dive into specific types of experiences</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {categoryLinks.map((cat) => {
                const Icon = cat.icon;
                return (
                  <Link
                    key={cat.slug}
                    to={cat.href}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-border bg-card hover:bg-primary hover:text-primary-foreground hover:border-primary text-sm font-medium transition-all duration-200"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {cat.name}
                  </Link>
                );
              })}
            </div>
          </section>

          {/* Popular combos: published pages only. */}
          {popularLinks.length > 0 && (
          <section aria-labelledby="popular-heading" className="pb-4">
            <div className="mb-6">
              <h2 id="popular-heading" className="text-2xl font-bold tracking-tight">Popular Searches</h2>
              <p className="text-muted-foreground mt-1">The most searched things to do in DSM</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {popularLinks.map(({ href, label }) => (
                <Link
                  key={href}
                  to={href}
                  className="flex items-center justify-between px-4 py-3.5 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/40 transition-all duration-200 group"
                >
                  <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                    {label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </Link>
              ))}
            </div>
          </section>
          )}

        </div>
      </div>

      <Footer />
    </>
  );
}
