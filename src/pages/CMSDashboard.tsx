import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import ArticlesManager from '@/components/ArticlesManager';
import AIArticleGenerator from '@/components/AIArticleGenerator';
import { AuthorManager } from '@/components/cms/AuthorManager';
import { ContentQueue } from '@/components/cms/ContentQueue';
import { CategoryTagManager } from '@/components/cms/CategoryTagManager';
import {
  FileText,
  Users,
  ClipboardList,
  Tags,
  Sparkles,
  Plus,
  LayoutDashboard,
  Settings,
  ArrowLeft,
} from 'lucide-react';

export default function CMSDashboard() {
  const [activeTab, setActiveTab] = useState('articles');

  return (
    <>
      <Helmet>
        <title>CMS Dashboard | Des Moines AI Pulse</title>
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
                    Manage articles, authors, categories, and editorial workflow
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
        <main className="container mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid grid-cols-5 w-full max-w-3xl h-auto gap-0.5 sm:gap-1">
              <TabsTrigger value="articles" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline text-xs sm:text-sm">Articles</span>
              </TabsTrigger>
              <TabsTrigger value="queue" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <ClipboardList className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline text-xs sm:text-sm">Queue</span>
              </TabsTrigger>
              <TabsTrigger value="authors" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <Users className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline text-xs sm:text-sm">Authors</span>
              </TabsTrigger>
              <TabsTrigger value="taxonomy" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <Tags className="h-4 w-4 flex-shrink-0" />
                <span className="hidden sm:inline text-xs sm:text-sm">Tags</span>
              </TabsTrigger>
              <TabsTrigger value="ai" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-2">
                <Sparkles className="h-4 w-4 flex-shrink-0" />
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

            {/* Authors Tab */}
            <TabsContent value="authors">
              <AuthorManager />
            </TabsContent>

            {/* Categories & Tags Tab */}
            <TabsContent value="taxonomy">
              <CategoryTagManager />
            </TabsContent>

            {/* AI Generator Tab */}
            <TabsContent value="ai">
              <AIArticleGenerator />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
}
