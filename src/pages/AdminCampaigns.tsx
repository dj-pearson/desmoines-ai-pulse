import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminCampaigns } from "@/hooks/useAdminCampaigns";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Filter, Eye, DollarSign, Calendar, User, Settings, Megaphone, XCircle } from "lucide-react";
import { AdRateManager } from "@/components/admin/AdRateManager";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SponsoredBadge } from "@/components/SponsoredBadge";

interface SponsoredListingRow {
  id: string;
  campaign_id: string;
  listing_type: 'event' | 'restaurant';
  listing_id: string;
  created_at: string;
  listing_name: string;
  campaign_name: string;
  campaign_end_date: string | null;
  campaign_status: string;
}

const statusColors: Record<string, string> = {
  draft: "bg-gray-500",
  pending_payment: "bg-yellow-500",
  pending_creative: "bg-blue-500",
  pending_review: "bg-indigo-500",
  active: "bg-green-500",
  completed: "bg-gray-400",
  cancelled: "bg-red-500",
  rejected: "bg-red-600",
  refunded: "bg-purple-500",
};

const statusLabels: Record<string, string> = {
  draft: "Draft",
  pending_payment: "Pending Payment",
  pending_creative: "Awaiting Creatives",
  pending_review: "Under Review",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
  refunded: "Refunded",
};

