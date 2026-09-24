import { Link } from 'react-router-dom';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import SEOHead from '@/components/SEOHead';
import ItemListSchema from '@/components/schema/ItemListSchema';
import { getCanonicalUrl } from '@/lib/brandConfig';
import {
  useVotingCategories,
  useVotingLeaders,
  votingPhase,
  votingYear,
  formatVotingDate,
  MIN_VOTES_FOR_RANKING,
  type CategoryLeader,
  type VotingCategory,
} from '@/hooks/useVoting';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/ui/error-state';
import { Trophy, ChevronRight } from 'lucide-react';

/** The year of the most recent voting round, from the data rather than a literal. */
function roundYear(categories: VotingCategory[]): string | null {
  const years = categories
    .map((c) => votingYear(c.voting_start))
    .filter((y): y is string => !!y)
    .sort();
  return years.length > 0 ? years[years.length - 1] : null;
}

function windowLabel(cat: VotingCategory): string {
  const phase = votingPhase(cat);
  if (phase === 'upcoming') {
    const start = formatVotingDate(cat.voting_start);
    return start ? `Opens ${start}` : 'Opens soon';
  }
  const end = formatVotingDate(cat.voting_end);
  if (phase === 'closed') return end ? `Closed ${end}` : 'Closed';
  return end ? `Closes ${end}` : 'No closing date';
}

function leaderLabel(cat: VotingCategory, leader: CategoryLeader | undefined): string {
  const total = cat.vote_count || 0;
  if (total === 0) return 'No votes yet';
  if (!leader) return 'No listed place leads yet';
  const name = leader.name ?? 'An unnamed place';
  const count = `${leader.vote_count} vote${leader.vote_count === 1 ? '' : 's'}`;
  if (votingPhase(cat) === 'closed') return `Top place: ${name} (${count})`;
  return total < MIN_VOTES_FOR_RANKING ? `Early lead: ${name} (${count})` : `Leading: ${name} (${count})`;
}

export default function BestOf() {
  const { data: categories, isLoading, isError, error, refetch } = useVotingCategories();
  // Leaders are an enrichment. If voting_winners fails the list still renders,
  // each row reading its vote count without a name.
  const { data: leaders, isError: leadersFailed } = useVotingLeaders();

  const year = roundYear(categories ?? []);
  // Most votes first: the index is a ranking of where the action is.
  const ordered = [...(categories ?? [])].sort(
    (a, b) => (b.vote_count || 0) - (a.vote_count || 0) || a.name.localeCompare(b.name),
  );

  const canonicalUrl = getCanonicalUrl('/best-of');

  // SEO-022. Each element is a category page, so the list is of the pages
  // themselves rather than of places. The page shows each category's current
  // leader as text, but the ranked places belong to /best-of/:slug.
  const schemaItems = (categories ?? []).map((cat) => ({
    name: cat.name,
    url: getCanonicalUrl(`/best-of/${cat.slug}`),
    ...(cat.description && { description: cat.description }),
  }));

  return (
    <>
      <SEOHead
        title="Des Best - Vote for Des Moines' Best"
        description="Vote for the best pizza, coffee, brunch, date night spots, and more in Des Moines. Community-powered Best Of voting."
        url={canonicalUrl}
        canonicalUrl={canonicalUrl}
        keywords={[
          'best of Des Moines',
          'best pizza Des Moines',
          'best coffee Des Moines',
          'Des Moines readers choice',
        ]}
        breadcrumbs={[
          { name: 'Home', url: '/' },
          { name: 'Des Best', url: '/best-of' },
        ]}
      />
      <ItemListSchema
        name="Best of Des Moines voting categories"
        description="Community-voted categories for the best food, drink and nightlife in the Des Moines metro."
        items={schemaItems}
      />
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-4 py-8">
          {/* Hero */}
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full mb-4">
              <Trophy className="h-5 w-5" aria-hidden="true" />
              <span className="font-semibold">{year ? `Des Best ${year}` : 'Des Best'}</span>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">
              Vote for the Best of Des Moines
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Help crown the best restaurants, venues, and hidden gems in the Des Moines area.
              One vote per category, and you can change it while voting is open.
            </p>
          </div>

          {isLoading ? (
            <div className="max-w-3xl mx-auto space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} />
          ) : ordered.length === 0 ? (
            <div className="max-w-xl mx-auto text-center py-12">
              <h2 className="text-xl font-semibold mb-2">Voting opens soon</h2>
              <p className="text-muted-foreground">
                No categories are open right now. Check back for the next round.
              </p>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto">
              <h2 className="sr-only">Categories by votes cast</h2>
              {leadersFailed && (
                <p className="text-sm text-muted-foreground mb-3">
                  Current leaders couldn't be loaded. Vote counts are still up to date.
                </p>
              )}
              <ol className="divide-y rounded-lg border bg-card">
                {ordered.map((cat, index) => (
                  <li key={cat.id}>
                    <Link
                      to={`/best-of/${cat.slug}`}
                      className="flex min-h-11 items-center gap-4 p-4 hover:bg-accent transition-colors"
                    >
                      <span className="w-6 text-right text-sm font-semibold text-muted-foreground tabular-nums">
                        <span className="sr-only">Rank </span>
                        {index + 1}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block font-semibold">{cat.name}</span>
                        <span className="block text-sm text-muted-foreground truncate">
                          {leadersFailed ? `${cat.vote_count || 0} votes` : leaderLabel(cat, leaders?.[cat.id])}
                        </span>
                        <span className="block sm:hidden text-xs text-muted-foreground">
                          {cat.vote_count || 0} vote{cat.vote_count === 1 ? '' : 's'} - {windowLabel(cat)}
                        </span>
                      </span>
                      <span className="hidden sm:block text-right text-sm text-muted-foreground flex-shrink-0">
                        <span className="block tabular-nums">
                          {cat.vote_count || 0} vote{cat.vote_count === 1 ? '' : 's'}
                        </span>
                        <span className="block">{windowLabel(cat)}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
