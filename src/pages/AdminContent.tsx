import { useState, useEffect, useCallback } from "react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { createLogger } from "@/lib/logger";

const log = createLogger('AdminContent');
import AdminNav from "@/components/admin/AdminNav";
import ContentEditDialog from "@/components/ContentEditDialog";
import ContentTemplateSelector from "@/components/ContentTemplateSelector";
import ContentTable from "@/components/ContentTable";
import ArticlesManager from "@/components/ArticlesManager";
import VenuesManager from "@/components/admin/VenuesManager";
import GooglePlacesRestaurantTools from "@/components/GooglePlacesRestaurantTools";
import { RestaurantBulkUpdaterSimple } from "@/components/RestaurantBulkUpdaterSimple";
import CatchDesmoinUrlExtractor from "@/components/CatchDesmoinUrlExtractor";
import FixBrokenEventUrls from "@/components/FixBrokenEventUrls";
import { DomainHighlightManager } from "@/components/DomainHighlightManager";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  Utensils,
  Building,
  Camera,
  Play,
  MapPin,
  FileText,
  Plus,
} from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { useRestaurants } from "@/hooks/useRestaurants";
import { useAttractions } from "@/hooks/useAttractions";
import { usePlaygrounds } from "@/hooks/usePlaygrounds";
import { useRestaurantOpenings } from "@/hooks/useRestaurantOpenings";
import { ContentItem, ContentType } from "@/lib/types";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

const CONTENT_TABS = [
  { id: "events", label: "Events", icon: Calendar },
  { id: "restaurants", label: "Restaurants", icon: Utensils },
  { id: "restaurant-openings", label: "Restaurant Openings", icon: Building },
  { id: "attractions", label: "Attractions", icon: Camera },
  { id: "playgrounds", label: "Playgrounds", icon: Play },
  { id: "venues", label: "Known Venues", icon: MapPin },
  { id: "articles", label: "Articles", icon: FileText },
  { id: "article-editor", label: "New Article", icon: Plus },
];

