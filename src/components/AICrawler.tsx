import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Globe,
  Bot,
  Loader2,
  CheckCircle,
  AlertCircle,
  Calendar,
  MapPin,
  Utensils,
  Play,
  Camera,
  Building,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CrawlResult {
  success: boolean;
  message: string;
  results: {
    totalFound: number;
    newItems: number;
    duplicates: number;
    inserted: number;
    errors: number;
  };
  items?: Record<string, unknown>[];
  error?: string;
}

const AICrawler: React.FC = () => {
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CrawlResult | null>(null);

  const categories = [
    {
      value: "events",
      label: "Events",
      icon: Calendar,
      description: "Concerts, festivals, sports games, community events",
      examples: ["Event venues", "Concert halls", "Sports stadiums", "Festival websites"],
    },
    {
      value: "restaurants",
      label: "Restaurants",
      icon: Utensils,
      description: "Restaurants, cafes, bars, food establishments",
      examples: ["Restaurant directories", "Food review sites", "Menu websites"],
    },
    {
      value: "restaurant_openings",
      label: "Restaurant Openings",
      icon: Building,
      description: "New restaurant openings and announcements",
      examples: ["Food news sites", "Restaurant opening announcements"],
    },
    {
      value: "playgrounds",
      label: "Playgrounds",
      icon: Play,
      description: "Playgrounds, play areas, children's recreational facilities",
      examples: ["Parks & recreation sites", "Family activity websites"],
    },
    {
      value: "attractions",
      label: "Attractions",
      icon: Camera,
      description: "Tourist attractions, museums, historic sites",
      examples: ["Tourism websites", "Visitor bureau sites", "Attraction directories"],
    },
  ];

  const selectedCategory = categories.find((cat) => cat.value === category);

  const handleCrawl = async () => {
    if (!url || !category) {
      setResult({
        success: false,
        message: "Please provide both URL and category",
        results: { totalFound: 0, newItems: 0, duplicates: 0, inserted: 0, errors: 1 },
        error: "URL and category are required",
      });
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      console.log("Starting AI crawl...", { url, category });

      const { data, error } = await supabase.functions.invoke("ai-crawler", {
        body: { url, category },
      });

      console.log("AI crawl response:", { data, error });

      if (error) {
        throw error;
      }

      setResult(data);
    } catch (error: unknown) {
      console.error("AI crawl error:", error);
      setResult({
        success: false,
        message: "Failed to crawl website",
        results: { totalFound: 0, newItems: 0, duplicates: 0, inserted: 0, errors: 1 },
        error: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getResultIcon = () => {
    if (!result) return null;
    return result.success ? (
      <CheckCircle className="h-5 w-5 text-green-500" />
    ) : (
      <AlertCircle className="h-5 w-5 text-red-500" />
    );
  };

  const getResultColor = () => {
    if (!result) return "";
    return result.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50";
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-500" />
            AI Website Crawler
          </CardTitle>
          <p className="text-sm text-gray-600">
            Use AI to automatically extract and categorize content from any website. 
            The AI will intelligently parse the website and create database entries 
            for events, restaurants, playgrounds, and more.
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="crawl-url" className="flex items-center gap-2">
              <Globe className="h-4 w-4" />
              Website URL
            </Label>
            <Input
              id="crawl-url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full"
            />
            <p className="text-xs text-gray-500">
              Enter the full URL of the website you want to crawl
            </p>
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="crawl-category">Content Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger id="crawl-category">
                <SelectValue placeholder="Select what type of content to extract" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((cat) => {
                  const Icon = cat.icon;
                  return (
                    <SelectItem key={cat.value} value={cat.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {cat.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Category Info */}
          {selectedCategory && (
            <Alert>
              <selectedCategory.icon className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <p><strong>{selectedCategory.label}:</strong> {selectedCategory.description}</p>
                  <p className="text-xs">
                    <strong>Good for:</strong> {selectedCategory.examples.join(", ")}
                  </p>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Crawl Button */}
          <Button
            onClick={handleCrawl}
            disabled={!url || !category || isLoading}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                AI is analyzing website...
              </>
            ) : (
              <>
                <Bot className="h-4 w-4 mr-2" />
                Start AI Crawl
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Results */}
      {result && (
        <Card className={`${getResultColor()}`}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {getResultIcon()}
              Crawl Results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">{result.message}</p>

            {result.error && (
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-red-700">
                  <strong>Error:</strong> {result.error}
                </AlertDescription>
              </Alert>
            )}

            {result.success && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-blue-600">
                    {result.results.totalFound}
                  </div>
                  <div className="text-xs text-gray-600">Items Found</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-green-600">
                    {result.results.inserted}
                  </div>
                  <div className="text-xs text-gray-600">Inserted</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-yellow-600">
                    {result.results.duplicates}
                  </div>
                  <div className="text-xs text-gray-600">Duplicates</div>
                </div>
                <div className="text-center p-3 bg-white rounded border">
                  <div className="text-2xl font-bold text-red-600">
                    {result.results.errors}
                  </div>
                  <div className="text-xs text-gray-600">Errors</div>
                </div>
              </div>
            )}

            {/* Preview of extracted items */}
            {result.items && result.items.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Preview of extracted items:</h4>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {result.items.slice(0, 5).map((item, index) => {
                    const itemData = item as Record<string, unknown>;
                    const title = (itemData.title || itemData.name || "Unnamed Item") as string;
                    const date = itemData.date as string;
                    const location = (itemData.location || itemData.venue) as string;
                    const category = itemData.category as string;
                    
                    return (
                    <div key={index} className="p-2 bg-white rounded border text-xs">
                      <div className="font-medium">
                        {title}
                      </div>
                      {date && (
                        <div className="text-gray-500 flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(date).toLocaleDateString()}
                        </div>
                      )}
                      {location && (
                        <div className="text-gray-500 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {location}
                        </div>
                      )}
                      {category && (
                        <Badge variant="secondary" className="text-xs mt-1">
                          {category}
                        </Badge>
                      )}
                    </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Usage Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">💡 Tips for Best Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-gray-600">
          <ul className="list-disc list-inside space-y-1">
            <li>Use websites with clear, structured content (avoid heavily JavaScript-based sites)</li>
            <li>Event sites work best when they have clear dates, titles, and locations</li>
            <li>Restaurant sites should have names, addresses, and cuisine information</li>
            <li>The AI will automatically detect and skip duplicate entries</li>
            <li>Large websites may take 30-60 seconds to process completely</li>
            <li>Try specific pages (like /events or /menu) rather than homepage for better results</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

export default AICrawler;
