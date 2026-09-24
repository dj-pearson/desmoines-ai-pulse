import { useSearchParams } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import { SceneUpdateCard } from '@/components/SceneUpdateCard';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SpriteIcon } from '@/components/ui/SpriteIcon';
import { ErrorState } from '@/components/ui/error-state';
import {
  SCENE_UPDATE_TYPES,
  formatSceneUpdateTime,
  isSceneUpdateType,
  useSceneUpdateTypeCounts,
  useSceneUpdates,
  type SceneUpdateType,
} from '@/hooks/useSceneUpdates';
import { getCanonicalUrl } from '@/lib/brandConfig';

const PAGE_PATH = '/whats-new';

function typeLabel(type: SceneUpdateType): string {
  return SCENE_UPDATE_TYPES.find((t) => t.value === type)?.label ?? 'Updates';
}

export default function WhatsNew() {
  // The filter lives in the URL so a filtered view can be linked and survives
  // a reload (WP6 item 2). An unknown ?type= is treated as "all".
  const [searchParams, setSearchParams] = useSearchParams();
  const rawType = searchParams.get('type');
  const activeType: SceneUpdateType | undefined = isSceneUpdateType(rawType) ? rawType : undefined;

  const { data, isLoading, isError, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useSceneUpdates({ type: activeType });
  const { data: countData } = useSceneUpdateTypeCounts();

  const updates = data?.pages.flatMap((p) => p.rows) ?? [];
  const counts = countData?.counts ?? {};
  const latest = countData?.latest ?? null;

  // A chip only for a type that has rows. Four of the old six had no writer
  // anywhere, so they could only ever open an empty list. The selected type
  // stays visible even at zero, so the pressed state matches the URL.
  const chips = SCENE_UPDATE_TYPES.filter((t) => (counts[t.value] ?? 0) > 0 || t.value === activeType);

  const setType = (type: SceneUpdateType | undefined) => {
    const next = new URLSearchParams(searchParams);
    if (type) next.set('type', type);
    else next.delete('type');
    setSearchParams(next, { replace: true });
  };

  const canonicalUrl = getCanonicalUrl(PAGE_PATH);
  const itemList =
    updates.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: "What's new in Des Moines",
          url: canonicalUrl,
          numberOfItems: Math.min(updates.length, 10),
          itemListElement: updates.slice(0, 10).map((u, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: u.title,
          })),
        }
      : undefined;

  const chipClass = 'min-h-11';

  return (
    <>
      <SEOHead
        title="What's New in Des Moines"
        description="Restaurant openings, closings and other changes on the Des Moines scene, newest first, with the date each was posted in Central time."
        url={PAGE_PATH}
        canonicalUrl={canonicalUrl}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: "What's New", url: PAGE_PATH },
        ]}
        structuredData={itemList}
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div data-whats-new className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">What's New in Des Moines</h1>
            <p className="text-muted-foreground max-w-prose">
              Openings, closings and other changes on the Des Moines scene, newest first.
            </p>
            {latest && (
              <p className="mt-2 text-sm text-muted-foreground">
                Latest update{' '}
                <time dateTime={latest} className="font-medium text-foreground">
                  {formatSceneUpdateTime(latest)}
                </time>
              </p>
            )}
          </div>

          <div role="group" aria-label="Filter updates by type" className="flex flex-wrap gap-2 mb-6">
            <Button
              variant={!activeType ? 'default' : 'outline'}
              size="sm"
              className={chipClass}
              aria-pressed={!activeType}
              onClick={() => setType(undefined)}
            >
              All updates
            </Button>
            {chips.map((type) => (
              <Button
                key={type.value}
                variant={activeType === type.value ? 'default' : 'outline'}
                size="sm"
                className={chipClass}
                aria-pressed={activeType === type.value}
                onClick={() => setType(type.value)}
              >
                {type.label}
              </Button>
            ))}
          </div>

          <h2 className="sr-only">{activeType ? typeLabel(activeType) : 'All updates'}</h2>

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-lg" />
              ))}
            </div>
          ) : isError && updates.length === 0 ? (
            // WEB-QA-031: "No updates yet" is a statement of fact. A failed
            // fetch has to look different from a quiet week. A failed "Load
            // more" keeps the rows already shown (TanStack keeps `data`).
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : updates.length === 0 ? (
            activeType ? (
              <div className="text-center py-16">
                <p className="text-lg font-medium">{typeLabel(activeType)}: none yet</p>
                <Button variant="outline" className="mt-4 min-h-11" onClick={() => setType(undefined)}>
                  Show all updates
                </Button>
              </div>
            ) : (
              <div className="text-center py-16">
                <SpriteIcon name="sparkles" className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium">No updates yet</p>
                <p className="text-muted-foreground">Check back soon for the latest Des Moines scene updates.</p>
              </div>
            )
          ) : (
            <>
              <div className="space-y-3">
                {updates.map((update) => (
                  <SceneUpdateCard key={update.id} update={update} />
                ))}
              </div>
              {hasNextPage && (
                <div className="mt-6 text-center">
                  <Button
                    variant="outline"
                    className="min-h-11"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? 'Loading...' : 'Load more'}
                  </Button>
                  {isError && !isFetchingNextPage && (
                    <p role="alert" className="mt-3 text-sm text-destructive">
                      Couldn't load more updates. Try again.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
