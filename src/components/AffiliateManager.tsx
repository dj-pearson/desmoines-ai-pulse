import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { 
  Link, 
  ExternalLink, 
  Save, 
  RefreshCw, 
  AlertTriangle,
  CheckCircle,
  Globe,
  DollarSign,
  Target
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface UniqueURL {
  domain: string;
  originalUrl: string;
  affiliateUrl: string;
  categories: string[];
  count: number;
  isProcessing: boolean;
}

export default function AffiliateManager() {
  const [uniqueUrls, setUniqueUrls] = useState<UniqueURL[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [processingStats, setProcessingStats] = useState({
    totalProcessed: 0,
    totalUpdated: 0,
    errors: 0
  });

  // Extract domain from URL
  const extractDomain = (url: string): string => {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      return urlObj.hostname.replace('www.', '');
    } catch {
      return url.split('/')[0].replace('www.', '');
    }
  };

  // Fetch all unique URLs from all tables
  const fetchUniqueUrls = async () => {
    setIsLoading(true);
    try {
      const urlMap = new Map<string, UniqueURL>();

      // Define tables and their URL columns
      const tableConfigs = [
        { table: 'events', urlColumns: ['source_url', 'website'] },
        { table: 'restaurants', urlColumns: ['source_url', 'website'] },
        { table: 'attractions', urlColumns: ['source_url', 'website'] },
        { table: 'playgrounds', urlColumns: ['source_url', 'website'] },
        { table: 'restaurant_openings', urlColumns: ['source_url', 'website'] }
      ];

      for (const config of tableConfigs) {
        // Fetch all records from each table
        const { data, error } = await supabase
          .from(config.table)
          .select(config.urlColumns.join(','));

        if (error) {
          console.error(`Error fetching from ${config.table}:`, error);
          continue;
        }

        if (data) {
          data.forEach((record: any) => {
            config.urlColumns.forEach(column => {
              const url = record[column];
              if (url && url.trim()) {
                const domain = extractDomain(url);
                const key = domain;
                
                if (urlMap.has(key)) {
                  const existing = urlMap.get(key)!;
                  existing.count += 1;
                  if (!existing.categories.includes(config.table)) {
                    existing.categories.push(config.table);
                  }
                } else {
                  urlMap.set(key, {
                    domain,
                    originalUrl: url,
                    affiliateUrl: '',
                    categories: [config.table],
                    count: 1,
                    isProcessing: false
                  });
                }
              }
            });
          });
        }
      }

      const urls = Array.from(urlMap.values()).sort((a, b) => b.count - a.count);
      setUniqueUrls(urls);
    } catch (error) {
      console.error('Error fetching URLs:', error);
      toast.error('Failed to fetch URLs');
    } finally {
      setIsLoading(false);
    }
  };

  // Update affiliate URL for a domain
  const updateAffiliateUrl = (domain: string, affiliateUrl: string) => {
    setUniqueUrls(prev => 
      prev.map(url => 
        url.domain === domain 
          ? { ...url, affiliateUrl } 
          : url
      )
    );
  };

  // Process affiliate URL replacement for a specific domain
  const processAffiliateReplacement = async (urlData: UniqueURL) => {
    if (!urlData.affiliateUrl.trim()) {
      toast.error('Please enter an affiliate URL');
      return;
    }

    // Mark as processing
    setUniqueUrls(prev => 
      prev.map(url => 
        url.domain === urlData.domain 
          ? { ...url, isProcessing: true } 
          : url
      )
    );

    try {
      let totalUpdated = 0;
      const domain = urlData.domain;
      const newAffiliateUrl = urlData.affiliateUrl;

      // Define tables and their URL columns
      const tableConfigs = [
        { table: 'events', urlColumns: ['source_url', 'website'] },
        { table: 'restaurants', urlColumns: ['source_url', 'website'] },
        { table: 'attractions', urlColumns: ['source_url', 'website'] },
        { table: 'playgrounds', urlColumns: ['source_url', 'website'] },
        { table: 'restaurant_openings', urlColumns: ['source_url', 'website'] }
      ];

      for (const config of tableConfigs) {
        // Only process categories that contain this domain
        if (!urlData.categories.includes(config.table)) continue;

        for (const column of config.urlColumns) {
          // Find records that contain this domain
          const { data, error } = await supabase
            .from(config.table)
            .select(`id, ${column}`)
            .not(column, 'is', null);

          if (error) {
            console.error(`Error fetching from ${config.table}.${column}:`, error);
            continue;
          }

          if (data) {
            const recordsToUpdate = data.filter(record => {
              const url = record[column];
              return url && extractDomain(url) === domain;
            });

            // Update each matching record
            for (const record of recordsToUpdate) {
              const updateData = { [column]: newAffiliateUrl };
              
              const { error: updateError } = await supabase
                .from(config.table)
                .update(updateData)
                .eq('id', record.id);

              if (updateError) {
                console.error(`Error updating ${config.table}.${column}:`, updateError);
              } else {
                totalUpdated++;
              }
            }
          }
        }
      }

      toast.success(`Successfully updated ${totalUpdated} URLs for ${domain}`);
      
      // Update stats
      setProcessingStats(prev => ({
        totalProcessed: prev.totalProcessed + 1,
        totalUpdated: prev.totalUpdated + totalUpdated,
        errors: prev.errors
      }));

      // Refresh the URL list
      await fetchUniqueUrls();

    } catch (error) {
      console.error('Error processing affiliate replacement:', error);
      toast.error('Failed to update URLs');
      
      setProcessingStats(prev => ({
        ...prev,
        errors: prev.errors + 1
      }));
    } finally {
      // Remove processing state
      setUniqueUrls(prev => 
        prev.map(url => 
          url.domain === urlData.domain 
            ? { ...url, isProcessing: false } 
            : url
        )
      );
    }
  };

  // Refresh all URLs
  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchUniqueUrls();
    setIsRefreshing(false);
    toast.success('URLs refreshed successfully');
  };

  useEffect(() => {
    fetchUniqueUrls();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Loading unique URLs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-green-600" />
            Affiliate Link Manager
          </h2>
          <p className="text-muted-foreground">
            Manage and update affiliate URLs across all content tables
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh URLs
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Unique Domains</p>
                <p className="text-2xl font-bold">{uniqueUrls.length}</p>
              </div>
              <Globe className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total URLs</p>
                <p className="text-2xl font-bold">{uniqueUrls.reduce((sum, url) => sum + url.count, 0)}</p>
              </div>
              <Link className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Processed</p>
                <p className="text-2xl font-bold">{processingStats.totalProcessed}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Updated URLs</p>
                <p className="text-2xl font-bold">{processingStats.totalUpdated}</p>
              </div>
              <Target className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Instructions */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          <strong>How it works:</strong> This tool finds all unique domains from your content tables. 
          Enter your affiliate URL (with UTM parameters) for each domain, then click "Update URLs" 
          to replace all matching URLs across events, restaurants, attractions, playgrounds, and restaurant openings.
        </AlertDescription>
      </Alert>

      {/* URL Management Table */}
      <Card>
        <CardHeader>
          <CardTitle>Domain Management</CardTitle>
          <CardDescription>
            Manage affiliate URLs for each unique domain found in your content
          </CardDescription>
        </CardHeader>
        <CardContent>
          {uniqueUrls.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Domain</TableHead>
                    <TableHead>Sample URL</TableHead>
                    <TableHead>Categories</TableHead>
                    <TableHead>Count</TableHead>
                    <TableHead>Affiliate URL</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uniqueUrls.map((urlData) => (
                    <TableRow key={urlData.domain}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Globe className="h-4 w-4 text-muted-foreground" />
                          {urlData.domain}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs truncate text-sm text-muted-foreground">
                          {urlData.originalUrl}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {urlData.categories.map(category => (
                            <Badge key={category} variant="secondary" className="text-xs">
                              {category}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{urlData.count}</Badge>
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="https://example.com?utm_source=desmoinesinsider"
                          value={urlData.affiliateUrl}
                          onChange={(e) => updateAffiliateUrl(urlData.domain, e.target.value)}
                          disabled={urlData.isProcessing}
                          className="min-w-64"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => processAffiliateReplacement(urlData)}
                          disabled={urlData.isProcessing || !urlData.affiliateUrl.trim()}
                          size="sm"
                        >
                          {urlData.isProcessing ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Updating...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Update URLs
                            </>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-12">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No URLs Found</h3>
              <p className="text-muted-foreground">
                No URLs were found in your content tables. Add some content first, then refresh.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
