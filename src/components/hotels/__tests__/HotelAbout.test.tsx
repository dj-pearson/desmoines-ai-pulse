/**
 * WEB-SEO-061. Hotel description, geo_summary and geo_key_facts came from the
 * scripts/content-fill/hotels-content.json agent batch, so "About This Hotel"
 * carries the same AI-assisted badge as the hotel Q&A and the event Quick Facts.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { HotelAbout } from "@/components/hotels/HotelAbout";

function mount(props: Parameters<typeof HotelAbout>[0]) {
  return render(
    <HelmetProvider>
      <HotelAbout {...props} />
    </HelmetProvider>,
  );
}

afterEach(cleanup);

describe("HotelAbout", () => {
  it("labels the section AI-assisted and shows all three fields", () => {
    mount({
      description: "A 104-unit hotel in Clive.",
      geoSummary: "Suits drivers on I-80.",
      keyFacts: ["Breakfast included", "  ", "Indoor pool"],
    });
    const heading = screen.getByRole("heading", { name: "About This Hotel" });
    const section = heading.closest("section");
    expect(section?.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(screen.getAllByText("AI-assisted")).toHaveLength(1);
    expect(screen.getByText("A 104-unit hotel in Clive.")).toBeTruthy();
    expect(screen.getByText("Suits drivers on I-80.")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Breakfast included", "Indoor pool"]);
  });

  it("does not repeat a summary identical to the description", () => {
    mount({ description: "Same text.", geoSummary: " Same text. " });
    expect(screen.getAllByText("Same text.")).toHaveLength(1);
  });

  it("publishes no JSON-LD of its own", () => {
    mount({ description: "x", geoSummary: "y", keyFacts: ["z"] });
    expect(document.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
  });

  it("renders nothing, badge included, when every field is empty", () => {
    const { container } = mount({ description: "  ", geoSummary: null, keyFacts: [] });
    expect(container.innerHTML).toBe("");
  });
});

describe("HotelDetails source", () => {
  const code = readFileSync(resolve(__dirname, "../../../pages/HotelDetails.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("renders the hotel copy only through HotelAbout", () => {
    expect(code).toMatch(/<HotelAbout[\s\S]*?description=\{hotel\.description\}/);
    expect(code).not.toContain("About This Hotel");
    expect(code).not.toMatch(/\{hotel\.description\}\s*</);
    expect(code).not.toMatch(/hotel\.geo_key_facts\s*\?\?/);
  });
});
