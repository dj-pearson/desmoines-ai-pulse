import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { createLogger } from "@/lib/logger";

const log = createLogger('AdminAI');
import AdminNav from "@/components/admin/AdminNav";
import AICrawler from "@/components/AICrawler";
import { AIConfigurationManager } from "@/components/AIConfigurationManager";
import AIEnhancementManager from "@/components/AIEnhancementManager";
import AIArticleGenerator from "@/components/AIArticleGenerator";
import ScraperConfigWizard from "@/components/ScraperConfigWizard";
import ScrapingJobManager from "@/components/ScrapingJobManager";
import CronMonitorSimple from "@/components/CronMonitorSimple";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Bot,
  Sparkles,
  Zap,
  Settings,
  UtensilsCrossed,
} from "lucide-react";
import { useScraping } from "@/hooks/useScraping";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const AI_TABS = [
  { id: "ai-crawler", label: "AI Crawler", icon: Bot },
  { id: "ai-configuration", label: "AI Configuration", icon: Sparkles },
  { id: "ai-enhancement", label: "AI Event Enhancement", icon: Sparkles },
  { id: "ai-article-generator", label: "AI Article Generator", icon: Bot },
  { id: "scraping", label: "Scraping", icon: Zap },
];

export default function AdminAI() {
  const { userRole } = useAdminAuth();
  useDocumentTitle("AI Management");
  const [activeTab, setActiveTab] = useState("ai-crawler");
  const [showScraperWizard, setShowScraperWizard] = useState(false);
  const [showJobManager, setShowJobManager] = useState(false);
  const scraping = useScraping();

  const canManageContent = () =>
    ["moderator", "admin", "root_admin"].includes(userRole);

  if (!canManageContent()) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to access AI tools.
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-4 md:p-6">
          {/* Tab Navigation */}
          <div className="mb-6 overflow-x-auto">
            <div className="flex items-center gap-1 min-w-max">
              {AI_TABS.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      activeTab === tab.id
                        ? "bg-primary text-primary-foreground"
                        : "hover:bg-accent hover:text-accent-foreground text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === "ai-crawler" && <AICrawler />}

          {activeTab === "ai-configuration" && <AIConfigurationManager />}

          {activeTab === "ai-enhancement" && <AIEnhancementManager />}

          {activeTab === "ai-article-generator" && <AIArticleGenerator />}

          {activeTab === "scraping" && (
            <div className="space-y-6">
              {/* Cron Monitor */}
              <CronMonitorSimple />

              {/* Restaurant Opening Scraper */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UtensilsCrossed className="h-5 w-5 text-orange-600" />
                    Restaurant Opening Scraper
                  </CardTitle>
                  <CardDescription>
                    Automatically discover and add new restaurant openings to the database
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <Button
                      onClick={async () => {
                        try {
                          const { data, error } = await supabase.functions.invoke(
                            "restaurant-opening-scraper",
                            { body: {} }
                          );
                          if (error) throw error;
                          toast.success("Restaurant Scraper Complete", {
                            description: `Found ${data.totalFound} restaurants, Inserted ${data.inserted}, Updated ${data.updated}`,
                          });
                        } catch (error: any) {
                          toast.error("Scraper Error", {
                            description: error.message,
                          });
                        }
                      }}
                      className="flex items-center gap-2"
                    >
                      <UtensilsCrossed className="h-4 w-4" />
                      Run Restaurant Scraper
                    </Button>
                    <div className="text-sm text-muted-foreground">
                      <p>This will scrape the following sources:</p>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Des Moines Register - Restaurant Openings</li>
                        <li>Catch Des Moines - Restaurants</li>
                        <li>Eater Des Moines - New Restaurants</li>
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Original Scraping Management */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-purple-600" />
                    Automated Scraping Management
                  </CardTitle>
                  <CardDescription>
                    Configure and manage automated scrapers for events,
                    restaurants, and more
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex gap-4">
                      <Button
                        onClick={() => setShowScraperWizard(true)}
                        className="flex items-center gap-2"
                      >
                        <Bot className="h-4 w-4" />
                        Create New Scraper
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowJobManager(true)}
                      >
                        <Settings className="h-4 w-4 mr-2" />
                        Manage Existing
                      </Button>
                    </div>

                    {scraping.jobs.length > 0 ? (
                      <div className="grid gap-4">
                        {scraping.jobs.map((job) => (
                          <Card key={job.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-semibold">{job.name}</h4>
                                <p className="text-sm text-muted-foreground">
                                  Last run:{" "}
                                  {job.lastRun
                                    ? new Date(job.lastRun).toLocaleString()
                                    : "Never"}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                  Events found: {job.eventsFound || 0}
                                </p>
                              </div>
                              <Badge
                                variant={
                                  job.status === "running"
                                    ? "default"
                                    : "secondary"
                                }
                              >
                                {job.status}
                              </Badge>
                            </div>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No scraping jobs configured yet.</p>
                        <p className="text-sm">
                          Create your first automated scraper to get started.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* Scraper Configuration Wizard */}
      {showScraperWizard && (
        <ScraperConfigWizard
          onSave={(config) => {
            log.debug('Save scraper config', { action: 'onSave', metadata: { config } });
            setShowScraperWizard(false);
          }}
          onClose={() => setShowScraperWizard(false)}
        />
      )}

      {/* Scraping Job Manager */}
      {showJobManager && (
        <ScrapingJobManager
          isOpen={showJobManager}
          onClose={() => setShowJobManager(false)}
        />
      )}
    </>
  );
}
