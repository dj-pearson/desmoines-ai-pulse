import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { findUnnamedFields } from "../../../scripts/check-field-names.mjs";

/**
 * WEB-UX-068 slice 5. The last 37 unnamed fields outside the five files with
 * no importer (AttractionFilters, SecurityDashboard, EventSocialHub,
 * EventFriendFinder, LocationAutocomplete). Labels whose htmlFor pointed at
 * an id the SelectTrigger never carried, filter-row searches and Selects
 * named only by a placeholder, and per-row fields that now name their row.
 */
describe("files fixed in slice 5 have no unnamed fields", () => {
  it.each([
    "src/components/AffiliateManager.tsx",
    "src/components/ArticlesManager.tsx",
    "src/components/ContentTable.tsx",
    "src/components/EventDataEnhancer.tsx",
    "src/components/EventEditor.tsx",
    "src/components/GroupEventPlannerSimple.tsx",
    "src/components/RestaurantFilters.tsx",
    "src/components/ScraperConfigWizard.tsx",
    "src/components/ScrapingJobManager.tsx",
    "src/components/SocialMediaManager.tsx",
    "src/components/URLSourceManager.tsx",
    "src/components/UserRoleManager.tsx",
    "src/components/admin/BlockedEmailDomainsManager.tsx",
    "src/components/admin/BusinessClaimsManager.tsx",
    "src/components/admin/EventSubmissionsManager.tsx",
    "src/components/admin/HotelEditDialog.tsx",
    "src/components/admin/ImageBackfill.tsx",
    "src/components/admin/ImagePickerDialog.tsx",
    "src/components/admin/MenuItemsViewer.tsx",
    "src/components/admin/MenuUploadPanel.tsx",
    "src/components/admin/MenuUrlManager.tsx",
    "src/components/admin/SearchTrafficDashboard/KeywordAnalytics.tsx",
    "src/components/admin/SearchTrafficDashboard/OAuthProviderSetup.tsx",
    "src/components/admin/SocialAccountsManager.tsx",
    "src/components/admin/SocialPostQueue.tsx",
    "src/components/admin/SupportKbManager.tsx",
    "src/components/admin/TrendingTuner.tsx",
    "src/components/cms/AuthorManager.tsx",
    "src/pages/AdminRefunds.tsx",
  ])("%s", (file) => {
    const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(findUnnamedFields(source, file)).toEqual([]);
  });
});

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: vi.fn() } }));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

describe("MenuUrlManager", () => {
  it("names the search box and each row's menu URL field after its restaurant", async () => {
    const { MenuUrlManager } = await import("@/components/admin/MenuUrlManager");
    const row = {
      website: null,
      menu_url: null,
      menu_scrape_enabled: false,
      has_menu: false,
      last_captured: null,
      items_count: 0,
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MenuUrlManager
          restaurants={[
            { ...row, id: "a", name: "Zombie Burger" },
            { ...row, id: "b", name: "Fong's Pizza" },
          ]}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByRole("textbox", { name: "Search restaurants or menu URLs" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Menu URL for Zombie Burger" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "Menu URL for Fong's Pizza" })).toBeTruthy();
  });
});
