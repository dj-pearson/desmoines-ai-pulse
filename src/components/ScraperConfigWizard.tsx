import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Globe,
  Clock,
  Code,
  Sparkles,
  Target,
  AlertCircle,
  CheckCircle,
  Copy,
  Play,
  Settings,
  BookOpen,
  Zap,
  Calendar,
  MapPin,
  DollarSign,
  Hash,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ScraperTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  schedule: string;
  selectors: {
    title: string;
    description: string;
    date: string;
    location: string;
    price?: string;
    category?: string;
  };
  example_url: string;
  tips: string[];
}

const scraperTemplates: ScraperTemplate[] = [
  {
    id: "catch-des-moines",
    name: "Catch Des Moines Events",
    description:
      "Official Des Moines tourism events from the city's main events portal",
    category: "Tourism",
    difficulty: "beginner",
    schedule: "0 */6 * * *", // Every 6 hours
    selectors: {
      title: ".event-title, h2.title, h3.title",
      description: ".event-description, .description, .summary",
      date: ".event-date, .date, time[datetime]",
      location: ".event-location, .location, .venue",
      price: ".event-price, .price, .cost",
      category: ".event-category, .category, .event-type",
    },
    example_url: "https://www.catchdesmoines.com/events/",
    tips: [
      "Official tourism site with well-structured event data",
      "Events are categorized by type (arts, food, festivals, etc.)",
      "Check for event submission forms for comprehensive coverage",
      "May use dynamic loading - wait for content to appear",
    ],
  },
  {
    id: "iowa-cubs",
    name: "Iowa Cubs Baseball Schedule",
    description:
      "Triple-A baseball games at Principal Park from the official MiLB site",
    category: "Sports",
    difficulty: "intermediate",
    schedule: "0 */12 * * *", // Every 12 hours
    selectors: {
      title: ".game-matchup, .opponent, .game-title",
      description: ".game-info, .promotion-info, .special-event",
      date: ".game-date, .date, .schedule-date, [data-date]",
      location: ".venue, .location, .park-name",
      price: ".ticket-price, .price, .buy-tickets",
      category: ".game-type, .promotion-type",
    },
    example_url: "https://www.milb.com/iowa/schedule",
    tips: [
      "MiLB sites have consistent structure across teams",
      "Look for promotional games and special events",
      "Schedule filters may affect content loading",
      "Games include both home and away - filter for home games",
    ],
  },
  {
    id: "iowa-wolves",
    name: "Iowa Wolves G-League Basketball",
    description:
      "Professional basketball games from the NBA G-League affiliate",
    category: "Sports",
    difficulty: "intermediate",
    schedule: "0 */12 * * *", // Every 12 hours
    selectors: {
      title: ".game-matchup, .opponent, .vs, .game-info",
      description: ".game-details, .special-event, .promotion",
      date: ".game-date, .date, .schedule-date, time",
      location: ".venue, .arena, .location",
      price: ".ticket-info, .price, .tickets",
      category: ".game-type, .season-type",
    },
    example_url: "https://iowa.gleague.nba.com/schedule",
    tips: [
      "NBA G-League sites use standardized templates",
      "Season vs playoff games have different structures",
      "Check for promotional nights and special events",
      "Schedule may include filters that affect content",
    ],
  },
  {
    id: "iowa-wild",
    name: "Iowa Wild Hockey Schedule",
    description: "Professional hockey games from the AHL affiliate team",
    category: "Sports",
    difficulty: "intermediate",
    schedule: "0 */12 * * *", // Every 12 hours
    selectors: {
      title: ".game-matchup, .opponent, .vs-opponent",
      description: ".game-info, .promotion, .special-event",
      date: ".game-date, .date, .game-time",
      location: ".venue, .arena, .rink",
      price: ".ticket-price, .pricing, .tickets",
      category: ".game-type, .promotion-type",
    },
    example_url: "https://www.iowawild.com/games",
    tips: [
      "Hockey schedules often include promotional themes",
      "Look for season ticket vs single game pricing",
      "Game times may be in different time zones",
      "Check for playoff vs regular season differences",
    ],
  },
  {
    id: "vibrant-music-hall",
    name: "Vibrant Music Hall Shows",
    description: "Live music and entertainment venue in downtown Des Moines",
    category: "Music",
    difficulty: "beginner",
    schedule: "0 */6 * * *", // Every 6 hours
    selectors: {
      title: ".show-title, .artist-name, .event-title, h1, h2",
      description: ".show-description, .event-details, .artist-bio",
      date: ".show-date, .event-date, .date, time",
      location: ".venue, .hall, .room",
      price: ".ticket-price, .pricing, .cost, .price-range",
      category: ".genre, .show-type, .music-type",
    },
    example_url: "https://www.vibrantmusichall.com/",
    tips: [
      "Music venues often list artist names prominently",
      "Check for all-ages vs 21+ events",
      "Ticket prices may show ranges ($25-$45)",
      "Genre information helps with categorization",
    ],
  },
  {
    id: "iowa-events-center",
    name: "Iowa Events Center",
    description:
      "Major venue hosting concerts, conventions, and special events",
    category: "Venues",
    difficulty: "beginner",
    schedule: "0 */8 * * *", // Every 8 hours
    selectors: {
      title: ".event-title, .show-title, h2, h3",
      description: ".event-description, .show-description, .summary",
      date: ".event-date, .show-date, .date, time",
      location: ".venue, .location, .hall",
      price: ".ticket-price, .pricing, .cost",
      category: ".event-type, .show-type, .category",
    },
    example_url: "https://www.iowaeventscenter.com/",
    tips: [
      "Large venues host diverse event types",
      "Check for different halls/rooms within venue",
      "May include both public and private events",
      "Corporate events might not show pricing",
    ],
  },
  {
    id: "google-events-dsm",
    name: "Google Events - Des Moines",
    description: "Aggregate events from Google's local events search",
    category: "Aggregator",
    difficulty: "advanced",
    schedule: "0 */4 * * *", // Every 4 hours
    selectors: {
      title: ".event-title, .g-card h3, .event-name",
      description: ".event-description, .snippet, .event-details",
      date: ".event-date, .date, .when",
      location: ".event-location, .location, .where",
      price: ".price, .cost, .ticket-info",
      category: ".event-type, .category",
    },
    example_url: "https://www.google.com/search?q=events+in+des+moines+iowa",
    tips: [
      "Google results change frequently and unpredictably",
      "May require handling of anti-bot measures",
      "Results are personalized and location-based",
      "Consider using Google Events API instead of scraping",
    ],
  },
  {
    id: "eventbrite-dsm",
    name: "Eventbrite - Des Moines Area",
    description: "Community and professional events listed on Eventbrite",
    category: "Community",
    difficulty: "beginner",
    schedule: "0 */4 * * *", // Every 4 hours
    selectors: {
      title: "[data-event-name], .event-title, h1",
      description: ".event-description, .event-summary, .eds-text--left",
      date: "[data-event-datetime], .event-datetime, time",
      location: ".event-location, [data-event-location], .location-info",
      price: ".event-price, .ticket-price, .price-display",
      category: ".event-category, .category-tag",
    },
    example_url: "https://www.eventbrite.com/d/ia--des-moines/events/",
    tips: [
      "Eventbrite uses consistent data attributes",
      "Look for [data-event-*] attributes first",
      "Events load dynamically, may need to wait for content",
      "Check for pagination to get all events",
    ],
  },
];