export default function AdminCampaigns() {
  const navigate = useNavigate();
  const { campaigns, isLoading, fetchCampaigns } = useAdminCampaigns();
  const { toast } = useToast();
  useDocumentTitle("Campaign Management");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sponsoredListings, setSponsoredListings] = useState<SponsoredListingRow[]>([]);
  const [sponsoredLoading, setSponsoredLoading] = useState(false);
  const [endingId, setEndingId] = useState<string | null>(null);

  useEffect(() => {
    applyFilters();
  }, [searchQuery, statusFilter, dateFrom, dateTo]);

  const applyFilters = () => {
    fetchCampaigns({
      status: statusFilter !== "all" ? statusFilter : undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      searchQuery: searchQuery || undefined,
    });
  };

  const fetchSponsoredListings = useCallback(async () => {
    setSponsoredLoading(true);
    try {
      const { data: links, error } = await supabase
        .from('sponsored_listing_links')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const enriched: SponsoredListingRow[] = await Promise.all(
        (links || []).map(async (link) => {
          // Fetch listing name
          const listingTable = link.listing_type === 'event' ? 'events' : 'restaurants';
          const nameField = link.listing_type === 'event' ? 'title' : 'name';
          const { data: listing } = await supabase
            .from(listingTable)
            .select(`id, ${nameField}`)
            .eq('id', link.listing_id)
            .maybeSingle();

          // Fetch campaign info
          const { data: campaign } = await supabase
            .from('campaigns')
            .select('name, end_date, status')
            .eq('id', link.campaign_id)
            .maybeSingle();

          return {
            id: link.id,
            campaign_id: link.campaign_id,
            listing_type: link.listing_type as 'event' | 'restaurant',
            listing_id: link.listing_id,
            created_at: link.created_at,
            listing_name: listing ? (listing as any)[nameField] : 'Unknown listing',
            campaign_name: campaign?.name ?? 'Unknown campaign',
            campaign_end_date: campaign?.end_date ?? null,
            campaign_status: campaign?.status ?? 'unknown',
          };
        })
      );

      setSponsoredListings(enriched);
    } catch (err) {
      console.error('Failed to fetch sponsored listings:', err);
    } finally {
      setSponsoredLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSponsoredListings();
  }, [fetchSponsoredListings]);

  const handleEndSponsorshipEarly = async (row: SponsoredListingRow) => {
    setEndingId(row.id);
    try {
      // Clear is_sponsored on the listing
      const table = row.listing_type === 'event' ? 'events' : 'restaurants';
      const { error: listingError } = await supabase
        .from(table)
        .update({ is_sponsored: false, sponsored_until: null })
        .eq('id', row.listing_id);

      if (listingError) throw listingError;

      // Mark the campaign as cancelled
      const { error: campaignError } = await supabase
        .from('campaigns')
        .update({ status: 'cancelled' })
        .eq('id', row.campaign_id);

      if (campaignError) throw campaignError;

      toast({
        title: 'Sponsorship Ended',
        description: `"${row.listing_name}" is no longer sponsored.`,
      });

      // Refresh lists
      fetchSponsoredListings();
      applyFilters();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to end sponsorship. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setEndingId(null);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getPendingCreativesCount = (campaign: any) => {
    return campaign.campaign_creatives?.filter((c: any) => !c.is_approved).length || 0;
  };

  const getTotalCreativesCount = (campaign: any) => {
    return campaign.campaign_creatives?.length || 0;
  };

  // Calculate summary stats
  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c) => c.status === 'active').length,
    pending: campaigns.filter((c) => ['pending_creative', 'pending_review'].includes(c.status)).length,
    needsReview: campaigns.filter((c) =>
      c.campaign_creatives?.some((cr) => !cr.is_approved) && ['pending_creative', 'pending_review'].includes(c.status)
    ).length,
    revenue: campaigns
      .filter((c) => c.status === 'active' || c.status === 'completed')
      .reduce((sum, c) => sum + (c.total_cost || 0), 0),
  };

  if (isLoading && campaigns.length === 0) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <Skeleton className="h-12 w-64 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Campaign Management</h1>
        <p className="text-muted-foreground">
          Manage all advertising campaigns, review creatives, and monitor performance
        </p>
      </div>

      <Tabs defaultValue="campaigns" className="space-y-6">
        <TabsList>
          <TabsTrigger value="campaigns">
            Campaigns
            {stats.needsReview > 0 && (
              <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0">{stats.needsReview}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sponsored">
            <Megaphone className="h-4 w-4 mr-1" />
            Sponsored Listings
            {sponsoredListings.filter(s => s.campaign_status === 'active').length > 0 && (
              <Badge className="ml-2 bg-amber-500 text-white text-xs px-1.5 py-0">
                {sponsoredListings.filter(s => s.campaign_status === 'active').length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rates">
            <Settings className="h-4 w-4 mr-1" />
            Rate Management
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Campaigns</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                <div className="h-4 w-4 rounded-full bg-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold">{stats.pending}</p>
              </div>
              <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                <div className="h-4 w-4 rounded-full bg-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Revenue</p>
                <p className="text-2xl font-bold">{formatCurrency(stats.revenue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search campaigns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="pending_payment">Pending Payment</SelectItem>
                <SelectItem value="pending_creative">Awaiting Creatives</SelectItem>
                <SelectItem value="pending_review">Under Review</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>

            <Input
              type="date"
              placeholder="From date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />

            <Input
              type="date"
              placeholder="To date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Campaigns Table */}
      <Card>
        <CardHeader>
          <CardTitle>Campaigns</CardTitle>
          <CardDescription>
            {campaigns.length} campaign{campaigns.length !== 1 ? 's' : ''} found
          </CardDescription>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No campaigns found</h3>
              <p className="text-muted-foreground">
                Try adjusting your filters or search query
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Advertiser</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Dates</TableHead>
                    <TableHead>Creatives</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id}>
                      <TableCell>
                        <div>
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {campaign.id.slice(0, 8).toUpperCase()}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm">{campaign.user_name || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">
                              {campaign.user_email}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[campaign.status]}>
                          {statusLabels[campaign.status] || campaign.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>{campaign.start_date ? formatDate(campaign.start_date) : 'N/A'}</p>
                          <p className="text-muted-foreground">
                            {campaign.end_date ? formatDate(campaign.end_date) : 'N/A'}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <p>
                            {getTotalCreativesCount(campaign)} total
                          </p>
                          {getPendingCreativesCount(campaign) > 0 && (
                            <Badge variant="outline" className="text-xs">
                              {getPendingCreativesCount(campaign)} pending
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {formatCurrency(campaign.total_cost || 0)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/admin/campaigns/${campaign.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="sponsored">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-amber-500" />
                Sponsored Listings
              </CardTitle>
              <CardDescription>
                Active and historical sponsored listing campaigns. Use "End Early" to immediately remove a sponsorship badge and cancel the campaign.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sponsoredLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : sponsoredListings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Megaphone className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">No sponsored listings yet</p>
                  <p className="text-sm mt-1">When businesses sponsor an event or restaurant, they will appear here.</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Listing</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Campaign</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Ends</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sponsoredListings.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            {row.campaign_status === 'active' && <SponsoredBadge />}
                            <span>{row.listing_name}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{row.listing_type}</Badge>
                        </TableCell>
                        <TableCell>
                          <button
                            className="text-sm text-primary underline-offset-2 hover:underline"
                            onClick={() => navigate(`/admin/campaigns/${row.campaign_id}`)}
                          >
                            {row.campaign_name}
                          </button>
                        </TableCell>
                        <TableCell>
                          <Badge
                            className={`text-white text-xs ${
                              row.campaign_status === 'active'
                                ? 'bg-green-500'
                                : row.campaign_status === 'completed'
                                ? 'bg-gray-400'
                                : row.campaign_status === 'cancelled'
                                ? 'bg-red-500'
                                : 'bg-yellow-500'
                            }`}
                          >
                            {row.campaign_status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {row.campaign_end_date
                            ? new Date(row.campaign_end_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </TableCell>
                        <TableCell>
                          {row.campaign_status === 'active' && (
                            <Button
                              variant="destructive"
                              size="sm"
                              disabled={endingId === row.id}
                              onClick={() => handleEndSponsorshipEarly(row)}
                            >
                              <XCircle className="h-4 w-4 mr-1" />
                              {endingId === row.id ? 'Ending…' : 'End Early'}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rates">
          <AdRateManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
