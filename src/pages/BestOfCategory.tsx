import { useParams, Link } from 'react-router-dom';
import { OptimizedImage } from "@/components/OptimizedImage";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Helmet } from 'react-helmet-async';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCategoryResults,
  useUserVote,
  votingPhase,
  formatVotingDate,
  MIN_VOTES_FOR_RANKING,
  type Vote,
  type VoteResult,
} from '@/hooks/useVoting';
import { VotingBooth } from '@/components/VotingBooth';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Trophy, ArrowLeft, Medal, PenLine, Store } from 'lucide-react';
import { RouteCanonical } from '@/components/RouteCanonical';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { getCanonicalUrl } from '@/lib/brandConfig';

const MEDAL_CLASSES = ['text-yellow-500', 'text-gray-500', 'text-amber-700'];

function isUsersPick(result: VoteResult, vote: Vote | null | undefined): boolean {
  if (!vote) return false;
  return vote.entity_id
    ? result.entity_id === vote.entity_id
    : !result.entity_id && result.custom_entry === vote.custom_entry;
}

export default function BestOfCategory() {
  const { category: categorySlug } = useParams<{ category: string }>();
  const { data, isLoading, isError, error, refetch } = useCategoryResults(categorySlug || '');
  const { user } = useAuth();

  const category = data?.category;
  const results = data?.results || [];
  const totalVotes = results.reduce((sum, r) => sum + r.vote_count, 0);
  const { data: userVote } = useUserVote(category?.id ?? '');

  const phase = category ? votingPhase(category) : 'open';
  const startLabel = formatVotingDate(category?.voting_start);
  const endLabel = formatVotingDate(category?.voting_end);
  // Below the minimum the list is counts only: no percentages, no medals.
  const ranked = totalVotes >= MIN_VOTES_FOR_RANKING;
  const resultsHeading = phase === 'closed' ? 'Final results' : 'Live results';

  // WEB-SEO-035 AC3. Only the ranked entries that HAVE a page, and in rank
  // order, so numberOfItems and the positions match what a crawler reads off
  // the list above. Custom write-ins are not addressable and are left out of
  // both the links and the schema.
  const schemaItems = results
    .filter((r) => r.url && r.name)
    .map((r, index) => ({
      name: r.name as string,
      url: getCanonicalUrl(r.url as string),
      position: index + 1,
      ...(r.image_url ? { image: r.image_url } : {}),
    }));

  return (
    <>
      {/* WEB-SEO-035. This page had NO canonical at all, so every /best-of/
          category inherited the SPA shell's - each one declaring itself a
          duplicate of the home page. That is why the family was held out of
          the sitemaps. Unlike the detail pages, this one is not in a loading
          branch: nothing else here emits a canonical, so there is no second
          tag for it to collide with. */}
      <RouteCanonical path={`/best-of/${categorySlug ?? ''}`} />
      <Helmet>
        <title>{category ? `${category.name} - Des Best` : 'Des Best'} | Des Moines Insider</title>
        <meta name="description" content={category?.description || 'Vote for the best of Des Moines'} />
      </Helmet>
      {schemaItems.length > 0 && (
        <ItemListSchema
          name={category ? `Best ${category.name} in Des Moines` : 'Des Best rankings'}
          description={category?.description || undefined}
          items={schemaItems}
        />
      )}
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8 max-w-3xl" data-best-of-category>
          <Link
            to="/best-of"
            className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            All categories
          </Link>

          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-12 w-64" />
              <Skeleton className="h-40" />
              <Skeleton className="h-64" />
            </div>
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : !category ? (
            <>
              <Helmet>
                <meta name="robots" content="noindex, follow" />
                <meta name="googlebot" content="noindex, follow" />
              </Helmet>
              <h1 className="text-2xl font-bold mb-2">Category not found</h1>
              <p className="text-muted-foreground">
                This category isn't open for voting. <Link to="/best-of" className="underline underline-offset-4">See all categories</Link>.
              </p>
            </>
          ) : (
            <div className="space-y-8">
              {/* Header */}
              <div>
                <h1 className="text-3xl font-bold mb-2">{category.name}</h1>
                {category.description && (
                  <p className="text-muted-foreground">{category.description}</p>
                )}
                <p className="text-sm text-muted-foreground mt-1">
                  {totalVotes} total vote{totalVotes !== 1 ? 's' : ''}
                  {phase === 'open' && endLabel && ` - voting closes ${endLabel}`}
                  {phase === 'closed' && endLabel && ` - voting closed ${endLabel}`}
                  {phase === 'upcoming' && startLabel && ` - voting opens ${startLabel}`}
                </p>
              </div>

              {phase === 'open' ? (
                <VotingBooth category={category} results={results} />
              ) : (
                <div className="rounded-lg bg-muted p-4" role="status">
                  <p className="font-semibold">
                    {phase === 'closed' ? 'Voting closed' : 'Voting hasn\'t opened yet'}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {phase === 'closed'
                      ? endLabel
                        ? `Voting ended ${endLabel}. These are the final results.`
                        : 'These are the final results.'
                      : startLabel
                        ? `Voting opens ${startLabel}.`
                        : 'Check back soon.'}
                  </p>
                </div>
              )}

              {/* Results */}
              <section aria-labelledby="best-of-results-heading">
                <h2 id="best-of-results-heading" className="text-xl font-semibold mb-2 flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" aria-hidden="true" />
                  {resultsHeading}
                </h2>

                {totalVotes === 0 ? (
                  <p className="text-muted-foreground">
                    {phase === 'open'
                      ? 'No votes yet. Cast the first one above.'
                      : phase === 'closed'
                        ? 'No votes were cast in this category.'
                        : 'Results appear once voting opens.'}
                  </p>
                ) : (
                  <>
                    {!ranked && (
                      <p className="text-sm text-muted-foreground mb-4">
                        Not enough votes yet to rank. Percentages and medals appear at {MIN_VOTES_FOR_RANKING} votes;
                        until then these are raw counts.
                      </p>
                    )}
                    <ol className="space-y-2">
                      {results.map((result, index) => {
                        const percentage = totalVotes > 0 ? Math.round((result.vote_count / totalVotes) * 100) : 0;
                        const mine = !!user && isUsersPick(result, userVote);
                        return (
                          <li key={result.entity_id || result.custom_entry || index}>
                            <Card>
                              <CardContent className="p-4 flex items-center gap-4">
                                {/* Rank */}
                                <div className="flex-shrink-0 w-8 text-center">
                                  {ranked && index < 3 ? (
                                    <>
                                      <Medal className={`h-6 w-6 mx-auto ${MEDAL_CLASSES[index]}`} aria-hidden="true" />
                                      <span className="sr-only">Rank {index + 1}</span>
                                    </>
                                  ) : (
                                    <span className="text-lg font-bold text-muted-foreground">
                                      <span className="sr-only">Rank </span>
                                      {index + 1}
                                    </span>
                                  )}
                                </div>

                                {/* Image */}
                                {result.image_url ? (
                                  // A 48px box served the full-size original, which is
                                  // the widest ratio of bytes-to-pixels on the site.
                                  // width/height give the transform a target rendition.
                                  <OptimizedImage
                                    src={result.image_url}
                                    alt=""
                                    width={96}
                                    height={96}
                                    className="object-cover"
                                    containerClassName="w-12 h-12 rounded flex-shrink-0"
                                    sizes="48px"
                                  />
                                ) : (
                                  <div
                                    className="w-12 h-12 rounded bg-muted flex items-center justify-center flex-shrink-0"
                                    aria-hidden="true"
                                  >
                                    {result.entity_type === 'custom' ? (
                                      <PenLine className="h-5 w-5 text-muted-foreground" />
                                    ) : (
                                      <Store className="h-5 w-5 text-muted-foreground" />
                                    )}
                                  </div>
                                )}

                                {/* Info */}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {result.url ? (
                                      <Link
                                        to={result.url}
                                        className="font-medium truncate block hover:text-primary underline-offset-4 hover:underline"
                                      >
                                        {result.name}
                                      </Link>
                                    ) : (
                                      <p className="font-medium truncate">{result.name || 'Unknown'}</p>
                                    )}
                                    {mine && (
                                      <Badge variant="secondary" className="flex-shrink-0">
                                        Your vote
                                      </Badge>
                                    )}
                                  </div>
                                  {ranked && (
                                    <div className="flex items-center gap-2 mt-1">
                                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden" aria-hidden="true">
                                        <div
                                          className="h-full bg-primary rounded-full transition-all"
                                          style={{ width: `${percentage}%` }}
                                        />
                                      </div>
                                      <span className="text-sm text-muted-foreground flex-shrink-0">
                                        {percentage}%
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {/* Vote count */}
                                <Badge variant="outline" className="flex-shrink-0">
                                  {result.vote_count} vote{result.vote_count !== 1 ? 's' : ''}
                                </Badge>
                              </CardContent>
                            </Card>
                          </li>
                        );
                      })}
                    </ol>
                  </>
                )}
              </section>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
