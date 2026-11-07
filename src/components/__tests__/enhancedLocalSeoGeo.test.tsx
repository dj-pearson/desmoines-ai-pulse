/**
 * WEB-SEO-050: EnhancedLocalSEO wrote geo.placename="Des Moines" and the
 * downtown Des Moines geo.position/ICBM on every page, including the
 * /events/<suburb> pages that pass `suburb`. /events/ankeny declared itself
 * located at 41.5868;-93.6250, which is the Iowa State Capitol area, 15 miles
 * from Ankeny.
 *
 * With a suburb, the place meta names the suburb and the coordinate pair is
 * left out: there is no checked suburb coordinate in the repo, and a guessed
 * one is the same defect with different numbers. Without a suburb nothing
 * changes.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, waitFor, cleanup } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import EnhancedLocalSEO from "@/components/EnhancedLocalSEO";

function meta(name: string): string | null {
  const el = document.head.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  return el ? el.getAttribute("content") : null;
}

async function renderSeo(suburb?: string): Promise<void> {
  render(
    <HelmetProvider>
      <EnhancedLocalSEO
        pageTitle="Test page"
        pageDescription="Test description"
        canonicalUrl="https://example.com/test"
        suburb={suburb}
      />
    </HelmetProvider>,
  );
  await waitFor(() => {
    if (meta("geo.region") === null) throw new Error("Helmet not committed yet");
  });
}

afterEach(() => {
  cleanup();
});

describe("EnhancedLocalSEO geo meta", () => {
  it("names the suburb and omits the downtown coordinate on a suburb page", async () => {
    await renderSeo("Ankeny");

    expect(meta("geo.placename")).toBe("Ankeny");
    expect(meta("locality")).toBe("Ankeny");
    expect(meta("geo.position")).toBeNull();
    expect(meta("ICBM")).toBeNull();
    expect(meta("geo.region")).toBe("US-IA");
    expect(meta("region")).toBe("Iowa");
  });

  it("keeps the Des Moines meta unchanged on pages without a suburb", async () => {
    await renderSeo();

    expect(meta("geo.placename")).toBe("Des Moines");
    expect(meta("locality")).toBe("Des Moines");
    expect(meta("geo.position")).toBe("41.5868;-93.6250");
    expect(meta("ICBM")).toBe("41.5868, -93.6250");
    expect(meta("geo.region")).toBe("US-IA");
  });
});
