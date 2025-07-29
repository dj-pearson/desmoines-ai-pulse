import React, { useState } from 'react';
import { useBulkRestaurantUpdate } from '@/hooks/useBulkRestaurantUpdate';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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

export function RestaurantBulkUpdaterSimple() {
  const { updateRestaurants, isLoading, progress, result, clearResult } = useBulkRestaurantUpdate();
  const [batchSize, setBatchSize] = useState(3); // Smaller batch for testing
  const [forceUpdate, setForceUpdate] = useState(false);
  const [clearEnhanced, setClearEnhanced] = useState(false);

  const handleUpdate = async () => {
    try {
      await updateRestaurants({
        batchSize,
        forceUpdate,
        clearEnhanced
      });
    } catch (error) {
      console.error('Update failed:', error);
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
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="clearEnhanced"
                    checked={clearEnhanced}
                    onCheckedChange={(checked) => setClearEnhanced(checked === true)}
                    disabled={isLoading}
                  />
                  <Label htmlFor="clearEnhanced">Clear Enhanced Status</Label>
                </div>
                <p className="text-sm text-muted-foreground">
                  Reset enhancement status before updating (for testing)
                </p>
              </div>
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* What Gets Updated Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Fields Updated</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                { label: 'Cuisine Type', icon: RefreshCw },
                { label: 'Address', icon: MapPin },
                { label: 'Google Rating', icon: Star },
                { label: 'Description', icon: RefreshCw },
                { label: 'Phone Number', icon: Phone },
                { label: 'Website URL', icon: Globe },
                { label: 'Main Image', icon: Camera },
                { label: 'Google Place ID', icon: Database }
              ].map(({ label, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2 p-2 bg-muted/50 rounded">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm">{label}</span>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-gray-200" />

          {/* Progress Section */}
          {(isLoading || progress) && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Progress
              </h3>
              
              {isLoading && (
                <div className="space-y-2">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-blue-600 h-2 rounded-full animate-pulse" style={{ width: '45%' }}></div>
                  </div>
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
                <Alert className="border-red-200 bg-red-50">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800">
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
                      <Alert key={index} className="border-red-200 bg-red-50 py-2">
                        <AlertDescription className="text-sm text-red-800">
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
