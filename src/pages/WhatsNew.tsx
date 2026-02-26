import { useState } from 'react';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useSceneUpdates } from '@/hooks/useSceneUpdates';
import { SceneUpdateCard } from '@/components/SceneUpdateCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles } from 'lucide-react';

const UPDATE_TYPES = [
  { value: '', label: 'All Updates' },
  { value: 'new_opening', label: 'New Openings' },
  { value: 'closing', label: 'Closings' },
  { value: 'renovation', label: 'Renovations' },
  { value: 'expansion', label: 'Expansions' },
  { value: 'news', label: 'News' },
];

export default function WhatsNew() {
  const [typeFilter, setTypeFilter] = useState('');
  const { data: updates, isLoading } = useSceneUpdates({
    type: typeFilter || undefined,
    limit: 50,
  });

  return (
    <>
      <Helmet>
        <title>What's New in Des Moines | Des Moines Insider</title>
        <meta name="description" content="Stay up to date with the latest openings, closings, and scene changes in Des Moines. New restaurants, renovations, expansions, and local news." />
      </Helmet>
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          {/* Header */}
          <div className="mb-8">
            <div className="inline-flex items-center gap-2 text-primary mb-2">
              <Sparkles className="h-5 w-5" />
              <span className="text-sm font-semibold uppercase tracking-wide">Scene Updates</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2">What's New in Des Moines</h1>
            <p className="text-muted-foreground">
              New openings, closings, renovations, and everything happening on the Des Moines scene.
            </p>
          </div>

          {/* Type filter */}
          <div className="flex flex-wrap gap-2 mb-6">
            {UPDATE_TYPES.map((type) => (
              <Button
                key={type.value}
                variant={typeFilter === type.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTypeFilter(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>

          {/* Feed */}
          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : !updates || updates.length === 0 ? (
            <div className="text-center py-16">
              <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-lg font-medium">No updates yet</p>
              <p className="text-muted-foreground">Check back soon for the latest Des Moines scene updates.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {updates.map((update) => (
                <SceneUpdateCard key={update.id} update={update} />
              ))}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
