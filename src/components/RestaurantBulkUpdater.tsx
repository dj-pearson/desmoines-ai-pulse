import React, { useState } from 'react';
import { useBulkRestaurantUpdate } from '@/hooks/useBulkRestaurantUpdate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  RefreshCw, 
  MapPin, 
  Star, 
  Phone, 
  Globe, 
  Camera, 
  AlertCircle, 
  CheckCircle,
  Clock,
  Database
} from 'lucide-react';
import { createLogger } from '@/lib/logger';

const log = createLogger('RestaurantBulkUpdater');

export function RestaurantBulkUpdater() {
  const { updateRestaurants, isLoading, progress, result, clearResult } = useBulkRestaurantUpdate();
  const [batchSize, setBatchSize] = useState(10);
  const [forceUpdate, setForceUpdate] = useState(false);

  const handleUpdate = async () => {
    try {
      await updateRestaurants({
        batchSize,
        forceUpdate
      });
    } catch (error) {
      log.error('update', 'Update failed', { data: error });
    }
  };

  const getUpdateIcon = (field: string) => {
    switch (field) {
      case 'location': return <MapPin className="h-4 w-4" />;
      case 'rating': return <Star className="h-4 w-4" />;
      case 'phone': return <Phone className="h-4 w-4" />;
      case 'website': return <Globe className="h-4 w-4" />;
      case 'image_url': return <Camera className="h-4 w-4" />;
      case 'google_place_id': return <Database className="h-4 w-4" />;
      default: return <RefreshCw className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Bulk Restaurant Updater
          </CardTitle>
          <CardDescription>
            Update restaurant information using Google Places (New) API. This will enhance restaurants with 
            accurate cuisine types, locations, ratings, descriptions, contact info, and images.
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Configuration Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Update Configuration</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="batchSize">Batch Size</Label>
                <Input
                  id="batchSize"
                  type="number"
                  min="1"
                  max="50"
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseInt(e.target.value) || 10)}
                  disabled={isLoading}
                />
                <p className="text-sm text-muted-foreground">
                  Number of restaurants to process per batch (1-50)
                </p>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="forceUpdate"
                    checked={forceUpdate}
                    onCheckedChange={(checked) => setForceUpdate(checked === true)}
                    disabled={isLoading}
                  />
                  <Label htmlFor="forceUpdate">Force Update</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Update all restaurants, including already enhanced ones
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* What Gets Updated Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Fields Updated</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { field: 'cuisine', label: 'Cuisine Type', icon: 'restaurant' },
                { field: 'location', label: 'Address', icon: 'location' },
                { field: 'rating', label: 'Google Rating', icon: 'rating' },
                { field: 'description', label: 'Description', icon: 'description' },
                { field: 'phone', label: 'Phone Number', icon: 'phone' },
                { field: 'website', label: 'Website URL', icon: 'website' },
                { field: 'image_url', label: 'Main Image', icon: 'image_url' },
                { field: 'google_place_id', label: 'Google Place ID', icon: 'google_place_id' }
              ].map(({ field, label, icon }) => (
                <div key={field} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                  {getUpdateIcon(icon)}
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator />

          {/* Progress Section */}
          {(isLoading || progress) && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Progress
              </h3>
              
              {isLoading && (
                <div className="space-y-2">
                  <Progress value={undefined} className="w-full" />
                  <p className="text-sm text-muted-foreground">{progress}</p>
                </div>
              )}
              
              {!isLoading && progress && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>{progress}</AlertDescription>
                </Alert>
              )}
            </div>
          )}

          {/* Results Section */}
          {result && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Update Results</h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">{result.processed}</div>
                    <p className="text-sm text-muted-foreground">Processed</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-green-600">{result.updated}</div>
                    <p className="text-sm text-muted-foreground">Updated</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold text-red-600">{result.errors}</div>
                    <p className="text-sm text-muted-foreground">Errors</p>
                  </CardContent>
                </Card>
                
                <Card>
                  <CardContent className="p-4">
                    <div className="text-2xl font-bold">
                      {result.processed > 0 ? Math.round((result.updated / result.processed) * 100) : 0}%
                    </div>
                    <p className="text-sm text-muted-foreground">Success Rate</p>
                  </CardContent>
                </Card>
              </div>

              {result.success ? (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    {result.message}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {result.message}
                  </AlertDescription>
                </Alert>
              )}

              {/* Error Details */}
              {result.errorDetails && result.errorDetails.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-red-600">Error Details:</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {result.errorDetails.map((error, index) => (
                      <Alert key={index} variant="destructive" className="py-2">
                        <AlertDescription className="text-sm">
                          <strong>{error.name}:</strong> {error.error}
                        </AlertDescription>
                      </Alert>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button 
              onClick={handleUpdate} 
              disabled={isLoading}
              className="flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4" />
                  Start Update
                </>
              )}
            </Button>
            
            {result && (
              <Button 
                variant="outline" 
                onClick={clearResult}
                disabled={isLoading}
              >
                Clear Results
              </Button>
            )}
          </div>

          {/* Important Notes */}
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Important:</strong> This process uses the Google Places (New) API and may take time 
              for large batches. Restaurants marked as "enhanced: completed" will be skipped unless 
              "Force Update" is enabled. The process includes rate limiting to avoid API quota issues.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
