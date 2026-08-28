import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { createLogger } from "@/lib/logger";
import {
  Zap,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  SkipForward,
  ImageIcon,
  Loader2,
} from "lucide-react";

const log = createLogger('ImageBackfill');

type Category = 'events' | 'restaurants' | 'attractions' | 'playgrounds';

type ImageSource =
  | 'source_url'
  | 'venue_existing'
  | 'venue_website'
  | 'google_places'
  | 'category_default'
  | 'none';

interface BatchDetail {
  id: string;
  name: string;
  sourceUrl?: string;
  imageUrl?: string;
  status: 'updated' | 'skipped' | 'failed' | 'dry_run';
  source?: ImageSource;
  reason?: string;
}

const SOURCE_LABELS: Record<ImageSource, string> = {
  source_url: 'source',
  venue_existing: 'venue (DB)',
  venue_website: 'venue site',
  google_places: 'Places',
  category_default: 'default',
  none: '—',
};

interface BatchResult {
  category: string;
  offset: number;
  batchSize: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  nextOffset: number | null;
  dryRun: boolean;
  details: BatchDetail[];
}

interface CategoryStats {
  total: number;
  withImages: number;
  needsBackfill: number;
}

const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'events', label: 'Events' },
  { value: 'restaurants', label: 'Restaurants' },
  { value: 'attractions', label: 'Attractions' },
  { value: 'playgrounds', label: 'Playgrounds' },
];