const cronTemplates = [
  {
    label: "Every 15 minutes",
    value: "*/15 * * * *",
    description: "High frequency for time-sensitive events",
  },
  {
    label: "Every hour",
    value: "0 * * * *",
    description: "Good for active event sites",
  },
  {
    label: "Every 4 hours",
    value: "0 */4 * * *",
    description: "Balanced frequency for most sites",
  },
  {
    label: "Every 6 hours",
    value: "0 */6 * * *",
    description: "Standard frequency for event sites",
  },
  {
    label: "Twice daily",
    value: "0 8,20 * * *",
    description: "Morning and evening updates",
  },
  {
    label: "Daily at midnight",
    value: "0 0 * * *",
    description: "Once per day for slow-changing content",
  },
  {
    label: "Weekly",
    value: "0 0 * * 0",
    description: "For sites that update weekly",
  },
];

interface ScraperConfig {
  name: string;
  url: string;
  schedule: string;
  selectors: {
    title: string;
    description: string;
    date: string;
    location: string;
    price?: string;
    category?: string;
  };
  category: string;
  enabled: boolean;
}

interface AnalysisResult {
  domain: string;
  detected_platform: string;
  recommended_schedule: string;
  confidence: number;
  suggested_selectors: {
    title: string;
    description: string;
    date: string;
    location: string;
    price?: string;
    category?: string;
  };
  tips: string[];
  potential_issues: string[];
}

