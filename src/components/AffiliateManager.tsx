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
import { createLogger } from '@/lib/logger';

const log = createLogger('AffiliateManager');

interface UniqueURL {
  domain: string;
  originalUrl: string;
  utmParameters: string;
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
        { table: 'events' as const, urlColumns: ['source_url'] },
        { table: 'restaurants' as const, urlColumns: ['source_url', 'website'] },
        { table: 'attractions' as const, urlColumns: ['website'] },
        { table: 'playgrounds' as const, urlColumns: ['source_url', 'website'] },
        { table: 'restaurant_openings' as const, urlColumns: ['source_url', 'website'] }
      ];

      for (const config of tableConfigs) {
        log.debug('fetchUrls', `Scanning table: ${config.table} for columns: ${config.urlColumns.join(', ')}`);
        
        // Fetch all records from each table
        const { data, error } = await supabase
          .from(config.table)
          .select(config.urlColumns.join(','));

        if (error) {
          log.error('fetchUrls', `Error fetching from ${config.table}`, { data: error });
          continue;
        }

        if (data) {
          log.debug('fetchUrls', `Found ${data.length} records in ${config.table}`);
          let urlsFoundInTable = 0;
          data.forEach((record: any) => {
            config.urlColumns.forEach(column => {
              const url = record[column];
              if (url && url.trim()) {
                urlsFoundInTable++;
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
                    utmParameters: '',
                    categories: [config.table],
                    count: 1,
                    isProcessing: false
                  });
                }
              }
            });
          });
          log.debug('fetchUrls', `Found ${urlsFoundInTable} URLs in ${config.table}`);
        }
      }

      const urls = Array.from(urlMap.values()).sort((a, b) => b.count - a.count);
      setUniqueUrls(urls);
    } catch (error) {
      log.error('fetchUrls', 'Error fetching URLs', { data: error });
      toast.error('Failed to fetch URLs');
    } finally {
      setIsLoading(false);
    }
  };

  // Update UTM parameters for a domain
  const updateUtmParameters = (domain: string, utmParameters: string) => {
    setUniqueUrls(prev => 
      prev.map(url => 
        url.domain === domain 
          ? { ...url, utmParameters } 
          : url
      )
    );
  };

  // Helper function to append UTM parameters to a URL
  const appendUtmToUrl = (originalUrl: string, utmParameters: string): string => {
    if (!utmParameters.trim()) return originalUrl;
    
    try {
      const url = new URL(originalUrl.startsWith('http') ? originalUrl : `https://${originalUrl}`);
      
      // Parse UTM parameters
      const utmString = utmParameters.startsWith('?') ? utmParameters.substring(1) : utmParameters;
      const utmParams = new URLSearchParams(utmString);
      
      // Add UTM parameters to the URL
      utmParams.forEach((value, key) => {
        url.searchParams.set(key, value);
      });
      
      return url.toString();
    } catch (error) {
      log.error('appendUtm', 'Error appending UTM parameters', { data: error });
      return originalUrl;
    }
  };

  // Process UTM parameter addition for a specific domain
  const processUtmParameterAddition = async (urlData: UniqueURL) => {
    if (!urlData.utmParameters.trim()) {
      toast.error('Please enter UTM parameters');
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
      const utmParameters = urlData.utmParameters;

      // Define tables and their URL columns
      const tableConfigs = [
        { table: 'events' as const, urlColumns: ['source_url'] },
        { table: 'restaurants' as const, urlColumns: ['source_url', 'website'] },
        { table: 'attractions' as const, urlColumns: ['website'] },
        { table: 'playgrounds' as const, urlColumns: ['source_url', 'website'] },
        { table: 'restaurant_openings' as const, urlColumns: ['source_url', 'website'] }
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
            log.error('processUtm', `Error fetching from ${config.table}.${column}`, { data: error });
            continue;
          }

          if (data) {
            const recordsToUpdate = data.filter(record => {
              const url = record[column];
              return url && extractDomain(url) === domain;
            });

            // Update each matching record with UTM parameters
            for (const record of recordsToUpdate) {
              const originalUrl = record[column];
              const urlWithUtm = appendUtmToUrl(originalUrl, utmParameters);
              const updateData = { [column]: urlWithUtm };
              
              const { error: updateError } = await supabase
                .from(config.table)
                .update(updateData)
                .eq('id', (record as any).id);

              if (updateError) {
                log.error('processUtm', `Error updating ${config.table}.${column}`, { data: updateError });
              } else {
                totalUpdated++;
              }
            }
          }
        }
      }

      toast.success(`Successfully added UTM parameters to ${totalUpdated} URLs for ${domain}`);
      
      // Update stats
      setProcessingStats(prev => ({
        totalProcessed: prev.totalProcessed + 1,
        totalUpdated: prev.totalUpdated + totalUpdated,
        errors: prev.errors
      }));

      // Refresh the URL list
      await fetchUniqueUrls();

    } catch (error) {
      log.error('processUtm', 'Error processing UTM parameter addition', { data: error });
      toast.error('Failed to add UTM parameters');
      
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
            UTM Parameter Manager
          </h2>
          <p className="text-muted-foreground">
            Add UTM tracking parameters to URLs across all content tables
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
          Enter UTM parameters (e.g., ?utm_source=desmoinesinsider&utm_medium=website&utm_campaign=events) for each domain, 
          then click "Add UTM Parameters" to append tracking parameters to all matching URLs across events, restaurants, attractions, playgrounds, and restaurant openings.
        </AlertDescription>
      </Alert>

      {/* URL Management Table */}
      <Card>
        <CardHeader>
          <CardTitle>UTM Parameter Management</CardTitle>
          <CardDescription>
            Add UTM tracking parameters to URLs for each unique domain found in your content
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
                    <TableHead>UTM Parameters</TableHead>
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
                          placeholder="?utm_source=desmoinesinsider&utm_medium=website&utm_campaign=events"
                          value={urlData.utmParameters}
                          onChange={(e) => updateUtmParameters(urlData.domain, e.target.value)}
                          disabled={urlData.isProcessing}
                          className="min-w-96"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          onClick={() => processUtmParameterAddition(urlData)}
                          disabled={urlData.isProcessing || !urlData.utmParameters.trim()}
                          size="sm"
                        >
                          {urlData.isProcessing ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Adding...
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-2" />
                              Add UTM Parameters
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
