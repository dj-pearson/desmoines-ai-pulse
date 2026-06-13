import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useDeals, useClaimDeal } from '@/hooks/useDeals';
import { DealCard } from '@/components/DealCard';
import { CardsGridSkeleton } from '@/components/ui/loading-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { Button } from '@/components/ui/button';
import { Tag, SearchX } from 'lucide-react';
import AffiliateDisclosureBanner from '@/components/AffiliateDisclosureBanner';

const CATEGORIES = [
  { value: 'all', label: 'All Deals' },
  { value: 'restaurant', label: 'Dining' },
  { value: 'attraction', label: 'Attractions' },
  { value: 'hotel', label: 'Hotels' },
  { value: 'event', label: 'Events' },
  { value: 'activity', label: 'Activities' },
];

export default function Deals() {
  const [category, setCategory] = useState('all');
  const { data: deals, isLoading, error, refetch } = useDeals(category);
  const claimDeal = useClaimDeal();

  return (
    <>
      <Helmet>
        <title>Deals & Coupons — Des Moines Discounts | Des Moines Insider</title>
        <meta name="description" content="Find the best deals, coupons, and special offers for Des Moines restaurants, attractions, hotels, and activities." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Tag className="h-5 w-5" />
              <span className="font-semibold">Save in Des Moines</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Deals & Special Offers
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Exclusive discounts on restaurants, attractions, hotels, and more in Des Moines.
            </p>
          </div>

          {/* FTC affiliate disclosure — required "clear and conspicuous"
              above-the-fold for any page containing affiliate or sponsored
              links. See 16 CFR Part 255. */}
          <div className="max-w-3xl mx-auto mb-8">
            <AffiliateDisclosureBanner variant="banner" />
          </div>

          {/* Category filter */}
          <div className="flex items-center gap-2 flex-wrap justify-center mb-8">
            {CATEGORIES.map((cat) => (
              <Button
                key={cat.value}
                variant={category === cat.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setCategory(cat.value)}
              >
                {cat.label}
              </Button>
            ))}
          </div>

          {/* Deals grid */}
          {isLoading ? (
            <CardsGridSkeleton
              count={6}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
              label="Loading deals..."
            />
          ) : error ? (
            <ErrorState
              error={error}
              resourceLabel="deals"
              onRetry={() => refetch()}
            />
          ) : deals && deals.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {deals.map((deal) => (
                <DealCard
                  key={deal.id}
                  deal={deal}
                  onClaim={(id) => claimDeal.mutate(id)}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={category !== 'all' ? SearchX : Tag}
              title={category !== 'all' ? 'No deals in this category' : 'No deals available'}
              description={
                category !== 'all'
                  ? 'Try a different category or browse all current deals.'
                  : 'Check back soon for new deals and special offers.'
              }
              actions={
                category !== 'all'
                  ? [{ label: 'View All Deals', onClick: () => setCategory('all'), variant: 'outline' }]
                  : undefined
              }
            />
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