interface ScraperConfigWizardProps {
  onSave: (config: ScraperConfig) => void;
  onClose: () => void;
}

export default function ScraperConfigWizard({
  onSave,
  onClose,
}: ScraperConfigWizardProps) {
  const [activeTab, setActiveTab] = useState("url-analysis");
  const [url, setUrl] = useState("");
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    null
  );
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<ScraperTemplate | null>(null);
  const [customConfig, setCustomConfig] = useState<ScraperConfig>({
    name: "",
    url: "",
    schedule: "0 */6 * * *",
    selectors: {
      title: "",
      description: "",
      date: "",
      location: "",
      price: "",
      category: "",
    },
    category: "Events",
    enabled: true,
  });
  const { toast } = useToast();

  const analyzeUrl = useCallback(async () => {
    if (!url) {
      toast({
        title: "URL Required",
        description: "Please enter a URL to analyze",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);

    // Simulate AI analysis (in real implementation, this would call an API)
    setTimeout(() => {
      const mockAnalysis: AnalysisResult = {
        domain: new URL(url).hostname,
        detected_platform: "Custom",
        recommended_schedule: "0 */6 * * *",
        confidence: 0.85,
        suggested_selectors: {
          title: "h1, .event-title, [data-title]",
          description: ".description, .event-description, .summary",
          date: "time, .date, .event-date, [datetime]",
          location: ".location, .venue, .address",
          price: ".price, .cost, .ticket-price",
          category: ".category, .event-type, .genre",
        },
        tips: [
          "Site uses standard HTML5 semantic markup",
          "Events appear to be in a list or grid layout",
          "Consider pagination for complete event coverage",
          "Site may use lazy loading - wait for content",
        ],
        potential_issues: [
          "Site may have rate limiting",
          "Events might load dynamically via JavaScript",
        ],
      };

      // Check if URL matches any template
      const matchingTemplate = scraperTemplates.find((template) =>
        url.includes(template.example_url.split("/")[2])
      );

      if (matchingTemplate) {
        mockAnalysis.detected_platform = matchingTemplate.name;
        mockAnalysis.confidence = 0.95;
        mockAnalysis.suggested_selectors = matchingTemplate.selectors;
        mockAnalysis.recommended_schedule = matchingTemplate.schedule;
      }

      setAnalysisResult(mockAnalysis);
      setIsAnalyzing(false);
    }, 2000);
  }, [url, toast]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: "Selector copied to clipboard",
    });
  };

  const applyTemplate = (template: ScraperTemplate) => {
    setSelectedTemplate(template);
    setCustomConfig({
      ...customConfig,
      name: `${template.name} Scraper`,
      schedule: template.schedule,
      selectors: template.selectors,
      category: template.category,
    });
    setActiveTab("configuration");
  };

  const testScraper = () => {
    toast({
      title: "Test Started",
      description: "Running test scrape... Check the logs for results.",
    });
    // In real implementation, this would trigger a test scrape
  };

  const saveConfiguration = () => {
    if (!customConfig.name || !customConfig.url) {
      toast({
        title: "Missing Required Fields",
        description: "Please fill in the scraper name and URL",
        variant: "destructive",
      });
      return;
    }

    onSave(customConfig);
    toast({
      title: "Scraper Saved",
      description: `${customConfig.name} has been configured successfully`,
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            Smart Scraper Configuration Wizard
          </DialogTitle>
          <DialogDescription>
            AI-powered scraper setup with templates, best practices, and
            intelligent CSS selector suggestions
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger
              value="url-analysis"
              className="flex items-center gap-1"
            >
              <Globe className="h-4 w-4" />
              URL Analysis
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-1">
              <BookOpen className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger
              value="configuration"
              className="flex items-center gap-1"
            >
              <Settings className="h-4 w-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="testing" className="flex items-center gap-1">
              <Play className="h-4 w-4" />
              Test & Deploy
            </TabsTrigger>
          </TabsList>

          <TabsContent value="url-analysis" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5 text-blue-600" />
                  AI URL Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="analysis-url">Website URL to Analyze</Label>
                  <div className="flex gap-2">
                    <Input
                      id="analysis-url"
                      placeholder="https://example.com/events"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                    />
                    <Button onClick={analyzeUrl} disabled={isAnalyzing}>
                      {isAnalyzing ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                          Analyzing...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4 mr-2" />
                          Analyze
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {analysisResult && (
                  <div className="space-y-4">
                    <Alert>
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        <strong>Platform Detected:</strong>{" "}
                        {analysisResult.detected_platform}
                        <span className="ml-2 text-sm">
                          (Confidence:{" "}
                          {(analysisResult.confidence * 100).toFixed(0)}%)
                        </span>
                      </AlertDescription>
                    </Alert>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            Suggested CSS Selectors
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {Object.entries(
                            analysisResult.suggested_selectors
                          ).map(([field, selector]) => (
                            <div
                              key={field}
                              className="flex items-center justify-between"
                            >
                              <div className="flex items-center gap-2">
                                {field === "title" && (
                                  <Hash className="h-3 w-3" />
                                )}
                                {field === "date" && (
                                  <Calendar className="h-3 w-3" />
                                )}
                                {field === "location" && (
                                  <MapPin className="h-3 w-3" />
                                )}
                                {field === "price" && (
                                  <DollarSign className="h-3 w-3" />
                                )}
                                <span className="text-sm font-medium capitalize">
                                  {field}:
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <code className="text-xs bg-gray-100 px-1 rounded">
                                  {selector as string}
                                </code>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    copyToClipboard(selector as string)
                                  }
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm">
                            Recommendations
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              Suggested Schedule:
                            </div>
                            <Badge variant="outline">
                              {analysisResult.recommended_schedule}
                            </Badge>
                          </div>

                          <div className="space-y-1">
                            <div className="text-sm font-medium">Tips:</div>
                            <ul className="text-xs space-y-1">
                              {analysisResult.tips.map(
                                (tip: string, index: number) => (
                                  <li
                                    key={index}
                                    className="flex items-start gap-1"
                                  >
                                    <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                                    {tip}
                                  </li>
                                )
                              )}
                            </ul>
                          </div>

                          {analysisResult.potential_issues.length > 0 && (
                            <div className="space-y-1">
                              <div className="text-sm font-medium">
                                Potential Issues:
                              </div>
                              <ul className="text-xs space-y-1">
                                {analysisResult.potential_issues.map(
                                  (issue: string, index: number) => (
                                    <li
                                      key={index}
                                      className="flex items-start gap-1"
                                    >
                                      <AlertCircle className="h-3 w-3 text-amber-600 mt-0.5 flex-shrink-0" />
                                      {issue}
                                    </li>
                                  )
                                )}
                              </ul>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </div>

                    <Button
                      onClick={() => {
                        if (analysisResult) {
                          setCustomConfig({
                            ...customConfig,
                            url: url,
                            selectors: analysisResult.suggested_selectors,
                            schedule: analysisResult.recommended_schedule,
                          });
                          setActiveTab("configuration");
                        }
                      }}
                    >
                      Use These Suggestions
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="templates" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scraperTemplates.map((template) => (
                <Card
                  key={template.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{template.name}</CardTitle>
                      <div className="flex gap-1">
                        <Badge
                          variant={
                            template.difficulty === "beginner"
                              ? "default"
                              : template.difficulty === "intermediate"
                              ? "secondary"
                              : "destructive"
                          }
                        >
                          {template.difficulty}
                        </Badge>
                        <Badge variant="outline">{template.category}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-gray-600">
                      {template.description}
                    </p>

                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs">
                        <Clock className="h-3 w-3" />
                        <span>Schedule: {template.schedule}</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Globe className="h-3 w-3" />
                        <span className="truncate">{template.example_url}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="text-xs font-medium">Key Tips:</div>
                      <ul className="text-xs space-y-1">
                        {template.tips.slice(0, 2).map((tip, index) => (
                          <li key={index} className="flex items-start gap-1">
                            <CheckCircle className="h-3 w-3 text-green-600 mt-0.5 flex-shrink-0" />
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Button
                      size="sm"
                      className="w-full"
                      onClick={() => applyTemplate(template)}
                    >
                      Use This Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="configuration" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Scraper Configuration</CardTitle>
                {selectedTemplate && (
                  <Alert>
                    <Target className="h-4 w-4" />
                    <AlertDescription>
                      Using template: <strong>{selectedTemplate.name}</strong>
                    </AlertDescription>
                  </Alert>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="config-name">Scraper Name</Label>
                    <Input
                      id="config-name"
                      placeholder="My Event Scraper"
                      value={customConfig.name}
                      onChange={(e) =>
                        setCustomConfig({
                          ...customConfig,
                          name: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="config-url">Target URL</Label>
                    <Input
                      id="config-url"
                      placeholder="https://example.com/events"
                      value={customConfig.url}
                      onChange={(e) =>
                        setCustomConfig({
                          ...customConfig,
                          url: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="config-schedule">Cron Schedule</Label>
                  <Select
                    value={customConfig.schedule}
                    onValueChange={(value) =>
                      setCustomConfig({ ...customConfig, schedule: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {cronTemplates.map((cron) => (
                        <SelectItem key={cron.value} value={cron.value}>
                          <div className="flex flex-col">
                            <span>{cron.label}</span>
                            <span className="text-xs text-gray-500">
                              {cron.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Separator />

                <div className="space-y-4">
                  <h3 className="text-sm font-medium">CSS Selectors</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(customConfig.selectors).map(
                      ([field, value]) => (
                        <div key={field} className="space-y-2">
                          <Label
                            htmlFor={`selector-${field}`}
                            className="capitalize"
                          >
                            {field} Selector{" "}
                            {field === "title" || field === "date" ? "*" : ""}
                          </Label>
                          <Input
                            id={`selector-${field}`}
                            placeholder={`e.g., .${field}, #${field}, [data-${field}]`}
                            value={value}
                            onChange={(e) =>
                              setCustomConfig({
                                ...customConfig,
                                selectors: {
                                  ...customConfig.selectors,
                                  [field]: e.target.value,
                                },
                              })
                            }
                          />
                        </div>
                      )
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="testing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Test & Deploy</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Test your scraper configuration before deploying to ensure
                    it works correctly.
                  </AlertDescription>
                </Alert>

                <div className="flex gap-2">
                  <Button onClick={testScraper} variant="outline">
                    <Play className="h-4 w-4 mr-2" />
                    Run Test Scrape
                  </Button>
                  <Button onClick={saveConfiguration}>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Save & Deploy
                  </Button>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium">
                    Configuration Summary:
                  </h4>
                  <div className="bg-gray-50 p-3 rounded-lg text-sm">
                    <div>
                      <strong>Name:</strong> {customConfig.name || "Not set"}
                    </div>
                    <div>
                      <strong>URL:</strong> {customConfig.url || "Not set"}
                    </div>
                    <div>
                      <strong>Schedule:</strong> {customConfig.schedule}
                    </div>
                    <div>
                      <strong>Title Selector:</strong>{" "}
                      {customConfig.selectors.title || "Not set"}
                    </div>
                    <div>
                      <strong>Date Selector:</strong>{" "}
                      {customConfig.selectors.date || "Not set"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
