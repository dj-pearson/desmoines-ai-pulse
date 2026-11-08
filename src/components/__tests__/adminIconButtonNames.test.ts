import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { findUnnamedIconButtons } from "../../../scripts/check-icon-button-names.mjs";

/**
 * WEB-UX-056. Icon-only buttons with no accessible name are announced as
 * "button". scripts/check-icon-button-names.mjs ratchets the count across
 * src/components and src/pages; these cases pin what the scanner flags and
 * what it deliberately lets through, and assert that the files fixed in the
 * first slice stay at zero.
 */
const scan = (source: string): number[] => findUnnamedIconButtons(source, "fixture.tsx");

describe("findUnnamedIconButtons", () => {
  it("flags Button, button and Toggle with only an icon inside", () => {
    expect(scan(`<Button onClick={go}><Trash2 className="h-4 w-4" /></Button>`)).toEqual([1]);
    expect(scan(`<button onClick={go}>\n  <X />\n</button>`)).toEqual([1]);
    expect(scan(`<Toggle pressed={on}><Bold className="h-4 w-4" /></Toggle>`)).toEqual([1]);
  });

  it("accepts a name from aria-label, aria-labelledby or title", () => {
    expect(scan(`<Button aria-label="Delete row"><Trash2 /></Button>`)).toEqual([]);
    expect(scan(`<Button aria-labelledby="h"><Trash2 /></Button>`)).toEqual([]);
    expect(scan(`<Button title="Delete"><Trash2 /></Button>`)).toEqual([]);
  });

  it("does not flag buttons that may carry a name some other way", () => {
    expect(scan(`<Button><Edit className="mr-1" />Edit</Button>`)).toEqual([]);
    expect(scan(`<Button><Edit /><span className="sr-only">Edit</span></Button>`)).toEqual([]);
    expect(scan(`<Button>{label}</Button>`)).toEqual([]);
    expect(scan(`<Button {...props}><X /></Button>`)).toEqual([]);
    expect(scan(`<Button asChild><Link to="/"><Home /></Link></Button>`)).toEqual([]);
  });

  it("ignores a <Button> named in a comment or a string", () => {
    expect(scan(`// <Button><X /></Button>\nconst s = "<Button><X /></Button>";`)).toEqual([]);
  });
});

describe("files fixed in WEB-UX-056 slice 1", () => {
  const fixed = [
    "src/components/ContentTable.tsx",
    "src/components/ArticleEditor.tsx",
    "src/components/cms/EnhancedArticleEditor.tsx",
    "src/components/cms/RichTextEditor.tsx",
    "src/components/cms/CategoryTagManager.tsx",
    "src/components/RestaurantFilters.tsx",
    "src/components/EventPhotoUpload.tsx",
  ];

  it.each(fixed)("%s has no unnamed icon button", (file) => {
    const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(findUnnamedIconButtons(source, file)).toEqual([]);
  });
});

describe("files fixed in WEB-UX-056 slice 2", () => {
  const fixed = [
    "src/components/admin/MediaLibrary.tsx",
    "src/components/admin/MenuItemsViewer.tsx",
    "src/components/admin/SocialAccountsManager.tsx",
    "src/components/admin/SocialPostQueue.tsx",
    "src/components/admin/VenuesManager.tsx",
    "src/components/AIArticleGenerator.tsx",
    "src/components/AIConfigurationManager.tsx",
    "src/components/ArticlesManager.tsx",
    "src/components/CatchDesmoinUrlExtractor.tsx",
    "src/components/cms/AuthorManager.tsx",
    "src/components/ContentEditDialog.tsx",
    "src/components/ContentEditor.tsx",
    "src/components/ContentQueue.tsx",
    "src/components/crm/CrmContactDetail.tsx",
    "src/components/DataQualityDashboard.tsx",
    "src/components/DomainHighlightManager.tsx",
    "src/components/EventEditor.tsx",
    "src/components/media/VideoUpload.tsx",
    "src/components/ScraperConfigWizard.tsx",
    "src/components/SecurityDashboard.tsx",
    "src/components/SocialMediaManager.tsx",
    "src/components/URLSourceManager.tsx",
    "src/components/WebsiteAnalysisDialog.tsx",
  ];

  it.each(fixed)("%s has no unnamed icon button", (file) => {
    const source = readFileSync(resolve(__dirname, "../../..", file), "utf8");
    expect(findUnnamedIconButtons(source, file)).toEqual([]);
  });

  it("names the media library view toggle and reports which view is on", () => {
    const source = readFileSync(
      resolve(__dirname, "../../..", "src/components/admin/MediaLibrary.tsx"),
      "utf8",
    );
    expect(source).toContain('aria-label="Grid view" aria-pressed={viewMode === "grid"}');
    expect(source).toContain('aria-label="List view" aria-pressed={viewMode === "list"}');
  });
});