export default function AdminContent() {
  const { userRole } = useAdminAuth();
  useDocumentTitle("Content Management");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("events");

  // Search state for each content type
  const [searchTerms, setSearchTerms] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: "",
  });

  const [inputValues, setInputValues] = useState({
    events: "",
    restaurants: "",
    attractions: "",
    playgrounds: "",
    restaurantOpenings: "",
  });

  // Debounce the search term updates
  useEffect(() => {
    const timeouts = {
      events: setTimeout(
        () => setSearchTerms((prev) => ({ ...prev, events: inputValues.events })),
        300
      ),
      restaurants: setTimeout(
        () => setSearchTerms((prev) => ({ ...prev, restaurants: inputValues.restaurants })),
        300
      ),
      attractions: setTimeout(
        () => setSearchTerms((prev) => ({ ...prev, attractions: inputValues.attractions })),
        300
      ),
      playgrounds: setTimeout(
        () => setSearchTerms((prev) => ({ ...prev, playgrounds: inputValues.playgrounds })),
        300
      ),
      restaurantOpenings: setTimeout(
        () => setSearchTerms((prev) => ({ ...prev, restaurantOpenings: inputValues.restaurantOpenings })),
        300
      ),
    };

    return () => {
      Object.values(timeouts).forEach((timeout) => clearTimeout(timeout));
    };
  }, [inputValues]);

  const handleEventsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, events: search }));
  }, []);

  const handleRestaurantsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, restaurants: search }));
  }, []);

  const handleAttractionsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, attractions: search }));
  }, []);

  const handlePlaygroundsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, playgrounds: search }));
  }, []);

  const handleRestaurantOpeningsSearch = useCallback((search: string) => {
    setInputValues((prev) => ({ ...prev, restaurantOpenings: search }));
  }, []);

  // Edit dialog state
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    contentType: ContentType | null;
    item: ContentItem | null;
  }>({
    open: false,
    contentType: null,
    item: null,
  });

  // Template selector state
  const [templateSelector, setTemplateSelector] = useState<{
    open: boolean;
    contentType: 'event' | 'article' | null;
  }>({
    open: false,
    contentType: null,
  });

  // Data hooks with search filters
  const events = useEvents({ search: searchTerms.events });
  const restaurants = useRestaurants({ search: searchTerms.restaurants });
  const attractions = useAttractions({ search: searchTerms.attractions });
  const playgrounds = usePlaygrounds({ search: searchTerms.playgrounds });
  const restaurantOpenings = useRestaurantOpenings({
    search: searchTerms.restaurantOpenings,
  });

  const canManageContent = () =>
    ["moderator", "admin", "root_admin"].includes(userRole);

  const handleEdit = (contentType: ContentType, item: ContentItem) => {
    setEditDialog({ open: true, contentType, item });
  };

  const handleCreate = (contentType: ContentType) => {
    if (contentType === "event") {
      setTemplateSelector({ open: true, contentType: 'event' });
      return;
    }

    let emptyItem: Partial<ContentItem> = {};

    if (contentType === "restaurant") {
      emptyItem = {
        name: "",
        description: "",
        location: "",
        cuisine: "",
        priceRange: "$$",
        phone: "",
        website: "",
        rating: null,
        image_url: "",
        status: "open",
        openingDate: null,
        openingTimeframe: "",
        isFeatured: false,
      };
    } else if (contentType === "attraction") {
      emptyItem = {
        name: "",
        description: "",
        location: "",
        type: "",
        website: "",
        image_url: "",
        rating: null,
        isFeatured: false,
      };
    } else if (contentType === "playground") {
      emptyItem = {
        name: "",
        description: "",
        location: "",
        ageRange: "",
        amenities: [],
        image_url: "",
        rating: null,
        isFeatured: false,
      };
    }

    setEditDialog({
      open: true,
      contentType,
      item: { ...emptyItem, isNew: true } as unknown as ContentItem,
    });
  };

  const handleTemplateSelect = (template: any) => {
    const contentType = templateSelector.contentType;
    if (!contentType) return;

    setTemplateSelector({ open: false, contentType: null });

    let emptyItem: Partial<ContentItem> = {};

    if (contentType === 'event') {
      emptyItem = {
        title: "",
        original_description: "",
        date: new Date(),
        location: "",
        venue: "",
        category: "General",
        price: "",
        source_url: "",
        is_featured: false,
        is_enhanced: false,
      };

      if (template) {
        emptyItem = { ...emptyItem, ...template.defaultValues };
      }
    }

    setEditDialog({
      open: true,
      contentType: contentType as ContentType,
      item: { ...emptyItem, isNew: true } as unknown as ContentItem,
    });
  };

  const handleDelete = async (contentType: string, id: string) => {
    try {
      const tableNameMap: Record<
        string,
        "events" | "restaurants" | "attractions" | "playgrounds"
      > = {
        event: "events",
        restaurant: "restaurants",
        attraction: "attractions",
        playground: "playgrounds",
      };

      const tableName = tableNameMap[contentType];
      if (!tableName) throw new Error(`Unknown content type: ${contentType}`);

      const { error } = await supabase.from(tableName).delete().eq("id", id);
      if (error) throw error;

      toast.success(
        `${contentType.charAt(0).toUpperCase() + contentType.slice(1)} deleted successfully!`
      );

      if (contentType === "event") events.refetch();
      else if (contentType === "restaurant") restaurants.refetch();
      else if (contentType === "attraction") attractions.refetch();
      else if (contentType === "playground") playgrounds.refetch();
      restaurantOpenings.refetch();
    } catch (error) {
      log.error('Delete error', { action: 'handleDelete', metadata: { error } });
      toast.error("Failed to delete: " + (error as Error).message);
    }
  };

  const handleSave = async () => {
    const { contentType } = editDialog;
    try {
      if (contentType === "event") {
        await events.refetch();
        await queryClient.invalidateQueries({ queryKey: ["events"] });
      } else if (contentType === "restaurant") {
        await restaurants.refetch();
        await queryClient.invalidateQueries({ queryKey: ["restaurants"] });
        await restaurantOpenings.refetch();
        await queryClient.invalidateQueries({});
      } else if (contentType === "attraction") {
        await attractions.refetch();
        await queryClient.invalidateQueries({ queryKey: ["attractions"] });
      } else if (contentType === "playground") {
        await playgrounds.refetch();
        await queryClient.invalidateQueries({ queryKey: ["playgrounds"] });
      }
    } catch (error) {
      log.error('Error during save', { action: 'handleSave', metadata: { error } });
    }
  };

  if (!canManageContent()) {
    return (
      <div className="min-h-screen bg-background">
        <AdminNav />
        <div className="p-6 text-center text-muted-foreground">
          You do not have permission to manage content.
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
              {CONTENT_TABS.map((tab) => {
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
          {activeTab === "events" && (
            <div className="space-y-6">
              <CatchDesmoinUrlExtractor />
              <FixBrokenEventUrls />
              <DomainHighlightManager />
              <ContentTable
                type="event"
                items={events.events}
                isLoading={events.isLoading}
                totalCount={events.events.length}
                searchValue={inputValues.events}
                onEdit={(item) => handleEdit("event", item)}
                onDelete={(id) => handleDelete("event", id)}
                onSearch={handleEventsSearch}
                onFilter={(filter) => log.debug('Filter events', { action: 'onFilter', metadata: { filter } })}
                onCreate={() => handleCreate("event")}
                onRefresh={events.refetch}
              />
            </div>
          )}

          {activeTab === "restaurants" && (
            <div className="space-y-6">
              <GooglePlacesRestaurantTools />
              <RestaurantBulkUpdaterSimple />
              <ContentTable
                type="restaurant"
                items={restaurants.restaurants}
                isLoading={restaurants.isLoading}
                totalCount={restaurants.restaurants.length}
                searchValue={inputValues.restaurants}
                onEdit={(item) => handleEdit("restaurant", item)}
                onDelete={(id) => handleDelete("restaurant", id)}
                onSearch={handleRestaurantsSearch}
                onFilter={(filter) => log.debug('Filter restaurants', { action: 'onFilter', metadata: { filter } })}
                onCreate={() => handleCreate("restaurant")}
              />
            </div>
          )}

          {activeTab === "restaurant-openings" && (
            <ContentTable
              type="restaurant"
              items={restaurants.restaurants.filter((r) => {
                const matchesSearch =
                  !searchTerms.restaurantOpenings ||
                  r.name
                    ?.toLowerCase()
                    .includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                  r.cuisine
                    ?.toLowerCase()
                    .includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                  r.location
                    ?.toLowerCase()
                    .includes(searchTerms.restaurantOpenings.toLowerCase());

                const isOpening =
                  r.status === "opening_soon" ||
                  r.status === "newly_opened" ||
                  r.status === "announced" ||
                  r.opening_date ||
                  r.opening_timeframe;

                return matchesSearch && isOpening;
              })}
              isLoading={restaurants.isLoading}
              totalCount={
                restaurants.restaurants.filter((r) => {
                  const matchesSearch =
                    !searchTerms.restaurantOpenings ||
                    r.name
                      ?.toLowerCase()
                      .includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                    r.cuisine
                      ?.toLowerCase()
                      .includes(searchTerms.restaurantOpenings.toLowerCase()) ||
                    r.location
                      ?.toLowerCase()
                      .includes(searchTerms.restaurantOpenings.toLowerCase());

                  const isOpening =
                    r.status === "opening_soon" ||
                    r.status === "newly_opened" ||
                    r.status === "announced" ||
                    r.opening_date ||
                    r.opening_timeframe;

                  return matchesSearch && isOpening;
                }).length
              }
              searchValue={inputValues.restaurantOpenings}
              onEdit={(item) => handleEdit("restaurant", item)}
              onDelete={(id) => handleDelete("restaurant", id)}
              onSearch={handleRestaurantOpeningsSearch}
              onFilter={(filter) => log.debug('Filter restaurant openings', { action: 'onFilter', metadata: { filter } })}
              onCreate={() => log.debug('Create new restaurant opening', { action: 'onCreate' })}
            />
          )}

          {activeTab === "attractions" && (
            <ContentTable
              type="attraction"
              items={attractions.attractions}
              isLoading={attractions.isLoading}
              totalCount={attractions.attractions.length}
              searchValue={inputValues.attractions}
              onEdit={(item) => handleEdit("attraction", item)}
              onDelete={(id) => handleDelete("attraction", id)}
              onSearch={handleAttractionsSearch}
              onFilter={(filter) => log.debug('Filter attractions', { action: 'onFilter', metadata: { filter } })}
              onCreate={() => handleCreate("attraction")}
            />
          )}

          {activeTab === "playgrounds" && (
            <ContentTable
              type="playground"
              items={playgrounds.playgrounds}
              isLoading={playgrounds.isLoading}
              totalCount={playgrounds.playgrounds.length}
              searchValue={inputValues.playgrounds}
              onEdit={(item) => handleEdit("playground", item)}
              onDelete={(id) => handleDelete("playground", id)}
              onSearch={handlePlaygroundsSearch}
              onFilter={(filter) => log.debug('Filter playgrounds', { action: 'onFilter', metadata: { filter } })}
              onCreate={() => handleCreate("playground")}
            />
          )}

          {activeTab === "venues" && <VenuesManager />}

          {activeTab === "articles" && <ArticlesManager />}

          {activeTab === "article-editor" && (
            <div className="p-6">
              <iframe
                src="/admin/articles/new"
                className="w-full h-[800px] border rounded-lg"
                title="Article Editor"
              />
            </div>
          )}
        </div>
      </div>

      {/* Content Template Selector */}
      {templateSelector.open && templateSelector.contentType && (
        <ContentTemplateSelector
          open={templateSelector.open}
          onOpenChange={(open) => {
            if (!open) {
              setTemplateSelector({ open: false, contentType: null });
            }
          }}
          contentType={templateSelector.contentType}
          onSelectTemplate={handleTemplateSelect}
        />
      )}

      {/* Content Edit Dialog */}
      {editDialog.open && editDialog.contentType && editDialog.item && (
        <ContentEditDialog
          open={editDialog.open}
          onOpenChange={(open) => setEditDialog((prev) => ({ ...prev, open }))}
          contentType={editDialog.contentType}
          item={editDialog.item}
          onSave={handleSave}
        />
      )}
    </>
  );
}
