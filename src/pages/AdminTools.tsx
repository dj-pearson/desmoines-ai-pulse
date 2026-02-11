import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import AdminNav from "@/components/admin/AdminNav";
import SEOTools from "@/components/SEOTools";
import WeekendGuideManager from "@/components/WeekendGuideManager";
import AffiliateManager from "@/components/AffiliateManager";
import SocialMediaManager from "@/components/SocialMediaManager";
import CoordinateManager from "@/components/CoordinateManager";
import { CompetitorAnalysisDashboard } from "@/components/CompetitorAnalysisDashboard";
import EventReviewSystem from "@/components/EventReviewSystem";
import { ContentQueue } from "@/components/ContentQueue";
import CatchDesmoinUrlExtractor from "@/components/CatchDesmoinUrlExtractor";
import FixBrokenEventUrls from "@/components/FixBrokenEventUrls";
import { DomainHighlightManager } from "@/components/DomainHighlightManager";
import {
  Globe,
  CalendarDays,
  DollarSign,
  Share2,
  Settings,
  Target,
  UserCheck,
  ClipboardCheck,
} from "lucide-react";

const TOOLS_TABS = [
  { id: "seo", label: "SEO Tools", icon: Globe },
  { id: "weekend-guide", label: "Weekend Guide", icon: CalendarDays },
  { id: "affiliate-manager", label: "Affiliate Links", icon: DollarSign },
  { id: "social-media", label: "Social Media", icon: Share2 },
  { id: "coordinates", label: "Coordinates", icon: Settings },
  { id: "competitor-analysis", label: "Competitor Analysis", icon: Target },
  { id: "event-submissions", label: "Event Submissions", icon: UserCheck },
  { id: "content-queue", label: "Content Queue", icon: ClipboardCheck },
];

export default function AdminTools() {
  const { userRole } = useAdminAuth();
  const [activeTab, setActiveTab] = useState("seo");

  const canManageContent = () =>
    ["moderator", "admin", "root_admin"].includes(userRole);

  if (!canManageContent()) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to access site tools.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <div className="p-4 md:p-6">
        {/* Tab Navigation */}
        <div className="mb-6 overflow-x-auto">
          <div className="flex items-center gap-1 min-w-max">
            {TOOLS_TABS.map((tab) => {
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
        {activeTab === "seo" && <SEOTools />}

        {activeTab === "weekend-guide" && <WeekendGuideManager />}

        {activeTab === "affiliate-manager" && <AffiliateManager />}

        {activeTab === "social-media" && <SocialMediaManager />}

        {activeTab === "coordinates" && <CoordinateManager />}

        {activeTab === "competitor-analysis" && <CompetitorAnalysisDashboard />}

        {activeTab === "event-submissions" && <EventReviewSystem />}

        {activeTab === "content-queue" && <ContentQueue />}
      </div>
    </div>
  );
}
