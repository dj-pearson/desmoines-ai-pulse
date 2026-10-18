import { useTabState } from '@/hooks/useTabState';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import ArticlesManager from '@/components/ArticlesManager';
import AIArticleGenerator from '@/components/AIArticleGenerator';
import { ContentQueue } from '@/components/ContentQueue';
import { FileText, ClipboardList, Plus, LayoutDashboard, ArrowLeft } from "lucide-react";
import { SpriteIcon } from "@/components/ui/SpriteIcon";

export default function CMSDashboard() {
  const [activeTab, setActiveTab] = useTabState('articles', { validTabs: ['articles', 'queue', 'ai'] });

  return (
    <>
      <Helmet>
        <title>CMS Dashboard | Des Moines Insider</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b bg-card sticky top-0 z-10">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Link to="/admin" className="text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
                <div>
                  <h1 className="text-2xl font-bold flex items-center gap-2">
                    <LayoutDashboard className="h-6 w-6" />
                    Content Management System
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    Manage articles, the review queue and AI drafts
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button asChild>
                  <Link to="/admin/articles/new" target="_blank">
                    <Plus className="h-4 w-4 mr-2" />
                    New Article
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="container mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-3 w-full max-w-xl h-auto gap-0.5 sm:gap-1">
              <TabsTrigger value="articles" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline text-xs sm:text-sm">Articles</span>
              </TabsTrigger>
              <TabsTrigger value="queue" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <ClipboardList className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline text-xs sm:text-sm">Queue</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <SpriteIcon name="sparkles" className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline text-xs sm:text-sm">AI</span>
              </TabsTrigger>
            </TabsList>

            {/* Articles Tab */}
            <TabsContent value="articles">
              <ArticlesManager />
            </TabsContent>

            {/* Content Queue Tab */}
            <TabsContent value="queue">
              <ContentQueue />
            </TabsContent>

            {/* No Authors or Categories & Tags tabs: they edited author_profiles,
                article_categories and article_tags, which were never created in
                production, so both were empty screens whose saves failed. Deleted
                rather than built (WEB-QA-018). An old ?tab=authors link falls back
                to Articles. */}

            {/* AI Generator Tab */}
            <TabsContent value="ai">
              <AIArticleGenerator />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
