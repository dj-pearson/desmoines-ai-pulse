import { useState } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { createLogger } from '@/lib/logger';

const log = createLogger('AdminAnalyticsPage');
import AdminNav from "@/components/admin/AdminNav";
import AdminAnalyticsDashboard from "@/components/AdminAnalyticsDashboard";
import { ActivityLogViewer } from "@/components/ActivityLogViewer";
import { DataQualityDashboard } from "@/components/DataQualityDashboard";
import { CrmDashboard } from "@/components/crm";
import { SearchTrafficDashboard } from "@/components/admin/SearchTrafficDashboard";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import {
  BarChart3,
  ScrollText,
  CheckCircle,
  Contact,
  TrendingUp,
} from "lucide-react";

const ANALYTICS_TABS = [
  { id: "analytics", label: "Advanced Analytics", icon: BarChart3 },
  { id: "search-traffic", label: "Search Traffic", icon: TrendingUp },
  { id: "activity-logs", label: "Activity Logs", icon: ScrollText },
  { id: "data-quality", label: "Data Quality", icon: CheckCircle },
  { id: "crm", label: "CRM Dashboard", icon: Contact },
];

export default function AdminAnalyticsPage() {
  const { userRole } = useAdminAuth();
  useDocumentTitle("Analytics Dashboard");
  const [activeTab, setActiveTab] = useState("analytics");

  // Data hooks needed for DataQualityDashboard
  const events = useEvents();
  const restaurants = useRestaurants();
  const attractions = useAttractions();
  const playgrounds = usePlaygrounds();

  const canManageUsers = () => ["admin", "root_admin"].includes(userRole);

  if (!canManageUsers()) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to access analytics.
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
            {ANALYTICS_TABS.map((tab) => {
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
        {activeTab === "analytics" && <AdminAnalyticsDashboard />}

        {activeTab === "search-traffic" && <SearchTrafficDashboard />}

        {activeTab === "activity-logs" && <ActivityLogViewer />}

        {activeTab === "data-quality" && (
          <DataQualityDashboard
            events={events.events}
            restaurants={restaurants.restaurants}
            attractions={attractions.attractions}
            playgrounds={playgrounds.playgrounds}
            onViewItem={(contentType, itemId) => {
              // Navigate to the content page - simplified from original
              log.debug('viewItem', 'View item', { contentType, itemId });
            }}
          />
        )}

        {activeTab === "crm" && <CrmDashboard />}
      </div>
    </div>
  );
}
