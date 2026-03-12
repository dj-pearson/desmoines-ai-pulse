/**
 * PseoAdmin — Admin dashboard for managing pSEO pages.
 *
 * Provides:
 * - Overview stats (total pages, published, drafts, quality, views, queue)
 * - Page list with filters and actions (publish/unpublish, delete)
 * - Single + batch page generation controls
 * - Generation queue monitor
 * - Generation logs viewer
 */

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart3,
  Eye,
  FileText,
  Globe,
  Layers,
  ListOrdered,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Trash2,
  Zap,
} from 'lucide-react';
import {
  usePseoStats,
  usePseoPages,
  usePseoQueue,
  usePseoLogs,
  useGeneratePage,
  useBatchGenerate,
  useTogglePublish,
  useDeletePage,
  getPageTypeOptions,
  type PseoFilters,
} from '../hooks/usePseoAdmin';
import { allPageTypes } from '../pageTypes';
import { getDimensionValues, type DimensionKey } from '../taxonomy';

// ---------------------------------------------------------------------------
// Sub-tab navigation within pSEO admin
// ---------------------------------------------------------------------------

const PSEO_TABS = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'pages', label: 'Pages', icon: FileText },
  { id: 'generate', label: 'Generate', icon: Zap },
  { id: 'queue', label: 'Queue', icon: ListOrdered },
  { id: 'logs', label: 'Logs', icon: Layers },
] as const;