export default function ImageBackfill() {
  const { toast } = useToast();

  const [category, setCategory] = useState<Category>('events');
  const [batchSize] = useState(5);
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [stats, setStats] = useState<Record<Category, CategoryStats | null>>({
    events: null,
    restaurants: null,
    attractions: null,
    playgrounds: null,
  });

  // Running totals across all batches
  const [totals, setTotals] = useState({ processed: 0, updated: 0, skipped: 0, failed: 0 });
  const [currentOffset, setCurrentOffset] = useState(0);
  const [allDetails, setAllDetails] = useState<BatchDetail[]>([]);
  const pauseRef = useRef(false);

  const fetchStats = useCallback(async (cat: Category) => {
    try {
      const table = cat === 'playgrounds' ? 'playgrounds' : cat;
      const todayIso = new Date().toISOString().slice(0, 10);

      // For events, only count today/future — past events are excluded from the
      // backfill, so they shouldn't pad the "needs images" count.
      const baseQuery = () => {
        let q = supabase.from(table as string).select('id', { count: 'exact', head: true });
        if (cat === 'events') q = q.gte('date', todayIso);
        return q;
      };

      const { count: total, error: totalError } = await baseQuery();
      const { count: withImages, error: withImagesError } = await baseQuery()
        .not('image_url', 'is', null)
        .neq('image_url', '');

      // A COUNT THAT FAILED IS NOT A COUNT OF ZERO. `total || 0` turned a failed
      // read into 0, so needsBackfill came out 0 - 0 = 0 and the panel told an
      // admin this category needs no backfill. The catch below never covered it:
      // a Supabase count error is returned as { count: null, error }, not thrown.
      if (totalError || withImagesError) {
        log.error('fetchStats', 'could not count images', {
          category: cat,
          error: String(totalError ?? withImagesError),
        });
        return;
      }

      const totalNum = total || 0;
      const withImagesNum = withImages || 0;

      setStats((prev) => ({
        ...prev,
        [cat]: {
          total: totalNum,
          withImages: withImagesNum,
          needsBackfill: totalNum - withImagesNum,
        },
      }));
    } catch (err) {
      log.error('fetchStats', 'Failed to fetch stats', { category: cat, error: String(err) });
    }
  }, []);

  // Fetch stats for all categories on mount
  useState(() => {
    CATEGORIES.forEach((c) => fetchStats(c.value));
  });

  const runBatch = async (offset: number): Promise<BatchResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('backfill-images', {
        body: {
          category,
          offset,
          batchSize,
          dryRun: false,
        },
      });

      if (error) throw error;
      return data as BatchResult;
    } catch (err) {
      log.error('runBatch', 'Batch failed', { offset, error: String(err) });
      toast({
        title: 'Batch failed',
        description: String(err),
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleStartBatch = async () => {
    setIsRunning(true);
    setIsPaused(false);
    pauseRef.current = false;

    const result = await runBatch(currentOffset);
    if (result) {
      setTotals((prev) => ({
        processed: prev.processed + result.processed,
        updated: prev.updated + result.updated,
        skipped: prev.skipped + result.skipped,
        failed: prev.failed + result.failed,
      }));
      setAllDetails((prev) => [...prev, ...result.details]);
      setCurrentOffset(result.nextOffset ?? currentOffset + batchSize);

      if (result.nextOffset === null) {
        toast({ title: 'Backfill complete', description: `All ${category} processed.` });
      }
    }

    setIsRunning(false);
    fetchStats(category);
  };

  const handleRunAll = async () => {
    setIsRunning(true);
    setIsPaused(false);
    pauseRef.current = false;

    let offset = currentOffset;
    let hasMore = true;

    while (hasMore && !pauseRef.current) {
      const result = await runBatch(offset);
      if (!result) {
        hasMore = false;
        break;
      }

      setTotals((prev) => ({
        processed: prev.processed + result.processed,
        updated: prev.updated + result.updated,
        skipped: prev.skipped + result.skipped,
        failed: prev.failed + result.failed,
      }));
      setAllDetails((prev) => [...prev, ...result.details]);

      if (result.nextOffset === null) {
        hasMore = false;
        setCurrentOffset(offset + result.processed);
        toast({ title: 'Backfill complete', description: `All ${category} processed.` });
      } else {
        offset = result.nextOffset;
        setCurrentOffset(result.nextOffset);
      }
    }

    setIsRunning(false);
    setIsPaused(false);
    fetchStats(category);
  };

  const handlePause = () => {
    pauseRef.current = true;
    setIsPaused(true);
  };

  const handleReset = () => {
    setCurrentOffset(0);
    setTotals({ processed: 0, updated: 0, skipped: 0, failed: 0 });
    setAllDetails([]);
    setIsPaused(false);
  };

  const currentStats = stats[category];
  const progressPercent = currentStats && currentStats.needsBackfill > 0
    ? Math.min(100, Math.round((totals.processed / currentStats.needsBackfill) * 100))
    : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Image Backfill
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Category stats overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CATEGORIES.map((cat) => {
              const s = stats[cat.value];
              return (
                <Card key={cat.value} className={`cursor-pointer transition-colors ${category === cat.value ? 'border-primary' : ''}`} onClick={() => { setCategory(cat.value); handleReset(); }}>
                  <CardContent className="p-3 text-center">
                    <p className="text-sm font-medium">{cat.label}</p>
                    {s ? (
                      <>
                        <p className="text-2xl font-bold">{s.needsBackfill}</p>
                        <p className="text-xs text-muted-foreground">
                          need images ({s.withImages}/{s.total} have images)
                        </p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Loading...</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <Select value={category} onValueChange={(v) => { setCategory(v as Category); handleReset(); }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button onClick={handleStartBatch} disabled={isRunning} variant="outline" size="sm">
              {isRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <SkipForward className="h-4 w-4 mr-1" />}
              Run Batch
            </Button>

            <Button onClick={handleRunAll} disabled={isRunning} size="sm">
              {isRunning ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Zap className="h-4 w-4 mr-1" />}
              Run All
            </Button>

            {isRunning && (
              <Button onClick={handlePause} variant="secondary" size="sm">
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </Button>
            )}

            <Button onClick={handleReset} disabled={isRunning} variant="ghost" size="sm">
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>

          {/* Progress */}
          {totals.processed > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Progress: {totals.processed} processed (offset {currentOffset})</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-2" />
              <div className="flex gap-4 text-sm">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                  {totals.updated} updated
                </span>
                <span className="flex items-center gap-1">
                  <SkipForward className="h-3 w-3 text-yellow-500" />
                  {totals.skipped} skipped
                </span>
                <span className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3 text-red-500" />
                  {totals.failed} failed
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results log */}
      {allDetails.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Results Log ({allDetails.length} records)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-[400px] overflow-y-auto space-y-1">
              {allDetails.map((detail, i) => (
                <div key={`${detail.id}-${i}`} className="flex items-center gap-2 text-sm py-1 border-b last:border-0">
                  <StatusBadge status={detail.status} />
                  {detail.source && detail.source !== 'none' && (
                    <Badge variant="outline" className="text-xs">{SOURCE_LABELS[detail.source]}</Badge>
                  )}
                  <span className="font-medium truncate max-w-[200px]">{detail.name || detail.id}</span>
                  {detail.imageUrl && (
                    <a
                      href={detail.imageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-500 underline text-xs truncate max-w-[200px]"
                    >
                      image
                    </a>
                  )}
                  {detail.reason && (
                    <span className="text-muted-foreground text-xs truncate">{detail.reason}</span>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'updated':
      return <Badge variant="default" className="bg-green-500 text-xs">Updated</Badge>;
    case 'skipped':
      return <Badge variant="secondary" className="text-xs">Skipped</Badge>;
    case 'failed':
      return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    case 'dry_run':
      return <Badge variant="outline" className="text-xs">Dry Run</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{status}</Badge>;
  }
}
