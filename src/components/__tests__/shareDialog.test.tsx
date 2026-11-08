import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ShareDialog from "@/components/ShareDialog";
import { Button } from "@/components/ui/button";
import { buildShareUrls, SHARE_BUTTON_CLASSES } from "@/lib/shareLinks";

/**
 * Loop 11: the mailto body carried the description and url unencoded, so
 * "Food & Drink" ended the body at the "&"; the share buttons used brand fills
 * under 4.5:1 with white text; and /events rendered ~30 buttons all named
 * just "Share".
 */

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("buildShareUrls", () => {
  const input = {
    shareTitle: "Food & Drink Fest - Des Moines Events",
    shareDescription: "Tacos & beer?#yes",
    shareText: "Check out this event: Food & Drink Fest",
    noun: "event",
    url: "https://example.com/events/food-drink?ref=a&b=c",
  };

  it("encodes the whole mailto subject and body", () => {
    const mailto = buildShareUrls(input).email;
    const parsed = new URL(mailto);
    expect(parsed.protocol).toBe("mailto:");
    const params = new URLSearchParams(parsed.search);
    expect([...params.keys()]).toEqual(["subject", "body"]);
    expect(params.get("subject")).toBe(input.shareTitle);
    expect(params.get("body")).toBe(
      "Tacos & beer?#yes\n\nView event: https://example.com/events/food-drink?ref=a&b=c",
    );
  });

  it("keeps every query-string share URL to its own parameters", () => {
    const urls = buildShareUrls(input);
    const fb = new URL(urls.facebook).searchParams;
    expect(fb.get("u")).toBe(input.url);
    expect(fb.get("quote")).toBe(input.shareText);
    const x = new URL(urls.x).searchParams;
    expect(x.get("text")).toBe(input.shareText);
    expect(x.get("url")).toBe(input.url);
    expect(new URL(urls.linkedin).searchParams.get("url")).toBe(input.url);
    expect(new URL(urls.whatsapp).searchParams.get("text")).toBe(`${input.shareText} ${input.url}`);
    expect(new URLSearchParams(urls.sms.split("?")[1]).get("body")).toBe(`${input.shareText} ${input.url}`);
  });
});

describe("share button colours", () => {
  it("every fill, resting and hover, is at least 4.5:1 against white text", () => {
    for (const [platform, classes] of Object.entries(SHARE_BUTTON_CLASSES)) {
      expect(classes).toContain("text-white");
      const fills = [...classes.matchAll(/bg-\[(#[0-9A-Fa-f]{6})\]/g)].map((m) => m[1]);
      expect(fills, platform).toHaveLength(2);
      for (const fill of fills) {
        expect(contrast(fill, "#FFFFFF"), `${platform} ${fill}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("ShareDialog trigger", () => {
  it("names the item on the default trigger and keeps the visible text", () => {
    render(<ShareDialog title="Jazz Night" itemName="Jazz Night" description="d" url="https://x.test/e" />);
    const button = screen.getByRole("button", { name: "Share Jazz Night" });
    expect(button).toHaveTextContent("Share");
  });

  it("falls back to title when itemName is absent", () => {
    render(<ShareDialog title="Pho Place" description="d" url="https://x.test/r" />);
    expect(screen.getByRole("button", { name: "Share Pho Place" })).toBeInTheDocument();
  });

  it("names a custom trigger too, with the visible text inside the name", () => {
    render(
      <ShareDialog
        kind="article"
        title="Best Patios"
        itemName="Best Patios"
        description="d"
        url="https://x.test/a"
        trigger={<Button>Share Article</Button>}
      />,
    );
    const button = screen.getByRole("button", { name: "Share article: Best Patios" });
    expect(button.getAttribute("aria-label")?.toLowerCase()).toContain("share article");
  });
});

describe("ShareDialog lazy panel (WEB-PERF-073)", () => {
  it("renders no dialog until the trigger is pressed, then opens it", async () => {
    render(<ShareDialog title="Jazz Night" description="d" url="https://x.test/e" />);
    const button = screen.getByRole("button", { name: "Share Jazz Night" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(button);

    expect(await screen.findByRole("dialog", { name: "Share Event" })).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Share Link" })).toHaveValue("https://x.test/e");
  });

  it("uses the article wording and returns focus to the trigger on close", async () => {
    render(
      <ShareDialog
        kind="article"
        title="Best Patios"
        description="d"
        url="https://x.test/a"
        trigger={<Button>Share Article</Button>}
      />,
    );
    const button = screen.getByRole("button", { name: "Share article: Best Patios" });
    fireEvent.click(button);
    await screen.findByRole("dialog", { name: "Share Article" });

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(button).toHaveFocus());
    expect(button).toHaveAttribute("aria-expanded", "false");
  });
});