type PseoTabId = (typeof PSEO_TABS)[number]['id'];

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function PseoAdmin() {
  const [activeTab, setActiveTab] = useState<PseoTabId>('overview');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">pSEO Manager</h2>
          <p className="text-muted-foreground">
            Manage programmatic SEO pages, generation queue, and content quality.
          </p>
        </div>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex items-center gap-1 border-b pb-2 overflow-x-auto">
        {PSEO_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'hover:bg-accent text-muted-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && <OverviewPanel />}
      {activeTab === 'pages' && <PagesPanel />}
      {activeTab === 'generate' && <GeneratePanel />}
      {activeTab === 'queue' && <QueuePanel />}
      {activeTab === 'logs' && <LogsPanel />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview Panel
// ---------------------------------------------------------------------------

function OverviewPanel() {
  const { data: stats, isLoading } = usePseoStats();

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (!stats) return null;

  const statCards = [
    { label: 'Total Pages', value: stats.totalPages, icon: FileText },
    { label: 'Published', value: stats.publishedPages, icon: Globe },
    { label: 'Drafts', value: stats.draftPages, icon: FileText },
    { label: 'Avg Quality', value: stats.averageQuality.toFixed(2), icon: BarChart3 },
    { label: 'Total Views', value: stats.totalViews.toLocaleString(), icon: Eye },
    { label: 'Queue Pending', value: stats.queuePending, icon: ListOrdered },
    { label: 'Queue Failed', value: stats.queueFailed, icon: Trash2 },
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {s.label}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{s.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pages by type breakdown */}
      {Object.keys(stats.pagesByType).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Pages by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {Object.entries(stats.pagesByType).map(([typeId, count]) => (
                <div
                  key={typeId}
                  className="flex items-center justify-between rounded-md border px-3 py-2"
                >
                  <span className="text-sm font-medium">{typeId}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pages Panel
// ---------------------------------------------------------------------------

function PagesPanel() {
  const [filters, setFilters] = useState<PseoFilters>({});
  const { data: pages, isLoading } = usePseoPages(filters);
  const togglePublish = useTogglePublish();
  const deletePage = useDeletePage();
  const pageTypeOptions = getPageTypeOptions();

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search pages..."
            className="pl-8 w-64"
            value={filters.search ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value || undefined }))}
          />
        </div>

        <Select
          value={filters.pageTypeId ?? 'all'}
          onValueChange={(v) =>
            setFilters((f) => ({ ...f, pageTypeId: v === 'all' ? undefined : v }))
          }
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="All page types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All page types</SelectItem>
            {pageTypeOptions.map((pt) => (
              <SelectItem key={pt.id} value={pt.id}>
                {pt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.isPublished === undefined ? 'all' : String(filters.isPublished)}
          onValueChange={(v) =>
            setFilters((f) => ({
              ...f,
              isPublished: v === 'all' ? undefined : v === 'true',
            }))
          }
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="true">Published</SelectItem>
            <SelectItem value="false">Draft</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Page Table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !pages?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No pages found.</p>
            <p className="text-sm">Generate some pages to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Slug</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quality</TableHead>
                <TableHead className="text-right">Views</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pages.map((page) => (
                <TableRow key={page.id}>
                  <TableCell className="font-mono text-xs max-w-[200px] truncate">
                    {page.slug}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {page.page_type_id}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={page.is_published ? 'default' : 'secondary'}>
                      {page.is_published ? 'Published' : 'Draft'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {page.quality_score ? (
                      <span
                        className={
                          page.quality_score >= 0.8
                            ? 'text-green-600'
                            : page.quality_score >= 0.6
                              ? 'text-yellow-600'
                              : 'text-red-600'
                        }
                      >
                        {page.quality_score.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">{page.view_count}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(page.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          togglePublish.mutate({
                            pageId: page.id,
                            publish: !page.is_published,
                          })
                        }
                        disabled={togglePublish.isPending}
                      >
                        {page.is_published ? 'Unpublish' : 'Publish'}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          if (confirm('Delete this page? This cannot be undone.')) {
                            deletePage.mutate(page.id);
                          }
                        }}
                        disabled={deletePage.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Generate Panel
// ---------------------------------------------------------------------------

function GeneratePanel() {
  const pageTypeOptions = getPageTypeOptions();
  const generatePage = useGeneratePage();
  const batchGenerate = useBatchGenerate();

  const [selectedPageType, setSelectedPageType] = useState(pageTypeOptions[0]?.id ?? '');
  const [batchTier, setBatchTier] = useState('1');
  const [batchSize, setBatchSize] = useState('5');

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* Single Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="h-5 w-5" />
            Single Page Generation
          </CardTitle>
          <CardDescription>
            Generate one page for a specific page type. Dimensions are auto-selected from the
            taxonomy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedPageType} onValueChange={setSelectedPageType}>
            <SelectTrigger>
              <SelectValue placeholder="Select page type" />
            </SelectTrigger>
            <SelectContent>
              {pageTypeOptions.map((pt) => (
                <SelectItem key={pt.id} value={pt.id}>
                  <span>{pt.name}</span>
                  <span className="text-muted-foreground ml-2 text-xs">
                    (~{pt.estimatedPages} pages)
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="text-sm text-muted-foreground">
            {pageTypeOptions.find((pt) => pt.id === selectedPageType)?.reason}
          </div>

          <Button
            onClick={() => {
              // Use first tier-1 combination for quick generation
              const pt = allPageTypes.find((p) => p.id === selectedPageType);
              if (!pt) return;

              const dims = (pt.dimensions as DimensionKey[]).map((key) => {
                const vals = getDimensionValues(key);
                const v = vals[0];
                return { dimension: v.dimension, slug: v.slug, name: v.name, tier: v.tier };
              });

              generatePage.mutate({
                pageTypeId: selectedPageType,
                dimensions: dims,
              });
            }}
            disabled={generatePage.isPending || !selectedPageType}
          >
            {generatePage.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Generate Page
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Batch Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Batch Generation
          </CardTitle>
          <CardDescription>
            Generate multiple pages at once. Uses a 2-second delay between requests for rate
            limiting.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedPageType} onValueChange={setSelectedPageType}>
            <SelectTrigger>
              <SelectValue placeholder="Select page type" />
            </SelectTrigger>
            <SelectContent>
              {pageTypeOptions.map((pt) => (
                <SelectItem key={pt.id} value={pt.id}>
                  {pt.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Max Tier</label>
              <Select value={batchTier} onValueChange={setBatchTier}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Tier 1 (High priority)</SelectItem>
                  <SelectItem value="2">Tier 1-2</SelectItem>
                  <SelectItem value="3">Tier 1-3 (All)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Batch Size</label>
              <Select value={batchSize} onValueChange={setBatchSize}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 pages</SelectItem>
                  <SelectItem value="5">5 pages</SelectItem>
                  <SelectItem value="10">10 pages</SelectItem>
                  <SelectItem value="20">20 pages</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={() =>
              batchGenerate.mutate({
                pageTypeId: selectedPageType,
                tier: Number(batchTier),
                batchSize: Number(batchSize),
              })
            }
            disabled={batchGenerate.isPending || !selectedPageType}
            variant="secondary"
          >
            {batchGenerate.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating batch...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Start Batch ({batchSize} pages)
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Priority Guide */}
      <Card className="md:col-span-2">
        <CardHeader>
          <CardTitle className="text-lg">Generation Priority</CardTitle>
          <CardDescription>
            Page types ordered by recommended generation priority.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Page Type</TableHead>
                  <TableHead className="text-right">Est. Pages</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageTypeOptions.map((pt, i) => (
                  <TableRow key={pt.id}>
                    <TableCell className="font-medium">{i + 1}</TableCell>
                    <TableCell>{pt.name}</TableCell>
                    <TableCell className="text-right">{pt.estimatedPages}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{pt.reason}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Queue Panel
// ---------------------------------------------------------------------------

function QueuePanel() {
  const { data: queue, isLoading, refetch } = usePseoQueue();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Auto-refreshes every 15 seconds.</p>
        <Button size="sm" variant="outline" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !queue?.length ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ListOrdered className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>Queue is empty.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Page Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {queue.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {item.page_type_id}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        item.status === 'completed'
                          ? 'default'
                          : item.status === 'failed'
                            ? 'destructive'
                            : item.status === 'processing'
                              ? 'default'
                              : 'secondary'
                      }
                    >
                      {item.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{item.tier}</TableCell>
                  <TableCell>{item.priority}</TableCell>
                  <TableCell>{item.attempts}</TableCell>
                  <TableCell className="max-w-[200px] truncate text-xs text-muted-foreground">
                    {item.error_message ?? '—'}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(item.created_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Logs Panel
// ---------------------------------------------------------------------------

function LogsPanel() {
  const { data: logs, isLoading } = usePseoLogs(50);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!logs?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No generation logs yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Action</TableHead>
            <TableHead>Page ID</TableHead>
            <TableHead>Model</TableHead>
            <TableHead className="text-right">Tokens (in/out)</TableHead>
            <TableHead className="text-right">Time (ms)</TableHead>
            <TableHead className="text-right">Quality</TableHead>
            <TableHead>Timestamp</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell>
                <Badge variant="outline">{log.action}</Badge>
              </TableCell>
              <TableCell className="font-mono text-xs max-w-[120px] truncate">
                {log.page_id}
              </TableCell>
              <TableCell className="text-xs">{log.model_used ?? '—'}</TableCell>
              <TableCell className="text-right text-xs">
                {log.input_tokens != null
                  ? `${log.input_tokens.toLocaleString()} / ${(log.output_tokens ?? 0).toLocaleString()}`
                  : '—'}
              </TableCell>
              <TableCell className="text-right text-xs">
                {log.generation_time_ms?.toLocaleString() ?? '—'}
              </TableCell>
              <TableCell className="text-right">
                {log.quality_score != null ? (
                  <span
                    className={
                      log.quality_score >= 0.8
                        ? 'text-green-600'
                        : log.quality_score >= 0.6
                          ? 'text-yellow-600'
                          : 'text-red-600'
                    }
                  >
                    {log.quality_score.toFixed(2)}
                  </span>
                ) : (
                  '—'
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(log.created_at).toLocaleString()}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
